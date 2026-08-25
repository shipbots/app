/**
 * POST /api/client/merge
 *
 * Merge two Clients-board items into one. The `keepId` client survives and has
 * its blank fields backfilled from the `dropId` client, which is then deleted
 * (soft delete → Monday Recycle Bin, recoverable ~30 days).
 *
 * Body: { keepId: string; dropId: string; dryRun?: boolean }
 *   dryRun=true returns the merge PLAN (fields that would change + which client
 *   is deleted) without writing anything.
 *
 * Admin-only — this deletes a client record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';
import { mergeClients, planClientMerge } from '@/lib/monday';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Merging clients is restricted to admins.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { keepId?: string; dropId?: string; dryRun?: boolean } | null;
  const keepId = String(body?.keepId ?? '').trim();
  const dropId = String(body?.dropId ?? '').trim();
  if (!keepId || !dropId) {
    return NextResponse.json({ error: 'keepId and dropId are required' }, { status: 400 });
  }
  if (keepId === dropId) {
    return NextResponse.json({ error: 'Pick two different clients to merge' }, { status: 400 });
  }
  if (!/^\d+$/.test(keepId) || !/^\d+$/.test(dropId)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  try {
    const result = body?.dryRun
      ? await planClientMerge(keepId, dropId)
      : await mergeClients(keepId, dropId);
    if (!body?.dryRun) {
      console.log(`[merge] ${email} merged ${dropId} into ${keepId}`);
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error('[POST /api/client/merge] failed:', err);
    return NextResponse.json({ error: 'Merge failed. No client was deleted.' }, { status: 502 });
  }
}
