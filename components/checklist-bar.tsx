'use client';

import { ChecklistStep } from '@/lib/types';
import { getStepState, getStepColor } from '@/lib/constants';

interface ChecklistBarProps {
  steps: ChecklistStep[];
  compact?: boolean;
}

export function ChecklistBar({ steps, compact = false }: ChecklistBarProps) {
  return (
    <div className="flex items-center gap-0.5 w-full">
      {steps.map((step) => {
        const state = getStepState(step.value, step.invertLogic);
        const color = getStepColor(state);

        return (
          <div
            key={step.id}
            className="group relative flex-1"
            title={`${step.label}: ${step.value || 'Not started'}`}
          >
            <div
              className={`rounded-sm transition-all ${compact ? 'h-2' : 'h-3'}`}
              style={{ backgroundColor: color }}
            />
            {!compact && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10">
                {step.label}
                <br />
                <span className="text-gray-300">{step.value || 'Not started'}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ChecklistBarLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-white/70">
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#00c875' }} />
        Done
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#fdab3d' }} />
        Pending
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#e0e0e0' }} />
        Not Started
      </div>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#c4c4c4' }} />
        N/A
      </div>
    </div>
  );
}
