/**
 * POST /api/client/[id]/extract-pricing   body: { assetId }
 *
 * "Extract from DocuSign" button on the Billing tab's Pricing Info section.
 * Reads the pricing (Statement of Work, last page) out of the client's signed
 * DocuSign PDF and writes each field to its dedicated column on the Clients
 * board, then returns the extracted values so the UI can reflect them live.
 *
 * Gated to the DocuSign-access group (same as the rest of the Billing tab).
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseDocusign } from '@/lib/docusign-access';
import { extractPricingFromPDF, type ExtractedPricingInfo } from '@/lib/billing-extraction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Claude reads the full contract PDF — allow time

const MONDAY_API_URL = 'https://api.monday.com/v2';
const CLIENTS_BOARD_ID = '7846251224';

// ClientInfo pricing field → Clients-board column id.
const FIELD_COL: Record<keyof ExtractedPricingInfo, string> = {
  receivingPricing:     'text_mm5hpark',
  floorLoadedFee:       'text_mm5hxygd',
  binStorage:           'text_mm5hwtkt',
  palletStorage:        'text_mm5h6606',
  dtcPickPackPricing:   'text_mm5hc2dg',
  b2bPickPack:          'text_mm5h4938',
  shippingUpcharge:     'text_mm5h681j',
  intlShippingUpcharge: 'text_mm5h1w32',
  returnsFee:           'text_mm5hzk9n',
  accountManagerFee:    'text_mm5hb9',
  platformFee:          'text_mm5hq2xy',
  paymentTerms:         'text_mm5hgn1k',
  otherNotes:           'long_text_mm5hy744',
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const session = await auth();
  if (!canUseDocusign(session?.user?.email)) {
    return NextResponse.json({ error: 'Not authorized for DocuSign' }, { status: 403 });
  }
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid client id' }, { status: 400 });
  }

  const mondayApiKey = process.env.MONDAY_API_KEY;
  if (!mondayApiKey) {
    return NextResponse.json({ error: 'MONDAY_API_KEY not configured' }, { status: 503 });
  }
  if (!process.env.SHIPBOTS_ANTHROPIC_KEY) {
    return NextResponse.json(
      { error: 'SHIPBOTS_ANTHROPIC_KEY not configured' },
      { status: 503 }
    );
  }

  let assetId: string;
  try {
    const body = await request.json();
    assetId = String(body.assetId || '');
    if (!/^\d+$/.test(assetId)) throw new Error('assetId required');
  } catch {
    return NextResponse.json({ error: 'Request body must include a numeric assetId' }, { status: 400 });
  }

  const mondayGql = async (query: string, variables?: Record<string, unknown>) => {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: mondayApiKey, 'API-Version': '2024-10' },
      body: JSON.stringify(variables ? { query, variables } : { query }),
      cache: 'no-store',
    });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'monday error');
    return data.data ?? {};
  };

  // 1) Resolve the DocuSign asset's download URL.
  const assetData = await mondayGql(`query { assets(ids: [${assetId}]) { id name url public_url } }`);
  const asset = (assetData.assets as Array<{ name?: string; url?: string; public_url?: string }> | undefined)?.[0];
  const fileUrl = asset?.public_url || asset?.url;
  if (!fileUrl) {
    return NextResponse.json({ error: 'DocuSign file not found in Monday.com' }, { status: 404 });
  }

  // 2) Download the PDF (public_url is a pre-signed S3 URL — no auth header).
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) {
    return NextResponse.json({ error: `Failed to download document (status ${fileRes.status})` }, { status: 502 });
  }
  const contentType = fileRes.headers.get('content-type') || '';
  const isPdf = contentType.includes('pdf') || asset?.name?.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    return NextResponse.json(
      { error: 'The DocuSign document must be a PDF to extract pricing.' },
      { status: 422 }
    );
  }
  const base64 = Buffer.from(await fileRes.arrayBuffer()).toString('base64');

  // 3) Extract the Statement-of-Work pricing.
  let extracted: ExtractedPricingInfo;
  try {
    extracted = await extractPricingFromPDF(base64);
  } catch (err) {
    console.error('[extract-pricing] extraction failed:', err);
    return NextResponse.json({ error: 'Could not read pricing from the contract' }, { status: 502 });
  }

  // 4) Write the non-empty fields to Monday (skip blanks so a re-extract never
  //    wipes a value the client didn't restate). long_text takes {text}.
  const colVals: Record<string, unknown> = {};
  const saved: Partial<ExtractedPricingInfo> = {};
  for (const [field, col] of Object.entries(FIELD_COL) as [keyof ExtractedPricingInfo, string][]) {
    const v = (extracted[field] || '').trim();
    if (!v) continue;
    colVals[col] = col.startsWith('long_text') ? { text: v } : v;
    saved[field] = v;
  }

  let wrote = 0;
  if (Object.keys(colVals).length > 0) {
    try {
      await mondayGql(
        `mutation ($cols: JSON!) { change_multiple_column_values(board_id: ${CLIENTS_BOARD_ID}, item_id: ${id}, column_values: $cols) { id } }`,
        { cols: JSON.stringify(colVals) },
      );
      wrote = Object.keys(colVals).length;
    } catch (err) {
      console.error('[extract-pricing] Monday write failed:', err);
      return NextResponse.json({ error: 'Extracted pricing but failed to save to Monday' }, { status: 502 });
    }
  }

  // Return the full extracted object (all keys) so the UI can reflect exactly
  // what was found; `saved` are the ones persisted.
  return NextResponse.json({ ok: true, wrote, extracted, saved });
}
