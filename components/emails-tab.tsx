'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { GmailThread } from '@/lib/types';
import {
  Mail, ExternalLink, MessageSquare, RefreshCw,
  ChevronDown, ChevronUp, Loader2, Search, X, Star,
} from 'lucide-react';

const FAVORITES_KEY = 'shipbots-email-favorites';

function loadFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function saveFavorites(favs: Set<string>) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs])); } catch { /* ignore */ }
}

interface EmailsTabProps {
  emails: GmailThread[];
  loading: boolean;
  error?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): { date: string; time: string } {
  if (!dateStr) return { date: '', time: '' };
  try {
    const d = new Date(dateStr);
    return {
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  } catch { return { date: '', time: '' }; }
}

function relativeDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days  = Math.floor(diff / 86_400_000);
    if (mins  < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days  <  7) return `${days}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  } catch { return ''; }
}

/** Parse "Display Name <email@domain.com>" → { name, address } */
function parseFrom(raw: string): { name: string; address: string } {
  if (!raw) return { name: '', address: '' };
  const match = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name:    match[1].replace(/^["']|["']$/g, '').trim(),
      address: match[2].trim(),
    };
  }
  // bare email address
  return { name: '', address: raw.trim() };
}

/** Highlight query matches in text */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-yellow-900 rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Email row ─────────────────────────────────────────────────────────────────

function EmailRow({ email, query, isFavorite, onToggleFavorite }: {
  email: GmailThread;
  query: string;
  isFavorite: boolean;
  onToggleFavorite: () => void;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [body, setBody]               = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  const { date, time } = formatDateTime(email.date);
  const relative       = relativeDate(email.date);
  const { name: fromName, address: fromAddr } = parseFrom(email.from);
  const { name: toName,   address: toAddr   } = parseFrom(email.to ?? '');

  const toggle = async () => {
    if (!expanded && body === null) {
      setLoadingBody(true);
      try {
        const res  = await fetch(`/api/emails/${email.id}`);
        const data = await res.json();
        setBody(data.body || email.snippet || '');
      } catch {
        setBody(email.snippet || '');
      } finally {
        setLoadingBody(false);
      }
    }
    setExpanded(v => !v);
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden hover:border-[#43c7ff]/40 transition-colors group">
      {/* ── Header ── */}
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            {/* Sender avatar circle */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 mt-0.5 select-none"
              style={{ backgroundColor: senderColor(fromAddr || fromName) }}
              title={email.from}
            >
              {(fromName || fromAddr).charAt(0).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1">
              {/* Subject + message count */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
                  <Highlight text={email.subject} query={query} />
                </p>
                {email.messageCount > 1 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    <MessageSquare className="w-2.5 h-2.5" />
                    {email.messageCount}
                  </span>
                )}
              </div>

              {/* From — always visible */}
              <div className="flex items-baseline gap-1 mt-0.5 text-xs text-gray-500 truncate">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">From</span>
                <span className="font-medium text-gray-700 truncate">
                  <Highlight text={fromName || fromAddr} query={query} />
                </span>
                {fromName && (
                  <span className="text-gray-400 truncate hidden sm:inline">
                    &lt;<Highlight text={fromAddr} query={query} />&gt;
                  </span>
                )}
              </div>

              {/* To — always visible */}
              {(toName || toAddr) && (
                <div className="flex items-baseline gap-1 mt-0.5 text-xs text-gray-500 truncate">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide flex-shrink-0">To</span>
                  <span className="font-medium text-gray-700 truncate">
                    <Highlight text={toName || toAddr} query={query} />
                  </span>
                  {toName && (
                    <span className="text-gray-400 truncate hidden sm:inline">
                      &lt;<Highlight text={toAddr} query={query} />&gt;
                    </span>
                  )}
                </div>
              )}

              {/* Snippet preview when collapsed */}
              {!expanded && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-1 leading-relaxed">
                  <Highlight text={email.snippet} query={query} />
                </p>
              )}
            </div>
          </div>

          {/* Right column: date/time + actions */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[80px]">
            {date && (
              <span className="text-[11px] text-gray-500 whitespace-nowrap font-medium">{date}</span>
            )}
            {time && (
              <span className="text-[10px] text-gray-400 whitespace-nowrap">{time}</span>
            )}
            {relative && (
              <span className="text-[10px] text-gray-300 whitespace-nowrap">{relative}</span>
            )}
            <div className="flex items-center gap-1 mt-0.5">
              {/* Star / favorite */}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                className={`transition-colors ${
                  isFavorite
                    ? 'text-yellow-400 hover:text-yellow-500'
                    : 'opacity-0 group-hover:opacity-100 text-gray-300 hover:text-yellow-400'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-yellow-400' : ''}`} />
              </button>
              <a
                href={`https://mail.google.com/mail/u/0/#all/${email.threadId}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-[#43c7ff]"
                title="Open in Gmail"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                type="button"
                onClick={toggle}
                className="text-gray-400 hover:text-[#43c7ff] transition-colors"
                title={expanded ? 'Collapse' : 'Expand email'}
              >
                {loadingBody
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : expanded
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />
                }
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/60 px-3 py-2.5">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">
            {body ?? email.snippet}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Deterministic color from sender address */
function senderColor(str: string): string {
  const PALETTE = [
    '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#eab308', '#16a34a', '#14b8a6', '#0ea5e9',
  ];
  let hash = 0;
  for (const ch of str) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return PALETTE[hash % PALETTE.length];
}

// ── Main tab ──────────────────────────────────────────────────────────────────

type FolderFilter = 'all' | 'inbox' | 'sent';

export function EmailsTab({ emails, loading, error }: EmailsTabProps) {
  const [query, setQuery]   = useState('');
  const [folder, setFolder] = useState<FolderFilter>('all');
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites());

  // Keep localStorage in sync
  useEffect(() => { saveFavorites(favorites); }, [favorites]);

  const toggleFavorite = useCallback((threadId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = folder === 'all' ? emails : emails.filter(e => e.folder === folder);
    if (q) {
      base = base.filter(e =>
        e.subject.toLowerCase().includes(q) ||
        e.from.toLowerCase().includes(q) ||
        (e.to ?? '').toLowerCase().includes(q) ||
        e.snippet.toLowerCase().includes(q)
      );
    }
    // Favorites always first, then the rest in original order
    const favs   = base.filter(e => favorites.has(e.threadId));
    const others = base.filter(e => !favorites.has(e.threadId));
    return { favs, others, total: base.length };
  }, [emails, query, folder, favorites]);

  // Counts for each folder tab
  const inboxCount = useMemo(() => emails.filter(e => e.folder === 'inbox').length, [emails]);
  const sentCount  = useMemo(() => emails.filter(e => e.folder === 'sent').length,  [emails]);

  if (error === 'gmail_reauth_required') {
    return (
      <div className="p-8 text-center">
        <RefreshCw className="w-8 h-8 mx-auto mb-3 text-amber-400" />
        <p className="text-sm font-medium text-gray-700 mb-1">Gmail needs to be reconnected</p>
        <p className="text-xs text-gray-400 mb-4">
          The Gmail token doesn&apos;t have read permissions yet. Re-connect to grant inbox access.
        </p>
        <a
          href="/api/gmail/auth"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 transition-colors" style={{ background: 'var(--brand-navy)' }}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-connect Gmail
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)]">
        <div className="text-xs text-gray-400 mb-3 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-[#43c7ff] border-t-transparent animate-spin" />
          Searching Gmail…
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-2 animate-pulse">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gray-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-2.5 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
            <div className="h-2.5 bg-gray-100 rounded w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Mail className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-medium text-gray-600">No emails found</p>
        <p className="text-xs text-gray-400 mt-1">Searched by client name and all contact emails</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Folder filter tabs ── */}
      <div className="px-4 pt-3 pb-0 flex-shrink-0 flex items-center gap-1 border-b border-gray-100">
        {([ ['all', 'All', emails.length], ['inbox', 'Inbox', inboxCount], ['sent', 'Sent', sentCount] ] as [FolderFilter, string, number][]).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFolder(id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
              folder === id
                ? 'text-[#015280]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            style={folder === id ? { borderColor: 'var(--brand-cyan)' } : undefined}
          >
            {label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
              folder === id ? 'text-[#015280] bg-[#e6f8ff]' : 'bg-gray-100 text-gray-400'
            }`}>
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Search bar ── */}
      <div className="px-4 pt-2 pb-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by sender, recipient, subject, or keyword…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-8 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#43c7ff] bg-gray-50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          {query
            ? `${filtered.total} of ${folder === 'all' ? emails.length : folder === 'inbox' ? inboxCount : sentCount} thread${emails.length !== 1 ? 's' : ''}`
            : `${filtered.total} thread${filtered.total !== 1 ? 's' : ''}`
          }
          {favorites.size > 0 && !query && (
            <span className="ml-1.5 text-yellow-500 font-medium">· {favorites.size} starred</span>
          )}
        </p>
      </div>

      {/* ── Email list ── */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {filtered.total === 0 ? (
          <div className="py-8 text-center text-gray-400">
            <Search className="w-6 h-6 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No emails match &ldquo;{query}&rdquo;</p>
          </div>
        ) : (
          <>
            {/* Favorited emails */}
            {filtered.favs.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-1">
                  <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-yellow-600 uppercase tracking-wide">Starred</span>
                </div>
                {filtered.favs.map(email => (
                  <EmailRow
                    key={email.id}
                    email={email}
                    query={query}
                    isFavorite={true}
                    onToggleFavorite={() => toggleFavorite(email.threadId)}
                  />
                ))}
                {filtered.others.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">All threads</span>
                    <div className="flex-1 h-px bg-gray-100" />
                  </div>
                )}
              </>
            )}

            {/* Non-favorited emails */}
            {filtered.others.map(email => (
              <EmailRow
                key={email.id}
                email={email}
                query={query}
                isFavorite={false}
                onToggleFavorite={() => toggleFavorite(email.threadId)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
