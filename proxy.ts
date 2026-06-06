import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Always allow NextAuth's own endpoints
  if (pathname.startsWith('/api/auth')) return NextResponse.next();

  // Always allow health-check endpoints so Vercel cron can hit them
  // (and so external monitors can probe without a session).
  if (pathname.startsWith('/api/health')) return NextResponse.next();

  // Always allow public static assets
  if (pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname === '/shipbots-icon.png') {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    // API routes: return 401 JSON (client-side fetch can handle this)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Page routes: redirect to login
    if (pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  }

  // From here on we know the user is authenticated.
  const isAdmin = Boolean((req.auth?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const homeForRole = isAdmin ? '/onboarding' : '/customer-service';

  // If already logged in, redirect away from login page
  if (pathname === '/login') {
    return NextResponse.redirect(new URL(homeForRole, req.url));
  }

  // Root → role-aware landing page
  if (pathname === '/') {
    return NextResponse.redirect(new URL(homeForRole, req.url));
  }

  // Admin-only sections — bounce non-admins back to Customer Service so they
  // get a friendly route instead of a 404.
  if (!isAdmin && (pathname.startsWith('/onboarding') || pathname.startsWith('/settings'))) {
    return NextResponse.redirect(new URL('/customer-service', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|shipbots-icon.png|favicon.ico).*)'],
};
