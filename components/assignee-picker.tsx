'use client';

/**
 * AssigneePicker — multi-select dropdown for the "Assigned" column on the
 * subitem board. Lists existing dropdown options (teammate emails), lets
 * the user select multiple, and supports adding a brand-new email inline
 * (Monday's `create_labels_if_missing` adds it as a permanent option on save).
 *
 * Extracted into its own file specifically to avoid a circular import:
 *   tasks-view.tsx imports the picker as a runtime value, and
 *   edit-task-modal.tsx imports BoardInfo from tasks-view. With the picker
 *   also living in edit-task-modal.tsx, webpack saw a cycle with a runtime
 *   binding and failed the Vercel production build (Turbopack tolerated it).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, User, X } from 'lucide-react';

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
