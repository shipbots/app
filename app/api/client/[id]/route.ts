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
    // Browser HTTP cache short-circuit. When a user reopens the same
    // client within 30s the browser serves this payload from its own
    // disk cache with no network hop (much less a Monday round-trip).
    // Between 30s and ~5min, the SWR pill kicks in server-side too:
    // the browser hands back the cached response instantly and issues
    // a background revalidate. `private` keeps intermediary proxies
    // out since responses may vary by session.
    return NextResponse.json(client, {
      headers: {
        'Cache-Control': 'private, max-age=30, stale-while-revalidate=300',
      },
    });
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
