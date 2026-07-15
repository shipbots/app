/**
 * GET  /api/projects  → { configured, projects, statuses }
 * POST /api/projects  → create a project (full Project body)
 *
 * When the database isn't provisioned yet, GET returns `configured: false`
 * with empty data + the default statuses, and the UI falls back to its mock
 * preview. Provision Postgres (see prisma/schema.prisma) and it lights up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { Project } from '@/lib/projects';
import { DEFAULT_PROJECT_STATUSES, MOCK_PROJECTS } from '@/lib/projects';
import {
  isDbConfigured,
  ensureDefaultStatuses,
  listProjects,
  listStatuses,
  upsertProject,
} from '@/lib/projects-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isDbConfigured()) {
    // Not provisioned yet — serve the mock preview so every surface shows the
    // same demo projects. The dashboard ignores these rows while
    // `configured:false` (it keeps its own identical MOCK_PROJECTS and treats
    // edits as session-only), but the Chrome extension has no local mock, so it
    // relies on this payload to populate its per-client projects list.
    return NextResponse.json({ configured: false, projects: MOCK_PROJECTS, statuses: DEFAULT_PROJECT_STATUSES });
  }

  try {
    await ensureDefaultStatuses();
    const [projects, statuses] = await Promise.all([listProjects(), listStatuses()]);
    return NextResponse.json({ configured: true, projects, statuses });
  } catch (err) {
    console.error('[api/projects] GET failed:', err);
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Projects database not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as Project;
    if (!body?.id || !body?.name) {
      return NextResponse.json({ error: 'id and name are required' }, { status: 400 });
    }
    const saved = await upsertProject(body, email, 'create');
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error('[api/projects] POST failed:', err);
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
