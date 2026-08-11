import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  clearLeagueSchedule,
  configureLeagueSchedule,
  deployLeagueSchedule,
  mutateLeagueScheduleGame,
  removeLeagueTeamMembership,
  ScheduleDeploymentError,
} from '@/lib/server-schedule-deployment';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export const runtime = 'nodejs';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function requestedLeagueIds(body: Record<string, unknown>): string[] {
  const candidates = Array.isArray(body.leagueIds) ? body.leagueIds : [body.leagueId];
  const ids = [...new Set(candidates.filter((value): value is string => typeof value === 'string'))];
  if (ids.length === 0 || ids.length > 100 || ids.some(id => !ID_PATTERN.test(id))) {
    throw new RequestBodyError('Select at least one valid league to delete.', 400);
  }
  return ids;
}

async function purgeLeagueProjectionsForDeletion(leagueId: string): Promise<void> {
  const sourceId = `league:${leagueId}`;
  const [bookings, events] = await Promise.all([
    adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
    adminDb.collectionGroup('events').where('leagueId', '==', leagueId).get(),
  ]);
  const refs = [...bookings.docs, ...events.docs].map(document => document.ref);
  for (let index = 0; index < refs.length; index += 400) {
    const batch = adminDb.batch();
    refs.slice(index, index + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 1_000_000);
    const isLiveMutation = body.action === 'score' || body.action === 'dispute';
    const isDelete = body.action === 'delete';
    const baseLimit = isLiveMutation ? 300 : 30;
    const limited = await enforceUserRateLimit(
      auth.uid,
      isLiveMutation ? 'league-schedule-game-mutation' : 'league-schedule-deployment',
      isDelete ? 300 : baseLimit,
      60 * 60 * 1_000
    );
    if (limited) return limited;

    if (body.action === 'remove-team') {
      await removeLeagueTeamMembership({
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        teamId: typeof body.teamId === 'string' ? body.teamId : '',
        actor: { uid: auth.uid, role: auth.role },
      });
      return NextResponse.json({ success: true });
    }
    if (body.action === 'score' || body.action === 'dispute') {
      const schedule = await mutateLeagueScheduleGame({
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        gameId: typeof body.gameId === 'string' ? body.gameId : '',
        action: body.action,
        actor: { uid: auth.uid, role: auth.role },
        score1: body.score1,
        score2: body.score2,
        pin: body.pin,
        notes: body.notes,
      });
      return NextResponse.json({ success: true, schedule });
    }
    if (body.action === 'clear') {
      const mode = body.mode === 'archive' || body.mode === 'purge' || body.mode === 'clear'
        ? body.mode
        : null;
      if (!mode) {
        return NextResponse.json({ error: 'Invalid schedule cleanup mode.' }, { status: 400 });
      }
      await clearLeagueSchedule({
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        mode,
        actor: { uid: auth.uid, role: auth.role },
      });
      return NextResponse.json({ success: true, schedule: [] });
    }
    if (body.action === 'delete') {
      const leagueIds = requestedLeagueIds(body);
      const leagueRefs = leagueIds.map(leagueId => adminDb.collection('leagues').doc(leagueId));
      const leagues = await adminDb.getAll(...leagueRefs);
      if (leagues.some(league => !league.exists)) {
        return NextResponse.json({ error: 'One or more leagues no longer exist. Refresh and try again.' }, { status: 409 });
      }
      if (auth.role !== 'superadmin' && leagues.some(league => league.data()?.creatorId !== auth.uid)) {
        return NextResponse.json({ error: 'Only the league organizer can delete this league.' }, { status: 403 });
      }

      // Authorize the complete workspace before mutating any division. This
      // prevents a group delete from stopping halfway through its league.
      await Promise.all(leagueIds.map(purgeLeagueProjectionsForDeletion));

      for (const league of leagues) {
        const data = league.data() || {};
        const teamIds = [...new Set([
          ...(Array.isArray(data.memberTeamIds) ? data.memberTeamIds : []),
          ...Object.keys(data.teams || {}),
        ].filter((teamId): teamId is string =>
          typeof teamId === 'string' &&
          ID_PATTERN.test(teamId) &&
          !teamId.startsWith('manual_') &&
          !teamId.startsWith('recruit_')
        ))];
        const teamRefs = teamIds.map(teamId => adminDb.collection('teams').doc(teamId));
        const teams = teamRefs.length > 0 ? await adminDb.getAll(...teamRefs) : [];
        await Promise.all([
          ...teams.filter(team => team.exists).map(team => team.ref.update({
            [`leagueIds.${league.id}`]: FieldValue.delete(),
          })),
          adminDb.collection('publicLeagueViews').doc(league.id).delete(),
          adminDb.recursiveDelete(league.ref),
        ]);
      }
      return NextResponse.json({ success: true, deletedLeagueIds: leagueIds });
    }
    if (body.action === 'configure') {
      await configureLeagueSchedule({
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        actor: { uid: auth.uid, role: auth.role },
        config: body.config,
        invalidateExisting: body.invalidateExisting === true,
      });
      return NextResponse.json({ success: true });
    }
    const action = body.action === 'append' ? 'append' : body.action === 'replace' ? 'replace' : null;
    if (!action) {
      return NextResponse.json({ error: 'Invalid schedule deployment action.' }, { status: 400 });
    }

    const result = await deployLeagueSchedule({
      leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
      action,
      actor: { uid: auth.uid, role: auth.role },
      games: body.games,
      game: body.game,
    });
    return NextResponse.json({
      success: true,
      schedule: result.games,
      game: result.appendedGame,
      idempotent: result.idempotent,
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ScheduleDeploymentError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.conflicts.length > 0 ? { conflicts: error.conflicts } : {}),
        },
        { status: error.status }
      );
    }
    console.error('[leagues/schedule] Deployment failed:', error);
    return NextResponse.json(
      { error: 'Unable to deploy the league schedule.' },
      { status: 500 }
    );
  }
}
