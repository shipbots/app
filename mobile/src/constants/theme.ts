/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Palette mirrors the Chrome extension (popup.css): ShipBots blue #015280,
// cyan accent #43c7ff, #f9fafb page, white cards, warm notes column.
export const Colors = {
  light: {
    text: '#111827',
    background: '#f9fafb',
    backgroundElement: '#f3f4f6',
    backgroundSelected: '#e5e7eb',
    textSecondary: '#6b7280',
    muted: '#9ca3af',
    tint: '#015280',
    accent: '#43c7ff',
    border: '#e5e7eb',
    inputBorder: '#d1d5db',
    card: '#ffffff',
    notesBg: '#fbfaf6',
    success: '#059669',
    danger: '#b91c1c',
    warning: '#92400e',
  },
  dark: {
    text: '#ECEDEE',
    background: '#0b0f14',
    backgroundElement: '#1b2530',
    backgroundSelected: '#26313d',
    textSecondary: '#9BA1A6',
    muted: '#6b7280',
    tint: '#43c7ff',
    accent: '#43c7ff',
    border: '#2b3542',
    inputBorder: '#3a4653',
    card: '#151b22',
    notesBg: '#17130a',
    success: '#30D158',
    danger: '#FF453A',
    warning: '#FF9F0A',
  },
} as const;

/** Fixed ShipBots-blue header (extension look) regardless of color scheme. */
export const HeaderBg = '#015280';

/** Sticky-note colors (popup.css). */
export const NoteColors: Record<string, { bg: string; border: string; text: string }> = {
  yellow: { bg: '#fef9c3', border: '#facc15', text: '#713f12' },
  pink:   { bg: '#fce7f3', border: '#f472b6', text: '#831843' },
  blue:   { bg: '#dbeafe', border: '#60a5fa', text: '#1e3a8a' },
  green:  { bg: '#d1fae5', border: '#34d399', text: '#064e3b' },
  purple: { bg: '#ede9fe', border: '#a78bfa', text: '#4c1d95' },
  orange: { bg: '#ffedd5', border: '#fb923c', text: '#7c2d12' },
};
export const NOTE_COLOR_KEYS = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'] as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

/** Soft, iOS-style elevation for cards — subtle ambient shadow on iOS, a light
 *  elevation on Android. Apply to a card that has a solid background and is NOT
 *  clipped by `overflow: 'hidden'` (else the shadow is cut off). */
export const Shadow = {
  card: Platform.select({
    ios: { shadowColor: '#0b1524', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: {},
  }) as object,
  raised: Platform.select({
    ios: { shadowColor: '#0b1524', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 5 },
    default: {},
  }) as object,
} as const;
