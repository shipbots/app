/**
 * /mobile-login — the token bridge for the ShipBots CS Android app.
 *
 * The app opens this page in an in-app browser. Because it's a normal page, the
 * edge proxy forces a NextAuth (Google) login first. Once the user is signed in,
 * this server component mints a mobile token for their email and hands it to the
 * app: it auto-redirects to the app's `shipbotscs://auth` deep link with the
 * token, and also shows it with a copy button as a fallback.
 */

import { auth } from '@/auth';
import { signMobileToken } from '@/lib/mobile-auth';
import { isAdminEmail } from '@/lib/admins';
import { canUseDocusign } from '@/lib/docusign-access';
import { MobileTokenHandoff } from './handoff';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function MobileLoginPage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    // Proxy normally redirects here to /login first; this is a fallback.
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <p>Please sign in first, then reopen the app.</p>
      </main>
    );
  }

  if (!process.env.MOBILE_JWT_SECRET) {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <p>Mobile sign-in isn’t configured yet (missing MOBILE_JWT_SECRET). Contact an admin.</p>
      </main>
    );
  }

  // Bake the same access flags the extension uses into the token so the app can
  // gate the Billing/Pricing + onboarding sections locally.
  const [isAdmin, canDocusign] = [isAdminEmail(email), await canUseDocusign(email)];
  const token = await signMobileToken(email, { isAdmin, canDocusign });
  return <MobileTokenHandoff email={email} token={token} />;
}
