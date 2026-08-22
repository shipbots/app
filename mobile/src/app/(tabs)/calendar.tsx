import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { fetchDeliveries, fetchRecentlyDelivered } from '@/api/client';
import type { DeliveryEvent } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Shadow, Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const PAGE_SIZE = 5; // "Recently delivered" shows the last 5, then Show more

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
  if (isNaN(+dt)) return date;
  // Show the year only when it isn't the current one, so a wrong-year date
  // (e.g. a "Sep 1" that's really 2025) is immediately visible instead of
  // looking like a fine near-future date.
  const opts: Intl.DateTimeFormatOptions =
    y === new Date().getFullYear()
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return dt.toLocaleDateString('en-US', opts);
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Mode = 'upcoming' | 'delivered';
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

/** One delivery card — upcoming (blue / red-overdue) or delivered (green). */
function DeliveryCard({ e, overdue, delivered, onPress }: {
  e: DeliveryEvent; overdue?: boolean; delivered?: boolean; onPress: () => void;
}) {
  const theme = useTheme();
  const wh = e.warehouse ? `${e.warehouse}${e.subWarehouse ? ` · ${subLetter(e.subWarehouse)}` : ''}` : '';
  const chipBg = delivered ? '#ecfdf5' : overdue ? '#fef2f2' : '#eff6ff';
  const chipFg = delivered ? '#047857' : overdue ? '#dc2626' : '#2563eb';
  const borderColor = delivered ? '#a7f3d0' : overdue ? '#fca5a5' : theme.border;
  return (
    <Pressable
      disabled={!e.clientId}
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
      <ThemedView type="card" style={[styles.card, { borderColor }, Shadow.card]}>
        <View style={styles.cardTop}>
          <View style={[styles.dateChip, { backgroundColor: chipBg }]}>
            <ThemedText type="small" style={{ color: chipFg, fontWeight: '700' }}>
              {delivered ? `✓ ${fmt(e.date)}` : `📅 ${fmt(e.date)}`}
            </ThemedText>
          </View>
          {delivered
            ? <ThemedText type="small" style={{ color: '#047857', fontWeight: '700', fontSize: 10 }}>DELIVERED</ThemedText>
            : overdue && <ThemedText type="small" style={{ color: theme.danger, fontWeight: '700', fontSize: 10 }}>OVERDUE</ThemedText>}
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
}

export default function TimelineScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('upcoming');
  const [shown, setShown] = useState(PAGE_SIZE);

  const up = useCached('deliveries', fetchDeliveries);
  const dl = useCached('deliveries-recent', fetchRecentlyDelivered);
  const active = mode === 'upcoming' ? up : dl;

  // Re-pull the visible list when the tab regains focus (skip initial mount).
  const first = useRef(true);
  const refreshActive = active.refresh;
  useFocusEffect(
    useCallback(() => {
      if (first.current) { first.current = false; return; }
      refreshActive();
    }, [refreshActive]),
  );
  const today = todayStr();

  const openClient = (e: DeliveryEvent) =>
    e.clientId && router.push({ pathname: '/client/[id]', params: { id: e.clientId } });

  // Upcoming: past-due (left) + today marker + upcoming (right).
  const { rows, pastDue, upcoming } = useMemo(() => {
    const list = [...(up.data ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const past = list.filter(e => e.date < today);
    const upl = list.filter(e => e.date >= today);
    const r: Row[] = [
      ...past.map(e => ({ kind: 'card' as const, e, overdue: true })),
      { kind: 'today' as const },
      ...upl.map(e => ({ kind: 'card' as const, e, overdue: false })),
    ];
    return { rows: r, pastDue: past.length, upcoming: upl.length };
  }, [up.data, today]);

  const deliveredAll = dl.data ?? [];
  const deliveredShown = deliveredAll.slice(0, shown);

  const Toggle = (
    <View style={[styles.toggle, { borderBottomColor: theme.border }]}>
      {(['upcoming', 'delivered'] as Mode[]).map(m => {
        const activeTab = mode === m;
        return (
          <Pressable
            key={m}
            onPress={() => setMode(m)}
            style={[styles.tab, { backgroundColor: activeTab ? theme.tint : theme.backgroundElement }]}>
            <ThemedText type="small" style={{ color: activeTab ? '#fff' : theme.textSecondary, fontWeight: '700' }}>
              {m === 'upcoming' ? 'Upcoming' : 'Recently Delivered'}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  if (active.loading) {
    return (
      <ThemedView style={styles.flex}>
        {Toggle}
        <View style={styles.center}><ActivityIndicator color={theme.tint} /></View>
      </ThemedView>
    );
  }

  if (mode === 'upcoming') {
    return (
      <ThemedView style={styles.flex}>
        {Toggle}
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
          refreshControl={<RefreshControl refreshing={up.refreshing} onRefresh={up.refresh} tintColor={theme.tint} />}
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
            return <DeliveryCard e={item.e} overdue={item.overdue} onPress={() => openClient(item.e)} />;
          }}
        />
      </ThemedView>
    );
  }

  // Recently delivered — newest first, 5 at a time with Show more.
  return (
    <ThemedView style={styles.flex}>
      {Toggle}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <ThemedText type="smallBold" style={{ fontSize: 15 }}>📦 Recently Delivered</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ marginTop: 2 }}>
          {deliveredAll.length ? `Showing ${Math.min(shown, deliveredAll.length)} of ${deliveredAll.length}` : ''}
        </ThemedText>
      </View>
      <FlatList
        data={deliveredShown}
        keyExtractor={(e, i) => `${e.id}-${i}`}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={dl.refreshing} onRefresh={dl.refresh} tintColor={theme.tint} />}
        ListEmptyComponent={<ThemedText type="small" themeColor="textSecondary" style={styles.empty}>No deliveries recorded yet.</ThemedText>}
        renderItem={({ item }) => <DeliveryCard e={item} delivered onPress={() => openClient(item)} />}
        ListFooterComponent={
          deliveredAll.length > shown ? (
            <Pressable onPress={() => setShown(s => s + PAGE_SIZE)} style={[styles.showMore, { borderColor: theme.tint }]}>
              <ThemedText type="small" style={{ color: theme.tint, fontWeight: '700' }}>
                Show more ({deliveredAll.length - shown} more)
              </ThemedText>
            </Pressable>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999 },
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
  showMore: { alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingVertical: 12, marginTop: Spacing.two },
});
