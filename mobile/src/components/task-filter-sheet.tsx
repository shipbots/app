import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

export const DUE_OPTIONS: { key: DueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Due today' },
  { key: 'week', label: 'This week' },
  { key: 'none', label: 'No date' },
];

/** Bottom-sheet filter for the task list: a single-select due-date bucket plus
 *  a multi-select list of the clients that currently have tasks. */
export function TaskFilterSheet({
  visible, due, onDue, clients, selectedClients, onToggleClient, onClear, onClose,
}: {
  visible: boolean;
  due: DueFilter;
  onDue: (d: DueFilter) => void;
  clients: string[];
  selectedClients: string[];
  onToggleClient: (name: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const activeCount = (due !== 'all' ? 1 : 0) + selectedClients.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Pressable onPress={onClear} hitSlop={8} disabled={activeCount === 0}>
              <ThemedText style={{ color: activeCount ? theme.danger : theme.textSecondary, fontWeight: '600' }}>Clear</ThemedText>
            </Pressable>
            <ThemedText type="smallBold">Filters{activeCount ? ` · ${activeCount}` : ''}</ThemedText>
            <Pressable onPress={onClose} hitSlop={8}>
              <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Done</ThemedText>
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={styles.body}>
            <View style={styles.dim}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.dimLabel}>Due date</ThemedText>
              <View style={styles.chips}>
                {DUE_OPTIONS.map(o => {
                  const on = due === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      onPress={() => onDue(o.key)}
                      style={[styles.chip, { borderColor: on ? theme.tint : theme.border, backgroundColor: on ? theme.tint : 'transparent' }]}>
                      <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: on ? '700' : '500' }}>{o.label}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {clients.length > 0 && (
              <View style={styles.dim}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.dimLabel}>Client</ThemedText>
                <View style={styles.chips}>
                  {clients.map(name => {
                    const on = selectedClients.includes(name);
                    return (
                      <Pressable
                        key={name}
                        onPress={() => onToggleClient(name)}
                        style={[styles.chip, { borderColor: on ? theme.tint : theme.border, backgroundColor: on ? theme.tint : 'transparent' }]}>
                        <ThemedText type="small" style={{ color: on ? '#fff' : theme.text, fontWeight: on ? '700' : '500' }}>{name}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  dim: { gap: Spacing.two },
  dimLabel: { fontWeight: '700', textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
});
