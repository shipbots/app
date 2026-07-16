# Address-Hold Notification → Google Sheet

When notification e-mails are **added** to a client (the "Address Hold
Notification E-mail(s)" flow), the app also appends a row to a Google Sheet with
the client's **ShipHero name** and the **e-mails that were added**. The Monday.com
column write is unchanged — this is purely additive and silently no-ops until the
webhook below is configured.

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
// Appends { ShipHero name, e-mails } rows sent by the dashboard.

const SHEET_NAME = '';        // '' = first tab. Or set a specific tab name.
const SHARED_SECRET = '';     // must match NOTIFICATION_SHEET_WEBHOOK_SECRET (or '' to disable)

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (SHARED_SECRET && data.secret !== SHARED_SECRET) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = (SHEET_NAME && ss.getSheetByName(SHEET_NAME)) || ss.getSheets()[0];

    // Columns appended: ShipHero name, e-mails, and the timestamp.
    // Reorder / drop fields here to match your sheet's columns if needed.
    sheet.appendRow([
      data.shipHeroName || '',
      data.emails || '',
      data.at || new Date().toISOString(),
    ]);

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```
