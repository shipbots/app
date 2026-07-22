'use client';

/**
 * ClientHeader — sits across the top of the fullscreen client view in both
 * Onboarding and Customer Service modes. Replaces the standalone "Contact
 * Info" section: contacts now live in this header as three cards (Primary,
 * 2, 3) with inline edit + copy-on-hover.
 *
 * Layout:
 *   Row 1: [Name + Active toggle + collapse chevron] [Platform pills] [Warehouse pill] [Refresh/Min/Close]
 *   Row 2 (expanded only): Contact 1 | Contact 2 | Contact 3 — each card
 *                          shows name / email / phone with copy-on-hover.
 *                          Non-primary cards have a "Make primary" button
 *                          that swaps slot data on the Clients board.
 *   Row 2 (collapsed): primary contact name · email · phone (compact line).
 *
 * All edits PATCH to /api/client/[id] using the existing auto-detect column
 * type pipeline, same as the Contact Info section that this header replaces.
 * "Make primary" fires six parallel PATCHes — identical to the swap logic
 * we already shipped in client-info-tab — so Monday stays the source of
 * truth and no schema changes were needed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClientInfo } from '@/lib/types';
import { useNotificationSync, isContactEmailColumn } from './notification-sync';
import {
  ChevronDown, ChevronUp,
  Mail, Phone, Copy, Check, User,
  Warehouse, Boxes, Pencil, Loader2, ShieldCheck,
  RefreshCw, Minimize2, X,
} from 'lucide-react';

const LS_COLLAPSED = 'shipbots:client-header:collapsed';

// ── Helpers ────────────────────────────────────────────────────────────────
function loadCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(LS_COLLAPSED) === '1'; } catch { return false; }
}
function saveCollapsed(c: boolean) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LS_COLLAPSED, c ? '1' : '0'); } catch { /* ignore */ }
}

// Two-char initials from a full name. Falls back to first two letters of a
// single-word string. Used by ContactCard's avatar circle.
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Match the Portal-dropdown text (e.g. "AppDot, Portal") against the label
// the pill represents. Either token can appear alone or together.
function isPlatformActive(portalText: string, token: 'AppDot' | 'Portal'): boolean {
  return portalText
    .split(',')
    .map(s => s.trim().toLowerCase())
    .includes(token.toLowerCase());
}

// ── ConfirmDialog ──────────────────────────────────────────────────────────
// Small modal used to gate destructive-feeling changes (Platform toggle,
// Warehouse switch) since both flow through to Monday and downstream
// shipping ops. ESC and backdrop click cancel.
export function ConfirmDialog({
  title, description, confirmLabel = 'Confirm', onCancel, onConfirm, busy,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
        <div className="text-sm text-gray-600 mb-4">{description}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[#015280] hover:bg-[#01416a] rounded inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inline editable text field with optional copy-on-hover ─────────────────
// `size='title'` renders the value as a card-title (semibold, base weight, no
// gray icon-slot styling) — used at the top of ContactCard for the contact
// name. Default `size='row'` keeps the compact icon+value layout used by
// email/phone/location lines.
function InlineField({
  value, icon, columnId, clientId, placeholder, copyable, hrefBuilder, onSaved, size = 'row',
}: {
  value: string;
  icon?: React.ReactNode;
  columnId: string;
  clientId: string;
  placeholder: string;
  copyable?: boolean;
  hrefBuilder?: (v: string) => string;
  onSaved?: (newValue: string) => void;
  size?: 'row' | 'title';
}) {
  const isTitle = size === 'title';
  const displayCls = isTitle
    ? 'text-sm font-semibold text-gray-900 truncate flex-1 min-w-0'
    : 'text-xs text-gray-700 truncate flex-1 min-w-0';
  const placeholderCls = isTitle
    ? 'text-sm text-gray-400 italic hover:text-[#015280] flex-1 min-w-0 text-left'
    : 'text-xs text-gray-400 italic hover:text-[#015280] flex-1 min-w-0 text-left';
  const inputCls = isTitle
    ? 'flex-1 min-w-0 text-sm font-semibold text-gray-900 border border-[#43c7ff] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white'
    : 'flex-1 min-w-0 text-xs border border-[#43c7ff] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sync = useNotificationSync();

  useEffect(() => { setDraft(value); }, [value]);

  const startEdit = () => { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.select(), 30); };
  const save = useCallback(async () => {
    const next = draft.trim();
    setEditing(false);
    if (next === value) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onSaved?.(next);
      // Contact email add/change/delete → offer to sync notifications.
      if (isContactEmailColumn(columnId)) sync.onContactEmailChanged(value, next);
    } catch (err) {
      console.error('[InlineField] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [draft, value, clientId, columnId, onSaved, sync]);

  const onCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setDraft(value); setEditing(false); }
          }}
          placeholder={placeholder}
          className={inputCls}
        />
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-1.5 min-w-0">
      {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
      {value ? (
        hrefBuilder ? (
          <a
            href={hrefBuilder(value)}
            onClick={e => e.stopPropagation()}
            className={`${displayCls} hover:text-[#015280] hover:underline`}
            title={value}
          >
            {value}
          </a>
        ) : (
          <span className={displayCls} title={value}>{value}</span>
        )
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className={placeholderCls}
        >
          {placeholder}
        </button>
      )}
      {value && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {copyable && (
            <button
              type="button"
              onClick={onCopy}
              title="Copy"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity"
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
            </button>
          )}
          <button
            type="button"
            onClick={startEdit}
            title="Edit"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity"
          >
            <Pencil className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      )}
      {saving && <Loader2 className="w-3 h-3 animate-spin text-[#43c7ff] flex-shrink-0" />}
    </div>
  );
}

// ── Platform pills (AppDot + Portal) ───────────────────────────────────────
// Clicks no longer fire PATCH immediately — they stage a pending change that
// the user has to confirm. Both pills are gated by the same ConfirmDialog.
function PlatformPills({ value, clientId, onSaved }: {
  value: string;
  clientId: string;
  onSaved: (newValue: string) => void;
}) {
  const [pending, setPending] = useState<{ token: 'AppDot' | 'Portal'; nextValue: string; turningOn: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const appDotOn = isPlatformActive(value, 'AppDot');
  const portalOn = isPlatformActive(value, 'Portal');

  const requestToggle = (token: 'AppDot' | 'Portal') => {
    if (saving || pending) return;
    const currentlyOn = isPlatformActive(value, token);
    const set = new Set((value || '').split(',').map(s => s.trim()).filter(Boolean));
    if (currentlyOn) set.delete(token); else set.add(token);
    const next = Array.from(set).join(', ');
    setPending({ token, nextValue: next, turningOn: !currentlyOn });
  };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'dropdown_mktrbeyg', value: pending.nextValue, valueType: 'dropdown' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onSaved(pending.nextValue);
    } catch (err) {
      console.error('[PlatformPills] save failed:', err);
    } finally {
      setSaving(false);
      setPending(null);
    }
  };

  const pill = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      disabled={saving || pending !== null}
      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-60 ${
        on
          ? 'bg-[#EAF3FA] text-[#0071BC]'
          : 'text-gray-400 hover:bg-gray-100'
      }`}
      title={on ? `${label} — click to disable` : `${label} — click to enable`}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Segmented Platform pill — no "PLATFORM" caps label above (matches
          the mockup). The active token gets the light-blue fill; the other
          reads as an outline slot. Keeps the same tap-target + confirm flow. */}
      <div className="flex items-center bg-gray-50/80 border border-gray-200/70 rounded-full p-0.5">
        {pill('AppDot', appDotOn, () => requestToggle('AppDot'))}
        {pill('Portal', portalOn, () => requestToggle('Portal'))}
      </div>
      {pending && (
        <ConfirmDialog
          title={pending.turningOn ? `Enable ${pending.token}?` : `Disable ${pending.token}?`}
          description={
            <span>
              This will {pending.turningOn ? 'turn on' : 'turn off'} <strong>{pending.token}</strong> for this client and sync to Monday.com.
            </span>
          }
          confirmLabel={pending.turningOn ? `Enable ${pending.token}` : `Disable ${pending.token}`}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
          busy={saving}
        />
      )}
    </>
  );
}

// ── Warehouse pill (editable multi-select dropdown) ────────────────────────
// Options come from the Monday Warehouse Location column via
// /api/client/column-options. Users can pick one OR many warehouses; the
// final list saves as a comma-separated string the same way Monday stores
// multi-value dropdowns (matches the PlatformPills convention upstairs).
// Edits batch into one ConfirmDialog so a single click on Save reviews
// every checkbox change before syncing to Monday.
function WarehousePill({ value, options, clientId, onSaved, columnId = 'dropdown_mktxaege', label = 'WAREHOUSE', noun = 'warehouse', icon }: {
  value: string;
  options: string[];
  clientId: string;
  onSaved: (newValue: string) => void;
  /** Monday dropdown column this pill edits. Defaults to Warehouse Location. */
  columnId?: string;
  /** Uppercase pill label — an 'S' is appended when more than one is selected. */
  label?: string;
  /** Lowercase noun for the menu / confirm copy ("warehouse" → "warehouses"). */
  noun?: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [pending, setPending] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Comma-separated string ↔ array. Trims + drops blanks defensively.
  const currentList = useMemo(
    () => (value || '').split(',').map(s => s.trim()).filter(Boolean),
    [value],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Outside-click is "cancel": close without applying draft changes.
        setOpen(false);
        setDraft([]);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const openMenu = () => {
    setDraft([...currentList]);
    setOpen(true);
  };

  const toggle = (option: string) => {
    setDraft(prev =>
      prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option],
    );
  };

  const apply = () => {
    setOpen(false);
    // Compare sorted lists so reorder-only edits don't show a confirm.
    const sortedDraft = [...draft].sort();
    const sortedCurrent = [...currentList].sort();
    if (sortedDraft.join('|') === sortedCurrent.join('|')) {
      setDraft([]);
      return;
    }
    setPending(draft);
  };

  const cancel = () => {
    setOpen(false);
    setDraft([]);
  };

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const next = pending.join(', ');
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: next, valueType: 'dropdown' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      onSaved(next);
    } catch (err) {
      console.error('[WarehousePill] save failed:', err);
    } finally {
      setSaving(false);
      setPending(null);
      setDraft([]);
    }
  };

  const disabled = options.length === 0;

  // Pill label: empty → "Not set"; one → its name; many → "Gardena +2".
  const displayLabel: React.ReactNode = (() => {
    if (currentList.length === 0) return <span className="text-gray-400 italic font-normal">Not set</span>;
    if (currentList.length === 1) return currentList[0];
    return <>{currentList[0]} <span className="text-[#015280]/70 font-normal">+{currentList.length - 1}</span></>;
  })();

  // Diff helpers for the confirm dialog summary.
  const added = pending ? pending.filter(p => !currentList.includes(p)) : [];
  const removed = pending ? currentList.filter(c => !pending.includes(c)) : [];

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          onClick={() => { if (!disabled) { open ? cancel() : openMenu(); } }}
          disabled={disabled}
          className="flex items-center gap-2 bg-gray-50/80 border border-gray-200/70 hover:bg-gray-100 disabled:hover:bg-gray-50/80 rounded-xl px-2.5 py-1.5 max-w-[260px] transition-colors"
          title={disabled ? `Loading ${noun} options…` : currentList.length > 1 ? currentList.join(', ') : `Change ${noun}`}
        >
          {icon ?? <Warehouse className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />}
          <div className="flex flex-col gap-0.5 min-w-0 text-left">
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[.08em] leading-none">
              {label}{currentList.length > 1 ? 'S' : ''}
            </p>
            <p className="text-xs font-semibold text-gray-900 truncate">{displayLabel}</p>
          </div>
          <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
        </button>
        {open && options.length > 0 && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[220px] py-1 flex flex-col">
            <p className="px-3 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-100">
              {draft.length === 0 ? 'Pick one or more' : `${draft.length} selected`}
            </p>
            <div className="max-h-56 overflow-y-auto">
              {options.map(opt => {
                const on = draft.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                      on ? 'bg-[#e6f8ff]/40' : ''
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      on ? 'bg-[#015280] border-[#015280]' : 'bg-white border-gray-300'
                    }`}>
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </span>
                    <span className={`truncate flex-1 ${on ? 'font-semibold text-[#015280]' : 'text-gray-700'}`}>
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="border-t border-gray-100 px-2 py-1.5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancel}
                className="px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-100 rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={apply}
                className="px-2 py-1 text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded"
              >
                Save changes
              </button>
            </div>
          </div>
        )}
      </div>
      {pending && (
        <ConfirmDialog
          title={pending.length === 0 ? `Clear all ${noun}s?` : currentList.length === 0 ? `Set ${noun}s?` : `Update ${noun}s?`}
          description={
            <div className="space-y-1.5">
              <div>
                Set to{' '}
                {pending.length === 0
                  ? <em>none</em>
                  : pending.map((p, i) => (
                      <span key={p}>
                        <strong>{p}</strong>{i < pending.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                .
              </div>
              {(added.length > 0 || removed.length > 0) && (
                <ul className="text-[11px] text-gray-500 list-disc pl-5">
                  {added.map(a => <li key={`a-${a}`}>Add <strong>{a}</strong></li>)}
                  {removed.map(r => <li key={`r-${r}`}>Remove <strong>{r}</strong></li>)}
                </ul>
              )}
              <div className="text-[11px] text-gray-500">This will sync to Monday.com.</div>
            </div>
          }
          confirmLabel={`Update ${noun}s`}
          onCancel={() => { setPending(null); setDraft([]); }}
          onConfirm={confirm}
          busy={saving}
        />
      )}
    </>
  );
}

// ── Single contact card ────────────────────────────────────────────────────
type ContactSlot = 1 | 2 | 3;
const CONTACT_COLUMNS: Record<ContactSlot, { name: string; email: string; phone: string }> = {
  1: { name: 'text_mktqq7h6', email: 'text_mktq6sr5', phone: 'text_mktqabcm' },
  2: { name: 'text_mktr1evd', email: 'text_mktr2xmm', phone: 'text_mktr8kve' },
  3: { name: 'text_mktr4v7q', email: 'text_mktrt74r', phone: 'text_mktrw0tb' },
};

// Circular initials badge that anchors each contact card. Primary gets a
// blue→violet gradient so it reads as the anchor identity of the client;
// secondaries get a neutral slate; empty slots fall back to the slot number
// so the card still communicates "this is contact 2 / 3" before anything
// has been filled in.
function ContactAvatar({
  slot, name, isPrimary, empty,
}: {
  slot: ContactSlot;
  name: string;
  isPrimary: boolean;
  empty: boolean;
}) {
  const glyph = empty ? String(slot) : (initials(name) || String(slot));
  const bg = empty
    ? 'bg-gray-100 text-gray-400'
    : isPrimary
      ? 'text-white bg-gradient-to-br from-[#4A6CF7] to-[#8B5CF6]'
      : 'text-gray-500 bg-gray-100';
  return (
    <div
      className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-semibold tracking-tight ${bg}`}
      aria-hidden
    >
      {glyph}
    </div>
  );
}

function ContactCard({
  slot, client, clientId, hubUser, onClientChanged, onMakePrimary, promoting,
}: {
  slot: ContactSlot;
  client: ClientInfo;
  clientId: string;
  /** True when the primary contact's email is recognized as a Hub user.
   *  Only meaningful when slot === 1; we render a small badge there. */
  hubUser: boolean;
  onClientChanged: (patch: Partial<ClientInfo>) => void;
  onMakePrimary: (slot: 2 | 3) => void;
  promoting: 2 | 3 | null;
}) {
  const cols = CONTACT_COLUMNS[slot];
  const fields: Record<ContactSlot, { name: string; email: string; phone: string; location?: string }> = {
    1: { name: client.contactName, email: client.contactEmail, phone: client.contactPhone, location: client.contactLocation },
    2: { name: client.contact2Name, email: client.contact2Email, phone: client.contact2Phone },
    3: { name: client.contact3Name, email: client.contact3Email, phone: client.contact3Phone },
  };
  const data = fields[slot];
  const isPrimary = slot === 1;
  const empty = !data.name && !data.email && !data.phone;

  const patch = (key: keyof ClientInfo) => (newValue: string) => onClientChanged({ [key]: newValue } as Partial<ClientInfo>);
  const nameKey: keyof ClientInfo = slot === 1 ? 'contactName' : slot === 2 ? 'contact2Name' : 'contact3Name';
  const emailKey: keyof ClientInfo = slot === 1 ? 'contactEmail' : slot === 2 ? 'contact2Email' : 'contact3Email';
  const phoneKey: keyof ClientInfo = slot === 1 ? 'contactPhone' : slot === 2 ? 'contact2Phone' : 'contact3Phone';

  const namePlaceholder = empty
    ? (slot === 1 ? 'Add primary contact' : slot === 2 ? 'Add a second contact' : 'Add a third contact')
    : 'No name on file';

  return (
    <section className={`rounded-2xl p-3 bg-white transition-shadow ${
      isPrimary
        ? 'shadow-[0_0_0_1.5px_#0071BC,0_6px_16px_rgba(20,24,40,.06)]'
        : empty
          ? 'border border-dashed border-gray-200'
          : 'border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)]'
    }`}>
      <div className="flex items-start gap-3">
        <ContactAvatar slot={slot} name={data.name} isPrimary={isPrimary} empty={empty} />
        <div className="flex-1 min-w-0">
          {/* Name row + top-right action / status.
              Primary card: Primary + optional Hub user badges live in the
              top-right corner (parallel to the "Make primary" action on
              secondary cards) so the header stays scannable — you glance
              at the corner to see role, not below the name. */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <InlineField
                size="title"
                value={data.name}
                columnId={cols.name}
                clientId={clientId}
                placeholder={namePlaceholder}
                onSaved={patch(nameKey)}
              />
            </div>
            {isPrimary ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] font-semibold bg-[#EAF3FA] text-[#0071BC] px-1.5 py-0.5 rounded-full inline-flex items-center whitespace-nowrap">
                  Primary
                </span>
                {hubUser && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-[#E7F8ED] text-[#1E7A3E] rounded-full px-1.5 py-0.5 whitespace-nowrap">
                    <ShieldCheck className="w-2.5 h-2.5" />
                    Hub user
                  </span>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onMakePrimary(slot as 2 | 3)}
                disabled={empty || promoting !== null}
                className="text-[11px] font-semibold text-[#0071BC] hover:bg-[#EAF3FA] px-1.5 py-0.5 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed inline-flex items-center gap-1 flex-shrink-0 whitespace-nowrap"
                title={empty ? 'Add contact info first' : 'Swap with the current primary contact'}
              >
                {promoting === slot ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
                Make primary
              </button>
            )}
          </div>

          {/* Email + phone sit side-by-side to save vertical space
              (empty state still collapses to a single CTA). Location was
              removed on purpose: Monday still stores it but reps don't
              want it in the card. If a future need comes back, add it as
              a separate row below this grid. */}
          {empty ? (
            <button
              type="button"
              onClick={() => onClientChanged({ [emailKey]: '' } as Partial<ClientInfo>)}
              className="mt-2 text-xs text-gray-400 hover:text-[#015280] flex items-center gap-1"
            >
              <span className="text-base leading-none">+</span>
              Add name, email &amp; phone
            </button>
          ) : (
            // 3fr / 2fr split: emails outgrow phone numbers most of the
            // time, so give the email column the extra room and slide
            // the phone right. Both cells still truncate with a title
            // tooltip when the value is longer than the column allows.
            <div
              className="mt-2 grid gap-x-3 gap-y-1"
              style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' }}
            >
              <InlineField
                icon={<Mail className="w-3 h-3" />}
                value={data.email}
                columnId={cols.email}
                clientId={clientId}
                placeholder="No email on file"
                copyable
                hrefBuilder={v => `mailto:${v}`}
                onSaved={patch(emailKey)}
              />
              <InlineField
                icon={<Phone className="w-3 h-3" />}
                value={data.phone}
                columnId={cols.phone}
                clientId={clientId}
                placeholder="No phone on file"
                copyable
                hrefBuilder={v => `tel:${v.replace(/[^\d+]/g, '')}`}
                onSaved={patch(phoneKey)}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Compact line shown when the header is collapsed ────────────────────────
function CollapsedContactLine({ client }: { client: ClientInfo }) {
  const name  = client.contactName;
  const email = client.contactEmail;
  const phone = client.contactPhone;

  const [copied, setCopied] = useState<'email' | 'phone' | null>(null);
  const copy = (val: string, kind: 'email' | 'phone') => (e: React.MouseEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (!val) return;
    navigator.clipboard.writeText(val).then(() => {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  if (!name && !email && !phone) {
    return <p className="text-xs text-gray-400 italic">No primary contact on file</p>;
  }

  return (
    <div className="flex items-center gap-4 text-xs text-gray-700 flex-wrap">
      {name && (
        <span className="inline-flex items-center gap-1 font-semibold text-gray-900">
          <User className="w-3 h-3 text-gray-400" />
          {name}
        </span>
      )}
      {email && (
        <span className="group inline-flex items-center gap-1.5">
          <Mail className="w-3 h-3 text-gray-400" />
          <a href={`mailto:${email}`} className="hover:text-[#015280] hover:underline" onClick={e => e.stopPropagation()}>
            {email}
          </a>
          <button
            type="button"
            onClick={copy(email, 'email')}
            title="Copy email"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity"
          >
            {copied === 'email' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
          </button>
        </span>
      )}
      {phone && (
        <span className="group inline-flex items-center gap-1.5">
          <Phone className="w-3 h-3 text-gray-400" />
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="hover:text-[#015280] hover:underline" onClick={e => e.stopPropagation()}>
            {phone}
          </a>
          <button
            type="button"
            onClick={copy(phone, 'phone')}
            title="Copy phone"
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-100 transition-opacity"
          >
            {copied === 'phone' ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-gray-400" />}
          </button>
        </span>
      )}
    </div>
  );
}

// ── Top-level header ───────────────────────────────────────────────────────
export interface ClientHeaderProps {
  client: ClientInfo;
  clientId: string;
  /** Big-name navigator slot (already rendered by parent — we expose hooks
   *  but render the children since the parent owns the dropdown). */
  nameSlot: React.ReactNode;
  /** Active/Inactive toggle from the parent (already wired to set-active). */
  activeSlot: React.ReactNode;
  /** Onboarding chip row — pipeline status pill, Summary pending, Call
   *  needed, Agent assign, Monday.com link. Renders inline in the top row
   *  next to the name; the parent passes null in CS mode to keep the
   *  hero clean. */
  chipSlot?: React.ReactNode;
  /** Patch the parent's clientInfo state when an inline edit / swap saves. */
  onClientChanged: (patch: Partial<ClientInfo>) => void;
  /** Hub-user lookup result for the primary contact's email. */
  primaryIsHubUser: boolean;
  /** Action icons (refresh / minimize / close) — rendered top-right. */
  actionsSlot: React.ReactNode;
}

export function ClientHeader({
  client, clientId, nameSlot, activeSlot, chipSlot, onClientChanged, primaryIsHubUser, actionsSlot,
}: ClientHeaderProps) {
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);
  useEffect(() => { saveCollapsed(collapsed); }, [collapsed]);

  // Warehouse + Sub Warehouse dropdown options — fetched once, shared across all
  // clients. Pulled from /api/client/column-options which reads settings_str of
  // the Warehouse Location + Sub Warehouse Location dropdowns on the Clients board.
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  const [subWarehouseOptions, setSubWarehouseOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/client/column-options')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data: Record<string, string[]>) => {
        if (cancelled) return;
        setWarehouseOptions(data['dropdown_mktxaege'] ?? []);
        setSubWarehouseOptions(data['dropdown_mm5ftdxb'] ?? []);
      })
      .catch(err => console.error('[ClientHeader] warehouse options fetch failed:', err));
    return () => { cancelled = true; };
  }, []);

  // ── Make-primary swap (relocated from client-info-tab) ──────────────────
  const [promoting, setPromoting] = useState<2 | 3 | null>(null);
  const handleMakePrimary = useCallback(async (slot: 2 | 3) => {
    setPromoting(slot);
    const isC2 = slot === 2;

    const primName  = client.contactName;
    const primEmail = client.contactEmail;
    const primPhone = client.contactPhone;
    const secName  = isC2 ? client.contact2Name  : client.contact3Name;
    const secEmail = isC2 ? client.contact2Email : client.contact3Email;
    const secPhone = isC2 ? client.contact2Phone : client.contact3Phone;

    const primCols = CONTACT_COLUMNS[1];
    const secCols  = CONTACT_COLUMNS[slot];

    const patch = (columnId: string, value: string) =>
      fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value }),
      });

    try {
      await Promise.all([
        patch(primCols.name,  secName),
        patch(primCols.email, secEmail),
        patch(primCols.phone, secPhone),
        patch(secCols.name,   primName),
        patch(secCols.email,  primEmail),
        patch(secCols.phone,  primPhone),
      ]);
      onClientChanged(
        isC2
          ? {
              contactName: secName, contactEmail: secEmail, contactPhone: secPhone,
              contact2Name: primName, contact2Email: primEmail, contact2Phone: primPhone,
            }
          : {
              contactName: secName, contactEmail: secEmail, contactPhone: secPhone,
              contact3Name: primName, contact3Email: primEmail, contact3Phone: primPhone,
            }
      );
    } catch (err) {
      console.error('[ClientHeader] make-primary swap failed:', err);
    } finally {
      setPromoting(null);
    }
  }, [client, clientId, onClientChanged]);

  const toggleCollapsed = () => setCollapsed(c => !c);

  // NOTE: keep this header a solid, non-blurred background. A backdrop-filter
  // (or transform/opacity) here creates a new stacking context that traps the
  // header's dropdowns — client search, status, warehouse, agent — beneath the
  // tab/body content that paints after it, so they'd overlap instead of layer.
  return (
    <header className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2.5 relative">
      {/* Row 1: name + Active · chips · platform · warehouse · actions */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {nameSlot}
          {activeSlot}
        </div>

        {chipSlot && (
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
            {chipSlot}
          </div>
        )}

        <div className="flex items-center gap-2 flex-shrink-0">
          <PlatformPills
            value={client.portalDropdown}
            clientId={clientId}
            onSaved={next => onClientChanged({ portalDropdown: next })}
          />
          {/* Warehouse + Sub Warehouse stacked: the sub-warehouse
              (Gardena-A/B/C) sits directly beneath the main warehouse. */}
          <div className="flex flex-col gap-1">
            <WarehousePill
              value={client.warehouseLocation}
              options={warehouseOptions}
              clientId={clientId}
              onSaved={next => onClientChanged({ warehouseLocation: next })}
            />
            <WarehousePill
              value={client.subWarehouse}
              options={subWarehouseOptions}
              clientId={clientId}
              columnId="dropdown_mm5ftdxb"
              label="SUB WAREHOUSE"
              noun="sub warehouse"
              icon={<Boxes className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />}
              onSaved={next => onClientChanged({ subWarehouse: next })}
            />
          </div>
          {actionsSlot}
        </div>
      </div>

      {/* Row 2: chevron + contact cards (expanded) or compact line (collapsed).
          The chevron lives on the contacts row's left edge so it's visually
          tied to what it controls. */}
      {collapsed ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Show contacts"
            className="p-0.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>
          <CollapsedContactLine client={client} />
        </div>
      ) : (
        <div className="mt-2 flex items-start gap-1.5">
          <button
            type="button"
            onClick={toggleCollapsed}
            title="Hide contacts"
            className="px-0.5 pt-1.5 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
          >
            <ChevronUp className="w-4 h-4 text-gray-500" />
          </button>
          <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-3 gap-2">
            {[1, 2, 3].map(slot => (
              <ContactCard
                key={slot}
                slot={slot as ContactSlot}
                client={client}
                clientId={clientId}
                hubUser={primaryIsHubUser}
                onClientChanged={onClientChanged}
                onMakePrimary={handleMakePrimary}
                promoting={promoting}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

// Re-export icons that we'd otherwise import twice in the wiring file.
export { RefreshCw, Minimize2, X };
