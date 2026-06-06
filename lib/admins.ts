/**
 * Admin-role source of truth.
 *
 * v1 storage: comma-separated emails in the ADMIN_EMAILS env var. Defaults
 * to andres@shipbots.com + payam@shipbots.com so the app boots correctly
 * even before the env var is set.
 *
 * To add an admin in production: set ADMIN_EMAILS in Vercel → Settings →
 * Environment Variables (Production + Preview + Development) and redeploy.
 *
 * v2 enhancement: back this with a persistent store (Vercel KV / Blob / a
 * Monday board item) so the Settings UI can mutate the list at runtime.
 * The seed env var should keep working as a bootstrap fallback.
 */

const DEFAULT_ADMINS = ['andres@shipbots.com', 'payam@shipbots.com'];

/** Returns the current admin email allowlist, all lowercased. */
export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return [...DEFAULT_ADMINS];
  const list = raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  // Always include the two bootstrap admins even if the env var doesn't —
  // protects against accidentally locking everyone out.
  for (const seed of DEFAULT_ADMINS) {
    if (!list.includes(seed)) list.push(seed);
  }
  return list;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
