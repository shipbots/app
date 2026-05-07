/**
 * DocuSign JWT Server-to-Server authentication and document download.
 *
 * Required env vars:
 *   DOCUSIGN_INTEGRATION_KEY  — App's client ID (Apps and Keys page)
 *   DOCUSIGN_USER_ID          — Your DocuSign User GUID (My Profile → API Username)
 *   DOCUSIGN_ACCOUNT_ID       — Account ID (Admin → Account Settings → API Account ID)
 *   DOCUSIGN_PRIVATE_KEY      — RSA private key PEM with \n for newlines
 *   DOCUSIGN_ENVIRONMENT      — "demo" or "production" (defaults to "demo")
 */

import { createSign, createHmac, timingSafeEqual } from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

interface DocuSignConfig {
  integrationKey: string;
  userId: string;
  accountId: string;
  privateKey: string;
  authDomain: string;    // account-d.docusign.com | account.docusign.com
  apiBasePath: string;   // https://demo.docusign.net/restapi | https://na3.docusign.net/restapi
}

function getConfig(): DocuSignConfig {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId         = process.env.DOCUSIGN_USER_ID;
  const accountId      = process.env.DOCUSIGN_ACCOUNT_ID;
  const rawKey         = process.env.DOCUSIGN_PRIVATE_KEY;

  if (!integrationKey || !userId || !accountId || !rawKey) {
    throw new Error(
      'DocuSign not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, ' +
      'DOCUSIGN_ACCOUNT_ID, and DOCUSIGN_PRIVATE_KEY in .env.local.'
    );
  }

  // Support both escaped (\n) and literal newlines in the key
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const isDemo = process.env.DOCUSIGN_ENVIRONMENT !== 'production';
  const authDomain  = isDemo ? 'account-d.docusign.com' : 'account.docusign.com';
  const apiBasePath = isDemo
    ? 'https://demo.docusign.net/restapi'
    : 'https://na3.docusign.net/restapi'; // update to your account's base URL if different

  return { integrationKey, userId, accountId, privateKey, authDomain, apiBasePath };
}

export function isDocuSignConfigured(): boolean {
  return !!(
    process.env.DOCUSIGN_INTEGRATION_KEY &&
    process.env.DOCUSIGN_USER_ID         &&
    process.env.DOCUSIGN_ACCOUNT_ID      &&
    process.env.DOCUSIGN_PRIVATE_KEY
  );
}

// ─── JWT helpers ──────────────────────────────────────────────────────────────

function b64url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Obtain a short-lived OAuth access token via JWT Grant. */
export async function getAccessToken(): Promise<string> {
  const { integrationKey, userId, authDomain, privateKey } = getConfig();

  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   integrationKey,
    sub:   userId,
    aud:   authDomain,
    iat:   now,
    exp:   now + 3600,
    scope: 'signature impersonation',
  }));

  const signing = `${header}.${payload}`;
  const sig = createSign('RSA-SHA256')
    .update(signing)
    .sign(privateKey)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  const jwt = `${signing}.${sig}`;

  const res = await fetch(`https://${authDomain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DocuSign JWT token exchange failed (${res.status}): ${err.slice(0, 400)}`);
  }

  const data = await res.json() as { access_token: string };
  return data.access_token;
}

// ─── Document download ────────────────────────────────────────────────────────

/**
 * Download the combined signed PDF for a completed envelope.
 * Returns the raw PDF bytes as a Buffer.
 */
export async function downloadSignedDocument(envelopeId: string): Promise<Buffer> {
  const { accountId, apiBasePath } = getConfig();
  const token = await getAccessToken();

  const url = `${apiBasePath}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/pdf',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DocuSign document download failed (${res.status}): ${err.slice(0, 400)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}

// ─── Webhook HMAC verification (optional but recommended) ─────────────────────

/**
 * Verify the X-DocuSign-Signature-1 HMAC header sent by DocuSign Connect.
 * Returns true if the signature is valid or if DOCUSIGN_HMAC_KEY is not set (skips check).
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const hmacKey = process.env.DOCUSIGN_HMAC_KEY;
  if (!hmacKey) return true; // HMAC verification not configured — allow all

  if (!signatureHeader) return false;

  const expected = createHmac('sha256', hmacKey)
    .update(rawBody, 'utf8')
    .digest('base64');

  try {
    return timingSafeEqual(
      Buffer.from(expected, 'base64'),
      Buffer.from(signatureHeader, 'base64')
    );
  } catch {
    return false;
  }
}

// ─── Payload types ────────────────────────────────────────────────────────────

export interface DocuSignWebhookPayload {
  event: string;
  data?: {
    accountId?: string;
    envelopeId?: string;
    envelopeSummary?: {
      status: string;
      completedDateTime?: string;
      recipients?: {
        signers?: Array<{
          email: string;
          name: string;
          status: string;
          signedDateTime?: string;
        }>;
      };
    };
  };
}
