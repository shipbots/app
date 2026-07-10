/**
 * Per-section document storage — maps a user-facing "category" to the
 * Monday file column that holds the uploads. Each column is a plain
 * Monday `file` column on the Clients board; uploads use the existing
 * add_file_to_column mutation (same one the DocuSign flow uses).
 *
 * Env vars, set via /api/admin/setup-doc-columns bootstrap:
 *   MONDAY_DOCUMENTS_FILE_COL_ID   → general Docs tab uploads
 *   MONDAY_RECEIVING_DOCS_COL_ID   → Client Info → Receiving section
 *   MONDAY_PACKING_DOCS_COL_ID     → Client Info → Packing & Shipping
 *   MONDAY_RETURNS_DOCS_COL_ID     → Client Info → Returns
 *
 * The corresponding Monday column titles (created by the bootstrap):
 *   "Documents", "Receiving Documents", "Packing Documents",
 *   "Returns Reference Document"
 *
 * Client-side never knows the ids — it passes a category string and the
 * server routes it through this helper.
 */

export type DocCategory = 'documents' | 'receiving' | 'packing' | 'returns';
export const DOC_CATEGORIES: DocCategory[] = ['documents', 'receiving', 'packing', 'returns'];

interface CategoryMeta {
  envVar: string;
  columnTitle: string;
  /** Human label used in the setup UI + on the section headers. */
  label: string;
}

export const CATEGORY_META: Record<DocCategory, CategoryMeta> = {
  documents: {
    envVar: 'MONDAY_DOCUMENTS_FILE_COL_ID',
    columnTitle: 'Documents',
    label: 'General documents',
  },
  receiving: {
    envVar: 'MONDAY_RECEIVING_DOCS_COL_ID',
    columnTitle: 'Receiving Documents',
    label: 'Receiving documents',
  },
  packing: {
    envVar: 'MONDAY_PACKING_DOCS_COL_ID',
    columnTitle: 'Packing Documents',
    label: 'Packing documents',
  },
  returns: {
    envVar: 'MONDAY_RETURNS_DOCS_COL_ID',
    columnTitle: 'Returns Reference Document',
    label: 'Returns reference documents',
  },
};

export function isDocCategory(v: unknown): v is DocCategory {
  return typeof v === 'string' && (DOC_CATEGORIES as readonly string[]).includes(v);
}

export function getColumnIdFor(category: DocCategory): string | null {
  const envVar = CATEGORY_META[category].envVar;
  const id = process.env[envVar];
  if (!id || typeof id !== 'string') return null;
  return id.trim() || null;
}

export function getAllConfiguredColumns(): { category: DocCategory; columnId: string }[] {
  const out: { category: DocCategory; columnId: string }[] = [];
  for (const cat of DOC_CATEGORIES) {
    const id = getColumnIdFor(cat);
    if (id) out.push({ category: cat, columnId: id });
  }
  return out;
}
