'use client';

/**
 * ProjectsView — the main Projects workspace (Customer Service surface).
 *
 * ⚠️ SCAFFOLD / PREVIEW: runs on MOCK_PROJECTS with no persistence. The layout,
 * filters, and detail flow are real so we can react to them; wiring to a real
 * backend (Monday board vs. Postgres) comes after that decision. Every rep can
 * see every project here; the home page shows only their own (My Projects).
 *
 * Filters (client · responsible · status · ad-hoc created) are multi-select
 * and combine: OR within a filter, AND across filters.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import {
  FolderKanban, Plus, Filter, ChevronDown, X, Search, ListChecks, AlertTriangle,
} from 'lucide-react';
import type { Project } from '@/lib/projects';
import { collectStatuses, subtaskProgress } from '@/lib/projects';
import { firstNameFromEmail } from '@/lib/agent-name';
import { StatusPill, AdhocBadge, PersonChip, formatDueDate, useTodayISO, isOverdue } from './project-bits';

interface ProjectsViewProps {
  projects: Project[];
  currentUserEmail: string | null;
  onOpenProject: (p: Project) => void;
  onNewProject: () => void;
}

type Option = { value: string; label: string };

export function ProjectsView({ projects, onOpenProject, onNewProject }: ProjectsViewProps) {
  const today = useTodayISO();

  // ── Filter option lists (derived from the data) ──
  const clientOptions = useMemo<Option[]>(() => {
    const set = new Map<string, string>();
    for (const p of projects) set.set(p.clientName, p.clientName);
    return Array.from(set.values()).sort().map(v => ({ value: v, label: v }));
  }, [projects]);

  const responsibleOptions = useMemo<Option[]>(() => {
    const set = new Set<string>();
    for (const p of projects) set.add(p.ownerEmail);
    return Array.from(set).sort().map(v => ({ value: v, label: firstNameFromEmail(v) }));
  }, [projects]);

  const statusOptions = useMemo<Option[]>(
    () => collectStatuses(projects).map(s => ({ value: s.id, label: s.label })),
    [projects],
  );

  const adhocOptions: Option[] = [
    { value: 'yes', label: 'Ad-hoc created' },
    { value: 'no', label: 'No ad-hoc' },
  ];

  // ── Selected filters ──
  const [clientSel, setClientSel] = useState<Set<string>>(new Set());
  const [respSel, setRespSel] = useState<Set<string>>(new Set());
  const [statusSel, setStatusSel] = useState<Set<string>>(new Set());
  const [adhocSel, setAdhocSel] = useState<Set<string>>(new Set());

  const anyFilter = clientSel.size + respSel.size + statusSel.size + adhocSel.size > 0;
  const clearAll = () => { setClientSel(new Set()); setRespSel(new Set()); setStatusSel(new Set()); setAdhocSel(new Set()); };

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (clientSel.size && !clientSel.has(p.clientName)) return false;
      if (respSel.size && !respSel.has(p.ownerEmail)) return false;
      if (statusSel.size && !statusSel.has(p.status.id)) return false;
      if (adhocSel.size) {
        const key = p.adhocCreated ? 'yes' : 'no';
        if (!adhocSel.has(key)) return false;
      }
      return true;
    });
  }, [projects, clientSel, respSel, statusSel, adhocSel]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto bg-gray-50 p-4 gap-3">
      {/* Preview banner — this workspace isn't wired to a backend yet. */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex-shrink-0">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          <strong>Preview.</strong> This is a working shell running on sample data — projects here aren&apos;t saved yet.
          We&apos;ll connect it to a real backend once we lock the storage approach.
        </span>
      </div>

      {/* Title + New project */}
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FolderKanban className="w-5 h-5 text-[#015280]" />
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Projects</h1>
            <p className="text-[11px] text-gray-500">Every client project — {filtered.length} shown</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onNewProject}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white bg-[#015280] hover:bg-[#01416a]"
        >
          <Plus className="w-4 h-4" />
          New project
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <Filter className="w-3.5 h-3.5" /> Filters
        </span>
        <MultiSelectFilter label="Client" options={clientOptions} selected={clientSel} onChange={setClientSel} />
        <MultiSelectFilter label="Responsible" options={responsibleOptions} selected={respSel} onChange={setRespSel} />
        <MultiSelectFilter label="Status" options={statusOptions} selected={statusSel} onChange={setStatusSel} />
        <MultiSelectFilter label="Ad-hoc" options={adhocOptions} selected={adhocSel} onChange={setAdhocSel} />
        {anyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-red-600 transition-colors"
          >
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      {/* Table */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
        <div className="overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-16 text-center text-sm text-gray-400">
              {projects.length === 0 ? 'No projects yet. Create one to get started.' : 'No projects match these filters.'}
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Responsible</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Subtasks</th>
                  <th className="px-4 py-2.5">Ad-hoc</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const prog = subtaskProgress(p);
                  const overdue = isOverdue(p.dueDate, today);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => onOpenProject(p)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-[#f0fbff] transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-sm text-gray-700">{p.clientName}</span>
                      </td>
                      <td className="px-4 py-2.5"><StatusPill status={p.status} /></td>
                      <td className="px-4 py-2.5"><PersonChip email={p.ownerEmail} /></td>
                      <td className="px-4 py-2.5">
                        {p.dueDate ? (
                          <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-gray-600'}`}>
                            {formatDueDate(p.dueDate)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          <ListChecks className="w-3.5 h-3.5 text-gray-400" />
                          {prog.done}/{prog.total}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><AdhocBadge created={p.adhocCreated} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Multi-select filter dropdown ─────────────────────────────────────────────
function MultiSelectFilter({
  label, options, selected, onChange,
}: {
  label: string;
  options: Option[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const shown = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(next);
  };

  const active = selected.size > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
          active ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {label}
        {active && (
          <span className="text-[10px] font-bold bg-[#015280] text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.size}
          </span>
        )}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl w-64 flex flex-col overflow-hidden">
          {options.length > 6 && (
            <div className="p-2 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Filter ${label.toLowerCase()}…`}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
                />
              </div>
            </div>
          )}
          <div className="overflow-y-auto max-h-64 py-1">
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">No matches</p>
            ) : (
              shown.map(o => (
                <label key={o.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(o.value)}
                    onChange={() => toggle(o.value)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-[#015280] focus:ring-[#43c7ff]"
                  />
                  <span className="truncate text-gray-700">{o.label}</span>
                </label>
              ))
            )}
          </div>
          {selected.size > 0 && (
            <div className="border-t border-gray-100 p-1.5">
              <button type="button" onClick={() => onChange(new Set())} className="w-full text-[11px] text-gray-500 hover:text-red-600 py-1">
                Clear {label.toLowerCase()}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
