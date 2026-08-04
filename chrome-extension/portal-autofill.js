// ShipBots portal auto-fill (content script).
//
// Runs on the client portal (shipsfor.us). When a rep clicks "Open & sign in"
// in the extension popup, the popup stashes that client's portal credentials in
// chrome.storage.session and opens the portal's logout URL (which clears any
// existing session and lands on the login form). This script reads the stashed
// credentials, fills the email + password fields, and submits the form — a true
// one-click sign-in. It only submits once the password field is present, so a
// half-rendered or email-first page is never submitted prematurely.
//
// The credentials are one-shot: cleared as soon as the form is submitted, and
// they carry a short TTL so a stale stash is never reused. Session storage is
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

  // Find the button that submits the login form, scoped to the form when
  // possible so we don't click an unrelated button elsewhere on the page.
  function findSubmitControl(form) {
    if (form) {
      const direct = form.querySelector('button[type="submit"], input[type="submit"]');
      if (isVisible(direct)) return direct;
    }
    const root = form || document;
    const candidates = Array.from(root.querySelectorAll('button, input[type="submit"], input[type="button"]'));
    return candidates.find(b => {
      if (!isVisible(b)) return false;
      const t = ((b.textContent || '') + ' ' + (b.value || '')).trim().toLowerCase();
      return /\b(sign in|signin|log ?in|continue|next|submit)\b/.test(t);
    }) || null;
  }

  function submitForm(anchorEl) {
    const form = anchorEl && anchorEl.form;
    const btn = findSubmitControl(form);
    if (btn) { btn.click(); return; }
    if (form) {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.submit();
    }
  }

  // 'submitted' → password filled + form submitted (done);
  // 'waiting'   → password field not present yet, keep retrying;
  // 'none'      → no login form on this page at all.
  function tryFillAndSubmit(creds) {
    const loginEl = findLoginField();
    const passEl = findPasswordField();
    if (!loginEl && !passEl) return 'none';
    if (loginEl && creds.login) setValue(loginEl, creds.login);
    // Only submit once the password field is present — never submit a half-filled
    // form (e.g. the email-first step of a two-step flow, or a still-rendering
    // page). On a two-step portal the password step reloads this script, which
    // then fills + submits there.
    if (!passEl) return 'waiting';
    if (creds.password) setValue(passEl, creds.password);
    // Let the input/change handlers settle for a tick, then submit.
    setTimeout(() => { try { submitForm(passEl); } catch { /* ignore */ } }, 60);
    return 'submitted';
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
        if (tryFillAndSubmit(creds) === 'submitted') {
          try { store.remove(KEY); } catch { /* ignore */ }
          return;
        }
        if (++tries < MAX_TRIES) setTimeout(attempt, 300);
      };
      attempt();
    });
  }

  run();
})();
