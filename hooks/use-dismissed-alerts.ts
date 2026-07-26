'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Alert } from '@/lib/types';

// Alerts the reviewer has cleared, persisted so they stay cleared across reloads.
// Keyed by alert id. Dismissals for alerts that later resolve are pruned, so a
// recurring condition surfaces a fresh alert instead of staying hidden forever.
const KEY = 'onboarding-dismissed-alerts-v1';

function load(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function save(s: Set<string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...s]));
  } catch {
    /* storage unavailable — dismissals just won't persist */
  }
}

export function useDismissedAlerts(alerts: Alert[]) {
  const [dismissed, setDismissed] = useState<Set<string>>(load);

  // Drop dismissals whose alert no longer exists (condition resolved) so the
  // same alert can reappear if it recurs later.
  useEffect(() => {
    const currentIds = new Set(alerts.map(a => a.id));
    setDismissed(prev => {
      const next = new Set([...prev].filter(id => currentIds.has(id)));
      if (next.size === prev.size) return prev;
      save(next);
      return next;
    });
  }, [alerts]);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      save(next);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setDismissed(() => {
      const next = new Set(alerts.map(a => a.id));
      save(next);
      return next;
    });
  }, [alerts]);

  const reset = useCallback(() => {
    setDismissed(() => {
      save(new Set());
      return new Set();
    });
  }, []);

  const visible = alerts.filter(a => !dismissed.has(a.id));
  return { visible, dismissedCount: alerts.length - visible.length, dismiss, clearAll, reset };
}
