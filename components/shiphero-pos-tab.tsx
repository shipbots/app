'use client';

import { ShipHeroPO } from '@/app/api/shiphero-pos/route';
import {
  Package, ExternalLink, Clock, CheckCircle2, XCircle,
  FileText, Truck, AlertCircle, BookOpen, RefreshCw,
} from 'lucide-react';

interface ShipHeroPOsTabProps {
  pos: ShipHeroPO[];
  loading: boolean;
  error?: string | null;
  clientName: string;
}

// ── Status config ──────────────────────────────────────────────────────────

type StatusConfig = { label: string; color: string; bg: string; icon: React.ReactNode };

const STATUS_CONFIG: Record<string, StatusConfig> = {
  pending:    { label: 'Pending',    color: '#d97706', bg: '#fff7ed', icon: <Clock className="w-3 h-3" /> },
  processing: { label: 'Processing', color: '#2563eb', bg: '#eff6ff', icon: <RefreshCw className="w-3 h-3" /> },
  draft:      { label: 'Draft',      color: '#6b7280', bg: '#f9fafb', icon: <BookOpen className="w-3 h-3" /> },
  closed:     { label: 'Closed',     color: '#16a34a', bg: '#f0fdf4', icon: <CheckCircle2 className="w-3 h-3" /> },
  canceled:   { label: 'Canceled',   color: '#dc2626', bg: '#fef2f2', icon: <XCircle className="w-3 h-3" /> },
  counting:   { label: 'Counting',   color: '#7c3aed', bg: '#f5f3ff', icon: <Package className="w-3 h-3" /> },
};

function getStatusConfig(status: string): StatusConfig {
  return STATUS_CONFIG[status.toLowerCase()] ?? {
    label: status,
    color: '#6b7280',
    bg: '#f9fafb',
    icon: <AlertCircle className="w-3 h-3" />,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(val: string): string {
  const n = parseFloat(val);
  if (!n) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ── PO Row ─────────────────────────────────────────────────────────────────

function PORow({ po }: { po: ShipHeroPO }) {
  const status = getStatusConfig(po.status);
  const date = po.poDate || po.arrivedAt || po.dateClosed;

  return (
    <div className="flex items-start gap-3 px-3 py-2.5 border border-gray-100 rounded-lg hover:border-gray-200 hover:bg-gray-50/50 transition-colors">
      {/* Status icon */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ backgroundColor: status.bg, color: status.color }}
      >
        {status.icon}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* PO number — clickable link to ShipHero */}
            <a
              href={po.shipheroUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-blue-700 hover:underline flex items-center gap-1 group"
            >
              <span className="truncate max-w-[220px]">{po.poNumber}</span>
              <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </a>
            {/* Description if present */}
            {po.description && (
              <p className="text-[11px] text-gray-500 mt-0.5 truncate">{po.description}</p>
            )}
          </div>

          {/* Status badge */}
          <span
            className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
            style={{ color: status.color, backgroundColor: status.bg }}
          >
            {status.label}
          </span>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500 flex-wrap">
          {date && <span>📅 {formatDate(date)}</span>}
          {parseFloat(po.totalPrice) > 0 && <span>💰 {formatCurrency(po.totalPrice)}</span>}
          {po.trackingNumber && (
            <span className="flex items-center gap-0.5">
              <Truck className="w-3 h-3" />
              {po.trackingNumber}
            </span>
          )}
          {po.pdfUrl && (
            <a
              href={po.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 text-blue-500 hover:underline"
            >
              <FileText className="w-3 h-3" />
              PDF
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab ────────────────────────────────────────────────────────────────────

export function ShipHeroPOsTab({ pos, loading, error, clientName }: ShipHeroPOsTabProps) {
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-orange-500 border-t-transparent" />
        <span className="text-sm text-gray-500">Searching ShipHero POs…</span>
      </div>
    );
  }

  if (error) {
    const isMissingKey = error.includes('WINDSOR_API_KEY');
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
        <p className="text-sm font-medium text-red-600 mb-1">
          {isMissingKey ? 'Windsor.ai API key not configured' : 'Failed to load POs'}
        </p>
        <p className="text-xs text-gray-500 max-w-xs mx-auto">
          {isMissingKey
            ? 'Go to app.windsor.ai → Settings → API, copy your Data Source Key, and add it to .env.local as WINDSOR_API_KEY.'
            : error}
        </p>
      </div>
    );
  }

  if (pos.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <Package className="w-8 h-8 mx-auto mb-2 text-gray-300" />
        <p className="text-sm font-medium">No purchase orders found</p>
        <p className="text-xs text-gray-400 mt-1">
          Searched for &ldquo;{clientName}&rdquo; in ShipHero PO numbers
        </p>
      </div>
    );
  }

  // Count by status
  const open = pos.filter(p => ['pending', 'processing', 'draft', 'counting'].includes(p.status.toLowerCase())).length;
  const closed = pos.filter(p => p.status.toLowerCase() === 'closed').length;
  const canceled = pos.filter(p => p.status.toLowerCase() === 'canceled').length;

  return (
    <div className="p-4 overflow-y-auto max-h-[calc(100vh-200px)]">
      {/* Summary row */}
      <div className="flex items-center gap-3 mb-3 text-xs text-gray-500">
        <span className="font-medium text-gray-700">{pos.length} PO{pos.length !== 1 ? 's' : ''} found</span>
        {open > 0 && (
          <span className="flex items-center gap-1 text-orange-600 font-medium">
            <Clock className="w-3 h-3" /> {open} open
          </span>
        )}
        {closed > 0 && (
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <CheckCircle2 className="w-3 h-3" /> {closed} closed
          </span>
        )}
        {canceled > 0 && (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <XCircle className="w-3 h-3" /> {canceled} canceled
          </span>
        )}
      </div>

      {/* PO list */}
      <div className="space-y-1.5">
        {pos.map(po => (
          <PORow key={po.encodedId} po={po} />
        ))}
      </div>
    </div>
  );
}
