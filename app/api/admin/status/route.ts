/**
 * GET /api/admin/status → { isAdmin, canDocusign, email }
 *
 * Lightweight check the Chrome extension (and any client) can hit to find out
 * the signed-in user's capabilities without exposing the underlying allowlists:
 *   - isAdmin     → ADMIN_EMAILS (gates the extension's admin-only Onboarding view)
 *   - canDocusign → DOCUSIGN_EMAILS (gates who may see billing/DocuSign info —
 *                   mirrors the dashboard's `canViewBilling`; used to gate the
 *                   extension's Billing info view)
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';
import { canUseDocusign } from '@/lib/docusign-access';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!email) return NextResponse.json({ isAdmin: false, canDocusign: false, email: null }, { status: 401 });
  return NextResponse.json(
    { isAdmin: isAdminEmail(email), canDocusign: await canUseDocusign(email), email },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
