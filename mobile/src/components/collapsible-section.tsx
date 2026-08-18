import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** A white card with an uppercase blue title + chevron that expands/collapses,
 *  matching the Chrome extension's `.detail-section`. */
export function CollapsibleSection({
  title, defaultOpen = true, badge, children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen(o => !o);
  };
  return (
    <ThemedView type="card" style={[styles.card, { borderColor: theme.border }]}>
      <Pressable
        onPress={toggle}
        style={[styles.header, open && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, backgroundColor: theme.background }]}>
        <ThemedText style={[styles.title, { color: theme.tint }]}>{title}</ThemedText>
        <View style={styles.right}>
          {badge}
          <ThemedText style={[styles.chev, { color: theme.textSecondary, transform: [{ rotate: open ? '90deg' : '0deg' }] }]}>›</ThemedText>
        </View>
      </Pressable>
      {open && <View style={styles.body}>{children}</View>}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, marginBottom: Spacing.two, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: 11 },
  title: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chev: { fontSize: 18, fontWeight: '700' },
  body: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
});
