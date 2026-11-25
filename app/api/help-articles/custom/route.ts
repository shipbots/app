import { NextRequest, NextResponse } from 'next/server';
import { getCustomArticles, saveCustomArticles, isBlobConfigured } from '@/lib/custom-articles-store';

// Team-shared custom help articles (name + link) for the After-Onboarding
// Summary. Auth is handled by the edge proxy (session or Bearer). The whole
// list is read (GET) and replaced (PUT) — it's small and edited rarely.

export async function GET() {
  const articles = await getCustomArticles(true);
  return NextResponse.json({ articles, storeReady: isBlobConfigured() });
}

export async function PUT(req: NextRequest) {
  if (!isBlobConfigured()) {
    return NextResponse.json(
      { error: 'Custom-article storage is not configured (BLOB_READ_WRITE_TOKEN missing).' },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const articlesIn = (body as { articles?: unknown } | null)?.articles;
  try {
    const articles = await saveCustomArticles(articlesIn);
    return NextResponse.json({ articles });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Save failed' }, { status: 500 });
  }
}
