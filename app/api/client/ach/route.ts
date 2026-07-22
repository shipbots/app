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
const COL_FIRST     = 'text_mm5gjfsv'; // "Name" (signer first name)
const COL_LAST      = 'text_mm5gk3v5'; // "Last Name"
const COL_ROUTING   = 'text_mm5g5sge'; // "Routing Number"
const COL_ACCOUNT   = 'text_mm5gn0xc'; // "Account Number"
const COL_FINANCIAL = 'text_mm5gbaz0'; // "Financial Institution"
const COL_DOC       = 'file_mm5aqrwq'; // "ACH Doc"
// "✳️ CLIENTS" board-relation — the reliable link to the client on the Clients
// board (7846251224). Preferred over name (item names carry suffixes like "LLC").
const COL_CLIENT_LINK = 'board_relation_mm5gxg2g';

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

  const params = new URL(req.url).searchParams;
  const clientId = (params.get('clientId') || '').trim();
  const wantName = (params.get('name') || '').trim().toLowerCase();
  if (!clientId && !wantName) return NextResponse.json({ found: false });

  try {
    // 1) Page through the board collecting each item's name + linked client id
    //    (the "✳️ CLIENTS" board-relation). The board is small.
    type LinkCV = { id: string; linked_item_ids?: string[] | null };
    type BoardItem = { id: string; name: string; column_values: LinkCV[] };
    type ItemsPage = { cursor: string | null; items: BoardItem[] };
    const all: BoardItem[] = [];
    let cursor: string | null = null;
    do {
      const cols = `column_values(ids: ["${COL_CLIENT_LINK}"]) { id ... on BoardRelationValue { linked_item_ids } }`;
      const q: string = cursor
        ? `query { next_items_page(cursor: "${cursor}", limit: 200) { cursor items { id name ${cols} } } }`
        : `query { boards(ids: [${BILLING_BOARD_ID}]) { items_page(limit: 200) { cursor items { id name ${cols} } } } }`;
      const data = await mondayQuery(q, key);
      const page: ItemsPage | null = cursor
        ? ((data.next_items_page as ItemsPage | undefined) ?? null)
        : (((data.boards as Array<{ items_page: ItemsPage }> | undefined)?.[0]?.items_page) ?? null);
      for (const it of page?.items ?? []) all.push(it);
      cursor = page?.cursor ?? null;
    } while (cursor);

    // Prefer the board-relation link — the ACH item points at the client on the
    // Clients board, so it's correct even when the item name differs (e.g.
    // "SabersPro LLC" linked to client "SabersPro"). Fall back to an exact name
    // match for any ACH item not linked yet.
    const linkedIds = (it: BoardItem): string[] =>
      it.column_values.find(cv => cv.id === COL_CLIENT_LINK)?.linked_item_ids ?? [];
    let match: BoardItem | undefined;
    if (clientId) match = all.find(it => linkedIds(it).includes(clientId));
    if (!match && wantName) match = all.find(it => (it.name || '').trim().toLowerCase() === wantName);
    if (!match) return NextResponse.json({ found: false });
    const matchId = match.id;

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
        // Pinned to the Financial Institution column; fall back to matching by
        // title so a future rename / new id still resolves it.
        financialInstitution: byId(COL_FINANCIAL) || byTitle(/financial\s*inst|bank\s*name/i),
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
