/**
 * Shared client search — the ranking logic behind both the Customer Service
 * search dropdown and (via the same /api/clients/search-index) the Chrome
 * extension's popup search. Kept framework-free so it can be imported by
 * client components, the API route (type only), and tests alike.
 *
 * The scoring mirrors chrome-extension/popup.js `matchScore` so a query
 * ranks the same way in the dashboard as it does in the extension:
 *   - client-name hits always win ties,
 *   - primary contact beats secondary beats tertiary,
 *   - prefix matches beat mid-string matches,
 *   - 3+ digit queries also match phone numbers digit-for-digit.
 */

import type { OnboardingItem } from './types';

/**
 * Denormalized row from /api/clients/search-index — one per Clients-board
 * item, carrying every field a rep might search a client by. This is the
 * canonical shape; the API route and clients-view both import it from here.
 */
export interface ClientIndexEntry {
  id: string;
  name: string;
  legalEntity: string;
  storeName: string;
  shipHeroName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  contact2Name: string;
  contact2Email: string;
  contact2Phone: string;
  contact3Name: string;
  contact3Email: string;
  contact3Phone: string;
  /** AppDot / Portal dropdown label, e.g. "ShipBots Portal". */
  portal: string;
  /** Warehouse Location dropdown label. */
  warehouse: string;
  /** Clients-board group id (group_mkq09z7j == 'Exited' == inactive). */
  groupId: string;
}

/** Clients-board "Exited" group id — a client here reads as inactive. */
export const CLIENT_GROUP_EXITED_ID = 'group_mkq09z7j';

/** High-level classification of which field matched, for display + styling. */
export type MatchKind = 'name' | 'company' | 'contact' | 'email' | 'phone';

interface SearchableField {
  key: keyof ClientIndexEntry;
  label: string;
  kind: MatchKind;
  /** Contact slot (1 primary / 2 / 3), undefined for client-level fields. */
  contact?: 1 | 2 | 3;
  isName?: boolean;
  /** Enables digit-only matching so "555 1234" matches "(555) 555-1234". */
  phone?: boolean;
}

// Order matters only for readability — scoring, not position, decides ranking.
const SEARCHABLE_FIELDS: SearchableField[] = [
  { key: 'name',          label: 'Client name',     kind: 'name',    isName: true },
  { key: 'shipHeroName',  label: 'ShipHero name',   kind: 'company' },
  { key: 'storeName',     label: 'Store',           kind: 'company' },
  { key: 'legalEntity',   label: 'Legal entity',    kind: 'company' },
  { key: 'contactName',   label: 'Primary contact', kind: 'contact', contact: 1 },
  { key: 'contactEmail',  label: 'Primary email',   kind: 'email',   contact: 1 },
  { key: 'contactPhone',  label: 'Primary phone',   kind: 'phone',   contact: 1, phone: true },
  { key: 'contact2Name',  label: 'Contact 2',       kind: 'contact', contact: 2 },
  { key: 'contact2Email', label: 'Contact 2 email', kind: 'email',   contact: 2 },
  { key: 'contact2Phone', label: 'Contact 2 phone', kind: 'phone',   contact: 2, phone: true },
  { key: 'contact3Name',  label: 'Contact 3',       kind: 'contact', contact: 3 },
  { key: 'contact3Email', label: 'Contact 3 email', kind: 'email',   contact: 3 },
  { key: 'contact3Phone', label: 'Contact 3 phone', kind: 'phone',   contact: 3, phone: true },
];

function digitsOnly(s: string): string {
  return String(s ?? '').replace(/\D+/g, '');
}

interface FieldMatch {
  score: number;
  field: SearchableField;
  value: string;
}

/** Pick the single best-scoring field for one client record + query. */
function matchScore(
  record: Partial<ClientIndexEntry> & { name: string },
  query: string,
): FieldMatch | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  const qDigits = digitsOnly(q);
  // 3+ consecutive digits ⇒ treat as a phone search and compare digit-only.
  const phoneMode = qDigits.length >= 3;

  let best: FieldMatch | null = null;
  for (const field of SEARCHABLE_FIELDS) {
    const raw = record[field.key];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const value = String(raw);
    const valueLower = value.toLowerCase();

    let score = -1;
    if (field.phone && phoneMode) {
      const vDigits = digitsOnly(valueLower);
      if (qDigits && vDigits.includes(qDigits)) {
        const idx = vDigits.indexOf(qDigits);
        score = (idx === 0 ? 800 : 200) - idx;
      }
    }
    if (score < 0 && valueLower.includes(q)) {
      const idx = valueLower.indexOf(q);
      score = (idx === 0 ? 1000 : 100) - idx;
    }
    if (score < 0) continue;

    if (field.isName) score += 200;
    if (field.contact === 1) score += 40;
    else if (field.contact === 2) score += 20;
    else if (field.contact === 3) score += 10;

    if (!best || score > best.score) best = { score, field, value };
  }
  return best;
}

export interface ClientSearchHit {
  item: OnboardingItem;
  entry: ClientIndexEntry | null;
  score: number;
  matchKind: MatchKind;
  /** The text that actually matched (e.g. the email or store name). */
  matchValue: string;
  contact?: 1 | 2 | 3;
  /** Short chip shown next to the match: 'primary' / 'contact 2' / 'Store' … */
  matchTag: string;
}

/**
 * Rank onboarding items against a query, joining each to its Clients-board
 * search-index entry (when linked) so the search spans name, store / legal /
 * ShipHero names, and every contact's name / email / phone — not just the
 * client name held in memory.
 *
 * Iterates `items` (not the raw index) so every hit maps back to an
 * OnboardingItem the detail panel can open. Items with no linked
 * clientBoardItemId still match on their in-memory name. Deduped by
 * clientBoardItemId so a client with two onboarding rounds shows once.
 */
export function searchClients(
  items: OnboardingItem[],
  index: Record<string, ClientIndexEntry> | null,
  query: string,
  limit = 8,
): ClientSearchHit[] {
  const q = query.trim();
  if (!q) return [];

  const seen = new Set<string>();
  const hits: ClientSearchHit[] = [];

  for (const item of items) {
    const dedupKey = item.clientBoardItemId || item.id;
    if (seen.has(dedupKey)) continue;

    const entry = item.clientBoardItemId ? (index?.[item.clientBoardItemId] ?? null) : null;
    // Match over the full index entry when present (all contacts + business
    // names); always fold in the in-memory name so name search works even
    // before the index has loaded.
    const record: Partial<ClientIndexEntry> & { name: string } = entry
      ? { ...entry, name: item.name || entry.name }
      : { name: item.name };

    const m = matchScore(record, q);
    if (!m) continue;
    seen.add(dedupKey);

    const { field } = m;
    const matchTag = field.isName
      ? ''
      : field.kind === 'company'
        ? field.label
        : field.contact === 1
          ? 'primary'
          : `contact ${field.contact}`;

    hits.push({
      item,
      entry,
      score: m.score,
      matchKind: field.kind,
      matchValue: m.value,
      contact: field.contact,
      matchTag,
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
