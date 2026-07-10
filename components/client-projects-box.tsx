'use client';

/**
 * ClientProjectsBox — the "Projects for this client" card shown in the
 * expanded client view (CS), directly above Performance Metrics. Lists every
 * project linked to the client with its status, owner, opened date, due date,
 * and subtask progress; clicking a row opens the full ProjectDetailModal
 * *over* the client view (no navigation away).
 *
 * ⚠️ SCAFFOLD: filters the mock project list. Matches by clientBoardItemId
 * when available, else by client name (mock projects aren't linked by id yet).
 */

import { FolderKanban, ListChecks, ArrowRight } from 'lucide-react';
import type { Project } from '@/lib/projects';
import { subtaskProgress } from '@/lib/projects';
import { StatusPill, PersonChip, formatDueDate, useTodayISO, isOverdue } from './project-bits';

export function ClientProjectsBox({
  projects,
  clientBoardItemId,
  clientName,
  onOpenProject,
}: {
  projects: Project[];
  clientBoardItemId: string | null;
  clientName: string;
  onOpenProject: (p: Project) => void;
}) {
  const today = useTodayISO();
  const name = (clientName ?? '').toLowerCase();
  const mine = projects.filter(
    p =>
      (clientBoardItemId && p.clientBoardItemId === clientBoardItemId) ||
      (name && p.clientName.toLowerCase() === name),
  );

  return (
    <section className="bg-white rounded-2xl border border-gray-200/70 shadow-[0_1px_2px_rgba(20,24,40,.04),0_6px_16px_rgba(20,24,40,.04)] flex flex-col overflow-hidden flex-shrink-0">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <FolderKanban className="w-4 h-4 text-[#0071BC]" />
        <h2 className="text-sm font-semibold text-gray-900">Projects</h2>
        <span className="text-xs text-gray-400 font-medium">{mine.length}</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">
          Preview
        </span>
      </header>

      {mine.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">No projects for this client yet.</div>
      ) : (
        <ul className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
          {mine.map(p => {
            const prog = subtaskProgress(p);
            const overdue = isOverdue(p.dueDate, today);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpenProject(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-[#f0fbff] transition-colors flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">{p.name}</span>
                      <StatusPill status={p.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-gray-500">
                      <PersonChip email={p.ownerEmail} />
                      <span className="text-gray-300">·</span>
                      <span>Opened {formatDueDate(p.createdAt.slice(0, 10))}</span>
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="w-3 h-3 text-gray-400" />
                        {prog.done}/{prog.total}
                      </span>
                      {p.dueDate && (
                        <span className={`px-1.5 py-0.5 rounded font-medium ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                          Due {formatDueDate(p.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
