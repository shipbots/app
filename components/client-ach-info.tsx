'use client';

/**
 * ACH / bank details for the Billing Info tab. Reads from the "Client Billing
 * Info" Monday board (matched by client name) via /api/client/ach — shows the
 * account / routing numbers, financial institution, the signer's name, and a
 * click-to-preview of the ACH document when one is on file.
 *
 * The route is gated to the DocuSign-access group (same as the Billing tab),
 * so this only renders inside a surface those users already see.
 */

import { useEffect, useState } from 'react';
import { Landmark, FileText, Loader2, Eye } from 'lucide-react';
import { FilePreviewModal, type PreviewableFile } from './file-preview-modal';

interface AchData {
  found: boolean;
  accountNumber?: string;
  routingNumber?: string;
  financialInstitution?: string;
  firstName?: string;
  lastName?: string;
  doc?: PreviewableFile | null;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="px-1 py-1.5">
      <p className="text-[11px] leading-none mb-0.5 text-gray-400">{label}</p>
      {value ? (
        <p className={`text-sm text-gray-900 break-words ${mono ? 'font-mono tracking-tight' : ''}`}>{value}</p>
      ) : (
        <p className="text-sm text-gray-400 italic">Not on file</p>
      )}
    </div>
  );
}

export function ClientAchInfo({ clientBoardItemId, clientName }: { clientBoardItemId: string; clientName: string }) {
  const [data, setData] = useState<AchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewableFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    // Match primarily by the client's Clients-board item id (the ACH item's
    // "✳️ CLIENTS" link); name is a fallback for items not linked yet.
    const qs = new URLSearchParams();
    if (clientBoardItemId) qs.set('clientId', clientBoardItemId);
    if (clientName) qs.set('name', clientName);
    fetch(`/api/client/ach?${qs.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(r => (r.ok ? r.json() : { found: false }))
      .then((d: AchData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ found: false }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clientBoardItemId, clientName]);

  const header = (
    <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
      <Landmark className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      <span className="text-xs font-semibold text-gray-700">ACH / Bank Account</span>
    </div>
  );

  if (loading) {
    return (
      <div>
        {header}
        <div className="flex items-center gap-2 px-1 py-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading ACH info…
        </div>
      </div>
    );
  }

  if (!data?.found) {
    return (
      <div>
        {header}
        <p className="px-1 py-1.5 text-sm text-gray-400 italic">No ACH information on file for this client.</p>
      </div>
    );
  }

  const signer = [data.firstName, data.lastName].filter(Boolean).join(' ').trim();

  return (
    <div>
      {header}
      <Row label="🏦 Financial Institution" value={data.financialInstitution || ''} />
      <Row label="🔢 Account Number" value={data.accountNumber || ''} mono />
      <Row label="🔀 Routing Number" value={data.routingNumber || ''} mono />
      <Row label="✍️ Signed by" value={signer} />

      {data.doc ? (
        <button
          type="button"
          onClick={() => setPreview(data.doc ?? null)}
          className="mt-1 flex items-center gap-2 px-1 py-1.5 w-full text-left rounded-lg hover:bg-gray-50 transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />
          <span className="text-sm text-[#015280] font-medium truncate flex-1">{data.doc.name || 'ACH document'}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071BC] bg-[#e6f8ff] px-2 py-0.5 rounded-full flex-shrink-0">
            <Eye className="w-3 h-3" /> Preview
          </span>
        </button>
      ) : (
        <div className="mt-1 flex items-center gap-2 px-1 py-1.5 text-xs text-gray-400">
          <FileText className="w-3.5 h-3.5" /> No document on file
        </div>
      )}

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
