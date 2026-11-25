/**
 * Claims — read/write the Monday "✳️ Claims" board.
 *
 * Each claim is an item linked to its client through the "✳️ CLIENTS"
 * board-relation column (Clients board item id). The Chrome extension's
 * Claims panel lists a client's claims, edits them inline, and files new ones
 * (with photo/file attachments) through the /api/claims routes, which call
 * the helpers here.
 *
 * Groups are the claim's stage: Open → Filed with Carrier → Closed.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

export const CLAIMS_BOARD_ID = '18327846147';

// Column ids on the Claims board.
export const CLAIM_COLUMNS = {
  status: 'color_mkxaa8hx',
  claimNumber: 'text_mm99jg07',
  resultNotes: 'text_mkyq9v6d',
  dateSubmitted: 'date4',
  orderNumber: 'text_mkxaatpf',
  trackingNumber: 'text_mkxamxey',
  reason: 'color_mkxaknar',
  additionalInfo: 'long_text_mkxa1mwy',
  dateResolved: 'date_mkxakp3b',
  client: 'board_relation_mkxamgg6',
  whoRequested: 'text_mkxam099',
  images: 'file_mkxam7b1',
  value: 'text_mkyqvrbb',
} as const;

type ColumnKind = 'text' | 'long_text' | 'status' | 'date';

// The editable fields, keyed by the names the API (and extension) use.
export const CLAIM_FIELDS: Record<string, { columnId: string; kind: ColumnKind }> = {
  status:         { columnId: CLAIM_COLUMNS.status,         kind: 'status' },
  claimNumber:    { columnId: CLAIM_COLUMNS.claimNumber,    kind: 'text' },
  resultNotes:    { columnId: CLAIM_COLUMNS.resultNotes,    kind: 'text' },
  dateSubmitted:  { columnId: CLAIM_COLUMNS.dateSubmitted,  kind: 'date' },
  orderNumber:    { columnId: CLAIM_COLUMNS.orderNumber,    kind: 'text' },
  trackingNumber: { columnId: CLAIM_COLUMNS.trackingNumber, kind: 'text' },
  reason:         { columnId: CLAIM_COLUMNS.reason,         kind: 'status' },
  additionalInfo: { columnId: CLAIM_COLUMNS.additionalInfo, kind: 'long_text' },
  dateResolved:   { columnId: CLAIM_COLUMNS.dateResolved,   kind: 'date' },
  whoRequested:   { columnId: CLAIM_COLUMNS.whoRequested,   kind: 'text' },
  value:          { columnId: CLAIM_COLUMNS.value,          kind: 'text' },
};

export const DEFAULT_CLAIM_GROUP_ID = 'topics'; // "Open"

export interface ClaimFile {
  assetId: string;
  name: string;
  isImage: boolean;
  /** Short-lived signed download link (Monday public_url); may be empty. */
  url?: string;
}

export interface Claim {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  createdAt: string;
  status: string;
  claimNumber: string;
  resultNotes: string;
  dateSubmitted: string;
  orderNumber: string;
  trackingNumber: string;
  reason: string;
  additionalInfo: string;
  dateResolved: string;
  whoRequested: string;
  value: string;
  files: ClaimFile[];
}

export interface ClaimOptions {
  statuses: string[];
  reasons: string[];
  groups: { id: string; title: string }[];
}

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set in environment');
  return key;
}

async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getApiKey(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.errors) {
    console.error('Monday.com API error (claims):', data.errors);
    throw new Error(data.errors[0]?.message || 'Monday.com API error');
  }
  return data.data as T;
}

/** Monday ids are numeric; reject anything else before it reaches a query. */
export function isMondayId(id: unknown): id is string {
  return typeof id === 'string' && /^\d{1,20}$/.test(id);
}

interface MondayItem {
  id: string | number;
  name?: string;
  created_at?: string;
  group?: { id: string; title: string };
  column_values?: { id: string; text: string | null }[];
  assets?: { id: string | number; name?: string; file_extension?: string; public_url?: string }[];
  board?: { id: string };
}

interface ItemsPage {
  cursor?: string | null;
  items?: MondayItem[];
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;

const CLAIM_ITEM_FIELDS = `
  id
  name
  created_at
  group { id title }
  column_values { id text }
  assets { id name file_extension public_url }
`;

// Monday date text can carry a time ("2026-11-20 09:00"); the extension works in
// plain YYYY-MM-DD (what <input type="date"> accepts).
function dateOnly(text: string | undefined): string {
  const m = String(text || '').match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : '';
}

function toClaim(item: MondayItem): Claim {
  const cv: Record<string, string> = {};
  for (const c of item.column_values || []) cv[c.id] = c.text || '';
  // Only files attached to the "Attach Images" column (assets also include
  // files from updates/comments, which we don't surface here).
  const fileCol = (item.column_values || []).find(c => c.id === CLAIM_COLUMNS.images);
  const fileNames = new Set(String(fileCol?.text || '').split(',').map((s: string) => s.trim()).filter(Boolean));
  const files: ClaimFile[] = (item.assets || [])
    .filter(a => fileNames.size === 0 || [...fileNames].some(u => u.includes(String(a.id)) || u.endsWith(a.name || '')))
    .map(a => ({
      assetId: String(a.id),
      name: a.name || 'file',
      isImage: IMAGE_EXT.test(a.name || '') || IMAGE_EXT.test('.' + (a.file_extension || '')),
      url: a.public_url || '',
    }));
  return {
    id: String(item.id),
    name: item.name || '',
    groupId: item.group?.id || '',
    groupTitle: item.group?.title || '',
    createdAt: item.created_at || '',
    status: cv[CLAIM_COLUMNS.status] || '',
    claimNumber: cv[CLAIM_COLUMNS.claimNumber] || '',
    resultNotes: cv[CLAIM_COLUMNS.resultNotes] || '',
    dateSubmitted: dateOnly(cv[CLAIM_COLUMNS.dateSubmitted]),
    orderNumber: cv[CLAIM_COLUMNS.orderNumber] || '',
    trackingNumber: cv[CLAIM_COLUMNS.trackingNumber] || '',
    reason: cv[CLAIM_COLUMNS.reason] || '',
    additionalInfo: cv[CLAIM_COLUMNS.additionalInfo] || '',
    dateResolved: dateOnly(cv[CLAIM_COLUMNS.dateResolved]),
    whoRequested: cv[CLAIM_COLUMNS.whoRequested] || '',
    value: cv[CLAIM_COLUMNS.value] || '',
    files: fileNames.size === 0 ? [] : files,
  };
}

/** Every claim linked to the given Clients-board item, newest first. */
export async function fetchClaimsForClient(clientBoardItemId: string): Promise<Claim[]> {
  if (!isMondayId(clientBoardItemId)) throw new Error('Invalid client id');
  const claims: Claim[] = [];
  let cursor: string | null = null;
  // First page filters by the board-relation column; later pages follow the cursor.
  const first = await mondayQuery<{ boards?: { items_page?: ItemsPage }[] }>(
    `query ($board: [ID!], $rules: [ItemsQueryRule!]) {
      boards(ids: $board) {
        items_page(limit: 100, query_params: { rules: $rules }) {
          cursor
          items { ${CLAIM_ITEM_FIELDS} }
        }
      }
    }`,
    {
      board: [CLAIMS_BOARD_ID],
      rules: [{ column_id: CLAIM_COLUMNS.client, compare_value: [Number(clientBoardItemId)], operator: 'any_of' }],
    },
  );
  const page = first?.boards?.[0]?.items_page;
  for (const it of page?.items || []) claims.push(toClaim(it));
  cursor = page?.cursor || null;
  while (cursor) {
    const next: { next_items_page?: ItemsPage } = await mondayQuery(
      `query ($cursor: String!) { next_items_page(limit: 100, cursor: $cursor) { cursor items { ${CLAIM_ITEM_FIELDS} } } }`,
      { cursor },
    );
    for (const it of next?.next_items_page?.items || []) claims.push(toClaim(it));
    cursor = next?.next_items_page?.cursor || null;
  }
  claims.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return claims;
}

export async function fetchClaim(claimId: string): Promise<Claim | null> {
  if (!isMondayId(claimId)) return null;
  const data = await mondayQuery<{ items?: MondayItem[] }>(`query ($ids: [ID!]) { items(ids: $ids) { ${CLAIM_ITEM_FIELDS} board { id } } }`, { ids: [claimId] });
  const item = data?.items?.[0];
  if (!item || String(item.board?.id) !== CLAIMS_BOARD_ID) return null;
  return toClaim(item);
}

/** Status / reason labels and the board's groups, for the extension's pickers. */
export async function fetchClaimOptions(): Promise<ClaimOptions> {
  const data = await mondayQuery<{ boards?: { groups?: { id: string; title: string }[]; columns?: { id: string; settings_str?: string }[] }[] }>(
    `query ($board: [ID!]) { boards(ids: $board) { groups { id title } columns(ids: ["${CLAIM_COLUMNS.status}", "${CLAIM_COLUMNS.reason}"]) { id settings_str } } }`,
    { board: [CLAIMS_BOARD_ID] },
  );
  const board = data?.boards?.[0];
  const labelsFor = (colId: string): string[] => {
    const col = (board?.columns || []).find(c => c.id === colId);
    try {
      const s = JSON.parse(col?.settings_str || '{}');
      const labels = s.labels || {};
      // Status labels come as { index: label }; keep index order, drop blanks
      // and deactivated labels.
      const deactivated = new Set((s.deactivated_labels || []).map(String));
      return Object.keys(labels)
        .sort((a, b) => Number(a) - Number(b))
        .filter(k => !deactivated.has(k))
        .map(k => labels[k])
        .filter((l: unknown) => typeof l === 'string' && l.trim());
    } catch {
      return [];
    }
  };
  return {
    statuses: labelsFor(CLAIM_COLUMNS.status),
    reasons: labelsFor(CLAIM_COLUMNS.reason),
    groups: (board?.groups || []).map(g => ({ id: String(g.id), title: String(g.title) })),
  };
}

/** Turn { field: value } into Monday column_values JSON. Unknown fields are ignored. */
export function buildColumnValues(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(fields || {})) {
    const spec = CLAIM_FIELDS[key];
    if (!spec) continue;
    const value = raw == null ? '' : String(raw).trim();
    switch (spec.kind) {
      case 'text':
        out[spec.columnId] = value;
        break;
      case 'long_text':
        out[spec.columnId] = value ? { text: value } : { text: '' };
        break;
      case 'status':
        out[spec.columnId] = value ? { label: value } : null;
        break;
      case 'date':
        if (!value) out[spec.columnId] = null;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) out[spec.columnId] = { date: value };
        else throw new Error(`Invalid date for ${key}: use YYYY-MM-DD`);
        break;
    }
  }
  return out;
}

/** Default item name, matching the board's convention: "Client - #order". */
export function claimItemName(clientName: string, orderNumber: string): string {
  const client = (clientName || '').trim() || 'Claim';
  const order = (orderNumber || '').trim().replace(/^#/, '');
  return order ? `${client} - #${order}` : client;
}

export async function createClaim(opts: {
  clientBoardItemId: string;
  clientName: string;
  fields: Record<string, unknown>;
  groupId?: string;
}): Promise<Claim> {
  if (!isMondayId(opts.clientBoardItemId)) throw new Error('Invalid client id');
  const columnValues = buildColumnValues(opts.fields);
  columnValues[CLAIM_COLUMNS.client] = { item_ids: [Number(opts.clientBoardItemId)] };
  if (!columnValues[CLAIM_COLUMNS.status]) columnValues[CLAIM_COLUMNS.status] = { label: 'New' };
  if (!columnValues[CLAIM_COLUMNS.dateSubmitted]) {
    columnValues[CLAIM_COLUMNS.dateSubmitted] = { date: new Date().toISOString().slice(0, 10) };
  }
  const name = claimItemName(opts.clientName, String(opts.fields.orderNumber || ''));
  const data = await mondayQuery<{ create_item?: { id: string } }>(
    `mutation ($board: ID!, $group: String, $name: String!, $cv: JSON) {
      create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $cv, create_labels_if_missing: false) { id }
    }`,
    {
      board: CLAIMS_BOARD_ID,
      group: opts.groupId || DEFAULT_CLAIM_GROUP_ID,
      name,
      cv: JSON.stringify(columnValues),
    },
  );
  const id = String(data?.create_item?.id || '');
  const claim = id ? await fetchClaim(id) : null;
  if (!claim) throw new Error('Claim was created but could not be read back');
  return claim;
}

export async function updateClaim(
  claimId: string,
  changes: { fields?: Record<string, unknown>; name?: string; groupId?: string },
): Promise<Claim> {
  const existing = await fetchClaim(claimId);
  if (!existing) throw new Error('Claim not found');
  const columnValues = buildColumnValues(changes.fields || {});
  if (Object.keys(columnValues).length) {
    await mondayQuery(
      `mutation ($board: ID!, $item: ID!, $cv: JSON!) {
        change_multiple_column_values(board_id: $board, item_id: $item, column_values: $cv, create_labels_if_missing: false) { id }
      }`,
      { board: CLAIMS_BOARD_ID, item: claimId, cv: JSON.stringify(columnValues) },
    );
  }
  if (typeof changes.name === 'string' && changes.name.trim() && changes.name.trim() !== existing.name) {
    await mondayQuery(
      `mutation ($board: ID!, $item: ID!, $cv: JSON!) {
        change_multiple_column_values(board_id: $board, item_id: $item, column_values: $cv) { id }
      }`,
      { board: CLAIMS_BOARD_ID, item: claimId, cv: JSON.stringify({ name: changes.name.trim() }) },
    );
  }
  if (changes.groupId && changes.groupId !== existing.groupId) {
    await mondayQuery(
      `mutation ($item: ID!, $group: String!) { move_item_to_group(item_id: $item, group_id: $group) { id } }`,
      { item: claimId, group: changes.groupId },
    );
  }
  const updated = await fetchClaim(claimId);
  if (!updated) throw new Error('Claim updated but could not be read back');
  return updated;
}

/** Attach one file to the claim's "Attach Images" column. */
export async function addClaimFile(claimId: string, file: File): Promise<ClaimFile> {
  if (!isMondayId(claimId)) throw new Error('Invalid claim id');
  // Same multipart shape as app/api/client/[id]/file (known to work with
  // Monday's /v2/file endpoint). claimId is validated numeric above.
  const form = new FormData();
  form.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${claimId}, column_id: "${CLAIM_COLUMNS.images}", file: $file) { id name file_extension }
    }`,
  );
  form.append('variables[file]', file, file.name);
  const res = await fetch(MONDAY_FILE_URL, {
    method: 'POST',
    headers: { Authorization: getApiKey(), 'API-Version': '2024-10' },
    body: form,
  });
  const data = await res.json();
  if (data.errors || data.error_message) {
    console.error('Monday claim file upload error:', data.errors || data.error_message);
    throw new Error(data.errors?.[0]?.message || data.error_message || 'Upload failed');
  }
  const asset = data.data?.add_file_to_column;
  return {
    assetId: String(asset?.id || ''),
    name: asset?.name || file.name,
    isImage: IMAGE_EXT.test(asset?.name || file.name),
  };
}
