/**
 * Address splitter for the CSV Order Formatter mini-app.
 *
 * Some source files put the whole mailing address in ONE cell
 * ("123 Main St, Springfield, IL 62704, USA") or across TWO cells
 * (street in one, "City, ST ZIP, Country" in another). ShipHero needs the
 * pieces broken out into discrete columns — Address, Address 2, City,
 * State / Province, Zip, Country — with US/Canada state as the 2-letter
 * postal code and country as the 2-letter ISO 3166-1 code.
 *
 * This is deterministic (no AI round-trip, no per-row cost) and leans on the
 * same COUNTRY_LOOKUP / US_STATE_LOOKUP / CA_PROVINCE_LOOKUP tables the rest
 * of the formatter uses, so the codes it emits match everything else.
 *
 * It is tuned for the common comma-delimited US/CA layouts and degrades
 * gracefully on anything else: whatever it can't confidently identify is left
 * blank so the reviewer sees the gap in the live preview rather than a wrong
 * guess.
 */

import {
  normalizeCountry,
  normalizeUSState,
  normalizeCAProvince,
  US_STATE_LOOKUP,
  CA_PROVINCE_LOOKUP,
} from './country-state-lookup';

export interface SplitAddress {
  address: string;
  address2: string;
  city: string;
  /** 2-letter code for US states / CA provinces; left as-found otherwise. */
  state: string;
  zip: string;
  /** 2-letter ISO 3166-1 alpha-2 code. */
  country: string;
}

const EMPTY: SplitAddress = { address: '', address2: '', city: '', state: '', zip: '', country: '' };

// US ZIP (5 or ZIP+4) and Canadian postal (A1A 1A1). CA is checked first since
// it's the more specific pattern.
const CA_POSTAL_RE = /\b([A-Za-z]\d[A-Za-z])\s*(\d[A-Za-z]\d)\b/;
const US_ZIP_RE = /\b(\d{5}(?:-\d{4})?)\b/;

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '').trim();

/** True when a token is a US state or CA province code/name (so we don't mistake it for a country). */
function isStateWord(s: string): boolean {
  const k = lower(s);
  return !!(US_STATE_LOOKUP[k] || CA_PROVINCE_LOOKUP[k]);
}

/**
 * Country code for a candidate string, or '' if it isn't clearly a country.
 * A bare 2-letter token that is also a US state / CA province (e.g. "CA",
 * "NY", "ON") is treated as NOT a country here — the positional logic and
 * state inference handle those far more reliably.
 */
function asCountryCode(candidate: string): string {
  const t = candidate.trim();
  if (!t) return '';
  if (/^[A-Za-z]{2}$/.test(t) && isStateWord(t)) return '';
  return normalizeCountry(t);
}

/** Strip a trailing country from a space-delimited tail ("Springfield IL 62704 USA"). */
function stripTrailingCountry(tail: string): { country: string; rest: string } {
  const tokens = tail.trim().split(/\s+/).filter(Boolean);
  // Try the last 1-3 tokens as a country name ("United Arab Emirates").
  for (let take = Math.min(3, tokens.length); take >= 1; take--) {
    const cand = tokens.slice(tokens.length - take).join(' ');
    const cc = asCountryCode(cand);
    if (cc) return { country: cc, rest: tokens.slice(0, tokens.length - take).join(' ') };
  }
  return { country: '', rest: tail };
}

/** Pull the first postal code out of a segment; returns the code and the segment without it. */
function extractZip(seg: string): { zip: string; rest: string } | null {
  const ca = seg.match(CA_POSTAL_RE);
  if (ca) {
    const zip = `${ca[1].toUpperCase()} ${ca[2].toUpperCase()}`;
    return { zip, rest: (seg.slice(0, ca.index) + seg.slice((ca.index ?? 0) + ca[0].length)).trim() };
  }
  const us = seg.match(US_ZIP_RE);
  if (us) {
    return { zip: us[1], rest: (seg.slice(0, us.index) + seg.slice((us.index ?? 0) + us[0].length)).trim() };
  }
  return null;
}

/**
 * Pull a trailing state/province off a tail. Tries the last two tokens then
 * the last one (so "North Carolina" / "British Columbia" match), against US
 * first then CA. Returns the 2-letter code, the remaining text, and which
 * country the match implies.
 */
function extractTrailingState(
  tail: string,
  countryHint: string,
): { code: string; rest: string; country: string } | null {
  const tokens = tail.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const tryOrder = countryHint === 'CA' ? ['CA', 'US'] : ['US', 'CA'];

  for (let take = Math.min(2, tokens.length); take >= 1; take--) {
    const cand = tokens.slice(tokens.length - take).join(' ');
    const rest = tokens.slice(0, tokens.length - take).join(' ');
    // A bare 2-letter token is only a state if it's a real code — avoids
    // eating a street suffix like "St".
    for (const c of tryOrder) {
      const table = c === 'US' ? US_STATE_LOOKUP : CA_PROVINCE_LOOKUP;
      const norm = c === 'US' ? normalizeUSState : normalizeCAProvince;
      const key = lower(cand);
      if (table[key]) {
        return { code: norm(cand), rest, country: c };
      }
    }
  }
  return null;
}

/** Detect a "line 2" style secondary designator (apt/suite/unit/floor). */
function isAddress2(seg: string): boolean {
  return /^\s*(apt\.?|apartment|suite|ste\.?|unit|#|fl\.?|floor|bldg\.?|building|rm\.?|room|po box|p\.o\. box)\b/i.test(
    seg.trim(),
  );
}

/**
 * Loose postal-code shape for non-US/CA codes the strict regexes miss
 * (e.g. UK "SW1A 2AA", generic "1000"). Conservative: ≤2 tokens, ≥2 digits or
 * a letter-then-digit run, and never an apt/suite line.
 */
function looksLikePostal(s: string): boolean {
  const t = s.trim();
  if (t.length < 4 || t.split(/\s+/).length > 2) return false;
  if (isAddress2(t)) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,9}$/.test(t)) return false;
  const digits = (t.match(/\d/g) || []).length;
  return digits >= 2 || /[A-Za-z]\d/.test(t);
}

// High-confidence US street-type suffixes. Kept deliberately tight — words that
// commonly double as city-name components (Grove, View, Point, Harbor, Mill,
// Park, Lake, …) are excluded so "Park Ave Grove City" splits at "Ave", not
// "Grove".
const STREET_TYPES = new Set([
  'st', 'street', 'ave', 'av', 'avenue', 'blvd', 'boulevard', 'dr', 'drive',
  'ln', 'lane', 'rd', 'road', 'way', 'ct', 'court', 'pl', 'place', 'cir',
  'circle', 'ter', 'terr', 'terrace', 'trl', 'trail', 'pkwy', 'parkway', 'hwy',
  'highway', 'sq', 'square', 'plz', 'plaza', 'pike', 'tpke', 'turnpike', 'cres',
  'crescent', 'aly', 'alley', 'expy', 'expressway',
]);
// Secondary-unit designators ("Apt 302", "Unit 100"). "no"/"num"/"fl" are left
// out on purpose — they collide with ordinary words and the "FL" state code.
const UNIT_WORDS = new Set([
  'apt', 'apartment', 'unit', 'ste', 'suite', 'bldg', 'building', 'floor',
  'rm', 'room', 'dept', 'department', 'lot', 'trlr', 'space', 'spc',
]);
const DIRECTIONALS = new Set([
  'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
]);
const bareWord = (t: string) => t.toLowerCase().replace(/[.,#]/g, '');

// A plausible unit value token — "302", "A", "K1", "c", "3026", "#359.". Used so
// "Suite Ave" (designator with no numeric value) isn't mistaken for a unit.
function isUnitValue(t: string): boolean {
  const v = t.replace(/[.,]+$/, '');
  if (!/^#?[A-Za-z0-9-]{1,6}$/.test(v)) return false;
  return /\d/.test(v) || v.replace(/^#/, '').length <= 2;
}

// Split a trailing city off a street line using the last street-type suffix.
// "1302 Aviation Way Lebanon" → { street: "1302 Aviation Way", city: "Lebanon" }.
// When there's no recognizable street type, fall back to the last word as the
// city — but only for a numbered street with ≥2 street tokens left, so
// "804 Guisando de Avila Tampa" splits while "Parkgatan 14" is left alone.
function splitCityOffStreet(tokens: string[]): { street: string; city: string } {
  let typeIdx = -1;
  for (let i = tokens.length - 1; i >= 1; i--) {
    if (STREET_TYPES.has(bareWord(tokens[i]))) { typeIdx = i; break; }
  }
  if (typeIdx !== -1 && typeIdx < tokens.length - 1) {
    let i = typeIdx + 1;
    while (i < tokens.length && DIRECTIONALS.has(bareWord(tokens[i]))) i++; // directional stays with street
    const rest = tokens.slice(i);
    if (rest.length && !rest.every(t => DIRECTIONALS.has(bareWord(t)))) {
      return { street: tokens.slice(0, i).join(' '), city: rest.join(' ') };
    }
    return { street: tokens.join(' '), city: '' };
  }
  if (/^\d/.test(tokens[0]) && tokens.length >= 3) {
    const last = tokens[tokens.length - 1];
    const lw = bareWord(last);
    // The last word is only a plausible city if it isn't a street-type suffix
    // ("500 Main St" must not read "St" as the city), a directional, a number,
    // or a 1-2 char token.
    if (!DIRECTIONALS.has(lw) && !STREET_TYPES.has(lw) && !/\d/.test(last) && last.length >= 3) {
      return { street: tokens.slice(0, -1).join(' '), city: last };
    }
  }
  return { street: tokens.join(' '), city: '' };
}

/**
 * Split a glued street line into { street, address2, city }. Pulls a secondary
 * unit into Address 2 ("1445 BROADCLOTH ST Apt 302 Fort Mill" → street
 * "1445 BROADCLOTH ST", address2 "Apt 302", city "Fort Mill"), then recovers a
 * trailing city off the street type. Leaves pieces blank rather than guessing
 * wrong so a bad split never corrupts the address.
 */
export function splitStreetLine(line: string): { street: string; address2: string; city: string } {
  const s = (line ?? '').trim();
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return { street: s, address2: '', city: '' };

  // 1. A glued secondary unit anywhere after the house number.
  for (let i = 1; i < tokens.length; i++) {
    const raw = tokens[i];
    let end = -1;
    if (raw.startsWith('#') && raw.length > 1) {
      end = i + 1; // "#359." carries its own number
    } else if (UNIT_WORDS.has(bareWord(raw))) {
      const next = tokens[i + 1];
      if (next && (isUnitValue(next) || next.startsWith('#'))) end = i + 2;
    }
    if (end !== -1) {
      const address2 = tokens.slice(i, end).join(' ');
      const rest = tokens.slice(end);
      const city = rest.length && !rest.every(t => DIRECTIONALS.has(bareWord(t))) ? rest.join(' ') : '';
      return { street: tokens.slice(0, i).join(' '), address2, city };
    }
  }

  // 2. No unit — just split a trailing city off the street type.
  const sc = splitCityOffStreet(tokens);
  return { street: sc.street, address2: '', city: sc.city };
}

// Strip a leading unit off a city value ("unit 4414 Marina Del Rey" →
// { address2: "unit 4414", city: "Marina Del Rey" }) — some sources glue the
// suite onto the city instead of the street.
function stripLeadingUnit(text: string): { address2: string; city: string } {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return { address2: '', city: text.trim() };
  if (tokens[0].startsWith('#') && tokens[0].length > 1) {
    return { address2: tokens[0], city: tokens.slice(1).join(' ') };
  }
  if (UNIT_WORDS.has(bareWord(tokens[0])) && (isUnitValue(tokens[1]) || tokens[1].startsWith('#'))) {
    return { address2: tokens.slice(0, 2).join(' '), city: tokens.slice(2).join(' ') };
  }
  return { address2: '', city: text.trim() };
}

/**
 * Split a combined mailing address into its ShipHero pieces. Accepts a single
 * string or an array of cell values (joined in order). State/country come back
 * as 2-letter codes where recognized.
 */
export function splitAddress(input: string | Array<string | null | undefined>): SplitAddress {
  const raw = (Array.isArray(input) ? input.map(v => String(v ?? '').trim()).filter(Boolean).join(', ') : input)
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return { ...EMPTY };

  const segs = raw.split(',').map(s => s.trim()).filter(Boolean);

  // No commas → best-effort right-to-left on whitespace. We can usually get
  // country/state/zip; city is ambiguous without a delimiter, so leave it.
  if (segs.length <= 1) {
    let tail = raw;
    const c = stripTrailingCountry(tail);
    let country = c.country; tail = c.rest;
    const z = extractZip(tail);
    let zip = ''; if (z) { zip = z.zip; tail = z.rest; }
    const st = extractTrailingState(tail, country);
    let state = ''; if (st) { state = st.code; tail = st.rest.trim(); if (!country) country = st.country; }
    // Street / unit / city are space-glued here ("1445 BROADCLOTH ST Apt 302
    // Fort Mill") — pull the unit into Address 2 and the trailing city off the
    // street type.
    const line = splitStreetLine(tail.trim());
    return finalize({ address: line.street, address2: line.address2, city: line.city, state, zip, country });
  }

  let country = '';
  let state = '';
  let zip = '';
  let city = '';

  // 1. Trailing country segment (keep at least street + one more segment).
  if (segs.length > 2) {
    const cc = asCountryCode(segs[segs.length - 1]);
    if (cc) { country = cc; segs.pop(); }
  }

  // 2. The now-last segment carries state/zip (and sometimes the city too):
  //    "IL 62704" | "IL" | "62704" | "Springfield IL 62704" | "IL 62704 USA".
  if (segs.length > 1) {
    let tail = segs[segs.length - 1];
    if (!country) { const c = stripTrailingCountry(tail); if (c.country) { country = c.country; tail = c.rest; } }
    const z = extractZip(tail); if (z) { zip = z.zip; tail = z.rest; }
    const st = extractTrailingState(tail, country);
    if (st) { state = st.code; tail = st.rest.trim(); if (!country) country = st.country; }
    if (!zip && looksLikePostal(tail)) { zip = tail.toUpperCase(); tail = ''; }
    tail = tail.trim();
    segs.pop();
    if (tail) city = tail; // leftover in this segment is the city
  }

  // 2b. State and/or zip can each sit in their OWN comma segment, e.g.
  //     "123 Main St, Springfield, IL, 62704". Pull a lone trailing
  //     state segment, then a lone trailing postal segment.
  if (!state && segs.length > 1) {
    const st = extractTrailingState(segs[segs.length - 1], country);
    if (st && st.rest.trim() === '') { state = st.code; segs.pop(); if (!country) country = st.country; }
  }
  if (!zip && segs.length > 1 && looksLikePostal(segs[segs.length - 1])) {
    zip = (segs.pop() as string).toUpperCase();
  }

  // 3. If we still don't have a city, the next trailing segment is it (but
  //    always keep at least one segment for the street).
  if (!city && segs.length > 1) city = segs.pop() as string;

  // 4. Whatever's left is the street; detect an apt/suite "line 2".
  let address2 = '';
  const streetSegs = segs.slice();
  if (streetSegs.length > 1 && isAddress2(streetSegs[streetSegs.length - 1])) {
    address2 = streetSegs.pop() as string;
  } else if (streetSegs.length > 1 && isAddress2(streetSegs[1])) {
    address2 = streetSegs.splice(1, 1)[0];
  }
  let address = streetSegs.join(', ');

  // 4b. Pull a glued secondary unit and/or a trailing city off the street line
  //     when a comma didn't separate them ("1445 BROADCLOTH ST Apt 302 Fort
  //     Mill" → street "1445 BROADCLOTH ST" + Address 2 "Apt 302" + "Fort Mill").
  if (address && !address.includes(',')) {
    const line = splitStreetLine(address);
    // Only accept the shortened street when the split actually produced a piece
    // we use — never drop part of the street (a trailing "Way"/"Court") when the
    // city / unit are already known.
    let changed = false;
    if (!address2 && line.address2) { address2 = line.address2; changed = true; }
    if (!city && line.city) { city = line.city; changed = true; }
    if (changed) address = line.street;
  }

  // 4c. A comma-provided city can itself carry a leading unit
  //     ("unit 4414 Marina Del Rey" → Address 2 "unit 4414" + "Marina Del Rey").
  if (city && !address2) {
    const lu = stripLeadingUnit(city);
    if (lu.address2) { address2 = lu.address2; city = lu.city; }
  }

  return finalize({ address, address2, city, state, zip, country });
}

/** Infer country from a known state, then normalize both to their codes. */
function finalize(p: SplitAddress): SplitAddress {
  let { state, country } = p;
  if (!country && state) {
    if (US_STATE_LOOKUP[lower(state)]) country = 'US';
    else if (CA_PROVINCE_LOOKUP[lower(state)]) country = 'CA';
  }
  country = normalizeCountry(country) || country.toUpperCase();
  if (country === 'US') state = normalizeUSState(state);
  else if (country === 'CA') state = normalizeCAProvince(state);
  return { ...p, state, country };
}

/**
 * Decide whether a column's values are combined addresses (whole address in
 * one cell) rather than a plain street line. Samples the values and counts how
 * many parse out to a recognizable state, zip, or country beyond the street —
 * combined when a clear majority do.
 */
export function looksLikeCombinedAddress(values: Array<string | null | undefined>): boolean {
  const samples = values
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .slice(0, 25);
  if (samples.length < 2) return false;

  let hits = 0;
  for (const v of samples) {
    // Needs a delimiter (comma or several words) AND a resolvable component.
    const p = splitAddress(v);
    const componentsFound = [p.city, p.state, p.zip, p.country].filter(Boolean).length;
    if (v.includes(',') && componentsFound >= 2) hits++;
  }
  return hits / samples.length >= 0.6;
}
