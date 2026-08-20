/** The help guides the agent can attach (as links) to an After-Onboarding
 *  Summary. Platform-agnostic keys — the summary page resolves each key to the
 *  client's platform URL (AppDot vs Portal) from lib/help-articles.ts.
 *  Small + client-safe so the "generate" modal can import it without pulling in
 *  the full article dataset. */
export const HELP_ARTICLE_OPTIONS: { key: string; label: string }[] = [
  { key: 'login', label: 'Log into your account' },
  { key: 'connect', label: 'Connect your e-commerce platform' },
  { key: 'inventory', label: 'Send us your inventory' },
  { key: 'orders', label: 'Create a manual order' },
  { key: 'orders-nav', label: 'How to navigate the orders page' },
];

export const HELP_ARTICLE_KEYS = HELP_ARTICLE_OPTIONS.map((o) => o.key);

/** A saved custom guide (name + link). Persisted in the browser's localStorage
 *  — no server setup required — and passed inline to the summary at generate. */
export interface CustomArticle {
  id: string;
  name: string;
  url: string;
}

/** localStorage key for the agent's saved custom guides. */
export const CUSTOM_ARTICLES_LS_KEY = 'shipbots:onboarding:customArticles';
