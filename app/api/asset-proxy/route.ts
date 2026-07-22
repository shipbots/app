/**
 * GET /api/asset-proxy?assetId=123           → stream inline (preview)
 * GET /api/asset-proxy?assetId=123&download=1 → stream as attachment
 * GET /api/asset-proxy?url=<monday/s3 url>    → same, for callers that
 *                                               only have the signed URL
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
 * Security:
 *  - assetId is numeric-only (no arbitrary fetching).
 *  - url is host-allowlisted to Monday / its S3 buckets over https,
 *    which blocks SSRF to localhost, internal services, and the cloud
 *    metadata endpoint. An attacker would already need a valid signed
 *    URL (which only grants the file they can already see).
 *  - the proxy middleware already requires a signed-in session for
 *    every /api/* route.
 */

import { NextRequest, NextResponse } from 'next/server';

const MONDAY_API_URL = 'https://api.monday.com/v2';

// Hosts a Monday asset's signed URL can legitimately live on. Anything
// else is rejected so the `url` param can't be used for SSRF.
function isAllowedAssetHost(u: URL): boolean {
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return (
    h === 'monday.com' ||
    h.endsWith('.monday.com') ||
    h.endsWith('.amazonaws.com') // Monday's file buckets are on S3
  );
}

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

// Best-effort content sniff by magic number, for files whose name carries no
// usable extension (Monday sometimes stores files without one — e.g. an ACH
// form saved as just "ACH"). Only the formats the preview modal renders inline.
function sniffContentType(b: Buffer): string {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';           // %PDF
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';                // ‰PNG
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';                                // JPEG
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';                // GIF8
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

export async function GET(req: NextRequest) {
  const assetId = req.nextUrl.searchParams.get('assetId') ?? '';
  const rawUrl = req.nextUrl.searchParams.get('url') ?? '';
  const download = req.nextUrl.searchParams.get('download') === '1';

  // Resolve the signed URL + display name from EITHER an asset id
  // (preferred — always fresh) or a directly-supplied Monday URL
  // (fallback for callers that only have the url).
  let signedUrl = '';
  let name = '';
  try {
    if (/^\d+$/.test(assetId)) {
      const key = process.env.MONDAY_API_KEY;
      if (!key) return NextResponse.json({ error: 'MONDAY_API_KEY not set' }, { status: 500 });
      // Fresh signed URL every request — public_url is time-limited.
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
      signedUrl = asset?.public_url || asset?.url || '';
      name = asset?.name || `asset-${assetId}`;
      if (!signedUrl) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    } else if (rawUrl) {
      let parsed: URL;
      try { parsed = new URL(rawUrl); }
      catch { return NextResponse.json({ error: 'Invalid url' }, { status: 400 }); }
      if (!isAllowedAssetHost(parsed)) {
        return NextResponse.json({ error: 'url host not allowed' }, { status: 400 });
      }
      signedUrl = rawUrl;
      name = decodeURIComponent(parsed.pathname.split('/').pop() || 'document');
    } else {
      return NextResponse.json({ error: 'assetId or url required' }, { status: 400 });
    }

    const fileRes = await fetch(signedUrl);
    if (!fileRes.ok || !fileRes.body) {
      return NextResponse.json({ error: `Fetch failed (${fileRes.status})` }, { status: 502 });
    }

    const ext = (name.split('.').pop() || '').toLowerCase().split('?')[0];
    // The extension-derived type is what makes browsers render inline (S3
    // reports application/octet-stream regardless of content). When the file
    // name has no usable extension, buffer the bytes and sniff the magic number
    // so real PDFs / images still preview instead of downloading.
    const knownType = TYPE_BY_EXT[ext];
    let responseBody: BodyInit | null;
    let contentType: string;
    if (knownType) {
      responseBody = fileRes.body;
      contentType = knownType;
    } else {
      const buf = Buffer.from(await fileRes.arrayBuffer());
      responseBody = buf;
      contentType = sniffContentType(buf) || fileRes.headers.get('content-type') || 'application/octet-stream';
    }
    // Strip quotes/control chars so the header can't be broken by a
    // hostile filename; keep it readable for the save-as dialog.
    const safeName = name.replace(/[^\w.\- ()]/g, '_');

    return new NextResponse(responseBody, {
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
