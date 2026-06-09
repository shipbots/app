'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { SubItem } from '@/lib/types';
import { BoardInfo } from './tasks-view';
import { X, Save, Loader2, Check, AlertCircle, User, Plus, ChevronDown } from 'lucide-react';

interface EditTaskModalProps {
  task: SubItem;
  onClose: () => void;
  onSaved: (updated: SubItem) => void;
}

// ─── Assignee picker (multi-select dropdown with add-new) ───────────────────
export function AssigneePicker({
  value,
  options,
  onChange,
  disabled = false,
}: {
  value: string[];
  options: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Union of saved options + any emails the task is already assigned to (in
  // case a teammate's email was used once but never made it into Monday's
  // dropdown settings).
  const mergedOptions = useMemo(() => {
    const set = new Set<string>(options.map(o => o.toLowerCase()));
    for (const v of value) set.add(v.toLowerCase());
    return Array.from(set).sort();
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!search) return mergedOptions;
    const q = search.toLowerCase();
    return mergedOptions.filter(o => o.includes(q));
  }, [mergedOptions, search]);

  const toggle = (email: string) => {
    const e = email.toLowerCase();
    onChange(value.includes(e) ? value.filter(v => v !== e) : [...value, e]);
  };

  const addNew = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    onChange(value.includes(e) ? value : [...value, e]);
    setNewEmail('');
    setAddingNew(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full min-h-[42px] px-2 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff] hover:border-[#43c7ff] transition-colors flex items-center gap-1 flex-wrap text-left ${disabled ? 'opacity-60 cursor-not-allowed' : 'bg-white'}`}
      >
        {value.length === 0 ? (
          <span className="flex items-center gap-1.5 text-gray-400 px-1">
            <User className="w-3.5 h-3.5" />
            Unassigned
          </span>
        ) : (
          value.map(email => (
            <span
              key={email}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#e6f8ff] text-[#015280]"
            >
              <User className="w-3 h-3" />
              <span className="truncate max-w-[180px]">{email}</span>
              <span
                onClick={e => { e.stopPropagation(); toggle(email); }}
                className="hover:bg-[#43c7ff]/30 rounded p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </span>
            </span>
          ))
        )}
        <ChevronDown className="ml-auto w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-full overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              type="text"
              autoFocus
              placeholder="Search teammates…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center italic">No teammates match</p>
            ) : (
              filteredOptions.map(email => {
                const selected = value.includes(email);
                return (
                  <label
                    key={email}
                    className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggle(email)}
                      className="rounded border-gray-300 text-[#015280] focus:ring-[#43c7ff]"
                    />
                    <span className="truncate text-gray-700">{email}</span>
                  </label>
                );
              })
            )}
          </div>
          <div className="border-t border-gray-100">
            {addingNew ? (
              <div className="p-2 flex items-center gap-1">
                <input
                  type="email"
                  autoFocus
                  placeholder="teammate@shipbots.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); addNew(); }
                    if (e.key === 'Escape') { setAddingNew(false); setNewEmail(''); }
                  }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
                />
                <button
                  type="button"
                  onClick={addNew}
                  disabled={!newEmail.trim()}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#015280] text-white hover:opacity-90 disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingNew(false); setNewEmail(''); }}
                  className="px-2 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingNew(true)}
                className="w-full px-3 py-2 text-left text-xs font-medium text-[#015280] hover:bg-[#f0fbff] flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add new teammate…
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
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
