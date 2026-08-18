import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

/** Bottom-sheet list picker for dropdown / status / agent fields. */
export function OptionPicker({
  visible, title, options, current, onSelect, onClose, allowClear = true,
}: {
  visible: boolean;
  title: string;
  options: string[];
  current?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  allowClear?: boolean;
}) {
  const theme = useTheme();
  const rows = allowClear ? ['', ...options] : options;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <ThemedText type="smallBold" style={styles.title}>{title}</ThemedText>
          <ScrollView style={{ maxHeight: 400 }}>
            {rows.map((o, i) => {
              const isClear = allowClear && i === 0;
              return (
                <Pressable
                  key={o || '__clear'}
                  onPress={() => onSelect(o)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderBottomColor: theme.border, backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                  ]}>
                  <ThemedText style={{ color: isClear ? theme.textSecondary : theme.text }}>
                    {isClear ? '— Clear —' : o}
                  </ThemedText>
                  {!isClear && o === current && <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>✓</ThemedText>}
                </Pressable>
              );
            })}
            {options.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                No options available.
              </ThemedText>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 34, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#c7c7cc', marginBottom: 6 },
  title: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.three, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: Spacing.three },
});
