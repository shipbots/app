/**
 * One-shot bootstrap endpoint for the shared sticky-notes column.
 *
 * Creates a "Sticky Notes" long_text column on the Clients board, prints
 * its id, and tells the admin what to paste into Vercel env vars. Safe to
 * call more than once — Monday will return a fresh id on each call, but
 * the admin can pick whichever one they keep around.
 *
 * Gated to ADMIN_EMAILS so a curious CS rep can't spam Monday columns.
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
    const id = await createClientsLongTextColumn('Sticky Notes');
    return NextResponse.json({
      ok: true,
      columnId: id,
      next: `Set MONDAY_STICKY_NOTES_COL_ID=${id} in Vercel Settings → Environment Variables (all environments), then redeploy.`,
    });
  } catch (err) {
    console.error('[setup-sticky-notes] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to create column', detail: message }, { status: 502 });
  }
}
