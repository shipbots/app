/**
 * POST /api/docusign/webhook
 *
 * Direct DocuSign Connect entry point (JWT app). On "envelope-completed" it
 * downloads the signed PDF from the DocuSign API and hands it to the shared
 * intake pipeline (lib/docusign-intake): match client by signer email → upload
 * the PDF to the contract column → extract billing + pricing → mark signed.
 *
 * NOTE: The primary integration is Zapier → /api/docusign/ingest, which needs no
 * DocuSign JWT app. This route stays available for teams that prefer DocuSign
 * Connect directly; it no-ops unless the DOCUSIGN_* env vars are set.
 *
 * Configure in DocuSign Admin → Connect → Add configuration:
 *   URL:    https://<your-domain>/api/docusign/webhook
 *   Events: Envelope Completed   ·   Format: JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  isDocuSignConfigured,
  downloadSignedDocument,
  verifyWebhookSignature,
  DocuSignWebhookPayload,
} from '@/lib/docusign';
import { processCompletedContract } from '@/lib/docusign-intake';

export async function POST(req: NextRequest) {
  if (!isDocuSignConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'not_configured' });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-docusign-signature-1');
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn('[DocuSign webhook] HMAC verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: DocuSignWebhookPayload;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { event, data } = payload;
  const summary = data?.envelopeSummary;
  if (event !== 'envelope-completed' || summary?.status !== 'completed') {
    return NextResponse.json({ ok: true, skipped: `event=${event} status=${summary?.status}` });
  }

  const envelopeId = data?.envelopeId;
  if (!envelopeId) return NextResponse.json({ error: 'Missing envelopeId' }, { status: 400 });

  const signerEmails: string[] = (summary.recipients?.signers ?? []).map(s => s.email).filter(Boolean);
  if (signerEmails.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no_signer_emails', envelopeId });
  }

  let pdfBuffer: Buffer;
  try { pdfBuffer = await downloadSignedDocument(envelopeId); }
  catch (err) {
    console.error('[DocuSign webhook] PDF download failed:', err);
    return NextResponse.json({ error: 'PDF download failed', detail: String(err) }, { status: 502 });
  }

  const companyName = summary.recipients?.signers?.[0]?.name;
  const signedDate = (summary as { completedDateTime?: string }).completedDateTime;

  const result = await processCompletedContract({ signerEmails, companyName, pdfBuffer, signedDate });
  console.log(`[DocuSign webhook] envelope ${envelopeId} →`, JSON.stringify(result));
  return NextResponse.json({ envelopeId, ...result });
}
