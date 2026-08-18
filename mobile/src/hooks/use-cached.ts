import { useCallback, useEffect, useRef, useState } from 'react';

import { readCache, writeCache } from '@/api/cache';

/**
 * Load `fetcher()` with a disk cache: shows cached data instantly, then
 * revalidates in the background. `loading` is only true until the first data
 * (cache or network) arrives; `refreshing` drives pull-to-refresh; `error` is
 * surfaced only when there's nothing cached to fall back on. `stale` is the age
 * (ms) of the currently-shown cached value while a refresh is in flight.
 */
export function useCached<T>(cacheKey: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async (manual: boolean) => {
    if (manual) setRefreshing(true);
    const cached = await readCache<T>(cacheKey);
    if (cached) {
      setData(cached.value);
      setLoading(false);
    }
    try {
      const fresh = await fetcherRef.current();
      await writeCache(cacheKey, fresh);
      setData(fresh);
      setError(null);
    } catch (e) {
      if (!cached) setError(e instanceof Error ? e : new Error('Failed to load'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cacheKey]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(false); })();
    return () => { alive = false; };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  return { data, loading, refreshing, error, refresh };
}
