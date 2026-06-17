export const ONBOARDING_BOARD_ID = '6004116565';
export const CLIENTS_BOARD_ID = '7846251224';

// Groups on the Clients board that the app cares about.
//   EXITED — the "deactivated" bucket. Items moved here are treated as
//            inactive everywhere in the UI (hidden by default, shown when
//            the "View inactive clients" toggle is on).
//   ACTIVE_DEFAULT — the main bucket clients land in when reactivated from
//                    the side panel toggle. If your team uses a different
//                    home group (e.g. CA3PL) you can change this one id and
//                    the UI follows.
export const CLIENT_GROUP_EXITED = 'group_mkq09z7j';
export const CLIENT_GROUP_ACTIVE_DEFAULT = '1731530494_companys___freshdes__1';

// Pipeline columns in order — active (non-deactivated) Monday.com labels only
export const PIPELINE_STAGES = [
  { status: 'Not Started',                    color: '#cab641', bgColor: '#faf8e8' },
  { status: 'In Progress',                    color: '#fdab3d', bgColor: '#fff8ed' },
  { status: 'Onboarded, Awaiting Inventory',  color: '#579bfc', bgColor: '#edf4ff' },
  { status: 'Completed',                      color: '#00c875', bgColor: '#e6faf0' },
  { status: 'Abandoned',                      color: '#bb3354', bgColor: '#faeef1' },
  { status: 'N/A',                            color: '#c4c4c4', bgColor: '#f5f5f5' },
  { status: 'ZAP ERROR',                      color: '#ff5ac4', bgColor: '#fff0f9' },
] as const;

// Deactivated / legacy statuses — items with these labels are hidden from the kanban
export const INACTIVE_STATUSES = [
  'Done/Pending Items',
  'Docusign Pending',
  'Contract Signed',
  'Onboarding Postponed',
  'Inventory Late',
  'Onboarding Never Scheduled',
  'Inventory Never Arrived',
  'Docusign Never Signed',
  'Pending',
  'Needs Contract',
  'Done - Onboarding Complete, Inventory Arrived',
] as const;

// Checklist steps mapped to Monday.com column IDs
// options = exact label texts as defined in Monday.com; '' = clear/not-started
// invertLogic = true means "No" is the desired/done state (e.g. "Additional Call Required")
type ChecklistStepConfig = {
  id: string;
  label: string;
  shortLabel: string;
  options: readonly string[];
  invertLogic?: boolean;
  /**
   * Where this checklist step's value lives. Defaults to the Onboarding
   * board. 'clients' means the column lives on the Clients board and is
   * joined in via the connect_boards relation — e.g. "Retrieved payment
   * information" mirrors the "Payment on File?" dropdown on Clients.
   */
  board?: 'onboarding' | 'clients';
};

export const CHECKLIST_STEPS: readonly ChecklistStepConfig[] = [
  { id: 'color_mktr9afd',  label: 'Sign Contract',                       shortLabel: 'Contract',    options: ['Done', 'Pending'] },
  { id: 'dropdown_mm47xxjv', label: 'Retrieved payment information',     shortLabel: 'Payment Info', options: ['Yes', 'No'], board: 'clients' },
  { id: 'color_mktp5834',  label: 'Book Onboarding Call',                shortLabel: 'Book Call',   options: ['Done'] },
  { id: 'color_mktrpzz5',  label: 'Connect Your Store',                  shortLabel: 'Store',       options: ['Done', 'Working on it', 'Stuck', 'Not connecting Store'] },
  { id: 'color_mktrf23d',  label: 'Configure Shopify Settings',          shortLabel: 'Shopify',     options: ['Done', 'N/A'] },
  { id: 'color_mkys5ys0',  label: 'Email ShipHero for Pallet Creation',  shortLabel: 'Pallet Email', options: ['Done', 'N/A'] },
  { id: 'color_mktrmpxj',  label: 'Enable Inventory Syncing',            shortLabel: 'Inv Sync',    options: ['Yes', 'Pending', 'No'] },
  { id: 'color_mktra6z8',  label: 'Map Shipping Methods',                shortLabel: 'Shipping',    options: ['Done', 'Pending'] },
  { id: 'color_mktrhdny',  label: 'Apply Discount to Customs Value',     shortLabel: 'Customs',     options: ['Done', 'N/A'] },
  { id: 'color_mktrykq',   label: 'Review Billing FAQ',                  shortLabel: 'Billing',     options: ['Done'] },
  { id: 'color_mktrgqyc',  label: 'Review Receiving FAQ',                shortLabel: 'Receiving',   options: ['Done'] },
  { id: 'color_mktr96cf',  label: 'Initial Inventory PO + WRO',          shortLabel: 'Inv PO',      options: ['Done'] },
  { id: 'color_mktv3dek',  label: 'Configure International Shipping',    shortLabel: 'Intl Ship',   options: ['Done'] },
  { id: 'color_mktv6qb',   label: 'Configure FBA Shipping',              shortLabel: 'FBA',         options: ['Done', 'Working on it', 'Stuck', 'N/A'] },
  { id: 'color_mktrgcmx',  label: 'Confirm Fulfillment Profile',         shortLabel: 'Fulfillment', options: ['Done', 'Working on it', 'Stuck'] },
  { id: 'color_mkzembac',  label: 'Configure Returns',                   shortLabel: 'Returns',     options: ['Done', 'Loop Integration Pending', 'NA'] },
  { id: 'color_mm27gvc0',  label: 'Email Onboarding Summary Sent',       shortLabel: 'Summary',     options: ['Yes'] },
  { id: 'color_mm278h2v',  label: 'Additional Call Required',            shortLabel: 'Add. Call',   options: ['Yes', 'No'], invertLogic: true },
  { id: 'color_mm28q860',  label: 'Set up TikTok Shop Automation',       shortLabel: 'TikTok Shop', options: ['Done', 'NA'] },
  { id: 'color_mm28ht8',   label: 'Lot Code / Expiration Set up',        shortLabel: 'Lot Code',    options: ['Done', 'NA'] },
];

// Status value to visual state mapping
// invertLogic: when true, "No" is the desired/done state (e.g. "Additional Call Required")
export function getStepState(value: string | null, invertLogic = false): 'done' | 'pending' | 'na' | 'not_started' {
  if (!value) return 'not_started';
  const v = value.toLowerCase();
  if (invertLogic) {
    if (v === 'no') return 'done';
    if (v === 'yes') return 'pending';
    return 'not_started';
  }
  if (v === 'done' || v === 'yes') return 'done';
  if (v === 'pending' || v === 'working on it' || v === 'needs set up' || v.includes('pending')) return 'pending';
  if (v === 'n/a' || v === 'na' || v === 'not connecting store') return 'na';
  return 'not_started';
}

export function getStepColor(state: 'done' | 'pending' | 'na' | 'not_started'): string {
  switch (state) {
    case 'done': return '#00c875';
    case 'pending': return '#fdab3d';
    case 'na': return '#c4c4c4';
    case 'not_started': return '#e0e0e0';
  }
}

// Column IDs for fetching onboarding data
export const ONBOARDING_COLUMN_IDS = [
  'estado',
  'status_2',
  'date3',
  'date__1',
  'connect_boards',
  'person',
  'columns_battery_mkxx3ja4',
  'text_mknvz32c',
  'text_mkkgy00b',
  'text1',
  'text_mkw94440', // Shipping Details (stores selected shipping methods)
  // Only include checklist steps whose value lives on the Onboarding board.
  // Steps with `board: 'clients'` are joined in separately from the Clients
  // board so we don't waste the Onboarding fetch query on columns it doesn't
  // own.
  ...CHECKLIST_STEPS.filter(s => (s.board ?? 'onboarding') === 'onboarding').map(s => s.id),
  // New status indicator columns (already included via CHECKLIST_STEPS above,
  // but listed here for clarity: color_mm27gvc0, color_mm278h2v)
];

// Column IDs for fetching client data
export const CLIENT_COLUMN_IDS = [
  'text_mktqq7h6', // Person of Contact
  'text_mktq6sr5', // Person of Contact Email
  'text_mktqabcm', // Phone Number
  'text_mktmf2yw', // ShipHero ID
  'text_mkw9n26z', // ShipHero Name
  'text_mktp4fvk', // Legal Entity
  'text_mkxxfg1b', // EIN
  'text_mktqjmmm', // Invoicing Email
  'text_mktxxfch', // Portal Username / Support Login Email
  'text_mm28cz4g', // ShipBots Support Password
  'text_mkwgke3w', // AppDot / Portal Login Email
  'dropdown_mktrbeyg', // Portal dropdown
  'color_mktq81r3', // Product Category
  'long_text_mktqtxm', // Product Description
  'long_text_mktra0sm', // E-Commerce Platforms
  'text_mktqrstq', // SKU Count
  'text_mkw4czc2', // Estimated Storage
  'dropdown_mktxaege', // Warehouse Location
  'text_mktx8q74', // Contact Location
  'text_mktx63am', // Business HQ
  'text_mktxyg5p', // Manufacturing Location
  'text_mktqa6sm', // Shipping Volume
  'link_mktqh0sq', // Pricing Proposal
  'text_mktp2938', // Kits or Bundles
  'dropdown_mktpdnn0', // Pre-Storage
  'dropdown_mktptjhb', // Packaging
  'color_mktpwd5s', // Order Inserts
  'text_mktpj2v0', // Order Insert Details
  'color_mktq3kwz', // General Information
  'color_mktq43r0', // International Fulfillment
  'color_mktq9ekf', // Overnight Delivery
  'color_mktqw7rg', // Amazon FBA
  'color_mktrs5ah', // Items Barcoded
  'date_mktrzhyk', // Initial Inventory Date
  'text_mktravgn', // Initial Inventory Qty
  'text_mktrm9jx', // Initial Inventory Method
  'long_text_mktran3x', // Additional Notes
  'text__1', // Hubspot Deal Link (from onboarding board)
  'text_mktvqkjw', // Hubspot Deal ID (from onboarding board)
  'people__1', // Support Agent
  'dropdown_mkxx7xv', // Support Agent Email
  'text_mktr1evd', // Contact 2 Name
  'text_mktr2xmm', // Contact 2 Email
  'text_mktr8kve', // Contact 2 Phone
  'text_mktr4v7q', // Contact 3 Name
  'text_mktrt74r', // Contact 3 Email
  'text_mktrw0tb', // Contact 3 Phone
  'date_mkw2fhte', // Date DocuSign Signed
  'dropdown_mm28h9mz', // TikTok Shop?
  'dropdown_mm28rr9y', // Lot Code / Expiration Needed?
];

// Alert thresholds (in days)
export const ALERT_THRESHOLDS = {
  contractUnsigned: 7,
  callNotScheduled: 5,
  inventoryOverdue: 3,
  checklistStalled: 7,
};
