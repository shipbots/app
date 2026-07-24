/**
 * GET /api/admin/status → { isAdmin, email }
 *
 * Lightweight check the Chrome extension (and any client) can hit to find out
 * whether the signed-in user is an admin (ADMIN_EMAILS allowlist), without
 * exposing the list itself. Used to gate the extension's admin-only Onboarding
 * view.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ isAdmin: false, email: null }, { status: 401 });
  return NextResponse.json(
    { isAdmin: isAdminEmail(email), email },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
