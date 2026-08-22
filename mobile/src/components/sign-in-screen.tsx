import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function SignInScreen() {
  const theme = useTheme();
  const { signIn, signInWithCode } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [code, setCode] = useState('');

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError('');
    const res = await fn();
    if (!res.ok) setError(res.error || 'Sign-in failed.');
    setBusy(false);
  };

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          <Image
            source={require('@/assets/images/shipbots-logo.png')}
            style={styles.logoImg}
            resizeMode="contain"
          />
          <ThemedText style={[styles.logo, { color: theme.tint }]}>ShipBots CS</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Sign in with your ShipBots Google account to view live client data.
          </ThemedText>
        </View>

        <Pressable
          disabled={busy}
          onPress={() => run(signIn)}
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: theme.tint, opacity: pressed || busy ? 0.7 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryLabel}>Sign in with Google</ThemedText>}
        </Pressable>

        {!!error && (
          <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>
            {error}
          </ThemedText>
        )}

        <Pressable onPress={() => setShowPaste(v => !v)} style={styles.linkBtn}>
          <ThemedText type="small" themeColor="tint">
            {showPaste ? 'Hide' : 'Paste a sign-in code instead'}
          </ThemedText>
        </Pressable>

        {showPaste && (
          <View style={styles.pasteWrap}>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Paste the code from /mobile-login"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text, borderColor: theme.border }]}
            />
            <Pressable
              disabled={busy}
              onPress={() => run(() => signInWithCode(code))}
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: theme.tint, opacity: pressed || busy ? 0.6 : 1 }]}>
              <ThemedText style={[styles.secondaryLabel, { color: theme.tint }]}>Use code</ThemedText>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.three },
  hero: { alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.three },
  logoImg: { width: 88, height: 88, borderRadius: 22, marginBottom: Spacing.two },
  // Explicit lineHeight + padding stop the tall/bold title from clipping on Android.
  logo: { fontSize: 34, lineHeight: 42, fontWeight: '800', textAlign: 'center', paddingVertical: 2 },
  tagline: { textAlign: 'center', paddingHorizontal: Spacing.three },
  primaryBtn: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  primaryLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  error: { textAlign: 'center' },
  linkBtn: { alignItems: 'center', paddingVertical: Spacing.two },
  pasteWrap: { gap: Spacing.two },
  input: { minHeight: 80, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: Spacing.three, fontSize: 13, fontFamily: 'monospace' },
  secondaryBtn: { height: 46, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secondaryLabel: { fontSize: 15, fontWeight: '700' },
});
