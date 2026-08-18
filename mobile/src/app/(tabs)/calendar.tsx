import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { fetchDeliveries } from '@/api/client';
import type { DeliveryEvent } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data, refreshing, refresh, loading } = useCached('deliveries', fetchDeliveries);
  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(null);

  const byDate = useMemo(() => {
    const map: Record<string, DeliveryEvent[]> = {};
    for (const e of data ?? []) {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [data]);

  const firstWeekday = new Date(cursor.y, cursor.m, 1).getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const todayStr = ymd(now.getFullYear(), now.getMonth(), now.getDate());
  const shift = (delta: number) => {
    setSelected(null);
    setCursor(cur => {
      const m = cur.m + delta;
      return { y: cur.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  };
  const selectedEvents = selected ? byDate[selected] ?? [] : [];

  return (
    <ThemedView style={styles.flex}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />} contentContainerStyle={{ paddingBottom: Spacing.six }}>
        <View style={styles.monthHeader}>
          <Pressable onPress={() => shift(-1)} hitSlop={12}><ThemedText style={[styles.arrow, { color: theme.tint }]}>‹</ThemedText></Pressable>
          <ThemedText type="smallBold" style={{ fontSize: 16 }}>{MONTHS[cursor.m]} {cursor.y}</ThemedText>
          <Pressable onPress={() => shift(1)} hitSlop={12}><ThemedText style={[styles.arrow, { color: theme.tint }]}>›</ThemedText></Pressable>
        </View>

        <View style={styles.weekRow}>
          {WD.map((d, i) => <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.weekday}>{d}</ThemedText>)}
        </View>

        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day == null) return <View key={i} style={styles.cell} />;
            const ds = ymd(cursor.y, cursor.m, day);
            const evts = byDate[ds] ?? [];
            const isToday = ds === todayStr;
            const isSel = ds === selected;
            return (
              <Pressable key={i} onPress={() => setSelected(ds)} style={styles.cell}>
                <View style={[styles.dayCircle, isToday && { backgroundColor: theme.tint }, isSel && !isToday && { borderWidth: 1.5, borderColor: theme.tint }]}>
                  <ThemedText type="small" style={{ color: isToday ? '#fff' : theme.text }}>{day}</ThemedText>
                </View>
                {evts.length > 0 && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.listWrap}>
          {selected ? (
            selectedEvents.length ? (
              <>
                <ThemedText type="smallBold" style={{ color: theme.tint, marginBottom: Spacing.two }}>Deliveries · {selected}</ThemedText>
                {selectedEvents.map(e => (
                  <Pressable
                    key={e.id}
                    disabled={!e.clientId}
                    onPress={() => e.clientId && router.push({ pathname: '/client/[id]', params: { id: e.clientId } })}
                    style={[styles.evt, { borderColor: theme.border }]}>
                    <ThemedText type="small" style={{ flex: 1 }} numberOfLines={1}>{e.name || '(unnamed)'}</ThemedText>
                    <ThemedText type="small" style={{ color: e.delivered ? theme.success : theme.warning }}>
                      {e.delivered ? 'Delivered' : 'Expected'}
                    </ThemedText>
                  </Pressable>
                ))}
              </>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">No deliveries on {selected}.</ThemedText>
            )
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              {loading ? 'Loading deliveries…' : 'Tap a day with a dot to see its deliveries.'}
            </ThemedText>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  arrow: { fontSize: 28, fontWeight: '700' },
  weekRow: { flexDirection: 'row', paddingHorizontal: Spacing.two },
  weekday: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.two, paddingTop: Spacing.two },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 6 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 3 },
  listWrap: { padding: Spacing.four, minHeight: 120 },
  evt: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
