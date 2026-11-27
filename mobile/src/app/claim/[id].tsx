import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { writeCache } from '@/api/cache';
import {
  CLAIM_FIELDS, claimStatusColor, fetchClaims, formatClaimDate, formatClaimValue, updateClaim, uploadClaimFiles,
} from '@/api/claims';
import type { Claim, ClaimFields, ClaimsPayload } from '@/api/types';
import { ClaimForm, type ClaimFormValues } from '@/components/claim-form';
import { ClaimPhotos } from '@/components/claim-photos';
import { claimsCacheKey } from '@/components/claims-section';
import { CollapsibleSection } from '@/components/collapsible-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

function toValues(c: Claim): ClaimFormValues {
  const v = {} as ClaimFormValues;
  for (const f of CLAIM_FIELDS) v[f.key] = String((c as unknown as Record<string, string>)[f.key] ?? '');
  return v;
}

/** One claim: every field + attachments. "Edit" turns the fields into the
 *  claim form; Save sends only what changed. Photos upload immediately. */
export default function ClaimScreen() {
  const { id, clientId } = useLocalSearchParams<{ id: string; clientId: string }>();
  const theme = useTheme();
  const key = claimsCacheKey(String(clientId));
  const { data, loading, refreshing, refresh } = useCached(key, () => fetchClaims(String(clientId)));
  const [override, setOverride] = useState<Claim | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClaimFormValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | undefined>();

  const fromList = useMemo(() => data?.claims.find(c => c.id === String(id)) ?? null, [data, id]);
  // A just-saved edit wins until the next refresh (which clears it).
  const claim = override ?? fromList;
  const options = data?.options ?? { statuses: [], reasons: [], groups: [] };

  // Put a fresh copy of this claim into the shared cache (so the client page's
  // list shows the change instantly) and on screen.
  const applyClaim = async (next: Claim) => {
    setOverride(next);
    if (data) {
      const payload: ClaimsPayload = { ...data, claims: data.claims.map(c => (c.id === next.id ? next : c)) };
      await writeCache(key, payload);
    }
  };

  const startEdit = () => { if (claim) { setDraft(toValues(claim)); setEditing(true); } };
  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const save = async () => {
    if (!claim || !draft) return;
    for (const k of ['dateSubmitted', 'dateResolved'] as const) {
      if (draft[k] && !/^\d{4}-\d{2}-\d{2}$/.test(draft[k].trim())) {
        Alert.alert('Check the date', 'Dates must look like 2026-11-25 (or tap “Today”).');
        return;
      }
    }
    const before = toValues(claim);
    const fields: ClaimFields = {};
    for (const f of CLAIM_FIELDS) {
      if (f.key === 'groupId') continue;
      const v = draft[f.key].trim();
      if (v !== before[f.key]) fields[f.key] = f.key === 'orderNumber' ? v.replace(/^#/, '') : v;
    }
    const groupId = draft.groupId && draft.groupId !== claim.groupId ? draft.groupId : undefined;
    if (!Object.keys(fields).length && !groupId) { cancelEdit(); return; }
    setSaving(true);
    try {
      await applyClaim(await updateClaim(claim.id, { fields: Object.keys(fields).length ? fields : undefined, groupId }));
      cancelEdit();
    } catch (e) {
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const addPhotos = async (files: Parameters<typeof uploadClaimFiles>[1]) => {
    if (!claim) return;
    const failed = await uploadClaimFiles(claim.id, files, (done, total) =>
      setUploading(done < total ? `Uploading photo ${done + 1} of ${total}…` : 'Finishing…'));
    setUploading(undefined);
    if (failed.length) Alert.alert('Some photos didn’t upload', failed.join(', '));
    setOverride(null);
    await refresh();
  };

  if (loading && !data) {
    return <ThemedView style={styles.center}><ActivityIndicator color={theme.tint} /></ThemedView>;
  }
  if (!claim) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">Claim not found — it may have been moved or deleted.</ThemedText>
      </ThemedView>
    );
  }

  const title = claim.orderNumber ? `Claim #${claim.orderNumber.replace(/^#/, '')}` : 'Claim';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            editing ? (
              <Pressable onPress={save} disabled={saving} hitSlop={12} style={{ paddingHorizontal: 14 }}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <ThemedText style={styles.headerBtn}>Save</ThemedText>}
              </Pressable>
            ) : (
              <Pressable onPress={startEdit} hitSlop={12} style={{ paddingHorizontal: 14 }}>
                <ThemedText style={styles.headerBtn}>Edit</ThemedText>
              </Pressable>
            )
          ),
        }}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={editing ? undefined : <RefreshControl refreshing={refreshing} onRefresh={() => { setOverride(null); void refresh(); }} tintColor={theme.tint} />}>

          <View style={styles.headRow}>
            <View style={[styles.status, { backgroundColor: claimStatusColor(claim.status) }]}>
              <ThemedText style={styles.statusText}>{claim.status || 'No status'}</ThemedText>
            </View>
            <View style={[styles.stage, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" style={{ fontWeight: '700' }}>{claim.groupTitle}</ThemedText>
            </View>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three }}>{claim.name}</ThemedText>

          {editing && draft ? (
            <>
              <ClaimForm values={draft} options={options} onChange={(k, v) => setDraft(d => (d ? { ...d, [k]: v } : d))} />
              <Pressable onPress={cancelEdit} style={[styles.cancel, { borderColor: theme.border }]}>
                <ThemedText style={{ fontWeight: '700' }}>Cancel</ThemedText>
              </Pressable>
            </>
          ) : (
            <CollapsibleSection title="Details">
              {CLAIM_FIELDS.map(f => {
                let v = f.key === 'groupId' ? claim.groupTitle : String((claim as unknown as Record<string, string>)[f.key] ?? '');
                if (f.kind === 'date') v = formatClaimDate(v);
                if (f.key === 'value') v = formatClaimValue(v);
                const long = f.kind === 'long';
                return (
                  <View key={f.key} style={[long ? styles.block : styles.row, { borderBottomColor: theme.border }]}>
                    <ThemedText type="small" themeColor="textSecondary" style={long ? undefined : styles.label}>{f.label}</ThemedText>
                    <ThemedText type="small" style={[long ? { marginTop: 2 } : styles.value, !v && { color: theme.textSecondary }]}>{v || '—'}</ThemedText>
                  </View>
                );
              })}
            </CollapsibleSection>
          )}

          <CollapsibleSection title={`Photos & files${claim.files.length ? ` (${claim.files.length})` : ''}`}>
            <ClaimPhotos saved={claim.files} onAdd={addPhotos} busyText={uploading} />
          </CollapsibleSection>

          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Monday item {claim.id}{claim.createdAt ? ` · created ${formatClaimDate(claim.createdAt)}` : ''}
          </ThemedText>
          <View style={{ height: Spacing.six }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scroll: { padding: Spacing.three },
  headerBtn: { color: '#fff', fontWeight: '700', fontSize: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  status: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7 },
  statusText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  stage: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  block: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { width: 120, flexShrink: 0 },
  value: { flex: 1 },
  cancel: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: Spacing.three },
});
