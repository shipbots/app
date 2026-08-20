import type { ClientInfo } from './types';

/** Kind hints how to render/save a field. Monday auto-detects the real column
 *  type server-side, so this mainly drives the review UI + option constraint. */
export type ExtractKind = 'text' | 'long' | 'status' | 'dropdown' | 'date';

export interface ExtractField {
  /** ClientInfo property — used to read the current value and to key updates. */
  key: keyof ClientInfo;
  columnId: string;
  label: string;
  kind: ExtractKind;
  section: string;
}

/** The Client-Info fields an onboarding-call transcript can plausibly fill.
 *  Deliberately excludes billing/pricing, portal login, EIN, ShipHero IDs,
 *  formulas and other things not discussed operationally on a discovery call. */
export const EXTRACT_FIELDS: ExtractField[] = [
  // ── General ──────────────────────────────────────────────────────────────
  { key: 'legalEntity', columnId: 'text_mktp4fvk', label: 'Legal Entity Name', kind: 'text', section: 'General' },
  { key: 'productCategory', columnId: 'color_mktq81r3', label: 'Product Category', kind: 'status', section: 'General' },
  { key: 'productDescription', columnId: 'long_text_mktqtxm', label: 'Product Description', kind: 'long', section: 'General' },
  { key: 'warehouseLocation', columnId: 'dropdown_mktxaege', label: 'Warehouse Location', kind: 'dropdown', section: 'General' },
  { key: 'subWarehouse', columnId: 'dropdown_mm5ftdxb', label: 'Sub Warehouse', kind: 'dropdown', section: 'General' },
  { key: 'manufacturingLocation', columnId: 'text_mktxyg5p', label: 'Where They Manufacture', kind: 'text', section: 'General' },
  { key: 'businessHQ', columnId: 'text_mktx63am', label: 'Business HQ', kind: 'text', section: 'General' },
  { key: 'umbrellaCompany', columnId: 'dropdown_mkyk2va7', label: 'Umbrella Company', kind: 'dropdown', section: 'General' },
  { key: 'interestInAdditionalServices', columnId: 'text_mkw2y8q9', label: 'Interest in Additional Services', kind: 'text', section: 'General' },
  { key: 'portalDropdown', columnId: 'dropdown_mktrbeyg', label: 'AppDot / Portal', kind: 'dropdown', section: 'General' },

  // ── Contacts ─────────────────────────────────────────────────────────────
  { key: 'contactName', columnId: 'text_mktqq7h6', label: 'Primary Contact — Name', kind: 'text', section: 'Contacts' },
  { key: 'contactEmail', columnId: 'text_mktq6sr5', label: 'Primary Contact — Email', kind: 'text', section: 'Contacts' },
  { key: 'contactPhone', columnId: 'text_mktqabcm', label: 'Primary Contact — Phone', kind: 'text', section: 'Contacts' },
  { key: 'contactLocation', columnId: 'text_mktx8q74', label: 'Primary Contact — Location', kind: 'text', section: 'Contacts' },
  { key: 'contact2Name', columnId: 'text_mktr1evd', label: 'Contact 2 — Name', kind: 'text', section: 'Contacts' },
  { key: 'contact2Email', columnId: 'text_mktr2xmm', label: 'Contact 2 — Email', kind: 'text', section: 'Contacts' },
  { key: 'contact2Phone', columnId: 'text_mktr8kve', label: 'Contact 2 — Phone', kind: 'text', section: 'Contacts' },
  { key: 'contact3Name', columnId: 'text_mktr4v7q', label: 'Contact 3 — Name', kind: 'text', section: 'Contacts' },
  { key: 'contact3Email', columnId: 'text_mktrt74r', label: 'Contact 3 — Email', kind: 'text', section: 'Contacts' },
  { key: 'contact3Phone', columnId: 'text_mktrw0tb', label: 'Contact 3 — Phone', kind: 'text', section: 'Contacts' },

  // ── Receiving ────────────────────────────────────────────────────────────
  { key: 'initialInventoryDate', columnId: 'date_mktrzhyk', label: 'Initial Inventory Est. Delivery Date', kind: 'date', section: 'Receiving' },
  { key: 'initialInventoryMethod', columnId: 'text_mktrm9jx', label: 'Initial Inventory Delivery Method', kind: 'text', section: 'Receiving' },
  { key: 'initialInventoryQty', columnId: 'text_mktravgn', label: 'Initial Inventory Quantity', kind: 'text', section: 'Receiving' },
  { key: 'itemsBarcoded', columnId: 'color_mktrs5ah', label: 'Items Barcoded', kind: 'status', section: 'Receiving' },
  { key: 'preStorageNeeds', columnId: 'dropdown_mktpdnn0', label: 'Pre-Bag / Pre-Pack Before Storage', kind: 'dropdown', section: 'Receiving' },
  { key: 'initialInventoryStoringNeeds', columnId: 'text_mkw2z2tp', label: 'Initial Inventory Storing Needs', kind: 'text', section: 'Receiving' },
  { key: 'notesOnInitialInventory', columnId: 'long_text_mktqapsv', label: 'Notes on Initial Inventory', kind: 'long', section: 'Receiving' },
  { key: 'notesForReceiving', columnId: 'long_text_mkxecta8', label: 'Notes for Receiving', kind: 'long', section: 'Receiving' },

  // ── Packing & Shipping ───────────────────────────────────────────────────
  { key: 'ecommercePlatforms', columnId: 'long_text_mktra0sm', label: 'E-Commerce Platforms', kind: 'long', section: 'Packing & Shipping' },
  { key: 'skuCount', columnId: 'text_mktqrstq', label: '# of SKUs', kind: 'text', section: 'Packing & Shipping' },
  { key: 'currentFulfillmentMethod', columnId: 'dropdown_mktq27te', label: 'Current Fulfillment Method', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'packaging', columnId: 'dropdown_mktptjhb', label: 'Packaging', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'orderInserts', columnId: 'color_mktpwd5s', label: 'Order Inserts', kind: 'status', section: 'Packing & Shipping' },
  { key: 'orderInsertDetails', columnId: 'text_mktpj2v0', label: 'Order Inserts Details', kind: 'text', section: 'Packing & Shipping' },
  { key: 'kitsOrBundles', columnId: 'text_mktp2938', label: 'Kits or Bundles', kind: 'text', section: 'Packing & Shipping' },
  { key: 'overnightDelivery', columnId: 'color_mktq9ekf', label: 'Overnight / 2-Day Delivery?', kind: 'status', section: 'Packing & Shipping' },
  { key: 'internationalFulfillment', columnId: 'color_mktq43r0', label: 'Fulfilling Internationally?', kind: 'status', section: 'Packing & Shipping' },
  { key: 'internationalShippingDDUDDP', columnId: 'color_mkwytd1b', label: 'International DDU/DDP', kind: 'status', section: 'Packing & Shipping' },
  { key: 'amazonFBA', columnId: 'color_mktqw7rg', label: 'Sending to Amazon FBA?', kind: 'status', section: 'Packing & Shipping' },
  { key: 'tikTokShop', columnId: 'dropdown_mm28h9mz', label: 'TikTok Shop?', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'lotCodeExpiration', columnId: 'dropdown_mm28rr9y', label: 'Lot Code / Expiration Needed?', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'outsideLabels', columnId: 'dropdown_mm47p3h7', label: 'Outside Labels?', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'shippingMethod', columnId: 'dropdown_mktzcdg0', label: 'Shipping Method', kind: 'dropdown', section: 'Packing & Shipping' },
  { key: 'additionalInsuranceSignature', columnId: 'text_mktrs0xa', label: 'Additional Insurance / Signature', kind: 'text', section: 'Packing & Shipping' },
  { key: 'wholesaleDetails', columnId: 'text_mkw5t2ey', label: 'Wholesale Details', kind: 'text', section: 'Packing & Shipping' },
  { key: 'outboundLTL', columnId: 'text_mkw5bdr2', label: 'Outbound LTL', kind: 'text', section: 'Packing & Shipping' },
  { key: 'estimatedStorage', columnId: 'text_mkw4czc2', label: 'Estimated Inventory Storage', kind: 'text', section: 'Packing & Shipping' },
  { key: 'additionalNotes', columnId: 'long_text_mktran3x', label: 'Additional Notes', kind: 'long', section: 'Packing & Shipping' },
  { key: 'additionalShippingNotes', columnId: 'long_text_mkwy13zg', label: 'Additional Shipping Requirement Notes', kind: 'long', section: 'Packing & Shipping' },
  { key: 'notesForPacking', columnId: 'long_text_mkxfv1hr', label: 'Notes for Packing', kind: 'long', section: 'Packing & Shipping' },

  // ── Returns ──────────────────────────────────────────────────────────────
  { key: 'returnsProcess', columnId: 'color_mkxfrgba', label: 'Returns Process', kind: 'status', section: 'Returns' },
  { key: 'notesForReturns', columnId: 'long_text_mkxeajq4', label: 'Notes for Returns', kind: 'long', section: 'Returns' },
  { key: 'returnsNewCondition', columnId: 'color_mkxfkdyh', label: 'Returns — New Condition', kind: 'status', section: 'Returns' },
  { key: 'returnsUsedCondition', columnId: 'color_mkxfxdx5', label: 'Returns — Used Condition', kind: 'status', section: 'Returns' },
  { key: 'returnsDamagedCondition', columnId: 'color_mkxfa9h5', label: 'Returns — Damaged Condition', kind: 'status', section: 'Returns' },
  { key: 'returnsIncompleteCondition', columnId: 'color_mkzf33yv', label: 'Returns — Incomplete Condition', kind: 'status', section: 'Returns' },
];

/** Status/dropdown columns whose allowed option labels we constrain the model to. */
export const EXTRACT_OPTION_COLUMN_IDS = EXTRACT_FIELDS
  .filter((f) => f.kind === 'status' || f.kind === 'dropdown')
  .map((f) => f.columnId);

export const kindToValueType = (k: ExtractKind): 'text' | 'status' | 'dropdown' | 'date' =>
  k === 'status' ? 'status' : k === 'dropdown' ? 'dropdown' : k === 'date' ? 'date' : 'text';
