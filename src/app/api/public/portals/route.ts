import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  permitsLegacyOrPaidPortals,
  publicLeague,
  publicRegistrationConfig,
  publicTournament,
} from '@/lib/public-portal-data';
import { enforceUserRateLimit } from '@/lib/server-request-guards';

function isSafeId(value: string | null): value is string {
  return !!value && value.length <= 200 && !value.includes('/');
}

async function findLeague(identifier: string) {
  const direct = await adminDb.collection('leagues').doc(identifier).get();
  if (direct.exists) return direct;

  const bySlug = await adminDb.collection('leagues').where('slug', '==', identifier).limit(1).get();
  return bySlug.empty ? null : bySlug.docs[0];
}

export async function GET(req: NextRequest) {
  try {
    const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const limited = await enforceUserRateLimit(fingerprint, 'public-portals-read', 300, 60 * 60 * 1000);
    if (limited) return limited;
    const kind = req.nextUrl.searchParams.get('kind');

    if (kind === 'league-registration') {
      const identifier = req.nextUrl.searchParams.get('leagueId');
      const protocolId = req.nextUrl.searchParams.get('protocolId') || 'player_config';
      if (!isSafeId(identifier) || !isSafeId(protocolId)) return NextResponse.json({ error: 'Missing or invalid league registration identifiers.' }, { status: 400 });
      const league = await findLeague(identifier);
      if (!league) return NextResponse.json({ error: 'League portal not found.' }, { status: 404 });
      const creator = league.data()?.creatorId ? await adminDb.collection('users').doc(league.data()!.creatorId).get() : null;
      if (creator?.exists && !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      const publicLeagueData = publicLeague(league.id, league.data());
      if (!publicLeagueData.isActive) return NextResponse.json({ error: 'League portal is inactive.' }, { status: 404 });
      const config = await league.ref.collection('registration').doc(protocolId).get();
      if (!config.exists || config.data()?.is_active !== true) {
        return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 404 });
      }
      return NextResponse.json({ data: { league: publicLeagueData, config: publicRegistrationConfig(config.id, config.data()) } });
    }

    if (kind === 'tournament-registration') {
      const teamId = req.nextUrl.searchParams.get('teamId');
      const eventId = req.nextUrl.searchParams.get('eventId');
      const protocolId = req.nextUrl.searchParams.get('protocolId') || 'team_config';
      if (!isSafeId(teamId) || !isSafeId(eventId) || !isSafeId(protocolId)) return NextResponse.json({ error: 'Missing or invalid tournament identifiers.' }, { status: 400 });
      const eventRef = adminDb.collection('teams').doc(teamId).collection('events').doc(eventId);
      const [event, config, team] = await Promise.all([
        eventRef.get(),
        eventRef.collection('registration').doc(protocolId).get(),
        adminDb.collection('teams').doc(teamId).get(),
      ]);
      if (!team.exists || !event.exists || !event.data()?.isTournament) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      if (!permitsLegacyOrPaidPortals(team.data()?.planId, team.data()?.plan_type, team.data()?.subscriptionPlanId)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      const publicEvent = publicTournament(event.id, event.data());
      if (!publicEvent.isActive) return NextResponse.json({ error: 'Tournament portal is inactive.' }, { status: 404 });
      if (!config.exists || config.data()?.is_active !== true) return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 404 });
      return NextResponse.json({ data: { event: publicEvent, config: publicRegistrationConfig(config.id, config.data()) } });
    }

    if (kind === 'league') {
      const identifier = req.nextUrl.searchParams.get('leagueId');
      if (!isSafeId(identifier)) return NextResponse.json({ error: 'Missing or invalid leagueId.' }, { status: 400 });
      const league = await findLeague(identifier);
      if (!league) return NextResponse.json({ error: 'League portal not found.' }, { status: 404 });
      const creatorId = league.data()?.creatorId;
      if (creatorId) {
        const creator = await adminDb.collection('users').doc(String(creatorId)).get();
        if (creator.exists && !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
          return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
        }
      }
      const data = publicLeague(league.id, league.data());
      if (!data.isActive) return NextResponse.json({ error: 'League portal is inactive.' }, { status: 404 });
      return NextResponse.json({ data });
    }

    if (kind === 'tournament') {
      const teamId = req.nextUrl.searchParams.get('teamId');
      const eventId = req.nextUrl.searchParams.get('eventId');
      if (!isSafeId(teamId) || !isSafeId(eventId)) {
        return NextResponse.json({ error: 'Missing teamId or eventId.' }, { status: 400 });
      }
      const event = await adminDb.collection('teams').doc(teamId).collection('events').doc(eventId).get();
      if (!event.exists) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      const team = await adminDb.collection('teams').doc(teamId).get();
      if (!team.exists) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      if (!permitsLegacyOrPaidPortals(team.data()?.planId, team.data()?.plan_type, team.data()?.subscriptionPlanId)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      const eventData = event.data()!;
      const data: any = publicTournament(event.id, eventData);
      const refereeEmail = req.nextUrl.searchParams.get('refereeEmail')?.trim().toLowerCase();
      if (refereeEmail) {
        const referee = (eventData.refereePool || []).find(
          (candidate: any) => String(candidate.email || '').toLowerCase() === refereeEmail
        );
        data.activeReferee = referee ? {
          id: referee.id,
          name: referee.name,
          certLevel: referee.certLevel,
        } : null;
      }
      if (!data.isActive) return NextResponse.json({ error: 'Tournament portal is inactive.' }, { status: 404 });
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: 'Invalid portal kind.' }, { status: 400 });
  } catch (error: any) {
    console.error('[public/portals] Error:', error.message);
    return NextResponse.json({ error: 'Portal service is temporarily unavailable.' }, { status: 500 });
  }
}
