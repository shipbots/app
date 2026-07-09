'use client';

/**
 * NotesView — personal on-device note pad for the Onboarding surface.
 *
 * Notes live in the browser's localStorage under a per-user key
 * (`shipbots:onboarding-notes:<lowercased-email>`), so different
 * teammates each get their own list. Every entry is stamped with the
 * author's email + display name so if a rep exports, shares, or
 * migrates their notes to shared storage later, the authorship is
 * intact. The notes are not synced to Monday, not shared across
 * devices, and not visible to anyone else on the team — this is
 * intentional per the spec ("just notes for me").
 *
 * If we ever want cross-device sync, swap the storage layer for a
 * server-side backend (Vercel KV, Monday long_text keyed by user
 * email, etc.). The UI and shape are already stable and would keep
 * working.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Plus, StickyNote as StickyNoteIcon, Search, Trash2, Save, X } from 'lucide-react';

interface OnboardingNote {
  id: string;
  title: string;
  body: string;
  authorEmail: string;
  authorName: string;
  createdAt: string;
  updatedAt?: string;
}

function storageKey(email: string | null | undefined): string | null {
  if (!email) return null;
  return `shipbots:onboarding-notes:${email.toLowerCase()}`;
}

function loadNotes(email: string | null | undefined): OnboardingNote[] {
  if (typeof window === 'undefined') return [];
  const key = storageKey(email);
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n: unknown): n is OnboardingNote =>
      !!n && typeof (n as OnboardingNote).id === 'string'
    );
  } catch {
    return [];
  }
}

function saveNotes(email: string | null | undefined, notes: OnboardingNote[]): void {
  if (typeof window === 'undefined') return;
  const key = storageKey(email);
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(notes));
  } catch {
    // localStorage full / disabled — swallowed
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export function NotesView() {
  const { data: session } = useSession();
  const email = session?.user?.email ?? null;
  const displayName = session?.user?.name ?? email ?? 'You';

  const [notes, setNotes] = useState<OnboardingNote[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [composing, setComposing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [search, setSearch] = useState('');
  const composerRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage on mount (and whenever the signed-in
  // email changes — different user → different note list).
  useEffect(() => {
    setNotes(loadNotes(email));
    setHydrated(true);
  }, [email]);

  // Persist every change.
  useEffect(() => {
    if (!hydrated) return;
    saveNotes(email, notes);
  }, [notes, email, hydrated]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q)
    );
  }, [notes, search]);

  const openComposer = () => {
    setComposing(true);
    setDraftTitle('');
    setDraftBody('');
    setTimeout(() => composerRef.current?.focus(), 30);
  };

  const cancelComposer = () => {
    setComposing(false);
    setDraftTitle('');
    setDraftBody('');
  };

  const submitDraft = () => {
    const title = draftTitle.trim();
    const body = draftBody.trim();
    if (!title && !body) { cancelComposer(); return; }
    const now = new Date().toISOString();
    const note: OnboardingNote = {
      id: Math.random().toString(36).slice(2, 12) + now.slice(-4),
      title: title || 'Untitled',
      body,
      authorEmail: email ?? '',
      authorName: displayName ?? '',
      createdAt: now,
    };
    setNotes(prev => [note, ...prev]);
    cancelComposer();
  };

  const startEdit = (n: OnboardingNote) => {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditBody(n.body);
  };
  const cancelEdit = () => { setEditingId(null); setEditTitle(''); setEditBody(''); };
  const saveEdit = (n: OnboardingNote) => {
    const title = editTitle.trim() || 'Untitled';
    const body = editBody.trim();
    setNotes(prev => prev.map(existing =>
      existing.id === n.id
        ? { ...existing, title, body, updatedAt: new Date().toISOString() }
        : existing
    ));
    cancelEdit();
  };
  const deleteNote = (n: OnboardingNote) => {
    if (!window.confirm(`Delete "${n.title}"? This cannot be undone.`)) return;
    setNotes(prev => prev.filter(existing => existing.id !== n.id));
    if (editingId === n.id) cancelEdit();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 p-4 gap-3 min-w-0">
      {/* Header row: title, count, search, "+ New note" */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-700 flex-shrink-0">
          <StickyNoteIcon className="w-4 h-4 text-[#015280]" />
          <span className="font-semibold">Notes</span>
          <span className="text-[11px] font-medium bg-gray-200 text-gray-600 rounded-full px-1.5 py-0.5 leading-none">
            {notes.length}
          </span>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search notes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff] bg-white"
          />
        </div>
        <button
          type="button"
          onClick={openComposer}
          disabled={!email}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[#015280] text-white hover:bg-[#01416a] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          New note
        </button>
      </div>

      {!email && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          Sign in to add notes — your list is keyed to your email.
        </div>
      )}

      {/* Composer — appears above the list when "+ New note" is clicked. */}
      {composing && (
        <section className="rounded-xl bg-white border border-[#43c7ff]/50 shadow-sm p-3 flex flex-col gap-2 flex-shrink-0">
          <input
            ref={composerRef}
            type="text"
            placeholder="Title"
            value={draftTitle}
            onChange={e => setDraftTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') cancelComposer(); }}
            className="text-base font-semibold text-gray-900 border-none focus:outline-none placeholder:text-gray-400"
          />
          <textarea
            placeholder="Write a note for yourself…"
            value={draftBody}
            onChange={e => setDraftBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') cancelComposer();
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submitDraft();
            }}
            rows={4}
            className="text-sm text-gray-800 border-none focus:outline-none placeholder:text-gray-400 resize-y min-h-[80px]"
          />
          <div className="flex justify-end gap-1.5 pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={cancelComposer}
              className="px-2.5 py-1 text-[11px] text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDraft}
              className="px-3 py-1 text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded inline-flex items-center gap-1.5"
            >
              <Save className="w-3 h-3" />
              Save note
            </button>
          </div>
        </section>
      )}

      {/* List — cards, one per note. Empty state points to +New note. */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {!hydrated ? null : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center">
            <StickyNoteIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-700 mb-1">
              {notes.length === 0 ? 'No notes yet' : 'No notes match your search'}
            </p>
            <p className="text-xs text-gray-500">
              {notes.length === 0
                ? 'Click "New note" above to add your first one. Only you can see these.'
                : 'Try a different keyword or clear the search.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map(n => {
              const isEditing = editingId === n.id;
              const author = n.authorName || n.authorEmail || 'Unknown';
              return (
                <article
                  key={n.id}
                  className="rounded-xl bg-white border border-gray-200 shadow-[0_1px_2px_rgba(20,24,40,.04)] p-3 flex flex-col gap-2"
                >
                  <header className="flex items-start justify-between gap-2">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                        className="flex-1 text-sm font-semibold text-gray-900 border-b border-[#43c7ff] focus:outline-none"
                      />
                    ) : (
                      <h3
                        className="flex-1 text-sm font-semibold text-gray-900 cursor-pointer hover:text-[#015280]"
                        onClick={() => startEdit(n)}
                        title="Click to edit"
                      >
                        {n.title}
                      </h3>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteNote(n)}
                      className="text-gray-300 hover:text-red-500 flex-shrink-0"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </header>
                  {isEditing ? (
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Escape') cancelEdit();
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveEdit(n);
                      }}
                      rows={5}
                      className="text-sm text-gray-800 border border-gray-200 rounded p-2 focus:outline-none focus:ring-1 focus:ring-[#43c7ff] resize-y min-h-[80px]"
                    />
                  ) : (
                    <p
                      className="text-sm text-gray-700 whitespace-pre-wrap break-words cursor-pointer"
                      onClick={() => startEdit(n)}
                      title="Click to edit"
                    >
                      {n.body || <span className="italic text-gray-400">(empty)</span>}
                    </p>
                  )}
                  {/* Author + date footer. `updatedAt` beats `createdAt` if
                      present so a rep can tell what a note looks like *now*
                      rather than when they first jotted it. */}
                  <footer className="mt-auto flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-5 h-5 rounded-full bg-[#EAF3FA] text-[#0071BC] text-[9px] font-bold flex items-center justify-center flex-shrink-0"
                        title={n.authorEmail}
                      >
                        {initials(author)}
                      </span>
                      <span className="text-[11px] text-gray-600 truncate" title={n.authorEmail}>
                        {author}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0" title={n.createdAt}>
                      {formatDate(n.updatedAt ?? n.createdAt)}
                      {n.updatedAt ? ' · edited' : ''}
                    </span>
                  </footer>
                  {isEditing && (
                    <div className="flex justify-end gap-1.5 border-t border-gray-100 pt-1.5">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="px-2 py-0.5 text-[11px] text-gray-600 hover:bg-gray-100 rounded inline-flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(n)}
                        className="px-2 py-0.5 text-[11px] font-semibold text-white bg-[#015280] hover:bg-[#01416a] rounded inline-flex items-center gap-1"
                      >
                        <Save className="w-3 h-3" />
                        Save
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
