import { fetchOnboardingItems } from '@/lib/monday';
import { computeAlerts } from '@/lib/alerts';
import { PipelineBoard } from '@/components/pipeline-board';

// Customer Service surface — shared client/task data, hides the onboarding
// pipeline kanban and the admin-only side-panel tabs. The PipelineBoard
// component branches on appMode='customer-service' for the trims.
export const dynamic = 'force-dynamic';

export default async function CustomerServicePage() {
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

  return <PipelineBoard items={items} alerts={alerts} appMode="customer-service" />;
}
