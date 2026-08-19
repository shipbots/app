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
];

export const HELP_ARTICLE_KEYS = HELP_ARTICLE_OPTIONS.map((o) => o.key);
