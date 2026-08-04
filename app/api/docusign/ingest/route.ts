/**
 * POST /api/docusign/ingest
 *
 * Zapier entry point for a completed DocuSign contract. A Zap (trigger:
 * DocuSign "Envelope Completed/Signed" → action: Webhooks POST) sends the signed
 * document + signer email here; we match the client in Monday, upload the PDF to
 * the contract column, and extract billing + pricing automatically.
 *
 * Auth: a shared secret in the `x-webhook-secret` header (or `?secret=`), matched
 * against the DOCUSIGN_ZAPIER_SECRET env var. Set the same value in Vercel and in
 * the Zap's webhook headers.
 *
 * Accepts JSON or multipart/form-data:
 *   signerEmail | signerEmails   one email, or many (array / comma-separated)
 *   companyName                  optional, for the "not found" notification
 *   documentUrl | documentBase64 the signed PDF (multipart `file` also works)
 *   signedDate                   optional ISO date the envelope completed
 *
 * Always responds 200 with the result so the Zap can branch on `found`:
 * when found=false (reason "no_client_match"), the Zap emails andres@shipbots.com.
 */
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { processCompletedContract } from '@/lib/docusign-intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 20_000;

function secretOk(provided: string | null, expected: string): boolean {
  if (!provided || provided.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(provided), Buffer.from(expected)); } catch { return false; }
}

function splitEmails(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.flatMap(splitEmails);
  if (typeof raw !== 'string') return [];
  return raw.split(/[,;\n\s]+/).map(s => s.trim()).filter(Boolean);
}

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`document fetch ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(req: Request) {
  const expected = process.env.DOCUSIGN_ZAPIER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'DOCUSIGN_ZAPIER_SECRET not set' }, { status: 503 });
  }
  const provided = req.headers.get('x-webhook-secret') || new URL(req.url).searchParams.get('secret');
  if (!secretOk(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = req.headers.get('content-type') || '';
  let signerEmails: string[] = [];
  let companyName: string | undefined;
  let signedDate: string | undefined;
  let pdfBuffer: Buffer | null = null;

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      signerEmails = splitEmails(form.get('signerEmails') ?? form.get('signerEmail'));
      companyName = (form.get('companyName') as string) || undefined;
      signedDate = (form.get('signedDate') as string) || undefined;
      const file = form.get('file');
      if (file && typeof file !== 'string') {
        pdfBuffer = Buffer.from(await (file as File).arrayBuffer());
      } else {
        const url = (form.get('documentUrl') as string) || '';
        const b64 = (form.get('documentBase64') as string) || '';
        if (url) pdfBuffer = await fetchPdf(url);
        else if (b64) pdfBuffer = Buffer.from(b64, 'base64');
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      signerEmails = splitEmails(body.signerEmails ?? body.signerEmail);
      companyName = typeof body.companyName === 'string' ? body.companyName : undefined;
      signedDate = typeof body.signedDate === 'string' ? body.signedDate : undefined;
      if (typeof body.documentUrl === 'string' && body.documentUrl) pdfBuffer = await fetchPdf(body.documentUrl);
      else if (typeof body.documentBase64 === 'string' && body.documentBase64) pdfBuffer = Buffer.from(body.documentBase64, 'base64');
    }
  } catch (err) {
    return NextResponse.json({ error: 'Could not read the document', detail: String(err) }, { status: 502 });
  }

  if (signerEmails.length === 0) {
    return NextResponse.json({ error: 'Missing signerEmail(s)' }, { status: 400 });
  }
  if (!pdfBuffer || pdfBuffer.length === 0) {
    return NextResponse.json({ error: 'Missing document (documentUrl, documentBase64, or file)' }, { status: 400 });
  }

  try {
    const result = await processCompletedContract({ signerEmails, companyName, pdfBuffer, signedDate });
    // 200 either way so the Zap can branch on result.found (email on false).
    return NextResponse.json(result);
  } catch (err) {
    console.error('[docusign/ingest] processing failed:', err);
    return NextResponse.json({ error: 'Processing failed', detail: String(err) }, { status: 500 });
  }
}
