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
    // Restrict sign-in to emails listed in ALLOWED_EMAILS env var.
    // If ALLOWED_EMAILS is empty, access is denied to everyone (fail-safe).
    signIn({ profile }) {
      const allowed = (process.env.ALLOWED_EMAILS ?? '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      const email = (profile?.email ?? '').toLowerCase();
      return allowed.includes(email);
    },

    // Expose the user's email in the session so the UI can show it
    session({ session, token }) {
      if (token?.email) session.user.email = token.email as string;
      return session;
    },
  },
});
