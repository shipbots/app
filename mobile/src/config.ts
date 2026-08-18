/**
 * App configuration. The API base points at the deployed ShipBots dashboard on
 * Vercel — the same backend the web app and Chrome extension use.
 *
 * Auth: the app signs in via /mobile-login (reusing the web Google login) to get
 * a Bearer token, then calls the real API. Before sign-in — or if FORCE_MOCK is
 * flipped on — it falls back to in-memory fixtures so the UI still renders.
 */

export const API_BASE_URL = 'https://app-snowy-eight-64.vercel.app';

/** Deep link the /mobile-login page redirects back to with the token. */
export const AUTH_RETURN_URL = 'shipbotscs://auth';

/** Force fixtures even when signed in (dev/demo only). Normally false. */
export const FORCE_MOCK = false;
