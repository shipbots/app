/**
 * Mobile auth: stores the Bearer token in the OS secure store and exposes
 * sign-in (via the /mobile-login web page) + a paste-code fallback + sign-out.
 * Also decodes the token's email so the UI can greet + filter "my clients".
 */

import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setAuthToken, setCurrentUser } from '@/api/client';
import { API_BASE_URL, AUTH_RETURN_URL } from '@/config';

WebBrowser.maybeCompleteAuthSession();

const TOKEN_KEY = 'shipbots-cs-token';

/** Read the email + access claims out of the (unverified) JWT payload. The
 *  signature is trusted server-side; here we only read it to greet the user and
 *  gate the billing / onboarding sections locally. */
function decodeClaims(token: string | null): { email: string | null; isAdmin: boolean; canDocusign: boolean } {
  const empty = { email: null, isAdmin: false, canDocusign: false };
  if (!token) return empty;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    const part = token.split('.')[1];
    if (!part || typeof g.atob !== 'function') return empty;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = g.atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const obj = JSON.parse(json);
    return {
      email: (obj.email || obj.sub || '') || null,
      isAdmin: !!obj.isAdmin,
      canDocusign: !!obj.canDocusign,
    };
  } catch {
    return empty;
  }
}
const decodeEmail = (token: string | null): string | null => decodeClaims(token).email;

type Result = { ok: boolean; error?: string };
type AuthState = {
  token: string | null;
  email: string | null;
  /** Onboarding access (ADMIN_EMAILS) — mirrors the extension's isAdmin. */
  isAdmin: boolean;
  /** Billing / pricing / DocuSign access (DOCUSIGN_EMAILS allowlist). */
  canDocusign: boolean;
  loading: boolean;
  signIn: () => Promise<Result>;
  signInWithCode: (code: string) => Promise<Result>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function apply(token: string | null) {
  setAuthToken(token);
  setCurrentUser(decodeEmail(token));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        apply(stored);
        setToken(stored);
        setEmail(decodeEmail(stored));
      } catch {
        /* first run */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const commit = useCallback(async (t: string): Promise<Result> => {
    const clean = t.trim();
    if (!clean) return { ok: false, error: 'Empty sign-in code.' };
    await SecureStore.setItemAsync(TOKEN_KEY, clean);
    apply(clean);
    setToken(clean);
    setEmail(decodeEmail(clean));
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
    apply(null);
    setToken(null);
    setEmail(null);
  }, []);

  const claims = useMemo(() => decodeClaims(token), [token]);
  const value = useMemo<AuthState>(
    () => ({ token, email, isAdmin: claims.isAdmin, canDocusign: claims.canDocusign, loading, signIn, signInWithCode: commit, signOut }),
    [token, email, claims.isAdmin, claims.canDocusign, loading, signIn, commit, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
