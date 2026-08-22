import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { completeTask, findClientIdByName, getTasks } from '@/api/client';
import { scheduleTaskReminders } from '@/lib/notifications';
import type { Task } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TaskFilterSheet, type DueFilter } from '@/components/task-filter-sheet';
import { Shadow, Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const DONE = /(done|complete|finished)/i;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoOf(due: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : '';
}
function fmtDue(due: string): string {
  const m = due.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return 'Not applicable';
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (isNaN(+dt)) return 'Not applicable';
  const opts: Intl.DateTimeFormatOptions =
    Number(m[1]) === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return dt.toLocaleDateString('en-US', opts);
}
function matchesDue(due: string, today: string, f: DueFilter): boolean {
  if (f === 'all') return true;
  const iso = isoOf(due);
  if (f === 'none') return !iso;
  if (!iso) return false;
  if (f === 'overdue') return iso < today;
  if (f === 'today') return iso === today;
  if (f === 'week') {
    if (iso < today) return false;
    const diff = (new Date(iso + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / 86400000;
    return diff <= 7;
  }
  return true;
}

export default function TasksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, loading, refreshing, refresh, error } = useCached('tasks', getTasks);
  const today = todayStr();

  const [filterOpen, setFilterOpen] = useState(false);
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<Set<string>>(new Set()); // optimistically hidden

  // Schedule day-before + day-of (10am) reminders whenever the task list changes.
  useEffect(() => { if (data) scheduleTaskReminders(data); }, [data]);

  // Refetch when returning to the tab; skip the first focus (useCached loads on mount).
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) { first.current = false; return; }
      refresh();
    }, [refresh]),
  );

  const openAll = useMemo(
    () => (data ?? []).filter(t => !DONE.test(t.status) && !completing.has(t.id)),
    [data, completing],
  );
  const clientOptions = useMemo(
    () => [...new Set(openAll.map(t => t.clientName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [openAll],
  );
  const tasks = useMemo(
    () => openAll.filter(t =>
      matchesDue(t.dueDate, today, dueFilter) &&
      (clientFilter.length === 0 || clientFilter.includes(t.clientName)),
    ),
    [openAll, today, dueFilter, clientFilter],
  );
  const activeFilterCount = (dueFilter !== 'all' ? 1 : 0) + clientFilter.length;

  const openTask = (t: Task) => router.push({
    pathname: '/task/[id]',
    params: { id: t.id, name: t.name, status: t.status, dueDate: t.dueDate, clientName: t.clientName, notes: t.notes },
  });
  const openClient = async (name: string) => {
    const cid = await findClientIdByName(name);
    if (cid) router.push({ pathname: '/client/[id]', params: { id: cid } });
  };
  const toggleSelect = (id: string) =>
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleClient = (name: string) =>
    setClientFilter(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  // Optimistically hide, then write to Monday; revert on failure.
  const complete = useCallback((ids: string[]) => {
    setCompleting(prev => new Set([...prev, ...ids]));
    setSelected(new Set());
    (async () => {
      try {
        await Promise.all(ids.map(id => completeTask(id)));
        refresh(); // reconcile — completed tasks now read "done" and drop out
      } catch {
        setCompleting(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
        Alert.alert('Couldn’t update', 'Some tasks weren’t marked complete. Please try again.');
      }
    })();
  }, [refresh]);

  const confirmComplete = (ids: string[]) => {
    if (ids.length === 0) return;
    Alert.alert(
      ids.length > 1 ? `Mark ${ids.length} tasks as completed?` : 'Mark this task as completed?',
      undefined,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', onPress: () => complete(ids) }],
    );
  };

  if (loading) {
    return <ThemedView style={styles.flex}><ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <ThemedText type="smallBold">{tasks.length} open task{tasks.length === 1 ? '' : 's'}</ThemedText>
        <Pressable
          onPress={() => setFilterOpen(true)}
          style={[styles.filterBtn, { backgroundColor: activeFilterCount ? theme.tint : theme.backgroundElement }]}>
          <ThemedText type="small" style={{ color: activeFilterCount ? '#fff' : theme.text, fontWeight: '700' }}>
            ⚙︎ Filter{activeFilterCount ? ` · ${activeFilterCount}` : ''}
          </ThemedText>
        </Pressable>
      </View>

      <FlatList
        data={tasks}
        keyExtractor={t => t.id}
        contentContainerStyle={[styles.list, selected.size > 0 && { paddingBottom: 92 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {error ? 'Couldn’t load tasks — pull to retry.'
              : activeFilterCount ? 'No tasks match the selected filters.'
              : 'No open tasks assigned to you. 🎉'}
          </ThemedText>
        }
        renderItem={({ item }) => {
          const sel = selected.has(item.id);
          const iso = isoOf(item.dueDate);
          const overdue = !!iso && iso < today;
          const isToday = iso === today;
          const dueColor = !iso ? theme.textSecondary : overdue ? theme.danger : isToday ? '#b45309' : theme.text;
          return (
            <ThemedView type="card" style={[styles.card, { borderColor: sel ? theme.tint : theme.border }, Shadow.card]}>
              <Pressable
                onPress={() => toggleSelect(item.id)}
                hitSlop={8}
                style={[styles.checkbox, { borderColor: sel ? theme.tint : theme.border, backgroundColor: sel ? theme.tint : 'transparent' }]}>
                {sel && <ThemedText style={styles.check}>✓</ThemedText>}
              </Pressable>

              <Pressable onPress={() => openTask(item)} style={styles.middle}>
                <ThemedText type="smallBold" numberOfLines={2}>{item.name || '(untitled task)'}</ThemedText>
                {!!item.clientName && (
                  <Pressable onPress={() => openClient(item.clientName)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
                    <ThemedText type="small" style={{ color: theme.tint, textDecorationLine: 'underline' }}>{item.clientName}</ThemedText>
                  </Pressable>
                )}
                {!!item.notes && <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>{item.notes}</ThemedText>}
              </Pressable>

              <View style={styles.dueCol}>
                <ThemedText style={[styles.dueLabel, { color: theme.textSecondary }]}>DUE</ThemedText>
                <ThemedText type="small" style={{ color: dueColor, fontWeight: '700' }}>{fmtDue(item.dueDate)}</ThemedText>
                {overdue && <ThemedText style={[styles.dueTag, { color: theme.danger }]}>OVERDUE</ThemedText>}
              </View>
            </ThemedView>
          );
        }}
      />

      {selected.size > 0 && (
        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <Pressable onPress={() => setSelected(new Set())} hitSlop={8}>
            <ThemedText type="small" themeColor="textSecondary">Clear</ThemedText>
          </Pressable>
          <ThemedText type="smallBold">{selected.size} selected</ThemedText>
          <Pressable onPress={() => confirmComplete([...selected])} style={[styles.completeBtn, { backgroundColor: theme.tint }]}>
            <ThemedText style={styles.completeTxt}>✓ Mark completed</ThemedText>
          </Pressable>
        </View>
      )}

      <TaskFilterSheet
        visible={filterOpen}
        due={dueFilter}
        onDue={setDueFilter}
        clients={clientOptions}
        selectedClients={clientFilter}
        onToggleClient={toggleClient}
        onClear={() => { setDueFilter('all'); setClientFilter([]); }}
        onClose={() => setFilterOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  filterBtn: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  check: { color: '#fff', fontWeight: '800', fontSize: 13, lineHeight: 15 },
  middle: { flex: 1, gap: 3 },
  dueCol: { alignItems: 'flex-end', minWidth: 74, gap: 1 },
  dueLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  dueTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, paddingBottom: 28, borderTopWidth: StyleSheet.hairlineWidth },
  completeBtn: { borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  completeTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
