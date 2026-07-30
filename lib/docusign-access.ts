/**
 * DocuSign / billing feature access — controls who can see and use billing
 * data: the DocuSign upload + extract, EIN, the contract, billing address,
 * pricing, ACH banking details, and the Chrome extension's Billing info view.
 *
 * Source of truth: a runtime allowlist in Vercel Blob (see lib/access-store),
 * editable by admins in Settings — no redeploy needed. The DOCUSIGN_EMAILS env
 * var (or the defaults below) is only a *seed*: it's used until the first edit
 * initializes the store, after which the stored list is authoritative (so an
 * admin can add AND remove anyone, including the seeds).
 *
 * Membership is also stamped onto the session as `canDocusign` in auth.ts, so
 * client components read one boolean. Because the seed/store read is async,
 * every consumer here is async.
 */
import { getAccessLists, saveAccessLists, isBlobConfigured } from './access-store';

const DEFAULT_DOCUSIGN_USERS = [
  'andres@shipbots.com',
  'angelo@shipbots.com',
  'payam@shipbots.com',
  'danielle@shipbots.com',
  'mikey@shipbots.com',
];

/** The seed allowlist from DOCUSIGN_EMAILS (or the defaults), all lowercased.
 *  Used to bootstrap the store the first time and as a fallback if Blob isn't
 *  configured. */
export function getSeedDocusignEmails(): string[] {
  const raw = process.env.DOCUSIGN_EMAILS;
  if (!raw) return [...DEFAULT_DOCUSIGN_USERS];
  const list = raw
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...DEFAULT_DOCUSIGN_USERS];
}

/** The effective allowlist: the runtime store once initialized, else the seed. */
export async function getDocusignEmails(): Promise<string[]> {
  const stored = await getAccessLists();
  if (stored) return stored.docusign;
  return getSeedDocusignEmails();
}

export async function canUseDocusign(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const emails = await getDocusignEmails();
  return emails.includes(email.toLowerCase());
}

/** Where the current list comes from + whether it can be edited at runtime. */
export async function getDocusignAccessState(): Promise<{
  emails: string[];
  seeds: string[];
  source: 'store' | 'seed';
  writable: boolean;
}> {
  const stored = await getAccessLists();
  return {
    emails: stored ? stored.docusign : getSeedDocusignEmails(),
    seeds: getSeedDocusignEmails(),
    source: stored ? 'store' : 'seed',
    writable: isBlobConfigured(),
  };
}

// ── Admin mutations ─────────────────────────────────────────────────────────
// The first mutation initializes the store from the effective list (seeds if
// still uninitialized), so adds/removes start from today's list rather than an
// empty one.

export async function addDocusignEmail(email: string): Promise<string[]> {
  const e = email.trim().toLowerCase();
  const set = new Set(await getDocusignEmails());
  set.add(e);
  const next = [...set].sort();
  await saveAccessLists({ docusign: next });
  return next;
}

export async function removeDocusignEmail(email: string): Promise<string[]> {
  const e = email.trim().toLowerCase();
  const next = (await getDocusignEmails()).filter(x => x !== e);
  await saveAccessLists({ docusign: next });
  return next;
}
