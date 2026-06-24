/**
 * AI-powered column mapping for the CSV Order Formatter mini-app.
 *
 * Caller posts the parsed source headers + a sample of rows. We ask Claude
 * to map them onto ShipHero's order CSV template, normalize country values
 * to 2-letter ISO codes, and self-report confidence on the SKU column so
 * the UI can decide whether to require manual confirmation.
 */

import { NextRequest, NextResponse } from 'next/server';

// ShipHero template column order — frozen here so the generator and the AI
// agree on the schema. (Required) suffixes are kept since the user sees
// them in the source template.
const SHIPHERO_COLUMNS = [
  'Order Date', 'Required Ship Date', 'Order Number (Required)', 'Shop Name',
  'First Name (Required)', 'Last Name', 'Company',
  'Address (Required)', 'Address 2', 'City (Required)',
  'State / Province', 'Zip (Required)', 'Country Code (Required)', 'Phone',
  'Billing Customer Name', 'Billing Last Name', 'Billing Company',
  'Billing Address', 'Billing Address 2', 'Billing City',
  'Billing State / Province', 'Billing Zip', 'Billing Country Code', 'Billing Phone',
  'Product Name', 'Product Sku (Required)', 'Quantity', 'Price',
  'Barcode', 'Image URL', 'Variant Title', 'Partner Line Item',
  'Fulfillment Status', 'Customer Email', 'Warehouse', 'Profile',
  'Shipping Name', 'Shipping Carrier', 'Shipping Method', 'Shipping Price',
  'Subtotal', 'Discount', 'Tax', 'Total', 'Gift Note', 'Packing Note', 'Priority',
] as const;

type ColumnMapping = Record<string, string>;

interface MapResponse {
  columnMapping: ColumnMapping;
  countryValueMap: Record<string, string>;
  skuConfidence: 'high' | 'medium' | 'low' | 'none';
  skuReasoning: string;
  warnings: string[];
}

function buildPrompt(headers: string[], sampleRows: Record<string, unknown>[]): string {
  return `You map columns from a customer order spreadsheet to ShipHero's order CSV template.

Source headers (verbatim):
${JSON.stringify(headers)}

Sample rows (first ${sampleRows.length}):
${JSON.stringify(sampleRows, null, 2)}

ShipHero template columns (you must map every one of these; use "" when no source column matches):
${JSON.stringify(SHIPHERO_COLUMNS)}

Return ONLY a single JSON object with these exact keys:

1. "columnMapping" — object whose keys are EXACTLY the ShipHero column names above and whose values are the source header that maps to it (verbatim from the headers array) or "" if there is no match.

2. "countryValueMap" — object mapping each UNIQUE country value found in the sample rows' country-like column to a 2-letter ISO code. Examples: "United States" -> "US", "USA" -> "US", "U.S.A." -> "US", "Canada" -> "CA", "Mexico" -> "MX", "United Kingdom" -> "GB". If the source value is already a valid 2-letter code, map it to itself. Empty object {} if there is no country column or no values.

3. "skuConfidence" — one of: "high" (header literally says SKU/sku and values look like product codes), "medium" (header is suggestive like "Item Code", "Product ID" and values match), "low" (you had to guess), "none" (no plausible SKU column found).

4. "skuReasoning" — one short sentence explaining your SKU column choice.

5. "warnings" — array of short strings flagging anything the user should review. Examples: "Required column 'City (Required)' was not found in the source." or "Quantity column not detected — defaulting to 1 per row." Empty array [] if nothing to flag.

Strict rules:
- Country codes MUST be 2-letter ISO. If unsure, return "" for that value and add a warning.
- columnMapping VALUES must come verbatim from the source headers array (exact string match, no rewrites).
- Do not invent ShipHero column names. Do not omit any. Each ShipHero column key must appear in columnMapping.
- Return ONLY the raw JSON object — no markdown fences, no commentary.`;
}

export async function POST(req: NextRequest) {
  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'SHIPBOTS_ANTHROPIC_KEY not configured' }, { status: 503 });
  }

  let body: { headers?: unknown; sampleRows?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const headers = Array.isArray(body.headers) ? body.headers.filter(h => typeof h === 'string') as string[] : [];
  const sampleRows = Array.isArray(body.sampleRows) ? body.sampleRows.slice(0, 8) as Record<string, unknown>[] : [];

  if (headers.length === 0) {
    return NextResponse.json({ error: 'No headers provided' }, { status: 400 });
  }

  const prompt = buildPrompt(headers, sampleRows);

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
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    console.error('[csv-order-format] Anthropic fetch failed:', err);
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 });
  }

  if (!aiRes.ok) {
    const text = await aiRes.text();
    console.error('[csv-order-format] Anthropic error:', aiRes.status, text.slice(0, 300));
    return NextResponse.json({ error: `AI error ${aiRes.status}` }, { status: 502 });
  }

  const data = await aiRes.json();
  const raw: string = data.content?.[0]?.text || '';

  let parsed: MapResponse;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json({ error: 'AI response was not JSON', raw: raw.slice(0, 200) }, { status: 502 });
    }
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ error: 'AI response could not be parsed', raw: raw.slice(0, 200) }, { status: 502 });
    }
  }

  // Defensive — fill in missing ShipHero columns with "" so the caller can
  // safely iterate without null-checking each key.
  const safeMapping: ColumnMapping = {};
  for (const col of SHIPHERO_COLUMNS) {
    const val = parsed.columnMapping?.[col];
    safeMapping[col] = typeof val === 'string' ? val : '';
  }

  return NextResponse.json({
    columns: SHIPHERO_COLUMNS,
    columnMapping: safeMapping,
    countryValueMap: parsed.countryValueMap && typeof parsed.countryValueMap === 'object' ? parsed.countryValueMap : {},
    skuConfidence: ['high', 'medium', 'low', 'none'].includes(parsed.skuConfidence) ? parsed.skuConfidence : 'low',
    skuReasoning: typeof parsed.skuReasoning === 'string' ? parsed.skuReasoning : '',
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter(w => typeof w === 'string') : [],
  });
}
