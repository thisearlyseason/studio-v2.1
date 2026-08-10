export function recalculatePublicLeagueStandings(
  rawTeams: unknown,
  schedule: Array<Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const sourceTeams = rawTeams && typeof rawTeams === 'object' && !Array.isArray(rawTeams)
    ? rawTeams as Record<string, unknown>
    : {};
  const teams = Object.fromEntries(Object.entries(sourceTeams).map(([teamId, team]) => [teamId, {
    ...(team && typeof team === 'object' && !Array.isArray(team) ? team : {}),
    wins: 0,
    losses: 0,
    ties: 0,
    points: 0,
  }])) as Record<string, Record<string, unknown>>;

  schedule.forEach(game => {
    if (game.isExhibition === true) return;
    const score1 = Number(game.score1);
    const score2 = Number(game.score2);
    const team1Id = typeof game.team1Id === 'string' ? game.team1Id : '';
    const team2Id = typeof game.team2Id === 'string' ? game.team2Id : '';
    if (game.isCompleted !== true || !Number.isInteger(score1) || !Number.isInteger(score2)) return;
    if (!teams[team1Id] || !teams[team2Id]) return;

    if (score1 > score2) {
      teams[team1Id].wins = Number(teams[team1Id].wins || 0) + 1;
      teams[team1Id].points = Number(teams[team1Id].points || 0) + 3;
      teams[team2Id].losses = Number(teams[team2Id].losses || 0) + 1;
    } else if (score2 > score1) {
      teams[team2Id].wins = Number(teams[team2Id].wins || 0) + 1;
      teams[team2Id].points = Number(teams[team2Id].points || 0) + 3;
      teams[team1Id].losses = Number(teams[team1Id].losses || 0) + 1;
    } else {
      teams[team1Id].ties = Number(teams[team1Id].ties || 0) + 1;
      teams[team1Id].points = Number(teams[team1Id].points || 0) + 1;
      teams[team2Id].ties = Number(teams[team2Id].ties || 0) + 1;
      teams[team2Id].points = Number(teams[team2Id].points || 0) + 1;
    }
  });

  return teams;
}

export function publicLeagueGameProjection(input: {
  leagueId: string;
  leagueName: string;
  game: Record<string, unknown>;
  teamId: string;
  opponentTeamId: string;
  opponent: string;
  myScore: number;
  opponentScore: number;
  updatedAt: string;
}): Record<string, unknown> {
  const projectionId = `lg_${String(input.game.id || '')}`;
  return {
    id: projectionId,
    teamId: input.teamId,
    opponent: input.opponent,
    date: typeof input.game.date === 'string' ? input.game.date : '',
    myScore: input.myScore,
    opponentScore: input.opponentScore,
    result: input.myScore > input.opponentScore ? 'Win' : input.myScore < input.opponentScore ? 'Loss' : 'Tie',
    location: typeof input.game.location === 'string' ? input.game.location : '',
    notes: `Official result from ${input.leagueName}`,
    leagueId: input.leagueId,
    leagueGameId: String(input.game.id || ''),
    matchTeamIds: [input.teamId, input.opponentTeamId],
    updatedAt: input.updatedAt,
  };
}
