import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { resolveCalendarFeedMutation } from '@/lib/calendar-feed-lifecycle';
import {
  enforceUserRateLimit,
  getTrustedAppOrigin,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const MAX_MULTI_TEAM_IDS = 25;

type FeedType = 'user' | 'team' | 'multi';

function isActiveMembership(data: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(data) && data?.status !== 'removed' && data?.isDeleted !== true;
}

async function canAccessTeam(teamId: string, uid: string): Promise<boolean> {
  const members = adminDb.collection('teams').doc(teamId).collection('members');
  const [team, direct, linked, child] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    members.doc(uid).get(),
    members.where('userId', '==', uid).limit(10).get(),
    members.where('parentId', '==', uid).limit(10).get(),
  ]);

  if (!team.exists) return false;
  if (team.data()?.ownerUserId === uid) return true;
  return (
    (direct.exists && isActiveMembership(direct.data())) ||
    linked.docs.some(snapshot => isActiveMembership(snapshot.data())) ||
    child.docs.some(snapshot => isActiveMembership(snapshot.data()))
  );
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  const configuredFeedUrl = process.env.CALENDAR_FEED_BASE_URL;
  let feedUrl: URL;
  try {
    feedUrl = new URL(configuredFeedUrl || '');
    if (feedUrl.protocol !== 'https:') throw new Error('Calendar feed URL must use HTTPS.');
  } catch {
    console.error('[calendar/feed] CALENDAR_FEED_BASE_URL is missing or invalid.');
    return NextResponse.json({ error: 'Calendar subscriptions are not configured.' }, { status: 503 });
  }

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const type = body.type;
    const action = body.action === undefined ? 'create' : body.action;
    if (type !== 'user' && type !== 'team' && type !== 'multi') {
      return NextResponse.json({ error: 'Invalid calendar feed type.' }, { status: 400 });
    }
    if (action !== 'create' && action !== 'rotate' && action !== 'revoke') {
      return NextResponse.json({ error: 'Invalid calendar feed action.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'calendar-feed-create',
      20,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    let teamId: string | null = null;
    let teamIds: string[] = [];
    if (type === 'team') {
      if (typeof body.teamId !== 'string' || !ID_PATTERN.test(body.teamId)) {
        return NextResponse.json({ error: 'A valid squad is required.' }, { status: 400 });
      }
      teamId = body.teamId;
      if (!(await canAccessTeam(teamId, auth.uid))) {
        return NextResponse.json({ error: 'You do not have access to this squad.' }, { status: 403 });
      }
    } else if (type === 'multi') {
      if (!Array.isArray(body.teamIds)) {
        return NextResponse.json({ error: 'Select at least one squad.' }, { status: 400 });
      }
      const requestedTeamIds = body.teamIds;
      if (
        requestedTeamIds.length < 1 ||
        requestedTeamIds.length > MAX_MULTI_TEAM_IDS ||
        requestedTeamIds.some(value => typeof value !== 'string' || !ID_PATTERN.test(value))
      ) {
        return NextResponse.json({ error: 'Select between 1 and 25 valid squads.' }, { status: 400 });
      }
      teamIds = [...new Set(requestedTeamIds as string[])].sort();
      if (teamIds.length !== requestedTeamIds.length) {
        return NextResponse.json({ error: 'Duplicate squads are not allowed.' }, { status: 400 });
      }
      const access = await Promise.all(teamIds.map(id => canAccessTeam(id, auth.uid)));
      if (access.some(allowed => !allowed)) {
        return NextResponse.json({ error: 'You do not have access to every selected squad.' }, { status: 403 });
      }
    }

    const feedCollection = adminDb.collection('calendarFeeds');
    const feedQuery = feedCollection.where('userId', '==', auth.uid).limit(100);
    const token = randomBytes(32).toString('hex');
    const mutation = await adminDb.runTransaction(async transaction => {
      const [existingFeeds, userSnapshot] = await Promise.all([
        transaction.get(feedQuery),
        transaction.get(adminDb.collection('users').doc(auth.uid)),
      ]);
      const resolved = resolveCalendarFeedMutation({
        action,
        type: type as FeedType,
        teamId,
        teamIds,
        feeds: existingFeeds.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })),
        nextToken: token,
      });
      const now = new Date().toISOString();
      for (const feedId of resolved.deactivateIds) {
        transaction.update(feedCollection.doc(feedId), { active: false, revokedAt: now });
      }
      if (resolved.kind === 'issue') {
        if (!resolved.token) throw new Error('Calendar feed issuer did not allocate a token.');
        transaction.set(feedCollection.doc(resolved.token), {
          token: resolved.token,
          type: type as FeedType,
          userId: auth.uid,
          ownerDisplayName: userSnapshot.data()?.name || null,
          teamId,
          teamIds: type === 'multi' ? teamIds : null,
          serverIssued: true,
          active: true,
          createdAt: now,
          lastRefreshed: now,
          appBaseUrl: getTrustedAppOrigin(req),
        });
      }
      return resolved;
    });

    if (mutation.kind === 'revoked') return NextResponse.json({ revoked: true });
    // Firebase's deployed feed function deliberately accepts exactly 64
    // lowercase hexadecimal characters. Keep the issuer and verifier on the
    // same opaque-token format so a newly created feed is fetchable.
    if (!mutation.token) throw new Error('Calendar feed issuer did not return a token.');
    feedUrl.searchParams.set('token', mutation.token);
    return NextResponse.json({ url: feedUrl.toString() });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[calendar/feed] Unable to create calendar feed:', error);
    return NextResponse.json({ error: 'Unable to create calendar feed.' }, { status: 500 });
  }
}
