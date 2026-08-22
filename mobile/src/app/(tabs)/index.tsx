import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { fetchClientIndex, filterClients } from '@/api/client';
import { useAuth } from '@/auth';
import { ClientFilterSheet, EMPTY_FILTERS, NONE_VALUE, type FilterDim, type FilterKey, type Selected } from '@/components/client-filter-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Shadow, Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

const EXITED_GROUP = 'group_mkq09z7j'; // Clients-board "Exited" group == inactive
type Filter = 'my' | 'active' | 'all';

function subLetter(v: string) {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}
function firstName(email: string) {
  const local = email.split('@')[0] || '';
  return local ? local[0].toUpperCase() + local.slice(1) : '';
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

// The dimensions the client list can be filtered by. Options for each come from
// the distinct values in the loaded index, so nothing is hardcoded.
const FILTER_DIMS: FilterDim[] = [
  { key: 'warehouse', label: 'Warehouse', noneLabel: 'No warehouse', display: v => v },
  { key: 'subWarehouse', label: 'Sub-warehouse', noneLabel: 'No sub-warehouse', display: v => v },
  { key: 'agentEmail', label: 'Agent', noneLabel: 'No agent', display: v => firstName(v) || v },
  { key: 'portal', label: 'Platform (AppDot / Portal)', noneLabel: 'No platform', display: v => v },
];

export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { email } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<Selected>(EMPTY_FILTERS);
  const { data: index, loading, refreshing, error, refresh } = useCached('client-index', fetchClientIndex);

  const me = (email || '').toLowerCase();
  const scoped = useMemo(() => {
    const list = index ?? [];
    if (filter === 'my') return list.filter(c => me && (c.agentEmail || '').toLowerCase() === me);
    if (filter === 'active') return list.filter(c => c.groupId !== EXITED_GROUP);
    return list;
  }, [index, filter, me]);

  // Distinct options per filter dimension (from the segment-scoped list). If any
  // client is missing the field, a "None" sentinel is offered so you can filter
  // for who's unset (e.g. no warehouse / no agent).
  const facetOptions = useMemo(() => {
    const opts: Record<FilterKey, string[]> = { warehouse: [], subWarehouse: [], agentEmail: [], portal: [] };
    for (const dim of FILTER_DIMS) {
      const set = new Set<string>();
      let hasEmpty = false;
      for (const c of scoped) { const v = (c[dim.key] ?? '').trim(); if (v) set.add(v); else hasEmpty = true; }
      const sorted = [...set].sort((a, b) => a.localeCompare(b));
      opts[dim.key] = hasEmpty ? [NONE_VALUE, ...sorted] : sorted;
    }
    return opts;
  }, [scoped]);

  // Apply the selected filters: OR within a dimension, AND across dimensions. A
  // client's empty field is treated as NONE_VALUE so the "None" chip matches it.
  const faceted = useMemo(() => {
    const active = FILTER_DIMS.map(d => d.key).filter(k => filters[k].length > 0);
    if (active.length === 0) return scoped;
    return scoped.filter(c => active.every(k => filters[k].includes((c[k] ?? '').trim() || NONE_VALUE)));
  }, [scoped, filters]);

  const rows = useMemo(() => filterClients(faceted, query), [faceted, query]);
  const activeFilterCount = (Object.values(filters) as string[][]).reduce((n, v) => n + v.length, 0);
  const toggleFilter = (key: FilterKey, value: string) =>
    setFilters(prev => ({
      ...prev,
      [key]: prev[key].includes(value) ? prev[key].filter(v => v !== value) : [...prev[key], value],
    }));
  const welcome = firstName(email || '');

  const SEGMENTS: { key: Filter; label: string }[] = [
    { key: 'my', label: 'My Clients' },
    { key: 'active', label: 'Active' },
    { key: 'all', label: 'All' },
  ];

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        {!!welcome && <ThemedText type="smallBold" style={styles.welcome}>👋 Welcome, {welcome}</ThemedText>}

        <View style={[styles.segments, { backgroundColor: theme.backgroundElement }]}>
          {SEGMENTS.map(s => {
            const on = filter === s.key;
            return (
              <Pressable key={s.key} onPress={() => setFilter(s.key)} style={[styles.segment, on && { backgroundColor: theme.card }]}>
                <ThemedText type="small" style={{ color: on ? theme.tint : theme.textSecondary, fontWeight: on ? '700' : '500' }}>{s.label}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement, flex: 1 }]}>
            <ThemedText style={{ color: theme.textSecondary }}>🔍</ThemedText>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search clients, contacts, legal entity…"
              placeholderTextColor={theme.textSecondary}
              style={[styles.input, { color: theme.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
          <Pressable
            onPress={() => setFilterOpen(true)}
            style={[styles.filterBtn, { backgroundColor: activeFilterCount ? theme.tint : theme.backgroundElement }]}>
            <ThemedText style={{ color: activeFilterCount ? '#fff' : theme.text, fontWeight: '700' }}>
              ⚙︎ Filter{activeFilterCount ? ` · ${activeFilterCount}` : ''}
            </ThemedText>
          </Pressable>
        </View>

        {activeFilterCount > 0 && (
          <ThemedText type="small" style={[styles.filterCount, { color: theme.tint }]}>
            {rows.length} {rows.length === 1 ? 'client matches' : 'clients match'} your filters
          </ThemedText>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.tint} />}
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ? 'Couldn’t load clients — pull to retry.'
                : filter === 'my' ? 'No clients are assigned to you.'
                : query ? `No clients match “${query}”.`
                : activeFilterCount ? 'No clients match the selected filters.' : 'No clients.'}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/client/[id]', params: { id: item.id } })}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <ThemedView type="card" style={[styles.card, { borderColor: theme.border }, Shadow.card]}>
                <View style={[styles.avatar, { backgroundColor: theme.tint }]}>
                  <ThemedText style={styles.avatarText}>{initials(item.name)}</ThemedText>
                </View>
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[item.legalEntity, item.contactName].filter(Boolean).join(' · ') || item.contactEmail || '—'}
                  </ThemedText>
                </View>
                <View style={styles.rowRight}>
                  {!!item.warehouse && (
                    <ThemedText type="small" style={{ color: theme.text }}>
                      {item.warehouse}{item.subWarehouse ? ` · ${subLetter(item.subWarehouse)}` : ''}
                    </ThemedText>
                  )}
                  <ThemedText type="small" themeColor="textSecondary">{firstName(item.agentEmail) || 'Unassigned'}</ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          )}
        />
      )}

      <ClientFilterSheet
        visible={filterOpen}
        dims={FILTER_DIMS}
        options={facetOptions}
        selected={filters}
        onToggle={toggleFilter}
        onClear={() => setFilters(EMPTY_FILTERS)}
        onClose={() => setFilterOpen(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, gap: Spacing.two },
  welcome: { fontSize: 15 },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 42, borderRadius: 12, paddingHorizontal: Spacing.three },
  filterBtn: { height: 42, borderRadius: 12, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  filterCount: { fontWeight: '700', paddingHorizontal: 2 },
  input: { flex: 1, fontSize: 16, height: '100%' },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: Spacing.three },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowRight: { alignItems: 'flex-end' },
});
