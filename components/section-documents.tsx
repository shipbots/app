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
import { Loader2, Upload, ExternalLink, FileText, Paperclip } from 'lucide-react';

interface SectionFile {
  assetId: string;
  name: string;
  url: string;
  createdAt: string;
  fileType: string;
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
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'unconfigured' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!clientBoardItemId) { setStatus('idle'); return; }
    setStatus('loading');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/client/${clientBoardItemId}/section-files/${category}`);
      if (res.status === 503) { setStatus('unconfigured'); setFiles([]); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setFiles(Array.isArray(data) ? data : []);
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
        throw new Error(body?.error || `${res.status}`);
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

  if (!clientBoardItemId) return null;

  return (
    <section className="mt-3 rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(20,24,40,.04)] p-3">
      <header className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Paperclip className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />
          <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wider truncate">{label}</h4>
          {files.length > 0 && (
            <span className="text-[10px] font-bold bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 leading-none">
              {files.length}
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

      {status === 'ready' && (
        <div className="space-y-2">
          {/* Drop zone stays visible even with files present — matches
              the affordance reps expect from other doc dashboards and
              makes it obvious this is an upload target. */}
          <label
            htmlFor={`section-docs-file-${category}`}
            onDragOver={e => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`block rounded-md border-2 border-dashed cursor-pointer transition-colors px-3 py-3 text-center ${
              dragActive
                ? 'border-[#43c7ff] bg-[#e6f8ff]'
                : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
            }`}
          >
            <Upload className={`w-4 h-4 mx-auto mb-1 ${dragActive ? 'text-[#015280]' : 'text-gray-400'}`} />
            <p className="text-[11px] text-gray-600">
              <span className="font-semibold text-[#015280]">Click to choose</span> or drop a file here
            </p>
            <input
              ref={inputRef}
              id={`section-docs-file-${category}`}
              type="file"
              className="sr-only"
              onChange={e => {
                const f = e.currentTarget.files?.[0];
                if (f) void upload(f);
                e.currentTarget.value = ''; // allow re-picking the same file
              }}
            />
          </label>

          {files.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic px-1">
              No documents yet — attach one above.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 border border-gray-100 rounded-md">
              {files.map(f => (
                <li key={f.assetId} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-[12px] text-gray-800 truncate" title={f.name}>{f.name}</span>
                  </div>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-[#0071BC] hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
                    >
                      Open
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
