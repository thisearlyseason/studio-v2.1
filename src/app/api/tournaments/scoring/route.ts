import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { openTournamentDispute, resolveTournamentDispute, submitTournamentScore, tournamentScoringInput } from '@/lib/server-competition-scoring';
import { ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import { TournamentScheduleDeploymentError } from '@/lib/server-tournament-schedule-deployment';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 16 * 1024);
    const allowed = new Set(['kind', 'action', 'requestId', 'teamId', 'eventId', 'gameId', 'expectedLifecycleVersion', 'expectedScheduleVersion', 'expectedGameVersion', 'expectedCredentialVersion', 'score1', 'score2', 'explicitWinner', 'notes', 'reason', 'resolution', 'correctedScore', 'reportedBy', 'code']);
    if (Object.keys(body).some(key => !allowed.has(key))) return NextResponse.json({ error: 'Unsupported Tournament scoring field.' }, { status: 400 });
    const limited = await enforceUserRateLimit(auth.uid, 'tournament-scoring', 300, 60 * 60 * 1_000);
    if (limited) return limited;
    const input = tournamentScoringInput(body, { uid: auth.uid, role: auth.role });
    const action = String(body.action || 'score');
    const result = action === 'score' ? await submitTournamentScore(input)
      : action === 'dispute' ? await openTournamentDispute(input)
        : action === 'resolve-dispute' ? await resolveTournamentDispute(input)
          : null;
    if (!result) return NextResponse.json({ error: 'Invalid Tournament scoring action.' }, { status: 400 });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof TournamentScheduleDeploymentError || error instanceof ScheduleDeploymentError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '';
    if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
    if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'Tournament access denied.' }, { status: 403 });
    if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
    console.error('[tournaments/scoring] Error:', error);
    return NextResponse.json({ error: 'Tournament scoring could not be completed.' }, { status: 500 });
  }
}
