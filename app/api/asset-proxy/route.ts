/**
 * GET /api/asset-proxy?assetId=123           → stream inline (preview)
 * GET /api/asset-proxy?assetId=123&download=1 → stream as attachment
 *
 * Monday serves file assets from signed S3 URLs with
 * Content-Disposition: attachment, so embedding them in an <iframe>
 * (or opening in a tab) triggers a download instead of rendering.
 * This route resolves the asset's signed URL server-side and re-streams
 * the bytes with an `inline` disposition + a Content-Type derived from
 * the filename, which lets the preview modal actually display PDFs and
 * images. `download=1` flips the disposition back to attachment for
 * the modal's Download button — same-origin, so the browser honors the
 * filename without any blob gymnastics.
 *
 * Security: only numeric Monday asset ids are accepted (no arbitrary
 * URL fetching → no SSRF), and the proxy middleware already requires a
 * signed-in session for every /api/* route.
 */

import { NextRequest, NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const TYPE_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  txt: 'text/plain; charset=utf-8',
};

export async function GET(req: NextRequest) {
  const assetId = req.nextUrl.searchParams.get('assetId') ?? '';
  const download = req.nextUrl.searchParams.get('download') === '1';
  if (!/^\d+$/.test(assetId)) {
    return NextResponse.json({ error: 'assetId must be a numeric Monday asset id' }, { status: 400 });
  }
  const key = process.env.MONDAY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });
  }

  try {
    // Resolve a FRESH signed URL every request — Monday's public_url is
    // time-limited, so caching it server-side would hand out dead links.
    const gqlRes = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: key },
      body: JSON.stringify({
        query: `query { assets(ids: [${assetId}]) { id name public_url url } }`,
      }),
    });
    const gql = await gqlRes.json();
    if (gql?.errors?.length) throw new Error(String(gql.errors[0]?.message || 'Monday error'));
    const asset = gql?.data?.assets?.[0];
    const signedUrl: string = asset?.public_url || asset?.url || '';
    if (!signedUrl) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const fileRes = await fetch(signedUrl);
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json({ error: `Fetch failed (${fileRes.status})` }, { status: 502 });
    }

    const name: string = asset?.name || `asset-${assetId}`;
    const ext = (name.split('.').pop() || '').toLowerCase();
    // S3 usually reports application/octet-stream regardless of content;
    // the extension-derived type is what makes browsers render inline.
    const contentType =
      TYPE_BY_EXT[ext] || fileRes.headers.get('content-type') || 'application/octet-stream';
    // Strip quotes/control chars so the header can't be broken by a
    // hostile filename; keep it readable for the save-as dialog.
    const safeName = name.replace(/[^\w.\- ()]/g, '_');

    return new NextResponse(fileRes.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
        // Private: signed content, per-user session. Short TTL keeps
        // repeat preview opens snappy without staleness risk.
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err) {
    console.error('[asset-proxy] failed:', err);
    return NextResponse.json({ error: 'Proxy failed' }, { status: 502 });
  }
}
