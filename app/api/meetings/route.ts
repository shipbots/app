import { NextResponse } from 'next/server';
import { searchMeetingsByClient } from '@/lib/fireflies';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const clientName  = searchParams.get('client');
  const legalName   = searchParams.get('legalName');
  const contactName = searchParams.get('contactName');
  // Contact emails — the most reliable signal (a meeting the contact attended,
  // regardless of its title). Passed as a comma-separated `emails` param.
  const emails = (searchParams.get('emails') || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);

  if (!clientName) {
    return NextResponse.json({ error: 'client parameter required' }, { status: 400 });
  }

  // Build de-duplicated list of search terms
  const terms = [clientName, legalName, contactName].filter(Boolean) as string[];

  try {
    const meetings = await searchMeetingsByClient(terms, emails);
    return NextResponse.json(meetings);
  } catch (error) {
    console.error('Failed to search meetings:', error);
    return NextResponse.json([], { status: 200 });
  }
}
