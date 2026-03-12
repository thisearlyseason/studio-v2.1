import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
 
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  
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
 
  return NextResponse.next()
}

export const config = {
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
