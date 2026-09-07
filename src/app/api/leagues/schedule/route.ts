import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
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

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 1_000_000);
    if (body.action === 'delete') {
      return NextResponse.json({ error: 'League deletion requires DELETE /api/leagues/lifecycle with a request ID and lifecycle version.' }, { status: 410 });
    }
    const isLiveMutation = body.action === 'score' || body.action === 'dispute' || body.action === 'resolve-dispute';
    if (!isLiveMutation && (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 0)) {
      return NextResponse.json({ error: 'A numeric current League version is required.' }, { status: 400 });
    }
    const baseLimit = isLiveMutation ? 300 : 30;
    const limited = await enforceUserRateLimit(
      auth.uid,
      isLiveMutation ? 'league-schedule-game-mutation' : 'league-schedule-deployment',
      baseLimit,
      60 * 60 * 1_000
    );
    if (limited) return limited;

    if (body.action === 'remove-team') {
      await removeLeagueTeamMembership({
        requestId: String(body.requestId || ''), expectedVersion: Number(body.expectedVersion),
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        teamId: typeof body.teamId === 'string' ? body.teamId : '',
        actor: { uid: auth.uid, role: auth.role, signInProvider: auth.signInProvider },
      });
      return NextResponse.json({ success: true });
    }
    if (body.action === 'score' || body.action === 'dispute' || body.action === 'resolve-dispute') {
      const schedule = await mutateLeagueScheduleGame({
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        gameId: typeof body.gameId === 'string' ? body.gameId : '',
        action: body.action,
        requestId: String(body.requestId || ''),
        expectedGameVersion: body.expectedGameVersion as number,
        reason: body.reason, outcome: body.outcome,
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
        requestId: String(body.requestId || ''), expectedVersion: Number(body.expectedVersion),
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        mode,
        actor: { uid: auth.uid, role: auth.role, signInProvider: auth.signInProvider },
      });
      return NextResponse.json({ success: true, schedule: [] });
    }
    if (body.action === 'configure') {
      await configureLeagueSchedule({
        requestId: String(body.requestId || ''), expectedVersion: Number(body.expectedVersion),
        leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
        actor: { uid: auth.uid, role: auth.role, signInProvider: auth.signInProvider },
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
      requestId: String(body.requestId || ''), expectedVersion: Number(body.expectedVersion),
      leagueId: typeof body.leagueId === 'string' ? body.leagueId : '',
      action,
      actor: { uid: auth.uid, role: auth.role, signInProvider: auth.signInProvider },
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
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'Only current authorized staff can manage this schedule.' }, { status: 403 });
    if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
    if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
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
