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
  User, ClipboardList,
} from 'lucide-react';

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
      <div className="overflow-y-auto max-h-72 min-h-[3rem]">
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
    return tasks.filter(t => {
      const isMine = (t.assigneeEmails || []).some(e => e.toLowerCase() === email)
        || (t.assignee || '').toLowerCase().includes(email);
      if (!isMine) return false;
      return !isDoneStatus(t.status) && !completed.has(t.id);
    });
  }, [tasks, currentUserEmail, completed]);

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
        <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 leading-none ${
          mine.length ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'
        }`}>{mine.length}</span>
      </div>
      <div className="overflow-y-auto max-h-80 min-h-[3rem]">
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
    </section>
  );
}

// ─── Bottom: all in-progress clients + status (list view) ────────────────────
function InProgressList({
  items, agentEmailMap, onSelectItem,
}: {
  items: OnboardingItem[];
  agentEmailMap: Record<string, string>;
  onSelectItem: (item: OnboardingItem) => void;
}) {
  const stageOrder = useMemo(() => {
    const o: Record<string, number> = {};
    PIPELINE_STAGES.forEach((s, i) => { o[s.status] = i; });
    return o;
  }, []);
  const sorted = useMemo(() =>
    [...items].sort((a, b) =>
      (stageOrder[a.status] ?? 99) - (stageOrder[b.status] ?? 99)
      || (a.name || '').localeCompare(b.name || '')),
    [items, stageOrder],
  );
  const agentFor = (i: OnboardingItem) => (i.clientBoardItemId ? (agentEmailMap[i.clientBoardItemId] ?? '') : '');

  return (
    <section className={CARD}>
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
        <User className="w-4 h-4 text-[#0071BC] flex-shrink-0" />
        <span className="text-[13px] font-semibold text-gray-800 flex-1">Clients in Progress</span>
        <span className="text-xs text-gray-500 font-medium">{items.length}</span>
      </div>
      <div className="overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-sm text-gray-400">No clients are currently in progress.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr className="text-[11px] uppercase tracking-wider text-gray-500">
                <th className="px-4 py-2 font-semibold">Client</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Agent</th>
                <th className="px-4 py-2 font-semibold">Progress</th>
                <th className="px-4 py-2 font-semibold">Est. Delivery</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(item => {
                const st = statusStyle(item.status);
                const agent = agentFor(item);
                return (
                  <tr
                    key={item.id}
                    onClick={() => onSelectItem(item)}
                    className="border-b border-gray-100 cursor-pointer hover:bg-[#f0fbff] transition-colors"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">{item.name || '(unnamed)'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center text-[11px] font-semibold rounded-full px-2 py-0.5"
                        style={{ color: st.color, backgroundColor: st.bg }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {agent
                        ? <span className="text-xs text-gray-700">{agentNameFromEmail(agent)}</span>
                        : <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Unassigned</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <span className="block h-full rounded-full bg-[#00c875]" style={{ width: `${item.progress}%` }} />
                        </span>
                        <span className="text-xs text-gray-500 tabular-nums">{item.progress}%</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">{formatDate(item.estimatedDeliveryDate) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <TasksBox
        tasks={tasks}
        loading={loadingTasks}
        currentUserEmail={currentUserEmail}
        itemsById={itemsById}
        onSelectItem={onSelectItem}
      />

      <InProgressList items={active} agentEmailMap={agentEmailMap} onSelectItem={onSelectItem} />
    </div>
  );
}
