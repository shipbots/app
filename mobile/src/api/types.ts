/**
 * Types mirrored (loosely) from the web app so screens have a stable shape to
 * render regardless of whether data comes from mock fixtures or the live API.
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
}

/** A client's fuller detail (subset of the web ClientInfo). */
export interface ClientDetail extends ClientIndexEntry {
  contact2Name: string;
  contact2Email: string;
  contact2Phone: string;
  paymentOnFile: string;
  initialInventoryMethod: string;
  initialInventoryQty: string;
  estimatedDeliveryDate: string;
  notes: string;
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
