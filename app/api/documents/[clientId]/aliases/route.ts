/**
 * File display-name aliases for a client.
 *
 *   GET → { aliases: { <assetId>: <displayName>, ... } }
 *   PUT → replaces the whole map. Body: { aliases: { ... } }
 *
 * Aliases are stored in the same Monday long_text column as the link
 * docs (MONDAY_DOCUMENTS_COL_ID) under the `aliases` sub-field. This
 * keeps section-files rename functionality on the same storage
 * bootstrap as links — no extra setup step. Section-files' list
 * endpoint applies these on top of Monday's raw file name so a rep
 * sees "Q4 Purchase Order" instead of "invoice-final-v3.pdf".
 */

import { NextRequest, NextResponse } from 'next/server';
import { readAll, writeAliases } from '@/lib/docs-storage';

const DOCS_COL_ENV = 'MONDAY_DOCUMENTS_COL_ID';

function getDocsColumnId(): string | null {
  const id = process.env[DOCS_COL_ENV];
  if (!id || typeof id !== 'string') return null;
  return id.trim() || null;
}

function notConfiguredResponse() {
  return NextResponse.json(
    {
      error: `${DOCS_COL_ENV} env var is not set`,
      hint: 'Run "Storage settings" on the Docs tab to bootstrap.',
    },
    { status: 503 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();
  const { clientId } = await params;
  try {
    const { aliases } = await readAll(clientId, colId);
    return NextResponse.json({ aliases });
  } catch (err) {
    console.error('[documents/aliases GET] failed:', err);
    return NextResponse.json({ error: 'Failed to load aliases' }, { status: 502 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const colId = getDocsColumnId();
  if (!colId) return notConfiguredResponse();
  const { clientId } = await params;
  let body: { aliases?: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const raw = body?.aliases;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return NextResponse.json({ error: '`aliases` must be an object' }, { status: 400 });
  }
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) sanitized[k] = v.trim();
  }
  try {
    await writeAliases(clientId, colId, sanitized);
    return NextResponse.json({ ok: true, aliases: sanitized });
  } catch (err) {
    console.error('[documents/aliases PUT] failed:', err);
    return NextResponse.json({ error: 'Failed to save aliases' }, { status: 502 });
  }
}
