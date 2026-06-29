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

function setBaseUrl(url) {
  return new Promise(resolve => {
    chrome.storage.local.set({ baseUrl: url.replace(/\/+$/, '') }, resolve);
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
  const baseUrlEl = document.getElementById('base-url');
  const editUrlBtn = document.getElementById('edit-url');
  const urlForm = document.getElementById('url-form');
  const urlInput = document.getElementById('url-input');
  const urlCancel = document.getElementById('url-cancel');

  baseUrlEl.textContent = await getBaseUrl();

  // ── Search → opens Customer Service with the query in the search box
  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault();
    const q = document.getElementById('search-input').value.trim();
    // The web app reads `?q=` to pre-fill the kanban search input. For now
    // we still navigate to /customer-service — the deep-link is harmless if
    // the page doesn't yet read it, and we can wire it up in the web app.
    openPath(q ? `/customer-service?q=${encodeURIComponent(q)}` : '/customer-service');
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

  // ── Base URL editor (lets users point at staging without republishing)
  editUrlBtn.addEventListener('click', async () => {
    urlInput.value = await getBaseUrl();
    urlForm.hidden = false;
    editUrlBtn.hidden = true;
    urlInput.focus();
  });
  urlCancel.addEventListener('click', () => {
    urlForm.hidden = true;
    editUrlBtn.hidden = false;
  });
  urlForm.addEventListener('submit', async e => {
    e.preventDefault();
    const newUrl = urlInput.value.trim();
    if (!newUrl) return;
    await setBaseUrl(newUrl);
    baseUrlEl.textContent = await getBaseUrl();
    urlForm.hidden = true;
    editUrlBtn.hidden = false;
  });
});
