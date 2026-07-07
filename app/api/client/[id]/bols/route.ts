/**
 * BOL (Bill of Lading) records for a client.
 *
 *   GET    — list this client's BOL records (newest first)
 *   POST   — upload a BOL image to Monday + append a record (multipart)
 *   DELETE — remove a record by ?bolId= (the Monday asset is left in place)
 *
 * Records live as JSON in the Clients-board long_text column MONDAY_BOL_COL_ID;
 * images upload into the file column MONDAY_BOL_FILES_COL_ID. See lib/bol.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchClientColumn, updateClientField } from '@/lib/monday';
import {
  BolRecord,
  getBolColumnId,
  getBolFilesColumnId,
  parseBolRecords,
  BOL_COL_ENV,
  BOL_FILES_COL_ENV,
} from '@/lib/bol';

const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

function notConfigured() {
  return NextResponse.json(
    {
      error: `${BOL_COL_ENV} / ${BOL_FILES_COL_ENV} not set`,
      hint: 'POST /api/admin/setup-bol-columns once, then paste both ids into Vercel env vars and redeploy.',
    },
    { status: 503 },
  );
}

async function readRecords(clientId: string, colId: string): Promise<BolRecord[]> {
  const raw = await fetchClientColumn(clientId, colId);
  return parseBolRecords(raw);
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const colId = getBolColumnId();
  if (!colId) return notConfigured();
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  try {
    const records = await readRecords(id, colId);
    records.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
    return NextResponse.json({ bols: records });
  } catch (err) {
    console.error('[bols GET] failed:', err);
    return NextResponse.json({ error: 'Failed to load BOLs' }, { status: 502 });
  }
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const colId = getBolColumnId();
  const filesColId = getBolFilesColumnId();
  if (!colId || !filesColId) return notConfigured();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  const mondayKey = process.env.MONDAY_API_KEY;
  if (!mondayKey) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 503 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form' }, { status: 400 });
  }

  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'A BOL document (file) is required' }, { status: 400 });

  const bolDate = String(form.get('bolDate') ?? '').trim();
  const palletCount = String(form.get('palletCount') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim();

  const session = await auth();
  const authorEmail = session?.user?.email ?? '';

  try {
    // 1. Upload the image to the Clients-board file column.
    const mondayForm = new FormData();
    mondayForm.append(
      'query',
      `mutation ($file: File!) {
        add_file_to_column(item_id: ${id}, column_id: "${filesColId}", file: $file) {
          id url public_url name
        }
      }`,
    );
    mondayForm.append('variables[file]', file, file.name);

    const uploadRes = await fetch(MONDAY_FILE_URL, {
      method: 'POST',
      headers: { Authorization: mondayKey },
      body: mondayForm,
    });
    const uploadData = await uploadRes.json();
    if (uploadData.errors) {
      console.error('[bols POST] file upload error:', uploadData.errors);
      return NextResponse.json({ error: 'Failed to upload BOL image' }, { status: 502 });
    }
    const asset = uploadData.data?.add_file_to_column;

    // 2. Append the record and persist.
    const record: BolRecord = {
      id: Math.random().toString(36).slice(2, 10),
      uploadedAt: new Date().toISOString(),
      bolDate,
      palletCount,
      notes,
      authorEmail,
      fileAssetId: String(asset?.id ?? ''),
      fileUrl: asset?.public_url || asset?.url || '',
      fileName: asset?.name || file.name,
    };

    const records = await readRecords(id, colId);
    records.push(record);
    await updateClientField(id, colId, JSON.stringify(records));

    return NextResponse.json({ ok: true, bol: record });
  } catch (err) {
    console.error('[bols POST] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to save BOL', detail: message }, { status: 502 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const colId = getBolColumnId();
  if (!colId) return notConfigured();
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  const bolId = req.nextUrl.searchParams.get('bolId');
  if (!bolId) return NextResponse.json({ error: 'Missing bolId' }, { status: 400 });

  try {
    const records = await readRecords(id, colId);
    const next = records.filter(r => r.id !== bolId);
    await updateClientField(id, colId, JSON.stringify(next));
    return NextResponse.json({ ok: true, count: next.length });
  } catch (err) {
    console.error('[bols DELETE] failed:', err);
    return NextResponse.json({ error: 'Failed to delete BOL' }, { status: 502 });
  }
}
