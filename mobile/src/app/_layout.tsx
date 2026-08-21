import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/auth';
import { useTaskReminderTaps } from '@/lib/notifications';
import { prefetchAllData } from '@/lib/prefetch';
import { Colors, HeaderBg } from '@/constants/theme';
import { ThemePrefProvider, useThemePref } from '@/theme-pref';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const scheme = useThemePref().scheme;
  const colors = Colors[scheme];
  const { token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  // Gate the app on a token: no token → sign-in; signed in → out of sign-in.
  useEffect(() => {
    if (loading) return;
    const inSignIn = segments[0] === 'sign-in';
    if (!token && !inSignIn) router.replace('/sign-in');
    else if (token && inSignIn) router.replace('/');
  }, [token, loading, segments, router]);

  // Open the task when a due-date reminder notification is tapped.
  useTaskReminderTaps();

  // On open (once signed in): pull all Monday data into the on-device cache for
  // fast + offline access; refreshes only what changed.
  useEffect(() => {
    if (token) prefetchAllData();
  }, [token]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: HeaderBg },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="client/[id]" options={{ title: 'Client' }} />
      <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="auth" options={{ headerShown: false }} />
    </Stack>
  );
}

function ThemedRoot() {
  const scheme = useThemePref().scheme;
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootNavigator />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemePrefProvider>
      <AuthProvider>
        <ThemedRoot />
      </AuthProvider>
    </ThemePrefProvider>
  );
}
