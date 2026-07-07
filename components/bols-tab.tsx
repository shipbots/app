'use client';

/**
 * BOLs tab — lists a client's uploaded Bills of Lading (Customer Service).
 * Presentational: the client detail panel fetches the records (cached) and
 * passes them in, mirroring the meetings / emails / POs tabs.
 */

import { Loader2, Truck, ExternalLink, Package, Calendar, Upload as UploadIcon, User } from 'lucide-react';
import type { BolRecord } from '@/lib/bol';

function shortDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BolsTab({
  bols,
  loading,
  error,
}: {
  bols: BolRecord[];
  loading: boolean;
  error?: string | null;
}) {
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        <span className="ml-2 text-sm text-gray-400">Loading BOLs…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <Truck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">BOLs aren&apos;t set up yet</p>
        <p className="text-xs text-gray-400 mt-1">{error}</p>
      </div>
    );
  }

  if (bols.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Truck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">No BOLs yet</p>
        <p className="text-xs text-gray-400 mt-1">
          Add one from the BOL Uploader mini app in Customer Service.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)] space-y-3">
      {bols.map(bol => (
        <div key={bol.id} className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Truck className="w-4 h-4 text-[#1d4ed8] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {bol.bolDate ? `BOL · ${shortDate(bol.bolDate)}` : 'BOL'}
                </p>
                <p className="text-[11px] text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="inline-flex items-center gap-1">
                    <UploadIcon className="w-3 h-3" /> {shortDate(bol.uploadedAt)}
                  </span>
                  {bol.authorEmail && (
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3 h-3" /> {bol.authorEmail}
                    </span>
                  )}
                  {bol.palletCount && (
                    <span className="inline-flex items-center gap-1">
                      <Package className="w-3 h-3" /> {bol.palletCount} pallet{bol.palletCount === '1' ? '' : 's'}
                    </span>
                  )}
                </p>
              </div>
            </div>
            {bol.fileUrl && (
              <a
                href={bol.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md border border-gray-200 text-[#015280] hover:bg-[#f0fbff]"
                title="Open BOL document"
              >
                <ExternalLink className="w-3 h-3" /> View
              </a>
            )}
          </div>

          {bol.notes && (
            <p className="mt-2 text-xs text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-2">
              {bol.notes}
            </p>
          )}

          {!bol.bolDate && !bol.notes && !bol.palletCount && (
            <p className="mt-1 text-[11px] text-gray-400 italic flex items-center gap-1">
              <Calendar className="w-3 h-3" /> No details captured
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
