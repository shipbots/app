/**
 * Client-fetchable version of the Monday onboarding list. Both the
 * /onboarding and /customer-service surfaces used to be async server
 * components that awaited fetchOnboardingItems() before rendering
 * anything, so users stared at a blank "Loading client data from
 * Monday.com…" full-page loader for the entire Monday round-trip on
 * every sign-in AND every tab switch between the two surfaces.
 *
 * With this endpoint the pages become thin client-driven shells:
 * they render immediately with whatever's in the SWR localStorage
 * cache and refetch here in the background. Cache-Control lets the
 * browser HTTP cache short-circuit for 60s and revalidate in the
 * background for another 5 minutes on top of that.
 */

import { NextResponse } from 'next/server';
import { fetchOnboardingItems } from '@/lib/monday';
import { computeAlerts } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Auth is enforced by the edge proxy (session cookie OR a valid mobile Bearer
// token). No in-handler session check — that would reject mobile app requests,
// which carry a Bearer instead of a NextAuth cookie.
export async function GET() {
  try {
    const items = await fetchOnboardingItems();
    const alerts = computeAlerts(items);
    return NextResponse.json({ items, alerts }, {
      headers: {
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      },
    });
  } catch (error) {
    console.error('[onboarding-items] fetch failed:', error);
    return NextResponse.json({ error: 'Monday fetch failed' }, { status: 502 });
  }
}
