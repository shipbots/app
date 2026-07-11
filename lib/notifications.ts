/**
 * E-mail notification registry.
 *
 * Each notification type is backed by two Monday Clients-board columns:
 *   - `enabledColumnId`: a Yes/No dropdown (is this notification on?)
 *   - `emailsColumnId`:   a text column holding the recipient emails,
 *                         comma-separated.
 *
 * The UI (E-mail notifications section + the contact-email interception
 * popups) is driven entirely off this list, so adding a new notification type
 * later is just a new entry here — no other code changes. `notificationColumns`
 * on ClientInfo carries the current value of every column referenced here.
 */

export interface NotificationType {
  key: string;
  label: string;
  /** Yes/No dropdown column on the Clients board. */
  enabledColumnId: string;
  /** Text column holding comma-separated recipient emails. */
  emailsColumnId: string;
}

export const NOTIFICATION_TYPES: NotificationType[] = [
  {
    key: 'addressHold',
    label: 'Address Hold Notification',
    enabledColumnId: 'dropdown_mm54fvq7', // "Address Hold Notification?"
    emailsColumnId: 'text_mm54nq8g', // "Address Hold Notification E-mail(s)"
  },
];

/** Every column id the notification feature reads (enabled + emails). */
export function notificationColumnIds(): string[] {
  return NOTIFICATION_TYPES.flatMap(t => [t.enabledColumnId, t.emailsColumnId]);
}

/** Split a comma-separated email string into a trimmed, non-empty list. */
export function parseEmailList(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
}

/** Join emails back to the stored format, de-duped case-insensitively. */
export function joinEmailList(list: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const e = raw.trim();
    const key = e.toLowerCase();
    if (!e || seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.join(', ');
}

/** The Yes/No dropdown reads as enabled only when it's exactly "Yes". */
export function isNotificationEnabled(value: string | null | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'yes';
}

export function emailsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Lightweight email shape check for the free-form "add email" input. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
