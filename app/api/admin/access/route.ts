/**
 * Admin-only management of the billing / DocuSign access allowlist.
 *
 *   GET    → { emails, seeds, source, writable }  — current list + metadata
 *   POST   { email }  → add an email    → { emails }
 *   DELETE { email }  → remove an email → { emails }
 *
 * Gated to admins (ADMIN_EMAILS). The list itself is stored in Vercel Blob via
 * lib/access-store, so edits take effect at runtime with no redeploy.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';
import {
  getDocusignAccessState,
  addDocusignEmail,
  removeDocusignEmail,
} from '@/lib/docusign-access';

export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<{ email: string } | NextResponse> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isAdminEmail(email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return { email };
}

// Basic shape check — the sign-in gate already limits who can be added in
// practice, but validate so a typo doesn't write junk into the list.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const state = await getDocusignAccessState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  try {
    const emails = await addDocusignEmail(email);
    return NextResponse.json({ emails });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Could not save' }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  let body: { email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 });
  try {
    const emails = await removeDocusignEmail(email);
    return NextResponse.json({ emails });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Could not save' }, { status: 502 });
  }
}
