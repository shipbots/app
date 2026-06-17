/**
 * POST /api/client/[id]/set-active
 *
 * Marks a client active or inactive by moving its Clients-board item to a
 * different group. Body: { active: boolean }.
 *
 * - active: false → moved to CLIENT_GROUP_EXITED ("Exited" group)
 * - active: true  → moved to CLIENT_GROUP_ACTIVE_DEFAULT ("Company …" main
 *                   group). The previous group isn't remembered; teams
 *                   that use multiple home groups should drag the client
 *                   manually if the default landing spot isn't right.
 */

import { NextRequest, NextResponse } from 'next/server';
import { moveClientToGroup } from '@/lib/monday';
import { CLIENT_GROUP_EXITED, CLIENT_GROUP_ACTIVE_DEFAULT } from '@/lib/constants';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { active?: boolean };
    if (typeof body.active !== 'boolean') {
      return NextResponse.json({ error: '`active` must be a boolean' }, { status: 400 });
    }
    const targetGroup = body.active ? CLIENT_GROUP_ACTIVE_DEFAULT : CLIENT_GROUP_EXITED;
    await moveClientToGroup(id, targetGroup);
    return NextResponse.json({ ok: true, groupId: targetGroup });
  } catch (err) {
    console.error('[client/set-active]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
