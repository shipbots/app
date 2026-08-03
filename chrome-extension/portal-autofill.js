// ShipBots portal auto-fill (content script).
//
// Runs on the client portal (shipsfor.us). When a rep clicks "Open & sign in"
// in the extension popup, the popup stashes that client's portal credentials in
// chrome.storage.session and opens the portal's logout URL (which clears any
// existing session and lands on the login form). This script reads the stashed
// credentials and fills the email + password fields so the rep just clicks
// "Sign in" — it does NOT auto-submit, so a wrong value can't trigger a lockout.
//
// The credentials are one-shot: cleared as soon as they're filled, and they
// carry a short TTL so a stale stash is never reused. Session storage is
// memory-only (gone when the browser closes) and never exposed to the page.

(function () {
  const KEY = 'portalAutofillV1';
  const MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes
  const MAX_TRIES = 20;             // ~6s of retries while the form renders

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function pick(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (isVisible(el)) return el;
    }
    return null;
  }

  function findLoginField() {
    return pick([
      'input[name="login"]',            // django-allauth
      '#id_login',
      'input[name="email"]', '#id_email', '#email',
      'input[name="username"]', '#id_username', '#username',
      'input[type="email"]',
      'input[autocomplete="username"]',
    ]);
  }

  function findPasswordField() {
    return pick([
      'input[type="password"]',
      'input[name="password"]', '#id_password', '#id_password1', '#password',
    ]);
  }

  // Set a value in a way framework-bound inputs (React/Vue) also register.
  function setValue(el, val) {
    try {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
      if (setter) setter.call(el, val); else el.value = val;
    } catch { el.value = val; }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function tryFill(creds) {
    const loginEl = findLoginField();
    const passEl = findPasswordField();
    if (!loginEl && !passEl) return false;
    if (loginEl && creds.login) setValue(loginEl, creds.login);
    if (passEl && creds.password) setValue(passEl, creds.password);
    // Leave the cursor on the submit-ready field; the rep clicks Sign in.
    try { (passEl || loginEl).focus(); } catch { /* ignore */ }
    return true;
  }

  function run() {
    let store;
    try { store = chrome.storage && chrome.storage.session; } catch { return; }
    if (!store) return;
    store.get(KEY, res => {
      const creds = res && res[KEY];
      if (!creds || (!creds.login && !creds.password)) return;
      if (creds.at && Date.now() - creds.at > MAX_AGE_MS) {
        try { store.remove(KEY); } catch { /* ignore */ }
        return;
      }
      let tries = 0;
      const attempt = () => {
        if (tryFill(creds)) { try { store.remove(KEY); } catch { /* ignore */ } return; }
        if (++tries < MAX_TRIES) setTimeout(attempt, 300);
      };
      attempt();
    });
  }

  run();
})();
