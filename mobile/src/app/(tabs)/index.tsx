import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';

import { fetchClientIndex, filterClients } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCached } from '@/hooks/use-cached';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v: string): string {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}
function firstName(email: string): string {
  const local = email.split('@')[0] || '';
  return local ? local[0].toUpperCase() + local.slice(1) : '';
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { data: index, loading, refreshing, error, refresh } = useCached('client-index', fetchClientIndex);

  const rows = useMemo(() => filterClients(index ?? [], query), [index, query]);

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.searchWrap, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <View style={[styles.searchBox, { backgroundColor: theme.backgroundElement }]}>
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
              {error ? 'Couldn’t load clients — pull to retry.' : `No clients match “${query}”.`}
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/client/[id]', params: { id: item.id } })}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
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
                  <ThemedText type="small" themeColor="textSecondary">
                    {firstName(item.agentEmail) || 'Unassigned'}
                  </ThemedText>
                </View>
              </ThemedView>
            </Pressable>
          )}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  searchWrap: { padding: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 42, borderRadius: 12, paddingHorizontal: Spacing.three },
  input: { flex: 1, fontSize: 16, height: '100%' },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: Spacing.three,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rowRight: { alignItems: 'flex-end' },
});
