import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { fetchDeliveries } from '@/api/client';
import type { DeliveryEvent } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Shadow, Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v?: string) {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v || '').toUpperCase();
}
function firstName(email?: string) {
  const l = (email || '').split('@')[0];
  return l ? l[0].toUpperCase() + l.slice(1) : '';
}
function fmt(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(+dt) ? date : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Row = { kind: 'today' } | { kind: 'card'; e: DeliveryEvent; overdue: boolean };

function Line({ icon, text }: { icon: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <ThemedText type="small" style={{ color: theme.textSecondary }}>{icon}</ThemedText>
      <ThemedText type="small" style={{ flex: 1 }} numberOfLines={2}>{text}</ThemedText>
    </View>
  );
}

export default function TimelineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, loading, refreshing, refresh } = useCached('deliveries', fetchDeliveries);
  const today = todayStr();

  const { rows, pastDue, upcoming } = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const past = list.filter(e => e.date < today);
    const up = list.filter(e => e.date >= today);
    const r: Row[] = [
      ...past.map(e => ({ kind: 'card' as const, e, overdue: true })),
      { kind: 'today' as const },
      ...up.map(e => ({ kind: 'card' as const, e, overdue: false })),
    ];
    return { rows: r, pastDue: past.length, upcoming: up.length };
  }, [data, today]);

  if (loading) {
    return <ThemedView style={styles.center}><ActivityIndicator color={theme.tint} /></ThemedView>;
  }

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <ThemedText type="smallBold" style={{ fontSize: 15 }}>🚚 New Client Delivery Timeline</ThemedText>
        <View style={styles.headerCounts}>
          {pastDue > 0 && <ThemedText type="small" style={{ color: theme.danger }}>{pastDue} past due</ThemedText>}
          <ThemedText type="small" style={{ color: theme.tint }}>{upcoming} upcoming</ThemedText>
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.kind === 'today' ? 'today' : `${r.e.id}-${i}`)}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
        ListEmptyComponent={<ThemedText type="small" themeColor="textSecondary" style={styles.empty}>No inbound deliveries scheduled.</ThemedText>}
        renderItem={({ item }) => {
          if (item.kind === 'today') {
            return (
              <View style={styles.todayRow}>
                <View style={[styles.todayLine, { backgroundColor: theme.border }]} />
                <ThemedText type="smallBold" style={{ marginHorizontal: 8 }}>TODAY ↓</ThemedText>
                <View style={[styles.todayLine, { backgroundColor: theme.border }]} />
              </View>
            );
          }
          const { e, overdue } = item;
          const wh = e.warehouse ? `${e.warehouse}${e.subWarehouse ? ` · ${subLetter(e.subWarehouse)}` : ''}` : '';
          return (
            <Pressable
              disabled={!e.clientId}
              onPress={() => e.clientId && router.push({ pathname: '/client/[id]', params: { id: e.clientId } })}
              style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
              <ThemedView type="card" style={[styles.card, { borderColor: overdue ? '#fca5a5' : theme.border }, Shadow.card]}>
                <View style={styles.cardTop}>
                  <View style={[styles.dateChip, { backgroundColor: overdue ? '#fef2f2' : '#eff6ff' }]}>
                    <ThemedText type="small" style={{ color: overdue ? '#dc2626' : '#2563eb', fontWeight: '700' }}>📅 {fmt(e.date)}</ThemedText>
                  </View>
                  {overdue && <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700', fontSize: 10 }}>OVERDUE</ThemedText>}
                </View>
                <ThemedText type="smallBold" style={{ fontSize: 15, marginTop: 6 }}>{e.name || '(unnamed)'}</ThemedText>
                {!!e.method && <Line icon="🚚" text={e.method} />}
                {!!e.qty && <Line icon="📦" text={e.qty} />}
                {!!wh && <Line icon="🏭" text={wh} />}
                <View style={[styles.agentRow, { borderTopColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary">👤 {firstName(e.agentEmail) || 'Unassigned'}</ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: Spacing.three, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  headerCounts: { flexDirection: 'row', gap: Spacing.two, marginTop: 2 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: Spacing.three },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  agentRow: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  todayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two },
  todayLine: { flex: 1, height: 2, borderRadius: 1 },
});
