'use client';

/**
 * useClientSearchIndex — one shared fetch of /api/clients/search-index for
 * the whole app. Both the header search dropdown (pipeline-board) and the
 * Browse-by-Client tables (clients-view) subscribe to it; the module-level
 * cache + in-flight dedup means they trigger a single network request no
 * matter how many components mount, and any later mount gets the cached
 * index instantly.
 *
 * State lives at module scope (not React state) so it survives tab switches
 * between /customer-service and /onboarding without refetching.
 */

import { useEffect, useReducer } from 'react';
import type { ClientIndexEntry } from '@/lib/client-search';

type Status = 'idle' | 'loading' | 'ready' | 'error';

let rows: ClientIndexEntry[] | null = null;
let index: Record<string, ClientIndexEntry> | null = null;
let status: Status = 'idle';
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (inFlight) return inFlight;
  status = 'loading';
  notify();
  inFlight = fetch('/api/clients/search-index')
    .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
    .then((data: ClientIndexEntry[]) => {
      rows = data;
      const map: Record<string, ClientIndexEntry> = {};
      for (const r of data) map[r.id] = r;
      index = map;
      status = 'ready';
    })
    .catch(err => {
      console.error('[use-client-search-index] fetch failed:', err);
      status = 'error';
    })
    .finally(() => {
      inFlight = null;
      notify();
    });
  return inFlight;
}

export interface ClientSearchIndex {
  rows: ClientIndexEntry[] | null;
  index: Record<string, ClientIndexEntry> | null;
  status: Status;
}

export function useClientSearchIndex(): ClientSearchIndex {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    listeners.add(force);
    // Kick off the first fetch, and retry once if a previous attempt errored
    // (e.g. a transient Monday hiccup on the very first load).
    if (status === 'idle' || status === 'error') void load();
    return () => {
      listeners.delete(force);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { rows, index, status };
}

/** Force a re-fetch (e.g. after a bulk edit changes portal/warehouse). */
export function refreshClientSearchIndex(): Promise<void> {
  status = 'idle';
  inFlight = null;
  return load();
}
