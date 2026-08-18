/**
 * Tiny on-device cache (AsyncStorage). Powers the "instant open, refresh in the
 * background" behavior — data is read from disk immediately, then revalidated.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'cache:v1:';

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
