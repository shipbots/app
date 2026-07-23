'use client';

/**
 * ClientSearchResults — the dropdown of matching clients shown under the
 * Customer-Service / Onboarding header search box. Mirrors the Chrome
 * extension's popup search: the header input is a *finder*, not a filter, so
 * typing never rearranges the kanban or the client tables — it surfaces a
 * ranked list here and a click (or Enter) jumps straight to that client.
 *
 * Rendered into a document.body portal with fixed positioning measured off
 * the search input, so it escapes the header's overflow-hidden ancestors and
 * floats cleanly over whatever view is behind it.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, User, Loader2, ArrowRight, Warehouse } from 'lucide-react';
import type { OnboardingItem } from '@/lib/types';
import {
  searchClients,
  subLetter,
  CLIENT_GROUP_EXITED_ID,
  type ClientIndexEntry,
  type ClientSearchHit,
} from '@/lib/client-search';

interface Props {
  query: string;
  items: OnboardingItem[];
  index: Record<string, ClientIndexEntry> | null;
  indexStatus: 'idle' | 'loading' | 'ready' | 'error';
  /** The search input's wrapper — the dropdown positions itself below it. */
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onSelect: (item: OnboardingItem) => void;
  onClose: () => void;
}

const MAX_RESULTS = 8;

export function ClientSearchResults({ query, items, index, indexStatus, anchorRef, onSelect, onClose }: Props) {
  const hits = useMemo(() => searchClients(items, index, query, MAX_RESULTS), [items, index, query]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Highlight the top result whenever the query (and thus the list) changes.
  useEffect(() => { setActiveIdx(0); }, [query]);

  // Measure the input and pin the panel just below it, right-aligned to the
  // input's right edge and clamped to the viewport. Re-measured on resize /
  // scroll so it tracks the anchor. (useEffect, not useLayoutEffect, so it's
  // SSR-safe when the page is deep-linked with ?q=; the `mounted` gate means
  // nothing paints before this runs anyway.)
  useEffect(() => {
    const measure = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(460, Math.max(r.width, 320), window.innerWidth - 24);
      let left = r.right - width;
      left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
      const top = Math.min(r.bottom + 8, window.innerHeight - 140);
      setPos({ top, left, width });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [anchorRef, query]);

  // Keyboard: ↑/↓ move the highlight, Enter opens it, Esc dismisses. The
  // input keeps focus, so we intercept at the window level and preventDefault
  // the arrows/enter so the caret doesn't jump.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, Math.max(0, hits.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        if (hits[activeIdx]) {
          e.preventDefault();
          onSelect(hits[activeIdx].item);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hits, activeIdx, onSelect, onClose]);

  // Dismiss on a click anywhere that isn't the panel or the input itself.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [anchorRef, onClose]);

  if (!mounted || !pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 70 }}
      className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-[11px]">
        <Search className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        <span className="font-semibold text-gray-600 flex-shrink-0">
          {hits.length > 0 ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'No matches'}
        </span>
        <span className="text-gray-300">·</span>
        <span className="text-gray-500 truncate">“{query.trim()}”</span>
        {indexStatus === 'loading' && (
          <span className="ml-auto inline-flex items-center gap-1 text-gray-400 flex-shrink-0">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Loading index…
          </span>
        )}
      </div>

      {hits.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">
          No clients match
          {indexStatus === 'loading' ? ' yet — the full search index is still loading.' : '.'}
        </div>
      ) : (
        <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
          {hits.map((hit, i) => (
            <ResultRow
              key={hit.item.id}
              hit={hit}
              active={i === activeIdx}
              onHover={() => setActiveIdx(i)}
              onSelect={() => onSelect(hit.item)}
            />
          ))}
        </ul>
      )}
    </div>,
    document.body,
  );
}

function ResultRow({
  hit,
  active,
  onHover,
  onSelect,
}: {
  hit: ClientSearchHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const { item, entry, matchKind, matchValue, matchTag } = hit;
  const inactive = entry?.groupId === CLIENT_GROUP_EXITED_ID;
  const isFieldMatch = matchKind !== 'name';
  // For a name match, fall back to the standard email · warehouse line. For a
  // field match (email / store / contact), lead with the value that matched
  // and tag it so the rep sees *why* the row appeared.
  const primaryLine = isFieldMatch ? matchValue : entry?.contactEmail || entry?.contactName || '';

  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        // preventDefault on mousedown so clicking doesn't blur the input and
        // race the outside-click dismissal before onClick fires.
        onMouseDown={e => e.preventDefault()}
        onClick={onSelect}
        onMouseEnter={onHover}
        className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-colors ${
          active ? 'bg-[#e6f8ff]' : 'hover:bg-gray-50'
        }`}
      >
        <span className="w-7 h-7 rounded-full bg-[#e6f8ff] text-[#015280] flex items-center justify-center flex-shrink-0">
          <User className="w-3.5 h-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold truncate ${inactive ? 'text-gray-500' : 'text-gray-900'}`}>
              {item.name || '(unnamed)'}
            </span>
            {inactive && (
              <span className="text-[9px] font-semibold uppercase tracking-wide bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                Inactive
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-gray-500 min-w-0">
            {primaryLine && <span className="truncate">{primaryLine}</span>}
            {isFieldMatch && matchTag && (
              <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-[#015280] bg-[#e6f8ff] px-1.5 py-0.5 rounded">
                {matchTag}
              </span>
            )}
            {entry?.warehouse && (
              <>
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="inline-flex items-center gap-1 flex-shrink-0 text-gray-500">
                  <Warehouse className="w-3 h-3 text-gray-400" />
                  {entry.warehouse}
                </span>
              </>
            )}
            {entry?.subWarehouse && (
              <>
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="flex-shrink-0 text-gray-500">{subLetter(entry.subWarehouse)}</span>
              </>
            )}
            {entry?.portal && (
              <>
                <span className="text-gray-300 flex-shrink-0">·</span>
                <span className="flex-shrink-0 text-gray-500">{entry.portal.replace(/^shipbots\s+/i, '')}</span>
              </>
            )}
          </span>
        </span>
        <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
      </button>
    </li>
  );
}
