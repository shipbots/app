'use client';

/**
 * Sticky notes — top-right pane of the Customer Service expanded view.
 *
 * Each note is a draggable card with editable text and a swappable color.
 * Notes persist to a shared long_text column on the Monday Clients board
 * via /api/client/[id]/sticky-notes — every signed-in user sees the same
 * canvas. Initial load is a GET on mount; saves are debounced PUTs.
 * Refresh fires whenever the tab regains focus so two reps editing at
 * once don't drift too far apart.
 *
 * The drag implementation positions notes absolutely within the pane and
 * stores {x, y} as pixel offsets from the pane's top-left. New notes are
 * auto-tiled diagonally so they don't all stack on the same spot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, GripVertical, StickyNote, Clock } from 'lucide-react';
import { useSession } from 'next-auth/react';

// ── Palette ─────────────────────────────────────────────────────────────────
type NoteColor = 'yellow' | 'pink' | 'blue' | 'green' | 'purple' | 'orange';

const COLOR_STYLES: Record<NoteColor, { bg: string; border: string; accent: string }> = {
  yellow: { bg: '#fef9c3', border: '#facc15', accent: '#a16207' },
  pink:   { bg: '#fce7f3', border: '#f472b6', accent: '#9d174d' },
  blue:   { bg: '#dbeafe', border: '#60a5fa', accent: '#1d4ed8' },
  green:  { bg: '#d1fae5', border: '#34d399', accent: '#047857' },
  purple: { bg: '#ede9fe', border: '#a78bfa', accent: '#6d28d9' },
  orange: { bg: '#ffedd5', border: '#fb923c', accent: '#c2410c' },
};

const COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green', 'purple', 'orange'];

const NOTE_W = 180;
const NOTE_H = 160;

type StickyNote = {
  id: string;
  text: string;
  color: NoteColor;
  x: number;
  y: number;
  // v2: provenance + lifecycle. All optional so notes saved before this
  // version still load without losing data.
  createdAt?: string;     // ISO timestamp of when the note was first added
  authorEmail?: string;   // email of the user who added it
  expiresAt?: string;     // ISO timestamp; on the next hydration, the note
                          // is pruned if this is in the past.
};

function genId(): string {
  // Random ids would break /loop replay rules in workflow scripts, but this
  // file only runs in the browser — Math.random is fine here.
  return Math.random().toString(36).slice(2, 10);
}

// Prune any notes whose expiresAt is in the past. We do this both on
// hydration (so expired notes never reappear) and again before saving (so
// the persisted copy stays clean even across sessions).
function pruneExpired(notes: unknown): StickyNote[] {
  if (!Array.isArray(notes)) return [];
  const now = Date.now();
  return notes.filter((n): n is StickyNote => {
    if (!n || typeof (n as StickyNote).id !== 'string') return false;
    const exp = (n as StickyNote).expiresAt;
    if (exp && new Date(exp).getTime() <= now) return false;
    return true;
  });
}

async function fetchNotes(clientBoardItemId: string): Promise<StickyNote[]> {
  const res = await fetch(`/api/client/${encodeURIComponent(clientBoardItemId)}/sticky-notes`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`load failed (${res.status})`);
  const data = await res.json();
  return pruneExpired(data?.notes);
}

async function pushNotes(clientBoardItemId: string, notes: StickyNote[]): Promise<void> {
  const res = await fetch(`/api/client/${encodeURIComponent(clientBoardItemId)}/sticky-notes`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`save failed (${res.status}) ${detail.slice(0, 200)}`);
  }
}

// First two characters of the email, uppercased. Used as a discrete
// author tag in the note header. Empty string if no email.
function initialsOf(email: string | null | undefined): string {
  return (email ?? '').trim().slice(0, 2).toUpperCase();
}

// "Jun 23" style short label for the note's createdAt timestamp.
function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// "Jun 23, 2026" — used inside the auto-delete settings popover so the
// user sees the full target date, not just month/day.
function fullDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// YYYY-MM-DD in local time — the format <input type="date"> expects.
function isoDateInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Add N days to "now" and serialize as ISO.
function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ── Individual sticky note ──────────────────────────────────────────────────
function StickyCard({
  note,
  containerRef,
  onChange,
  onDelete,
}: {
  note: StickyNote;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onChange: (next: StickyNote) => void;
  onDelete: () => void;
}) {
  const [colorOpen, setColorOpen] = useState(false);
  const [expiryOpen, setExpiryOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const expiryRef = useRef<HTMLDivElement>(null);
  const styles = COLOR_STYLES[note.color];
  const dateLabel = shortDate(note.createdAt);
  const initials = initialsOf(note.authorEmail);

  // Close the expiry popover on outside click so it doesn't sit open if the
  // user clicks elsewhere.
  useEffect(() => {
    if (!expiryOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (expiryRef.current && !expiryRef.current.contains(e.target as Node)) {
        setExpiryOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [expiryOpen]);

  // Drag with raw mouse events — react-dnd / dnd-kit are overkill for one
  // pane of cards. We capture the cursor offset on mousedown, then on
  // mousemove translate that into a new (x, y) clamped to the container.
  const onMouseDownDrag = (e: React.MouseEvent) => {
    if (!cardRef.current || !containerRef.current) return;
    const cardRect = cardRef.current.getBoundingClientRect();
    setDragOffset({ dx: e.clientX - cardRect.left, dy: e.clientY - cardRect.top });
    e.preventDefault();
  };

  useEffect(() => {
    if (!dragOffset) return;
    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let x = e.clientX - rect.left - dragOffset.dx;
      let y = e.clientY - rect.top - dragOffset.dy;
      x = Math.max(0, Math.min(x, rect.width - NOTE_W));
      y = Math.max(0, Math.min(y, rect.height - NOTE_H));
      onChange({ ...note, x, y });
    };
    const onUp = () => setDragOffset(null);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [dragOffset, note, containerRef, onChange]);

  return (
    <div
      ref={cardRef}
      className="absolute rounded-md shadow-sm group transition-shadow hover:shadow-md"
      style={{
        left: note.x,
        top: note.y,
        width: NOTE_W,
        height: NOTE_H,
        backgroundColor: styles.bg,
        border: `1px solid ${styles.border}`,
        cursor: dragOffset ? 'grabbing' : 'default',
        zIndex: dragOffset ? 30 : 10,
      }}
    >
      {/* Top header: grip · date · initials · delete. Stays compact so the
          textarea below keeps roughly the same writing area. */}
      <div className="absolute top-0 left-0 right-0 h-5 px-1 flex items-center justify-between gap-1">
        <div
          onMouseDown={onMouseDownDrag}
          className="px-1 py-0.5 rounded cursor-grab active:cursor-grabbing opacity-60 group-hover:opacity-100 transition-opacity"
          title="Drag to move"
        >
          <GripVertical className="w-3 h-3" style={{ color: styles.accent }} />
        </div>
        {(dateLabel || initials) && (
          <div
            className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider opacity-70 truncate"
            style={{ color: styles.accent }}
            title={`Added ${fullDate(note.createdAt) || '—'}${note.authorEmail ? ` by ${note.authorEmail}` : ''}${note.expiresAt ? ` · auto-deletes ${fullDate(note.expiresAt)}` : ''}`}
          >
            {dateLabel && <span>{dateLabel}</span>}
            {dateLabel && initials && <span className="opacity-50">·</span>}
            {initials && <span>{initials}</span>}
          </div>
        )}
        <button
          type="button"
          onClick={onDelete}
          title="Delete note"
          className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-opacity"
        >
          <X className="w-3 h-3" style={{ color: styles.accent }} />
        </button>
      </div>

      {/* Text — autosize-ish textarea */}
      <textarea
        value={note.text}
        onChange={e => onChange({ ...note, text: e.target.value })}
        placeholder="Write a note…"
        spellCheck
        className="absolute inset-0 mt-5 mx-2 mb-7 bg-transparent text-sm resize-none focus:outline-none placeholder:italic"
        style={{ color: styles.accent }}
      />

      {/* Bottom row: color swatch · auto-delete clock */}
      <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {colorOpen ? (
            COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange({ ...note, color: c }); setColorOpen(false); }}
                title={c}
                aria-label={`Set color ${c}`}
                className={`w-4 h-4 rounded-full border transition-transform ${note.color === c ? 'ring-2 ring-offset-1' : 'hover:scale-110'}`}
                style={{ backgroundColor: COLOR_STYLES[c].bg, borderColor: COLOR_STYLES[c].border }}
              />
            ))
          ) : (
            <button
              type="button"
              onClick={() => setColorOpen(true)}
              title="Change color"
              aria-label="Change color"
              className="w-4 h-4 rounded-full border opacity-60 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: styles.bg, borderColor: styles.border }}
            />
          )}
        </div>

        <div ref={expiryRef} className="relative">
          <button
            type="button"
            onClick={() => setExpiryOpen(o => !o)}
            title={note.expiresAt
              ? `Auto-deletes on ${fullDate(note.expiresAt)} — click to change`
              : 'Set auto-delete'}
            aria-label="Auto-delete settings"
            className={`flex items-center gap-0.5 px-1 py-0.5 rounded transition-opacity hover:bg-black/10 ${
              note.expiresAt ? 'opacity-90' : 'opacity-50 group-hover:opacity-90'
            }`}
            style={{ color: styles.accent }}
          >
            <Clock className="w-3 h-3" />
            {note.expiresAt && (
              <span className="text-[9px] font-medium">{shortDate(note.expiresAt)}</span>
            )}
          </button>
          {expiryOpen && (
            <div
              className="absolute bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-40 min-w-[180px] py-1 text-xs"
              onMouseDown={e => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => { onChange({ ...note, expiresAt: undefined }); setExpiryOpen(false); }}
                className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${!note.expiresAt ? 'font-semibold text-[#015280]' : 'text-gray-700'}`}
              >
                Never auto-delete
              </button>
              <div className="border-t border-gray-100 my-1" />
              {[7, 14, 30].map(days => (
                <button
                  key={days}
                  type="button"
                  onClick={() => { onChange({ ...note, expiresAt: inDays(days) }); setExpiryOpen(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 text-gray-700"
                >
                  Delete in {days} days
                </button>
              ))}
              <div className="border-t border-gray-100 my-1" />
              <div className="px-3 py-1.5">
                <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                  Or on a specific date
                </label>
                <input
                  type="date"
                  value={isoDateInput(note.expiresAt)}
                  min={isoDateInput(new Date().toISOString())}
                  onChange={e => {
                    if (!e.target.value) return;
                    // <input type="date"> gives YYYY-MM-DD; new Date(value)
                    // parses it as UTC midnight, which can land "yesterday"
                    // in west-of-UTC timezones. Parse parts explicitly so
                    // "expire on July 1" actually expires after July 1
                    // local end-of-day.
                    const [y, m, d] = e.target.value.split('-').map(Number);
                    const eod = new Date(y, m - 1, d, 23, 59, 59);
                    onChange({ ...note, expiresAt: eod.toISOString() });
                  }}
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#43c7ff]"
                />
                {note.expiresAt && (
                  <p className="text-[10px] text-gray-500 mt-1">
                    Auto-deletes {fullDate(note.expiresAt)}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-gray-400 pointer-events-none">
      <StickyNote className="w-7 h-7 mb-2 opacity-60" />
      <p className="text-sm font-medium pointer-events-auto">No sticky notes yet</p>
      <p className="text-xs mt-1 pointer-events-auto">Click <span className="font-semibold">＋ Add note</span> to drop one here.</p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#015280] text-white text-xs font-semibold pointer-events-auto hover:opacity-90 transition-opacity"
      >
        <Plus className="w-3 h-3" />
        Add note
      </button>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────
type SyncStatus = 'idle' | 'loading' | 'saving' | 'synced' | 'error' | 'unconfigured';

export function StickyNotesPanel({
  clientBoardItemId,
  className,
}: {
  clientBoardItemId: string | null;
  className?: string;
}) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [statusDetail, setStatusDetail] = useState<string>('');
  // Track which client's notes the user is editing locally so we don't
  // overwrite their unsaved work when they switch clients mid-edit.
  const loadedForRef = useRef<string | null>(null);
  // Skip the immediate save-on-hydrate that would fire when the load
  // effect populates `notes`.
  const skipNextSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: session } = useSession();
  const authorEmail = session?.user?.email ?? '';

  // ── Hydrate from the server. Runs on mount and whenever the user
  //    switches to a different client.
  const hydrate = useCallback(async (clientId: string) => {
    setStatus('loading');
    setStatusDetail('');
    try {
      const list = await fetchNotes(clientId);
      // Only apply if the user hasn't switched clients in the meantime.
      if (loadedForRef.current !== clientId) {
        skipNextSaveRef.current = true;
        setNotes(list);
        loadedForRef.current = clientId;
      } else {
        skipNextSaveRef.current = true;
        setNotes(list);
      }
      setStatus('synced');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      // 503 from the API means the env var isn't set yet. Surface a
      // clearer status so admins can see it without digging into logs.
      if (/503/.test(msg)) {
        setStatus('unconfigured');
        setStatusDetail('Run /api/admin/setup-sticky-notes to bootstrap');
      } else {
        setStatus('error');
        setStatusDetail(msg);
      }
    }
  }, []);

  useEffect(() => {
    if (!clientBoardItemId) {
      loadedForRef.current = null;
      setNotes([]);
      setStatus('idle');
      return;
    }
    void hydrate(clientBoardItemId);
  }, [clientBoardItemId, hydrate]);

  // Refresh whenever the tab regains focus so other reps' edits show up.
  useEffect(() => {
    if (!clientBoardItemId) return;
    const onFocus = () => { void hydrate(clientBoardItemId); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [clientBoardItemId, hydrate]);

  // ── Debounced save. Skips the first run after a load.
  useEffect(() => {
    if (!clientBoardItemId || loadedForRef.current !== clientBoardItemId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    setStatus(s => s === 'unconfigured' ? s : 'saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await pushNotes(clientBoardItemId, pruneExpired(notes));
        setStatus('synced');
        setStatusDetail('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        if (/503/.test(msg)) {
          setStatus('unconfigured');
          setStatusDetail('Run /api/admin/setup-sticky-notes to bootstrap');
        } else {
          setStatus('error');
          setStatusDetail(msg);
        }
      }
    }, 800);
    return () => { if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current); };
  }, [notes, clientBoardItemId]);

  const addNote = useCallback(() => {
    setNotes(prev => {
      const i = prev.length;
      return [
        ...prev,
        {
          id: genId(),
          text: '',
          color: COLORS[i % COLORS.length],
          x: 12 + (i % 4) * 24,
          y: 12 + (i % 4) * 24,
          createdAt: new Date().toISOString(),
          authorEmail,
        },
      ];
    });
  }, [authorEmail]);

  const updateNote = useCallback((next: StickyNote) => {
    setNotes(prev => prev.map(n => (n.id === next.id ? next : n)));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  const noteCount = useMemo(() => notes.length, [notes]);
  const statusLabel = (() => {
    switch (status) {
      case 'loading':      return 'Loading…';
      case 'saving':       return 'Saving…';
      case 'synced':       return 'shared with the team';
      case 'error':        return 'Sync failed';
      case 'unconfigured': return 'Setup required';
      default:             return 'shared with the team';
    }
  })();
  const statusColor =
    status === 'error' || status === 'unconfigured' ? 'text-red-600'
    : status === 'saving' || status === 'loading'   ? 'text-gray-500'
                                                    : 'text-gray-400';

  return (
    <section className={`bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-4 h-4 text-[#015280]" />
          <h2 className="text-sm font-semibold text-gray-900">Sticky Notes</h2>
          <span className={`text-[11px] ${statusColor}`} title={statusDetail || undefined}>
            ({noteCount}) · {statusLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={addNote}
          disabled={!clientBoardItemId || status === 'loading'}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#015280] text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          <Plus className="w-3 h-3" />
          Add note
        </button>
      </header>

      <div
        ref={containerRef}
        className="relative flex-1 min-h-[240px] overflow-hidden"
        style={{
          // Subtle cork-board feel without going overboard.
          backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '14px 14px',
          backgroundColor: '#fbfaf6',
        }}
      >
        {status !== 'loading' && notes.length === 0 && <EmptyState onAdd={addNote} />}
        {notes.map(note => (
          <StickyCard
            key={note.id}
            note={note}
            containerRef={containerRef}
            onChange={updateNote}
            onDelete={() => deleteNote(note.id)}
          />
        ))}
      </div>
    </section>
  );
}
