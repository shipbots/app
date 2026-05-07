'use client';

import { PIPELINE_STAGES } from '@/lib/constants';

export function StatusBadge({ status }: { status: string }) {
  const stage = PIPELINE_STAGES.find(s => s.status === status);
  const color = stage?.color || '#888';
  const bg = stage?.bgColor || '#f5f5f5';

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ color, backgroundColor: bg, border: `1px solid ${color}30` }}
    >
      {status}
    </span>
  );
}
