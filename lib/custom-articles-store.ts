/**
 * Team-shared store for custom help articles (name + link) that agents can
 * attach to an After-Onboarding Summary. Backed by a single JSON file in Vercel
 * Blob so the list is shared across the team and survives redeploys — no DB
 * migration needed. Mirrors lib/access-store.ts.
 *
 * Falls back gracefully when BLOB_READ_WRITE_TOKEN isn't set: reads return an
 * empty list and writes throw a clear error the API surfaces to the UI.
 */

const BLOB_PATHNAME = 'help-articles/custom.json';
const CACHE_TTL_MS = 20_000;
const FETCH_TIMEOUT_MS = 4_000;
const MAX_ARTICLES = 60;

export interface CustomArticle {
  id: string;
  name: string;
  url: string;
}

let cache: { at: number; value: CustomArticle[] } | null = null;

export function isBlobConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function sanitize(input: unknown): CustomArticle[] {
  if (!Array.isArray(input)) return [];
  const out: CustomArticle[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const r = raw as Partial<CustomArticle>;
    const name = String(r?.name ?? '').trim().slice(0, 120);
    let url = String(r?.url ?? '').trim().slice(0, 600);
    if (!name || !url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      new URL(url);
    } catch {
      continue;
    }
    const id = String(r?.id ?? '').trim() || `a${out.length}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, url });
    if (out.length >= MAX_ARTICLES) break;
  }
  return out;
}

async function readFromBlob(): Promise<CustomArticle[]> {
  if (!isBlobConfigured()) return [];
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: BLOB_PATHNAME, limit: 1 });
  const hit = blobs.find((b) => b.pathname === BLOB_PATHNAME);
  if (!hit) return [];
  const res = await fetch(hit.url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return [];
  const json = (await res.json()) as { articles?: unknown } | null;
  return sanitize(json?.articles);
}

/** The stored custom-article list. Cached briefly; pass force to bypass. */
export async function getCustomArticles(force = false): Promise<CustomArticle[]> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const value = await readFromBlob();
    cache = { at: now, value };
    return value;
  } catch {
    return cache?.value ?? [];
  }
}

/** Overwrite the whole list. Throws if Blob isn't configured. */
export async function saveCustomArticles(next: unknown): Promise<CustomArticle[]> {
  if (!isBlobConfigured()) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  const { put } = await import('@vercel/blob');
  const clean = sanitize(next);
  await put(BLOB_PATHNAME, JSON.stringify({ articles: clean }, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 0,
  });
  cache = { at: Date.now(), value: clean };
  return clean;
}
