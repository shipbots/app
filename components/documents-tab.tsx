'use client';

import { useState, useEffect, useRef } from 'react';
import {
  FileText, Link2, Plus, Trash2, ExternalLink, Loader2,
  Upload, X, FileSpreadsheet, Presentation, HardDrive, File, Pencil, Check,
  ShieldCheck, AlertTriangle, RefreshCw,
} from 'lucide-react';
import type { ClientDocument } from '@/app/api/documents/[clientId]/route';
import type { MonFile, ClientInfo } from '@/lib/types';

interface DocumentsTabProps {
  clientId: string;
  /** DocuSign file stored on the Monday.com onboarding item */
  docusignFile?: MonFile | null;
  /** Client board item ID — used for extract-docusign and field PATCH calls */
  clientBoardItemId?: string | null;
  /** Onboarding item ID — used for file upload (add_file_to_column) */
  onboardingItemId?: string;
  /** Full client info — used to check if billing fields are already populated */
  clientInfo?: ClientInfo | null;
  /** Called after successful extraction so parent can refresh clientInfo state */
  onDocusignExtracted?: (updates: Partial<ClientInfo>) => void;
}

// ── Icon by doc type ─────────────────────────────────────────────────────────
function DocIcon({ icon, className = 'w-5 h-5' }: { icon: ClientDocument['docIcon']; className?: string }) {
  switch (icon) {
    case 'gdoc':    return <FileText        className={`${className} text-blue-500`} />;
    case 'gsheet':  return <FileSpreadsheet className={`${className} text-green-500`} />;
    case 'gslides': return <Presentation    className={`${className} text-yellow-500`} />;
    case 'gdrive':  return <HardDrive       className={`${className} text-blue-400`} />;
    case 'pdf':     return <FileText        className={`${className} text-red-500`} />;
    default:        return <File            className={`${className} text-gray-400`} />;
  }
}

// ── Add Link form ─────────────────────────────────────────────────────────────
function AddLinkForm({ clientId, onAdded, onCancel }: {
  clientId: string;
  onAdded: (doc: ClientDocument) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [url, setUrl]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = async () => {
    const trimUrl  = url.trim();
    const trimName = name.trim();
    if (!trimName) { setError('Please enter a document name'); return; }
    if (!trimUrl)  { setError('Please enter a URL'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/documents/${clientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimUrl, name: trimName }),
      });
      if (!res.ok) throw new Error();
      onAdded(await res.json());
    } catch {
      setError('Failed to save. Try again.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Link</p>

      {/* Document name — primary field */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Document Name <span className="text-red-400">*</span></label>
        <input
          ref={nameRef}
          type="text"
          placeholder="e.g. Client NDA, Product Catalog, Onboarding Checklist…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* URL — secondary field */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">URL <span className="text-red-400">*</span></label>
        <div className="relative">
          <Link2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="url"
            placeholder="Paste a link (Google Doc, Sheet, Drive…)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }}
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Save Link
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Upload form ───────────────────────────────────────────────────────────────
function UploadForm({ clientId, onAdded, onCancel }: {
  clientId: string;
  onAdded: (doc: ClientDocument) => void;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState<File | null>(null); // file selected, awaiting name
  const [name, setName]       = useState('');
  const [dragging, setDragging]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameRef      = useRef<HTMLInputElement>(null);

  // Focus name input once a file is picked
  useEffect(() => {
    if (pending) nameRef.current?.focus();
  }, [pending]);

  const pickFile = (file: File) => {
    setPending(file);
    setName(''); // clear any previous name
    setError('');
  };

  const upload = async () => {
    if (!pending) return;
    const trimName = name.trim();
    if (!trimName) { setError('Please enter a document name'); return; }

    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', pending);
      fd.append('name', trimName);
      const res = await fetch(`/api/documents/${clientId}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error();
      onAdded(await res.json());
    } catch {
      setError('Upload failed. Try again.');
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  };

  // ── Step 1: pick a file ──
  if (!pending) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload File</p>
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-5 cursor-pointer transition-colors text-sm ${
            dragging
              ? 'border-blue-400 bg-blue-50 text-blue-600'
              : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-500'
          }`}
        >
          <Upload className="w-4 h-4" />
          Drop a file here or click to browse
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Step 2: name the file ──
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upload File</p>

      {/* Selected file preview */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
        <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span className="truncate flex-1">{pending.name}</span>
        <button
          type="button"
          onClick={() => setPending(null)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
          title="Change file"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Document name */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-gray-600">Document Name <span className="text-red-400">*</span></label>
        <input
          ref={nameRef}
          type="text"
          placeholder="e.g. Signed Contract, Product Spec Sheet…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') upload(); if (e.key === 'Escape') onCancel(); }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={upload}
          disabled={uploading}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────
function DocRow({ doc, clientId, onDeleted, onRenamed }: {
  doc: ClientDocument;
  clientId: string;
  onDeleted: (id: string) => void;
  onRenamed: (id: string, name: string) => void;
}) {
  const [deleting, setDeleting]       = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName]     = useState(doc.name);
  const [saving, setSaving]           = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingName) inputRef.current?.focus(); }, [editingName]);

  const confirmDelete = async () => {
    if (!confirm(`Remove "${doc.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/documents/${clientId}?docId=${doc.id}`, { method: 'DELETE' });
      onDeleted(doc.id);
    } catch {
      setDeleting(false);
    }
  };

  const saveRename = async () => {
    setEditingName(false);
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === doc.name) { setDraftName(doc.name); return; }
    setSaving(true);
    try {
      await fetch(`/api/documents/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId: doc.id, name: trimmed }),
      });
      onRenamed(doc.id, trimmed);
    } catch {
      setDraftName(doc.name);
    } finally {
      setSaving(false);
    }
  };

  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-blue-100 hover:bg-gray-50/60 transition-colors">
      <DocIcon icon={doc.docIcon} className="w-5 h-5 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        {editingName ? (
          <input
            ref={inputRef}
            value={draftName}
            onChange={e => setDraftName(e.target.value)}
            onBlur={saveRename}
            onKeyDown={e => {
              if (e.key === 'Enter')  saveRename();
              if (e.key === 'Escape') { setDraftName(doc.name); setEditingName(false); }
            }}
            className="w-full text-sm font-medium border-b border-blue-400 focus:outline-none bg-transparent pb-0.5"
          />
        ) : (
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{draftName}</p>
            {saving
              ? <Loader2 className="w-3 h-3 text-gray-400 animate-spin flex-shrink-0" />
              : (
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-blue-400 flex-shrink-0"
                  title="Rename"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )
            }
          </div>
        )}
        <p className="text-[11px] text-gray-400 truncate mt-0.5">
          {doc.type === 'file' ? doc.fileName : doc.url} · {dateStr}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {editingName ? (
          <button
            type="button"
            onClick={saveRename}
            className="p-1 rounded hover:bg-green-50 text-gray-400 hover:text-green-500 transition-colors"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        ) : (
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
            title="Open"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          type="button"
          onClick={confirmDelete}
          disabled={deleting}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
          title="Remove"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── DocuSign section ──────────────────────────────────────────────────────────

/** Billing fields that may be overwritten by extraction */
const BILLING_FIELD_LABELS: Array<{ key: keyof ClientInfo; label: string }> = [
  { key: 'legalEntity',       label: 'Legal Entity' },
  { key: 'ein',               label: 'EIN' },
  { key: 'billingStreet1',    label: 'Billing Street 1' },
  { key: 'billingStreet2',    label: 'Billing Street 2' },
  { key: 'billingCity',       label: 'Billing City' },
  { key: 'billingState',      label: 'Billing State' },
  { key: 'billingZip',        label: 'Billing ZIP' },
  { key: 'billingCountry',    label: 'Billing Country' },
  { key: 'dateDocusignSigned', label: 'DocuSign Date' },
];

type DocuSignUploadState =
  | 'idle'
  | 'picking'    // file picker open
  | 'uploading'  // uploading to Monday.com
  | 'extracting' // running Anthropic extraction
  | 'confirming' // showing overwrite confirmation
  | 'applying'   // PATCHing Monday.com fields
  | 'done'
  | 'error';

interface ExtractedBilling {
  legalEntity?: string;
  ein?: string;
  billingStreet1?: string;
  billingStreet2?: string;
  billingCity?: string;
  billingState?: string;
  billingZip?: string;
  billingCountry?: string;
  dateDocusignSigned?: string;
}

function DocuSignSection({
  docusignFile,
  clientBoardItemId,
  onboardingItemId,
  clientInfo,
  onExtracted,
}: {
  docusignFile?: MonFile | null;
  clientBoardItemId?: string | null;
  onboardingItemId?: string;
  clientInfo?: ClientInfo | null;
  onExtracted?: (updates: Partial<ClientInfo>) => void;
}) {
  const [uploadState, setUploadState] = useState<DocuSignUploadState>('idle');
  const [error, setError]     = useState('');
  const [extracted, setExtracted] = useState<ExtractedBilling>({});
  const [populatedFields, setPopulatedFields] = useState<string[]>([]);
  const [pendingAssetId, setPendingAssetId]   = useState('');
  const [uploadedFileUrl, setUploadedFileUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Which billing fields already have values in Monday.com */
  const findPopulated = (extr: ExtractedBilling): string[] => {
    if (!clientInfo) return [];
    return BILLING_FIELD_LABELS
      .filter(({ key }) => {
        const existingVal = clientInfo[key] as string | undefined;
        const newVal = extr[key as keyof ExtractedBilling];
        // Only flag if both the current value AND the extracted value are non-empty
        return !!existingVal?.trim() && !!newVal?.trim();
      })
      .map(({ label }) => label);
  };

  const handleFileSelected = async (file: File) => {
    if (!onboardingItemId) {
      setError('No onboarding item ID — cannot upload.');
      return;
    }
    setError('');
    setUploadState('uploading');

    // Step 1: Upload to Monday.com files column
    let assetId = '';
    let fileUrl  = '';
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('columnId', 'files');
      const res  = await fetch(`/api/client/${onboardingItemId}/file`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Upload failed');
      assetId = data.assetId;
      fileUrl  = data.url || '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadState('error');
      return;
    }

    // Step 2: Extract billing info from PDF via Anthropic
    setUploadState('extracting');
    let extr: ExtractedBilling = {};
    try {
      const extractClientId = clientBoardItemId || onboardingItemId;
      const res  = await fetch(`/api/client/${extractClientId}/extract-docusign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      extr = data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
      setUploadState('error');
      return;
    }

    setPendingAssetId(assetId);
    setUploadedFileUrl(fileUrl);
    setExtracted(extr);

    // Step 3: Check if any billing fields are already populated
    const populated = findPopulated(extr);
    if (populated.length > 0) {
      setPopulatedFields(populated);
      setUploadState('confirming');
    } else {
      // No existing data — apply immediately
      await applyExtracted(extr, clientBoardItemId || onboardingItemId);
    }
  };

  const applyExtracted = async (extr: ExtractedBilling, targetClientId: string | undefined) => {
    if (!targetClientId) return;
    setUploadState('applying');

    const fieldMap: Array<{ columnId: string; value: string; isDate?: boolean }> = [
      { columnId: 'text_mktp4fvk', value: extr.legalEntity      || '' },
      { columnId: 'text_mkxxfg1b', value: extr.ein              || '' },
      { columnId: 'text_mkx5vzht', value: extr.billingStreet1   || '' },
      { columnId: 'text_mkx5f9p9', value: extr.billingStreet2   || '' },
      { columnId: 'text_mkx5z70k', value: extr.billingCity      || '' },
      { columnId: 'text_mkx5er1a', value: extr.billingState     || '' },
      { columnId: 'text_mkx5tjd7', value: extr.billingZip       || '' },
      { columnId: 'text_mkx5kyv4', value: extr.billingCountry   || '' },
      { columnId: 'date_mkw2fhte', value: extr.dateDocusignSigned || '', isDate: true },
    ];

    try {
      await Promise.all(
        fieldMap
          .filter(f => f.value)
          .map(f =>
            fetch(`/api/client/${targetClientId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ columnId: f.columnId, value: f.value, isDate: f.isDate }),
            })
          )
      );
      // Only pass fields that were actually extracted (non-empty) so the parent
      // doesn't accidentally overwrite existing values with undefined.
      const updates: Partial<ClientInfo> = {};
      if (extr.legalEntity)        updates.legalEntity        = extr.legalEntity;
      if (extr.ein)                updates.ein                = extr.ein;
      if (extr.billingStreet1)     updates.billingStreet1     = extr.billingStreet1;
      if (extr.billingStreet2)     updates.billingStreet2     = extr.billingStreet2;
      if (extr.billingCity)        updates.billingCity        = extr.billingCity;
      if (extr.billingState)       updates.billingState       = extr.billingState;
      if (extr.billingZip)         updates.billingZip         = extr.billingZip;
      if (extr.billingCountry)     updates.billingCountry     = extr.billingCountry;
      if (extr.dateDocusignSigned) updates.dateDocusignSigned = extr.dateDocusignSigned;
      onExtracted?.(updates);
      setUploadState('done');
      setTimeout(() => setUploadState('idle'), 4000);
    } catch {
      setError('Failed to save fields to Monday.com');
      setUploadState('error');
    }
  };

  const handleConfirmOverwrite = () => {
    applyExtracted(extracted, clientBoardItemId || onboardingItemId);
  };

  const handleCancelOverwrite = () => {
    setUploadState('idle');
    setExtracted({});
    setPendingAssetId('');
    setPopulatedFields([]);
  };

  // Render the current DocuSign file (if any)
  const renderExistingFile = () => {
    if (!docusignFile) return null;
    return (
      <div className="flex items-center gap-3 px-3 py-2.5 bg-purple-50/60 border border-purple-100 rounded-lg">
        <ShieldCheck className="w-5 h-5 text-purple-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-800 truncate">{docusignFile.name}</p>
          <p className="text-[11px] text-gray-400 truncate mt-0.5">Signed agreement · Monday.com</p>
        </div>
        {docusignFile.url && (
          <a
            href={docusignFile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-purple-100 text-purple-400 hover:text-purple-600 transition-colors flex-shrink-0"
            title="Open DocuSign file"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
          DocuSign Agreement
        </p>
        {/* Upload / replace button — only show when not mid-flow */}
        {(uploadState === 'idle' || uploadState === 'done' || uploadState === 'error') && (
          <button
            type="button"
            onClick={() => { setError(''); fileInputRef.current?.click(); }}
            disabled={!onboardingItemId}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title={docusignFile ? 'Upload a replacement DocuSign PDF' : 'Upload DocuSign PDF'}
          >
            <Upload className="w-3 h-3" />
            {docusignFile ? 'Replace' : 'Upload'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileSelected(f);
            e.target.value = '';
          }}
        />
      </div>

      {/* Existing file */}
      {renderExistingFile()}

      {/* Empty state when no file */}
      {!docusignFile && uploadState === 'idle' && (
        <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
          <ShieldCheck className="w-4 h-4 opacity-40" />
          No DocuSign on file
        </div>
      )}

      {/* Upload progress states */}
      {uploadState === 'uploading' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          Uploading to Monday.com…
        </div>
      )}
      {uploadState === 'extracting' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          Extracting billing info from PDF…
        </div>
      )}
      {uploadState === 'applying' && (
        <div className="flex items-center gap-2 text-xs text-gray-500 px-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          Saving fields to Monday.com…
        </div>
      )}

      {/* Success */}
      {uploadState === 'done' && (
        <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          <Check className="w-3.5 h-3.5" />
          DocuSign uploaded and billing fields updated successfully.
          {uploadedFileUrl && (
            <a href={uploadedFileUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-green-700 hover:text-green-900">
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {/* Error */}
      {uploadState === 'error' && error && (
        <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => { setUploadState('idle'); setError(''); }}
            className="ml-auto text-red-400 hover:text-red-600 flex-shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Overwrite confirmation */}
      {uploadState === 'confirming' && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Fields already filled — overwrite?</p>
              <p className="text-xs text-amber-600 mt-0.5">
                The following fields already have values in Monday.com. Continuing will replace them with data from the new PDF.
              </p>
            </div>
          </div>
          <ul className="text-xs text-amber-700 space-y-0.5 pl-6 list-disc">
            {populatedFields.map(f => <li key={f}>{f}</li>)}
          </ul>
          <div className="flex gap-2 pt-0.5">
            <button
              type="button"
              onClick={handleConfirmOverwrite}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Yes, overwrite
            </button>
            <button
              type="button"
              onClick={handleCancelOverwrite}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export function DocumentsTab({
  clientId,
  docusignFile,
  clientBoardItemId,
  onboardingItemId,
  clientInfo,
  onDocusignExtracted,
}: DocumentsTabProps) {
  const [docs, setDocs]   = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]   = useState<'link' | 'upload' | null>(null);

  useEffect(() => {
    fetch(`/api/documents/${clientId}`)
      .then(r => r.json())
      .then(data => setDocs(Array.isArray(data) ? data : []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const handleAdded   = (doc: ClientDocument)              => { setDocs(prev => [doc, ...prev]); setMode(null); };
  const handleDeleted = (id: string)                       => setDocs(prev => prev.filter(d => d.id !== id));
  const handleRenamed = (id: string, name: string)         => setDocs(prev => prev.map(d => d.id === id ? { ...d, name } : d));

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        <span className="ml-2 text-sm text-gray-400">Loading documents…</span>
      </div>
    );
  }

  return (
    <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)] space-y-5">

      {/* ── DocuSign pinned section ── */}
      <DocuSignSection
        docusignFile={docusignFile}
        clientBoardItemId={clientBoardItemId}
        onboardingItemId={onboardingItemId}
        clientInfo={clientInfo}
        onExtracted={onDocusignExtracted}
      />

      <div className="border-t border-gray-100" />

      {/* ── Add buttons (hidden when a form is open) ── */}
      {!mode && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode('link')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Link2 className="w-3.5 h-3.5" />
            Add Link
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" />
            Upload File
          </button>
        </div>
      )}

      {/* ── Inline forms ── */}
      {mode === 'link' && (
        <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-lg">
          <AddLinkForm clientId={clientId} onAdded={handleAdded} onCancel={() => setMode(null)} />
        </div>
      )}
      {mode === 'upload' && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <UploadForm clientId={clientId} onAdded={handleAdded} onCancel={() => setMode(null)} />
        </div>
      )}

      {/* ── Document list ── */}
      {docs.length === 0 && !mode ? (
        <div className="py-6 text-center">
          <FileText className="w-8 h-8 mx-auto mb-2 text-gray-200" />
          <p className="text-sm font-medium text-gray-400">No documents yet</p>
          <p className="text-xs text-gray-300 mt-1">Add a link or upload a file to get started</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {docs.map(doc => (
            <DocRow
              key={doc.id}
              doc={doc}
              clientId={clientId}
              onDeleted={handleDeleted}
              onRenamed={handleRenamed}
            />
          ))}
        </div>
      )}
    </div>
  );
}
