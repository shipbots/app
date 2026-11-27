/**
 * Attach a file (photo, PDF, …) to a claim's "Attach Images" column.
 *
 * POST /api/claims/[claimId]/files   multipart form with one `file` field
 *      → { file: { assetId, name, isImage } }
 *
 * One file per request keeps each upload under Vercel's ~4.5 MB request-body
 * limit; the extension downsizes large photos before sending.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestUserEmail } from '@/lib/request-user';
import { addClaimFile, fetchClaim, isMondayId } from '@/lib/claims';

const MAX_BYTES = 4.4 * 1024 * 1024;

export async function POST(request: NextRequest, ctx: { params: Promise<{ claimId: string }> }) {
  if (!(await getRequestUserEmail(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { claimId } = await ctx.params;
  if (!isMondayId(claimId)) return NextResponse.json({ error: 'Invalid claim id' }, { status: 400 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get('file');
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }
  if (!file || !file.size) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (max 4.4 MB)' }, { status: 413 });
  }

  // Make sure the item really is a claim before writing to it.
  const claim = await fetchClaim(claimId).catch(() => null);
  if (!claim) return NextResponse.json({ error: 'Claim not found' }, { status: 404 });

  try {
    const saved = await addClaimFile(claimId, file);
    return NextResponse.json({ file: saved }, { status: 201 });
  } catch (err) {
    console.error('POST /api/claims/[claimId]/files failed', err);
    return NextResponse.json({ error: (err as Error).message || 'Upload failed' }, { status: 500 });
  }
}
