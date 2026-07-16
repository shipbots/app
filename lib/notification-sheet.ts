/**
 * Mirror address-hold notification e-mails into a Google Sheet.
 *
 * The Monday.com column write stays the PRIMARY process and is unchanged — this
 * is a purely additive side-effect. We POST to a Google Apps Script Web App
 * bound to the user's sheet; the script appends a row. Configured via env:
 *
 *   NOTIFICATION_SHEET_WEBHOOK_URL     — the Apps Script "/exec" deployment URL
 *   NOTIFICATION_SHEET_WEBHOOK_SECRET  — optional shared secret the script checks
 *
 * If the URL isn't set this is a no-op, so the notification flow keeps working
 * everywhere the sheet integration hasn't been provisioned yet.
 */

export function isNotificationSheetConfigured(): boolean {
  return !!process.env.NOTIFICATION_SHEET_WEBHOOK_URL;
}

export interface NotificationRowInput {
  /** ShipHero (QB display) name of the client. */
  shipHeroName: string;
  /** Comma-separated e-mail addresses that were added to the notification. */
  emails: string;
}

/**
 * Append one row to the configured Google Sheet. Resolves `{ appended: false }`
 * when the webhook isn't configured; throws only on a real HTTP failure so the
 * caller can log it (the Monday save has already succeeded regardless).
 */
export async function appendNotificationRow(
  input: NotificationRowInput,
): Promise<{ appended: boolean }> {
  const url = process.env.NOTIFICATION_SHEET_WEBHOOK_URL;
  if (!url) return { appended: false };
  const secret = process.env.NOTIFICATION_SHEET_WEBHOOK_SECRET ?? '';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      shipHeroName: input.shipHeroName ?? '',
      emails: input.emails ?? '',
      at: new Date().toISOString(),
    }),
    // Apps Script "/exec" 302-redirects to script.googleusercontent.com — follow it.
    redirect: 'follow',
    cache: 'no-store',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`notification sheet webhook ${res.status}: ${body.slice(0, 200)}`);
  }
  return { appended: true };
}
