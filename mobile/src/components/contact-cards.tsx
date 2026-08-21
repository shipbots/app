import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { ClientDetail } from '@/api/types';
import { Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

const SCREEN_W = Dimensions.get('window').width;
const PAGE = Spacing.three; // parent horizontal padding
const CARD_W = Math.min(SCREEN_W - PAGE * 2 - 30, 360); // leave a peek of the next card
const AVATAR_COLORS = ['#015280', '#0e7490', '#7c3aed', '#b45309', '#047857', '#be123c'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const s = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
  return s.toUpperCase() || '•';
}

interface Contact {
  role: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  shipHero: string;
}

/** Horizontally-swipeable contact cards. One per contact; swipe for more. */
export function ContactCards({ client }: { client: ClientDetail }) {
  const theme = useTheme();
  const raw: Contact[] = [
    { role: 'Primary contact', name: client.contactName ?? '', email: client.contactEmail ?? '', phone: client.contactPhone ?? '', location: client.contactLocation ?? '', shipHero: '' },
    { role: 'Contact 2', name: client.contact2Name ?? '', email: client.contact2Email ?? '', phone: client.contact2Phone ?? '', location: '', shipHero: client.contact2ShipHeroAccess ?? '' },
    { role: 'Contact 3', name: client.contact3Name ?? '', email: client.contact3Email ?? '', phone: client.contact3Phone ?? '', location: '', shipHero: client.contact3ShipHeroAccess ?? '' },
  ];
  const contacts = raw.filter(c => (c.name || c.email || c.phone).trim());
  if (contacts.length === 0) return null;
  const single = contacts.length === 1;
  const cardWidth = single ? SCREEN_W - PAGE * 2 : CARD_W;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + Spacing.two}
        decelerationRate="fast"
        contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: PAGE }}
        style={styles.scroller}>
        {contacts.map((c, i) => (
          <View key={i} style={[styles.card, { width: cardWidth, backgroundColor: theme.card }, Shadow.card]}>
            <View style={styles.top}>
              <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length] }]}>
                <ThemedText style={styles.avatarTxt}>{initials(c.name || c.email)}</ThemedText>
              </View>
              <View style={styles.topText}>
                <ThemedText style={[styles.role, { color: theme.tint }]}>{c.role.toUpperCase()}</ThemedText>
                <ThemedText style={styles.name} numberOfLines={1}>{c.name || '—'}</ThemedText>
              </View>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.rows}>
              {!!c.email && (
                <Row icon="✉" text={c.email} color={theme.tint}
                  onPress={() => Linking.openURL(`mailto:${c.email.trim()}`).catch(() => {})} />
              )}
              {!!c.phone && (
                <Row icon="✆" text={c.phone} color={theme.tint}
                  onPress={() => Linking.openURL(`tel:${c.phone.replace(/[^0-9+]/g, '')}`).catch(() => {})} />
              )}
              {!!c.location && <Row icon="📍" text={c.location} color={theme.text} />}
              {!!c.shipHero && <Row icon="🔑" text={`ShipHero: ${c.shipHero}`} color={theme.text} />}
            </View>
          </View>
        ))}
      </ScrollView>
      {!single && (
        <View style={styles.dots}>
          {contacts.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === 0 ? theme.tint : theme.border }]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Row({ icon, text, color, onPress }: { icon: string; text: string; color: string; onPress?: () => void }) {
  const theme = useTheme();
  const body = (
    <View style={styles.row}>
      <ThemedText style={[styles.rowIcon, { color: theme.textSecondary }]}>{icon}</ThemedText>
      <ThemedText type="small" style={[styles.rowText, { color }]} numberOfLines={1}>{text}</ThemedText>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} hitSlop={4}>{body}</Pressable> : body;
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -Spacing.three, marginBottom: Spacing.three },
  scroller: {},
  card: { borderRadius: 18, padding: Spacing.three },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  topText: { flex: 1, minWidth: 0 },
  role: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  name: { fontSize: 17, fontWeight: '700', marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.two },
  rows: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowIcon: { width: 16, fontSize: 13, textAlign: 'center' },
  rowText: { flex: 1, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
