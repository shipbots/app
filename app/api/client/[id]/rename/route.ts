import { NextRequest, NextResponse } from 'next/server';
import { renameItem } from '@/lib/monday';
import { CLIENTS_BOARD_ID, ONBOARDING_BOARD_ID } from '@/lib/constants';

/**
 * POST /api/client/[id]/rename
 *
 * Renames a client on both the Clients board and the linked Onboarding board
 * item so the two boards stay in sync.
 *
 * Body: { newName: string; onboardingItemId?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { newName, onboardingItemId } = await request.json();

    if (!newName || typeof newName !== 'string' || !newName.trim()) {
      return NextResponse.json({ error: 'newName is required' }, { status: 400 });
    }

    const trimmed = newName.trim();

    // Rename on Clients board
    await renameItem(CLIENTS_BOARD_ID, id, trimmed);

    // Rename on Onboarding board (if the item is linked)
    if (onboardingItemId) {
      await renameItem(ONBOARDING_BOARD_ID, onboardingItemId, trimmed);
    }

    console.log(
      `[rename] client=${id} onboarding=${onboardingItemId ?? 'n/a'} → "${trimmed}"`
    );
    return NextResponse.json({ ok: true, name: trimmed });
  } catch (error) {
    console.error('[POST /api/client/[id]/rename] failed:', error);
    return NextResponse.json({ error: 'Failed to rename client' }, { status: 500 });
  }
}
