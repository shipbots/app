/**
 * POST /api/client/ach/file  (multipart: file, itemId)
 *
 * Upload / replace the ACH document on a "Client Billing Info" board item.
 * Gated to the DocuSign-access group like the rest of the ACH endpoints.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { canUseDocusign } from '@/lib/docusign-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';
const COL_DOC = 'file_mm5aqrwq'; // "ACH Doc"

export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canUseDocusign(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const key = process.env.MONDAY_API_KEY;
  if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });

  const form = await req.formData();
  const file = form.get('file');
  const itemId = String(form.get('itemId') || '').trim();
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!/^\d+$/.test(itemId)) return NextResponse.json({ error: 'Bad item id' }, { status: 400 });

  const mondayForm = new FormData();
  mondayForm.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${COL_DOC}", file: $file) { id url public_url name }
    }`,
  );
  mondayForm.append('variables[file]', file, file.name);

  try {
    const res = await fetch(MONDAY_FILE_URL, { method: 'POST', headers: { Authorization: key }, body: mondayForm });
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || 'upload error');
    const asset = data.data?.add_file_to_column;
    return NextResponse.json({
      ok: true,
      assetId: String(asset?.id || ''),
      url: asset?.public_url || asset?.url || '',
      name: asset?.name || file.name,
    });
  } catch (err) {
    console.error('[client/ach/file] failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}
