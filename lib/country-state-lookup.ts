/**
 * Country and US state code normalization tables for the CSV Order
 * Formatter mini-app.
 *
 * Why a built-in table instead of letting Claude do it:
 *   - The AI only sees a few sample rows, so it misses country values that
 *     appear later in the file.
 *   - Customers requested "England -> UK" specifically, not "England -> GB"
 *     (ISO 3166-1 alpha-2 says GB, but ShipHero/ShipBots convention is UK
 *     here). A deterministic table makes that promise stick.
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

  // United Kingdom — customer preference is UK (not GB)
  'uk': 'UK',
  'gb': 'UK',
  'gbr': 'UK',
  'great britain': 'UK',
  'united kingdom': 'UK',
  'united kingdom of great britain': 'UK',
  'united kingdom of great britain and northern ireland': 'UK',
  'england': 'UK',
  'scotland': 'UK',
  'wales': 'UK',
  'northern ireland': 'UK',

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
export function normalizeCountry(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // If it's already a known 2-letter code, return it uppercased.
  if (/^[a-zA-Z]{2}$/.test(trimmed)) {
    const upper = trimmed.toUpperCase();
    // Map GB → UK to honor the user-stated convention.
    if (upper === 'GB') return 'UK';
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
