import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { findClientIdByName, getTasks } from '@/api/client';
import type { Task } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const DONE = /(done|complete|finished)/i;

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, loading, refreshing, refresh, error } = useCached('tasks', getTasks);

  // Refetch when returning to the tab (e.g. after completing a task) — skip the
  // very first focus since useCached already loads on mount.
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) { first.current = false; return; }
      refresh();
    }, [refresh]),
  );

  const open = (data ?? []).filter(t => !DONE.test(t.status)); // hide completed

  const openTask = (t: Task) => {
    router.push({
      pathname: '/task/[id]',
      params: { id: t.id, name: t.name, status: t.status, dueDate: t.dueDate, clientName: t.clientName, notes: t.notes },
    });
  };
  const openClient = async (name: string) => {
    const cid = await findClientIdByName(name);
    if (cid) router.push({ pathname: '/client/[id]', params: { id: cid } });
  };

  if (loading) {
    return <ThemedView style={styles.flex}><ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.flex}>
      <FlatList
        data={open}
        keyExtractor={t => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {error ? 'Couldn’t load tasks — pull to retry.' : 'No open tasks assigned to you. 🎉'}
          </ThemedText>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openTask(item)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
              <ThemedText type="smallBold">{item.name || '(untitled task)'}</ThemedText>
              <View style={styles.metaRow}>
                {!!item.clientName && (
                  <Pressable onPress={() => openClient(item.clientName)} hitSlop={6}>
                    <ThemedText type="small" style={{ color: theme.tint, textDecorationLine: 'underline' }}>{item.clientName}</ThemedText>
                  </Pressable>
                )}
                <ThemedText type="small" themeColor="textSecondary">
                  {[item.status, item.dueDate ? `due ${item.dueDate}` : ''].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              {!!item.notes && <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{item.notes}</ThemedText>}
            </ThemedView>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three, gap: 3 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.two },
});
