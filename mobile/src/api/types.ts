/**
 * Types the app renders. Search rows come from /api/clients/search-index; the
 * detail is the web ClientInfo, kept as a flexible string record so the field
 * registry (fields.ts) can read/write any Monday-backed key by name.
 */

/** One row of the Clients search index (see /api/clients/search-index). */
export interface ClientIndexEntry {
  id: string;
  name: string;
  legalEntity: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  warehouse: string;
  subWarehouse: string;
  agentEmail: string;
  portal: string;
  groupId: string; // Clients-board group; CLIENT_GROUP_EXITED_ID == inactive
}

/** A client's full detail — keys match the web ClientInfo field names. */
export interface ClientDetail {
  id: string;
  name: string;
  [key: string]: string | undefined;
}

/** Sticky note (matches /api/client/[id]/sticky-notes). */
export interface StickyNote {
  id: string;
  text: string;
  color: string;
  createdAt?: string;
  authorEmail?: string;
  expiresAt?: string;
  x?: number;
  y?: number;
}

/** One onboarding checklist step (from the onboarding item's checklist). */
export interface OnboardingStep {
  label: string;
  columnId: string;      // Monday column id (for editing the status)
  value: string;         // current status label
  options: string[];     // valid status labels
  invertLogic: boolean;  // "No" = done (e.g. Tech Demo Required)
  state: 'done' | 'pending' | 'na';
}
/** A client's onboarding progress (from /api/onboarding-items). */
export interface OnboardingInfo {
  onboardingItemId: string; // Onboarding-board item id (for PATCHing steps)
  progress: number;         // 0–100, server-computed
  steps: OnboardingStep[];
}

/** A document/link attached to a client. */
export interface ClientDoc {
  name: string;
  url: string;
  category: string;
  assetId?: string;
  kind: 'file' | 'link';
}

/** An inbound delivery for the Delivery Timeline (from onboarding items). */
export interface DeliveryEvent {
  id: string;
  clientId?: string; // Clients-board id (to open the client)
  name: string;
  date: string; // YYYY-MM-DD estimated delivery
  delivered: boolean;
  method?: string;
  qty?: string;
  warehouse?: string;
  subWarehouse?: string;
  agentEmail?: string;
}

/** A task / subitem assigned to the agent. */
export interface Task {
  id: string;
  name: string;
  status: string;
  dueDate: string;
  clientName: string;
  notes: string;
}

/** Subitem board metadata needed to edit a task. */
export interface TaskBoardInfo {
  boardId: string | null;
  statusColumnId: string | null;
  statusOptions: string[];
  dateColumnId: string | null;
  notesColumnId: string | null;
}

/** A claim on the Monday "✳️ Claims" board (see the dashboard's lib/claims.ts). */
export interface ClaimFile {
  assetId: string;
  name: string;
  isImage: boolean;
  /** Short-lived signed download link from Monday (may be empty). */
  url?: string;
}

export interface Claim {
  id: string;
  name: string;
  groupId: string;
  groupTitle: string;
  createdAt: string;
  status: string;
  claimNumber: string;
  resultNotes: string;
  dateSubmitted: string;   // YYYY-MM-DD
  orderNumber: string;
  trackingNumber: string;
  reason: string;
  additionalInfo: string;
  dateResolved: string;    // YYYY-MM-DD
  whoRequested: string;
  value: string;
  files: ClaimFile[];
}

export interface ClaimOptions {
  statuses: string[];
  reasons: string[];
  groups: { id: string; title: string }[];
}

export interface ClaimsPayload {
  claims: Claim[];
  options: ClaimOptions;
}

/** Editable claim fields (everything but stage, which is `groupId`). */
export type ClaimFields = Partial<Pick<Claim,
  'status' | 'claimNumber' | 'resultNotes' | 'dateSubmitted' | 'orderNumber' | 'trackingNumber'
  | 'reason' | 'additionalInfo' | 'dateResolved' | 'whoRequested' | 'value'>>;
