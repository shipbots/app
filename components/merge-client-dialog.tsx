'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Search, X } from 'lucide-react';

import { CLIENT_GROUP_EXITED } from '@/lib/constants';
import type { ClientIndexEntry } from '@/lib/client-search';
import { refreshClientSearchIndex, useClientSearchIndex } from '@/hooks/use-client-search-index';

interface MergePlan {
  keepId: string;
  keepName: string;
  dropId: string;
  dropName: string;
  changes: { columnId: string; title: string; value: string }[];
}

/**
 * Merge the client being viewed with another (duplicate) client. The kept
 * client survives and is backfilled with the other's values for any field it's
 * missing; the other client is deleted (soft delete → Monday Recycle Bin).
 */
export function MergeClientDialog({
  currentId, currentName, onClose, onMerged,
}: {
  currentId: string;
  currentName: string;
  onClose: () => void;
  onMerged: (survivingId: string) => void;
}) {
  const { rows, status } = useClientSearchIndex();
  const [query, setQuery] = useState('');
  const [otherId, setOtherId] = useState<string | null>(null);
  const [keepCurrent, setKeepCurrent] = useState(true);
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const otherEntry = useMemo(() => (rows ?? []).find(r => r.id === otherId) ?? null, [rows, otherId]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (rows ?? []).filter(r => r.id !== currentId);
    const match = (r: ClientIndexEntry) =>
      [r.name, r.legalEntity, r.storeName, r.shipHeroName, r.contactName, r.contactEmail]
        .some(f => (f || '').toLowerCase().includes(q));
    return (q ? list.filter(match) : list).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [rows, query, currentId]);

  const keepId = keepCurrent ? currentId : (otherId ?? '');
  const dropId = keepCurrent ? (otherId ?? '') : currentId;
  const keepName = keepCurrent ? currentName : (otherEntry?.name ?? '');
  const dropName = keepCurrent ? (otherEntry?.name ?? '') : currentName;

  // Load the merge plan (dry run) whenever the pair / direction changes.
  useEffect(() => {
    if (!otherId) { setPlan(null); return; }
    let cancelled = false;
    setPlanning(true);
    setError('');
    setConfirmText('');
    fetch('/api/client/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, dropId, dryRun: true }),
    })
      .then(async res => {
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) { setError(data?.error || 'Could not preview the merge.'); setPlan(null); }
        else setPlan(data as MergePlan);
      })
      .catch(() => { if (!cancelled) setError('Could not preview the merge.'); })
      .finally(() => { if (!cancelled) setPlanning(false); });
    return () => { cancelled = true; };
  }, [otherId, keepId, dropId]);

  const canMerge = !!otherId && !busy && !planning && confirmText.trim().toLowerCase() === dropName.trim().toLowerCase() && !!dropName;

  const doMerge = async () => {
    if (!canMerge) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/client/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, dropId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error || 'Merge failed.'); setBusy(false); return; }
      refreshClientSearchIndex();
      onMerged(keepId);
    } catch {
      setError('Merge failed. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-base font-semibold text-gray-900">Merge with another client</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Combine a duplicate into <span className="font-medium text-gray-800">{currentName}</span>. One client is kept and
            backfilled with the other&rsquo;s info; the other is deleted (recoverable from Monday&rsquo;s Recycle Bin).
          </p>

          {/* Step 1 — pick the other client */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">1 · Duplicate client</label>
            {otherId ? (
              <div className="mt-1 flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <span className="text-sm font-medium text-gray-900">{otherEntry?.name || otherId}</span>
                <button onClick={() => { setOtherId(null); setPlan(null); }} className="text-xs text-blue-600 hover:underline">Change</button>
              </div>
            ) : (
              <>
                <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input
                    autoFocus
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search clients to merge in…"
                    className="flex-1 text-sm outline-none"
                  />
                </div>
                <div className="mt-1 max-h-52 overflow-y-auto rounded-lg border border-gray-100 divide-y divide-gray-50">
                  {status === 'loading' && <div className="px-3 py-3 text-sm text-gray-400">Loading clients…</div>}
                  {status !== 'loading' && results.length === 0 && (
                    <div className="px-3 py-3 text-sm text-gray-400">No clients found.</div>
                  )}
                  {results.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setOtherId(r.id); setKeepCurrent(true); }}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50/60 flex items-center justify-between gap-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 truncate">{r.name}</span>
                        <span className="block text-xs text-gray-400 truncate">{[r.legalEntity, r.contactName].filter(Boolean).join(' · ') || r.contactEmail || '—'}</span>
                      </span>
                      {r.groupId === CLIENT_GROUP_EXITED && <span className="text-[10px] font-medium text-gray-400 uppercase">Inactive</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Step 2 — which name/record to keep */}
          {otherId && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">2 · Keep which client</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[{ keep: true, name: currentName }, { keep: false, name: otherEntry?.name || '' }].map(opt => {
                  const on = keepCurrent === opt.keep;
                  return (
                    <button
                      key={String(opt.keep)}
                      onClick={() => setKeepCurrent(opt.keep)}
                      className={`text-left rounded-lg border px-3 py-2 transition ${on ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{on ? 'Kept' : 'Keep'}</span>
                      <span className="block text-sm font-medium text-gray-900 truncate">{opt.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3 — preview + confirm */}
          {otherId && (
            <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium text-gray-900 truncate">{keepName}</span>
                <ArrowRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="text-gray-500 truncate">delete <span className="font-medium text-red-600">{dropName}</span></span>
              </div>

              {planning && <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> Building preview…</div>}

              {!planning && plan && (
                plan.changes.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{plan.changes.length} empty field{plan.changes.length === 1 ? '' : 's'} on <span className="font-medium">{keepName}</span> will be filled from <span className="font-medium">{dropName}</span>:</p>
                    <ul className="max-h-40 overflow-y-auto text-xs text-gray-700 space-y-0.5">
                      {plan.changes.map(c => (
                        <li key={c.columnId} className="flex gap-1.5">
                          <span className="text-gray-400 flex-shrink-0">{c.title}:</span>
                          <span className="truncate">{c.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No empty fields to fill — <span className="font-medium">{keepName}</span> already has all its data. The other client will just be deleted.</p>
                )
              )}

              <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>Tasks, files and the onboarding record attached to <span className="font-medium">{dropName}</span> are not transferred. Keep the client that has the onboarding record. The deleted client can be restored from Monday&rsquo;s Recycle Bin.</span>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Type <span className="font-semibold text-gray-800">{dropName || '…'}</span> to confirm deletion</label>
                <input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={dropName}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={onClose} className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={doMerge}
            disabled={!canMerge}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Merge &amp; delete
          </button>
        </div>
      </div>
    </div>
  );
}
