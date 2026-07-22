/**
 * GET /api/client/ach?name=<client name>
 *
 * Reads a client's ACH banking details from the "Client Billing Info" Monday
 * board (18422386902), where each item's NAME is the client name. Returns the
 * account / routing numbers, financial institution (if a column for it exists),
 * the signer's first / last name, and a previewable link to the ACH document.
 *
 * Sensitive data (account + routing numbers), so it's gated to the same
 * DocuSign-access group that can see the Billing Info tab — a non-member gets
 * 403 even though the tab is already hidden from them in the UI.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseDocusign } from '@/lib/docusign-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BILLING_BOARD_ID = '18422386902'; // "Client Billing Info"

// Known ACH columns on the Client Billing Info board.
const COL_FIRST   = 'text_mm5gjfsv'; // "Name" (signer first name)
const COL_LAST    = 'text_mm5gk3v5'; // "Last Name"
const COL_ROUTING = 'text_mm5g5sge'; // "Routing Number"
const COL_ACCOUNT = 'text_mm5gn0xc'; // "Account Number"
const COL_DOC     = 'file_mm5aqrwq'; // "ACH Doc"

type ColVal = { id: string; text: string | null; value: string | null; column?: { title: string | null } | null };

async function mondayQuery(query: string, key: string): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
  return data.data ?? {};
}

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // Account + routing numbers are sensitive — same gate as the Billing Info tab.
  if (!canUseDocusign(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const key = process.env.MONDAY_API_KEY;
  if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });

  const name = (new URL(req.url).searchParams.get('name') || '').trim();
  if (!name) return NextResponse.json({ found: false });
  const want = name.toLowerCase();

  try {
    // 1) Page through the board (id + name only) to find the item whose name
    //    matches the client. The board is small; one page usually suffices.
    type NamedItem = { id: string; name: string };
    type ItemsPage = { cursor: string | null; items: NamedItem[] };
    let cursor: string | null = null;
    let matchId: string | null = null;
    do {
      const q: string = cursor
        ? `query { next_items_page(cursor: "${cursor}", limit: 200) { cursor items { id name } } }`
        : `query { boards(ids: [${BILLING_BOARD_ID}]) { items_page(limit: 200) { cursor items { id name } } } }`;
      const data = await mondayQuery(q, key);
      const page: ItemsPage | null = cursor
        ? ((data.next_items_page as ItemsPage | undefined) ?? null)
        : (((data.boards as Array<{ items_page: ItemsPage }> | undefined)?.[0]?.items_page) ?? null);
      const items: NamedItem[] = page?.items ?? [];
      const hit = items.find(it => (it.name || '').trim().toLowerCase() === want);
      matchId = hit?.id ?? null;
      cursor = matchId ? null : (page?.cursor ?? null);
    } while (cursor && !matchId);

    if (!matchId) return NextResponse.json({ found: false });

    // 2) Fetch that item's columns (with titles so we can find a Financial
    //    Institution / Bank column dynamically if one is ever added).
    const itemData = await mondayQuery(
      `query { items(ids: [${matchId}]) { column_values { id text value column { title } } } }`,
      key,
    );
    const item = (itemData.items as { column_values: ColVal[] }[] | undefined)?.[0];
    const cols: Record<string, ColVal> = {};
    for (const cv of item?.column_values ?? []) cols[cv.id] = cv;
    const byId = (id: string) => cols[id]?.text || '';
    const byTitle = (re: RegExp) =>
      (item?.column_values ?? []).find(cv => re.test(cv.column?.title || ''))?.text || '';

    // 3) Resolve the ACH doc to a previewable signed URL — the file column's
    //    value carries only an assetId, not a usable link.
    let doc: { name: string; url: string; fileType: string; assetId: string } | null = null;
    const docVal = cols[COL_DOC]?.value;
    if (docVal) {
      try {
        const parsed = JSON.parse(docVal) as { files?: Array<{ name?: string; assetId?: number }> };
        const f = parsed.files?.[0];
        if (f?.assetId) {
          const assetId = String(f.assetId);
          const ad = await mondayQuery(
            `query { assets(ids: [${assetId}]) { public_url name file_extension } }`,
            key,
          );
          const asset = (ad.assets as { public_url?: string; name?: string; file_extension?: string }[] | undefined)?.[0];
          if (asset?.public_url) {
            const ext = (asset.file_extension || '').replace(/^\./, '');
            doc = {
              name: asset.name || f.name || 'ACH document',
              url: asset.public_url,
              // ACH forms are PDFs; default so the preview renders inline even
              // when Monday reports no extension (the asset proxy serves inline).
              fileType: ext || 'pdf',
              assetId,
            };
          }
        }
      } catch { /* malformed file value — no doc */ }
    }

    return NextResponse.json(
      {
        found: true,
        accountNumber: byId(COL_ACCOUNT),
        routingNumber: byId(COL_ROUTING),
        // No dedicated column on the board today; match one dynamically if added.
        financialInstitution: byTitle(/financial\s*inst|bank\s*name|\bbank\b/i),
        firstName: byId(COL_FIRST),
        lastName: byId(COL_LAST),
        doc,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    console.error('[client/ach] failed:', err);
    return NextResponse.json({ error: 'ACH lookup failed' }, { status: 502 });
  }
}
