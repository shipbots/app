'use client';

/**
 * Popup shown after a contact email is added/changed ("enroll") or deleted
 * ("remove"). It lists the relevant e-mail notifications with checkboxes so the
 * rep can pick which ones the email should be added to / removed from. Designed
 * to grow: every notification type in lib/notifications.ts shows up here
 * automatically.
 *
 * Fetches the client fresh on open so it reads the current recipient lists
 * (the notifications section edits the same columns), then read-modify-writes
 * each selected notification's email column — avoiding clobbering.
 *
 * Dismissing (X / backdrop / Cancel) makes no change — so for a deletion,
 * "ignore the popup" leaves the email on the notification, exactly as asked.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Bell, Loader2 } from 'lucide-react';
import type { ClientInfo } from '@/lib/types';
import {
  NOTIFICATION_TYPES,
  parseEmailList,
  joinEmailList,
  isNotificationEnabled,
  emailsEqual,
} from '@/lib/notifications';

export type EnrollMode = 'enroll' | 'remove';

async function patchColumn(clientId: string, columnId: string, value: string): Promise<void> {
  const res = await fetch(`/api/client/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId, value }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

interface Option {
  key: string;
  label: string;
  emailsColumnId: string;
  currentList: string[];
}

export function NotificationEnrollDialog({
  email,
  mode,
  clientBoardItemId,
  onClose,
}: {
  email: string;
  mode: EnrollMode;
  clientBoardItemId: string;
  onClose: () => void;
}) {
  const [cols, setCols] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Read the current recipient lists fresh so we don't clobber concurrent edits.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/client/${encodeURIComponent(clientBoardItemId)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((c: ClientInfo) => { if (!cancelled) setCols(c.notificationColumns ?? {}); })
      .catch(() => { if (!cancelled) setCols({}); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientBoardItemId]);

  // enroll → notifications that are ON and don't already include the email.
  // remove → notifications that currently include the email.
  const options = useMemo<Option[]>(() => {
    if (!cols) return [];
    const out: Option[] = [];
    for (const t of NOTIFICATION_TYPES) {
      const list = parseEmailList(cols[t.emailsColumnId]);
      const includes = list.some(e => emailsEqual(e, email));
      if (mode === 'enroll') {
        if (isNotificationEnabled(cols[t.enabledColumnId]) && !includes) {
          out.push({ key: t.key, label: t.label, emailsColumnId: t.emailsColumnId, currentList: list });
        }
      } else if (includes) {
        out.push({ key: t.key, label: t.label, emailsColumnId: t.emailsColumnId, currentList: list });
      }
    }
    return out;
  }, [cols, email, mode]);

  // Default every option checked once the lists load.
  useEffect(() => {
    if (loading) return;
    setChecked(Object.fromEntries(options.map(o => [o.key, true])));
    // Nothing to ask about → don't bother the user.
    if (options.length === 0) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      for (const o of options) {
        if (!checked[o.key]) continue;
        const next = mode === 'enroll'
          ? joinEmailList([...o.currentList, email])
          : joinEmailList(o.currentList.filter(e => !emailsEqual(e, email)));
        await patchColumn(clientBoardItemId, o.emailsColumnId, next);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  };

  if (!loading && options.length === 0) return null;

  const isEnroll = mode === 'enroll';

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5">
        <div className="flex items-start gap-2 mb-1">
          <Bell className="w-5 h-5 text-[#015280] flex-shrink-0 mt-0.5" />
          <h3 className="text-base font-semibold text-gray-900">
            {isEnroll ? 'Add this email to notifications?' : 'Remove this email from notifications?'}
          </h3>
          <button type="button" onClick={onClose} className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium text-gray-900">{email}</span>
          {isEnroll
            ? ' — pick which notifications it should receive.'
            : ' — pick which notifications to remove it from. (Close to leave it as-is.)'}
        </p>

        <div className="mb-4">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-3 justify-center">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading notifications…
            </div>
          ) : (
            <div className="space-y-1">
              {options.map(o => (
                <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!checked[o.key]}
                    onChange={() => setChecked(c => ({ ...c, [o.key]: !c[o.key] }))}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#015280] focus:ring-[#43c7ff]"
                  />
                  <span className="text-sm text-gray-800">{o.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-[11px] text-red-500 mb-2">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || loading || options.every(o => !checked[o.key])}
            className={`px-3 py-1.5 text-sm font-semibold text-white rounded inline-flex items-center gap-1.5 disabled:opacity-50 ${isEnroll ? 'bg-[#015280] hover:bg-[#01416a]' : 'bg-red-600 hover:bg-red-700'}`}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {isEnroll ? 'Add to selected' : 'Remove from selected'}
          </button>
        </div>
      </div>
    </div>
  );
}
