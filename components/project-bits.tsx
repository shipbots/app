'use client';

/**
 * Small shared bits for the Projects UI (view, home panel, detail modal) so
 * they render statuses, dates, and people consistently. Pure presentation +
 * tiny client helpers — no data layer.
 */

import { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import type { ProjectStatus } from '@/lib/projects';
import { firstNameFromEmail } from '@/lib/agent-name';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-24" → "Jul 24, 2026". Locale-independent to avoid SSR drift. */
export function formatDueDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? ''} ${Number(m[3])}, ${m[1]}`;
}

/** Today's YYYY-MM-DD, resolved after mount (null during SSR/first paint) so
 *  overdue styling never causes a hydration mismatch. */
export function useTodayISO(): string | null {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setToday(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
    );
  }, []);
  return today;
}

export function isOverdue(dueIso: string | null | undefined, todayIso: string | null): boolean {
  if (!dueIso || !todayIso) return false;
  return dueIso < todayIso;
}

/** Client-side id for scaffold objects (real ids will come from the backend). */
export function newId(prefix = 'id'): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    /* fall through */
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: `${status.color}1a`, color: status.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color }} />
      {status.label}
    </span>
  );
}

export function AdhocBadge({ created }: { created: boolean }) {
  return created ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 whitespace-nowrap">
      Ad-hoc created
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5 whitespace-nowrap">
      No ad-hoc
    </span>
  );
}

/** A person chip — avatar circle + first name (from the @shipbots.com email). */
export function PersonChip({ email, muted = false }: { email: string | null | undefined; muted?: boolean }) {
  if (!email) {
    return <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Unassigned</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 ${muted ? 'text-gray-600 bg-gray-100' : 'text-[#015280] bg-[#e6f8ff]'}`}>
      <span className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${muted ? 'bg-gray-200 text-gray-500' : 'bg-[#015280] text-white'}`}>
        <User className="w-2.5 h-2.5" />
      </span>
      {firstNameFromEmail(email)}
    </span>
  );
}
