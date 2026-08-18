/**
 * API client for the ShipBots dashboard backend. When signed in (a Bearer token
 * is set) it calls the real API; otherwise it falls back to in-memory fixtures.
 */

import { API_BASE_URL, FORCE_MOCK } from '@/config';
import { MOCK_CLIENTS, MOCK_INDEX, MOCK_TASKS } from './mock';
import type { ClientDetail, ClientIndexEntry, Task } from './types';

export class AuthError extends Error {
  constructor() {
    super('unauthorized');
    this.name = 'AuthError';
  }
}

let authToken: string | null = null;
export function setAuthToken(token: string | null) {
  authToken = token;
}
function useMock() {
  return FORCE_MOCK || !authToken;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPatch(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}`);
}

const SEARCH_FIELDS: (keyof ClientIndexEntry)[] = [
  'name', 'legalEntity', 'contactName', 'contactEmail', 'contactPhone', 'warehouse',
];
function matchScore(entry: ClientIndexEntry, q: string): number {
  const query = q.trim().toLowerCase();
  if (!query) return 1;
  let best = 0;
  for (const field of SEARCH_FIELDS) {
    const v = String(entry[field] ?? '').toLowerCase();
    if (!v) continue;
    if (v === query) best = Math.max(best, 100);
    else if (v.startsWith(query)) best = Math.max(best, 70);
    else if (v.includes(query)) best = Math.max(best, 40);
  }
  return best;
}

export async function searchClients(query: string): Promise<ClientIndexEntry[]> {
  const index = useMock() ? MOCK_INDEX : await apiGet<ClientIndexEntry[]>('/api/clients/search-index');
  if (!query.trim()) return [...index].sort((a, b) => a.name.localeCompare(b.name));
  return index
    .map(e => ({ e, s: matchScore(e, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .map(x => x.e);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeClient(c: Record<string, any>): ClientDetail {
  return {
    id: String(c.id ?? ''),
    name: c.name ?? '',
    legalEntity: c.legalEntity, clientStatus: c.clientStatus, quickbooksName: c.quickbooksName,
    shipHeroName: c.shipHeroName, umbrellaCompany: c.umbrellaCompany, businessHQ: c.businessHQ,
    productCategory: c.productCategory, productDescription: c.productDescription,
    contactName: c.contactName, contactEmail: c.contactEmail, contactPhone: c.contactPhone,
    contactLocation: c.contactLocation,
    contact2Name: c.contact2Name, contact2Email: c.contact2Email, contact2Phone: c.contact2Phone,
    contact3Name: c.contact3Name, contact3Email: c.contact3Email, contact3Phone: c.contact3Phone,
    warehouse: c.warehouseLocation, subWarehouse: c.subWarehouse,
    currentFulfillmentMethod: c.currentFulfillmentMethod, ecommercePlatforms: c.ecommercePlatforms,
    skuCount: c.skuCount, packaging: c.packaging, kitsOrBundles: c.kitsOrBundles,
    internationalFulfillment: c.internationalFulfillment, amazonFBA: c.amazonFBA, shippingMethod: c.shippingMethod,
    initialInventoryDate: c.initialInventoryDate, initialInventoryMethod: c.initialInventoryMethod,
    initialInventoryQty: c.initialInventoryQty, itemsBarcoded: c.itemsBarcoded,
    initialInventoryStoringNeeds: c.initialInventoryStoringNeeds, notesForReceiving: c.notesForReceiving,
    notesOnInitialInventory: c.notesOnInitialInventory,
    paymentOnFile: c.paymentOnFile, invoicingEmail: c.invoicingEmail, additionalNotes: c.additionalNotes,
  };
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  if (useMock()) return MOCK_CLIENTS.find(c => c.id === id) ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = await apiGet<Record<string, any>>(`/api/client/${id}?surface=customer-service`);
  return normalizeClient(raw);
}

/** Save one client field to Monday (columnId comes from EDITABLE_FIELDS). */
export async function updateClientField(id: string, columnId: string, value: string, valueType = 'text'): Promise<void> {
  if (useMock()) return; // no-op in mock mode
  await apiPatch(`/api/client/${id}`, { columnId, value, valueType });
}

export async function getTasks(): Promise<Task[]> {
  // Real "My Tasks" wiring (email-filtered subitems) is a later iteration.
  return MOCK_TASKS;
}
