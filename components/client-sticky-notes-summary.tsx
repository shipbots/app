'use client';

/**
 * ClientStickyNotesSummary — compact read-only preview of a client's
 * sticky notes, meant to sit at the top of ClientInfoTab in the
 * non-fullscreen (side-panel) view so a rep sees any pinned
 * annotations before scrolling into the account details.
 *
 * The fullscreen view already renders the full draggable
 * StickyNotesPanel on the right, so ClientInfoTab suppresses this
 * summary when fullscreen=true to avoid duplication.
 *
 * Fetches from the same shared endpoint the full sticky-notes panel
 * uses. Renders one small color-matched chip per note. Click a chip
 * to toggle the full text inline; the chip re-collapses on second
 * click.
 *
 * Renders NOTHING when:
 *   - no notes are attached to this client
 *   - the sticky-notes column isn't configured (503)
 *   - the fetch fails
 * so the UI stays clean and this section never becomes noise on a
 * client that hasn't been annotated.
 */

import { useEffect, useState } from 'react';
import { StickyNote as StickyNoteIcon } from 'lucide-react';
import { COLOR_STYLES, type StickyNote, type NoteColor } from './sticky-notes-panel';

function isActive(n: StickyNote, nowMs: number): boolean {
  if (!n || typeof n.id !== 'string') return false;
  if (n.expiresAt && new Date(n.expiresAt).getTime() <= nowMs) return false;
  return true;
}

function shortDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(email: string | undefined): string {
  return (email ?? '').trim().slice(0, 2).toUpperCase();
}

export function ClientStickyNotesSummary({ clientBoardItemId }: { clientBoardItemId: string }) {
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetch(`/api/client/${encodeURIComponent(clientBoardItemId)}/sticky-notes`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(r => r.ok ? r.json() : { notes: [] })
      .then(data => {
        if (cancelled) return;
        const now = Date.now();
        const arr = Array.isArray(data?.notes) ? (data.notes as StickyNote[]) : [];
        setNotes(arr.filter(n => isActive(n, now)));
      })
      .catch(() => { if (!cancelled) setNotes([]); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [clientBoardItemId]);

  if (!loaded || notes.length === 0) return null;

  return (
    <section
      className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 mb-3"
      aria-label={`${notes.length} sticky note${notes.length === 1 ? '' : 's'}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <StickyNoteIcon className="w-3 h-3 text-amber-700" />
        <span className="text-[9px] font-bold text-amber-900 uppercase tracking-wider">
          Sticky Notes · {notes.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {notes.map(n => {
          const palette = COLOR_STYLES[n.color as NoteColor] ?? COLOR_STYLES.yellow;
          const isExpanded = expandedId === n.id;
          const text = n.text || '(empty)';
          const date = shortDate(n.createdAt);
          const init = initials(n.authorEmail);
          const preview = text.split('\n')[0].slice(0, 42);
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : n.id)}
              className={`text-left px-1.5 py-1 rounded border text-[10.5px] leading-tight transition-shadow hover:shadow-sm max-w-full ${
                isExpanded ? 'basis-full' : ''
              }`}
              style={{ background: palette.bg, borderColor: palette.border, color: palette.accent }}
              title={text}
            >
              {(date || init) && (
                <span className="block text-[8px] font-bold uppercase tracking-wider opacity-70 mb-0.5">
                  {date}{date && init ? ' · ' : ''}{init}
                </span>
              )}
              {isExpanded ? (
                <span className="whitespace-pre-wrap block">{text}</span>
              ) : (
                <span className="block truncate max-w-[220px]">
                  {preview}{text.length > 42 ? '…' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
