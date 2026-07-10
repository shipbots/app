'use client';

/**
 * Full-screen file preview. Renders PDFs / images inline via a
 * signed public URL (Monday's assets query returns time-limited
 * signed links); for other file types (docs, sheets, arbitrary
 * binaries) it falls back to a friendly "preview not available"
 * card that links out to a new tab.
 *
 * Escape / backdrop-click / X-button close. Header keeps an "Open
 * in new tab" affordance next to close so reps can still get to
 * the raw file if the inline preview isn't enough (e.g. wanting
 * to save-as, print, or paste into another tool).
 */

import { useEffect, useState } from 'react';
import { X, ExternalLink, FileText, Download, Loader2 } from 'lucide-react';

export interface PreviewableFile {
  name: string;
  url: string;
  fileType?: string;
  /**
   * Monday asset id. When present, the modal renders through
   * /api/asset-proxy instead of the raw signed URL — Monday serves
   * assets with Content-Disposition: attachment, which forces a
   * download instead of an inline render. The proxy re-streams with
   * `inline` so PDFs/images display, and `download=1` gives the
   * Download button a same-origin attachment URL.
   */
  assetId?: string;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic']);
const PDF_EXTS = new Set(['pdf']);

// A real file extension: short and alphanumeric. Filters out garbage
// like a whole alias name ("wholesale instructions") or Monday's
// literal fileType value "ASSET".
const EXT_SHAPE = /^[a-z0-9]{1,6}$/;

// Detection order: explicit fileType (the API derives it from the
// original Monday filename, surviving display-alias renames) → the
// display name's suffix (only when it actually contains a dot) → the
// URL's pathname. Renamed files ("Wholesale Instructions" for
// invoice.pdf) used to fall through to "not previewable" because the
// old code trusted the alias's last dot-segment unconditionally.
function extOf(name: string, fileType?: string, url?: string): string {
  const fromType = (fileType || '').toLowerCase().replace(/^\./, '');
  if (EXT_SHAPE.test(fromType) && fromType !== 'asset') return fromType;

  if (name.includes('.')) {
    const fromName = (name.split('.').pop() || '').toLowerCase().split('?')[0].trim();
    if (EXT_SHAPE.test(fromName)) return fromName;
  }

  if (url) {
    try {
      const path = new URL(url).pathname;
      if (path.includes('.')) {
        const fromUrl = (path.split('.').pop() || '').toLowerCase();
        if (EXT_SHAPE.test(fromUrl)) return fromUrl;
      }
    } catch { /* malformed URL — no signal */ }
  }
  return '';
}

export function FilePreviewModal({ file, onClose }: { file: PreviewableFile | null; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onClose]);

  // Force a save-as instead of navigating. The `download` attribute is
  // ignored on cross-origin URLs (Monday's signed S3 links), so we pull
  // the bytes into a blob and download the object URL. If the host
  // blocks CORS fetches, fall back to opening the raw URL in a new tab
  // — S3 attachment headers usually trigger a download there anyway.
  const downloadFile = async () => {
    if (!file || downloading) return;
    // Monday assets: the proxy's download=1 variant is same-origin with
    // an attachment disposition — a plain anchor click saves with the
    // right filename, no blob fetch needed.
    if (file.assetId) {
      const a = document.createElement('a');
      a.href = `/api/asset-proxy?assetId=${encodeURIComponent(file.assetId)}&download=1`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = file.name || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(obj);
    } catch {
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  if (!file) return null;
  const ext = extOf(file.name, file.fileType, file.url);
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = PDF_EXTS.has(ext);
  const canInline = isImage || isPdf;
  // Monday assets must render through the proxy — the raw signed URL
  // carries Content-Disposition: attachment and downloads instead of
  // displaying. Links / non-Monday files keep their original URL.
  const inlineUrl = file.assetId
    ? `/api/asset-proxy?assetId=${encodeURIComponent(file.assetId)}`
    : file.url;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] h-[90vh] max-w-[1200px] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate min-w-0" title={file.name}>
            {file.name}
          </h3>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => void downloadFile()}
              disabled={downloading}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#01416a] px-2.5 py-1 rounded disabled:opacity-60"
            >
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {downloading ? 'Downloading…' : 'Download'}
            </button>
            <a
              href={inlineUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-gray-600 hover:text-[#015280] px-2 py-1 rounded hover:bg-gray-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 min-h-0 bg-gray-50 overflow-auto flex items-center justify-center">
          {isImage ? (
            <img
              src={inlineUrl}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={inlineUrl}
              className="w-full h-full border-0"
              title={file.name}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-8 text-center max-w-md">
              <FileText className="w-14 h-14 text-gray-300" />
              <p className="text-sm text-gray-700 font-medium">Preview not available for this file type</p>
              <p className="text-xs text-gray-500">
                Inline preview supports PDFs and images. Open the file in a new tab to view it.
              </p>
              <a
                href={inlineUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-[#015280] hover:bg-[#01416a] text-white text-sm font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in new tab
              </a>
            </div>
          )}
        </div>
        {canInline && (
          <footer className="border-t border-gray-100 px-4 py-1.5 text-[10px] text-gray-400 flex-shrink-0">
            Esc to close · Click outside to dismiss
          </footer>
        )}
      </div>
    </div>
  );
}
