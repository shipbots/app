import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { writeCache } from '@/api/cache';
import { AuthError, fetchAgents, fetchClientDocs, fetchColumnOptions, getClient, updateClientField } from '@/api/client';
import { SECTIONS, valueTypeFor, type Field } from '@/api/fields';
import type { ClientDetail, ClientDoc } from '@/api/types';
import { API_BASE_URL } from '@/config';
import { CollapsibleSection } from '@/components/collapsible-section';
import { OptionPicker } from '@/components/option-picker';
import { StickyNotes } from '@/components/sticky-notes';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v: string) {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}
function firstName(email?: string) {
  const l = (email || '').split('@')[0];
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const clientId = String(id);
  const theme = useTheme();

  const { data: fetched, loading, refreshing, error, refresh } = useCached(`client:${clientId}`, () => getClient(clientId));
  const [local, setLocal] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<Field | null>(null);
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [agents, setAgents] = useState<string[]>([]);
  const [docs, setDocs] = useState<ClientDoc[]>([]);

  useEffect(() => { if (fetched) setLocal(fetched); }, [fetched]);
  useEffect(() => {
    fetchColumnOptions().then(setOptions).catch(() => {});
    fetchAgents().then(setAgents).catch(() => {});
    fetchClientDocs(clientId).then(setDocs).catch(() => {});
  }, [clientId]);

  const c = local ?? fetched;

  const saveField = useCallback(async (field: Field, value: string) => {
    setSavingKey(field.key);
    const prev = c?.[field.key] ?? '';
    setLocal(l => (l ? { ...l, [field.key]: value } : l));
    try {
      await updateClientField(clientId, field.columnId, value, valueTypeFor(field.type));
      setLocal(l => { if (l) void writeCache(`client:${clientId}`, l); return l; });
    } catch {
      Alert.alert('Couldn’t save', 'Check your connection and try again.');
      setLocal(l => (l ? { ...l, [field.key]: prev } : l));
    } finally {
      setSavingKey(null);
    }
  }, [clientId, c]);

  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    if (picker.type === 'agent') return agents;
    return options[picker.columnId] ?? [];
  }, [picker, agents, options]);

  if (loading) {
    return <ThemedView style={styles.center}><ActivityIndicator color={theme.tint} /></ThemedView>;
  }
  if (!c) {
    return <ThemedView style={styles.center}><ThemedText type="small" themeColor="textSecondary">{error ? 'Couldn’t load — pull to retry.' : 'Client not found.'}</ThemedText></ThemedView>;
  }

  const warehouse = c.warehouseLocation ? `${c.warehouseLocation}${c.subWarehouse ? ` · ${subLetter(c.subWarehouse)}` : ''}` : '';
  const agent = firstName(c.supportAgentEmail);
  const openDoc = (d: ClientDoc) => {
    const url = d.kind === 'file' && d.assetId
      ? `${API_BASE_URL}/customer-service?clientId=${clientId}&expanded=1&previewAsset=${d.assetId}`
      : d.url;
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title: c.name,
          headerRight: () => (
            <Pressable onPress={() => setEditing(e => !e)} hitSlop={12} style={{ paddingHorizontal: 14 }}>
              <ThemedText style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{editing ? 'Done' : 'Edit'}</ThemedText>
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}>

        {/* Title + pills */}
        <ThemedText type="subtitle" style={styles.name}>{c.name}</ThemedText>
        {!!c.legalEntity && <ThemedText type="small" themeColor="textSecondary">{c.legalEntity}</ThemedText>}
        <View style={styles.pills}>
          {!!c.clientStatus && <Pill text={c.clientStatus} bg="#e6f8ff" fg="#015280" />}
          {!!warehouse && <Pill text={warehouse} bg="#ecfdf5" fg="#047857" />}
          <Pill text={agent || 'Unassigned'} bg={agent ? '#fef3c7' : '#f3f4f6'} fg={agent ? '#92400e' : '#6b7280'} />
          {!!c.portalDropdown && <Pill text={c.portalDropdown} bg="#e6f8ff" fg="#015280" />}
        </View>

        <View style={{ height: Spacing.two }} />

        {/* Sticky notes */}
        <StickyNotes clientId={clientId} />

        {/* Sections */}
        {SECTIONS.map(section => {
          const visible = editing
            ? section.fields
            : section.fields.filter(f => (c[f.key] ?? '').trim());
          if (!editing && visible.length === 0) return null;
          return (
            <CollapsibleSection key={section.id} title={section.title} defaultOpen={section.id === 'general' || section.id === 'contacts'}>
              {visible.map(f => (
                <FieldRow
                  key={f.key}
                  field={f}
                  value={c[f.key] ?? ''}
                  editing={editing}
                  saving={savingKey === f.key}
                  onEditText={saveField}
                  onOpenPicker={setPicker}
                />
              ))}
            </CollapsibleSection>
          );
        })}

        {/* Documents */}
        {docs.length > 0 && (
          <CollapsibleSection title={`Documents · ${docs.length}`} defaultOpen={false}>
            {docs.map((d, i) => (
              <Pressable key={d.url + i} onPress={() => openDoc(d)} style={[styles.docRow, { borderBottomColor: theme.border }]}>
                <ThemedText style={{ fontSize: 15 }}>{d.kind === 'file' ? '📄' : '🔗'}</ThemedText>
                <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>{d.name}</ThemedText>
                <ThemedText type="small" style={{ color: theme.tint }}>Open ↗</ThemedText>
              </Pressable>
            ))}
          </CollapsibleSection>
        )}

        <View style={{ height: Spacing.six }} />
      </ScrollView>

      <OptionPicker
        visible={!!picker}
        title={picker?.label ?? ''}
        options={pickerOptions}
        current={picker ? c[picker.key] : undefined}
        onSelect={value => { if (picker) saveField(picker, value); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
    </ThemedView>
  );
}

function Pill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{text}</ThemedText>
    </View>
  );
}

function FieldRow({
  field, value, editing, saving, onEditText, onOpenPicker,
}: {
  field: Field;
  value: string;
  editing: boolean;
  saving: boolean;
  onEditText: (field: Field, value: string) => void;
  onOpenPicker: (field: Field) => void;
  onCopy?: () => void;
}) {
  const theme = useTheme();
  const long = field.type === 'long';
  const pickable = field.type === 'dropdown' || field.type === 'status' || field.type === 'agent';

  if (!editing) {
    const openLink = () => {
      if (!field.link || !value) return;
      const target = field.link === 'tel' ? `tel:${value.replace(/[^0-9+]/g, '')}` : `mailto:${value.trim()}`;
      Linking.openURL(target).catch(() => {});
    };
    return (
      <View style={[long ? styles.block : styles.row, { borderBottomColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={long ? undefined : styles.label}>{field.label}</ThemedText>
        {field.link ? (
          <ThemedText type="small" onPress={openLink} style={[styles.value, { color: theme.tint, textDecorationLine: 'underline' }]}>{value}</ThemedText>
        ) : (
          <ThemedText type="small" style={long ? { marginTop: 2 } : styles.value}>{value}</ThemedText>
        )}
      </View>
    );
  }

  return (
    <View style={[long ? styles.block : styles.row, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={long ? undefined : styles.label}>{field.label}</ThemedText>
      {pickable ? (
        <Pressable onPress={() => onOpenPicker(field)} style={[styles.pickChip, { borderColor: theme.accent }]}>
          <ThemedText type="small" style={{ color: value ? theme.text : theme.textSecondary }}>{value || 'Select…'}</ThemedText>
          <ThemedText type="small" style={{ color: theme.textSecondary }}> ▾</ThemedText>
        </Pressable>
      ) : (
        <View style={[long ? { marginTop: 4 } : styles.value, styles.inputWrap]}>
          <TextInput
            defaultValue={value}
            multiline={long}
            placeholder={field.type === 'date' ? 'YYYY-MM-DD' : ''}
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            onEndEditing={e => { const t = e.nativeEvent.text; if (t !== value) onEditText(field, t); }}
            style={[styles.input, { borderColor: theme.accent, color: theme.text }, long && { minHeight: 54, textAlignVertical: 'top' }]}
          />
          {saving && <ActivityIndicator size="small" color={theme.tint} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scroll: { padding: Spacing.three },
  name: { fontSize: 22, lineHeight: 28 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.two },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  block: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { width: 100, flexShrink: 0, paddingTop: 2 },
  value: { flex: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  pickChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 7 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});
