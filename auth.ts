import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

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

    // Expose the user's email in the session so the UI can show it
    session({ session, token }) {
      if (token?.email) session.user.email = token.email as string;
      return session;
    },
  },
});
