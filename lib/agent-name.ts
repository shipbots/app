/**
 * Convert an @shipbots.com email into a human-readable first name for
 * display. "cynthia@shipbots.com" → "Cynthia". Used everywhere we
 * surface an author or an assigned agent — sticky notes, the agent
 * pill, the agent picker, and the Chrome extension counterparts.
 *
 * Backend continues to store and PATCH the full email; this helper is
 * purely a display transform so reps see a short readable name in the
 * UI while the source of truth stays canonical.
 *
 * Edge cases:
 *   - Empty / null → empty string
 *   - Email without "@" → returned as-is (with first-letter capitalized)
 *   - Names with dots like "andres.mejia" → "Andres.mejia" (we don't
 *     try to split; the ShipBots convention is single-word locals).
 */
export function firstNameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const trimmed = email.trim();
  if (!trimmed) return '';
  const local = trimmed.split('@')[0];
  if (!local) return '';
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}
