import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export type FilterKey = 'warehouse' | 'subWarehouse' | 'agentEmail' | 'portal';

export interface FilterDim {
  key: FilterKey;
  label: string;
  display: (v: string) => string; // how each option renders (e.g. agent first name)
}

export type Selected = Record<FilterKey, string[]>;

export const EMPTY_FILTERS: Selected = { warehouse: [], subWarehouse: [], agentEmail: [], portal: [] };

/** Bottom-sheet multi-select filter for the client list. Each dimension's
 *  options are the distinct values found in the data. Within a dimension the
 *  selections are OR'd; across dimensions they're AND'd. */
export function ClientFilterSheet({
  visible, dims, options, selected, onToggle, onClear, onClose,
}: {
  visible: boolean;
  dims: FilterDim[];
  options: Record<FilterKey, string[]>;
  selected: Selected;
  onToggle: (key: FilterKey, value: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const total = (Object.values(selected) as string[][]).reduce((n, v) => n + v.length, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable onPress={onClear} hitSlop={8} disabled={total === 0}>
              <ThemedText style={{ color: total ? theme.danger : theme.textSecondary, fontWeight: '600' }}>Clear</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">Filters{total ? ` · ${total}` : ''}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Done</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.body}>
            {dims.map(dim => {
              const opts = options[dim.key];
              if (!opts.length) return null;
              return (
                <View key={dim.key} style={styles.dim}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.dimLabel}>{dim.label}</ThemedText>
                  <View style={styles.chips}>
                    {opts.map(v => {
                      const on = selected[dim.key].includes(v);
                      return (
                        <Pressable
                          key={v}
                          onPress={() => onToggle(dim.key, v)}
                          style={[styles.chip, { borderColor: on ? theme.tint : theme.border, backgroundColor: on ? theme.tint : 'transparent' }]}>
                          <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: on ? '700' : '500' }}>
                            {dim.display(v)}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  dim: { gap: Spacing.two },
  dimLabel: { fontWeight: '700', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
});
