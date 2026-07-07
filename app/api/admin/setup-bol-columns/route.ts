/**
 * One-shot bootstrap for the BOL (Bill of Lading) storage columns.
 *
 * Creates two columns on the Clients board:
 *   • "BOL Records"   (long_text) — JSON array of BolRecord per client
 *   • "BOL Documents" (file)      — the uploaded document images
 *
 * Returns both ids and the env vars to set in Vercel. Admin-gated so a CS rep
 * can't spam Monday columns. Safe to re-run — Monday returns fresh ids each
 * time; keep whichever pair you paste into env.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';
import { createClientsColumn } from '@/lib/monday';
import { BOL_COL_ENV, BOL_FILES_COL_ENV } from '@/lib/bol';

export async function POST() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }

  try {
    const recordsColId = await createClientsColumn('BOL Records', 'long_text');
    const filesColId = await createClientsColumn('BOL Documents', 'file');
    return NextResponse.json({
      ok: true,
      recordsColId,
      filesColId,
      next: [
        `Set ${BOL_COL_ENV}=${recordsColId} and ${BOL_FILES_COL_ENV}=${filesColId}`,
        'in Vercel Settings → Environment Variables (all environments), then redeploy.',
      ].join(' '),
    });
  } catch (err) {
    console.error('[setup-bol-columns] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to create columns', detail: message }, { status: 502 });
  }
}
