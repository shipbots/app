/**
 * Claims for a client (Monday "✳️ Claims" board).
 *
 * GET  /api/claims?clientId=<Clients-board item id>
 *      → { claims: Claim[], options: { statuses, reasons, groups } }
 * POST /api/claims  { clientId, clientName, fields: {...}, groupId? }
 *      → { claim }   (files are attached afterwards via /api/claims/[id]/files)
 *
 * Auth: proxy.ts already rejects unauthenticated /api requests; we re-check the
 * caller here (web session cookie or mobile Bearer token) so a misconfigured
 * matcher can't expose the board.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserEmail } from '@/lib/request-user';
import { createClaim, fetchClaimOptions, fetchClaimsForClient, isMondayId } from '@/lib/claims';

export async function GET(request: NextRequest) {
  if (!(await getRequestUserEmail(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const clientId = request.nextUrl.searchParams.get('clientId') || '';
  if (!isMondayId(clientId)) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }
  try {
    const [claims, options] = await Promise.all([fetchClaimsForClient(clientId), fetchClaimOptions()]);
    return NextResponse.json({ claims, options });
  } catch (err) {
    console.error('GET /api/claims failed', err);
    return NextResponse.json({ error: (err as Error).message || 'Failed to load claims' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await getRequestUserEmail(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { clientId?: string; clientName?: string; fields?: Record<string, unknown>; groupId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!isMondayId(body.clientId)) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  if (!String(fields.orderNumber || '').trim() && !String(fields.trackingNumber || '').trim()) {
    return NextResponse.json({ error: 'Add an order number or a tracking number' }, { status: 400 });
  }
  try {
    const claim = await createClaim({
      clientBoardItemId: body.clientId,
      clientName: String(body.clientName || ''),
      fields,
      groupId: typeof body.groupId === 'string' ? body.groupId : undefined,
    });
    return NextResponse.json({ claim }, { status: 201 });
  } catch (err) {
    console.error('POST /api/claims failed', err);
    return NextResponse.json({ error: (err as Error).message || 'Failed to create claim' }, { status: 500 });
  }
}
