'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { FirefliesMeeting, OnboardingItem, SubItem } from '@/lib/types';
import { BoardInfo } from './tasks-view';
import {
  X, Plus, CheckSquare, Square, Loader2, AlertCircle,
  ChevronDown, Search, Calendar, Video,
} from 'lucide-react';

// ─── Per-item draft state ─────────────────────────────────────────────────────
interface ActionDraft {
  checked: boolean;
  name: string;
  status: string;
  dueDate: string;
}

// ─── Client selector dropdown ─────────────────────────────────────────────────
function ClientSelector({
  items,
  value,
  onChange,
}: {
  items: OnboardingItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.find(i => i.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? items.filter(i => i.name.toLowerCase().includes(q)) : items;
  }, [items, search]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-300 text-sm hover:border-[#43c7ff] focus:outline-none focus:ring-2 focus:ring-[#43c7ff] text-left"
      >
        <span className={selected ? 'text-gray-800' : 'text-gray-400'}>
          {selected ? selected.name : 'Select a client…'}
        </span>
        <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search clients…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No clients found</p>}
            {filtered.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => { onChange(item.id); setSearch(''); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-[#e6f8ff] transition-colors ${item.id === value ? 'font-semibold text-[#015280] bg-[#e6f8ff]' : 'text-gray-700'}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────
interface ActionItemsModalProps {
  meeting: FirefliesMeeting;
  items: OnboardingItem[];
  clientItemId: string;
  onClose: () => void;
  onTasksCreated: (tasks: SubItem[]) => void;
}

export function ActionItemsModal({
  meeting,
  items,
  clientItemId,
  onClose,
  onTasksCreated,
}: ActionItemsModalProps) {
  const [boardInfo, setBoardInfo] = useState<BoardInfo | null>(null);
  const [selectedClientId, setSelectedClientId] = useState(clientItemId);
  const [drafts, setDrafts] = useState<ActionDraft[]>(() =>
    (meeting.actionItems ?? []).map(text => ({
      checked: true,
      name: text,
      status: '',
      dueDate: '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/subitems/board-info')
      .then(r => r.json())
      .then((d: BoardInfo) => setBoardInfo(d))
      .catch(() => setBoardInfo({ boardId: null, statusColumnId: null, statusOptions: [], dateColumnId: null }));
  }, []);

  const statusOptions = boardInfo?.statusOptions?.length
    ? boardInfo.statusOptions
    : ['Not Started', 'In Progress', 'Stuck', 'Waiting for Review', 'Done'];

  const checkedCount = drafts.filter(d => d.checked).length;

  function toggle(i: number) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, checked: !d.checked } : d));
  }

  function updateDraft<K extends keyof ActionDraft>(i: number, key: K, val: ActionDraft[K]) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, [key]: val } : d));
  }

  function toggleAll() {
    const allChecked = drafts.every(d => d.checked);
    setDrafts(prev => prev.map(d => ({ ...d, checked: !allChecked })));
  }

  async function handleCreate() {
    const selected = drafts.filter(d => d.checked && d.name.trim());
    if (!selectedClientId) { setError('Please select a client.'); return; }
    if (selected.length === 0) { setError('Select at least one action item.'); return; }
    setError('');
    setSaving(true);

    const selectedClient = items.find(i => i.id === selectedClientId);

    try {
      const created: SubItem[] = [];
      for (const draft of selected) {
        const body: Record<string, string> = {
          parentItemId: selectedClientId,
          parentItemName: selectedClient?.name ?? '',
          name: draft.name.trim(),
        };
        if (boardInfo?.statusColumnId && draft.status) {
          body.statusColumnId = boardInfo.statusColumnId;
          body.status = draft.status;
        }
        if (boardInfo?.dateColumnId && draft.dueDate) {
          body.dateColumnId = boardInfo.dateColumnId;
          body.dueDate = draft.dueDate;
        }
        const res = await fetch('/api/subitems', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error || `Failed to create "${draft.name}"`);
        }
        const task: SubItem = await res.json();
        created.push(task);
      }
      onTasksCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tasks');
    } finally {
      setSaving(false);
    }
  }

  if (!meeting.actionItems?.length) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Video className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Add Action Items as Tasks</h2>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{meeting.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Client selector */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Create tasks for <span className="text-red-400">*</span>
            </label>
            <ClientSelector items={items} value={selectedClientId} onChange={setSelectedClientId} />
          </div>

          {/* Action items list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Action Items ({checkedCount} of {drafts.length} selected)
              </label>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs hover:underline text-[#015280]"
              >
                {drafts.every(d => d.checked) ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            <div className="space-y-2">
              {drafts.map((draft, i) => (
                <div
                  key={i}
                  className={`rounded-xl border transition-colors ${draft.checked ? 'border-[#43c7ff]/40 bg-[#e6f8ff]/40' : 'border-gray-200 bg-gray-50/50 opacity-60'}`}
                >
                  {/* Row 1: checkbox + name */}
                  <div className="flex items-start gap-3 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className="mt-0.5 flex-shrink-0"
                    >
                      {draft.checked
                        ? <CheckSquare className="w-4 h-4 text-[#015280]" />
                        : <Square className="w-4 h-4 text-gray-300" />}
                    </button>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={e => updateDraft(i, 'name', e.target.value)}
                      onClick={() => !draft.checked && toggle(i)}
                      className={`flex-1 text-sm bg-transparent border-none outline-none focus:outline-none ${draft.checked ? 'text-gray-800' : 'text-gray-500'}`}
                      placeholder="Task name…"
                    />
                  </div>

                  {/* Row 2: status + due date (only when checked) */}
                  {draft.checked && (
                    <div className="flex items-center gap-3 px-4 pb-3 pt-0">
                      {/* Status */}
                      {boardInfo === null ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                      ) : (
                        <select
                          value={draft.status}
                          onChange={e => updateDraft(i, 'status', e.target.value)}
                          className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#43c7ff] text-gray-600 hover:border-[#43c7ff] transition-colors"
                        >
                          <option value="">Status…</option>
                          {statusOptions.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}

                      {/* Due date */}
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input
                          type="date"
                          value={draft.dueDate}
                          onChange={e => updateDraft(i, 'dueDate', e.target.value)}
                          className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#43c7ff] text-gray-600 hover:border-[#43c7ff] transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || checkedCount === 0}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg transition-colors"
          >
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
              : <><Plus className="w-4 h-4" /> Add {checkedCount} Task{checkedCount !== 1 ? 's' : ''}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
