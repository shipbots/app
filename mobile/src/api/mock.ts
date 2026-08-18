import type { ClientDetail, ClientIndexEntry, Task } from './types';

/**
 * Realistic in-memory fixtures so the app is fully navigable before the live
 * (auth-gated) API is wired up. Shapes match the web app's Clients board.
 */
export const MOCK_CLIENTS: ClientDetail[] = [
  {
    id: '1', name: 'Bebonia', legalEntity: 'House of Leon LLC',
    contactName: 'Maria Leon', contactEmail: 'maria@bebonia.com', contactPhone: '+1 310 555 0142',
    contact2Name: 'Ops Team', contact2Email: 'ops@bebonia.com', contact2Phone: '',
    warehouse: 'Gardena', subWarehouse: 'Gardena-A', agentEmail: 'charmy@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'Parcel', initialInventoryQty: '150 boxes',
    estimatedDeliveryDate: '2026-08-20', notes: 'Hair extensions — DTC, light + small SKUs.',
  },
  {
    id: '2', name: 'Aeroo Drones', legalEntity: 'Aeroo LLC',
    contactName: 'James Park', contactEmail: 'james@aeroo.com', contactPhone: '+1 408 555 0199',
    contact2Name: '', contact2Email: '', contact2Phone: '',
    warehouse: 'Gardena', subWarehouse: 'Gardena-C', agentEmail: 'andres@shipbots.com', portal: 'AppDot',
    paymentOnFile: 'No', initialInventoryMethod: 'LTL Freight', initialInventoryQty: '1,200 units',
    estimatedDeliveryDate: '2026-08-12', notes: 'Bulky items, pallet storage.',
  },
  {
    id: '3', name: 'Bright Moments', legalEntity: 'Carlos Campos LLC',
    contactName: 'Carlos Campos', contactEmail: 'carlos@brightmoments.co', contactPhone: '+1 305 555 0110',
    contact2Name: '', contact2Email: '', contact2Phone: '',
    warehouse: 'Dallas', subWarehouse: 'Dallas-B', agentEmail: '', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'Parcel', initialInventoryQty: '300',
    estimatedDeliveryDate: '2026-08-01', notes: 'Candles + home goods.',
  },
  {
    id: '4', name: 'One Sheep', legalEntity: '',
    contactName: 'Dana Wu', contactEmail: 'dana@onesheep.com', contactPhone: '',
    contact2Name: '', contact2Email: '', contact2Phone: '',
    warehouse: 'Gardena', subWarehouse: '', agentEmail: 'charmy@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'No', initialInventoryMethod: '', initialInventoryQty: '',
    estimatedDeliveryDate: '2026-09-02', notes: 'Awaiting inventory. Apparel, DTC.',
  },
  {
    id: '5', name: 'Stevia Select', legalEntity: 'Sweet Leaf Foods Inc',
    contactName: 'Priya Nair', contactEmail: 'priya@steviaselect.com', contactPhone: '+1 512 555 0173',
    contact2Name: 'Warehouse', contact2Email: 'wh@steviaselect.com', contact2Phone: '',
    warehouse: 'Dallas', subWarehouse: 'Dallas-A', agentEmail: 'andres@shipbots.com', portal: 'ShipHero Portal',
    paymentOnFile: 'Yes', initialInventoryMethod: 'FTL', initialInventoryQty: '5,000',
    estimatedDeliveryDate: '2026-08-14', notes: 'Food-grade, lot codes required.',
  },
];

export const MOCK_INDEX: ClientIndexEntry[] = MOCK_CLIENTS.map(c => ({
  id: c.id, name: c.name, legalEntity: c.legalEntity,
  contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone,
  warehouse: c.warehouse, subWarehouse: c.subWarehouse, agentEmail: c.agentEmail, portal: c.portal,
}));

export const MOCK_TASKS: Task[] = [
  { id: 't1', name: 'Retrieve payment info', status: 'Working on it', dueDate: '2026-08-18', clientName: 'Aeroo Drones', notes: 'Chase ACH form.' },
  { id: 't2', name: 'Send onboarding summary', status: 'Not Started', dueDate: '2026-08-19', clientName: 'Stevia Select', notes: '' },
  { id: 't3', name: 'Confirm sub-warehouse', status: 'Not Started', dueDate: '2026-08-17', clientName: 'One Sheep', notes: 'Gardena — suggest A or C.' },
  { id: 't4', name: 'Book onboarding call', status: 'Done', dueDate: '2026-08-10', clientName: 'Bebonia', notes: '' },
];
