/**
 * Public privacy policy for the ShipBots Onboarding Dashboard AND the
 * companion Chrome extension. Reachable without authentication so
 * Chrome Web Store reviewers (and anyone landing from the store
 * listing) can read it. The proxy allowlist in proxy.ts is what makes
 * that possible; changing this route means updating the proxy too.
 *
 * Keep this honest and specific — it's part of the review record.
 * Bump `lastUpdated` whenever the policy meaningfully changes.
 */

import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — ShipBots',
  robots: { index: true, follow: true },
};

const LAST_UPDATED = 'July 6, 2026';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-8 border-b border-gray-200 pb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#015280] mb-1">
            Privacy Policy
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            ShipBots Dashboard &amp; Extension
          </h1>
          <p className="text-xs text-gray-500 mt-2">Last updated: {LAST_UPDATED}</p>
        </header>

        <Section title="Who this covers">
          <p>
            This policy applies to the ShipBots Onboarding Dashboard (this
            website) and the companion Chrome extension &quot;ShipBots
            Customer Service.&quot; Both are internal tools used only by
            ShipBots employees who already have access to the underlying
            client and operational data through their normal work.
          </p>
        </Section>

        <Section title="What data we access">
          <p>
            The dashboard reads client, task, and calendar data from
            Monday.com boards, meetings from Fireflies, email threads from
            Gmail, and purchase orders from ShipHero. All access happens
            server-side using ShipBots-owned API credentials and is scoped
            to accounts the employee is already entitled to see.
          </p>
          <p>
            Sign-in is via Google OAuth restricted to the
            <code className="mx-1 px-1 rounded bg-gray-100 text-[11px]">
              shipbots.com
            </code>
            email domain. We store the resulting session in an httpOnly
            cookie and the user&apos;s email plus admin flag inside the
            NextAuth JWT. We do not store passwords.
          </p>
        </Section>

        <Section title="What the extension stores">
          <p>
            The Chrome extension keeps three small pieces of state in the
            browser&apos;s local <code className="mx-0.5 px-1 rounded bg-gray-100 text-[11px]">chrome.storage</code>{' '}
            area:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>the user&apos;s recent client searches, so the popup can suggest them next time;</li>
            <li>the pinned order of the Mini Apps tiles, so a rearrangement sticks;</li>
            <li>the last-selected view within the popup, so it reopens where the user left off.</li>
          </ul>
          <p>
            This data never syncs, never leaves the local browser, and is
            wiped when the extension is uninstalled.
          </p>
          <p>
            The extension does not read the content of tabs the user
            visits, does not inject scripts into other websites, and does
            not use <code className="mx-0.5 px-1 rounded bg-gray-100 text-[11px]">activeTab</code>,
            <code className="mx-0.5 px-1 rounded bg-gray-100 text-[11px]">cookies</code>,
            <code className="mx-0.5 px-1 rounded bg-gray-100 text-[11px]">webRequest</code>,
            <code className="mx-0.5 px-1 rounded bg-gray-100 text-[11px]">webNavigation</code>,
            or any remote-code capabilities.
          </p>
        </Section>

        <Section title="What we do NOT do">
          <ul className="list-disc pl-5 space-y-1">
            <li>We do not sell, share, or transfer user data to third parties.</li>
            <li>We do not use it for advertising, credit scoring, or lending decisions.</li>
            <li>We do not run analytics, telemetry, tracking pixels, or fingerprinting on the dashboard or in the extension.</li>
            <li>We do not use collected data for purposes unrelated to the tool&apos;s stated function.</li>
          </ul>
        </Section>

        <Section title="Third parties">
          <p>
            The dashboard is hosted on Vercel and its Monday, Fireflies,
            Gmail, and ShipHero integrations transit those providers&apos;
            APIs. Each of those services has its own privacy policy that
            governs their side of the connection. AI-assisted features
            (e.g., summaries, the CSV Order Formatter) call Anthropic&apos;s
            API server-side using ShipBots-owned credentials; only the
            specific fields needed for the task are sent, and Anthropic
            does not train on API traffic.
          </p>
        </Section>

        <Section title="Retention &amp; deletion">
          <p>
            Session cookies expire per NextAuth defaults. Extension local
            storage is wiped when the user uninstalls the extension. Data
            stored on Monday, Fireflies, Gmail, and ShipHero is subject
            to those platforms&apos; own retention. For any data the
            dashboard writes back to those sources on the user&apos;s
            behalf, deletion follows the source platform&apos;s deletion
            flow — reach out at the address below and we&apos;ll help.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions, deletion requests, or security concerns:
            {' '}
            <a
              href="mailto:andres@shipbots.com"
              className="text-[#015280] font-medium hover:underline"
            >
              andres@shipbots.com
            </a>
            .
          </p>
        </Section>

        <footer className="mt-10 pt-6 border-t border-gray-200 text-[11px] text-gray-500">
          <Link href="/login" className="text-[#015280] hover:underline">
            Return to sign-in
          </Link>
        </footer>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="text-sm text-gray-700 leading-relaxed space-y-3">{children}</div>
    </section>
  );
}
