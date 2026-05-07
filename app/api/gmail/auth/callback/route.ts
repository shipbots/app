/**
 * GET /api/gmail/auth/callback
 * Google redirects here after the user grants (or denies) Gmail access.
 * We exchange the `code` for tokens and display the refresh token so the
 * user can paste it into .env.local as GMAIL_REFRESH_TOKEN.
 */
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get('code');
  const error = searchParams.get('error');

  if (error || !code) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">Gmail authorization failed</h2>
        <p>${error ?? 'No code returned'}</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const clientId     = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const redirectUri  = process.env.GMAIL_REDIRECT_URI ?? 'http://localhost:3000/api/gmail/auth/callback';

  // Exchange authorization code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const tokens = await tokenRes.json();

  if (!tokenRes.ok || !tokens.refresh_token) {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;padding:2rem">
        <h2 style="color:#dc2626">Token exchange failed</h2>
        <pre style="background:#f3f4f6;padding:1rem;border-radius:8px">${JSON.stringify(tokens, null, 2)}</pre>
        <p>Make sure you added <code>prompt=consent</code> and <code>access_type=offline</code> to the auth request (already done).</p>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  const refreshToken = tokens.refresh_token as string;

  return new NextResponse(
    `<html>
      <head><title>Gmail Connected ✅</title></head>
      <body style="font-family:sans-serif;padding:2rem;max-width:640px;margin:0 auto">
        <h2 style="color:#16a34a">✅ Gmail connected successfully!</h2>
        <p>Add the following line to your <strong>.env.local</strong> file, then restart the dev server:</p>
        <pre style="background:#f3f4f6;padding:1rem;border-radius:8px;word-break:break-all;white-space:pre-wrap">GMAIL_REFRESH_TOKEN=${refreshToken}</pre>
        <p style="color:#6b7280;font-size:0.875rem">Keep this token secret — it grants permanent Gmail send access until revoked.</p>
        <p><a href="/" style="color:#2563eb">← Back to Dashboard</a></p>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}
