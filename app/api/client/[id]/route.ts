import { NextRequest, NextResponse } from 'next/server';
import { fetchClientInfo, updateClientField, ColumnValueType } from '@/lib/monday';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const onboardingId = searchParams.get('onboardingId') || undefined;
    const client = await fetchClientInfo(id, onboardingId);
    return NextResponse.json(client);
  } catch (error) {
    console.error('Failed to fetch client info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch client data' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { columnId, value, valueType, isDate } = await request.json();
    // valueType takes precedence; fall back to legacy isDate boolean for backward compat
    const type: ColumnValueType = valueType ?? (isDate ? 'date' : 'text');
    await updateClientField(id, columnId, value, type);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to update client field:', error);
    return NextResponse.json(
      { error: 'Failed to update field' },
      { status: 500 }
    );
  }
}
