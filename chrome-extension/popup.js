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
  return clients
    .map(c => {
      const m = matchScore(c, q);
      return m ? { ...m, c } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
    const meta = document.createElement('div');
    meta.className = 'search-result-meta';
    if (isContactMatch) {
      const matchedSpan = document.createElement('span');
      matchedSpan.className = 'matched';
      matchedSpan.textContent = value;
      meta.appendChild(matchedSpan);
      const tag = document.createElement('span');
      tag.className = 'matched-tag';
      tag.textContent = field.contact === 1 ? 'primary' : `contact ${field.contact}`;
      meta.appendChild(tag);
      if (client.warehouse) {
        const sep = document.createElement('span');
        sep.textContent = '·';
        sep.style.color = '#9ca3af';
        meta.appendChild(sep);
        const wh = document.createElement('span');
        wh.className = 'warehouse';
        wh.textContent = client.warehouse;
        meta.appendChild(wh);
      }
    } else {
      const metaParts = [];
      if (client.contactEmail) metaParts.push(client.contactEmail);
      else if (client.contactName) metaParts.push(client.contactName);
      if (client.warehouse) metaParts.push(`<span class="warehouse">${escapeHtml(client.warehouse)}</span>`);
      if (metaParts.length > 0) meta.innerHTML = metaParts.join(' · ');
    }
    if (meta.childNodes.length > 0 || meta.innerHTML) li.appendChild(meta);
    container.appendChild(li);
  });
  container.hidden = false;
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
const DETAIL_SECTIONS = [
  {
    id: 'general',
    title: 'General Account Info',
    fields: [
      { key: 'legalEntity',          label: 'Legal entity' },
      { key: 'ein',                  label: 'EIN' },
      { key: 'quickbooksName',       label: 'QuickBooks' },
      { key: 'shipHeroId',           label: 'ShipHero ID' },
      { key: 'shipHeroName',         label: 'ShipHero name' },
      { key: 'productCategory',      label: 'Category' },
      { key: 'productDescription',   label: 'Products' },
      { key: 'businessHQ',           label: 'HQ' },
      { key: 'manufacturingLocation',label: 'Mfg location' },
      { key: 'umbrellaCompany',      label: 'Umbrella co.' },
      { key: 'clientStatus',         label: 'Status' },
      { key: 'invoicingEmail',       label: 'Invoicing',  type: 'email' },
      { key: 'paymentOnFile',        label: 'Payment OF' },
      { key: 'pricingProposal',      label: 'Pricing',    type: 'link' },
      { key: 'dateDocusignSigned',   label: 'Signed' },
    ],
  },
  {
    id: 'contacts',
    title: 'Contacts',
    custom: 'renderContacts',
  },
  {
    id: 'billing',
    title: 'Billing Address',
    fields: [
      { key: 'billingStreet1', label: 'Street 1' },
      { key: 'billingStreet2', label: 'Street 2' },
      { key: 'billingCity',    label: 'City' },
      { key: 'billingState',   label: 'State' },
      { key: 'billingZip',     label: 'Zip' },
      { key: 'billingCountry', label: 'Country' },
    ],
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
    title: 'Packing & Shipping',
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
    title: 'Returns',
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
    id: 'portal',
    title: 'ShipBots Portal Login',
    fields: [
      { key: 'portalDropdown',  label: 'Platform' },
      { key: 'portalEmail',     label: 'Email', type: 'email' },
      { key: 'portalLogin',     label: 'Username' },
      { key: 'portalPassword',  label: 'Password' },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    fields: [
      { key: 'supportAgent',      label: 'Agent' },
      { key: 'supportAgentEmail', label: 'Agent email', type: 'email' },
      { key: 'hubspotDealLink',   label: 'HubSpot', type: 'rawUrl' },
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

function buildSection(section, client) {
  const wrap = document.createElement('div');
  wrap.className = 'detail-section';

  const header = document.createElement('button');
  header.className = 'detail-section-header';
  header.type = 'button';
  header.setAttribute('aria-expanded', 'false');
  const title = document.createElement('span');
  title.className = 'detail-section-title';
  title.textContent = section.title;
  const chev = document.createElement('span');
  chev.className = 'detail-section-chev';
  chev.textContent = '›';
  header.appendChild(title);
  header.appendChild(chev);

  const body = document.createElement('dl');
  body.className = 'detail-section-body';
  body.hidden = true;

  if (section.custom === 'renderContacts') {
    buildContactsBody(body, client);
  } else {
    let any = false;
    for (const field of section.fields) {
      const hasValue = fieldHasValue(client, field);
      // Read-only display: skip empty fields entirely. Editing happens
      // in the dashboard (Edit ↗ button in the detail header); the
      // extension shows only what's on file, no inline edit affordances
      // or "+ Add" placeholders. Cleaner scanning, no accidental
      // overwrites from within the popup.
      if (!hasValue) continue;
      const dt = document.createElement('dt');
      dt.textContent = field.label;
      const dd = document.createElement('dd');
      dd.appendChild(renderField(client, field));
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
      empty.textContent = 'No data on file.';
      body.appendChild(empty);
    }
  }

  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    body.hidden = expanded;
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  return wrap;
}

function buildContactsBody(body, client) {
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
      card.appendChild(ln);
    }
    if (slot.phone) {
      const ln = document.createElement('div');
      ln.className = 'detail-contact-line';
      const a = document.createElement('a');
      a.href = `tel:${slot.phone.replace(/[^\d+]/g, '')}`;
      a.textContent = slot.phone;
      ln.appendChild(a);
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

  // Attach the Documents section BEFORE the field sections so reps
  // spot uploaded files without scrolling. Injects an empty
  // collapsible placeholder immediately, then fires a background
  // fetch that populates or removes it based on the response.
  const docsWrap = buildDocumentsSectionShell();
  sectionsEl.appendChild(docsWrap);

  const fieldSections = [];
  for (const section of DETAIL_SECTIONS) {
    const wrap = buildSection(section, client);
    fieldSections.push({ section, wrap });
    sectionsEl.appendChild(wrap);
  }

  // Fetch files + links once, distribute them into their owning
  // sections (Receiving / Packing / Returns get their docs at the top
  // of their own section body + a 📎 badge), and keep only general /
  // uncategorized docs in the top "Documents" section. DocuSign never
  // appears here — it lives on the onboarding board's files column,
  // which none of these endpoints read.
  void loadClientDocs(docsWrap, client.id, fieldSections);
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
  // Insert before the chevron so title + badge sit on the left group.
  const chev = header.querySelector('.detail-section-chev');
  if (chev) header.insertBefore(badge, chev); else header.appendChild(badge);
}

// ── Client documents ────────────────────────────────────────────────
// Read-only mirror of the dashboard's docs. Files (Monday file
// columns) and links (docs long_text column) are fetched together and
// distributed: section-owned docs render inside their own section
// (Receiving / Packing / Returns) with a 📎 header badge; general /
// uncategorized docs render in the top "Documents" section, which
// hides itself when empty. Storage-unconfigured / auth errors hide
// everything silently — the popup never nags about backend state.

function buildDocumentsSectionShell() {
  const wrap = document.createElement('div');
  wrap.className = 'detail-section';
  const header = document.createElement('button');
  header.className = 'detail-section-header';
  header.type = 'button';
  header.setAttribute('aria-expanded', 'true');
  const title = document.createElement('span');
  title.className = 'detail-section-title';
  title.textContent = 'Documents';
  const chev = document.createElement('span');
  chev.className = 'detail-section-chev';
  chev.textContent = '›';
  header.appendChild(title);
  header.appendChild(chev);

  const body = document.createElement('div');
  body.className = 'detail-section-body detail-docs-body';
  body.hidden = false;
  // Loading pip so the section doesn't appear empty during fetch.
  const loading = document.createElement('p');
  loading.className = 'detail-docs-loading';
  loading.textContent = 'Loading documents…';
  body.appendChild(loading);

  header.addEventListener('click', () => {
    const expanded = header.getAttribute('aria-expanded') === 'true';
    header.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    body.hidden = expanded;
  });

  wrap.appendChild(header);
  wrap.appendChild(body);
  // Stash header + count node so the loader can update the title later.
  wrap._docsHeader = title;
  wrap._docsBody = body;
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

async function loadClientDocs(wrap, clientBoardItemId, fieldSections) {
  if (!clientBoardItemId) { wrap.remove(); return; }
  const body = wrap._docsBody;
  try {
    const base = await getBaseUrl();
    const enc = encodeURIComponent(clientBoardItemId);
    // Files can 503 (storage unconfigured) independently of links;
    // links soft-fail to [] so a docs-column hiccup doesn't hide files.
    const [fileRes, links] = await Promise.all([
      fetch(`${base}/api/client/${enc}/section-files/all`, { credentials: 'include' }),
      fetch(`${base}/api/documents/${enc}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ]);
    if (fileRes.status === 401) { wrap.remove(); return; }
    const files = fileRes.ok ? await fileRes.json() : [];

    // Bucket everything by category. Files default to 'documents';
    // links only count as section docs when they carry a known
    // section category (Docs-tab links stay general).
    const byCat = { documents: [], receiving: [], packing: [], returns: [] };
    for (const f of Array.isArray(files) ? files : []) {
      const cat = SECTION_DOC_CATEGORIES.has(f?.category) ? f.category : 'documents';
      byCat[cat].push({ name: f.name, url: f.url, kind: 'file', assetId: f.assetId });
    }
    for (const l of Array.isArray(links) ? links : []) {
      const cat = SECTION_DOC_CATEGORIES.has(l?.category) ? l.category : 'documents';
      byCat[cat].push({ name: l.name, url: l.url, kind: 'link' });
    }

    // Per-section injection: docs render at the top of their own
    // section's body (span the full dt/dd grid width) + 📎 badge on
    // the collapsed header.
    if (Array.isArray(fieldSections)) {
      for (const { section, wrap: sectionWrap } of fieldSections) {
        const items = SECTION_DOC_CATEGORIES.has(section.id) ? byCat[section.id] : [];
        if (!items.length) continue;
        stampAttachmentBadge(sectionWrap, items.length);
        const sectionBody = sectionWrap.querySelector('.detail-section-body');
        if (!sectionBody) continue;
        const holder = document.createElement('div');
        holder.className = 'detail-docs-inline';
        holder.style.gridColumn = '1 / -1';
        holder.appendChild(renderDocsList(items, clientBoardItemId));
        sectionBody.insertBefore(holder, sectionBody.firstChild);
      }
    }

    // Top Documents section: general docs only. Empty → hide.
    const general = byCat.documents;
    if (!general.length) { wrap.remove(); return; }
    wrap._docsHeader.textContent = `Documents (${general.length})`;
    body.innerHTML = '';
    body.appendChild(renderDocsList(general, clientBoardItemId));
  } catch (err) {
    console.error('[client-docs] load failed', err);
    // Silent fail — read-only surface. The dashboard covers the case.
    wrap.remove();
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

function noteInitials(email) {
  return String(email ?? '').trim().slice(0, 2).toUpperCase();
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
    const initials = noteInitials(note.authorEmail);
    if (date || initials) {
      const meta = document.createElement('div');
      meta.className = 'note-card-meta';
      if (date) {
        const s = document.createElement('span');
        s.textContent = date;
        meta.appendChild(s);
      }
      if (date && initials) {
        const sep = document.createElement('span');
        sep.textContent = '·';
        meta.appendChild(sep);
      }
      if (initials) {
        const s = document.createElement('span');
        s.textContent = initials;
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

async function showClientDetail(clientStub) {
  const searchView = document.getElementById('search-view');
  const detailView = document.getElementById('client-detail');
  const statusEl = document.getElementById('detail-status');
  const sectionsEl = document.getElementById('detail-sections');
  const openBtn = document.getElementById('detail-open');

  searchView.hidden = true;
  detailView.hidden = false;
  // Resize the popup so the sticky-notes column has room. CSS handles the
  // actual width via the body class; Chrome respects the change live.
  document.body.classList.add('detail-open');

  // The user reached here by clicking a search result, which now sits inside
  // the just-hidden search view. Its focus falls back to <body>, and macOS
  // Chrome paints a native focus ring around the WHOLE popup when <body> is
  // focused — a ring CSS `outline:none` can't suppress. Park focus on the
  // (outline-suppressed, tabindex="-1") detail section so it stays on a real,
  // visible element and no whole-popup ring is drawn.
  detailView.focus({ preventScroll: true });

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

  // Remember which client the sticky-note composer should post to, and make
  // sure it starts closed for each newly opened client.
  activeClientId = clientStub.id;
  resetNoteComposer();

  // Kick off sticky notes in parallel with the full client info fetch so
  // the right column populates as soon as Monday returns the column.
  void loadStickyNotesPane(clientStub.id);

  try {
    const client = await fetchClientFull(clientStub.id);
    statusEl.hidden = true;
    renderClientDetail(client);
  } catch (err) {
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
  document.getElementById('client-detail').hidden = true;
  document.getElementById('search-view').hidden = false;
  document.body.classList.remove('detail-open');
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

  // Lazy-loaded once per popup open. Null = not yet attempted.
  let clientIndex = null;
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

  async function ensureIndex() {
    if (clientIndex || indexError) return;
    showStatus('Loading clients…');
    try {
      clientIndex = await fetchClientIndex();
      showStatus('');
    } catch (err) {
      indexError = err;
      if (err.code === 'unauthorized') {
        // Replace the whole search view with a big "Sign in" CTA — the
        // previous behavior asked users to sign in "at the dashboard,
        // then reopen this popup", which was two steps and required
        // knowing WHERE the dashboard was. The button below does it
        // directly + gives them a clear entry point on first install.
        showLoginGate();
      } else {
        showStatus(`Couldn't load clients (${err.message || 'network error'}).`, true);
      }
    }
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

  // ── Quick-launch buttons
  document.getElementById('open-calendar').addEventListener('click', () => openPath('/customer-service?view=calendar'));
  document.getElementById('open-tasks').addEventListener('click', () => openPath('/customer-service?view=tasks'));

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
