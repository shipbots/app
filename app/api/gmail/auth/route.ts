/**
 * GET /api/gmail/auth
 * Redirects the user to Google's OAuth consent screen to grant Gmail send access.
 * After approval, Google redirects to /api/gmail/auth/callback.
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: 'GMAIL_CLIENT_ID not set in .env.local' },
      { status: 503 }
    );
  }

  const redirectUri = process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:3000/api/gmail/auth/callback';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly',
    access_type: 'offline',
    prompt: 'consent',   // force refresh_token to be returned every time
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
