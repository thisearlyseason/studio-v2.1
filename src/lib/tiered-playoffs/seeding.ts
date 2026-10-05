import type { TieredDivisionDefinition, TieredSeedPlacement } from './types';

export type TieredRankedTeam = { id: string; name: string };
export type TieredDivisionSizing = 'automatic' | 'custom';

export class TieredSeedingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TieredSeedingError';
  }
}

function validateInputs(teams: TieredRankedTeam[], definitions: TieredDivisionDefinition[]) {
  if (!teams.length) throw new TieredSeedingError('At least one ranked team is required.');
  if (new Set(teams.map(team => team.id)).size !== teams.length || teams.some(team => !team.id || !team.name)) {
    throw new TieredSeedingError('Ranked teams require unique identities and names.');
  }
  if (!definitions.length || definitions.some(definition => !definition.id || !definition.name)) {
    throw new TieredSeedingError('At least one valid playoff division is required.');
  }
  if (new Set(definitions.map(definition => definition.id)).size !== definitions.length ||
      new Set(definitions.map(definition => definition.name.trim().toLowerCase())).size !== definitions.length) {
    throw new TieredSeedingError('Playoff divisions require unique identities and names.');
  }
}

export function allocateTieredDivisions(
  rankedTeams: TieredRankedTeam[],
  definitions: TieredDivisionDefinition[],
  sizing: TieredDivisionSizing,
): TieredSeedPlacement[] {
  validateInputs(rankedTeams, definitions);
  let sizes: number[];
  if (sizing === 'automatic') {
    const base = Math.floor(rankedTeams.length / definitions.length);
    const remainder = rankedTeams.length % definitions.length;
    sizes = definitions.map((_, index) => base + (index < remainder ? 1 : 0));
    if (sizes.some(size => size < 1)) throw new TieredSeedingError('The number of divisions cannot exceed the number of playoff teams.');
  } else {
    if (definitions.some(definition => !Number.isInteger(definition.size) || definition.size < 1)) {
      throw new TieredSeedingError('Custom division sizes must be positive whole numbers.');
    }
    sizes = definitions.map(definition => definition.size);
    if (sizes.reduce((sum, size) => sum + size, 0) !== rankedTeams.length) {
      throw new TieredSeedingError('Custom division sizes must include every playoff team exactly once.');
    }
  }

  const placements: TieredSeedPlacement[] = [];
  let overallIndex = 0;
  definitions.forEach((definition, divisionIndex) => {
    for (let divisionSeed = 1; divisionSeed <= sizes[divisionIndex]; divisionSeed++) {
      const team = rankedTeams[overallIndex];
      const overallSeed = overallIndex + 1;
      placements.push({
        teamId: team.id,
        teamName: team.name,
        overallSeed,
        divisionId: definition.id,
        divisionName: definition.name,
        divisionSeed,
        calculatedOverallSeed: overallSeed,
        approvedOverallSeed: overallSeed,
      });
      overallIndex++;
    }
  });
  return placements;
}

export function applyTieredSeedOverride(
  calculated: TieredSeedPlacement[],
  approved: TieredSeedPlacement[],
  move: { teamId: string; targetOverallSeed: number; actorUid: string; timestamp: string },
): TieredSeedPlacement[] {
  if (!Number.isInteger(move.targetOverallSeed) || move.targetOverallSeed < 1 || move.targetOverallSeed > approved.length) {
    throw new TieredSeedingError('The approved seed is outside the playoff field.');
  }
  const calculatedByTeam = new Map(calculated.map(row => [row.teamId, row]));
  const order = [...approved].sort((left, right) => left.approvedOverallSeed - right.approvedOverallSeed);
  const sourceIndex = order.findIndex(row => row.teamId === move.teamId);
  if (sourceIndex < 0 || calculatedByTeam.size !== approved.length) throw new TieredSeedingError('The selected playoff team does not have a calculated seed.');
  const [selected] = order.splice(sourceIndex, 1);
  order.splice(move.targetOverallSeed - 1, 0, selected);
  const slots = [...calculated].sort((left, right) => left.overallSeed - right.overallSeed);
  return order.map((team, index) => {
    const slot = slots[index];
    const original = calculatedByTeam.get(team.teamId)!;
    const changed = original.calculatedOverallSeed !== index + 1;
    const { overriddenBy: _oldBy, overriddenAt: _oldAt, ...baseTeam } = team;
    return {
      ...baseTeam,
      overallSeed: index + 1,
      approvedOverallSeed: index + 1,
      calculatedOverallSeed: original.calculatedOverallSeed,
      divisionId: slot.divisionId,
      divisionName: slot.divisionName,
      divisionSeed: slot.divisionSeed,
      ...(changed ? { overriddenBy: move.actorUid, overriddenAt: move.timestamp } : {}),
    };
  });
}

export function resetTieredSeedOverrides(calculated: TieredSeedPlacement[]): TieredSeedPlacement[] {
  return calculated.map(row => {
    const { overriddenBy: _by, overriddenAt: _at, ...base } = row;
    return {
      ...base,
      overallSeed: row.calculatedOverallSeed,
      approvedOverallSeed: row.calculatedOverallSeed,
    };
  });
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function tieredStandingsFingerprint(
  games: Array<Record<string, unknown>>,
  rankingConfig: Record<string, unknown>,
): string {
  const relevantGames = games
    .filter(game => game.phase !== 'playoff')
    .map(game => ({
      id: String(game.id || ''),
      team1Id: String(game.team1Id || ''),
      team2Id: String(game.team2Id || ''),
      score1: Number(game.score1 || 0),
      score2: Number(game.score2 || 0),
      isCompleted: game.isCompleted === true,
      isDisputed: game.isDisputed === true,
      winnerId: String(game.winnerId || ''),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const normalizedConfig = {
    pointsEnabled: rankingConfig.pointsEnabled === true,
    points: rankingConfig.points,
    rankingRules: rankingConfig.rankingRules,
    maximumDifferentialPerGame: rankingConfig.maximumDifferentialPerGame ?? null,
    finalResolution: rankingConfig.finalResolution,
    randomSeed: rankingConfig.randomSeed || '',
  };
  return stableHash(JSON.stringify({ games: relevantGames, ranking: normalizedConfig }));
}
