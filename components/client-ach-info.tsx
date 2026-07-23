'use client';

/**
 * ACH / bank details for the Billing Info tab. Reads from (and writes back to)
 * the "Client Billing Info" Monday board, matched to the client by the board
 * relation. Every field is editable inline; the ACH document can be uploaded /
 * replaced, and uploading a PDF (or scan) auto-fills the fields — the server
 * extracts them from the file and writes them to the board. If a client has no
 * record yet, it's created (named + linked to the client) on first add / upload.
 *
 * All endpoints are gated to the DocuSign-access group (same as the Billing tab).
 */

import { useEffect, useRef, useState } from 'react';
import { Landmark, FileText, Loader2, Eye, Pencil, Check, Upload, Plus } from 'lucide-react';
import { FilePreviewModal, type PreviewableFile } from './file-preview-modal';

type AchField = 'financialInstitution' | 'accountNumber' | 'routingNumber' | 'firstName' | 'lastName';

interface AchData {
  found: boolean;
  itemId?: string;
  accountNumber?: string;
  routingNumber?: string;
  financialInstitution?: string;
  firstName?: string;
  lastName?: string;
  doc?: PreviewableFile | null;
}

// One inline-editable ACH text field. Click to edit; Enter / blur saves via
// PATCH /api/client/ach; Escape cancels.
function EditableAchField({
  itemId,
  field,
  label,
  value: initial,
  mono,
  onSaved,
}: {
  itemId: string;
  field: AchField;
  label: string;
  value: string;
  mono?: boolean;
  onSaved: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null);

  useEffect(() => { setValue(initial); setSaved(initial); }, [initial]);

  const commit = async () => {
    setEditing(false);
    const next = value.trim();
    if (next === saved.trim()) { setValue(saved); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/client/ach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, field, value: next }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setSaved(next);
      setValue(next);
      onSaved(next);
      setFlash('ok');
    } catch {
      setFlash('err');
      setValue(saved); // revert on failure
    } finally {
      setSaving(false);
      setTimeout(() => setFlash(null), 2000);
    }
  };

  if (editing) {
    return (
      <div className="px-1 py-1.5">
        <p className="text-[11px] leading-none mb-1 text-gray-400">{label}</p>
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') { setValue(saved); setEditing(false); }
            }}
            onBlur={commit}
            className={`flex-1 min-w-0 text-sm border border-[#43c7ff] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] ${mono ? 'font-mono tracking-tight' : ''}`}
          />
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 flex-shrink-0" />}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full text-left px-1 py-1.5 rounded hover:bg-gray-50 transition-colors group flex items-start gap-2"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-none mb-0.5 text-gray-400">{label}</p>
        {value ? (
          <p className={`text-sm text-gray-900 break-words ${mono ? 'font-mono tracking-tight' : ''}`}>{value}</p>
        ) : (
          <p className="text-sm text-gray-400 italic">Not on file — click to add</p>
        )}
      </div>
      {saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mt-0.5 flex-shrink-0" />
      ) : flash === 'ok' ? (
        <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
      ) : (
        <Pencil className="w-3 h-3 text-gray-300 group-hover:text-[#43c7ff] mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      {flash === 'err' && <span className="text-[11px] text-red-500 mt-0.5">!</span>}
    </button>
  );
}

export function ClientAchInfo({ clientBoardItemId, clientName }: { clientBoardItemId: string; clientName: string }) {
  const [data, setData] = useState<AchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<PreviewableFile | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const createRecord = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/client/ach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientBoardItemId, clientName }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      if (d.itemId) {
        setData({
          found: true, itemId: d.itemId,
          accountNumber: '', routingNumber: '', financialInstitution: '',
          firstName: '', lastName: '', doc: null,
        });
      }
    } catch { /* best-effort */ } finally { setCreating(false); }
  };

  // Upload the ACH form. The endpoint creates the record (linked to the client)
  // if there isn't one, uploads the file, and extracts the fields from it — so
  // this doubles as "add ACH details from the form".
  const uploadDoc = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (data?.itemId) form.append('itemId', data.itemId);
      form.append('clientId', clientBoardItemId);
      form.append('clientName', clientName);
      const res = await fetch('/api/client/ach/file', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      const ex: Partial<AchData> = d.extracted || {};
      setData(prev => {
        const base: AchData = prev && prev.found ? prev : { found: true };
        return {
          ...base,
          found: true,
          itemId: d.itemId || base.itemId,
          // Extraction wrote these to the board — reflect them (fall back to any
          // existing value when the form didn't yield that field).
          financialInstitution: ex.financialInstitution || base.financialInstitution || '',
          accountNumber: ex.accountNumber || base.accountNumber || '',
          routingNumber: ex.routingNumber || base.routingNumber || '',
          firstName: ex.firstName || base.firstName || '',
          lastName: ex.lastName || base.lastName || '',
          doc: {
            name: d.name || file.name,
            url: d.url || '',
            fileType: (file.name.split('.').pop() || 'pdf').toLowerCase(),
            assetId: String(d.assetId || ''),
          },
        };
      });
    } catch { /* best-effort */ } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const hiddenFileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".pdf,image/*"
      className="hidden"
      onChange={e => { const f = e.target.files?.[0]; if (f) void uploadDoc(f); }}
    />
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

  // No record yet — offer to add manually or upload the form (which creates the
  // record, uploads, and auto-fills the fields).
  if (!data?.found || !data.itemId) {
    return (
      <div>
        {header}
        <p className="px-1 py-1.5 text-sm text-gray-400 italic">No ACH information on file for this client.</p>
        {hiddenFileInput}
        <div className="flex items-center gap-2 ml-1 mt-0.5 flex-wrap">
          <button
            type="button"
            onClick={createRecord}
            disabled={creating || uploading || !clientName}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#015280] border border-[#43c7ff] bg-[#e6f8ff] hover:bg-[#d6f1ff] px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Add ACH details
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || creating || !clientName}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Upload ACH form
          </button>
        </div>
        <p className="ml-1 mt-1 text-[10px] text-gray-400">Uploading a PDF or scan auto-fills the fields from the form.</p>
      </div>
    );
  }

  const itemId = data.itemId;

  return (
    <div>
      {header}
      {/* Two columns: bank details on the left, signer on the right. */}
      <div className="grid grid-cols-2 gap-x-3 items-start">
        <div className="min-w-0">
          <EditableAchField itemId={itemId} field="financialInstitution" label="🏦 Financial Institution" value={data.financialInstitution || ''} onSaved={v => setData(p => p ? { ...p, financialInstitution: v } : p)} />
          <EditableAchField itemId={itemId} field="accountNumber" label="🔢 Account Number" value={data.accountNumber || ''} mono onSaved={v => setData(p => p ? { ...p, accountNumber: v } : p)} />
          <EditableAchField itemId={itemId} field="routingNumber" label="🔀 Routing Number" value={data.routingNumber || ''} mono onSaved={v => setData(p => p ? { ...p, routingNumber: v } : p)} />
        </div>
        <div className="min-w-0">
          <EditableAchField itemId={itemId} field="firstName" label="✍️ Signer First Name" value={data.firstName || ''} onSaved={v => setData(p => p ? { ...p, firstName: v } : p)} />
          <EditableAchField itemId={itemId} field="lastName" label="✍️ Signer Last Name" value={data.lastName || ''} onSaved={v => setData(p => p ? { ...p, lastName: v } : p)} />
        </div>
      </div>

      {/* ACH document — preview + upload / replace (upload re-extracts fields) */}
      {hiddenFileInput}
      <div className="mt-1 flex items-center gap-2 px-1 py-1.5 border-t border-gray-100">
        <FileText className="w-3.5 h-3.5 text-[#0071BC] flex-shrink-0" />
        {data.doc ? (
          <button
            type="button"
            onClick={() => setPreview(data.doc ?? null)}
            className="text-sm text-[#015280] font-medium truncate flex-1 text-left hover:underline"
          >
            {data.doc.name || 'ACH document'}
          </button>
        ) : (
          <span className="text-sm text-gray-400 italic flex-1">No document on file</span>
        )}
        <div className="flex items-center gap-1 flex-shrink-0">
          {data.doc && (
            <button
              type="button"
              onClick={() => setPreview(data.doc ?? null)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0071BC] bg-[#e6f8ff] px-2 py-0.5 rounded-full"
            >
              <Eye className="w-3 h-3" /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-2 py-0.5 rounded-full disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {data.doc ? 'Replace' : 'Upload'}
          </button>
        </div>
      </div>
      {uploading && (
        <p className="px-1 text-[10px] text-gray-400">Uploading &amp; reading the form…</p>
      )}

      <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
