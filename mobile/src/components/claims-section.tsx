import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { claimStatusColor, fetchClaims, formatClaimDate, formatClaimValue, isActiveClaim } from '@/api/claims';
import type { Claim } from '@/api/types';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';
import { CollapsibleSection } from './collapsible-section';
import { ThemedText } from './themed-text';

/** Cache key shared by the section and the claim screens. */
export const claimsCacheKey = (clientId: string) => `claims:${clientId}`;

/** "Claims" card on the client page: this client's claims from the Monday
 *  Claims board (active ones first), tap one to view/edit, "+ New claim" to file
 *  one. Refreshes whenever the client page regains focus (e.g. after saving). */
export function ClaimsSection({ clientId, clientName }: { clientId: string; clientName: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data, loading, error, refresh } = useCached(claimsCacheKey(clientId), () => fetchClaims(clientId));
  const [showClosed, setShowClosed] = useState(false);

  // Refetch when coming back from the claim / new-claim screens (skip the first
  // focus — useCached already loads on mount).
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    void refresh();
  }, [refresh]));

  const claims = data?.claims ?? [];
  const active = claims.filter(isActiveClaim);
  const closed = claims.filter(c => !isActiveClaim(c));

  const badge = active.length > 0 ? (
    <View style={[styles.badge, { backgroundColor: '#fff4e5' }]}>
      <ThemedText style={{ fontSize: 11, fontWeight: '800', color: '#b45309' }}>{active.length} active</ThemedText>
    </View>
  ) : undefined;

  const openClaim = (c: Claim) => router.push({ pathname: '/claim/[id]', params: { id: c.id, clientId } });
  const newClaim = () => router.push({ pathname: '/claim/new', params: { clientId, clientName } });

  return (
    <View style={{ marginTop: Spacing.three }}>
      <CollapsibleSection title="Claims" defaultOpen={false} badge={badge}>
        {loading && !data ? (
          <ActivityIndicator color={theme.tint} style={{ paddingVertical: Spacing.three }} />
        ) : error && !data ? (
          <Pressable onPress={() => void refresh()}>
            <ThemedText type="small" style={{ color: theme.danger, paddingVertical: Spacing.two }}>
              Couldn’t load claims — tap to retry.
            </ThemedText>
          </Pressable>
        ) : (
          <>
            {claims.length === 0 && (
              <ThemedText type="small" themeColor="textSecondary" style={{ paddingVertical: Spacing.two }}>
                No claims for this client yet.
              </ThemedText>
            )}
            {active.map(c => <ClaimRow key={c.id} claim={c} onPress={() => openClaim(c)} />)}
            {closed.length > 0 && (
              <Pressable onPress={() => setShowClosed(s => !s)} style={styles.closedToggle} hitSlop={6}>
                <ThemedText type="small" style={{ color: theme.tint, fontWeight: '700' }}>
                  {showClosed ? 'Hide' : 'Show'} {closed.length} closed claim{closed.length === 1 ? '' : 's'}
                </ThemedText>
              </Pressable>
            )}
            {showClosed && closed.map(c => <ClaimRow key={c.id} claim={c} onPress={() => openClaim(c)} />)}
          </>
        )}
        <Pressable onPress={newClaim} style={[styles.newBtn, { backgroundColor: theme.tint }]} accessibilityRole="button">
          <ThemedText style={styles.newBtnText}>+ New claim</ThemedText>
        </Pressable>
      </CollapsibleSection>
    </View>
  );
}

function ClaimRow({ claim, onPress }: { claim: Claim; onPress: () => void }) {
  const theme = useTheme();
  const title = claim.orderNumber ? `#${claim.orderNumber.replace(/^#/, '')}` : claim.name;
  const sub = [formatClaimValue(claim.value), claim.dateSubmitted ? formatClaimDate(claim.dateSubmitted) : '']
    .filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: theme.border, opacity: pressed ? 0.6 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Claim ${title}, ${claim.status || 'no status'}`}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTop}>
          <ThemedText style={styles.rowTitle} numberOfLines={1}>{title}</ThemedText>
          {claim.files.length > 0 && <ThemedText type="small" themeColor="textSecondary">📎 {claim.files.length}</ThemedText>}
        </View>
        {!!claim.reason && <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{claim.reason}</ThemedText>}
        {!!sub && <ThemedText type="small" themeColor="textSecondary">{sub}</ThemedText>}
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.status, { backgroundColor: claimStatusColor(claim.status) }]}>
          <ThemedText style={styles.statusText} numberOfLines={1}>{claim.status || 'No status'}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{claim.groupTitle}</ThemedText>
      </View>
      <ThemedText style={{ color: theme.textSecondary, fontSize: 18 }}>›</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowTitle: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  rowRight: { alignItems: 'flex-end', gap: 3, maxWidth: 130 },
  status: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  closedToggle: { paddingVertical: 10 },
  newBtn: { marginTop: Spacing.three, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
