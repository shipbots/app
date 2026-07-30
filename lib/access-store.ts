/**
 * Runtime store for access allowlists, backed by a single JSON file in Vercel
 * Blob. Lets admins edit the list from the Settings UI instead of the
 * DOCUSIGN_EMAILS env var — no redeploy, no Vercel trip.
 *
 * Only the billing / DocuSign-access list lives here today; the shape is a map
 * so more lists can be added later (see `AccessLists`).
 *
 * Reads are cached in-process for a short TTL so the hot path (auth + every
 * DocuSign gate) doesn't hit Blob on every request. Writes update the cache
 * immediately; other warm instances pick up the change within the TTL.
 *
 * Falls back gracefully when BLOB_READ_WRITE_TOKEN isn't set: reads return null
 * ("not initialized") so callers use their seed list, and writes throw a clear
 * error the API surfaces to the UI.
 */
// @vercel/blob is imported dynamically inside the read/write helpers (not at the
// top level) so it stays out of the edge proxy's static bundle — this module is
// reachable from the auth `jwt` callback, which runs at the edge.

const BLOB_PATHNAME = 'access/access-lists.json';
const CACHE_TTL_MS = 30_000;
const FETCH_TIMEOUT_MS = 4_000;

export interface AccessLists {
  /** Emails allowed to see billing / DocuSign data (mirrors DOCUSIGN_EMAILS). */
  docusign: string[];
}

type CacheEntry = { at: number; value: AccessLists | null };
// value === null → store not initialized (no blob yet) or blob unreadable.
let cache: CacheEntry = { at: 0, value: null };
let primed = false;

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function normalizeEmails(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  for (const raw of input) {
    const e = String(raw ?? '').trim().toLowerCase();
    if (e) seen.add(e);
  }
  return [...seen].sort();
}

async function readFromBlob(): Promise<AccessLists | null> {
  if (!isBlobConfigured()) return null;
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const hit = blobs.find(b => b.pathname === BLOB_PATHNAME);
  if (!hit) return null;
  const res = await fetch(hit.url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  const json = (await res.json()) as { docusign?: unknown } | null;
  return { docusign: normalizeEmails(json?.docusign) };
}

let refreshing: Promise<void> | null = null;
function refreshInBackground(): void {
  if (refreshing) return;
  refreshing = (async () => {
    try {
      const value = await readFromBlob();
      cache = { at: Date.now(), value };
      primed = true;
    } catch {
      // Keep whatever we last had (may be null) instead of dropping access.
    } finally {
      refreshing = null;
    }
  })();
}

/**
 * The full stored access map, or null when the store hasn't been initialized
 * yet (no blob, or Blob not configured).
 *
 * NON-BLOCKING by default: returns the last-known cached value immediately and
 * kicks off a background refresh when stale. This matters because the auth
 * `jwt` callback (which gates canDocusign) runs on EVERY request — including in
 * the edge proxy — so it must never wait on a Blob round-trip. Worst case the
 * value is a few seconds stale, or seeds-only until the first refresh warms the
 * cache after a cold start.
 *
 * Pass force=true to await a fresh read — used by the admin Settings GET and
 * right after a write, where the caller wants the authoritative current list.
 */
export async function getAccessLists(force = false): Promise<AccessLists | null> {
  const now = Date.now();
  if (force) {
    try {
      const value = await readFromBlob();
      cache = { at: now, value };
      primed = true;
      return value;
    } catch {
      return cache.value;
    }
  }
  if (!primed || now - cache.at >= CACHE_TTL_MS) refreshInBackground();
  return cache.value;
}

/** Overwrite the whole access map. Throws if Blob isn't configured. */
export async function saveAccessLists(next: AccessLists): Promise<void> {
  if (!isBlobConfigured()) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  const { put } = await import('@vercel/blob');
  const clean: AccessLists = { docusign: normalizeEmails(next.docusign) };
  await put(BLOB_PATHNAME, JSON.stringify(clean, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  cache = { at: Date.now(), value: clean };
  primed = true;
}
