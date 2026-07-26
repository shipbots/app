'use client';

import { Alert } from '@/lib/types';
import { AlertTriangle, Clock, Package, Pause, Calendar, Bell, X, RotateCcw } from 'lucide-react';

interface AlertsPanelProps {
  /** Alerts NOT yet dismissed — what to render. */
  visible: Alert[];
  /** How many the reviewer has cleared (drives the footer + "all reviewed" state). */
  dismissedCount: number;
  onClientClick: (clientId: string) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  onReset: () => void;
}

function AlertIcon({ type }: { type: Alert['type'] }) {
  switch (type) {
    case 'contract': return <AlertTriangle className="w-4 h-4" />;
    case 'scheduling': return <Clock className="w-4 h-4" />;
    case 'inventory': return <Package className="w-4 h-4" />;
    case 'stalled': return <Pause className="w-4 h-4" />;
    case 'upcoming': return <Calendar className="w-4 h-4" />;
  }
}

function severityColor(severity: Alert['severity']) {
  switch (severity) {
    case 'high': return { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500', text: 'text-red-800' };
    case 'medium': return { bg: 'bg-orange-50', border: 'border-orange-200', icon: 'text-orange-500', text: 'text-orange-800' };
    case 'low': return { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-500', text: 'text-blue-800' };
  }
}

export function AlertsPanel({ visible, dismissedCount, onClientClick, onDismiss, onClearAll, onReset }: AlertsPanelProps) {
  // Nothing live and nothing cleared → genuinely no alerts.
  if (visible.length === 0 && dismissedCount === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        <Bell className="w-6 h-6 mx-auto mb-2" />
        <p className="text-sm">No alerts - everything looks good!</p>
      </div>
    );
  }

  // Everything reviewed → confirm + let them bring the list back.
  if (visible.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        <Bell className="w-6 h-6 mx-auto mb-2" />
        <p className="text-sm">All {dismissedCount} alert{dismissedCount === 1 ? '' : 's'} reviewed 🎉</p>
        <button
          onClick={onReset}
          className="mt-2 inline-flex items-center gap-1 text-xs text-[#015280] font-medium hover:underline"
        >
          <RotateCcw className="w-3 h-3" /> Show them again
        </button>
      </div>
    );
  }

  const highCount = visible.filter(a => a.severity === 'high').length;
  const mediumCount = visible.filter(a => a.severity === 'medium').length;

  return (
    <div className="space-y-1">
      <div className="px-4 py-2 flex items-center gap-2 text-xs text-gray-500">
        {highCount > 0 && (
          <span className="flex items-center gap-1 text-red-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {highCount} urgent
          </span>
        )}
        {mediumCount > 0 && (
          <span className="flex items-center gap-1 text-orange-600 font-medium">
            <span className="w-2 h-2 rounded-full bg-orange-500" />
            {mediumCount} attention
          </span>
        )}
        <button
          onClick={onClearAll}
          title="Mark all as reviewed"
          className="ml-auto text-[11px] font-medium text-gray-500 hover:text-gray-700 hover:underline"
        >
          Clear all
        </button>
      </div>
      {visible.map((alert) => {
        const colors = severityColor(alert.severity);
        return (
          <div
            key={alert.id}
            className={`w-full flex items-stretch rounded-lg border ${colors.bg} ${colors.border} hover:shadow-sm transition-shadow`}
          >
            <button
              onClick={() => onClientClick(alert.clientId)}
              className="flex-1 text-left p-3 min-w-0"
            >
              <div className="flex items-start gap-2">
                <span className={`mt-0.5 ${colors.icon}`}>
                  <AlertIcon type={alert.type} />
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${colors.text}`}>{alert.clientName}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{alert.message}</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => onDismiss(alert.id)}
              title="Mark reviewed — clear this alert"
              className="px-2 flex-shrink-0 flex items-center text-gray-400 hover:text-gray-700 hover:bg-black/[0.03] rounded-r-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
      {dismissedCount > 0 && (
        <div className="px-4 py-1.5 flex items-center justify-between text-[11px] text-gray-400">
          <span>{dismissedCount} reviewed</span>
          <button onClick={onReset} className="inline-flex items-center gap-1 hover:text-gray-600">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
        </div>
      )}
    </div>
  );
}
