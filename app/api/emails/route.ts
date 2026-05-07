import { NextResponse } from 'next/server';
import { searchEmailsByClient } from '@/lib/gmail';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientName = searchParams.get('client');

  // Accept multiple emails: ?email=a@b.com&email=c@d.com  OR  ?email=a,b,c
  const emailParam = searchParams.getAll('email');
  const contactEmails = emailParam
    .flatMap(e => e.split(','))
    .map(e => e.trim())
    .filter(Boolean);

  if (!clientName) {
    return NextResponse.json({ error: 'client parameter required' }, { status: 400 });
  }

  try {
    const emails = await searchEmailsByClient(clientName, contactEmails);
    return NextResponse.json(emails);
  } catch (error: unknown) {
    console.error('Failed to search emails:', error);
    const msg = String(error);
    // Surface scope/auth errors to the client so the UI can prompt re-auth
    if (msg.includes('403') || msg.includes('insufficient') || msg.includes('gmail_not_connected')) {
      return NextResponse.json({ error: 'gmail_reauth_required' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
