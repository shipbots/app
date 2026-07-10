'use client';

/**
 * usePersistentCollapse — a boolean (collapsed/expanded) that remembers itself
 * in localStorage. Used by the home-page side panels (My Tasks, My Projects)
 * so a rep who collapses a section stays collapsed on their next visit /
 * login on that device.
 *
 * Pass a per-user key (e.g. include the signed-in email) so two people sharing
 * a browser don't clobber each other's preference.
 *
 * Reads happen in an effect (not a lazy initializer) to keep SSR and the first
 * client render identical — avoiding a hydration mismatch. That means one
 * quick paint at the default state before the stored value applies, which is
 * imperceptible for a collapse toggle.
 */

import { useEffect, useState } from 'react';

export function usePersistentCollapse(
  key: string,
  initial = false,
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [collapsed, setCollapsed] = useState(initial);
  const [hydrated, setHydrated] = useState(false);

  // Load the stored value once on mount (and if the key changes, e.g. the
  // signed-in user).
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) setCollapsed(v === '1');
      else setCollapsed(initial);
    } catch {
      /* localStorage unavailable (private mode) — stay at the default */
    }
    setHydrated(true);
    // initial is intentionally excluded — we only want to re-read on key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Persist after hydration so we never write the default over a stored value
  // before it's been read.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, collapsed ? '1' : '0');
    } catch {
      /* ignore write failures */
    }
  }, [key, collapsed, hydrated]);

  return [collapsed, setCollapsed];
}
