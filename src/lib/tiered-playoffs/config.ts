import type { TieredPlayoffsConfig, TieredRankingRule } from './types';

export type TieredPlayoffsSetup = {
  teamCount: number;
  gamesPerTeam: number;
  gameDurationMinutes: number;
  transitionMinutes: number;
  minimumRestMinutes: number;
  maximumGamesPerTeamPerDay: number;
  sizing: 'automatic' | 'custom';
  divisionNames: string[];
  divisionSizes?: number[];
  points: { win: number; tie: number; loss: number };
  rankingRules: TieredRankingRule[];
  finalResolution: 'manual' | 'random_draw';
  maximumDifferentialPerGame: number | null;
  avoidPreliminaryRematches: boolean;
};

export type TieredPlayoffsDraftSetup = Omit<
  TieredPlayoffsSetup,
  'teamCount' | 'sizing' | 'divisionNames' | 'divisionSizes'
>;

export type TieredDivisionSetup = Pick<
  TieredPlayoffsSetup,
  'teamCount' | 'sizing' | 'divisionNames' | 'divisionSizes'
>;

export function buildTieredDivisionDefinitions(input: TieredDivisionSetup) {
  if (!Number.isInteger(input.teamCount) || input.teamCount < 2) throw new Error('Tiered Playoffs requires at least two teams.');
  const names = input.divisionNames.map(name => name.trim()).filter(Boolean);
  if (!names.length || names.length > Math.max(1, Math.floor(input.teamCount / 2)) || new Set(names.map(name => name.toLowerCase())).size !== names.length) {
    throw new Error('Use unique playoff division names with at least two teams available per division.');
  }
  let sizes: number[];
  if (input.sizing === 'custom') {
    sizes = input.divisionSizes || [];
    if (sizes.length !== names.length || sizes.some(size => !Number.isInteger(size) || size < 2) || sizes.reduce((sum, size) => sum + size, 0) !== input.teamCount) {
      throw new Error(`Custom playoff division sizes must include all ${input.teamCount} teams exactly once.`);
    }
  } else {
    const base = Math.floor(input.teamCount / names.length);
    const remainder = input.teamCount % names.length;
    sizes = names.map((_, index) => base + (index < remainder ? 1 : 0));
  }
  return names.map((name, index) => ({ id: `tier_${index + 1}`, name, size: sizes[index] }));
}

function baseConfig(input: TieredPlayoffsDraftSetup): TieredPlayoffsConfig {
  return {
    schemaVersion: 1,
    preliminary: {
      gamesPerTeam: input.gamesPerTeam,
      gameDurationMinutes: input.gameDurationMinutes,
      transitionMinutes: input.transitionMinutes,
      minimumRestMinutes: input.minimumRestMinutes,
      maximumGamesPerTeamPerDay: input.maximumGamesPerTeamPerDay,
      schedulingMethod: 'automatic',
    },
    standings: {
      pointsEnabled: true,
      points: input.points,
      rankingRules: input.rankingRules,
      finalResolution: input.finalResolution,
      maximumDifferentialPerGame: input.maximumDifferentialPerGame,
    },
    divisions: {
      sizing: 'automatic',
      definitions: [],
      avoidPreliminaryRematches: input.avoidPreliminaryRematches,
    },
    seeding: { status: 'pending', calculated: [], approved: [], standingsFingerprint: null, lockedAt: null, lockedBy: null },
    playoffs: { bracketFormat: 'single_elimination', status: 'pending', publishedAt: null, publishedBy: null },
  };
}

export function buildTieredPlayoffsDraftConfig(input: TieredPlayoffsDraftSetup, existing?: TieredPlayoffsConfig): TieredPlayoffsConfig {
  if (!existing) return baseConfig(input);
  // The architect edits setup fields, not division definitions or live bracket
  // state. The lifecycle API separately rejects changes to deployed schedules.
  return {
    ...existing,
    preliminary: {
      ...existing.preliminary,
      gamesPerTeam: input.gamesPerTeam,
      gameDurationMinutes: input.gameDurationMinutes,
      transitionMinutes: input.transitionMinutes,
      // The architect links rest to turnaround; preserve independently configured rest.
      minimumRestMinutes: existing.preliminary.minimumRestMinutes === existing.preliminary.transitionMinutes
        ? input.minimumRestMinutes
        : existing.preliminary.minimumRestMinutes,
      maximumGamesPerTeamPerDay: input.maximumGamesPerTeamPerDay,
    },
    standings: {
      ...existing.standings,
      points: input.points,
      finalResolution: input.finalResolution,
      maximumDifferentialPerGame: input.maximumDifferentialPerGame,
    },
  };
}

export function buildTieredPlayoffsConfig(input: TieredPlayoffsSetup): TieredPlayoffsConfig {
  const definitions = buildTieredDivisionDefinitions(input);
  const config = baseConfig(input);
  return {
    ...config,
    divisions: {
      sizing: input.sizing,
      definitions,
      avoidPreliminaryRematches: input.avoidPreliminaryRematches,
    },
  };
}
