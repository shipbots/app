/**
 * Client documents — shared storage on the Clients board.
 *
 * v1 wrote the docs array as JSON to `data/documents/<clientId>.json` on
 * the local filesystem, which works in dev but fails on Vercel (the
 * runtime filesystem is read-only outside /tmp). v2 mirrors the
 * sticky-notes pattern: the array lives as JSON in a Monday `long_text`
 * column on the Clients board.
 *
 * Column id comes from MONDAY_DOCUMENTS_COL_ID. Run
 * POST /api/admin/setup-documents once to create the column and copy the
 * returned id into Vercel env vars, then redeploy.
 *
 * Race model: last-write-wins. Team is small and the docs list is short
 * so this is acceptable for v1; a merge-on-write upgrade is possible if
 * conflicts start showing up.
 *
 * File uploads: NOT supported in this version — the file bytes still need
 * blob storage. The POST handler returns 501 for multipart bodies with a
 * clear message so the UI can point users at the link flow (which works)
 * and know that files will land in a follow-up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readAll, writeLinks } from '@/lib/docs-storage';

export interface ClientDocument {
  id: string;
  type: 'link' | 'file';
  name: string;
  url: string;
  fileType?: string;
  fileName?: string;
  docIcon: 'gdoc' | 'gsheet' | 'gslides' | 'gdrive' | 'pdf' | 'generic';
  createdAt: string;
  /**
   * Section a link belongs to. Absent / 'documents' → general Docs
   * tab only. Links added from a Client Info section drop-zone carry
   * that section's category and render in BOTH the section and the
   * Docs tab (tagged with a chip).
   */
  category?: 'documents' | 'receiving' | 'packing' | 'returns';
}

const LINK_CATEGORIES = new Set(['documents', 'receiving', 'packing', 'returns']);

const DOCS_COL_ENV = 'MONDAY_DOCUMENTS_COL_ID';

function getDocsColumnId(): string | null {
  const id = process.env[DOCS_COL_ENV];
  if (!id || typeof id !== 'string') return null;
  return id.trim() || null;
}

function notConfiguredResponse() {
  return NextResponse.json(
    {
      error: `${DOCS_COL_ENV} env var is not set`,
      hint: 'POST /api/admin/setup-documents once to create the column on the Clients board, then paste the returned id into Vercel env vars and redeploy.',
    },
    { status: 503 },
  );
}

function detectDocIcon(url: string, mimeType?: string): ClientDocument['docIcon'] {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType?.startsWith('application/')) return 'generic';
  const u = url.toLowerCase();
  if (u.includes('docs.google.com/document')) return 'gdoc';
  if (u.includes('docs.google.com/spreadsheets')) return 'gsheet';
  if (u.includes('docs.google.com/presentation')) return 'gslides';
  if (u.includes('drive.google.com')) return 'gdrive';
  if (u.endsWith('.pdf')) return 'pdf';
  return 'generic';
}

// Local shims over the shared docs-storage helpers so the rest of
// this file keeps its old signatures. All persistence logic lives
// in lib/docs-storage.ts and is shared with the /aliases route.
async function readDocs(clientId: string, colId: string): Promise<ClientDocument[]> {
  return (await readAll(clientId, colId)).links;
}
async function writeDocs(clientId: string, colId: string, docs: ClientDocument[]): Promise<void> {
  await writeLinks(clientId, colId, docs);
}

// ── GET ───────────────────────────────────────────────────────────────────────
// No query param → every link (Docs tab). `?category=receiving` →
// only links tagged with that section, powering the per-section lists.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();

  const { clientId } = await params;
  const categoryFilter = new URL(req.url).searchParams.get('category');
  try {
    let docs = await readDocs(clientId, colId);
    if (categoryFilter && LINK_CATEGORIES.has(categoryFilter)) {
      docs = docs.filter(d => (d.category ?? 'documents') === categoryFilter);
    }
    return NextResponse.json(docs);
  } catch (err) {
    console.error('[documents GET] failed:', err);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 502 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();

  const { clientId } = await params;
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    // File uploads need blob storage; the Monday long_text column only
    // holds JSON. Return 501 with a clear message so the UI can point
    // users at the link flow (which works) until we add Vercel Blob.
    return NextResponse.json(
      {
        error: 'File uploads are temporarily unavailable',
        hint: 'Please paste the document URL in the "Add link" form instead — link saves work.',
      },
      { status: 501 },
    );
  }

  let body: { url?: unknown; name?: unknown; category?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }
  // Unknown / absent categories collapse to undefined so old callers
  // (Docs-tab AddLinkForm) keep producing general links.
  const category = typeof body.category === 'string' && LINK_CATEGORIES.has(body.category) && body.category !== 'documents'
    ? (body.category as ClientDocument['category'])
    : undefined;

  const newDoc: ClientDocument = {
    id: randomUUID(),
    type: 'link',
    name: name || url,
    url,
    docIcon: detectDocIcon(url),
    createdAt: new Date().toISOString(),
    ...(category ? { category } : {}),
  };

  try {
    const docs = await readDocs(clientId, colId);
    docs.unshift(newDoc);
    await writeDocs(clientId, colId, docs);
    return NextResponse.json(newDoc, { status: 201 });
  } catch (err) {
    console.error('[documents POST] failed:', err);
    return NextResponse.json({ error: 'Failed to save link' }, { status: 502 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();

  const { clientId } = await params;
  let body: { docId?: unknown; name?: unknown; url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const docId = typeof body.docId === 'string' ? body.docId : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!docId || (!name && !url)) {
    return NextResponse.json({ error: 'docId and a name or url required' }, { status: 400 });
  }

  try {
    const docs = await readDocs(clientId, colId);
    const idx = docs.findIndex(d => d.id === docId);
    if (idx === -1) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const updated = { ...docs[idx] };
    if (name) updated.name = name;
    // Changing the URL re-derives the doc icon so the row's glyph stays right.
    if (url) { updated.url = url; updated.docIcon = detectDocIcon(url); }
    docs[idx] = updated;
    await writeDocs(clientId, colId, docs);
    return NextResponse.json(docs[idx]);
  } catch (err) {
    console.error('[documents PATCH] failed:', err);
    return NextResponse.json({ error: 'Failed to update link' }, { status: 502 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();

  const { clientId } = await params;
  const docId = new URL(req.url).searchParams.get('docId');
  if (!docId) {
    return NextResponse.json({ error: 'docId required' }, { status: 400 });
  }

  try {
    const docs = await readDocs(clientId, colId);
    const remaining = docs.filter(d => d.id !== docId);
    if (remaining.length === docs.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await writeDocs(clientId, colId, remaining);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[documents DELETE] failed:', err);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 502 });
  }
}
