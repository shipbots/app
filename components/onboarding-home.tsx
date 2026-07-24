'use client';

/**
 * Onboarding Home — an at-a-glance dashboard for the Onboarding app. Surfaces
 * clients that are missing something (no agent, past-due delivery, summary not
 * sent, a custom checklist step) plus the signed-in user's outstanding tasks,
 * and a full list of every client currently in progress. Every row opens the
 * client in the side panel via onSelectItem (which sets selectedItem in the
 * PipelineBoard without fullscreen).
 */

import { useEffect, useMemo, useState } from 'react';
import type { OnboardingItem, SubItem, BoardInfo } from '@/lib/types';
import {
  CHECKLIST_STEPS, getStepState, PIPELINE_STAGES,
  INVENTORY_NEVER_ARRIVED_GROUP_ID, INVENTORY_NEVER_ARRIVED_STATUS,
} from '@/lib/constants';
import {
  UserX, CalendarClock, MailX, ListChecks, ChevronRight, Loader2, Check,
  User, ClipboardList, Plus, ArrowUpDown,
} from 'lucide-react';
import { CreateTaskModal } from './tasks-view';

// ─── stage helpers ──────────────────────────────────────────────────────────
// Terminal / non-active stages — a client here is not "in progress".
const TERMINAL = new Set<string>(['Completed', 'Abandoned', 'N/A', 'ZAP ERROR', INVENTORY_NEVER_ARRIVED_STATUS]);
const isNotStarted = (i: OnboardingItem) => i.status === 'Not Started';
const isTerminal = (i: OnboardingItem) =>
  TERMINAL.has(i.status) || i.groupId === INVENTORY_NEVER_ARRIVED_GROUP_ID;
// "In progress" = past the Not Started stage and not completed/terminal.
const isActive = (i: OnboardingItem) => !isNotStarted(i) && !isTerminal(i);

function parseYMD(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function formatDate(s: string | null): string {
  const d = parseYMD(s);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
}

// A checklist step counts as handled when it's done OR N/A (nothing to do).
function stepDone(item: OnboardingItem, stepId: string): boolean {
  const step = item.checklist.find(s => s.id === stepId);
  if (!step) return false;
  const st = getStepState(step.value, step.invertLogic, CHECKLIST_STEPS.find(c => c.id === stepId));
  return st === 'done' || st === 'na';
}
// Inventory is "received" once an actual delivered date exists, or the
// "Initial Inventory Delivered?" status reads as received.
function inventoryReceived(item: OnboardingItem): boolean {
  if (item.deliveredDate) return true;
  return /^(yes|received|delivered|arrived|complete)/i.test((item.inventoryDelivered || '').trim());
}
function statusStyle(status: string): { color: string; bg: string } {
  const s = PIPELINE_STAGES.find(p => p.status === status);
  return { color: s?.color ?? '#6b7280', bg: s?.bgColor ?? '#f3f4f6' };
}
function agentNameFromEmail(email: string): string {
  if (!email) return '';
  const local = email.split('@')[0] || '';
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : '';
}
const isDoneStatus = (s: string) => /(done|complete|finished)/i.test(s || '');

const CARD = 'rounded-2xl bg-white border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)] overflow-hidden flex flex-col';

// ─── Attention box: a titled card with a scrollable list of client rows ──────
function AttentionBox({
  title, icon, items, detail, emptyText, onSelectItem, headerExtra,
}: {
  title: string;
  icon: React.ReactNode;
  items: OnboardingItem[];
  detail: (item: OnboardingItem) => string;
  emptyText: string;
  onSelectItem: (item: OnboardingItem) => void;
  headerExtra?: React.ReactNode;
}) {
  return (
    <section className={CARD}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <span className="text-[#0071BC] flex-shrink-0">{icon}</span>
        <span className="text-[13px] font-semibold text-gray-800 flex-1 truncate">{title}</span>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 leading-none ${
          items.length ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'
        }`}>{items.length}</span>
      </div>
      {headerExtra}
      <div className="overflow-y-auto max-h-52 min-h-[3rem]">
        {items.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-gray-400">{emptyText}</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {items.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className="w-full text-left px-3.5 py-2 flex items-center gap-2 hover:bg-[#f0fbff] transition-colors group"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-gray-900 truncate">{item.name || '(unnamed)'}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{detail(item)}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#0071BC] flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Custom box: pick any checklist step → clients that haven't done it ──────
function CustomChecklistBox({
  activeItems, onSelectItem,
}: {
  activeItems: OnboardingItem[];
  onSelectItem: (item: OnboardingItem) => void;
}) {
  const [stepId, setStepId] = useState<string>(CHECKLIST_STEPS[0]?.id ?? '');
  const missing = useMemo(
    () => activeItems.filter(i => !stepDone(i, stepId)),
    [activeItems, stepId],
  );
  return (
    <AttentionBox
      title="Missing a Checklist Step"
      icon={<ListChecks className="w-4 h-4" />}
      items={missing}
      detail={i => `${i.status} · ${i.progress}%`}
      emptyText="Every in-progress client has done this step."
      onSelectItem={onSelectItem}
      headerExtra={
        <div className="px-3.5 py-2 border-b border-gray-100 bg-gray-50/60">
          <select
            value={stepId}
            onChange={e => setStepId(e.target.value)}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
          >
            {CHECKLIST_STEPS.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      }
    />
  );
}

// ─── My outstanding tasks box (with inline mark-complete) ────────────────────
function TasksBox({
  tasks, loading, currentUserEmail, itemsById, onSelectItem,
}: {
  tasks: SubItem[];
  loading: boolean;
  currentUserEmail: string | null;
  itemsById: Record<string, OnboardingItem>;
  onSelectItem: (item: OnboardingItem) => void;
}) {
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  // Tasks created from this box — merged in optimistically so a new task shows
  // immediately without waiting for the next full refresh.
  const [createdTasks, setCreatedTasks] = useState<SubItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/subitems/board-info')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled) setBoardInfo(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const mine = useMemo(() => {
    const email = (currentUserEmail || '').toLowerCase();
    if (!email) return [];
    const merged = [...tasks];
    for (const t of createdTasks) if (!merged.some(m => m.id === t.id)) merged.push(t);
    return merged
      .filter(t => {
        const isMine = (t.assigneeEmails || []).some(e => e.toLowerCase() === email)
          || (t.assignee || '').toLowerCase().includes(email);
        if (!isMine) return false;
        return !isDoneStatus(t.status) && !completed.has(t.id);
      })
      // Oldest first — the longest-outstanding tasks surface at the top as
      // priority. Undated (no createdAt) sort last.
      .sort((a, b) => (a.createdAt || '9999').localeCompare(b.createdAt || '9999'));
  }, [tasks, createdTasks, currentUserEmail, completed]);

  const markComplete = async (t: SubItem) => {
    if (!boardInfo || savingId) return;
    setSavingId(t.id);
    const doneOption = boardInfo.statusOptions?.find(o => isDoneStatus(o)) ?? 'Done';
    try {
      const res = await fetch(`/api/subitems/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: boardInfo.boardId,
          status: doneOption,
          statusColumnId: boardInfo.statusColumnId ?? undefined,
        }),
      });
      if (res.ok) setCompleted(prev => new Set(prev).add(t.id));
    } catch { /* leave it in the list to retry */ } finally {
      setSavingId(null);
    }
  };

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  return (
    <section className={CARD}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <ClipboardList className="w-4 h-4 text-[#0071BC] flex-shrink-0" />
        <span className="text-[13px] font-semibold text-gray-800 flex-1 truncate">My Outstanding Tasks</span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          title="Create a new task"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#015280] bg-[#e6f8ff] border border-[#43c7ff]/40 hover:bg-[#d5f2ff] px-2 py-1 rounded-full flex-shrink-0 transition-colors"
        >
          <Plus className="w-3 h-3" /> New
        </button>
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 leading-none ${
          mine.length ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'
        }`}>{mine.length}</span>
      </div>
      <div className="overflow-y-auto max-h-[24rem] min-h-[3rem]">
        {loading ? (
          <div className="px-3.5 py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tasks…
          </div>
        ) : mine.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-gray-400">You have no outstanding tasks. 🎉</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {mine.map(t => {
              const due = parseYMD(t.dueDate);
              const overdue = due && due < today;
              return (
                <li key={t.id} className="flex items-center gap-2 px-3.5 py-2">
                  <button
                    type="button"
                    onClick={() => { const it = itemsById[t.parentItemId]; if (it) onSelectItem(it); }}
                    className="min-w-0 flex-1 text-left group"
                  >
                    <span className="block text-[13px] font-medium text-gray-900 truncate">{t.name || '(untitled task)'}</span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {t.parentItemName || 'Client'}
                      {t.dueDate && (
                        <span className={overdue ? 'text-red-500 font-medium' : ''}> · due {formatDate(t.dueDate)}</span>
                      )}
                    </span>
                  </button>
                  {t.status && (
                    <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 flex-shrink-0 max-w-[120px] truncate">
                      {t.status}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void markComplete(t)}
                    disabled={savingId === t.id || !boardInfo}
                    title="Mark complete"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 px-2 py-1 rounded-full flex-shrink-0 disabled:opacity-50 transition-colors"
                  >
                    {savingId === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Done
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showCreate && (
        <CreateTaskModal
          items={Object.values(itemsById)}
          onClose={() => setShowCreate(false)}
          onCreated={(task) => {
            setCreatedTasks(prev => [...prev, task]);
            setShowCreate(false);
          }}
        />
      )}
    </section>
  );
}

// ─── Bottom: all in-progress clients + status (list view) ────────────────────
// Progress buckets for the completeness filter.
const PROGRESS_BUCKETS: { value: string; label: string; test: (p: number) => boolean }[] = [
  { value: 'all',      label: 'All completeness', test: () => true },
  { value: 'lt25',     label: 'Under 25%',        test: p => p < 25 },
  { value: '25to49',   label: '25–49%',           test: p => p >= 25 && p < 50 },
  { value: '50to74',   label: '50–74%',           test: p => p >= 50 && p < 75 },
  { value: '75to99',   label: '75–99%',           test: p => p >= 75 && p < 100 },
  { value: 'complete', label: '100%',             test: p => p >= 100 },
];

type SortKey = 'name' | 'status' | 'progress' | 'eta';

function InProgressList({
  items, agentEmailMap, onSelectItem,
}: {
  items: OnboardingItem[];
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const stageOrder = useMemo(() => {
    const o: Record<string, number> = {};
    PIPELINE_STAGES.forEach((s, i) => { o[s.status] = i; });
    return o;
  }, []);
  const agentFor = (i: OnboardingItem) => (i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '') : '');

  const [sortKey, setSortKey] = useState<SortKey>('status');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState('all');
  const [bucket, setBucket] = useState('all');

  // Statuses actually present, ordered by pipeline stage — powers the filter.
  const statuses = useMemo(() => {
    const present = Array.from(new Set(items.map(i => i.status).filter(Boolean)));
    return present.sort((a, b) => (stageOrder[a] ?? 99) - (stageOrder[b] ?? 99));
  }, [items, stageOrder]);

  const filtered = useMemo(() => {
    const b = PROGRESS_BUCKETS.find(x => x.value === bucket) ?? PROGRESS_BUCKETS[0];
    return items.filter(i =>
      (statusFilter === 'all' || i.status === statusFilter) && b.test(i.progress ?? 0),
    );
  }, [items, statusFilter, bucket]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortKey === 'status') cmp = (stageOrder[a.status] ?? 99) - (stageOrder[b.status] ?? 99);
      else if (sortKey === 'progress') cmp = (a.progress ?? 0) - (b.progress ?? 0);
      else if (sortKey === 'eta') {
        const da = a.estimatedDeliveryDate || '', db = b.estimatedDeliveryDate || '';
        // Undated rows always sort to the bottom, regardless of direction.
        if (!da && !db) cmp = 0;
        else if (!da) return 1;
        else if (!db) return -1;
        else cmp = da < db ? -1 : da > db ? 1 : 0;
      }
      if (cmp === 0) cmp = (a.name || '').localeCompare(b.name || '');
      return cmp * dir;
    });
  }, [filtered, sortKey, sortDir, stageOrder]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) { setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(k);
    setSortDir(k === 'progress' ? 'desc' : 'asc'); // progress reads best high→low
  };

  // Shared column template so header + rows line up. Compact so the four
  // columns fit the half-width card (side by side with the Tasks box).
  const GRID = 'grid items-center gap-2 grid-cols-[minmax(0,1fr)_auto_84px_60px]';

  const SortHead = ({ label, k, extra }: { label: string; k: SortKey; extra?: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800 transition-colors ${extra ?? ''}`}
    >
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortKey === k ? 'text-[#0071BC]' : 'text-gray-300'}`} />
      {sortKey === k && <span className="text-[#0071BC] text-[9px] leading-none">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <User className="w-4 h-4 text-[#0071BC] flex-shrink-0" />
        <span className="text-[13px] font-semibold text-gray-800">Clients in Progress</span>
        <span className="text-xs text-gray-500 font-medium">{filtered.length}{filtered.length !== items.length ? ` / ${items.length}` : ''}</span>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff] max-w-[150px]"
          >
            <option value="all">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={bucket}
            onChange={e => setBucket(e.target.value)}
            className="text-[11px] border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
          >
            {PROGRESS_BUCKETS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
          </select>
        </div>
      </div>

      {/* Column headers */}
      <div className={`${GRID} px-3.5 py-2 border-b border-gray-100 bg-gray-50/60`}>
        <SortHead label="Client" k="name" />
        <SortHead label="Status" k="status" />
        <SortHead label="Completeness" k="progress" />
        <SortHead label="Est. Delivery" k="eta" extra="justify-end" />
      </div>

      <div className="overflow-y-auto max-h-[26rem] min-h-[3rem]">
        {sorted.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-gray-400">
            {items.length === 0 ? 'No clients are currently in progress.' : 'No clients match these filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {sorted.map(item => {
              const st = statusStyle(item.status);
              const agent = agentFor(item);
              const eta = item.estimatedDeliveryDate;
              const etaDate = parseYMD(eta);
              const overdue = !!etaDate && etaDate < today && !inventoryReceived(item);
              const pct = item.progress ?? 0;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectItem(item)}
                    className={`${GRID} w-full text-left px-3.5 py-2 hover:bg-[#f0fbff] transition-colors`}
                  >
                    {/* Client + agent */}
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-gray-900 truncate">{item.name || '(unnamed)'}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{agent ? agentNameFromEmail(agent) : 'Unassigned'}</span>
                    </span>
                    {/* Status */}
                    <span>
                      <span
                        className="inline-flex items-center text-[10px] font-semibold rounded-full px-1.5 py-0.5"
                        style={{ color: st.color, backgroundColor: st.bg }}
                      >
                        {item.status}
                      </span>
                    </span>
                    {/* Completeness */}
                    <span className="flex items-center gap-1.5">
                      <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: pct >= 100 ? '#00c875' : pct >= 50 ? '#579bfc' : '#fdab3d' }}
                        />
                      </span>
                      <span className="text-[11px] font-semibold text-gray-600 tabular-nums w-7 text-right">{pct}%</span>
                    </span>
                    {/* Est. Delivery */}
                    <span className={`text-[11px] text-right tabular-nums ${overdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      {eta ? formatDate(eta) : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export function OnboardingHome({
  items, agentEmailMap, tasks, loadingTasks, currentUserEmail, onSelectItem,
}: {
  items: OnboardingItem[];
  agentEmailMap: Record<string, string>;
  tasks: SubItem[];
  loadingTasks: boolean;
  currentUserEmail: string | null;
  onSelectItem: (item: OnboardingItem) => void;
}) {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const active = useMemo(() => items.filter(isActive), [items]);
  const agentFor = (i: OnboardingItem) => (i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '') : '');
  const itemsById = useMemo(() => {
    const m: Record<string, OnboardingItem> = {};
    for (const i of items) m[i.id] = i;
    return m;
  }, [items]);

  const noAgent = useMemo(() => active.filter(i => !agentFor(i)), [active, agentEmailMap]);
  const pastDue = useMemo(() => active.filter(i => {
    const d = parseYMD(i.estimatedDeliveryDate);
    return d && d < today && !inventoryReceived(i);
  }), [active, today]);
  const summaryNotSent = useMemo(() => active.filter(i => !stepDone(i, 'color_mm27gvc0')), [active]);

  const daysLate = (i: OnboardingItem) => {
    const d = parseYMD(i.estimatedDeliveryDate);
    if (!d) return 0;
    return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86_400_000));
  };

  return (
    <div className="p-4 overflow-y-auto h-full bg-[#F2F2F7] space-y-4">
      {/* Four attention boxes in one row (smaller) so they fit a single screen. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <AttentionBox
          title="No Agent Assigned"
          icon={<UserX className="w-4 h-4" />}
          items={noAgent}
          detail={i => `${i.status} · ${i.progress}%`}
          emptyText="Every in-progress client has an agent."
          onSelectItem={onSelectItem}
        />
        <AttentionBox
          title="Past Due Deliveries"
          icon={<CalendarClock className="w-4 h-4" />}
          items={pastDue}
          detail={i => `Est. ${formatDate(i.estimatedDeliveryDate)} · ${daysLate(i)} day${daysLate(i) === 1 ? '' : 's'} late`}
          emptyText="No overdue inventory deliveries."
          onSelectItem={onSelectItem}
        />
        <AttentionBox
          title="Email Onboarding Summary Not Sent"
          icon={<MailX className="w-4 h-4" />}
          items={summaryNotSent}
          detail={i => `${agentNameFromEmail(agentFor(i)) || 'Unassigned'} · ${i.status}`}
          emptyText="All in-progress clients have their summary sent."
          onSelectItem={onSelectItem}
        />
        <CustomChecklistBox activeItems={active} onSelectItem={onSelectItem} />
      </div>

      {/* Outstanding tasks (bottom-left) + the sortable/filterable
          Clients-in-Progress table (bottom-right), side by side. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <TasksBox
          tasks={tasks}
          loading={loadingTasks}
          currentUserEmail={currentUserEmail}
          itemsById={itemsById}
          onSelectItem={onSelectItem}
        />
        <InProgressList items={active} agentEmailMap={agentEmailMap} onSelectItem={onSelectItem} />
      </div>
    </div>
  );
}
