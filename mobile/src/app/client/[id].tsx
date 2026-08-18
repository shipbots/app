import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { getClient } from '@/api/client';
import type { ClientDetail } from '@/api/types';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function subLetter(v: string): string {
  const m = (v || '').trim().match(/[-\s]([A-Za-z0-9]{1,2})$/);
  return (m ? m[1] : v).toUpperCase();
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  if (!value) return null;
  return (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView type="card" style={[styles.section, { borderColor: theme.border }]}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getClient(String(id))
      .then(c => alive && (setClient(c), setLoading(false)))
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

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
        <ThemedText>Client not found.</ThemedText>
      </ThemedView>
    );
  }

  const warehouse = client.warehouse + (client.subWarehouse ? ` · ${subLetter(client.subWarehouse)}` : '');

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: client.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="subtitle" style={styles.name}>
          {client.name}
        </ThemedText>
        {!!client.legalEntity && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.legal}>
            {client.legalEntity}
          </ThemedText>
        )}

        <Section title="Contact">
          <Row label="Primary" value={client.contactName} />
          <Row label="Email" value={client.contactEmail} />
          <Row label="Phone" value={client.contactPhone} />
          <Row label="Secondary" value={client.contact2Name} />
          <Row label="Email 2" value={client.contact2Email} />
        </Section>

        <Section title="Fulfillment">
          <Row label="Warehouse" value={warehouse} />
          <Row label="Portal" value={client.portal} />
          <Row label="Agent" value={client.agentEmail} />
        </Section>

        <Section title="Onboarding">
          <Row label="Payment on file" value={client.paymentOnFile || '—'} />
          <Row label="Delivery method" value={client.initialInventoryMethod} />
          <Row label="Delivery qty" value={client.initialInventoryQty} />
          <Row label="Est. delivery" value={client.estimatedDeliveryDate} />
        </Section>

        {!!client.notes && (
          <Section title="Notes">
            <ThemedText type="small">{client.notes}</ThemedText>
          </Section>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  scroll: { padding: Spacing.three },
  name: { fontSize: 24, lineHeight: 30, marginBottom: Spacing.one },
  legal: { marginBottom: Spacing.three },
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
  rowValue: { flexShrink: 1, textAlign: 'right' },
});
