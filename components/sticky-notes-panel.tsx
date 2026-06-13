'use client';

/**
 * Sticky notes — top-right pane of the Customer Service expanded view.
 *
 * Each note is a draggable card with editable text and a swappable color.
 * Notes persist to localStorage keyed by clientBoardItemId, so they're
 * per-device + per-client. Switching to shared storage (a long_text column
 * on the Clients board, or Vercel KV) is a v2 — this v1 keeps the UX
 * working without requiring schema changes in Monday.
 *
 * The drag implementation positions notes absolutely within the pane and
 * stores {x, y} as pixel offsets from the pane's top-left. New notes are
 * auto-tiled diagonally so they don't all stack on the same spot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X, GripVertical, StickyNote } from 'lucide-react';

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
};

function genId(): string {
  // Random ids would break /loop replay rules in workflow scripts, but this
  // file only runs in the browser — Math.random is fine here.
  return Math.random().toString(36).slice(2, 10);
}

function storageKey(clientBoardItemId: string): string {
  return `shipbots:sticky-notes:${clientBoardItemId}`;
}

function loadNotes(clientBoardItemId: string): StickyNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(clientBoardItemId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(n => n && typeof n.id === 'string') : [];
  } catch {
    return [];
  }
}

function saveNotes(clientBoardItemId: string, notes: StickyNote[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(clientBoardItemId), JSON.stringify(notes));
  } catch {
    /* localStorage full or disabled — fail silently */
  }
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
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const styles = COLOR_STYLES[note.color];

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
      {/* Grip — the drag handle */}
      <div
        onMouseDown={onMouseDownDrag}
        className="absolute top-1 left-1 px-1 py-0.5 rounded cursor-grab active:cursor-grabbing opacity-50 group-hover:opacity-100 transition-opacity"
        title="Drag to move"
      >
        <GripVertical className="w-3 h-3" style={{ color: styles.accent }} />
      </div>

      {/* Delete */}
      <button
        type="button"
        onClick={onDelete}
        title="Delete note"
        className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-opacity"
      >
        <X className="w-3 h-3" style={{ color: styles.accent }} />
      </button>

      {/* Text — autosize-ish textarea */}
      <textarea
        value={note.text}
        onChange={e => onChange({ ...note, text: e.target.value })}
        placeholder="Write a note…"
        spellCheck
        className="absolute inset-0 mt-6 mx-2 mb-7 bg-transparent text-sm resize-none focus:outline-none placeholder:italic"
        style={{ color: styles.accent }}
      />

      {/* Color swatch row */}
      <div className="absolute bottom-1 left-2 right-2 flex items-center gap-1">
        {colorOpen ? (
          <div className="flex items-center gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange({ ...note, color: c }); setColorOpen(false); }}
                title={c}
                aria-label={`Set color ${c}`}
                className={`w-4 h-4 rounded-full border transition-transform ${note.color === c ? 'ring-2 ring-offset-1' : 'hover:scale-110'}`}
                style={{ backgroundColor: COLOR_STYLES[c].bg, borderColor: COLOR_STYLES[c].border }}
              />
            ))}
          </div>
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
export function StickyNotesPanel({
  clientBoardItemId,
  className,
}: {
  clientBoardItemId: string | null;
  className?: string;
}) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage on client mount + when switching clients.
  useEffect(() => {
    if (!clientBoardItemId) { setNotes([]); setLoaded(true); return; }
    setNotes(loadNotes(clientBoardItemId));
    setLoaded(true);
  }, [clientBoardItemId]);

  // Persist after every change once loaded (avoid wiping notes on first render).
  useEffect(() => {
    if (!loaded || !clientBoardItemId) return;
    saveNotes(clientBoardItemId, notes);
  }, [notes, loaded, clientBoardItemId]);

  const addNote = useCallback(() => {
    const i = notes.length;
    // Tile new notes diagonally so they don't pile on top of one another.
    setNotes(prev => [
      ...prev,
      {
        id: genId(),
        text: '',
        color: COLORS[i % COLORS.length],
        x: 12 + (i % 4) * 24,
        y: 12 + (i % 4) * 24,
      },
    ]);
  }, [notes.length]);

  const updateNote = useCallback((next: StickyNote) => {
    setNotes(prev => prev.map(n => (n.id === next.id ? next : n)));
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => prev.filter(n => n.id !== id));
  }, []);

  // Memoize the styles header so changing notes doesn't churn it.
  const noteCount = useMemo(() => notes.length, [notes]);

  return (
    <section className={`bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden ${className ?? ''}`}>
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <StickyNote className="w-4 h-4 text-[#015280]" />
          <h2 className="text-sm font-semibold text-gray-900">Sticky Notes</h2>
          <span className="text-[11px] text-gray-400">
            ({noteCount}) · saved to this browser
          </span>
        </div>
        <button
          type="button"
          onClick={addNote}
          disabled={!clientBoardItemId}
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
        {loaded && notes.length === 0 && <EmptyState onAdd={addNote} />}
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
