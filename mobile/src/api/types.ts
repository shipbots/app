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
