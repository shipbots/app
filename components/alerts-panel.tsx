'use client';

import { Alert } from '@/lib/types';
import { AlertTriangle, Clock, Package, Pause, Calendar, Bell } from 'lucide-react';

interface AlertsPanelProps {
  alerts: Alert[];
  onClientClick: (clientId: string) => void;
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

export function AlertsPanel({ alerts, onClientClick }: AlertsPanelProps) {
  if (alerts.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        <Bell className="w-6 h-6 mx-auto mb-2" />
        <p className="text-sm">No alerts - everything looks good!</p>
      </div>
    );
  }

  const highCount = alerts.filter(a => a.severity === 'high').length;
  const mediumCount = alerts.filter(a => a.severity === 'medium').length;

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
      </div>
      {alerts.map((alert) => {
        const colors = severityColor(alert.severity);
        return (
          <button
            key={alert.id}
            onClick={() => onClientClick(alert.clientId)}
            className={`w-full text-left p-3 rounded-lg border ${colors.bg} ${colors.border} hover:shadow-sm transition-shadow`}
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
        );
      })}
    </div>
  );
}
