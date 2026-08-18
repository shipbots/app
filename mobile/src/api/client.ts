/**
 * API client for the ShipBots dashboard backend. When signed in (a Bearer token
 * is set) it calls the real API; otherwise it falls back to in-memory fixtures.
 */

import { API_BASE_URL, FORCE_MOCK } from '@/config';
import { MOCK_CLIENTS, MOCK_INDEX, MOCK_TASKS } from './mock';
import type { ClientDetail, ClientDoc, ClientIndexEntry, DeliveryEvent, StickyNote, Task } from './types';
/* eslint-disable @typescript-eslint/no-explicit-any */

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

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPut(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
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

/** The full client index (cached on-device by the Clients screen). */
export async function fetchClientIndex(): Promise<ClientIndexEntry[]> {
  return useMock() ? MOCK_INDEX : apiGet<ClientIndexEntry[]>('/api/clients/search-index');
}

/** Rank + filter an already-loaded index by a query (runs locally = instant). */
export function filterClients(index: ClientIndexEntry[], query: string): ClientIndexEntry[] {
  if (!query.trim()) return [...index].sort((a, b) => a.name.localeCompare(b.name));
  return index
    .map(e => ({ e, s: matchScore(e, query) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .map(x => x.e);
}

function normalizeClient(c: Record<string, any>): ClientDetail {
  // Keep every string field (keys match the web ClientInfo names, which the
  // field registry reads directly). Non-strings (flags, nested objects) skipped.
  const out: ClientDetail = { id: String(c.id ?? ''), name: String(c.name ?? '') };
  for (const [k, v] of Object.entries(c)) if (typeof v === 'string') out[k] = v;
  return out;
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  if (useMock()) return MOCK_CLIENTS.find(c => c.id === id) ?? null;
  const raw = await apiGet<Record<string, any>>(`/api/client/${id}?surface=customer-service`);
  return normalizeClient(raw);
}

// ─── Sticky notes ────────────────────────────────────────────────────────────
export async function getStickyNotes(id: string): Promise<StickyNote[]> {
  if (useMock()) return [];
  const data = await apiGet<{ notes: StickyNote[] }>(`/api/client/${id}/sticky-notes`);
  return data.notes ?? [];
}
export async function addStickyNote(id: string, text: string, color: string): Promise<StickyNote> {
  if (useMock()) return { id: Math.random().toString(36).slice(2, 10), text, color, createdAt: new Date().toISOString() };
  const data = await apiPost<{ note: StickyNote }>(`/api/client/${id}/sticky-notes`, { text, color });
  return data.note;
}
export async function saveStickyNotes(id: string, notes: StickyNote[]): Promise<void> {
  if (useMock()) return;
  await apiPut(`/api/client/${id}/sticky-notes`, { notes });
}

// ─── Dropdown / status options + agents (cached for the session) ─────────────
let optionsCache: Record<string, string[]> | null = null;
export async function fetchColumnOptions(): Promise<Record<string, string[]>> {
  if (useMock()) return {};
  if (!optionsCache) optionsCache = await apiGet<Record<string, string[]>>('/api/client/column-options');
  return optionsCache;
}
let agentsCache: string[] | null = null;
export async function fetchAgents(): Promise<string[]> {
  if (useMock()) return [];
  if (!agentsCache) {
    const raw = await apiGet<any[]>('/api/client/agents');
    agentsCache = (raw ?? [])
      .map(a => (typeof a === 'string' ? a : a?.email ?? a?.value ?? a?.label ?? ''))
      .filter(Boolean);
  }
  return agentsCache;
}

// ─── Documents ───────────────────────────────────────────────────────────────
export async function fetchClientDocs(id: string): Promise<ClientDoc[]> {
  if (useMock()) return [];
  const [files, links] = await Promise.all([
    apiGet<any[]>(`/api/client/${id}/section-files/all`).catch(() => []),
    apiGet<any[]>(`/api/documents/${id}`).catch(() => []),
  ]);
  const f: ClientDoc[] = (files ?? []).map(x => ({
    name: x.name, url: x.url, category: x.category || 'documents',
    assetId: x.assetId != null ? String(x.assetId) : undefined, kind: 'file',
  }));
  const l: ClientDoc[] = (links ?? []).map(x => ({ name: x.name, url: x.url, category: x.category || 'documents', kind: 'link' }));
  return [...f, ...l].filter(d => d.name && d.url);
}

// ─── Deliveries (Calendar) ───────────────────────────────────────────────────
export async function fetchDeliveries(): Promise<DeliveryEvent[]> {
  if (useMock()) return [];
  const items = await apiGet<any[]>('/api/onboarding-items');
  return (items ?? [])
    .map(i => ({
      id: String(i.id),
      clientId: i.clientBoardItemId ? String(i.clientBoardItemId) : undefined,
      name: i.name ?? i.clientBoardItemName ?? '',
      date: String(i.estimatedDeliveryDate || i.deliveredDate || '').slice(0, 10),
      delivered: !!i.deliveredDate,
    }))
    .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date));
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
