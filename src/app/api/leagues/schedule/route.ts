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
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 1_000_000);
    const isLiveMutation = body.action === 'score' || body.action === 'dispute';
    const limited = await enforceUserRateLimit(
      auth.uid,
      isLiveMutation ? 'league-schedule-game-mutation' : 'league-schedule-deployment',
      isLiveMutation ? 300 : 30,
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
