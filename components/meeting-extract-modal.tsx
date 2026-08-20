'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Loader2, Check, AlertCircle } from 'lucide-react';

interface Proposal {
  key: string;
  columnId: string;
  label: string;
  section: string;
  kind: string;
  valueType: string;
  current: string;
  suggested: string;
  isNew: boolean;
  reasoning: string;
  options?: string[];
}

interface Props {
  clientId: string; // Clients-board item id
  transcriptId: string;
  meetingTitle: string;
  open: boolean;
  onClose: () => void;
  /** Called after changes are applied, with { clientInfoKey: value } to merge locally. */
  onApplied?: (patch: Record<string, string>) => void;
}

/** The endpoint streams keepalive bytes then appends the JSON result after this
 *  marker. Early error/note responses are plain JSON (no marker). */
async function readExtractResult(
  res: Response,
): Promise<{ updates?: Proposal[]; note?: string }> {
  const text = res.body
    ? await (async () => {
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        let out = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          out += dec.decode(value, { stream: true });
        }
        return out;
      })()
    : await res.text();
  const marker = '__RESULT__';
  const idx = text.lastIndexOf(marker);
  if (idx !== -1) return JSON.parse(text.slice(idx + marker.length));
  let d: { error?: string; updates?: Proposal[]; note?: string };
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error(text.trim().slice(0, 200) || `Request failed (${res.status})`);
  }
  if (d.error) throw new Error(d.error);
  return d;
}

export function MeetingExtractModal({ clientId, transcriptId, meetingTitle, open, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setNote('');
    setProposals([]);
    setDoneCount(null);
    fetch(`/api/client/${clientId}/extract-from-meeting`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcriptId }),
    })
      .then(async (r) => {
        const d = await readExtractResult(r);
        const ups: Proposal[] = d.updates ?? [];
        setProposals(ups);
        setNote(d.note || '');
        // New (empty) fields pre-selected; changes to existing info start unchecked
        // so they must be explicitly approved.
        setSelected(new Set(ups.filter((p) => p.isNew).map((p) => p.key)));
        setEdited(Object.fromEntries(ups.map((p) => [p.key, p.suggested])));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Extraction failed'))
      .finally(() => setLoading(false));
  }, [open, clientId, transcriptId]);

  if (!open) return null;

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const newOnes = proposals.filter((p) => p.isNew);
  const changes = proposals.filter((p) => !p.isNew);

  const apply = async () => {
    const chosen = proposals.filter((p) => selected.has(p.key));
    if (chosen.length === 0) return;
    setApplying(true);
    const patch: Record<string, string> = {};
    let ok = 0;
    for (const p of chosen) {
      const value = (edited[p.key] ?? p.suggested).trim();
      try {
        const res = await fetch(`/api/client/${clientId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ columnId: p.columnId, value, valueType: p.valueType }),
        });
        if (res.ok) {
          ok += 1;
          patch[p.key] = value;
        }
      } catch {
        /* keep going */
      }
    }
    setApplying(false);
    setDoneCount(ok);
    if (ok > 0) onApplied?.(patch);
  };

  const renderValueEditor = (p: Proposal) => {
    const val = edited[p.key] ?? p.suggested;
    const set = (v: string) => setEdited((e) => ({ ...e, [p.key]: v }));
    if ((p.kind === 'status' || p.kind === 'dropdown') && p.options?.length) {
      return (
        <select value={val} onChange={(e) => set(e.target.value)}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm bg-white focus:border-[#43c7ff] focus:outline-none">
          {p.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    if (p.kind === 'long') {
      return (
        <textarea value={val} onChange={(e) => set(e.target.value)} rows={3}
          className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[#43c7ff] focus:outline-none" />
      );
    }
    return (
      <input type={p.kind === 'date' ? 'date' : 'text'} value={val} onChange={(e) => set(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-[#43c7ff] focus:outline-none" />
    );
  };

  const row = (p: Proposal) => (
    <div key={p.key} className={`rounded-lg border p-2.5 ${selected.has(p.key) ? 'border-[#43c7ff] bg-[#f5fcff]' : 'border-gray-200'}`}>
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected.has(p.key)} onChange={() => toggle(p.key)} className="mt-1 accent-[#015280] w-4 h-4 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">{p.label}</span>
            <span className="text-[10px] uppercase tracking-wide text-gray-400">{p.section}</span>
          </div>
          {!p.isNew && p.current && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
              <span className="font-semibold">Currently:</span> {p.current}
            </div>
          )}
          <div className="mt-1.5">{renderValueEditor(p)}</div>
          {p.reasoning && <div className="text-[11px] text-gray-400 mt-1 italic">{p.reasoning}</div>}
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center gap-2 text-white min-w-0">
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span className="font-semibold text-sm truncate">Add info from: {meetingTitle || 'meeting'}</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          {loading && (
            <div className="py-10 flex flex-col items-center justify-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin text-[#015280]" />
              <p className="text-sm mt-3">Reading the transcript and matching it to fields…</p>
            </div>
          )}

          {!loading && error && (
            <div className="py-8 flex flex-col items-center text-center text-red-600">
              <AlertCircle className="w-6 h-6 mb-2" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!loading && !error && doneCount !== null && (
            <div className="py-8 flex flex-col items-center text-center text-green-700">
              <Check className="w-7 h-7 mb-2" />
              <p className="text-sm font-medium">Applied {doneCount} update{doneCount === 1 ? '' : 's'} to Client Info.</p>
              <button type="button" onClick={onClose} className="mt-4 px-4 py-2 text-sm font-semibold rounded-lg text-white" style={{ background: 'var(--brand-navy)' }}>Done</button>
            </div>
          )}

          {!loading && !error && doneCount === null && (
            <>
              {proposals.length === 0 ? (
                <div className="py-8 text-center text-gray-500 text-sm">
                  {note || 'No new information was found in this meeting.'}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    Review the suggestions from this meeting, then Apply. New fields are pre-checked; <span className="font-semibold">changes to existing info are left unchecked so you can double-check them first.</span> Edit any value inline.
                  </p>

                  {newOnes.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">New information ({newOnes.length})</div>
                      <div className="space-y-2">{newOnes.map(row)}</div>
                    </div>
                  )}

                  {changes.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Changes to existing info ({changes.length}) — review before applying</div>
                      <div className="space-y-2">{changes.map(row)}</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {!loading && !error && doneCount === null && proposals.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex-shrink-0">
            <span className="text-xs text-gray-500">{selected.size} of {proposals.length} selected</span>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100">Cancel</button>
              <button type="button" onClick={apply} disabled={applying || selected.size === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--brand-navy)' }}>
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Apply {selected.size > 0 ? selected.size : ''} to Client Info
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
