import type { TournamentGame } from '@/components/providers/team-provider';

export type StandingTeam = {
  id: string;
  name: string;
};

export type TournamentStanding = {
  id: string;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  netScore: number;
};

export function calculateTournamentStandings(
  teams: StandingTeam[],
  games: TournamentGame[],
  poolFilter?: number
): TournamentStanding[] {
  const relevantGames = poolFilter !== undefined
    ? games.filter(game => game.pool === poolFilter)
    : games;
  const participatingIds = new Set<string>();
  const participatingNames = new Set<string>();
  relevantGames.forEach(game => {
    if (game.team1Id && game.team1Id !== 'tbd' && game.team1Id !== 'bye') participatingIds.add(game.team1Id);
    if (game.team2Id && game.team2Id !== 'tbd' && game.team2Id !== 'bye') participatingIds.add(game.team2Id);
    if (game.team1 && !game.team1.includes('TBD') && game.team1 !== 'BYE') participatingNames.add(game.team1);
    if (game.team2 && !game.team2.includes('TBD') && game.team2 !== 'BYE') participatingNames.add(game.team2);
  });
  const eligibleTeams = poolFilter === undefined
    ? teams
    : teams.filter(team => participatingIds.has(team.id) || participatingNames.has(team.name));
  const standings = eligibleTeams.reduce((result, team) => {
    result[team.id || team.name] = {
      id: team.id,
      name: team.name,
      wins: 0,
      losses: 0,
      ties: 0,
      points: 0,
      netScore: 0,
    };
    return result;
  }, {} as Record<string, TournamentStanding>);
  const teamKey = (id: string | undefined, name: string) => {
    if (id && id !== 'tbd' && id !== 'bye' && standings[id]) return id;
    return Object.keys(standings).find(key => standings[key].name === name);
  };

  const winnerKey = (game: TournamentGame, team1: string, team2: string) => {
    const winnerId = String((game as TournamentGame & { winnerId?: string }).winnerId || '');
    if (winnerId === team1 || winnerId === game.team1Id) return team1;
    if (winnerId === team2 || winnerId === game.team2Id) return team2;
    return game.score1 > game.score2 ? team1 : game.score2 > game.score1 ? team2 : undefined;
  };

  relevantGames.forEach(game => {
    if (!game.isCompleted) return;
    const team1 = teamKey(game.team1Id, game.team1);
    const team2 = teamKey(game.team2Id, game.team2);
    if (!team1 || !team2) return;
    standings[team1].netScore += game.score1 - game.score2;
    standings[team2].netScore += game.score2 - game.score1;
    const winner = winnerKey(game, team1, team2);
    if (winner === team1) {
      standings[team1].wins++;
      standings[team1].points += 3;
      standings[team2].losses++;
    } else if (winner === team2) {
      standings[team2].wins++;
      standings[team2].points += 3;
      standings[team1].losses++;
    } else {
      standings[team1].ties++;
      standings[team1].points++;
      standings[team2].ties++;
      standings[team2].points++;
    }
  });

  const byPoints = Object.values(standings).sort((left, right) => right.points - left.points);
  const ranked: TournamentStanding[] = [];
  for (let start = 0; start < byPoints.length;) {
    let end = start + 1;
    while (end < byPoints.length && byPoints[end].points === byPoints[start].points) end++;
    const tied = byPoints.slice(start, end);
    const tiedIds = new Set(tied.map(team => team.id || team.name));
    const headToHeadPoints = new Map(tied.map(team => [team.id || team.name, 0]));
    relevantGames.forEach(game => {
      if (!game.isCompleted) return;
      const team1 = teamKey(game.team1Id, game.team1);
      const team2 = teamKey(game.team2Id, game.team2);
      if (!team1 || !team2 || !tiedIds.has(team1) || !tiedIds.has(team2)) return;
      const winner = winnerKey(game, team1, team2);
      if (winner === team1) headToHeadPoints.set(team1, (headToHeadPoints.get(team1) || 0) + 3);
      else if (winner === team2) headToHeadPoints.set(team2, (headToHeadPoints.get(team2) || 0) + 3);
      else {
        headToHeadPoints.set(team1, (headToHeadPoints.get(team1) || 0) + 1);
        headToHeadPoints.set(team2, (headToHeadPoints.get(team2) || 0) + 1);
      }
    });
    tied.sort((left, right) =>
      (headToHeadPoints.get(right.id || right.name) || 0) - (headToHeadPoints.get(left.id || left.name) || 0) ||
      right.netScore - left.netScore ||
      right.wins - left.wins ||
      left.name.localeCompare(right.name)
    );
    ranked.push(...tied);
    start = end;
  }
  return ranked;
}
