'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { ChecklistStep } from '@/lib/types';
import { getStepState, getStepColor } from '@/lib/constants';
import {
  Check, Clock, Minus, ChevronDown, User,
  FileSignature, PhoneCall, ShoppingBag, Settings2, RefreshCw,
  Truck, Tag, CreditCard, Package, ClipboardList,
  Globe, Building2, CheckCircle2, RotateCcw, Mail, Phone, Send, Loader2,
  Sparkles, Calendar, Pencil,
} from 'lucide-react';
import { PostOnboardingModal } from './post-onboarding-modal';
import { InternalSummaryModal } from './internal-summary-modal';

interface OnboardingTabProps {
  steps: ChecklistStep[];
  progress: number;
  status: string;
  kickoffDate: string | null;
  inventoryDelivered: string;
  itemId: string;
  onboarder: string | null;
  internationalFulfillment?: string;
  internationalShippingDDUDDP?: string;
  amazonFBA?: string;
  ecommercePlatforms?: string;
  /** ShipHero Name (QB Display Name) — used for the pallet email template */
  shipHeroName?: string;
  /** Shipping methods stored in text_mkw94440, comma-separated */
  shippingDetails?: string;
  /** Client board item ID — needed for the post-onboarding summary modal */
  clientBoardItemId?: string;
  /** Primary contact email — pre-filled in the Send button of the summary modal */
  contactEmail?: string;
  /** Client name — shown in the summary modal header */
  clientName?: string;
  /** TikTok Shop? field from client board — drives N/A or applicable state */
  tikTokShop?: string;
  /** Lot Code / Expiration Needed? field from client board — drives N/A or Send Email button */
  lotCodeExpiration?: string;
  /** Called after the kickoff date saves successfully — lets the kanban /
   *  calendar views update without a full server reload. */
  onKickoffDateSaved?: (newValue: string) => void;
}

// Per-step icons keyed by Monday column ID
const STEP_ICON: Record<string, React.ReactNode> = {
  color_mktr9afd: <FileSignature className="w-3.5 h-3.5" />,
  color_mktp5834: <PhoneCall className="w-3.5 h-3.5" />,
  color_mktrpzz5: <ShoppingBag className="w-3.5 h-3.5" />,
  color_mktrf23d: <Settings2 className="w-3.5 h-3.5" />,
  color_mktrmpxj: <RefreshCw className="w-3.5 h-3.5" />,
  color_mktra6z8: <Truck className="w-3.5 h-3.5" />,
  color_mktrhdny: <Tag className="w-3.5 h-3.5" />,
  color_mktrykq:  <CreditCard className="w-3.5 h-3.5" />,
  color_mktrgqyc: <Package className="w-3.5 h-3.5" />,
  color_mktr96cf: <ClipboardList className="w-3.5 h-3.5" />,
  color_mktv3dek: <Globe className="w-3.5 h-3.5" />,
  color_mktv6qb:  <Building2 className="w-3.5 h-3.5" />,
  color_mktrgcmx: <CheckCircle2 className="w-3.5 h-3.5" />,
  color_mkzembac: <RotateCcw className="w-3.5 h-3.5" />,
  color_mm27gvc0: <Mail className="w-3.5 h-3.5" />,
  color_mm278h2v: <Phone className="w-3.5 h-3.5" />,
  color_mkys5ys0: <Send className="w-3.5 h-3.5" />,
  color_mm28q860: <ShoppingBag className="w-3.5 h-3.5" />,
  color_mm28ht8:  <Tag className="w-3.5 h-3.5" />,
};

function StateIcon({ state }: { state: 'done' | 'pending' | 'na' | 'not_started' }) {
  switch (state) {
    case 'done':        return <Check className="w-3 h-3 text-white" />;
    case 'pending':     return <Clock className="w-3 h-3 text-white" />;
    case 'na':          return <Minus className="w-3 h-3 text-white" />;
    case 'not_started': return null;
  }
}

function EditableStep({
  step,
  itemId,
  onSaved,
  subLabel,
  forcedNa = false,
  actionButton,
}: {
  step: ChecklistStep;
  itemId: string;
  onSaved: (stepId: string, newValue: string | null) => void;
  subLabel?: string;
  forcedNa?: boolean;
  actionButton?: React.ReactNode;
}) {
  const [value, setValue] = useState(step.value);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const state = forcedNa ? 'na' : getStepState(value, step.invertLogic);
  const color = getStepColor(state);
  const icon = STEP_ICON[step.id];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = async (newValue: string) => {
    setOpen(false);
    if (newValue === (value ?? '')) return;
    setSaving(true);
    setSaveError(false);
    try {
      const res = await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: step.id, value: newValue }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const saved = newValue === '' ? null : newValue;
      setValue(saved);
      onSaved(step.id, saved);
    } catch (err) {
      console.error('[onboarding checklist] save failed:', err);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${
      state === 'done'      ? 'bg-green-50'
      : state === 'pending' ? 'bg-orange-50'
      : state === 'na'      ? 'bg-gray-50 opacity-50'
      : 'hover:bg-gray-50'
    }`}>

      {/* ── Merged status indicator + dropdown trigger (LEFT) ── */}
      <div className="relative flex-shrink-0" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !forcedNa && setOpen(o => !o)}
          disabled={forcedNa}
          className={`flex items-center gap-1 pl-0.5 pr-1.5 py-0.5 rounded-full font-semibold text-[10px] whitespace-nowrap ${
            forcedNa ? 'cursor-default opacity-75' : 'transition-opacity hover:opacity-80'
          }`}
          style={{ color, backgroundColor: `${color}22`, border: `1px solid ${color}44` }}
          title={forcedNa ? 'Auto-set to N/A based on client settings' : (value || 'Not set — click to change')}
        >
          {/* State dot with icon inside */}
          <div
            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: saveError ? '#ef4444' : state === 'not_started' ? '#e5e7eb' : color }}
          >
            {saving
              ? <div className="w-2 h-2 border border-white border-t-transparent rounded-full animate-spin" />
              : saveError
              ? <span className="text-white text-[9px] font-bold leading-none">!</span>
              : <StateIcon state={state} />
            }
          </div>
          <span className="max-w-[72px] truncate">
            {saveError ? 'Not saved' : forcedNa ? 'N/A' : (value || 'Not set')}
          </span>
          {forcedNa
            ? <span className="text-[9px] opacity-60 ml-0.5">auto</span>
            : <ChevronDown className="w-2.5 h-2.5 flex-shrink-0 opacity-70" />
          }
        </button>

        {open && !forcedNa && (
          <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
            {step.options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => select(opt)}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                  value === opt ? 'font-semibold text-[#015280]' : 'text-gray-700'
                }`}
              >
                {opt}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                type="button"
                onClick={() => select('')}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                  !value ? 'font-semibold text-[#015280]' : 'text-gray-400'
                }`}
              >
                — Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Step icon ── */}
      <span className="flex-shrink-0" style={{ color: state === 'not_started' ? '#9ca3af' : color }}>
        {icon}
      </span>

      {/* ── Label + optional sub-label badge ── */}
      <span className={`flex-1 text-xs leading-tight min-w-0 flex items-center gap-1.5 flex-wrap ${
        state === 'na' ? 'line-through text-gray-400' : 'text-gray-700'
      }`}>
        {step.label}
        {subLabel && (
          <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 no-underline not-italic leading-none">
            {subLabel}
          </span>
        )}
      </span>

      {/* ── Optional action button (e.g. Send Email) ── */}
      {actionButton && (
        <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
          {actionButton}
        </div>
      )}
    </div>
  );
}

// ─── Shipping Method Picker ────────────────────────────────────────────────
const SHIPPING_OPTIONS = ['Standard', '2-Day', 'Regional', 'Overnight'] as const;

function ShippingMethodPicker({
  value: initialValue,
  itemId,
  onSaved,
}: {
  value: string;
  itemId: string;
  onSaved: (val: string) => void;
}) {
  const parse = (v: string) => v ? v.split(',').map(s => s.trim()).filter(Boolean) : [];
  const [selected, setSelected] = useState<string[]>(() => parse(initialValue));
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = async (method: string) => {
    const next = selected.includes(method)
      ? selected.filter(s => s !== method)
      : [...selected, method];
    setSelected(next);
    setSaving(true);
    try {
      const value = next.join(', ');
      await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'text_mkw94440', value }),
      });
      onSaved(value);
    } catch { /* ignore */ }
    finally { setSaving(false); }
  };

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border text-[#015280] hover:opacity-90 transition-colors whitespace-nowrap" style={{ background: 'var(--brand-cyan-light)', borderColor: 'var(--brand-cyan)' }}
      >
        {saving ? (
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
        ) : (
          <Truck className="w-2.5 h-2.5" />
        )}
        {selected.length > 0 ? selected.join(', ') : 'Select methods'}
        <ChevronDown className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px]">
          {SHIPPING_OPTIONS.map(opt => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer select-none"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Send Pallet Email Button ──────────────────────────────────────────────
function SendPalletEmailButton({
  shipHeroName,
  itemId,
  onSent,
  alreadyDone = false,
}: {
  shipHeroName: string;
  itemId: string;
  onSent: () => void;
  alreadyDone?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'no_gmail'>('idle');
  const clientName = shipHeroName.trim() || '⚠️ MISSING NAME';
  const nameReady = !!shipHeroName.trim();

  if (alreadyDone) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-gray-200 bg-gray-50 text-gray-400 cursor-default whitespace-nowrap">
        <Check className="w-2.5 h-2.5" />Email Sent
      </span>
    );
  }

  // Block send if name is still missing
  if (!nameReady) {
    return (
      <span
        title="Set the ShipHero Name field in Client Info before sending"
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-amber-300 bg-amber-50 text-amber-700 cursor-not-allowed whitespace-nowrap"
      >
        No ShipHero Name
      </span>
    );
  }

  const send = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'support@shiphero.com',
          subject: `Child Account ${clientName} - Shipping Plans`,
          body: `Hi Shiphero,\n\nWe have a new child account: ${clientName}. Can you please help me turning on the pallet option when creating shipping plan in the client portal?\n\nThank you,\nAndres`,
        }),
      });
      const data = await res.json();
      if (res.status === 401 || data.error === 'gmail_not_connected') {
        setState('no_gmail');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed');

      // Mark step as Done in Monday.com
      await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'color_mkys5ys0', value: 'Done' }),
      });

      setState('sent');
      onSent();
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  if (state === 'no_gmail') {
    return (
      <a
        href="/api/gmail/auth"
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
      >
        Connect Gmail
      </a>
    );
  }

  const idleStyle = state !== 'sent' && state !== 'error' ? { background: 'var(--brand-cyan-light)', borderColor: 'var(--brand-cyan)' } : undefined;

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === 'sending' || state === 'sent'}
      className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors whitespace-nowrap ${
        state === 'sent'
          ? 'bg-green-50 border-green-300 text-green-700'
          : state === 'error'
          ? 'bg-red-50 border-red-300 text-red-600'
          : 'text-[#015280]'
      }`}
      style={idleStyle}
    >
      {state === 'sending' ? (
        <><Loader2 className="w-2.5 h-2.5 animate-spin" />Sending…</>
      ) : state === 'sent' ? (
        <><Check className="w-2.5 h-2.5" />Sent!</>
      ) : state === 'error' ? (
        <>Failed</>
      ) : (
        <><Send className="w-2.5 h-2.5" />Send Email</>
      )}
    </button>
  );
}

// ─── Send Lot Code Email Button ────────────────────────────────────────────
function SendLotCodeEmailButton({
  shipHeroName,
  itemId,
  onSent,
  alreadyDone = false,
}: {
  shipHeroName: string;
  itemId: string;
  onSent: () => void;
  alreadyDone?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error' | 'no_gmail'>('idle');
  const clientName = shipHeroName.trim() || '⚠️ MISSING NAME';
  const nameReady = !!shipHeroName.trim();

  if (alreadyDone) {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-gray-200 bg-gray-50 text-gray-400 cursor-default whitespace-nowrap">
        <Check className="w-2.5 h-2.5" />Email Sent
      </span>
    );
  }

  if (!nameReady) {
    return (
      <span
        title="Set the ShipHero Name field in Client Info before sending"
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-amber-300 bg-amber-50 text-amber-700 cursor-not-allowed whitespace-nowrap"
      >
        No ShipHero Name
      </span>
    );
  }

  const send = async () => {
    setState('sending');
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'support@shiphero.com',
          subject: `Child Account: ${clientName} - Lot Code Expiration Tracking`,
          body: `Hi Shiphero,\n\nCan you please help me enabling lot code / expiration dates tracking for child account ${clientName}?\n\nPlease let me know if anything else is needed.\n\nThank you,\n\nAndres`,
        }),
      });
      const data = await res.json();
      if (res.status === 401 || data.error === 'gmail_not_connected') {
        setState('no_gmail');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Failed');

      // Mark step as Done in Monday.com
      await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'color_mm28ht8', value: 'Done' }),
      });

      setState('sent');
      onSent();
      setTimeout(() => setState('idle'), 3000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  if (state === 'no_gmail') {
    return (
      <a
        href="/api/gmail/auth"
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
      >
        Connect Gmail
      </a>
    );
  }

  const idleStyle2 = state !== 'sent' && state !== 'error' ? { background: 'var(--brand-cyan-light)', borderColor: 'var(--brand-cyan)' } : undefined;

  return (
    <button
      type="button"
      onClick={send}
      disabled={state === 'sending' || state === 'sent'}
      className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors whitespace-nowrap ${
        state === 'sent'
          ? 'bg-green-50 border-green-300 text-green-700'
          : state === 'error'
          ? 'bg-red-50 border-red-300 text-red-600'
          : 'text-[#015280]'
      }`}
      style={idleStyle2}
    >
      {state === 'sending' ? (
        <><Loader2 className="w-2.5 h-2.5 animate-spin" />Sending…</>
      ) : state === 'sent' ? (
        <><Check className="w-2.5 h-2.5" />Sent!</>
      ) : state === 'error' ? (
        <>Failed</>
      ) : (
        <><Send className="w-2.5 h-2.5" />Send Email</>
      )}
    </button>
  );
}

export function OnboardingTab({
  steps: initialSteps,
  progress: initialProgress,
  status,
  kickoffDate,
  inventoryDelivered,
  itemId,
  onboarder,
  internationalFulfillment,
  internationalShippingDDUDDP,
  amazonFBA,
  ecommercePlatforms,
  shipHeroName,
  shippingDetails: initialShippingDetails = '',
  clientBoardItemId,
  contactEmail,
  clientName,
  tikTokShop,
  lotCodeExpiration,
  onKickoffDateSaved,
}: OnboardingTabProps) {
  const [steps, setSteps] = useState<ChecklistStep[]>(initialSteps);
  const [shippingDetails, setShippingDetails] = useState(initialShippingDetails);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showInternalSummaryModal, setShowInternalSummaryModal] = useState(false);

  // Kickoff date — local state so edits reflect immediately
  const [localKickoffDate, setLocalKickoffDate] = useState(kickoffDate || '');
  const [kickoffSaving, setKickoffSaving] = useState(false);
  const [kickoffFlash, setKickoffFlash] = useState<'saved' | 'error' | null>(null);
  const [kickoffEditing, setKickoffEditing] = useState(false);
  const kickoffInputRef = useRef<HTMLInputElement>(null);

  const saveKickoffDate = async (value: string) => {
    setKickoffEditing(false);
    if (value === localKickoffDate) return;
    setKickoffSaving(true);
    try {
      const res = await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'date3', value, valueType: 'date' }),
      });
      if (!res.ok) throw new Error();
      setLocalKickoffDate(value);
      onKickoffDateSaved?.(value);
      setKickoffFlash('saved');
    } catch {
      setKickoffFlash('error');
    } finally {
      setKickoffSaving(false);
      setTimeout(() => setKickoffFlash(null), 2500);
    }
  };
  // Track which step IDs we've already auto-patched to avoid duplicate requests
  const patchedRef = useRef<Set<string>>(new Set());
  // Always-current ref to steps — lets effects read latest state without stale closures
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  // Steps whose value should be forced to N/A based on client-info conditions:
  //   • Configure International Shipping  → N/A when not fulfilling internationally
  //   • Configure FBA Shipping            → N/A when not sending to Amazon FBA
  const forcedNaIds = useMemo(() => {
    const set = new Set<string>();
    if (internationalFulfillment?.toLowerCase() === 'no') set.add('color_mktv3dek');
    if (amazonFBA?.toLowerCase() === 'no')               set.add('color_mktv6qb');
    // TikTok / LotCode: forced N/A in display only when not "yes" — NOT written to Monday.com
    if (!tikTokShop || tikTokShop.toLowerCase() !== 'yes')             set.add('color_mm28q860');
    if (!lotCodeExpiration || lotCodeExpiration.toLowerCase() !== 'yes') set.add('color_mm28ht8');
    return set;
  }, [internationalFulfillment, amazonFBA, tikTokShop, lotCodeExpiration]);

  // Silently write N/A to Monday.com the first time a condition is detected
  // so the checklist stays in sync with client-info data.
  // TikTok / LotCode steps are EXCLUDED — they're display-only forced N/A.
  useEffect(() => {
    const CLIENT_DRIVEN = new Set(['color_mm28q860', 'color_mm28ht8']);
    forcedNaIds.forEach(stepId => {
      if (CLIENT_DRIVEN.has(stepId)) return;
      if (patchedRef.current.has(stepId)) return;
      const step = stepsRef.current.find(s => s.id === stepId);
      if (!step || step.value?.toLowerCase() === 'n/a') return;
      patchedRef.current.add(stepId);
      fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: stepId, value: 'N/A' }),
      })
        .then(res => {
          if (res.ok) setSteps(prev => prev.map(s => s.id === stepId ? { ...s, value: 'N/A' } : s));
          else patchedRef.current.delete(stepId);
        })
        .catch(() => patchedRef.current.delete(stepId));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forcedNaIds, itemId]);

  // When TikTok Shop is "Yes" and the step hasn't been started yet (null / N/A),
  // automatically set it to "Needs Set Up" so the onboarder knows action is required.
  useEffect(() => {
    if (tikTokShop?.toLowerCase() !== 'yes') return;
    const step = stepsRef.current.find(s => s.id === 'color_mm28q860');
    if (!step) return;
    const current = step.value?.toLowerCase() ?? '';
    // Only overwrite blank or stale N/A — never touch Done / Working on it / etc.
    if (current && current !== 'n/a' && current !== 'na') return;
    if (patchedRef.current.has('color_mm28q860-setup')) return;
    patchedRef.current.add('color_mm28q860-setup');
    setSteps(prev => prev.map(s => s.id === 'color_mm28q860' ? { ...s, value: 'Needs Set Up' } : s));
    fetch(`/api/onboarding/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: 'color_mm28q860', value: 'Needs Set Up' }),
    }).catch(() => patchedRef.current.delete('color_mm28q860-setup'));
  }, [tikTokShop, itemId]);

  // When Lot Code / Expiration is "Yes" and the step is blank / N/A,
  // automatically set it to "Needs Set Up".
  useEffect(() => {
    if (lotCodeExpiration?.toLowerCase() !== 'yes') return;
    const step = stepsRef.current.find(s => s.id === 'color_mm28ht8');
    if (!step) return;
    const current = step.value?.toLowerCase() ?? '';
    if (current && current !== 'n/a' && current !== 'na') return;
    if (patchedRef.current.has('color_mm28ht8-setup')) return;
    patchedRef.current.add('color_mm28ht8-setup');
    setSteps(prev => prev.map(s => s.id === 'color_mm28ht8' ? { ...s, value: 'Needs Set Up' } : s));
    fetch(`/api/onboarding/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: 'color_mm28ht8', value: 'Needs Set Up' }),
    }).catch(() => patchedRef.current.delete('color_mm28ht8-setup'));
  }, [lotCodeExpiration, itemId]);

  // Apply forced N/A overrides for display + progress calculation
  const effectiveSteps = useMemo(
    () => steps.map(s => forcedNaIds.has(s.id) ? { ...s, value: 'N/A' } : s),
    [steps, forcedNaIds]
  );

  // Show DDU/DDP selection on the "Configure International Shipping" row
  // only when the client answered "Yes" to fulfilling internationally
  const intlSubLabel =
    internationalFulfillment?.toLowerCase() === 'yes' && internationalShippingDDUDDP
      ? internationalShippingDDUDDP
      : undefined;

  // Show e-commerce platforms on the "Connect Your Store" row
  const storeSubLabel = ecommercePlatforms?.trim() || undefined;

  // Show selected shipping methods on the "Map Shipping Methods" row
  const shippingSubLabel = shippingDetails.trim() || undefined;

  // Progress uses effectiveSteps so forced-N/A steps are excluded from the denominator
  const doneCount = effectiveSteps.filter(s => getStepState(s.value, s.invertLogic) === 'done').length;
  const applicableCount = effectiveSteps.filter(s => getStepState(s.value, s.invertLogic) !== 'na').length;
  const progress = applicableCount > 0 ? Math.round((doneCount / applicableCount) * 100) : initialProgress;

  const handleSaved = (stepId: string, newValue: string | null) => {
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, value: newValue } : s));
  };

  const progressColor = progress === 100 ? '#00c875' : progress > 50 ? '#579bfc' : '#fdab3d';

  return (
    <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Progress header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">Overall Progress</span>
          <span className="text-lg font-bold" style={{ color: progressColor }}>{progress}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: progressColor }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-500">
          <span>Status: <strong className="text-gray-700">{status}</strong></span>

          {/* ── Editable Kickoff Date ── */}
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            {kickoffEditing ? (
              <input
                ref={kickoffInputRef}
                type="date"
                defaultValue={localKickoffDate}
                autoFocus
                onBlur={e => saveKickoffDate(e.target.value)}
                onChange={e => {
                  // Save immediately on date selection (calendar pick triggers change)
                  if (e.target.value) saveKickoffDate(e.target.value);
                }}
                className="text-[11px] border border-[#43c7ff] rounded px-1 py-0 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] text-gray-900 bg-white cursor-pointer"
                style={{ colorScheme: 'light' }}
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setKickoffEditing(true);
                  setTimeout(() => {
                    kickoffInputRef.current?.showPicker?.();
                  }, 30);
                }}
                className="flex items-center gap-1 group/kb hover:text-[#015280] transition-colors"
                title="Click to change kickoff date"
              >
                {localKickoffDate ? (
                  <>
                    <span>Kickoff:</span>
                    <strong className="text-gray-700 group-hover/kb:text-[#015280]">
                      {new Date(localKickoffDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </strong>
                  </>
                ) : (
                  <span className="text-gray-400 italic hover:text-[#015280]">Set kickoff date…</span>
                )}
                {!kickoffSaving && !kickoffFlash && (
                  <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/kb:opacity-60 transition-opacity flex-shrink-0" />
                )}
                {kickoffSaving && <div className="w-2.5 h-2.5 rounded-full border border-[#43c7ff] border-t-transparent animate-spin flex-shrink-0" />}
                {kickoffFlash === 'saved' && <Check className="w-2.5 h-2.5 text-green-500 flex-shrink-0" />}
                {kickoffFlash === 'error' && <span className="text-red-500 text-[10px]">!</span>}
              </button>
            )}
          </span>

          <span>Inventory: <strong className="text-gray-700">{inventoryDelivered || 'No'}</strong></span>
          {onboarder && (
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              <strong className="text-gray-700">{onboarder}</strong>
            </span>
          )}
        </div>

        {/* Action buttons below progress bar */}
        {clientBoardItemId && (
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={() => setShowSummaryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate Post-Onboarding Summary
            </button>
            <button
              type="button"
              onClick={() => setShowInternalSummaryModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-white hover:opacity-90 transition-colors shadow-sm" style={{ background: 'var(--brand-navy)' }}
            >
              <Mail className="w-3.5 h-3.5" />
              Create New Client Onboarding Summary
            </button>
          </div>
        )}
      </div>

      {/* Compact checklist */}
      <div className="space-y-0.5">
        {effectiveSteps.map(step => (
          <EditableStep
            key={step.id}
            step={step}
            itemId={itemId}
            onSaved={handleSaved}
            subLabel={
              step.id === 'color_mktv3dek'  ? intlSubLabel :
              step.id === 'color_mktrpzz5'  ? storeSubLabel :
              step.id === 'color_mktra6z8'  ? shippingSubLabel :
              step.id === 'color_mm28q860' && tikTokShop?.toLowerCase() === 'yes' ? 'TikTok Shop' :
              undefined
            }
            forcedNa={forcedNaIds.has(step.id)}
            actionButton={
              step.id === 'color_mkys5ys0' ? (
                <SendPalletEmailButton
                  shipHeroName={shipHeroName || ''}
                  itemId={itemId}
                  onSent={() => handleSaved('color_mkys5ys0', 'Done')}
                  alreadyDone={step.value?.toLowerCase() === 'done'}
                />
              ) : step.id === 'color_mktra6z8' ? (
                <ShippingMethodPicker
                  value={shippingDetails}
                  itemId={itemId}
                  onSaved={setShippingDetails}
                />
              ) : step.id === 'color_mm28ht8' && lotCodeExpiration?.toLowerCase() === 'yes' ? (
                <SendLotCodeEmailButton
                  shipHeroName={shipHeroName || ''}
                  itemId={itemId}
                  onSent={() => handleSaved('color_mm28ht8', 'Done')}
                  alreadyDone={step.value?.toLowerCase() === 'done'}
                />
              ) : undefined
            }
          />
        ))}
      </div>

      {/* Post-Onboarding Summary Modal (client-facing) */}
      {showSummaryModal && clientBoardItemId && (
        <PostOnboardingModal
          clientName={clientName || ''}
          clientBoardItemId={clientBoardItemId}
          onboardingItemId={itemId}
          contactEmail={contactEmail}
          onClose={() => setShowSummaryModal(false)}
        />
      )}

      {/* Internal Team Onboarding Summary Modal */}
      {showInternalSummaryModal && clientBoardItemId && (
        <InternalSummaryModal
          clientName={clientName || ''}
          clientBoardItemId={clientBoardItemId}
          onboardingItemId={itemId}
          onClose={() => setShowInternalSummaryModal(false)}
        />
      )}
    </div>
  );
}
