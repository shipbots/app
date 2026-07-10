/**
 * POST /api/projects/[id]/documents
 *
 * Two content types:
 *   - multipart/form-data with a `file` field → uploaded to Vercel Blob, then
 *     recorded as a document row.
 *   - application/json { name, url } → recorded as a link.
 *
 * Returns the created document. Requires the project to already exist (files
 * attach to a persisted project); the UI only enables uploads for saved
 * projects when the DB is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { auth } from '@/auth';
import { isDbConfigured, addDocument, projectExists } from '@/lib/projects-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Projects database not configured' }, { status: 503 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Links still work without Blob; files need the store.
  }

  try {
    const { id } = await params;
    if (!(await projectExists(id))) {
      return NextResponse.json({ error: 'Save the project before attaching files' }, { status: 409 });
    }

    const contentType = request.headers.get('content-type') || '';

    // ── Link ──
    if (contentType.includes('application/json')) {
      const { name, url } = (await request.json()) as { name?: string; url?: string };
      if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 });
      const doc = await addDocument(id, {
        name: name?.trim() || url,
        kind: 'link',
        url,
        addedByEmail: email,
      });
      return NextResponse.json(doc, { status: 201 });
    }

    // ── File → Blob ──
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ error: 'Vercel Blob not configured' }, { status: 503 });
    }
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file field required' }, { status: 400 });
    }
    const safeName = (file.name || 'document').replace(/[^\w.\- ()]/g, '_');
    const pathname = `projects/${id}/${Date.now()}-${safeName}`;
    const blob = await put(pathname, file, { access: 'public' });
    const doc = await addDocument(id, {
      name: file.name || safeName,
      kind: 'file',
      url: blob.url,
      blobPath: blob.pathname,
      addedByEmail: email,
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error('[api/projects/[id]/documents] POST failed:', err);
    return NextResponse.json({ error: 'Failed to add document' }, { status: 500 });
  }
}
