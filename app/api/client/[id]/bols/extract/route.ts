/**
 * POST /api/client/[id]/bols/extract
 *
 * Reads a Bill of Lading (photo or PDF) with Claude and returns the fields we
 * want to capture, so the BOL Uploader mini app can pre-fill an editable form.
 * Nothing is stored here — extraction is a read-only best-effort pre-fill; the
 * actual save happens in POST /api/client/[id]/bols.
 *
 * Body: multipart/form-data with a `file` field (image/* or application/pdf).
 * Returns: { bolDate: string, palletCount: string, notes: string }
 */
import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const PROMPT = `You are reading a Bill of Lading (BOL) shipping document. Extract the following and return ONLY a JSON object with exactly these keys (no markdown, no commentary):

- "bolDate": the date printed on the BOL, formatted as YYYY-MM-DD. Empty string "" if you can't find it.
- "palletCount": the number of pallets/skids on the shipment as a plain number string (e.g. "12"). Empty string "" if not stated.
- "notes": a short plain-text summary of the useful information on the BOL — carrier, PRO/BOL number, piece/carton count, weight, origin/destination, and anything notable. Keep it to a few lines.

Return the JSON object only.`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params; // id not needed for extraction, but part of the route shape

  const anthropicKey = process.env.SHIPBOTS_ANTHROPIC_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: 'SHIPBOTS_ANTHROPIC_KEY not configured' },
      { status: 503 },
    );
  }

  let file: File | null;
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Expected multipart form with a file' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const mediaType = file.type || 'application/octet-stream';
  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');

  const source =
    mediaType === 'application/pdf'
      ? { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } }
      : IMAGE_TYPES.includes(mediaType)
        ? { block: { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } } }
        : null;

  if (!source) {
    return NextResponse.json(
      { error: `Unsupported file type "${mediaType}". Upload a JPG/PNG photo or a PDF.` },
      { status: 422 },
    );
  }

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: [source.block, { type: 'text', text: PROMPT }] }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[bols/extract] anthropic error:', data);
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 });
    }

    const text: string = data?.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    return NextResponse.json({
      bolDate: typeof parsed.bolDate === 'string' ? parsed.bolDate : '',
      palletCount:
        parsed.palletCount === undefined || parsed.palletCount === null
          ? ''
          : String(parsed.palletCount),
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    });
  } catch (err) {
    console.error('[bols/extract] failed:', err);
    return NextResponse.json({ error: 'AI extraction failed' }, { status: 502 });
  }
}
