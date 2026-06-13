'use client';

import { useState, useEffect, useRef } from 'react';
import { OnboardingItem, ClientInfo, FirefliesMeeting, GmailThread } from '@/lib/types';
import { StatusBadge } from './status-badge';
import { ClientInfoTab } from './client-info-tab';
import { ClientExpandedView } from './client-expanded-view';
import { OnboardingTab } from './onboarding-tab';
import { MeetingsTab } from './meetings-tab';
import { EmailsTab } from './emails-tab';
import { ShipHeroPOsTab } from './shiphero-pos-tab';
import { TasksTab } from './tasks-tab';
import { DocumentsTab } from './documents-tab';
import { ShipHeroPO } from '@/app/api/shiphero-pos/route';
import { SubItem } from '@/lib/types';
import { PIPELINE_STAGES, INACTIVE_STATUSES } from '@/lib/constants';
import {
  X, FileText, ClipboardList, Video, Mail, ExternalLink,
  Maximize2, Minimize2, UserPlus, ChevronDown, MailWarning, Phone, Package, CheckSquare, RefreshCw, FolderOpen,
  Search, ChevronRight, Loader2,
} from 'lucide-react';

// ─── Agent badge helpers ─────────────────────────────────────────────────────
const AGENT_PALETTE = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#16a34a', '#14b8a6', '#0ea5e9',
];

function agentBadgeColor(email: string): string {
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AGENT_PALETTE[hash % AGENT_PALETTE.length];
}

function AgentBadge({ email }: { email: string }) {
  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  const color = agentBadgeColor(email);
  return (
    <span
      title={email}
      className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold flex-shrink-0 cursor-default"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

// ─── Agent assign button ─────────────────────────────────────────────────────
function AgentAssignButton({
  clientId,
  currentEmail,
  onAssigned,
}: {
  clientId: string;
  currentEmail: string;
  onAssigned: (email: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newAgentInput, setNewAgentInput] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client/agents');
      const data = await res.json();
      setAgents(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleOpen = async () => {
    setOpen(o => !o);
    if (agents.length === 0) await loadAgents();
  };

  const assign = async (email: string) => {
    setOpen(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/client/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'dropdown_mkxx7xv', value: email, valueType: 'dropdown' }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[AgentAssign] save failed: status=${res.status}`, body);
        throw new Error(`${res.status}`);
      }
      onAssigned(email);
    } catch (err) {
      console.error('[AgentAssign] save error', err);
    } finally { setSaving(false); }
  };

  const addNewAgent = async () => {
    const email = newAgentInput.trim();
    if (!email) return;
    // Monday's create_labels_if_missing on the mutation auto-creates the
    // dropdown option, so we can just assign it directly. After save, refetch
    // the agent list so the new option appears for other clients too.
    await assign(email);
    setNewAgentInput('');
    setAddingNew(false);
    await loadAgents();
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        title={currentEmail ? `Assigned: ${currentEmail}` : 'No agent assigned — click to assign'}
        className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          currentEmail
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-amber-50 border border-amber-300 text-amber-700 hover:bg-amber-100'
        }`}
      >
        {saving ? (
          <div className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : currentEmail ? (
          <>
            <AgentBadge email={currentEmail} />
            <span className="max-w-[120px] truncate">{currentEmail}</span>
            <ChevronDown className="w-3 h-3" />
          </>
        ) : (
          <>
            <UserPlus className="w-3.5 h-3.5" />
            No agent assigned
            <ChevronDown className="w-3 h-3" />
          </>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-60 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-400">Loading agents…</div>
          )}
          {!loading && agents.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400">No agents found</div>
          )}
          {agents.map(email => (
            <button
              key={email}
              type="button"
              onClick={() => assign(email)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-blue-50 flex items-center gap-2 transition-colors ${
                email === currentEmail ? 'font-semibold text-blue-600 bg-blue-50' : 'text-gray-700'
              }`}
            >
              <AgentBadge email={email} />
              {email}
            </button>
          ))}
          <div className="border-t border-gray-100 my-1" />
          {addingNew ? (
            <div className="px-2 py-1.5">
              <input
                type="email"
                autoFocus
                value={newAgentInput}
                onChange={e => setNewAgentInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addNewAgent();
                  if (e.key === 'Escape') { setAddingNew(false); setNewAgentInput(''); }
                }}
                placeholder="agent@shipbots.com"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex gap-1 mt-1">
                <button
                  type="button"
                  onClick={addNewAgent}
                  disabled={!newAgentInput.trim()}
                  className="flex-1 text-[11px] font-medium px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add &amp; assign
                </button>
                <button
                  type="button"
                  onClick={() => { setAddingNew(false); setNewAgentInput(''); }}
                  className="text-[11px] px-2 py-1 rounded text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingNew(true)}
              className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-1.5"
            >
              <UserPlus className="w-3 h-3" />
              Add new agent…
            </button>
          )}
          {currentEmail && (
            <>
              <div className="border-t border-gray-100 my-1" />
              <button
                type="button"
                onClick={() => assign('')}
                className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
              >
                Remove assignment
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status picker ───────────────────────────────────────────────────────────
function StatusPicker({
  itemId,
  currentStatus,
  onChanged,
}: {
  itemId: string;
  currentStatus: string;
  onChanged: (newStatus: string) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const stage = PIPELINE_STAGES.find(s => s.status === currentStatus);
  const color = stage?.color || '#888';
  const bg    = stage?.bgColor || '#f5f5f5';

  const select = async (newStatus: string) => {
    setOpen(false);
    if (newStatus === currentStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/onboarding/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: 'estado', value: newStatus }),
      });
      if (!res.ok) throw new Error();
      onChanged(newStatus);
    } catch { /* keep current on failure */ }
    finally { setSaving(false); }
  };

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => !saving && setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap transition-opacity hover:opacity-80"
        style={{ color, backgroundColor: bg, border: `1px solid ${color}30` }}
        title="Click to change status"
      >
        {saving
          ? <Loader2 className="w-3 h-3 animate-spin" />
          : currentStatus
        }
        {!saving && <ChevronDown className="w-3 h-3 opacity-60" />}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 w-72 max-h-80 overflow-y-auto">
          <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Active Statuses</p>
          {PIPELINE_STAGES.map(s => (
            <button
              key={s.status}
              type="button"
              onClick={() => select(s.status)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${
                s.status === currentStatus ? 'font-semibold' : ''
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
              <span className="truncate" style={{ color: s.status === currentStatus ? s.color : '#374151' }}>{s.status}</span>
              {s.status === currentStatus && <ChevronRight className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-40" />}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Other</p>
            {INACTIVE_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => select(s)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-gray-50 transition-colors text-gray-500 ${
                  s === currentStatus ? 'font-semibold text-gray-700' : ''
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-300" />
                <span className="truncate">{s}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client navigator ─────────────────────────────────────────────────────────
function ClientNavigator({
  currentItem,
  items,
  onNavigate,
  nameOverride,
  size = 'sm',
}: {
  currentItem: OnboardingItem;
  items: OnboardingItem[];
  onNavigate: (item: OnboardingItem) => void;
  nameOverride?: string;
  /** 'sm' = side panel header (default); 'xl' = CS expanded view hero. */
  size?: 'sm' | 'xl';
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const ref       = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query.trim()
    ? items.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.onboarder?.toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const pick = (item: OnboardingItem) => {
    setOpen(false);
    if (item.id !== currentItem.id) onNavigate(item);
  };

  const trigger = size === 'xl'
    ? 'flex items-center gap-2 text-3xl font-bold text-gray-900 transition-colors max-w-full hover:opacity-75 leading-tight'
    : 'flex items-center gap-1 text-lg font-semibold text-gray-900 transition-colors max-w-full hover:opacity-75';
  const chevron = size === 'xl' ? 'w-5 h-5 flex-shrink-0 opacity-50' : 'w-4 h-4 flex-shrink-0 opacity-50';

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={trigger}
        title="Switch client"
      >
        <span className="truncate">{nameOverride ?? currentItem.name}</span>
        <ChevronDown className={chevron} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-80 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search clients…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
              />
            </div>
          </div>

          {/* Client list */}
          <div className="overflow-y-auto max-h-72">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No clients found</p>
            ) : (
              filtered.map(item => {
                const stage = PIPELINE_STAGES.find(s => s.status === item.status);
                const color = stage?.color || '#888';
                const isCurrent = item.id === currentItem.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => pick(item)}
                    className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${
                      isCurrent ? 'bg-[#e6f8ff]' : ''
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isCurrent ? 'font-semibold' : 'text-gray-800'}`} style={isCurrent ? { color: 'var(--brand-navy)' } : {}}>
                        {item.name}
                      </p>
                      <p className="text-[11px] text-gray-400 truncate">{item.status}</p>
                    </div>
                    {isCurrent && <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--brand-cyan)' }} />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400">
            {filtered.length} client{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────
type AppMode = 'onboarding' | 'customer-service';

interface ClientDetailPanelProps {
  item: OnboardingItem;
  items?: OnboardingItem[];
  initialAgentEmail?: string;
  onClose: () => void;
  onAgentAssigned?: (clientBoardItemId: string, email: string) => void;
  onStatusChanged?: (itemId: string, newStatus: string) => void;
  /** Called after a field on the onboarding item was successfully saved.
   *  Lets the parent (PipelineBoard) keep the kanban / calendar / tasks
   *  views in sync without a full server round-trip. */
  onItemUpdate?: (itemId: string, patch: Partial<OnboardingItem>) => void;
  onNavigate?: (item: OnboardingItem) => void;
  /**
   * Which app surface this panel is mounted in. 'customer-service' hides the
   * onboarding-specific tabs (Onboarding, Meetings, Emails, ShipHero POs)
   * and lands the user on Client Info by default. Defaults to 'onboarding'.
   */
  appMode?: AppMode;
}

type Tab = 'info' | 'onboarding' | 'meetings' | 'emails' | 'pos' | 'tasks' | 'docs';

// Tabs visible in the Customer Service surface — the focus is reference
// material (client info + docs), task work, and shared calendar context.
const CUSTOMER_SERVICE_TABS: ReadonlyArray<Tab> = ['info', 'tasks', 'docs'];

export function ClientDetailPanel({ item, items = [], initialAgentEmail = '', onClose, onAgentAssigned, onStatusChanged, onItemUpdate, onNavigate, appMode = 'onboarding' }: ClientDetailPanelProps) {
  const isCustomerService = appMode === 'customer-service';
  const [activeTab, setActiveTab] = useState<Tab>(isCustomerService ? 'info' : 'onboarding');
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [meetings, setMeetings] = useState<FirefliesMeeting[]>([]);
  const [emails, setEmails] = useState<GmailThread[]>([]);
  const [emailsError, setEmailsError] = useState<string | null>(null);
  const [pos, setPos] = useState<ShipHeroPO[]>([]);
  const [posError, setPosError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<SubItem[]>([]);
  const [loadingClient, setLoadingClient] = useState(false);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [loadingPos, setLoadingPos] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksFetched, setTasksFetched] = useState(false);
  const [emailsFetched, setEmailsFetched] = useState(false);
  const [meetingsFetched, setMeetingsFetched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [agentEmail, setAgentEmail] = useState(initialAgentEmail || item.supportAgentEmail || '');
  const [currentStatus, setCurrentStatus] = useState(item.status);
  // Local display name — updated immediately when the user renames the client
  const [displayName, setDisplayName] = useState(item.name);

  // Keep displayName in sync when navigating to a different client
  useEffect(() => {
    setDisplayName(item.name);
  }, [item.id, item.name]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Escape key closes the panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Fetch client info when panel opens (or when refresh is triggered)
  useEffect(() => {
    if (item.clientBoardItemId) {
      setLoadingClient(true);
      fetch(`/api/client/${item.clientBoardItemId}?onboardingId=${item.id}`)
        .then(r => r.json())
        .then((data: ClientInfo) => {
          setClientInfo(data);
          setAgentEmail(data.supportAgentEmail || '');
        })
        .catch(console.error)
        .finally(() => { setLoadingClient(false); setRefreshing(false); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.clientBoardItemId, item.id, refreshKey]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTasksFetched(false);
    setEmailsFetched(false);
    setMeetingsFetched(false);
    setEmails([]);
    setEmailsError(null);
    setMeetings([]);
    setRefreshKey(k => k + 1);
  };

  // Fetch meetings when tab is selected — wait for clientInfo so legal name + contact name are included
  useEffect(() => {
    if (activeTab !== 'meetings' || meetingsFetched || loadingClient) return;

    setLoadingMeetings(true);
    const params = new URLSearchParams({ client: item.name });
    if (clientInfo?.legalEntity)  params.append('legalName',   clientInfo.legalEntity);
    if (clientInfo?.contactName)  params.append('contactName', clientInfo.contactName);
    fetch(`/api/meetings?${params.toString()}`)
      .then(r => r.json())
      .then(data => setMeetings(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => { setLoadingMeetings(false); setMeetingsFetched(true); });
  }, [activeTab, meetingsFetched, loadingClient, item.name, clientInfo?.legalEntity, clientInfo?.contactName]);

  // Fetch emails when tab is selected — wait for clientInfo so all 3 contact emails are included
  useEffect(() => {
    if (activeTab !== 'emails' || emailsFetched || loadingClient) return;

    setLoadingEmails(true);
    const allEmails = [
      clientInfo?.contactEmail,
      clientInfo?.contact2Email,
      clientInfo?.contact3Email,
    ].filter(Boolean) as string[];
    const emailParams = allEmails.map(e => `&email=${encodeURIComponent(e)}`).join('');
    fetch(`/api/emails?client=${encodeURIComponent(item.name)}${emailParams}`)
      .then(async r => {
        const data = await r.json();
        if (!r.ok && data?.error) {
          setEmailsError(data.error);
          setEmails([]);
        } else {
          setEmails(Array.isArray(data) ? data : []);
          setEmailsError(null);
        }
      })
      .catch(console.error)
      .finally(() => { setLoadingEmails(false); setEmailsFetched(true); });
  }, [activeTab, emailsFetched, loadingClient, item.name, clientInfo?.contactEmail, clientInfo?.contact2Email, clientInfo?.contact3Email]);

  // Fetch ShipHero POs when tab is selected
  useEffect(() => {
    if (activeTab === 'pos' && pos.length === 0 && !posError) {
      setLoadingPos(true);
      setPosError(null);
      const shipHeroName = clientInfo?.shipHeroName || '';
      fetch(
        `/api/shiphero-pos?client=${encodeURIComponent(item.name)}&shipHeroName=${encodeURIComponent(shipHeroName)}`
      )
        .then(r => r.json())
        .then(data => {
          if (data.error) { setPosError(data.error); }
          else { setPos(Array.isArray(data) ? data : []); }
        })
        .catch(e => setPosError(e.message))
        .finally(() => setLoadingPos(false));
    }
  }, [activeTab, item.name, clientInfo?.shipHeroName, pos.length, posError]);

  // Fetch tasks when tab is selected
  useEffect(() => {
    if (activeTab === 'tasks' && !tasksFetched) {
      setLoadingTasks(true);
      fetch(`/api/subitems/${item.id}`)
        .then(r => r.json())
        .then((data: SubItem[]) => setTasks(Array.isArray(data) ? data : []))
        .catch(console.error)
        .finally(() => { setLoadingTasks(false); setTasksFetched(true); });
    }
  }, [activeTab, item.id, tasksFetched]);

  // Incomplete task count: use loaded tasks once fetched, otherwise fall back to board-level count
  const incompleteTaskCount = tasksFetched
    ? tasks.filter(t => {
        const s = t.status.toLowerCase();
        return !s.includes('done') && !s.includes('complete') && !s.includes('finished');
      }).length
    : item.subitemCount;

  const allTabs: { id: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'onboarding', label: 'Onboarding', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'info', label: 'Client Info', icon: <FileText className="w-4 h-4" /> },
    { id: 'meetings', label: 'Meetings', icon: <Video className="w-4 h-4" /> },
    { id: 'emails', label: 'Emails', icon: <Mail className="w-4 h-4" /> },
    { id: 'pos', label: 'ShipHero POs', icon: <Package className="w-4 h-4" /> },
    {
      id: 'tasks',
      label: 'Tasks',
      icon: <CheckSquare className="w-4 h-4" />,
      badge: incompleteTaskCount > 0 ? incompleteTaskCount : undefined,
    },
    { id: 'docs', label: 'Docs', icon: <FolderOpen className="w-4 h-4" /> },
  ];

  // Customer Service surface only shows Client Info, Tasks, and Docs — keep
  // the onboarding-specific tabs hidden so CS reps don't see / edit them.
  const tabs = isCustomerService
    ? allTabs.filter(t => CUSTOMER_SERVICE_TABS.includes(t.id))
    : allTabs;

  const panelWidth = fullscreen ? 'w-full' : 'w-full max-w-xl';

  return (
    <>
    {/* ── Close strip — sits just to the left of the panel, click to dismiss ── */}
    {!fullscreen && (
      <div
        className="fixed right-0 top-12 h-[calc(100vh-48px)] z-40 flex items-center"
        style={{ right: panelWidth === 'w-full' ? '100vw' : 'min(100vw, 36rem)' }}
        title="Close panel (or press Escape)"
        onClick={onClose}
      >
        <div className="bg-white/80 hover:bg-white border border-gray-200 rounded-l-lg shadow-md cursor-pointer flex items-center justify-center w-5 h-16 transition-colors">
          <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>
    )}
    {/* ── Panel — fixed to the right edge, kanban board stays interactive ── */}
    <div className={`fixed right-0 top-12 h-[calc(100vh-48px)] z-40 ${panelWidth} bg-white shadow-2xl flex flex-col animate-slide-in border-l border-gray-200`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ClientNavigator
                  currentItem={item}
                  items={items}
                  onNavigate={onNavigate ?? (() => {})}
                  nameOverride={displayName !== item.name ? displayName : undefined}
                  // CS expanded view → display the client name as the hero,
                  // not a small dropdown trigger. Click still pops the
                  // switcher.
                  size={isCustomerService && fullscreen ? 'xl' : 'sm'}
                />
              </div>
              {/* Onboarding-team status row. In the CS expanded view this
                  whole row is hidden — the user explicitly asked to drop
                  the 'Completed' pill, 'Summary pending', and to keep the
                  hero area minimal. */}
              {!(isCustomerService && fullscreen) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {/* Pipeline status, "Summary pending", and "Call needed" are
                    onboarding-team affordances — CS reps don't drive
                    pipeline status or chase summary emails, so hide them
                    in customer-service mode. */}
                {!isCustomerService && (
                  <>
                    <StatusPicker
                      itemId={item.id}
                      currentStatus={currentStatus}
                      onChanged={newStatus => {
                        setCurrentStatus(newStatus);
                        onStatusChanged?.(item.id, newStatus);
                      }}
                    />
                    {item.checklist.find(s => s.id === 'color_mm27gvc0')?.value?.toLowerCase() !== 'yes' && (
                      <span
                        title="Onboarding summary email not yet sent"
                        className="flex items-center gap-1 text-[11px] font-medium text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-full"
                      >
                        <MailWarning className="w-3 h-3" />
                        Summary pending
                      </span>
                    )}
                    {item.checklist.find(s => s.id === 'color_mm278h2v')?.value?.toLowerCase() === 'yes' && (
                      <span
                        title="Additional call required"
                        className="flex items-center gap-1 text-[11px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full"
                      >
                        <Phone className="w-3 h-3" />
                        Call needed
                      </span>
                    )}
                  </>
                )}
                {/* Agent assign (always visible) */}
                {item.clientBoardItemId && (
                  <AgentAssignButton
                    clientId={item.clientBoardItemId}
                    currentEmail={agentEmail}
                    onAssigned={email => {
                      setAgentEmail(email);
                      if (clientInfo) setClientInfo({ ...clientInfo, supportAgentEmail: email });
                      if (item.clientBoardItemId) onAgentAssigned?.(item.clientBoardItemId, email);
                    }}
                  />
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs hover:underline flex items-center gap-0.5 font-medium" style={{ color: 'var(--brand-navy)' }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Monday.com
                </a>
              </div>
              )}
            </div>

            {/* Header actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing || loadingClient}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh client data"
              >
                <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing || loadingClient ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setFullscreen(f => !f)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {fullscreen
                  ? <Minimize2 className="w-4 h-4 text-gray-500" />
                  : <Maximize2 className="w-4 h-4 text-gray-500" />
                }
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1.5 hover:bg-red-50 hover:text-red-500 text-gray-500 rounded-lg transition-colors text-xs font-medium"
                title="Close panel (Esc)"
              >
                <X className="w-4 h-4" />
                Close
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'font-semibold'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                style={activeTab === tab.id ? { background: 'var(--brand-cyan-light)', color: 'var(--brand-navy)' } : {}}
              >
                {tab.icon}
                {tab.label}
                {tab.badge != null && (
                  <span className="ml-0.5 min-w-[18px] h-[18px] px-1 text-white text-[10px] font-bold rounded-full flex items-center justify-center" style={{ background: 'var(--brand-navy)' }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'onboarding' && (
            <OnboardingTab
              steps={item.checklist}
              progress={item.progress}
              status={item.status}
              kickoffDate={item.kickoffDate}
              inventoryDelivered={item.inventoryDelivered}
              itemId={item.id}
              onboarder={item.onboarder}
              internationalFulfillment={clientInfo?.internationalFulfillment}
              internationalShippingDDUDDP={clientInfo?.internationalShippingDDUDDP}
              amazonFBA={clientInfo?.amazonFBA}
              ecommercePlatforms={clientInfo?.ecommercePlatforms}
              shipHeroName={clientInfo?.shipHeroName || item.name}
              shippingDetails={item.shippingDetails}
              clientBoardItemId={item.clientBoardItemId ?? undefined}
              contactEmail={clientInfo?.contactEmail}
              clientName={item.name}
              tikTokShop={clientInfo?.tikTokShop}
              lotCodeExpiration={clientInfo?.lotCodeExpiration}
              onKickoffDateSaved={(newValue) =>
                onItemUpdate?.(item.id, { kickoffDate: newValue || null })
              }
            />
          )}
          {/* Info tab — always mounted to preserve in-progress edits across tab switches */}
          <div className={activeTab !== 'info' ? 'hidden' : 'h-full overflow-hidden'}>
            {loadingClient ? (
              <div className="p-4 flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
                <span className="ml-2 text-sm text-gray-500">Loading client info…</span>
              </div>
            ) : clientInfo ? (
              // Customer Service expanded view: big name + sticky notes +
              // metrics on the right, stacked client info on the left.
              isCustomerService && fullscreen ? (
                <ClientExpandedView
                  client={clientInfo}
                  clientBoardItemId={item.clientBoardItemId}
                  onboardingItemId={item.id}
                  deliveredDate={item.deliveredDate}
                  inventoryDelivered={item.inventoryDelivered}
                  onNameChange={newName => setDisplayName(newName)}
                  onDeliveredDateSaved={(newValue) =>
                    onItemUpdate?.(item.id, { deliveredDate: newValue || null })
                  }
                  onEstimatedDeliveryDateSaved={(newValue) =>
                    onItemUpdate?.(item.id, { estimatedDeliveryDate: newValue || null })
                  }
                />
              ) : (
                <ClientInfoTab
                  client={clientInfo}
                  fullscreen={fullscreen}
                  onboardingItemId={item.id}
                  deliveredDate={item.deliveredDate}
                  inventoryDelivered={item.inventoryDelivered}
                  onNameChange={newName => setDisplayName(newName)}
                  onDeliveredDateSaved={(newValue) =>
                    onItemUpdate?.(item.id, { deliveredDate: newValue || null })
                  }
                  onEstimatedDeliveryDateSaved={(newValue) =>
                    onItemUpdate?.(item.id, { estimatedDeliveryDate: newValue || null })
                  }
                />
              )
            ) : (
              <div className="p-8 text-center text-gray-500">
                <p className="text-sm">No client record linked</p>
              </div>
            )}
          </div>
          {activeTab === 'meetings' && (
            <MeetingsTab
              meetings={meetings}
              loading={loadingMeetings}
              items={items}
              clientItemId={item.id}
              onTasksCreated={newTasks => {
                setTasks(prev => [...newTasks, ...prev]);
                // Ensure tasks tab is fetchable on next visit
                setTasksFetched(false);
              }}
            />
          )}
          {activeTab === 'emails' && (
            <EmailsTab emails={emails} loading={loadingEmails} error={emailsError} />
          )}
          {activeTab === 'pos' && (
            <ShipHeroPOsTab
              pos={pos}
              loading={loadingPos}
              error={posError}
              clientName={item.name}
            />
          )}
          {activeTab === 'tasks' && (
            <TasksTab
              tasks={tasks}
              loading={loadingTasks}
              items={items}
              clientItemId={item.id}
              onTaskCreated={task => setTasks(prev => [task, ...prev])}
              onTaskUpdated={updated => setTasks(prev => prev.map(t => t.id === updated.id ? updated : t))}
            />
          )}
          {activeTab === 'docs' && (
            <DocumentsTab
              clientId={item.id}
              docusignFile={clientInfo?.docusignFile}
              clientBoardItemId={item.clientBoardItemId ?? undefined}
              onboardingItemId={item.id}
              clientInfo={clientInfo}
              onDocusignExtracted={updates => {
                if (clientInfo) setClientInfo(prev => prev ? { ...prev, ...updates } : prev);
              }}
            />
          )}
        </div>
    </div>
    </>
  );
}
