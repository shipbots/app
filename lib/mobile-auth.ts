/**
 * Mobile app authentication tokens.
 *
 * The mobile app can't use NextAuth session cookies, so instead it carries a
 * signed JWT (minted for an already-logged-in user on the /mobile-login page)
 * and sends it as `Authorization: Bearer <token>`. The edge proxy verifies it
 * to authenticate API calls — see proxy.ts.
 *
 * Uses `jose` (edge-runtime safe; ships with NextAuth v5). Signed with
 * MOBILE_JWT_SECRET — a secret set only in the deployment env, never committed.
 */

import { SignJWT, jwtVerify } from 'jose';

const TOKEN_TTL = '90d';

function secretKey(): Uint8Array | null {
  const s = process.env.MOBILE_JWT_SECRET;
  return s ? new TextEncoder().encode(s) : null;
}

/** Mint a mobile token for a logged-in user. Throws if the secret isn't set. */
export async function signMobileToken(email: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error('MOBILE_JWT_SECRET not configured');
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(key);
}

/** Verify a mobile token. Returns the email on success, null on any failure. */
export async function verifyMobileToken(token: string): Promise<{ email: string } | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const email = String(payload.email ?? payload.sub ?? '').toLowerCase();
    return email ? { email } : null;
  } catch {
    return null;
  }
}
