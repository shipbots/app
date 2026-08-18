import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet } from 'react-native';

import { getTasks } from '@/api/client';
import type { Task } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DONE = /(done|complete|finished)/i;

export default function TasksScreen() {
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getTasks()
      .then(t => alive && (setTasks(t), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return (
      <ThemedView style={styles.flex}>
        <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} />
      </ThemedView>
    );
  }

  const open = tasks.filter(t => !DONE.test(t.status));
  const done = tasks.filter(t => DONE.test(t.status));

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={[...open, ...done]}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            No tasks assigned to you. 🎉
          </ThemedText>
        }
        renderItem={({ item }) => {
          const isDone = DONE.test(item.status);
          return (
            <ThemedView type="card" style={[styles.card, { borderColor: theme.border, opacity: isDone ? 0.55 : 1 }]}>
              <ThemedText type="smallBold" style={isDone ? styles.struck : undefined}>
                {item.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.clientName}
                {item.dueDate ? ` · due ${item.dueDate}` : ''}
              </ThemedText>
              {!!item.notes && (
                <ThemedText type="small" themeColor="textSecondary">
                  {item.notes}
                </ThemedText>
              )}
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
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: 2,
  },
  struck: { textDecorationLine: 'line-through' },
});
