/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useThemePref } from '@/theme-pref';

export function useTheme() {
  return Colors[useThemePref().scheme];
}
