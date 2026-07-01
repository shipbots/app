/**
 * Country and US state code normalization tables for the CSV Order
 * Formatter mini-app.
 *
 * Why a built-in table instead of letting Claude do it:
 *   - The AI only sees a few sample rows, so it misses country values that
 *     appear later in the file.
 *   - Strict ISO 3166-1 alpha-2 codes are required by ShipHero, so e.g.
 *     "England" → "GB" (not "UK"). A deterministic table makes that
 *     promise stick across uploads.
 *
 * Coverage notes:
 *   - All 50 US states + DC + the most common territories.
 *   - The country table is not exhaustive (~100 entries) but covers the
 *     destinations we see in practice. Unknown values fall back to the
 *     AI's suggestion, then to empty.
 */

// ── Country: variant name (lowercase) → 2-letter code ──────────────────────
// Keys are lowercased + whitespace-trimmed; punctuation is preserved for a
// few "U.S.A." style variants we want to catch exactly.
export const COUNTRY_LOOKUP: Record<string, string> = {
  // North America
  'us': 'US',
  'usa': 'US',
  'u.s.': 'US',
  'u.s.a.': 'US',
  'united states': 'US',
  'united states of america': 'US',
  'america': 'US',
  'estados unidos': 'US',

  'ca': 'CA',
  'can': 'CA',
  'canada': 'CA',

  'mx': 'MX',
  'mex': 'MX',
  'mexico': 'MX',
  'méxico': 'MX',
  'estados unidos mexicanos': 'MX',

  // United Kingdom — strict ISO 3166-1 alpha-2 (GB, not UK)
  'gb': 'GB',
  'gbr': 'GB',
  'uk': 'GB',
  'great britain': 'GB',
  'united kingdom': 'GB',
  'united kingdom of great britain': 'GB',
  'united kingdom of great britain and northern ireland': 'GB',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB',

  // Ireland
  'ie': 'IE',
  'ireland': 'IE',
  'republic of ireland': 'IE',

  // Western Europe
  'de': 'DE', 'germany': 'DE', 'deutschland': 'DE', 'federal republic of germany': 'DE',
  'fr': 'FR', 'france': 'FR', 'french republic': 'FR',
  'it': 'IT', 'italy': 'IT', 'italia': 'IT', 'italian republic': 'IT',
  'es': 'ES', 'spain': 'ES', 'españa': 'ES', 'kingdom of spain': 'ES',
  'pt': 'PT', 'portugal': 'PT',
  'nl': 'NL', 'netherlands': 'NL', 'the netherlands': 'NL', 'holland': 'NL',
  'be': 'BE', 'belgium': 'BE',
  'at': 'AT', 'austria': 'AT',
  'ch': 'CH', 'switzerland': 'CH',
  'lu': 'LU', 'luxembourg': 'LU',
  'mc': 'MC', 'monaco': 'MC',
  'li': 'LI', 'liechtenstein': 'LI',
  'sm': 'SM', 'san marino': 'SM',
  'va': 'VA', 'vatican': 'VA', 'vatican city': 'VA', 'holy see': 'VA',

  // Nordics
  'se': 'SE', 'sweden': 'SE',
  'no': 'NO', 'norway': 'NO',
  'dk': 'DK', 'denmark': 'DK',
  'fi': 'FI', 'finland': 'FI',
  'is': 'IS', 'iceland': 'IS',

  // Central / Eastern Europe
  'pl': 'PL', 'poland': 'PL',
  'cz': 'CZ', 'czech republic': 'CZ', 'czechia': 'CZ',
  'sk': 'SK', 'slovakia': 'SK',
  'hu': 'HU', 'hungary': 'HU',
  'ro': 'RO', 'romania': 'RO',
  'bg': 'BG', 'bulgaria': 'BG',
  'si': 'SI', 'slovenia': 'SI',
  'hr': 'HR', 'croatia': 'HR',
  'rs': 'RS', 'serbia': 'RS',
  'ba': 'BA', 'bosnia': 'BA', 'bosnia and herzegovina': 'BA',
  'mk': 'MK', 'north macedonia': 'MK', 'macedonia': 'MK',
  'al': 'AL', 'albania': 'AL',
  'me': 'ME', 'montenegro': 'ME',
  'gr': 'GR', 'greece': 'GR',
  'tr': 'TR', 'turkey': 'TR', 'türkiye': 'TR',

  // Baltics
  'ee': 'EE', 'estonia': 'EE',
  'lv': 'LV', 'latvia': 'LV',
  'lt': 'LT', 'lithuania': 'LT',

  // Russia / CIS
  'ru': 'RU', 'russia': 'RU', 'russian federation': 'RU',
  'ua': 'UA', 'ukraine': 'UA',
  'by': 'BY', 'belarus': 'BY',
  'md': 'MD', 'moldova': 'MD',
  'kz': 'KZ', 'kazakhstan': 'KZ',

  // Middle East
  'il': 'IL', 'israel': 'IL',
  'ae': 'AE', 'uae': 'AE', 'united arab emirates': 'AE',
  'sa': 'SA', 'saudi arabia': 'SA',
  'qa': 'QA', 'qatar': 'QA',
  'kw': 'KW', 'kuwait': 'KW',
  'bh': 'BH', 'bahrain': 'BH',
  'om': 'OM', 'oman': 'OM',
  'jo': 'JO', 'jordan': 'JO',
  'lb': 'LB', 'lebanon': 'LB',
  'eg': 'EG', 'egypt': 'EG',

  // Asia
  'in': 'IN', 'india': 'IN',
  'cn': 'CN', 'china': 'CN', "people's republic of china": 'CN',
  'jp': 'JP', 'japan': 'JP',
  'kr': 'KR', 'south korea': 'KR', 'korea': 'KR', 'republic of korea': 'KR',
  'kp': 'KP', 'north korea': 'KP',
  'tw': 'TW', 'taiwan': 'TW',
  'hk': 'HK', 'hong kong': 'HK',
  'mo': 'MO', 'macao': 'MO', 'macau': 'MO',
  'sg': 'SG', 'singapore': 'SG',
  'th': 'TH', 'thailand': 'TH',
  'vn': 'VN', 'vietnam': 'VN', 'viet nam': 'VN',
  'id': 'ID', 'indonesia': 'ID',
  'ph': 'PH', 'philippines': 'PH',
  'my': 'MY', 'malaysia': 'MY',
  'kh': 'KH', 'cambodia': 'KH',
  'la': 'LA', 'laos': 'LA',
  'mm': 'MM', 'myanmar': 'MM', 'burma': 'MM',
  'np': 'NP', 'nepal': 'NP',
  'lk': 'LK', 'sri lanka': 'LK',
  'pk': 'PK', 'pakistan': 'PK',
  'bd': 'BD', 'bangladesh': 'BD',

  // Oceania
  'au': 'AU', 'australia': 'AU',
  'nz': 'NZ', 'new zealand': 'NZ',
  'fj': 'FJ', 'fiji': 'FJ',

  // Latin America
  'br': 'BR', 'brazil': 'BR', 'brasil': 'BR',
  'ar': 'AR', 'argentina': 'AR',
  'cl': 'CL', 'chile': 'CL',
  'co': 'CO', 'colombia': 'CO',
  'pe': 'PE', 'peru': 'PE', 'perú': 'PE',
  've': 'VE', 'venezuela': 'VE',
  'ec': 'EC', 'ecuador': 'EC',
  'bo': 'BO', 'bolivia': 'BO',
  'py': 'PY', 'paraguay': 'PY',
  'uy': 'UY', 'uruguay': 'UY',
  'cr': 'CR', 'costa rica': 'CR',
  'pa': 'PA', 'panama': 'PA',
  'gt': 'GT', 'guatemala': 'GT',
  'hn': 'HN', 'honduras': 'HN',
  'sv': 'SV', 'el salvador': 'SV',
  'ni': 'NI', 'nicaragua': 'NI',
  'do': 'DO', 'dominican republic': 'DO',
  'pr': 'PR', 'puerto rico': 'PR',
  'cu': 'CU', 'cuba': 'CU',
  'jm': 'JM', 'jamaica': 'JM',
  'ht': 'HT', 'haiti': 'HT',
  'tt': 'TT', 'trinidad and tobago': 'TT',
  'bs': 'BS', 'bahamas': 'BS',
  'bb': 'BB', 'barbados': 'BB',

  // Africa
  'za': 'ZA', 'south africa': 'ZA',
  'ng': 'NG', 'nigeria': 'NG',
  'ke': 'KE', 'kenya': 'KE',
  'ma': 'MA', 'morocco': 'MA',
  'dz': 'DZ', 'algeria': 'DZ',
  'tn': 'TN', 'tunisia': 'TN',
  'gh': 'GH', 'ghana': 'GH',
  'et': 'ET', 'ethiopia': 'ET',
  'tz': 'TZ', 'tanzania': 'TZ',
  'ug': 'UG', 'uganda': 'UG',
  'rw': 'RW', 'rwanda': 'RW',
  'sn': 'SN', 'senegal': 'SN',
  'ci': 'CI', 'ivory coast': 'CI', 'cote d\'ivoire': 'CI', "côte d'ivoire": 'CI',

  // Other
  'cy': 'CY', 'cyprus': 'CY',
  'mt': 'MT', 'malta': 'MT',
  'am': 'AM', 'armenia': 'AM',
  'ge': 'GE', 'georgia (country)': 'GE',
};

/**
 * Normalize a free-form country value to a 2-letter code.
 * Returns the matched code or '' if no match (so callers can decide how
 * to handle the gap — usually surface for manual edit in the UI).
 */
/**
 * True when the value looks like a country name / code — used by the
 * CSV Order Formatter's pre-flight check to catch state cells that
 * accidentally hold the country ("Canada" ending up in the State field
 * of CA-country rows is a real ShipHero rejection). Uses the same
 * COUNTRY_LOOKUP as normalizeCountry so anything the country normalizer
 * would recognize counts as a country here too.
 */
export function isCountryValue(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Two-letter ISO code is always ambiguous ("CA" is Canada but also
  // California). Don't flag 2-letter values as country-like.
  if (/^[a-zA-Z]{2,3}$/.test(trimmed)) return false;
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  if (COUNTRY_LOOKUP[key]) return true;
  const raw = trimmed.toLowerCase();
  return !!COUNTRY_LOOKUP[raw];
}

export function normalizeCountry(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // If it's already a 2-letter code, return it uppercased. UK → GB is
  // routed through the lookup below so "UK" normalizes to the strict
  // ISO 3166-1 alpha-2 code (GB).
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    if (upper === 'UK') return 'GB';
    return upper;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  return COUNTRY_LOOKUP[key] ?? '';
}

// ── US states + DC + territories: variant (lowercase) → 2-letter code ──────
export const US_STATE_LOOKUP: Record<string, string> = {
  // 50 states
  'alabama': 'AL', 'al': 'AL',
  'alaska': 'AK', 'ak': 'AK',
  'arizona': 'AZ', 'az': 'AZ',
  'arkansas': 'AR', 'ar': 'AR',
  'california': 'CA', 'ca': 'CA', 'calif': 'CA',
  'colorado': 'CO', 'co': 'CO',
  'connecticut': 'CT', 'ct': 'CT', 'conn': 'CT',
  'delaware': 'DE', 'de': 'DE',
  'florida': 'FL', 'fl': 'FL', 'fla': 'FL',
  'georgia': 'GA', 'ga': 'GA',
  'hawaii': 'HI', 'hi': 'HI',
  'idaho': 'ID', 'id': 'ID',
  'illinois': 'IL', 'il': 'IL', 'ill': 'IL',
  'indiana': 'IN', 'in': 'IN', 'ind': 'IN',
  'iowa': 'IA', 'ia': 'IA',
  'kansas': 'KS', 'ks': 'KS', 'kan': 'KS', 'kans': 'KS',
  'kentucky': 'KY', 'ky': 'KY',
  'louisiana': 'LA', 'la': 'LA',
  'maine': 'ME', 'me': 'ME',
  'maryland': 'MD', 'md': 'MD',
  'massachusetts': 'MA', 'ma': 'MA', 'mass': 'MA',
  'michigan': 'MI', 'mi': 'MI', 'mich': 'MI',
  'minnesota': 'MN', 'mn': 'MN', 'minn': 'MN',
  'mississippi': 'MS', 'ms': 'MS', 'miss': 'MS',
  'missouri': 'MO', 'mo': 'MO',
  'montana': 'MT', 'mt': 'MT', 'mont': 'MT',
  'nebraska': 'NE', 'ne': 'NE', 'neb': 'NE', 'nebr': 'NE',
  'nevada': 'NV', 'nv': 'NV', 'nev': 'NV',
  'new hampshire': 'NH', 'nh': 'NH',
  'new jersey': 'NJ', 'nj': 'NJ',
  'new mexico': 'NM', 'nm': 'NM',
  'new york': 'NY', 'ny': 'NY',
  'north carolina': 'NC', 'nc': 'NC',
  'north dakota': 'ND', 'nd': 'ND',
  'ohio': 'OH', 'oh': 'OH',
  'oklahoma': 'OK', 'ok': 'OK', 'okla': 'OK',
  'oregon': 'OR', 'or': 'OR', 'ore': 'OR', 'oreg': 'OR',
  'pennsylvania': 'PA', 'pa': 'PA', 'penn': 'PA',
  'rhode island': 'RI', 'ri': 'RI',
  'south carolina': 'SC', 'sc': 'SC',
  'south dakota': 'SD', 'sd': 'SD',
  'tennessee': 'TN', 'tn': 'TN', 'tenn': 'TN',
  'texas': 'TX', 'tx': 'TX', 'tex': 'TX',
  'utah': 'UT', 'ut': 'UT',
  'vermont': 'VT', 'vt': 'VT',
  'virginia': 'VA', 'va': 'VA',
  'washington': 'WA', 'wa': 'WA', 'wash': 'WA',
  'west virginia': 'WV', 'wv': 'WV',
  'wisconsin': 'WI', 'wi': 'WI', 'wisc': 'WI',
  'wyoming': 'WY', 'wy': 'WY', 'wyo': 'WY',

  // Federal district
  'district of columbia': 'DC', 'dc': 'DC', 'd.c.': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC',

  // Territories
  'puerto rico': 'PR', 'pr': 'PR',
  'virgin islands': 'VI', 'vi': 'VI', 'us virgin islands': 'VI', 'u.s. virgin islands': 'VI',
  'guam': 'GU', 'gu': 'GU',
  'american samoa': 'AS', 'as': 'AS',
  'northern mariana islands': 'MP', 'mp': 'MP',
};

/**
 * Normalize a US state value to its 2-letter postal code. If the input
 * doesn't look like a known US state/territory, the original value is
 * returned unchanged so callers don't accidentally clobber data for
 * non-US addresses.
 */
export function normalizeUSState(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return US_STATE_LOOKUP[upper.toLowerCase()] ? upper : trimmed;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  return US_STATE_LOOKUP[key] ?? US_STATE_LOOKUP[trimmed.toLowerCase()] ?? trimmed;
}

// ── Fuzzy state-name matcher ───────────────────────────────────────────────
// Catches typos like "Flordia" → "Florida", "Texs" → "Texas". Uses
// Levenshtein distance with a length-aware threshold so short codes
// don't get over-matched.

// Canonical full state/territory names — the targets we suggest against.
// Kept separate from US_STATE_LOOKUP to avoid noise from 2-letter codes.
const US_STATE_FULL_NAMES: Array<{ name: string; code: string }> = [
  { name: 'Alabama', code: 'AL' },
  { name: 'Alaska', code: 'AK' },
  { name: 'Arizona', code: 'AZ' },
  { name: 'Arkansas', code: 'AR' },
  { name: 'California', code: 'CA' },
  { name: 'Colorado', code: 'CO' },
  { name: 'Connecticut', code: 'CT' },
  { name: 'Delaware', code: 'DE' },
  { name: 'Florida', code: 'FL' },
  { name: 'Georgia', code: 'GA' },
  { name: 'Hawaii', code: 'HI' },
  { name: 'Idaho', code: 'ID' },
  { name: 'Illinois', code: 'IL' },
  { name: 'Indiana', code: 'IN' },
  { name: 'Iowa', code: 'IA' },
  { name: 'Kansas', code: 'KS' },
  { name: 'Kentucky', code: 'KY' },
  { name: 'Louisiana', code: 'LA' },
  { name: 'Maine', code: 'ME' },
  { name: 'Maryland', code: 'MD' },
  { name: 'Massachusetts', code: 'MA' },
  { name: 'Michigan', code: 'MI' },
  { name: 'Minnesota', code: 'MN' },
  { name: 'Mississippi', code: 'MS' },
  { name: 'Missouri', code: 'MO' },
  { name: 'Montana', code: 'MT' },
  { name: 'Nebraska', code: 'NE' },
  { name: 'Nevada', code: 'NV' },
  { name: 'New Hampshire', code: 'NH' },
  { name: 'New Jersey', code: 'NJ' },
  { name: 'New Mexico', code: 'NM' },
  { name: 'New York', code: 'NY' },
  { name: 'North Carolina', code: 'NC' },
  { name: 'North Dakota', code: 'ND' },
  { name: 'Ohio', code: 'OH' },
  { name: 'Oklahoma', code: 'OK' },
  { name: 'Oregon', code: 'OR' },
  { name: 'Pennsylvania', code: 'PA' },
  { name: 'Rhode Island', code: 'RI' },
  { name: 'South Carolina', code: 'SC' },
  { name: 'South Dakota', code: 'SD' },
  { name: 'Tennessee', code: 'TN' },
  { name: 'Texas', code: 'TX' },
  { name: 'Utah', code: 'UT' },
  { name: 'Vermont', code: 'VT' },
  { name: 'Virginia', code: 'VA' },
  { name: 'Washington', code: 'WA' },
  { name: 'West Virginia', code: 'WV' },
  { name: 'Wisconsin', code: 'WI' },
  { name: 'Wyoming', code: 'WY' },
  { name: 'District of Columbia', code: 'DC' },
  { name: 'Puerto Rico', code: 'PR' },
];

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length, n = b.length;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
        ? prev
        : 1 + Math.min(prev, dp[j - 1], dp[j]);
      prev = tmp;
    }
  }
  return dp[n];
}

export type StateSuggestion =
  | { type: 'exact'; code: string }
  | { type: 'suggestion'; code: string; suggestion: string; distance: number }
  | null;

/**
 * Best-guess US state correction for a free-text value.
 *
 * - `exact`: value already maps cleanly via US_STATE_LOOKUP (or is a
 *   valid 2-letter code).
 * - `suggestion`: value is close to a known full state name and is most
 *   likely a typo. distance === 1 should be auto-applied silently;
 *   distance >= 2 should be surfaced for user confirmation.
 * - `null`: nothing close enough; the value is probably not a US state
 *   (or is too garbled to guess at).
 */
export function suggestUSState(value: string): StateSuggestion {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Exact (already-known) match short-circuits — no suggestion needed.
  const normalKey = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  if (US_STATE_LOOKUP[normalKey]) {
    return { type: 'exact', code: US_STATE_LOOKUP[normalKey] };
  }
  if (US_STATE_LOOKUP[trimmed.toLowerCase()]) {
    return { type: 'exact', code: US_STATE_LOOKUP[trimmed.toLowerCase()] };
  }

  // Don't fuzz short inputs — too easy to mistake one 2-letter code for
  // another (e.g. "NA" → "VA" would be wrong far more often than right).
  if (normalKey.length < 4) return null;

  let best: { name: string; code: string; distance: number } | null = null;
  for (const { name, code } of US_STATE_FULL_NAMES) {
    const dist = levenshtein(normalKey, name.toLowerCase());
    if (best === null || dist < best.distance) {
      best = { name, code, distance: dist };
    }
  }
  if (!best) return null;

  // Length-aware threshold: short names allow 1 typo, medium 2, long 3.
  // Caps at 3 so "Disneyland" never silently becomes a state.
  const threshold = Math.min(3, Math.max(1, Math.floor(normalKey.length / 4)));
  if (best.distance > 0 && best.distance <= threshold) {
    return {
      type: 'suggestion',
      code: best.code,
      suggestion: best.name,
      distance: best.distance,
    };
  }
  return null;
}

// ── Canadian provinces & territories ───────────────────────────────────────
// Same shape as the US tables. ShipHero rejects free-text values like
// "British Colombia" or "Toronto, Ontario" for CA addresses, so we
// normalize and spell-check these too.

export const CA_PROVINCE_LOOKUP: Record<string, string> = {
  'alberta': 'AB', 'ab': 'AB',
  'british columbia': 'BC', 'bc': 'BC',
  'manitoba': 'MB', 'mb': 'MB',
  'new brunswick': 'NB', 'nb': 'NB',
  'newfoundland': 'NL', 'newfoundland and labrador': 'NL', 'nl': 'NL', 'nf': 'NL',
  'nova scotia': 'NS', 'ns': 'NS',
  'northwest territories': 'NT', 'nt': 'NT',
  'nunavut': 'NU', 'nu': 'NU',
  'ontario': 'ON', 'on': 'ON',
  'prince edward island': 'PE', 'pe': 'PE', 'pei': 'PE',
  'quebec': 'QC', 'québec': 'QC', 'qc': 'QC', 'pq': 'QC',
  'saskatchewan': 'SK', 'sk': 'SK',
  'yukon': 'YT', 'yt': 'YT', 'yukon territory': 'YT',
};

const CA_PROVINCE_FULL_NAMES: Array<{ name: string; code: string }> = [
  { name: 'Alberta', code: 'AB' },
  { name: 'British Columbia', code: 'BC' },
  { name: 'Manitoba', code: 'MB' },
  { name: 'New Brunswick', code: 'NB' },
  { name: 'Newfoundland and Labrador', code: 'NL' },
  { name: 'Nova Scotia', code: 'NS' },
  { name: 'Northwest Territories', code: 'NT' },
  { name: 'Nunavut', code: 'NU' },
  { name: 'Ontario', code: 'ON' },
  { name: 'Prince Edward Island', code: 'PE' },
  { name: 'Quebec', code: 'QC' },
  { name: 'Saskatchewan', code: 'SK' },
  { name: 'Yukon', code: 'YT' },
];

export function normalizeCAProvince(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    return CA_PROVINCE_LOOKUP[upper.toLowerCase()] ? upper : trimmed;
  }
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  return CA_PROVINCE_LOOKUP[key] ?? CA_PROVINCE_LOOKUP[trimmed.toLowerCase()] ?? trimmed;
}

export function suggestCAProvince(value: string): StateSuggestion {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalKey = trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '');
  if (CA_PROVINCE_LOOKUP[normalKey]) {
    return { type: 'exact', code: CA_PROVINCE_LOOKUP[normalKey] };
  }
  if (CA_PROVINCE_LOOKUP[trimmed.toLowerCase()]) {
    return { type: 'exact', code: CA_PROVINCE_LOOKUP[trimmed.toLowerCase()] };
  }
  if (normalKey.length < 4) return null;

  let best: { name: string; code: string; distance: number } | null = null;
  for (const { name, code } of CA_PROVINCE_FULL_NAMES) {
    const dist = levenshtein(normalKey, name.toLowerCase());
    if (best === null || dist < best.distance) {
      best = { name, code, distance: dist };
    }
  }
  if (!best) return null;
  const threshold = Math.min(3, Math.max(1, Math.floor(normalKey.length / 4)));
  if (best.distance > 0 && best.distance <= threshold) {
    return {
      type: 'suggestion',
      code: best.code,
      suggestion: best.name,
      distance: best.distance,
    };
  }
  return null;
}

// ── Country dispatcher + comma-extraction ──────────────────────────────────
// One entry point the formatter calls per (state, country) pair. Handles:
//   - Bare lookups (Ontario → ON)
//   - Typo correction (Pennslyvania → Pennsylvania → PA, British Colombia
//     → British Columbia → BC)
//   - "City, State" collapsed cells: tries the last comma-segment first,
//     then the original. So "Toronto, Ontario" / CA → "Ontario" → ON.

export type StateMatchOutcome =
  | { type: 'exact'; code: string; from: string }
  | { type: 'suggestion'; code: string; suggestion: string; distance: number; from: string; reason: 'typo' | 'extracted' }
  | { type: 'unknown'; reason: 'no-match' | 'unsupported-country' };

function suggestForCountry(value: string, country: string): StateSuggestion {
  switch (country.toUpperCase()) {
    case 'US': return suggestUSState(value);
    case 'CA': return suggestCAProvince(value);
    default: return null;
  }
}

/**
 * High-level helper used by the CSV Order Formatter. Returns enough info
 * for the UI to show a confirmation badge ("typo" vs "extracted from
 * 'Toronto, Ontario'") and for the generator to plug the right value in.
 */
export function detectStateMatch(value: string, country: string): StateMatchOutcome {
  const upperCountry = (country || '').toUpperCase();
  if (upperCountry !== 'US' && upperCountry !== 'CA') {
    return { type: 'unknown', reason: 'unsupported-country' };
  }
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { type: 'unknown', reason: 'no-match' };

  // 1) Direct attempt on the whole cell.
  const direct = suggestForCountry(trimmed, upperCountry);
  if (direct && direct.type === 'exact') {
    return { type: 'exact', code: direct.code, from: trimmed };
  }

  // 2) Comma-split. The state name is usually the LAST segment in a
  // "City, State" or "City, State, Country" layout. Try last → first.
  if (trimmed.includes(',')) {
    const segments = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      const segMatch = suggestForCountry(seg, upperCountry);
      if (segMatch && segMatch.type === 'exact') {
        return { type: 'suggestion', code: segMatch.code, suggestion: seg, distance: 0, from: trimmed, reason: 'extracted' };
      }
      if (segMatch && segMatch.type === 'suggestion') {
        return {
          type: 'suggestion',
          code: segMatch.code,
          suggestion: segMatch.suggestion,
          distance: segMatch.distance,
          from: trimmed,
          reason: 'extracted',
        };
      }
    }
  }

  // 3) Fuzzy match on the original (typo case).
  if (direct && direct.type === 'suggestion') {
    return {
      type: 'suggestion',
      code: direct.code,
      suggestion: direct.suggestion,
      distance: direct.distance,
      from: trimmed,
      reason: 'typo',
    };
  }

  return { type: 'unknown', reason: 'no-match' };
}
