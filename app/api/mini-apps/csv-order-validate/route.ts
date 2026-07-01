/**
 * AI double-check for the CSV Order Formatter mini-app.
 *
 * The formatter runs a deterministic pre-flight pass in the browser
 * (missing required fields, country names in the State column,
 * unresolved country codes). This endpoint is the optional second
 * opinion — Claude reads up to 20 already-projected output rows and
 * reports anything that would make ShipHero reject the upload, with
 * a focus on the two failure modes the user has actually hit:
 *
 *   - zip missing or malformed for the country code
 *   - state field wrong for the country (e.g. "Canada" with US or CA,
 *     "Ontario" with US, "TX" with CA, etc.)
 *
 * Returns { issues: [{ rowIndex, field, current, message, suggestion? }] }
 * with rowIndex being 0-based within the batch we sent. The client
 * renders each finding as a card in the PreflightPanel; the user
 * decides whether to act on it.
 */

import { NextRequest, NextResponse } from 'next/server';

interface AiIssue {
  rowIndex: number;
  field: string;
  current: string;
  message: string;
  suggestion?: string;
}

const MAX_ROWS = 20;

function buildPrompt(rows: Record<string, unknown>[]): string {
  return `You are a strict validator for ShipHero order-upload CSV rows. Focus on the two error classes that most often cause upload rejection:

  1. Missing or invalid postal codes. Every row that has a Country Code needs a Zip. US zips are 5 digits (or 5+4). CA zips look like "A1A 1A1". GB is alphanumeric. If a Zip is blank OR clearly wrong shape for the country, flag it. If the row also carries an address that includes an obvious zip you can extract, provide it as "suggestion".

  2. Wrong value in "State / Province" for the given "Country Code". Common bugs: a country name ("Canada", "United States", "Mexico") ends up in the State column, or a US state is used with a CA country code, or vice versa. If Country Code = "US" the state must be a valid US state (2-letter code or full name). If Country Code = "CA" the state must be a valid Canadian province/territory. If Country Code is anything else, State can be blank or free text. Suggest a corrected value when you can infer it from the row (e.g., city or address); otherwise omit "suggestion" and describe the fix in "message".

Here are the projected output rows (already through our own normalizer). Row indexes are 0-based:

${JSON.stringify(rows, null, 2)}

Return ONLY raw JSON in this exact shape:

{
  "issues": [
    { "rowIndex": <number>, "field": "<column name, verbatim>", "current": "<value shown to user>", "message": "<one sentence, plain English>", "suggestion": "<value to use, optional>" }
  ]
}

Rules:
- Only report issues that would cause ShipHero to REJECT the row. Do not flag stylistic concerns.
- Be conservative — if a value is plausibly correct, do not flag it.
- "field" must be the exact column header as it appears in the row objects above.
- "current" is what the row currently has; use "" for blank.
- Include "suggestion" only when you are confident.
- Empty array is fine: { "issues": [] }.
- No markdown, no commentary — just the JSON object.`;
}

export async function POST(req: NextRequest) {
  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'SHIPBOTS_ANTHROPIC_KEY not configured' }, { status: 503 });
  }

  let body: { rows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rowsInput = Array.isArray(body.rows) ? body.rows : [];
  const rows = rowsInput
    .slice(0, MAX_ROWS)
    .filter(r => r && typeof r === 'object') as Record<string, unknown>[];

  if (rows.length === 0) {
    return NextResponse.json({ issues: [] });
  }

  const prompt = buildPrompt(rows);

  let aiRes: Response;
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    console.error('[csv-order-validate] Anthropic fetch failed:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }

  if (!aiRes.ok) {
    const text = await aiRes.text();
    console.error('[csv-order-validate] Anthropic error:', aiRes.status, text.slice(0, 300));
    return NextResponse.json({ error: `AI error ${aiRes.status}` }, { status: 502 });
  }

  const data = await aiRes.json();
  const raw: string = data.content?.[0]?.text || '';

  let parsed: { issues?: unknown };
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return NextResponse.json({ issues: [], parseError: 'AI response was not JSON' });
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ issues: [], parseError: 'AI response could not be parsed' });
    }
  }

  const rawIssues = Array.isArray(parsed.issues) ? parsed.issues : [];
  const issues: AiIssue[] = [];
  for (const it of rawIssues) {
    if (!it || typeof it !== 'object') continue;
    const cast = it as Record<string, unknown>;
    const rowIndex = typeof cast.rowIndex === 'number' ? cast.rowIndex : -1;
    const field = typeof cast.field === 'string' ? cast.field : '';
    const message = typeof cast.message === 'string' ? cast.message : '';
    if (rowIndex < 0 || rowIndex >= rows.length || !field || !message) continue;
    issues.push({
      rowIndex,
      field,
      current: typeof cast.current === 'string' ? cast.current : '',
      message,
      ...(typeof cast.suggestion === 'string' && cast.suggestion.trim()
        ? { suggestion: cast.suggestion.trim() }
        : {}),
    });
  }

  return NextResponse.json({ issues });
}
