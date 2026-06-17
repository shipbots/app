'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { OnboardingItem, Alert, SubItem } from '@/lib/types';
import { PIPELINE_STAGES } from '@/lib/constants';
import { ClientCard } from './client-card';
import { ClientDetailPanel } from './client-detail-panel';
import { AlertsPanel } from './alerts-panel';
import { ChecklistBarLegend } from './checklist-bar';
import { CalendarView } from './calendar-view';
import { TasksView } from './tasks-view';
import { ClientsView } from './clients-view';
import { useSession } from 'next-auth/react';
import { Search, Bell, RefreshCw, ChevronDown, ChevronRight, LayoutGrid, CalendarDays, CheckSquare, UserPlus, Users } from 'lucide-react';
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
  // Lets the Chrome extension deep-link directly into a view via ?view=tasks.
  // Only honored on first mount; subsequent toggle clicks set state normally.
  const initialView = (() => {
    if (typeof window === 'undefined') return isCustomerService ? 'clients' : 'pipeline';
    const v = new URLSearchParams(window.location.search).get('view');
    if (v === 'tasks' || v === 'calendar' || v === 'pipeline' || v === 'clients') return v;
    // CS reps land on the per-client browser by default — their primary
    // workflow is "look up a client" rather than "see the kanban".
    return isCustomerService ? 'clients' : 'pipeline';
  })();
  const [viewMode, setViewMode] = useState<'pipeline' | 'calendar' | 'tasks' | 'clients'>(initialView);
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
  const [showAlerts, setShowAlerts] = useState(false);
  // Collapse terminal/noise columns by default
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set(['Completed', 'Abandoned', 'N/A', 'ZAP ERROR']));
  const [refreshing, setRefreshing] = useState(false);
  const [agentEmailMap, setAgentEmailMap] = useState<Record<string, string>>({});
  const [showAddClient, setShowAddClient] = useState(false);
  // Locally injected items (newly created clients before next server reload)
  const [localItems, setLocalItems] = useState<OnboardingItem[]>([]);

  const handleClientCreated = (result: CreatedClientResult) => {
    const now = new Date().toISOString();
    const stub: OnboardingItem = {
      id: result.onboardingItemId,
      name: result.name,
      url: result.url,
      createdAt: now,
      updatedAt: now,
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
    if ((viewMode === 'tasks' || viewMode === 'clients') && !tasksFetched) {
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

  const filteredItems = useMemo(() => {
    if (!searchQuery) return allItems;
    const q = searchQuery.toLowerCase();
    return allItems.filter(
      item => item.name.toLowerCase().includes(q) || item.onboarder?.toLowerCase().includes(q)
    );
  }, [allItems, searchQuery]);

  // Apply optimistic overrides (status changes + arbitrary field edits)
  const effectiveItems = useMemo(() =>
    filteredItems.map(item => {
      const fieldPatch = itemOverrides[item.id];
      const merged = fieldPatch ? { ...item, ...fieldPatch } : item;
      return statusOverrides[item.id]
        ? { ...merged, status: statusOverrides[item.id] }
        : merged;
    }),
    [filteredItems, statusOverrides, itemOverrides]
  );

  const groupedItems = useMemo(() => {
    const groups: Record<string, OnboardingItem[]> = {};
    for (const stage of PIPELINE_STAGES) groups[stage.status] = [];
    for (const item of effectiveItems) {
      if (groups[item.status]) groups[item.status].push(item);
    }
    return groups;
  }, [effectiveItems]);

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
    if (!item || item.status === newStatus) return;
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
                    onClick={() => setViewMode('pipeline')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${
                      viewMode === 'pipeline'
                        ? 'text-[#015280] font-semibold'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                    style={viewMode === 'pipeline' ? { background: 'var(--brand-cyan)' } : {}}
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

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                <input
                  type="text"
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-lg text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 w-64"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    '--tw-ring-color': 'var(--brand-cyan)',
                  } as React.CSSProperties}
                />
              </div>
              <button onClick={handleRefresh} className="p-2 rounded-lg transition-colors hover:bg-white/10" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-white/80 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowAlerts(!showAlerts)} className="relative p-2 rounded-lg hover:bg-white/10 transition-colors">
                <Bell className="w-4 h-4 text-white/80" />
                {alerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* ── Browse-by-Client view (Customer Service surface) ── */}
        {viewMode === 'clients' && (
          <ClientsView
            items={effectiveItems}
            allTasks={allTasks}
            loadingTasks={loadingTasks}
            agentEmailMap={agentEmailMap}
            onSelectItem={setSelectedItem}
            currentUserEmail={session?.user?.email ?? null}
            currentUserName={session?.user?.name ?? null}
            clientGroupOverrides={clientGroupOverrides}
          />
        )}

        {/* ── Calendar view ── */}
        {viewMode === 'calendar' && (
          <CalendarView
            items={effectiveItems}
            agentEmailMap={agentEmailMap}
            onSelectItem={setSelectedItem}
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
            onTaskCreated={task => setAllTasks(prev => [task, ...prev])}
            onTaskUpdated={updated => setAllTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
          />
        )}

        {/* ── Pipeline / Kanban view ── */}
        {viewMode === 'pipeline' && (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full min-w-max">
            {PIPELINE_STAGES.map(stage => {
              const stageItems = groupedItems[stage.status] || [];
              const isCollapsed = collapsedColumns.has(stage.status);
              const isDragTarget = dragOverStatus === stage.status;

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
                          draggable
                          onDragStart={() => handleDragStart(item)}
                          onDragEnd={handleDragEnd}
                          className="cursor-grab active:cursor-grabbing active:opacity-50 transition-opacity"
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
            <AlertsPanel alerts={alerts} onClientClick={handleAlertClick} />
          </div>
        </div>
      )}

      {selectedItem && (
        <ClientDetailPanel
          key={selectedItem.id}
          item={selectedItem}
          items={effectiveItems}
          appMode={appMode}
          initialAgentEmail={selectedItem.clientBoardItemId ? (agentEmailMap[selectedItem.clientBoardItemId] ?? '') : ''}
          onClose={() => setSelectedItem(null)}
          onAgentAssigned={(clientBoardItemId, email) =>
            setAgentEmailMap(prev => ({ ...prev, [clientBoardItemId]: email }))
          }
          onStatusChanged={(itemId, newStatus) =>
            setStatusOverrides(prev => ({ ...prev, [itemId]: newStatus }))
          }
          onItemUpdate={handleItemUpdate}
          onNavigate={newItem => setSelectedItem(newItem)}
          onClientActiveChanged={handleClientActiveChanged}
        />
      )}

      {showAddClient && (
        <AddClientModal
          onClose={() => setShowAddClient(false)}
          onCreated={handleClientCreated}
        />
      )}
    </div>
  );
}
