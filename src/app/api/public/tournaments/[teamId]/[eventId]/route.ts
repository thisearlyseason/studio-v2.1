import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

function cleanId(value: string): string | null {
  return /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : null;
}

function publicGame(game: Record<string, any>) {
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
    winnerToSlot:
      game.winnerToSlot === 'team1' || game.winnerToSlot === 'team2'
        ? game.winnerToSlot
        : undefined,
    loserTo: typeof game.loserTo === 'string' ? game.loserTo : '',
    loserToSlot:
      game.loserToSlot === 'team1' || game.loserToSlot === 'team2'
        ? game.loserToSlot
        : undefined,
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
    const teamId = cleanId(params.teamId);
    const eventId = cleanId(params.eventId);
    if (!teamId || !eventId) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    const snapshot = await adminDb
      .collection('teams')
      .doc(teamId)
      .collection('events')
      .doc(eventId)
      .get();
    const data = snapshot.data() || {};
    if (!snapshot.exists || data.isTournament !== true) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    const tournamentTeams = Array.isArray(data.tournamentTeams)
      ? data.tournamentTeams.filter((team: unknown): team is string => typeof team === 'string')
      : [];
    const tournamentTeamsData = Array.isArray(data.tournamentTeamsData)
      ? data.tournamentTeamsData.map((team: Record<string, any>) => ({
          id: typeof team.id === 'string' ? team.id : '',
          name: typeof team.name === 'string' ? team.name : '',
          logoUrl: typeof team.logoUrl === 'string' ? team.logoUrl : '',
        }))
      : [];

    return NextResponse.json({
      tournament: {
        id: eventId,
        teamId,
        title: typeof data.title === 'string' ? data.title : 'Tournament',
        date: typeof data.date === 'string' ? data.date : '',
        endDate: typeof data.endDate === 'string' ? data.endDate : '',
        location: typeof data.location === 'string' ? data.location : '',
        isTournament: true,
        tournamentTeams,
        tournamentTeamsData,
        tournamentGames: Array.isArray(data.tournamentGames)
          ? data.tournamentGames.map(publicGame)
          : [],
      },
    });
  } catch (error: any) {
    console.error('[public/tournaments GET] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to load this tournament.' },
      { status: 500 }
    );
  }
}
