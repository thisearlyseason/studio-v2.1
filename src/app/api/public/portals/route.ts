import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import {
  permitsLegacyOrPaidPortals,
  leagueBillingOwnerUserId,
  publicLeague,
  spectatorLeague, scorekeeperLeague,
  publicRegistrationConfig,
  publicTournament,
} from '@/lib/public-portal-data';
import { readActiveScoringLeague } from '@/lib/server-competition-scoring';
import { ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import { effectiveLeagueRegistrationConfig, RegistrationInputError } from '@/lib/registration-policy';
import { enforceUserRateLimit } from '@/lib/server-request-guards';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';

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
      const billingOwnerId = leagueBillingOwnerUserId(league.data() || {});
      const creator = billingOwnerId ? await adminDb.collection('users').doc(billingOwnerId).get() : null;
      if (!creator?.exists || !permitsLegacyOrPaidPortals(creator.data()?.plan_type)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      const publicLeagueData = publicLeague(league.id, league.data());
      if (!publicLeagueData.isActive) return NextResponse.json({ error: 'League portal is inactive.' }, { status: 404 });
      const config = await league.ref.collection('registration').doc(protocolId).get();
      if (!config.exists || config.data()?.is_active !== true) {
        return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 404 });
      }
      const effectiveConfig = effectiveLeagueRegistrationConfig(config.data() || {}, league.data() || {});
      return NextResponse.json({ data: { league: publicLeagueData, config: publicRegistrationConfig(config.id, effectiveConfig) } });
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
      if (event.data()?.registrationOpen !== true || event.data()?.status === 'cancelled') {
        return NextResponse.json({ error: 'Registration portal is inactive.' }, { status: 404 });
      }
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
      const data = await adminDb.runTransaction(async transaction => {
        const current = await readActiveScoringLeague(transaction, league.id);
        if (req.nextUrl.searchParams.get('purpose') === 'spectator') return spectatorLeague(league.id, current);
        const credential = await transaction.get(league.ref.collection('private').doc('lifecycle'));
        return scorekeeperLeague(league.id, { ...current, scorekeeperConfigured: !!credential.data()?.scorekeeperPinHash || !!current.scorekeeperPin });
      });
      return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (kind === 'tournament') {
      const teamId = req.nextUrl.searchParams.get('teamId');
      const eventId = req.nextUrl.searchParams.get('eventId');
      if (!isSafeId(teamId) || !isSafeId(eventId)) {
        return NextResponse.json({ error: 'Missing teamId or eventId.' }, { status: 400 });
      }
      const eventRef = adminDb.collection('teams').doc(teamId).collection('events').doc(eventId);
      const [event, scoringCredential] = await Promise.all([eventRef.get(), eventRef.collection('private').doc('scoring').get()]);
      if (!event.exists) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      const team = await adminDb.collection('teams').doc(teamId).get();
      if (!team.exists) return NextResponse.json({ error: 'Tournament portal not found.' }, { status: 404 });
      if (!permitsLegacyOrPaidPortals(team.data()?.planId, team.data()?.plan_type, team.data()?.subscriptionPlanId)) {
        return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
      }
      const eventData = event.data()!;
      const data: any = publicTournament(event.id, { ...eventData, scorekeeperConfigured: !!scoringCredential.data()?.scorekeeperCodeHash || !!eventData.scoringCode });
      const refereeEmail = req.nextUrl.searchParams.get('refereeEmail')?.trim().toLowerCase();
      if (refereeEmail) {
        const auth = await verifyFirebaseToken(req);
        if (auth instanceof NextResponse) return auth;
        const anonymousError = assertNonAnonymous(auth);
        if (anonymousError) return anonymousError;
        const authenticatedEmail = auth.email?.trim().toLowerCase();
        if (!authenticatedEmail || authenticatedEmail !== refereeEmail) {
          return NextResponse.json(
            { error: 'Referee access could not be verified for this signed-in account.' },
            { status: 403 }
          );
        }
        const refereeProfiles = await adminDb.collection('tournamentReferees').where('teamId', '==', teamId).where('eventId', '==', eventId).limit(201).get();
        let referee: any = refereeProfiles.docs.map(candidate => candidate.data()).find(
          (candidate: any) => candidate.teamId === teamId && candidate.status !== 'removed' && candidate.isDeleted !== true && String(candidate.email || '').trim().toLowerCase() === refereeEmail
        );
        if (!referee) referee = await adminDb.runTransaction(async transaction => {
          const fresh = await transaction.get(event.ref);
          if (!fresh.exists || fresh.data()?.isTournament !== true || fresh.data()?.isArchived === true || fresh.data()?.is_active === false || fresh.data()?.status === 'cancelled') return null;
          const pool = Array.isArray(fresh.data()?.refereePool) ? fresh.data()!.refereePool : [];
          if (pool.length > 200) return null;
          const legacy = pool.find((candidate: any) => candidate.status !== 'removed' && candidate.isDeleted !== true && String(candidate.email || '').trim().toLowerCase() === refereeEmail);
          if (!legacy || !isSafeId(String(legacy.id || ''))) return null;
          const profileId = `trp_${createHash('sha256').update(`${teamId}:${eventId}:${legacy.id}`).digest('hex').slice(0, 40)}`;
          const profileRef = adminDb.collection('tournamentReferees').doc(profileId);
          const existing = await transaction.get(profileRef);
          if (existing.exists) return String(existing.data()?.email || '').trim().toLowerCase() === refereeEmail ? existing.data() : null;
          const now = new Date().toISOString();
          const profile = { id: String(legacy.id), refereeId: String(legacy.id), teamId, eventId, name: String(legacy.name || '').trim().slice(0, 160), email: refereeEmail, phone: typeof legacy.phone === 'string' ? legacy.phone.trim().slice(0, 80) : null, certLevel: typeof legacy.certLevel === 'string' ? legacy.certLevel.trim().slice(0, 120) : null, status: 'active', migratedFromLegacy: true, createdAt: now, updatedAt: now };
          transaction.create(profileRef, profile);
          transaction.update(event.ref, { refereePool: pool.map((candidate: any) => ({ id: String(candidate.id || '').slice(0, 180), name: String(candidate.name || '').slice(0, 160), certLevel: typeof candidate.certLevel === 'string' ? candidate.certLevel.slice(0, 120) : null, status: candidate.status === 'removed' ? 'removed' : 'active' })) });
          return profile;
        });
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
    if (error instanceof ScheduleDeploymentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof RegistrationInputError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[public/portals] Error:', error.message);
    return NextResponse.json({ error: 'Portal service is temporarily unavailable.' }, { status: 500 });
  }
}
