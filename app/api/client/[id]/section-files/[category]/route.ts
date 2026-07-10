/**
 * Per-section document files on the Clients board.
 *
 *   GET    → list files in the given category (or 'all' for aggregated)
 *   POST   → upload a file to the category's Monday file column
 *   DELETE → remove a file from the Monday file column (via
 *            change_multiple_column_values with the remaining files)
 *
 * Categories: documents | receiving | packing | returns. See
 * lib/section-docs.ts for the mapping to env-var-backed column IDs.
 * The special "all" GET aggregates every configured category and
 * annotates each file with which section it came from — that's what
 * the general Docs tab consumes.
 *
 * File uploads route through Monday's `add_file_to_column` mutation.
 * Deletions have to rewrite the whole file column value because
 * Monday doesn't expose a single-file remove primitive.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchClientColumn } from '@/lib/monday';
import {
  CATEGORY_META,
  DOC_CATEGORIES,
  getAllConfiguredColumns,
  getColumnIdFor,
  isDocCategory,
  type DocCategory,
} from '@/lib/section-docs';

const MONDAY_FILE_URL = 'https://api.monday.com/v2/file';

interface SectionFile {
  assetId: string;
  name: string;
  url: string;
  createdAt: string;
  fileType: string;
  category: DocCategory;
}

function getApiKey(): string {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set');
  return key;
}

// Parse Monday's `value` string for a file column. Shape:
// { files: [{ assetId, name, url, createdAt, fileType, ... }, ...] }
function parseFileColumnValue(raw: string, category: DocCategory): SectionFile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { files?: unknown };
    const files = Array.isArray(parsed?.files) ? parsed.files : [];
    return files
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map(f => ({
        assetId: String(f.assetId ?? f.asset_id ?? ''),
        name: String(f.name ?? 'Untitled'),
        url: String(f.url ?? ''),
        createdAt: String(f.createdAt ?? f.created_at ?? ''),
        fileType: String(f.fileType ?? f.file_extension ?? ''),
        category,
      }))
      .filter(f => f.assetId);
  } catch {
    return [];
  }
}

async function listFiles(clientId: string, category: DocCategory, columnId: string): Promise<SectionFile[]> {
  const raw = await fetchClientColumn(clientId, columnId);
  return parseFileColumnValue(raw, category);
}

// ── GET ────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; category: string }> },
) {
  const { id, category } = await params;
  if (category === 'all') {
    const configured = getAllConfiguredColumns();
    if (configured.length === 0) {
      return NextResponse.json(
        { error: 'No section columns configured', hint: 'POST /api/admin/setup-doc-columns to bootstrap.' },
        { status: 503 },
      );
    }
    const all: SectionFile[] = [];
    for (const { category: cat, columnId } of configured) {
      try {
        const files = await listFiles(id, cat, columnId);
        all.push(...files);
      } catch (err) {
        console.error(`[section-files GET all/${cat}] failed:`, err);
      }
    }
    // Newest first — Monday's createdAt is ISO so string sort works.
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return NextResponse.json(all);
  }
  if (!isDocCategory(category)) {
    return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
  }
  const columnId = getColumnIdFor(category);
  if (!columnId) {
    return NextResponse.json(
      { error: `${CATEGORY_META[category].envVar} not set`, hint: 'Run /api/admin/setup-doc-columns.' },
      { status: 503 },
    );
  }
  try {
    return NextResponse.json(await listFiles(id, category, columnId));
  } catch (err) {
    console.error(`[section-files GET ${category}] failed:`, err);
    return NextResponse.json({ error: 'Failed to list files' }, { status: 502 });
  }
}

// ── POST (upload) ──────────────────────────────────────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; category: string }> },
) {
  const { id, category } = await params;
  if (!isDocCategory(category)) {
    return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
  }
  const columnId = getColumnIdFor(category);
  if (!columnId) {
    return NextResponse.json(
      { error: `${CATEGORY_META[category].envVar} not set`, hint: 'Run /api/admin/setup-doc-columns.' },
      { status: 503 },
    );
  }

  let formData: FormData;
  try { formData = await request.formData(); }
  catch { return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 }); }
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  try {
    const mondayForm = new FormData();
    mondayForm.append(
      'query',
      `mutation ($file: File!) {
        add_file_to_column(item_id: ${id}, column_id: "${columnId}", file: $file) {
          id url public_url name
        }
      }`,
    );
    mondayForm.append('variables[file]', file, file.name);

    const res = await fetch(MONDAY_FILE_URL, {
      method: 'POST',
      headers: { Authorization: getApiKey() },
      body: mondayForm,
    });
    const data = await res.json();
    if (data.errors) {
      console.error(`[section-files POST ${category}] Monday error:`, data.errors);
      return NextResponse.json({ error: data.errors[0]?.message || 'Upload failed' }, { status: 502 });
    }
    const asset = data.data?.add_file_to_column;
    const newFile: SectionFile = {
      assetId: String(asset?.id || ''),
      name: String(asset?.name || file.name),
      url: String(asset?.public_url || asset?.url || ''),
      createdAt: new Date().toISOString(),
      fileType: file.name.split('.').pop() || '',
      category,
    };
    return NextResponse.json(newFile, { status: 201 });
  } catch (err) {
    console.error(`[section-files POST ${category}] failed:`, err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}

// ── DELETE ─────────────────────────────────────────────────────────
// Not exposed for section files in v1. Monday's `change_column_value`
// on a file column replaces the whole list (there's no reliable
// per-file GraphQL primitive we've verified) so a delete would risk
// nuking the wrong files under a race. Reps who need to remove a
// file can open the client on Monday directly and delete it there —
// the next list-fetch here picks it up.
export function DELETE() {
  return NextResponse.json(
    {
      error: 'Delete not available from this app',
      hint: 'Open the client on Monday.com and remove the file from the section column there. It will disappear from here on next refresh.',
    },
    { status: 501 },
  );
}
