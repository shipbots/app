'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { OnboardingItem, Alert, SubItem } from '@/lib/types';
import { PIPELINE_STAGES, INVENTORY_NEVER_ARRIVED_STATUS, INVENTORY_NEVER_ARRIVED_GROUP_ID } from '@/lib/constants';
import { ClientCard } from './client-card';
import { ClientDetailPanel } from './client-detail-panel';
import { AlertsPanel } from './alerts-panel';
import { useDismissedAlerts } from '@/hooks/use-dismissed-alerts';
import { ChecklistBarLegend } from './checklist-bar';
import { CalendarView } from './calendar-view';
import { TasksView } from './tasks-view';
import { ClientsView } from './clients-view';
import { OnboardingHome } from './onboarding-home';
import { MiniAppsView } from './mini-apps-view';
import { NotesView } from './notes-view';
import { ClientSearchResults } from './client-search-results';
import { ProjectsView } from './projects-view';
import { ProjectDetailModal } from './project-detail-modal';
import { NotificationSyncProvider } from './notification-sync';
import { newId } from './project-bits';
import { MOCK_PROJECTS, DEFAULT_PROJECT_STATUSES, type Project, type ProjectDocument } from '@/lib/projects';
import { useClientSearchIndex } from '@/hooks/use-client-search-index';
import { useSession } from 'next-auth/react';
import { Search, Bell, RefreshCw, ChevronDown, ChevronRight, LayoutGrid, CalendarDays, CheckSquare, UserPlus, Users, Sparkles, FolderKanban, StickyNote as StickyNoteIcon, Home } from 'lucide-react';
import { AddClientModal, CreatedClientResult } from './add-client-modal';
import { CHECKLIST_STEPS } from '@/lib/constants';

export type AppMode = 'onboarding' | 'customer-service';

interface PipelineBoardProps {
  items: OnboardingItem[];
  alerts: Alert[];
  /**
   * Which surface this board powers. 'onboarding' (default) shows the full
   * board: Pipeline / Calendar / Tasks toggle + every side-panel tab. The
   * 'customer-service' mode is a slimmed-down read-mostly view that hides
   * the Kanban pipeline (CS reps don't drive pipeline status) and limits
   * the side panel to Client Info, Tasks, Docs, and Calendar context.
   */
  appMode?: AppMode;
}

export function PipelineBoard({ items, alerts, appMode = 'onboarding' }: PipelineBoardProps) {
  const isCustomerService = appMode === 'customer-service';
  const { data: session } = useSession();
  const [selectedItem, setSelectedItem] = useState<OnboardingItem | null>(null);
  // Owned here (not inside ClientDetailPanel) so the expanded/fullscreen view
  // survives the per-client remount — switching clients keeps the user
  // expanded. Reset when the panel closes so a fresh open starts collapsed.
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  // Lets the Chrome extension deep-link directly into a view via ?view=tasks.
  // Only honored on first mount; subsequent toggle clicks set state normally.
  const initialView = (() => {
    if (typeof window === 'undefined') return isCustomerService ? 'clients' : 'pipeline';
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'tasks' || v === 'calendar' || v === 'pipeline' || v === 'clients') return v;
    // 'apps' and 'projects' are CS-only; render-side guards already prevent
    // them leaking into the onboarding surface even if the URL is wrong.
    if (v === 'apps' && isCustomerService) return 'apps';
    if (v === 'projects' && isCustomerService) return 'projects';
    // 'notes' is Onboarding-only — personal on-device scratchpad.
    if (v === 'notes' && !isCustomerService) return 'notes';
    if (v === 'home' && !isCustomerService) return 'home';
    if (v === 'pipeline' && !isCustomerService) return 'pipeline';
    // CS reps land on the per-client browser by default — their primary
    // workflow is "look up a client" rather than "see the kanban".
    return isCustomerService ? 'clients' : 'home';
  })();
  const [viewMode, setViewMode] = useState<'home' | 'pipeline' | 'calendar' | 'tasks' | 'clients' | 'apps' | 'notes' | 'projects'>(initialView);

  // Tab to open the deep-linked client on (e.g. ?tab=billing from the Chrome
  // extension's "Billing info" button). Captured once on mount and applied
  // only to that client, so navigating to other clients still defaults to Info.
  const [deepLinkTab, setDeepLinkTab] = useState<{ id: string; tab: string } | null>(null);

  // Auto-open a client's detail panel when the URL carries
  // ?clientId=<id>. The id can be either an onboarding-board item id OR
  // a clients-board item id, since the extension's search-index returns
  // the latter while in-app links use the former. Honored only once on
  // mount so re-renders don't fight the user's later navigation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const targetId = sp.get('clientId');
    if (!targetId) return;
    const match = items.find(i => i.id === targetId || i.clientBoardItemId === targetId);
    if (match) {
      setSelectedItem(match);
      // The Chrome extension's "Edit ↗" link deep-links with &expanded=1 so
      // the client opens in the full expanded view (all sections + sticky
      // notes) rather than the narrow side panel.
      if (sp.get('expanded') === '1') setDetailFullscreen(true);
      // ?tab=<id> (e.g. tab=billing from the extension's Billing info button)
      // opens the client straight on that tab.
      const tab = sp.get('tab');
      if (tab) setDeepLinkTab({ id: match.id, tab });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the open client into the URL (?clientId=&expanded=) so the top
  // section nav can carry it across surfaces (CS ↔ Onboarding) and a refresh
  // reopens the same client. replaceState keeps it a shallow update — no
  // navigation, no refetch.
  const clientUrlSynced = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Skip the first run so we don't wipe a ?clientId deep-link before the
    // open-on-mount effect above has consumed it.
    if (!clientUrlSynced.current) { clientUrlSynced.current = true; return; }
    const sp = new URLSearchParams(window.location.search);
    if (selectedItem) {
      sp.set('clientId', selectedItem.id);
      if (detailFullscreen) sp.set('expanded', '1'); else sp.delete('expanded');
    } else {
      sp.delete('clientId');
      sp.delete('expanded');
    }
    const qs = sp.toString();
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, [selectedItem, detailFullscreen]);
  const [allTasks, setAllTasks] = useState<SubItem[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksFetched, setTasksFetched] = useState(false);
  const [taskClientFilter, setTaskClientFilter] = useState('');
  // Initial search prefilled from ?q= — same Chrome-extension deep-link path
  // as the view param above.
  const [searchQuery, setSearchQuery] = useState(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });
  // Anchor for the search-results dropdown + the shared (deduped) client
  // search index that powers it. The header search is a finder: it opens a
  // dropdown of matching clients rather than filtering the view behind it.
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const { index: clientIndex, status: clientIndexStatus } = useClientSearchIndex();
  const [showAlerts, setShowAlerts] = useState(false);
  // Reviewer-dismissible alerts (persisted). The bell badge + panel both read
  // from this so clearing an alert updates the count too.
  const { visible: visibleAlerts, dismissedCount, dismiss: dismissAlert, clearAll: clearAllAlerts, reset: resetAlerts } = useDismissedAlerts(alerts);
  // Collapse terminal/noise columns by default
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set(['Completed', 'Abandoned', 'N/A', 'ZAP ERROR', 'Inventory never arrived']));
  const [refreshing, setRefreshing] = useState(false);
  const [agentEmailMap, setAgentEmailMap] = useState<Record<string, string>>({});
  const [showAddClient, setShowAddClient] = useState(false);
  // Locally injected items (newly created clients before next server reload)
  const [localItems, setLocalItems] = useState<OnboardingItem[]>([]);

  // ── Projects ──
  // Seeded with mock data so the feature works before the DB is provisioned.
  // On mount we ask /api/projects: if the backend is live it replaces the mock
  // with real rows and saves persist; if not, we keep the mock and edits are
  // session-only. `projects` feeds the Projects workspace, the home "My
  // Projects" panel, and the client-view boxes; `selectedProject` drives the
  // detail modal.
  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS);
  const [projectsConfigured, setProjectsConfigured] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedProjectIsNew, setSelectedProjectIsNew] = useState(false);
  // A ?projectId deep-link (from the extension's "View more details") we still
  // need to open — held until `projects` has loaded the matching row.
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/projects')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((data: { configured?: boolean; projects?: Project[] }) => {
        if (cancelled) return;
        if (data.configured && Array.isArray(data.projects)) {
          setProjects(data.projects);
          setProjectsConfigured(true);
        }
      })
      .catch(() => { /* keep the mock preview */ });
    return () => { cancelled = true; };
  }, []);

  const handleProjectSave = (p: Project) => {
    const existed = projects.some(x => x.id === p.id);
    // Discard a brand-new project the user opened but never named.
    if (!existed && !p.name.trim()) return;
    setProjects(prev => (existed ? prev.map(x => (x.id === p.id ? p : x)) : [p, ...prev]));
    if (!projectsConfigured) return; // mock mode — session only
    fetch(existed ? `/api/projects/${p.id}` : '/api/projects', {
      method: existed ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((saved: Project) => setProjects(prev => prev.map(x => (x.id === saved.id ? saved : x))))
      .catch(err => console.error('[projects] save failed:', err));
  };

  const handleProjectDelete = (id: string) => {
    setProjects(prev => prev.filter(x => x.id !== id));
    setSelectedProject(null);
    setSelectedProjectIsNew(false);
    if (!projectsConfigured) return;
    fetch(`/api/projects/${id}`, { method: 'DELETE' }).catch(err => console.error('[projects] delete failed:', err));
  };

  const handleProjectUploadFile = async (projectId: string, file: File): Promise<ProjectDocument | null> => {
    if (!projectsConfigured) return null;
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    return res.json();
  };
  const openExistingProject = (p: Project) => { setSelectedProjectIsNew(false); setSelectedProject(p); };
  const makeBlankProject = (client?: { clientBoardItemId: string | null; clientName: string }): Project => {
    const email = session?.user?.email ?? '';
    const nowIso = new Date().toISOString();
    return {
      id: newId('proj'),
      name: '',
      clientBoardItemId: client?.clientBoardItemId ?? null,
      clientName: client?.clientName ?? '',
      status: DEFAULT_PROJECT_STATUSES[0],
      ownerEmail: email,
      note: '',
      dueDate: null,
      subtasks: [],
      documents: [],
      comments: [],
      adhocCreated: false,
      createdByEmail: email,
      createdAt: nowIso,
      activity: [{ id: newId('act'), kind: 'created', actorEmail: email, at: nowIso, summary: 'created the project' }],
    };
  };
  const openNewProject = () => { setSelectedProjectIsNew(true); setSelectedProject(makeBlankProject()); };
  const openNewProjectForClient = (clientBoardItemId: string | null, clientName: string) => {
    setSelectedProjectIsNew(true);
    setSelectedProject(makeBlankProject({ clientBoardItemId, clientName }));
  };

  // Extension deep-links, honored once on mount:
  //  • ?newProjectClientId / ?newProjectClientName → open a blank project
  //    pre-filled with that client.
  //  • ?projectId → open that existing project's detail modal (resolved once
  //    `projects` has loaded — see the effect below).
  useEffect(() => {
    if (typeof window === 'undefined' || !isCustomerService) return;
    const sp = new URLSearchParams(window.location.search);
    const npName = sp.get('newProjectClientName');
    const npId = sp.get('newProjectClientId');
    const openId = sp.get('projectId');
    if (npName || npId) {
      setViewMode('projects');
      openNewProjectForClient(npId || null, npName || '');
    } else if (openId) {
      setViewMode('projects');
      setPendingProjectId(openId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve a pending ?projectId once the matching project is in `projects`
  // (which may arrive asynchronously from /api/projects).
  useEffect(() => {
    if (!pendingProjectId) return;
    const match = projects.find(p => p.id === pendingProjectId);
    if (match) {
      openExistingProject(match);
      setPendingProjectId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingProjectId, projects]);

  const handleClientCreated = (result: CreatedClientResult) => {
    const now = new Date().toISOString();
    const stub: OnboardingItem = {
      id: result.onboardingItemId,
      name: result.name,
      url: result.url,
      createdAt: now,
      updatedAt: now,
      groupId: '',
      status: 'Not Started',
      inventoryDelivered: '',
      kickoffDate: null,
      kickoffTime: null,
      deliveredDate: null,
      deliveredTime: null,
      estimatedDeliveryDate: null,
      estimatedDeliveryTime: null,
      shippingDetails: '',
      onboarder: null,
      clientBoardItemId: result.clientItemId,
      clientBoardItemName: result.name,
      supportAgentEmail: null,
      progress: 0,
      checklist: CHECKLIST_STEPS.map(s => ({ ...s, value: null })),
      subitemCount: 0,
    };
    setLocalItems(prev => [stub, ...prev]);
    setShowAddClient(false);
    setSelectedItem(stub);
  };

  // Drag state
  const draggingItemRef = useRef<OnboardingItem | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  // Optimistic status overrides: itemId → newStatus
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  // Optimistic item field overrides (kickoff/delivery dates, etc.) — keeps the
  // calendar and other in-app views in sync after edits in the detail panel,
  // without a full server round-trip.
  const [itemOverrides, setItemOverrides] = useState<Record<string, Partial<OnboardingItem>>>({});
  const handleItemUpdate = (itemId: string, patch: Partial<OnboardingItem>) => {
    setItemOverrides(prev => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
    setSelectedItem(prev => prev && prev.id === itemId ? { ...prev, ...patch } : prev);
  };

  // ── Live task-completion propagation ──
  // Completing / creating / editing a task anywhere must immediately refresh
  // every task indicator: the ✓ badge on the kanban, calendar, and CS cards
  // (item.subitemCount = number of OUTSTANDING subitems, matching the server in
  // lib/monday.ts) and the task lists that read allTasks (My Tasks, Tasks view,
  // CS client tables).
  const TASK_DONE = /(done|complete|finished)/i;
  // From the detail panel, which holds the authoritative full task list for a
  // single client: make it the source of truth in allTasks and re-derive its
  // card badge from it.
  const handleClientTasksChange = (itemId: string, clientTasks: SubItem[]) => {
    const ids = new Set(clientTasks.map(t => t.id));
    setAllTasks(prev => [...clientTasks, ...prev.filter(t => t.parentItemId !== itemId && !ids.has(t.id))]);
    handleItemUpdate(itemId, { subitemCount: clientTasks.filter(t => !TASK_DONE.test(t.status)).length });
  };
  // From a task-list view (My Tasks / Tasks view) where allTasks is already fully
  // loaded: upsert the one changed task and recompute its parent's badge.
  const handleTaskChange = (task: SubItem) => {
    const exists = allTasks.some(t => t.id === task.id);
    const next = exists ? allTasks.map(t => t.id === task.id ? task : t) : [task, ...allTasks];
    setAllTasks(next);
    if (task.parentItemId) {
      handleItemUpdate(task.parentItemId, {
        subitemCount: next.filter(t => t.parentItemId === task.parentItemId && !TASK_DONE.test(t.status)).length,
      });
    }
  };
  // Clients-board group overrides — fed by the Active/Inactive toggle in the
  // detail panel. ClientsView reads these on top of its search index so the
  // CS tables update instantly without re-fetching.
  const [clientGroupOverrides, setClientGroupOverrides] = useState<Record<string, string>>({});
  const handleClientActiveChanged = (clientBoardItemId: string, active: boolean) => {
    setClientGroupOverrides(prev => ({
      ...prev,
      // Empty group → "active" but unspecified group; ClientsView only checks
      // 'is this id === EXITED' so anything non-EXITED reads as active.
      [clientBoardItemId]: active ? '' : 'group_mkq09z7j',
    }));
  };

  useEffect(() => {
    fetch('/api/agent-emails')
      .then(r => r.json())
      .then((map: Record<string, string>) => setAgentEmailMap(map))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Tasks are needed for both the dedicated Tasks view and the "My Tasks"
    // sidebar on the Browse-by-Client view.
    if ((viewMode === 'tasks' || viewMode === 'clients' || viewMode === 'home') && !tasksFetched) {
      setLoadingTasks(true);
      fetch('/api/subitems')
        .then(r => r.json())
        .then((data: SubItem[]) => setAllTasks(Array.isArray(data) ? data : []))
        .catch(console.error)
        .finally(() => { setLoadingTasks(false); setTasksFetched(true); });
    }
  }, [viewMode, tasksFetched]);

  // Merge server items with any locally created stubs (dedup by id)
  const allItems = useMemo(() => {
    const serverIds = new Set(items.map(i => i.id));
    return [...localItems.filter(i => !serverIds.has(i.id)), ...items];
  }, [items, localItems]);

  // Optimistic overrides layered onto the full unfiltered list. Split
  // out from effectiveItems so the detail panel (which needs to hop
  // between neighbors regardless of the header search) can receive the
  // whole set without the search filter applied.
  const overriddenAllItems = useMemo(() =>
    allItems.map(item => {
      const fieldPatch = itemOverrides[item.id];
      const merged = fieldPatch ? { ...item, ...fieldPatch } : item;
      return statusOverrides[item.id]
        ? { ...merged, status: statusOverrides[item.id] }
        : merged;
    }),
    [allItems, statusOverrides, itemOverrides]
  );

  // Option lists for the project detail modal's client + assignee pickers.
  const projectClientOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { id: string | null; name: string }[] = [];
    for (const it of overriddenAllItems) {
      const key = it.clientBoardItemId || it.name;
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ id: it.clientBoardItemId, name: it.name });
    }
    return opts.sort((a, b) => a.name.localeCompare(b.name));
  }, [overriddenAllItems]);

  const projectAgentOptions = useMemo(() => {
    const set = new Set<string>();
    if (session?.user?.email) set.add(session.user.email);
    for (const e of Object.values(agentEmailMap)) if (e) set.add(e);
    for (const p of projects) {
      if (p.ownerEmail) set.add(p.ownerEmail);
      for (const s of p.subtasks) if (s.assigneeEmail) set.add(s.assigneeEmail);
    }
    return Array.from(set).filter(Boolean).sort();
  }, [agentEmailMap, projects, session]);

  // Legacy in-memory filter — now only narrows the Calendar and Tasks views,
  // where filtering the surface still makes sense. The kanban board and the
  // CS client tables intentionally ignore the header query and stay whole;
  // the header search surfaces matches in a dropdown (ClientSearchResults)
  // instead of rearranging those views. The detail panel likewise reads the
  // UN-filtered list so its ClientNavigator can reach any client.
  const effectiveItems = useMemo(() => {
    if (!searchQuery) return overriddenAllItems;
    const q = searchQuery.toLowerCase();
    return overriddenAllItems.filter(
      item => item.name.toLowerCase().includes(q) || item.onboarder?.toLowerCase().includes(q)
    );
  }, [overriddenAllItems, searchQuery]);

  // Kanban shows every client regardless of the header search (search is a
  // finder here, not a filter).
  const groupedItems = useMemo(() => {
    const groups: Record<string, OnboardingItem[]> = {};
    for (const stage of PIPELINE_STAGES) groups[stage.status] = [];
    for (const item of overriddenAllItems) {
      // "Inventory never arrived" is a Monday GROUP, not a status — items in it
      // land in that column regardless of their onboarding status. Everything
      // else groups by status as usual.
      if (item.groupId === INVENTORY_NEVER_ARRIVED_GROUP_ID) {
        groups[INVENTORY_NEVER_ARRIVED_STATUS].push(item);
      } else if (groups[item.status]) {
        groups[item.status].push(item);
      }
    }
    return groups;
  }, [overriddenAllItems]);

  const handleRefresh = () => { setRefreshing(true); window.location.reload(); };
  const toggleColumn = (status: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  };
  const handleAlertClick = (clientId: string) => {
    const item = items.find(i => i.id === clientId);
    if (item) setSelectedItem(item);
  };

  // ── Drag handlers ──
  const handleDragStart = (item: OnboardingItem) => {
    draggingItemRef.current = item;
  };
  const handleDragEnd = () => {
    draggingItemRef.current = null;
    setDragOverStatus(null);
  };
  const handleDragOver = (e: React.DragEvent, status: string) => {
    // The group-based "Inventory never arrived" column isn't a status drop
    // target — skipping preventDefault makes the browser refuse drops there.
    if (status === INVENTORY_NEVER_ARRIVED_STATUS) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column entirely (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverStatus(null);
    }
  };
  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    setDragOverStatus(null);
    const item = draggingItemRef.current;
    // Never write "Inventory never arrived" into the status column — it's a
    // group, not a status label (belt-and-suspenders alongside handleDragOver).
    if (!item || item.status === newStatus || newStatus === INVENTORY_NEVER_ARRIVED_STATUS) return;
    draggingItemRef.current = null;

    // Optimistic update
    setStatusOverrides(prev => ({ ...prev, [item.id]: newStatus }));
    if (selectedItem?.id === item.id) {
      setSelectedItem(prev => prev ? { ...prev, status: newStatus } : prev);
    }

    try {
      const res = await fetch(`/api/onboarding/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'estado', value: newStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Revert on failure
      setStatusOverrides(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  };

  return (
    <div className="flex h-full bg-gray-50">
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="px-6 py-3 flex-shrink-0" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold text-white tracking-tight leading-tight">
                  {isCustomerService ? 'Customer Service' : 'Onboarding Pipeline'}
                </h1>
                <p className="text-[11px] font-medium text-white/60">{items.length} clients</p>
              </div>
              {/* View toggle. Customer Service hides the Pipeline kanban — CS
                  reps don't drive pipeline status; they need scheduling and
                  task context. */}
              <div className="flex items-center rounded-lg overflow-hidden text-sm font-medium ml-2" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
                {!isCustomerService && (
                  <button
                    onClick={() => setViewMode('home')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'home'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={viewMode === 'home' ? { background: 'var(--brand-cyan)' } : {}}
                  >
                    <Home className="w-3.5 h-3.5" />
                    Home
                  </button>
                )}
                {!isCustomerService && (
                  <button
                    onClick={() => setViewMode('pipeline')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'pipeline'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.2)',
                      ...(viewMode === 'pipeline' ? { background: 'var(--brand-cyan)' } : {}),
                    }}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    Pipeline
                  </button>
                )}
                {isCustomerService && (
                  <button
                    onClick={() => setViewMode('clients')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'clients'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={viewMode === 'clients' ? { background: 'var(--brand-cyan)' } : {}}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Clients
                  </button>
                )}
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                    viewMode === 'calendar'
                      ? 'text-[#015280] font-semibold'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                  style={{
                    borderLeft: '1px solid rgba(255,255,255,0.2)',
                    ...(viewMode === 'calendar' ? { background: 'var(--brand-cyan)' } : {}),
                  }}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Calendar
                </button>
                <button
                  onClick={() => setViewMode('tasks')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                    viewMode === 'tasks'
                      ? 'text-[#015280] font-semibold'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                  style={{
                    borderLeft: '1px solid rgba(255,255,255,0.2)',
                    ...(viewMode === 'tasks' ? { background: 'var(--brand-cyan)' } : {}),
                  }}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  Tasks
                </button>
                {isCustomerService && (
                  <button
                    onClick={() => setViewMode('projects')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'projects'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.2)',
                      ...(viewMode === 'projects' ? { background: 'var(--brand-cyan)' } : {}),
                    }}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    Projects
                  </button>
                )}
                {isCustomerService && (
                  <button
                    onClick={() => setViewMode('apps')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'apps'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.2)',
                      ...(viewMode === 'apps' ? { background: 'var(--brand-cyan)' } : {}),
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Mini Apps
                  </button>
                )}
                {!isCustomerService && (
                  <button
                    onClick={() => setViewMode('notes')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'notes'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={{
                      borderLeft: '1px solid rgba(255,255,255,0.2)',
                      ...(viewMode === 'notes' ? { background: 'var(--brand-cyan)' } : {}),
                    }}
                    title="Personal on-device notes — only you can see these."
                  >
                    <StickyNoteIcon className="w-3.5 h-3.5" />
                    Notes
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Add new client button — Customer Service reps don't add
                  clients (admins/onboarders do), so hide it in CS mode. */}
              {!isCustomerService && (
                <button
                  onClick={() => setShowAddClient(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 shadow-sm"
                  style={{ background: 'var(--brand-cyan)', color: 'var(--brand-navy)' }}
                >
                  <UserPlus className="w-4 h-4" />
                  Add new client
                </button>
              )}

              <div className="relative" ref={searchAnchorRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  type="text"
                  placeholder={isCustomerService
                    ? 'Search name, email, phone, contact, store…'
                    : 'Search name, email, company…'}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-lg text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 w-72"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    '--tw-ring-color': 'var(--brand-cyan)',
                  } as React.CSSProperties}
                />
                {/* Finder dropdown — the header search is a global finder that
                    opens the client detail panel. Shown on every view (Home,
                    kanban, Clients table, Notes, …) EXCEPT Calendar and Tasks,
                    where the query filters that view instead. Portals to <body>
                    so it floats over the view behind it. */}
                {searchQuery.trim() && viewMode !== 'calendar' && viewMode !== 'tasks' && (
                  <ClientSearchResults
                    query={searchQuery}
                    items={overriddenAllItems}
                    index={clientIndex}
                    indexStatus={clientIndexStatus}
                    anchorRef={searchAnchorRef}
                    onSelect={item => {
                      setSelectedItem(item);
                      // CS reps land straight in the full expanded view (all
                      // sections + sticky notes) from search — same as the
                      // extension's "Edit ↗" deep-link. Onboarding keeps the
                      // narrow side panel.
                      if (isCustomerService) setDetailFullscreen(true);
                      setSearchQuery('');
                    }}
                    onClose={() => setSearchQuery('')}
                  />
                )}
              </div>
              <button onClick={handleRefresh} className="p-2 rounded-lg transition-colors hover:bg-white/10" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-white/80 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              {/* Alerts &amp; Action Items — hidden in CS mode (the onboarding
                  team owns these alerts; CS reps don't action them). */}
              {!isCustomerService && (
                <button onClick={() => setShowAlerts(!showAlerts)} className="relative p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <Bell className="w-4 h-4 text-white/80" />
                  {visibleAlerts.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                      {visibleAlerts.length}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── Browse-by-Client view (Customer Service surface) ──
            The header search hosts the single canonical search box; typing
            there opens the ClientSearchResults dropdown rather than filtering
            these tables, so ClientsView always shows the full list and hides
            its own local search input. */}
        {viewMode === 'home' && !isCustomerService && (
          <OnboardingHome
            items={overriddenAllItems}
            agentEmailMap={agentEmailMap}
            tasks={allTasks}
            loadingTasks={loadingTasks}
            currentUserEmail={session?.user?.email ?? null}
            onSelectItem={setSelectedItem}
            onTaskChange={handleTaskChange}
          />
        )}

        {viewMode === 'clients' && (
          <ClientsView
            items={overriddenAllItems}
            allTasks={allTasks}
            loadingTasks={loadingTasks}
            agentEmailMap={agentEmailMap}
            onSelectItem={setSelectedItem}
            currentUserEmail={session?.user?.email ?? null}
            currentUserName={session?.user?.name ?? null}
            clientGroupOverrides={clientGroupOverrides}
            hideLocalSearch
            projects={projects}
            onOpenProject={openExistingProject}
          />
        )}

        {/* ── Projects workspace (Customer Service only) ──
            SCAFFOLD: preview over mock data until the backend is chosen. */}
        {viewMode === 'projects' && isCustomerService && (
          <ProjectsView
            projects={projects}
            currentUserEmail={session?.user?.email ?? null}
            onOpenProject={openExistingProject}
            onNewProject={openNewProject}
          />
        )}

        {/* ── Calendar view ── */}
        {viewMode === 'calendar' && (
          <CalendarView
            items={effectiveItems}
            agentEmailMap={agentEmailMap}
            onSelectItem={setSelectedItem}
            onItemUpdate={handleItemUpdate}
            appMode={appMode}
          />
        )}

        {/* ── Tasks view ── */}
        {viewMode === 'tasks' && (
          <TasksView
            items={effectiveItems}
            allTasks={allTasks}
            loadingTasks={loadingTasks}
            onSelectClient={item => { setSelectedItem(item); }}
            taskClientFilter={taskClientFilter}
            onFilterChange={setTaskClientFilter}
            onTaskCreated={handleTaskChange}
            onTaskUpdated={handleTaskChange}
          />
        )}

        {/* ── Mini Apps view (Customer Service only) ── */}
        {viewMode === 'apps' && isCustomerService && (
          <MiniAppsView />
        )}

        {/* ── Notes view (Onboarding surface) ──
            Personal on-device scratchpad. Stored per-user in
            localStorage so nothing leaks to the team or requires new
            infra. See components/notes-view.tsx for the storage
            details. */}
        {viewMode === 'notes' && !isCustomerService && (
          <NotesView />
        )}

        {/* ── Pipeline / Kanban view ── */}
        {viewMode === 'pipeline' && (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full min-w-max">
            {PIPELINE_STAGES.map(stage => {
              const stageItems = groupedItems[stage.status] || [];
              const isCollapsed = collapsedColumns.has(stage.status);
              const isDragTarget = dragOverStatus === stage.status;
              // Group-based column — its cards aren't draggable (dragging one
              // out would silently rewrite its onboarding status).
              const isGroupColumn = stage.status === INVENTORY_NEVER_ARRIVED_STATUS;

              return (
                <div
                  key={stage.status}
                  className="flex flex-col w-72 flex-shrink-0"
                  onDragOver={e => handleDragOver(e, stage.status)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, stage.status)}
                >
                  <button
                    onClick={() => toggleColumn(stage.status)}
                    className="flex items-center gap-2 px-3 py-2 rounded-t-lg mb-2"
                    style={{ backgroundColor: stage.bgColor }}
                  >
                    {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="text-sm font-medium text-gray-700 truncate">{stage.status}</span>
                    <span className="ml-auto text-xs font-bold text-gray-500 bg-white/80 px-1.5 py-0.5 rounded">
                      {stageItems.length}
                    </span>
                  </button>

                  {isCollapsed ? (
                    /* ── Collapsed: show a slim drop zone so cards can still be dragged in ── */
                    <div
                      className={`rounded-lg transition-all duration-150 flex items-center justify-center text-xs font-medium ${
                        isDragTarget
                          ? 'min-h-12 ring-2 ring-[#43c7ff] ring-inset text-[#015280] bg-[#e6f8ff]'
                          : 'min-h-4 text-transparent'
                      }`}
                    >
                      {isDragTarget ? 'Drop to complete' : ''}
                    </div>
                  ) : (
                    <div
                      className={`flex-1 space-y-2 overflow-y-auto pr-1 pb-4 rounded-lg transition-colors min-h-16 ${
                        isDragTarget ? 'bg-[#e6f8ff] ring-2 ring-[#43c7ff] ring-inset' : ''
                      }`}
                    >
                      {stageItems.map(item => (
                        <div
                          key={item.id}
                          draggable={!isGroupColumn}
                          onDragStart={isGroupColumn ? undefined : () => handleDragStart(item)}
                          onDragEnd={isGroupColumn ? undefined : handleDragEnd}
                          className={isGroupColumn ? '' : 'cursor-grab active:cursor-grabbing active:opacity-50 transition-opacity'}
                        >
                          <ClientCard
                            item={item}
                            agentEmail={item.clientBoardItemId ? (agentEmailMap[item.clientBoardItemId] ?? null) : null}
                            onClick={() => setSelectedItem(item)}
                          />
                        </div>
                      ))}
                      {stageItems.length === 0 && !isDragTarget && (
                        <div className="text-center py-8 text-gray-400 text-sm">No clients</div>
                      )}
                      {isDragTarget && stageItems.length === 0 && (
                        <div className="text-center py-8 text-blue-400 text-sm font-medium">Drop here</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {showAlerts && (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Alerts & Action Items</h2>
            <span className="text-xs text-gray-500">{alerts.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <AlertsPanel
              visible={visibleAlerts}
              dismissedCount={dismissedCount}
              onClientClick={handleAlertClick}
              onDismiss={dismissAlert}
              onClearAll={clearAllAlerts}
              onReset={resetAlerts}
            />
          </div>
        </div>
      )}

      {selectedItem && (
        <NotificationSyncProvider clientBoardItemId={selectedItem.clientBoardItemId}>
        <ClientDetailPanel
          key={selectedItem.id}
          item={selectedItem}
          // Detail panel gets the UN-filtered list on purpose — the
          // header search shouldn't gate the ClientNavigator's neighbor
          // list when the rep opens a client and then wants to hop to
          // another one whose name doesn't match the current filter.
          items={overriddenAllItems}
          appMode={appMode}
          initialAgentEmail={selectedItem.clientBoardItemId ? (agentEmailMap[selectedItem.clientBoardItemId] ?? '') : ''}
          onClose={() => { setSelectedItem(null); setDetailFullscreen(false); }}
          fullscreen={detailFullscreen}
          onFullscreenChange={setDetailFullscreen}
          initialTab={deepLinkTab && selectedItem.id === deepLinkTab.id ? deepLinkTab.tab : undefined}
          onAgentAssigned={(clientBoardItemId, email) =>
            setAgentEmailMap(prev => ({ ...prev, [clientBoardItemId]: email }))
          }
          onStatusChanged={(itemId, newStatus) =>
            setStatusOverrides(prev => ({ ...prev, [itemId]: newStatus }))
          }
          onItemUpdate={handleItemUpdate}
          onClientTasksChange={handleClientTasksChange}
          onNavigate={newItem => setSelectedItem(newItem)}
          onClientActiveChanged={handleClientActiveChanged}
          projects={projects}
          onOpenProject={openExistingProject}
          onCreateProject={openNewProjectForClient}
        />
        </NotificationSyncProvider>
      )}

      {showAddClient && (
        <AddClientModal
          onClose={() => setShowAddClient(false)}
          onCreated={handleClientCreated}
        />
      )}

      {selectedProject && (
        <ProjectDetailModal
          key={selectedProject.id}
          project={selectedProject}
          isNew={selectedProjectIsNew}
          clientOptions={projectClientOptions}
          agentOptions={projectAgentOptions}
          currentUserEmail={session?.user?.email ?? null}
          filesEnabled={projectsConfigured && !selectedProjectIsNew}
          persisted={projectsConfigured}
          onClose={() => { setSelectedProject(null); setSelectedProjectIsNew(false); }}
          onSave={handleProjectSave}
          onDelete={handleProjectDelete}
          onUploadFile={handleProjectUploadFile}
        />
      )}
    </div>
  );
}
