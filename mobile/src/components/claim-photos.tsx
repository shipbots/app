import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import type { LocalFile } from '@/api/claims';
import type { ClaimFile } from '@/api/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { photoPickerAvailable, pickFromLibrary, takePhoto } from '@/lib/photo-picker';
import { ThemedText } from './themed-text';

/** Thumbnails of a claim's attachments (saved + not-yet-uploaded), plus
 *  "Take photo" / "Choose photos" buttons when the picker is in this build. */
export function ClaimPhotos({
  saved = [], pending = [], onAdd, onRemovePending, busyText,
}: {
  saved?: ClaimFile[];
  pending?: LocalFile[];
  onAdd: (files: LocalFile[]) => void;
  onRemovePending?: (index: number) => void;
  busyText?: string;
}) {
  const theme = useTheme();
  const canPick = photoPickerAvailable();

  const run = async (fn: () => Promise<LocalFile[]>) => {
    try {
      const files = await fn();
      if (files.length) onAdd(files);
    } catch (e) {
      Alert.alert('Photos', e instanceof Error ? e.message : 'Couldn’t open photos.');
    }
  };

  const openSaved = (f: ClaimFile) => {
    if (!f.url) { Alert.alert('Can’t open', 'Pull down to refresh, then try again.'); return; }
    WebBrowser.openBrowserAsync(f.url).catch(() => {});
  };

  return (
    <View>
      {(saved.length > 0 || pending.length > 0) && (
        <View style={styles.grid}>
          {saved.map(f => (
            <Pressable key={f.assetId} onPress={() => openSaved(f)} style={[styles.thumb, { borderColor: theme.border }]} accessibilityLabel={`Open ${f.name}`}>
              <Thumb uri={f.isImage ? f.url : undefined} />
              <ThemedText style={styles.thumbName} numberOfLines={1}>{f.name}</ThemedText>
            </Pressable>
          ))}
          {pending.map((f, i) => (
            <View key={f.uri + i} style={[styles.thumb, { borderColor: theme.accent }]}>
              <Thumb uri={/^image\//.test(f.type) ? f.uri : undefined} />
              <ThemedText style={styles.thumbName} numberOfLines={1}>{f.name}</ThemedText>
              {onRemovePending && (
                <Pressable onPress={() => onRemovePending(i)} hitSlop={10} style={styles.remove} accessibilityLabel={`Remove ${f.name}`}>
                  <ThemedText style={styles.removeText}>×</ThemedText>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}

      {busyText ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>{busyText}</ThemedText>
      ) : canPick ? (
        <View style={styles.buttons}>
          <Pressable onPress={() => run(takePhoto)} style={[styles.btn, { borderColor: theme.tint }]}>
            <ThemedText style={[styles.btnText, { color: theme.tint }]}>📷 Take photo</ThemedText>
          </Pressable>
          <Pressable onPress={() => run(pickFromLibrary)} style={[styles.btn, { borderColor: theme.tint }]}>
            <ThemedText style={[styles.btnText, { color: theme.tint }]}>🖼️ Choose photos</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>
          Attaching photos needs the latest app build. You can still file the claim and add photos from the dashboard or Chrome extension.
        </ThemedText>
      )}
    </View>
  );
}

function Thumb({ uri }: { uri?: string }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[styles.img, styles.fallback, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={{ fontSize: 26 }}>{uri ? '🖼️' : '📄'}</ThemedText>
      </View>
    );
  }
  return <Image source={{ uri }} style={[styles.img, { backgroundColor: theme.backgroundElement }]} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 96, borderWidth: 1, borderRadius: 10, padding: 4, alignItems: 'center' },
  img: { width: 86, height: 70, borderRadius: 7 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  thumbName: { fontSize: 10.5, marginTop: 3, maxWidth: 86 },
  remove: { position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#374151', alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 15, lineHeight: 18, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  btn: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  btnText: { fontWeight: '700', fontSize: 14 },
});
