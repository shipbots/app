/**
 * DocuSign feature access — controls who can see and use the DocuSign
 * upload / extract section in a client's Documents tab.
 *
 * Storage: comma-separated emails in the DOCUSIGN_EMAILS env var. Defaults to
 * the initial group below so the feature works before the env var is set.
 *
 * To change the group in production: set DOCUSIGN_EMAILS in Vercel → Settings →
 * Environment Variables (Production + Preview + Development) and redeploy. No
 * code change needed.
 *
 * Membership is stamped onto the session as `canDocusign` in auth.ts (same
 * pattern as [isAdmin]), so client components read one boolean instead of the
 * raw email list.
 */

const DEFAULT_DOCUSIGN_USERS = [
  'angelo@shipbots.com',
  'payam@shipbots.com',
  'danielle@shipbots.com',
  'mikey@shipbots.com',
];

/** Returns the current DocuSign-access email allowlist, all lowercased. */
export function getDocusignEmails(): string[] {
  const raw = process.env.DOCUSIGN_EMAILS;
  if (!raw) return [...DEFAULT_DOCUSIGN_USERS];
  const list = raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  // An empty / whitespace-only env var falls back to the defaults rather than
  // silently locking everyone out of the feature.
  return list.length ? list : [...DEFAULT_DOCUSIGN_USERS];
}

export function canUseDocusign(email: string | null | undefined): boolean {
  if (!email) return false;
  return getDocusignEmails().includes(email.toLowerCase());
}
