'use client';

import { useState, useRef, useCallback, useEffect, createContext, useContext } from 'react';
import { ClientInfo, MonFile } from '@/lib/types';
import {
  Mail, Phone, MapPin, ExternalLink, Check, Pencil,
  ChevronDown, ChevronRight, Upload, FileText, Sparkles, Calendar, Plus,
  UserCheck, UserPlus, X, Loader2, ShieldCheck, Users, Copy, KeyRound, LogIn,
  ArrowUpDown, Paperclip, Receipt, CreditCard, Info, Landmark, Tag, Eye,
} from 'lucide-react';
import { ClientStickyNotesSummary } from './client-sticky-notes-summary';
import { ClientAchInfo } from './client-ach-info';
import { FilePreviewModal, type PreviewableFile } from './file-preview-modal';
import { ConfirmDialog } from './client-header';
import { SectionDocuments } from './section-documents';
import { ClientProjectsBox } from './client-projects-box';
import { EmailNotificationsSection } from './email-notifications-section';
import { useNotificationSync, isContactEmailColumn } from './notification-sync';
import type { Project } from '@/lib/projects';
import { useSession } from 'next-auth/react';

// ─── Customer Service "clean view" mode ──────────────────────────────────────
// In the Customer Service surface the client record is a reference view: only
// fields that have a value are shown, and each Section has an Edit button that
// flips just that section into the full editable layout (all fields, including
// empty ones). Onboarding is unaffected — csMode stays false there, so every
// field renders exactly as before.
//
// csMode is provided once at the ClientInfoTab root; each Section owns its own
// `editing` flag and provides it via SectionEditContext. Field components read
// both: csMode && !editing → hide when empty / render clean read-only.
const CsModeContext = createContext(false);
const SectionEditContext = createContext(false);
function useFieldMode() {
  return { csMode: useContext(CsModeContext), editing: useContext(SectionEditContext) };
}

// The Billing tab's Pricing Info fields (ClientInfo keys). Used to detect
// whether a client already has pricing on file before a DocuSign (re)extract
// would overwrite it.
const PRICING_FIELDS: (keyof ClientInfo)[] = [
  'receivingPricing', 'floorLoadedFee', 'binStorage', 'palletStorage',
  'dtcPickPackPricing', 'b2bPickPack', 'shippingUpcharge', 'intlShippingUpcharge',
  'returnsFee', 'accountManagerFee', 'platformFee', 'paymentTerms', 'otherNotes',
];

// ─── "On file / Not on file" field ───────────────────────────────────────────
// For sensitive values (EIN, the DocuSign document) that a Customer Service rep
// without DocuSign access may not SEE. Shows only an on-file indicator — the
// real value never reaches the browser (redacted server-side). When `editable`
// (EIN), a rep can still blindly enter a NEW value in the section's edit mode;
// they never see the current one. When not editable (DocuSign), it's read-only.
function OnFileField({
  label,
  onFile,
  columnId,
  clientId,
  noun,
  icon,
  editable = false,
}: {
  label: string;
  onFile: boolean;
  columnId: string;
  clientId: string;
  noun: string;
  icon?: React.ReactNode;
  editable?: boolean;
}) {
  const { editing: sectionEditing } = useFieldMode();
  const [present, setPresent] = useState(onFile);
  const [draft, setDraft] = useState('');
  const [entering, setEntering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);

  useEffect(() => { setPresent(onFile); }, [onFile]);

  const save = async () => {
    const v = draft.trim();
    if (!v) { setEntering(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: v }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setPresent(true);
      setDraft('');
      setEntering(false);
      setFlash('saved');
    } catch {
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2500);
    }
  };

  const pill = (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
        present
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-gray-100 text-gray-500 border-gray-200'
      }`}
    >
      {present && <Check className="w-3 h-3" />}
      {present ? 'On file' : 'Not on file'}
    </span>
  );

  // Read/status view — used everywhere except an editable field in edit mode.
  if (!sectionEditing || !editable) {
    return (
      <div className="flex items-center gap-2 px-1 py-1.5">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p className="text-[11px] text-gray-400 leading-none">{label}</p>
        {pill}
        {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500" />}
      </div>
    );
  }

  // Editable + section is in edit mode → allow entering a NEW value blindly.
  return (
    <div className="flex items-start gap-2 px-1 py-1.5">
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[11px] text-gray-400 leading-none">{label}</p>
          {pill}
        </div>
        {entering ? (
          <div>
            <input
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`Enter ${noun}…`}
              onKeyDown={e => {
                if (e.key === 'Enter') save();
                if (e.key === 'Escape') { setDraft(''); setEntering(false); }
              }}
              className="w-full text-sm border border-[#43c7ff] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                type="button"
                onClick={save}
                disabled={saving || !draft.trim()}
                className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#015280] text-white hover:bg-[#013d60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : present ? `Replace ${noun}` : `Save ${noun}`}
              </button>
              <button
                type="button"
                onClick={() => { setDraft(''); setEntering(false); }}
                className="px-2.5 py-1 text-[11px] font-medium rounded text-gray-500 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <span className="text-[10px] text-gray-400 ml-auto">Hidden — you won&apos;t see it after saving</span>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEntering(true)}
            className="text-xs text-[#015280] inline-flex items-center gap-1 hover:underline"
          >
            <Pencil className="w-3 h-3" /> {present ? `Replace ${noun}` : `Add ${noun}`}
          </button>
        )}
        {flash === 'error' && <p className="text-[11px] text-red-600 mt-1">Save failed — try again</p>}
      </div>
    </div>
  );
}

// Clean read-only row used by every field in CS view mode. Renders nothing for
// empty values; renders HTML values (rich-text columns) the same way EditField
// does in its filled state.
function ReadRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null;
  const isHtml = /<[a-z][\s\S]*>/i.test(value);
  // Short single-line values sit iOS-style (label left, value right); long or
  // rich-text values stack so they have room to wrap.
  const stacked = isHtml || value.length > 42;
  return (
    <div className="flex items-start gap-2.5 px-2.5 py-[7px] border-b border-gray-100/70 last:border-b-0">
      {icon && <span className="text-gray-300 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className={`min-w-0 flex-1 ${stacked ? '' : 'flex items-center justify-between gap-3'}`}>
        <p className={`text-[12.5px] text-gray-500 ${stacked ? 'mb-0.5' : 'flex-shrink-0'}`}>{label}</p>
        {isHtml ? (
          <div
            className="text-[13.5px] text-gray-900 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 [&_li]:mb-0.5 [&_strong]:font-semibold [&_p]:mb-1"
            dangerouslySetInnerHTML={{ __html: value }}
          />
        ) : (
          <p className={`text-[13.5px] font-medium text-gray-900 whitespace-pre-wrap break-words ${stacked ? '' : 'text-right'}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// Read row whose value is an enumerated status/dropdown — rendered as a colour
// pill so state reads at a glance (green = good, grey = negative/none, blue =
// neutral). Used by SelectField in the Customer Service read view.
function ReadPillRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  const positive = ['yes', 'done', 'active', 'onboarded', 'complete', 'completed', 'approved', 'on file', 'live', 'ready'].some(k => v === k || v.startsWith(k));
  const muted = ['no', 'none', 'n/a', 'na', 'inactive', 'churned', 'lost', 'not set', 'not started', 'pending'].some(k => v === k);
  const tone = positive
    ? 'bg-[#E7F8ED] text-[#1E7A3E]'
    : muted
      ? 'bg-gray-100 text-gray-500'
      : 'bg-[#EAF3FA] text-[#0071BC]';
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-[7px] border-b border-gray-100/70 last:border-b-0">
      {icon && <span className="text-gray-300 flex-shrink-0">{icon}</span>}
      <p className="text-[12.5px] text-gray-500 flex-shrink-0">{label}</p>
      <span className={`ml-auto inline-flex items-center text-[11.5px] font-semibold px-2 py-0.5 rounded-full ${tone}`}>{value}</span>
    </div>
  );
}

interface ClientInfoTabProps {
  client: ClientInfo;
  fullscreen?: boolean;
  /**
   * When true, force single-column section layout regardless of fullscreen.
   * The Customer Service expanded view uses this so the right half of the
   * screen can host sticky notes + performance metrics panels instead of
   * the second column of client fields.
   */
  forceSingleColumn?: boolean;
  /** Hide the editable client-name header (parent renders it large). */
  hideHeader?: boolean;
  /** Hide the Contact Info section — the expanded view's ClientHeader
   *  already shows all three contacts above the body, so duplicating
   *  the Section here would only repeat the same data. */
  hideContactInfo?: boolean;
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
  /** Customer Service "clean view": each section shows only completed fields,
   *  with a per-section Edit button that reveals all fields for editing.
   *  Off (default) in Onboarding, which keeps the always-editable layout. */
  customerService?: boolean;
  /** Render ONLY the curated Billing Info view — a filtered subset of fields
   *  for the billing department (ShipHero / legal / EIN / QuickBooks / invoicing
   *  / billing address / DocuSign / delivered date). The parent gates this tab
   *  to viewers with DocuSign access, so EIN + the contract are never redacted
   *  here. Skips every other section, the name header, and contacts. */
  billingOnly?: boolean;
  /** Projects (scaffold) + opener — renders a "Projects for this client" box
   *  in the side-panel (non-fullscreen) CS view. The expanded view shows its
   *  own box in the right column, so this one is gated to !fullscreen. */
  projects?: Project[];
  onOpenProject?: (p: Project) => void;
  /** Start a new project pre-filled with this client. */
  onCreateProject?: (clientBoardItemId: string | null, clientName: string) => void;
}

// ─── Copyable + Editable field (for portal login credentials) ────────────────
function CopyableEditField({
  label,
  value: initialValue,
  columnId,
  clientId,
  icon,
  secret = false,
  csAddable = false,
}: {
  label: string;
  value: string;
  columnId: string;
  clientId: string;
  icon?: React.ReactNode;
  /** If true, show value masked by default with reveal toggle */
  secret?: boolean;
  /**
   * If true, in CS view mode an empty value renders a "+ Add" button
   * that flips the field into inline-edit mode instead of hiding the
   * row. Used for the Portal Login credentials so reps can enter
   * them even when the section isn't in section-edit mode.
   */
  csAddable?: boolean;
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
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[CopyableEditField] save failed: ${columnId} status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      setSavedValue(value);
      setFlash('saved');
    } catch (err) {
      console.error(`[CopyableEditField] save error: ${columnId}`, err);
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

  const { csMode, editing: sectionEditing } = useFieldMode();
  // CS view mode: hide empties, show a clean read row that keeps copy + reveal
  // (portal credentials are the main thing reps copy). The `!editing` gate
  // is load-bearing: without it, the first keystroke in an "+ Add" flow
  // pushes `value` from '' to 'a', re-runs this branch with a truthy
  // value, and returns the read-display div — unmounting the <input>,
  // which blurs, which fires save() with a single-character value. The
  // user sees only the first letter save. Skipping this whole block while
  // editing lets the `if (editing)` block below stay mounted for the
  // whole typing session.
  if (csMode && !sectionEditing && !editing) {
    if (!value) {
      // csAddable=true → render a compact "+ Add" affordance so reps can
      // enter Portal credentials inline without flipping the whole
      // section into edit mode. Clicking flips this ONE field into its
      // local editing state; the block below (`if (editing)`) then
      // renders the text input.
      if (!csAddable) return null;
      return (
        <button
          type="button"
          onClick={() => { setEditing(true); setTimeout(() => inputRef.current?.focus(), 30); }}
          className="group flex items-center gap-2 px-1 py-1.5 w-full text-left hover:bg-gray-50 rounded-md"
        >
          {icon && <span className="text-gray-300 flex-shrink-0">{icon}</span>}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
            <p className="text-[13px] italic text-gray-400 group-hover:text-[#015280]">+ Add</p>
          </div>
        </button>
      );
    }
    return (
      <div className="group flex items-center gap-2 px-1 py-1.5">
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
          {/* Proportional font (was font-mono) + truncate so long values
              like "support+arcanium@shipbots.com" fit on one line
              instead of breaking mid-word. Hovering shows the full value
              via title. */}
          <p className="text-[13px] text-gray-900 truncate" title={displayValue}>{displayValue}</p>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {flash === 'copied' && <span className="text-[10px] text-[#015280] font-medium">Copied!</span>}
          {secret && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setRevealed(r => !r); }}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
              title={revealed ? 'Hide' : 'Reveal'}
            >
              <span className="text-[10px] font-medium">{revealed ? 'Hide' : 'Show'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-[#43c7ff] transition-colors"
            title="Copy to clipboard"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

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
            className="w-full text-[13px] border border-[#43c7ff] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
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
        <p
          className={`text-[13px] truncate ${!value ? 'text-gray-300 italic' : 'text-gray-900'}`}
          title={value ? displayValue : undefined}
        >
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
  icon,
  children,
  defaultOpen = false,
  attachmentCount = 0,
  headerAction,
}: {
  title: string;
  /** Optional leading icon shown between the collapse chevron and the title. */
  icon?: React.ReactNode;
  /** Optional action rendered on the right of the header (e.g. a button).
   *  Shown regardless of csMode; sits where the CS Edit button would. */
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /**
   * When non-zero, renders a small paperclip badge in the collapsed
   * header so reps notice a document is attached without expanding
   * the section. Comes from the aggregated section-files fetch at
   * the ClientInfoTab level; counts are keyed by category.
   */
  attachmentCount?: number;
}) {
  const csMode = useContext(CsModeContext);
  const [open, setOpen] = useState(defaultOpen);
  // Per-section edit toggle (Customer Service only). When off, fields render
  // clean read-only and empties are hidden; when on, every field shows and is
  // editable. Opening edit mode also expands the section.
  const [editing, setEditing] = useState(false);
  const hasContent = !!children;

  const toggleEdit = () => {
    setEditing(v => {
      const next = !v;
      if (next) setOpen(true);
      return next;
    });
  };

  return (
    <div className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)] overflow-hidden mb-2.5">
      <div className="w-full flex items-center gap-2 px-3.5 py-2.5 hover:bg-gray-50/70 transition-colors">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex-1 flex items-center gap-2.5 text-left min-w-0"
        >
          <ChevronRight
            className={`w-4 h-4 text-gray-300 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          />
          {icon && <span className="flex-shrink-0 inline-flex items-center">{icon}</span>}
          <span className="text-[13px] font-semibold text-gray-800 tracking-[-0.01em] truncate">{title}</span>
          {attachmentCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-[#EAF3FA] text-[#0071BC] rounded-full px-1.5 py-0.5 leading-none flex-shrink-0"
              title={`${attachmentCount} attached document${attachmentCount === 1 ? '' : 's'}`}
            >
              <Paperclip className="w-2.5 h-2.5" />
              {attachmentCount}
            </span>
          )}
        </button>
        {headerAction}
        {csMode && (
          <button
            type="button"
            onClick={toggleEdit}
            className={`text-[12.5px] font-semibold px-2 py-0.5 rounded-full transition-colors flex-shrink-0 ${
              editing
                ? 'bg-[#015280] text-white hover:bg-[#013d60]'
                : 'text-[#0071BC] hover:bg-[#e6f8ff]'
            }`}
            title={editing ? 'Finish editing this section' : 'Edit this section'}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </div>
      {open && hasContent && (
        <div className="border-t border-gray-100 px-2 py-1">
          <SectionEditContext.Provider value={editing}>{children}</SectionEditContext.Provider>
        </div>
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
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[SelectField] save failed: ${columnId} status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      setValue(newValue);
      setFlash('saved');
    } catch (err) {
      console.error(`[SelectField] save error: ${columnId}`, err);
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  };

  // Only show amber highlight when the field is empty
  const isHighlighted = !!(highlight && !value);

  const { csMode, editing } = useFieldMode();
  if (csMode && !editing) {
    if (!value) return null;
    return <ReadPillRow label={label} value={value} icon={icon} />;
  }

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

// Format a Monday YYYY-MM-DD date string for the CS read view. Uses a
// long weekday+month format ("Thursday, September 14, 2026") so reps
// can see what day of the week a delivery lands on at a glance. We
// parse the components manually instead of `new Date(iso)` because
// the latter treats bare YYYY-MM-DD as UTC midnight and can render
// off-by-one in negative-offset timezones (Pacific → shows yesterday).
function formatLongDate(iso: string): string {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
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
  labelTooltip,
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
  /** Extra context shown on hover over the label (an ⓘ appears next to it). */
  labelTooltip?: string;
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
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[DateField] save failed: ${columnId} status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      setValue(newValue);
      setSavedValue(newValue);
      onSaved?.(newValue);
      setFlash('saved');
    } catch (err) {
      console.error(`[DateField] save error: ${columnId}`, err);
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

  const { csMode, editing } = useFieldMode();
  if (csMode && !editing) {
    if (!value) return null;
    return <ReadRow label={label} value={formatLongDate(value)} icon={icon} />;
  }

  if (!expanded) {
    return (
      <div
        className={`flex items-center gap-2 px-1 py-1 group cursor-pointer hover:bg-[#e6f8ff] rounded transition-colors ${isHighlighted ? HL : ''}`}
        onClick={() => { setExpanded(true); setTimeout(() => inputRef2.current?.showPicker?.(), 50); }}
      >
        {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
        <p title={labelTooltip} className={`text-[11px] flex-1 leading-none inline-flex items-center gap-1 ${labelTooltip ? 'cursor-help' : ''} ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}{labelTooltip && <Info className="w-3 h-3 opacity-60 flex-shrink-0" />}</p>
        <Plus className="w-3 h-3 text-gray-300 group-hover:text-[#43c7ff] flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-2 px-1 py-1.5 ${isHighlighted ? HL : ''}`}>
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p title={labelTooltip} className={`text-[11px] leading-none mb-1 inline-flex items-center gap-1 ${labelTooltip ? 'cursor-help' : ''} ${isHighlighted ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}>{label}{labelTooltip && <Info className="w-3 h-3 opacity-60 flex-shrink-0" />}</p>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef2}
            type="date"
            value={value || ''}
            onChange={e => {
              const next = e.target.value;
              setValue(next);
              // Native date input fires change with the final value once the
              // picker closes (or once the user types a complete YYYY-MM-DD).
              // Save immediately — onBlur is unreliable: in some browsers the
              // picker closes without the input losing focus, so users would
              // see their date "not save" until they clicked elsewhere.
              // The save() function dedupes against savedValue, so spurious
              // re-fires don't double-write.
              if (!next || /^\d{4}-\d{2}-\d{2}$/.test(next)) save(next);
            }}
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

// ─── Link field (Monday `link` column type) ─────────────────────────────────
// Renders as an external-link row when a URL is on file, or a "+ Add link"
// affordance when empty. Edit mode is a URL input; the display label
// defaults to the URL host (mirrors Monday's default when text is blank).
// Save PATCHes the column with `{"url":"…","text":"…"}` — lib/monday.ts's
// formatColumnValue handles the link-type serialization end-to-end.
function LinkField({
  label,
  value,
  columnId,
  clientId,
  icon,
  onSaved,
}: {
  label: string;
  value: { url: string; text: string } | null;
  columnId: string;
  clientId: string;
  icon?: React.ReactNode;
  onSaved?: (next: { url: string; text: string } | null) => void;
}) {
  const [saved, setSaved] = useState<{ url: string; text: string } | null>(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.url ?? '');
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);

  useEffect(() => { setSaved(value); setDraft(value?.url ?? ''); }, [value]);

  const save = useCallback(async () => {
    const url = draft.trim();
    if ((saved?.url ?? '') === url) { setEditing(false); return; }
    setSaving(true);
    try {
      // Send the raw URL; the backend's formatColumnValue turns it into
      // {url, text} for Monday. Empty string clears the field.
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value: url }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[LinkField] save failed: ${columnId} status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      const next = url ? { url, text: url } : null;
      setSaved(next);
      onSaved?.(next);
      setFlash('saved');
      setTimeout(() => setEditing(false), 400);
    } catch (err) {
      console.error(`[LinkField] save error: ${columnId}`, err);
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2500);
    }
  }, [draft, saved, columnId, clientId, onSaved]);

  const { csMode, editing: sectionEditing } = useFieldMode();
  // CS read view: hide empty links entirely (consistent with EditField).
  if (csMode && !sectionEditing && !editing && !saved?.url) return null;

  if (editing) {
    return (
      <div className="flex items-start gap-2 px-1 py-1.5">
        {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
          <input
            type="url"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={save}
            autoFocus
            placeholder="https://…"
            className="w-full text-sm border border-[#43c7ff] rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); save(); }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(saved?.url ?? ''); setEditing(false); }
            }}
          />
        </div>
        {saving && <div className="w-3.5 h-3.5 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin flex-shrink-0 mt-1" />}
      </div>
    );
  }

  if (!saved?.url) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(''); setEditing(true); }}
        className="w-full flex items-center gap-2 px-1 py-1.5 hover:bg-[#e6f8ff] rounded group text-left"
      >
        {icon && <span className="text-gray-300 flex-shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
          <span className="text-sm text-gray-400 italic group-hover:text-[#015280]">+ Add link</span>
        </div>
        {flash === 'error' && <span className="text-xs text-red-500 flex-shrink-0">!</span>}
      </button>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-1 py-1.5">
      {icon && <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 leading-none mb-0.5">{label}</p>
        <a
          href={saved.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-[#015280] hover:underline truncate block"
          title={saved.url}
        >
          {saved.text || saved.url}
        </a>
      </div>
      <button
        type="button"
        onClick={() => { setDraft(saved.url); setEditing(true); }}
        title="Edit link"
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 transition-opacity flex-shrink-0"
      >
        <Pencil className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {flash === 'saved' && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
      {flash === 'error' && <span className="text-xs text-red-500 flex-shrink-0">!</span>}
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
  onSaved,
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
  /** Called with the new value after a successful save — lets the parent update
   *  local state live (e.g. so the ShipHero Name unlocks notifications). */
  onSaved?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [savedValue, setSavedValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'saved' | 'error' | null>(null);
  const [copied, setCopied] = useState(false);
  const sync = useNotificationSync();

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
    // No-op if nothing changed — still exit edit mode so blur behaves normally.
    if (value === savedValue) { setEditing(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, value }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[EditField] save failed: ${columnId} status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      // Contact email add/change → offer to enroll it in notifications
      // (savedValue is still the pre-save value here).
      if (isContactEmailColumn(columnId)) sync.onContactEmailChanged(savedValue, value);
      setSavedValue(value);
      onSaved?.(value);
      setFlash('saved');
      // Brief "Saved ✓" pause on the button before closing edit mode, so the
      // user actually sees the confirmation.
      setTimeout(() => setEditing(false), 600);
    } catch (err) {
      console.error(`[EditField] save error: ${columnId}`, err);
      // Don't revert — keep the user's typing in the textarea so they can
      // retry. The error message and red "!" tell them it didn't persist.
      setFlash('error');
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 3000);
    }
  }, [value, savedValue, columnId, clientId, sync]);

  // Only show amber highlight when the field is empty
  const isHighlighted = !!(highlight && !value);

  const { csMode, editing: sectionEditing } = useFieldMode();
  // CS view mode: hide empty fields, show filled ones as a clean read row.
  if (csMode && !sectionEditing && !editing) {
    if (!value) return null;
    return <ReadRow label={label} value={value} icon={icon} />;
  }

  if (editing) {
    const baseClass = 'w-full text-sm border border-[#43c7ff] rounded px-2 py-1 mt-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white';
    const dirty = value !== savedValue;
    const cancel = () => { setValue(savedValue); setEditing(false); };
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
              // Auto-save on blur is the convenience path; the explicit Save
              // button is the guaranteed path. Both go through the same
              // dedupe so users get one save per change.
              onBlur={save}
              autoFocus
              rows={3}
              className={baseClass + ' resize-y'}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); save(); }
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              }}
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
                if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              }}
            />
          )}
          {/* Explicit Save / Cancel — users asked for a clear save button so
              they don't have to rely on focus-blur behavior, which is brittle
              in side panels, modals, and on touch devices. */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <button
              type="button"
              onMouseDown={e => e.preventDefault()} // keep textarea focused so save reads latest value
              onClick={save}
              disabled={saving || !dirty}
              className="px-2.5 py-1 text-[11px] font-semibold rounded bg-[#015280] text-white hover:bg-[#013d60] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Saving…' : flash === 'saved' ? 'Saved ✓' : 'Save'}
            </button>
            <button
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={cancel}
              disabled={saving}
              className="px-2.5 py-1 text-[11px] font-medium rounded text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            {flash === 'error' && <span className="text-[11px] text-red-600 font-medium">Save failed — check console</span>}
            <span className="text-[10px] text-gray-400 ml-auto">
              {multiline ? '⌘+Enter to save' : 'Enter to save'} · Esc to cancel
            </span>
          </div>
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
        {/* Value + an ALWAYS-visible copy button sitting right next to it, so
            it's obvious the value can be copied (rather than a faint icon far
            off at the row's edge). The pencil/edit affordance stays on the
            right, hover-only. */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/<[a-z][\s\S]*>/i.test(value) ? (
            <div
              className="text-sm text-gray-900 min-w-0 [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-1 [&_li]:mb-0.5 [&_strong]:font-semibold [&_p]:mb-1"
              dangerouslySetInnerHTML={{ __html: value }}
            />
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words text-gray-900 min-w-0">{value}</p>
          )}
          {copyable && value && (
            <button
              type="button"
              onClick={handleCopy}
              title={`Copy ${label}`}
              className="flex-shrink-0 p-0.5 rounded text-[#43c7ff] hover:text-[#015280] hover:bg-[#d0f2ff] transition-colors"
            >
              {copied
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy className="w-3.5 h-3.5" />
              }
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
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

  const { csMode, editing } = useFieldMode();
  // CS view mode: hide contacts with no info; show the rest as clean read
  // rows (the inner fields self-render read-only via context). Drop the
  // collapsible / Make-Primary / hub-add chrome — those are edit affordances.
  if (csMode && !editing) {
    if (isEmpty) return null;
    return (
      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide pt-1 pb-0.5">{label}</p>
        <div className="space-y-0.5">
          <EditField label="Name"  value={name}  columnId={nameCol}  clientId={clientId} copyable />
          <EditField label="Email" value={email} columnId={emailCol} clientId={clientId} icon={<Mail className="w-3.5 h-3.5" />} copyable />
          <EditField label="Phone" value={phone} columnId={phoneCol} clientId={clientId} icon={<Phone className="w-3.5 h-3.5" />} copyable />
          {shipHeroCol && <EditField label="ShipHero Access?" value={shipHeroAccess} columnId={shipHeroCol} clientId={clientId} />}
        </div>
      </div>
    );
  }

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
  const [preview, setPreview] = useState(false);
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

  const previewFile: PreviewableFile | null = file
    ? { name: file.name, url: file.url || '', fileType: file.fileExtension, assetId: file.assetId }
    : null;
  // Inline preview modal (PDF / image) — same popup behavior as the Documents
  // and ACH sections, so reps review the contract in place without a new tab.
  const modal = <FilePreviewModal file={preview ? previewFile : null} onClose={() => setPreview(false)} />;
  const fileChip = file ? (
    <button
      type="button"
      onClick={() => setPreview(true)}
      title={`Preview ${file.name}`}
      className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[#43c7ff]/40 bg-[#e6f8ff] text-[#015280] hover:bg-[#d0f2ff] hover:border-[#43c7ff] transition-colors group"
    >
      <FileText className="w-4 h-4 flex-shrink-0" />
      <span className="text-xs font-medium max-w-[140px] truncate">{file.name}</span>
      <Eye className="w-3.5 h-3.5 flex-shrink-0 opacity-60 group-hover:opacity-100" />
    </button>
  ) : null;

  const { csMode, editing } = useFieldMode();
  if (csMode && !editing) {
    if (!file) return null;
    return (
      <div className="flex items-start gap-2 px-1 py-1.5">
        <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-400 leading-none mb-1">{label}</p>
          {fileChip}
        </div>
        {modal}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-1 py-1.5">
      <FileText className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-gray-400 leading-none mb-1">{label}</p>
        <div className="flex items-center gap-2 flex-wrap">
          {fileChip ?? <span className="text-sm text-gray-300 italic">No document</span>}
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
      {modal}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
// ─── Billing address (Billing Info tab) ──────────────────────────────────────
// Shows the full billing address on one line (street, city, state, zip,
// country). An explicit Edit button reveals the individual fields — each is a
// normal EditField that PATCHes its own Monday column and reports back so the
// composed line refreshes. Kept self-contained (its own edit toggle) so it
// works the same in both the CS and Onboarding surfaces.
function BillingAddressBlock({
  client,
  clientId,
  onSaved,
}: {
  client: ClientInfo;
  clientId: string;
  onSaved: (patch: Partial<ClientInfo>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const cityStateZip = [
    [client.billingCity, client.billingState].filter(Boolean).join(', '),
    client.billingZip,
  ].filter(s => s && s.trim()).join(' ');
  const composed = [
    client.billingStreet1,
    client.billingStreet2,
    cityStateZip,
    client.billingCountry,
  ].map(s => (s || '').trim()).filter(Boolean).join(', ');

  if (editing) {
    return (
      <div className="mt-1 mb-0.5 rounded-lg border border-gray-200 bg-gray-50/50 p-1.5">
        <div className="flex items-center justify-between px-1 mb-0.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Billing Address
          </p>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#013d60] px-2.5 py-0.5 rounded-full transition-colors"
          >
            Done
          </button>
        </div>
        <EditField label="Street 1" value={client.billingStreet1} columnId="text_mkx5vzht" clientId={clientId} highlight onSaved={v => onSaved({ billingStreet1: v })} />
        <EditField label="Street 2" value={client.billingStreet2} columnId="text_mkx5f9p9" clientId={clientId} onSaved={v => onSaved({ billingStreet2: v })} />
        <EditField label="City" value={client.billingCity} columnId="text_mkx5z70k" clientId={clientId} highlight onSaved={v => onSaved({ billingCity: v })} />
        <EditField label="State" value={client.billingState} columnId="text_mkx5er1a" clientId={clientId} highlight onSaved={v => onSaved({ billingState: v })} />
        <EditField label="Zip Code" value={client.billingZip} columnId="text_mkx5tjd7" clientId={clientId} highlight onSaved={v => onSaved({ billingZip: v })} />
        <EditField label="Country" value={client.billingCountry} columnId="text_mkx5kyv4" clientId={clientId} highlight onSaved={v => onSaved({ billingCountry: v })} />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 px-1 py-1.5">
      <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] leading-none mb-0.5 text-gray-400">🏠 Billing Address</p>
        {composed ? (
          <p className="text-sm text-gray-900 break-words">{composed}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">No billing address on file</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Edit billing address"
        className="flex-shrink-0 self-center text-[11px] font-semibold text-[#0071BC] hover:bg-[#e6f8ff] px-2 py-0.5 rounded-full transition-colors inline-flex items-center gap-1"
      >
        <Pencil className="w-3 h-3" /> Edit
      </button>
    </div>
  );
}

// A single "Coming soon" row for the Payment Method card (ACH / credit card).
function ComingSoonRow({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      {icon && <span className="text-gray-400 flex-shrink-0">{icon}</span>}
      <span className="text-sm text-gray-600 flex-1">{label}</span>
      <span className="text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 rounded-full px-2 py-0.5 flex-shrink-0">
        Coming soon
      </span>
    </div>
  );
}

// "Extract from DocuSign" action for the Pricing Info header. Disabled (with an
// explanatory tooltip) when the client has no DocuSign contract on file.
function ExtractFromDocusignButton({
  hasFile,
  extracting,
  flash,
  onClick,
}: {
  hasFile: boolean;
  extracting: boolean;
  flash: 'ok' | 'none' | 'nofile' | 'err' | null;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {flash === 'ok' && <span className="text-[11px] text-green-600 font-medium">Filled from contract ✓</span>}
      {flash === 'none' && <span className="text-[11px] text-gray-400">No pricing found</span>}
      {flash === 'nofile' && <span className="text-[11px] text-amber-600">No agreement on file</span>}
      {flash === 'err' && <span className="text-[11px] text-red-500">Extract failed</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={!hasFile || extracting}
        title={hasFile ? 'Read the pricing (Statement of Work) from the signed DocuSign contract' : 'No DocuSign contract on file to extract from'}
        className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-white bg-[#015280] hover:bg-[#013d60]"
      >
        {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {extracting ? 'Extracting…' : 'Extract from DocuSign'}
      </button>
    </div>
  );
}

export function ClientInfoTab({ client, fullscreen, forceSingleColumn = false, hideHeader = false, hideContactInfo = false, onboardingItemId, deliveredDate, inventoryDelivered, onNameChange, onDeliveredDateSaved, onEstimatedDeliveryDateSaved, customerService = false, billingOnly = false, projects = [], onOpenProject, onCreateProject }: ClientInfoTabProps) {
  // The "two-column-per-section" layout is the standard fullscreen treatment
  // when the panel is the only thing on screen. The CS expanded view sets
  // forceSingleColumn so the right half of the screen can host its own
  // panels (sticky notes + metrics) instead of the second column of fields.
  const useTwoColumnSections = fullscreen && !forceSingleColumn;
  const id = client.id;

  // Who may see DocuSign (and therefore the EIN + DocuSign document). In the
  // Customer Service surface, reps without this access see only "on file /
  // not on file" indicators; the real values are redacted server-side.
  const { data: session } = useSession();
  const canDocusign = Boolean(session?.user?.canDocusign);
  const restrictSensitive = customerService && !canDocusign;

  // Column options fetched once from Monday.com (status/dropdown labels)
  const [colOptions, setColOptions] = useState<Record<string, string[]>>({});
  // Attachment counts per section — powers the paperclip badge on
  // each collapsed Section header. Fetched once on mount; not
  // refetched on upload (badge is best-effort awareness, the actual
  // list in SectionDocuments always live-refreshes after a save).
  const [attachmentCounts, setAttachmentCounts] = useState<Record<string, number>>({
    documents: 0, receiving: 0, packing: 0, returns: 0,
  });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // Files (Monday file columns) + categorized links (docs long_text
    // column) both count toward the paperclip badge. Either fetch can
    // soft-fail independently without zeroing the other's counts.
    Promise.all([
      fetch(`/api/client/${encodeURIComponent(id)}/section-files/all`)
        .then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/documents/${encodeURIComponent(id)}`)
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([files, docs]: [Array<{ category?: string }>, Array<{ category?: string }>]) => {
        if (cancelled) return;
        const next: Record<string, number> = { documents: 0, receiving: 0, packing: 0, returns: 0 };
        for (const f of Array.isArray(files) ? files : []) {
          const cat = f.category ?? '';
          if (cat in next) next[cat] += 1;
        }
        for (const d of Array.isArray(docs) ? docs : []) {
          const cat = d.category ?? '';
          // Uncategorized links belong to the Docs tab only — they
          // don't badge any section.
          if (cat && cat !== 'documents' && cat in next) next[cat] += 1;
        }
        setAttachmentCounts(next);
      });
    return () => { cancelled = true; };
  }, [id]);
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

  // "Extract from DocuSign" (Pricing Info) — reads the Statement of Work out of
  // the signed contract and writes the pricing columns server-side, then merges
  // the saved values into local state so the fields reflect them immediately.
  const [extractingPricing, setExtractingPricing] = useState(false);
  const [pricingFlash, setPricingFlash] = useState<'ok' | 'none' | 'nofile' | 'err' | null>(null);
  const extractPricingFromDocusign = useCallback(async (assetIdOverride?: string) => {
    const assetId = assetIdOverride || localClient.docusignFile?.assetId || '';
    // Run off the existing on-file agreement: send the assetId when we have it,
    // otherwise the server resolves it from Monday via the onboarding item.
    if (!assetId && !onboardingItemId) return;
    if (extractingPricing) return;
    setExtractingPricing(true);
    setPricingFlash(null);
    try {
      const res = await fetch(`/api/client/${id}/extract-pricing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId, onboardingItemId }),
      });
      if (res.status === 404) { setPricingFlash('nofile'); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const saved = (data?.saved ?? {}) as Partial<ClientInfo>;
      if (Object.keys(saved).length > 0) {
        setLocalClient(prev => ({ ...prev, ...saved }));
        setPricingFlash('ok');
      } else {
        setPricingFlash('none');
      }
    } catch (err) {
      console.error('[extract-pricing] failed:', err);
      setPricingFlash('err');
    } finally {
      setExtractingPricing(false);
      setTimeout(() => setPricingFlash(null), 4000);
    }
  }, [id, localClient.docusignFile?.assetId, onboardingItemId, extractingPricing]);

  // On a NEW DocuSign upload, offer to pull the pricing from it. If the client
  // already has pricing on file, confirm before overwriting; otherwise extract
  // straight away. Declining keeps the existing pricing (the upload still ran).
  const [pendingDocusignAsset, setPendingDocusignAsset] = useState<string | null>(null);
  const handleDocusignUploaded = useCallback((newFile: MonFile) => {
    const assetId = newFile?.assetId;
    if (!assetId) return;
    const hasPricing = PRICING_FIELDS.some(f => String(localClient[f] ?? '').trim());
    if (hasPricing) setPendingDocusignAsset(assetId);
    else void extractPricingFromDocusign(assetId);
  }, [localClient, extractPricingFromDocusign]);

  // Overwrite-confirm dialog for the DocuSign upload → pricing extraction flow.
  // Rendered in BOTH the Billing tab and the main view so a DocuSign uploaded
  // from either surface can prompt before overwriting existing pricing.
  const pricingOverwriteDialog = pendingDocusignAsset ? (
    <ConfirmDialog
      title="Overwrite existing pricing?"
      description={
        <>
          This client already has pricing on file. Pull the pricing from the DocuSign you just uploaded and replace the current values?
          <br />
          Choose <strong>Cancel</strong> to keep the existing pricing — the contract is uploaded either way.
        </>
      }
      confirmLabel="Overwrite with new pricing"
      busy={extractingPricing}
      onCancel={() => setPendingDocusignAsset(null)}
      onConfirm={() => {
        const a = pendingDocusignAsset;
        if (!a) return;
        void extractPricingFromDocusign(a).finally(() => setPendingDocusignAsset(null));
      }}
    />
  ) : null;

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

  // ── Billing Info tab — a curated, access-gated subset of billing fields.
  // Rendered directly editable (no CS read/edit toggle): the tab is only shown
  // to DocuSign-access viewers, so EIN + the contract are never redacted here.
  if (billingOnly) {
    return (
      <div className="p-3 overflow-y-auto h-full bg-[#F2F2F7]">
        <Section title="General Billing Info" icon={<Receipt className="w-4 h-4 text-[#0071BC]" />} defaultOpen>
            <EditField label="🚢 ShipHero Name" value={localClient.shipHeroName} columnId="text_mkw9n26z" clientId={id} highlight onSaved={v => setLocalClient(prev => ({ ...prev, shipHeroName: v }))} />
            <EditField label="🆔 ShipHero Customer Account ID" value={localClient.shipHeroId} columnId="text_mktmf2yw" clientId={id} highlight onSaved={v => setLocalClient(prev => ({ ...prev, shipHeroId: v }))} />
            <SelectField label="🏢 Umbrella Company" value={localClient.umbrellaCompany} columnId="dropdown_mkyk2va7" clientId={id} options={colOptions['dropdown_mkyk2va7'] ?? []} valueType="dropdown" icon={<Landmark className="w-3.5 h-3.5" />} />
            <EditField label="📋 Name of Legal Entity" value={localClient.legalEntity} columnId="text_mktp4fvk" clientId={id} highlight onSaved={v => setLocalClient(prev => ({ ...prev, legalEntity: v }))} />
            {restrictSensitive ? (
              <OnFileField label="🔢 EIN" onFile={!!localClient.einOnFile} columnId="text_mkxxfg1b" clientId={id} noun="EIN" editable />
            ) : (
              <EditField label="🔢 EIN" value={localClient.ein} columnId="text_mkxxfg1b" clientId={id} highlight onSaved={v => setLocalClient(prev => ({ ...prev, ein: v }))} />
            )}
            <EditField label="💼 QuickBooks Company Name" value={localClient.quickbooksName} columnId="text_mkx5b9b4" clientId={id} onSaved={v => setLocalClient(prev => ({ ...prev, quickbooksName: v }))} />
            <EditField label="📧 Email for Invoices" value={localClient.invoicingEmail} columnId="text_mktqjmmm" clientId={id} icon={<Mail className="w-3.5 h-3.5" />} highlight onSaved={v => setLocalClient(prev => ({ ...prev, invoicingEmail: v }))} />
            <BillingAddressBlock client={localClient} clientId={id} onSaved={patch => setLocalClient(prev => ({ ...prev, ...patch }))} />
            {restrictSensitive ? (
              <OnFileField label="📄 DocuSign Contract" onFile={!!localClient.docusignOnFile} columnId="" clientId={id} noun="DocuSign" icon={<FileText className="w-3.5 h-3.5" />} />
            ) : (
              <FileField
                label="📄 DocuSign Contract"
                file={localClient.docusignFile}
                columnId="files"
                clientId={onboardingItemId || id}
                onUploaded={newFile => { setLocalClient(prev => ({ ...prev, docusignFile: newFile })); handleDocusignUploaded(newFile); }}
              />
            )}
            <DateField label="🖊️ Date DocuSign Signed" value={localClient.dateDocusignSigned} columnId="date_mkw2fhte" clientId={id} icon={<Calendar className="w-3.5 h-3.5" />} />
            {onboardingItemId && (
              <DateField
                label="✅ Delivered Date"
                value={deliveredDate || ''}
                columnId="date__1"
                clientId={id}
                icon={<Calendar className="w-3.5 h-3.5" />}
                patchUrl={`/api/onboarding/${onboardingItemId}`}
                onSaved={onDeliveredDateSaved}
                labelTooltip="This data is accurate as of 07/01/2026. Date the initial inventory arrived to our warehouse."
              />
            )}
        </Section>

        {/* Payment method — ACH is read from the Client Billing Info board
            (matched by client name); card capture is not built yet. */}
        <Section title="Payment Method" icon={<CreditCard className="w-4 h-4 text-[#0071BC]" />} defaultOpen>
          <ClientAchInfo clientBoardItemId={id} clientName={localClient.name} />
          <div className="border-t border-gray-100 my-1.5" />
          <ComingSoonRow label="Credit Card" icon={<CreditCard className="w-3.5 h-3.5" />} />
        </Section>

        {/* Pricing Info — 3PL rates from the DocuSign Statement of Work (last
            page). Each field maps to a dedicated Monday column; "Extract from
            DocuSign" reads them out of the signed contract and saves them. Shown
            in two columns so it reads as a grid, not one long list. */}
        <Section
          title="Pricing Info"
          icon={<Tag className="w-4 h-4 text-[#0071BC]" />}
          defaultOpen
          headerAction={
            <ExtractFromDocusignButton
              hasFile={!!(localClient.docusignFile?.assetId || onboardingItemId)}
              extracting={extractingPricing}
              flash={pricingFlash}
              onClick={() => { void extractPricingFromDocusign(); }}
            />
          }
        >
          <div className="grid grid-cols-2 gap-x-3">
            <EditField label="📥 Receiving Pricing" value={localClient.receivingPricing} columnId="text_mm5hpark" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, receivingPricing: v }))} />
            <EditField label="🚛 Floor Loaded Unloading Fee" value={localClient.floorLoadedFee} columnId="text_mm5hxygd" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, floorLoadedFee: v }))} />
            <EditField label="🗄️ Bin Storage" value={localClient.binStorage} columnId="text_mm5hwtkt" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, binStorage: v }))} />
            <EditField label="🟫 Pallet Storage" value={localClient.palletStorage} columnId="text_mm5h6606" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, palletStorage: v }))} />
            <EditField label="🏬 DTC Pick & Pack" value={localClient.dtcPickPackPricing} columnId="text_mm5hc2dg" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, dtcPickPackPricing: v }))} />
            <EditField label="🏭 B2B Pick & Pack" value={localClient.b2bPickPack} columnId="text_mm5h4938" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, b2bPickPack: v }))} />
            <EditField label="🚚 Shipping Upcharge" value={localClient.shippingUpcharge} columnId="text_mm5h681j" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, shippingUpcharge: v }))} />
            <EditField label="🌐 Intl Shipping Upcharge" value={localClient.intlShippingUpcharge} columnId="text_mm5h1w32" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, intlShippingUpcharge: v }))} />
            <EditField label="↩️ Returns Fee" value={localClient.returnsFee} columnId="text_mm5hzk9n" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, returnsFee: v }))} />
            <EditField label="👤 Dedicated Account Manager Fee" value={localClient.accountManagerFee} columnId="text_mm5hb9" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, accountManagerFee: v }))} />
            <EditField label="🧾 Platform Fee" value={localClient.platformFee} columnId="text_mm5hq2xy" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, platformFee: v }))} />
            <EditField label="📆 Payment Terms" value={localClient.paymentTerms} columnId="text_mm5hgn1k" clientId={id} placeholder="Net 4" onSaved={v => setLocalClient(prev => ({ ...prev, paymentTerms: v }))} />
          </div>
          <div className="border-t border-gray-100 mt-1 pt-1">
            <EditField label="📝 Other Notes / Promotions" value={localClient.otherNotes} columnId="long_text_mm5hy744" clientId={id} multiline onSaved={v => setLocalClient(prev => ({ ...prev, otherNotes: v }))} />
          </div>
        </Section>

        {pricingOverwriteDialog}
      </div>
    );
  }

  return (
    <CsModeContext.Provider value={customerService}>
    <div className="p-3 overflow-y-auto h-full bg-[#F2F2F7]">

      {/* Compact sticky-notes preview at the top of Client Info, for
          the side-panel view only. The fullscreen view already renders
          the full draggable StickyNotesPanel on the right, so this
          summary would be a duplicate there. Renders nothing when
          there are no notes / setup is incomplete either way. */}
      {id && !fullscreen && <ClientStickyNotesSummary clientBoardItemId={id} />}

      {/* Projects for this client — side-panel (non-expanded) view. The
          expanded view renders its own box in the right column, so gate this
          to !fullscreen to avoid a duplicate. CS only. */}
      {!fullscreen && customerService && onOpenProject && (
        <div className="mb-3">
          <ClientProjectsBox
            projects={projects}
            clientBoardItemId={id || null}
            clientName={localClient.name}
            onOpenProject={onOpenProject}
            onCreateProject={onCreateProject}
          />
        </div>
      )}

      {/* ── Client Name (editable — renames both boards) ── */}
      {!hideHeader && (
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
      )}

      {/* ── General Account Info ── */}
      <Section title="General Account Info">
        <div className={useTwoColumnSections ? 'grid grid-cols-2 gap-x-4 items-start' : ''}>

          {/* ── Primary column (always visible) ── */}
          <div>
            <EditField label="🚢 ShipHero Name" value={localClient.shipHeroName} columnId="text_mkw9n26z" clientId={id} highlight onSaved={v => setLocalClient(prev => ({ ...prev, shipHeroName: v }))} />
            <EditField label="🆔 ShipHero Customer Account ID" value={localClient.shipHeroId} columnId="text_mktmf2yw" clientId={id} highlight />
            <SelectField label="💳 Payment on File?" value={localClient.paymentOnFile} columnId="dropdown_mm47xxjv" clientId={id} options={colOptions['dropdown_mm47xxjv'] ?? ['Yes', 'No']} valueType="dropdown" highlight />
            <SelectField label="⭐ AppDot / Portal" value={localClient.portalDropdown} columnId="dropdown_mktrbeyg" clientId={id} options={colOptions['dropdown_mktrbeyg'] ?? []} valueType="dropdown" highlight />
            <SelectField label="⭐ Product Category" value={localClient.productCategory} columnId="color_mktq81r3" clientId={id} options={colOptions['color_mktq81r3'] ?? []} valueType="status" />
            <EditField label="📦 Product Description" value={localClient.productDescription} columnId="long_text_mktqtxm" clientId={id} multiline />
            <SelectField label="🏭 Warehouse Location" value={localClient.warehouseLocation} columnId="dropdown_mktxaege" clientId={id} options={colOptions['dropdown_mktxaege'] ?? []} valueType="dropdown" icon={<MapPin className="w-3.5 h-3.5" />} highlight />
            <SelectField label="📦 Sub Warehouse" value={localClient.subWarehouse} columnId="dropdown_mm5ftdxb" clientId={id} options={colOptions['dropdown_mm5ftdxb'] ?? []} valueType="dropdown" />
            <EditField label="🏗️ Where They Manufacture" value={localClient.manufacturingLocation} columnId="text_mktxyg5p" clientId={id} />
            <SelectField label="🟢 Client Status" value={localClient.clientStatus} columnId="color_mkvq7kn6" clientId={id} options={colOptions['color_mkvq7kn6'] ?? []} valueType="status" />
            <ReadField label="⏱️ Time as Client (Days)" value={localClient.timeAsClientDays} />
            <EditField label="🌟 Interest in Additional Services" value={localClient.interestInAdditionalServices} columnId="text_mkw2y8q9" clientId={id} />
            <SelectField label="🏢 Umbrella Company" value={localClient.umbrellaCompany} columnId="dropdown_mkyk2va7" clientId={id} options={colOptions['dropdown_mkyk2va7'] ?? []} valueType="dropdown" />
            <LinkField
              label="🔗 Pricing Proposal"
              value={localClient.pricingProposal}
              columnId="link_mktqh0sq"
              clientId={id}
              icon={<ExternalLink className="w-3.5 h-3.5" />}
              onSaved={next => setLocalClient(prev => ({ ...prev, pricingProposal: next }))}
            />
          </div>

          {/* ── Secondary column (fullscreen: right column; non-fullscreen: below) ── */}
          {/* key=billingVersion forces remount of EditFields after extraction populates values */}
          <div className={useTwoColumnSections ? '' : 'mt-1'} key={billingVersion}>
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
            {/* EIN — hidden from CS reps without DocuSign access; they see only
                an on-file indicator and can blindly add/replace it. */}
            {restrictSensitive ? (
              <OnFileField
                label="🔢 EIN"
                onFile={!!localClient.einOnFile}
                columnId="text_mkxxfg1b"
                clientId={id}
                noun="EIN"
                editable
              />
            ) : (
              <EditField label="🔢 EIN" value={localClient.ein} columnId="text_mkxxfg1b" clientId={id} highlight />
            )}

            {/* DocuSign file — hidden from CS reps without DocuSign access; they
                see only "on file / not on file" (read-only). */}
            {restrictSensitive ? (
              <OnFileField
                label="📄 Docusign / Contract"
                onFile={!!localClient.docusignOnFile}
                columnId=""
                clientId={id}
                noun="DocuSign"
                icon={<FileText className="w-3.5 h-3.5" />}
              />
            ) : (
              <FileField
                label="📄 Docusign / Contract"
                file={localClient.docusignFile}
                columnId="files"
                clientId={onboardingItemId || id}
                onUploaded={newFile => {
                  setLocalClient(prev => ({ ...prev, docusignFile: newFile }));
                  // Auto-run billing extraction (legal / EIN / address) and the
                  // pricing extraction (Statement of Work) off the new file.
                  handleExtractBilling(newFile.assetId);
                  handleDocusignUploaded(newFile);
                }}
              />
            )}

            {/* Date DocuSign Signed — visible to everyone */}
            <DateField
              label="Date DocuSign Signed"
              value={localClient.dateDocusignSigned}
              columnId="date_mkw2fhte"
              clientId={id}
              icon={<Calendar className="w-3.5 h-3.5" />}
            />

            {/* Copy Billing Info button — onboarding only (not needed in CS),
                and only when a DocuSign file exists. */}
            {!customerService && localClient.docusignFile && (
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

      {/* ── Contact Info ── (hidden when the parent ClientHeader renders contacts at the top) */}
      {!hideContactInfo && (
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
      )}

      {/* ── Receiving ── */}
      <Section title="Receiving" attachmentCount={attachmentCounts.receiving}>
        <DateField
          label="Initial Inventory Est. Delivery Date"
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
        <SectionDocuments
          clientBoardItemId={id}
          category="receiving"
          label="Receiving Documents"
          hint="Attach anything the receiving team needs — labels, quality checks, etc. Also appears in the general Docs tab."
        />
      </Section>

      {/* ── Packing & Shipping Requirements ── */}
      <Section title="Packing & Shipping Requirements" attachmentCount={attachmentCounts.packing}>
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
        <SelectField label="🏷️ Outside Labels?" value={localClient.outsideLabels} columnId="dropdown_mm47p3h7" clientId={id} options={colOptions['dropdown_mm47p3h7'] ?? ['Yes', 'No']} valueType="dropdown" />
        <SelectField label="🚚 Shipping Method" value={localClient.shippingMethod} columnId="dropdown_mktzcdg0" clientId={id} options={colOptions['dropdown_mktzcdg0'] ?? []} valueType="dropdown" />
        <EditField label="🔒 Additional Insurance / Signature" value={localClient.additionalInsuranceSignature} columnId="text_mktrs0xa" clientId={id} />
        <EditField label="🏪 Wholesale Details" value={localClient.wholesaleDetails} columnId="text_mkw5t2ey" clientId={id} />
        <EditField label="🚛 Outbound LTL" value={localClient.outboundLTL} columnId="text_mkw5bdr2" clientId={id} />
        <EditField label="🗄️ Estimated Inventory Storage" value={localClient.estimatedStorage} columnId="text_mkw4czc2" clientId={id} />
        <EditField label="📝 Additional Notes" value={localClient.additionalNotes} columnId="long_text_mktran3x" clientId={id} multiline />
        <EditField label="📝 Additional Shipping Requirement Notes" value={localClient.additionalShippingNotes} columnId="long_text_mkwy13zg" clientId={id} multiline />
        <EditField label="📝 Notes for Packing" value={localClient.notesForPacking} columnId="long_text_mkxfv1hr" clientId={id} multiline />
        <SectionDocuments
          clientBoardItemId={id}
          category="packing"
          label="Packing Documents"
          hint="Attach anything the packing team needs — inserts, labels, packaging specs. Also appears in the general Docs tab."
        />
      </Section>

      {/* ── Returns Specifications ── */}
      <Section title="Returns Specifications" defaultOpen={false} attachmentCount={attachmentCounts.returns}>
        <SelectField label="⭐ Product Category" value={localClient.productCategory} columnId="color_mktq81r3" clientId={id} options={colOptions['color_mktq81r3'] ?? []} valueType="status" />
        <SelectField label="🔄 Returns Process" value={localClient.returnsProcess} columnId="color_mkxfrgba" clientId={id} options={colOptions['color_mkxfrgba'] ?? []} valueType="status" />
        <EditField label="📝 Notes for Returns" value={localClient.notesForReturns} columnId="long_text_mkxeajq4" clientId={id} multiline />
        <SelectField label="❓ Returns - Incomplete Condition" value={localClient.returnsIncompleteCondition} columnId="color_mkzf33yv" clientId={id} options={colOptions['color_mkzf33yv'] ?? []} valueType="status" />
        <SelectField label="💔 Returns - Damaged Condition" value={localClient.returnsDamagedCondition} columnId="color_mkxfa9h5" clientId={id} options={colOptions['color_mkxfa9h5'] ?? []} valueType="status" />
        <SelectField label="✨ Returns - New Condition" value={localClient.returnsNewCondition} columnId="color_mkxfkdyh" clientId={id} options={colOptions['color_mkxfkdyh'] ?? []} valueType="status" />
        <SelectField label="♻️ Returns - Used Condition" value={localClient.returnsUsedCondition} columnId="color_mkxfxdx5" clientId={id} options={colOptions['color_mkxfxdx5'] ?? []} valueType="status" />
        <SectionDocuments
          clientBoardItemId={id}
          category="returns"
          label="Returns Reference Documents"
          hint="Attach anything returns needs — RMAs, quality specs, damage handling. Also appears in the general Docs tab."
        />
      </Section>

      {/* ── E-mail notifications ── Sits after Returns; collapsed by default,
          with a Yes/No status on the collapsed header so an active
          notification is visible without expanding. */}
      {id && <EmailNotificationsSection clientBoardItemId={id} client={localClient} />}

      {/* ── ShipBots Support Portal Login ──
          Same design language as the contact cards: a subtle white card
          with a soft border, a compact title row with an icon anchor, and
          the two credentials side-by-side. The old design was a large
          two-tone cyan block with an ALL-CAPS shouty banner; this reads
          as one row of the info panel instead of a floating badge.
          When there's no data yet, each credential field renders a
          "+ Add" affordance (csAddable) instead of collapsing to null.
          If the AppDot/Portal picker also doesn't include Portal, we
          surface a small enrollment note so the rep knows why. */}
      <section className="rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)] p-3 mb-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#EAF3FA] text-[#0071BC] flex items-center justify-center">
              <LogIn className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 leading-tight">Portal Login</p>
              <p className="text-[11px] text-gray-500 leading-tight">shipbots.com/portal</p>
            </div>
          </div>
          <a
            href="https://www.shipbots.com/portal"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071BC] hover:bg-[#EAF3FA] px-2 py-1 rounded-md"
            title="Open portal in new tab"
          >
            <ExternalLink className="w-3 h-3" />
            Open
          </a>
        </div>
        {/* If no credentials are on file AND the AppDot/Portal picker
            doesn't include "Portal", the client hasn't been enrolled
            in the client portal. Surface that instead of silently
            showing empty +Add fields so reps aren't left wondering. */}
        {(!localClient.portalLogin && !localClient.portalPassword
          && !(localClient.portalDropdown ?? '').toLowerCase().split(',').map(s => s.trim()).includes('portal')
        ) && (
          <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[12px] text-amber-900">
            Client is currently not enrolled in the client portal.
          </div>
        )}
        {/* 3fr / 2fr split: emails are typically 2× the length of
            passwords, so give the login column the extra room. Both
            still truncate at very long values (tooltip shows full). */}
        <div
          className="grid gap-x-3"
          style={{ gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)' }}
        >
          <CopyableEditField
            label="Login Email / Username"
            value={localClient.portalLogin}
            columnId="text_mktxxfch"
            clientId={id}
            icon={<Mail className="w-3.5 h-3.5" />}
            csAddable
          />
          {/* Password is intentionally NOT `secret` — reps read it out to
              customers over calls and don't want the extra reveal click. */}
          <CopyableEditField
            label="Password"
            value={localClient.portalPassword}
            columnId="text_mm28cz4g"
            clientId={id}
            icon={<KeyRound className="w-3.5 h-3.5" />}
            csAddable
          />
        </div>
      </section>

      {pricingOverwriteDialog}
    </div>
    </CsModeContext.Provider>
  );
}
