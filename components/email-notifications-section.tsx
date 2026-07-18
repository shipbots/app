'use client';

/**
 * E-mail notifications — a Client Info section (both Customer Service and
 * Onboarding). For each notification type (see lib/notifications.ts) it shows a
 * Yes/No toggle backed by a Monday dropdown, and — when on — lets the rep pick
 * which recipients get the emails: check-mark any of the client's contact
 * emails (contact 1/2/3) and/or add arbitrary extra addresses. The recipients
 * are saved to the notification's Monday text column, comma-separated.
 *
 * Turning a notification off clears its recipient list.
 */

import { useMemo, useState } from 'react';
import { Bell, ChevronRight, X, Plus, Loader2, User, AlertTriangle } from 'lucide-react';
import type { ClientInfo } from '@/lib/types';
import {
  NOTIFICATION_TYPES,
  parseEmailList,
  joinEmailList,
  isNotificationEnabled,
  emailsEqual,
  looksLikeEmail,
} from '@/lib/notifications';

async function patchColumn(clientId: string, columnId: string, value: string): Promise<void> {
  const res = await fetch(`/api/client/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columnId, value }),
  });
  if (!res.ok) throw new Error(`Save failed (${res.status})`);
}

/**
 * Best-effort: mirror this client's CURRENT recipient list to the Google Sheet
 * as one consolidated, comma-separated row ('sync'). Sending the full list every
 * time means removing an e-mail leaves only the ones still checked, and an empty
 * list clears the client's row. Fire-and-forget: Monday.com is the source of
 * truth; the sheet is a side mirror, so failures never surface in the UI. No-ops
 * server-side when the sheet webhook isn't configured.
 */
async function syncSheetRecipients(shipHeroName: string, emails: string): Promise<void> {
  if (!shipHeroName.trim()) return; // the name is the row key — nothing to target without it
  try {
    await fetch('/api/notifications/sheet-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sync', shipHeroName, emails }),
    });
  } catch {
    /* best-effort — ignore */
  }
}

interface ContactEmail {
  label: string;
  email: string;
}

/** "Address Hold Notification" → "Address Hold" for the compact status pill. */
function shortLabel(label: string): string {
  return label.replace(/\s*notifications?\??$/i, '').trim() || label;
}

export function EmailNotificationsSection({
  clientBoardItemId,
  client,
}: {
  clientBoardItemId: string;
  client: ClientInfo;
}) {
  // Collapsed by default when the client opens.
  const [open, setOpen] = useState(false);
  // Enabled state lifted here so the collapsed header can show each
  // notification's Yes/No status without expanding.
  const [enabledByKey, setEnabledByKey] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NOTIFICATION_TYPES.map(t => [t.key, isNotificationEnabled(client.notificationColumns?.[t.enabledColumnId])]),
    ),
  );

  const contactEmails = useMemo<ContactEmail[]>(() => {
    const raw = [
      { label: client.contactName || 'Primary contact', email: client.contactEmail },
      { label: client.contact2Name || 'Contact 2', email: client.contact2Email },
      { label: client.contact3Name || 'Contact 3', email: client.contact3Email },
    ];
    const seen = new Set<string>();
    const out: ContactEmail[] = [];
    for (const c of raw) {
      const e = (c.email || '').trim();
      if (!e) continue;
      const k = e.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ label: c.label, email: e });
    }
    return out;
  }, [client]);

  const enabledTypes = NOTIFICATION_TYPES.filter(t => enabledByKey[t.key]);

  return (
    <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)] overflow-hidden mb-2.5">
      <div className="w-full flex items-center gap-2 px-3.5 py-2.5 hover:bg-gray-50/70 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
        >
          <ChevronRight className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <Bell className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />
          <span className="text-[13px] font-semibold text-gray-800 tracking-[-0.01em] truncate">E-mail notifications</span>
        </button>
        {/* Collapsed-safe status — pinned to the right so an active
            notification is visible without expanding. Green pill(s) = on;
            a muted "No" when everything's off. */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {enabledTypes.length > 0 ? (
            enabledTypes.map(t => (
              <span
                key={t.key}
                title={`${t.label}: Yes`}
                className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-100 text-green-700 rounded-full px-2 py-0.5 whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                {shortLabel(t.label)}
              </span>
            ))
          ) : (
            <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">No</span>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-2.5">
          {NOTIFICATION_TYPES.map(type => (
            <NotificationRow
              key={type.key}
              clientBoardItemId={clientBoardItemId}
              shipHeroName={client.shipHeroName || ''}
              label={type.label}
              enabledColumnId={type.enabledColumnId}
              emailsColumnId={type.emailsColumnId}
              contactEmails={contactEmails}
              enabled={!!enabledByKey[type.key]}
              onEnabledChange={v => setEnabledByKey(m => ({ ...m, [type.key]: v }))}
              initialEmails={parseEmailList(client.notificationColumns?.[type.emailsColumnId])}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  clientBoardItemId,
  shipHeroName,
  label,
  enabledColumnId,
  emailsColumnId,
  contactEmails,
  enabled,
  onEnabledChange,
  initialEmails,
}: {
  clientBoardItemId: string;
  shipHeroName: string;
  label: string;
  enabledColumnId: string;
  emailsColumnId: string;
  contactEmails: ContactEmail[];
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  initialEmails: string[];
}) {
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingEmails, setSavingEmails] = useState(false);
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addError, setAddError] = useState('');

  const contactEmailSet = useMemo(
    () => new Set(contactEmails.map(c => c.email.toLowerCase())),
    [contactEmails],
  );
  const extras = emails.filter(e => !contactEmailSet.has(e.toLowerCase()));
  const isChecked = (email: string) => emails.some(e => emailsEqual(e, email));

  const saveEmails = async (next: string[]) => {
    setEmails(next); // optimistic
    setSavingEmails(true);
    setError('');
    try {
      await patchColumn(clientBoardItemId, emailsColumnId, joinEmailList(next));
      // Monday saved — mirror the FULL current list to the Google Sheet as one
      // consolidated row, so adds and removes both leave only the checked set.
      void syncSheetRecipients(shipHeroName, joinEmailList(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingEmails(false);
    }
  };

  const toggleContact = (email: string) => {
    const next = isChecked(email) ? emails.filter(e => !emailsEqual(e, email)) : [...emails, email];
    void saveEmails(next);
  };
  const removeEmail = (email: string) => void saveEmails(emails.filter(e => !emailsEqual(e, email)));
  const addEmail = () => {
    const e = newEmail.trim();
    if (!e) return;
    if (!looksLikeEmail(e)) { setAddError('Enter a valid email'); return; }
    if (emails.some(x => emailsEqual(x, e))) { setNewEmail(''); return; }
    setNewEmail('');
    setAddError('');
    void saveEmails([...emails, e]);
  };

  const nameReady = shipHeroName.trim().length > 0;

  const setEnabledYesNo = async (yes: boolean) => {
    if (yes === enabled) return;
    // Notifications can't be turned ON without a ShipHero Name — that's the key
    // logged to the Google Sheet, so an empty name would create nameless rows.
    if (yes && !nameReady) {
      setError('Add a ShipHero Name (in Client Info) before turning on notifications.');
      return;
    }
    onEnabledChange(yes); // optimistic (lifted state)
    setSavingToggle(true);
    setError('');
    try {
      await patchColumn(clientBoardItemId, enabledColumnId, yes ? 'Yes' : 'No');
      if (!yes) {
        // Turning off clears all recipient emails — clear the client's sheet row too.
        setEmails([]);
        await patchColumn(clientBoardItemId, emailsColumnId, '');
        void syncSheetRecipients(shipHeroName, '');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
      onEnabledChange(!yes); // revert
    } finally {
      setSavingToggle(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/40 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-gray-800 min-w-0">{label}?</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {savingToggle && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}
          <YesNoToggle value={enabled} onChange={setEnabledYesNo} disabled={savingToggle || (!nameReady && !enabled)} />
        </div>
      </div>

      {/* No ShipHero Name → notifications can't be turned on and no recipients
          can be added (the name is the key logged to the Google Sheet). Shown
          even if it was auto-enabled, so nameless rows can never be created. */}
      {!nameReady && (
        <p className="mt-2 text-[11px] text-amber-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          A ShipHero Name (in Client Info) is required to use notifications.
        </p>
      )}

      {enabled && nameReady && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Add email to notify</p>
            {savingEmails && <Loader2 className="w-3 h-3 animate-spin text-gray-400" />}
          </div>

          {contactEmails.length > 0 ? (
            <div className="space-y-0.5">
              {contactEmails.map(c => (
                <label key={c.email} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-white cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked(c.email)}
                    onChange={() => toggleContact(c.email)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#015280] focus:ring-[#43c7ff] flex-shrink-0"
                  />
                  <User className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-700 truncate">{c.email}</span>
                  <span className="text-[10px] text-gray-400 truncate flex-shrink-0">· {c.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400 italic px-1">No contact emails on file to pick from.</p>
          )}

          {extras.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {extras.map(e => (
                <span key={e} className="inline-flex items-center gap-1 text-[11px] bg-[#e6f8ff] text-[#015280] rounded-full pl-2 pr-1 py-0.5">
                  {e}
                  <button
                    type="button"
                    onClick={() => removeEmail(e)}
                    className="p-0.5 rounded-full hover:bg-white/70"
                    title="Remove"
                    aria-label={`Remove ${e}`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5 mt-2">
            <input
              value={newEmail}
              onChange={e => { setNewEmail(e.target.value); setAddError(''); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
              placeholder="Add another email…"
              className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
            />
            <button
              type="button"
              onClick={addEmail}
              disabled={!newEmail.trim()}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#015280] border border-[#43c7ff] bg-[#e6f8ff] rounded px-2 py-1.5 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
          {addError && <p className="text-[11px] text-red-500 mt-1">{addError}</p>}

          {emails.length > 0 && (
            <p className="text-[10px] text-gray-400 mt-2">
              {emails.length} recipient{emails.length === 1 ? '' : 's'} will be notified.
            </p>
          )}
        </div>
      )}

      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
    </div>
  );
}

function YesNoToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (yes: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 overflow-hidden text-[11px] font-semibold">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`px-2.5 py-1 transition-colors ${value ? 'bg-green-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`px-2.5 py-1 transition-colors ${!value ? 'bg-gray-400 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
      >
        No
      </button>
    </div>
  );
}
