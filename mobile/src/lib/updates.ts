/**
 * Over-the-air auto-update via expo-updates + EAS Update. On launch the app
 * checks the "preview" channel for a newer JS bundle, downloads it in the
 * background, and surfaces a banner so the user can apply it (restart) without
 * re-installing the APK. If they ignore it, expo-updates applies the fetched
 * update automatically on the next launch anyway.
 *
 * Publish a new update with:  eas update --branch preview -m "what changed"
 * (Native changes — new modules, config — still need a fresh APK build.)
 */
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

export function useOtaUpdates() {
  const [pending, setPending] = useState(false); // a new bundle is downloaded & ready
  const [busy, setBusy] = useState(false);

  const check = useCallback(async (manual = false) => {
    // Disabled in Expo Go / dev — there's no embedded update to replace.
    if (__DEV__ || !Updates.isEnabled) {
      if (manual) Alert.alert('Updates unavailable', 'Live updates only work in the installed app.');
      return;
    }
    try {
      setBusy(true);
      const res = await Updates.checkForUpdateAsync();
      if (res.isAvailable) {
        await Updates.fetchUpdateAsync();
        setPending(true);
      } else if (manual) {
        Alert.alert('Up to date', 'You’re on the latest version.');
      }
    } catch {
      if (manual) Alert.alert('Update check failed', 'Please try again later.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Check once on launch.
  useEffect(() => { check(false); }, [check]);

  const apply = useCallback(async () => {
    try { await Updates.reloadAsync(); } catch { /* stays on current bundle */ }
  }, []);

  return { pending, busy, check, apply };
}
