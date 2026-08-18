import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { fetchTaskBoardInfo, findClientIdByName, updateTask, type TaskPatch } from '@/api/client';
import type { TaskBoardInfo } from '@/api/types';
import { OptionPicker } from '@/components/option-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const DONE = /(done|complete|finished)/i;

export default function TaskDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; status: string; dueDate: string; clientName: string; notes: string }>();
  const id = String(params.id);
  const clientName = params.clientName ?? '';

  const [name, setName] = useState(params.name ?? '');
  const [status, setStatus] = useState(params.status ?? '');
  const [dueDate, setDueDate] = useState(params.dueDate ?? '');
  const [notes, setNotes] = useState(params.notes ?? '');
  const [info, setInfo] = useState<TaskBoardInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickStatus, setPickStatus] = useState(false);

  useEffect(() => { fetchTaskBoardInfo().then(setInfo).catch(() => {}); }, []);

  const boardId = info?.boardId ?? null;
  const doneLabel = useMemo(() => (info?.statusOptions ?? []).find(o => DONE.test(o)) ?? 'Done', [info]);
  const isDone = DONE.test(status);

  async function run(patch: TaskPatch) {
    setSaving(true);
    try {
      await updateTask(id, patch);
    } catch {
      Alert.alert('Couldn’t save', 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }
  const needBoard = () => { if (!boardId) Alert.alert('One sec', 'Task board still loading — try again.'); return boardId; };

  const saveName = () => { const b = boardId; if (b && name !== (params.name ?? '')) run({ boardId: b, name }); };
  const saveDate = () => { const b = boardId; if (b && dueDate !== (params.dueDate ?? '')) run({ boardId: b, dateColumnId: info?.dateColumnId ?? undefined, dueDate }); };
  const saveNotes = () => { const b = boardId; if (b && notes !== (params.notes ?? '')) run({ boardId: b, notesColumnId: info?.notesColumnId ?? undefined, notes }); };
  const applyStatus = (v: string) => {
    setStatus(v);
    const b = boardId;
    if (b) run({ boardId: b, statusColumnId: info?.statusColumnId ?? undefined, status: v });
  };
  const markComplete = () => {
    if (!needBoard()) return;
    applyStatus(doneLabel);
    router.back();
  };
  const openClient = async () => {
    const cid = await findClientIdByName(clientName);
    if (cid) router.push({ pathname: '/client/[id]', params: { id: cid } });
    else Alert.alert('Client not found', 'Couldn’t match this task to a client record.');
  };

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: 'Task', headerRight: () => (saving ? <ActivityIndicator color="#fff" style={{ marginRight: 12 }} /> : null) }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">Task name</ThemedText>
        <TextInput
          defaultValue={name}
          onChangeText={setName}
          onEndEditing={saveName}
          placeholder="Task name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.titleInput, { color: theme.text, borderColor: theme.border }]}
          multiline
        />

        {!isDone && (
          <Pressable onPress={markComplete} style={[styles.completeBtn, { backgroundColor: theme.success }]}>
            <ThemedText style={styles.completeTxt}>✓ Mark complete</ThemedText>
          </Pressable>
        )}

        <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
          <Row label="Status">
            <Pressable onPress={() => setPickStatus(true)} style={[styles.chip, { borderColor: theme.accent }]}>
              <ThemedText type="small" style={{ color: isDone ? theme.success : theme.text }}>{status || 'Set status…'} ▾</ThemedText>
            </Pressable>
          </Row>
          <Row label="Due date">
            <TextInput
              defaultValue={dueDate}
              onChangeText={setDueDate}
              onEndEditing={saveDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              style={[styles.input, { color: theme.text, borderColor: theme.accent }]}
            />
          </Row>
          <Row label="Client">
            {clientName ? (
              <Pressable onPress={openClient} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.tint, textDecorationLine: 'underline' }}>{clientName} ↗</ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">—</ThemedText>
            )}
          </Row>
        </ThemedView>

        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: Spacing.two }}>Notes</ThemedText>
        <TextInput
          defaultValue={notes}
          onChangeText={setNotes}
          onEndEditing={saveNotes}
          placeholder="Add notes…"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.notes, { color: theme.text, borderColor: theme.border }]}
        />
      </ScrollView>

      <OptionPicker
        visible={pickStatus}
        title="Status"
        options={info?.statusOptions ?? []}
        current={status}
        allowClear={false}
        onSelect={v => { applyStatus(v); setPickStatus(false); }}
        onClose={() => setPickStatus(false)}
      />
    </ThemedView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>{label}</ThemedText>
      <View style={styles.rowValue}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.three },
  titleInput: { fontSize: 18, fontWeight: '700', borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.two, marginTop: 4 },
  completeBtn: { marginTop: Spacing.three, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  completeTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three, marginTop: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { width: 80 },
  rowValue: { flex: 1, alignItems: 'flex-start' },
  chip: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  input: { flex: 1, alignSelf: 'stretch', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  notes: { minHeight: 90, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.two, marginTop: 4, fontSize: 14, textAlignVertical: 'top' },
});
