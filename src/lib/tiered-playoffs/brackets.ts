import type { TournamentGame } from '@/components/providers/team-provider';
import type { TieredDivisionDefinition, TieredSeedPlacement } from './types';

export type TieredBracketValidation = {
  valid: boolean;
  conflicts: string[];
  bracketCapacity: number;
  byeCount: number;
};

export class TieredBracketError extends Error {
  constructor(public readonly conflicts: string[]) {
    super(conflicts.join(' '));
    this.name = 'TieredBracketError';
  }
}

type LayerEntry = { placement: TieredSeedPlacement; game?: never } | { game: TournamentGame; placement?: never } | null;

type TieredBracketOptions = {
  avoidPreliminaryRematches?: boolean;
  preliminaryGames?: Array<Pick<TournamentGame, 'team1Id' | 'team2Id'>>;
};

function nextCapacity(count: number) {
  return 2 ** Math.ceil(Math.log2(Math.max(2, count)));
}

function seedOrder(capacity: number): number[] {
  let result = [1];
  for (let size = 2; size <= capacity; size *= 2) result = result.flatMap(seed => [seed, size + 1 - seed]);
  return result;
}

function roundName(roundIndex: number, totalRounds: number): string {
  const remaining = totalRounds - roundIndex;
  if (remaining === 1) return 'Championship';
  if (remaining === 2) return 'Semi-Finals';
  if (remaining === 3) return 'Quarter-Finals';
  return `Round of ${2 ** remaining}`;
}

function slot(entry: Exclude<LayerEntry, null>) {
  if (entry.placement) return {
    name: entry.placement.teamName,
    id: entry.placement.teamId,
    overallSeed: entry.placement.approvedOverallSeed,
    divisionSeed: entry.placement.divisionSeed,
  };
  return { name: `Winner of ${entry.game.id}`, id: 'tbd', overallSeed: undefined, divisionSeed: undefined };
}

function matchupKey(left?: string, right?: string) {
  return left && right ? [left, right].sort().join(':') : '';
}

function minimumCostAssignment(costs: number[][]): number[] {
  const size = costs.length;
  const rowPotential = Array(size + 1).fill(0);
  const columnPotential = Array(size + 1).fill(0);
  const matchedRow = Array(size + 1).fill(0);
  const previousColumn = Array(size + 1).fill(0);
  for (let row = 1; row <= size; row++) {
    matchedRow[0] = row;
    const minimum = Array(size + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(size + 1).fill(false);
    let column = 0;
    do {
      used[column] = true;
      const activeRow = matchedRow[column];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate++) {
        if (used[candidate]) continue;
        const reducedCost = costs[activeRow - 1][candidate - 1] - rowPotential[activeRow] - columnPotential[candidate];
        if (reducedCost < minimum[candidate]) {
          minimum[candidate] = reducedCost;
          previousColumn[candidate] = column;
        }
        if (minimum[candidate] < delta) {
          delta = minimum[candidate];
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate++) {
        if (used[candidate]) {
          rowPotential[matchedRow[candidate]] += delta;
          columnPotential[candidate] -= delta;
        } else {
          minimum[candidate] -= delta;
        }
      }
      column = nextColumn;
    } while (matchedRow[column] !== 0);
    do {
      const prior = previousColumn[column];
      matchedRow[column] = matchedRow[prior];
      column = prior;
    } while (column !== 0);
  }
  const assignment = Array(size).fill(0);
  for (let column = 1; column <= size; column++) assignment[matchedRow[column] - 1] = column - 1;
  return assignment;
}

function applyFirstRoundRematchPreference(layer: LayerEntry[], options: TieredBracketOptions): LayerEntry[] {
  if (!options.avoidPreliminaryRematches || !options.preliminaryGames?.length) return layer;
  const priorMatchups = new Set(options.preliminaryGames.map(game => matchupKey(game.team1Id, game.team2Id)).filter(Boolean));
  const fixed: TieredSeedPlacement[] = [];
  const opponentSlots: number[] = [];
  const opponents: TieredSeedPlacement[] = [];
  for (let index = 0; index < layer.length; index += 2) {
    const left = layer[index]?.placement;
    const right = layer[index + 1]?.placement;
    if (!left || !right) continue;
    if (left.divisionSeed < right.divisionSeed) {
      fixed.push(left); opponentSlots.push(index + 1); opponents.push(right);
    } else {
      fixed.push(right); opponentSlots.push(index); opponents.push(left);
    }
  }
  if (opponents.length < 2) return layer;

  const maximumMovement = opponents.length * Math.max(...opponents.map(placement => placement.divisionSeed));
  const rematchPenalty = maximumMovement + 1;
  const costs = fixed.map((placement, fixedIndex) => opponents.map(opponent =>
    Number(priorMatchups.has(matchupKey(placement.teamId, opponent.teamId))) * rematchPenalty +
    Math.abs(opponent.divisionSeed - opponents[fixedIndex].divisionSeed),
  ));
  const best = minimumCostAssignment(costs).map(index => opponents[index]);
  const adjusted = [...layer];
  opponentSlots.forEach((index, candidateIndex) => { adjusted[index] = { placement: best[candidateIndex] }; });
  return adjusted;
}

function populatePossibleTeams(games: TournamentGame[]): TournamentGame[] {
  const byId = new Map(games.map(game => [game.id, game]));
  const incoming = new Map<string, TournamentGame>();
  games.forEach(game => {
    if (game.winnerTo && game.winnerToSlot) incoming.set(`${game.winnerTo}:${game.winnerToSlot}`, game);
  });
  const memo = new Map<string, string[]>();
  const possible = (game: TournamentGame, visiting = new Set<string>()): string[] => {
    if (memo.has(game.id)) return memo.get(game.id)!;
    if (visiting.has(game.id)) return [];
    const nextVisiting = new Set(visiting).add(game.id);
    const values = new Set<string>();
    for (const side of ['team1', 'team2'] as const) {
      const id = side === 'team1' ? game.team1Id : game.team2Id;
      if (id && id !== 'tbd' && id !== 'bye') values.add(id);
      const feeder = incoming.get(`${game.id}:${side}`);
      if (feeder && byId.has(feeder.id)) possible(feeder, nextVisiting).forEach(teamId => values.add(teamId));
    }
    const result = [...values].sort();
    memo.set(game.id, result);
    return result;
  };
  return games.map(game => ({ ...game, possibleTeamIds: possible(game) }));
}

export function generateTieredDivisionBracket(
  division: TieredDivisionDefinition,
  placements: TieredSeedPlacement[],
  options: TieredBracketOptions = {},
): TournamentGame[] {
  const seeded = [...placements]
    .filter(row => row.divisionId === division.id)
    .sort((left, right) => left.divisionSeed - right.divisionSeed);
  if (seeded.length < 2 || seeded.length !== division.size || new Set(seeded.map(row => row.teamId)).size !== seeded.length) {
    throw new TieredBracketError([`Division ${division.name} requires ${division.size} unique approved teams.`]);
  }
  if (seeded.some((row, index) => row.divisionSeed !== index + 1)) {
    throw new TieredBracketError([`Division ${division.name} requires contiguous seeds beginning at one.`]);
  }

  const capacity = nextCapacity(seeded.length);
  const rounds = Math.log2(capacity);
  const bySeed = new Map(seeded.map(row => [row.divisionSeed, row]));
  let layer: LayerEntry[] = applyFirstRoundRematchPreference(
    seedOrder(capacity).map(seed => bySeed.has(seed) ? { placement: bySeed.get(seed)! } : null),
    options,
  );
  const games: TournamentGame[] = [];

  for (let roundIndex = 0; layer.length > 1; roundIndex++) {
    const next: LayerEntry[] = [];
    let roundGame = 0;
    for (let index = 0; index < layer.length; index += 2) {
      const left = layer[index];
      const right = layer[index + 1];
      if (!left && !right) {
        next.push(null);
        continue;
      }
      if (!left || !right) {
        next.push(left || right);
        continue;
      }
      roundGame++;
      const team1 = slot(left);
      const team2 = slot(right);
      const game: TournamentGame = {
        id: `tiered_${division.id}_r${roundIndex + 1}_m${roundGame}`,
        team1: team1.name,
        team2: team2.name,
        team1Id: team1.id,
        team2Id: team2.id,
        score1: 0,
        score2: 0,
        date: '',
        time: '',
        location: '',
        isCompleted: false,
        round: roundName(roundIndex, rounds),
        stage: `Tiered:${division.id}`,
        phase: 'playoff',
        playoffDivisionId: division.id,
        playoffDivisionName: division.name,
        overallSeed1: team1.overallSeed,
        overallSeed2: team2.overallSeed,
        divisionSeed1: team1.divisionSeed,
        divisionSeed2: team2.divisionSeed,
      };
      for (const [entry, targetSlot] of [[left, 'team1'], [right, 'team2']] as const) {
        if (entry.game) {
          entry.game.winnerTo = game.id;
          entry.game.winnerToSlot = targetSlot;
        }
      }
      games.push(game);
      next.push({ game });
    }
    layer = next;
  }
  return populatePossibleTeams(games);
}

export function validateTieredBrackets(
  games: TournamentGame[],
  placements: TieredSeedPlacement[],
): TieredBracketValidation {
  const conflicts: string[] = [];
  const add = (message: string) => { if (!conflicts.includes(message)) conflicts.push(message); };
  const capacity = nextCapacity(placements.length);
  if (new Set(placements.map(row => row.teamId)).size !== placements.length) add('Every playoff team must appear in approved placement exactly once.');
  if (games.length !== Math.max(0, placements.length - 1)) add(`A ${placements.length}-team single-elimination field requires ${Math.max(0, placements.length - 1)} games.`);
  const byId = new Map<string, TournamentGame>();
  const directAppearances = new Map(placements.map(row => [row.teamId, 0]));
  const targetSlots = new Set<string>();
  for (const game of games) {
    if (!game.id || byId.has(game.id)) add('Bracket match identities must be unique.');
    byId.set(game.id, game);
    if (game.phase !== 'playoff' || !game.playoffDivisionId) add(`Match ${game.id} is missing its playoff division.`);
    if (game.team1Id && game.team1Id === game.team2Id && game.team1Id !== 'tbd') add(`Match ${game.id} schedules a team against itself.`);
    for (const teamId of [game.team1Id, game.team2Id]) if (teamId && teamId !== 'tbd') {
      if (!directAppearances.has(teamId)) add(`Match ${game.id} references an unseeded team.`);
      else directAppearances.set(teamId, (directAppearances.get(teamId) || 0) + 1);
    }
    if (game.winnerTo) {
      const target = `${game.winnerTo}:${game.winnerToSlot || ''}`;
      if (targetSlots.has(target)) add(`Bracket target slot ${target} has duplicate feeders.`);
      targetSlots.add(target);
    }
  }
  for (const [teamId, count] of directAppearances) if (count !== 1) add(`Seeded team ${teamId} must enter the bracket exactly once.`);
  for (const game of games) if (game.winnerTo && !byId.has(game.winnerTo)) add(`Match ${game.id} links to a missing winner target.`);
  const roots = games.filter(game => !game.winnerTo);
  if (games.length && (roots.length !== 1 || roots[0].round !== 'Championship')) add('Each playoff division requires exactly one championship path.');

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const target = byId.get(id)?.winnerTo;
    if (target && cycle(target)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if ([...byId.keys()].some(cycle)) add('Bracket dependencies contain a cycle.');
  return { valid: conflicts.length === 0, conflicts, bracketCapacity: capacity, byeCount: capacity - placements.length };
}

type PlayoffAvailability = {
  fields: Array<{ id: string; name: string }>;
  dailyWindows: Array<{ date: string; startTime: string; endTime: string }>;
  gameDurationMinutes: number;
  minimumRestMinutes: number;
  transitionMinutes: number;
  occupiedGames?: TournamentGame[];
};

function minute(value: string): number {
  const match = /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/i.exec(String(value || '').trim());
  if (!match) return -1;
  let hour = Number(match[1]);
  const minuteValue = Number(match[2]);
  if (minuteValue > 59) return -1;
  if (match[3]) {
    if (hour < 1 || hour > 12) return -1;
    if (match[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
    if (match[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  } else if (hour > 23) return -1;
  return hour * 60 + minuteValue;
}

function render(value: number) {
  const h24 = Math.floor(value / 60);
  return `${h24 % 12 || 12}:${String(value % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
}

function at(date: string, value: number) {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day, Math.floor(value / 60), value % 60);
}

export function scheduleTieredPlayoffBrackets(games: TournamentGame[], availability: PlayoffAvailability): Array<TournamentGame & { scheduledStartMs: number }> {
  const interval = availability.gameDurationMinutes + availability.transitionMinutes;
  const slots = availability.dailyWindows.flatMap(window => {
    const result: Array<{ date: string; minute: number; field: { id: string; name: string }; start: number }> = [];
    for (let value = minute(window.startTime); value >= 0 && value + availability.gameDurationMinutes <= minute(window.endTime); value += interval) {
      availability.fields.forEach(field => result.push({ date: window.date, minute: value, field, start: at(window.date, value) }));
    }
    return result;
  }).sort((left, right) => left.start - right.start || left.field.id.localeCompare(right.field.id));
  const scheduled = new Map<string, TournamentGame & { scheduledStartMs: number }>();
  const result: Array<TournamentGame & { scheduledStartMs: number }> = [];
  const occupied = (availability.occupiedGames || []).flatMap(game => {
    const parsed = minute(game.time);
    if (parsed < 0 || !game.date) return [];
    return [{
      start: at(game.date, parsed),
      resourceId: game.resourceId || '',
      possibleTeamIds: (game.possibleTeamIds?.length ? game.possibleTeamIds : [game.team1Id, game.team2Id]).filter((id): id is string => Boolean(id && id !== 'tbd')),
    }];
  });
  const usedResource = new Set<string>();
  const feederGap = (availability.gameDurationMinutes + availability.minimumRestMinutes + availability.transitionMinutes) * 60_000;
  const participantGap = (availability.gameDurationMinutes + availability.minimumRestMinutes) * 60_000;

  for (const game of games) {
    const feeders = games.filter(candidate => candidate.winnerTo === game.id).map(candidate => scheduled.get(candidate.id)).filter(Boolean) as Array<TournamentGame & { scheduledStartMs: number }>;
    const earliest = feeders.length ? Math.max(...feeders.map(feeder => feeder.scheduledStartMs + feederGap)) : -Infinity;
    const possible = new Set(game.possibleTeamIds || []);
    const slot = slots.find(candidate => {
      if (candidate.start < earliest || usedResource.has(`${candidate.start}:${candidate.field.id}`)) return false;
      if (occupied.some(previous => previous.resourceId === candidate.field.id && previous.start === candidate.start)) return false;
      if (occupied.some(previous => previous.possibleTeamIds.some(teamId => possible.has(teamId)) && Math.abs(candidate.start - previous.start) < participantGap)) return false;
      return result.every(previous => {
        if (!previous.possibleTeamIds?.some(teamId => possible.has(teamId))) return true;
        return Math.abs(candidate.start - previous.scheduledStartMs) >= participantGap;
      });
    });
    if (!slot) throw new TieredBracketError([`No dependency-safe playoff time remains for ${game.id}.`]);
    const scheduledGame = { ...game, date: slot.date, time: render(slot.minute), location: slot.field.name, resourceId: slot.field.id, scheduledStartMs: slot.start };
    scheduled.set(game.id, scheduledGame);
    result.push(scheduledGame);
    usedResource.add(`${slot.start}:${slot.field.id}`);
  }
  return result;
}
