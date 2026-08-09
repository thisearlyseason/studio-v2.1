import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as admin from 'firebase-admin'
import { ensureAdminInit } from '@/lib/firebase-admin'
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id'
 
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

function routeSegments(pathname: string) {
  try {
    return pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
  } catch {
    return [];
  }
}

async function publicProjectionExists(pathname: string): Promise<boolean | undefined> {
  const segments = routeSegments(pathname);
  if (segments.length < 2) return undefined;

  const [root, area, identifier, secondaryId] = segments;
  const isDocumentId = (value: string | undefined): value is string =>
    typeof value === 'string' && isValidFirestoreDocumentId(value);

  const isLeagueSpectator = root === 'leagues' && area === 'spectator' && segments.length === 3;
  const isLeagueRegistration = root === 'register' && area === 'league' && segments.length === 3;
  const isRecruitingProfile = root === 'recruit' && area === 'player' && segments.length === 3;
  const isArticle = root === 'sports-hub' && area === 'articles' && segments.length === 3;
  const isResource = root === 'sports-hub' && area === 'resources' && segments.length === 3;
  const isTemplate = root === 'sports-hub' && area === 'templates' && segments.length === 3;
  const isSport = root === 'sports' && segments.length === 2;
  const isAudience = root === 'for' && segments.length === 2;
  const isSquadRegistration = root === 'register' && area === 'squad' && segments.length === 3;
  const isTournament = (
    (root === 'register' && area === 'tournament') ||
    (root === 'tournaments' && ['public', 'spectator', 'referee', 'scorekeeper'].includes(area))
  ) && segments.length >= 4;
  const isDonation = root === 'public' && area === 'donate' && segments.length === 4;
  const isVolunteer = root === 'public' && area === 'volunteer' && segments.length === 4;

  if (!isLeagueSpectator && !isLeagueRegistration && !isRecruitingProfile &&
      !isArticle && !isResource && !isTemplate && !isSport && !isAudience &&
      !isSquadRegistration && !isTournament && !isDonation && !isVolunteer) {
    return undefined;
  }

  if (isSport) {
    const { isSportSlug } = await import('@/lib/sport-landing');
    return isSportSlug(area);
  }
  if (isAudience) {
    const { isAudienceSlug } = await import('@/lib/audience-landing');
    return isAudienceSlug(area);
  }
  if (isResource) {
    const { RESOURCES } = await import('@/lib/sports-hub-resources');
    return RESOURCES.some(resource => resource.id === identifier);
  }
  if (isTemplate) {
    const { getSportsHubTemplate } = await import('@/lib/sports-hub-template-catalog');
    return Boolean(getSportsHubTemplate(identifier));
  }

  if (!isDocumentId(identifier)) return false;
  if ((isTournament || isDonation || isVolunteer) && !isDocumentId(secondaryId)) return false;

  const database = () => {
    ensureAdminInit();
    return admin.firestore();
  };

  if (isLeagueSpectator) {
    return (await database().collection('publicLeagueViews').doc(identifier).get()).exists;
  }
  if (isLeagueRegistration) {
    const db = database();
    const direct = await db.collection('leagues').doc(identifier).get();
    if (direct.exists) return true;
    return !(await db.collection('leagues').where('slug', '==', identifier).limit(1).get()).empty;
  }
  if (isRecruitingProfile) {
    const player = await database().collection('players').doc(identifier).get();
    return player.exists && player.data()?.recruitingProfileEnabled === true;
  }
  if (isArticle) {
    const { ARTICLES_DB } = await import('@/lib/sports-hub-articles');
    if (ARTICLES_DB[identifier]) return true;
    const custom = await database().collection('sports_hub_articles').where('slug', '==', identifier).limit(1).get();
    return !custom.empty && custom.docs[0].data().isDraft !== true;
  }
  if (isSquadRegistration) {
    return (await database().collection('teams').doc(identifier).get()).exists;
  }
  if (isTournament) {
    const event = await database().collection('teams').doc(identifier).collection('events').doc(secondaryId).get();
    return event.exists && event.data()?.isTournament === true;
  }
  if (isDonation) {
    return (await database().collection('teams').doc(identifier).collection('fundraising').doc(secondaryId).get()).exists;
  }
  return (await database().collection('teams').doc(identifier).collection('volunteers').doc(secondaryId).get()).exists;
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

  if (request.method === 'GET' || request.method === 'HEAD') {
    try {
      if (await publicProjectionExists(pathname) === false) {
        const response = NextResponse.rewrite(new URL('/__not-found', request.url), { status: 404 });
        response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        return response;
      }
    } catch (error) {
      console.error('[middleware] Public projection validation failed:', error);
    }
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
