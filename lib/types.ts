export interface OnboardingItem {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  inventoryDelivered: string;
  kickoffDate: string | null;
  kickoffTime: string | null;    // "HH:MM:SS" from Monday.com date column, null if no time set
  deliveredDate: string | null;
  deliveredTime: string | null;  // "HH:MM:SS" from Monday.com date column, null if no time set
  // "Initial Inventory Est. Delivery Date" — joined from the linked Clients
  // board item (column date_mktrzhyk). Drives the calendar's "Expected
  // Delivery" event; deliveredDate above is the actual receive date.
  estimatedDeliveryDate: string | null;
  estimatedDeliveryTime: string | null;
  shippingDetails: string;       // free-text from "Shipping Details" column (text_mkw94440)
  onboarder: string | null;
  clientBoardItemId: string | null;
  clientBoardItemName: string | null;
  supportAgentEmail: string | null;
  progress: number;
  checklist: ChecklistStep[];
  subitemCount: number;
}

export interface SubItem {
  id: string;
  name: string;
  status: string;
  /**
   * Human-readable assignee text (typically comma-separated emails or names
   * as Monday renders them). Kept for backward compatibility — UI should
   * prefer assigneeEmails when present.
   */
  assignee: string;
  /**
   * Structured list of assignee email addresses pulled from the subitem
   * board's "Assigned" dropdown column (dropdown_mm44hv8s). Always
   * lowercased so email-based filtering is straightforward.
   */
  assigneeEmails: string[];
  dueDate: string;      // "YYYY-MM-DD" or ""
  parentItemId: string;
  parentItemName: string;
}

/**
 * Metadata about the Monday.com subitem board the team uses for tasks —
 * which columns hold status, due-date, and assignee, plus the current
 * label sets for the status and assignee dropdowns.
 *
 * Lives in lib/types (not components/tasks-view, where it used to be)
 * so edit-task-modal.tsx, action-items-modal.tsx, tasks-tab.tsx, and
 * tasks-view.tsx can all reference it without creating a circular
 * import graph. `import type` was not enough — webpack's production
 * cycle detector still tripped on it even though the TS types get
 * erased — moving the type to a leaf module is the real fix.
 */
export interface BoardInfo {
  boardId: string | null;
  statusColumnId: string | null;
  statusOptions: string[];
  dateColumnId: string | null;
  /** ID of the dropdown column the team uses to assign a task (by email). */
  assigneeColumnId: string | null;
  /** Existing emails the dropdown has seen; UI seeds its picker from these. */
  assigneeOptions: string[];
}

export interface CalendarEvent {
  id: string;            // item.id + '-kickoff' | item.id + '-delivery'
  type: 'kickoff' | 'delivery';
  date: string;          // "YYYY-MM-DD"
  time: string | null;   // "HH:MM:SS" or null
  item: OnboardingItem;
}

export interface ChecklistStep {
  id: string;
  label: string;
  shortLabel: string;
  value: string | null;
  options: readonly string[]; // valid labels from Monday.com column settings
  invertLogic?: boolean;      // if true, "No" = done and "Yes" = pending (e.g. "Additional Call Required")
}

export interface MonFile {
  assetId: string;
  name: string;
  url: string;
  fileExtension: string;
}

export interface ClientInfo {
  id: string;
  name: string;
  // General Account Info
  legalEntity: string;
  ein: string;
  quickbooksName: string;
  shipHeroId: string;
  shipHeroName: string;
  /** Yes / No dropdown — also drives the "Retrieved payment information"
   *  checklist step on the onboarding board. */
  paymentOnFile: string;
  productCategory: string;
  productDescription: string;
  warehouseLocation: string;
  businessHQ: string;
  manufacturingLocation: string;
  clientStatus: string;
  timeAsClientDays: string;
  interestInAdditionalServices: string;
  umbrellaCompany: string;
  billingStreet1: string;
  billingStreet2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  billingNameUpdated: string;
  pricingProposal: { url: string; text: string } | null;
  docusignFile: MonFile | null;
  dateDocusignSigned: string;
  pickAndPack: string;
  invoicingEmail: string;
  // Contact Info
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contactLocation: string;
  contact2Name: string;
  contact2Email: string;
  contact2Phone: string;
  contact2ShipHeroAccess: string;
  contact3Name: string;
  contact3Email: string;
  contact3Phone: string;
  contact3ShipHeroAccess: string;
  // Receiving
  initialInventoryDate: string;
  itemsBarcoded: string;
  initialInventoryMethod: string;
  initialInventoryQty: string;
  preStorageNeeds: string;
  initialInventoryStoringNeeds: string;
  notesOnInitialInventory: string;
  notesForReceiving: string;
  // Packing & Shipping
  ecommercePlatforms: string;
  skuCount: string;
  currentFulfillmentMethod: string;
  packaging: string;
  orderInserts: string;
  orderInsertDetails: string;
  kitsOrBundles: string;
  overnightDelivery: string;
  internationalFulfillment: string;
  internationalShippingDDUDDP: string;
  amazonFBA: string;
  shippingMethod: string;
  additionalInsuranceSignature: string;
  wholesaleDetails: string;
  outboundLTL: string;
  estimatedStorage: string;
  shippingVolume: string;
  additionalNotes: string;
  additionalShippingNotes: string;
  notesForPacking: string;
  tikTokShop: string;
  lotCodeExpiration: string;
  outsideLabels: string;
  // Returns
  returnsProcess: string;
  notesForReturns: string;
  returnsIncompleteCondition: string;
  returnsDamagedCondition: string;
  returnsNewCondition: string;
  returnsUsedCondition: string;
  // Portal / Support
  portalLogin: string;
  portalPassword: string;
  portalEmail: string;
  portalDropdown: string;
  supportAgent: string;
  supportAgentEmail: string;
  hubspotDealLink: string;
  hubspotDealId: string;
  /** Clients-board group id (e.g. group_mkq09z7j = 'Exited'). Drives the
   *  Active / Inactive toggle in the side panel. */
  groupId: string;
}

export interface FirefliesMeeting {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string[];
  summary?: string;
  actionItems?: string[];
  url?: string;       // Fireflies transcript/meeting page URL
  videoUrl?: string;  // Direct video URL (if available)
}

export interface GmailThread {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  messageCount: number;
  folder: 'inbox' | 'sent' | 'other';
}

export interface Alert {
  id: string;
  type: 'contract' | 'scheduling' | 'inventory' | 'stalled' | 'upcoming';
  severity: 'high' | 'medium' | 'low';
  clientName: string;
  clientId: string;
  message: string;
  daysOverdue?: number;
  date?: string;
}

export type OnboardingStatus =
  | 'N/A'
  | 'Needs Contract'
  | 'Docusign Pending'
  | 'Contract Signed'
  | 'Onboarding Scheduled'
  | 'Onboarding Postponed'
  | 'Onboarded, Awaiting Inventory'
  | 'Onboarding Never Scheduled'
  | 'Inventory Late'
  | 'Inventory Never Arrived'
  | 'Docusign Never Signed'
  | 'Done - Onboarding Complete, Inventory Arrived'
  | 'Done/Pending Items'
  | 'Pending'
  | 'ZAP ERROR';
