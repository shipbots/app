'use client';

/**
 * useCachedFetch — stale-while-revalidate over localStorage.
 *
 * Monday's GraphQL API is slow enough that the client-detail panel
 * shows a blank spinner for 1–3s on every open, even when the user
 * is looking at the same client they had open a minute ago. This
 * hook hydrates the last-known payload synchronously from
 * localStorage on mount so the panel paints instantly, then
 * refetches in the background and swaps in fresh data when it
 * lands.
 *
 * Consumers get:
 *   - data: cached value if any, updated to fresh value on load
 *   - isFetching: true whenever a network request is in flight,
 *     so the UI can show a subtle "updating…" pill next to stale
 *     data instead of a full loading spinner
 *   - error: last error, cleared on a successful refetch
 *   - refetch(): forces a network round-trip (used by the manual
 *     Refresh button)
 *
 * Cache keys live under `swr:v1:<key>` in localStorage. `<key>`
 * should be caller-supplied and stable per resource — the
 * client-detail-panel uses `client:<boardItemId>:<onboardingId>`.
 * Bump the "v1" prefix (VERSION const) to invalidate every entry
 * at once if the response shape ever changes.
 *
 * Entries older than TTL_MS are ignored on read (still valid to
 * refetch); they're not proactively deleted, they just fall out of
 * favor. Storage exceptions (quota, disabled localStorage) are
 * swallowed silently — the hook still works, we just skip the
 * cache layer.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

const VERSION = 'v1';
const NS = `swr:${VERSION}`;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — old entries still show while refetch is in flight

interface CacheEntry<T> {
  at: number;
  data: T;
}

function readCache<T>(key: string): T | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(`${NS}:${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.at !== 'number') return undefined;
    if (Date.now() - parsed.at > TTL_MS) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget prefetch that writes to the same cache the hook
 * reads from. Call this on row hover / focus / anywhere you have
 * a strong signal the user is about to open a resource — by the
 * time the panel mounts and the hook reads localStorage, the
 * payload is often already there and the initial paint is
 * instant. Deduped in-memory so scrolling past 100 rows doesn't
 * fire 100 real network requests.
 */
const inflight = new Map<string, Promise<unknown>>();
export function prefetchCached<T>(key: string | null, url: string | null): void {
  if (typeof window === 'undefined') return;
  if (!key || !url) return;
  if (inflight.has(key)) return;
  // Skip if the cache already has a very fresh entry (last minute) —
  // Cache-Control on the route will hit the browser HTTP cache anyway
  // and there's no point warming twice in quick succession.
  const cached = readCache<T>(key);
  const stamp = (() => {
    try {
      const raw = window.localStorage.getItem(`${NS}:${key}`);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as CacheEntry<T>;
      return typeof parsed?.at === 'number' ? parsed.at : 0;
    } catch { return 0; }
  })();
  if (cached !== undefined && Date.now() - stamp < 60_000) return;

  const p = fetch(url, { credentials: 'include' })
    .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
    .then((fresh: T) => { writeCache(key, fresh); return fresh; })
    .catch(() => { /* prefetch is best-effort */ })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
}

function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry<T> = { at: Date.now(), data };
    window.localStorage.setItem(`${NS}:${key}`, JSON.stringify(entry));
  } catch {
    // Quota or private-mode failures are non-fatal — the fetch still worked.
  }
}

export interface UseCachedFetchResult<T> {
  data: T | undefined;
  isFetching: boolean;
  error: Error | undefined;
  refetch: () => void;
  /**
   * Optimistically update the cached value locally. Useful when a
   * PATCH has just succeeded and the caller doesn't want to wait
   * for a full refetch to reflect the new state. Writes through to
   * localStorage so a subsequent mount picks up the update too.
   * The next background refetch will overwrite this value with the
   * authoritative server response.
   */
  setData: Dispatch<SetStateAction<T | undefined>>;
}

/**
 * @param key   Stable cache identifier (null disables the hook).
 * @param url   URL to fetch (null disables the hook).
 * @param init  Optional RequestInit. Callers must keep this stable
 *              — pass a memoized value if headers change per render.
 */
export function useCachedFetch<T>(
  key: string | null,
  url: string | null,
  init?: RequestInit,
): UseCachedFetchResult<T> {
  const [data, setDataState] = useState<T | undefined>(() =>
    key ? readCache<T>(key) : undefined,
  );
  const [isFetching, setIsFetching] = useState<boolean>(() => !!(key && url));
  const [error, setError] = useState<Error | undefined>(undefined);
  const [refreshTick, setRefreshTick] = useState(0);

  // Latest init pinned in a ref so we don't refetch just because
  // the caller happened to pass a fresh object identity this render.
  const initRef = useRef(init);
  initRef.current = init;

  useEffect(() => {
    if (!key || !url) {
      setData(undefined);
      setIsFetching(false);
      return;
    }
    const cached = readCache<T>(key);
    if (cached !== undefined) setData(cached);
    else setData(undefined);
    setIsFetching(true);
    setError(undefined);

    const controller = new AbortController();
    let cancelled = false;

    fetch(url, { ...(initRef.current ?? {}), signal: controller.signal })
      .then(async r => {
        // Parse the body even on failure so a route's `{ error: '…' }`
        // message survives as the thrown Error's message. Consumers like
        // the emails tab switch on it (e.g. 'gmail_reauth_required') to
        // show a specific recovery UI instead of a generic failure.
        const body = await r.json().catch(() => undefined);
        if (!r.ok) {
          const msg =
            body && typeof body === 'object' && 'error' in body
              ? String((body as { error: unknown }).error)
              : `${r.status}`;
          throw new Error(msg);
        }
        return body as T;
      })
      .then(fresh => {
        if (cancelled) return;
        setData(fresh);
        writeCache(key, fresh);
      })
      .catch(err => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (cancelled) return;
        setIsFetching(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, url, refreshTick]);

  const refetch = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  // Latest cache key tracked for the setData writer so writes always
  // land in the correct localStorage slot even if the key changes
  // mid-lifecycle. Also intentionally NOT dependency of setData so the
  // returned function identity is stable across renders.
  const keyRef = useRef(key);
  keyRef.current = key;

  const setData: Dispatch<SetStateAction<T | undefined>> = useCallback(action => {
    setDataState(prev => {
      const next = typeof action === 'function'
        ? (action as (p: T | undefined) => T | undefined)(prev)
        : action;
      const k = keyRef.current;
      if (k && next !== undefined) writeCache(k, next);
      return next;
    });
  }, []);

  return { data, isFetching, error, refetch, setData };
}
