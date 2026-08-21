import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { accountCreationLimit } from '@/lib/account-creation-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import {
  assertLeagueCloneCapacity,
  buildLeagueCloneDocument,
  buildLeagueCloneResult,
  parseLeagueCloneRequest,
  resolveLeagueCloneIdentity,
} from '@/lib/server-league-cloning';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const { sourceLeagueId, destination: cloneDestination, requestedName } = parseLeagueCloneRequest(body);

    const sourceRef = adminDb.collection('leagues').doc(sourceLeagueId);
    const userRef = adminDb.collection('users').doc(auth.uid);
    const ownedLeaguesQuery = adminDb.collection('leagues').where('creatorId', '==', auth.uid);
    const [source, configs, profile, ownedLeagues] = await Promise.all([
      sourceRef.get(),
      sourceRef.collection('registration').get(),
      userRef.get(),
      ownedLeaguesQuery.get(),
    ]);
    if (!source.exists) return NextResponse.json({ error: 'Source league not found.' }, { status: 404 });
    if (auth.role !== 'superadmin' && source.data()?.creatorId !== auth.uid) {
      return NextResponse.json({ error: 'Only the league organizer can clone this league.' }, { status: 403 });
    }
    const existingLeagues = ownedLeagues.docs.map(league => ({ id: league.id, ...league.data() }));
    if (auth.role !== 'superadmin') {
      if (!profile.exists) {
        return NextResponse.json({ error: 'Account profile is incomplete.' }, { status: 409 });
      }
      assertLeagueCloneCapacity({
        destination: cloneDestination,
        existingLeagues,
        leagueLimit: accountCreationLimit(profile.data()),
      });
    }

    const sourceData = { id: sourceLeagueId, ...(source.data() || {}) } as Record<string, unknown> & {
      id: string;
      name: string;
      divisionTitle?: string;
    };
    const identity = resolveLeagueCloneIdentity({
      source: sourceData,
      destination: cloneDestination,
      requestedName,
      existingLeagues,
    });
    const generatedRef = adminDb.collection('leagues').doc();
    const leagueId = `league_${generatedRef.id}`;
    const destination = adminDb.collection('leagues').doc(leagueId);
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    batch.create(destination, buildLeagueCloneDocument({
      source: sourceData,
      leagueId,
      actorUid: auth.uid,
      identity,
      now,
    }));
    for (const config of configs.docs) {
      batch.set(destination.collection('registration').doc(config.id), { ...config.data(), is_active: false });
    }
    await batch.commit();
    return NextResponse.json(buildLeagueCloneResult({
      leagueId,
      destination: cloneDestination,
      identity,
    }), { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code === 'DIVISION_ALREADY_EXISTS') {
      return NextResponse.json({ error: 'A division with this name already exists in the league.' }, { status: 409 });
    }
    if (code === 'LEAGUE_ALREADY_EXISTS') {
      return NextResponse.json({ error: 'A league with this name already exists. Choose a unique league name.' }, { status: 409 });
    }
    if (code === 'LEAGUE_LIMIT_REACHED') {
      return NextResponse.json({ error: 'Your account has reached its league limit.' }, { status: 409 });
    }
    if (code.endsWith('_REQUIRED') || code.endsWith('_INVALID')) {
      return NextResponse.json({ error: 'Choose where to create the clone and enter a valid name.' }, { status: 400 });
    }
    console.error('[leagues/clone] Error:', error);
    return NextResponse.json({ error: 'Unable to clone the league.' }, { status: 500 });
  }
}
