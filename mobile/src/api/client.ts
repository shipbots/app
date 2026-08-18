/**
 * API client for the ShipBots dashboard backend.
 *
 * Right now USE_MOCK_DATA (config.ts) is true, so every call resolves against
 * in-memory fixtures. Each function is written so that flipping the flag (once
 * mobile auth exists) swaps in a real `fetch` against API_BASE_URL with a
 * Bearer token — the screens don't change.
 */

import { API_BASE_URL, USE_MOCK_DATA } from '@/config';
import { MOCK_CLIENTS, MOCK_INDEX, MOCK_TASKS } from './mock';
import type { ClientDetail, ClientIndexEntry, Task } from './types';

let authToken: string | null = null;
/** Set after sign-in (Phase 2). Sent as `Authorization: Bearer <token>`. */
export function setAuthToken(token: string | null) {
  authToken = token;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Fields we search over, and how much a match is worth.
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

/** Search the Clients index; empty query returns all, name-sorted. */
export async function searchClients(query: string): Promise<ClientIndexEntry[]> {
  const index = USE_MOCK_DATA ? MOCK_INDEX : await apiGet<ClientIndexEntry[]>('/api/clients/search-index');
  if (!query.trim()) return [...index].sort((a, b) => a.name.localeCompare(b.name));
  return index
    .map(e => ({ e, s: matchScore(e, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .map(x => x.e);
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  if (USE_MOCK_DATA) return MOCK_CLIENTS.find(c => c.id === id) ?? null;
  return apiGet<ClientDetail>(`/api/client/${id}`);
}

export async function getTasks(): Promise<Task[]> {
  if (USE_MOCK_DATA) return MOCK_TASKS;
  return apiGet<Task[]>('/api/subitems');
}
