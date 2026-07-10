'use client';

/**
 * Per-section file uploader used inside Client Info sections
 * (Receiving, Packing, Returns). Files upload to the section's Monday
 * file column via /api/client/[id]/section-files/[category] and also
 * show up aggregated in the general Docs tab through the same route
 * with category='all'.
 *
 * Design goals:
 *   - Make the drop zone obvious even when empty so reps notice they
 *     can attach a file directly from the section they're reading.
 *   - Small footprint — the section already has a lot of fields, so
 *     the uploader is a compact card, not a full-height panel.
 *   - No delete from the app (Monday doesn't expose a safe per-file
 *     remove primitive). Reps can open the client on Monday to remove
 *     a file; it disappears here on next refresh.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, FileText, Paperclip, Pencil, Check, X as XIcon, Eye, Link2, ExternalLink } from 'lucide-react';
import { FilePreviewModal, type PreviewableFile } from './file-preview-modal';

interface SectionFile {
  assetId: string;
  name: string;
  url: string;
  createdAt: string;
  fileType: string;
}

// Link doc from /api/documents/[clientId]?category=… — the subset of
// ClientDocument this component needs.
interface SectionLink {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export function SectionDocuments({
  clientBoardItemId,
  category,
  label,
  hint,
}: {
  clientBoardItemId: string | null | undefined;
  /** Matches the API route segment — 'receiving' | 'packing' | 'returns'. */
  category: 'receiving' | 'packing' | 'returns' | 'documents';
  /** Section-specific heading, e.g. "Receiving documents". */
  label: string;
  /** Optional one-line hint under the header. */
  hint?: string;
}) {
  const [files, setFiles] = useState<SectionFile[]>([]);
  const [links, setLinks] = useState<SectionLink[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  // Add-link inline form (name + URL). Links save to the shared docs
  // long_text column tagged with this section's category, so they
  // show up here AND in the Docs tab list.
  const [addingLink, setAddingLink] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkNameRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!clientBoardItemId) { setStatus('idle'); return; }
    setStatus('loading');
    setErrorMsg('');
    try {
      // Files (Monday file column) + links (docs long_text column,
      // filtered to this category) fetched together. A link-storage
      // failure shouldn't blank the file list, so links soft-fail
      // to [] instead of throwing.
      const [fileRes, linkList] = await Promise.all([
        fetch(`/api/client/${clientBoardItemId}/section-files/${category}`),
        fetch(`/api/documents/${clientBoardItemId}?category=${category}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => []),
      ]);
      if (fileRes.status === 503) { setStatus('unconfigured'); setFiles([]); return; }
      if (!fileRes.ok) throw new Error(`${fileRes.status}`);
      const data = await fileRes.json();
      setFiles(Array.isArray(data) ? data : []);
      setLinks(Array.isArray(linkList) ? linkList : []);
      setStatus('ready');
    } catch (err) {
      console.error(`[section-docs ${category}] load failed:`, err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Load failed');
    }
  }, [clientBoardItemId, category]);

  useEffect(() => { void load(); }, [load]);

  const upload = useCallback(async (file: File) => {
    if (!clientBoardItemId || uploading) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/client/${clientBoardItemId}/section-files/${category}`, {
        method: 'POST',
        body: fd,
      });
      if (res.status === 503) { setStatus('unconfigured'); return; }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Include the status code so surface errors are diagnosable
        // ("502: column not found" is much more actionable than the
        // bare "Upload failed" the user was seeing).
        throw new Error(body?.error ? `${body.error} (HTTP ${res.status})` : `Upload failed (HTTP ${res.status})`);
      }
      // Optimistically prepend, then refetch so we see the exact
      // shape (createdAt, public url) Monday returns.
      const optimistic = (await res.json()) as SectionFile;
      setFiles(prev => [optimistic, ...prev]);
      setTimeout(() => { void load(); }, 400);
    } catch (err) {
      console.error(`[section-docs ${category}] upload failed:`, err);
      setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [clientBoardItemId, category, uploading, load]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void upload(f);
  };

  const openLinkForm = () => {
    setAddingLink(true);
    setLinkName('');
    setLinkUrl('');
    setTimeout(() => linkNameRef.current?.focus(), 30);
  };
  const cancelLinkForm = () => {
    setAddingLink(false);
    setLinkName('');
    setLinkUrl('');
  };
  const submitLink = async () => {
    const name = linkName.trim();
    const url = linkUrl.trim();
    if (!name) { setErrorMsg('Enter a name for the link'); return; }
    if (!url) { setErrorMsg('Enter the URL'); return; }
    if (!clientBoardItemId || savingLink) return;
    setSavingLink(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/documents/${clientBoardItemId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, name, category }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error ? `${body.error} (HTTP ${res.status})` : `Save failed (HTTP ${res.status})`);
      }
      setLinks(prev => [body as SectionLink, ...prev]);
      cancelLinkForm();
    } catch (err) {
      console.error(`[section-docs ${category}] add-link failed:`, err);
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingLink(false);
    }
  };

  if (!clientBoardItemId) return null;

  return (
    <section className="mt-3 rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(20,24,40,.04)] p-3">
      <header className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Paperclip className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />
          <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider truncate">{label}</h4>
          {(files.length + links.length) > 0 && (
            <span className="text-[10px] font-bold bg-[#0071BC] text-white rounded-full px-1.5 py-0.5 leading-none">
              {files.length + links.length}
            </span>
          )}
        </div>
        {status === 'ready' && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#EAF3FA] text-[#0071BC] text-[11px] font-semibold hover:bg-[#d0e6f5] disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        )}
      </header>

      {hint && (
        <p className="text-[11px] text-gray-500 mb-2 -mt-1">{hint}</p>
      )}

      {status === 'unconfigured' && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-900">
          Storage not configured yet. Ask an admin to run the docs setup from the Docs tab.
        </div>
      )}

      {status === 'error' && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-800">
          {errorMsg || 'Failed to load documents'}
        </div>
      )}

      {status === 'loading' && (
        <div className="flex items-center gap-2 text-[11px] text-gray-400 px-1 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Loading…
        </div>
      )}

      {status === 'ready' && errorMsg && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] text-rose-800 mb-2">
          {errorMsg}
        </div>
      )}

      {status === 'ready' && addingLink && (
        <div className="mb-2 rounded-md border border-[#43c7ff]/50 bg-[#e6f8ff]/40 p-2 space-y-1.5">
          <input
            ref={linkNameRef}
            type="text"
            placeholder="Link name (e.g. Wholesale Instructions)"
            value={linkName}
            onChange={e => setLinkName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancelLinkForm(); }}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
          />
          <input
            type="url"
            placeholder="https://…"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void submitLink();
              if (e.key === 'Escape') cancelLinkForm();
            }}
            className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={cancelLinkForm}
              disabled={savingLink}
              className="px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitLink()}
              disabled={savingLink || !linkName.trim() || !linkUrl.trim()}
              className="px-2.5 py-0.5 text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded inline-flex items-center gap-1 disabled:opacity-60"
            >
              {savingLink && <Loader2 className="w-3 h-3 animate-spin" />}
              Save link
            </button>
          </div>
        </div>
      )}

      {status === 'ready' && (
        // Two-column layout: files + links on the left, add-targets on
        // the right (upload square + add-link square stacked). Docs own
        // the visual weight so reps first see what's on file.
        <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
          <div>
            {files.length === 0 && links.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic px-1 py-1">
                No documents yet — add a file or link on the right.
              </p>
            ) : (
              // Each doc is its own tinted card with a solid left accent
              // in the brand blue — attached docs must register at a
              // glance, not read as just another form row.
              <ul className="space-y-1.5">
                {files.map(f => (
                  <FileRow
                    key={f.assetId}
                    file={f}
                    clientBoardItemId={clientBoardItemId}
                    onRenamed={(newName) => setFiles(prev => prev.map(x =>
                      x.assetId === f.assetId ? { ...x, name: newName } : x
                    ))}
                    onPreview={() => setPreviewFile({ name: f.name, url: f.url, fileType: f.fileType, assetId: f.assetId })}
                  />
                ))}
                {links.map(l => (
                  <li key={l.id} className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#EAF3FA]/70 border border-[#0071BC]/20 border-l-4 border-l-[#0071BC]">
                    <Link2 className="w-5 h-5 text-[#0071BC] flex-shrink-0" />
                    <span className="flex-1 min-w-0 text-[13px] font-medium text-gray-900 truncate" title={l.url}>
                      {l.name}
                    </span>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#0071BC] hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
                    >
                      Open
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Add-targets column: file drop-zone on top, add-link below.
              Fixed footprint so reps always know where to look. */}
          <div className="flex flex-col gap-2 flex-shrink-0">
            <label
              htmlFor={`section-docs-file-${category}`}
              onDragOver={e => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              className={`w-24 h-24 rounded-md border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center text-center ${
                dragActive
                  ? 'border-[#43c7ff] bg-[#e6f8ff]'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
              title="Click or drop a file here to attach it to this section"
            >
              <Upload className={`w-5 h-5 mb-1 ${dragActive ? 'text-[#015280]' : 'text-gray-400'}`} />
              <p className="text-[10px] text-gray-600 leading-tight px-1">
                <span className="font-semibold text-[#015280]">Add</span><br/>document
              </p>
              <input
                ref={inputRef}
                id={`section-docs-file-${category}`}
                type="file"
                className="sr-only"
                onChange={e => {
                  const f = e.currentTarget.files?.[0];
                  if (f) void upload(f);
                  e.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => addingLink ? cancelLinkForm() : openLinkForm()}
              className={`w-24 rounded-md border-2 border-dashed transition-colors flex items-center justify-center gap-1 py-1.5 ${
                addingLink
                  ? 'border-[#43c7ff] bg-[#e6f8ff] text-[#015280]'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600'
              }`}
              title="Attach a link (Google Doc, Sheet, any URL) to this section"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span className="text-[10px] font-semibold">Add link</span>
            </button>
          </div>
        </div>
      )}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </section>
  );
}

// ── FileRow ────────────────────────────────────────────────────────
// One row per uploaded file. Bigger FileText icon so reps can tell at
// a glance a document is attached. Click the pencil to rename — the
// alias is stored in the shared docs long_text column and shows up
// everywhere the file appears (this section AND the Docs tab
// aggregated list) because both endpoints apply aliases on read.
// Click Preview to open an inline modal (PDFs/images); the modal
// itself still offers an "Open in new tab" for full-window viewing.
function FileRow({
  file,
  clientBoardItemId,
  onRenamed,
  onPreview,
}: {
  file: SectionFile;
  clientBoardItemId: string;
  onRenamed: (newName: string) => void;
  onPreview: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const [saving, setSaving] = useState(false);
  const [renameError, setRenameError] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(file.name); }, [file.name]);
  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.select(), 30);
  }, [editing]);

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === file.name) { setEditing(false); return; }
    setSaving(true);
    setRenameError('');
    try {
      // GET current alias map, patch this asset's entry, PUT back.
      // Fetching first avoids clobbering aliases another rep just set.
      const cur = await fetch(`/api/documents/${clientBoardItemId}/aliases`);
      const curBody = await cur.json().catch(() => ({}));
      if (!cur.ok) throw new Error(curBody?.error || `${cur.status}`);
      const next = { ...(curBody.aliases || {}), [file.assetId]: trimmed };
      const put = await fetch(`/api/documents/${clientBoardItemId}/aliases`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliases: next }),
      });
      const putBody = await put.json().catch(() => ({}));
      if (!put.ok) throw new Error(putBody?.error || `${put.status}`);
      onRenamed(trimmed);
      setEditing(false);
    } catch (err) {
      console.error('[FileRow rename] failed:', err);
      setRenameError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-[#EAF3FA]/70 border border-[#0071BC]/20 border-l-4 border-l-[#0071BC]">
      {/* Bigger icon so it's obvious there's a document attached. */}
      <FileText className="w-5 h-5 text-[#0071BC] flex-shrink-0" />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') { setDraft(file.name); setEditing(false); setRenameError(''); }
              }}
              disabled={saving}
              className="flex-1 min-w-0 text-[13px] border border-[#43c7ff] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] bg-white"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="p-1 rounded hover:bg-emerald-50 text-emerald-600 disabled:opacity-50"
              title="Save"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            </button>
            <button
              type="button"
              onClick={() => { setDraft(file.name); setEditing(false); setRenameError(''); }}
              disabled={saving}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-50"
              title="Cancel"
            >
              <XIcon className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="group flex items-center gap-1.5 min-w-0">
            <span className="text-[13px] font-medium text-gray-900 truncate" title={file.name}>{file.name}</span>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#015280] transition-opacity flex-shrink-0"
              title="Rename"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
        {renameError && (
          <p className="text-[10px] text-rose-600 mt-0.5">{renameError}</p>
        )}
      </div>
      {file.url && !editing && (
        <button
          type="button"
          onClick={onPreview}
          className="text-[11px] text-[#0071BC] hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
          title="Preview inline (PDF / image)"
        >
          <Eye className="w-3 h-3" />
          Preview
        </button>
      )}
    </li>
  );
}
