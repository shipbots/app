/**
 * BOL (Bill of Lading) records — shared storage on the Clients board.
 *
 * Mirrors the sticky-notes model: one long_text column on the Clients board
 * holds a JSON array of BOL records for a client, and the actual document
 * image lives in a Monday file column (durable, unlike the local-disk
 * /api/documents store which doesn't survive on Vercel).
 *
 * Two env vars, both created by POST /api/admin/setup-bol-columns:
 *   MONDAY_BOL_COL_ID        — long_text column holding the JSON records
 *   MONDAY_BOL_FILES_COL_ID  — file column the document images upload into
 */

export interface BolRecord {
  id: string;
  /** ISO timestamp — when the BOL was uploaded to the dashboard. */
  uploadedAt: string;
  /** The date printed on the BOL document itself (YYYY-MM-DD), if known. */
  bolDate: string;
  /** Number of pallets, if the user (or AI) captured it. */
  palletCount: string;
  /** Free-form "BOL Notes" summary — AI-extracted info, editable by the user. */
  notes: string;
  /** Email of the person who uploaded it (stamped server-side from the session). */
  authorEmail: string;
  /** Monday asset id of the uploaded image. */
  fileAssetId: string;
  /** Public URL of the uploaded image. */
  fileUrl: string;
  /** Original filename of the uploaded image. */
  fileName: string;
}

export const BOL_COL_ENV = 'MONDAY_BOL_COL_ID';
export const BOL_FILES_COL_ENV = 'MONDAY_BOL_FILES_COL_ID';

export function getBolColumnId(): string | null {
  const id = process.env[BOL_COL_ENV];
  return id && id.trim() ? id.trim() : null;
}

export function getBolFilesColumnId(): string | null {
  const id = process.env[BOL_FILES_COL_ENV];
  return id && id.trim() ? id.trim() : null;
}

/** Parse the raw long_text column value into a BOL record array. Tolerant of
 *  malformed/empty values — returns [] rather than throwing. */
export function parseBolRecords(raw: string | null | undefined): BolRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is BolRecord => !!r && typeof r === 'object' && typeof (r as BolRecord).id === 'string',
    );
  } catch {
    return [];
  }
}
