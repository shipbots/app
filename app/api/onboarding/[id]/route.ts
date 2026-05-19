import { NextResponse } from 'next/server';
import { updateOnboardingField } from '@/lib/monday';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { columnId, value } = body;
    console.log(`[PATCH /api/onboarding/${id}] columnId=${columnId} value="${value}"`);
    // updateOnboardingField auto-detects column type from Monday metadata
    // and formats the value correctly — no need to branch on valueType here.
    await updateOnboardingField(id, columnId, value);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/onboarding] Failed to update field:', error);
    return NextResponse.json({ error: 'Failed to update field' }, { status: 500 });
  }
}
