import { useState, type ReactNode } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, UIManager, View } from 'react-native';

import { Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** A rounded card (soft shadow) with an uppercase blue title + chevron that
 *  expands/collapses. Outer view casts the shadow; inner clips to rounded
 *  corners (a clipped shadow-caster would hide the shadow). */
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
    <View style={[styles.wrap, { backgroundColor: theme.card }, Shadow.card]}>
      <View style={styles.inner}>
        <Pressable
          onPress={toggle}
          style={[styles.header, open && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
          <ThemedText style={[styles.title, { color: theme.tint }]}>{title}</ThemedText>
          <View style={styles.right}>
            {badge}
            <ThemedText style={[styles.chev, { color: theme.textSecondary, transform: [{ rotate: open ? '90deg' : '0deg' }] }]}>›</ThemedText>
          </View>
        </Pressable>
        {open && <View style={styles.body}>{children}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, marginBottom: Spacing.three },
  inner: { borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: 13 },
  title: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  right: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chev: { fontSize: 18, fontWeight: '700' },
  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.three },
});
