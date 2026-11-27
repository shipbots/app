/**
 * Who is making this API request? Works for both callers of the dashboard API:
 *   - web app / Chrome extension → NextAuth session cookie
 *   - mobile app                 → `Authorization: Bearer <mobile JWT>`
 *
 * proxy.ts already rejects unauthenticated /api traffic; routes that want a
 * second check (or the caller's email) use this instead of auth() alone, which
 * would treat every mobile request as signed out.
 */

import type { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { verifyMobileToken } from '@/lib/mobile-auth';

export async function getRequestUserEmail(request: NextRequest): Promise<string | null> {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (m) {
    const mobile = await verifyMobileToken(m[1]);
    return mobile ? mobile.email : null;
  }
  const session = await auth();
  return session?.user?.email ? String(session.user.email).toLowerCase() : null;
}
