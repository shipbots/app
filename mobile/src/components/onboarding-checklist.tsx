import { Pressable, StyleSheet, View } from 'react-native';

import type { OnboardingInfo, OnboardingStep } from '@/api/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ThemedText } from './themed-text';

/** Progress bar + step list for a client's onboarding checklist. When `onEdit`
 *  is provided each step is tappable to change its status. */
export function OnboardingChecklist({ info, onEdit }: { info: OnboardingInfo; onEdit?: (step: OnboardingStep) => void }) {
  const theme = useTheme();
  const done = info.steps.filter(s => s.state === 'done').length;
  const applicable = info.steps.filter(s => s.state !== 'na').length;
  const barColor = info.progress >= 100 ? theme.success : theme.tint;

  return (
    <View>
      <View style={styles.head}>
        <ThemedText type="small" themeColor="textSecondary">{done} of {applicable} done</ThemedText>
        <ThemedText type="smallBold" style={{ color: barColor }}>{info.progress}%</ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.fill, { width: `${info.progress}%`, backgroundColor: barColor }]} />
      </View>

      <View style={styles.steps}>
        {info.steps.map((s, i) => {
          const editable = !!onEdit && s.options.length > 0;
          const row = (
            <View style={styles.step}>
              <ThemedText style={styles.icon}>
                {s.state === 'done' ? '✅' : s.state === 'na' ? '➖' : '⬜️'}
              </ThemedText>
              <ThemedText
                type="small"
                style={[styles.label, { color: s.state === 'na' ? theme.muted : theme.text }, s.state === 'na' && styles.na]}
                numberOfLines={2}>
                {s.label}
              </ThemedText>
              {editable && (
                <ThemedText type="small" style={[styles.value, { color: theme.textSecondary }]} numberOfLines={1}>
                  {s.value || 'Set'} ▾
                </ThemedText>
              )}
            </View>
          );
          return editable
            ? <Pressable key={i} onPress={() => onEdit!(s)} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>{row}</Pressable>
            : <View key={i}>{row}</View>;
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  steps: { marginTop: Spacing.three, gap: 10 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  icon: { fontSize: 15, width: 20, textAlign: 'center' },
  label: { flex: 1, fontWeight: '600' },
  value: { maxWidth: 96, fontWeight: '700', textAlign: 'right' },
  na: { textDecorationLine: 'line-through' },
});
