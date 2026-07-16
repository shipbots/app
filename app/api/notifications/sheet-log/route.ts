/**
 * POST /api/notifications/sheet-log
 *
 * Called by the E-mail notifications UI right after it saves notification
 * e-mails to the Monday column. Appends a { ShipHero name, e-mails } row to the
 * configured Google Sheet (via the Apps Script webhook). No-ops cleanly when the
 * sheet integration isn't configured, so the Monday process is never blocked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { appendNotificationRow, isNotificationSheetConfigured } from '@/lib/notification-sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isNotificationSheetConfigured()) {
    return NextResponse.json({ ok: true, configured: false, appended: false });
  }

  let body: { shipHeroName?: unknown; emails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const shipHeroName = typeof body.shipHeroName === 'string' ? body.shipHeroName.trim() : '';
  const emails = typeof body.emails === 'string' ? body.emails.trim() : '';
  // Nothing to log — a removal or an empty save.
  if (!emails) {
    return NextResponse.json({ ok: true, configured: true, appended: false });
  }

  try {
    await appendNotificationRow({ shipHeroName, emails });
    return NextResponse.json({ ok: true, configured: true, appended: true });
  } catch (err) {
    console.error('[notifications/sheet-log] append failed:', err);
    return NextResponse.json({ error: 'Sheet append failed' }, { status: 502 });
  }
}
