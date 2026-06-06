import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { isAdminEmail } from '@/lib/admins';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],

  pages: {
    signIn: '/login',
  },

  callbacks: {
    // Restrict sign-in to:
    //   • verified Google emails whose domain is in ALLOWED_DOMAINS, OR
    //   • specific emails listed in ALLOWED_EMAILS (for external users).
    // If both are empty, access is denied to everyone (fail-safe).
    signIn({ profile }) {
      const email = (profile?.email ?? '').toLowerCase();
      if (!email) return false;

      // Google must mark the address as verified — prevents domain spoofing.
      const verified = (profile as { email_verified?: boolean })?.email_verified;
      if (!verified) return false;

      const allowedDomains = (process.env.ALLOWED_DOMAINS ?? '')
        .split(',')
        .map(d => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean);
      const domain = email.split('@')[1] ?? '';
      if (allowedDomains.includes(domain)) return true;

      const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      return allowedEmails.includes(email);
    },

    // Stamp the JWT with isAdmin so we don't re-check the env on every request.
    // Re-computed on token refresh (next sign-in or session refresh).
    jwt({ token }) {
      token.isAdmin = isAdminEmail(token.email as string | undefined);
      return token;
    },

    // Surface email + isAdmin on the session so the UI and route guards can
    // branch on them.
    session({ session, token }) {
      if (token?.email) session.user.email = token.email as string;
      session.user.isAdmin = Boolean(token?.isAdmin);
      return session;
    },
  },
});
