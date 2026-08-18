import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AuthError, getClient } from '@/api/client';
import type { ClientDetail } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v: string): string {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}

type Item = [label: string, value: string | undefined, long?: boolean];

function Field({ label, value, long }: { label: string; value: string; long?: boolean }) {
  const theme = useTheme();
  if (long) {
    return (
      <View style={[styles.block, { borderBottomColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
        <ThemedText type="small" style={{ marginTop: 2 }}>{value}</ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText type="small" style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: Item[] }) {
  const theme = useTheme();
  const shown = rows.filter(([, v]) => v && String(v).trim());
  if (!shown.length) return null;
  return (
    <ThemedView type="card" style={[styles.section, { borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>{title}</ThemedText>
      {shown.map(([label, value, long], i) => (
        <Field key={label + i} label={label} value={String(value)} long={long} />
      ))}
    </ThemedView>
  );
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const c = await getClient(String(id));
      setClient(c);
      if (!c) setError('Client not found.');
    } catch (e) {
      setError(e instanceof AuthError ? 'Your session expired — sign out and back in.' : 'Couldn’t load this client.');
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => { await load(); if (alive) setLoading(false); })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={theme.tint} />
      </ThemedView>
    );
  }
  if (!client) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText type="small" themeColor="textSecondary">{error || 'Client not found.'}</ThemedText>
      </ThemedView>
    );
  }

  const c = client;
  const warehouse = c.warehouse ? `${c.warehouse}${c.subWarehouse ? ` · ${subLetter(c.subWarehouse)}` : ''}` : '';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: c.name }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}>
        <ThemedText type="subtitle" style={styles.name}>{c.name}</ThemedText>
        {!!c.legalEntity && <ThemedText type="small" themeColor="textSecondary">{c.legalEntity}</ThemedText>}
        {!!c.clientStatus && (
          <ThemedText type="small" style={{ color: theme.tint, marginTop: 2 }}>{c.clientStatus}</ThemedText>
        )}
        {!!error && <ThemedText type="small" style={{ color: theme.danger, marginTop: Spacing.two }}>{error}</ThemedText>}

        <View style={{ height: Spacing.three }} />

        <Section title="Primary contact" rows={[
          ['Name', c.contactName], ['Email', c.contactEmail], ['Phone', c.contactPhone], ['Location', c.contactLocation],
        ]} />
        <Section title="Additional contacts" rows={[
          ['2 · Name', c.contact2Name], ['2 · Email', c.contact2Email], ['2 · Phone', c.contact2Phone],
          ['3 · Name', c.contact3Name], ['3 · Email', c.contact3Email], ['3 · Phone', c.contact3Phone],
        ]} />
        <Section title="Company" rows={[
          ['QuickBooks', c.quickbooksName], ['ShipHero', c.shipHeroName], ['Umbrella', c.umbrellaCompany],
          ['HQ', c.businessHQ], ['Category', c.productCategory], ['Products', c.productDescription, true],
        ]} />
        <Section title="Fulfillment" rows={[
          ['Warehouse', warehouse], ['Method', c.currentFulfillmentMethod], ['Platforms', c.ecommercePlatforms],
          ['SKU count', c.skuCount], ['Packaging', c.packaging, true], ['Kits / bundles', c.kitsOrBundles],
          ['International', c.internationalFulfillment], ['Amazon FBA', c.amazonFBA], ['Shipping', c.shippingMethod],
        ]} />
        <Section title="Receiving" rows={[
          ['Initial date', c.initialInventoryDate], ['Method', c.initialInventoryMethod], ['Quantity', c.initialInventoryQty],
          ['Barcoded', c.itemsBarcoded], ['Storing needs', c.initialInventoryStoringNeeds, true],
          ['Receiving notes', c.notesForReceiving, true], ['Inventory notes', c.notesOnInitialInventory, true],
        ]} />
        <Section title="Onboarding & billing" rows={[
          ['Payment on file', c.paymentOnFile], ['Invoicing email', c.invoicingEmail],
        ]} />
        <Section title="Notes" rows={[['Additional notes', c.additionalNotes, true]]} />

        <View style={{ height: Spacing.five }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scroll: { padding: Spacing.three },
  name: { fontSize: 24, lineHeight: 30 },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  sectionTitle: { marginBottom: Spacing.one },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { flexShrink: 0 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  block: { paddingVertical: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
});
