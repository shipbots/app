import { Tabs } from 'expo-router';
import { Image, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/auth';
import { ThemedText } from '@/components/themed-text';
import { HeaderBg } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Emoji tab icon — dependency-free; opacity conveys the focused state. */
function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

/** ShipBots robot + wordmark, centered in the header. */
function LogoTitle() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Image source={require('@/assets/images/shipbots-logo.png')} style={{ width: 26, height: 26, borderRadius: 6 }} />
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18 }}>ShipBots</Text>
    </View>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} hitSlop={12} style={{ paddingHorizontal: 14 }}>
      <ThemedText style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Sign out</ThemedText>
    </Pressable>
  );
}

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        headerStyle: { backgroundColor: HeaderBg },
        headerTintColor: '#ffffff',
        headerTitleAlign: 'center',
        headerTitle: () => <LogoTitle />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Clients',
          tabBarIcon: ({ focused }) => <TabIcon emoji="👥" focused={focused} />,
          headerRight: () => <SignOutButton />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Timeline', tabBarIcon: ({ focused }) => <TabIcon emoji="📅" focused={focused} /> }}
      />
      <Tabs.Screen
        name="tasks"
        options={{ title: 'My Tasks', tabBarIcon: ({ focused }) => <TabIcon emoji="✅" focused={focused} /> }}
      />
    </Tabs>
  );
}
