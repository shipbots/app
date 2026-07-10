'use client';

/**
 * MyProjectsPanel — home-page (CS Clients view) right-rail card showing the
 * projects assigned to the signed-in rep, whether they own the project or just
 * a subtask. Collapsible, and the collapsed/expanded choice is remembered
 * per-user across logins.
 *
 * ⚠️ SCAFFOLD: reads the mock project list passed from the board. Clicking a
 * row opens the (also-scaffold) detail modal.
 */

import { FolderKanban, ChevronDown, ChevronRight, ListChecks } from 'lucide-react';
import type { Project } from '@/lib/projects';
import { isAssignedTo, assignmentRole, subtaskProgress } from '@/lib/projects';
import { usePersistentCollapse } from '@/hooks/use-persistent-collapse';
import { StatusPill, formatDueDate, useTodayISO, isOverdue } from './project-bits';

export function MyProjectsPanel({
  projects,
  currentUserEmail,
  onOpenProject,
}: {
  projects: Project[];
  currentUserEmail: string | null;
  onOpenProject: (p: Project) => void;
}) {
  const [collapsed, setCollapsed] = usePersistentCollapse(
    `shipbots:cs:myprojects-collapsed:${(currentUserEmail ?? 'anon').toLowerCase()}`,
  );
  const today = useTodayISO();
  const mine = projects.filter(p => isAssignedTo(p, currentUserEmail));

  return (
    <aside className="w-80 flex-shrink-0 bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
      <header className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
        <FolderKanban className="w-4 h-4 text-[#015280]" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">My Projects</h2>
          <p className="text-[11px] text-gray-500 truncate">Assigned to you</p>
        </div>
        <span className="text-xs text-gray-500 font-medium">{mine.length}</span>
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="p-1 rounded hover:bg-gray-200 text-gray-500"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand My Projects' : 'Collapse My Projects'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </header>

      {!collapsed && (
        <div className="overflow-y-auto max-h-[46vh]">
          {mine.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <FolderKanban className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-500">No projects assigned to you</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {mine.map(p => {
                const role = assignmentRole(p, currentUserEmail);
                const prog = subtaskProgress(p);
                const overdue = isOverdue(p.dueDate, today);
                return (
                  <li
                    key={p.id}
                    onClick={() => onOpenProject(p)}
                    className="px-4 py-2.5 hover:bg-[#f0fbff] cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-gray-900 leading-snug truncate flex-1">{p.name}</p>
                      {role === 'subtask' && (
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#015280] bg-[#e6f8ff] px-1.5 py-0.5 rounded flex-shrink-0">
                          Your subtask
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 truncate mt-0.5">{p.clientName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusPill status={p.status} />
                      <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                        <ListChecks className="w-3 h-3 text-gray-400" />
                        {prog.done}/{prog.total}
                      </span>
                      {p.dueDate && (
                        <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                          {formatDueDate(p.dueDate)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
