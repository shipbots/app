'use client';

/**
 * CachedPipelineBoard — client-side stale-while-revalidate wrapper
 * around PipelineBoard.
 *
 * Both /onboarding and /customer-service used to be async server
 * components that awaited fetchOnboardingItems() before returning
 * ANY markup. Users saw the full-page "Loading client data from
 * Monday.com…" screen on sign-in and again on every tab switch
 * because Next.js couldn't render the shell until Monday responded.
 *
 * This wrapper flips that:
 *   1. The page renders instantly with whatever's cached in
 *      localStorage under swr:v1:onboarding-items.
 *   2. A background fetch to /api/onboarding-items updates the
 *      cache and swaps in fresh data.
 *   3. Only the very first sign-in on a device (empty cache) shows
 *      a skeleton — subsequent visits paint the last-known board
 *      immediately.
 *
 * The skeleton is intentionally board-shaped (fake header + 4-column
 * grid) rather than a centered spinner so the UI still feels like
 * the app, not a loading screen.
 */

import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { PipelineBoard, type AppMode } from './pipeline-board';
import type { OnboardingItem, Alert } from '@/lib/types';
import { RefreshCw } from 'lucide-react';

interface CachedBoardPayload {
  items: OnboardingItem[];
  alerts: Alert[];
}

export function CachedPipelineBoard({ appMode = 'onboarding' }: { appMode?: AppMode }) {
  const { data, isFetching, error } = useCachedFetch<CachedBoardPayload>(
    'onboarding-items',
    '/api/onboarding-items',
  );

  // First-ever load on this device: no cache. Show a lightweight
  // shell rather than the old full-page spinner so the app doesn't
  // feel frozen.
  if (!data) {
    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection Error</h1>
            <p className="text-gray-600 mb-4">Could not connect to Monday.com API.</p>
            <p className="text-sm text-gray-500">
              Check that <code className="bg-gray-100 px-1 py-0.5 rounded">MONDAY_API_KEY</code> is set in your environment.
            </p>
          </div>
        </div>
      );
    }
    return <PipelineBoardSkeleton />;
  }

  return (
    <>
      {/* Subtle "Updating" pill in the top-right when a background
          refresh is in flight and we're currently showing cached data.
          Positioned fixed so it doesn't shift PipelineBoard's own
          layout. */}
      {isFetching && (
        <div
          className="fixed top-3 right-4 z-40 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white/90 backdrop-blur-sm border border-gray-200 shadow-sm text-[11px] font-medium text-gray-600"
          title="Showing cached data — refreshing from Monday…"
        >
          <RefreshCw className="w-3 h-3 animate-spin" />
          Updating
        </div>
      )}
      <PipelineBoard items={data.items} alerts={data.alerts} appMode={appMode} />
    </>
  );
}

// A minimal board-shaped placeholder so first-ever load feels like
// the app, not a modal. Deliberately generic — no fake row content
// that could mislead the user into thinking they're looking at real
// clients.
function PipelineBoardSkeleton() {
  return (
    <div className="h-full flex flex-col animate-pulse">
      <div className="border-b border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-6 w-40 bg-gray-100 rounded" />
          <div className="h-6 w-24 bg-gray-100 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 bg-gray-100 rounded-full" />
          <div className="h-8 w-8 bg-gray-100 rounded-full" />
        </div>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-3 p-3 bg-gray-50/50">
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-2">
            <div className="h-5 w-24 bg-gray-200 rounded" />
            {Array.from({ length: 3 }).map((__, row) => (
              <div key={row} className="rounded-lg bg-white border border-gray-100 p-3 space-y-2">
                <div className="h-3 w-3/4 bg-gray-100 rounded" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
                <div className="h-2 w-full bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
