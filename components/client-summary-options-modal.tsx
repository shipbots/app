'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileDown, X, Plus, Pencil, Trash2, Check, Loader2 } from 'lucide-react';
import { HELP_ARTICLE_OPTIONS, HELP_ARTICLE_KEYS } from '@/lib/help-article-list';
import type { CustomArticle } from '@/lib/custom-articles-store';

interface Props {
  clientId: string;
  clientName?: string;
  open: boolean;
  onClose: () => void;
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `a-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

/** Collects optional agent input (note / next steps / tech-demo date), which
 *  guides to attach as links, custom checklist items, and manages the team's
 *  saved custom articles. "Generate" opens the printable summary with these as
 *  query params. Everything is optional. */
export function ClientSummaryOptionsModal({ clientId, clientName, open, onClose }: Props) {
  const [note, setNote] = useState('');
  const [steps, setSteps] = useState('');
  const [demoDate, setDemoDate] = useState('');
  const [checkItems, setCheckItems] = useState('');

  // Built-in guides (all selected by default).
  const [selectedBuiltin, setSelectedBuiltin] = useState<Set<string>>(new Set(HELP_ARTICLE_KEYS));

  // Team-shared custom articles.
  const [custom, setCustom] = useState<CustomArticle[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<Set<string>>(new Set());
  const [storeReady, setStoreReady] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Add / edit form
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // reset one-off inputs each open; keep saved custom list fresh
    setErr('');
    fetch('/api/help-articles/custom')
      .then((r) => r.json())
      .then((d: { articles?: CustomArticle[]; storeReady?: boolean }) => {
        const arts = d.articles ?? [];
        setCustom(arts);
        setSelectedCustom(new Set(arts.map((a) => a.id)));
        setStoreReady(d.storeReady !== false);
      })
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const toggle = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const persist = async (list: CustomArticle[]) => {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/help-articles/custom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articles: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      setCustom(data.articles as CustomArticle[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const submitArticle = async () => {
    const n = name.trim();
    const u = url.trim();
    if (!n || !u) return;
    let list: CustomArticle[];
    let id = editingId;
    if (editingId) {
      list = custom.map((a) => (a.id === editingId ? { ...a, name: n, url: u } : a));
    } else {
      id = uid();
      list = [...custom, { id, name: n, url: u }];
    }
    try {
      await persist(list);
      if (id) setSelectedCustom((s) => new Set(s).add(id!));
      setName('');
      setUrl('');
      setEditingId(null);
    } catch {
      /* err shown */
    }
  };

  const editArticle = (a: CustomArticle) => {
    setEditingId(a.id);
    setName(a.name);
    setUrl(a.url);
  };

  const deleteArticle = async (id: string) => {
    try {
      await persist(custom.filter((a) => a.id !== id));
      setSelectedCustom((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      if (editingId === id) {
        setEditingId(null);
        setName('');
        setUrl('');
      }
    } catch {
      /* err shown */
    }
  };

  const generate = () => {
    const params = new URLSearchParams();
    if (note.trim()) params.set('note', note.trim());
    if (steps.trim()) params.set('steps', steps.trim());
    if (demoDate.trim()) params.set('demo', demoDate.trim());
    if (checkItems.trim()) params.set('checkitems', checkItems.trim());
    params.set('articles', [...selectedBuiltin].join(','));
    params.set('custom', [...selectedCustom].join(','));
    window.open(`/client-summary/${clientId}?${params.toString()}`, '_blank', 'noopener');
    onClose();
  };

  const field =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#43c7ff] focus:outline-none focus:ring-1 focus:ring-[#43c7ff]';

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[88vh] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center gap-2 text-white">
            <FileDown className="w-4 h-4" />
            <span className="font-semibold text-sm">After-Onboarding Summary</span>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-gray-500 -mt-1">
            Add anything you&apos;d like the client to see{clientName ? ` on ${clientName}'s summary` : ''}. All fields
            are optional.
          </p>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Custom note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              placeholder="e.g. Great call today — excited to get your first shipment in!" className={field} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Next steps</span>
            <span className="text-[11px] text-gray-400"> — one per line</span>
            <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={2}
              placeholder={'Send us your product barcodes\nConfirm your packaging preference'} className={field} />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Agreed tech-demo date</span>
            <input type="date" value={demoDate} onChange={(e) => setDemoDate(e.target.value)}
              className={`${field} w-auto`} />
          </label>

          {/* ── Guides to include (as links) ─────────────────────────────── */}
          <div className="pt-1">
            <div className="text-xs font-semibold text-gray-700 mb-1.5">Help guides to include (as links)</div>
            <div className="space-y-1.5">
              {HELP_ARTICLE_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={selectedBuiltin.has(o.key)}
                    onChange={() => toggle(selectedBuiltin, o.key, setSelectedBuiltin)}
                    className="accent-[#015280] w-4 h-4" />
                  {o.label}
                </label>
              ))}
              {custom.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm text-gray-700 group">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                    <input type="checkbox" checked={selectedCustom.has(a.id)}
                      onChange={() => toggle(selectedCustom, a.id, setSelectedCustom)}
                      className="accent-[#015280] w-4 h-4 flex-shrink-0" />
                    <span className="truncate" title={a.url}>{a.name} <span className="text-gray-400">· custom</span></span>
                  </label>
                  <button type="button" onClick={() => editArticle(a)} className="text-gray-400 hover:text-[#015280] flex-shrink-0" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => deleteArticle(a.id)} className="text-gray-400 hover:text-red-500 flex-shrink-0" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add / edit a custom article */}
            <div className="mt-2 rounded-lg border border-dashed border-gray-300 p-2.5 space-y-2">
              <div className="text-[11px] font-semibold text-gray-500">
                {editingId ? 'Edit custom guide' : 'Add a custom guide'}
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Guide name (e.g. How to use Loop returns)"
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#43c7ff] focus:outline-none" />
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://help.shipbots.com/…"
                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#43c7ff] focus:outline-none" />
              <div className="flex items-center gap-2">
                <button type="button" onClick={submitArticle} disabled={!name.trim() || !url.trim() || saving}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md text-white bg-[#015280] hover:opacity-90 disabled:opacity-40">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : editingId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {editingId ? 'Save' : 'Add & save'}
                </button>
                {editingId && (
                  <button type="button" onClick={() => { setEditingId(null); setName(''); setUrl(''); }}
                    className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-500 hover:bg-gray-100">
                    Cancel
                  </button>
                )}
                {!storeReady && <span className="text-[11px] text-amber-600">Saving disabled (storage not configured)</span>}
                {err && <span className="text-[11px] text-red-500">{err}</span>}
              </div>
            </div>
          </div>

          {/* ── Extra checklist items ────────────────────────────────────── */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Extra checklist items</span>
            <span className="text-[11px] text-gray-400"> — one per line</span>
            <textarea value={checkItems} onChange={(e) => setCheckItems(e.target.value)} rows={2}
              placeholder={'Integrate returns platform (Loop / Redo)\nSet up wholesale EDI'} className={field} />
          </label>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3.5 bg-gray-50 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={generate}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white transition-colors shadow-sm hover:opacity-90"
            style={{ background: 'var(--brand-navy)' }}>
            <FileDown className="w-4 h-4" />
            Generate summary
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
