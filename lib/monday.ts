import { OnboardingItem, ChecklistStep, ClientInfo, MonFile, SubItem } from './types';
import { ONBOARDING_BOARD_ID, CLIENTS_BOARD_ID, CHECKLIST_STEPS, ONBOARDING_COLUMN_IDS, CLIENT_COLUMN_IDS, getStepState } from './constants';

const MONDAY_API_URL = 'https://api.monday.com/v2';

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set in environment');
  return key;
}

async function mondayQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': getApiKey(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });
  const data = await res.json();
  if (data.errors) {
    console.error('Monday.com API error:', data.errors);
    throw new Error(data.errors[0]?.message || 'Monday.com API error');
  }
  return data.data;
}

function extractColumnValue(columnValues: Record<string, string>, columnId: string): string {
  return columnValues[columnId] || '';
}

export async function fetchOnboardingItems(): Promise<OnboardingItem[]> {
  const columnIds = ONBOARDING_COLUMN_IDS;

  let allItems: OnboardingItem[] = [];
  let cursor: string | null = null;

  do {
    const query = cursor
      ? `query ($cursor: String!) {
          next_items_page(cursor: $cursor, limit: 100) {
            cursor
            items {
              id
              name
              url
              created_at
              updated_at
              subitems { id column_values { id text type } }
              column_values(ids: ${JSON.stringify(columnIds)}) {
                id
                text
                value
                ... on BoardRelationValue {
                  linked_items { id name }
                }
              }
            }
          }
        }`
      : `query {
          boards(ids: [${ONBOARDING_BOARD_ID}]) {
            items_page(limit: 100) {
              cursor
              items {
                id
                name
                url
                created_at
                updated_at
                subitems { id column_values { id text type } }
                column_values(ids: ${JSON.stringify(columnIds)}) {
                  id
                  text
                  value
                  ... on BoardRelationValue {
                    linked_items { id name }
                  }
                }
              }
            }
          }
        }`;

    const variables = cursor ? { cursor } : undefined;
    const data = await mondayQuery(query, variables);

    type LinkedItem = { id: string; name: string };
    type ColumnValue = { id: string; text: string | null; value: string | null; linked_items?: Array<LinkedItem> };
    type SubitemCV = { id: string; text: string | null; type: string };
    type PageItem = { id: string; name: string; url: string; created_at: string; updated_at: string; subitems?: { id: string; column_values: SubitemCV[] }[]; column_values: ColumnValue[] };
    const page: { cursor: string | null; items: PageItem[] } = cursor
      ? data.next_items_page
      : data.boards[0].items_page;

    const items = page.items.map((item: PageItem) => {
      const cols: Record<string, string> = {};
      for (const cv of item.column_values) {
        cols[cv.id] = cv.text || '';
      }

      // Parse time components from date column raw values (e.g. {"date":"2025-01-15","time":"14:00:00"})
      let kickoffTime: string | null = null;
      let deliveredTime: string | null = null;
      for (const cv of item.column_values) {
        if (cv.id === 'date3' || cv.id === 'date__1') {
          try {
            const parsed = JSON.parse(cv.value || '{}');
            const t = parsed.time && parsed.time !== '00:00:00' ? (parsed.time as string) : null;
            if (cv.id === 'date3') kickoffTime = t;
            if (cv.id === 'date__1') deliveredTime = t;
          } catch { /* ignore */ }
        }
      }

      // Build the checklist from the per-step config. Steps that live on the
      // Clients board get a `null` value here; they're filled in below after
      // the join. Progress is recomputed at that point too.
      const checklist: ChecklistStep[] = CHECKLIST_STEPS.map(step => ({
        id: step.id,
        label: step.label,
        shortLabel: step.shortLabel,
        value: (step.board ?? 'onboarding') === 'onboarding' ? (cols[step.id] || null) : null,
        options: step.options,
        invertLogic: step.invertLogic,
      }));

      const doneCount = checklist.filter(s => getStepState(s.value, s.invertLogic) === 'done').length;
      const applicableCount = checklist.filter(s => getStepState(s.value, s.invertLogic) !== 'na').length;
      const progress = applicableCount > 0 ? Math.round((doneCount / applicableCount) * 100) : 0;

      // Parse connected board item via BoardRelationValue fragment
      let clientBoardItemId: string | null = null;
      let clientBoardItemName: string | null = null;
      const connectValue = item.column_values.find(cv => cv.id === 'connect_boards');
      if (connectValue?.linked_items?.length) {
        clientBoardItemId = connectValue.linked_items[0].id;
        clientBoardItemName = connectValue.linked_items[0].name;
      }

      // Parse person (onboarder)
      let onboarder: string | null = null;
      const personValue = item.column_values.find(cv => cv.id === 'person');
      if (personValue?.text) {
        onboarder = personValue.text;
      }

      return {
        id: item.id,
        name: item.name,
        url: item.url,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        status: cols['estado'] || 'N/A',
        inventoryDelivered: cols['status_2'] || '',
        kickoffDate: cols['date3'] || null,
        kickoffTime,
        deliveredDate: cols['date__1'] || null,
        deliveredTime,
        estimatedDeliveryDate: null, // joined in below from Clients board
        estimatedDeliveryTime: null,
        shippingDetails: cols['text_mkw94440'] || '',
        onboarder,
        clientBoardItemId,
        clientBoardItemName,
        supportAgentEmail: null, // filled in after batch query below
        progress,
        checklist,
        subitemCount: (item.subitems ?? []).filter(sub => {
          // Count only subitems whose status is not "done" / "complete" / "finished"
          const statusCol = sub.column_values.find(cv => cv.type === 'color' || cv.type === 'status');
          const label = statusCol?.text?.toLowerCase() ?? '';
          return !label.includes('done') && !label.includes('complete') && !label.includes('finished');
        }).length,
      };
    });

    allItems = [...allItems, ...items];
    cursor = page.cursor;
  } while (cursor);

  // ── Join Clients-board fields the onboarding view needs ──
  // - Initial Inventory Est. Delivery Date (calendar 'Expected Delivery')
  // - Payment on File? (drives the 'Retrieved payment information' checklist
  //   step, plus a SelectField in the Client Info panel)
  const clientIds = Array.from(
    new Set(allItems.map(i => i.clientBoardItemId).filter((id): id is string => !!id))
  );
  if (clientIds.length > 0) {
    try {
      const joined = await fetchClientBoardJoins(clientIds);
      for (const item of allItems) {
        if (!item.clientBoardItemId) continue;
        const j = joined[item.clientBoardItemId];
        if (!j) continue;
        item.estimatedDeliveryDate = j.estimatedDeliveryDate;
        item.estimatedDeliveryTime = j.estimatedDeliveryTime;

        // Patch in checklist steps whose value lives on the Clients board.
        // Each such step matches by id; we mutate it in place so the rest of
        // the checklist (progress %, badge counts, etc.) reflects the join.
        for (const step of item.checklist) {
          const cfg = CHECKLIST_STEPS.find(s => s.id === step.id);
          if (!cfg || (cfg.board ?? 'onboarding') !== 'clients') continue;
          step.value = j.clientBoardColumns[cfg.id] ?? null;
        }

        // Recompute progress now that client-board steps have real values.
        const doneCount = item.checklist.filter(s => getStepState(s.value, s.invertLogic) === 'done').length;
        const applicableCount = item.checklist.filter(s => getStepState(s.value, s.invertLogic) !== 'na').length;
        item.progress = applicableCount > 0 ? Math.round((doneCount / applicableCount) * 100) : 0;
      }
    } catch (err) {
      console.error('[fetchOnboardingItems] clients-board join failed:', err);
      // non-fatal: items just won't have those fields filled
    }
  }

  return allItems;
}

// Per-client fields that the Onboarding view reads from the Clients board.
type ClientBoardJoin = {
  estimatedDeliveryDate: string | null;
  estimatedDeliveryTime: string | null;
  /** Raw text value (e.g. "Yes", "No", "") for every client-board checklist
   *  step, keyed by column id. */
  clientBoardColumns: Record<string, string>;
};

// IDs of all Clients-board columns the join needs to pull. Includes the
// Initial Inventory date plus every checklist step configured with
// `board: 'clients'`.
function clientBoardJoinColumnIds(): string[] {
  const set = new Set<string>(['date_mktrzhyk']);
  for (const step of CHECKLIST_STEPS) {
    if ((step.board ?? 'onboarding') === 'clients') set.add(step.id);
  }
  return Array.from(set);
}

async function fetchClientBoardJoins(itemIds: string[]): Promise<Record<string, ClientBoardJoin>> {
  const result: Record<string, ClientBoardJoin> = {};
  // Monday's items() query silently truncates the response on larger batches —
  // empirically anything above ~25 IDs starts dropping items without error.
  const CHUNK = 25;
  const chunks: string[][] = [];
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    chunks.push(itemIds.slice(i, i + CHUNK));
  }
  const colIds = clientBoardJoinColumnIds();
  const colIdsJson = JSON.stringify(colIds);
  // Run chunks in parallel; per-minute rate limits are well above the small
  // burst this produces, and a sequential loop adds 3-4s to every page render.
  await Promise.all(
    chunks.map(async chunk => {
      const query = `query {
        items(ids: [${chunk.join(',')}]) {
          id
          column_values(ids: ${colIdsJson}) { id text value }
        }
      }`;
      const data = await mondayQuery(query);
      const items: Array<{ id: string; column_values: Array<{ id: string; text: string | null; value: string | null }> }> = data.items ?? [];
      for (const it of items) {
        const cvById: Record<string, { text: string | null; value: string | null }> = {};
        for (const cv of it.column_values ?? []) cvById[cv.id] = cv;

        // Estimated delivery date — parse the canonical YYYY-MM-DD from raw
        // value; cv.text can be locale-formatted ("May 31, 2026") and won't
        // match calendar ISO date keys.
        const dateCv = cvById['date_mktrzhyk'];
        let date: string | null = null;
        let time: string | null = null;
        if (dateCv?.value) {
          try {
            const parsed = JSON.parse(dateCv.value);
            date = parsed?.date || null;
            time = parsed?.time && parsed.time !== '00:00:00' ? parsed.time : null;
          } catch { /* ignore */ }
        }

        // Client-board checklist column values (text form is the displayed
        // label like "Yes" / "No" — exactly what getStepState() expects).
        const clientBoardColumns: Record<string, string> = {};
        for (const step of CHECKLIST_STEPS) {
          if ((step.board ?? 'onboarding') !== 'clients') continue;
          clientBoardColumns[step.id] = cvById[step.id]?.text ?? '';
        }

        result[it.id] = { estimatedDeliveryDate: date, estimatedDeliveryTime: time, clientBoardColumns };
      }
    })
  );
  return result;
}

// Fetches a map of { clientBoardItemId -> agentEmail } for all clients.
// Called lazily from the client via /api/agent-emails — kept separate to avoid
// blowing Monday's per-minute complexity budget on the main page load.
export async function fetchAgentEmailMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  let cursor: string | null = null;

  do {
    const query = cursor
      ? `query ($cursor: String!) {
          next_items_page(cursor: $cursor, limit: 500) {
            cursor
            items {
              id
              column_values(ids: ["dropdown_mkxx7xv"]) { id text }
            }
          }
        }`
      : `query {
          boards(ids: [${CLIENTS_BOARD_ID}]) {
            items_page(limit: 500) {
              cursor
              items {
                id
                column_values(ids: ["dropdown_mkxx7xv"]) { id text }
              }
            }
          }
        }`;

    const variables = cursor ? { cursor } : undefined;
    const data = await mondayQuery(query, variables);
    const page: { cursor: string | null; items: { id: string; column_values?: { id: string; text: string | null }[] }[] } = cursor ? data.next_items_page : data.boards[0].items_page;

    for (const item of page.items) {
      const col = item.column_values?.[0];
      if (col?.text) map[item.id] = col.text;
    }
    cursor = page.cursor;
  } while (cursor);

  return map;
}

export async function fetchClientInfo(itemId: string, onboardingItemId?: string): Promise<ClientInfo> {
  const query = `query {
    items(ids: [${itemId}]) {
      id
      name
      group { id }
      column_values {
        id
        text
        value
      }
    }
  }`;

  const data = await mondayQuery(query);
  const item = data.items[0];

  const cols: Record<string, string> = {};
  for (const cv of item.column_values) {
    cols[cv.id] = cv.text || '';
  }

  // Parse link column
  let pricingProposal: { url: string; text: string } | null = null;
  const linkCol = item.column_values.find((cv: { id: string }) => cv.id === 'link_mktqh0sq');
  if (linkCol?.value) {
    try {
      const parsed = JSON.parse(linkCol.value);
      if (parsed.url) {
        pricingProposal = { url: parsed.url, text: parsed.text || parsed.url };
      }
    } catch { /* ignore */ }
  }

  // Parse Docusign file from the Onboarding board (files column) if onboardingItemId provided
  let docusignFile: MonFile | null = null;
  if (onboardingItemId) {
    try {
      const filesQuery = `query {
        items(ids: [${onboardingItemId}]) {
          column_values(ids: ["files"]) {
            id
            value
          }
        }
      }`;
      const filesData = await mondayQuery(filesQuery);
      const filesItem = filesData.items?.[0];
      const filesCol = filesItem?.column_values?.find((cv: { id: string }) => cv.id === 'files');
      if (filesCol?.value) {
        const parsed = JSON.parse(filesCol.value);
        const files: Array<{ assetId?: number; asset_id?: number; name?: string; url?: string; fileExtension?: string; file_extension?: string }> = parsed.files || [];
        if (files.length > 0) {
          const f = files[files.length - 1]; // most recent
          const rawAssetId = String(f.assetId ?? f.asset_id ?? '');
          // Resolve the public_url so the file can be opened directly in the browser
          let publicUrl = f.url || '';
          if (rawAssetId) {
            try {
              const assetRes = await mondayQuery(
                `query { assets(ids: [${rawAssetId}]) { id public_url } }`
              );
              const assetPublicUrl = assetRes.assets?.[0]?.public_url;
              if (assetPublicUrl) publicUrl = assetPublicUrl;
            } catch { /* fall back to raw url */ }
          }
          docusignFile = {
            assetId: rawAssetId,
            name: f.name || 'Document',
            url: publicUrl,
            fileExtension: f.fileExtension || f.file_extension || '',
          };
        }
      }
    } catch { /* ignore */ }
  }

  // Parse date columns from raw JSON value to ensure YYYY-MM-DD format
  // (cv.text may return locale-formatted strings like "Jan 15, 2025")
  const parseDateCol = (id: string): string => {
    const cv = item.column_values.find((c: { id: string }) => c.id === id);
    if (!cv?.value) return '';
    try { const p = JSON.parse(cv.value); return p.date || ''; } catch { return ''; }
  };

  const initialInventoryDateParsed = parseDateCol('date_mktrzhyk');
  const dateDocusignSigned = parseDateCol('date_mkw2fhte');

  return {
    id: item.id,
    name: item.name,
    // General Account Info
    legalEntity: cols['text_mktp4fvk'] || '',
    ein: cols['text_mkxxfg1b'] || '',
    quickbooksName: cols['text_mkx5b9b4'] || '',
    shipHeroId: cols['text_mktmf2yw'] || '',
    shipHeroName: cols['text_mkw9n26z'] || '',
    paymentOnFile: cols['dropdown_mm47xxjv'] || '',
    productCategory: cols['color_mktq81r3'] || '',
    productDescription: cols['long_text_mktqtxm'] || '',
    warehouseLocation: cols['dropdown_mktxaege'] || '',
    businessHQ: cols['text_mktx63am'] || '',
    manufacturingLocation: cols['text_mktxyg5p'] || '',
    clientStatus: cols['color_mkvq7kn6'] || '',
    timeAsClientDays: cols['formula_mkw2t55t'] || '',
    interestInAdditionalServices: cols['text_mkw2y8q9'] || '',
    umbrellaCompany: cols['dropdown_mkyk2va7'] || '',
    billingStreet1: cols['text_mkx5vzht'] || '',
    billingStreet2: cols['text_mkx5f9p9'] || '',
    billingCity: cols['text_mkx5z70k'] || '',
    billingState: cols['text_mkx5er1a'] || '',
    billingZip: cols['text_mkx5tjd7'] || '',
    billingCountry: cols['text_mkx5kyv4'] || '',
    billingNameUpdated: cols['color_mkx5yjnk'] || '',
    pricingProposal,
    docusignFile,
    dateDocusignSigned,
    pickAndPack: cols['text_mm1zw2vf'] || '',
    invoicingEmail: cols['text_mktqjmmm'] || '',
    // Contact Info
    contactName: cols['text_mktqq7h6'] || '',
    contactEmail: cols['text_mktq6sr5'] || '',
    contactPhone: cols['text_mktqabcm'] || '',
    contactLocation: cols['text_mktx8q74'] || '',
    contact2Name: cols['text_mktr1evd'] || '',
    contact2Email: cols['text_mktr2xmm'] || '',
    contact2Phone: cols['text_mktr8kve'] || '',
    contact2ShipHeroAccess: cols['text_mktyakva'] || '',
    contact3Name: cols['text_mktr4v7q'] || '',
    contact3Email: cols['text_mktrt74r'] || '',
    contact3Phone: cols['text_mktrw0tb'] || '',
    contact3ShipHeroAccess: cols['text_mktyankg'] || '',
    // Receiving
    initialInventoryDate: initialInventoryDateParsed || cols['date_mktrzhyk'] || '',
    itemsBarcoded: cols['color_mktrs5ah'] || '',
    initialInventoryMethod: cols['text_mktrm9jx'] || '',
    initialInventoryQty: cols['text_mktravgn'] || '',
    preStorageNeeds: cols['dropdown_mktpdnn0'] || '',
    initialInventoryStoringNeeds: cols['text_mkw2z2tp'] || '',
    notesOnInitialInventory: cols['long_text_mktqapsv'] || '',
    notesForReceiving: cols['long_text_mkxecta8'] || '',
    // Packing & Shipping
    ecommercePlatforms: cols['long_text_mktra0sm'] || '',
    skuCount: cols['text_mktqrstq'] || '',
    currentFulfillmentMethod: cols['dropdown_mktq27te'] || '',
    packaging: cols['dropdown_mktptjhb'] || '',
    orderInserts: cols['color_mktpwd5s'] || '',
    orderInsertDetails: cols['text_mktpj2v0'] || '',
    kitsOrBundles: cols['text_mktp2938'] || '',
    overnightDelivery: cols['color_mktq9ekf'] || '',
    internationalFulfillment: cols['color_mktq43r0'] || '',
    internationalShippingDDUDDP: cols['color_mkwytd1b'] || '',
    amazonFBA: cols['color_mktqw7rg'] || '',
    shippingMethod: cols['dropdown_mktzcdg0'] || '',
    additionalInsuranceSignature: cols['text_mktrs0xa'] || '',
    wholesaleDetails: cols['text_mkw5t2ey'] || '',
    outboundLTL: cols['text_mkw5bdr2'] || '',
    estimatedStorage: cols['text_mkw4czc2'] || '',
    shippingVolume: cols['text_mktqa6sm'] || '',
    additionalNotes: cols['long_text_mktran3x'] || '',
    additionalShippingNotes: cols['long_text_mkwy13zg'] || '',
    notesForPacking: cols['long_text_mkxfv1hr'] || '',
    tikTokShop: cols['dropdown_mm28h9mz'] || '',
    lotCodeExpiration: cols['dropdown_mm28rr9y'] || '',
    outsideLabels: cols['dropdown_mm47p3h7'] || '',
    // Returns
    returnsProcess: cols['color_mkxfrgba'] || '',
    notesForReturns: cols['long_text_mkxeajq4'] || '',
    returnsIncompleteCondition: cols['color_mkzf33yv'] || '',
    returnsDamagedCondition: cols['color_mkxfa9h5'] || '',
    returnsNewCondition: cols['color_mkxfkdyh'] || '',
    returnsUsedCondition: cols['color_mkxfxdx5'] || '',
    // Portal / Support
    portalLogin: cols['text_mktxxfch'] || '',
    portalPassword: cols['text_mm28cz4g'] || '',
    portalEmail: cols['text_mkwgke3w'] || '',
    portalDropdown: cols['dropdown_mktrbeyg'] || '',
    supportAgent: cols['people__1'] || '',
    supportAgentEmail: cols['dropdown_mkxx7xv'] || '',
    hubspotDealLink: '',
    hubspotDealId: '',
    groupId: item.group?.id ?? '',
  };
}

export async function fetchAgentOptions(): Promise<string[]> {
  const query = `query {
    boards(ids: [${CLIENTS_BOARD_ID}]) {
      columns(ids: ["dropdown_mkxx7xv"]) {
        settings_str
      }
    }
  }`;
  const data = await mondayQuery(query);
  try {
    const settingsStr = data.boards[0].columns[0].settings_str;
    const settings = JSON.parse(settingsStr);
    const labels: Array<{ name: string }> = settings.labels || [];
    return labels.map(l => l.name).filter(Boolean);
  } catch {
    return [];
  }
}

export async function updateOnboardingStatus(
  itemId: string,
  columnId: string,
  label: string
): Promise<void> {
  // Use change_multiple_column_values with create_labels_if_missing so the
  // label is always accepted even if it doesn't exist yet. The older
  // change_column_value can silently return null without an errors field when
  // a label doesn't match exactly, causing saves to appear successful but not
  // actually persist in Monday.com.
  //
  // Note: mondayQuery() already throws on data.errors, so we don't need an
  // extra id-presence check here — Monday.com can legitimately return null for
  // `id` on status-column mutations even when the save succeeded.
  const colValue = label ? { label } : '';
  const columnValues = encodeColumnValuesArg(columnId, colValue);
  const query = `mutation {
    change_multiple_column_values(
      board_id: ${ONBOARDING_BOARD_ID},
      item_id: ${itemId},
      column_values: "${columnValues}",
      create_labels_if_missing: true
    ) {
      id
    }
  }`;
  console.log(`[updateOnboardingStatus] item=${itemId} col=${columnId} label="${label}"`);
  await mondayQuery(query);
  console.log(`[updateOnboardingStatus] saved OK`);
}

export type ColumnValueType = 'text' | 'status' | 'dropdown' | 'date';

// ─── Column type cache (auto-detect format) ──────────────────────────────────
// Caches column types per board so save mutations always format the value
// correctly — even when the frontend forgets / passes the wrong valueType.
// Cache TTL is 1 hour; new columns added in Monday will be picked up on the
// next save after expiry.
type MondayColumnType = string; // 'status'|'color'|'dropdown'|'date'|'long_text'|'text'|'numbers'|...
const columnTypeCache: Record<string, { types: Record<string, MondayColumnType>; fetchedAt: number }> = {};
const COLUMN_TYPE_TTL_MS = 60 * 60 * 1000;

async function getColumnTypeMap(boardId: string): Promise<Record<string, MondayColumnType>> {
  const cached = columnTypeCache[boardId];
  if (cached && Date.now() - cached.fetchedAt < COLUMN_TYPE_TTL_MS) return cached.types;
  const data = await mondayQuery(`query { boards(ids: [${boardId}]) { columns { id type } } }`);
  const types: Record<string, MondayColumnType> = {};
  for (const c of (data.boards?.[0]?.columns ?? []) as Array<{ id: string; type: string }>) {
    types[c.id] = c.type;
  }
  columnTypeCache[boardId] = { types, fetchedAt: Date.now() };
  return types;
}

// Format a value for change_multiple_column_values based on actual column type
// from Monday's metadata. This is the single source of truth for save formats —
// every save path goes through here. Adding support for a new Monday column
// type means adding one case in this function and nowhere else.
function formatColumnValue(
  type: MondayColumnType,
  value: string
): string | { label: string } | { labels: string[] } | { date: string } | { text: string } {
  switch (type) {
    case 'status':
    case 'color': // legacy alias for status
      return value ? { label: value } : '';
    case 'dropdown':
      return value ? { labels: [value] } : { labels: [] };
    case 'date':
      return value ? { date: value } : '';
    case 'long_text':
      return { text: value ?? '' };
    case 'text':
    default:
      return value ?? '';
  }
}

// Build the `column_values` argument string for change_multiple_column_values.
// The argument is a GraphQL string that itself contains JSON, so any special
// characters need to round-trip through TWO escape passes:
//   1. JSON.stringify produces JSON with backslash-escaped specials (e.g. `\n`)
//   2. Embedding it inside a GraphQL string literal requires escaping the
//      backslashes again (so the JSON `\n` reaches Monday intact) and the
//      double-quotes. Without the backslash escape, GraphQL un-escapes `\n`
//      into a literal newline character — which then makes the JSON payload
//      invalid and Monday rejects it with "Syntax error in JSON input."
//
// This was the root cause of "Save failed — check console" on long_text fields
// like Notes for Packing: the moment a user typed a multi-line note, the save
// payload broke. The bug only hit text-with-newlines, which is why most fields
// kept working and only the notes columns appeared broken.
function encodeColumnValuesArg(columnId: string, colValue: unknown): string {
  return JSON.stringify({ [columnId]: colValue })
    .replace(/\\/g, '\\\\') // escape backslashes first (\ → \\)
    .replace(/"/g, '\\"');  // then escape double-quotes (" → \")
}

export async function updateClientField(
  itemId: string,
  columnId: string,
  value: string,
  // valueType is accepted for backwards compatibility but ignored — the actual
  // column type is fetched from Monday and used to format. This means a wrong
  // valueType from the frontend can't silently corrupt the save anymore.
  _valueType: ColumnValueType = 'text'
): Promise<void> {
  const typeMap = await getColumnTypeMap(CLIENTS_BOARD_ID);
  const colType = typeMap[columnId];
  if (!colType) throw new Error(`Unknown column ${columnId} on Clients board`);
  const colValue = formatColumnValue(colType, value);
  const columnValues = encodeColumnValuesArg(columnId, colValue);
  const query = `mutation {
    change_multiple_column_values(
      board_id: ${CLIENTS_BOARD_ID},
      item_id: ${itemId},
      column_values: "${columnValues}",
      create_labels_if_missing: true
    ) {
      id
    }
  }`;
  console.log(`[updateClientField] item=${itemId} col=${columnId} type=${colType} value="${typeof colValue === 'string' ? colValue : JSON.stringify(colValue)}"`);
  await mondayQuery(query);
  console.log(`[updateClientField] saved OK`);
}

// ─── Rename an item (updates the item name column on any board) ──────────────
export async function renameItem(
  boardId: number | string,
  itemId: string,
  newName: string
): Promise<void> {
  // The item name is a special column — change_simple_column_value is the
  // correct mutation; change_multiple_column_values does not support it.
  const escaped = newName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation {
    change_simple_column_value(
      board_id: ${boardId},
      item_id: ${itemId},
      column_id: "name",
      value: "${escaped}"
    ) {
      id
      name
    }
  }`;
  console.log(`[renameItem] board=${boardId} item=${itemId} name="${newName}"`);
  await mondayQuery(query);
  console.log(`[renameItem] renamed OK`);
}

// ─── Move a Clients-board item to a different group ─────────────────────────
// Used by the side panel's Active / Inactive toggle. When a client is
// marked inactive we move them into CLIENT_GROUP_EXITED; reactivating
// drops them in CLIENT_GROUP_ACTIVE_DEFAULT.
export async function moveClientToGroup(itemId: string, groupId: string): Promise<void> {
  const safeGroup = groupId.replace(/"/g, '\\"');
  const query = `mutation {
    move_item_to_group(item_id: ${itemId}, group_id: "${safeGroup}") {
      id
      group { id title }
    }
  }`;
  console.log(`[moveClientToGroup] item=${itemId} → group=${groupId}`);
  await mondayQuery(query);
  console.log(`[moveClientToGroup] moved OK`);
}

// ─── Update a field on the Onboarding board ──────────────────────────────────
// Type is auto-detected from Monday metadata — see updateClientField for the
// design rationale.
export async function updateOnboardingField(
  itemId: string,
  columnId: string,
  value: string,
  _valueType: ColumnValueType = 'status'
): Promise<void> {
  const typeMap = await getColumnTypeMap(ONBOARDING_BOARD_ID);
  const colType = typeMap[columnId];
  if (!colType) throw new Error(`Unknown column ${columnId} on Onboarding board`);
  const colValue = formatColumnValue(colType, value);
  const columnValues = encodeColumnValuesArg(columnId, colValue);
  const query = `mutation {
    change_multiple_column_values(
      board_id: ${ONBOARDING_BOARD_ID},
      item_id: ${itemId},
      column_values: "${columnValues}",
      create_labels_if_missing: true
    ) {
      id
    }
  }`;
  console.log(`[updateOnboardingField] item=${itemId} col=${columnId} type=${colType} value="${typeof colValue === 'string' ? colValue : JSON.stringify(colValue)}"`);
  await mondayQuery(query);
  console.log(`[updateOnboardingField] saved OK`);
}

// ─── Helpers shared by every subitem parser ──────────────────────────────────
// The subitem board's "Assigned" column is a dropdown whose labels are
// teammate emails. Pulling them out of `text` (Monday's already-rendered
// comma-separated list) keeps us agnostic to the specific column id and
// works even after rename or board id changes.
function parseAssigneeEmails(cv: { type: string; text: string | null }): string[] {
  if (cv.type !== 'dropdown' || !cv.text) return [];
  return cv.text
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

// ─── Fetch subitem board column metadata ─────────────────────────────────────
export async function fetchSubitemBoardInfo(): Promise<{
  boardId: string | null;
  statusColumnId: string | null;
  statusOptions: string[];
  dateColumnId: string | null;
  /** Dropdown column the team uses to assign a task to a user (by email). */
  assigneeColumnId: string | null;
  /** Existing dropdown options (emails) — UI seeds its picker from this. */
  assigneeOptions: string[];
}> {
  // We need at least one subitem to discover the subitem board's column schema.
  const query = `query {
    boards(ids: [${ONBOARDING_BOARD_ID}]) {
      items_page(limit: 50) {
        items {
          subitems {
            board {
              id
              columns { id title type settings_str }
            }
          }
        }
      }
    }
  }`;
  const data = await mondayQuery(query);
  const pageItems: { subitems?: { board: { id: string; columns: { id: string; title: string; type: string; settings_str: string }[] } }[] }[] =
    data.boards[0].items_page.items;

  for (const item of pageItems) {
    if (!item.subitems?.length) continue;
    const { id: boardId, columns: cols } = item.subitems[0].board;
    let statusColumnId: string | null = null;
    let statusOptions: string[] = [];
    let dateColumnId: string | null = null;
    let assigneeColumnId: string | null = null;
    let assigneeOptions: string[] = [];

    for (const col of cols) {
      if ((col.type === 'color' || col.type === 'status') && !statusColumnId) {
        statusColumnId = col.id;
        try {
          const settings = JSON.parse(col.settings_str);
          const labels: Record<string, string> = settings.labels || {};
          statusOptions = Object.values(labels).filter(Boolean) as string[];
        } catch { /* ignore */ }
      }
      if (col.type === 'date' && !dateColumnId) {
        dateColumnId = col.id;
      }
      // The "Assigned" column is a dropdown of emails. Match by title so a
      // future rename to "Assignee" or "Assigned To" still resolves; first
      // dropdown column wins as a safe fallback.
      if (col.type === 'dropdown') {
        const titleLower = col.title.toLowerCase();
        const looksLikeAssignee = titleLower.includes('assign') || titleLower.includes('owner');
        if (looksLikeAssignee || !assigneeColumnId) {
          assigneeColumnId = col.id;
          try {
            const settings = JSON.parse(col.settings_str);
            const labels: Array<{ name?: string }> = settings.labels || [];
            assigneeOptions = labels
              .map(l => (l?.name ?? '').trim().toLowerCase())
              .filter(Boolean);
          } catch { /* ignore */ }
        }
      }
    }
    return { boardId, statusColumnId, statusOptions, dateColumnId, assigneeColumnId, assigneeOptions };
  }

  return { boardId: null, statusColumnId: null, statusOptions: [], dateColumnId: null, assigneeColumnId: null, assigneeOptions: [] };
}

// ─── Update an existing subitem ───────────────────────────────────────────────
export async function updateSubitem(
  itemId: string,
  boardId: string,
  opts: {
    name?: string;
    statusColumnId?: string | null;
    status?: string;
    dateColumnId?: string | null;
    dueDate?: string;
    /** ID of the dropdown column used to assign the task. */
    assigneeColumnId?: string | null;
    /**
     * Email(s) to assign. Empty array clears the column; values are written
     * with create_labels_if_missing so a brand-new email auto-adds as a
     * dropdown option.
     */
    assignees?: string[];
  }
): Promise<void> {
  // Rename if name provided
  if (opts.name?.trim()) {
    const safeName = opts.name.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await mondayQuery(`mutation {
      change_item_name(board_id: ${boardId}, item_id: ${itemId}, value: "${safeName}") { id }
    }`);
  }

  // Update column values (status, date, assignee)
  const colObj: Record<string, unknown> = {};
  if (opts.statusColumnId) {
    colObj[opts.statusColumnId] = opts.status ? { label: opts.status } : '';
  }
  if (opts.dateColumnId) {
    colObj[opts.dateColumnId] = opts.dueDate ? { date: opts.dueDate } : '';
  }
  if (opts.assigneeColumnId && opts.assignees) {
    // Dropdown columns take {"labels": [...]}; an empty array clears the value.
    const labels = opts.assignees
      .map(e => (e ?? '').trim().toLowerCase())
      .filter(Boolean);
    colObj[opts.assigneeColumnId] = labels.length > 0 ? { labels } : { labels: [] };
  }
  if (Object.keys(colObj).length) {
    const colValuesStr = JSON.stringify(JSON.stringify(colObj));
    // create_labels_if_missing: lets the UI add a new teammate by typing
    // their email without first opening Monday to create the dropdown option.
    await mondayQuery(`mutation {
      change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${colValuesStr}, create_labels_if_missing: true) { id }
    }`);
  }
}

// ─── Create a new subitem under a parent onboarding item ─────────────────────
export async function createSubitem(
  parentItemId: string,
  name: string,
  opts?: {
    statusColumnId?: string;
    status?: string;
    dateColumnId?: string;
    dueDate?: string;
    notes?: string;
    assigneeColumnId?: string;
    assignees?: string[];
  }
): Promise<SubItem> {
  const colObj: Record<string, unknown> = {};
  if (opts?.statusColumnId && opts.status) colObj[opts.statusColumnId] = { label: opts.status };
  if (opts?.dateColumnId && opts.dueDate)    colObj[opts.dateColumnId]  = { date: opts.dueDate };
  if (opts?.assigneeColumnId && opts.assignees && opts.assignees.length > 0) {
    const labels = opts.assignees.map(e => (e ?? '').trim().toLowerCase()).filter(Boolean);
    if (labels.length > 0) colObj[opts.assigneeColumnId] = { labels };
  }

  const colValuesStr = Object.keys(colObj).length
    ? JSON.stringify(JSON.stringify(colObj))   // double-encoded for inline GraphQL string
    : '"{}"';

  const safeName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation {
    create_subitem(
      parent_item_id: ${parentItemId},
      item_name: "${safeName}",
      column_values: ${colValuesStr},
      create_labels_if_missing: true
    ) {
      id
      name
      column_values { id text type value }
    }
  }`;
  const data = await mondayQuery(query);
  const sub = data.create_subitem;

  let status = '';
  let assignee = '';
  let assigneeEmails: string[] = [];
  let dueDate = '';
  for (const cv of sub.column_values) {
    if ((cv.type === 'color' || cv.type === 'status') && !status && cv.text) status = cv.text;
    if ((cv.type === 'multiple-person' || cv.type === 'people' || cv.id === 'person') && !assignee && cv.text) assignee = cv.text;
    if (cv.type === 'dropdown') {
      assigneeEmails = parseAssigneeEmails(cv);
      // If no people-column assignee was set, fall back to the dropdown text
      // so the legacy `assignee` field still reads sensibly.
      if (!assignee && cv.text) assignee = cv.text;
    }
    if ((cv.type === 'date' || cv.id.startsWith('date')) && !dueDate && cv.value) {
      try { dueDate = JSON.parse(cv.value).date || ''; } catch { /* ignore */ }
    }
  }
  const result: SubItem = { id: sub.id, name: sub.name, status, assignee, assigneeEmails, dueDate, parentItemId, parentItemName: '' };

  // Post notes as a Monday.com update on the new subitem
  if (opts?.notes?.trim()) {
    try {
      const safeBody = opts.notes.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await mondayQuery(`mutation {
        create_update(item_id: ${sub.id}, body: "${safeBody}") { id }
      }`);
    } catch { /* non-fatal */ }
  }

  return result;
}

// ─── Fetch subitems for a single onboarding item ─────────────────────────────
export async function fetchSubitems(onboardingItemId: string): Promise<SubItem[]> {
  const query = `query {
    items(ids: [${onboardingItemId}]) {
      subitems {
        id
        name
        column_values {
          id
          text
          value
          type
        }
      }
    }
  }`;
  const data = await mondayQuery(query);
  const raw = data.items?.[0]?.subitems ?? [];

  return raw.map((sub: { id: string; name: string; column_values: { id: string; text: string | null; value: string | null; type: string }[] }) => {
    let status = '';
    let assignee = '';
    let assigneeEmails: string[] = [];
    let dueDate = '';

    for (const cv of sub.column_values) {
      // Status columns
      if (cv.type === 'color' || cv.type === 'status') {
        if (!status && cv.text) status = cv.text;
      }
      // Person/assignee columns
      if (cv.type === 'multiple-person' || cv.type === 'people' || cv.id === 'person') {
        if (!assignee && cv.text) assignee = cv.text;
      }
      // Assignee dropdown (the team's "Assigned" column stores emails)
      if (cv.type === 'dropdown') {
        assigneeEmails = parseAssigneeEmails(cv);
        if (!assignee && cv.text) assignee = cv.text;
      }
      // Date columns
      if (cv.type === 'date' || cv.id.startsWith('date')) {
        if (!dueDate && cv.value) {
          try { dueDate = JSON.parse(cv.value).date || ''; } catch { /* ignore */ }
        }
      }
    }

    return {
      id: sub.id,
      name: sub.name,
      status,
      assignee,
      assigneeEmails,
      dueDate,
      parentItemId: onboardingItemId,
      parentItemName: '', // filled by caller if needed
    } satisfies SubItem;
  });
}

// ─── Fetch all subitems across all onboarding items ───────────────────────────
export async function fetchAllSubitems(): Promise<SubItem[]> {
  let allSubitems: SubItem[] = [];
  let cursor: string | null = null;

  do {
    const query = cursor
      ? `query ($cursor: String!) {
          next_items_page(cursor: $cursor, limit: 100) {
            cursor
            items {
              id
              name
              subitems {
                id
                name
                column_values { id text value type }
              }
            }
          }
        }`
      : `query {
          boards(ids: [${ONBOARDING_BOARD_ID}]) {
            items_page(limit: 100) {
              cursor
              items {
                id
                name
                subitems {
                  id
                  name
                  column_values { id text value type }
                }
              }
            }
          }
        }`;

    const variables = cursor ? { cursor } : undefined;
    const data = await mondayQuery(query, variables);
    type SubRaw = { id: string; name: string; column_values: { id: string; text: string | null; value: string | null; type: string }[] };
    type ParentRaw = { id: string; name: string; subitems: SubRaw[] };
    const page: { cursor: string | null; items: ParentRaw[] } = cursor
      ? data.next_items_page
      : data.boards[0].items_page;

    for (const parent of page.items) {
      for (const sub of (parent.subitems ?? [])) {
        let status = '';
        let assignee = '';
        let assigneeEmails: string[] = [];
        let dueDate = '';

        for (const cv of sub.column_values) {
          if ((cv.type === 'color' || cv.type === 'status') && !status && cv.text) status = cv.text;
          if ((cv.type === 'multiple-person' || cv.type === 'people' || cv.id === 'person') && !assignee && cv.text) assignee = cv.text;
          if (cv.type === 'dropdown') {
            assigneeEmails = parseAssigneeEmails(cv);
            if (!assignee && cv.text) assignee = cv.text;
          }
          if ((cv.type === 'date' || cv.id.startsWith('date')) && !dueDate && cv.value) {
            try { dueDate = JSON.parse(cv.value).date || ''; } catch { /* ignore */ }
          }
        }

        allSubitems.push({
          id: sub.id,
          name: sub.name,
          status,
          assignee,
          assigneeEmails,
          dueDate,
          parentItemId: parent.id,
          parentItemName: parent.name,
        });
      }
    }

    cursor = page.cursor;
  } while (cursor);

  return allSubitems;
}

// ─── Search clients board by email (for DocuSign webhook matching) ─────────────
/**
 * Find the first client board item whose primary, secondary, or tertiary
 * contact email matches one of the supplied addresses.
 */
export async function findClientBoardItemByEmail(
  emails: string[]
): Promise<{ id: string; name: string } | null> {
  if (emails.length === 0) return null;
  const normalised = emails.map(e => e.toLowerCase().trim());
  // These are the three contact email columns on the clients board
  const emailColIds = ['text_mktq6sr5', 'text_mktr2xmm', 'text_mktrt74r'];
  let cursor: string | null = null;

  do {
    const query = cursor
      ? `query ($cursor: String!) {
          next_items_page(cursor: $cursor, limit: 100) {
            cursor
            items {
              id
              name
              column_values(ids: ${JSON.stringify(emailColIds)}) { id text }
            }
          }
        }`
      : `query {
          boards(ids: [${CLIENTS_BOARD_ID}]) {
            items_page(limit: 100) {
              cursor
              items {
                id
                name
                column_values(ids: ${JSON.stringify(emailColIds)}) { id text }
              }
            }
          }
        }`;

    const data = await mondayQuery(query, cursor ? { cursor } : undefined);
    const page: { cursor: string | null; items: { id: string; name: string; column_values: { id: string; text: string | null }[] }[] } =
      cursor ? data.next_items_page : data.boards[0].items_page;

    for (const item of page.items) {
      for (const cv of item.column_values) {
        if (cv.text && normalised.includes(cv.text.toLowerCase().trim())) {
          return { id: item.id, name: item.name };
        }
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return null;
}

// ─── Find onboarding item linked to a clients board item ──────────────────────
/**
 * Iterate all onboarding items and return the one whose connect_boards
 * linked_items contains the given client board item ID.
 */
export async function findOnboardingItemByClientBoardId(
  clientBoardItemId: string
): Promise<{ id: string; name: string } | null> {
  let cursor: string | null = null;

  do {
    const query = cursor
      ? `query ($cursor: String!) {
          next_items_page(cursor: $cursor, limit: 100) {
            cursor
            items {
              id
              name
              column_values(ids: ["connect_boards"]) {
                ... on BoardRelationValue { linked_items { id } }
              }
            }
          }
        }`
      : `query {
          boards(ids: [${ONBOARDING_BOARD_ID}]) {
            items_page(limit: 100) {
              cursor
              items {
                id
                name
                column_values(ids: ["connect_boards"]) {
                  ... on BoardRelationValue { linked_items { id } }
                }
              }
            }
          }
        }`;

    const data = await mondayQuery(query, cursor ? { cursor } : undefined);
    type RelationCV = { linked_items?: { id: string }[] };
    const page: { cursor: string | null; items: { id: string; name: string; column_values: RelationCV[] }[] } =
      cursor ? data.next_items_page : data.boards[0].items_page;

    for (const item of page.items) {
      for (const cv of item.column_values) {
        if (cv.linked_items?.some(li => li.id === clientBoardItemId)) {
          return { id: item.id, name: item.name };
        }
      }
    }
    cursor = page.cursor;
  } while (cursor);

  return null;
}
