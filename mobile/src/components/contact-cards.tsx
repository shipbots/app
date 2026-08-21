import { useState } from 'react';
import { Dimensions, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CONTACT_SLOTS, contactHasData, slotFields, type ContactSlot } from '@/api/contacts';
import type { ClientDetail } from '@/api/types';
import { Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ContactEditor, type ContactUpdate } from './contact-editor';
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

/**
 * Horizontally-swipeable contact cards — one per filled slot — with inline
 * add / edit / delete. Tap ✎ on a card to edit or remove that contact; tap the
 * "＋ Add contact" tile (shown while fewer than 3 slots are filled) to add one.
 */
export function ContactCards({
  client, onSave,
}: {
  client: ClientDetail;
  /** Persist the changed columns (throws on failure so the sheet stays open). */
  onSave: (updates: ContactUpdate[]) => Promise<void>;
}) {
  const theme = useTheme();
  const [openSlot, setOpenSlot] = useState<ContactSlot | null>(null);
  const [saving, setSaving] = useState(false);

  const filled = CONTACT_SLOTS.filter(s => contactHasData(client, s));
  const firstEmpty = CONTACT_SLOTS.find(s => !contactHasData(client, s));
  const tileCount = filled.length + (firstEmpty ? 1 : 0);
  const single = tileCount === 1;
  const cardWidth = single ? SCREEN_W - PAGE * 2 : CARD_W;

  const commit = async (updates: ContactUpdate[]) => {
    if (updates.length === 0) { setOpenSlot(null); return; }
    setSaving(true);
    try { await onSave(updates); setOpenSlot(null); }
    catch { /* parent alerts; keep the sheet open to retry */ }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + Spacing.two}
        decelerationRate="fast"
        contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: PAGE }}
        style={styles.scroller}>
        {filled.map(slot => {
          const name = client[slot.name.key] ?? '';
          const email = client[slot.email.key] ?? '';
          const phone = client[slot.phone.key] ?? '';
          const extra = client[slot.extra.key] ?? '';
          const extraIcon = slot.extra.label === 'Location' ? '📍' : '🔑';
          return (
            <View key={slot.idx} style={[styles.card, { width: cardWidth, backgroundColor: theme.card }, Shadow.card]}>
              <View style={styles.top}>
                <View style={[styles.avatar, { backgroundColor: AVATAR_COLORS[slot.idx % AVATAR_COLORS.length] }]}>
                  <ThemedText style={styles.avatarTxt}>{initials(name || email)}</ThemedText>
                </View>
                <View style={styles.topText}>
                  <ThemedText style={[styles.role, { color: theme.tint }]}>{slot.role.toUpperCase()}</ThemedText>
                  <ThemedText style={styles.name} numberOfLines={1}>{name || '—'}</ThemedText>
                </View>
                <Pressable onPress={() => setOpenSlot(slot)} hitSlop={10} style={styles.editBtn}>
                  <ThemedText style={{ color: theme.tint, fontSize: 13, fontWeight: '700' }}>✎ Edit</ThemedText>
                </Pressable>
              </View>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <View style={styles.rows}>
                {!!email && (
                  <Row icon="✉" text={email} color={theme.tint}
                    onPress={() => Linking.openURL(`mailto:${email.trim()}`).catch(() => {})} />
                )}
                {!!phone && (
                  <Row icon="✆" text={phone} color={theme.tint}
                    onPress={() => Linking.openURL(`tel:${phone.replace(/[^0-9+]/g, '')}`).catch(() => {})} />
                )}
                {!!extra && <Row icon={extraIcon} text={slot.extra.label === 'Location' ? extra : `ShipHero: ${extra}`} color={theme.text} />}
                {!email && !phone && !extra && (
                  <ThemedText type="small" themeColor="textSecondary">No details yet — tap Edit.</ThemedText>
                )}
              </View>
            </View>
          );
        })}

        {firstEmpty && (
          <Pressable
            onPress={() => setOpenSlot(firstEmpty)}
            style={[styles.card, styles.addCard, { width: cardWidth, borderColor: theme.accent }]}>
            <ThemedText style={[styles.addPlus, { color: theme.tint }]}>＋</ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.tint }}>Add contact</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{filled.length}/3 added</ThemedText>
          </Pressable>
        )}
      </ScrollView>

      {tileCount > 1 && (
        <View style={styles.dots}>
          {Array.from({ length: tileCount }).map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === 0 ? theme.tint : theme.border }]} />
          ))}
        </View>
      )}

      <ContactEditor
        visible={!!openSlot}
        slot={openSlot}
        client={client}
        saving={saving}
        onSave={(_, updates) => commit(updates)}
        onDelete={slot => commit(slotFields(slot).map(f => ({ key: f.key, columnId: f.columnId, value: '' })))}
        onClose={() => setOpenSlot(null)}
      />
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
  addCard: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 132 },
  addPlus: { fontSize: 30, fontWeight: '300', lineHeight: 34 },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  topText: { flex: 1, minWidth: 0 },
  editBtn: { paddingLeft: Spacing.two },
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
