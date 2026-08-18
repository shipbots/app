/**
 * App configuration. The API base points at the deployed ShipBots dashboard on
 * Vercel — the same backend the web app and Chrome extension use.
 *
 * NOTE: those API routes are gated by NextAuth session cookies (see proxy.ts in
 * the web repo), so the mobile app can't hit them with real data until we add a
 * token-based mobile auth path (Phase 2). Until then USE_MOCK_DATA is true and
 * the app runs against realistic in-memory fixtures so the UI is fully usable.
 */

export const API_BASE_URL = 'https://app-snowy-eight-64.vercel.app';

/** Flip to false once mobile auth (Google sign-in → app token) is wired up. */
export const USE_MOCK_DATA = true;

/** Domain allowed to sign in, once auth exists. */
export const ALLOWED_EMAIL_DOMAIN = 'shipbots.com';
