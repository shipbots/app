import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';

import { getTasks } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const DONE = /(done|complete|finished)/i;

export default function TasksScreen() {
  const theme = useTheme();
  const { data, loading, refreshing, refresh, error } = useCached('tasks', getTasks);
  const tasks = data ?? [];
  const open = tasks.filter(t => !DONE.test(t.status));
  const done = tasks.filter(t => DONE.test(t.status));

  if (loading) {
    return <ThemedView style={styles.flex}><ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={[...open, ...done]}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {error ? 'Couldn’t load tasks — pull to retry.' : 'No tasks assigned to you. 🎉'}
          </ThemedText>
        }
        renderItem={({ item }) => {
          const isDone = DONE.test(item.status);
          return (
            <ThemedView type="card" style={[styles.card, { borderColor: theme.border, opacity: isDone ? 0.55 : 1 }]}>
              <ThemedText type="smallBold" style={isDone ? styles.struck : undefined}>{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.clientName, item.status, item.dueDate ? `due ${item.dueDate}` : ''].filter(Boolean).join(' · ')}
              </ThemedText>
              {!!item.notes && <ThemedText type="small" themeColor="textSecondary">{item.notes}</ThemedText>}
            </ThemedView>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
});
