'use client';

import { OnboardingItem } from '@/lib/types';
import { ChecklistBar } from './checklist-bar';
import { User, UserX, MailWarning, Phone, PhoneCall, Package } from 'lucide-react';

interface ClientCardProps {
  item: OnboardingItem;
  agentEmail: string | null;
  onClick: () => void;
}

const AGENT_PALETTE = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#16a34a', '#14b8a6', '#0ea5e9',
];

function agentColor(email: string): string {
  let hash = 0;
  for (const ch of email) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return AGENT_PALETTE[hash % AGENT_PALETTE.length];
}

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${parseInt(m)}/${parseInt(d)}/${y.slice(2)}`;
}

function isFutureDateTime(date: string | null, time: string | null): boolean {
  if (!date) return false;
  const now = Date.now();
  if (time && time !== '00:00:00') {
    const dt = new Date(`${date}T${time}`);
    return dt.getTime() > now;
  }
  // No time — treat the whole day as valid; show if today or future
  const dayEnd = new Date(`${date}T23:59:59`);
  return dayEnd.getTime() > now;
}

export function ClientCard({ item, agentEmail, onClick }: ClientCardProps) {
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(item.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  const isStale = daysSinceUpdate > 7;
  const email = agentEmail;
  const initials = email ? email.split('@')[0].slice(0, 2).toUpperCase() : null;
  const color = email ? agentColor(email) : null;

  // Derive indicator states from the checklist
  const emailSummaryStep = item.checklist.find(s => s.id === 'color_mm27gvc0');
  const callStep = item.checklist.find(s => s.id === 'color_mm278h2v');
  const emailPending = emailSummaryStep?.value?.toLowerCase() !== 'yes';
  const callRequired = callStep?.value?.toLowerCase() === 'yes';

  // Show kickoff date only if it hasn't passed yet
  const showKickoff = item.kickoffDate ? isFutureDateTime(item.kickoffDate, item.kickoffTime) : false;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white rounded-lg border p-3 cursor-pointer hover:shadow-md transition-shadow ${
        isStale ? 'border-l-4 border-l-red-400' : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-sm text-gray-900 leading-tight flex-1 min-w-0 pr-2">{item.name}</h3>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Tasks badge */}
          {item.subitemCount > 0 && (
            <span
              title={`${item.subitemCount} task${item.subitemCount !== 1 ? 's' : ''}`}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full"
            >
              ✓ {item.subitemCount}
            </span>
          )}
          {/* Email summary pending indicator */}
          {emailPending && (
            <span title="Onboarding summary email not yet sent">
              <MailWarning className="w-4 h-4 text-orange-400" />
            </span>
          )}
          {/* Agent badge */}
          {initials && color ? (
            <span
              title={email!}
              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-[10px] font-bold cursor-default"
              style={{ backgroundColor: color }}
            >
              {initials}
            </span>
          ) : (
            <span
              title="No agent assigned"
              className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-200 cursor-default"
            >
              <UserX className="w-3 h-3 text-gray-400" />
            </span>
          )}
          {/* Progress */}
          <span className="text-xs font-bold rounded-full w-8 h-8 flex items-center justify-center" style={{ background: 'var(--brand-cyan)', color: 'var(--brand-navy)' }}>
            {item.progress}%
          </span>
        </div>
      </div>

      <ChecklistBar steps={item.checklist} compact />

      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          {item.onboarder && (
            <>
              <User className="w-3 h-3" />
              <span>{item.onboarder}</span>
            </>
          )}
          {callRequired && (
            <span title="Additional call required" className="flex items-center gap-0.5 text-red-500 font-medium">
              <Phone className="w-3 h-3" />
              <span className="text-[10px]">Call needed</span>
            </span>
          )}
        </div>

        {/* Dates column */}
        <div className="flex flex-col items-end gap-0.5">
          {/* Kickoff call — only shown if scheduled in the future */}
          {showKickoff && (
            <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--brand-navy)' }}>
              <PhoneCall className="w-3 h-3" />
              {formatShortDate(item.kickoffDate!)}
              {item.kickoffTime && item.kickoffTime !== '00:00:00' && (
                <span className="text-[10px]" style={{ color: 'var(--brand-cyan)' }}>
                  {new Date(`1970-01-01T${item.kickoffTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </span>
          )}
          {/* Expected inventory delivery date */}
          {item.deliveredDate && (
            <span className="flex items-center gap-1 text-gray-500">
              <Package className="w-3 h-3" />
              {formatShortDate(item.deliveredDate)}
            </span>
          )}
          {/* Fallback: stale indicator */}
          {!showKickoff && !item.deliveredDate && isStale && (
            <span className="text-red-500">{daysSinceUpdate}d inactive</span>
          )}
        </div>
      </div>
    </button>
  );
}
