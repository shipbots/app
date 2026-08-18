import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { addStickyNote, getStickyNotes, saveStickyNotes } from '@/api/client';
import type { StickyNote } from '@/api/types';
import { NOTE_COLOR_KEYS, NoteColors, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

function firstName(email?: string) {
  const l = (email || '').split('@')[0];
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}
function shortDate(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function StickyNotes({ clientId }: { clientId: string }) {
  const theme = useTheme();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [color, setColor] = useState<string>('yellow');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    let alive = true;
    getStickyNotes(clientId)
      .then(n => alive && (setNotes(n), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [clientId]);

  const add = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    try {
      const note = await addStickyNote(clientId, text, color);
      setNotes(prev => [note, ...prev]);
      setDraft('');
    } catch {
      Alert.alert('Couldn’t add note', 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('Delete note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const next = notes.filter(n => n.id !== id);
          setNotes(next);
          try { await saveStickyNotes(clientId, next); } catch { Alert.alert('Couldn’t delete', 'Please try again.'); }
        },
      },
    ]);
  };

  const saveEdit = async (id: string) => {
    const next = notes.map(n => (n.id === id ? { ...n, text: editText } : n));
    setNotes(next);
    setEditingId(null);
    try { await saveStickyNotes(clientId, next); } catch { Alert.alert('Couldn’t save', 'Please try again.'); }
  };

  return (
    <View style={[styles.wrap, { backgroundColor: theme.notesBg, borderColor: theme.border }]}>
      <ThemedText style={[styles.header, { color: theme.tint }]}>
        📌 Sticky notes{notes.length ? ` · ${notes.length}` : ''}
      </ThemedText>

      <View style={[styles.composer, { borderColor: theme.inputBorder, backgroundColor: theme.card }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a note…"
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.input, { color: theme.text }]}
        />
        <View style={styles.composerBar}>
          <View style={styles.dots}>
            {NOTE_COLOR_KEYS.map(k => (
              <Pressable
                key={k}
                onPress={() => setColor(k)}
                style={[styles.dot, { backgroundColor: NoteColors[k].border, borderWidth: color === k ? 2 : 0, borderColor: theme.text }]}
              />
            ))}
          </View>
          <Pressable
            onPress={add}
            disabled={busy || !draft.trim()}
            style={[styles.addBtn, { backgroundColor: theme.tint, opacity: busy || !draft.trim() ? 0.5 : 1 }]}>
            <ThemedText style={styles.addTxt}>Add</ThemedText>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.tint} style={{ marginTop: 10 }} />
      ) : notes.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 8 }}>
          No sticky notes for this client yet.
        </ThemedText>
      ) : (
        notes.map(n => {
          const c = NoteColors[n.color] ?? NoteColors.yellow;
          const editing = editingId === n.id;
          return (
            <View key={n.id} style={[styles.note, { backgroundColor: c.bg, borderColor: c.border }]}>
              <ThemedText style={[styles.noteMeta, { color: c.text }]}>
                {[shortDate(n.createdAt), firstName(n.authorEmail)].filter(Boolean).join(' · ').toUpperCase()}
              </ThemedText>
              {editing ? (
                <>
                  <TextInput
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                    style={[styles.noteInput, { color: c.text, borderColor: c.border }]}
                  />
                  <View style={styles.noteActions}>
                    <Pressable onPress={() => setEditingId(null)}><ThemedText style={{ color: c.text }}>Cancel</ThemedText></Pressable>
                    <Pressable onPress={() => saveEdit(n.id)}><ThemedText style={{ color: c.text, fontWeight: '700' }}>Save</ThemedText></Pressable>
                  </View>
                </>
              ) : (
                <>
                  <ThemedText style={[styles.noteText, { color: c.text }]}>{n.text || '(empty)'}</ThemedText>
                  <View style={styles.noteActions}>
                    <Pressable onPress={() => { setEditingId(n.id); setEditText(n.text); }}><ThemedText style={{ color: c.text }}>Edit</ThemedText></Pressable>
                    <Pressable onPress={() => remove(n.id)}><ThemedText style={{ color: c.text }}>Delete</ThemedText></Pressable>
                  </View>
                </>
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: Spacing.three, marginBottom: Spacing.two },
  header: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: Spacing.two },
  composer: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.two },
  input: { minHeight: 40, fontSize: 14, textAlignVertical: 'top' },
  composerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.two },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 20, height: 20, borderRadius: 10 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  addTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
  note: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: Spacing.two },
  noteMeta: { fontSize: 9, fontWeight: '700', letterSpacing: 0.4, opacity: 0.7, marginBottom: 4 },
  noteText: { fontSize: 13, lineHeight: 18 },
  noteInput: { fontSize: 13, borderWidth: 1, borderRadius: 6, padding: 6, minHeight: 44, textAlignVertical: 'top' },
  noteActions: { flexDirection: 'row', gap: 18, marginTop: 8, justifyContent: 'flex-end' },
});
