import { NextRequest, NextResponse } from 'next/server';

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set');
  return key;
}

/**
 * GET /api/assets/[assetId]
 * Fetches the Monday.com asset's public_url and streams the file to the browser.
 * This avoids CORS / auth issues when trying to open Monday.com file URLs directly.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const { assetId } = await params;

    // Query Monday.com for the asset's public download URL
    const query = `query {
      assets(ids: [${assetId}]) {
        id
        name
        url
        public_url
      }
    }`;

    const gqlRes = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: getApiKey(),
        'API-Version': '2024-10',
      },
      body: JSON.stringify({ query }),
    });

    const gqlData = await gqlRes.json();
    const asset = gqlData.data?.assets?.[0];

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 });
    }

    const fileUrl = asset.public_url || asset.url;
    if (!fileUrl) {
      return NextResponse.json({ error: 'No URL available for asset' }, { status: 404 });
    }

    // Fetch the actual file
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: 502 });
    }

    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const contentLength = fileRes.headers.get('content-length');
    const fileName = asset.name || 'document';

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      // inline so it opens in the browser rather than auto-downloading
      'Content-Disposition': `inline; filename="${fileName}"`,
    };
    if (contentLength) headers['Content-Length'] = contentLength;

    return new NextResponse(fileRes.body, { status: 200, headers });
  } catch (error) {
    console.error('Asset fetch failed:', error);
    return NextResponse.json({ error: 'Failed to retrieve asset' }, { status: 500 });
  }
}
