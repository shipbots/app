/**
 * GET /api/health
 *
 * Tests connectivity to every external API used by the dashboard.
 * Returns a JSON object with a status per service and an overall ok flag.
 *
 * Used by the nightly 3 AM health-check cron to detect and log issues.
 */

import { NextResponse } from 'next/server';

const MONDAY_API_URL    = 'https://api.monday.com/v2';
const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

type ServiceResult = { ok: boolean; latencyMs: number; error?: string };

async function checkMonday(): Promise<ServiceResult> {
  const key = process.env.MONDAY_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: 'MONDAY_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
      body: JSON.stringify({ query: '{ me { id name } }' }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.errors) return { ok: false, latencyMs: Date.now() - start, error: data.errors[0]?.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

async function checkFireflies(): Promise<ServiceResult> {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: 'FIREFLIES_API_KEY not set' };
  const start = Date.now();
  try {
    const res = await fetch(FIREFLIES_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: '{ user { user_id name } }' }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.errors) return { ok: false, latencyMs: Date.now() - start, error: data.errors[0]?.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

async function checkGmail(): Promise<ServiceResult> {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, latencyMs: 0, error: 'Gmail OAuth credentials not set' };
  }
  const start = Date.now();
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type:    'refresh_token',
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, latencyMs: Date.now() - start, error: data.error_description || data.error };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

async function checkAnthropic(): Promise<ServiceResult> {
  const key = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!key) return { ok: false, latencyMs: 0, error: 'SHIPBOTS_ANTHROPIC_KEY not set' };
  const start = Date.now();
  try {
    // Cheapest possible call — 1 input token, 1 output token
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      return { ok: false, latencyMs: Date.now() - start, error: data.error?.message || data.error };
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

async function checkDocuSign(): Promise<ServiceResult> {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId         = process.env.DOCUSIGN_USER_ID;
  const accountId      = process.env.DOCUSIGN_ACCOUNT_ID;
  const rawKey         = process.env.DOCUSIGN_PRIVATE_KEY;

  if (!integrationKey || !userId || !accountId || !rawKey) {
    const missing = [
      !integrationKey && 'DOCUSIGN_INTEGRATION_KEY',
      !userId         && 'DOCUSIGN_USER_ID',
      !accountId      && 'DOCUSIGN_ACCOUNT_ID',
      !rawKey         && 'DOCUSIGN_PRIVATE_KEY',
    ].filter(Boolean).join(', ');
    return { ok: false, latencyMs: 0, error: `Not configured — missing: ${missing}` };
  }
  // Keys are present; skip live token exchange to avoid unnecessary DocuSign API load.
  // The webhook route will surface auth errors when envelopes actually complete.
  return { ok: true, latencyMs: 0 };
}

async function checkWindsor(): Promise<ServiceResult> {
  const key = process.env.WINDSOR_API_KEY?.trim();
  if (!key) return { ok: false, latencyMs: 0, error: 'WINDSOR_API_KEY not set (ShipHero PO lookups disabled)' };
  // Windsor doesn't have a free ping endpoint — just confirm the key is set.
  return { ok: true, latencyMs: 0 };
}

export async function GET() {
  const [monday, fireflies, gmail, anthropic, docusign, windsor] = await Promise.all([
    checkMonday(),
    checkFireflies(),
    checkGmail(),
    checkAnthropic(),
    checkDocuSign(),
    checkWindsor(),
  ]);

  const critical = monday.ok && fireflies.ok && gmail.ok && anthropic.ok;
  const allOk    = critical && docusign.ok && windsor.ok;
  const checkedAt = new Date().toISOString();

  const log = (svc: string, r: ServiceResult) =>
    r.ok
      ? `${svc}:OK(${r.latencyMs}ms)`
      : `${svc}:FAIL(${r.error})`;

  console.log(
    `[health] ${checkedAt} — ` +
    [monday, fireflies, gmail, anthropic, docusign, windsor]
      .map((r, i) => log(['monday','fireflies','gmail','anthropic','docusign','windsor'][i], r))
      .join(' | ')
  );

  return NextResponse.json(
    { ok: allOk, critical, checkedAt, services: { monday, fireflies, gmail, anthropic, docusign, windsor } },
    { status: allOk ? 200 : 207 }
  );
}
