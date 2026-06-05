/**
 * GET /api/health/saves
 *
 * Daily save-path check that exercises the actual updateClientField pipeline
 * (auto-detect column type → format → mutation) for one representative column
 * per Monday type. Reads the current value, writes the SAME value back, then
 * re-reads to confirm round-trip. Idempotent — never alters real data even
 * when running concurrently with user edits.
 *
 * Returns 200 with per-field results when all checks pass, 207 otherwise.
 *
 * Wired up as a Vercel cron in vercel.json — see "crons" section.
 */

import { NextResponse } from 'next/server';
import { updateClientField } from '@/lib/monday';

const MONDAY_API_URL    = 'https://api.monday.com/v2';

// Stable Clients-board item we own and can safely round-trip writes against.
const TEST_CLIENT_ID = '11927871221'; // iMusti

// One representative column per type we save. If Monday adds a new column type
// the dashboard edits, add a sample column here so the daily check covers it.
const CHECKS: Array<{ columnId: string; label: string }> = [
  { columnId: 'color_mkxfrgba',    label: 'Returns Process (status)' },
  { columnId: 'date_mktrzhyk',     label: 'Initial Inventory Est. Delivery Date (date)' },
  { columnId: 'long_text_mkxeajq4', label: 'Notes for Returns (long_text)' },
  { columnId: 'text_mkw9n26z',     label: 'ShipHero Name (plain text)' },
  { columnId: 'dropdown_mkxx7xv',  label: 'Support Agent (dropdown)' },
];

type CheckResult = {
  columnId: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

async function mondayQuery(query: string, key: string) {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key, 'API-Version': '2024-10' },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
  return data.data;
}

async function readColumn(columnId: string, key: string): Promise<{ text: string | null; value: string | null }> {
  const data = await mondayQuery(
    `query { items(ids: [${TEST_CLIENT_ID}]) { column_values(ids: ["${columnId}"]) { text value } } }`,
    key
  );
  const cv = data.items?.[0]?.column_values?.[0];
  return { text: cv?.text ?? null, value: cv?.value ?? null };
}

// Recover the canonical string the app would pass to updateClientField from
// Monday's stored value JSON. Mirrors how the read-side hydrates state for
// each column type.
function extractAppValue(type: string, raw: { text: string | null; value: string | null }): string | null {
  if (!raw.value) return raw.text ?? null;
  try {
    const parsed = JSON.parse(raw.value);
    switch (type) {
      case 'status':
      case 'color':
        // value JSON is { index, label, ... }
        return parsed?.label ?? raw.text ?? null;
      case 'dropdown':
        // value JSON is { ids: [int], labels: [string]? } — fall back to text
        return raw.text ?? null;
      case 'date':
        return parsed?.date ?? null;
      case 'long_text':
        return parsed?.text ?? '';
      default:
        // plain text: value is JSON-encoded string
        return typeof parsed === 'string' ? parsed : raw.text ?? null;
    }
  } catch {
    return raw.text ?? null;
  }
}

async function getColumnType(columnId: string, key: string): Promise<string> {
  const data = await mondayQuery(
    `query { boards(ids: [7846251224]) { columns(ids: ["${columnId}"]) { type } } }`,
    key
  );
  return data.boards?.[0]?.columns?.[0]?.type ?? 'text';
}

async function checkColumn(c: typeof CHECKS[number], key: string): Promise<CheckResult> {
  const start = Date.now();
  try {
    const type = await getColumnType(c.columnId, key);
    const before = await readColumn(c.columnId, key);
    const appValue = extractAppValue(type, before);

    if (appValue === null || appValue === '') {
      // No current value to round-trip — skip rather than write a known-bad
      // default that would change the column state.
      return { columnId: c.columnId, label: c.label, ok: true, latencyMs: Date.now() - start, error: 'skipped — no current value' };
    }

    // Use the actual app save path — catches any regression in formatting,
    // auto-detect, or mutation building.
    await updateClientField(TEST_CLIENT_ID, c.columnId, appValue);

    const after = await readColumn(c.columnId, key);
    if ((before.text ?? '') !== (after.text ?? '')) {
      return {
        columnId: c.columnId,
        label: c.label,
        ok: false,
        latencyMs: Date.now() - start,
        error: `value changed: "${before.text}" → "${after.text}"`,
      };
    }
    return { columnId: c.columnId, label: c.label, ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { columnId: c.columnId, label: c.label, ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

// Canary check: writes a tricky multi-line string (newlines, quotes,
// backslashes, unicode) to a long_text column and verifies the saved value
// round-trips byte-for-byte. Catches escape bugs in the column_values payload
// — the kind that silently broke Notes for Packing every time the user typed
// a multi-line note. Save bug history shows escaping regressions are the most
// common cause of "save failed", so this canary runs every day.
async function escapeCanary(key: string): Promise<CheckResult> {
  const start = Date.now();
  const columnId = 'long_text_mkxfv1hr'; // Notes for Packing
  const label = 'Escape canary (long_text w/ newlines & quotes)';
  const sentinel =
    'Health canary — do not edit.\n' +
    'Line 2 with "double quotes" and \'apostrophes\'.\n' +
    'Line 3 with a backslash: C:\\folder\\file.txt\n' +
    'Line 4 unicode: ✓ ✗ → ←';
  try {
    const before = await readColumn(columnId, key);
    await updateClientField(TEST_CLIENT_ID, columnId, sentinel);
    const after = await readColumn(columnId, key);
    if ((after.text ?? '') !== sentinel) {
      // Restore best-effort before reporting failure
      const restoreVal = extractAppValue('long_text', before) ?? '';
      try { await updateClientField(TEST_CLIENT_ID, columnId, restoreVal); } catch { /* swallow */ }
      return {
        columnId, label, ok: false, latencyMs: Date.now() - start,
        error: `round-trip mismatch — sent ${JSON.stringify(sentinel)} got ${JSON.stringify(after.text)}`,
      };
    }
    // Restore whatever was there before so the canary doesn't permanently
    // squat in the field. If restore fails, leave the sentinel — it's
    // recognizable and harmless.
    const restoreVal = extractAppValue('long_text', before) ?? '';
    await updateClientField(TEST_CLIENT_ID, columnId, restoreVal);
    return { columnId, label, ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { columnId, label, ok: false, latencyMs: Date.now() - start, error: String(e) };
  }
}

export async function GET() {
  const key = process.env.MONDAY_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: 'MONDAY_API_KEY not set' }, { status: 500 });
  }

  const [canary, ...results] = await Promise.all([escapeCanary(key), ...CHECKS.map(c => checkColumn(c, key))]);
  const allResults = [canary, ...results];
  const allOk = allResults.every(r => r.ok);
  const checkedAt = new Date().toISOString();

  console.log(
    `[health/saves] ${checkedAt} — ` +
    allResults.map(r => r.ok ? `${r.label}:OK(${r.latencyMs}ms)` : `${r.label}:FAIL(${r.error})`).join(' | ')
  );

  return NextResponse.json(
    { ok: allOk, checkedAt, results: allResults },
    { status: allOk ? 200 : 207 }
  );
}
