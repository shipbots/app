/**
 * GET  /api/documents/[clientId]  — list documents for a client
 * POST /api/documents/[clientId]  — add a link (JSON) or upload a file (FormData)
 * DELETE /api/documents/[clientId]?docId=xxx  — delete a document (and file if applicable)
 */
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export interface ClientDocument {
  id: string;
  type: 'link' | 'file';
  name: string;
  url: string;          // For link: the URL. For file: /client-docs/{clientId}/{filename}
  fileType?: string;    // original MIME type for uploaded files
  fileName?: string;    // original filename for uploaded files
  docIcon: 'gdoc' | 'gsheet' | 'gslides' | 'gdrive' | 'pdf' | 'generic';
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data', 'documents');
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'client-docs');

async function readDocs(clientId: string): Promise<ClientDocument[]> {
  const file = path.join(DATA_DIR, `${clientId}.json`);
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeDocs(clientId: string, docs: ClientDocument[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    path.join(DATA_DIR, `${clientId}.json`),
    JSON.stringify(docs, null, 2),
    'utf-8'
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

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const docs = await readDocs(clientId);
  return Response.json(docs);
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const contentType = req.headers.get('content-type') ?? '';

  let newDoc: ClientDocument;

  if (contentType.includes('multipart/form-data')) {
    // File upload
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const customName = (formData.get('name') as string | null)?.trim();

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = file.name.split('.').pop() ?? '';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${randomUUID()}_${safeName}`;
    const clientUploadDir = path.join(UPLOAD_DIR, clientId);
    await fs.mkdir(clientUploadDir, { recursive: true });
    const filePath = path.join(clientUploadDir, uniqueName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    newDoc = {
      id: randomUUID(),
      type: 'file',
      name: customName || file.name,
      url: `/client-docs/${clientId}/${uniqueName}`,
      fileType: file.type,
      fileName: file.name,
      docIcon: detectDocIcon(file.name, file.type),
      createdAt: new Date().toISOString(),
    };

    // Suppress unused variable warning
    void ext;
  } else {
    // Link
    const body = await req.json();
    const url: string = (body.url ?? '').trim();
    const name: string = (body.name ?? '').trim();

    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    newDoc = {
      id: randomUUID(),
      type: 'link',
      name: name || url,
      url,
      docIcon: detectDocIcon(url),
      createdAt: new Date().toISOString(),
    };
  }

  const docs = await readDocs(clientId);
  docs.unshift(newDoc);
  await writeDocs(clientId, docs);

  return Response.json(newDoc, { status: 201 });
}

// ── PATCH ─────────────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { docId, name } = await req.json();

  if (!docId || !name?.trim()) {
    return Response.json({ error: 'docId and name required' }, { status: 400 });
  }

  const docs = await readDocs(clientId);
  const idx = docs.findIndex(d => d.id === docId);
  if (idx === -1) return Response.json({ error: 'Not found' }, { status: 404 });

  docs[idx] = { ...docs[idx], name: name.trim() };
  await writeDocs(clientId, docs);
  return Response.json(docs[idx]);
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('docId');

  if (!docId) {
    return Response.json({ error: 'docId required' }, { status: 400 });
  }

  const docs = await readDocs(clientId);
  const target = docs.find(d => d.id === docId);

  if (!target) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  // Delete physical file if it was uploaded
  if (target.type === 'file' && target.url.startsWith('/client-docs/')) {
    const filePath = path.join(process.cwd(), 'public', target.url);
    await fs.unlink(filePath).catch(() => { /* already gone */ });
  }

  const updated = docs.filter(d => d.id !== docId);
  await writeDocs(clientId, updated);

  return Response.json({ ok: true });
}
