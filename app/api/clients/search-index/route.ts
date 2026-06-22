/**
 * GET /api/clients/search-index
 *
 * Returns a small denormalized index over the Clients board so the Customer
 * Service Browse-by-Client view can search across every field that names a
 * client — working name, legal entity, store / QB name, ShipHero name, main
 * contact name / email / phone.
 *
 * Why an index instead of searching at query time:
 *   - These fields all live on the Clients board, not on the Onboarding items
 *     the page is already loaded with.
 *   - We need cross-field search ("phone contains 555") which is awkward to
 *     express in Monday's items query. A single batched fetch + in-memory
 *     filter is faster and simpler than a server-side text search.
 *   - Only ~340 clients today; the response is well under 100KB.
 *
 * Response: { id, name, legalEntity, storeName, shipHeroName,
 *             contactName, contactEmail, contactPhone }[]
 *
 * Cached at the CDN for 60 seconds — change a contact's email and you'll
 * see it in search within a minute.
 */

import { NextResponse } from 'next/server';

const MONDAY_API_URL   = 'https://api.monday.com/v2';
const CLIENTS_BOARD_ID = '7846251224';

const COLUMN_IDS = [
  'text_mktp4fvk', // Legal Entity Name
  'text_mkx5b9b4', // Quickbooks Company Name (store / business display name)
  'text_mkw9n26z', // ShipHero Name (QB Display Name)
  // Primary contact
  'text_mktqq7h6', // Person of Contact (name)
  'text_mktq6sr5', // Person of Contact Email
  'text_mktqabcm', // Phone Number
  // Secondary contact
  'text_mktr1evd', // Person of Contact 2 Name
  'text_mktr2xmm', // Person of Contact 2 Email
  'text_mktr8kve', // Person of Contact 2 Phone Number
  // Tertiary contact
  'text_mktr4v7q', // Person of Contact 3 Name
  'text_mktrt74r', // Person of Contact 3 Email
  'text_mktrw0tb', // Person of Contact 3 Phone Number
  // CS browse-by-client columns (shown in the table, also indexed)
  'dropdown_mktrbeyg', // AppDot / Portal
  'dropdown_mktxaege', // Warehouse Location
];

type ColumnValue = { id: string; text: string | null };
type Item = { id: string; name: string; column_values: ColumnValue[]; group?: { id: string } | null };

export type ClientIndexEntry = {
  id: string;
  name: string;
  legalEntity: string;
  storeName: string;
  shipHeroName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contact2Name: string;
  contact2Email: string;
  contact2Phone: string;
  contact3Name: string;
  contact3Email: string;
  contact3Phone: string;
  /** AppDot / Portal dropdown label, e.g. "ShipBots Portal". */
  portal: string;
  /** Warehouse Location dropdown label (dropdown_mktxaege on Clients). */
  warehouse: string;
  /** Clients-board group id (e.g. group_mkq09z7j == 'Exited'). The UI
   *  uses this to mark clients inactive without an extra Monday query. */
  groupId: string;
};

async function mondayQuery(query: string, variables: Record<string, unknown> | undefined, key: string) {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
  return data.data;
}

function entryFromItem(it: Item): ClientIndexEntry {
  const cols: Record<string, string> = {};
  for (const cv of it.column_values) cols[cv.id] = cv.text ?? '';
  return {
    id: it.id,
    name: it.name,
    legalEntity:  cols['text_mktp4fvk'] ?? '',
    storeName:    cols['text_mkx5b9b4'] ?? '',
    shipHeroName: cols['text_mkw9n26z'] ?? '',
    contactName:  cols['text_mktqq7h6'] ?? '',
    contactEmail: cols['text_mktq6sr5'] ?? '',
    contactPhone: cols['text_mktqabcm'] ?? '',
    contact2Name:  cols['text_mktr1evd'] ?? '',
    contact2Email: cols['text_mktr2xmm'] ?? '',
    contact2Phone: cols['text_mktr8kve'] ?? '',
    contact3Name:  cols['text_mktr4v7q'] ?? '',
    contact3Email: cols['text_mktrt74r'] ?? '',
    contact3Phone: cols['text_mktrw0tb'] ?? '',
    portal:        cols['dropdown_mktrbeyg'] ?? '',
    warehouse:     cols['dropdown_mktxaege'] ?? '',
    groupId:       it.group?.id ?? '',
  };
}

export async function GET() {
  const key = process.env.MONDAY_API_KEY;
  if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });

  try {
    const all: ClientIndexEntry[] = [];
    let cursor: string | null = null;

    do {
      const query = cursor
        ? `query ($cursor: String!) {
            next_items_page(cursor: $cursor, limit: 100) {
              cursor
              items { id name group { id } column_values(ids: ${JSON.stringify(COLUMN_IDS)}) { id text } }
            }
          }`
        : `query {
            boards(ids: [${CLIENTS_BOARD_ID}]) {
              items_page(limit: 100) {
                cursor
                items { id name group { id } column_values(ids: ${JSON.stringify(COLUMN_IDS)}) { id text } }
              }
            }
          }`;
      const data = await mondayQuery(query, cursor ? { cursor } : undefined, key);
      const page: { cursor: string | null; items: Item[] } = cursor
        ? data.next_items_page
        : data.boards[0].items_page;
      for (const it of page.items) all.push(entryFromItem(it));
      cursor = page.cursor;
    } while (cursor);

    return NextResponse.json(all, {
      headers: {
        // Edge cache for 1 minute, allow 60s stale-while-revalidate so a save
        // shows up quickly without hammering Monday on every CS reload.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
      },
    });
  } catch (e) {
    console.error('[clients/search-index] failed:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
