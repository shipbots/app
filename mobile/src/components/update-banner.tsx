import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Shadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useOtaUpdates } from '@/lib/updates';
import { ThemedText } from './themed-text';

/**
 * Floating bottom toast shown once an OTA update has been downloaded. Tapping
 * "Restart" applies it immediately; ✕ dismisses (it still auto-applies next
 * launch). Renders nothing until an update is pending.
 */
export function UpdateBanner() {
  const { pending, apply } = useOtaUpdates();
  const theme = useTheme();
  const [dismissed, setDismissed] = useState(false);

  if (!pending || dismissed) return null;

  return (
    <View style={[styles.wrap, { backgroundColor: theme.tint }, Shadow.raised]}>
      <ThemedText style={styles.text}>⬆️  A new version is ready</ThemedText>
      <View style={styles.actions}>
        <Pressable onPress={apply} hitSlop={8} style={styles.restart}>
          <ThemedText style={styles.restartTxt}>Restart</ThemedText>
        </Pressable>
        <Pressable onPress={() => setDismissed(true)} hitSlop={10}>
          <ThemedText style={styles.close}>✕</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 12, right: 12, bottom: 28, zIndex: 1000,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  text: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  restart: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  restartTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  close: { color: '#fff', fontSize: 16, fontWeight: '700', opacity: 0.8 },
});
