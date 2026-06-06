import { fetchOnboardingItems } from '@/lib/monday';
import { computeAlerts } from '@/lib/alerts';
import { PipelineBoard } from '@/components/pipeline-board';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  // Belt-and-suspenders: the proxy already redirects non-admins, but if the
  // proxy is ever misconfigured we still don't render onboarding to them.
  const session = await auth();
  if (!session?.user?.isAdmin) redirect('/customer-service');

  let items;
  let alerts;

  try {
    items = await fetchOnboardingItems();
    alerts = computeAlerts(items);
  } catch (error) {
    console.error('Failed to load data:', error);
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Connection Error</h1>
          <p className="text-gray-600 mb-4">Could not connect to Monday.com API.</p>
          <p className="text-sm text-gray-500">
            Check that <code className="bg-gray-100 px-1 py-0.5 rounded">MONDAY_API_KEY</code> is set in your environment.
          </p>
        </div>
      </div>
    );
  }

  return <PipelineBoard items={items} alerts={alerts} />;
}
