'use client';

import { useState, useEffect } from 'react';
import { SubItem, BoardInfo } from '@/lib/types';
import { AssigneePicker } from './assignee-picker';
import { X, Save, Loader2, Check, AlertCircle } from 'lucide-react';

interface EditTaskModalProps {
  task: SubItem;
  onClose: () => void;
  onSaved: (updated: SubItem) => void;
}

export function EditTaskModal({ task, onClose, onSaved }: EditTaskModalProps) {
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [name, setName]         = useState(task.name);
  const [status, setStatus]     = useState(task.status);
  const [dueDate, setDueDate]   = useState(task.dueDate);
  const [assignees, setAssignees] = useState<string[]>((task.assigneeEmails ?? []).map(e => e.toLowerCase()));
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [saved, setSaved]       = useState(false);

  useEffect(() => {
    fetch('/api/subitems/board-info')
      .then(r => r.json())
      .then((d: BoardInfo) => setBoardInfo(d))
      .catch(() => setBoardInfo({ boardId: null, statusColumnId: null, statusOptions: [], dateColumnId: null, assigneeColumnId: null, assigneeOptions: [] }));
  }, []);

  const statusOptions = boardInfo?.statusOptions?.length
    ? boardInfo.statusOptions
    : ['Not Started', 'In Progress', 'Stuck', 'Waiting for Review', 'Done'];

  async function handleSave() {
    if (!name.trim()) { setError('Task name cannot be empty.'); return; }
    if (!boardInfo?.boardId) { setError('Board info not loaded yet. Please try again.'); return; }
    setError('');
    setSaving(true);
    try {
      const res = await fetch(`/api/subitems/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: boardInfo.boardId,
          name:    name.trim() !== task.name ? name.trim() : undefined,
          status,
          statusColumnId: boardInfo.statusColumnId ?? undefined,
          dueDate,
          dateColumnId: boardInfo.dateColumnId ?? undefined,
          // Only send assignee changes if we know which column to write to,
          // otherwise we'd silently no-op (and the user would think it saved).
          ...(boardInfo.assigneeColumnId
            ? { assigneeColumnId: boardInfo.assigneeColumnId, assignees }
            : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to save');
      }
      setSaved(true);
      onSaved({
        ...task,
        name: name.trim(),
        status,
        dueDate,
        assigneeEmails: assignees,
        // Refresh the legacy display string so the row updates immediately.
        assignee: assignees.join(', '),
      });
      setTimeout(onClose, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Edit Task</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Client (read-only) */}
          {task.parentItemName && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Client</p>
              <p className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">{task.parentItemName}</p>
            </div>
          )}

          {/* Task name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Task Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              autoFocus
            />
          </div>

          {/* Status + Due date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
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
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors"
              />
            </div>
          </div>

          {/* Assignee — editable multi-select */}
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
                Assignment column not found on the subitem board — ask an admin to add
                an &quot;Assigned&quot; dropdown column on the subitem board.
              </p>
            ) : (
              <AssigneePicker
                value={assignees}
                options={boardInfo.assigneeOptions}
                onChange={setAssignees}
              />
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
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
              type="button"
              onClick={handleSave}
              disabled={saving || saved}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60 rounded-lg transition-colors" style={{ background: 'var(--brand-navy)' }}
            >
              {saved    ? <><Check  className="w-4 h-4" /> Saved!</> :
               saving   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> :
                          <><Save   className="w-4 h-4" /> Save Changes</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
