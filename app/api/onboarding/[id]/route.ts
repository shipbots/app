import { NextResponse } from 'next/server';
import { updateOnboardingStatus, updateOnboardingField, ColumnValueType } from '@/lib/monday';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { columnId, value, valueType } = body;
    console.log(`[PATCH /api/onboarding/${id}] columnId=${columnId} valueType=${valueType} value="${value}"`);
    // Use the typed updater when a valueType is provided (e.g. 'date'); otherwise
    // fall back to the label-based status updater used by checklist steps.
    if (valueType && valueType !== 'status') {
      await updateOnboardingField(id, columnId, value, valueType as ColumnValueType);
    } else {
      await updateOnboardingStatus(id, columnId, value);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/onboarding] Failed to update field:', error);
    return NextResponse.json({ error: 'Failed to update field' }, { status: 500 });
  }
}
