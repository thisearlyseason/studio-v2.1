import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as admin from 'firebase-admin'
import { ensureAdminInit } from '@/lib/firebase-admin'
 
const PROTECTED_ROOTS = new Set([
  'admin', 'calendar', 'chats', 'club', 'coaches-corner', 'competition',
  'dashboard', 'drills', 'equipment', 'events', 'facilities', 'family',
  'feed', 'files', 'fundraising', 'games', 'manage-tournaments', 'practice',
  'roster', 'settings', 'team', 'teams', 'volunteers',
]);

function isProtectedPath(pathname: string) {
  if (pathname.startsWith('/events/register/')) return false;
  if (pathname === '/leagues' || pathname === '/leagues/') return true;
  if (pathname === '/tournaments' || pathname === '/tournaments/') return true;
  const root = pathname.split('/').filter(Boolean)[0] || '';
  return PROTECTED_ROOTS.has(root);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-squad-pathname', pathname)
  
  // 1. Mitigate log noise from common bot probes (WordPress, PHP, Env files)
  const botProbes = [
    '/wp-login.php',
    '/wp-admin',
    '/xmlrpc.php',
    '/index.php',
    '/.env',
    '/wordpress',
    '/wp-content',
  ]
  
  if (botProbes.some(probe => pathname.includes(probe))) {
    // Return a lightweight 404 response to avoid triggering heavy page rendering
    return new NextResponse(null, { status: 404 })
  }

  // 2. Prevent 500 errors on the home page from malicious/malformed POST requests
  // Normal Next.js navigation and server actions are handled separately
  if (request.method === 'POST' && pathname === '/') {
    const isServerAction = request.headers.has('next-action')
    if (!isServerAction) {
      return new NextResponse('Method Not Allowed', { status: 405 })
    }
  }

  if (isProtectedPath(pathname)) {
    const sessionCookie = request.cookies.get('__session')?.value;
    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('reason', 'expired');
      loginUrl.searchParams.set('returnTo', `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(loginUrl);
    }
    try {
      ensureAdminInit();
      const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
      if (
        decoded.firebase?.sign_in_provider !== 'anonymous' &&
        decoded.email_verified !== true &&
        decoded.role !== 'superadmin'
      ) {
        throw new Error('EMAIL_NOT_VERIFIED');
      }
    } catch {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('reason', 'expired');
      loginUrl.searchParams.set('returnTo', `${pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.delete('__session');
      return response;
    }
  }
 
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  runtime: 'nodejs',
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api (API routes are handled by their own handlers)
     */
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}
