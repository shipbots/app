import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, TextInput, View,
} from 'react-native';

import { contactHasData, slotFields, type ContactSlot } from '@/api/contacts';
import type { ClientDetail } from '@/api/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

export interface ContactUpdate { key: string; columnId: string; value: string }

/**
 * Bottom-sheet form to add / edit / delete one contact slot. Save only writes
 * the fields that actually changed; Delete clears every column in the slot.
 */
export function ContactEditor({
  visible, slot, client, saving, onSave, onDelete, onClose,
}: {
  visible: boolean;
  slot: ContactSlot | null;
  client: ClientDetail | null;
  saving: boolean;
  onSave: (slot: ContactSlot, updates: ContactUpdate[]) => void;
  onDelete: (slot: ContactSlot) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [extra, setExtra] = useState('');

  // Seed inputs from the client each time the sheet opens on a slot.
  useEffect(() => {
    if (visible && slot && client) {
      setName(client[slot.name.key] ?? '');
      setEmail(client[slot.email.key] ?? '');
      setPhone(client[slot.phone.key] ?? '');
      setExtra(client[slot.extra.key] ?? '');
    }
  }, [visible, slot, client]);

  if (!slot) return null;
  const existing = client ? contactHasData(client, slot) : false;

  const handleSave = () => {
    const next: Record<string, string> = {
      [slot.name.key]: name.trim(),
      [slot.email.key]: email.trim(),
      [slot.phone.key]: phone.trim(),
      [slot.extra.key]: extra.trim(),
    };
    const updates: ContactUpdate[] = slotFields(slot)
      .map(f => ({ key: f.key, columnId: f.columnId, value: next[f.key] }))
      .filter(u => (client?.[u.key] ?? '') !== u.value); // only changed columns
    onSave(slot, updates);
  };

  const handleDelete = () => {
    Alert.alert('Delete contact?', `Remove the ${slot.role.toLowerCase()} from this client.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(slot) },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card }]} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Pressable onPress={onClose} hitSlop={8}>
                <ThemedText style={{ color: theme.textSecondary }}>Cancel</ThemedText>
              </Pressable>
              <ThemedText type="smallBold">{existing ? 'Edit' : 'Add'} contact</ThemedText>
              <Pressable onPress={handleSave} hitSlop={8} disabled={saving} style={{ minWidth: 44, alignItems: 'flex-end' }}>
                {saving
                  ? <ActivityIndicator size="small" color={theme.tint} />
                  : <ThemedText style={{ color: theme.tint, fontWeight: '700' }}>Save</ThemedText>}
              </Pressable>
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.role}>{slot.role}</ThemedText>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
              <Labeled label="Name">
                <Field value={name} onChangeText={setName} placeholder="Full name" autoCapitalize="words" />
              </Labeled>
              <Labeled label="Email">
                <Field value={email} onChangeText={setEmail} placeholder="name@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
              </Labeled>
              <Labeled label="Phone">
                <Field value={phone} onChangeText={setPhone} placeholder="(555) 555-5555" keyboardType="phone-pad" />
              </Labeled>
              <Labeled label={slot.extra.label}>
                <Field value={extra} onChangeText={setExtra} placeholder={slot.extra.label} autoCapitalize="none" />
              </Labeled>

              {existing && (
                <Pressable onPress={handleDelete} disabled={saving} style={[styles.deleteBtn, { borderColor: theme.danger }]}>
                  <ThemedText style={{ color: theme.danger, fontWeight: '700' }}>🗑  Delete contact</ThemedText>
                </Pressable>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.labeled}>
      <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: 4 }}>{label}</ThemedText>
      {children}
    </View>
  );
}

function Field(props: ComponentProps<typeof TextInput>) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.input, { borderColor: theme.accent, color: theme.text, backgroundColor: theme.background }]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 34, paddingTop: 8, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#c7c7cc', marginBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  role: { paddingHorizontal: Spacing.three, marginTop: -4, marginBottom: 4 },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.three },
  labeled: {},
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, fontSize: 15 },
  deleteBtn: { marginTop: Spacing.two, alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 12 },
});
