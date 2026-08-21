/**
 * Client-detail sections + fields, mirroring the Chrome extension / web CS app.
 * Each field carries its Monday column id + type so one component can render and
 * edit it. Column ids from the extension source (popup.js / client-info-tab.tsx).
 */

export type FieldType = 'text' | 'long' | 'dropdown' | 'status' | 'date' | 'agent';

export interface Field {
  key: string;      // ClientDetail key
  label: string;
  columnId: string; // Monday column id (for saving)
  type: FieldType;
  copy?: boolean;         // show a copy affordance (portal creds)
  link?: 'tel' | 'mailto'; // tap the value to call / email (read mode)
}

export interface FieldSection {
  id: string;
  title: string;
  fields: Field[];
  /** When set, only render for users with that access (billing = canDocusign). */
  gated?: 'billing';
}

export const SECTIONS: FieldSection[] = [
  {
    id: 'contacts',
    title: 'Contact Info',
    fields: [
      { key: 'contactName', label: 'Name', columnId: 'text_mktqq7h6', type: 'text' },
      { key: 'contactEmail', label: 'Email', columnId: 'text_mktq6sr5', type: 'text', link: 'mailto' },
      { key: 'contactPhone', label: 'Phone', columnId: 'text_mktqabcm', type: 'text', link: 'tel' },
      { key: 'contactLocation', label: 'Location', columnId: 'text_mktx8q74', type: 'text' },
      { key: 'contact2Name', label: '2 · Name', columnId: 'text_mktr1evd', type: 'text' },
      { key: 'contact2Email', label: '2 · Email', columnId: 'text_mktr2xmm', type: 'text', link: 'mailto' },
      { key: 'contact2Phone', label: '2 · Phone', columnId: 'text_mktr8kve', type: 'text', link: 'tel' },
      { key: 'contact2ShipHeroAccess', label: '2 · ShipHero access', columnId: 'text_mktyakva', type: 'text' },
      { key: 'contact3Name', label: '3 · Name', columnId: 'text_mktr4v7q', type: 'text' },
      { key: 'contact3Email', label: '3 · Email', columnId: 'text_mktrt74r', type: 'text', link: 'mailto' },
      { key: 'contact3Phone', label: '3 · Phone', columnId: 'text_mktrw0tb', type: 'text', link: 'tel' },
      { key: 'contact3ShipHeroAccess', label: '3 · ShipHero access', columnId: 'text_mktyankg', type: 'text' },
    ],
  },
  {
    id: 'general',
    title: 'General Account Info',
    fields: [
      { key: 'legalEntity', label: 'Legal entity', columnId: 'text_mktp4fvk', type: 'text' },
      { key: 'clientStatus', label: 'Client status', columnId: 'color_mkvq7kn6', type: 'status' },
      { key: 'supportAgentEmail', label: 'Assigned agent', columnId: 'dropdown_mkxx7xv', type: 'agent' },
      { key: 'warehouseLocation', label: 'Warehouse', columnId: 'dropdown_mktxaege', type: 'dropdown' },
      { key: 'subWarehouse', label: 'Sub warehouse', columnId: 'dropdown_mm5ftdxb', type: 'dropdown' },
      { key: 'portalDropdown', label: 'Software version', columnId: 'dropdown_mktrbeyg', type: 'dropdown' },
      { key: 'paymentOnFile', label: 'Payment on file', columnId: 'dropdown_mm47xxjv', type: 'dropdown' },
      { key: 'productCategory', label: 'Product category', columnId: 'color_mktq81r3', type: 'status' },
      { key: 'productDescription', label: 'Products', columnId: 'long_text_mktqtxm', type: 'long' },
      { key: 'shipHeroName', label: 'ShipHero name', columnId: 'text_mkw9n26z', type: 'text' },
      { key: 'shipHeroId', label: 'ShipHero ID', columnId: 'text_mktmf2yw', type: 'text' },
      { key: 'quickbooksName', label: 'QuickBooks name', columnId: 'text_mkx5b9b4', type: 'text' },
      { key: 'invoicingEmail', label: 'Invoicing email', columnId: 'text_mktqjmmm', type: 'text', link: 'mailto' },
      { key: 'umbrellaCompany', label: 'Umbrella co.', columnId: 'dropdown_mkyk2va7', type: 'dropdown' },
      { key: 'businessHQ', label: 'Business HQ', columnId: 'text_mktx63am', type: 'text' },
      { key: 'manufacturingLocation', label: 'Mfg location', columnId: 'text_mktxyg5p', type: 'text' },
      { key: 'pickAndPack', label: 'Pick & pack', columnId: 'text_mm1zw2vf', type: 'text' },
      { key: 'interestInAdditionalServices', label: 'Interest in add-on services', columnId: 'text_mkw2y8q9', type: 'text' },
    ],
  },
  {
    id: 'receiving',
    title: 'Receiving',
    fields: [
      { key: 'initialInventoryDate', label: 'Initial date', columnId: 'date_mktrzhyk', type: 'date' },
      { key: 'initialInventoryMethod', label: 'Method', columnId: 'text_mktrm9jx', type: 'text' },
      { key: 'initialInventoryQty', label: 'Quantity', columnId: 'text_mktravgn', type: 'text' },
      { key: 'itemsBarcoded', label: 'Barcoded?', columnId: 'color_mktrs5ah', type: 'status' },
      { key: 'preStorageNeeds', label: 'Pre-storage', columnId: 'dropdown_mktpdnn0', type: 'dropdown' },
      { key: 'initialInventoryStoringNeeds', label: 'Storing needs', columnId: 'text_mkw2z2tp', type: 'text' },
      { key: 'notesOnInitialInventory', label: 'Inventory notes', columnId: 'long_text_mktqapsv', type: 'long' },
      { key: 'notesForReceiving', label: 'Receiving notes', columnId: 'long_text_mkxecta8', type: 'long' },
    ],
  },
  {
    id: 'packing',
    title: 'Packing & Shipping Requirements',
    fields: [
      { key: 'ecommercePlatforms', label: 'Platforms', columnId: 'long_text_mktra0sm', type: 'long' },
      { key: 'skuCount', label: 'SKU count', columnId: 'text_mktqrstq', type: 'text' },
      { key: 'currentFulfillmentMethod', label: 'Fulfillment', columnId: 'dropdown_mktq27te', type: 'dropdown' },
      { key: 'packaging', label: 'Packaging', columnId: 'dropdown_mktptjhb', type: 'dropdown' },
      { key: 'orderInserts', label: 'Inserts', columnId: 'color_mktpwd5s', type: 'status' },
      { key: 'orderInsertDetails', label: 'Insert details', columnId: 'text_mktpj2v0', type: 'long' },
      { key: 'kitsOrBundles', label: 'Kits / bundles', columnId: 'text_mktp2938', type: 'text' },
      { key: 'overnightDelivery', label: 'Overnight', columnId: 'color_mktq9ekf', type: 'status' },
      { key: 'internationalFulfillment', label: 'International', columnId: 'color_mktq43r0', type: 'status' },
      { key: 'internationalShippingDDUDDP', label: 'DDU / DDP', columnId: 'color_mkwytd1b', type: 'status' },
      { key: 'amazonFBA', label: 'Amazon FBA', columnId: 'color_mktqw7rg', type: 'status' },
      { key: 'shippingMethod', label: 'Ship method', columnId: 'dropdown_mktzcdg0', type: 'dropdown' },
      { key: 'tikTokShop', label: 'TikTok Shop', columnId: 'dropdown_mm28h9mz', type: 'dropdown' },
      { key: 'lotCodeExpiration', label: 'Lot / expiry', columnId: 'dropdown_mm28rr9y', type: 'dropdown' },
      { key: 'outsideLabels', label: 'Outside labels', columnId: 'dropdown_mm47p3h7', type: 'dropdown' },
      { key: 'wholesaleDetails', label: 'Wholesale', columnId: 'text_mkw5t2ey', type: 'long' },
      { key: 'outboundLTL', label: 'Outbound LTL', columnId: 'text_mkw5bdr2', type: 'text' },
      { key: 'additionalInsuranceSignature', label: 'Insurance / signature', columnId: 'text_mktrs0xa', type: 'text' },
      { key: 'estimatedStorage', label: 'Estimated storage', columnId: 'text_mkw4czc2', type: 'text' },
      { key: 'additionalNotes', label: 'Notes', columnId: 'long_text_mktran3x', type: 'long' },
      { key: 'additionalShippingNotes', label: 'Shipping req. notes', columnId: 'long_text_mkwy13zg', type: 'long' },
      { key: 'notesForPacking', label: 'Packing notes', columnId: 'long_text_mkxfv1hr', type: 'long' },
    ],
  },
  {
    id: 'returns',
    title: 'Returns Specifications',
    fields: [
      { key: 'returnsProcess', label: 'Process', columnId: 'color_mkxfrgba', type: 'status' },
      { key: 'returnsIncompleteCondition', label: 'Incomplete', columnId: 'color_mkzf33yv', type: 'status' },
      { key: 'returnsDamagedCondition', label: 'Damaged', columnId: 'color_mkxfa9h5', type: 'status' },
      { key: 'returnsNewCondition', label: 'New', columnId: 'color_mkxfkdyh', type: 'status' },
      { key: 'returnsUsedCondition', label: 'Used', columnId: 'color_mkxfxdx5', type: 'status' },
      { key: 'notesForReturns', label: 'Notes', columnId: 'long_text_mkxeajq4', type: 'long' },
    ],
  },
  {
    id: 'billing',
    title: 'Billing & Pricing',
    gated: 'billing',
    fields: [
      { key: 'billingStreet1', label: 'Billing street 1', columnId: 'text_mkx5vzht', type: 'text' },
      { key: 'billingStreet2', label: 'Billing street 2', columnId: 'text_mkx5f9p9', type: 'text' },
      { key: 'billingCity', label: 'Billing city', columnId: 'text_mkx5z70k', type: 'text' },
      { key: 'billingState', label: 'Billing state', columnId: 'text_mkx5er1a', type: 'text' },
      { key: 'billingZip', label: 'Billing zip', columnId: 'text_mkx5tjd7', type: 'text' },
      { key: 'billingCountry', label: 'Billing country', columnId: 'text_mkx5kyv4', type: 'text' },
      { key: 'billingNameUpdated', label: 'Billing name updated?', columnId: 'color_mkx5yjnk', type: 'status' },
      { key: 'paymentTerms', label: 'Payment terms', columnId: 'text_mm5hgn1k', type: 'text' },
      { key: 'receivingPricing', label: 'Receiving pricing', columnId: 'text_mm5hpark', type: 'long' },
      { key: 'floorLoadedFee', label: 'Floor-loaded fee', columnId: 'text_mm5hxygd', type: 'text' },
      { key: 'binStorage', label: 'Bin storage', columnId: 'text_mm5hwtkt', type: 'text' },
      { key: 'palletStorage', label: 'Pallet storage', columnId: 'text_mm5h6606', type: 'text' },
      { key: 'dtcPickPackPricing', label: 'DTC pick & pack', columnId: 'text_mm5hc2dg', type: 'long' },
      { key: 'b2bPickPack', label: 'B2B pick & pack', columnId: 'text_mm5h4938', type: 'long' },
      { key: 'shippingUpcharge', label: 'Shipping upcharge', columnId: 'text_mktqa6sm', type: 'text' },
      { key: 'intlShippingUpcharge', label: 'Intl shipping upcharge', columnId: 'text_mm5h1w32', type: 'text' },
      { key: 'returnsFee', label: 'Returns fee', columnId: 'text_mm5hzk9n', type: 'text' },
      { key: 'accountManagerFee', label: 'Account manager fee', columnId: 'text_mm5hb9', type: 'text' },
      { key: 'platformFee', label: 'Platform fee', columnId: 'text_mm5hq2xy', type: 'text' },
      { key: 'otherNotes', label: 'Other pricing notes', columnId: 'long_text_mm5hy744', type: 'long' },
    ],
  },
  {
    id: 'portal',
    title: 'Portal Login',
    fields: [
      { key: 'portalLogin', label: 'Username', columnId: 'text_mktxxfch', type: 'text', copy: true },
      { key: 'portalPassword', label: 'Password', columnId: 'text_mm28cz4g', type: 'text', copy: true },
    ],
  },
];

/** PATCH value type per field type. */
export function valueTypeFor(t: FieldType): string {
  if (t === 'long') return 'text';
  if (t === 'agent') return 'dropdown';
  return t; // text | dropdown | status | date
}
