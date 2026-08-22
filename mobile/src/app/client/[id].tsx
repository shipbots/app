import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { writeCache } from '@/api/cache';
import { fetchAgents, fetchClientDocs, fetchClientOnboarding, fetchColumnOptions, getClient, onboardingProgress, stepState, updateClientField, updateOnboardingField } from '@/api/client';
import { SECTIONS, valueTypeFor, type Field } from '@/api/fields';
import { useAuth } from '@/auth';
import type { ClientDetail, ClientDoc, OnboardingInfo, OnboardingStep } from '@/api/types';
import { API_BASE_URL } from '@/config';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ContactCards } from '@/components/contact-cards';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
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
  const { isAdmin, canDocusign } = useAuth();
  const canSeeBilling = canDocusign || isAdmin;

  const { data: fetched, loading, refreshing, error, refresh } = useCached(`client:${clientId}`, () => getClient(clientId));
  const [local, setLocal] = useState<ClientDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<Field | null>(null);
  const [options, setOptions] = useState<Record<string, string[]>>({});
  const [agents, setAgents] = useState<string[]>([]);
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingInfo | null>(null);
  const [onbStep, setOnbStep] = useState<OnboardingStep | null>(null);

  useEffect(() => { if (fetched) setLocal(fetched); }, [fetched]);
  useEffect(() => {
    fetchColumnOptions().then(setOptions).catch(() => {});
    fetchAgents().then(setAgents).catch(() => {});
    fetchClientDocs(clientId).then(setDocs).catch(() => {});
    if (isAdmin) fetchClientOnboarding(clientId).then(setOnboarding).catch(() => {});
  }, [clientId, isAdmin]);

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

  // Persist one or more contact columns (add / edit / delete a contact slot).
  // Optimistic; reverts + rethrows on failure so the editor sheet stays open.
  const saveContactFields = useCallback(async (updates: { key: string; columnId: string; value: string }[]) => {
    const snapshot = local ?? fetched ?? null;
    setLocal(l => {
      if (!l) return l;
      const next = { ...l };
      for (const u of updates) next[u.key] = u.value;
      return next;
    });
    try {
      for (const u of updates) await updateClientField(clientId, u.columnId, u.value, 'text');
      setLocal(l => { if (l) void writeCache(`client:${clientId}`, l); return l; });
    } catch (e) {
      Alert.alert('Couldn’t save', 'Check your connection and try again.');
      if (snapshot) setLocal({ ...snapshot });
      throw e;
    }
  }, [clientId, local, fetched]);

  const saveOnbStep = useCallback((step: OnboardingStep, value: string) => {
    const snapshot = onboarding;
    const prevPayment = c?.paymentOnFile ?? '';
    const isPayment = step.columnId === 'dropdown_mm47xxjv'; // lives on Clients board

    // 1) Optimistic — reflect the new status (and recomputed %) right away so
    //    the checklist looks like it updated instantly.
    setOnboarding(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map(s =>
        s.columnId === step.columnId ? { ...s, value, state: stepState(value, s.invertLogic) } : s,
      );
      return { ...prev, steps, progress: onboardingProgress(steps) };
    });
    if (isPayment) setLocal(l => (l ? { ...l, paymentOnFile: value } : l));

    // 2) Persist to Monday in the background; reconcile on success, revert on failure.
    (async () => {
      try {
        if (isPayment) await updateClientField(clientId, step.columnId, value, 'dropdown');
        else if (snapshot?.onboardingItemId) await updateOnboardingField(snapshot.onboardingItemId, step.columnId, value);
        // Best-effort reconcile with the server's authoritative state.
        fetchClientOnboarding(clientId).then(setOnboarding).catch(() => {});
      } catch {
        setOnboarding(snapshot);
        if (isPayment) setLocal(l => (l ? { ...l, paymentOnFile: prevPayment } : l));
        Alert.alert('Couldn’t save', 'Please try again.');
      }
    })();
  }, [clientId, onboarding, c]);

  const pickerOptions = useMemo(() => {
    if (!picker) return [];
    if (picker.type === 'agent') return agents;
    return options[picker.columnId] ?? [];
  }, [picker, agents, options]);

  // Lets the header pills open the same picker the body fields use.
  const fieldByKey = useMemo(() => {
    const m: Record<string, Field> = {};
    for (const s of SECTIONS) for (const f of s.fields) m[f.key] = f;
    return m;
  }, []);
  const openPill = useCallback((key: string) => {
    const f = fieldByKey[key];
    if (f) setPicker(f);
  }, [fieldByKey]);

  if (loading) {
    return <ThemedView style={styles.center}><ActivityIndicator color={theme.tint} /></ThemedView>;
  }
  if (!c) {
    return <ThemedView style={styles.center}><ThemedText type="small" themeColor="textSecondary">{error ? 'Couldn’t load — pull to retry.' : 'Client not found.'}</ThemedText></ThemedView>;
  }

  const warehouse = c.warehouseLocation ? `${c.warehouseLocation}${c.subWarehouse ? ` · ${subLetter(c.subWarehouse)}` : ''}` : '';
  const agent = firstName(c.supportAgentEmail);
  const openDoc = (d: ClientDoc) => {
    // Prefer the direct (signed) asset URL — it opens in the in-app browser
    // without a web login. The old path opened the cookie-gated
    // /customer-service preview page, which on the app just hit the Google
    // login wall, so files looked "un-viewable". Fall back to that page only
    // if Monday didn't return a public URL for the asset.
    const url = d.url
      || (d.assetId ? `${API_BASE_URL}/customer-service?clientId=${clientId}&expanded=1&previewAsset=${d.assetId}` : '');
    if (!url) { Alert.alert('Can’t open', 'No link is available for this document.'); return; }
    WebBrowser.openBrowserAsync(url).catch(() => {});
  };

  // Documents grouped by category so each shows under its matching section
  // (Receiving / Packing / Returns), with a 📄 badge on that section's header.
  // Everything else falls into a general "Documents" section at the bottom.
  const SECTION_DOC_CATS = new Set(['receiving', 'packing', 'returns']);
  const generalDocs = docs.filter(d => !SECTION_DOC_CATS.has(d.category));

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
          <Pill text={c.clientStatus || 'Set status'} bg={c.clientStatus ? '#e6f8ff' : '#f3f4f6'} fg={c.clientStatus ? '#015280' : '#9ca3af'} onPress={() => openPill('clientStatus')} />
          <Pill text={warehouse || 'Set warehouse'} bg={warehouse ? '#ecfdf5' : '#f3f4f6'} fg={warehouse ? '#047857' : '#9ca3af'} onPress={() => openPill('warehouseLocation')} />
          <Pill text={agent || 'Unassigned'} bg={agent ? '#fef3c7' : '#f3f4f6'} fg={agent ? '#92400e' : '#9ca3af'} onPress={() => openPill('supportAgentEmail')} />
          <Pill text={c.portalDropdown || 'Set platform'} bg={c.portalDropdown ? '#e6f8ff' : '#f3f4f6'} fg={c.portalDropdown ? '#015280' : '#9ca3af'} onPress={() => openPill('portalDropdown')} />
        </View>

        <View style={{ height: Spacing.three }} />

        {/* Contacts — swipeable cards with inline add / edit / delete (3 slots) */}
        <ContactCards client={c} onSave={saveContactFields} />

        {/* Sticky notes */}
        <StickyNotes clientId={clientId} />

        {/* Onboarding checklist — onboarding-access users; collapsed by default,
            tap the header to expand, tap a step to change its status. */}
        {isAdmin && onboarding && onboarding.steps.length > 0 && (
          <View style={{ marginTop: Spacing.three }}>
            <CollapsibleSection
              title="Onboarding Checklist"
              defaultOpen={false}
              badge={
                <View style={[styles.obBadge, { backgroundColor: onboarding.progress >= 100 ? '#ecfdf5' : '#e6f8ff' }]}>
                  <ThemedText style={{ fontSize: 11, fontWeight: '800', color: onboarding.progress >= 100 ? '#047857' : '#015280' }}>
                    {onboarding.progress >= 100 ? '✓ Complete' : `${onboarding.progress}%`}
                  </ThemedText>
                </View>
              }>
              <OnboardingChecklist info={onboarding} onEdit={setOnbStep} />
            </CollapsibleSection>
          </View>
        )}

        {/* Sections */}
        {SECTIONS.map(section => {
          // Billing/pricing only for users with DocuSign or onboarding access.
          if (section.gated === 'billing' && !canSeeBilling) return null;
          // Contacts are fully managed by the swipeable cards above (inline
          // add / edit / delete), so the flat Contact Info list is retired.
          if (section.id === 'contacts') return null;
          // Docs whose category matches this section show inline beneath its
          // fields (with a badge), so Receiving docs live under Receiving, etc.
          const sectionDocs = SECTION_DOC_CATS.has(section.id) ? docs.filter(d => d.category === section.id) : [];
          const visible = editing
            ? section.fields
            : section.fields.filter(f => (c[f.key] ?? '').trim());
          // Show the section if it has visible fields OR documents to surface.
          if (!editing && visible.length === 0 && sectionDocs.length === 0) return null;
          return (
            <CollapsibleSection
              key={section.id}
              title={section.title}
              defaultOpen={false}
              badge={sectionDocs.length > 0 ? <DocBadge n={sectionDocs.length} /> : undefined}>
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
              {sectionDocs.length > 0 && (
                <View style={{ marginTop: visible.length ? Spacing.two : 0 }}>
                  {visible.length > 0 && (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.docsHeading}>📎 Documents</ThemedText>
                  )}
                  {sectionDocs.map((d, i) => <DocLink key={d.url + i} d={d} onOpen={openDoc} />)}
                </View>
              )}
            </CollapsibleSection>
          );
        })}

        {/* General documents (not tied to a specific section) */}
        {generalDocs.length > 0 && (
          <CollapsibleSection title="Documents" defaultOpen={false} badge={<DocBadge n={generalDocs.length} />}>
            {generalDocs.map((d, i) => <DocLink key={d.url + i} d={d} onOpen={openDoc} />)}
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

      <OptionPicker
        visible={!!onbStep}
        title={onbStep?.label ?? ''}
        options={onbStep?.options ?? []}
        current={onbStep?.value}
        onSelect={value => { if (onbStep) saveOnbStep(onbStep, value); setOnbStep(null); }}
        onClose={() => setOnbStep(null)}
      />
    </ThemedView>
  );
}

function DocBadge({ n }: { n: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.docBadge, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText style={{ fontSize: 11, fontWeight: '800', color: theme.tint }}>📄 {n}</ThemedText>
    </View>
  );
}

function DocLink({ d, onOpen }: { d: ClientDoc; onOpen: (d: ClientDoc) => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={() => onOpen(d)} style={[styles.docRow, { borderBottomColor: theme.border }]}>
      <ThemedText style={{ fontSize: 15 }}>{d.kind === 'file' ? '📄' : '🔗'}</ThemedText>
      <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>{d.name}</ThemedText>
      <ThemedText type="small" style={{ color: theme.tint }}>Open ↗</ThemedText>
    </Pressable>
  );
}

function Pill({ text, bg, fg, onPress }: { text: string; bg: string; fg: string; onPress?: () => void }) {
  const body = (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <ThemedText style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{text}</ThemedText>
      {onPress && <ThemedText style={{ color: fg, fontSize: 11, fontWeight: '700', opacity: 0.5 }}> ▾</ThemedText>}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} hitSlop={6}>{body}</Pressable> : body;
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
  name: { fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  pill: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  obBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  block: { paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { width: 100, flexShrink: 0, paddingTop: 2 },
  value: { flex: 1 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1, borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  pickChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 7 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  docBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  docsHeading: { fontWeight: '700', marginBottom: 4 },
});
