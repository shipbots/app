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
import { isAdminEmail } from '@/lib/admins';
import { createClientsLongTextColumn } from '@/lib/monday';

export async function POST() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }

  try {
    const id = await createClientsLongTextColumn('Documents');
    return NextResponse.json({
      ok: true,
      columnId: id,
      next: `Set MONDAY_DOCUMENTS_COL_ID=${id} in Vercel Settings → Environment Variables (all environments), then redeploy.`,
    });
  } catch (err) {
    console.error('[setup-documents] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to create column', detail: message }, { status: 502 });
  }
}
