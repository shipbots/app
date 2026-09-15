/**
 * Tiny on-device cache (AsyncStorage). Powers the "instant open, refresh in the
 * background" behavior — data is read from disk immediately, then revalidated.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// v2: abandons any v1 cache that may have been poisoned with mock data by a
// pre-auth fetch on cold start. Bump this whenever cached shapes change.
const PREFIX = 'cache:v2:';

export interface CacheEntry<T> {
  value: T;
  at: number; // epoch ms when written
}

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ value, at: Date.now() }));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX)));
  } catch {
    /* ignore */
  }
}

/** Remove cache entries from older schema versions (e.g. the poisoned v1), so
 *  they don't linger and eat the on-device storage budget. */
export async function purgeOldCaches(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stale = keys.filter(k => k.startsWith('cache:') && !k.startsWith(PREFIX));
    if (stale.length) await AsyncStorage.multiRemove(stale);
  } catch {
    /* ignore */
  }
}
