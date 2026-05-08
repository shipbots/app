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

      const checklist: ChecklistStep[] = CHECKLIST_STEPS.map(step => ({
        id: step.id,
        label: step.label,
        shortLabel: step.shortLabel,
        value: cols[step.id] || null,
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

  // ── Join Initial Inventory Est. Delivery Date from the Clients board ──
  // Calendar "Expected Delivery" pulls from this field (date_mktrzhyk on the
  // Clients board), not from the actual-received date_…1 on Onboarding.
  const clientIds = Array.from(
    new Set(allItems.map(i => i.clientBoardItemId).filter((id): id is string => !!id))
  );
  if (clientIds.length > 0) {
    try {
      const estByClient = await fetchEstimatedDeliveryDates(clientIds);
      for (const item of allItems) {
        if (item.clientBoardItemId && estByClient[item.clientBoardItemId]) {
          const { date, time } = estByClient[item.clientBoardItemId];
          item.estimatedDeliveryDate = date;
          item.estimatedDeliveryTime = time;
        }
      }
    } catch (err) {
      console.error('[fetchOnboardingItems] estimated delivery date join failed:', err);
      // non-fatal: items just won't have estimatedDeliveryDate set
    }
  }

  return allItems;
}

// Fetch date_mktrzhyk (Initial Inventory Est. Delivery Date) for a batch of
// Client board item IDs. Returns { itemId → { date, time } }.
async function fetchEstimatedDeliveryDates(
  itemIds: string[]
): Promise<Record<string, { date: string | null; time: string | null }>> {
  const result: Record<string, { date: string | null; time: string | null }> = {};
  // Monday's items() query supports up to ~100 ids per call; chunk for safety.
  const CHUNK = 100;
  for (let i = 0; i < itemIds.length; i += CHUNK) {
    const chunk = itemIds.slice(i, i + CHUNK);
    const query = `query {
      items(ids: [${chunk.join(',')}]) {
        id
        column_values(ids: ["date_mktrzhyk"]) { id text value }
      }
    }`;
    const data = await mondayQuery(query);
    const items: Array<{ id: string; column_values: Array<{ id: string; text: string | null; value: string | null }> }> = data.items ?? [];
    for (const it of items) {
      const cv = it.column_values?.[0];
      const date = cv?.text || null;
      let time: string | null = null;
      if (cv?.value) {
        try {
          const parsed = JSON.parse(cv.value);
          time = parsed?.time && parsed.time !== '00:00:00' ? parsed.time : null;
        } catch { /* ignore */ }
      }
      result[it.id] = { date, time };
    }
  }
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
  const columnValues = JSON.stringify({ [columnId]: colValue }).replace(/"/g, '\\"');
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

export async function updateClientField(
  itemId: string,
  columnId: string,
  value: string,
  valueType: ColumnValueType = 'text'
): Promise<void> {
  // Format the column value based on Monday.com column type requirements:
  //   text/long_text → {"text": "..."} (long_text REQUIRES this object form)
  //   status         → {"label": "Done"}
  //   dropdown       → {"labels": ["Option"]}
  //   date           → {"date": "YYYY-MM-DD"}
  let colValue: string | { label: string } | { labels: string[] } | { date: string } | { text: string };
  switch (valueType) {
    case 'status':   colValue = value ? { label: value } : ''; break;
    case 'dropdown': colValue = value ? { labels: [value] } : { labels: [] }; break;
    case 'date':     colValue = value ? { date: value } : ''; break;
    default:
      // long_text columns require {"text": "..."} via change_multiple_column_values.
      // Plain text columns must use a raw string — Monday rejects/blanks them
      // when given an object form here.
      colValue = columnId.startsWith('long_text') ? { text: value } : value;
  }
  const columnValues = JSON.stringify({ [columnId]: colValue }).replace(/"/g, '\\"');
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
  console.log(`[updateClientField] item=${itemId} col=${columnId} type=${valueType} value="${typeof colValue === 'string' ? colValue : JSON.stringify(colValue)}"`);
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

// ─── Update a field on the Onboarding board (status or date columns) ─────────
export async function updateOnboardingField(
  itemId: string,
  columnId: string,
  value: string,
  valueType: ColumnValueType = 'status'
): Promise<void> {
  let colValue: string | { label: string } | { date: string } | { text: string };
  switch (valueType) {
    case 'status': colValue = value ? { label: value } : ''; break;
    case 'date':   colValue = value ? { date: value } : ''; break;
    default:
      // long_text columns require {"text": "..."}; plain text takes a string.
      colValue = columnId.startsWith('long_text') ? { text: value } : value;
  }
  const columnValues = JSON.stringify({ [columnId]: colValue }).replace(/"/g, '\\"');
  const query = `mutation {
    change_multiple_column_values(
      board_id: ${ONBOARDING_BOARD_ID},
      item_id: ${itemId},
      column_values: "${columnValues}"
    ) {
      id
    }
  }`;
  await mondayQuery(query);
}

// ─── Fetch subitem board column metadata ─────────────────────────────────────
export async function fetchSubitemBoardInfo(): Promise<{
  boardId: string | null;
  statusColumnId: string | null;
  statusOptions: string[];
  dateColumnId: string | null;
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
    }
    return { boardId, statusColumnId, statusOptions, dateColumnId };
  }

  return { boardId: null, statusColumnId: null, statusOptions: [], dateColumnId: null };
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
  }
): Promise<void> {
  // Rename if name provided
  if (opts.name?.trim()) {
    const safeName = opts.name.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await mondayQuery(`mutation {
      change_item_name(board_id: ${boardId}, item_id: ${itemId}, value: "${safeName}") { id }
    }`);
  }

  // Update column values (status, date)
  const colObj: Record<string, unknown> = {};
  if (opts.statusColumnId) {
    colObj[opts.statusColumnId] = opts.status ? { label: opts.status } : '';
  }
  if (opts.dateColumnId) {
    colObj[opts.dateColumnId] = opts.dueDate ? { date: opts.dueDate } : '';
  }
  if (Object.keys(colObj).length) {
    const colValuesStr = JSON.stringify(JSON.stringify(colObj));
    await mondayQuery(`mutation {
      change_multiple_column_values(board_id: ${boardId}, item_id: ${itemId}, column_values: ${colValuesStr}) { id }
    }`);
  }
}

// ─── Create a new subitem under a parent onboarding item ─────────────────────
export async function createSubitem(
  parentItemId: string,
  name: string,
  opts?: { statusColumnId?: string; status?: string; dateColumnId?: string; dueDate?: string; notes?: string }
): Promise<SubItem> {
  const colObj: Record<string, unknown> = {};
  if (opts?.statusColumnId && opts.status) colObj[opts.statusColumnId] = { label: opts.status };
  if (opts?.dateColumnId && opts.dueDate)    colObj[opts.dateColumnId]  = { date: opts.dueDate };

  const colValuesStr = Object.keys(colObj).length
    ? JSON.stringify(JSON.stringify(colObj))   // double-encoded for inline GraphQL string
    : '"{}"';

  const safeName = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `mutation {
    create_subitem(
      parent_item_id: ${parentItemId},
      item_name: "${safeName}",
      column_values: ${colValuesStr}
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
  let dueDate = '';
  for (const cv of sub.column_values) {
    if ((cv.type === 'color' || cv.type === 'status') && !status && cv.text) status = cv.text;
    if ((cv.type === 'multiple-person' || cv.type === 'people' || cv.id === 'person') && !assignee && cv.text) assignee = cv.text;
    if ((cv.type === 'date' || cv.id.startsWith('date')) && !dueDate && cv.value) {
      try { dueDate = JSON.parse(cv.value).date || ''; } catch { /* ignore */ }
    }
  }
  const result: SubItem = { id: sub.id, name: sub.name, status, assignee, dueDate, parentItemId, parentItemName: '' };

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
        let dueDate = '';

        for (const cv of sub.column_values) {
          if ((cv.type === 'color' || cv.type === 'status') && !status && cv.text) status = cv.text;
          if ((cv.type === 'multiple-person' || cv.type === 'people' || cv.id === 'person') && !assignee && cv.text) assignee = cv.text;
          if ((cv.type === 'date' || cv.id.startsWith('date')) && !dueDate && cv.value) {
            try { dueDate = JSON.parse(cv.value).date || ''; } catch { /* ignore */ }
          }
        }

        allSubitems.push({
          id: sub.id,
          name: sub.name,
          status,
          assignee,
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
