/**
 * Instant loading shell for /customer-service. The page server-side fetches
 * all Monday data before rendering — without this, clicking the tab leaves
 * the previous page visible for the entire fetch window (often a few
 * seconds), which felt like nothing was happening.
 */

import { Headphones, Loader2 } from 'lucide-react';

export default function CustomerServiceLoading() {
  return (
    <div className="flex h-full bg-gray-50">
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header skeleton matching the real CS header height + color. */}
        <header className="px-6 py-3 flex-shrink-0" style={{ background: 'var(--brand-navy)' }}>
          <div className="flex items-center gap-4">
            <Headphones className="w-5 h-5 text-white/70" />
            <div className="flex flex-col">
              <h1 className="text-sm font-semibold text-white tracking-tight leading-tight">
                Customer Service
              </h1>
              <p className="text-[11px] font-medium text-white/60">Loading clients…</p>
            </div>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-[#015280]" />
            <p className="text-sm font-medium">Loading client data from Monday.com…</p>
            <p className="text-xs text-gray-400">First load can take a few seconds.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
