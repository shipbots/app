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
import {
  CATEGORY_META,
  getAllConfiguredColumns,
  getColumnIdFor,
  isDocCategory,
  type DocCategory,
} from '@/lib/section-docs';
import { readAll as readDocsBlob } from '@/lib/docs-storage';

const DOCS_COL_ENV = 'MONDAY_DOCUMENTS_COL_ID';
// Small in-request cache so listing ALL categories (4 file cols) only
// fetches the alias map once instead of four times.
async function fetchAliases(clientId: string): Promise<Record<string, string>> {
  const col = process.env[DOCS_COL_ENV]?.trim();
  if (!col) return {};
  try { return (await readDocsBlob(clientId, col)).aliases; }
  catch { return {}; }
}

const MONDAY_API_URL = 'https://api.monday.com/v2';
const CLIENTS_BOARD_ID = '7846251224';

async function mondayGql(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const key = process.env.MONDAY_API_KEY;
  if (!key) throw new Error('MONDAY_API_KEY not set');
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify(variables ? { query, variables } : { query }),
  });
  const body = await res.json();
  if (body?.errors?.length) throw new Error(String(body.errors[0]?.message || 'Monday error'));
  return body?.data;
}

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

// Read the file column's raw `value` JSON (NOT the `text` field —
// Monday's `text` for a file column is a comma-joined list of names
// without any asset ids, which is useless for us). Then fetch each
// asset's public_url in one batched query so the UI can open the
// files directly. Value shape from Monday:
//   { files: [{ assetId: <number>, name, createdAt, fileType, ... }] }
async function listFiles(clientId: string, category: DocCategory, columnId: string): Promise<SectionFile[]> {
  const data = await mondayGql(`query {
    items(ids: [${clientId}]) {
      column_values(ids: ["${columnId}"]) { id value }
    }
  }`) as { items?: Array<{ column_values?: Array<{ id: string; value?: string | null }> }> } | null;

  const col = data?.items?.[0]?.column_values?.find(c => c.id === columnId);
  if (!col || !col.value) return [];
  let parsedFiles: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(col.value) as { files?: unknown };
    if (Array.isArray(parsed?.files)) {
      parsedFiles = parsed.files.filter((f): f is Record<string, unknown> => !!f && typeof f === 'object');
    }
  } catch {
    return [];
  }
  if (parsedFiles.length === 0) return [];

  // Batch-resolve asset public URLs. Monday returns numeric ids in the
  // file column value; the assets query takes those ids and returns
  // signed public_urls we can link to from the UI.
  const assetIds = parsedFiles
    .map(f => Number(f.assetId ?? f.asset_id ?? 0))
    .filter(n => n > 0);
  const urlById: Record<string, string> = {};
  if (assetIds.length > 0) {
    try {
      const assetsData = await mondayGql(
        `query { assets(ids: [${assetIds.join(',')}]) { id public_url url } }`,
      ) as { assets?: Array<{ id: string; public_url?: string | null; url?: string | null }> } | null;
      for (const a of assetsData?.assets ?? []) {
        urlById[String(a.id)] = a.public_url || a.url || '';
      }
    } catch (err) {
      console.error('[section-files] asset URL fetch failed:', err);
      // Fall through — list without URLs is still useful.
    }
  }

  return parsedFiles.map(f => {
    const assetId = String(f.assetId ?? f.asset_id ?? '');
    const rawName = String(f.name ?? 'Untitled');
    // Derive fileType from the ORIGINAL Monday filename's extension.
    // This matters because display aliases later overwrite `name`
    // ("Wholesale Instructions", no extension) and Monday's own
    // fileType field is usually the literal string "ASSET" — neither
    // is usable for the preview modal's PDF/image detection.
    const extFromName = rawName.includes('.')
      ? (rawName.split('.').pop() || '').toLowerCase()
      : '';
    const extFromMonday = String(f.file_extension ?? '').toLowerCase().replace(/^\./, '');
    return {
      assetId,
      name: rawName,
      url: urlById[assetId] || '',
      // Monday's createdAt on a file column is a Unix timestamp (seconds).
      // Convert to ISO so the client's "sort newest first" string sort
      // stays lexicographic. Empty when Monday didn't record one.
      createdAt: (() => {
        const raw = f.createdAt ?? f.created_at;
        if (typeof raw === 'number' && raw > 0) return new Date(raw * 1000).toISOString();
        if (typeof raw === 'string' && raw) return raw;
        return '';
      })(),
      fileType: extFromName || extFromMonday,
      category,
    };
  }).filter(f => f.assetId);
}

// ── GET ────────────────────────────────────────────────────────────
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; category: string }> },
) {
  const { id, category } = await params;
  // Apply display-name aliases stored in the shared docs long_text
  // column. Fetched once per request so listing 'all' four categories
  // doesn't fan out four Monday round-trips just for aliases.
  const applyAliases = (files: SectionFile[], aliases: Record<string, string>): SectionFile[] =>
    files.map(f => aliases[f.assetId] ? { ...f, name: aliases[f.assetId] } : f);

  if (category === 'all') {
    const configured = getAllConfiguredColumns();
    if (configured.length === 0) {
      return NextResponse.json(
        { error: 'No section columns configured', hint: 'POST /api/admin/setup-doc-columns to bootstrap.' },
        { status: 503 },
      );
    }
    const aliases = await fetchAliases(id);
    const all: SectionFile[] = [];
    for (const { category: cat, columnId } of configured) {
      try {
        const files = await listFiles(id, cat, columnId);
        all.push(...applyAliases(files, aliases));
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
    const [files, aliases] = await Promise.all([
      listFiles(id, category, columnId),
      fetchAliases(id),
    ]);
    return NextResponse.json(applyAliases(files, aliases));
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

  // Two upload modes:
  //  • multipart form-data — small files (≤~4.5MB) ride in the request body.
  //  • JSON { blobUrl, name } — large files were uploaded straight to Vercel
  //    Blob by the browser (bypassing Vercel's 4.5MB function-body cap that
  //    otherwise 413s the request). We pull the file server-side (no inbound
  //    limit on a server fetch) and delete the temp blob afterwards.
  let file: File | null = null;
  let tempBlobUrl: string | null = null;
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => null)) as { blobUrl?: string; name?: string } | null;
    const blobUrl = body?.blobUrl;
    const name = body?.name;
    if (!blobUrl || !name) return NextResponse.json({ error: 'Missing blobUrl or name' }, { status: 400 });
    try {
      const fileRes = await fetch(blobUrl);
      if (!fileRes.ok) throw new Error(`blob fetch ${fileRes.status}`);
      const buf = await fileRes.arrayBuffer();
      file = new File([buf], name, { type: fileRes.headers.get('content-type') || 'application/octet-stream' });
      tempBlobUrl = blobUrl;
    } catch (err) {
      console.error(`[section-files POST ${category}] blob fetch failed:`, err);
      return NextResponse.json({ error: 'Could not retrieve the uploaded file' }, { status: 502 });
    }
  } else {
    let formData: FormData;
    try { formData = await request.formData(); }
    catch { return NextResponse.json({ error: 'Invalid multipart body' }, { status: 400 }); }
    file = formData.get('file') as File | null;
  }
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
    // Monday now owns the file — delete the temporary Blob copy (best-effort).
    if (tempBlobUrl) {
      try { const { del } = await import('@vercel/blob'); await del(tempBlobUrl); }
      catch (e) { console.error('[section-files] temp blob cleanup failed:', e); }
    }
    return NextResponse.json(newFile, { status: 201 });
  } catch (err) {
    console.error(`[section-files POST ${category}] failed:`, err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 502 });
  }
}

// ── DELETE ─────────────────────────────────────────────────────────
// Remove the documents in a section. Monday's file columns expose no reliable
// per-file remove primitive, so we clear the whole column (clear_all) — for a
// single-document section that IS "remove this file"; the UI confirms when more
// than one file would be cleared. Links (the docs long_text column) are
// untouched — this only clears the section's Monday file column.
export async function DELETE(
  _request: NextRequest,
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
  try {
    await mondayGql(
      `mutation ($cv: JSON!) {
        change_multiple_column_values(board_id: ${CLIENTS_BOARD_ID}, item_id: ${id}, column_values: $cv) { id }
      }`,
      { cv: JSON.stringify({ [columnId]: { clear_all: true } }) },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[section-files DELETE ${category}] failed:`, err);
    return NextResponse.json({ error: 'Remove failed' }, { status: 502 });
  }
}
