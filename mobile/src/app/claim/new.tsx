import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { createClaim, fetchClaims, todayIso, uploadClaimFiles, type LocalFile } from '@/api/claims';
import { getCurrentUser } from '@/api/client';
import type { ClaimFields, ClaimOptions } from '@/api/types';
import { ClaimForm, emptyClaimValues, type ClaimFormValues } from '@/components/claim-form';
import { ClaimPhotos } from '@/components/claim-photos';
import { claimsCacheKey } from '@/components/claims-section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Shadow, Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

function firstName(email?: string | null) {
  const l = (email || '').split('@')[0];
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}

/** New-claim questionnaire: every Claims-board field + photos. Creates the
 *  claim on Monday (linked to the client), uploads photos one by one, then
 *  returns to the client page (which refreshes its Claims list). */
export default function NewClaimScreen() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { data } = useCached(claimsCacheKey(String(clientId)), () => fetchClaims(String(clientId)));
  const options: ClaimOptions = data?.options ?? { statuses: [], reasons: [], groups: [] };

  const [values, setValues] = useState<ClaimFormValues>(() => ({
    ...emptyClaimValues(),
    status: 'New',
    dateSubmitted: todayIso(),
    whoRequested: firstName(getCurrentUser()),
  }));
  const [photos, setPhotos] = useState<LocalFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // Default the stage to the board's first group (Open) once options load.
  useEffect(() => {
    if (!values.groupId && options.groups[0]) setValues(v => ({ ...v, groupId: options.groups[0].id }));
  }, [options.groups, values.groupId]);

  const set = (key: keyof ClaimFormValues, value: string) => setValues(v => ({ ...v, [key]: value }));

  const submit = async () => {
    const order = values.orderNumber.trim().replace(/^#/, '');
    if (!order && !values.trackingNumber.trim()) {
      Alert.alert('Almost there', 'Add an order number or a tracking number.');
      return;
    }
    if (!values.reason) {
      Alert.alert('Almost there', 'Pick a reason for the claim.');
      return;
    }
    for (const k of ['dateSubmitted', 'dateResolved'] as const) {
      if (values[k] && !/^\d{4}-\d{2}-\d{2}$/.test(values[k].trim())) {
        Alert.alert('Check the date', 'Dates must look like 2026-11-25 (or tap “Today”).');
        return;
      }
    }
    const { groupId, ...rest } = values;
    const fields: ClaimFields = {};
    for (const [k, v] of Object.entries(rest)) fields[k as keyof ClaimFields] = v.trim();
    fields.orderNumber = order;

    setBusy('Creating the claim…');
    try {
      const claim = await createClaim({
        clientId: String(clientId),
        clientName: String(clientName || ''),
        fields,
        groupId: groupId || undefined,
      });
      let failed: string[] = [];
      if (photos.length) {
        failed = await uploadClaimFiles(claim.id, photos, (done, total) =>
          setBusy(done < total ? `Claim created. Uploading photo ${done + 1} of ${total}…` : 'Finishing…'));
      }
      if (failed.length) {
        Alert.alert('Claim created', `These photos didn’t upload: ${failed.join(', ')}. Open the claim to try adding them again.`);
      }
      router.back();
    } catch (e) {
      setBusy(null);
      Alert.alert('Couldn’t create the claim', e instanceof Error ? e.message : 'Please try again.');
    }
  };

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: 'New claim', presentation: 'modal' }} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!!clientName && (
            <ThemedText type="small" themeColor="textSecondary" style={{ marginBottom: Spacing.three }}>
              Filing a claim for <ThemedText type="smallBold">{clientName}</ThemedText>
            </ThemedText>
          )}
          <ClaimForm values={values} options={options} onChange={set} required={['orderNumber', 'reason']} />

          <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>Photos & files</ThemedText>
          <ClaimPhotos
            pending={photos}
            onAdd={files => setPhotos(p => [...p, ...files])}
            onRemovePending={i => setPhotos(p => p.filter((_, j) => j !== i))}
          />
          <View style={{ height: 110 }} />
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.card, borderTopColor: theme.border }, Shadow.raised]}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{busy}</ThemedText>
            </View>
          ) : (
            <Pressable onPress={submit} style={[styles.submit, { backgroundColor: theme.tint }]} accessibilityRole="button">
              <ThemedText style={styles.submitText}>Submit claim{photos.length ? ` + ${photos.length} photo${photos.length === 1 ? '' : 's'}` : ''}</ThemedText>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { padding: Spacing.three },
  sectionLabel: { fontWeight: '600', marginBottom: 5 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.three, paddingBottom: Spacing.four, borderTopWidth: StyleSheet.hairlineWidth },
  submit: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12 },
});
