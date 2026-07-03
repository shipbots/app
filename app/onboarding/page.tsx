import { CachedPipelineBoard } from '@/components/cached-pipeline-board';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

// Onboarding surface. Server component enforces the admin gate
// (belt-and-suspenders — the proxy already redirects non-admins)
// and then renders the client-side SWR board so the page paints
// immediately from cache instead of waiting on Monday.
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect('/customer-service');

  return <CachedPipelineBoard />;
}
