/**
 * Mobile auth: stores the Bearer token in the OS secure store and exposes
 * sign-in (via the /mobile-login web page) + a paste-code fallback + sign-out.
 */

import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAuthToken } from '@/api/client';
import { API_BASE_URL, AUTH_RETURN_URL } from '@/config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'shipbots-cs-token';

type Result = { ok: boolean; error?: string };
type AuthState = {
  token: string | null;
  loading: boolean;
  signIn: () => Promise<Result>;
  signInWithCode: (code: string) => Promise<Result>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        setAuthToken(stored);
        setToken(stored);
      } catch {
        /* first run / no token */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const commit = useCallback(async (t: string): Promise<Result> => {
    const clean = t.trim();
    if (!clean) return { ok: false, error: 'Empty sign-in code.' };
    await SecureStore.setItemAsync(TOKEN_KEY, clean);
    setAuthToken(clean);
    setToken(clean);
    return { ok: true };
  }, []);

  const signIn = useCallback(async (): Promise<Result> => {
    try {
      const res = await WebBrowser.openAuthSessionAsync(`${API_BASE_URL}/mobile-login`, AUTH_RETURN_URL);
      if (res.type === 'success' && res.url) {
        const t = (Linking.parse(res.url).queryParams?.token as string | undefined) ?? '';
        if (t) return commit(t);
        return { ok: false, error: 'No sign-in code returned — try the paste option below.' };
      }
      if (res.type === 'cancel' || res.type === 'dismiss') return { ok: false, error: 'Sign-in cancelled.' };
      return { ok: false, error: 'Sign-in didn’t complete.' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sign-in failed.' };
    }
  }, [commit]);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setAuthToken(null);
    setToken(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, loading, signIn, signInWithCode: commit, signOut }),
    [token, loading, signIn, commit, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
