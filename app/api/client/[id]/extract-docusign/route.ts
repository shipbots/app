import { NextRequest, NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';

export interface ExtractedBillingInfo {
  legalEntity: string;
  ein: string;
  billingStreet1: string;
  billingStreet2: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  dateDocusignSigned: string; // YYYY-MM-DD
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // id is not used here but required by route signature

  const mondayApiKey = process.env.MONDAY_API_KEY;
  if (!mondayApiKey) {
    return NextResponse.json({ error: 'MONDAY_API_KEY not configured' }, { status: 503 });
  }

  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'SHIPBOTS_ANTHROPIC_KEY not configured. Add it to .env.local from console.anthropic.com → API Keys.' },
      { status: 503 }
    );
  }

  let assetId: string;
  try {
    const body = await request.json();
    assetId = body.assetId;
    if (!assetId) throw new Error('assetId required');
  } catch {
    return NextResponse.json({ error: 'Request body must include assetId' }, { status: 400 });
  }

  // ── 1. Resolve the asset's download URL from Monday.com ──────────────────
  const assetQuery = `query { assets(ids: [${assetId}]) { id name url public_url } }`;
  const mondayRes = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': mondayApiKey,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: assetQuery }),
    cache: 'no-store',
  });

  const mondayData = await mondayRes.json();
  const asset = mondayData.data?.assets?.[0];
  if (!asset) {
    return NextResponse.json({ error: 'Asset not found in Monday.com' }, { status: 404 });
  }

  const fileUrl: string = asset.public_url || asset.url;
  if (!fileUrl) {
    return NextResponse.json({ error: 'No download URL for this asset' }, { status: 404 });
  }

  // ── 2. Download the PDF ────────────────────────────────────────────────────
  // public_url is a pre-signed S3/CDN URL — do NOT send Authorization header,
  // as mixing it with S3 presigned params causes a 400 SignatureDoesNotMatch error.
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    return NextResponse.json(
      { error: `Failed to download document (status ${fileRes.status})` },
      { status: 500 }
    );
  }

  const contentType = fileRes.headers.get('content-type') || 'application/pdf';
  const fileBuffer = await fileRes.arrayBuffer();
  const base64 = Buffer.from(fileBuffer).toString('base64');

  // Anthropic only supports PDFs; if the file is not a PDF, fall back gracefully
  const isPdf = contentType.includes('pdf') || asset.name?.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return NextResponse.json(
      { error: `Document is not a PDF (type: ${contentType}). Only PDF files are supported for extraction.` },
      { status: 422 }
    );
  }

  // ── 3. Send to Anthropic for extraction ───────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `Extract the following information from this DocuSign/contract document and return ONLY a JSON object with exactly these keys:

- "legalEntity": legal name of the entity/company signing (string)
- "ein": EIN or Tax ID number (string, digits and dashes only, no labels like "EIN:" prefix)
- "billingStreet1": billing address street line 1 (string)
- "billingStreet2": billing address street line 2 / suite / unit (string, use empty string "" if not present)
- "billingCity": billing city (string)
- "billingState": billing state (string, 2-letter abbreviation for US states e.g. "CA", full name for non-US)
- "billingCountry": billing country as 2-letter ISO code (e.g. "US", "CA", "GB", "MX")
- "billingZip": billing zip or postal code (string)
- "dateDocusignSigned": the date the client/signer signed the document (string in YYYY-MM-DD format)

If a field cannot be found in the document, use an empty string "".
Return ONLY the raw JSON object — no markdown code fences, no explanation text.`,
            },
          ],
        },
      ],
    }),
  });

  if (!anthropicRes.ok) {
    const errText = await anthropicRes.text();
    console.error('Anthropic API error:', errText);
    return NextResponse.json(
      { error: `Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 300)}` },
      { status: 500 }
    );
  }

  const anthropicData = await anthropicRes.json();
  const rawText: string = anthropicData.content?.[0]?.text || '';

  // ── 4. Parse the JSON response ─────────────────────────────────────────────
  // Try direct parse first, then regex extract if Claude wrapped it in markdown
  let extracted: ExtractedBillingInfo;
  try {
    extracted = JSON.parse(rawText.trim());
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        extracted = JSON.parse(match[0]);
      } catch {
        console.error('Failed to parse Anthropic response:', rawText);
        return NextResponse.json(
          { error: 'Could not parse extracted data from document', raw: rawText.slice(0, 500) },
          { status: 500 }
        );
      }
    } else {
      console.error('No JSON in Anthropic response:', rawText);
      return NextResponse.json(
        { error: 'No structured data found in document response', raw: rawText.slice(0, 500) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(extracted);
}
