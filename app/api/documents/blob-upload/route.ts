/**
 * Client-upload token endpoint for large document uploads.
 *
 * Vercel caps a serverless function's request body at 4.5 MB, so large files
 * can't be POSTed through our API routes (they 413 at the platform before the
 * handler runs). Instead the browser uploads the file DIRECTLY to Vercel Blob
 * using @vercel/blob/client's `upload()`, which calls this endpoint to mint a
 * short-lived, size-limited token. The client then hands the resulting Blob URL
 * to the section-files route, which pulls it server-side and attaches it to
 * Monday (no inbound size limit on a server-initiated fetch).
 *
 * Auth: the proxy already gates /api/* to signed-in users; we re-check here so
 * a token is never minted for an anonymous caller.
 */
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Generous ceiling so real documents (scanned PDFs, decks) go through while
// still bounding abuse. Monday itself accepts well beyond this.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

export async function POST(request: Request): Promise<NextResponse> {
  let body: HandleUploadBody;
  try { body = (await request.json()) as HandleUploadBody; }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await auth();
        if (!session?.user?.email) throw new Error('Unauthorized');
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          // Files are held only until the server attaches them to Monday and
          // deletes them, so keep them out of any CDN cache.
          cacheControlMaxAge: 0,
        };
      },
      // The client attaches the blob to Monday in a follow-up request, so
      // there's nothing to do on completion here.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Upload token failed' }, { status: 400 });
  }
}
