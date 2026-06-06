import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getAdminEmails } from '@/lib/admins';
import { ShieldCheck, AlertTriangle, ExternalLink } from 'lucide-react';

// Admin-only settings page. The proxy already gates /settings to admins so
// this is belt-and-suspenders.
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.isAdmin) redirect('/customer-service');

  const adminEmails = getAdminEmails();
  const currentEmail = session.user.email?.toLowerCase() ?? '';

  return (
    <div className="max-w-2xl mx-auto p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        <p className="text-sm text-gray-500">
          Admin section visibility and role management for the ShipBots dashboard.
        </p>
      </header>

      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--brand-navy)' }} />
          <h2 className="text-lg font-semibold text-gray-900">Admin users</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Admins can access the Onboarding section and this Settings page. All
          other authenticated <code className="bg-gray-100 px-1 py-0.5 rounded text-xs">@shipbots.com</code> users
          land on Customer Service.
        </p>
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {adminEmails.map(email => (
            <li
              key={email}
              className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-[#015280] flex-shrink-0" />
                <span className="text-sm text-gray-800 truncate">{email}</span>
                {email === currentEmail && (
                  <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider bg-[#e6f8ff] text-[#015280] px-1.5 py-0.5 rounded">
                    You
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Adding new admins (v1)</p>
            <p className="mb-2 leading-relaxed">
              v1 stores the admin list in the{' '}
              <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">ADMIN_EMAILS</code>{' '}
              environment variable as a comma-separated list. To grant another
              <code className="bg-amber-100 mx-1 px-1 py-0.5 rounded text-xs">@shipbots.com</code>
              user the admin role:
            </p>
            <ol className="list-decimal ml-5 space-y-1 leading-relaxed">
              <li>
                Open Vercel → your project → Settings → Environment Variables.
              </li>
              <li>
                Add or edit{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">ADMIN_EMAILS</code>{' '}
                with the comma-separated list (e.g.{' '}
                <code className="bg-amber-100 px-1 py-0.5 rounded text-xs">andres@shipbots.com,payam@shipbots.com,new@shipbots.com</code>).
              </li>
              <li>Redeploy. The new admin will be elevated on their next sign-in.</li>
            </ol>
            <p className="mt-3 text-xs text-amber-800/80">
              A future version will let admins toggle roles directly here without redeploying.
              Linking the in-app list to a persistent store is the next step.
            </p>
            <a
              href="https://vercel.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs font-semibold text-amber-900 hover:underline"
            >
              Open Vercel dashboard
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
