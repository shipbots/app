import { NextRequest, NextResponse } from 'next/server';
import { fetchMessageBody } from '@/lib/gmail';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  if (!messageId) {
    return NextResponse.json({ error: 'messageId required' }, { status: 400 });
  }
  try {
    const body = await fetchMessageBody(messageId);
    return NextResponse.json({ body });
  } catch (error: unknown) {
    const msg = String(error);
    if (msg.includes('403') || msg.includes('401') || msg.includes('insufficient')) {
      return NextResponse.json({ error: 'gmail_reauth_required' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
