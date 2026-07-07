'use client';

/**
 * BOL Uploader mini app.
 *
 * Flow: pick a client → upload or photograph a Bill of Lading → Claude reads
 * it and pre-fills an editable "BOL Notes" summary + document date + pallet
 * count → save. The image is stored on the client's Monday record and the
 * record shows up under the client's "BOLs" tab in Customer Service.
 *
 * See app/api/client/[id]/bols (store) and .../bols/extract (AI pre-fill).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft, Upload, Camera, Loader2, Check, Sparkles, Truck, Search, X,
} from 'lucide-react';

interface ClientOption { id: string; name: string }

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function BolUploaderApp({ onBack }: { onBack: () => void }) {
  const { data: session } = useSession();
  const uploaderEmail = session?.user?.email ?? '';

  // ── Client list ──────────────────────────────────────────────────────────
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientId, setClientId] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    fetch('/api/onboarding-items', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { items?: Array<{ name: string; clientBoardItemId?: string | null }> }) => {
        const byId = new Map<string, string>();
        for (const it of data.items ?? []) {
          if (it.clientBoardItemId && !byId.has(it.clientBoardItemId)) {
            byId.set(it.clientBoardItemId, it.name);
          }
        }
        setClients(
          [...byId.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false));
  }, []);

  const selectedClient = clients.find(c => c.id === clientId) ?? null;
  const filteredClients = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    const list = q ? clients.filter(c => c.name.toLowerCase().includes(q)) : clients;
    return list.slice(0, 50);
  }, [clients, clientQuery]);

  // ── File + extraction ──────────────────────────────────────────────────────
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);

  const [bolDate, setBolDate] = useState('');
  const [palletCount, setPalletCount] = useState('');
  const [notes, setNotes] = useState('');

  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when the preview changes / unmounts.
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  const onFileChosen = async (f: File | null) => {
    if (!f) return;
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    setSaveState('idle');
    void runExtraction(f);
  };

  const runExtraction = async (f: File) => {
    setExtracting(true);
    setExtractNote(null);
    try {
      const fd = new FormData();
      fd.append('file', f, f.name);
      // clientId is optional for extraction; use a placeholder route segment.
      const res = await fetch(`/api/client/${encodeURIComponent(clientId || 'x')}/bols/extract`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractNote(data.error || 'AI could not read this file — fill the fields manually.');
        return;
      }
      // Only fill empties so we don't clobber edits the user already made.
      if (data.bolDate) setBolDate(prev => prev || data.bolDate);
      if (data.palletCount) setPalletCount(prev => prev || String(data.palletCount));
      if (data.notes) setNotes(prev => prev || data.notes);
      setExtractNote('AI filled in what it could read — review and edit below.');
    } catch {
      setExtractNote('AI extraction failed — fill the fields manually.');
    } finally {
      setExtracting(false);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');

  const canSave = !!clientId && !!file && saveState !== 'saving';

  const save = async () => {
    if (!canSave || !file) return;
    setSaveState('saving');
    setSaveError('');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('bolDate', bolDate);
      fd.append('palletCount', palletCount);
      fd.append('notes', notes);
      const res = await fetch(`/api/client/${encodeURIComponent(clientId)}/bols`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const resetForNext = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setBolDate('');
    setPalletCount('');
    setNotes('');
    setExtractNote(null);
    setSaveState('idle');
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (saveState === 'saved') {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center px-6">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">BOL saved</h2>
        <p className="text-sm text-gray-500 mb-6">
          Filed to <span className="font-medium">{selectedClient?.name}</span>. It&apos;s now under the
          client&apos;s <span className="font-medium">BOLs</span> tab.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetForNext}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-90"
            style={{ background: 'var(--brand-navy)' }}
          >
            Upload another
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <button type="button" onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100" title="Back to Mini Apps">
          <ArrowLeft className="w-4 h-4 text-gray-600" />
        </button>
        <Truck className="w-5 h-5" style={{ color: '#1d4ed8' }} />
        <h1 className="text-base font-semibold text-gray-900">BOL Uploader</h1>
      </div>

      <div className="max-w-xl mx-auto p-4 space-y-5">
        {/* 1. Client */}
        <section>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            1. Which client is this BOL for?
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:border-gray-400"
            >
              <span className={selectedClient ? 'text-gray-900' : 'text-gray-400'}>
                {clientsLoading ? 'Loading clients…' : selectedClient ? selectedClient.name : 'Select a client…'}
              </span>
              <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </button>
            {pickerOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                <div className="p-2 border-b border-gray-100">
                  <input
                    autoFocus
                    value={clientQuery}
                    onChange={e => setClientQuery(e.target.value)}
                    placeholder="Search clients…"
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-[#43c7ff]"
                  />
                </div>
                <ul className="max-h-56 overflow-y-auto py-1">
                  {filteredClients.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-gray-400">No clients found</li>
                  ) : (
                    filteredClients.map(c => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => { setClientId(c.id); setPickerOpen(false); setClientQuery(''); }}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#e6f8ff] ${
                            c.id === clientId ? 'font-semibold text-[#015280] bg-[#e6f8ff]' : 'text-gray-700'
                          }`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* 2. Document */}
        <section>
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
            2. BOL document
          </label>
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => onFileChosen(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-[#43c7ff] hover:bg-[#f0fbff]"
            >
              <Upload className="w-4 h-4" /> Upload picture
            </button>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:border-[#43c7ff] hover:bg-[#f0fbff]"
            >
              <Camera className="w-4 h-4" /> Take a picture
            </button>
          </div>

          {file && (
            <div className="mt-3 flex items-start gap-3 p-2.5 rounded-lg border border-gray-200 bg-gray-50">
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="BOL preview" className="w-16 h-16 object-cover rounded-md flex-shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-md bg-white border border-gray-200 flex items-center justify-center text-[10px] text-gray-400 flex-shrink-0">
                  PDF
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-800 truncate">{file.name}</p>
                {extracting ? (
                  <p className="text-xs text-[#015280] flex items-center gap-1 mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Reading with AI…
                  </p>
                ) : (
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => runExtraction(file)}
                      className="text-xs text-[#015280] inline-flex items-center gap-1 hover:underline"
                    >
                      <Sparkles className="w-3 h-3" /> Re-read with AI
                    </button>
                    <button
                      type="button"
                      onClick={resetForNext}
                      className="text-xs text-gray-400 inline-flex items-center gap-1 hover:text-gray-600"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </div>
                )}
                {extractNote && !extracting && (
                  <p className="text-[11px] text-gray-500 mt-1">{extractNote}</p>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 3. Details */}
        <section className="space-y-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
            3. Details
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Date on the BOL</label>
              <input
                type="date"
                value={bolDate}
                onChange={e => setBolDate(e.target.value)}
                className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#43c7ff]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1"># of pallets</label>
              <input
                type="text"
                inputMode="numeric"
                value={palletCount}
                onChange={e => setPalletCount(e.target.value)}
                placeholder="e.g. 12"
                className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#43c7ff]"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">BOL Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              placeholder="Carrier, BOL/PRO number, piece count, weight, anything notable…"
              className="w-full px-2.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-[#43c7ff] resize-y"
            />
          </div>
        </section>

        {saveState === 'error' && (
          <p className="text-sm text-red-600">{saveError}</p>
        )}

        {/* Save */}
        <div className="flex items-center justify-between pt-1 pb-4">
          <p className="text-[11px] text-gray-400">
            {uploaderEmail ? `Uploading as ${uploaderEmail}` : ''}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            style={{ background: 'var(--brand-navy)' }}
          >
            {saveState === 'saving' ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <>Save BOL</>}
          </button>
        </div>
      </div>
    </div>
  );
}
