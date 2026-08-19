import { NextRequest, NextResponse } from 'next/server';

// Streams a help-article image from its CDN so the summary's page 2+ can embed
// screenshots without hotlink/referer issues (and without bloating the repo).
// Host-allowlisted to avoid an open proxy / SSRF.
const ALLOWED_HOSTS = new Set([
  'www.notion.so',
  'media.helpkit.co',
  'res.cloudinary.com',
  'prod-files-secure.s3.us-west-2.amazonaws.com',
]);

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src');
  if (!src) return new NextResponse('missing src', { status: 400 });

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new NextResponse('bad src', { status: 400 });
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    return new NextResponse('host not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (ShipBots Onboarding Summary)' },
      next: { revalidate: 86400 },
    });
    if (!upstream.ok || !upstream.body) {
      return new NextResponse('upstream error', { status: 502 });
    }
    const contentType = upstream.headers.get('content-type') || 'image/png';
    if (!contentType.startsWith('image/')) {
      return new NextResponse('not an image', { status: 415 });
    }
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse('fetch failed', { status: 502 });
  }
}
