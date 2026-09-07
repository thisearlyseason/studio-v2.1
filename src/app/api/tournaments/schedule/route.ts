import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  executeTournamentScheduleCommand,
  mutateTournamentSchedule,
  TournamentScheduleDeploymentError,
} from '@/lib/server-tournament-schedule-deployment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 1_000_000);
    const allowedFields = new Set(['action', 'requestId', 'teamId', 'eventId', 'expectedVersion', 'expectedScheduleVersion', 'games', 'gameId', 'refereeId', 'referee', 'score1', 'score2', 'explicitWinner', 'pin', 'notes', 'isTeam1']);
    if (Object.keys(body).some(key => !allowedFields.has(key))) {
      return NextResponse.json({ error: 'Unsupported Tournament schedule field.' }, { status: 400 });
    }
    const liveMutationActions = new Set(['score', 'dispute', 'assign-referee', 'add-referee', 'remove-referee']);
    const isLiveMutation = liveMutationActions.has(String(body.action));
    const limited = await enforceUserRateLimit(
      auth.uid,
      isLiveMutation ? 'tournament-schedule-live-mutation' : 'tournament-schedule-deployment',
      isLiveMutation ? 300 : 30,
      60 * 60 * 1_000
    );
    if (limited) return limited;

    if (['score', 'dispute'].includes(String(body.action))) {
      const schedule = await mutateTournamentSchedule({
        teamId: typeof body.teamId === 'string' ? body.teamId : '',
        eventId: typeof body.eventId === 'string' ? body.eventId : '',
        action: body.action as 'score' | 'dispute',
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
    const action = body.action === undefined || body.action === 'deploy'
      ? 'deploy'
      : ['clear', 'add-referee', 'remove-referee', 'assign-referee', 'seed-pools'].includes(String(body.action))
        ? body.action as 'clear' | 'add-referee' | 'remove-referee' | 'assign-referee' | 'seed-pools'
        : null;
    if (!action) return NextResponse.json({ error: 'Invalid Tournament schedule action.' }, { status: 400 });
    const result = await executeTournamentScheduleCommand({
      teamId: typeof body.teamId === 'string' ? body.teamId : '',
      eventId: typeof body.eventId === 'string' ? body.eventId : '',
      action,
      requestId: typeof body.requestId === 'string' ? body.requestId : '',
      expectedVersion: Number(body.expectedVersion),
      expectedScheduleVersion: Number(body.expectedScheduleVersion),
      games: body.games,
      actor: { uid: auth.uid, email: auth.email, role: auth.role },
      gameId: body.gameId,
      refereeId: body.refereeId,
      referee: body.referee,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof TournamentScheduleDeploymentError || (error instanceof Error && 'status' in error)) {
      const deploymentError = error as TournamentScheduleDeploymentError;
      return NextResponse.json(
        {
          error: deploymentError.message,
          code: deploymentError.code,
          ...(Array.isArray(deploymentError.conflicts) && deploymentError.conflicts.length > 0 ? { conflicts: deploymentError.conflicts } : {}),
        },
        { status: deploymentError.status }
      );
    }
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'Only current authorized staff can manage this Tournament.' }, { status: 403 });
    if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
    if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
    console.error('[tournaments/schedule] Deployment failed:', error);
    return NextResponse.json(
      { error: 'Unable to deploy the tournament schedule.' },
      { status: 500 }
    );
  }
}

/** Legacy destructive entry point: lifecycle owns identity, version and retention. */
export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ error: 'Use /api/tournaments/lifecycle with action, requestId and expectedVersion.' }, { status: 410 });
}
