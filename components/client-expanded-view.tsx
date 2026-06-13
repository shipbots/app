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
import { BarChart3 } from 'lucide-react';
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
      {/* The big client name now lives in the panel header (via the size='xl'
          ClientNavigator), so we drop the duplicate hero block here and let
          the two-column body claim the full height. */}
      <div className="grid grid-cols-12 gap-5">
        {/* ── Left column: client info sections (stacked) ── */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-5 min-w-0">
          {/* Embed the standard ClientInfoTab without its in-body name header
              and with forced single-column section layout. */}
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
