import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  archiveTournamentSchedule,
  clearTournamentSchedule,
  deleteTournament,
  deployTournamentSchedule,
  mutateTournamentSchedule,
  TournamentScheduleDeploymentError,
} from '@/lib/server-tournament-schedule-deployment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 1_000_000);
    const liveMutationActions = new Set(['score', 'dispute', 'assign-referee', 'clear-referee']);
    const isLiveMutation = liveMutationActions.has(String(body.action));
    const limited = await enforceUserRateLimit(
      auth.uid,
      isLiveMutation ? 'tournament-schedule-live-mutation' : 'tournament-schedule-deployment',
      isLiveMutation ? 300 : 30,
      60 * 60 * 1_000
    );
    if (limited) return limited;

    if (['score', 'dispute', 'assign-referee', 'clear-referee', 'seed-pools'].includes(String(body.action))) {
      const schedule = await mutateTournamentSchedule({
        teamId: typeof body.teamId === 'string' ? body.teamId : '',
        eventId: typeof body.eventId === 'string' ? body.eventId : '',
        action: body.action as 'score' | 'dispute' | 'assign-referee' | 'clear-referee' | 'seed-pools',
        actor: { uid: auth.uid, email: auth.email, role: auth.role },
        gameId: body.gameId,
        score1: body.score1,
        score2: body.score2,
        explicitWinner: body.explicitWinner,
        pin: body.pin,
        notes: body.notes,
        refereeId: body.refereeId,
      });
      return NextResponse.json({ success: true, schedule });
    }
    if (body.action === 'clear') {
      await clearTournamentSchedule({
        teamId: typeof body.teamId === 'string' ? body.teamId : '',
        eventId: typeof body.eventId === 'string' ? body.eventId : '',
        actor: { uid: auth.uid, email: auth.email, role: auth.role },
      });
      return NextResponse.json({ success: true, schedule: [] });
    }
    const schedule = await deployTournamentSchedule({
      teamId: typeof body.teamId === 'string' ? body.teamId : '',
      eventId: typeof body.eventId === 'string' ? body.eventId : '',
      games: body.games,
      actor: { uid: auth.uid, email: auth.email, role: auth.role },
    });
    return NextResponse.json({ success: true, schedule });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TournamentScheduleDeploymentError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.conflicts.length > 0 ? { conflicts: error.conflicts } : {}),
        },
        { status: error.status }
      );
    }
    console.error('[tournaments/schedule] Deployment failed:', error);
    return NextResponse.json(
      { error: 'Unable to deploy the tournament schedule.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(
      auth.uid,
      'tournament-schedule-archive',
      20,
      60 * 60 * 1_000
    );
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 10_000);
    const input = {
      teamId: typeof body.teamId === 'string' ? body.teamId : '',
      eventId: typeof body.eventId === 'string' ? body.eventId : '',
      actor: { uid: auth.uid, email: auth.email, role: auth.role },
    };
    if (body.action === 'delete') await deleteTournament(input);
    else await archiveTournamentSchedule(input);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TournamentScheduleDeploymentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[tournaments/schedule] Archive failed:', error);
    return NextResponse.json({ error: 'Unable to archive the tournament.' }, { status: 500 });
  }
}
