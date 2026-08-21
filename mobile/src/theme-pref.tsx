/**
 * User-selectable light/dark theme, overriding the OS setting. Persisted in
 * AsyncStorage. `useTheme` + the navigation theme read `scheme` from here.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

export type ThemePref = 'light' | 'dark' | 'system';
const STORE_KEY = 'shipbots-theme-pref';

interface ThemePrefCtx {
  pref: ThemePref;
  scheme: 'light' | 'dark';
  setPref: (p: ThemePref) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemePrefCtx | null>(null);

export function ThemePrefProvider({ children }: { children: ReactNode }) {
  const system = useRNColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then(v => { if (v === 'light' || v === 'dark' || v === 'system') setPrefState(v); })
      .catch(() => {});
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(STORE_KEY, p).catch(() => {});
  };

  const scheme: 'light' | 'dark' = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  const toggle = () => setPref(scheme === 'dark' ? 'light' : 'dark');

  const value = useMemo<ThemePrefCtx>(() => ({ pref, scheme, setPref, toggle }), [pref, scheme]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useThemePref(): ThemePrefCtx {
  return useContext(Ctx) ?? { pref: 'system', scheme: 'light', setPref: () => {}, toggle: () => {} };
}
