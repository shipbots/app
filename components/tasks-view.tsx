'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { OnboardingItem, SubItem, BoardInfo } from '@/lib/types';
import {
  CheckSquare, Square, Plus, X, User, Calendar, AlertCircle,
  ChevronDown, ChevronRight, Filter, Loader2, Search, Pencil,
} from 'lucide-react';
import { EditTaskModal } from './edit-task-modal';
import { AssigneePicker } from './assignee-picker';
import { useSession } from 'next-auth/react';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isDone(status: string): boolean {
  const s = status.toLowerCase();
  return s.includes('done') || s.includes('complete') || s.includes('finished');
}

function isOverdue(iso: string): boolean {
  if (!iso) return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

function statusCls(status: string): string {
  const s = status.toLowerCase();
  if (isDone(s)) return 'bg-green-100 text-green-700';
  if (s.includes('progress') || s.includes('working') || s.includes('doing')) return 'text-[#015280] bg-[#e6f8ff]';
  if (s.includes('stuck') || s.includes('blocked')) return 'bg-red-100 text-red-700';
  if (s.includes('review') || s.includes('pending') || s.includes('waiting')) return 'bg-yellow-100 text-yellow-700';
  return 'bg-gray-100 text-gray-600';
}

// ─── Single task row ──────────────────────────────────────────────────────────
function TaskRow({
  task,
  showClient,
  onClientClick,
  onEdit,
}: {
  task: SubItem;
  showClient: boolean;
  onClientClick: (id: string) => void;
  onEdit: (task: SubItem) => void;
}) {
  const done = isDone(task.status);
  const overdue = !done && isOverdue(task.dueDate);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
      {done
        ? <CheckSquare className="w-4 h-4 text-green-500 flex-shrink-0" />
        : <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
      }

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.name}
        </p>
        {showClient && (
          <button
            onClick={() => onClientClick(task.parentItemId)}
            className="text-xs hover:underline text-[#015280] truncate block"
          >
            {task.parentItemName}
          </button>
        )}
      </div>

      {task.status && (
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${statusCls(task.status)}`}>
          {task.status}
        </span>
      )}

      {task.assignee && (
        <span className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
          <User className="w-3 h-3" />
          {task.assignee}
        </span>
      )}

      {task.dueDate && (
        <span className={`flex items-center gap-1 text-xs font-medium flex-shrink-0 ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
          {overdue ? <AlertCircle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
          {fmtDate(task.dueDate)}
        </span>
      )}

      <button
        onClick={() => onEdit(task)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-200 rounded flex-shrink-0"
        title="Edit task"
      >
        <Pencil className="w-3.5 h-3.5 text-gray-500" />
      </button>
    </div>
  );
}

// ─── Section ─────────────────────────────────────────────────────────────────
function TaskSection({
  title,
  tasks,
  accent,
  defaultOpen = true,
  showClient,
  onClientClick,
  onEdit,
}: {
  title: string;
  tasks: SubItem[];
  accent: string;
  defaultOpen?: boolean;
  showClient: boolean;
  onClientClick: (id: string) => void;
  onEdit: (task: SubItem) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 mb-2 group w-full text-left"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
        <span className={`text-sm font-semibold ${accent}`}>{title}</span>
        <span className="ml-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </button>

      {open && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              showClient={showClient}
              onClientClick={onClientClick}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────

export function CreateTaskModal({
  items,
  defaultClientId,
  onClose,
  onCreated,
}: {
  items: OnboardingItem[];
  defaultClientId?: string;
  onClose: () => void;
  onCreated: (task: SubItem) => void;
}) {
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(defaultClientId ?? '');
  const [showClientList, setShowClientList] = useState(false);
  const [taskName, setTaskName] = useState('');
  const [status, setStatus] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const clientListRef = useRef<HTMLDivElement>(null);

  // Pre-fill the assignee with the signed-in user so the most common case
  // (rep creates a task they're going to do) is one click.
  const { data: session } = useSession();
  const [assignees, setAssignees] = useState<string[]>([]);
  useEffect(() => {
    const me = session?.user?.email?.toLowerCase();
    if (me && assignees.length === 0) setAssignees([me]);
    // We only want to seed once on first session load; explicit changes in the
    // picker are intentional and shouldn't be re-stomped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.email]);

  // Fetch board column info once
  useEffect(() => {
    fetch('/api/subitems/board-info')
      .then(r => r.json())
      .then((d: BoardInfo) => setBoardInfo(d))
      .catch(() => setBoardInfo({ boardId: null, statusColumnId: null, statusOptions: [], dateColumnId: null, assigneeColumnId: null, assigneeOptions: [] }));
  }, []);

  // Close client list on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clientListRef.current && !clientListRef.current.contains(e.target as Node)) {
        setShowClientList(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedClient = items.find(i => i.id === selectedClientId);

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
  }, [items, clientSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) { setError('Please select a client.'); return; }
    if (!taskName.trim()) { setError('Task name is required.'); return; }
    setError('');
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        parentItemId: selectedClientId,
        parentItemName: selectedClient?.name ?? '',
        name: taskName.trim(),
      };
      if (boardInfo?.statusColumnId && status) {
        body.statusColumnId = boardInfo.statusColumnId;
        body.status = status;
      }
      if (boardInfo?.dateColumnId && dueDate) {
        body.dateColumnId = boardInfo.dateColumnId;
        body.dueDate = dueDate;
      }
      if (notes.trim()) body.notes = notes.trim();
      if (boardInfo?.assigneeColumnId && assignees.length > 0) {
        body.assigneeColumnId = boardInfo.assigneeColumnId;
        body.assignees = assignees;
      }

      const res = await fetch('/api/subitems', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create task');
      }
      const created: SubItem = await res.json();
      onCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  // Default status options if board doesn't provide them
  const statusOptions = boardInfo?.statusOptions?.length
    ? boardInfo.statusOptions
    : ['Not Started', 'In Progress', 'Stuck', 'Waiting for Review', 'Done'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
              <Plus className="w-4 h-4 text-purple-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900">New Task</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          {/* Client selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Client <span className="text-red-400">*</span>
            </label>
            <div className="relative" ref={clientListRef}>
              <button
                type="button"
                onClick={() => setShowClientList(v => !v)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors text-left ${
                  selectedClient ? 'border-gray-300 text-gray-800' : 'border-gray-300 text-gray-400'
                } hover:border-[#43c7ff] focus:outline-none focus:ring-2 focus:ring-[#43c7ff]`}
              >
                <span className="truncate">{selectedClient ? selectedClient.name : 'Select a client…'}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
              </button>

              {showClientList && (
                <div className="absolute top-full mt-1 left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search clients…"
                        value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto">
                    {filteredClients.length === 0 && (
                      <p className="px-3 py-2 text-sm text-gray-400">No clients found</p>
                    )}
                    {filteredClients.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSelectedClientId(item.id);
                          setClientSearch('');
                          setShowClientList(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-[#e6f8ff] transition-colors ${
                          item.id === selectedClientId ? 'font-semibold text-[#015280] bg-[#e6f8ff]' : 'text-gray-700'
                        }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Task name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Task Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="e.g. Send welcome email"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors"
              autoFocus={!!defaultClientId}
            />
          </div>

          {/* Status + Due date side by side */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Status
              </label>
              {boardInfo === null ? (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading…
                </div>
              ) : (
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] bg-white hover:border-[#43c7ff] transition-colors"
                >
                  <option value="">— None —</option>
                  {statusOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors"
              />
            </div>
          </div>

          {/* Assignee */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Assigned To
            </label>
            {boardInfo === null ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading…
              </div>
            ) : !boardInfo.assigneeColumnId ? (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Assignment column not configured on the subitem board.
              </p>
            ) : (
              <AssigneePicker
                value={assignees}
                options={boardInfo.assigneeOptions}
                onChange={setAssignees}
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Notes <span className="text-gray-300 font-normal normal-case">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any additional context…"
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">Notes will be added as a Monday.com update on the task.</p>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60 rounded-lg transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main TasksView ───────────────────────────────────────────────────────────
interface TasksViewProps {
  items: OnboardingItem[];
  allTasks: SubItem[];
  loadingTasks: boolean;
  onSelectClient: (item: OnboardingItem) => void;
  taskClientFilter: string;
  onFilterChange: (v: string) => void;
  onTaskCreated: (task: SubItem) => void;
  onTaskUpdated?: (task: SubItem) => void;
}

export function TasksView({
  items,
  allTasks,
  loadingTasks,
  onSelectClient,
  taskClientFilter,
  onFilterChange,
  onTaskCreated,
  onTaskUpdated,
}: TasksViewProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<SubItem | null>(null);

  const filtered = taskClientFilter
    ? allTasks.filter(t => t.parentItemName === taskClientFilter)
    : allTasks;

  const outstanding = filtered.filter(t => !isDone(t.status));
  const completed   = filtered.filter(t =>  isDone(t.status));

  function handleClientClick(parentItemId: string) {
    const found = items.find(i => i.id === parentItemId);
    if (found) onSelectClient(found);
  }

  const showClient = !taskClientFilter;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Toolbar row */}
      <div className="flex items-center justify-between mb-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <select
            value={taskClientFilter}
            onChange={e => onFilterChange(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#43c7ff] bg-white"
          >
            <option value="">All clients</option>
            {Array.from(new Set(allTasks.map(t => t.parentItemName))).sort().map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {!loadingTasks && (
            <span className="text-xs text-gray-400 ml-1">
              {outstanding.length} outstanding · {completed.length} completed
            </span>
          )}
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      {loadingTasks ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-6 h-6 animate-spin text-[#43c7ff]" />
          <span className="ml-2 text-sm text-gray-500">Loading tasks…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400 max-w-4xl mx-auto">
          <CheckSquare className="w-10 h-10 mb-2 opacity-30" />
          <p className="text-sm">No tasks found</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm text-purple-600 hover:underline"
          >
            Create the first task →
          </button>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto">
          <TaskSection
            title="Outstanding"
            tasks={outstanding}
            accent="text-gray-800"
            defaultOpen
            showClient={showClient}
            onClientClick={handleClientClick}
            onEdit={setEditingTask}
          />
          <TaskSection
            title="Completed"
            tasks={completed}
            accent="text-green-600"
            defaultOpen={false}
            showClient={showClient}
            onClientClick={handleClientClick}
            onEdit={setEditingTask}
          />
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={updated => {
            setEditingTask(null);
            onTaskUpdated?.(updated);
          }}
        />
      )}

      {showCreate && (
        <CreateTaskModal
          items={items}
          defaultClientId={taskClientFilter
            ? items.find(i => i.name === taskClientFilter)?.id
            : undefined}
          onClose={() => setShowCreate(false)}
          onCreated={task => {
            onTaskCreated(task);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}
