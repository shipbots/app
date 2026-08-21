import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '@/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * Handles the `shipbotscs://auth?token=…` deep link. The in-app auth session
 * usually captures the token directly, but on some Android flows the OS delivers
 * the redirect to the app as a route instead — which previously showed an
 * "Unmatched Route" screen. This screen consumes the token and returns home.
 */
export default function AuthDeepLink() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const { signInWithCode } = useAuth();
  const theme = useTheme();
  const [done, setDone] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (token) signInWithCode(String(token)).finally(() => setDone(true));
    else setDone(true);
  }, [token, signInWithCode]);

  if (done) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <ActivityIndicator color={theme.tint} />
    </View>
  );
}
