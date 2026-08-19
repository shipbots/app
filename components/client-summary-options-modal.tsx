'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, X } from 'lucide-react';

interface Props {
  clientId: string;
  clientName?: string;
  open: boolean;
  onClose: () => void;
}

/** Collects optional agent input, then opens the printable summary with those
 *  values as query params. Everything is optional — "Generate" with all fields
 *  blank produces the fully-automatic summary. */
export function ClientSummaryOptionsModal({ clientId, clientName, open, onClose }: Props) {
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState('');
  const [demoDate, setDemoDate] = useState('');

  if (!open) return null;

  const generate = () => {
    const params = new URLSearchParams();
    if (note.trim()) params.set('note', note.trim());
    if (steps.trim()) params.set('steps', steps.trim());
    if (demoDate.trim()) params.set('demo', demoDate.trim());
    const qs = params.toString();
    window.open(`/client-summary/${clientId}${qs ? `?${qs}` : ''}`, '_blank', 'noopener');
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center gap-2 text-white">
            <FileDown className="w-4 h-4" />
            <span className="font-semibold text-sm">After-Onboarding Summary</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500 -mt-1">
            Add anything you&apos;d like the client to see{clientName ? ` on ${clientName}'s summary` : ''}. All fields
            are optional — leave them blank for a fully automatic summary.
          </p>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Custom note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Great call today — excited to get your first shipment in!"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#43c7ff] focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Next steps</span>
            <span className="text-[11px] text-gray-400"> — one per line</span>
            <textarea
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              placeholder={'Send us your product barcodes\nConfirm your packaging preference\nBook your tech demo'}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#43c7ff] focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Agreed tech-demo date</span>
            <input
              type="date"
              value={demoDate}
              onChange={(e) => setDemoDate(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#43c7ff] focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              If set, it shows on the Tech Demo checklist item instead of the booking link.
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 bg-gray-50 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={generate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors shadow-sm hover:opacity-90"
            style={{ background: 'var(--brand-navy)' }}
          >
            <FileDown className="w-4 h-4" />
            Generate summary
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
