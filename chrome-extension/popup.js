// ShipBots Customer Service — popup logic
//
// The popup opens the dashboard in a new tab. Most actions just deep-link
// into a known path on the deployed app; the actual UI lives in the web app
// (the user's existing Google session carries over).
//
// The base URL is stored in chrome.storage.local so individual users can
// point at staging / a preview deployment without re-publishing the extension.

const DEFAULT_BASE_URL = 'https://app-snowy-eight-64.vercel.app';

// Duplicate of lib/agent-name.ts. The extension can't import from the
// dashboard's src/, so we keep a small parallel copy. If the algorithm
// changes upstream, update both places.
function firstNameFromEmail(email) {
  if (!email) return '';
  const trimmed = String(email).trim();
  if (!trimmed) return '';
  const local = trimmed.split('@')[0];
  if (!local) return '';
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

// The client currently shown in the detail view. Set in showClientDetail;
// used by the sticky-note composer so it knows which client to post to.
let activeClientId = null;

// Which view opened the current client detail ('search' | 'tasks' | 'calendar'
// | 'projects'), so the Back button returns there.
let detailOrigin = 'search';

// The loaded client search index (Clients-board id + name + fields). Hoisted to
// module scope so task/calendar rows can resolve a client by name and open it
// in the popup; assigned inside the popup's init once the index loads.
let clientIndex = null;

// Remember the client whose detail is open so reopening the popup lands right
// back on it (chrome.storage.local persists across popup closes). Cleared when
// the user navigates back to search, so a fresh open starts on the search view.
// The remembered view also expires after LAST_CLIENT_TTL_MS: reopen within the
// window and you land back on the client; after that a fresh open starts on the
// main menu (search view) so a day-old session doesn't dump you on a stale client.
const LAST_CLIENT_KEY = 'lastClientV1';
const LAST_CLIENT_TTL_MS = 15 * 60 * 1000; // 15 minutes
function saveLastClient(stub) {
  if (!stub || !stub.id) return;
  try {
    // `at` is stamped on every open so actively bouncing in and out keeps the
    // remembered view alive; the 15-min clock is "since you last looked at it".
    chrome.storage.local.set({
      [LAST_CLIENT_KEY]: { id: stub.id, name: stub.name || '', contactEmail: stub.contactEmail || '', warehouse: stub.warehouse || '', at: Date.now() },
    });
  } catch { /* ignore */ }
}
function clearLastClient() {
  try { chrome.storage.local.remove(LAST_CLIENT_KEY); } catch { /* ignore */ }
}
function readLastClient() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([LAST_CLIENT_KEY], r => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const entry = r && r[LAST_CLIENT_KEY];
        if (!entry || !entry.id) { resolve(null); return; }
        // Expired → forget it and start on the main menu.
        if (entry.at && (Date.now() - entry.at) > LAST_CLIENT_TTL_MS) {
          clearLastClient();
          resolve(null);
          return;
        }
        resolve(entry);
      });
    } catch { resolve(null); }
  });
}

// ── Client-detail payload cache ─────────────────────────────────────
// fetchClientFull hits Monday and takes a few seconds, so the detail view
// showed "Loading client info…" on every open — including when we restore
// the remembered client. Stash the last successful payload per client id and
// paint it instantly, then refresh in the background (stale-while-revalidate),
// exactly like the search-index and Tasks/Calendar caches. Bounded to the few
// most-recently-viewed clients so storage can't grow with the whole board.
const CLIENT_DETAIL_CACHE_KEY = 'clientDetailCacheV1';
const CLIENT_DETAIL_CACHE_MAX = 6;
function readClientDetailCache(id) {
  return new Promise(resolve => {
    if (!id) { resolve(null); return; }
    try {
      chrome.storage.local.get([CLIENT_DETAIL_CACHE_KEY], result => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        const map = (result && result[CLIENT_DETAIL_CACHE_KEY]) || null;
        const entry = map && map[id];
        resolve(entry && entry.data ? entry.data : null);
      });
    } catch { resolve(null); }
  });
}
function writeClientDetailCache(id, data) {
  if (!id || !data) return;
  try {
    chrome.storage.local.get([CLIENT_DETAIL_CACHE_KEY], result => {
      if (chrome.runtime.lastError) return;
      const map = (result && result[CLIENT_DETAIL_CACHE_KEY]) || {};
      map[id] = { at: Date.now(), data };
      // LRU-evict the oldest entries beyond the cap.
      const ids = Object.keys(map);
      if (ids.length > CLIENT_DETAIL_CACHE_MAX) {
        ids.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
        for (const stale of ids.slice(0, ids.length - CLIENT_DETAIL_CACHE_MAX)) delete map[stale];
      }
      chrome.storage.local.set({ [CLIENT_DETAIL_CACHE_KEY]: map });
    });
  } catch { /* ignore */ }
}

function getBaseUrl() {
  return new Promise(resolve => {
    chrome.storage.local.get(['baseUrl'], result => {
      resolve((result.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ''));
    });
  });
}

async function openPath(path) {
  const base = await getBaseUrl();
  chrome.tabs.create({ url: base + path });
  window.close();
}

function openExternal(url) {
  chrome.tabs.create({ url });
  window.close();
}

// ── Client search-index ────────────────────────────────────────────────────
// Fetches the dashboard's already-built search index (~340 clients) once
// per popup open and filters client-side. Requires a valid NextAuth
// session cookie — the extension's host_permissions ensure the cookies
// ride along on the request.
//
// Inactive clients (groupId === 'group_mkq09z7j' on the Clients board) are
// kept in results but flagged so the user knows they're not currently
// active.
const EXITED_GROUP_ID = 'group_mkq09z7j';

async function fetchClientIndex() {
  const base = await getBaseUrl();
  const res = await fetch(base + '/api/clients/search-index', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    const err = new Error('Not signed in');
    err.code = 'unauthorized';
    throw err;
  }
  if (!res.ok) throw new Error(`search-index failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// ── Client-index cache (chrome.storage.local) ───────────────────────
// The search-index fetch from Monday takes ~10s, so the popup felt
// dead on every open. We now stash the last successful index in
// chrome.storage.local and hydrate from it instantly — the user can
// search immediately while a fresh copy loads in the background.
// Stale entries are still served (no TTL gate on read): a background
// refresh always runs, so the worst case is a few-seconds-old list,
// which is exactly the tradeoff the user asked for.
const INDEX_CACHE_KEY = 'clientIndexCacheV1';

function readIndexCache() {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([INDEX_CACHE_KEY], result => {
        // chrome.runtime.lastError just means "not set" — treat as miss.
        if (chrome.runtime.lastError) { resolve(null); return; }
        const entry = result && result[INDEX_CACHE_KEY];
        if (entry && Array.isArray(entry.data)) resolve(entry);
        else resolve(null);
      });
    } catch { resolve(null); }
  });
}

function writeIndexCache(data) {
  return new Promise(resolve => {
    try {
      // Date.now() is fine here — this runs in the extension popup, not
      // a workflow context.
      chrome.storage.local.set({ [INDEX_CACHE_KEY]: { at: Date.now(), data } }, () => resolve());
    } catch { resolve(); }
  });
}

// Quick-and-dirty fuzzy match: case-insensitive contains across the most
// useful client fields. Ranks exact-prefix matches above contains.
// Searchable field registry. `contact` is 1/2/3 for contact slots, undefined
// for client-level fields. `kind` controls extra matching strategies:
//   'phone' enables digit-only matching so "555 1234" matches "(555) 555-1234"
//   'email' / default fall through to plain lowercased substring matching
const SEARCHABLE_FIELDS = [
  { key: 'name',          label: 'Client name',     isName: true },
  { key: 'shipHeroName',  label: 'ShipHero name' },
  { key: 'storeName',     label: 'Store' },
  { key: 'legalEntity',   label: 'Legal entity' },
  { key: 'contactName',   label: 'Primary contact', contact: 1 },
  { key: 'contactEmail',  label: 'Primary email',   contact: 1, kind: 'email' },
  { key: 'contactPhone',  label: 'Primary phone',   contact: 1, kind: 'phone' },
  { key: 'contact2Name',  label: 'Contact 2',       contact: 2 },
  { key: 'contact2Email', label: 'Contact 2 email', contact: 2, kind: 'email' },
  { key: 'contact2Phone', label: 'Contact 2 phone', contact: 2, kind: 'phone' },
  { key: 'contact3Name',  label: 'Contact 3',       contact: 3 },
  { key: 'contact3Email', label: 'Contact 3 email', contact: 3, kind: 'email' },
  { key: 'contact3Phone', label: 'Contact 3 phone', contact: 3, kind: 'phone' },
];

function digitsOnly(s) {
  return String(s ?? '').replace(/\D+/g, '');
}

// Pick the single best-scoring field match for this client + query.
// Returns null when nothing matches. Returns { score, field, value } on hit.
function matchScore(client, query) {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const qDigits = digitsOnly(q);
  // 3+ consecutive digits implies the user is searching by phone — so do
  // digit-only comparison against all phone fields in addition to substring
  // matching on everything else.
  const phoneMode = qDigits.length >= 3;

  let best = null;
  for (const field of SEARCHABLE_FIELDS) {
    const raw = client[field.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = String(raw);
    const valueLower = value.toLowerCase();

    let score = -1;
    if (field.kind === 'phone' && phoneMode) {
      const vDigits = digitsOnly(valueLower);
      if (vDigits.includes(qDigits)) {
        const idx = vDigits.indexOf(qDigits);
        // Match-at-start of the phone scores higher than mid-string match.
        score = (idx === 0 ? 800 : 200) - idx;
      }
    }
    if (score < 0 && valueLower.includes(q)) {
      const idx = valueLower.indexOf(q);
      score = (idx === 0 ? 1000 : 100) - idx;
    }
    if (score < 0) continue;

    // Boosts to push the right kind of hit to the top:
    //   - Hits on the client-name field always win ties.
    //   - Primary contact (1) > secondaries (2 > 3).
    if (field.isName) score += 200;
    if (field.contact === 1) score += 40;
    else if (field.contact === 2) score += 20;
    else if (field.contact === 3) score += 10;

    if (!best || score > best.score) {
      best = { score, field, value };
    }
  }
  return best;
}

function filterClients(clients, query, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  const scored = clients
    .map(c => {
      const m = matchScore(c, q);
      return m ? { ...m, c } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  // Collapse clients that share a name into a single result. A client can exist
  // as more than one Clients-board record (e.g. separate records per contact),
  // which otherwise lists the same name several times. Highest score wins, so a
  // name search shows the primary contact and an email search shows the record
  // that actually matched.
  const seenName = new Set();
  const deduped = [];
  for (const r of scored) {
    const nameKey = String(r.c.name || '').trim().toLowerCase();
    if (nameKey) {
      if (seenName.has(nameKey)) continue;
      seenName.add(nameKey);
    }
    deduped.push(r);
  }
  return deduped.slice(0, limit);
}

function renderResults(results, container, activeIdx) {
  container.innerHTML = '';
  if (results.length === 0) {
    const li = document.createElement('li');
    li.className = 'search-result-empty';
    li.textContent = 'No clients match.';
    container.appendChild(li);
    container.hidden = false;
    return;
  }
  results.forEach((result, i) => {
    const { c: client, field, value } = result;
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('data-client-id', client.id);
    if (i === activeIdx) li.className = 'active';

    const nameRow = document.createElement('div');
    nameRow.className = 'search-result-name';
    const nameText = document.createElement('span');
    nameText.textContent = client.name || '(unnamed)';
    nameRow.appendChild(nameText);
    if (client.groupId === EXITED_GROUP_ID) {
      const badge = document.createElement('span');
      badge.className = 'inactive-badge';
      badge.textContent = 'Inactive';
      nameRow.appendChild(badge);
    }
    li.appendChild(nameRow);

    // Meta line. If the match was via a contact field, surface that value
    // and tag it ("contact 2") so the user sees why this row appeared.
    // Otherwise fall back to the standard primary-email · warehouse line.
    const isContactMatch = !!field.contact && !field.isName;
    // Assigned agent's first name — shown next to the warehouse so a rep who's
    // only after "who owns this client?" sees it right in the results.
    const agentName = firstNameFromEmail((client.agentEmail || '').split(',')[0].trim());
    const meta = document.createElement('div');
    meta.className = 'search-result-meta';
    const addSepSpan = (className, text) => {
      const sep = document.createElement('span');
      sep.textContent = '·';
      sep.style.color = '#9ca3af';
      meta.appendChild(sep);
      const el = document.createElement('span');
      el.className = className;
      el.textContent = text;
      meta.appendChild(el);
    };
    if (isContactMatch) {
      const matchedSpan = document.createElement('span');
      matchedSpan.className = 'matched';
      matchedSpan.textContent = value;
      meta.appendChild(matchedSpan);
      const tag = document.createElement('span');
      tag.className = 'matched-tag';
      tag.textContent = field.contact === 1 ? 'primary' : `contact ${field.contact}`;
      meta.appendChild(tag);
      if (client.warehouse) addSepSpan('warehouse', client.warehouse);
      if (client.subWarehouse) addSepSpan('sub-warehouse', subLetter(client.subWarehouse));
      if (client.portal) addSepSpan('portal', shortPortal(client.portal));
      if (agentName) addSepSpan('agent', agentName);
    } else {
      const metaParts = [];
      if (client.contactEmail) metaParts.push(escapeHtml(client.contactEmail));
      else if (client.contactName) metaParts.push(escapeHtml(client.contactName));
      if (client.warehouse) metaParts.push(`<span class="warehouse">${escapeHtml(client.warehouse)}</span>`);
      if (client.subWarehouse) metaParts.push(`<span class="sub-warehouse">${escapeHtml(subLetter(client.subWarehouse))}</span>`);
      if (client.portal) metaParts.push(`<span class="portal">${escapeHtml(shortPortal(client.portal))}</span>`);
      if (agentName) metaParts.push(`<span class="agent">${escapeHtml(agentName)}</span>`);
      if (metaParts.length > 0) meta.innerHTML = metaParts.join(' · ');
    }
    if (meta.childNodes.length > 0 || meta.innerHTML) li.appendChild(meta);
    container.appendChild(li);
  });
  container.hidden = false;
}

// Trim the redundant "ShipBots" brand prefix so the AppDot / Portal value reads
// compactly in the meta line ("ShipBots Portal" → "Portal"; "AppDot"/"Both" stay).
function shortPortal(p) {
  return String(p || '').replace(/^shipbots\s+/i, '').trim();
}

// "Gardena-A" → "A" for the compact sub-warehouse chip in search results.
function subLetter(v) {
  const s = String(v || '').trim();
  const m = s.match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : s).toUpperCase();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

// ── Client detail view ─────────────────────────────────────────────────────
// Fetches /api/client/[id] and renders every populated field as a stack of
// collapsible sections. Mirrors the dashboard's client-info-tab in structure
// but read-only — editing routes to the dashboard via the Edit ↗ button.
const EXITED_GROUP_ID_DETAIL = 'group_mkq09z7j';

async function fetchClientFull(id) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/${encodeURIComponent(id)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    const err = new Error('Not signed in');
    err.code = 'unauthorized';
    throw err;
  }
  if (!res.ok) throw new Error(`fetch failed (${res.status})`);
  return res.json();
}

// Field definitions per section. Each entry is { key, label, type? }.
// type='link' means dd is rendered as <a href={value.url}>{value.text}</a>.
// type='email' / 'phone' render as mailto:/tel: links.
// type='multiline' preserves newlines.
// Section order + field grouping mirrors the Customer-Service app's client
// info tab (General Account Info · Contact Info · Receiving · Packing &
// Shipping Requirements · Returns Specifications · E-mail notifications ·
// Portal Login). Billing address + support agent + HubSpot fold into General
// Account Info, matching the CS layout; the extension renders them read-only.
const DETAIL_SECTIONS = [
  {
    id: 'general',
    title: 'General Account Info',
    fields: [
      { key: 'shipHeroName',         label: 'ShipHero name' },
      { key: 'shipHeroId',           label: 'ShipHero ID' },
      { key: 'paymentOnFile',        label: 'Payment on file' },
      { key: 'portalDropdown',       label: 'AppDot / Portal' },
      { key: 'productCategory',      label: 'Product category' },
      { key: 'productDescription',   label: 'Products', type: 'multiline' },
      { key: 'warehouseLocation',    label: 'Warehouse' },
      { key: 'subWarehouse',         label: 'Sub warehouse' },
      { key: 'manufacturingLocation',label: 'Mfg location' },
      { key: 'clientStatus',         label: 'Client status' },
      { key: 'timeAsClientDays',     label: 'Time as client (days)' },
      { key: 'interestInAdditionalServices', label: 'Interested in' },
      { key: 'umbrellaCompany',      label: 'Umbrella co.' },
      { key: 'pricingProposal',      label: 'Pricing proposal', type: 'link' },
      { key: 'legalEntity',          label: 'Legal entity' },
      { key: 'quickbooksName',       label: 'QuickBooks name' },
      { key: 'invoicingEmail',       label: 'Invoicing email', type: 'email' },
      { key: 'pickAndPack',          label: 'Pick & Pack' },
      { key: 'businessHQ',           label: 'Business HQ' },
      { key: 'billingStreet1',       label: 'Billing street 1' },
      { key: 'billingStreet2',       label: 'Billing street 2' },
      { key: 'billingCity',          label: 'Billing city' },
      { key: 'billingState',         label: 'Billing state' },
      { key: 'billingZip',           label: 'Billing zip' },
      { key: 'billingCountry',       label: 'Billing country' },
      { key: 'ein',                  label: 'EIN' },
      { key: 'dateDocusignSigned',   label: 'Date DocuSign signed' },
      { key: 'supportAgentEmail',    label: 'Support agent', type: 'email' },
      { key: 'hubspotDealLink',      label: 'HubSpot', type: 'rawUrl' },
    ],
  },
  {
    id: 'contacts',
    title: 'Contact Info',
    custom: 'renderContacts',
  },
  {
    id: 'receiving',
    title: 'Receiving',
    fields: [
      { key: 'initialInventoryDate',   label: 'Initial date' },
      { key: 'initialInventoryMethod', label: 'Method' },
      { key: 'initialInventoryQty',    label: 'Qty' },
      { key: 'itemsBarcoded',          label: 'Barcoded?' },
      { key: 'preStorageNeeds',        label: 'Pre-storage' },
      { key: 'initialInventoryStoringNeeds', label: 'Storing' },
      { key: 'notesOnInitialInventory',label: 'Notes',  type: 'multiline' },
      { key: 'notesForReceiving',      label: 'Recv notes', type: 'multiline' },
    ],
  },
  {
    id: 'packing',
    title: 'Packing & Shipping Requirements',
    fields: [
      { key: 'ecommercePlatforms',         label: 'Platforms' },
      { key: 'skuCount',                   label: 'SKU count' },
      { key: 'currentFulfillmentMethod',   label: 'Fulfillment' },
      { key: 'packaging',                  label: 'Packaging' },
      { key: 'orderInserts',               label: 'Inserts' },
      { key: 'orderInsertDetails',         label: 'Insert details', type: 'multiline' },
      { key: 'kitsOrBundles',              label: 'Kits/bundles' },
      { key: 'overnightDelivery',          label: 'Overnight' },
      { key: 'internationalFulfillment',   label: 'Intl' },
      { key: 'internationalShippingDDUDDP',label: 'DDU/DDP' },
      { key: 'amazonFBA',                  label: 'Amazon FBA' },
      { key: 'shippingMethod',             label: 'Ship method' },
      { key: 'tikTokShop',                 label: 'TikTok' },
      { key: 'lotCodeExpiration',          label: 'Lot/expiry' },
      { key: 'outsideLabels',              label: 'Outside lbl' },
      { key: 'wholesaleDetails',           label: 'Wholesale', type: 'multiline' },
      { key: 'outboundLTL',                label: 'LTL' },
      { key: 'estimatedStorage',           label: 'Est storage' },
      { key: 'shippingVolume',             label: 'Volume' },
      { key: 'additionalNotes',            label: 'Notes', type: 'multiline' },
      { key: 'additionalShippingNotes',    label: 'Ship notes', type: 'multiline' },
      { key: 'notesForPacking',            label: 'Pack notes', type: 'multiline' },
    ],
  },
  {
    id: 'returns',
    title: 'Returns Specifications',
    fields: [
      { key: 'returnsProcess',            label: 'Process' },
      { key: 'returnsIncompleteCondition',label: 'Incomplete' },
      { key: 'returnsDamagedCondition',   label: 'Damaged' },
      { key: 'returnsNewCondition',       label: 'New' },
      { key: 'returnsUsedCondition',      label: 'Used' },
      { key: 'notesForReturns',           label: 'Notes', type: 'multiline' },
    ],
  },
  {
    id: 'notifications',
    title: 'E-mail notifications',
    custom: 'renderNotifications',
  },
  {
    id: 'portal',
    title: 'Portal Login',
    fields: [
      { key: 'portalEmail',     label: 'Login email / username', type: 'email' },
      { key: 'portalLogin',     label: 'Username', copy: true },
      { key: 'portalPassword',  label: 'Password', copy: true },
    ],
  },
];

// Which ClientInfo keys the popup can PATCH directly. Value is the Monday
// column id and whether the field is multi-line (renders as textarea).
// Dropdown / color / date columns are intentionally omitted — they need a
// select/date UI that's out of scope for this pass; the dashboard's own
// panel still owns those. When the user asks for them here, add rows plus
// the corresponding editor.
const EDITABLE_KEYS = {
  // General
  legalEntity:          { columnId: 'text_mktp4fvk' },
  ein:                  { columnId: 'text_mkxxfg1b' },
  quickbooksName:       { columnId: 'text_mkx5b9b4' },
  shipHeroId:           { columnId: 'text_mktmf2yw' },
  shipHeroName:         { columnId: 'text_mkw9n26z' },
  productDescription:   { columnId: 'long_text_mktqtxm', multiline: true },
  businessHQ:           { columnId: 'text_mktx63am' },
  manufacturingLocation:{ columnId: 'text_mktxyg5p' },
  invoicingEmail:       { columnId: 'text_mktqjmmm' },
  interestInAdditionalServices: { columnId: 'text_mkw2y8q9', multiline: true },
  pickAndPack:          { columnId: 'text_mm1zw2vf' },
  // Billing
  billingStreet1: { columnId: 'text_mkx5vzht' },
  billingStreet2: { columnId: 'text_mkx5f9p9' },
  billingCity:    { columnId: 'text_mkx5z70k' },
  billingState:   { columnId: 'text_mkx5er1a' },
  billingZip:     { columnId: 'text_mkx5tjd7' },
  billingCountry: { columnId: 'text_mkx5kyv4' },
  // Receiving
  initialInventoryMethod:       { columnId: 'text_mktrm9jx' },
  initialInventoryQty:          { columnId: 'text_mktravgn' },
  initialInventoryStoringNeeds: { columnId: 'text_mkw2z2tp' },
  notesOnInitialInventory:      { columnId: 'long_text_mktqapsv', multiline: true },
  notesForReceiving:            { columnId: 'long_text_mkxecta8', multiline: true },
  // Packing & Shipping
  ecommercePlatforms:           { columnId: 'long_text_mktra0sm', multiline: true },
  skuCount:                     { columnId: 'text_mktqrstq' },
  orderInsertDetails:           { columnId: 'text_mktpj2v0', multiline: true },
  kitsOrBundles:                { columnId: 'text_mktp2938' },
  additionalInsuranceSignature: { columnId: 'text_mktrs0xa' },
  wholesaleDetails:             { columnId: 'text_mkw5t2ey', multiline: true },
  outboundLTL:                  { columnId: 'text_mkw5bdr2' },
  estimatedStorage:             { columnId: 'text_mkw4czc2' },
  shippingVolume:               { columnId: 'text_mktqa6sm' },
  additionalNotes:              { columnId: 'long_text_mktran3x', multiline: true },
  additionalShippingNotes:      { columnId: 'long_text_mkwy13zg', multiline: true },
  notesForPacking:              { columnId: 'long_text_mkxfv1hr', multiline: true },
  // Returns
  notesForReturns: { columnId: 'long_text_mkxeajq4', multiline: true },
  // Portal / Support
  portalLogin:    { columnId: 'text_mktxxfch' },
  portalPassword: { columnId: 'text_mm28cz4g' },
  portalEmail:    { columnId: 'text_mkwgke3w' },
};

async function patchClientField(clientId, columnId, value) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId, value }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

// Attach click-to-edit behavior to a rendered `dd` element. Swaps the
// value node with an input (or textarea for multiline) on click, saves
// on blur/Enter (Cmd+Enter for textareas), Escape cancels. Small status
// pip shows saving / saved / error.
function attachInlineEdit(dd, client, field, spec) {
  dd.classList.add('editable');
  dd.setAttribute('title', 'Click to edit');
  dd.addEventListener('click', e => {
    if (dd.classList.contains('is-editing')) return;
    // Ignore clicks on the anchor inside the dd — let those open normally
    // (mailto:/tel:/URL). Users still edit via a small pencil that we
    // insert after the anchor.
    if (e.target.closest('a') && !e.target.dataset.editTrigger) return;
    startEdit();
  });
  // For fields whose display is an anchor (email/phone/url), add a small
  // pencil affordance next to it that triggers edit mode without swallowing
  // the anchor's link behavior.
  const anchor = dd.querySelector('a');
  if (anchor) {
    const pencil = document.createElement('button');
    pencil.type = 'button';
    pencil.className = 'edit-trigger';
    pencil.dataset.editTrigger = '1';
    pencil.title = 'Edit';
    pencil.textContent = '✎';
    pencil.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      startEdit();
    });
    dd.appendChild(pencil);
  }

  function startEdit() {
    const original = String(client[field.key] ?? '');
    dd.classList.add('is-editing');
    const prevHTML = dd.innerHTML;
    dd.innerHTML = '';
    const input = document.createElement(spec.multiline ? 'textarea' : 'input');
    input.className = 'edit-input';
    if (!spec.multiline) input.type = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text';
    input.value = original;
    dd.appendChild(input);
    setTimeout(() => { input.focus(); input.select?.(); }, 0);

    let done = false;
    const finish = async commit => {
      if (done) return;
      done = true;
      const next = input.value.trim();
      if (!commit || next === original.trim()) {
        dd.innerHTML = prevHTML;
        dd.classList.remove('is-editing');
        return;
      }
      dd.innerHTML = '';
      const pip = document.createElement('span');
      pip.className = 'edit-status saving';
      pip.textContent = 'Saving…';
      dd.appendChild(pip);
      try {
        await patchClientField(client.id, spec.columnId, next);
        client[field.key] = next;
        dd.innerHTML = '';
        dd.appendChild(renderField(client, field));
        // Re-attach edit behavior so the field stays editable.
        attachInlineEdit(dd, client, field, spec);
        const okPip = document.createElement('span');
        okPip.className = 'edit-status ok';
        okPip.textContent = ' ✓';
        dd.appendChild(okPip);
        setTimeout(() => okPip.remove(), 1200);
      } catch (err) {
        console.error('[inline-edit] save failed', err);
        dd.innerHTML = prevHTML;
        dd.classList.remove('is-editing');
        const errPip = document.createElement('span');
        errPip.className = 'edit-status err';
        errPip.textContent = ' Save failed';
        dd.appendChild(errPip);
        setTimeout(() => errPip.remove(), 2000);
        attachInlineEdit(dd, client, field, spec);
      }
      dd.classList.remove('is-editing');
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      else if (e.key === 'Enter' && !spec.multiline) { e.preventDefault(); finish(true); }
      else if (e.key === 'Enter' && spec.multiline && (e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); }
    });
  }
}

function fieldHasValue(client, field) {
  const v = client[field.key];
  if (field.type === 'link') return !!(v && v.url);
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function renderField(client, field) {
  const v = client[field.key];
  if (field.type === 'link') {
    const a = document.createElement('a');
    a.href = v.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = v.text || v.url;
    return a;
  }
  if (field.type === 'rawUrl') {
    const a = document.createElement('a');
    a.href = v;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = v.replace(/^https?:\/\//, '');
    return a;
  }
  if (field.type === 'email' && v) {
    const a = document.createElement('a');
    a.href = `mailto:${v}`;
    a.textContent = v;
    return a;
  }
  if (field.type === 'phone' && v) {
    const a = document.createElement('a');
    a.href = `tel:${v.replace(/[^\d+]/g, '')}`;
    a.textContent = v;
    return a;
  }
  if (field.type === 'multiline') {
    const s = document.createElement('span');
    s.style.whiteSpace = 'pre-line';
    s.textContent = String(v);
    return s;
  }
  return document.createTextNode(String(v));
}

// Small inline "copy to clipboard" button placed right next to a value so it's
// obvious the value (email, phone, portal username/password) can be copied.
const COPY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>';
const CHECK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>';

function copyIconButton(text) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'detail-copy-btn';
  btn.title = 'Copy to clipboard';
  btn.setAttribute('aria-label', 'Copy to clipboard');
  btn.innerHTML = COPY_SVG;
  btn.addEventListener('click', async e => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(text ?? ''));
      btn.classList.add('copied');
      btn.innerHTML = CHECK_SVG;
      setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = COPY_SVG; }, 1200);
    } catch (err) {
      console.error('[copy] failed', err);
    }
  });
  return btn;
}

function buildSection(section, client) {
  const wrap = document.createElement('div');
  wrap.className = 'detail-section';

  // Header row = a collapse toggle (title + chevron) plus, for sections that
  // have editable fields, an "Edit" button. Read mode shows only completed
  // fields so the panel stays clean to scan; clicking Edit reveals the empty
  // editable fields (an "Add…" affordance) and turns on inline editing so reps
  // can fill gaps or fix values without leaving the popup.
  const header = document.createElement('div');
  header.className = 'detail-section-header';

  const toggle = document.createElement('button');
  toggle.className = 'detail-section-toggle';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  const title = document.createElement('span');
  title.className = 'detail-section-title';
  title.textContent = section.title;
  const chev = document.createElement('span');
  chev.className = 'detail-section-chev';
  chev.textContent = '›';
  toggle.appendChild(title);
  toggle.appendChild(chev);
  header.appendChild(toggle);

  const body = document.createElement('dl');
  body.className = 'detail-section-body';
  body.hidden = true;

  const isCustom = section.custom === 'renderContacts' || section.custom === 'renderNotifications';
  // Contacts are editable too (add / edit each contact's name, email, phone);
  // the notifications section stays read-only.
  const hasEditable = section.custom === 'renderContacts'
    ? true
    : (!isCustom && (section.fields || []).some(f => EDITABLE_KEYS[f.key]));
  let editing = false;

  function renderBody() {
    body.innerHTML = '';
    if (section.custom === 'renderContacts') { buildContactsBody(body, client, editing); return; }
    if (section.custom === 'renderNotifications') { buildNotificationsBody(body, client); return; }
    let any = false;
    for (const field of section.fields) {
      const editSpec = EDITABLE_KEYS[field.key];
      const hasValue = fieldHasValue(client, field);
      // Read mode: only completed fields. Edit mode: also reveal empty editable
      // fields so they can be filled in. Non-editable empties stay hidden.
      if (!hasValue && !(editing && editSpec)) continue;
      const dt = document.createElement('dt');
      dt.textContent = field.label;
      const dd = document.createElement('dd');
      if (hasValue) {
        dd.appendChild(renderField(client, field));
        // Emails, phones, and portal credentials get a one-click copy button.
        if (field.type === 'email' || field.type === 'phone' || field.copy) {
          dd.appendChild(copyIconButton(String(client[field.key] ?? '')));
        }
      } else {
        // Empty but editable → an "Add…" affordance that opens the editor.
        const add = document.createElement('span');
        add.className = 'edit-empty';
        add.textContent = 'Add…';
        dd.appendChild(add);
      }
      // Inline editing is gated behind Edit mode — read mode stays click-safe.
      if (editing && editSpec) attachInlineEdit(dd, client, field, editSpec);
      body.appendChild(dt);
      body.appendChild(dd);
      any = true;
    }
    if (!any) {
      const empty = document.createElement('p');
      empty.style.gridColumn = '1 / -1';
      empty.style.color = '#9ca3af';
      empty.style.fontStyle = 'italic';
      empty.style.fontSize = '11px';
      empty.style.margin = '0';
      empty.textContent = editing ? 'Nothing else to add.' : 'No data on file.';
      body.appendChild(empty);
    }
  }
  renderBody();

  // Edit toggle — only for sections with editable fields, and only visible once
  // the section is expanded (collapsed sections stay clean).
  let editBtn = null;
  if (hasEditable) {
    editBtn = document.createElement('button');
    editBtn.className = 'detail-section-edit';
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.title = 'Edit or add information in this section';
    editBtn.hidden = true;
    editBtn.addEventListener('click', e => {
      e.stopPropagation();
      editing = !editing;
      editBtn.textContent = editing ? 'Done' : 'Edit';
      editBtn.classList.toggle('is-active', editing);
      renderBody();
    });
    header.appendChild(editBtn);
  }

  toggle.addEventListener('click', () => {
    const nowExpanded = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', nowExpanded ? 'true' : 'false');
    body.hidden = !nowExpanded;
    if (editBtn) {
      editBtn.hidden = !nowExpanded;
      // Collapsing exits edit mode so the section reopens in its clean read view.
      if (!nowExpanded && editing) {
        editing = false;
        editBtn.textContent = 'Edit';
        editBtn.classList.remove('is-active');
        renderBody();
      }
    }
  });

  // Programmatic expand — the docs loader calls this to auto-open any section
  // that has attached documents, so its files/links are visible on load
  // (matches the old version where the doc-bearing section was open).
  wrap._expand = () => {
    if (toggle.getAttribute('aria-expanded') === 'true') return;
    toggle.setAttribute('aria-expanded', 'true');
    body.hidden = false;
    if (editBtn) editBtn.hidden = false;
  };

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

// The CS app's "E-mail notifications" section, read-only. Shows the Address
// Hold notification status (green pill when on) + its recipient emails, read
// from client.notificationColumns (keyed by Monday column id).
function buildNotificationsBody(body, client) {
  const cols = client.notificationColumns || {};
  const enabledRaw = String(cols['dropdown_mm54fvq7'] || '').trim();
  const emails = String(cols['text_mm54nq8g'] || '').trim();
  const on = enabledRaw !== '' && !/^(no|off|false|none|disabled)$/i.test(enabledRaw);

  const dt = document.createElement('dt');
  dt.textContent = 'Address Hold';
  const dd = document.createElement('dd');
  const badge = document.createElement('span');
  badge.style.cssText = 'display:inline-block;font-size:11px;font-weight:600;border-radius:9999px;padding:2px 8px;'
    + (on ? 'color:#1E7A3E;background:#E7F8ED' : 'color:#6b7280;background:#f3f4f6');
  badge.textContent = on ? (enabledRaw || 'On') : (enabledRaw || 'Off');
  dd.appendChild(badge);
  body.appendChild(dt);
  body.appendChild(dd);

  if (emails) {
    const dt2 = document.createElement('dt');
    dt2.textContent = 'Recipients';
    const dd2 = document.createElement('dd');
    dd2.textContent = emails;
    body.appendChild(dt2);
    body.appendChild(dd2);
  }

  if (!enabledRaw && !emails) {
    const empty = document.createElement('p');
    empty.style.cssText = 'grid-column:1/-1;color:#9ca3af;font-style:italic;font-size:11px;margin:0';
    empty.textContent = 'No notifications configured.';
    body.appendChild(empty);
  }
}

// Contact slots → Monday Clients-board column ids, for inline add/edit.
const CONTACT_EDIT_SLOTS = [
  { label: 'Primary Contact', fields: [
    { key: 'contactName',  label: 'Name',  type: 'text',  columnId: 'text_mktqq7h6' },
    { key: 'contactEmail', label: 'Email', type: 'email', columnId: 'text_mktq6sr5' },
    { key: 'contactPhone', label: 'Phone', type: 'phone', columnId: 'text_mktqabcm' },
  ] },
  { label: 'Contact 2', fields: [
    { key: 'contact2Name',  label: 'Name',  type: 'text',  columnId: 'text_mktr1evd' },
    { key: 'contact2Email', label: 'Email', type: 'email', columnId: 'text_mktr2xmm' },
    { key: 'contact2Phone', label: 'Phone', type: 'phone', columnId: 'text_mktr8kve' },
  ] },
  { label: 'Contact 3', fields: [
    { key: 'contact3Name',  label: 'Name',  type: 'text',  columnId: 'text_mktr4v7q' },
    { key: 'contact3Email', label: 'Email', type: 'email', columnId: 'text_mktrt74r' },
    { key: 'contact3Phone', label: 'Phone', type: 'phone', columnId: 'text_mktrw0tb' },
  ] },
];

function buildContactsBody(body, client, editing) {
  // Edit mode: show every contact slot as editable Name / Email / Phone rows
  // (empty ones get an "Add…" affordance) so reps can add or fix contacts.
  if (editing) {
    for (const slot of CONTACT_EDIT_SLOTS) {
      const hd = document.createElement('div');
      hd.className = 'contact-edit-slot';
      hd.textContent = slot.label;
      body.appendChild(hd);
      for (const f of slot.fields) {
        const dt = document.createElement('dt');
        dt.textContent = f.label;
        const dd = document.createElement('dd');
        const field = { key: f.key, label: f.label, type: f.type };
        const val = client[f.key];
        if (val && String(val).trim()) {
          dd.appendChild(renderField(client, field));
        } else {
          const add = document.createElement('span');
          add.className = 'edit-empty';
          add.textContent = 'Add…';
          dd.appendChild(add);
        }
        attachInlineEdit(dd, client, field, { columnId: f.columnId });
        body.appendChild(dt);
        body.appendChild(dd);
      }
    }
    return;
  }

  const slots = [
    { idx: 1, primary: true, name: client.contactName, email: client.contactEmail, phone: client.contactPhone, extra: client.contactLocation },
    { idx: 2, primary: false, name: client.contact2Name, email: client.contact2Email, phone: client.contact2Phone, access: client.contact2ShipHeroAccess },
    { idx: 3, primary: false, name: client.contact3Name, email: client.contact3Email, phone: client.contact3Phone, access: client.contact3ShipHeroAccess },
  ];
  let any = false;
  for (const slot of slots) {
    if (!slot.name && !slot.email && !slot.phone) continue;
    any = true;
    const card = document.createElement('div');
    card.className = `detail-contact${slot.primary ? ' primary' : ''}`;
    const labelRow = document.createElement('div');
    labelRow.className = `detail-contact-label${slot.primary ? ' primary' : ''}`;
    labelRow.textContent = slot.primary ? 'Primary Contact' : `Contact ${slot.idx}`;
    card.appendChild(labelRow);

    if (slot.name) {
      const nm = document.createElement('div');
      nm.className = 'detail-contact-name';
      nm.textContent = slot.name;
      card.appendChild(nm);
    }
    if (slot.email) {
      const ln = document.createElement('div');
      ln.className = 'detail-contact-line';
      const a = document.createElement('a');
      a.href = `mailto:${slot.email}`;
      a.textContent = slot.email;
      ln.appendChild(a);
      ln.appendChild(copyIconButton(slot.email));
      card.appendChild(ln);
    }
    if (slot.phone) {
      const ln = document.createElement('div');
      ln.className = 'detail-contact-line';
      const a = document.createElement('a');
      a.href = `tel:${slot.phone.replace(/[^\d+]/g, '')}`;
      a.textContent = slot.phone;
      ln.appendChild(a);
      ln.appendChild(copyIconButton(slot.phone));
      card.appendChild(ln);
    }
    if (slot.extra) {
      const ln = document.createElement('div');
      ln.className = 'detail-contact-line';
      ln.textContent = slot.extra;
      card.appendChild(ln);
    }
    if (slot.access) {
      const ln = document.createElement('div');
      ln.className = 'detail-contact-line';
      ln.style.color = '#6b7280';
      ln.style.fontStyle = 'italic';
      ln.textContent = `ShipHero access: ${slot.access}`;
      card.appendChild(ln);
    }
    body.appendChild(card);
  }
  if (!any) {
    const empty = document.createElement('p');
    empty.style.gridColumn = '1 / -1';
    empty.style.color = '#9ca3af';
    empty.style.fontStyle = 'italic';
    empty.style.fontSize = '11px';
    empty.style.margin = '0';
    empty.textContent = 'No contacts on file.';
    body.appendChild(empty);
  }
}

function renderClientDetail(client) {
  const nameEl = document.getElementById('detail-name');
  const metaEl = document.getElementById('detail-meta');
  const sectionsEl = document.getElementById('detail-sections');

  nameEl.textContent = client.name || '(unnamed)';

  // Meta line: primary email + warehouse + portal at a glance.
  const metaParts = [];
  if (client.contactEmail) metaParts.push(client.contactEmail);
  if (client.warehouseLocation) metaParts.push(client.warehouseLocation);
  metaEl.textContent = metaParts.join(' · ');

  // Pills row at the top of the scroll area.
  sectionsEl.innerHTML = '';
  const pills = document.createElement('div');
  pills.className = 'detail-pills';
  if (client.groupId === EXITED_GROUP_ID_DETAIL) {
    const p = document.createElement('span');
    p.className = 'detail-pill inactive';
    p.textContent = 'Inactive';
    pills.appendChild(p);
  }
  if (client.portalDropdown) {
    for (const tok of client.portalDropdown.split(',').map(s => s.trim()).filter(Boolean)) {
      const p = document.createElement('span');
      p.className = 'detail-pill';
      p.textContent = tok;
      pills.appendChild(p);
    }
  }
  if (client.warehouseLocation) {
    for (const w of client.warehouseLocation.split(',').map(s => s.trim()).filter(Boolean)) {
      const p = document.createElement('span');
      p.className = 'detail-pill warehouse';
      p.textContent = w;
      pills.appendChild(p);
    }
  }
  // Agent pill — always present so the rep can tell at a glance who owns
  // the client, and clickable so the rep can reassign without opening the
  // dashboard. The pill hosts an anchored popover with the list of agent
  // options fetched from /api/client/agents; clicking a row PATCHes the
  // Clients-board dropdown and updates the pill in place.
  const agentEmail = (client.supportAgentEmail || '').trim();
  const agentPill = document.createElement('button');
  agentPill.type = 'button';
  if (agentEmail) {
    agentPill.className = 'detail-pill agent detail-pill-clickable';
    // Show only the first name (capitalized). Full email stays in the
    // title tooltip so a rep can copy it if they need to.
    agentPill.textContent = `Agent: ${firstNameFromEmail(agentEmail)} ▾`;
    agentPill.title = `Support agent: ${agentEmail} — click to reassign`;
  } else {
    agentPill.className = 'detail-pill agent-none detail-pill-clickable';
    agentPill.textContent = 'No agent assigned ▾';
    agentPill.title = 'Click to assign a support agent';
  }
  agentPill.addEventListener('click', e => {
    e.stopPropagation();
    openAgentMenu(agentPill, client);
  });
  pills.appendChild(agentPill);
  if (pills.childElementCount > 0) sectionsEl.appendChild(pills);

  const fieldSections = [];
  for (const section of DETAIL_SECTIONS) {
    const wrap = buildSection(section, client);
    fieldSections.push({ section, wrap });
    sectionsEl.appendChild(wrap);
  }

  // Fetch files + links once, distribute them into their owning sections
  // (Receiving / Packing / Returns get their docs right under the section
  // header + a 📎 badge, always visible even while the fields stay collapsed),
  // and put only general / uncategorized docs in a top "Documents" section —
  // which is created ONLY if such docs exist, so there's no empty flash.
  // DocuSign never appears here — it lives on the onboarding board's files
  // column, which none of these endpoints read.
  const firstSectionWrap = fieldSections.length ? fieldSections[0].wrap : null;
  void loadClientDocs(sectionsEl, firstSectionWrap, client.id, fieldSections);
}

// Field-section ids from DETAIL_SECTIONS that own a doc category.
// Sections without one (contacts, portal, etc.) never get a docs list.
const SECTION_DOC_CATEGORIES = new Set(['receiving', 'packing', 'returns']);

// Stamp a small "📎 N" pill inside a section's header so the count is
// visible even when the section is collapsed. Called from the section-
// files loader once counts are known. Idempotent — replaces an existing
// badge if the section is re-stamped.
function stampAttachmentBadge(sectionWrap, count) {
  const header = sectionWrap.querySelector('.detail-section-header');
  if (!header) return;
  const existing = header.querySelector('.detail-attach-badge');
  if (existing) existing.remove();
  const badge = document.createElement('span');
  badge.className = 'detail-attach-badge';
  badge.title = `${count} attached document${count === 1 ? '' : 's'}`;
  badge.textContent = `📎 ${count}`;
  // Insert before the chevron so title + badge sit together. The chevron lives
  // inside the .detail-section-toggle button (a grandchild of the header), so we
  // insert relative to the chevron itself (chev.before) — NOT header.insertBefore,
  // which would throw NotFoundError since chev isn't a direct child of header.
  const chev = header.querySelector('.detail-section-chev');
  if (chev && typeof chev.before === 'function') chev.before(badge);
  else header.appendChild(badge);
}

// ── Client documents ────────────────────────────────────────────────
// Read-only mirror of the dashboard's docs. Files (Monday file
// columns) and links (docs long_text column) are fetched together and
// distributed: section-owned docs render inside their own section
// (Receiving / Packing / Returns) with a 📎 header badge; general /
// uncategorized docs render in the top "Documents" section, which
// hides itself when empty. Storage-unconfigured / auth errors hide
// everything silently — the popup never nags about backend state.

// Build the top "Documents" section, already populated with the general /
// uncategorized docs. Only called when there ARE such docs, so it never shows
// an empty "Loading…" placeholder that flashes then vanishes. Expanded by
// default since it only appears when there's something to show.
function buildDocumentsSection(items, clientId) {
  const wrap = document.createElement('div');
  wrap.className = 'detail-section';
  const header = document.createElement('button');
  header.className = 'detail-section-header';
  header.type = 'button';
  header.setAttribute('aria-expanded', 'true');
  const title = document.createElement('span');
  title.className = 'detail-section-title';
  title.textContent = `Documents (${items.length})`;
  const chev = document.createElement('span');
  chev.className = 'detail-section-chev';
  chev.textContent = '›';
  header.appendChild(title);
  header.appendChild(chev);

  const body = document.createElement('div');
  body.className = 'detail-section-body detail-docs-body';
  body.hidden = false;
  body.appendChild(renderDocsList(items, clientId));

  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    body.hidden = expanded;
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

// Compact doc list (📄 files / 🔗 links). Whole row is clickable:
//   - links open their URL directly in a new tab;
//   - files deep-link into the client's EXPANDED dashboard view with
//     &previewAsset=<assetId>, which auto-opens the preview modal
//     (with its Download button) as soon as the dashboard lands.
function renderDocsList(items, clientBoardItemId) {
  const list = document.createElement('ul');
  list.className = 'detail-docs-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'detail-docs-item detail-docs-item-clickable';

    const isLink = item.kind === 'link';
    const activate = () => {
      if (isLink) {
        if (item.url) openExternal(item.url);
      } else if (clientBoardItemId && item.assetId) {
        void openPath(
          `/customer-service?clientId=${encodeURIComponent(clientBoardItemId)}` +
          `&expanded=1&previewAsset=${encodeURIComponent(item.assetId)}`,
        );
      } else if (item.url) {
        // File without an asset id (shouldn't happen) — raw URL beats
        // a dead click.
        openExternal(item.url);
      }
    };
    li.addEventListener('click', activate);
    li.title = isLink
      ? (item.url || item.name || '')
      : 'Open the dashboard preview for this document';

    const glyph = document.createElement('span');
    glyph.className = 'detail-docs-glyph';
    glyph.textContent = isLink ? '🔗' : '📄';
    li.appendChild(glyph);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'detail-docs-name';
    nameSpan.textContent = item.name || 'Untitled';
    li.appendChild(nameSpan);

    const action = document.createElement('span');
    action.className = 'detail-docs-open';
    action.textContent = isLink ? 'Open ↗' : 'Preview ↗';
    li.appendChild(action);

    list.appendChild(li);
  }
  return list;
}

async function loadClientDocs(sectionsEl, beforeNode, clientBoardItemId, fieldSections) {
  if (!clientBoardItemId || !sectionsEl) return;
  const base = await getBaseUrl();
  const enc = encodeURIComponent(clientBoardItemId);
  // Both endpoints soft-fail to [] — one failing (or a redirect/network error)
  // must never throw out of the loader or hide the other's docs.
  const safeJson = p => p
    .then(r => (r && r.ok ? r.json() : []))
    .then(d => (Array.isArray(d) ? d : []))
    .catch(() => []);
  const [files, links] = await Promise.all([
    safeJson(fetch(`${base}/api/client/${enc}/section-files/all`, { credentials: 'include' })),
    safeJson(fetch(`${base}/api/documents/${enc}`, { credentials: 'include' })),
  ]);

  // Bucket by category. Files default to 'documents'; links count as section
  // docs only when they carry a known section category.
  const byCat = { documents: [], receiving: [], packing: [], returns: [] };
  for (const f of files) {
    const cat = SECTION_DOC_CATEGORIES.has(f?.category) ? f.category : 'documents';
    byCat[cat].push({ name: f.name, url: f.url, kind: 'file', assetId: f.assetId });
  }
  for (const l of links) {
    const cat = SECTION_DOC_CATEGORIES.has(l?.category) ? l.category : 'documents';
    byCat[cat].push({ name: l.name, url: l.url, kind: 'link' });
  }

  // Per-section docs render right under the section header. header.after() is
  // used (not insertBefore against a queried body) so a stale/mismatched
  // reference node can't throw a NotFoundError. Each section is isolated so one
  // failure can't abort the rest.
  if (Array.isArray(fieldSections)) {
    for (const { section, wrap: sectionWrap } of fieldSections) {
      try {
        const items = SECTION_DOC_CATEGORIES.has(section.id) ? byCat[section.id] : [];
        if (!items.length) continue;
        stampAttachmentBadge(sectionWrap, items.length);
        const holder = document.createElement('div');
        holder.className = 'detail-docs-inline';
        holder.appendChild(renderDocsList(items, clientBoardItemId));
        const header = sectionWrap.querySelector('.detail-section-header');
        if (header && typeof header.after === 'function') header.after(holder);
        else sectionWrap.appendChild(holder);
        // Docs sit under the header (visible even when collapsed), so DON'T
        // auto-expand — sections stay collapsed until the user opens them.
      } catch (e) {
        console.error('[client-docs] inject failed', section && section.id, e && e.name, e && e.message);
      }
    }
  }

  // Top "Documents" section — general / uncategorized docs only.
  if (byCat.documents.length) {
    try {
      const topWrap = buildDocumentsSection(byCat.documents, clientBoardItemId);
      if (beforeNode && beforeNode.parentNode === sectionsEl) sectionsEl.insertBefore(topWrap, beforeNode);
      else sectionsEl.appendChild(topWrap);
    } catch (e) {
      console.error('[client-docs] top-docs failed', e && e.name, e && e.message);
    }
  }
}

// ── Agent-reassign popover ────────────────────────────────────────────
// Fetches the same agent list the dashboard uses. Cached per popup
// session so re-opening the menu doesn't refetch. Missing "Unassign"
// row is intentional — matches how the dashboard's AgentAssignButton
// exposes only positive assignments; if reps ask for unassign later,
// wire it here + a PATCH with an empty value.
let agentListCache = null;
async function fetchAgentList() {
  if (agentListCache) return agentListCache;
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/agents`, { credentials: 'include' });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  const data = await res.json();
  agentListCache = Array.isArray(data) ? data : (Array.isArray(data?.agents) ? data.agents : []);
  return agentListCache;
}

async function assignAgent(clientId, email) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId: 'dropdown_mkxx7xv', value: email, valueType: 'dropdown' }),
  });
  if (!res.ok) throw new Error(`assign ${res.status}`);
}

function closeAgentMenu() {
  const existing = document.getElementById('detail-agent-menu');
  if (existing) existing.remove();
}

function openAgentMenu(anchor, client) {
  closeAgentMenu();

  const menu = document.createElement('div');
  menu.id = 'detail-agent-menu';
  menu.className = 'detail-agent-menu';

  const loading = document.createElement('div');
  loading.className = 'detail-agent-menu-loading';
  loading.textContent = 'Loading agents…';
  menu.appendChild(loading);

  // Position below the anchor pill. Anchor lives in .detail-pills which
  // sits inside the scrollable sections column; we position relative to
  // the viewport so scrolling doesn't drag the menu off-screen.
  const rect = anchor.getBoundingClientRect();
  menu.style.top  = `${rect.bottom + 4}px`;
  menu.style.left = `${rect.left}px`;
  document.body.appendChild(menu);

  // Outside click / Escape closes the menu.
  const onOutside = e => {
    if (!menu.contains(e.target) && e.target !== anchor) closeAgentMenu();
  };
  const onKey = e => { if (e.key === 'Escape') closeAgentMenu(); };
  setTimeout(() => document.addEventListener('mousedown', onOutside), 0);
  document.addEventListener('keydown', onKey);
  const cleanup = new MutationObserver(() => {
    if (!document.body.contains(menu)) {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true });

  fetchAgentList()
    .then(agents => {
      loading.remove();
      if (!agents.length) {
        const empty = document.createElement('div');
        empty.className = 'detail-agent-menu-empty';
        empty.textContent = 'No agents available';
        menu.appendChild(empty);
        return;
      }
      const currentEmail = (client.supportAgentEmail || '').trim().toLowerCase();
      for (const email of agents) {
        const label = firstNameFromEmail(email);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'detail-agent-menu-item';
        if (email.toLowerCase() === currentEmail) row.classList.add('is-current');
        row.textContent = label;
        row.title = email; // full email lives in the hover tooltip
        row.addEventListener('click', async () => {
          if (!activeClientId) return closeAgentMenu();
          row.disabled = true;
          row.textContent = `${label} — saving…`;
          try {
            await assignAgent(activeClientId, email);
            client.supportAgentEmail = email;
            // Re-render the pills row so the pill reflects the new value.
            const btn = document.querySelector('.detail-pills .agent, .detail-pills .agent-none');
            if (btn) {
              btn.classList.remove('agent-none');
              btn.classList.add('agent');
              btn.textContent = `Agent: ${label} ▾`;
              btn.title = `Support agent: ${email} — click to reassign`;
            }
            closeAgentMenu();
          } catch (err) {
            console.error('[agent-menu] assign failed', err);
            row.textContent = `${label} — failed`;
            row.disabled = false;
          }
        });
        menu.appendChild(row);
      }
    })
    .catch(err => {
      console.error('[agent-menu] fetch failed', err);
      loading.textContent = err.message?.includes('401') ? 'Sign in first' : 'Failed to load agents';
    });
}

// Sticky notes for the active client. Same shape as the dashboard's
// shared storage; rendered read-only here (editing routes through Edit ↗
// in the detail header).
async function fetchClientStickyNotes(id) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/${encodeURIComponent(id)}/sticky-notes`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    const err = new Error('Not signed in');
    err.code = 'unauthorized';
    throw err;
  }
  if (res.status === 503) {
    const err = new Error('Setup required');
    err.code = 'unconfigured';
    throw err;
  }
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  const data = await res.json();
  const arr = Array.isArray(data?.notes) ? data.notes : [];
  // Drop expired notes — same rule the dashboard applies on the way in.
  const now = Date.now();
  return arr.filter(n => {
    if (!n || typeof n.id !== 'string') return false;
    if (n.expiresAt && new Date(n.expiresAt).getTime() <= now) return false;
    return true;
  });
}

// Append one sticky note for this client. The dashboard stamps the author
// from the signed-in session and generates the id/date server-side, so we
// only send the text (+ optional color).
async function addStickyNote(id, text, color) {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/client/${encodeURIComponent(id)}/sticky-notes`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ text, color: color || 'yellow' }),
  });
  if (res.status === 401) {
    const err = new Error('Not signed in');
    err.code = 'unauthorized';
    throw err;
  }
  if (res.status === 503) {
    const err = new Error('Setup required');
    err.code = 'unconfigured';
    throw err;
  }
  if (!res.ok) throw new Error(`add failed (${res.status})`);
  return res.json();
}

function noteShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Author label on a note — the full first name from the @shipbots.com email
// ("andres@shipbots.com" → "Andres"), matching the dashboard sticky notes and
// the agent pill, so it's clear at a glance who wrote it.
function noteAuthorName(email) {
  return firstNameFromEmail(email);
}

function renderClientStickyNotes(notes) {
  const list = document.getElementById('detail-notes-list');
  const statusEl = document.getElementById('detail-notes-status');
  list.innerHTML = '';
  statusEl.classList.remove('error');

  if (notes.length === 0) {
    statusEl.textContent = '';
    const empty = document.createElement('div');
    empty.className = 'detail-notes-empty';
    empty.textContent = 'No sticky notes for this client yet.';
    list.appendChild(empty);
    return;
  }

  statusEl.textContent = `${notes.length} note${notes.length === 1 ? '' : 's'}`;

  for (const note of notes) {
    const card = document.createElement('div');
    const color = note.color && /^[a-z]+$/i.test(note.color) ? `color-${note.color}` : 'color-yellow';
    card.className = `note-card ${color}`;

    const date = noteShortDate(note.createdAt);
    const author = noteAuthorName(note.authorEmail);
    if (date || author) {
      const meta = document.createElement('div');
      meta.className = 'note-card-meta';
      if (date) {
        const s = document.createElement('span');
        s.textContent = date;
        meta.appendChild(s);
      }
      if (date && author) {
        const sep = document.createElement('span');
        sep.textContent = '·';
        meta.appendChild(sep);
      }
      if (author) {
        const s = document.createElement('span');
        s.textContent = author;
        meta.appendChild(s);
      }
      card.appendChild(meta);
    }

    const body = document.createElement('div');
    body.textContent = note.text || '(empty)';
    card.appendChild(body);
    list.appendChild(card);
  }
}

function showStickyNotesStatus(message, isError) {
  const list = document.getElementById('detail-notes-list');
  const statusEl = document.getElementById('detail-notes-status');
  list.innerHTML = '';
  statusEl.textContent = message;
  statusEl.classList.toggle('error', !!isError);
}

async function loadStickyNotesPane(clientId) {
  showStickyNotesStatus('Loading…', false);
  try {
    const notes = await fetchClientStickyNotes(clientId);
    renderClientStickyNotes(notes);
  } catch (err) {
    if (err.code === 'unconfigured') {
      showStickyNotesStatus('Setup required', true);
    } else if (err.code === 'unauthorized') {
      showStickyNotesStatus('Sign in to the dashboard first', true);
    } else {
      showStickyNotesStatus('Failed to load notes', true);
    }
  }
}

// ── Related projects (below the sticky notes) ───────────────────────────────
// The dashboard's /api/projects returns every project; we filter client-side
// to this client's ACTIVE ones (status.kind !== 'completed'). If the projects
// database isn't provisioned yet the API returns { configured:false,
// projects:[] } and the pane just shows the empty state — the "+ New"
// deep-link still works.
async function fetchAllProjects() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/projects`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    const err = new Error('Not signed in');
    err.code = 'unauthorized';
    throw err;
  }
  if (!res.ok) throw new Error(`projects failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects : [];
}

// Active projects linked to this client — matched by board-item id when we
// have it, else by (case-insensitive) client name, mirroring the dashboard's
// ClientProjectsBox.
function activeProjectsForClient(projects, clientId, clientName) {
  const name = String(clientName ?? '').trim().toLowerCase();
  return projects.filter(p => {
    const matches =
      (clientId && p.clientBoardItemId === clientId) ||
      (name && String(p.clientName ?? '').trim().toLowerCase() === name);
    const completed = p.status && p.status.kind === 'completed';
    return matches && !completed;
  });
}

function showProjectsStatus(message) {
  const list = document.getElementById('detail-projects-list');
  if (!list) return;
  list.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'detail-projects-empty';
  el.textContent = message;
  list.appendChild(el);
}

function renderClientProjects(projects, clientId, clientName) {
  const list = document.getElementById('detail-projects-list');
  if (!list) return;
  list.innerHTML = '';

  const mine = activeProjectsForClient(projects, clientId, clientName);
  if (mine.length === 0) {
    showProjectsStatus('No active projects for this client.');
    return;
  }

  for (const p of mine) {
    const card = document.createElement('div');
    card.className = 'project-card';

    const nameEl = document.createElement('div');
    nameEl.className = 'project-card-name';
    nameEl.textContent = p.name || '(untitled project)';
    card.appendChild(nameEl);

    const meta = document.createElement('div');
    meta.className = 'project-card-meta';

    const owner = document.createElement('span');
    owner.className = 'project-card-owner';
    owner.textContent = firstNameFromEmail(p.ownerEmail) || 'Unassigned';
    meta.appendChild(owner);

    if (p.status && p.status.label) {
      const status = document.createElement('span');
      status.className = 'project-card-status';
      status.textContent = p.status.label;
      const color = /^#[0-9a-f]{6}$/i.test(p.status.color || '') ? p.status.color : '#94a3b8';
      status.style.color = color;
      status.style.borderColor = `${color}66`;
      status.style.background = `${color}1a`;
      meta.appendChild(status);
    }

    card.appendChild(meta);
    list.appendChild(card);
  }
}

async function loadClientProjects(clientId, clientName) {
  showProjectsStatus('Loading…');
  try {
    const projects = await fetchAllProjects();
    renderClientProjects(projects, clientId, clientName);
  } catch (err) {
    if (err.code === 'unauthorized') {
      showProjectsStatus('Sign in to the dashboard first');
    } else {
      showProjectsStatus('Failed to load projects');
    }
  }
}

// ── Projects view (full-popup list of every active project) ─────────────────
// Opened from the "Projects" quick-launch button. Shows one card per active
// project (status, client, responsible) with a "View more details" button that
// deep-links into the dashboard's Projects view with that project open.
function backFromProjects() {
  document.getElementById('projects-view').hidden = true;
  document.getElementById('search-view').hidden = false;
  document.body.classList.remove('projects-open');
  const input = document.getElementById('search-input');
  if (input) input.focus();
}

// The signed-in user's email, so the projects they're responsible for can be
// surfaced first. Read once from the NextAuth session endpoint (the same
// session cookie every other request rides on) and cached for the popup's life.
let currentUserEmail = null;
let currentUserEmailFetched = false;

async function fetchCurrentUserEmail() {
  if (currentUserEmailFetched) return currentUserEmail;
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/auth/session`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      currentUserEmail = data && data.user && data.user.email
        ? String(data.user.email).toLowerCase()
        : null;
    }
  } catch {
    currentUserEmail = null;
  }
  currentUserEmailFetched = true;
  return currentUserEmail;
}

function appendProjectsGroupLabel(list, text) {
  const el = document.createElement('div');
  el.className = 'pv-group-label';
  el.textContent = text;
  list.appendChild(el);
}

function showProjectsViewStatus(message, isError) {
  const statusEl = document.getElementById('projects-view-status');
  if (!statusEl) return;
  statusEl.hidden = !message;
  statusEl.textContent = message || '';
  statusEl.classList.toggle('error', !!isError);
}

// One consolidated single-line row per project: name (flexes + truncates),
// status pill, client, responsible, and an "Open" button pinned to the right.
function projectRowEl(p) {
  const row = document.createElement('div');
  row.className = 'pv-row';
  const openProject = () => {
    void openPath(`/customer-service?view=projects&projectId=${encodeURIComponent(p.id)}`);
  };
  // The whole row is a click target with a blue hover highlight; the explicit
  // "Open" button is the same action, just more discoverable.
  row.title = 'Open this project in the dashboard';
  row.addEventListener('click', openProject);

  const name = document.createElement('span');
  name.className = 'pv-row-name';
  name.textContent = p.name || '(untitled project)';
  name.title = p.name || '';
  row.appendChild(name);

  if (p.status && p.status.label) {
    const status = document.createElement('span');
    status.className = 'pv-row-status';
    status.textContent = p.status.label;
    const color = /^#[0-9a-f]{6}$/i.test(p.status.color || '') ? p.status.color : '#94a3b8';
    status.style.color = color;
    status.style.borderColor = `${color}66`;
    status.style.background = `${color}1a`;
    row.appendChild(status);
  }

  const client = document.createElement('span');
  client.className = 'pv-row-client';
  client.textContent = p.clientName || '—';
  client.title = p.clientName || '';
  row.appendChild(client);

  const owner = document.createElement('span');
  owner.className = 'pv-row-owner';
  owner.textContent = firstNameFromEmail(p.ownerEmail) || 'Unassigned';
  row.appendChild(owner);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pv-row-btn';
  btn.textContent = 'Open';
  btn.addEventListener('click', e => { e.stopPropagation(); openProject(); });
  row.appendChild(btn);

  return row;
}

function renderAllActiveProjects(projects, myEmail) {
  const list = document.getElementById('projects-view-list');
  const metaEl = document.getElementById('projects-view-meta');
  if (!list) return;
  list.innerHTML = '';

  const active = (Array.isArray(projects) ? projects : []).filter(
    p => !(p.status && p.status.kind === 'completed'),
  );
  if (metaEl) metaEl.textContent = active.length ? `${active.length} active` : '';

  if (active.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'projects-view-empty';
    empty.textContent = 'No active projects right now.';
    list.appendChild(empty);
    return;
  }

  // Projects the signed-in user is responsible for (the owner) come first.
  const me = String(myEmail || '').toLowerCase();
  const mine = me ? active.filter(p => String(p.ownerEmail || '').toLowerCase() === me) : [];
  const others = active.filter(p => !mine.includes(p));

  if (mine.length) {
    if (others.length) appendProjectsGroupLabel(list, 'My projects');
    mine.forEach(p => list.appendChild(projectRowEl(p)));
  }
  if (others.length) {
    if (mine.length) appendProjectsGroupLabel(list, 'Other projects');
    others.forEach(p => list.appendChild(projectRowEl(p)));
  }
}

async function showProjectsView() {
  const searchView = document.getElementById('search-view');
  const detailView = document.getElementById('client-detail');
  const projectsView = document.getElementById('projects-view');
  if (detailView) detailView.hidden = true;
  if (searchView) searchView.hidden = true;
  projectsView.hidden = false;

  // Focus the Back button before widening — same reasoning as showClientDetail:
  // avoids the whole-popup focus ring and lets the width transition animate.
  const projectsBackBtn = document.getElementById('projects-back');
  (projectsBackBtn || projectsView).focus({ preventScroll: true });

  // Widen the popup so each project fits comfortably on a single line.
  document.body.classList.remove('detail-open');
  document.body.classList.add('projects-open');

  const list = document.getElementById('projects-view-list');

  // 1. Instant paint from the cached payload (previous session or prewarm).
  const cached = await readViewCache(PROJECTS_CACHE_KEY);
  let painted = false;
  if (cached && cached.data && Array.isArray(cached.data.projects)) {
    renderAllActiveProjects(cached.data.projects, cached.data.email);
    showProjectsViewStatus('', false);
    setViewUpdating('projects', true);
    painted = true;
  } else {
    if (list) list.innerHTML = '';
    showProjectsViewStatus('Loading projects…', false);
  }

  // 2. Background refresh (shared with the launch prewarm — no double fetch).
  try {
    const { projects, email } = await refreshProjectsData();
    setViewUpdating('projects', false);
    renderAllActiveProjects(projects, email);
    showProjectsViewStatus('', false);
  } catch (err) {
    setViewUpdating('projects', false);
    if (!painted) {
      if (err.code === 'unauthorized') {
        showProjectsViewStatus('Sign in to the dashboard first, then reopen this popup.', true);
      } else {
        showProjectsViewStatus(`Couldn't load projects (${err.message || 'network error'}).`, true);
      }
    }
  }
}

// ── Shared date helpers (tasks + calendar) ──────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYMDLocal(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}
function isValidYMD(s) { return !!parseYMDLocal(s); }
function shortMonthDay(ymd) {
  const d = parseYMDLocal(ymd);
  return d ? `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}` : (ymd || '');
}
function ymdPlusDays(ymd, n) {
  const d = parseYMDLocal(ymd);
  if (!d) return ymd;
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
// "2026-07-24" → "Today · Jul 24" / "Tomorrow · Jul 25" / "Thu · Jul 24"
function formatAgendaHeader(ymd) {
  const d = parseYMDLocal(ymd);
  if (!d) return ymd || '';
  const t = todayYMD();
  const label = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  if (ymd === t) return `Today · ${label}`;
  if (ymd === ymdPlusDays(t, 1)) return `Tomorrow · ${label}`;
  return `${WEEKDAYS_SHORT[d.getDay()]} · ${label}`;
}
// "14:30:00" → "2:30 PM"
function formatTimeHM(hms) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hms || ''));
  if (!m) return '';
  let h = Number(m[1]);
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${ampm}`;
}

// ── My Tasks view (Monday subitems assigned to the signed-in user) ───────────
// Opened from the "Tasks" quick-launch button. Pulls every subitem via
// /api/subitems, keeps the ones assigned to me (assigneeEmails / assignee),
// and shows them one per line. Defaults to OUTSTANDING; a toggle flips to DONE.
// "Done ✓" PATCHes the subitem's status to the board's Done option in place.
let tasksBoardInfo = null;             // { boardId, statusColumnId, statusOptions, … }
let myTasksCache = null;               // SubItem[] assigned to me (open + done)
let tasksFilterMode = 'open';          // 'open' | 'done'
const locallyCompletedTaskIds = new Set();

const isDoneTaskStatus = s => /(done|complete|finished)/i.test(String(s || ''));

async function fetchAllSubitems() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/subitems`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) { const e = new Error('Not signed in'); e.code = 'unauthorized'; throw e; }
  if (!res.ok) throw new Error(`tasks failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchSubitemBoardInfo() {
  if (tasksBoardInfo) return tasksBoardInfo;
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/subitems/board-info`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) tasksBoardInfo = await res.json();
  } catch { /* leave null → mark-complete stays disabled */ }
  return tasksBoardInfo;
}

function backFromTasks() {
  document.getElementById('tasks-view').hidden = true;
  document.getElementById('search-view').hidden = false;
  document.body.classList.remove('projects-open');
  const input = document.getElementById('search-input');
  if (input) input.focus();
}

function showTasksViewStatus(message, isError) {
  const el = document.getElementById('tasks-view-status');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.classList.toggle('error', !!isError);
}

function tasksForMode() {
  const all = Array.isArray(myTasksCache) ? myTasksCache : [];
  if (tasksFilterMode === 'done') {
    return all.filter(t => isDoneTaskStatus(t.status) || locallyCompletedTaskIds.has(t.id));
  }
  return all.filter(t => !isDoneTaskStatus(t.status) && !locallyCompletedTaskIds.has(t.id));
}

// Single-line task row: name (flexes), status pill, client, due date, and — in
// the outstanding view — a "Done ✓" complete button. The row opens the client.
function taskRowEl(t) {
  const row = document.createElement('div');
  row.className = 'pv-row';
  row.title = 'Open this client';
  row.addEventListener('click', () => { void openTaskClient(t); });

  const name = document.createElement('span');
  name.className = 'pv-row-name';
  name.textContent = t.name || '(untitled task)';
  name.title = t.name || '';
  row.appendChild(name);

  if (t.status) {
    const status = document.createElement('span');
    status.className = 'pv-row-status';
    status.textContent = t.status;
    const color = isDoneTaskStatus(t.status) ? '#00c875' : '#fdab3d';
    status.style.color = color;
    status.style.borderColor = `${color}66`;
    status.style.background = `${color}1a`;
    row.appendChild(status);
  }

  const client = document.createElement('span');
  client.className = 'pv-row-client';
  client.textContent = t.parentItemName || '—';
  client.title = t.parentItemName || '';
  row.appendChild(client);

  if (t.dueDate) {
    const due = document.createElement('span');
    due.className = 'tv-row-due';
    due.textContent = shortMonthDay(t.dueDate);
    if (tasksFilterMode === 'open' && t.dueDate < todayYMD()) due.classList.add('overdue');
    row.appendChild(due);
  }

  // Complete button — only in the outstanding view, and only when we know the
  // board's status column (so the PATCH has a target).
  if (tasksFilterMode === 'open' && tasksBoardInfo && tasksBoardInfo.statusColumnId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pv-row-btn tv-done-btn';
    btn.textContent = 'Done ✓';
    btn.title = 'Mark this task done';
    btn.addEventListener('click', e => { e.stopPropagation(); void markTaskComplete(t, btn); });
    row.appendChild(btn);
  }

  return row;
}

async function markTaskComplete(t, btn) {
  if (!tasksBoardInfo || !tasksBoardInfo.statusColumnId) return;
  const doneOption = (tasksBoardInfo.statusOptions || []).find(isDoneTaskStatus) || 'Done';
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/subitems/${encodeURIComponent(t.id)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        boardId: tasksBoardInfo.boardId,
        status: doneOption,
        statusColumnId: tasksBoardInfo.statusColumnId,
      }),
    });
    if (!res.ok) throw new Error(String(res.status));
    // Reflect locally so it drops out of the outstanding list immediately.
    t.status = doneOption;
    locallyCompletedTaskIds.add(t.id);
    renderMyTasks();
  } catch (err) {
    console.error('[tasks] mark complete failed', err);
    btn.disabled = false;
    btn.textContent = prev;
    btn.classList.add('tv-done-err');
    setTimeout(() => btn.classList.remove('tv-done-err'), 1500);
  }
}

function renderMyTasks() {
  const list = document.getElementById('tasks-view-list');
  const metaEl = document.getElementById('tasks-view-meta');
  if (!list) return;
  list.innerHTML = '';

  if (metaEl) {
    const all = Array.isArray(myTasksCache) ? myTasksCache : [];
    const openN = all.filter(t => !isDoneTaskStatus(t.status) && !locallyCompletedTaskIds.has(t.id)).length;
    metaEl.textContent = `${openN} outstanding`;
  }

  const rows = tasksForMode().slice().sort((a, b) => {
    const da = a.dueDate || '9999-99-99';
    const db = b.dueDate || '9999-99-99';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'projects-view-empty';
    empty.textContent = tasksFilterMode === 'done'
      ? 'No completed tasks assigned to you.'
      : 'No outstanding tasks assigned to you. 🎉';
    list.appendChild(empty);
    return;
  }
  rows.forEach(t => list.appendChild(taskRowEl(t)));
}

function setTasksFilterMode(mode) {
  tasksFilterMode = mode === 'done' ? 'done' : 'open';
  const openTab = document.getElementById('tasks-tab-open');
  const doneTab = document.getElementById('tasks-tab-done');
  if (openTab) openTab.classList.toggle('is-active', tasksFilterMode === 'open');
  if (doneTab) doneTab.classList.toggle('is-active', tasksFilterMode === 'done');
  renderMyTasks();
}

// ── View data cache + background refresh (Tasks + Calendar) ─────────────────
// Both views pull from Monday via the Vercel API, which can take several
// seconds. Stash the last successful payload in chrome.storage.local and paint
// it instantly on open, then refresh in the background (stale-while-revalidate)
// — same deal as the client index. Prewarmed on popup launch so the first click
// is instant. In-flight promises are shared so the launch prewarm and a click
// never double-fetch.
const TASKS_CACHE_KEY = 'tasksCacheV1';
const CALENDAR_CACHE_KEY = 'calendarCacheV1';
const PROJECTS_CACHE_KEY = 'projectsCacheV1';

function readViewCache(key) {
  return new Promise(resolve => {
    try {
      chrome.storage.local.get([key], result => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve((result && result[key]) || null);
      });
    } catch { resolve(null); }
  });
}
function writeViewCache(key, data) {
  try { chrome.storage.local.set({ [key]: { at: Date.now(), data } }); } catch { /* ignore */ }
}

// Toggles the small "Updating…" pill in a view header while a refresh runs.
function setViewUpdating(which, on) {
  const el = document.getElementById(`${which}-updating`);
  if (el) el.hidden = !on;
}

let tasksRefreshInFlight = null;
function refreshTasksData() {
  if (tasksRefreshInFlight) return tasksRefreshInFlight;
  tasksRefreshInFlight = (async () => {
    try {
      const [subitems, email] = await Promise.all([fetchAllSubitems(), fetchCurrentUserEmail()]);
      const boardInfo = await fetchSubitemBoardInfo();
      writeViewCache(TASKS_CACHE_KEY, { subitems, boardInfo, email });
      return { subitems, boardInfo, email };
    } finally { tasksRefreshInFlight = null; }
  })();
  return tasksRefreshInFlight;
}

let calendarRefreshInFlight = null;
function refreshCalendarData() {
  if (calendarRefreshInFlight) return calendarRefreshInFlight;
  calendarRefreshInFlight = (async () => {
    try {
      const items = await fetchOnboardingItems();
      writeViewCache(CALENDAR_CACHE_KEY, items);
      return items;
    } finally { calendarRefreshInFlight = null; }
  })();
  return calendarRefreshInFlight;
}

let projectsRefreshInFlight = null;
function refreshProjectsData() {
  if (projectsRefreshInFlight) return projectsRefreshInFlight;
  projectsRefreshInFlight = (async () => {
    try {
      const [projects, email] = await Promise.all([fetchAllProjects(), fetchCurrentUserEmail()]);
      writeViewCache(PROJECTS_CACHE_KEY, { projects, email });
      return { projects, email };
    } finally { projectsRefreshInFlight = null; }
  })();
  return projectsRefreshInFlight;
}

// Fetch the view datasets in the background right after the popup opens so the
// caches are warm ("update in the background as soon as the extension launches").
function prewarmViewCaches() {
  refreshTasksData()
    .then(({ subitems, boardInfo, email }) => {
      const tv = document.getElementById('tasks-view');
      if (tv && !tv.hidden && email) { applyTasksData(subitems, boardInfo, email); setViewUpdating('tasks', false); }
    })
    .catch(() => {});
  refreshCalendarData()
    .then(items => {
      const cv = document.getElementById('calendar-view');
      if (cv && !cv.hidden) { calendarItems = items; renderCalendarMonth(); setViewUpdating('calendar', false); }
    })
    .catch(() => {});
  refreshProjectsData()
    .then(({ projects, email }) => {
      const pv = document.getElementById('projects-view');
      if (pv && !pv.hidden) { renderAllActiveProjects(projects, email); setViewUpdating('projects', false); }
    })
    .catch(() => {});
}

// Filter a raw subitem list to the signed-in user's tasks and render them.
function applyTasksData(subitems, boardInfo, email) {
  if (boardInfo) tasksBoardInfo = boardInfo;
  const em = String(email || '').toLowerCase();
  myTasksCache = (Array.isArray(subitems) ? subitems : []).filter(t => {
    const emails = Array.isArray(t.assigneeEmails) ? t.assigneeEmails : [];
    return emails.some(e => String(e).toLowerCase() === em) || String(t.assignee || '').toLowerCase().includes(em);
  });
  renderMyTasks();
}

// ── Open a client in the popup (not the CS app) from tasks/calendar ─────────
// showClientDetail needs the Clients-board item id. Calendar events carry it
// directly; task subitems only carry the onboarding item id, so we resolve it
// via the cached onboarding list (prewarmed on launch), then the search index
// by name, and only fall back to the CS app if neither resolves.
async function clientForOnboardingId(onbId) {
  if (!onbId) return null;
  let items = calendarItems;
  if (!items || !items.length) {
    const cached = await readViewCache(CALENDAR_CACHE_KEY);
    if (cached && Array.isArray(cached.data)) items = cached.data;
  }
  const it = (items || []).find(x => x.id === onbId);
  return it && it.clientBoardItemId ? { id: it.clientBoardItemId, name: it.name || '' } : null;
}
function clientStubByName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n || !clientIndex) return null;
  const hit = clientIndex.find(c => String(c.name || '').trim().toLowerCase() === n);
  return hit ? { id: hit.id, name: hit.name } : null;
}
async function openTaskClient(t) {
  const byOnb = await clientForOnboardingId(t.parentItemId);
  if (byOnb) { void showClientDetail(byOnb, 'tasks'); return; }
  const byName = clientStubByName(t.parentItemName);
  if (byName) { void showClientDetail(byName, 'tasks'); return; }
  // Last resort — the id we have is an onboarding item id, so send it to the
  // dashboard which knows how to resolve it.
  if (t.parentItemId) void openPath(`/customer-service?clientId=${encodeURIComponent(t.parentItemId)}&expanded=1`);
}

async function showTasksView() {
  const searchView = document.getElementById('search-view');
  const detailView = document.getElementById('client-detail');
  const projectsView = document.getElementById('projects-view');
  const calendarView = document.getElementById('calendar-view');
  const tasksView = document.getElementById('tasks-view');
  if (detailView) detailView.hidden = true;
  if (searchView) searchView.hidden = true;
  if (projectsView) projectsView.hidden = true;
  if (calendarView) calendarView.hidden = true;
  tasksView.hidden = false;

  const backBtn = document.getElementById('tasks-back');
  (backBtn || tasksView).focus({ preventScroll: true });
  document.body.classList.remove('detail-open', 'calendar-open');
  document.body.classList.add('projects-open');

  setTasksFilterMode('open');
  const list = document.getElementById('tasks-view-list');

  // 1. Instant paint from the cached payload (previous session or prewarm).
  const cached = await readViewCache(TASKS_CACHE_KEY);
  let painted = false;
  if (cached && cached.data && cached.data.email) {
    applyTasksData(cached.data.subitems, cached.data.boardInfo, cached.data.email);
    showTasksViewStatus('', false);
    setViewUpdating('tasks', true);
    painted = true;
  } else {
    if (list) list.innerHTML = '';
    showTasksViewStatus('Loading your tasks…', false);
  }

  // 2. Background refresh (shared with the launch prewarm — no double fetch).
  try {
    const { subitems, boardInfo, email } = await refreshTasksData();
    setViewUpdating('tasks', false);
    if (!email) {
      if (!painted) showTasksViewStatus('Sign in to the dashboard first, then reopen this popup.', true);
      return;
    }
    locallyCompletedTaskIds.clear();
    applyTasksData(subitems, boardInfo, email);
    showTasksViewStatus('', false);
  } catch (err) {
    setViewUpdating('tasks', false);
    if (!painted) {
      showTasksViewStatus(
        err.code === 'unauthorized'
          ? 'Sign in to the dashboard first, then reopen this popup.'
          : `Couldn't load tasks (${err.message || 'network error'}).`,
        true,
      );
    }
  }
}

// ── Calendar view (agenda of upcoming kickoffs + deliveries) ─────────────────
// Opened from the "Calendar" quick-launch button. Pulls the onboarding list via
// /api/onboarding-items and renders a compact agenda: past-due deliveries first,
// then everything from today forward grouped by date. Mirrors the dashboard
// CalendarView's event model (kickoff / delivered / estimated delivery).
async function fetchOnboardingItems() {
  const base = await getBaseUrl();
  const res = await fetch(`${base}/api/onboarding-items`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) { const e = new Error('Not signed in'); e.code = 'unauthorized'; throw e; }
  if (!res.ok) throw new Error(`calendar failed (${res.status})`);
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

function buildCalendarEvents(items) {
  const events = [];
  for (const item of items) {
    if (isValidYMD(item.kickoffDate)) {
      events.push({ id: `${item.id}-k`, type: 'kickoff', date: item.kickoffDate, time: item.kickoffTime || '', item });
    }
    // Once received we plot the real Delivered Date; otherwise fall back to the
    // Initial Inventory Est. Delivery Date. Only one of the two ever shows.
    if (isValidYMD(item.deliveredDate)) {
      events.push({ id: `${item.id}-dd`, type: 'delivered', date: item.deliveredDate, time: item.deliveredTime || '', item });
    } else if (isValidYMD(item.estimatedDeliveryDate)) {
      events.push({ id: `${item.id}-ed`, type: 'delivery', date: item.estimatedDeliveryDate, time: item.estimatedDeliveryTime || '', item });
    }
  }
  return events;
}

// ── Month calendar grid (mirrors the CS app's month view) ───────────────────
const CAL_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CAL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

let calendarItems = [];   // cached onboarding items backing the grid
let calViewYear = null;   // month currently displayed
let calViewMonth = null;

// Monday of the week containing the 1st — the grid's top-left cell.
function startOfMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const dow = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - (dow === 0 ? 6 : dow - 1));
  return start;
}
function ymdOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function eventsByDate(items) {
  const map = {};
  for (const ev of buildCalendarEvents(items)) (map[ev.date] = map[ev.date] || []).push(ev);
  return map;
}

// One event pill inside a day cell. Colored by type; click opens the client.
function calChip(ev, overdue) {
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = `cal-chip ${overdue ? 'overdue' : ev.type}`;
  const t = formatTimeHM(ev.time);
  const label = ev.item.name || '(unnamed)';
  chip.textContent = t ? `${t} ${label}` : label;
  const kind = ev.type === 'kickoff' ? 'Onboarding call'
    : overdue ? 'Past-due delivery'
    : ev.type === 'delivered' ? 'Delivered'
    : 'Expected delivery';
  chip.title = `${kind}: ${label}${t ? ' · ' + t : ''}`;
  chip.addEventListener('click', e => {
    e.stopPropagation();
    const cid = ev.item.clientBoardItemId;
    // Open the client in the popup (calendar events carry the Clients-board id).
    if (cid) void showClientDetail({ id: cid, name: ev.item.name || '' }, 'calendar');
  });
  return chip;
}

function renderCalendarMonth() {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-label');
  const metaEl = document.getElementById('calendar-view-meta');
  if (!grid) return;
  if (calViewYear == null || calViewMonth == null) {
    const now = new Date();
    calViewYear = now.getFullYear();
    calViewMonth = now.getMonth();
  }
  grid.innerHTML = '';
  if (label) label.textContent = `${CAL_MONTHS[calViewMonth]} ${calViewYear}`;

  const byDate = eventsByDate(calendarItems);
  const t = todayYMD();

  // Weekday header row.
  const head = document.createElement('div');
  head.className = 'cal-grid cal-grid-head';
  for (const wd of CAL_WEEKDAYS) {
    const c = document.createElement('div');
    c.className = 'cal-head-cell';
    c.textContent = wd;
    head.appendChild(c);
  }
  grid.appendChild(head);

  // 6-week day grid.
  const daysWrap = document.createElement('div');
  daysWrap.className = 'cal-grid cal-grid-days';
  const start = startOfMonthGrid(calViewYear, calViewMonth);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ymd = ymdOf(d);
    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (d.getMonth() !== calViewMonth) cell.classList.add('other-month');
    if (ymd === t) cell.classList.add('today');

    const num = document.createElement('span');
    num.className = 'cal-cell-num';
    num.textContent = String(d.getDate());
    cell.appendChild(num);

    const evs = (byDate[ymd] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const MAX = 3;
    evs.slice(0, MAX).forEach(ev => cell.appendChild(calChip(ev, ev.type === 'delivery' && ymd < t)));
    if (evs.length > MAX) {
      const more = document.createElement('span');
      more.className = 'cal-more';
      more.textContent = `+${evs.length - MAX} more`;
      cell.appendChild(more);
    }
    daysWrap.appendChild(cell);
  }
  grid.appendChild(daysWrap);

  if (metaEl) {
    const total = buildCalendarEvents(calendarItems).length;
    metaEl.textContent = total ? `${total} events` : '';
  }
}

function calNavigate(delta) {
  if (calViewYear == null) { const n = new Date(); calViewYear = n.getFullYear(); calViewMonth = n.getMonth(); }
  let m = calViewMonth + delta, y = calViewYear;
  if (m < 0) { m = 11; y -= 1; }
  else if (m > 11) { m = 0; y += 1; }
  calViewMonth = m; calViewYear = y;
  renderCalendarMonth();
}
function calGoToday() {
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();
  renderCalendarMonth();
}

function backFromCalendar() {
  document.getElementById('calendar-view').hidden = true;
  document.getElementById('search-view').hidden = false;
  document.body.classList.remove('projects-open', 'calendar-open');
  const input = document.getElementById('search-input');
  if (input) input.focus();
}

function showCalendarViewStatus(message, isError) {
  const el = document.getElementById('calendar-view-status');
  if (!el) return;
  el.hidden = !message;
  el.textContent = message || '';
  el.classList.toggle('error', !!isError);
}

async function showCalendarView() {
  const searchView = document.getElementById('search-view');
  const detailView = document.getElementById('client-detail');
  const projectsView = document.getElementById('projects-view');
  const tasksView = document.getElementById('tasks-view');
  const calendarView = document.getElementById('calendar-view');
  if (detailView) detailView.hidden = true;
  if (searchView) searchView.hidden = true;
  if (projectsView) projectsView.hidden = true;
  if (tasksView) tasksView.hidden = true;
  calendarView.hidden = false;

  const backBtn = document.getElementById('calendar-back');
  (backBtn || calendarView).focus({ preventScroll: true });
  document.body.classList.remove('detail-open', 'projects-open');
  document.body.classList.add('calendar-open');

  // Always land on the current month.
  const now = new Date();
  calViewYear = now.getFullYear();
  calViewMonth = now.getMonth();

  // 1. Instant paint from the cached onboarding list (previous session/prewarm).
  const cached = await readViewCache(CALENDAR_CACHE_KEY);
  let painted = false;
  if (cached && Array.isArray(cached.data)) {
    calendarItems = cached.data;
    renderCalendarMonth();
    showCalendarViewStatus('', false);
    setViewUpdating('calendar', true);
    painted = true;
  } else {
    showCalendarViewStatus('Loading calendar…', false);
  }

  // 2. Background refresh (shared with the launch prewarm).
  try {
    const items = await refreshCalendarData();
    setViewUpdating('calendar', false);
    calendarItems = items;
    renderCalendarMonth();
    showCalendarViewStatus('', false);
  } catch (err) {
    setViewUpdating('calendar', false);
    if (!painted) {
      showCalendarViewStatus(
        err.code === 'unauthorized'
          ? 'Sign in to the dashboard first, then reopen this popup.'
          : `Couldn't load the calendar (${err.message || 'network error'}).`,
        true,
      );
    }
  }
}

// ── Create-project composer ─────────────────────────────────────────────────
// A lightweight modal that POSTs a fully-formed Project to /api/projects so
// reps create a project without leaving the popup. Mirrors the dashboard's
// makeBlankProject shape. When the projects DB isn't provisioned the API
// returns 503 and we surface a friendly note + a dashboard deep-link fallback.
let composerState = { clientBoardItemId: null, clientName: '', lockClient: false, onCreated: null };

function newLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function showProjectComposerStatus(msg, isError, html) {
  const el = document.getElementById('pc-status');
  if (!el) return;
  el.hidden = !msg && !html;
  el.classList.toggle('error', !!isError);
  if (html) el.innerHTML = html;
  else el.textContent = msg || '';
}

async function openProjectComposer(prefill) {
  const email = await fetchCurrentUserEmail();
  composerState = {
    clientBoardItemId: (prefill && prefill.clientBoardItemId) || null,
    clientName: (prefill && prefill.clientName) || '',
    lockClient: !!(prefill && prefill.lockClient),
    onCreated: prefill && typeof prefill.onCreated === 'function' ? prefill.onCreated : null,
  };
  const overlay = document.getElementById('project-composer');
  const nameEl = document.getElementById('pc-name');
  const clientEl = document.getElementById('pc-client');
  const ownerEl = document.getElementById('pc-owner');
  const noteEl = document.getElementById('pc-note');
  nameEl.value = '';
  noteEl.value = '';
  clientEl.value = composerState.clientName;
  clientEl.readOnly = composerState.lockClient;
  clientEl.classList.toggle('pc-readonly', composerState.lockClient);
  ownerEl.value = email || '';
  showProjectComposerStatus('', false);
  overlay.hidden = false;
  setTimeout(() => nameEl.focus(), 0);
}

function closeProjectComposer() {
  const overlay = document.getElementById('project-composer');
  if (overlay) overlay.hidden = true;
}

async function submitProjectComposer() {
  const nameEl = document.getElementById('pc-name');
  const clientEl = document.getElementById('pc-client');
  const ownerEl = document.getElementById('pc-owner');
  const noteEl = document.getElementById('pc-note');
  const createBtn = document.getElementById('pc-create');

  const name = nameEl.value.trim();
  if (!name) { showProjectComposerStatus('Give the project a name.', true); nameEl.focus(); return; }

  const email = ownerEl.value.trim() || (await fetchCurrentUserEmail()) || '';
  const nowIso = new Date().toISOString();
  const body = {
    id: newLocalId('proj'),
    name,
    clientBoardItemId: composerState.clientBoardItemId,
    clientName: clientEl.value.trim(),
    status: { id: 'opened', label: 'Opened', kind: 'opened', color: '#94a3b8' },
    ownerEmail: email,
    note: noteEl.value.trim(),
    dueDate: null,
    subtasks: [],
    documents: [],
    comments: [],
    adhocCreated: false,
    createdByEmail: email,
    createdAt: nowIso,
    activity: [{ id: newLocalId('act'), kind: 'created', actorEmail: email, at: nowIso, summary: 'created the project' }],
  };

  createBtn.disabled = true;
  const prevLabel = createBtn.textContent;
  createBtn.textContent = 'Creating…';
  showProjectComposerStatus('', false);
  try {
    const base = await getBaseUrl();
    const res = await fetch(`${base}/api/projects`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 503) {
      // DB not provisioned — offer the dashboard as a fallback path.
      const params = new URLSearchParams({ view: 'projects' });
      if (composerState.clientBoardItemId) params.set('newProjectClientId', composerState.clientBoardItemId);
      if (body.clientName) params.set('newProjectClientName', body.clientName);
      showProjectComposerStatus('', true,
        'Projects aren’t set up in the database yet. <a href="#" id="pc-dash-link">Create it in the dashboard →</a>');
      const link = document.getElementById('pc-dash-link');
      if (link) link.addEventListener('click', e => { e.preventDefault(); openPath(`/customer-service?${params.toString()}`); });
      return;
    }
    if (res.status === 401) { showProjectComposerStatus('Sign in to the dashboard first, then try again.', true); return; }
    if (!res.ok) throw new Error(String(res.status));
    closeProjectComposer();
    if (composerState.onCreated) { try { await composerState.onCreated(); } catch { /* refresh best-effort */ } }
  } catch (err) {
    console.error('[projects] create failed', err);
    showProjectComposerStatus(`Couldn't create the project (${err.message || 'error'}).`, true);
  } finally {
    createBtn.disabled = false;
    createBtn.textContent = prevLabel;
  }
}

// ── Onboarding checklist (admin-only, inside the client detail) ─────────────
// Admins get an "Onboarding" toggle in the detail header that swaps the sticky
// notes + projects column for this client's onboarding checklist — progress %
// plus every step's state, so they can see what's still missing without leaving
// the popup. Data comes from the cached onboarding list (same source the
// calendar uses), matched to the client by its Clients-board id.
// Signed-in user's capabilities, fetched once from /api/admin/status and shared
// by every gated feature so we make a single request per popup open:
//   isAdmin     → admin-only Onboarding view
//   canDocusign → restricted Billing info view (mirrors the dashboard's billing gate)
let accountStatusPromise = null;
function fetchAccountStatus() {
  if (!accountStatusPromise) {
    accountStatusPromise = (async () => {
      try {
        const base = await getBaseUrl();
        const res = await fetch(`${base}/api/admin/status`, { credentials: 'include', headers: { Accept: 'application/json' } });
        if (!res.ok) return { isAdmin: false, canDocusign: false };
        const j = await res.json();
        return { isAdmin: !!j.isAdmin, canDocusign: !!j.canDocusign };
      } catch { return { isAdmin: false, canDocusign: false }; }
    })();
  }
  return accountStatusPromise;
}
async function fetchIsAdmin() { return (await fetchAccountStatus()).isAdmin; }

// Minimal mirror of lib/constants.ts getStepState + the special-step flags, so
// the popup colors steps and counts "missing" exactly like the dashboard. The
// conditional-N/A steps (TikTok / Lot Code / FBA / Intl) already carry "N/A" in
// their value server-side, so only these flags are needed here.
const ONB_CHECKLIST_CFG = {
  dropdown_mm47xxjv: { anyValueIsDone: true, requiredWhenEmpty: true }, // Retrieved payment info
  color_mktrmpxj:    { noAlsoDone: true },                             // Enable Inventory Syncing
};
function onbStepState(value, invertLogic, cfg) {
  cfg = cfg || {};
  if (!value) return cfg.requiredWhenEmpty ? 'missing' : 'not_started';
  if (cfg.anyValueIsDone) return 'done';
  const v = String(value).toLowerCase();
  if (invertLogic) {
    if (v === 'no') return 'done';
    if (v === 'yes') return 'pending';
    return 'not_started';
  }
  if (v === 'done' || v === 'yes') return 'done';
  if (cfg.noAlsoDone && v === 'no') return 'done';
  if (v === 'pending' || v === 'working on it' || v === 'needs set up' || v.includes('pending')) return 'pending';
  if (v === 'n/a' || v === 'na' || v === 'not connecting store') return 'na';
  return 'not_started';
}
const ONB_STATE_COLOR = { done: '#00c875', pending: '#fdab3d', missing: '#e2445c', na: '#00c875', not_started: '#c4c4c4' };

// Onboarding status labels (Monday "estado" column) admins can pick from.
const ONB_STATUSES = ['Not Started', 'In Progress', 'Onboarded, Awaiting Inventory', 'Completed', 'Inventory never arrived', 'Abandoned', 'N/A', 'ZAP ERROR'];

// Recompute item.progress from the current checklist values (so the % updates
// live as an admin toggles steps), matching the server's done/applicable math.
function recomputeItemProgress(item) {
  const steps = Array.isArray(item.checklist) ? item.checklist : [];
  const states = steps.map(s => onbStepState(s.value, s.invertLogic, ONB_CHECKLIST_CFG[s.id]));
  const applicable = states.filter(x => x !== 'na');
  const done = applicable.filter(x => x === 'done').length;
  item.progress = applicable.length ? Math.round((done / applicable.length) * 100) : 0;
}

// Persist + re-render helper: mutate the item optimistically, re-render (keeping
// scroll), PATCH Monday, and revert on failure. Used for both checklist steps
// and the onboarding status.
async function onbPatchAndRerender(item, apply, revert, url, columnId, value) {
  const wrap = document.getElementById('detail-onboarding');
  const scroll = wrap ? wrap.scrollTop : 0;
  apply();
  renderOnboardingChecklist(item);
  if (wrap) wrap.scrollTop = scroll;
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId, value }),
    });
    if (!res.ok) throw new Error(String(res.status));
  } catch (err) {
    console.error('[onboarding] update failed', err);
    revert();
    const w = document.getElementById('detail-onboarding');
    const s = w ? w.scrollTop : 0;
    renderOnboardingChecklist(item);
    if (w) w.scrollTop = s;
  }
}

async function changeStepValue(item, step, newValue) {
  const s = item.checklist.find(x => x.id === step.id);
  if (!s) return;
  const prev = s.value;
  // "Retrieved payment information" lives on the Clients board; everything else
  // is an Onboarding-board column.
  const isClientsStep = step.id === 'dropdown_mm47xxjv';
  const base = await getBaseUrl();
  const url = isClientsStep
    ? `${base}/api/client/${encodeURIComponent(activeClientId)}`
    : `${base}/api/onboarding/${encodeURIComponent(item.id)}`;
  await onbPatchAndRerender(
    item,
    () => { s.value = newValue || null; recomputeItemProgress(item); },
    () => { s.value = prev; recomputeItemProgress(item); },
    url, step.id, newValue,
  );
}

async function changeOnboardingStatus(item, newStatus) {
  const prev = item.status;
  const base = await getBaseUrl();
  await onbPatchAndRerender(
    item,
    () => { item.status = newStatus; },
    () => { item.status = prev; },
    `${base}/api/onboarding/${encodeURIComponent(item.id)}`, 'estado', newStatus,
  );
}

async function onboardingItemForClient(clientBoardItemId) {
  let items = calendarItems;
  if (!items || !items.length) {
    const cached = await readViewCache(CALENDAR_CACHE_KEY);
    if (cached && Array.isArray(cached.data)) items = cached.data;
    else { try { items = await fetchOnboardingItems(); calendarItems = items; } catch { items = []; } }
  }
  return (items || []).find(it => it.clientBoardItemId === clientBoardItemId) || null;
}

function renderOnboardingChecklist(item) {
  const wrap = document.getElementById('detail-onboarding');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!item) {
    const empty = document.createElement('p');
    empty.className = 'onb-empty';
    empty.textContent = 'No onboarding record linked to this client.';
    wrap.appendChild(empty);
    return;
  }
  const steps = Array.isArray(item.checklist) ? item.checklist : [];
  const stated = steps.map(s => ({ s, state: onbStepState(s.value, s.invertLogic, ONB_CHECKLIST_CFG[s.id]) }));
  const applicable = stated.filter(x => x.state !== 'na');
  const doneN = applicable.filter(x => x.state === 'done').length;
  const pct = typeof item.progress === 'number' ? item.progress
    : (applicable.length ? Math.round((doneN / applicable.length) * 100) : 0);
  const remaining = stated.filter(x => x.state !== 'done' && x.state !== 'na').length;
  const barColor = pct >= 100 ? '#00c875' : pct > 50 ? '#579bfc' : '#fdab3d';

  const head = document.createElement('div');
  head.className = 'onb-head';
  head.innerHTML =
    `<div class="onb-head-row"><span class="onb-title">Onboarding</span>` +
    `<button id="onb-open-app" class="onb-open-app" type="button" title="Open this client in the Onboarding app">Onboarding app ↗</button>` +
    `<span class="onb-pct" style="color:${barColor}">${pct}%</span></div>` +
    `<div class="onb-bar"><span style="width:${pct}%;background:${barColor}"></span></div>` +
    `<div class="onb-sub">${doneN}/${applicable.length} done · ${remaining} remaining` +
    `${item.status ? ' · ' + escapeHtml(item.status) : ''}</div>`;
  wrap.appendChild(head);
  const openAppBtn = head.querySelector('#onb-open-app');
  // Deep-link into the Onboarding app for this client (the ?clientId param
  // accepts the onboarding-board item id and &expanded=1 opens it full-view).
  if (openAppBtn) openAppBtn.addEventListener('click', () => void openPath(`/onboarding?clientId=${encodeURIComponent(item.id)}&expanded=1`));

  // Editable onboarding status (Monday "estado" column). Admin-only panel, so
  // it's always interactive here.
  const statusRow = document.createElement('div');
  statusRow.className = 'onb-status-row';
  const statusLbl = document.createElement('span');
  statusLbl.className = 'onb-status-lbl';
  statusLbl.textContent = 'Onboarding status';
  const statusSel = document.createElement('select');
  statusSel.className = 'onb-status-sel';
  const statusOpts = ONB_STATUSES.slice();
  if (item.status && !statusOpts.includes(item.status)) statusOpts.unshift(item.status);
  for (const st of statusOpts) {
    const o = document.createElement('option');
    o.value = st; o.textContent = st;
    if ((item.status || '') === st) o.selected = true;
    statusSel.appendChild(o);
  }
  statusSel.addEventListener('change', () => void changeOnboardingStatus(item, statusSel.value));
  statusRow.appendChild(statusLbl);
  statusRow.appendChild(statusSel);
  wrap.appendChild(statusRow);

  const list = document.createElement('ul');
  list.className = 'onb-list';
  for (const { s, state } of stated) {
    const li = document.createElement('li');
    li.className = `onb-item onb-${state}`;
    const dot = document.createElement('span');
    dot.className = 'onb-dot';
    dot.style.background = ONB_STATE_COLOR[state] || '#c4c4c4';
    dot.textContent = (state === 'done' || state === 'na') ? '✓' : state === 'pending' ? '•' : state === 'missing' ? '!' : '';
    const label = document.createElement('span');
    label.className = 'onb-label';
    label.textContent = s.label || s.id;
    label.title = s.label || s.id;
    // Editable value dropdown — the step's Monday options + a clear ("—").
    const sel = document.createElement('select');
    sel.className = 'onb-step-sel';
    const cur = s.value || '';
    const opts = [''].concat(Array.isArray(s.options) ? s.options.slice() : []);
    if (cur && !opts.includes(cur)) opts.push(cur); // keep a non-standard current value visible
    for (const opt of opts) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '—' : opt;
      if (opt === cur) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => void changeStepValue(item, s, sel.value));
    li.appendChild(dot); li.appendChild(label); li.appendChild(sel);
    list.appendChild(li);
  }
  wrap.appendChild(list);
}

async function loadOnboardingChecklist(clientBoardItemId) {
  const wrap = document.getElementById('detail-onboarding');
  if (wrap) wrap.innerHTML = '<p class="onb-empty">Loading onboarding…</p>';
  const item = await onboardingItemForClient(clientBoardItemId);
  renderOnboardingChecklist(item);
}

// Swap the detail view's right column between the default notes/projects
// column and the onboarding panel. Passing 'notes' (the default) restores the
// sticky-notes/projects column. (Billing info opens in the dashboard, not here.)
function setDetailPanel(which) {
  const aside = document.querySelector('#client-detail .detail-notes');
  const onb = document.getElementById('detail-onboarding');
  const onbBtn = document.getElementById('detail-onboarding-btn');
  const showOnb = which === 'onboarding';
  if (aside) aside.hidden = showOnb;
  if (onb) onb.hidden = !showOnb;
  if (onbBtn) onbBtn.classList.toggle('is-active', showOnb);
  if (showOnb && activeClientId) void loadOnboardingChecklist(activeClientId);
}

async function showClientDetail(clientStub, origin) {
  // Remember where we came from so the Back button returns there (search by
  // default; tasks / calendar / projects when opened from those views).
  detailOrigin = origin || 'search';

  const searchView = document.getElementById('search-view');
  const detailView = document.getElementById('client-detail');
  const statusEl = document.getElementById('detail-status');
  const sectionsEl = document.getElementById('detail-sections');
  const openBtn = document.getElementById('detail-open');

  // Hide every other full-popup view so opening a client from tasks, calendar,
  // projects, or search all resolve to the same detail panel.
  searchView.hidden = true;
  const projectsView = document.getElementById('projects-view');
  const tasksViewEl = document.getElementById('tasks-view');
  const calendarViewEl = document.getElementById('calendar-view');
  if (projectsView) projectsView.hidden = true;
  if (tasksViewEl) tasksViewEl.hidden = true;
  if (calendarViewEl) calendarViewEl.hidden = true;
  detailView.hidden = false;

  // Park focus on a real control BEFORE widening. Two reasons:
  //  1. If focus fell to <body>, macOS Chrome paints a native ring around the
  //     WHOLE popup. Focusing the large detail SECTION draws that same ring
  //     around the panel — so we focus the small, outline-suppressed Back
  //     button instead (no visible ring).
  //  2. Calling focus() forces a synchronous layout. Doing it AFTER the width
  //     change collapses the widen transition to an instant jump; doing it
  //     first (while the popup is still narrow) lets the transition animate.
  const detailBackBtn = document.getElementById('detail-back');
  (detailBackBtn || detailView).focus({ preventScroll: true });

  // Widen the popup (animated via the body width transition) so the
  // sticky-notes column has room next to the detail sections.
  document.body.classList.remove('projects-open', 'calendar-open');
  document.body.classList.add('detail-open');

  // Header placeholders fill from search-index right away so the user sees
  // something while the full fetch runs.
  document.getElementById('detail-name').textContent = clientStub.name || '(unnamed)';
  document.getElementById('detail-meta').textContent =
    [clientStub.contactEmail, clientStub.warehouse].filter(Boolean).join(' · ');
  sectionsEl.innerHTML = '';
  statusEl.hidden = false;
  statusEl.classList.remove('error');
  statusEl.textContent = 'Loading client info…';

  // expanded=1 tells the dashboard to open this client in its full expanded
  // view (all sections + sticky notes), not the narrow side panel.
  openBtn.onclick = () => openPath(`/customer-service?clientId=${encodeURIComponent(clientStub.id)}&expanded=1`);

  // "+ New" opens the in-popup project composer, pre-filled with (and locked
  // to) this client, so the rep creates a project without leaving the popup.
  // On success the client's projects list refreshes in place. If the projects
  // DB isn't provisioned the composer falls back to the dashboard deep-link.
  const addProjectBtn = document.getElementById('detail-projects-add');
  if (addProjectBtn) {
    addProjectBtn.onclick = () => {
      void openProjectComposer({
        clientBoardItemId: clientStub.id || null,
        clientName: clientStub.name || '',
        lockClient: true,
        onCreated: () => loadClientProjects(clientStub.id, clientStub.name),
      });
    };
  }

  // Remember which client the sticky-note composer should post to, and make
  // sure it starts closed for each newly opened client.
  activeClientId = clientStub.id;
  resetNoteComposer();
  // Remember this client so closing + reopening the popup lands back here.
  saveLastClient(clientStub);

  // Reset the right column to the notes view on each open, and reveal the gated
  // controls the user is entitled to: the Onboarding panel toggle (admins) and
  // the Billing info button (DocuSign-access users).
  setDetailPanel('notes');
  void fetchAccountStatus().then(({ isAdmin, canDocusign }) => {
    const onbBtn = document.getElementById('detail-onboarding-btn');
    if (onbBtn) onbBtn.hidden = !isAdmin;
    const billBtn = document.getElementById('detail-billing-btn');
    if (billBtn) billBtn.hidden = !canDocusign;
  });

  // Kick off sticky notes + related projects in parallel with the full client
  // info fetch so the right column populates as soon as each source returns.
  void loadStickyNotesPane(clientStub.id);
  void loadClientProjects(clientStub.id, clientStub.name);

  // Paint instantly from the cached payload if we have one, so restoring the
  // remembered client (or reopening one) shows content immediately instead of
  // the "Loading client info…" spinner. The network fetch below still runs and
  // repaints with fresh data (stale-while-revalidate).
  const cachedFull = await readClientDetailCache(clientStub.id);
  if (cachedFull && activeClientId === clientStub.id) {
    statusEl.hidden = true;
    renderClientDetail(cachedFull);
  }

  try {
    const client = await fetchClientFull(clientStub.id);
    // A fast client-switch may have moved on while we were fetching — don't
    // clobber the newer client's view with this stale response.
    if (activeClientId !== clientStub.id) return;
    writeClientDetailCache(clientStub.id, client);
    statusEl.hidden = true;
    renderClientDetail(client);
  } catch (err) {
    // Already showing cached content → keep it; the refresh just failed quietly.
    if (cachedFull) return;
    statusEl.classList.add('error');
    if (err.code === 'unauthorized') {
      statusEl.textContent = 'Sign in at the dashboard first, then reopen this popup.';
    } else {
      statusEl.textContent = `Couldn't load (${err.message || 'network error'}).`;
    }
  }
}

function backToSearch() {
  activeClientId = null;
  resetNoteComposer();
  clearLastClient(); // leaving the client → don't auto-restore it next open
  document.getElementById('client-detail').hidden = true;
  document.body.classList.remove('detail-open');
  // Return to whichever view opened this client.
  if (detailOrigin === 'tasks') { void showTasksView(); return; }
  if (detailOrigin === 'calendar') { void showCalendarView(); return; }
  if (detailOrigin === 'projects') { void showProjectsView(); return; }
  document.getElementById('search-view').hidden = false;
  document.getElementById('search-input').focus();
}

// Hide + clear the sticky-note composer. Safe to call before the elements
// are wired (guards against missing nodes).
function resetNoteComposer() {
  const composer = document.getElementById('detail-notes-composer');
  const input = document.getElementById('detail-notes-input');
  if (composer) composer.hidden = true;
  if (input) input.value = '';
}

// Mini Apps registry — kept in sync with components/mini-apps-view.tsx.
// Each entry is either { external: <absolute URL> } or { dashPath: <path on
// our deploy> }. CSV Order Formatter has to render in-app, so it deep-links
// the dashboard's Mini Apps tab; everything else opens its own URL directly
// so the user doesn't pay an extra hop through the dashboard.
const MINI_APPS = {
  'csv-order-formatter': { dashPath: '/customer-service?view=apps' },
  'sheet':              { external: 'https://www.shipbots.com/sheet' },
  'ship-hero':          { external: 'https://www.shipbots.com/login' },
  'sh-portal':          { external: 'https://www.shipbots.com/portal' },
  'help-shiphero':      { external: 'https://help.shipbots.com' },
  'help-portal':        { external: 'https://helpportal.shipbots.com' },
  'returns-dashboard':  { external: 'https://script.google.com/a/macros/shipbots.com/s/AKfycbyqXjipgq_siGVjEkFUnE0q1qcTyuAGO8jf77B1vZhx0CK9xG2e3qLnG6BbRp6SYPKS/exec' },
  // BOL Uploader is an in-dashboard app like CSV Order Formatter, so it
  // deep-links to the mini-apps view rather than an external URL.
  'bol-uploader':       { dashPath: '/customer-service?view=apps' },
  // Photo to PO is still marked "coming soon" in the dashboard — clicking
  // the tile just opens the Mini Apps grid where the placeholder lives.
  'photo-to-po':        { dashPath: '/customer-service?view=apps' },
};

document.addEventListener('DOMContentLoaded', async () => {
  // ── Live client search with autocomplete ─────────────────────────────
  const searchInput = document.getElementById('search-input');
  const searchForm = document.getElementById('search-form');
  const searchResults = document.getElementById('search-results');
  const searchStatus = document.getElementById('search-status');

  // Lazy-loaded once per popup open. Null = not yet attempted. Declared at
  // module scope (see top) so task/calendar rows can resolve clients by name.
  clientIndex = null;
  let indexError = null;
  let activeResults = [];
  let activeIdx = -1;

  function showStatus(text, isError = false) {
    if (!text) { searchStatus.hidden = true; return; }
    searchStatus.textContent = text;
    searchStatus.hidden = false;
    searchStatus.classList.toggle('error', !!isError);
  }

  // Header logo → open the CS dashboard in a new tab. Same base URL as
  // every other openPath() call so preview builds stay routed.
  document.getElementById('header-home')?.addEventListener('click', () => {
    void openPath('/customer-service');
  });

  // Stale-while-revalidate. First call hydrates from the cache
  // (instant) and kicks a background refresh; the returned promise
  // resolves as soon as SOME data is available (cache hit → immediately,
  // cache miss → after the network fetch). Subsequent calls reuse the
  // same promise so the eager call + focus + first keystroke don't
  // triple-fetch.
  let indexReadyPromise = null;
  function ensureIndex() {
    if (!indexReadyPromise) indexReadyPromise = hydrateAndRefresh();
    return indexReadyPromise;
  }

  async function hydrateAndRefresh() {
    const cached = await readIndexCache();
    if (cached && cached.data.length) {
      clientIndex = cached.data;
      showStatus('Updating client list…');
      // Refresh in the background — search already works off the cache.
      void refreshIndex(false);
    } else {
      // No cache (first ever open, or storage cleared): must wait on
      // the network before search can do anything.
      showStatus('Loading clients…');
      await refreshIndex(true);
    }
  }

  async function refreshIndex(isForeground) {
    try {
      const fresh = await fetchClientIndex();
      clientIndex = fresh;
      indexError = null;
      await writeIndexCache(fresh);
      showStatus('');
      // If the user is mid-search, re-render against the fresh data.
      refreshCurrentSearch();
    } catch (err) {
      indexError = err;
      if (err.code === 'unauthorized') {
        // Take over the whole view only when we have nothing to show.
        // With cached data present, keep it usable and hint quietly.
        if (!clientIndex) showLoginGate();
        else showStatus('Showing saved clients — sign in to refresh', false);
      } else if (isForeground) {
        showStatus(`Couldn't load clients (${err.message || 'network error'}).`, true);
      }
      // Background failure with cached data → stay silent, keep the list.
    }
  }

  // Re-run the active query after a background refresh so results
  // reflect the freshest index without the user retyping.
  function refreshCurrentSearch() {
    const q = searchInput.value.trim();
    if (!q || !clientIndex) return;
    activeResults = filterClients(clientIndex, q);
    activeIdx = activeResults.length > 0 ? 0 : -1;
    renderResults(activeResults, searchResults, activeIdx);
  }

  // Full-panel takeover shown when the popup detects a 401. Hides the
  // search input, mini-apps grid, and quick-launch buttons behind a
  // single "Sign in to ShipBots" card. Clicking the button opens the
  // dashboard's /login route in a new tab; once the user signs in there
  // they can reopen the popup and the index request will succeed.
  function showLoginGate() {
    const searchView = document.getElementById('search-view');
    if (!searchView) return;
    if (document.getElementById('login-gate')) return;
    searchView.innerHTML = '';
    const gate = document.createElement('div');
    gate.id = 'login-gate';
    gate.className = 'login-gate';
    gate.innerHTML = `
      <div class="login-gate-icon" aria-hidden="true">🔒</div>
      <h2 class="login-gate-title">Sign in to ShipBots</h2>
      <p class="login-gate-body">
        The extension needs a signed-in ShipBots session. Sign in with your
        <strong>@shipbots.com</strong> Google account, then reopen this popup.
      </p>
      <button id="login-gate-btn" type="button" class="login-gate-btn">
        Sign in →
      </button>
      <p class="login-gate-hint">
        Opens the ShipBots dashboard in a new tab.
      </p>
    `;
    searchView.appendChild(gate);
    document.getElementById('login-gate-btn').addEventListener('click', () => {
      void openPath('/login');
    });
  }

  function openSelectedClient(client) {
    if (!client) return;
    // Show the full info inside the popup; the user can hit Edit ↗ in the
    // detail header if they want to open the dashboard to make changes.
    void showClientDetail(client);
  }

  const runSearch = debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) {
      searchResults.hidden = true;
      activeResults = [];
      activeIdx = -1;
      return;
    }
    await ensureIndex();
    if (!clientIndex) return;
    activeResults = filterClients(clientIndex, q);
    activeIdx = activeResults.length > 0 ? 0 : -1;
    renderResults(activeResults, searchResults, activeIdx);
  }, 80);

  searchInput.addEventListener('input', runSearch);
  searchInput.addEventListener('focus', () => { void ensureIndex(); });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (activeResults.length === 0) return;
      activeIdx = Math.min(activeIdx + 1, activeResults.length - 1);
      renderResults(activeResults, searchResults, activeIdx);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (activeResults.length === 0) return;
      activeIdx = Math.max(activeIdx - 1, 0);
      renderResults(activeResults, searchResults, activeIdx);
    } else if (e.key === 'Escape') {
      searchResults.hidden = true;
    }
  });

  searchForm.addEventListener('submit', e => {
    e.preventDefault();
    // Enter opens the highlighted result if there is one; otherwise falls
    // back to the dashboard's own kanban search via ?q= so the user still
    // gets something useful.
    if (activeIdx >= 0 && activeResults[activeIdx]) {
      openSelectedClient(activeResults[activeIdx].c);
      return;
    }
    const q = searchInput.value.trim();
    openPath(q ? `/customer-service?q=${encodeURIComponent(q)}` : '/customer-service');
  });

  searchResults.addEventListener('click', e => {
    const li = e.target.closest('li[data-client-id]');
    if (!li) return;
    const id = li.getAttribute('data-client-id');
    const hit = activeResults.find(r => r.c.id === id);
    if (hit) openSelectedClient(hit.c);
  });

  // Eager-load the index in the background so the first keystroke is
  // instant rather than waiting on a round-trip.
  void ensureIndex();

  // ── Detail view: Back button returns to search ────────────────────────
  document.getElementById('detail-back').addEventListener('click', backToSearch);

  // Admin-only Onboarding toggle: swaps the notes/projects column for the
  // onboarding checklist (progress % + what's missing).
  const onbBtn = document.getElementById('detail-onboarding-btn');
  if (onbBtn) onbBtn.addEventListener('click', () => {
    const onb = document.getElementById('detail-onboarding');
    setDetailPanel(onb && onb.hidden ? 'onboarding' : 'notes');
  });

  // Restricted Billing info: opens the client's full Billing tab in the
  // dashboard in a NEW TAB, so the whole billing section is available —
  // billing address, payments / ACH, and pricing. The button is hidden for
  // non-authorized users, and the dashboard re-checks DocuSign access before
  // rendering the tab.
  const billBtn = document.getElementById('detail-billing-btn');
  if (billBtn) billBtn.addEventListener('click', () => {
    if (!activeClientId) return;
    void openPath(`/customer-service?clientId=${encodeURIComponent(activeClientId)}&expanded=1&tab=billing`);
  });

  // ── Sticky-note composer: add a note without leaving the popup ─────────
  const notesAddBtn  = document.getElementById('detail-notes-add');
  const notesComposer = document.getElementById('detail-notes-composer');
  const notesInput   = document.getElementById('detail-notes-input');
  const notesCancel  = document.getElementById('detail-notes-cancel');
  const notesSave    = document.getElementById('detail-notes-save');

  notesAddBtn.addEventListener('click', () => {
    if (notesComposer.hidden) {
      notesComposer.hidden = false;
      notesInput.focus();
    } else {
      resetNoteComposer();
    }
  });
  notesCancel.addEventListener('click', resetNoteComposer);

  async function submitNote() {
    const text = notesInput.value.trim();
    if (!text || !activeClientId) return;
    const clientId = activeClientId;
    notesSave.disabled = true;
    const prevLabel = notesSave.textContent;
    notesSave.textContent = 'Adding…';
    try {
      await addStickyNote(clientId, text);
      resetNoteComposer();
      // Only refresh if we're still on the same client the user posted to.
      if (activeClientId === clientId) await loadStickyNotesPane(clientId);
    } catch (err) {
      showStickyNotesStatus(
        err.code === 'unauthorized' ? 'Sign in to the dashboard first'
        : err.code === 'unconfigured' ? 'Setup required'
        : 'Failed to add note',
        true,
      );
    } finally {
      notesSave.disabled = false;
      notesSave.textContent = prevLabel;
    }
  }

  notesSave.addEventListener('click', submitNote);
  // Cmd/Ctrl+Enter submits from the textarea.
  notesInput.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submitNote();
    }
  });

  // ── Quick-launch buttons. Calendar, Tasks, and Projects all open in-popup
  // views (no new tab) — a compact agenda, the signed-in user's assigned
  // subtasks, and every active project respectively.
  document.getElementById('open-calendar').addEventListener('click', () => { void showCalendarView(); });
  document.getElementById('open-tasks').addEventListener('click', () => { void showTasksView(); });
  document.getElementById('open-projects').addEventListener('click', () => { void showProjectsView(); });
  document.getElementById('projects-back').addEventListener('click', backFromProjects);
  document.getElementById('tasks-back').addEventListener('click', backFromTasks);
  document.getElementById('calendar-back').addEventListener('click', backFromCalendar);

  // Calendar month navigation.
  document.getElementById('cal-prev').addEventListener('click', () => calNavigate(-1));
  document.getElementById('cal-next').addEventListener('click', () => calNavigate(1));
  document.getElementById('cal-today').addEventListener('click', calGoToday);

  // Warm the Tasks + Calendar caches in the background as soon as the popup
  // opens, so those views paint instantly (and stay fresh) when clicked.
  prewarmViewCaches();

  // If a client detail was open when the popup last closed, reopen it so the
  // user lands right back where they were instead of the search screen.
  void readLastClient().then(stub => { if (stub) void showClientDetail(stub, 'search'); });

  // ── Detail-header search: switch to another client without going back ──
  // Behaves exactly like the main search bar — same rich result rows (contact
  // match, warehouse/agent meta via renderResults), arrow-key navigation, and
  // Enter opens the highlighted (top-by-default) result.
  const detailSearchInput = document.getElementById('detail-search-input');
  const detailSearchResults = document.getElementById('detail-search-results');
  if (detailSearchInput && detailSearchResults) {
    let dsResults = [];
    let dsActiveIdx = -1;
    const closeDetailSearch = () => {
      detailSearchResults.hidden = true;
      detailSearchResults.innerHTML = '';
      dsResults = [];
      dsActiveIdx = -1;
    };
    const openDetailResult = client => {
      if (!client) return;
      detailSearchInput.value = '';
      closeDetailSearch();
      void showClientDetail(client, 'search');
    };
    const runDetailSearch = debounce(async () => {
      const q = detailSearchInput.value.trim();
      if (!q) { closeDetailSearch(); return; }
      await ensureIndex();
      if (!clientIndex) { closeDetailSearch(); return; }
      dsResults = filterClients(clientIndex, q, 6);
      dsActiveIdx = dsResults.length > 0 ? 0 : -1;
      renderResults(dsResults, detailSearchResults, dsActiveIdx);
    }, 80);
    detailSearchInput.addEventListener('input', runDetailSearch);
    detailSearchInput.addEventListener('focus', () => { void ensureIndex(); });
    detailSearchInput.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dsResults.length === 0) return;
        dsActiveIdx = Math.min(dsActiveIdx + 1, dsResults.length - 1);
        renderResults(dsResults, detailSearchResults, dsActiveIdx);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dsResults.length === 0) return;
        dsActiveIdx = Math.max(dsActiveIdx - 1, 0);
        renderResults(dsResults, detailSearchResults, dsActiveIdx);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (dsActiveIdx >= 0 && dsResults[dsActiveIdx]) openDetailResult(dsResults[dsActiveIdx].c);
      } else if (e.key === 'Escape') {
        detailSearchInput.value = '';
        closeDetailSearch();
      }
    });
    detailSearchResults.addEventListener('click', e => {
      const li = e.target.closest('li[data-client-id]');
      if (!li) return;
      const id = li.getAttribute('data-client-id');
      const hit = dsResults.find(r => r.c.id === id);
      if (hit) openDetailResult(hit.c);
    });
    // Close the dropdown on outside click.
    document.addEventListener('click', e => { if (!e.target.closest('.detail-search')) closeDetailSearch(); });
  }

  // Tasks Outstanding/Done toggle.
  document.getElementById('tasks-tab-open').addEventListener('click', () => setTasksFilterMode('open'));
  document.getElementById('tasks-tab-done').addEventListener('click', () => setTasksFilterMode('done'));

  // "+ New" in the Projects view header opens the composer with an editable
  // client field; on success the active-projects list reloads.
  const projectsNewBtn = document.getElementById('projects-new');
  if (projectsNewBtn) {
    projectsNewBtn.addEventListener('click', () => {
      void openProjectComposer({ lockClient: false, onCreated: () => showProjectsView() });
    });
  }

  // ── Project composer modal wiring ─────────────────────────────────────
  const pcOverlay = document.getElementById('project-composer');
  document.getElementById('pc-close').addEventListener('click', closeProjectComposer);
  document.getElementById('pc-cancel').addEventListener('click', closeProjectComposer);
  document.getElementById('pc-create').addEventListener('click', () => { void submitProjectComposer(); });
  // Click the dimmed backdrop (but not the modal card) to dismiss.
  pcOverlay.addEventListener('click', e => { if (e.target === pcOverlay) closeProjectComposer(); });
  // Enter in the name field submits; Escape anywhere in the modal closes it.
  document.getElementById('pc-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); void submitProjectComposer(); }
  });
  pcOverlay.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeProjectComposer(); }
  });

  // ── Mini Apps tiles. Each .tile carries data-app pointing at a
  // MINI_APPS registry entry. External tiles open their URL directly,
  // CSV Order Formatter deep-links the dashboard's mini-apps tab.
  document.getElementById('open-all-apps').addEventListener('click', () => {
    openPath('/customer-service?view=apps');
  });
  document.querySelectorAll('.mini-apps-grid .tile').forEach(btn => {
    btn.addEventListener('click', () => {
      const appId = btn.getAttribute('data-app');
      const entry = appId ? MINI_APPS[appId] : null;
      if (!entry) return;
      if ('external' in entry) {
        openExternal(entry.external);
      } else if ('dashPath' in entry) {
        openPath(entry.dashPath);
      }
    });
  });

});
