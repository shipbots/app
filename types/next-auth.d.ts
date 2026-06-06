/**
 * Module augmentation for next-auth — adds the isAdmin flag we stamp onto
 * the JWT and session via auth.ts callbacks. Keeps TypeScript happy when
 * reading session.user.isAdmin in pages, components, and route guards.
 */

import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isAdmin: boolean;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAdmin?: boolean;
  }
}
