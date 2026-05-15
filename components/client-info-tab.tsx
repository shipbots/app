'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { ClientInfo, MonFile } from '@/lib/types';
import {
  Mail, Phone, MapPin, ExternalLink, Check, Pencil,
  ChevronDown, ChevronRight, Upload, FileText, Sparkles, Calendar, Plus,
  UserCheck, UserPlus, X, Loader2, ShieldCheck, Users, Copy, KeyRound, LogIn,
  ArrowUpDown,
} from 'lucide-react';

interface ClientInfoTabProps {
  client: ClientInfo;
  fullscreen?: boolean;
  onboardingItemId?: string;
  /** deliveredDate from the Onboarding board (date__1 column) */
  deliveredDate?: string | null;
  /** inventoryDelivered status from the Onboarding board (status_2 column) */
  inventoryDelivered?: string;
  /** Called after a successful rename so the parent can update its header */
  onNameChange?: (newName: string) => void;
  /** Called after the delivery date (date__1) saves — kanban "delivered"
   *  badge sync only; the calendar uses the estimated date below. */
  onDeliveredDateSaved?: (newValue: string) => void;
  /** Called after the Initial Inventory Est. Delivery Date (date_mktrzhyk
   *  on the Clients board) saves — drives the calendar "Expected Delivery"
   *  event in real time. */
  onEstimatedDeliveryDateSaved?: (newValue: string) => void;
}

// ─── Copyable + Editable field (for portal login credentials) ────────────────
function CopyableEditField({
  label,
  value: initialValue,
  columnId,
  clientId,
  icon,
  secret = false,
}: {
  label: string;
  value: string;
  columnId: string;
  clientId: string;
  icon?: React.ReactNode;
  /** If true, show value masked by default with reveal toggle */
  secret?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | 'copied' | null>(null);
  const [revealed, setRevealed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state when the client changes (navigating between clients)
  useEffect(() => {
    setValue(initialValue);
    setSavedValue(initialValue);
  }, [initialValue]);

  const save = useCallback(async () => {
    setEditing(false);
    if (value === savedValue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value }),
      });
      if (!res.ok) throw new Error();
      setSavedValue(value);
      setFlash('saved');
    } catch {
      setValue(savedValue);
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  }, [value, savedValue, columnId, clientId]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setFlash('copied');
    setTimeout(() => setFlash(null), 2000);
  };

  const displayValue = secret && !revealed ? '••••••••••' : value;

  if (editing) {
    return (
      <div className="flex items-center gap-2 px-2 py-2">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-1">{label}</p>
          <input
            ref={inputRef}
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={save}
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setValue(savedValue); setEditing(false); }
            }}
            className="w-full text-sm border border-[#43c7ff] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white font-mono"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors">
      {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
        <p className={`text-sm text-gray-900 font-mono ${!value ? 'text-gray-300 italic' : ''}`}>
          {value ? displayValue : 'Not set'}
        </p>
      </div>
      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
        {flash === 'saved'  && <span className="text-[10px] text-green-600 font-medium">Saved</span>}
        {flash === 'error'  && <span className="text-[10px] text-red-500 font-medium">Error</span>}
        {flash === 'copied' && <span className="text-[10px] text-[#015280] font-medium">Copied!</span>}
        {!saving && !flash && (
          <>
            {secret && value && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setRevealed(r => !r); }}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                title={revealed ? 'Hide' : 'Reveal'}
              >
                <span className="text-[10px] font-medium">{revealed ? 'Hide' : 'Show'}</span>
              </button>
            )}
            {value && (
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-[#43c7ff] transition-colors"
                title="Copy to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Collapsible Section ────────────────────────────────────────────────────
function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = !!children;
  return (
    <div className="border border-gray-100 rounded-lg overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && hasContent && (
        <div className="px-3 py-2 space-y-0.5">{children}</div>
      )}
    </div>
  );
}

// ─── Highlight styles ────────────────────────────────────────────────────────
const HL = 'bg-amber-50 border-l-2 border-amber-400 rounded-r';

// ─── Read-only field ────────────────────────────────────────────────────────
function ReadField({ label, value, icon, highlight }: { label: string; value: string; icon?: React.ReactNode; highlight?: boolean }) {
  if (!value) return null;
  return (
    <div className={`flex items-start gap-2 px-1 py-1.5 ${highlight ? HL : ''}`}>
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className={`text-[11px] leading-none mb-0.5 ${highlight ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  );
}

// ─── Select field (status / dropdown columns with pre-defined options) ───────
function SelectField({
  label,
  value: initialValue,
  columnId,
  clientId,
  options,
  icon,
  valueType = 'status',
  highlight,
  patchUrl,
}: {
  label: string;
  value: string;
  columnId: string;
  clientId: string;
  options: string[];
  icon?: React.ReactNode;
  valueType?: 'status' | 'dropdown';
  highlight?: boolean;
  /** Override the PATCH endpoint (defaults to /api/client/{clientId}) */
  patchUrl?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local state when the prop changes (e.g. navigating to a different client)
  useEffect(() => { setValue(initialValue); }, [initialValue]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const select = async (newValue: string) => {
    setOpen(false);
    if (newValue === value) return;
    setSaving(true);
    try {
      const url = patchUrl ?? `/api/client/${clientId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: newValue, valueType }),
      });
      if (!res.ok) throw new Error();
      setValue(newValue);
      setFlash('saved');
    } catch {
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  };

  // Only show amber highlight when the field is empty
  const isHighlighted = !!(highlight && !value);

  // Compact dropdown (always used — just changes how the empty vs filled state looks)
  return (
    <div
      ref={containerRef}
      className={`flex items-center gap-2 group cursor-pointer hover:bg-[#e6f8ff] rounded px-1 py-1 transition-colors relative ${isHighlighted ? HL : ''}`}
      onClick={() => !saving && setOpen(o => !o)}
    >
      {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        {value ? (
          <>
            <p className="text-[11px] leading-none mb-0.5 text-gray-400">{label}</p>
            <p className="text-sm text-gray-900">{value}</p>
          </>
        ) : (
          <p className={`text-[11px] leading-none ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
        )}
        {open && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-52 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 italic">Loading options…</p>
            ) : (
              options.map(opt => (
                <button key={opt} type="button" onClick={() => select(opt)}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors ${value === opt ? 'font-semibold text-[#015280]' : 'text-gray-700'}`}
                >
                  {opt}
                </button>
              ))
            )}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button type="button" onClick={() => select('')}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-50"
              >
                — Clear
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
        {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500" />}
        {flash === 'error' && <span className="text-xs text-red-500">!</span>}
        {!saving && !flash && (value ? <ChevronDown className="w-3.5 h-3.5 text-gray-300" /> : <Plus className="w-3 h-3 text-gray-300 group-hover:text-[#43c7ff]" />)}
      </div>
    </div>
  );
}

// ─── Date field (native calendar picker) ─────────────────────────────────────
function DateField({
  label,
  value: initialValue,
  columnId,
  clientId,
  icon,
  highlight,
  patchUrl,
  onSaved,
}: {
  label: string;
  value: string;
  columnId: string;
  clientId: string;
  icon?: React.ReactNode;
  highlight?: boolean;
  /** Override the PATCH endpoint (defaults to /api/client/{clientId}) */
  patchUrl?: string;
  /** Called with the new value after a successful save (for parent sync) */
  onSaved?: (newValue: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);

  // Sync state when the client changes (navigating between clients)
  useEffect(() => { setValue(initialValue); setSavedValue(initialValue); }, [initialValue]);

  const save = useCallback(async (newValue: string) => {
    // Compare against the last *persisted* value, not the local input value.
    // The input's onChange updates `value` synchronously, so comparing to
    // `value` here would always short-circuit and skip the save.
    if (newValue === savedValue) return;
    setSaving(true);
    try {
      const url = patchUrl ?? `/api/client/${clientId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: newValue, valueType: 'date' }),
      });
      if (!res.ok) throw new Error();
      setValue(newValue);
      setSavedValue(newValue);
      onSaved?.(newValue);
      setFlash('saved');
    } catch {
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  }, [savedValue, columnId, clientId, patchUrl, onSaved]);

  const [expanded, setExpanded] = useState(!!initialValue);
  const inputRef2 = useRef<HTMLInputElement>(null);

  // Only highlight when empty
  const isHighlighted = !!(highlight && !value);

  if (!expanded) {
    return (
      <div
        className={`flex items-center gap-2 px-1 py-1 group cursor-pointer hover:bg-[#e6f8ff] rounded transition-colors ${isHighlighted ? HL : ''}`}
        onClick={() => { setExpanded(true); setTimeout(() => inputRef2.current?.showPicker?.(), 50); }}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className={`text-[11px] flex-1 leading-none ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
        <Plus className="w-3 h-3 text-gray-300 group-hover:text-[#43c7ff] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-1 py-1.5 ${isHighlighted ? HL : ''}`}>
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] leading-none mb-1 ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef2}
            type="date"
            value={value || ''}
            onChange={e => setValue(e.target.value)}
            onBlur={e => save(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#43c7ff] focus:border-[#43c7ff] text-gray-900 cursor-pointer hover:border-[#43c7ff] transition-colors"
          />
          {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
          {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500" />}
          {flash === 'error' && <span className="text-xs text-red-500">!</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Editable field ─────────────────────────────────────────────────────────
function EditField({
  label,
  value: initialValue,
  columnId,
  clientId,
  multiline = false,
  icon,
  placeholder,
  highlight,
  copyable = false,
}: {
  label: string;
  value: string;
  columnId: string;
  clientId: string;
  multiline?: boolean;
  icon?: React.ReactNode;
  placeholder?: string;
  highlight?: boolean;
  /** Show a copy-to-clipboard button on hover when the field has a value */
  copyable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);
  const [copied, setCopied] = useState(false);

  // Sync state when the client changes (navigating between clients)
  useEffect(() => {
    setValue(initialValue);
    setSavedValue(initialValue);
    setEditing(false);
  }, [initialValue]);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't trigger edit mode
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const save = useCallback(async () => {
    setEditing(false);
    if (value === savedValue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value }),
      });
      if (!res.ok) throw new Error();
      setSavedValue(value);
      setFlash('saved');
    } catch {
      setValue(savedValue);
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  }, [value, savedValue, columnId, clientId]);

  // Only show amber highlight when the field is empty
  const isHighlighted = !!(highlight && !value);

  if (editing) {
    const baseClass = 'w-full text-sm border border-[#43c7ff] rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white';
    return (
      <div className={`flex items-start gap-2 px-1 py-1.5 ${isHighlighted ? HL : ''}`}>
        {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] leading-none mb-0.5 ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={save}
              autoFocus
              rows={3}
              className={baseClass + ' resize-y'}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              value={value}
              onChange={e => setValue(e.target.value)}
              onBlur={save}
              autoFocus
              placeholder={placeholder}
              className={baseClass}
              onKeyDown={e => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setValue(savedValue); setEditing(false); }
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Compact empty state: just label + + icon ──
  if (!value) {
    return (
      <div
        className={`flex items-center gap-2 group cursor-pointer hover:bg-[#e6f8ff] rounded px-1 py-1 transition-colors ${isHighlighted ? HL : ''}`}
        onClick={() => !saving && setEditing(true)}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className={`text-[11px] flex-1 leading-none ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}</p>
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
          {flash === 'saved' && <Check className="w-3 h-3 text-green-500" />}
          {flash === 'error' && <span className="text-xs text-red-500">!</span>}
          {!saving && !flash && <Plus className="w-3 h-3 text-gray-300 group-hover:text-[#43c7ff]" />}
        </div>
      </div>
    );
  }

  // ── Normal filled state ──
  return (
    <div
      className="flex items-start gap-2 group cursor-pointer hover:bg-[#e6f8ff] rounded px-1 py-1.5 transition-colors"
      onClick={() => !saving && setEditing(true)}
    >
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] leading-none mb-0.5 text-gray-400">{label}</p>
        {/<[a-z][\s\S]*>/i.test(value) ? (
          <div
            className="text-sm text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 [&_li]:mb-0.5 [&_strong]:font-semibold [&_p]:mb-1"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        ) : (
          <p className="text-sm whitespace-pre-wrap break-words text-gray-900">{value}</p>
        )}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
        {copyable && value && (
          <button
            type="button"
            onClick={handleCopy}
            title={`Copy ${label}`}
            className="p-0.5 rounded hover:bg-[#d0f2ff] text-gray-300 hover:text-[#43c7ff] transition-colors"
          >
            {copied
              ? <Check className="w-3.5 h-3.5 text-green-500" />
              : <Copy className="w-3.5 h-3.5" />
            }
          </button>
        )}
        {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
        {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500" />}
        {flash === 'error' && <span className="text-xs text-red-500">!</span>}
        {!saving && !flash && <Pencil className="w-3.5 h-3.5 text-gray-300" />}
      </div>
    </div>
  );
}

// ─── Hub User confirmation modal ─────────────────────────────────────────────
function AddHubUserModal({
  initialName,
  initialEmail,
  initialPhone,
  clientBoardItemId,
  onClose,
  onAdded,
}: {
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  clientBoardItemId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [role, setRole] = useState<'Member' | 'Admin'>('Member');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/hub-users/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, role, clientBoardItemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Add to Hub Users</h3>
              <p className="text-[11px] text-gray-400">Confirm details before adding</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Full Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400"
              placeholder="Contact name"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Hub Login Email</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              type="email"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400"
              placeholder="email@example.com"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Phone Number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              type="tel"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400"
              placeholder="(optional)"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Role</label>
            <div className="flex gap-2">
              {(['Member', 'Admin'] as const).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    role === r
                      ? r === 'Admin'
                        ? 'bg-green-50 border-green-400 text-green-700'
                        : 'bg-teal-50 border-teal-400 text-teal-700'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {r === 'Admin' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">⚠ {error}</p>}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={saving || (!name && !email)}
            className="flex-1 py-2 text-sm font-medium bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Adding…</> : <>Add to Hub Users</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Hub User status badge / button for a contact ────────────────────────────
function HubUserStatus({
  name,
  email,
  phone,
  clientBoardItemId,
}: {
  name: string;
  email: string;
  phone: string;
  clientBoardItemId: string;
}) {
  const [status, setStatus] = useState<'loading' | 'exists' | 'missing' | 'none'>('none');
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!email) { setStatus('none'); return; }
    setStatus('loading');
    fetch(`/api/hub-users/check?email=${encodeURIComponent(email.trim().toLowerCase())}`)
      .then(r => r.json())
      .then(data => setStatus(data.exists ? 'exists' : 'missing'))
      .catch(() => setStatus('none'));
  }, [email]);

  if (status === 'none') return null;

  return (
    <>
      {status === 'loading' && (
        <span className="flex items-center gap-1 text-[10px] text-gray-400 px-1 py-0.5">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking Hub…
        </span>
      )}
      {status === 'exists' && (
        <span className="flex items-center gap-1 text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full">
          <UserCheck className="w-3 h-3" />
          Hub User
        </span>
      )}
      {status === 'missing' && (
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1 text-[10px] font-medium text-[#015280] bg-[#e6f8ff] border border-[#43c7ff]/40 hover:bg-[#d0f2ff] px-1.5 py-0.5 rounded-full transition-colors"
        >
          <UserPlus className="w-3 h-3" />
          Add to Hub Users
        </button>
      )}
      {showModal && (
        <AddHubUserModal
          initialName={name}
          initialEmail={email}
          initialPhone={phone}
          clientBoardItemId={clientBoardItemId}
          onClose={() => setShowModal(false)}
          onAdded={() => { setShowModal(false); setStatus('exists'); }}
        />
      )}
    </>
  );
}

// ─── Sub-section for contacts ────────────────────────────────────────────────
function ContactBlock({
  label,
  name,
  email,
  phone,
  shipHeroAccess,
  nameCol,
  emailCol,
  phoneCol,
  shipHeroCol,
  clientId,
  clientBoardItemId = '',
  collapsible = false,
  highlightName,
  highlightEmail,
  highlightPhone,
  onMakePrimary,
  swapping = false,
}: {
  label: string;
  name: string; email: string; phone: string; shipHeroAccess: string;
  nameCol: string; emailCol: string; phoneCol: string; shipHeroCol: string;
  clientId: string;
  clientBoardItemId?: string;
  collapsible?: boolean;
  highlightName?: boolean;
  highlightEmail?: boolean;
  highlightPhone?: boolean;
  /** When provided, shows a "Make Primary" swap button (Contact 2/3 only) */
  onMakePrimary?: () => void;
  swapping?: boolean;
}) {
  const isEmpty = !name && !email && !phone;
  const [open, setOpen] = useState(!isEmpty);

  if (collapsible && isEmpty) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {label} <span className="text-gray-300">(empty)</span>
        </button>
        {open && (
          <div className="pl-3 border-l border-gray-100 ml-1 space-y-0.5">
            <EditField label="Name"  value={name}  columnId={nameCol}  clientId={clientId} highlight={highlightName}  copyable />
            <EditField label="Email" value={email} columnId={emailCol} clientId={clientId} icon={<Mail className="w-3.5 h-3.5" />} highlight={highlightEmail} copyable />
            <EditField label="Phone" value={phone} columnId={phoneCol} clientId={clientId} icon={<Phone className="w-3.5 h-3.5" />} highlight={highlightPhone} copyable />
            {shipHeroCol && <EditField label="ShipHero Access?" value={shipHeroAccess} columnId={shipHeroCol} clientId={clientId} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {collapsible && (
        <div className="flex items-center gap-2 py-1">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {label}
          </button>
          {/* Hub user badge / add button — always visible next to the label */}
          {clientBoardItemId && (email || name) && (
            <HubUserStatus name={name} email={email} phone={phone} clientBoardItemId={clientBoardItemId} />
          )}
          {/* Make Primary Contact button */}
          {onMakePrimary && (email || name) && (
            <button
              type="button"
              onClick={onMakePrimary}
              disabled={swapping}
              title="Swap this contact with the Primary Contact"
              className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-[#43c7ff]/50 bg-[#e6f8ff] text-[#015280] hover:bg-[#d0f2ff] hover:border-[#43c7ff] transition-colors disabled:opacity-50 disabled:cursor-wait whitespace-nowrap"
            >
              {swapping
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <ArrowUpDown className="w-3 h-3" />}
              Make Primary
            </button>
          )}
        </div>
      )}
      {(!collapsible || open) && (
        <div className={`space-y-0.5 ${collapsible ? 'pl-3 border-l border-gray-100 ml-1' : ''}`}>
          {!collapsible && (
            <div className="flex items-center gap-2 pt-1 pb-0.5 flex-wrap">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
              {clientBoardItemId && (
                <HubUserStatus name={name} email={email} phone={phone} clientBoardItemId={clientBoardItemId} />
              )}
            </div>
          )}
          <EditField label="Name"  value={name}  columnId={nameCol}  clientId={clientId} highlight={highlightName}  copyable />
          <EditField label="Email" value={email} columnId={emailCol} clientId={clientId} icon={<Mail className="w-3.5 h-3.5" />} highlight={highlightEmail} copyable />
          <EditField label="Phone" value={phone} columnId={phoneCol} clientId={clientId} icon={<Phone className="w-3.5 h-3.5" />} highlight={highlightPhone} copyable />
          {shipHeroCol && <EditField label="ShipHero Access?" value={shipHeroAccess} columnId={shipHeroCol} clientId={clientId} />}
        </div>
      )}
    </div>
  );
}

// ─── File upload / download field ────────────────────────────────────────────
function FileField({
  label,
  file: initialFile,
  columnId,
  clientId,
  onUploaded,
}: {
  label: string;
  file: MonFile | null;
  columnId: string;
  clientId: string;
  /** Called with the new MonFile after a successful upload */
  onUploaded?: (file: MonFile) => void;
}) {
  const [file, setFile] = useState<MonFile | null>(initialFile);
  const [uploading, setUploading] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', f);
      form.append('columnId', columnId);
      const res = await fetch(`/api/client/${clientId}/file`, { method: 'POST', body: form });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const newFile: MonFile = { assetId: data.assetId, name: data.name || f.name, url: data.url, fileExtension: f.name.split('.').pop() || '' };
      setFile(newFile);
      setFlash('saved');
      onUploaded?.(newFile);
    } catch {
      setFlash('error');
    } finally {
      setUploading(false);
      setTimeout(() => setFlash(null), 2500);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [columnId, clientId, onUploaded]);

  return (
    <div className="flex items-start gap-2 px-1 py-1.5">
      <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 leading-none mb-1">{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {file ? (
            <a
              href={`/api/assets/${file.assetId}`}
              target="_blank"
              rel="noopener noreferrer"
              title={file.name}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#43c7ff]/40 bg-[#e6f8ff] text-[#015280] hover:bg-[#d0f2ff] hover:border-[#43c7ff] transition-colors group"
            >
              <FileText className="w-4 h-4 flex-shrink-0" />
              <span className="text-xs font-medium max-w-[140px] truncate">{file.name}</span>
            </a>
          ) : (
            <span className="text-sm text-gray-300 italic">No document</span>
          )}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#015280] border border-gray-200 hover:border-[#43c7ff] rounded px-1.5 py-0.5 transition-colors"
          >
            <Upload className="w-3 h-3" />
            {file ? 'Replace' : 'Upload'}
          </button>
          {uploading && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />}
          {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500" />}
          {flash === 'error' && <span className="text-xs text-red-500">Upload failed</span>}
        </div>
        <input ref={inputRef} type="file" className="hidden" onChange={handleUpload} />
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export function ClientInfoTab({ client, fullscreen, onboardingItemId, deliveredDate, inventoryDelivered, onNameChange, onDeliveredDateSaved, onEstimatedDeliveryDateSaved }: ClientInfoTabProps) {
  const id = client.id;

  // Column options fetched once from Monday.com (status/dropdown labels)
  const [colOptions, setColOptions] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch('/api/client/column-options')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: Record<string, string[]>) => setColOptions(data))
      .catch(err => console.error('[client-info] column-options failed:', err));
  }, []);

  // Onboarding board column options (e.g. status_2 = Initial Inventory Delivered?)
  const [onboardingColOptions, setOnboardingColOptions] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch('/api/onboarding/column-options')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: Record<string, string[]>) => setOnboardingColOptions(data))
      .catch(err => console.error('[client-info] onboarding/column-options failed:', err));
  }, []);

  // Local client state so extracted values can refresh EditField components
  const [localClient, setLocalClient] = useState<ClientInfo>(client);
  // Version key — incrementing forces billing/legal section fields to remount with fresh values
  const [billingVersion, setBillingVersion] = useState(0);

  // Reset local state when the selected client changes
  useEffect(() => {
    setLocalClient(client);
    setBillingVersion(0);
  }, [client.id]);

  // ── Inline name / rename ────────────────────────────────────────────────────
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFlash, setNameFlash] = useState<'saved' | 'error' | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const startNameEdit = () => {
    setNameDraft(localClient.name);
    setNameEditing(true);
    setTimeout(() => nameInputRef.current?.select(), 30);
  };

  const saveNameEdit = useCallback(async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === localClient.name) {
      setNameEditing(false);
      return;
    }
    setNameSaving(true);
    try {
      const res = await fetch(`/api/client/${id}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed, onboardingItemId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Rename failed');
      }
      setLocalClient(prev => ({ ...prev, name: trimmed }));
      onNameChange?.(trimmed);
      setNameEditing(false);
      setNameFlash('saved');
      setTimeout(() => setNameFlash(null), 3000);
    } catch (err) {
      console.error('[rename]', err);
      setNameFlash('error');
      setTimeout(() => setNameFlash(null), 4000);
    } finally {
      setNameSaving(false);
    }
  }, [id, nameDraft, localClient.name, onboardingItemId, onNameChange]);

  // Reset name editing state when client changes
  useEffect(() => {
    setNameEditing(false);
    setNameDraft('');
    setNameFlash(null);
  }, [client.id]);

  // Track which secondary contact is currently being swapped (2, 3, or null)
  const [swappingContact, setSwappingContact] = useState<2 | 3 | null>(null);

  const handleMakePrimary = useCallback(async (contactNum: 2 | 3) => {
    setSwappingContact(contactNum);
    const isC2 = contactNum === 2;

    // Current primary values
    const primName  = localClient.contactName;
    const primEmail = localClient.contactEmail;
    const primPhone = localClient.contactPhone;

    // Current secondary values
    const secName  = isC2 ? localClient.contact2Name  : localClient.contact3Name;
    const secEmail = isC2 ? localClient.contact2Email : localClient.contact3Email;
    const secPhone = isC2 ? localClient.contact2Phone : localClient.contact3Phone;

    // Column IDs
    const primNameCol  = 'text_mktqq7h6';
    const primEmailCol = 'text_mktq6sr5';
    const primPhoneCol = 'text_mktqabcm';
    const secNameCol   = isC2 ? 'text_mktr1evd' : 'text_mktr4v7q';
    const secEmailCol  = isC2 ? 'text_mktr2xmm' : 'text_mktrt74r';
    const secPhoneCol  = isC2 ? 'text_mktr8kve' : 'text_mktrw0tb';

    const patch = (columnId: string, value: string) =>
      fetch(`/api/client/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value }),
      });

    try {
      // Write all six fields in parallel
      await Promise.all([
        patch(primNameCol,  secName),    // secondary → primary
        patch(primEmailCol, secEmail),
        patch(primPhoneCol, secPhone),
        patch(secNameCol,   primName),   // primary → secondary
        patch(secEmailCol,  primEmail),
        patch(secPhoneCol,  primPhone),
      ]);

      // Reflect the swap in local state immediately
      setLocalClient(prev => ({
        ...prev,
        contactName:  secName,
        contactEmail: secEmail,
        contactPhone: secPhone,
        ...(isC2
          ? { contact2Name: primName, contact2Email: primEmail, contact2Phone: primPhone }
          : { contact3Name: primName, contact3Email: primEmail, contact3Phone: primPhone }
        ),
      }));
    } catch (err) {
      console.error('[makePrimary] swap failed:', err);
    } finally {
      setSwappingContact(null);
    }
  }, [id, localClient]);

  // Extract-billing-info state
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractSuccess, setExtractSuccess] = useState(false);

  const handleExtractBilling = useCallback(async (assetIdOverride?: string) => {
    const assetId = assetIdOverride ?? localClient.docusignFile?.assetId;
    if (!assetId) return;
    setExtracting(true);
    setExtractError(null);
    setExtractSuccess(false);

    try {
      // ── Step 1: extract from PDF ──
      const extractRes = await fetch(`/api/client/${id}/extract-docusign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const extracted = await extractRes.json();
      if (!extractRes.ok) throw new Error(extracted.error || 'Extraction failed');

      // ── Step 2: write each field back to Monday.com ──
      const fieldMap: Array<{ columnId: string; value: string; isDate?: boolean }> = [
        { columnId: 'text_mktp4fvk', value: extracted.legalEntity || '' },
        { columnId: 'text_mkxxfg1b', value: extracted.ein || '' },
        { columnId: 'text_mkx5vzht', value: extracted.billingStreet1 || '' },
        { columnId: 'text_mkx5f9p9', value: extracted.billingStreet2 || '' },
        { columnId: 'text_mkx5z70k', value: extracted.billingCity || '' },
        { columnId: 'text_mkx5er1a', value: extracted.billingState || '' },
        { columnId: 'text_mkx5tjd7', value: extracted.billingZip || '' },
        { columnId: 'text_mkx5kyv4', value: extracted.billingCountry || '' },
        { columnId: 'date_mkw2fhte', value: extracted.dateDocusignSigned || '', isDate: true },
      ];

      const patchResults = await Promise.all(
        fieldMap
          .filter(f => f.value) // skip empty values
          .map(f =>
            fetch(`/api/client/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ columnId: f.columnId, value: f.value, isDate: f.isDate }),
            })
          )
      );
      const failedPatches = patchResults.filter(r => !r.ok);
      if (failedPatches.length > 0) {
        console.warn(`[extractBilling] ${failedPatches.length} field(s) failed to save to Monday.com`);
      }

      // ── Step 3: update local state so fields re-render ──
      setLocalClient(prev => ({
        ...prev,
        legalEntity: extracted.legalEntity || prev.legalEntity,
        ein: extracted.ein || prev.ein,
        billingStreet1: extracted.billingStreet1 || prev.billingStreet1,
        billingStreet2: extracted.billingStreet2 ?? prev.billingStreet2,
        billingCity: extracted.billingCity || prev.billingCity,
        billingState: extracted.billingState || prev.billingState,
        billingZip: extracted.billingZip || prev.billingZip,
        billingCountry: extracted.billingCountry || prev.billingCountry,
        dateDocusignSigned: extracted.dateDocusignSigned || prev.dateDocusignSigned,
      }));
      setBillingVersion(v => v + 1); // force EditField remounts with fresh values
      setExtractSuccess(true);
      setTimeout(() => setExtractSuccess(false), 4000);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Unknown error');
      setTimeout(() => setExtractError(null), 6000);
    } finally {
      setExtracting(false);
    }
  }, [id, localClient.docusignFile]);

  return (
    <div className="p-4 overflow-y-auto h-full">

      {/* ── Client Name (editable — renames both boards) ── */}
      <div className="mb-3 px-1">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">🏷️ Client / Company Name</p>
        {nameEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveNameEdit();
                if (e.key === 'Escape') setNameEditing(false);
              }}
              onBlur={saveNameEdit}
              className="flex-1 text-sm font-semibold border border-[#43c7ff] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
              autoFocus
            />
            {nameSaving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin flex-shrink-0" />}
          </div>
        ) : (
          <div className="flex items-center gap-2 group">
            <span className="text-sm font-semibold text-gray-800">{localClient.name}</span>
            <button
              type="button"
              onClick={startNameEdit}
              title="Rename client (updates both boards)"
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
            >
              <Pencil className="w-3 h-3 text-gray-400" />
            </button>
            {nameFlash === 'saved' && <span className="flex items-center gap-1 text-xs text-green-600"><Check className="w-3 h-3" /> Renamed</span>}
            {nameFlash === 'error' && <span className="text-xs text-red-500">Rename failed</span>}
          </div>
        )}
      </div>

      {/* ── General Account Info ── */}
      <Section title="General Account Info">
        <div className={fullscreen ? 'grid grid-cols-2 gap-x-4 items-start' : ''}>

          {/* ── Primary column (always visible) ── */}
          <div>
            <EditField label="🚢 ShipHero Name" value={localClient.shipHeroName} columnId="text_mkw9n26z" clientId={id} highlight />
            <EditField label="🆔 ShipHero Customer Account ID" value={localClient.shipHeroId} columnId="text_mktmf2yw" clientId={id} highlight />
            <SelectField label="⭐ AppDot / Portal" value={localClient.portalDropdown} columnId="dropdown_mktrbeyg" clientId={id} options={colOptions['dropdown_mktrbeyg'] ?? []} valueType="dropdown" highlight />
            <SelectField label="⭐ Product Category" value={localClient.productCategory} columnId="color_mktq81r3" clientId={id} options={colOptions['color_mktq81r3'] ?? []} valueType="status" />
            <EditField label="📦 Product Description" value={localClient.productDescription} columnId="long_text_mktqtxm" clientId={id} multiline />
            <SelectField label="🏭 Warehouse Location" value={localClient.warehouseLocation} columnId="dropdown_mktxaege" clientId={id} options={colOptions['dropdown_mktxaege'] ?? []} valueType="dropdown" icon={<MapPin className="w-3.5 h-3.5" />} highlight />
            <EditField label="🏗️ Where They Manufacture" value={localClient.manufacturingLocation} columnId="text_mktxyg5p" clientId={id} />
            <SelectField label="🟢 Client Status" value={localClient.clientStatus} columnId="color_mkvq7kn6" clientId={id} options={colOptions['color_mkvq7kn6'] ?? []} valueType="status" />
            <ReadField label="⏱️ Time as Client (Days)" value={localClient.timeAsClientDays} />
            <EditField label="🌟 Interest in Additional Services" value={localClient.interestInAdditionalServices} columnId="text_mkw2y8q9" clientId={id} />
            <SelectField label="🏢 Umbrella Company" value={localClient.umbrellaCompany} columnId="dropdown_mkyk2va7" clientId={id} options={colOptions['dropdown_mkyk2va7'] ?? []} valueType="dropdown" />
            {localClient.pricingProposal && (
              <div className="flex items-start gap-2 px-1 py-1.5">
                <ExternalLink className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-400 leading-none mb-0.5">🔗 Pricing Proposal</p>
                  <a href={localClient.pricingProposal.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-[#015280] hover:underline">
                    {localClient.pricingProposal.text}
                  </a>
                </div>
              </div>
            )}
          </div>

          {/* ── Secondary column (fullscreen: right column; non-fullscreen: below) ── */}
          {/* key=billingVersion forces remount of EditFields after extraction populates values */}
          <div className={fullscreen ? '' : 'mt-1'} key={billingVersion}>
            <EditField label="📋 Name of Legal Entity" value={localClient.legalEntity} columnId="text_mktp4fvk" clientId={id} highlight />
            <EditField label="💼 Quickbooks Company Name" value={localClient.quickbooksName} columnId="text_mkx5b9b4" clientId={id} />
            <EditField label="📧 Email for Invoices" value={localClient.invoicingEmail} columnId="text_mktqjmmm" clientId={id} icon={<Mail className="w-3.5 h-3.5" />} highlight />
            <EditField label="🔧 Pick & Pack" value={localClient.pickAndPack} columnId="text_mm1zw2vf" clientId={id} />
            <EditField label="📍 Where Business HQ Is" value={localClient.businessHQ} columnId="text_mktx63am" clientId={id} icon={<MapPin className="w-3.5 h-3.5" />} />
            <div className="mt-1 mb-0.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 py-0.5">🏠 Billing Address</p>
              <EditField label="Street 1" value={localClient.billingStreet1} columnId="text_mkx5vzht" clientId={id} highlight />
              <EditField label="Street 2" value={localClient.billingStreet2} columnId="text_mkx5f9p9" clientId={id} />
              <EditField label="City" value={localClient.billingCity} columnId="text_mkx5z70k" clientId={id} highlight />
              <EditField label="State" value={localClient.billingState} columnId="text_mkx5er1a" clientId={id} highlight />
              <EditField label="Zip Code" value={localClient.billingZip} columnId="text_mkx5tjd7" clientId={id} highlight />
              <EditField label="Country" value={localClient.billingCountry} columnId="text_mkx5kyv4" clientId={id} highlight />
              <SelectField label="Name Updated?" value={localClient.billingNameUpdated} columnId="color_mkx5yjnk" clientId={id} options={colOptions['color_mkx5yjnk'] ?? []} valueType="status" />
            </div>
            <EditField label="🔢 EIN" value={localClient.ein} columnId="text_mkxxfg1b" clientId={id} highlight />

            {/* DocuSign file + extract button */}
            <FileField
              label="📄 Docusign / Contract"
              file={localClient.docusignFile}
              columnId="files"
              clientId={onboardingItemId || id}
              onUploaded={newFile => {
                setLocalClient(prev => ({ ...prev, docusignFile: newFile }));
                // Auto-run billing extraction with the new file's assetId
                handleExtractBilling(newFile.assetId);
              }}
            />

            {/* Date DocuSign Signed */}
            <DateField
              label="📅 Date DocuSign Signed"
              value={localClient.dateDocusignSigned}
              columnId="date_mkw2fhte"
              clientId={id}
              icon={<Calendar className="w-3.5 h-3.5" />}
            />

            {/* Copy Billing Info button — only shown when a DocuSign file exists */}
            {localClient.docusignFile && (
              <div className="flex items-center gap-2 px-1 py-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExtractBilling()}
                  disabled={extracting}
                  className="flex items-center gap-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 hover:border-purple-400 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {extracting ? (
                    <>
                      <div className="w-3 h-3 rounded-full border-2 border-purple-500 border-t-transparent animate-spin flex-shrink-0" />
                      Extracting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                      Copy Billing Info from DocuSign
                    </>
                  )}
                </button>
                {extractSuccess && (
                  <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                    <Check className="w-3.5 h-3.5" /> Fields updated!
                  </span>
                )}
                {extractError && (
                  <span className="text-xs text-red-500 max-w-[200px] truncate" title={extractError}>
                    ⚠ {extractError}
                  </span>
                )}
              </div>
            )}
          </div>

        </div>
      </Section>

      {/* ── Contact Info ── */}
      <Section title="Contact Info">
        <ContactBlock
          label="👤 Primary Contact"
          name={localClient.contactName} email={localClient.contactEmail}
          phone={localClient.contactPhone} shipHeroAccess=""
          nameCol="text_mktqq7h6" emailCol="text_mktq6sr5"
          phoneCol="text_mktqabcm" shipHeroCol=""
          clientId={id}
          clientBoardItemId={id}
          highlightName
          highlightEmail
          highlightPhone
        />
        <EditField label="📍 Location" value={localClient.contactLocation} columnId="text_mktx8q74" clientId={id} icon={<MapPin className="w-3.5 h-3.5" />} />

        <div className="border-t border-gray-100 my-2" />

        <ContactBlock
          label="Contact 2"
          name={localClient.contact2Name} email={localClient.contact2Email}
          phone={localClient.contact2Phone} shipHeroAccess={localClient.contact2ShipHeroAccess}
          nameCol="text_mktr1evd" emailCol="text_mktr2xmm"
          phoneCol="text_mktr8kve" shipHeroCol="text_mktyakva"
          clientId={id}
          clientBoardItemId={id}
          collapsible
          onMakePrimary={() => handleMakePrimary(2)}
          swapping={swappingContact === 2}
        />

        <ContactBlock
          label="Contact 3"
          name={localClient.contact3Name} email={localClient.contact3Email}
          phone={localClient.contact3Phone} shipHeroAccess={localClient.contact3ShipHeroAccess}
          nameCol="text_mktr4v7q" emailCol="text_mktrt74r"
          phoneCol="text_mktrw0tb" shipHeroCol="text_mktyankg"
          clientId={id}
          clientBoardItemId={id}
          collapsible
          onMakePrimary={() => handleMakePrimary(3)}
          swapping={swappingContact === 3}
        />
      </Section>

      {/* ── Receiving ── */}
      <Section title="Receiving">
        <DateField
          label="📅 Initial Inventory Est. Delivery Date"
          value={localClient.initialInventoryDate}
          columnId="date_mktrzhyk"
          clientId={id}
          icon={<Calendar className="w-3.5 h-3.5" />}
          onSaved={onEstimatedDeliveryDateSaved}
        />
        {onboardingItemId && (
          <DateField
            label="✅ Delivered Date"
            value={deliveredDate || ''}
            columnId="date__1"
            clientId={id}
            icon={<Calendar className="w-3.5 h-3.5" />}
            patchUrl={`/api/onboarding/${onboardingItemId}`}
            onSaved={onDeliveredDateSaved}
          />
        )}
        {onboardingItemId && (
          <SelectField
            label="📦 Initial Inventory Delivered?"
            value={inventoryDelivered || ''}
            columnId="status_2"
            clientId={id}
            options={onboardingColOptions['status_2'] ?? []}
            valueType="status"
            patchUrl={`/api/onboarding/${onboardingItemId}`}
          />
        )}
        <SelectField label="🏷️ Items Barcoded" value={localClient.itemsBarcoded} columnId="color_mktrs5ah" clientId={id} options={colOptions['color_mktrs5ah'] ?? []} valueType="status" />
        <EditField label="🚛 Initial Inventory Delivery Method" value={localClient.initialInventoryMethod} columnId="text_mktrm9jx" clientId={id} />
        <EditField label="📊 Initial Inventory Quantity" value={localClient.initialInventoryQty} columnId="text_mktravgn" clientId={id} />
        <SelectField label="📦 Pre-Bag / Pre-Pack Before Storage" value={localClient.preStorageNeeds} columnId="dropdown_mktpdnn0" clientId={id} options={colOptions['dropdown_mktpdnn0'] ?? []} valueType="dropdown" />
        <EditField label="🗄️ Initial Inventory Storing Needs" value={localClient.initialInventoryStoringNeeds} columnId="text_mkw2z2tp" clientId={id} />
        <EditField label="📝 Notes on Initial Inventory" value={localClient.notesOnInitialInventory} columnId="long_text_mktqapsv" clientId={id} multiline />
        <EditField label="📝 Notes for Receiving" value={localClient.notesForReceiving} columnId="long_text_mkxecta8" clientId={id} multiline />
      </Section>

      {/* ── Packing & Shipping Requirements ── */}
      <Section title="Packing & Shipping Requirements">
        <EditField label="🛒 E-Commerce Platforms" value={localClient.ecommercePlatforms} columnId="long_text_mktra0sm" clientId={id} multiline />
        <EditField label="🔢 # of SKUs" value={localClient.skuCount} columnId="text_mktqrstq" clientId={id} />
        <SelectField label="🔄 Current Fulfillment Method" value={localClient.currentFulfillmentMethod} columnId="dropdown_mktq27te" clientId={id} options={colOptions['dropdown_mktq27te'] ?? []} valueType="dropdown" />
        <SelectField label="📦 Packaging" value={localClient.packaging} columnId="dropdown_mktptjhb" clientId={id} options={colOptions['dropdown_mktptjhb'] ?? []} valueType="dropdown" />
        <SelectField label="🎁 Order Inserts" value={localClient.orderInserts} columnId="color_mktpwd5s" clientId={id} options={colOptions['color_mktpwd5s'] ?? []} valueType="status" />
        <EditField label="🎁 Order Inserts Details" value={localClient.orderInsertDetails} columnId="text_mktpj2v0" clientId={id} />
        <EditField label="🎀 Kits or Bundles" value={localClient.kitsOrBundles} columnId="text_mktp2938" clientId={id} />
        <SelectField label="⚡ Currently Offering Overnight or 2-Day Delivery?" value={localClient.overnightDelivery} columnId="color_mktq9ekf" clientId={id} options={colOptions['color_mktq9ekf'] ?? []} valueType="status" />
        <SelectField label="🌍 Currently Fulfilling Internationally" value={localClient.internationalFulfillment} columnId="color_mktq43r0" clientId={id} options={colOptions['color_mktq43r0'] ?? []} valueType="status" />
        <SelectField label="🌐 International Shipments DDU/DDP" value={localClient.internationalShippingDDUDDP} columnId="color_mkwytd1b" clientId={id} options={colOptions['color_mkwytd1b'] ?? []} valueType="status" />
        <SelectField label="📦 Sending Product to Amazon FBA Warehouse" value={localClient.amazonFBA} columnId="color_mktqw7rg" clientId={id} options={colOptions['color_mktqw7rg'] ?? []} valueType="status" />
        <SelectField label="🛍️ TikTok Shop?" value={localClient.tikTokShop} columnId="dropdown_mm28h9mz" clientId={id} options={colOptions['dropdown_mm28h9mz'] ?? ['Yes', 'No']} valueType="dropdown" />
        <SelectField label="🏷️ Lot Code / Expiration Needed?" value={localClient.lotCodeExpiration} columnId="dropdown_mm28rr9y" clientId={id} options={colOptions['dropdown_mm28rr9y'] ?? ['Yes', 'No']} valueType="dropdown" />
        <SelectField label="🚚 Shipping Method" value={localClient.shippingMethod} columnId="dropdown_mktzcdg0" clientId={id} options={colOptions['dropdown_mktzcdg0'] ?? []} valueType="dropdown" />
        <EditField label="🔒 Additional Insurance / Signature" value={localClient.additionalInsuranceSignature} columnId="text_mktrs0xa" clientId={id} />
        <EditField label="🏪 Wholesale Details" value={localClient.wholesaleDetails} columnId="text_mkw5t2ey" clientId={id} />
        <EditField label="🚛 Outbound LTL" value={localClient.outboundLTL} columnId="text_mkw5bdr2" clientId={id} />
        <EditField label="🗄️ Estimated Inventory Storage" value={localClient.estimatedStorage} columnId="text_mkw4czc2" clientId={id} />
        <EditField label="📝 Additional Notes" value={localClient.additionalNotes} columnId="long_text_mktran3x" clientId={id} multiline />
        <EditField label="📝 Additional Shipping Requirement Notes" value={localClient.additionalShippingNotes} columnId="long_text_mkwy13zg" clientId={id} multiline />
        <EditField label="📝 Notes for Packing" value={localClient.notesForPacking} columnId="long_text_mkxfv1hr" clientId={id} multiline />
      </Section>

      {/* ── Returns Specifications ── */}
      <Section title="Returns Specifications" defaultOpen={false}>
        <SelectField label="⭐ Product Category" value={localClient.productCategory} columnId="color_mktq81r3" clientId={id} options={colOptions['color_mktq81r3'] ?? []} valueType="status" />
        <SelectField label="🔄 Returns Process" value={localClient.returnsProcess} columnId="color_mkxfrgba" clientId={id} options={colOptions['color_mkxfrgba'] ?? []} valueType="status" />
        <EditField label="📝 Notes for Returns" value={localClient.notesForReturns} columnId="long_text_mkxeajq4" clientId={id} multiline />
        <SelectField label="❓ Returns - Incomplete Condition" value={localClient.returnsIncompleteCondition} columnId="color_mkzf33yv" clientId={id} options={colOptions['color_mkzf33yv'] ?? []} valueType="status" />
        <SelectField label="💔 Returns - Damaged Condition" value={localClient.returnsDamagedCondition} columnId="color_mkxfa9h5" clientId={id} options={colOptions['color_mkxfa9h5'] ?? []} valueType="status" />
        <SelectField label="✨ Returns - New Condition" value={localClient.returnsNewCondition} columnId="color_mkxfkdyh" clientId={id} options={colOptions['color_mkxfkdyh'] ?? []} valueType="status" />
        <SelectField label="♻️ Returns - Used Condition" value={localClient.returnsUsedCondition} columnId="color_mkxfxdx5" clientId={id} options={colOptions['color_mkxfxdx5'] ?? []} valueType="status" />
      </Section>

      {/* ── ShipBots Support Portal Login ── */}
      <div className="border-2 border-[#43c7ff]/40 rounded-lg overflow-hidden mb-3 bg-[#e6f8ff]/40">
        <a
          href="https://www.shipbots.com/portal"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-4 py-2.5 bg-[#d0f2ff] hover:bg-[#d0f2ff] transition-colors text-left group"
        >
          <div className="flex items-center gap-2">
            <LogIn className="w-3.5 h-3.5 text-[#015280]" />
            <span className="text-xs font-semibold text-[#015280] uppercase tracking-wider">ShipBots Support Portal Login</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#43c7ff] group-hover:text-[#015280] transition-colors" />
        </a>
        <div className="px-2 py-1">
          <CopyableEditField
            label="Login Email / Username"
            value={localClient.portalLogin}
            columnId="text_mktxxfch"
            clientId={id}
            icon={<KeyRound className="w-3.5 h-3.5" />}
          />
          <CopyableEditField
            label="Password"
            value={localClient.portalPassword}
            columnId="text_mm28cz4g"
            clientId={id}
            icon={<KeyRound className="w-3.5 h-3.5" />}
            secret
          />
        </div>
      </div>

    </div>
  );
}
