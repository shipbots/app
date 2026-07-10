/**
 * One-shot bootstrap for the four Monday file columns that hold
 * per-section document uploads. Admin-only.
 *
 * Idempotent-ish: Monday will happily create a fresh column each time
 * this runs (there's no "get or create" primitive). We only create a
 * category's column if its env var isn't already set — that way an
 * admin can re-run this to fill in newly-added categories without
 * duplicating existing ones.
 *
 * Returns which columns were created + which were skipped (already
 * configured), and formats a copy-paste block for the Vercel env var
 * page.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminEmail } from '@/lib/admins';
import { createClientsColumn } from '@/lib/monday';
import { CATEGORY_META, DOC_CATEGORIES, getColumnIdFor, type DocCategory } from '@/lib/section-docs';

interface Created {
  category: DocCategory;
  envVar: string;
  columnTitle: string;
  columnId: string;
  status: 'created' | 'already-configured';
}

export async function POST() {
  const session = await auth();
  const email = session?.user?.email ?? null;
  if (!isAdminEmail(email)) {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }

  const results: Created[] = [];
  const errors: { category: DocCategory; message: string }[] = [];

  for (const category of DOC_CATEGORIES) {
    const meta = CATEGORY_META[category];
    const existing = getColumnIdFor(category);
    if (existing) {
      results.push({
        category, envVar: meta.envVar, columnTitle: meta.columnTitle,
        columnId: existing, status: 'already-configured',
      });
      continue;
    }
    try {
      const newId = await createClientsColumn(meta.columnTitle, 'file');
      results.push({
        category, envVar: meta.envVar, columnTitle: meta.columnTitle,
        columnId: newId, status: 'created',
      });
    } catch (err) {
      console.error(`[setup-doc-columns] ${category} failed:`, err);
      errors.push({ category, message: err instanceof Error ? err.message : 'unknown' });
    }
  }

  const envBlock = results
    .map(r => `${r.envVar}=${r.columnId}`)
    .join('\n');

  return NextResponse.json({
    ok: errors.length === 0,
    results,
    errors,
    envBlock,
    next: 'Paste every line above into Vercel Settings → Environment Variables (all environments), then redeploy.',
  });
}
