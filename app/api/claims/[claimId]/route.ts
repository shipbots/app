/**
 * A single claim.
 *
 * PATCH /api/claims/[claimId]  { fields?: {...}, name?: string, groupId?: string }
 *       → { claim }  (the refreshed claim)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserEmail } from '@/lib/request-user';
import { isMondayId, updateClaim } from '@/lib/claims';

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  if (!(await getRequestUserEmail(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { claimId } = await ctx.params;
  if (!isMondayId(claimId)) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });

  let body: { fields?: Record<string, unknown>; name?: string; groupId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  try {
    const claim = await updateClaim(claimId, {
      fields: body.fields && typeof body.fields === 'object' ? body.fields : undefined,
      name: typeof body.name === 'string' ? body.name : undefined,
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
    });
    return NextResponse.json({ claim });
  } catch (err) {
    const msg = (err as Error).message || 'Failed to update claim';
    console.error('PATCH /api/claims/[claimId] failed', err);
    return NextResponse.json({ error: msg }, { status: msg === 'Claim not found' ? 404 : 500 });
  }
}
