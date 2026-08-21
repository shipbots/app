import { Pressable } from 'react-native';

import { useThemePref } from '@/theme-pref';
import { ThemedText } from './themed-text';

/** Header button that flips light/dark. Shows a sun in dark mode (tap → light)
 *  and a moon in light mode (tap → dark). */
export function ThemeToggle() {
  const { scheme, toggle } = useThemePref();
  return (
    <Pressable onPress={toggle} hitSlop={12} style={{ paddingHorizontal: 14 }} accessibilityLabel="Toggle light or dark theme">
      <ThemedText style={{ fontSize: 19 }}>{scheme === 'dark' ? '☀️' : '🌙'}</ThemedText>
    </Pressable>
  );
}
