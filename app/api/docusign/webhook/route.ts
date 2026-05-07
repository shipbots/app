/**
 * POST /api/docusign/webhook
 *
 * DocuSign Connect sends a JSON notification here when an envelope event occurs.
 * We listen for "envelope-completed" and then:
 *   1. Download the signed PDF from DocuSign API
 *   2. Match the signer's email to a client in Monday.com
 *   3. Upload the PDF to the matching onboarding item's "files" column
 *   4. Auto-extract billing info via Claude and update the clients board
 *   5. Advance the onboarding status to "Contract Signed"
 *
 * Configure in DocuSign Admin → Connect → Add configuration:
 *   URL:    https://<your-domain>/api/docusign/webhook
 *   Events: Envelope Completed
 *   Format: JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isDocuSignConfigured,
  downloadSignedDocument,
  verifyWebhookSignature,
  DocuSignWebhookPayload,
} from '@/lib/docusign';
import { extractBillingFromPDF } from '@/lib/billing-extraction';
import {
  findClientBoardItemByEmail,
  findOnboardingItemByClientBoardId,
  updateClientField,
} from '@/lib/monday';

const MONDAY_API_URL  = 'https://api.monday.com/v2';
const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

function apiKey(): string {
  const k = process.env.MONDAY_API_KEY;
  if (!k) throw new Error('MONDAY_API_KEY not set');
  return k;
}

// ─── Upload a PDF Buffer to Monday.com ────────────────────────────────────────
async function uploadPDFToMonday(
  onboardingItemId: string,
  pdfBuffer: Buffer,
  fileName = 'signed-contract.pdf'
): Promise<{ assetId: string; publicUrl: string }> {
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' });
  const form = new FormData();
  form.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${onboardingItemId}, column_id: "files", file: $file) {
        id url public_url name
      }
    }`
  );
  form.append('variables[file]', blob, fileName);

  const res = await fetch(MONDAY_FILE_URL, {
    method: 'POST',
    headers: { Authorization: apiKey() },
    body: form,
  });

  const data = await res.json();
  if (data.errors) {
    throw new Error(`Monday file upload error: ${data.errors[0]?.message}`);
  }
  const asset = data.data?.add_file_to_column;
  return { assetId: String(asset?.id || ''), publicUrl: asset?.public_url || asset?.url || '' };
}

// ─── Write billing fields to Monday.com clients board ─────────────────────────
async function applyBillingFields(
  clientBoardItemId: string,
  info: Awaited<ReturnType<typeof extractBillingFromPDF>>
): Promise<void> {
  const fields: Array<{ columnId: string; value: string; isDate?: boolean }> = [
    { columnId: 'text_mktp4fvk', value: info.legalEntity },
    { columnId: 'text_mkxxfg1b', value: info.ein },
    { columnId: 'text_mkx5vzht', value: info.billingStreet1 },
    { columnId: 'text_mkx5f9p9', value: info.billingStreet2 },
    { columnId: 'text_mkx5z70k', value: info.billingCity },
    { columnId: 'text_mkx5er1a', value: info.billingState },
    { columnId: 'text_mkx5tjd7', value: info.billingZip },
    { columnId: 'text_mkx5kyv4', value: info.billingCountry },
    { columnId: 'date_mkw2fhte', value: info.dateDocusignSigned, isDate: true },
  ];

  await Promise.all(
    fields
      .filter(f => f.value)
      .map(f => updateClientField(clientBoardItemId, f.columnId, f.value, f.isDate ? 'date' : 'text'))
  );
}

// ─── Advance onboarding status to "Contract Signed" ───────────────────────────
async function markContractSigned(onboardingItemId: string): Promise<void> {
  // color_mktr9afd is the "Sign Contract" checklist column — mark as Done
  // estado is the overall pipeline status column
  const colValues = JSON.stringify(
    JSON.stringify({ 'color_mktr9afd': { label: 'Done' }, 'estado': { label: 'Contract Signed' } })
  );
  await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: apiKey(), 'API-Version': '2024-10' },
    body: JSON.stringify({
      query: `mutation {
        change_multiple_column_values(board_id: 6004116565, item_id: ${onboardingItemId}, column_values: ${colValues}) { id }
      }`,
    }),
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 0. Config check ──
  if (!isDocuSignConfigured()) {
    console.warn('[DocuSign webhook] Not configured — ignoring request');
    return NextResponse.json({ ok: true, skipped: 'not_configured' });
  }

  // ── 1. Read raw body for HMAC verification ──
  const rawBody = await req.text();
  const signature = req.headers.get('x-docusign-signature-1');

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[DocuSign webhook] HMAC verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // ── 2. Parse payload ──
  let payload: DocuSignWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, data } = payload;
  const summary = data?.envelopeSummary;

  // Only process completed envelopes
  if (event !== 'envelope-completed' || summary?.status !== 'completed') {
    return NextResponse.json({ ok: true, skipped: `event=${event} status=${summary?.status}` });
  }

  const envelopeId = data?.envelopeId;
  if (!envelopeId) {
    return NextResponse.json({ error: 'Missing envelopeId' }, { status: 400 });
  }

  // ── 3. Collect signer emails ──
  const signerEmails: string[] = (summary.recipients?.signers ?? [])
    .map(s => s.email)
    .filter(Boolean);

  if (signerEmails.length === 0) {
    console.warn(`[DocuSign webhook] Envelope ${envelopeId} has no signer emails`);
    return NextResponse.json({ ok: true, skipped: 'no_signer_emails' });
  }

  console.log(`[DocuSign webhook] Processing envelope ${envelopeId} — signers: ${signerEmails.join(', ')}`);

  // ── 4. Match to Monday.com client ──
  const clientBoardItem = await findClientBoardItemByEmail(signerEmails);
  if (!clientBoardItem) {
    console.warn(`[DocuSign webhook] No Monday.com client found for emails: ${signerEmails.join(', ')}`);
    // Return 200 so DocuSign doesn't retry — we just can't match this one
    return NextResponse.json({ ok: true, skipped: 'no_client_match', signers: signerEmails });
  }

  const onboardingItem = await findOnboardingItemByClientBoardId(clientBoardItem.id);
  if (!onboardingItem) {
    console.warn(`[DocuSign webhook] No onboarding item linked to client ${clientBoardItem.id}`);
    return NextResponse.json({ ok: true, skipped: 'no_onboarding_item', client: clientBoardItem.name });
  }

  console.log(`[DocuSign webhook] Matched → client: "${clientBoardItem.name}" (${clientBoardItem.id}), onboarding: ${onboardingItem.id}`);

  // ── 5. Download signed PDF from DocuSign ──
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await downloadSignedDocument(envelopeId);
  } catch (err) {
    console.error('[DocuSign webhook] PDF download failed:', err);
    return NextResponse.json({ error: 'PDF download failed', detail: String(err) }, { status: 502 });
  }

  const pdfBase64 = pdfBuffer.toString('base64');

  // ── 6. Upload PDF to Monday.com onboarding item ──
  let assetInfo: { assetId: string; publicUrl: string };
  try {
    const signerName = summary.recipients?.signers?.[0]?.name ?? 'client';
    const safeName = signerName.replace(/[^a-z0-9\-_ ]/gi, '').trim() || 'contract';
    assetInfo = await uploadPDFToMonday(onboardingItem.id, pdfBuffer, `${safeName}-signed.pdf`);
    console.log(`[DocuSign webhook] Uploaded PDF → assetId ${assetInfo.assetId}`);
  } catch (err) {
    console.error('[DocuSign webhook] Monday upload failed:', err);
    return NextResponse.json({ error: 'Monday upload failed', detail: String(err) }, { status: 502 });
  }

  // ── 7. Extract billing info via Claude ──
  let extractionError: string | null = null;
  try {
    const billingInfo = await extractBillingFromPDF(pdfBase64);
    await applyBillingFields(clientBoardItem.id, billingInfo);
    console.log(`[DocuSign webhook] Billing fields updated for client ${clientBoardItem.id}`);
  } catch (err) {
    // Non-fatal — PDF is already uploaded, billing can be filled manually
    extractionError = String(err);
    console.warn(`[DocuSign webhook] Billing extraction failed (non-fatal): ${extractionError}`);
  }

  // ── 8. Mark contract as signed on onboarding item ──
  try {
    await markContractSigned(onboardingItem.id);
    console.log(`[DocuSign webhook] Onboarding item ${onboardingItem.id} marked as Contract Signed`);
  } catch (err) {
    console.warn('[DocuSign webhook] Status update failed (non-fatal):', err);
  }

  return NextResponse.json({
    ok: true,
    envelopeId,
    client: clientBoardItem.name,
    onboardingItemId: onboardingItem.id,
    assetId: assetInfo.assetId,
    billingExtracted: !extractionError,
    ...(extractionError ? { billingError: extractionError } : {}),
  });
}
