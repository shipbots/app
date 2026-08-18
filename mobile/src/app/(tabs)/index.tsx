import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { searchClients } from '@/api/client';
import type { ClientIndexEntry } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v: string): string {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}
function firstName(email: string): string {
  const local = email.split('@')[0] || '';
  return local ? local[0].toUpperCase() + local.slice(1) : '';
}

export default function ClientsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<ClientIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    searchClients(query)
      .then(r => alive && (setRows(r), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.searchWrap, { borderBottomColor: theme.border, backgroundColor: theme.card }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search clients, contacts, legal entity…"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: Spacing.five }} color={theme.tint} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              No clients match “{query}”.
            </ThemedText>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/client/[id]', params: { id: item.id } })}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
              <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
                <View style={styles.flex}>
                  <ThemedText type="smallBold">{item.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {[item.legalEntity, item.contactName].filter(Boolean).join(' · ') || item.contactEmail || '—'}
                  </ThemedText>
                </View>
                <View style={styles.rowRight}>
                  {!!item.warehouse && (
                    <ThemedText type="small">
                      {item.warehouse}
                      {item.subWarehouse ? ` · ${subLetter(item.subWarehouse)}` : ''}
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
  input: { height: 40, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, fontSize: 16 },
  list: { padding: Spacing.three, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  rowRight: { alignItems: 'flex-end' },
});
