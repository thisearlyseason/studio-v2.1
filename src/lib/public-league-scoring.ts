export function leagueGameVersionFloor(league: { gameVersionFloor?: unknown; schedule?: unknown }): number {
  const versions = [league.gameVersionFloor ?? 0, ...(Array.isArray(league.schedule) ? league.schedule.map(game => game.gameVersion ?? 0) : [])];
  if (versions.some(version => !Number.isSafeInteger(version) || Number(version) < 0 || Number(version) >= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid competition game version.');
  return Math.max(...versions as number[]);
}

export function canResolveLeagueGame(input: { actorUid?: string; actorRole?: string; creatorId?: string; tenantId?: string; ownedTeamId?: string; isDisputed?: boolean }): boolean {
  return input.isDisputed === true && !!input.actorUid && (input.actorRole === 'superadmin' || input.creatorId === input.actorUid || (!!input.tenantId && input.tenantId === input.ownedTeamId));
}

export function leagueResolutionCommand(input: { leagueId: string; gameId: string; expectedGameVersion: number; outcome: string; reason: string; score1?: number; score2?: number }): Record<string, unknown> {
  if (!input.reason.trim() || input.reason.trim().length > 2000) throw new Error('A resolution reason is required.');
  if (!['uphold', 'correct'].includes(input.outcome)) throw new Error('Choose uphold or correct.');
  if (!Number.isSafeInteger(input.expectedGameVersion) || input.expectedGameVersion < 0) throw new Error('Refresh the match before resolving the dispute.');
  if (input.outcome === 'correct' && [input.score1, input.score2].some(score => typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > 9999)) throw new Error('Corrected scores must be whole numbers from 0 to 9999.');
  return { action: 'resolve-dispute', leagueId: input.leagueId, gameId: input.gameId, expectedGameVersion: input.expectedGameVersion, outcome: input.outcome, reason: input.reason.trim(),
    ...(input.outcome === 'correct' ? { score1: input.score1, score2: input.score2 } : {}) };
}

/** Retain the exact command until a readable, definitive server response. */
export async function sendLeagueScoringCommand(
  pending: Map<string, Record<string, unknown>>,
  input: Record<string, unknown>,
  send: (body: Record<string, unknown>) => Promise<Response>,
): Promise<void> {
  const key = JSON.stringify(input);
  let body = pending.get(key);
  if (!body) {
    body = { ...input, requestId: 'league-score-' + crypto.randomUUID() };
    pending.set(key, body);
  }
  const response = await send(body);
  const result = await response.json();
  if (response.ok || response.status < 500) pending.delete(key);
  if (!response.ok) throw new Error(result.error || 'Unable to update the League result.');
}

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
    if (game.isExhibition === true || game.isDisputed === true) return;
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
