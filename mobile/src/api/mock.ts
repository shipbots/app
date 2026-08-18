import type { ClientDetail, ClientIndexEntry, Task } from './types';

/** In-memory fixtures used before sign-in (and when FORCE_MOCK is on). */
export const MOCK_CLIENTS: ClientDetail[] = [
  {
    id: '1', name: 'Bebonia', legalEntity: 'House of Leon LLC', clientStatus: 'Active',
    quickbooksName: 'Bebonia', shipHeroName: 'Bebonia', productCategory: 'Beauty',
    contactName: 'Maria Leon', contactEmail: 'maria@bebonia.com', contactPhone: '+1 310 555 0142',
    warehouse: 'Gardena', subWarehouse: 'Gardena-A', agentEmail: 'charmy@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'Parcel', initialInventoryQty: '150 boxes',
    additionalNotes: 'Hair extensions — DTC, light + small SKUs.',
  },
  {
    id: '2', name: 'Aeroo Drones', legalEntity: 'Aeroo LLC', clientStatus: 'Active',
    contactName: 'James Park', contactEmail: 'james@aeroo.com', contactPhone: '+1 408 555 0199',
    warehouse: 'Gardena', subWarehouse: 'Gardena-C', agentEmail: 'andres@shipbots.com', portal: 'AppDot',
    paymentOnFile: 'No', initialInventoryMethod: 'LTL Freight', initialInventoryQty: '1,200 units',
    additionalNotes: 'Bulky items, pallet storage.',
  },
  {
    id: '3', name: 'Bright Moments', legalEntity: 'Carlos Campos LLC',
    contactName: 'Carlos Campos', contactEmail: 'carlos@brightmoments.co', contactPhone: '+1 305 555 0110',
    warehouse: 'Dallas', subWarehouse: 'Dallas-B', agentEmail: '', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'Parcel', initialInventoryQty: '300',
  },
  {
    id: '4', name: 'One Sheep', legalEntity: '',
    contactName: 'Dana Wu', contactEmail: 'dana@onesheep.com',
    warehouse: 'Gardena', subWarehouse: '', agentEmail: 'charmy@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'No', additionalNotes: 'Awaiting inventory. Apparel, DTC.',
  },
  {
    id: '5', name: 'Stevia Select', legalEntity: 'Sweet Leaf Foods Inc',
    contactName: 'Priya Nair', contactEmail: 'priya@steviaselect.com', contactPhone: '+1 512 555 0173',
    warehouse: 'Dallas', subWarehouse: 'Dallas-A', agentEmail: 'andres@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'FTL', initialInventoryQty: '5,000',
    additionalNotes: 'Food-grade, lot codes required.',
  },
];

export const MOCK_INDEX: ClientIndexEntry[] = MOCK_CLIENTS.map(c => ({
  id: c.id,
  name: c.name,
  legalEntity: c.legalEntity ?? '',
  contactName: c.contactName ?? '',
  contactEmail: c.contactEmail ?? '',
  contactPhone: c.contactPhone ?? '',
  warehouse: c.warehouse ?? '',
  subWarehouse: c.subWarehouse ?? '',
  agentEmail: c.agentEmail ?? '',
  portal: c.portal ?? '',
}));

export const MOCK_TASKS: Task[] = [
  { id: 't1', name: 'Retrieve payment info', status: 'Working on it', dueDate: '2026-08-18', clientName: 'Aeroo Drones', notes: 'Chase ACH form.' },
  { id: 't2', name: 'Send onboarding summary', status: 'Not Started', dueDate: '2026-08-19', clientName: 'Stevia Select', notes: '' },
  { id: 't3', name: 'Confirm sub-warehouse', status: 'Not Started', dueDate: '2026-08-17', clientName: 'One Sheep', notes: 'Gardena — suggest A or C.' },
  { id: 't4', name: 'Book onboarding call', status: 'Done', dueDate: '2026-08-10', clientName: 'Bebonia', notes: '' },
];
