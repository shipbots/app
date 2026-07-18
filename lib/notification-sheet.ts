/**
 * Mirror address-hold notification e-mails into a Google Sheet.
 *
 * The Monday.com column write stays the PRIMARY process and is unchanged — this
 * is a purely additive side-effect. We POST to a Google Apps Script Web App
 * bound to the user's sheet; the script keeps ONE consolidated row per client
 * (ShipHero name + comma-separated e-mails). Configured via env:
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

export interface NotificationSheetInput {
  /**
   * 'sync' replaces the client's row with the full current recipient list (one
   * consolidated, comma-separated row per client) — what the app sends on every
   * change. 'add'/'remove' are legacy delta operations kept for compatibility.
   */
  action: 'add' | 'remove' | 'sync';
  /** ShipHero (QB display) name of the client — the row key. */
  shipHeroName: string;
  /**
   * Comma-separated e-mail addresses. For 'sync' this is the client's FULL
   * current recipient list (empty clears the client's row); for 'add'/'remove'
   * it's the delta.
   */
  emails: string;
}

/**
 * Mirror an add/remove to the configured Google Sheet so it reflects the
 * current notification recipients. Resolves `{ sent: false }` when the webhook
 * isn't configured; throws only on a real HTTP failure so the caller can log it
 * (the Monday save has already succeeded regardless).
 */
export async function sendNotificationSheet(
  input: NotificationSheetInput,
): Promise<{ sent: boolean }> {
  const url = process.env.NOTIFICATION_SHEET_WEBHOOK_URL;
  if (!url) return { sent: false };
  const secret = process.env.NOTIFICATION_SHEET_WEBHOOK_SECRET ?? '';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret,
      action: input.action,
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
  return { sent: true };
}
