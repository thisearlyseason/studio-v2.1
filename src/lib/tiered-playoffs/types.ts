export const TIERED_PLAYOFFS_FORMAT = 'tiered_playoffs' as const;

export type TieredRankingRule =
  | 'tournament_points'
  | 'wins'
  | 'win_percentage'
  | 'losses'
  | 'head_to_head'
  | 'differential'
  | 'points_for'
  | 'points_against';

export type TieredDivisionDefinition = {
  id: string;
  name: string;
  size: number;
};

export type TieredSeedPlacement = {
  teamId: string;
  teamName: string;
  overallSeed: number;
  divisionId: string;
  divisionName: string;
  divisionSeed: number;
  calculatedOverallSeed: number;
  approvedOverallSeed: number;
  overriddenBy?: string;
  overriddenAt?: string;
};

export type TieredPlayoffsState = {
  status: 'pending' | 'review' | 'locked' | 'stale';
  calculated: TieredSeedPlacement[];
  approved: TieredSeedPlacement[];
  standingsFingerprint: string | null;
  lockedAt: string | null;
  lockedBy: string | null;
};

export type TieredPlayoffsConfig = {
  schemaVersion: 1;
  preliminary: {
    gamesPerTeam: number;
    gameDurationMinutes: number;
    transitionMinutes: number;
    minimumRestMinutes: number;
    maximumGamesPerTeamPerDay: number;
    schedulingMethod: 'automatic' | 'manual';
  };
  standings: {
    pointsEnabled: boolean;
    points: { win: number; tie: number; loss: number };
    rankingRules: TieredRankingRule[];
    finalResolution: 'manual' | 'random_draw';
    maximumDifferentialPerGame: number | null;
    randomSeed?: string;
  };
  divisions: {
    sizing: 'automatic' | 'custom';
    definitions: TieredDivisionDefinition[];
    avoidPreliminaryRematches: boolean;
  };
  seeding: TieredPlayoffsState;
  playoffs: {
    bracketFormat: 'single_elimination';
    status: 'pending' | 'ready' | 'published' | 'in_progress' | 'complete';
    publishedAt: string | null;
    publishedBy: string | null;
  };
};

export type TieredPlayoffsValidation = { valid: boolean; errors: string[] };

const RANKING_RULES = new Set<TieredRankingRule>([
  'tournament_points',
  'wins',
  'win_percentage',
  'losses',
  'head_to_head',
  'differential',
  'points_for',
  'points_against',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const positiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

const nonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateTieredPlayoffsConfig(value: unknown, teamCount: number): TieredPlayoffsValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['Tiered Playoffs configuration is required.'] };

  if (value.schemaVersion !== 1) errors.push('Tiered Playoffs schema version must be 1.');

  const preliminary = isRecord(value.preliminary) ? value.preliminary : {};
  if (!positiveInteger(preliminary.gamesPerTeam)) errors.push('Preliminary games per team must be a positive whole number.');
  if (!positiveInteger(preliminary.gameDurationMinutes)) errors.push('Game duration must be a positive whole number.');
  if (!nonNegativeNumber(preliminary.transitionMinutes)) errors.push('Transition time cannot be negative.');
  if (!nonNegativeNumber(preliminary.minimumRestMinutes)) errors.push('Minimum rest cannot be negative.');
  if (!positiveInteger(preliminary.maximumGamesPerTeamPerDay)) errors.push('Maximum games per day must be a positive whole number.');
  if (!['automatic', 'manual'].includes(String(preliminary.schedulingMethod))) errors.push('Scheduling method is invalid.');

  const standings = isRecord(value.standings) ? value.standings : {};
  if (typeof standings.pointsEnabled !== 'boolean') errors.push('Tournament points selection is required.');
  const points = isRecord(standings.points) ? standings.points : {};
  for (const result of ['win', 'tie', 'loss'] as const) {
    if (!nonNegativeNumber(points[result])) errors.push(`${result} points must be a non-negative number.`);
  }
  const rankingRules = Array.isArray(standings.rankingRules) ? standings.rankingRules : [];
  if (!rankingRules.length || rankingRules.some(rule => !RANKING_RULES.has(rule as TieredRankingRule))) {
    errors.push('At least one supported ranking rule is required.');
  }
  if (new Set(rankingRules).size !== rankingRules.length) errors.push('Ranking rules cannot be repeated.');
  if (!['manual', 'random_draw'].includes(String(standings.finalResolution))) errors.push('Final tie resolution is invalid.');
  if (standings.maximumDifferentialPerGame !== null && !nonNegativeNumber(standings.maximumDifferentialPerGame)) {
    errors.push('Maximum differential must be disabled or a non-negative number.');
  }

  const divisions = isRecord(value.divisions) ? value.divisions : {};
  if (!['automatic', 'custom'].includes(String(divisions.sizing))) errors.push('Division sizing method is invalid.');
  const definitions = Array.isArray(divisions.definitions) ? divisions.definitions : [];
  if (!definitions.length) errors.push('At least one playoff division is required.');
  const ids = new Set<string>();
  const names = new Set<string>();
  let totalSize = 0;
  for (const definition of definitions) {
    if (!isRecord(definition)) {
      errors.push('Every playoff division must be valid.');
      continue;
    }
    const id = typeof definition.id === 'string' ? definition.id.trim() : '';
    const name = typeof definition.name === 'string' ? definition.name.trim() : '';
    if (!id || ids.has(id)) errors.push('Playoff division IDs must be present and unique.');
    if (!name || names.has(name.toLowerCase())) errors.push('Playoff division names must be present and unique.');
    if (!positiveInteger(definition.size)) errors.push('Playoff division sizes must be positive whole numbers.');
    else totalSize += definition.size;
    ids.add(id);
    names.add(name.toLowerCase());
  }
  if (positiveInteger(teamCount) && totalSize !== teamCount) errors.push('Playoff division sizes must include every participating team exactly once.');
  if (typeof divisions.avoidPreliminaryRematches !== 'boolean') errors.push('Preliminary rematch preference is required.');

  const seeding = isRecord(value.seeding) ? value.seeding : {};
  if (!['pending', 'review', 'locked', 'stale'].includes(String(seeding.status))) errors.push('Seeding status is invalid.');
  if (!Array.isArray(seeding.calculated) || !Array.isArray(seeding.approved)) errors.push('Calculated and approved seed collections are required.');

  const playoffs = isRecord(value.playoffs) ? value.playoffs : {};
  if (playoffs.bracketFormat !== 'single_elimination') errors.push('Tiered Playoffs currently supports single-elimination division brackets.');
  if (!['pending', 'ready', 'published', 'in_progress', 'complete'].includes(String(playoffs.status))) errors.push('Playoff status is invalid.');

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
