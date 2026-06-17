'use client';

/**
 * "Browse by Client" view for the Customer Service surface.
 *
 * Layout:
 *   ┌────────────────────────────────────────┬─────────────┐
 *   │ My Clients  (assigned to me)           │             │
 *   │ ┌────────────────────────────────────┐ │ My Tasks    │
 *   │ │ Client | Account Mgr | Main Contact│ │             │
 *   │ └────────────────────────────────────┘ │ (subitems   │
 *   │                                        │  assigned   │
 *   │ All Clients                            │  to me)     │
 *   │ ┌────────────────────────────────────┐ │             │
 *   │ │ Client | Account Mgr | Main Contact│ │             │
 *   │ └────────────────────────────────────┘ │             │
 *   └────────────────────────────────────────┴─────────────┘
 *
 * Top table = clients where the signed-in CS agent is the assigned account
 * manager (agentEmailMap[clientId] matches session email).
 * Bottom table = every client, so reps can still cover for each other.
 *
 * Hovering the "Main Contact" cell opens a popover with full name, email,
 * and phone — each with a copy-to-clipboard button. Contact details are
 * fetched lazily via /api/client/[clientBoardItemId] and cached per session.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { OnboardingItem, SubItem, ClientInfo } from '@/lib/types';
import { Users, CheckSquare, User, Copy, Check, Mail, Phone, Loader2, Search, ChevronsUpDown, ChevronUp, ChevronDown, Filter, X } from 'lucide-react';

// ── Sort config used by both client tables ──────────────────────────────────
type SortColumn = 'client' | 'manager' | 'contact' | 'portal';
type SortDir = 'asc' | 'desc';
type SortConfig = { column: SortColumn; dir: SortDir };

const UNASSIGNED_KEY = '__unassigned__';

function compareStrings(a: string, b: string, dir: SortDir): number {
  // Empty strings go to the bottom in ASC, top in DESC — so unassigned /
  // missing values aren't interleaved with real names.
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const r = a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  return dir === 'asc' ? r : -r;
}

// Shape returned by /api/clients/search-index — denormalized for cross-field search.
type ClientIndexEntry = {
  id: string;
  name: string;
  legalEntity: string;
  storeName: string;
  shipHeroName: string;
  // Primary / secondary / tertiary contacts — search spans all three so reps
  // can find a client by any contact's name, email, or phone.
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contact2Name: string;
  contact2Email: string;
  contact2Phone: string;
  contact3Name: string;
  contact3Email: string;
  contact3Phone: string;
  /** AppDot / Portal dropdown label — shown as its own table column. */
  portal: string;
};

interface ClientsViewProps {
  items: OnboardingItem[];
  allTasks: SubItem[];
  loadingTasks: boolean;
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
  /** Signed-in CS agent — used to filter "My Clients" and "My Tasks". */
  currentUserEmail: string | null;
  currentUserName: string | null;
}

// ── Contact cache (module-level so navigating between tabs reuses it) ────────
const contactCache: Record<string, Pick<ClientInfo, 'contactName' | 'contactEmail' | 'contactPhone'> | 'loading' | 'error'> = {};

function useClientContact(clientBoardItemId: string | null, enabled: boolean) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!enabled || !clientBoardItemId) return;
    if (contactCache[clientBoardItemId]) return;
    contactCache[clientBoardItemId] = 'loading';
    force(n => n + 1);
    fetch(`/api/client/${clientBoardItemId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((data: ClientInfo) => {
        contactCache[clientBoardItemId] = {
          contactName: data.contactName ?? '',
          contactEmail: data.contactEmail ?? '',
          contactPhone: data.contactPhone ?? '',
        };
        force(n => n + 1);
      })
      .catch(() => {
        contactCache[clientBoardItemId] = 'error';
        force(n => n + 1);
      });
  }, [clientBoardItemId, enabled]);

  return clientBoardItemId ? contactCache[clientBoardItemId] : undefined;
}

// ── Copyable inline field ────────────────────────────────────────────────────
function CopyField({ icon, value, href, label }: { icon: React.ReactNode; value: string; href?: string; label: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400">
        <span className="flex-shrink-0">{icon}</span>
        <span>No {label.toLowerCase()}</span>
      </div>
    );
  }
  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 group">
      <span className="flex-shrink-0 text-gray-400">{icon}</span>
      {href ? (
        <a
          href={href}
          className="text-xs text-gray-700 truncate flex-1 hover:text-[#015280] hover:underline"
          onClick={e => e.stopPropagation()}
        >
          {value}
        </a>
      ) : (
        <span className="text-xs text-gray-700 truncate flex-1">{value}</span>
      )}
      <button
        type="button"
        onClick={copy}
        title={`Copy ${label.toLowerCase()}`}
        className="flex-shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-opacity"
      >
        {copied ? (
          <Check className="w-3 h-3 text-green-600" />
        ) : (
          <Copy className="w-3 h-3 text-gray-400" />
        )}
      </button>
    </div>
  );
}

// ── Hover card showing the main contact details ─────────────────────────────
function ContactHoverCard({
  clientBoardItemId,
  clientName,
  anchor,
}: {
  clientBoardItemId: string | null;
  clientName: string;
  anchor: { top: number; left: number };
}) {
  const contact = useClientContact(clientBoardItemId, true);
  const loading = contact === 'loading' || contact === undefined;
  const error = contact === 'error';
  const data = loading || error ? null : contact;

  return (
    <div
      // Render in a portal-ish fixed overlay so it escapes any overflow:hidden
      // parent in the table.
      style={{ position: 'fixed', top: anchor.top, left: anchor.left, zIndex: 60 }}
      className="w-72 bg-white border border-gray-200 rounded-xl shadow-xl p-3 pointer-events-auto"
      // Prevent the card from disappearing when the cursor moves over it.
      onMouseEnter={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
        <div className="w-7 h-7 rounded-full bg-[#e6f8ff] flex items-center justify-center text-[#015280] flex-shrink-0">
          <User className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400 leading-tight">Main contact for</p>
          <p className="text-sm font-semibold text-gray-900 truncate">{clientName}</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400 py-3 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading contact…
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 py-3 text-center">
          Could not load contact details
        </p>
      )}

      {data && (
        <div className="space-y-0.5">
          <div className="px-2 py-1.5 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            {data.contactName ? (
              <span className="text-xs font-medium text-gray-900 truncate">{data.contactName}</span>
            ) : (
              <span className="text-xs text-gray-400">No name on file</span>
            )}
          </div>
          <CopyField
            icon={<Mail className="w-3.5 h-3.5" />}
            value={data.contactEmail}
            href={data.contactEmail ? `mailto:${data.contactEmail}` : undefined}
            label="Email"
          />
          <CopyField
            icon={<Phone className="w-3.5 h-3.5" />}
            value={data.contactPhone}
            href={data.contactPhone ? `tel:${data.contactPhone.replace(/[^\d+]/g, '')}` : undefined}
            label="Phone"
          />
        </div>
      )}
    </div>
  );
}

// ── Cell that shows just the name and pops the hover card ───────────────────
function ContactCell({
  clientBoardItemId,
  clientName,
}: {
  clientBoardItemId: string | null;
  clientName: string;
}) {
  // Pre-warm cached contact so the cell can show the name without hovering.
  const cached = clientBoardItemId ? contactCache[clientBoardItemId] : undefined;
  const cachedData = cached && cached !== 'loading' && cached !== 'error' ? cached : null;

  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const r = cellRef.current?.getBoundingClientRect();
    if (!r) return;
    // Position below the cell; clamp to viewport.
    const top = Math.min(r.bottom + 4, window.innerHeight - 240);
    const left = Math.min(r.left, window.innerWidth - 296);
    setAnchor({ top, left });
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setAnchor(null), 120);
  }, []);

  // Pick what to render in the cell:
  //   • Real contact name once it's cached (the common path after the search
  //     index lands).
  //   • "View contact" before the cache loads — encourages hover, which then
  //     triggers the per-client fetch as a fallback.
  //   • "No name on file" when there's a Clients board link but the contact
  //     field is empty — tells the rep there's nothing to look up.
  //   • "No contact" when there's no Clients board link at all (rare; stub).
  const label = (() => {
    if (!clientBoardItemId) return 'No contact';
    if (cachedData) return cachedData.contactName || 'No name on file';
    return 'View contact';
  })();
  const isPlaceholder = label === 'View contact' || label === 'No name on file' || label === 'No contact';

  return (
    <>
      <div
        ref={cellRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1.5 cursor-default px-1.5 py-0.5 rounded hover:bg-gray-100"
      >
        <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className={`text-sm truncate max-w-[220px] ${isPlaceholder ? 'text-gray-400 italic' : 'text-gray-800'}`}>
          {label}
        </span>
      </div>
      {anchor && clientBoardItemId && (
        <div onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }} onMouseLeave={hide}>
          <ContactHoverCard
            clientBoardItemId={clientBoardItemId}
            clientName={clientName}
            anchor={anchor}
          />
        </div>
      )}
    </>
  );
}

// ── Client row in the table ─────────────────────────────────────────────────
function ClientRow({
  item,
  agentEmail,
  portal,
  onSelect,
}: {
  item: OnboardingItem;
  agentEmail: string;
  /** AppDot / Portal label from the search index; empty when unknown / not on file. */
  portal: string;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className="hover:bg-[#f0fbff] cursor-pointer transition-colors border-b border-gray-100"
    >
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm text-gray-900 truncate">{item.name}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        {agentEmail ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">
            <User className="w-3 h-3 text-gray-400" />
            <span className="truncate max-w-[180px]">{agentEmail}</span>
          </span>
        ) : (
          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            Unassigned
          </span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <ContactCell
          clientBoardItemId={item.clientBoardItemId}
          clientName={item.name}
        />
      </td>
      <td className="px-4 py-2.5">
        {portal ? (
          <span className="text-sm text-gray-800 truncate max-w-[220px] inline-block" title={portal}>
            {portal}
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">—</span>
        )}
      </td>
    </tr>
  );
}

// ── Sortable column header ──────────────────────────────────────────────────
function SortHeader({
  label,
  column,
  sort,
  onChange,
}: {
  label: string;
  column: SortColumn;
  sort: SortConfig;
  onChange: (next: SortConfig) => void;
}) {
  const active = sort.column === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  const toggle = () => {
    if (!active) onChange({ column, dir: 'asc' });
    else if (sort.dir === 'asc') onChange({ column, dir: 'desc' });
    else onChange({ column: 'client', dir: 'asc' }); // third click resets to default
  };
  return (
    <th className="px-4 py-2">
      <button
        type="button"
        onClick={toggle}
        title={active ? `Sorted ${sort.dir === 'asc' ? 'A→Z' : 'Z→A'} — click to ${sort.dir === 'asc' ? 'reverse' : 'reset'}` : 'Sort by ' + label}
        className={`inline-flex items-center gap-1 select-none uppercase tracking-wider text-[11px] font-semibold transition-colors ${
          active ? 'text-[#015280]' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
        <Icon className={`w-3 h-3 ${active ? 'text-[#015280]' : 'text-gray-400'}`} />
      </button>
    </th>
  );
}

// ── Account Manager multi-select dropdown ───────────────────────────────────
function ManagerFilterButton({
  managers,
  selected,
  onChange,
}: {
  /** Display name → email (or UNASSIGNED_KEY). Empty email shows as "Unassigned". */
  managers: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filteredManagers = useMemo(() => {
    if (!query) return managers;
    const q = query.toLowerCase();
    return managers.filter(m => m.toLowerCase().includes(q) || (m === UNASSIGNED_KEY && 'unassigned'.includes(q)));
  }, [managers, query]);

  const toggle = (m: string) => {
    const next = new Set(selected);
    if (next.has(m)) next.delete(m);
    else next.add(m);
    onChange(next);
  };

  const selectAll = () => onChange(new Set(managers));
  const clearAll = () => onChange(new Set());

  const activeCount = selected.size;
  const isActive = activeCount > 0 && activeCount < managers.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
          isActive
            ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        <Filter className="w-3 h-3" />
        Account Manager
        {isActive && (
          <span className="ml-0.5 text-[10px] font-bold bg-[#015280] text-white rounded-full px-1.5 py-0.5 leading-none">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl w-72 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter managers…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
              />
            </div>
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <button type="button" onClick={selectAll} className="text-[#015280] hover:underline font-medium">
                Select all
              </button>
              <span className="text-gray-300">·</span>
              <button type="button" onClick={clearAll} className="text-gray-500 hover:underline">
                Clear
              </button>
              <span className="ml-auto text-gray-400">{activeCount} of {managers.length}</span>
            </div>
          </div>
          <div className="overflow-y-auto max-h-72">
            {filteredManagers.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400 text-center">No managers found</p>
            ) : (
              filteredManagers.map(m => {
                const isSelected = selected.has(m);
                return (
                  <label
                    key={m}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(m)}
                      className="rounded border-gray-300 text-[#015280] focus:ring-[#43c7ff]"
                    />
                    {m === UNASSIGNED_KEY ? (
                      <span className="text-amber-600 italic">Unassigned</span>
                    ) : (
                      <span className="truncate text-gray-700">{m}</span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Client table ────────────────────────────────────────────────────────────
function ClientTable({
  title,
  subtitle,
  emptyMessage,
  items,
  agentEmailMap,
  searchIndex,
  onSelectItem,
  sort,
  onSortChange,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  emptyMessage: string;
  items: OnboardingItem[];
  agentEmailMap: Record<string, string>;
  /** Keyed by clientBoardItemId — gives the table the AppDot/Portal value
   *  and the cached contact name for sort/display without re-fetching. */
  searchIndex: Record<string, ClientIndexEntry> | null;
  onSelectItem: (item: OnboardingItem) => void;
  sort: SortConfig;
  onSortChange: (next: SortConfig) => void;
  /** Optional extra controls rendered next to the count (e.g. Account
   *  Manager filter on the All Clients table). */
  headerExtra?: React.ReactNode;
}) {
  const portalFor = (clientBoardItemId: string | null) =>
    clientBoardItemId ? (searchIndex?.[clientBoardItemId]?.portal ?? '') : '';

  // Map each item to a tuple of sort keys so we don't recompute strings per
  // comparison call.
  const sorted = useMemo(() => {
    const contactNameFor = (clientBoardItemId: string | null) => {
      if (!clientBoardItemId) return '';
      const cached = contactCache[clientBoardItemId];
      if (!cached || cached === 'loading' || cached === 'error') return '';
      return cached.contactName ?? '';
    };
    const decorated = items.map(item => ({
      item,
      client: item.name ?? '',
      manager: item.clientBoardItemId ? (agentEmailMap[item.clientBoardItemId] ?? '') : '',
      contact: contactNameFor(item.clientBoardItemId),
      portal: portalFor(item.clientBoardItemId),
    }));
    decorated.sort((a, b) => compareStrings(a[sort.column], b[sort.column], sort.dir));
    return decorated.map(d => d.item);
    // searchIndex is intentionally a dep so a freshly-loaded index re-sorts
    // by portal value without a manual refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sort, agentEmailMap, searchIndex]);

  return (
    <section className="flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden flex-1 min-h-0">
      <header className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0 gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {headerExtra}
          <span className="text-xs text-gray-500 font-medium">{items.length} client{items.length === 1 ? '' : 's'}</span>
        </div>
      </header>
      <div className="overflow-auto flex-1">
        {items.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-400">{emptyMessage}</div>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
              <tr>
                <SortHeader label="Client" column="client" sort={sort} onChange={onSortChange} />
                <SortHeader label="Account Manager" column="manager" sort={sort} onChange={onSortChange} />
                <SortHeader label="Main Contact" column="contact" sort={sort} onChange={onSortChange} />
                <SortHeader label="AppDot / Portal" column="portal" sort={sort} onChange={onSortChange} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => (
                <ClientRow
                  key={item.id}
                  item={item}
                  agentEmail={item.clientBoardItemId ? (agentEmailMap[item.clientBoardItemId] ?? '') : ''}
                  portal={portalFor(item.clientBoardItemId)}
                  onSelect={() => onSelectItem(item)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Right sidebar: My Tasks ─────────────────────────────────────────────────
function MyTasksPanel({
  tasks,
  loading,
  currentUserName,
  currentUserEmail,
  items,
  onSelectClient,
}: {
  tasks: SubItem[];
  loading: boolean;
  currentUserName: string | null;
  currentUserEmail: string | null;
  items: OnboardingItem[];
  onSelectClient: (item: OnboardingItem) => void;
}) {
  const myTasks = useMemo(() => {
    const meEmail = (currentUserEmail ?? '').toLowerCase();
    const meName = (currentUserName ?? '').toLowerCase();
    if (!meEmail && !meName) return [];
    return tasks.filter(t => {
      // Prefer structured assignee email match — that's what the new "Assigned"
      // dropdown writes.
      if (meEmail && (t.assigneeEmails ?? []).some(e => e.toLowerCase() === meEmail)) {
        return true;
      }
      // Fall back to substring on the legacy assignee text field so tasks
      // assigned via Monday's people column (or before this feature) still
      // surface for the right person.
      const a = (t.assignee ?? '').toLowerCase();
      if (meEmail && a.includes(meEmail)) return true;
      if (meName && a.includes(meName)) return true;
      return false;
    });
  }, [tasks, currentUserName, currentUserEmail]);

  const itemsById = useMemo(() => {
    const m: Record<string, OnboardingItem> = {};
    for (const it of items) m[it.id] = it;
    return m;
  }, [items]);

  return (
    <aside className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-0">
      <header className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
        <CheckSquare className="w-4 h-4 text-[#015280]" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">My Tasks</h2>
          <p className="text-[11px] text-gray-500 truncate">
            {currentUserName ? `Assigned to ${currentUserName}` : 'No user signed in'}
          </p>
        </div>
        <span className="text-xs text-gray-500 font-medium">{myTasks.length}</span>
      </header>
      <div className="overflow-y-auto flex-1">
        {loading && (
          <div className="flex items-center gap-2 px-4 py-6 text-xs text-gray-400 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading tasks…
          </div>
        )}
        {!loading && myTasks.length === 0 && (
          <div className="px-4 py-8 text-center">
            <CheckSquare className="w-6 h-6 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">No tasks assigned to you</p>
          </div>
        )}
        {!loading && myTasks.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {myTasks.map(task => {
              const client = itemsById[task.parentItemId];
              const overdue = task.dueDate && new Date(task.dueDate) < new Date(new Date().toDateString());
              const done = task.status.toLowerCase().includes('done') || task.status.toLowerCase().includes('complete');
              return (
                <li
                  key={task.id}
                  onClick={() => client && onSelectClient(client)}
                  className="px-4 py-2.5 hover:bg-[#f0fbff] cursor-pointer transition-colors"
                >
                  <p className={`text-xs font-medium leading-snug ${done ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {task.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500 flex-wrap">
                    <span className="truncate max-w-[160px]">{task.parentItemName}</span>
                    {task.dueDate && (
                      <span className={`px-1.5 py-0.5 rounded font-medium ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                        {task.dueDate}
                      </span>
                    )}
                    {!done && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{task.status}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

// ── Main view ───────────────────────────────────────────────────────────────
export function ClientsView({
  items,
  allTasks,
  loadingTasks,
  agentEmailMap,
  onSelectItem,
  currentUserEmail,
  currentUserName,
}: ClientsViewProps) {
  const [query, setQuery] = useState('');
  const me = (currentUserEmail ?? '').toLowerCase();

  // Lazily fetch the cross-field search index (legal name, store name,
  // ShipHero name, contact name/email/phone) and keep it keyed by Clients
  // board item id for O(1) lookup during filtering.
  const [searchIndex, setSearchIndex] = useState<Record<string, ClientIndexEntry> | null>(null);
  const [indexStatus, setIndexStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setIndexStatus('loading');
    fetch('/api/clients/search-index')
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then((rows: ClientIndexEntry[]) => {
        if (cancelled) return;
        const map: Record<string, ClientIndexEntry> = {};
        for (const r of rows) {
          map[r.id] = r;
          // Pre-warm the contact hover cache so the cell can show the real
          // contact name immediately, and hovering doesn't trigger a second
          // fetch. The full /api/client/{id} payload has extra fields we
          // don't use here, but contact name/email/phone is everything the
          // hover card actually renders.
          if (!contactCache[r.id]) {
            contactCache[r.id] = {
              contactName: r.contactName,
              contactEmail: r.contactEmail,
              contactPhone: r.contactPhone,
            };
          }
        }
        setSearchIndex(map);
        setIndexStatus('ready');
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[clients-view] search index fetch failed:', err);
        setIndexStatus('error');
      });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    const digits = q.replace(/\D+/g, '');

    const phoneMatches = (raw: string) => {
      if (!raw) return false;
      const phone = raw.toLowerCase();
      if (phone.includes(q)) return true;
      // Strip non-digits on both sides so "555 123" finds "+1 (555) 123-4567".
      return Boolean(digits && phone.replace(/\D+/g, '').includes(digits));
    };

    return items.filter(i => {
      // Always match against the working client name we already have in
      // memory — works even before the search index loads.
      if (i.name.toLowerCase().includes(q)) return true;

      // Cross-field search needs the lazy index. Until it loads, fall back
      // to name-only and let the loading indicator explain.
      const entry = i.clientBoardItemId ? searchIndex?.[i.clientBoardItemId] : undefined;
      if (!entry) return false;

      // Business-name fields
      if (entry.legalEntity.toLowerCase().includes(q)) return true;
      if (entry.storeName.toLowerCase().includes(q)) return true;
      if (entry.shipHeroName.toLowerCase().includes(q)) return true;

      // Primary contact
      if (entry.contactName.toLowerCase().includes(q)) return true;
      if (entry.contactEmail.toLowerCase().includes(q)) return true;
      if (phoneMatches(entry.contactPhone)) return true;

      // Secondary contact
      if (entry.contact2Name.toLowerCase().includes(q)) return true;
      if (entry.contact2Email.toLowerCase().includes(q)) return true;
      if (phoneMatches(entry.contact2Phone)) return true;

      // Tertiary contact
      if (entry.contact3Name.toLowerCase().includes(q)) return true;
      if (entry.contact3Email.toLowerCase().includes(q)) return true;
      if (phoneMatches(entry.contact3Phone)) return true;

      return false;
    });
  }, [items, query, searchIndex]);

  const myClients = useMemo(() => {
    if (!me) return [];
    return filtered.filter(i => {
      const agent = i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '').toLowerCase() : '';
      return agent === me;
    });
  }, [filtered, agentEmailMap, me]);

  // ── Sort state — independent per table so a rep can leave 'My Clients'
  //    sorted by main contact while reordering 'All Clients' by manager.
  const [mySort, setMySort] = useState<SortConfig>({ column: 'client', dir: 'asc' });
  const [allSort, setAllSort] = useState<SortConfig>({ column: 'client', dir: 'asc' });

  // ── All Clients: Account Manager multi-select ──
  // Every unique email that appears as an account manager, plus a sentinel
  // for unassigned clients. Sorted alphabetically with Unassigned pinned
  // at the bottom for easy scanning.
  const managers = useMemo(() => {
    const set = new Set<string>();
    let hasUnassigned = false;
    for (const i of items) {
      const email = i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '') : '';
      if (email) set.add(email);
      else hasUnassigned = true;
    }
    const list = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (hasUnassigned) list.push(UNASSIGNED_KEY);
    return list;
  }, [items, agentEmailMap]);

  const [selectedManagers, setSelectedManagers] = useState<Set<string>>(new Set());

  const filteredForAll = useMemo(() => {
    if (selectedManagers.size === 0) return filtered;
    return filtered.filter(i => {
      const email = i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '') : '';
      return selectedManagers.has(email || UNASSIGNED_KEY);
    });
  }, [filtered, selectedManagers, agentEmailMap]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 p-4 gap-3">
      {/* Sub-header: search */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Users className="w-4 h-4 text-[#015280]" />
          <span className="font-semibold">Browse by Client</span>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, email, phone, any contact, store, ShipHero, legal name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff] bg-white"
          />
          {indexStatus !== 'ready' && (
            <p className="absolute top-full mt-1 text-[10px] text-gray-400 flex items-center gap-1">
              {indexStatus === 'loading' && (
                <>
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Loading search index — only client name searchable until ready
                </>
              )}
              {indexStatus === 'error' && (
                <span className="text-red-500">
                  Search index unavailable — falling back to client name only
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Two-column layout: stacked client tables on the left, tasks on the right */}
      <div className="flex-1 flex gap-3 min-h-0">
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          <ClientTable
            title="My Clients"
            subtitle={me ? `Account Manager: ${currentUserEmail}` : 'Sign in to see your assigned clients'}
            emptyMessage={
              me
                ? 'No clients currently assigned to you. The bottom table shows everyone else.'
                : 'Sign in to see clients assigned to you.'
            }
            items={myClients}
            agentEmailMap={agentEmailMap}
            searchIndex={searchIndex}
            onSelectItem={onSelectItem}
            sort={mySort}
            onSortChange={setMySort}
          />
          <ClientTable
            title="All Clients"
            subtitle="Every client — for browsing and covering for other reps"
            emptyMessage={query ? 'No clients match your filter.' : 'No clients found.'}
            items={filteredForAll}
            agentEmailMap={agentEmailMap}
            searchIndex={searchIndex}
            onSelectItem={onSelectItem}
            sort={allSort}
            onSortChange={setAllSort}
            headerExtra={
              <div className="flex items-center gap-2">
                {selectedManagers.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedManagers(new Set())}
                    title="Clear manager filter"
                    className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                    Clear
                  </button>
                )}
                <ManagerFilterButton
                  managers={managers}
                  selected={selectedManagers}
                  onChange={setSelectedManagers}
                />
              </div>
            }
          />
        </div>
        <MyTasksPanel
          tasks={allTasks}
          loading={loadingTasks}
          currentUserName={currentUserName}
          currentUserEmail={currentUserEmail}
          items={items}
          onSelectClient={onSelectItem}
        />
      </div>
    </div>
  );
}
