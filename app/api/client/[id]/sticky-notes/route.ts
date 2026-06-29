/**
 * Sticky notes — shared storage on the Clients board.
 *
 * Notes used to live in browser localStorage so they were per-device,
 * per-user. v2 moves them to a Monday long_text column so the whole CS
 * team sees the same sticky-note canvas for a given client.
 *
 * Storage: one long_text column on the Clients board (~10 MB ceiling per
 * value, plenty for a few hundred small notes). The column id is read
 * from MONDAY_STICKY_NOTES_COL_ID. Use /api/admin/setup-sticky-notes once
 * to create the column and copy its id into Vercel env vars.
 *
 * Race model: last-write-wins. The frontend debounces saves and the team
 * size is small, so this is acceptable for v1. A merge-on-write upgrade
 * is possible later if conflicts become common.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchClientColumn, updateClientField } from '@/lib/monday';

const STICKY_COL_ENV = 'MONDAY_STICKY_NOTES_COL_ID';

function getStickyColumnId(): string | null {
  const id = process.env[STICKY_COL_ENV];
  if (!id || typeof id !== 'string') return null;
  return id.trim() || null;
}

function notConfiguredResponse() {
  return NextResponse.json(
    {
      error: `${STICKY_COL_ENV} env var is not set`,
      hint: 'POST /api/admin/setup-sticky-notes once to create the column on the Clients board, then paste the returned id into Vercel env vars and redeploy.',
    },
    { status: 503 },
  );
}

// ── GET ───────────────────────────────────────────────────────────────────
// Returns the parsed array of notes for this client. Empty array when the
// column is blank or has malformed JSON (so a bad value never breaks the
// panel — the user just sees no notes and can add new ones).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const colId = getStickyColumnId();
  if (!colId) return notConfiguredResponse();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  try {
    const raw = await fetchClientColumn(id, colId);
    if (!raw) return NextResponse.json({ notes: [] });
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return NextResponse.json({ notes: parsed });
    } catch {
      // Fall through — treat malformed JSON as empty rather than 500.
    }
    return NextResponse.json({ notes: [] });
  } catch (err) {
    console.error('[sticky-notes GET] failed:', err);
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 502 });
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────
// Body shape: { notes: Array<StickyNote> }. Replaces the column value
// wholesale. Caller is responsible for sending the merged array — we don't
// do server-side merge.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const colId = getStickyColumnId();
  if (!colId) return notConfiguredResponse();

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  let body: { notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body.notes)) {
    return NextResponse.json({ error: 'Body must include { notes: [...] }' }, { status: 400 });
  }

  // Round-trip through JSON to drop any extra junk the client tried to send.
  const serialized = JSON.stringify(body.notes);

  try {
    await updateClientField(id, colId, serialized);
    return NextResponse.json({ ok: true, count: body.notes.length });
  } catch (err) {
    console.error('[sticky-notes PUT] failed:', err);
    const message = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: 'Failed to save notes', detail: message }, { status: 502 });
  }
}
