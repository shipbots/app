/**
 * POST /api/client/ach/link
 *
 * Cross-reference an ACH record on the "Client Billing Info" board to the right
 * client on the Clients board (by company / legal entity / business names +
 * signer name), and set the "✳️ CLIENTS" board-relation. Built for Zapier to
 * call after it creates the item from a JotForm submission.
 *
 *   Body { secret, itemId }  → match + link just that item (the Zapier path).
 *   Body { secret }          → sweep: match + link every unlinked ACH item.
 *
 * Auth: a shared secret (ACH_LINK_SECRET, passed by Zapier) OR a signed-in
 * DocuSign-access session (so the dashboard can call it too). Fails closed when
 * the secret isn't configured and there's no session.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseDocusign } from '@/lib/docusign-access';
import { matchClientForACH, type ClientCandidate } from '@/lib/ach-client-match';
import { markPaymentRetrievedForClient } from '@/lib/monday';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BILLING_BOARD_ID = '18422386902';
const CLIENTS_BOARD_ID = '7846251224';

// Client Billing Info columns.
const COL_FIRST = 'text_mm5gjfsv';
const COL_LAST = 'text_mm5gk3v5';
const COL_CLIENT_LINK = 'board_relation_mm5gxg2g';
// Clients board columns used for matching.
const C_LEGAL = 'text_mktp4fvk';
const C_QB = 'text_mkx5b9b4';
const C_SHIPHERO = 'text_mkw9n26z';
const C_CONTACT1 = 'text_mktqq7h6';
const C_CONTACT2 = 'text_mktr1evd';
const C_CONTACT3 = 'text_mktr4v7q';

type CV = { id: string; text: string | null; linked_item_ids?: string[] | null };

async function gql(query: string, key: string, variables?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
    body: JSON.stringify(variables ? { query, variables } : { query }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
  return data.data ?? {};
}

// All clients (denormalized to the fields we match on).
async function fetchClients(key: string): Promise<ClientCandidate[]> {
  const ids = JSON.stringify([C_LEGAL, C_QB, C_SHIPHERO, C_CONTACT1, C_CONTACT2, C_CONTACT3]);
  type Item = { id: string; name: string; column_values: { id: string; text: string | null }[] };
  type Page = { cursor: string | null; items: Item[] };
  const out: ClientCandidate[] = [];
  let cursor: string | null = null;
  do {
    const q: string = cursor
      ? `query { next_items_page(cursor: "${cursor}", limit: 100) { cursor items { id name column_values(ids: ${ids}) { id text } } } }`
      : `query { boards(ids: [${CLIENTS_BOARD_ID}]) { items_page(limit: 100) { cursor items { id name column_values(ids: ${ids}) { id text } } } } }`;
    const data = await gql(q, key);
    const page: Page | null = cursor
      ? ((data.next_items_page as Page | undefined) ?? null)
      : (((data.boards as Array<{ items_page: Page }> | undefined)?.[0]?.items_page) ?? null);
    for (const it of page?.items ?? []) {
      const c: Record<string, string> = {};
      for (const cv of it.column_values) c[cv.id] = cv.text || '';
      out.push({
        id: it.id,
        name: it.name,
        legalEntity: c[C_LEGAL] || '',
        quickbooks: c[C_QB] || '',
        shipHeroName: c[C_SHIPHERO] || '',
        contactNames: [c[C_CONTACT1], c[C_CONTACT2], c[C_CONTACT3]].filter(Boolean),
      });
    }
    cursor = page?.cursor ?? null;
  } while (cursor);
  return out;
}

interface AchItem { id: string; name: string; first: string; last: string; linked: boolean }

function toAchItem(it: { id: string; name: string; column_values: CV[] }): AchItem {
  const by: Record<string, CV> = {};
  for (const cv of it.column_values) by[cv.id] = cv;
  return {
    id: it.id,
    name: it.name,
    first: by[COL_FIRST]?.text || '',
    last: by[COL_LAST]?.text || '',
    linked: (by[COL_CLIENT_LINK]?.linked_item_ids ?? []).length > 0,
  };
}

const ITEM_COLS = `column_values(ids: ["${COL_FIRST}", "${COL_LAST}", "${COL_CLIENT_LINK}"]) { id text ... on BoardRelationValue { linked_item_ids } }`;

async function fetchAchItem(id: string, key: string): Promise<AchItem | null> {
  const data = await gql(`query { items(ids: [${id}]) { id name ${ITEM_COLS} } }`, key);
  const it = (data.items as { id: string; name: string; column_values: CV[] }[] | undefined)?.[0];
  return it ? toAchItem(it) : null;
}

async function fetchUnlinkedAchItems(key: string): Promise<AchItem[]> {
  type Item = { id: string; name: string; column_values: CV[] };
  type Page = { cursor: string | null; items: Item[] };
  const out: AchItem[] = [];
  let cursor: string | null = null;
  do {
    const q: string = cursor
      ? `query { next_items_page(cursor: "${cursor}", limit: 100) { cursor items { id name ${ITEM_COLS} } } }`
      : `query { boards(ids: [${BILLING_BOARD_ID}]) { items_page(limit: 100) { cursor items { id name ${ITEM_COLS} } } } }`;
    const data = await gql(q, key);
    const page: Page | null = cursor
      ? ((data.next_items_page as Page | undefined) ?? null)
      : (((data.boards as Array<{ items_page: Page }> | undefined)?.[0]?.items_page) ?? null);
    for (const it of page?.items ?? []) {
      const a = toAchItem(it);
      if (!a.linked) out.push(a);
    }
    cursor = page?.cursor ?? null;
  } while (cursor);
  return out;
}

async function setLink(itemId: string, clientId: string, key: string): Promise<void> {
  await gql(
    `mutation ($cols: JSON!) { change_multiple_column_values(board_id: ${BILLING_BOARD_ID}, item_id: ${itemId}, column_values: $cols) { id } }`,
    key,
    { cols: JSON.stringify({ [COL_CLIENT_LINK]: { item_ids: [Number(clientId)] } }) },
  );
}

export async function POST(req: Request) {
  let body: { secret?: unknown; itemId?: unknown };
  try { body = await req.json(); } catch { body = {}; }

  // Auth: shared secret OR a DocuSign-access session. Fail closed.
  const secret = process.env.ACH_LINK_SECRET;
  let authed = !!(secret && typeof body.secret === 'string' && body.secret === secret);
  if (!authed) {
    const session = await auth();
    authed = !!session?.user?.email && (await canUseDocusign(session.user.email));
  }
  if (!authed) {
    // secretConfigured tells you (without leaking the value) whether
    // ACH_LINK_SECRET is set on the server — false means set it in Vercel.
    return NextResponse.json({ error: 'Unauthorized', secretConfigured: !!secret }, { status: 401 });
  }

  const key = process.env.MONDAY_API_KEY;
  if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });

  const itemId = typeof body.itemId === 'string' || typeof body.itemId === 'number'
    ? String(body.itemId).trim()
    : '';

  try {
    const clients = await fetchClients(key);
    const targets: AchItem[] = itemId
      ? ([await fetchAchItem(itemId, key)].filter(Boolean) as AchItem[])
      : await fetchUnlinkedAchItems(key);

    const results: Array<Record<string, unknown>> = [];
    for (const t of targets) {
      // A single explicit itemId is (re)linked even if already set; sweeps skip
      // items that already have a client.
      if (!itemId && t.linked) continue;

      const match = await matchClientForACH({ company: t.name, firstName: t.first, lastName: t.last }, clients);
      if (match && (match.confidence === 'high' || match.confidence === 'medium')) {
        await setLink(t.id, match.clientId, key);
        // An ACH record is now on file for this client → mark their "Retrieved
        // payment information" checklist step "Yes" (best-effort). Doubles as a
        // backfill during the sweep.
        await markPaymentRetrievedForClient(match.clientId);
        results.push({ itemId: t.id, linked: true, clientId: match.clientId, clientName: match.clientName, confidence: match.confidence, reason: match.reason });
      } else {
        results.push({ itemId: t.id, linked: false, reason: match ? `low confidence: ${match.reason}` : 'no confident match' });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('[client/ach/link] failed:', err);
    return NextResponse.json({ error: 'Link failed' }, { status: 502 });
  }
}
