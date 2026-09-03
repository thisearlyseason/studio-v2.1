import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as admin from 'firebase-admin'
import { ensureAdminInit } from '@/lib/firebase-admin'
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id'
import {
  runProtectedRouteAdmission,
} from '@/lib/dashboard-route-policy'
import { resolveServerAccountSession } from '@/lib/server-account-session'
import { ACTIVE_SQUAD_COOKIE_NAME, normalizeSelectedSquadId } from '@/lib/selected-squad'
 
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

async function publicProjectionExists(request: NextRequest): Promise<boolean | undefined> {
  const { pathname, searchParams } = request.nextUrl;
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
  const isEventRegistration = root === 'events' && area === 'register' && segments.length === 3;
  const isTournament = (
    (root === 'register' && area === 'tournament') ||
    (root === 'tournaments' && ['public', 'spectator', 'referee', 'scorekeeper'].includes(area))
  ) && segments.length >= 4;
  const isDonation = root === 'public' && area === 'donate' && segments.length === 4;
  const isVolunteer = root === 'public' && area === 'volunteer' && segments.length === 4;

  if (!isLeagueSpectator && !isLeagueRegistration && !isRecruitingProfile &&
      !isArticle && !isResource && !isTemplate && !isSport && !isAudience &&
      !isSquadRegistration && !isEventRegistration && !isTournament && !isDonation && !isVolunteer) {
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
  const requestedEventId = isEventRegistration ? searchParams.get('eventId') || undefined : secondaryId;
  if ((isTournament || isDonation || isVolunteer || isEventRegistration) && !isDocumentId(requestedEventId)) return false;

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
    const league = direct.exists
      ? direct
      : (await db.collection('leagues').where('slug', '==', identifier).limit(1).get()).docs[0];
    if (!league?.exists) return false;
    const leagueData = league.data() || {};
    if (leagueData.is_active === false || leagueData.isArchived === true) return false;
    const protocolId = searchParams.get('protocol') || 'player_config';
    if (!isDocumentId(protocolId)) return false;
    const config = await league.ref.collection('registration').doc(protocolId).get();
    return config.exists && config.data()?.is_active === true;
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
    const team = await database().collection('teams').doc(identifier).get();
    if (!team.exists || team.data()?.isArchived === true || team.data()?.isActive === false) return false;
    const code = searchParams.get('code')?.trim().toUpperCase();
    if (!code) return false;
    const teamData = team.data() || {};
    return [teamData.code, teamData.teamCode, teamData.inviteCode]
      .some(value => typeof value === 'string' && value.trim().toUpperCase() === code);
  }
  if (isEventRegistration) {
    const db = database();
    const team = await db.collection('teams').doc(identifier).get();
    const event = await db.collection('teams').doc(identifier).collection('events').doc(requestedEventId!).get();
    if (!team.exists || !event.exists) return false;
    const { permitsLegacyOrPaidPortals } = await import('@/lib/public-portal-data');
    const teamData = team.data() || {};
    const eventData = event.data() || {};
    if (!permitsLegacyOrPaidPortals(teamData.planId, teamData.plan_type, teamData.subscriptionPlanId)) return false;
    if (teamData.isArchived === true || teamData.isActive === false || eventData.isArchived === true || eventData.registrationOpen === false) return false;
    const eventDate = new Date(eventData.endDate || eventData.date);
    return Number.isNaN(eventDate.getTime()) || eventDate.getTime() + 24 * 60 * 60 * 1000 >= Date.now();
  }
  if (isTournament) {
    const db = database();
    const team = await db.collection('teams').doc(identifier).get();
    const event = await db.collection('teams').doc(identifier).collection('events').doc(secondaryId).get();
    if (!team.exists || !event.exists || event.data()?.isTournament !== true || event.data()?.isArchived === true) return false;
    const { permitsLegacyOrPaidPortals } = await import('@/lib/public-portal-data');
    const teamData = team.data() || {};
    if (!permitsLegacyOrPaidPortals(teamData.planId, teamData.plan_type, teamData.subscriptionPlanId)) return false;
    if (root === 'register') {
      const protocolId = searchParams.get('protocol') || 'team_config';
      if (!isDocumentId(protocolId)) return false;
      const config = await event.ref.collection('registration').doc(protocolId).get();
      return config.exists && config.data()?.is_active === true;
    }
    return true;
  }
  if (isDonation) {
    const campaign = await database().collection('teams').doc(identifier).collection('fundraising').doc(secondaryId).get();
    const data = campaign.data() || {};
    if (!campaign.exists || data.isShareable !== true || data.status === 'closed') return false;
    if (typeof data.deadline !== 'string' || !data.deadline) return true;
    const deadline = new Date(data.deadline);
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= Date.now();
  }
  const opportunity = await database().collection('teams').doc(identifier).collection('volunteers').doc(secondaryId).get();
  const data = opportunity.data() || {};
  if (!opportunity.exists || data.isShareable !== true) return false;
  if (typeof data.endDate !== 'string' || !data.endDate) return true;
  const endDate = new Date(data.endDate);
  return Number.isNaN(endDate.getTime()) || endDate.getTime() >= Date.now();
}

function shouldNoIndex(pathname: string) {
  return isProtectedPath(pathname) ||
    pathname === '/login' || pathname.startsWith('/signup') ||
    pathname === '/onboarding' || pathname === '/verify-email' ||
    pathname.startsWith('/events/register/') || pathname.startsWith('/public/') ||
    pathname.startsWith('/register/') || pathname.startsWith('/tournaments/');
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
      if (await publicProjectionExists(request) === false) {
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
    const admission = await runProtectedRouteAdmission(
      { pathname, search: request.nextUrl.search, sessionCookie },
      {
        verifySession: async cookie => {
          ensureAdminInit();
          const decoded = await admin.auth().verifySessionCookie(cookie, true);
          return {
            uid: decoded.uid,
            role: typeof decoded.role === 'string' ? decoded.role : undefined,
            signInProvider: decoded.firebase?.sign_in_provider,
            emailVerified: decoded.email_verified === true,
          };
        },
        resolveAccountSession: identity => resolveServerAccountSession({
          ...identity,
          selectedTeamId: normalizeSelectedSquadId(request.cookies.get(ACTIVE_SQUAD_COOKIE_NAME)?.value),
        }),
        redirect: decision => {
          const redirectUrl = new URL(decision.location, request.url);
          if (decision.reason) redirectUrl.searchParams.set('reason', decision.reason);
          if (decision.returnTo) redirectUrl.searchParams.set('returnTo', decision.returnTo);
          const response = NextResponse.redirect(redirectUrl);
          if (decision.clearSession) response.cookies.delete('__session');
          return response;
        },
        continueRequest: () => null,
      },
    );
    if (admission) {
      return admission;
    }
  }
 
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (shouldNoIndex(pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response
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
