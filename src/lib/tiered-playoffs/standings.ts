import type { TournamentGame } from '@/components/providers/team-provider';
import type { TieredRankingRule } from './types';

export type TieredStandingTeam = { id: string; name: string };

export type TieredStandingsConfig = {
  pointsEnabled: boolean;
  points: { win: number; tie: number; loss: number };
  rankingRules: TieredRankingRule[];
  finalResolution: 'manual' | 'random_draw';
  maximumDifferentialPerGame: number | null;
  randomSeed?: string;
};

export type TieredStanding = {
  id: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  winPercentage: number;
  tournamentPoints: number;
  pointsFor: number;
  pointsAgainst: number;
  rawDifferential: number;
  differential: number;
};

export type TieredRankingResult = {
  ranked: TieredStanding[];
  unresolvedGroups: string[][];
};

const isPreliminaryResult = (game: TournamentGame) =>
  game.isCompleted === true && game.isDisputed !== true && game.isBye !== true && game.phase !== 'playoff';

function resultWinner(game: TournamentGame): 'team1' | 'team2' | 'tie' {
  const winnerId = String((game as TournamentGame & { winnerId?: string }).winnerId || '');
  if (winnerId && winnerId === game.team1Id) return 'team1';
  if (winnerId && winnerId === game.team2Id) return 'team2';
  if (game.score1 > game.score2) return 'team1';
  if (game.score2 > game.score1) return 'team2';
  return 'tie';
}

export function calculateTieredStandings(
  teams: TieredStandingTeam[],
  games: TournamentGame[],
  config: TieredStandingsConfig,
): TieredStanding[] {
  const rows = new Map(teams.map(team => [team.id, {
    id: team.id,
    name: team.name,
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    ties: 0,
    winPercentage: 0,
    tournamentPoints: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    rawDifferential: 0,
    differential: 0,
  } satisfies TieredStanding]));

  for (const game of games) {
    if (!isPreliminaryResult(game)) continue;
    const team1 = game.team1Id ? rows.get(game.team1Id) : undefined;
    const team2 = game.team2Id ? rows.get(game.team2Id) : undefined;
    if (!team1 || !team2 || team1.id === team2.id) continue;

    team1.gamesPlayed++;
    team2.gamesPlayed++;
    team1.pointsFor += game.score1;
    team1.pointsAgainst += game.score2;
    team2.pointsFor += game.score2;
    team2.pointsAgainst += game.score1;
    const raw = game.score1 - game.score2;
    const cap = config.maximumDifferentialPerGame;
    const credited = cap === null ? raw : Math.max(-cap, Math.min(cap, raw));
    team1.rawDifferential += raw;
    team2.rawDifferential -= raw;
    team1.differential += credited;
    team2.differential -= credited;

    const winner = resultWinner(game);
    if (winner === 'team1') {
      team1.wins++;
      team2.losses++;
      if (config.pointsEnabled) {
        team1.tournamentPoints += config.points.win;
        team2.tournamentPoints += config.points.loss;
      }
    } else if (winner === 'team2') {
      team2.wins++;
      team1.losses++;
      if (config.pointsEnabled) {
        team2.tournamentPoints += config.points.win;
        team1.tournamentPoints += config.points.loss;
      }
    } else {
      team1.ties++;
      team2.ties++;
      if (config.pointsEnabled) {
        team1.tournamentPoints += config.points.tie;
        team2.tournamentPoints += config.points.tie;
      }
    }
  }

  return teams.map(team => {
    const row = rows.get(team.id)!;
    row.winPercentage = row.gamesPlayed ? row.wins / row.gamesPlayed : 0;
    return row;
  });
}

function miniTable(group: TieredStanding[], games: TournamentGame[], config: TieredStandingsConfig) {
  const ids = new Set(group.map(row => row.id));
  return new Map(calculateTieredStandings(
    group.map(row => ({ id: row.id, name: row.name })),
    games.filter(game => Boolean(game.team1Id && game.team2Id && ids.has(game.team1Id) && ids.has(game.team2Id))),
    config,
  ).map(row => [row.id, row]));
}

function valueFor(rule: TieredRankingRule, row: TieredStanding, headToHead: Map<string, TieredStanding>): number {
  if (rule === 'tournament_points') return row.tournamentPoints;
  if (rule === 'wins') return row.wins;
  if (rule === 'win_percentage') return row.winPercentage;
  if (rule === 'losses') return -row.losses;
  if (rule === 'differential') return row.differential;
  if (rule === 'points_for') return row.pointsFor;
  if (rule === 'points_against') return -row.pointsAgainst;
  const mini = headToHead.get(row.id);
  return mini ? mini.tournamentPoints * 1_000_000 + mini.wins * 10_000 + mini.differential * 100 + mini.pointsFor : 0;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveTieredRanking(
  standings: TieredStanding[],
  games: TournamentGame[],
  config: TieredStandingsConfig,
): TieredRankingResult {
  const unresolvedGroups: string[][] = [];

  const rank = (group: TieredStanding[], ruleIndex: number): TieredStanding[] => {
    if (group.length < 2) return group;
    if (ruleIndex >= config.rankingRules.length) {
      if (config.finalResolution === 'manual') {
        unresolvedGroups.push(group.map(row => row.id).sort());
        return [...group];
      }
      const seed = config.randomSeed || 'tiered-playoffs';
      return [...group].sort((left, right) =>
        stableHash(`${seed}:${left.id}`) - stableHash(`${seed}:${right.id}`) || left.id.localeCompare(right.id));
    }

    const rule = config.rankingRules[ruleIndex];
    const headToHead = rule === 'head_to_head' ? miniTable(group, games, config) : new Map<string, TieredStanding>();
    const buckets = new Map<number, TieredStanding[]>();
    for (const row of group) {
      const value = valueFor(rule, row, headToHead);
      const bucket = buckets.get(value) || [];
      bucket.push(row);
      buckets.set(value, bucket);
    }
    return [...buckets.entries()]
      .sort((left, right) => right[0] - left[0])
      .flatMap(([, bucket]) => rank(bucket, ruleIndex + 1));
  };

  return { ranked: rank([...standings], 0), unresolvedGroups };
}
