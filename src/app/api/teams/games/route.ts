import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const gameId = typeof body.gameId === 'string' && ID_PATTERN.test(body.gameId) ? body.gameId : null;
    const opponent = typeof body.opponent === 'string' ? body.opponent.trim().slice(0, 120) : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const myScore = Number(body.myScore);
    const opponentScore = Number(body.opponentScore);
    const eventId = typeof body.eventId === 'string' && ID_PATTERN.test(body.eventId) ? body.eventId : null;
    const location = typeof body.location === 'string' ? body.location.trim().slice(0, 240) : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2_000) : '';
    const parsedDate = new Date(date);

    if (
      !teamId ||
      opponent.length < 1 ||
      Number.isNaN(parsedDate.getTime()) ||
      !Number.isInteger(myScore) ||
      !Number.isInteger(opponentScore) ||
      myScore < 0 ||
      opponentScore < 0 ||
      myScore > 999 ||
      opponentScore > 999
    ) {
      return NextResponse.json({ error: 'Enter a valid opponent, date, and final score.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(auth.uid, 'team-game-write', 30, 10 * 60 * 1000);
    if (rateLimit) return rateLimit;
    const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority?.isStaff) {
      return NextResponse.json({ error: 'Only authorized squad staff can record final scores.' }, { status: 403 });
    }

    const result = myScore > opponentScore ? 'Win' : myScore < opponentScore ? 'Loss' : 'Tie';
    const games = authority.teamRef.collection('games');
    const resolvedId =
      gameId ||
      createHash('sha256')
        .update(`${teamId}:${eventId || ''}:${date}:${opponent}:${req.headers.get('idempotency-key') || ''}`)
        .digest('hex')
        .slice(0, 40);
    const payload = {
      opponent,
      date: parsedDate.toISOString(),
      myScore,
      opponentScore,
      result,
      location,
      notes,
      eventId,
      teamId,
      updatedAt: new Date().toISOString(),
      updatedBy: auth.uid,
    };
    await games.doc(resolvedId).set(
      gameId ? payload : { ...payload, id: resolvedId, createdAt: new Date().toISOString() },
      { merge: gameId !== null }
    );

    return NextResponse.json({ ok: true, gameId: resolvedId });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/games] Unable to record score:', error);
    return NextResponse.json({ error: 'Unable to record the final score.' }, { status: 500 });
  }
}
