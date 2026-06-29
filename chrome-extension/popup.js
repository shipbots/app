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
    openPath(`/customer-service?clientId=${encodeURIComponent(client.id)}`);
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
