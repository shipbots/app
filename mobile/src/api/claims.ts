/**
 * Claims — the Monday "✳️ Claims" board, through the dashboard's /api/claims
 * routes (same backend the Chrome extension's Claims panel uses).
 *
 *   GET   /api/claims?clientId=…          → { claims, options }
 *   POST  /api/claims                     → { claim }  (create)
 *   PATCH /api/claims/[id]                → { claim }  (edit fields / stage)
 *   POST  /api/claims/[id]/files          → { file }   (attach one photo/file)
 */

import { API_BASE_URL, FORCE_MOCK } from '@/config';
import { AuthError, getAuthToken } from './client';
import type { Claim, ClaimFields, ClaimFile, ClaimsPayload } from './types';

/** Claim fields in display / form order. `opt` names the option list a picker
 *  draws from; `long` fields are multi-line. */
export type ClaimFieldKey = keyof ClaimFields | 'groupId';
export interface ClaimFieldDef {
  key: ClaimFieldKey;
  label: string;
  kind: 'text' | 'long' | 'date' | 'pick' | 'number';
  opt?: 'statuses' | 'reasons' | 'groups';
  placeholder?: string;
}
export const CLAIM_FIELDS: ClaimFieldDef[] = [
  { key: 'orderNumber',    label: 'Order number',           kind: 'text', placeholder: 'e.g. 160269' },
  { key: 'trackingNumber', label: 'Tracking number',        kind: 'text', placeholder: 'Carrier tracking #' },
  { key: 'reason',         label: 'Reason for claim',       kind: 'pick', opt: 'reasons' },
  { key: 'value',          label: 'Value of the package',   kind: 'number', placeholder: 'e.g. 44.99' },
  { key: 'status',         label: 'Claim status',           kind: 'pick', opt: 'statuses' },
  { key: 'groupId',        label: 'Stage',                  kind: 'pick', opt: 'groups' },
  { key: 'whoRequested',   label: 'Who requested',          kind: 'text', placeholder: 'Name (and who at the client asked)' },
  { key: 'dateSubmitted',  label: 'Date submitted',         kind: 'date' },
  { key: 'claimNumber',    label: 'Claim number',           kind: 'text', placeholder: 'Carrier claim #' },
  { key: 'dateResolved',   label: 'Date resolved',          kind: 'date' },
  { key: 'resultNotes',    label: 'Result notes',           kind: 'text' },
  { key: 'additionalInfo', label: 'Additional information', kind: 'long', placeholder: 'Carrier, what happened, what the client reported…' },
];

const STATUS_COLORS: Record<string, string> = {
  'new': '#579bfc',
  'filed with carrier': '#fdab3d',
  'approved': '#00c875',
  'denied': '#e2445c',
  'canceled': '#9ca3af',
  'not stated': '#c4c4c4',
};
export function claimStatusColor(status: string) {
  return STATUS_COLORS[(status || '').toLowerCase()] ?? '#c4c4c4';
}

/** Claims still being worked (anything not in the "Closed" group). */
export function isActiveClaim(c: Claim) {
  return !/closed/i.test(c.groupTitle);
}

export function formatClaimDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatClaimValue(v: string) {
  const s = (v || '').trim();
  if (!s) return '';
  const n = Number(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? n.toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : s;
}

/** Today as YYYY-MM-DD in local time. */
export function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** URL for a claim attachment (served by the dashboard, needs the Bearer token). */
export function claimAssetUrl(assetId: string) {
  return `${API_BASE_URL}/api/assets/${encodeURIComponent(assetId)}`;
}
export function authHeaders(): Record<string, string> {
  const t = getAuthToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (res.status === 401 || res.status === 403) throw new AuthError();
  const data = await res.json().catch(() => ({}));
  // Surface the server's message ("Add an order number…") instead of a bare status.
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export async function fetchClaims(clientId: string): Promise<ClaimsPayload> {
  if (FORCE_MOCK) return mockPayload();
  return request<ClaimsPayload>(`/api/claims?clientId=${encodeURIComponent(clientId)}`);
}

export async function createClaim(input: {
  clientId: string;
  clientName: string;
  fields: ClaimFields;
  groupId?: string;
}): Promise<Claim> {
  if (FORCE_MOCK) return mockCreate(input);
  const { claim } = await request<{ claim: Claim }>('/api/claims', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return claim;
}

export async function updateClaim(id: string, changes: { fields?: ClaimFields; groupId?: string }): Promise<Claim> {
  if (FORCE_MOCK) return mockUpdate(id, changes);
  const { claim } = await request<{ claim: Claim }>(`/api/claims/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return claim;
}

/** A local photo/file picked on the device, ready to upload. */
export interface LocalFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
  /** Web only: the browser File object (FormData needs it there). */
  file?: Blob;
}

export const MAX_UPLOAD_BYTES = 4.4 * 1024 * 1024; // Vercel's request-body cap

export async function uploadClaimFile(claimId: string, f: LocalFile): Promise<ClaimFile> {
  if (f.size && f.size > MAX_UPLOAD_BYTES) throw new Error(`${f.name} is too large (max 4.4 MB)`);
  if (FORCE_MOCK) return mockUpload(claimId, f);
  const form = new FormData();
  if (f.file) form.append('file', f.file, f.name);
  // React Native's FormData takes { uri, name, type } for a file on disk.
  else form.append('file', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
  const { file } = await request<{ file: ClaimFile }>(`/api/claims/${encodeURIComponent(claimId)}/files`, {
    method: 'POST',
    body: form,
  });
  return file;
}

/** Upload several files one by one; returns the names that failed. */
export async function uploadClaimFiles(
  claimId: string,
  files: LocalFile[],
  onProgress?: (done: number, total: number) => void,
): Promise<string[]> {
  const failed: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    try { await uploadClaimFile(claimId, files[i]); }
    catch { failed.push(files[i].name); }
  }
  onProgress?.(files.length, files.length);
  return failed;
}

// ── Mock data (FORCE_MOCK dev/demo mode only) ─────────────────────────────────
const MOCK_OPTIONS: ClaimsPayload['options'] = {
  statuses: ['New', 'Canceled', 'Denied', 'Approved', 'Filed with carrier'],
  reasons: [
    'Package lost in transit - Never received', 'Package Sent to Wrong Address', 'Received Damaged Package',
    'Package market as delivered but was not received', 'Content is missing', 'Theft is suspected',
  ],
  groups: [{ id: 'topics', title: 'Open' }, { id: 'group_mm97w0t3', title: 'Filed with Carrier' }, { id: 'group_title', title: 'Closed' }],
};
let mockClaims: Claim[] = [
  {
    id: '9000001', name: 'Demo - #160269', groupId: 'topics', groupTitle: 'Open', createdAt: '2026-11-19T10:00:00Z',
    status: 'New', claimNumber: '', resultNotes: '', dateSubmitted: '2026-11-19', orderNumber: '160269',
    trackingNumber: '879811601052', reason: 'Package market as delivered but was not received',
    additionalInfo: 'Carrier: FedEx. Client reports package marked delivered but not received.', dateResolved: '',
    whoRequested: 'Lydia', value: '1242.00', files: [],
  },
  {
    id: '9000002', name: 'Demo - #160699', groupId: 'group_mm97w0t3', groupTitle: 'Filed with Carrier', createdAt: '2026-11-16T10:00:00Z',
    status: 'Filed with carrier', claimNumber: 'C-266844737', resultNotes: '', dateSubmitted: '2026-11-20', orderNumber: '160699',
    trackingNumber: '384592958392', reason: 'Received Damaged Package', additionalInfo: 'Box crushed on arrival.',
    dateResolved: '', whoRequested: 'Lydia', value: '254.00', files: [{ assetId: '1', name: 'image.png', isImage: true }],
  },
];
let mockNext = 9000100;
function mockPayload(): ClaimsPayload {
  return { claims: mockClaims.map(c => ({ ...c, files: [...c.files] })), options: MOCK_OPTIONS };
}
function groupTitle(id?: string) {
  return MOCK_OPTIONS.groups.find(g => g.id === id) ?? MOCK_OPTIONS.groups[0];
}
function mockCreate(input: { clientName: string; fields: ClaimFields; groupId?: string }): Claim {
  const g = groupTitle(input.groupId);
  const c: Claim = {
    id: String(mockNext++), name: `${input.clientName} - #${input.fields.orderNumber ?? ''}`, groupId: g.id, groupTitle: g.title,
    createdAt: new Date().toISOString(), status: 'New', claimNumber: '', resultNotes: '', dateSubmitted: todayIso(), orderNumber: '',
    trackingNumber: '', reason: '', additionalInfo: '', dateResolved: '', whoRequested: '', value: '', files: [],
    ...input.fields,
  };
  mockClaims = [c, ...mockClaims];
  return c;
}
function mockUpdate(id: string, changes: { fields?: ClaimFields; groupId?: string }): Claim {
  mockClaims = mockClaims.map(c => {
    if (c.id !== id) return c;
    const g = changes.groupId ? groupTitle(changes.groupId) : { id: c.groupId, title: c.groupTitle };
    return { ...c, ...changes.fields, groupId: g.id, groupTitle: g.title };
  });
  const c = mockClaims.find(x => x.id === id);
  if (!c) throw new Error('Claim not found');
  return c;
}
function mockUpload(claimId: string, f: LocalFile): ClaimFile {
  const file = { assetId: String(mockNext++), name: f.name, isImage: /^image\//.test(f.type) };
  mockClaims = mockClaims.map(c => (c.id === claimId ? { ...c, files: [...c.files, file] } : c));
  return file;
}
