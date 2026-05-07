import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = !!req.auth;

  // Always allow NextAuth's own endpoints
  if (pathname.startsWith('/api/auth')) return NextResponse.next();

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
  }

  // If already logged in, redirect away from login page
  if (isAuthenticated && pathname === '/login') {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  // Root → onboarding
  if (isAuthenticated && pathname === '/') {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return NextResponse.next();
});

export const config = {
  // Run on all routes except Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|shipbots-icon.png|favicon.ico).*)'],
};
