import { CachedPipelineBoard } from '@/components/cached-pipeline-board';

// Customer Service surface. Server component is intentionally a
// thin shell — the actual Monday list fetch happens client-side
// inside CachedPipelineBoard so the page paints instantly from
// the SWR localStorage cache instead of blocking on a full Monday
// round-trip. See components/cached-pipeline-board.tsx for the
// stale-while-revalidate details.
export const dynamic = 'force-dynamic';

export default function CustomerServicePage() {
  return <CachedPipelineBoard appMode="customer-service" />;
}
