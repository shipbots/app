// ShipBots Customer Service — popup logic
//
// The popup opens the dashboard in a new tab. Most actions just deep-link
// into a known path on the deployed app; the actual UI lives in the web app
// (the user's existing Google session carries over).
//
// The base URL is stored in chrome.storage.local so individual users can
// point at staging / a preview deployment without re-publishing the extension.

const DEFAULT_BASE_URL = 'https://app-snowy-eight-64.vercel.app';

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
function matchScore(client, query) {
  const q = query.toLowerCase();
  const fields = [client.name, client.shipHeroName, client.storeName, client.legalEntity, client.contactEmail, client.contactName]
    .filter(Boolean)
    .map(s => String(s).toLowerCase());
  let best = -1;
  for (const f of fields) {
    if (!f.includes(q)) continue;
    // Lower index = better. Name field counts double.
    const idx = f.indexOf(q);
    const score = idx === 0 ? 1000 - idx : 100 - idx;
    if (score > best) best = score;
  }
  // Bonus when the name field hits at all.
  const nameLower = String(client.name || '').toLowerCase();
  if (nameLower.includes(q)) best += 50;
  return best;
}

function filterClients(clients, query, limit = 8) {
  const q = query.trim();
  if (!q) return [];
  return clients
    .map(c => ({ c, score: matchScore(c, q) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.c);
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
  results.forEach((client, i) => {
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

    const metaParts = [];
    if (client.contactEmail) metaParts.push(client.contactEmail);
    else if (client.contactName) metaParts.push(client.contactName);
    if (client.warehouse) metaParts.push(`<span class="warehouse">${escapeHtml(client.warehouse)}</span>`);

    if (metaParts.length > 0) {
      const meta = document.createElement('div');
      meta.className = 'search-result-meta';
      meta.innerHTML = metaParts.join(' · ');
      li.appendChild(meta);
    }
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
      if (!fieldHasValue(client, field)) continue;
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
  if (pills.childElementCount > 0) sectionsEl.appendChild(pills);

  for (const section of DETAIL_SECTIONS) {
    sectionsEl.appendChild(buildSection(section, client));
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

  // Header placeholders fill from search-index right away so the user sees
  // something while the full fetch runs.
  document.getElementById('detail-name').textContent = clientStub.name || '(unnamed)';
  document.getElementById('detail-meta').textContent =
    [clientStub.contactEmail, clientStub.warehouse].filter(Boolean).join(' · ');
  sectionsEl.innerHTML = '';
  statusEl.hidden = false;
  statusEl.classList.remove('error');
  statusEl.textContent = 'Loading client info…';

  openBtn.onclick = () => openPath(`/customer-service?clientId=${encodeURIComponent(clientStub.id)}`);

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
  document.getElementById('client-detail').hidden = true;
  document.getElementById('search-view').hidden = false;
  document.getElementById('search-input').focus();
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

  async function ensureIndex() {
    if (clientIndex || indexError) return;
    showStatus('Loading clients…');
    try {
      clientIndex = await fetchClientIndex();
      showStatus('');
    } catch (err) {
      indexError = err;
      if (err.code === 'unauthorized') {
        showStatus('Sign in at the dashboard first, then reopen this popup.', true);
      } else {
        showStatus(`Couldn't load clients (${err.message || 'network error'}).`, true);
      }
    }
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
      openSelectedClient(activeResults[activeIdx]);
      return;
    }
    const q = searchInput.value.trim();
    openPath(q ? `/customer-service?q=${encodeURIComponent(q)}` : '/customer-service');
  });

  searchResults.addEventListener('click', e => {
    const li = e.target.closest('li[data-client-id]');
    if (!li) return;
    const id = li.getAttribute('data-client-id');
    const client = activeResults.find(c => c.id === id);
    openSelectedClient(client);
  });

  // Eager-load the index in the background so the first keystroke is
  // instant rather than waiting on a round-trip.
  void ensureIndex();

  // ── Detail view: Back button returns to search ────────────────────────
  document.getElementById('detail-back').addEventListener('click', backToSearch);

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
