/**
 * POST /api/gmail/send
 * Sends an email via the Gmail API using stored OAuth credentials.
 *
 * Body: { to: string; subject: string; body: string }
 *
 * Required env vars:
 *   GMAIL_CLIENT_ID      — OAuth client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET  — OAuth client secret
 *   GMAIL_REFRESH_TOKEN  — Long-lived refresh token (obtained via /api/gmail/auth)
 */
import { NextRequest, NextResponse } from 'next/server';

async function getAccessToken(): Promise<string> {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw Object.assign(new Error('gmail_not_connected'), { code: 'gmail_not_connected' });
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    // A revoked or expired refresh token comes back from Google's token
    // endpoint as a 4xx (e.g. 400 { error: 'invalid_grant' }). Treat that as
    // the same "not connected" condition as missing credentials so the caller
    // routes the user to the reconnect flow ("Connect Gmail") instead of a
    // dead-end 500 that surfaces as a mysterious "Failed". A 5xx / network
    // error is transient, so keep it a generic error worth retrying.
    if (res.status === 400 || res.status === 401) {
      throw Object.assign(new Error('gmail_not_connected'), { code: 'gmail_not_connected' });
    }
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

/** Build a base64url-encoded RFC 2822 message */
function buildRawMessage(to: string, subject: string, body: string): string {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ];
  const raw = lines.join('\r\n');
  return Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function POST(req: NextRequest) {
  try {
    const { to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: 'Missing to / subject / body' }, { status: 400 });
    }

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'gmail_not_connected') {
        return NextResponse.json({ error: 'gmail_not_connected' }, { status: 401 });
      }
      throw err;
    }

    const raw = buildRawMessage(to, subject, body);

    const sendRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      }
    );

    const result = await sendRes.json();
    if (!sendRes.ok) {
      throw new Error(`Gmail send error (${sendRes.status}): ${JSON.stringify(result)}`);
    }

    return NextResponse.json({ ok: true, messageId: result.id });
  } catch (err) {
    console.error('[Gmail send]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
