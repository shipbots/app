/**
 * Types the app renders. Search rows come from /api/clients/search-index; the
 * detail is a subset of the web ClientInfo (normalized: warehouseLocation →
 * warehouse). All detail fields are optional so the UI just skips blanks.
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

/** A client's detail — normalized from the web ClientInfo. */
export interface ClientDetail {
  id: string;
  name: string;
  legalEntity?: string;
  clientStatus?: string;
  quickbooksName?: string;
  shipHeroName?: string;
  umbrellaCompany?: string;
  businessHQ?: string;
  productCategory?: string;
  productDescription?: string;
  // Contacts
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactLocation?: string;
  contact2Name?: string;
  contact2Email?: string;
  contact2Phone?: string;
  contact3Name?: string;
  contact3Email?: string;
  contact3Phone?: string;
  // Fulfillment
  warehouse?: string;
  subWarehouse?: string;
  portal?: string;
  agentEmail?: string;
  currentFulfillmentMethod?: string;
  ecommercePlatforms?: string;
  skuCount?: string;
  packaging?: string;
  kitsOrBundles?: string;
  internationalFulfillment?: string;
  amazonFBA?: string;
  shippingMethod?: string;
  // Receiving
  initialInventoryDate?: string;
  initialInventoryMethod?: string;
  initialInventoryQty?: string;
  itemsBarcoded?: string;
  initialInventoryStoringNeeds?: string;
  notesForReceiving?: string;
  notesOnInitialInventory?: string;
  // Onboarding / billing (non-sensitive)
  paymentOnFile?: string;
  invoicingEmail?: string;
  additionalNotes?: string;
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
