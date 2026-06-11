'use client';

import { useState, useEffect } from 'react';
import { OnboardingItem, SubItem, BoardInfo } from '@/lib/types';
import { CreateTaskModal } from './tasks-view';
import { EditTaskModal } from './edit-task-modal';
import {
  CheckSquare, Square, Calendar, User, AlertCircle,
  ChevronDown, ChevronRight, Plus, Pencil, Loader2,
} from 'lucide-react';

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
  boardInfo,
  onEdit,
  onUpdated,
}: {
  task: SubItem;
  boardInfo: BoardInfo | null;
  onEdit: (task: SubItem) => void;
  onUpdated?: (task: SubItem) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const done = isDone(task.status);
  const overdue = !done && isOverdue(task.dueDate);

  const toggleDone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completing || !boardInfo?.boardId) return;
    const newStatus = done
      ? (boardInfo.statusOptions?.find(s => !isDone(s)) ?? 'Not Started')
      : 'Done';
    setCompleting(true);
    try {
      const res = await fetch(`/api/subitems/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: boardInfo.boardId,
          status: newStatus,
          statusColumnId: boardInfo.statusColumnId ?? undefined,
        }),
      });
      if (!res.ok) throw new Error();
      onUpdated?.({ ...task, status: newStatus });
    } catch { /* leave as-is on error */ }
    finally { setCompleting(false); }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
      <button
        type="button"
        onClick={toggleDone}
        disabled={completing || !boardInfo?.boardId}
        title={done ? 'Mark as not started' : 'Mark as done'}
        className="flex-shrink-0 disabled:cursor-default transition-transform active:scale-90"
      >
        {completing
          ? <Loader2 className="w-4 h-4 animate-spin text-[#43c7ff]" />
          : done
          ? <CheckSquare className="w-4 h-4 text-green-500 hover:text-green-600" />
          : <Square className="w-4 h-4 text-gray-300 hover:text-[#43c7ff]" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
          {task.name}
        </p>
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

// ─── Collapsible section ──────────────────────────────────────────────────────
function TaskSection({
  title,
  tasks,
  accent,
  defaultOpen = true,
  boardInfo,
  onEdit,
  onUpdated,
}: {
  title: string;
  tasks: SubItem[];
  accent: string;
  defaultOpen?: boolean;
  boardInfo: BoardInfo | null;
  onEdit: (task: SubItem) => void;
  onUpdated?: (task: SubItem) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (tasks.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-4 py-2 w-full text-left hover:bg-gray-50 transition-colors"
      >
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
        <span className={`text-xs font-semibold uppercase tracking-wide ${accent}`}>{title}</span>
        <span className="ml-1 text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          {tasks.length}
        </span>
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              boardInfo={boardInfo}
              onEdit={onEdit}
              onUpdated={onUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface TasksTabProps {
  tasks: SubItem[];
  loading: boolean;
  items: OnboardingItem[];
  clientItemId: string;
  onTaskCreated: (task: SubItem) => void;
  onTaskUpdated?: (task: SubItem) => void;
}

export function TasksTab({ tasks, loading, items, clientItemId, onTaskCreated, onTaskUpdated }: TasksTabProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingTask, setEditingTask] = useState<SubItem | null>(null);
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);

  // Fetch board metadata once so the inline checkbox knows boardId + statusColumnId
  useEffect(() => {
    fetch('/api/subitems/board-info')
      .then(r => r.json())
      .then((d: BoardInfo) => setBoardInfo(d))
      .catch(() => {});
  }, []);

  const outstanding = tasks.filter(t => !isDone(t.status));
  const completed   = tasks.filter(t =>  isDone(t.status));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#43c7ff] border-t-transparent" />
        <span className="ml-2 text-sm text-gray-500">Loading tasks…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span className="text-xs text-gray-500">
          {outstanding.length} outstanding
          {completed.length > 0 && ` · ${completed.length} completed`}
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <CheckSquare className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No tasks for this client</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-2 text-sm text-purple-600 hover:underline"
            >
              Create first task →
            </button>
          </div>
        ) : (
          <>
            <TaskSection
              title="Outstanding"
              tasks={outstanding}
              accent="text-gray-700"
              defaultOpen
              boardInfo={boardInfo}
              onEdit={setEditingTask}
              onUpdated={onTaskUpdated}
            />
            <TaskSection
              title="Completed"
              tasks={completed}
              accent="text-green-600"
              defaultOpen={false}
              boardInfo={boardInfo}
              onEdit={setEditingTask}
              onUpdated={onTaskUpdated}
            />
          </>
        )}
      </div>

      {/* Edit modal */}
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

      {/* Create modal */}
      {showCreate && (
        <CreateTaskModal
          items={items}
          defaultClientId={clientItemId}
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
