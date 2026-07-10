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

import { useEffect } from 'react';
import { X, ExternalLink, FileText } from 'lucide-react';

export interface PreviewableFile {
  name: string;
  url: string;
  fileType?: string;
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic']);
const PDF_EXTS = new Set(['pdf']);

function extOf(name: string, fileType?: string): string {
  const fromName = (name.split('.').pop() || '').toLowerCase().split('?')[0];
  if (fromName) return fromName;
  return (fileType || '').toLowerCase();
}

export function FilePreviewModal({ file, onClose }: { file: PreviewableFile | null; onClose: () => void }) {
  useEffect(() => {
    if (!file) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [file, onClose]);

  if (!file) return null;
  const ext = extOf(file.name, file.fileType);
  const isImage = IMAGE_EXTS.has(ext);
  const isPdf = PDF_EXTS.has(ext);
  const canInline = isImage || isPdf;

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
            <a
              href={file.url}
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
              src={file.url}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={file.url}
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
                href={file.url}
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
