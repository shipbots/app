/**
 * Projects — data model for the Customer Service "Projects" workspace.
 *
 * ⚠️ SCAFFOLD: the shapes here are the contract for the feature, but the app
 * currently runs on the MOCK_PROJECTS below with no persistence. Nothing is
 * saved to a backend yet — see the backend decision (Monday board vs.
 * Postgres/Prisma) before wiring real reads/writes. Keeping the model in one
 * place now so the UI shell, and later the API layer, share it.
 *
 * A project belongs to one client and can have many subtasks; a client can
 * have many projects. The owner is the main responsible person; subtasks can
 * be assigned to other people, who then see the project on their home page.
 * Every meaningful change appends to `activity` (the audit trail).
 */

// ── Status ───────────────────────────────────────────────────────────────────
// Default statuses are Opened → Started → Completed. Reps can add custom
// statuses; `kind` lets the UI special-case the built-ins (e.g. "completed"
// triggers the ShipHero ad-hoc prompt) regardless of the display label.
export type ProjectStatusKind = 'opened' | 'started' | 'completed' | 'custom';

export interface ProjectStatus {
  id: string;
  label: string;
  kind: ProjectStatusKind;
  /** Hex color for the status pill. */
  color: string;
}

export const DEFAULT_PROJECT_STATUSES: ProjectStatus[] = [
  { id: 'opened',    label: 'Opened',    kind: 'opened',    color: '#94a3b8' },
  { id: 'started',   label: 'Started',   kind: 'started',   color: '#0ea5e9' },
  { id: 'completed', label: 'Completed', kind: 'completed', color: '#16a34a' },
];

// A reasonable palette for custom statuses reps add.
export const CUSTOM_STATUS_COLORS = ['#7c3aed', '#db2777', '#ea580c', '#0d9488', '#ca8a04', '#4f46e5'];

// ── Subtasks / documents / activity ──────────────────────────────────────────
export interface ProjectSubtask {
  id: string;
  title: string;
  done: boolean;
  /** May differ from the project owner — that's how work fans out to others. */
  assigneeEmail: string | null;
  dueDate: string | null; // ISO date (YYYY-MM-DD)
  completedByEmail?: string | null;
  completedAt?: string | null;
}

export interface ProjectDocument {
  id: string;
  name: string;
  kind: 'file' | 'link';
  /** For links, the URL. For files, the (eventual) stored file URL. */
  url?: string;
  addedByEmail: string;
  addedAt: string; // ISO datetime
}

/** A message in the project's comment thread (group-chat style). */
export interface ProjectComment {
  id: string;
  authorEmail: string;
  text: string;
  at: string; // ISO datetime
}

// Every kind of change we want attributed in the audit trail.
export type ProjectActivityKind =
  | 'created'
  | 'status_changed'
  | 'note_edited'
  | 'subtask_added'
  | 'subtask_completed'
  | 'subtask_reopened'
  | 'subtask_assigned'
  | 'document_added'
  | 'document_removed'
  | 'link_added'
  | 'comment_added'
  | 'owner_changed'
  | 'due_date_changed'
  | 'adhoc_flag_changed'
  | 'deleted';

export interface ProjectActivity {
  id: string;
  kind: ProjectActivityKind;
  actorEmail: string;
  at: string; // ISO datetime
  /** Human-readable, e.g. "marked 'Ship samples' complete". */
  summary: string;
}

// ── Project ──────────────────────────────────────────────────────────────────
export interface Project {
  id: string;
  name: string;
  /** Linked client (Monday Clients-board item id) + denormalized name. */
  clientBoardItemId: string | null;
  clientName: string;
  status: ProjectStatus;
  /** Main responsible person (email). */
  ownerEmail: string;
  /** Main note / description. */
  note: string;
  dueDate: string | null; // ISO date
  subtasks: ProjectSubtask[];
  documents: ProjectDocument[];
  /** Comment thread — group-chat style progress conversation. */
  comments: ProjectComment[];
  /** Whether the ShipHero ad-hoc charge has been created (manual for now). */
  adhocCreated: boolean;
  createdByEmail: string;
  createdAt: string; // ISO datetime
  /** Audit trail — append-only. */
  activity: ProjectActivity[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Everyone involved: the owner plus any subtask assignees (deduped). */
export function projectAssignees(p: Project): string[] {
  const set = new Set<string>();
  if (p.ownerEmail) set.add(p.ownerEmail.toLowerCase());
  for (const s of p.subtasks) if (s.assigneeEmail) set.add(s.assigneeEmail.toLowerCase());
  return Array.from(set);
}

/** True if this project should appear on `email`'s home page. */
export function isAssignedTo(p: Project, email: string | null | undefined): boolean {
  if (!email) return false;
  return projectAssignees(p).includes(email.toLowerCase());
}

/** How `email` is attached to the project, for the "My Projects" tag. */
export function assignmentRole(p: Project, email: string | null | undefined): 'owner' | 'subtask' | null {
  if (!email) return null;
  const me = email.toLowerCase();
  if (p.ownerEmail.toLowerCase() === me) return 'owner';
  if (p.subtasks.some(s => s.assigneeEmail?.toLowerCase() === me)) return 'subtask';
  return null;
}

export function subtaskProgress(p: Project): { done: number; total: number } {
  return { done: p.subtasks.filter(s => s.done).length, total: p.subtasks.length };
}

/** Distinct statuses across a set of projects (for the status filter list). */
export function collectStatuses(projects: Project[]): ProjectStatus[] {
  const byId = new Map<string, ProjectStatus>();
  for (const s of DEFAULT_PROJECT_STATUSES) byId.set(s.id, s);
  for (const p of projects) if (!byId.has(p.status.id)) byId.set(p.status.id, p.status);
  return Array.from(byId.values());
}

// ── Mock data (preview only) ─────────────────────────────────────────────────
// Deterministic ISO strings (no Date.now()) so server + client renders match.
// `andres@shipbots.com` owns two and is a subtask assignee on one, so the
// signed-in demo user sees three under "My Projects".
const S = (id: string) => DEFAULT_PROJECT_STATUSES.find(s => s.id === id)!;

export const MOCK_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Q3 packaging refresh',
    clientBoardItemId: null,
    clientName: 'UFO Pointer',
    status: S('started'),
    ownerEmail: 'andres@shipbots.com',
    note: 'Rework the mailer inserts and switch to the recycled box line. Waiting on final artwork from the client before we lock the SKU list.',
    dueDate: '2026-07-24',
    subtasks: [
      { id: 'st-1a', title: 'Collect artwork from client', done: true, assigneeEmail: 'andres@shipbots.com', dueDate: '2026-07-15', completedByEmail: 'andres@shipbots.com', completedAt: '2026-07-15T16:20:00Z' },
      { id: 'st-1b', title: 'Confirm recycled box dimensions', done: false, assigneeEmail: 'carolina@shipbots.com', dueDate: '2026-07-20' },
      { id: 'st-1c', title: 'Update pick/pack instructions', done: false, assigneeEmail: 'andres@shipbots.com', dueDate: '2026-07-23' },
    ],
    documents: [
      { id: 'doc-1a', name: 'Packaging spec v2.pdf', kind: 'file', addedByEmail: 'andres@shipbots.com', addedAt: '2026-07-12T14:00:00Z' },
      { id: 'doc-1b', name: 'Client brand guidelines', kind: 'link', url: 'https://example.com/brand', addedByEmail: 'carolina@shipbots.com', addedAt: '2026-07-13T09:30:00Z' },
    ],
    comments: [
      { id: 'cm-1a', authorEmail: 'andres@shipbots.com',   text: 'Kicking this off — waiting on the client to send final artwork.', at: '2026-07-11T09:15:00Z' },
      { id: 'cm-1b', authorEmail: 'carolina@shipbots.com', text: 'Confirmed the recycled box line is in stock at Gardena. Dimensions look good.', at: '2026-07-11T14:40:00Z' },
      { id: 'cm-1c', authorEmail: 'andres@shipbots.com',   text: 'Perfect. Artwork just came in — moving this to Started.', at: '2026-07-15T16:22:00Z' },
    ],
    adhocCreated: false,
    createdByEmail: 'andres@shipbots.com',
    createdAt: '2026-07-10T13:00:00Z',
    activity: [
      { id: 'a-1a', kind: 'created', actorEmail: 'andres@shipbots.com', at: '2026-07-10T13:00:00Z', summary: 'created the project' },
      { id: 'a-1b', kind: 'subtask_added', actorEmail: 'andres@shipbots.com', at: '2026-07-10T13:05:00Z', summary: 'added subtask “Collect artwork from client”' },
      { id: 'a-1c', kind: 'subtask_assigned', actorEmail: 'andres@shipbots.com', at: '2026-07-11T10:00:00Z', summary: 'assigned “Confirm recycled box dimensions” to Carolina' },
      { id: 'a-1d', kind: 'subtask_completed', actorEmail: 'andres@shipbots.com', at: '2026-07-15T16:20:00Z', summary: 'marked “Collect artwork from client” complete' },
      { id: 'a-1e', kind: 'status_changed', actorEmail: 'andres@shipbots.com', at: '2026-07-15T16:21:00Z', summary: 'changed status from Opened to Started' },
    ],
  },
  {
    id: 'proj-2',
    name: 'Returns process setup',
    clientBoardItemId: null,
    clientName: 'Arcanium Inc',
    status: S('opened'),
    ownerEmail: 'andres@shipbots.com',
    note: 'Stand up the RMA workflow and returns SOP. Client wants a branded returns portal link.',
    dueDate: '2026-08-05',
    subtasks: [
      { id: 'st-2a', title: 'Draft RMA SOP', done: false, assigneeEmail: 'andres@shipbots.com', dueDate: '2026-07-28' },
      { id: 'st-2b', title: 'Configure returns portal', done: false, assigneeEmail: 'gera@shipbots.com', dueDate: '2026-08-01' },
    ],
    documents: [],
    comments: [],
    adhocCreated: false,
    createdByEmail: 'andres@shipbots.com',
    createdAt: '2026-07-09T11:00:00Z',
    activity: [
      { id: 'a-2a', kind: 'created', actorEmail: 'andres@shipbots.com', at: '2026-07-09T11:00:00Z', summary: 'created the project' },
    ],
  },
  {
    id: 'proj-3',
    name: 'Kickstarter fulfillment plan',
    clientBoardItemId: null,
    clientName: 'Just Wear Cotton',
    status: S('started'),
    ownerEmail: 'carolina@shipbots.com',
    note: 'Plan the bulk shipment intake and per-backer pick lists for the March campaign.',
    dueDate: '2026-07-30',
    subtasks: [
      { id: 'st-3a', title: 'Map backer tiers to SKUs', done: true, assigneeEmail: 'carolina@shipbots.com', dueDate: '2026-07-18', completedByEmail: 'carolina@shipbots.com', completedAt: '2026-07-18T12:00:00Z' },
      { id: 'st-3b', title: 'Get bulk shipping quotes', done: false, assigneeEmail: 'andres@shipbots.com', dueDate: '2026-07-26' },
    ],
    documents: [
      { id: 'doc-3a', name: 'Backer export.csv', kind: 'file', addedByEmail: 'carolina@shipbots.com', addedAt: '2026-07-14T15:00:00Z' },
    ],
    comments: [
      { id: 'cm-3a', authorEmail: 'carolina@shipbots.com', text: 'Backer export is in the docs. Andres, can you get bulk quotes this week?', at: '2026-07-14T15:10:00Z' },
      { id: 'cm-3b', authorEmail: 'andres@shipbots.com',   text: 'On it — reaching out to the carriers now.', at: '2026-07-15T10:05:00Z' },
    ],
    adhocCreated: false,
    createdByEmail: 'carolina@shipbots.com',
    createdAt: '2026-07-08T10:00:00Z',
    activity: [
      { id: 'a-3a', kind: 'created', actorEmail: 'carolina@shipbots.com', at: '2026-07-08T10:00:00Z', summary: 'created the project' },
      { id: 'a-3b', kind: 'subtask_assigned', actorEmail: 'carolina@shipbots.com', at: '2026-07-12T09:00:00Z', summary: 'assigned “Get bulk shipping quotes” to Andres' },
    ],
  },
  {
    id: 'proj-4',
    name: 'Automation rules audit',
    clientBoardItemId: null,
    clientName: 'One Sheep',
    status: { id: 'blocked', label: 'Blocked', kind: 'custom', color: '#dc2626' },
    ownerEmail: 'gera@shipbots.com',
    note: 'Review and clean up the shipping automation rules; several are conflicting.',
    dueDate: '2026-07-21',
    subtasks: [
      { id: 'st-4a', title: 'List all active rules', done: true, assigneeEmail: 'gera@shipbots.com', dueDate: '2026-07-16', completedByEmail: 'gera@shipbots.com', completedAt: '2026-07-16T11:00:00Z' },
      { id: 'st-4b', title: 'Flag conflicts', done: false, assigneeEmail: 'gera@shipbots.com', dueDate: '2026-07-20' },
    ],
    documents: [],
    comments: [],
    adhocCreated: true,
    createdByEmail: 'gera@shipbots.com',
    createdAt: '2026-07-07T09:00:00Z',
    activity: [
      { id: 'a-4a', kind: 'created', actorEmail: 'gera@shipbots.com', at: '2026-07-07T09:00:00Z', summary: 'created the project' },
      { id: 'a-4b', kind: 'adhoc_flag_changed', actorEmail: 'gera@shipbots.com', at: '2026-07-16T12:00:00Z', summary: 'marked ad-hoc as created' },
    ],
  },
];
