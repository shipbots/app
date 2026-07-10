/**
 * PUT    /api/projects/[id]  → full update (document-save)
 * DELETE /api/projects/[id]  → delete the project (+ cascade children)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Project } from '@/lib/projects';
import { isDbConfigured, upsertProject, deleteProject } from '@/lib/projects-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Projects database not configured' }, { status: 503 });
  }

  try {
    const { id } = await params;
    const body = (await request.json()) as Project;
    if (body.id !== id) {
      return NextResponse.json({ error: 'id mismatch' }, { status: 400 });
    }
    const saved = await upsertProject(body, email, 'update');
    return NextResponse.json(saved);
  } catch (err) {
    console.error('[api/projects/[id]] PUT failed:', err);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Projects database not configured' }, { status: 503 });
  }

  try {
    const { id } = await params;
    await deleteProject(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/projects/[id]] DELETE failed:', err);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
