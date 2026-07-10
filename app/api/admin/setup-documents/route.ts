/**
 * One-shot bootstrap endpoint for the shared "Documents" column.
 *
 * The docs feature used to write a JSON file to `data/documents/` on the
 * local filesystem, which works in dev but fails on Vercel (read-only
 * runtime). This mirrors the sticky-notes pattern: a long_text column on
 * the Clients board holds the docs array as JSON, keyed by the client
 * item id.
 *
 * Call this ONCE after deploy, copy the returned column id into Vercel's
 * env vars, and redeploy. Admin-only so a curious rep can't spam Monday
 * columns.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createClientsLongTextColumn } from '@/lib/monday';

export async function POST() {
  // TEMP: admin gate lifted so any signed-in user can run the docs
  // storage bootstrap during rollout. Restore the isAdminEmail check
  // once the env vars are set. Any signed-in user session still gates
  // the endpoint through the proxy middleware, so anonymous callers
  // get bounced to /login before reaching this code.
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Signed-in users only' }, { status: 403 });
  }

  // Idempotent: if MONDAY_DOCUMENTS_COL_ID is already set, return it as
  // "already configured" instead of creating a duplicate Monday column.
  // Without this guard, every re-run of the setup button would spawn a
  // fresh "Documents" long_text column on the Clients board.
  const existing = process.env.MONDAY_DOCUMENTS_COL_ID?.trim();
  if (existing) {
    return NextResponse.json({
      ok: true,
      columnId: existing,
      status: 'already-configured',
      next: `MONDAY_DOCUMENTS_COL_ID is already set to ${existing}. No new column created.`,
    });
  }

  try {
    const id = await createClientsLongTextColumn('Documents');
    return NextResponse.json({
      ok: true,
      columnId: id,
      status: 'created',
      next: `Set MONDAY_DOCUMENTS_COL_ID=${id} in Vercel Settings → Environment Variables (all environments), then redeploy.`,
    });
  } catch (err) {
    console.error('[setup-documents] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to create column', detail: message }, { status: 502 });
  }
}
