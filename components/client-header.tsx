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

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientInfo } from '@/lib/types';
import {
  ChevronDown, ChevronUp,
  Mail, Phone, MapPin, Copy, Check, User,
  Box, Warehouse, Pencil, Loader2, ShieldCheck,
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
function ConfirmDialog({
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
function InlineField({
  value, icon, columnId, clientId, placeholder, copyable, hrefBuilder, onSaved,
}: {
  value: string;
  icon?: React.ReactNode;
  columnId: string;
  clientId: string;
  placeholder: string;
  copyable?: boolean;
  hrefBuilder?: (v: string) => string;
  onSaved?: (newValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    } catch (err) {
      console.error('[InlineField] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [draft, value, clientId, columnId, onSaved]);

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
          className="flex-1 min-w-0 text-xs border border-[#43c7ff] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
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
            className="text-xs text-gray-700 truncate hover:text-[#015280] hover:underline flex-1 min-w-0"
            title={value}
          >
            {value}
          </a>
        ) : (
          <span className="text-xs text-gray-700 truncate flex-1 min-w-0" title={value}>{value}</span>
        )
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="text-xs text-gray-400 italic hover:text-[#015280] flex-1 min-w-0 text-left"
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
    const set = new Set(value.split(',').map(s => s.trim()).filter(Boolean));
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
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors disabled:opacity-60 ${
        on
          ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]'
          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'
      }`}
      title={on ? `${label} — click to disable` : `${label} — click to enable`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
        <Box className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider leading-none">Platform</p>
          <div className="flex items-center gap-1">
            {pill('AppDot', appDotOn, () => requestToggle('AppDot'))}
            {pill('Portal', portalOn, () => requestToggle('Portal'))}
          </div>
        </div>
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
function WarehousePill({ value, options, clientId, onSaved }: {
  value: string;
  options: string[];
  clientId: string;
  onSaved: (newValue: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [pending, setPending] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Comma-separated string ↔ array. Trims + drops blanks defensively.
  const currentList = useMemo(
    () => value.split(',').map(s => s.trim()).filter(Boolean),
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
        body: JSON.stringify({ columnId: 'dropdown_mktxaege', value: next, valueType: 'dropdown' }),
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
          className="flex items-center gap-2 bg-[#e6f8ff]/60 border border-[#43c7ff]/40 hover:bg-[#e6f8ff] disabled:hover:bg-[#e6f8ff]/60 rounded-lg px-2.5 py-1.5 max-w-[260px] transition-colors"
          title={disabled ? 'Loading warehouse options…' : currentList.length > 1 ? `Warehouses: ${currentList.join(', ')}` : 'Change warehouses'}
        >
          <Warehouse className="w-3.5 h-3.5 text-[#015280] flex-shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0 text-left">
            <p className="text-[9px] font-semibold text-[#015280] uppercase tracking-wider leading-none">
              Warehouse{currentList.length > 1 ? 's' : ''}
            </p>
            <p className="text-xs font-semibold text-gray-900 truncate">{displayLabel}</p>
          </div>
          <ChevronDown className="w-3 h-3 text-[#015280] flex-shrink-0" />
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
          title={pending.length === 0 ? 'Clear all warehouses?' : currentList.length === 0 ? 'Set warehouses?' : 'Update warehouses?'}
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
          confirmLabel="Update warehouses"
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

  return (
    <section className={`flex flex-col rounded-lg border p-2 ${
      isPrimary ? 'border-[#43c7ff] bg-[#f0fbff]/40' : 'border-gray-200 bg-white'
    } ${empty ? 'border-dashed' : ''}`}>
      <div className="flex items-center justify-between mb-1 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Contact {slot}</p>
          {isPrimary && hubUser && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-1.5 py-0.5 whitespace-nowrap">
              <ShieldCheck className="w-2.5 h-2.5" />
              Hub user
            </span>
          )}
        </div>
        {isPrimary ? (
          <span className="text-[10px] font-semibold bg-[#015280] text-white px-2 py-0.5 rounded-full inline-flex items-center gap-0.5 flex-shrink-0">
            Primary
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onMakePrimary(slot as 2 | 3)}
            disabled={empty || promoting !== null}
            className="text-[10px] font-semibold border border-gray-300 hover:border-[#43c7ff] hover:text-[#015280] text-gray-500 px-2 py-0.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1 flex-shrink-0"
            title={empty ? 'Add contact info first' : 'Swap with the current primary contact'}
          >
            {promoting === slot ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ChevronUp className="w-2.5 h-2.5" />}
            Make primary
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <div className="space-y-0.5 min-w-0">
          <InlineField
            icon={<User className="w-3 h-3" />}
            value={data.name}
            columnId={cols.name}
            clientId={clientId}
            placeholder={empty ? 'Add name' : 'No name on file'}
            onSaved={patch(nameKey)}
          />
          <InlineField
            icon={<Mail className="w-3 h-3" />}
            value={data.email}
            columnId={cols.email}
            clientId={clientId}
            placeholder={empty ? 'Add email' : 'No email on file'}
            copyable
            hrefBuilder={v => `mailto:${v}`}
            onSaved={patch(emailKey)}
          />
        </div>
        <div className="space-y-0.5 min-w-0">
          <InlineField
            icon={<Phone className="w-3 h-3" />}
            value={data.phone}
            columnId={cols.phone}
            clientId={clientId}
            placeholder={empty ? 'Add phone' : 'No phone on file'}
            copyable
            hrefBuilder={v => `tel:${v.replace(/[^\d+]/g, '')}`}
            onSaved={patch(phoneKey)}
          />
          {isPrimary && (
            <InlineField
              icon={<MapPin className="w-3 h-3" />}
              value={data.location ?? ''}
              columnId="text_mktx8q74"
              clientId={clientId}
              placeholder="Add location"
              onSaved={patch('contactLocation')}
            />
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

  // Warehouse dropdown options — fetched once, shared across all clients.
  // Pulled from /api/client/column-options which reads settings_str of the
  // Warehouse Location dropdown on the Clients board.
  const [warehouseOptions, setWarehouseOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/client/column-options')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data: Record<string, string[]>) => {
        if (!cancelled) setWarehouseOptions(data['dropdown_mktxaege'] ?? []);
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

  return (
    <header className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2 relative">
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
          <WarehousePill
            value={client.warehouseLocation}
            options={warehouseOptions}
            clientId={clientId}
            onSaved={next => onClientChanged({ warehouseLocation: next })}
          />
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
