import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validFirestoreDocumentId } from '@/lib/firestore-document-id';
import { permitsLegacyOrPaidPortals, publicTournament } from '@/lib/public-portal-data';

function publicBracketGame(game: Record<string, any>) {
  return {
    id: typeof game.id === 'string' ? game.id : '',
    team1: typeof game.team1 === 'string' ? game.team1 : 'TBD',
    team2: typeof game.team2 === 'string' ? game.team2 : 'TBD',
    team1Id: typeof game.team1Id === 'string' ? game.team1Id : '',
    team2Id: typeof game.team2Id === 'string' ? game.team2Id : '',
    team1LogoUrl: typeof game.team1LogoUrl === 'string' ? game.team1LogoUrl : '',
    team2LogoUrl: typeof game.team2LogoUrl === 'string' ? game.team2LogoUrl : '',
    score1: Number(game.score1) || 0,
    score2: Number(game.score2) || 0,
    date: typeof game.date === 'string' ? game.date : '',
    time: typeof game.time === 'string' ? game.time : '',
    location: typeof game.location === 'string' ? game.location : '',
    isCompleted: game.isCompleted === true,
    round: typeof game.round === 'string' ? game.round : '',
    stage: typeof game.stage === 'string' ? game.stage : '',
    winnerTo: typeof game.winnerTo === 'string' ? game.winnerTo : '',
    winnerToSlot: game.winnerToSlot === 'team1' || game.winnerToSlot === 'team2' ? game.winnerToSlot : undefined,
    loserTo: typeof game.loserTo === 'string' ? game.loserTo : '',
    loserToSlot: game.loserToSlot === 'team1' || game.loserToSlot === 'team2' ? game.loserToSlot : undefined,
    pool: Number.isInteger(game.pool) ? game.pool : undefined,
    isResetMatch: game.isResetMatch === true,
    isConditional: game.isConditional === true,
  };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ teamId: string; eventId: string }> }
) {
  try {
    const params = await context.params;
    const teamId = validFirestoreDocumentId(params.teamId);
    const eventId = validFirestoreDocumentId(params.eventId);
    if (!teamId || !eventId) {
      return NextResponse.json({ error: 'Valid team and tournament IDs are required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const [team, snapshot] = await Promise.all([
      teamRef.get(),
      teamRef.collection('events').doc(eventId).get(),
    ]);
    const data = snapshot.data() || {};
    if (!team.exists || !snapshot.exists || data.isTournament !== true) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }
    const teamData = team.data() || {};
    if (!permitsLegacyOrPaidPortals(teamData.planId, teamData.plan_type, teamData.subscriptionPlanId)) {
      return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
    }
    const tournament = {
      ...publicTournament(eventId, data),
      teamId,
      tournamentGames: Array.isArray(data.tournamentGames)
        ? data.tournamentGames.map(publicBracketGame)
        : [],
    };
    if (!tournament.isActive) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    return NextResponse.json({ tournament });
  } catch (error: any) {
    console.error('[public/tournaments GET] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to load this tournament.' },
      { status: 500 }
    );
  }
}
