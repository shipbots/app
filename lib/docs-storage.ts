/**
 * Server-only helpers for reading + writing the docs long_text column
 * on Monday (MONDAY_DOCUMENTS_COL_ID). Both link JSON and file-name
 * aliases share this one column so section-files rename works with no
 * additional bootstrap step.
 *
 * Storage shape (v2):
 *   { links: ClientDocument[], aliases: Record<assetId, displayName> }
 *
 * Historic blobs stored just the bare link array (v1). readAll()
 * handles both shapes; writers always emit v2.
 */

import { fetchClientColumn, updateClientField } from '@/lib/monday';
import type { ClientDocument } from '@/app/api/documents/[clientId]/route';

export type DocsBlob = { links: ClientDocument[]; aliases: Record<string, string> };

export async function readAll(clientId: string, colId: string): Promise<DocsBlob> {
  const raw = await fetchClientColumn(clientId, colId);
  if (!raw) return { links: [], aliases: {} };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return {
        links: parsed.filter((d: unknown): d is ClientDocument =>
          !!d && typeof (d as ClientDocument).id === 'string'),
        aliases: {},
      };
    }
    if (parsed && typeof parsed === 'object') {
      const links = Array.isArray((parsed as DocsBlob).links)
        ? (parsed as DocsBlob).links.filter((d: unknown): d is ClientDocument =>
            !!d && typeof (d as ClientDocument).id === 'string')
        : [];
      const aliasesIn = (parsed as DocsBlob).aliases;
      const aliases: Record<string, string> = {};
      if (aliasesIn && typeof aliasesIn === 'object') {
        for (const [k, v] of Object.entries(aliasesIn)) {
          if (typeof v === 'string' && v.trim()) aliases[k] = v.trim();
        }
      }
      return { links, aliases };
    }
    return { links: [], aliases: {} };
  } catch {
    return { links: [], aliases: {} };
  }
}

export async function writeLinks(
  clientId: string, colId: string, links: ClientDocument[],
): Promise<void> {
  const { aliases } = await readAll(clientId, colId);
  await updateClientField(clientId, colId, JSON.stringify({ links, aliases }));
}

export async function writeAliases(
  clientId: string, colId: string, aliases: Record<string, string>,
): Promise<void> {
  const { links } = await readAll(clientId, colId);
  await updateClientField(clientId, colId, JSON.stringify({ links, aliases }));
}
