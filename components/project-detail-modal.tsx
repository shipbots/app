'use client';

/**
 * ProjectDetailModal — the full project shell: name, client, status, main
 * note, documents, links, due date, subtasks (each with its own assignee +
 * due date), the ad-hoc flag, and an activity/audit log.
 *
 * ⚠️ SCAFFOLD: all edits live in local state and are handed back via onSave so
 * the session reflects them, but nothing persists to a backend yet. The
 * activity log is wired locally to demonstrate exactly what we'll record for
 * the audit trail (who did what, when). The "Completed" status opens the
 * ShipHero ad-hoc prompt; the integration itself is a follow-up.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Check, Plus, Trash2, FileText, Link as LinkIcon, ListChecks, StickyNote,
  History, ChevronDown, AlertTriangle, Upload, User, MessageCircle, Send, Loader2,
} from 'lucide-react';
import type {
  Project, ProjectStatus, ProjectSubtask, ProjectActivity, ProjectActivityKind, ProjectDocument, ProjectComment,
} from '@/lib/projects';
import { DEFAULT_PROJECT_STATUSES, CUSTOM_STATUS_COLORS } from '@/lib/projects';
import { firstNameFromEmail } from '@/lib/agent-name';
import { StatusPill, formatDueDate, newId } from './project-bits';

interface ClientOption { id: string | null; name: string }

interface Props {
  project: Project;
  isNew?: boolean;
  clientOptions: ClientOption[];
  agentOptions: string[];
  currentUserEmail: string | null;
  /** True when file upload is available (DB configured + project persisted). */
  filesEnabled?: boolean;
  /** True when the projects DB is live (edits persist). Drives the Preview tag. */
  persisted?: boolean;
  onClose: () => void;
  onSave: (p: Project) => void;
  onDelete?: (id: string) => void;
  /** Uploads a file to the project's document store, returns the created doc. */
  onUploadFile?: (projectId: string, file: File) => Promise<ProjectDocument | null>;
}

export function ProjectDetailModal({
  project, isNew = false, clientOptions, agentOptions, currentUserEmail,
  filesEnabled = false, persisted = false, onClose, onSave, onDelete, onUploadFile,
}: Props) {
  const [draft, setDraft] = useState<Project>(project);
  // Ad-hoc prompt shown after moving to a "completed" status.
  const [adhocPrompt, setAdhocPrompt] = useState(false);
  // Second stage of the prompt: "integration not configured yet" message.
  const [adhocNotConfigured, setAdhocNotConfigured] = useState(false);
  const [noteDirty, setNoteDirty] = useState(false);

  const actor = currentUserEmail || 'you@shipbots.com';

  // Close on Esc. Capture phase + stopPropagation so this wins over the
  // client detail panel's own (bubble-phase, document-level) Esc handler when
  // the modal is opened on top of a client view. Esc closes the ad-hoc prompt
  // first if it's showing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (adhocPrompt) { setAdhocPrompt(false); setAdhocNotConfigured(false); }
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, adhocPrompt]);

  // Append an audit entry (newest first). new Date() is fine in the browser.
  const log = (kind: ProjectActivityKind, summary: string) => {
    const entry: ProjectActivity = {
      id: newId('act'),
      kind,
      actorEmail: actor,
      at: new Date().toISOString(),
      summary,
    };
    setDraft(d => ({ ...d, activity: [entry, ...d.activity] }));
  };

  const patch = (fields: Partial<Project>) => setDraft(d => ({ ...d, ...fields }));

  const save = () => { onSave(draft); onClose(); };

  // ── Status ──
  const allStatuses = useMemo<ProjectStatus[]>(() => {
    const byId = new Map<string, ProjectStatus>();
    for (const s of DEFAULT_PROJECT_STATUSES) byId.set(s.id, s);
    if (!byId.has(draft.status.id)) byId.set(draft.status.id, draft.status);
    return Array.from(byId.values());
  }, [draft.status]);

  const changeStatus = (next: ProjectStatus) => {
    if (next.id === draft.status.id) return;
    const from = draft.status.label;
    patch({ status: next });
    log('status_changed', `changed status from ${from} to ${next.label}`);
    if (next.kind === 'completed') {
      setAdhocNotConfigured(false);
      setAdhocPrompt(true);
    }
  };

  const addCustomStatus = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const color = CUSTOM_STATUS_COLORS[draft.activity.length % CUSTOM_STATUS_COLORS.length];
    changeStatus({ id: newId('status'), label: trimmed, kind: 'custom', color });
  };

  // ── Subtasks ──
  const toggleSubtask = (st: ProjectSubtask) => {
    const done = !st.done;
    setDraft(d => ({
      ...d,
      subtasks: d.subtasks.map(s => s.id === st.id
        ? { ...s, done, completedByEmail: done ? actor : null, completedAt: done ? new Date().toISOString() : null }
        : s),
    }));
    log(done ? 'subtask_completed' : 'subtask_reopened', `${done ? 'marked' : 'reopened'} “${st.title}”${done ? ' complete' : ''}`);
  };

  const addSubtask = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const st: ProjectSubtask = { id: newId('st'), title: trimmed, done: false, assigneeEmail: draft.ownerEmail, dueDate: null };
    setDraft(d => ({ ...d, subtasks: [...d.subtasks, st] }));
    log('subtask_added', `added subtask “${trimmed}”`);
  };

  const updateSubtask = (id: string, fields: Partial<ProjectSubtask>, activity?: string, kind: ProjectActivityKind = 'subtask_assigned') => {
    setDraft(d => ({ ...d, subtasks: d.subtasks.map(s => s.id === id ? { ...s, ...fields } : s) }));
    if (activity) log(kind, activity);
  };

  const removeSubtask = (st: ProjectSubtask) => {
    setDraft(d => ({ ...d, subtasks: d.subtasks.filter(s => s.id !== st.id) }));
    log('deleted', `removed subtask “${st.title}”`);
  };

  // ── Documents / links ──
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const addLink = () => {
    const name = linkName.trim() || linkUrl.trim();
    const url = linkUrl.trim();
    if (!url) return;
    const doc: ProjectDocument = { id: newId('doc'), name, kind: 'link', url, addedByEmail: actor, addedAt: new Date().toISOString() };
    setDraft(d => ({ ...d, documents: [...d.documents, doc] }));
    log('link_added', `added link “${name}”`);
    setLinkName(''); setLinkUrl('');
  };
  const removeDoc = (doc: ProjectDocument) => {
    setDraft(d => ({ ...d, documents: d.documents.filter(x => x.id !== doc.id) }));
    log('document_removed', `removed ${doc.kind} “${doc.name}”`);
  };

  // ── File upload (Vercel Blob, via the parent's onUploadFile) ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadFile) return;
    setUploading(true);
    setUploadError('');
    try {
      const doc = await onUploadFile(draft.id, file);
      if (doc) {
        setDraft(d => ({ ...d, documents: [...d.documents, doc] }));
        log('document_added', `added file “${doc.name}”`);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Ad-hoc flag ──
  const toggleAdhoc = (created: boolean) => {
    patch({ adhocCreated: created });
    log('adhoc_flag_changed', created ? 'marked ad-hoc as created' : 'marked ad-hoc as not created');
  };

  // ── Comments ──
  const addComment = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const c: ProjectComment = { id: newId('cm'), authorEmail: actor, text: t, at: new Date().toISOString() };
    setDraft(d => ({ ...d, comments: [...(d.comments ?? []), c] }));
    log('comment_added', 'added a comment');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) save(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[92vw] h-[90vh] max-w-[1120px] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 flex-shrink-0">
          <input
            value={draft.name}
            onChange={e => patch({ name: e.target.value })}
            placeholder="Project name"
            className="flex-1 min-w-0 text-base font-semibold text-gray-900 bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1.5 py-1"
          />
          {!persisted && (
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-2 py-0.5">
              {isNew ? 'New · preview' : 'Preview'}
            </span>
          )}
          {persisted && isNew && (
            <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[#015280] bg-[#e6f8ff] rounded px-2 py-0.5">New</span>
          )}
          <StatusDropdown statuses={allStatuses} current={draft.status} onChange={changeStatus} onAddCustom={addCustomStatus} />
          {onDelete && !isNew && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              title="Delete project"
              className="flex-shrink-0 p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button type="button" onClick={save} className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-white bg-[#015280] hover:bg-[#01416a] px-3 py-1.5 rounded">
            <Check className="w-3.5 h-3.5" /> Done
          </button>
          <button type="button" onClick={onClose} className="flex-shrink-0 p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Close">
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 min-h-0 flex">
          {/* Main column */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4 space-y-4">
            {/* Meta grid */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client">
                {isNew ? (
                  <select
                    value={draft.clientBoardItemId ?? draft.clientName}
                    onChange={e => {
                      const opt = clientOptions.find(c => (c.id ?? c.name) === e.target.value);
                      if (opt) patch({ clientBoardItemId: opt.id, clientName: opt.name });
                    }}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                  >
                    <option value="">Choose a client…</option>
                    {clientOptions.map(c => (
                      <option key={c.id ?? c.name} value={c.id ?? c.name}>{c.name}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm text-gray-800">{draft.clientName || '—'}</span>
                )}
              </Field>

              <Field label="Responsible">
                <select
                  value={draft.ownerEmail}
                  onChange={e => { const from = firstNameFromEmail(draft.ownerEmail); patch({ ownerEmail: e.target.value }); log('owner_changed', `reassigned owner from ${from} to ${firstNameFromEmail(e.target.value)}`); }}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                >
                  {[draft.ownerEmail, ...agentOptions.filter(a => a !== draft.ownerEmail)].map(a => (
                    <option key={a} value={a}>{firstNameFromEmail(a)}</option>
                  ))}
                </select>
              </Field>

              <Field label="Due date">
                <input
                  type="date"
                  value={draft.dueDate ?? ''}
                  onChange={e => { patch({ dueDate: e.target.value || null }); log('due_date_changed', e.target.value ? `set due date to ${formatDueDate(e.target.value)}` : 'cleared the due date'); }}
                  className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                />
              </Field>

              <Field label="Ad-hoc created (ShipHero)">
                <div className="flex items-center gap-1.5">
                  {([['yes', true], ['no', false]] as const).map(([lbl, val]) => (
                    <button
                      key={lbl}
                      type="button"
                      onClick={() => toggleAdhoc(val)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        draft.adhocCreated === val
                          ? val ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 bg-gray-100 text-gray-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {val ? 'Yes, created' : 'Not yet'}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Project description */}
            <Section icon={<StickyNote className="w-4 h-4" />} title="Project description">
              <textarea
                value={draft.note}
                onChange={e => { patch({ note: e.target.value }); setNoteDirty(true); }}
                onBlur={() => { if (noteDirty) { log('note_edited', 'edited the project description'); setNoteDirty(false); } }}
                rows={4}
                placeholder="Describe the project — scope, goals, and context…"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
              />
            </Section>

            {/* Documents & links */}
            <Section icon={<FileText className="w-4 h-4" />} title={`Documents & links (${draft.documents.length})`}>
              <ul className="space-y-1.5 mb-2">
                {draft.documents.map(doc => (
                  <li key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-2.5 py-1.5">
                    {doc.kind === 'link' ? <LinkIcon className="w-3.5 h-3.5 text-[#015280] flex-shrink-0" /> : <FileText className="w-3.5 h-3.5 text-[#015280] flex-shrink-0" />}
                    <span className="text-sm text-gray-800 truncate flex-1">{doc.name}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{firstNameFromEmail(doc.addedByEmail)}</span>
                    <button type="button" onClick={() => removeDoc(doc)} className="p-1 rounded hover:bg-gray-200 text-gray-400" title="Remove">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
                {draft.documents.length === 0 && <li className="text-xs text-gray-400 italic px-1">No documents or links yet.</li>}
              </ul>
              <div className="flex items-center gap-1.5">
                <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Label (optional)" className="w-36 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#43c7ff]" />
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#43c7ff]" />
                <button type="button" onClick={addLink} disabled={!linkUrl.trim()} className="inline-flex items-center gap-1 text-xs font-medium text-[#015280] border border-[#43c7ff] bg-[#e6f8ff] rounded px-2 py-1.5 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" /> Link
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFilePick} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!filesEnabled || uploading}
                  title={filesEnabled ? 'Upload a file' : (isNew ? 'Save the project first, then add files' : 'File upload needs the projects database')}
                  className={`inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-1.5 border ${
                    filesEnabled && !uploading
                      ? 'text-[#015280] border-[#43c7ff] bg-[#e6f8ff] hover:bg-[#d5f2ff]'
                      : 'text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed'
                  }`}
                >
                  {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  File
                </button>
              </div>
              {uploadError && <p className="text-[11px] text-red-500 mt-1">{uploadError}</p>}
            </Section>

            {/* Subtasks */}
            <Section icon={<ListChecks className="w-4 h-4" />} title={`Subtasks (${draft.subtasks.filter(s => s.done).length}/${draft.subtasks.length})`}>
              <ul className="space-y-1.5 mb-2">
                {draft.subtasks.map(st => (
                  <li key={st.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-2.5 py-1.5">
                    <button type="button" onClick={() => toggleSubtask(st)} className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${st.done ? 'bg-[#015280] border-[#015280] text-white' : 'border-gray-300 hover:border-[#43c7ff]'}`}>
                      {st.done && <Check className="w-3 h-3" />}
                    </button>
                    <input
                      value={st.title}
                      onChange={e => updateSubtask(st.id, { title: e.target.value })}
                      className={`flex-1 min-w-0 text-sm bg-transparent focus:outline-none focus:bg-gray-50 rounded px-1 py-0.5 ${st.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
                    />
                    <select
                      value={st.assigneeEmail ?? ''}
                      onChange={e => updateSubtask(st.id, { assigneeEmail: e.target.value || null }, `assigned “${st.title}” to ${firstNameFromEmail(e.target.value) || 'nobody'}`)}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff] flex-shrink-0"
                      title="Assignee"
                    >
                      <option value="">Unassigned</option>
                      {[st.assigneeEmail, ...agentOptions.filter(a => a && a !== st.assigneeEmail)].filter(Boolean).map(a => (
                        <option key={a as string} value={a as string}>{firstNameFromEmail(a as string)}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={st.dueDate ?? ''}
                      onChange={e => updateSubtask(st.id, { dueDate: e.target.value || null }, `set due date on “${st.title}”`, 'due_date_changed')}
                      className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#43c7ff] flex-shrink-0"
                      title="Subtask due date"
                    />
                    <button type="button" onClick={() => removeSubtask(st)} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0" title="Remove subtask">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
                {draft.subtasks.length === 0 && <li className="text-xs text-gray-400 italic px-1">No subtasks yet.</li>}
              </ul>
              <AddSubtaskRow onAdd={addSubtask} />
            </Section>

            {/* Comments — group-chat style progress thread */}
            <CommentsSection
              comments={draft.comments ?? []}
              currentUserEmail={currentUserEmail}
              onAdd={addComment}
            />
          </div>

          {/* Activity / audit rail */}
          <aside className="w-72 flex-shrink-0 border-l border-gray-200 bg-gray-50/60 flex flex-col min-h-0">
            <header className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
              <History className="w-4 h-4 text-[#015280]" />
              <h3 className="text-sm font-semibold text-gray-900">Activity</h3>
              <span className="ml-auto text-[10px] text-gray-400">audit trail</span>
            </header>
            <div className="overflow-y-auto flex-1 p-3 space-y-2.5">
              <p className="text-[10px] text-gray-400 leading-snug">
                Every change is recorded with who made it and when — created, status changes, subtask completions,
                documents, comments, deletions.
              </p>
              {draft.activity.map(a => (
                <div key={a.id} className="text-[11px] leading-snug">
                  <span className="font-semibold text-gray-700">{firstNameFromEmail(a.actorEmail)}</span>{' '}
                  <span className="text-gray-600">{a.summary}</span>
                  <div className="text-[10px] text-gray-400">{formatActivityTime(a.at)}</div>
                </div>
              ))}
            </div>
            <footer className="px-3 py-2 border-t border-gray-200 text-[10px] text-gray-400 flex items-center gap-1.5 flex-shrink-0">
              <User className="w-3 h-3" />
              Created by {firstNameFromEmail(draft.createdByEmail)}
            </footer>
          </aside>
        </div>
      </div>

      {/* Ad-hoc prompt on completion */}
      {adhocPrompt && (
        <AdhocPrompt
          notConfigured={adhocNotConfigured}
          projectName={draft.name}
          onCreate={() => setAdhocNotConfigured(true)}
          onClose={() => { setAdhocPrompt(false); setAdhocNotConfigured(false); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Delete this project?</h3>
            <p className="text-sm text-gray-600 mb-4">
              “{draft.name || 'Untitled project'}” and its subtasks, comments, documents, and activity will be permanently removed.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button type="button" onClick={() => { setConfirmDelete(false); onDelete?.(draft.id); }} className="px-3 py-1.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded">Delete project</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-parts ─────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</label>
      <div>{children}</div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-800">
        <span className="text-[#015280]">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function AddSubtaskRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [title, setTitle] = useState('');
  const submit = () => { onAdd(title); setTitle(''); };
  return (
    <div className="flex items-center gap-1.5">
      <Plus className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        placeholder="Add a subtask and press Enter"
        className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
      />
      <button type="button" onClick={submit} disabled={!title.trim()} className="text-xs font-medium text-[#015280] px-2 py-1.5 disabled:opacity-40">Add</button>
    </div>
  );
}

// Group-chat style comment thread. Own messages sit right in brand blue;
// everyone else's sit left in white — with first name + timestamp on each.
function CommentsSection({
  comments, currentUserEmail, onAdd,
}: {
  comments: ProjectComment[];
  currentUserEmail: string | null;
  onAdd: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const submit = () => { const t = text.trim(); if (!t) return; onAdd(t); setText(''); };

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  const me = (currentUserEmail ?? '').toLowerCase();

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 text-sm font-semibold text-gray-800">
        <span className="text-[#015280]"><MessageCircle className="w-4 h-4" /></span>
        Comments ({comments.length})
      </div>
      <div ref={scrollRef} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 space-y-3 max-h-80 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 italic text-center py-6">No comments yet — start the conversation.</p>
        ) : (
          comments.map(c => {
            const mine = !!me && c.authorEmail.toLowerCase() === me;
            return (
              <div key={c.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className={`flex items-baseline gap-1.5 mb-0.5 px-1 ${mine ? 'flex-row-reverse' : ''}`}>
                  <span className="text-[11px] font-semibold text-gray-700">{firstNameFromEmail(c.authorEmail)}</span>
                  <span className="text-[10px] text-gray-400">{formatActivityTime(c.at)}</span>
                </div>
                <div
                  className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words ${
                    mine
                      ? 'bg-[#015280] text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'
                  }`}
                >
                  {c.text}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Write a comment…"
          className="flex-1 border border-gray-200 rounded-full px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#43c7ff]"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#015280] text-white hover:bg-[#01416a] disabled:opacity-40 flex-shrink-0"
          aria-label="Send comment"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function StatusDropdown({
  statuses, current, onChange, onAddCustom,
}: {
  statuses: ProjectStatus[];
  current: ProjectStatus;
  onChange: (s: ProjectStatus) => void;
  onAddCustom: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  return (
    <div className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50">
        <StatusPill status={current} />
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-white border border-gray-200 rounded-xl shadow-xl p-1.5">
            {statuses.map(s => (
              <button key={s.id} type="button" onClick={() => { onChange(s); setOpen(false); }} className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                <StatusPill status={s} />
                {s.id === current.id && <Check className="w-3.5 h-3.5 text-[#015280]" />}
              </button>
            ))}
            <div className="border-t border-gray-100 mt-1 pt-1.5 px-1">
              <p className="text-[10px] text-gray-400 mb-1">Add a custom status</p>
              <div className="flex items-center gap-1">
                <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) { onAddCustom(custom); setCustom(''); setOpen(false); } }} placeholder="e.g. Blocked" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#43c7ff]" />
                <button type="button" onClick={() => { if (custom.trim()) { onAddCustom(custom); setCustom(''); setOpen(false); } }} className="text-xs font-medium text-[#015280] px-2 py-1">Add</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AdhocPrompt({
  notConfigured, projectName, onCreate, onClose,
}: {
  notConfigured: boolean;
  projectName: string;
  onCreate: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5">
        {!notConfigured ? (
          <>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Project completed 🎉</h3>
            <p className="text-sm text-gray-600 mb-4">
              Do you want to create an <strong>ad-hoc charge in ShipHero</strong> to bill for
              <span className="font-medium"> {projectName || 'this project'}</span>&apos;s costs?
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded">No, skip</button>
              <button type="button" onClick={onCreate} className="px-3 py-1.5 text-sm font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded">Yes, create ad-hoc</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-semibold">ShipHero ad-hoc isn&apos;t connected yet</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              The automatic ShipHero ad-hoc integration isn&apos;t set up yet. For now, please
              <strong> add the ad-hoc manually in ShipHero</strong>, then flip the “Ad-hoc created” toggle to <em>Yes</em> so
              we can track it here.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded">Got it</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Deterministic-ish "time ago" — kept simple for the shell.
function formatActivityTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[4]}:${m[5]}`;
}
