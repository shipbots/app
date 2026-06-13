'use client';

/**
 * The Customer Service "expanded" client view.
 *
 * Layout (3-column grid):
 *
 *   ┌──────────────┬─────────────────────────────────────────┐
 *   │  CLIENT      │  Client Name (big)                      │
 *   │  INFO        ├─────────────────────────────────────────┤
 *   │  (stacked    │  Sticky Notes (drag, color, edit)       │
 *   │   sections)  ├─────────────────────────────────────────┤
 *   │              │  Performance Metrics (coming soon)      │
 *   └──────────────┴─────────────────────────────────────────┘
 *
 * Why a separate component instead of stuffing this into ClientInfoTab:
 *   - ClientInfoTab is already large and shared between Onboarding (where
 *     the side panel layout is canonical) and Customer Service.
 *   - The expanded view needs to *embed* ClientInfoTab on the left without
 *     letting it use its own fullscreen split-column layout, and add two
 *     unrelated panels on the right. A wrapper keeps the contract clean.
 *
 * This view is only mounted when:
 *   appMode === 'customer-service' && fullscreen && activeTab === 'info'
 * (see client-detail-panel.tsx).
 */

import { ClientInfo } from '@/lib/types';
import { Pencil, BarChart3 } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';
import { ClientInfoTab } from './client-info-tab';
import { StickyNotesPanel } from './sticky-notes-panel';

interface ClientExpandedViewProps {
  client: ClientInfo;
  /** Used for sticky-note storage key + the right-pane panels. */
  clientBoardItemId: string | null;
  onboardingItemId?: string;
  deliveredDate?: string | null;
  inventoryDelivered?: string;
  onNameChange?: (newName: string) => void;
  onDeliveredDateSaved?: (newValue: string) => void;
  onEstimatedDeliveryDateSaved?: (newValue: string) => void;
}

// ── Inline-editable big client name (the expanded view's hero) ──────────────
function BigClientName({
  name,
  clientBoardItemId,
  onboardingItemId,
  onChange,
}: {
  name: string;
  clientBoardItemId: string;
  onboardingItemId?: string;
  onChange?: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const start = () => {
    setDraft(name);
    setEditing(true);
    setError(false);
    setTimeout(() => inputRef.current?.select(), 30);
  };

  const save = useCallback(async () => {
    const next = draft.trim();
    if (!next || next === name) { setEditing(false); return; }
    setSaving(true);
    setError(false);
    try {
      const res = await fetch(`/api/client/${clientBoardItemId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: next, onboardingItemId }),
      });
      if (!res.ok) throw new Error('rename failed');
      onChange?.(next);
      setEditing(false);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 4000);
    } finally {
      setSaving(false);
    }
  }, [clientBoardItemId, draft, name, onChange, onboardingItemId]);

  if (editing) {
    return (
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setDraft(name); setEditing(false); }
          }}
          className="text-3xl font-bold text-gray-900 border-b-2 border-[#43c7ff] focus:outline-none bg-transparent px-1 flex-1 min-w-0"
        />
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {error && <span className="text-xs text-red-500">Rename failed</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 group min-w-0">
      <h1 className="text-3xl font-bold text-gray-900 truncate" title={name}>{name}</h1>
      <button
        type="button"
        onClick={start}
        title="Rename client"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100"
      >
        <Pencil className="w-4 h-4 text-gray-400" />
      </button>
    </div>
  );
}

// ── Performance metrics placeholder ─────────────────────────────────────────
function MetricsPanel({ className }: { className?: string }) {
  return (
    <section className={`bg-white border border-gray-200 rounded-xl flex flex-col overflow-hidden ${className ?? ''}`}>
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <BarChart3 className="w-4 h-4 text-[#015280]" />
        <h2 className="text-sm font-semibold text-gray-900">Client Performance Metrics</h2>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
          Coming soon
        </span>
      </header>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-12 text-gray-400 min-h-[160px]">
        <BarChart3 className="w-8 h-8 mb-3 opacity-50" />
        <p className="text-sm font-medium">Metrics aren&apos;t wired up yet</p>
        <p className="text-xs mt-1 max-w-sm leading-relaxed">
          ShipHero shipment volumes, on-time rates, returns, and SLAs will surface here
          once the data source is connected. This panel is the placeholder.
        </p>
      </div>
    </section>
  );
}

// ── The expanded view ───────────────────────────────────────────────────────
export function ClientExpandedView({
  client,
  clientBoardItemId,
  onboardingItemId,
  deliveredDate,
  inventoryDelivered,
  onNameChange,
  onDeliveredDateSaved,
  onEstimatedDeliveryDateSaved,
}: ClientExpandedViewProps) {
  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-5">
      {/* 3-row layout: client name, then sticky+metrics column shares space
          with the stacked info on the left. Use CSS grid for proportional
          control. */}
      <div className="grid grid-cols-12 gap-5">
        {/* ── Left column: client info sections (stacked) ── */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5 min-w-0">
          <div className="bg-white border border-gray-200 rounded-xl px-5 py-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Client / Company Name</p>
            <BigClientName
              name={client.name}
              clientBoardItemId={client.id}
              onboardingItemId={onboardingItemId}
              onChange={onNameChange}
            />
          </div>

          {/* Embed the standard ClientInfoTab without its big header and
              with forced single-column section layout. */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <ClientInfoTab
              client={client}
              fullscreen
              forceSingleColumn
              hideHeader
              onboardingItemId={onboardingItemId}
              deliveredDate={deliveredDate}
              inventoryDelivered={inventoryDelivered}
              onNameChange={onNameChange}
              onDeliveredDateSaved={onDeliveredDateSaved}
              onEstimatedDeliveryDateSaved={onEstimatedDeliveryDateSaved}
            />
          </div>
        </div>

        {/* ── Right column: sticky notes (top) + metrics (bottom) ── */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-5 min-w-0">
          <StickyNotesPanel
            clientBoardItemId={clientBoardItemId}
            className="min-h-[280px]"
          />
          <MetricsPanel className="flex-1" />
        </div>
      </div>
    </div>
  );
}
