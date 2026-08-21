/**
 * Offline-first prefetch. On app open we refresh the core lists and then
 * background-prefetch every client detail into the on-device cache, so any
 * client opens instantly and works offline. "Only update new data": details
 * fetched recently are skipped; when offline the network fetches throw and the
 * previously-cached data simply stays in place.
 */
import { readCache, writeCache } from '@/api/cache';
import { fetchClientIndex, fetchDeliveries, getClient, getTasks } from '@/api/client';
import type { ClientIndexEntry } from '@/api/types';

const DETAIL_TTL = 15 * 60 * 1000; // skip a detail refreshed < 15 min ago
const CONCURRENCY = 4;
let running = false;

export async function prefetchAllData(): Promise<void> {
  if (running) return;
  running = true;
  try {
    let index: ClientIndexEntry[] | null = null;
    try {
      index = await fetchClientIndex();
      await writeCache('client-index', index);
    } catch {
      /* offline — keep whatever's cached */
    }
    await Promise.all([
      fetchDeliveries().then(d => writeCache('deliveries', d)).catch(() => {}),
      getTasks().then(t => writeCache('tasks', t)).catch(() => {}),
    ]);

    if (!index) return;
    for (let i = 0; i < index.length; i += CONCURRENCY) {
      const batch = index.slice(i, i + CONCURRENCY);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        batch.map(async e => {
          try {
            const cached = await readCache<unknown>(`client:${e.id}`);
            if (cached && Date.now() - cached.at < DETAIL_TTL) return; // fresh — skip
            const c = await getClient(e.id);
            if (c) await writeCache(`client:${e.id}`, c);
          } catch {
            /* one client failed / offline — keep going */
          }
        }),
      );
    }
  } finally {
    running = false;
  }
}
