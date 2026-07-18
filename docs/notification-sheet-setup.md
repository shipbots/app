# Address-Hold Notification → Google Sheet

When notification e-mails change for a client (the "Address Hold Notification
E-mail(s)" flow), the app mirrors the current recipients to a Google Sheet as
**one consolidated row per client** — the **ShipHero name** in column A and all
that client's e-mails **comma-separated** in column B. Every change re-syncs the
full list, so removing an e-mail leaves only the ones still checked, and turning
the notification off clears the client's row. The Monday.com column write is
unchanged, and the sheet integration silently no-ops until the webhook below is
configured.

Target sheet:
`https://docs.google.com/spreadsheets/d/1OvvO90JQgJ2r4DHSA6hI9aWpX9w-EULUQVO3l2dpSOE/edit`

## One-time setup (≈5 minutes)

### 1. Add the Apps Script to the sheet
1. Open the sheet → **Extensions → Apps Script**.
2. Delete the placeholder and paste the script below (`Code.gs`).
3. (Optional) set `SHARED_SECRET` to any random string — it must match the env
   var in step 4. Leave it `''` to skip the check.
4. (Optional) change `SHEET_NAME` if you want a specific tab; otherwise it uses
   the first tab and appends after any existing rows.
5. **Save**.

### 2. Deploy as a Web App
1. **Deploy → New deployment → ⚙️ → Web app**.
2. Description: `ShipBots notification logger`.
3. **Execute as:** *Me* (so it can write your sheet).
4. **Who has access:** *Anyone* (the request is unauthenticated but guarded by
   the optional secret — no sheet data is ever exposed, it only appends).
5. **Deploy**, authorize when prompted, and **copy the Web app URL** (ends in
   `/exec`).

### 3. Add the env vars (Vercel → Project → Settings → Environment Variables)
```
NOTIFICATION_SHEET_WEBHOOK_URL     = <the /exec URL from step 2>
NOTIFICATION_SHEET_WEBHOOK_SECRET  = <same value as SHARED_SECRET, or omit>
```
Redeploy. Done — add an e-mail to a client's notifications and a row appears.

> Re-deploying the Apps Script (New deployment) changes the `/exec` URL — update
> the env var if you ever redeploy it.

---

## `Code.gs`

```javascript
// ShipBots — Address Hold Notification logger.
// Keeps ONE consolidated row per client: { ShipHero name, comma-separated
// e-mails, timestamp }. The app sends the full current recipient list on every
// change ('sync'), so the sheet always mirrors exactly who is checked.

const SHEET_NAME = '';        // '' = first tab. Or set a specific tab name.
const SHARED_SECRET = '';     // must match NOTIFICATION_SHEET_WEBHOOK_SECRET (or '' to disable)

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SHARED_SECRET && data.secret !== SHARED_SECRET) return json_({ ok: false, error: 'unauthorized' });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = (SHEET_NAME && ss.getSheetByName(SHEET_NAME)) || ss.getSheets()[0];

    const name = String(data.shipHeroName || '').trim();
    const emails = String(data.emails || '')
      .split(',').map(function (s) { return s.trim(); }).filter(String);
    const action = data.action || 'sync';
    const at = data.at || new Date().toISOString();

    // 'sync' (the app's normal path) replaces the client's row with the full
    // current list — one consolidated, comma-separated row. Passing no e-mails
    // clears the client. 'remove'/'add' are legacy deltas kept for compatibility.
    if (action === 'remove') {
      return json_({ ok: true, action: 'remove', removed: removeRows_(sheet, name, emails) });
    }
    if (action === 'add') {
      emails.forEach(function (email) { sheet.appendRow([name, email, at]); });
      return json_({ ok: true, action: 'add', added: emails.length });
    }
    return json_({ ok: true, action: 'sync', recipients: syncClient_(sheet, name, emails, at) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Full replace for ONE client: the sheet keeps exactly one row per ShipHero name,
// with every current recipient comma-separated in col B. Deletes the client's
// existing rows (matched by name, case-insensitive) — plus any nameless legacy
// row whose e-mails are ALL in this set, so old one-per-e-mail rows fold in — then
// writes a single consolidated row when any recipients remain. No e-mails => the
// client's row is removed. A different client's addresses are never touched.
function syncClient_(sheet, name, emails, at) {
  const wantName = String(name || '').trim().toLowerCase();
  if (!wantName) return 0; // no client key — nothing to target
  const set = {};
  emails.forEach(function (e) { set[e.toLowerCase()] = true; });
  const values = sheet.getDataRange().getValues();
  for (let r = values.length - 1; r >= 0; r--) { // bottom-up so indices stay valid
    const rowName = String(values[r][0] || '').trim().toLowerCase();
    const cell = String(values[r][1] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    const foldableBlank = rowName === '' && cell.length > 0 &&
      cell.every(function (em) { return set[em.toLowerCase()]; });
    if (rowName === wantName || foldableBlank) sheet.deleteRow(r + 1);
  }
  if (emails.length > 0) sheet.appendRow([name, emails.join(', '), at]);
  return emails.length;
}

// Delete rows whose e-mail cell (col B) contains one of the removed e-mails and
// whose ShipHero name (col A) matches — OR is blank. Matching blank-name rows
// lets us clean up legacy rows that were written before a ShipHero Name was
// required; a *different* client's named row is never touched. If a row lists
// several e-mails, only the removed one is stripped; the row is deleted when none
// remain.
function removeRows_(sheet, name, emailsToRemove) {
  if (emailsToRemove.length === 0) return 0;
  const wantName = String(name || '').trim().toLowerCase();         // case-insensitive name match
  const remove = emailsToRemove.map(function (x) { return x.toLowerCase(); });
  const values = sheet.getDataRange().getValues();
  let count = 0;
  for (let r = values.length - 1; r >= 0; r--) { // bottom-up so indices stay valid
    const rowName = String(values[r][0] || '').trim().toLowerCase();
    if (rowName !== wantName && rowName !== '') continue; // this client's rows, or nameless legacy rows
    const cell = String(values[r][1] || '').split(',').map(function (s) { return s.trim(); }).filter(String);
    const kept = cell.filter(function (em) { return remove.indexOf(em.toLowerCase()) === -1; });
    if (kept.length === cell.length) continue; // nothing to remove in this row
    count++;
    if (kept.length === 0) sheet.deleteRow(r + 1);
    else sheet.getRange(r + 1, 2).setValue(kept.join(', '));
  }
  return count;
}

// Opening the /exec URL in a browser hits this (a health check). The dashboard
// uses doPost; seeing this JSON means the deployment is live and reachable.
function doGet() {
  return json_({ ok: true, service: 'shipbots-notification-logger', hint: 'POST only' });
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## Troubleshooting

- **Browser shows `Script function not found: doGet`** — normal for the original
  POST-only script; it means the URL is live. Add the `doGet` above and it'll
  show `{"ok":true,...}` instead.
- **`Access blocked: Authorization Error` / `The OAuth client is not fully
  created yet` / `Error 401: invalid_client`** — a Google-side propagation delay
  when the deployment's OAuth client is first created. It's transient: **wait
  ~5–10 minutes, then retry** *Deploy → Manage deployments → Edit → Deploy*, or
  re-run authorization (**Run** the `doPost`/`doGet` function once in the editor
  and click **Review permissions → Allow**). The URL/setup are fine; Google just
  needs a few minutes.
- After it authorizes once (granting access to the spreadsheet), the POST from
  the app can write rows. If a POST ever returns an auth error, re-run the
  authorization step above.
- **A removed e-mail isn't leaving the sheet (`removed:0`)** — the row's name
  cell (col A) doesn't match the ShipHero name the app sends. Almost always the
  row was written *before* ShipHero Name was required, so its name cell is blank.
  The `removeRows_` above already handles this (it also matches blank-name rows) —
  make sure the deployed version is current: **Deploy → Manage deployments → ✏️
  Edit → Version: New version → Deploy** (same `/exec` URL, so no env-var change).
  If a stray row has a *non-blank but wrong* name (e.g. the client was renamed
  after the row was written), delete that row by hand once.
- **Verify a deploy from the terminal** without touching the UI — POST a `sync`
  with two e-mails (one consolidated row), then a `sync` with one (it collapses
  back to a single address), and read the JSON (note: no `-X POST`, so curl
  switches to GET on Apps Script's 302 the same way the app's `fetch` does):
  ```bash
  URL="…/exec"
  curl -sSL -H "Content-Type: application/json" \
    -d '{"action":"sync","shipHeroName":"ZZ-TEST","emails":"a@x.com, b@x.com"}' "$URL"
  curl -sSL -H "Content-Type: application/json" \
    -d '{"action":"sync","shipHeroName":"ZZ-TEST","emails":"a@x.com"}' "$URL"
  curl -sSL -H "Content-Type: application/json" \
    -d '{"action":"sync","shipHeroName":"ZZ-TEST","emails":""}' "$URL"   # clears the row
  ```
  A working deploy returns `{"ok":true,"action":"sync","recipients":2}`, then
  `…"recipients":1`, then `…"recipients":0` — and the sheet holds one `ZZ-TEST`
  row that shows `a@x.com, b@x.com` → `a@x.com` → gone.
