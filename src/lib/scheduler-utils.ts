
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution, multi-venue resource mapping,
 * pool partitioning, double elimination with GF reset, and conflict-free scheduling.
 *
 * Audit fixes applied:
 * - CRITICAL-1: Field double-booking check in tournament and league engines
 * - CRITICAL-2: parseLocalDate used everywhere instead of parseISO (UTC offset bug)
 * - MODERATE-1: LB index guard for non-power-of-2 team counts
 * - MODERATE-2: True pool partitioning for pool_play_knockout
 * - MODERATE-3: Explicit daily game limits prevent tournament overload
 * - MODERATE-4: Dead dailyTeamUsage removed from tournament; unified into finalGames
 * - MINOR-1: Round Robin ordering is deterministic (no shuffle)
 * - MINOR-2: Monotonic nextMatchId replaces Date.now() collision-prone IDs
 * - MINOR-3: Grand Final reset match modeled for Double Elimination
 * - LEAGUE-1: Field conflict check in league engine (same field same timeslot)
 * - LEAGUE-2: Blackout date comparison uses parseLocalDate (not new Date())
 * - LEAGUE-3: Duplicate match prevention (same pair twice in same season)
 * - LEAGUE-4: Game ID uses nextMatchId instead of Date.now()
 */

import { addMinutes, format, parse, addDays, eachDayOfInterval, isAfter } from 'date-fns';
import type { TournamentGame } from '@/components/providers/team-provider';

// ─── Monotonic ID counter ────────────────────────────────────────────────────
// Replaces Date.now() in tight loops which can produce identical millisecond values.
let _matchIdCounter = 0;
const resetMatchIds = () => { _matchIdCounter = 0; };
const nextMatchId = (prefix: string) => `${prefix}_${++_matchIdCounter}`;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DailyWindow {
  date: string;
  startTime: string;
  endTime: string;
}

export interface TeamIdentity {
  id: string;
  name: string;
  coach?: string;
  email?: string;
  logoUrl?: string;
}

export interface ScheduleField {
  id: string;
  name: string;
}

export interface ScheduleConfig {
  teams: TeamIdentity[] | string[];
  fields: Array<string | ScheduleField>;
  startDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  gameLength: number;
  breakLength: number;
  gamesPerTeam?: number;
  doubleHeaderOption?: 'none' | 'sameTeam' | 'differentTeams';
  blackoutDates?: string[]; // ISO Strings
  dailyWindows?: DailyWindow[];
  playDays?: number[];
  blackoutDaysOfWeek?: number[];
  tournamentType?: 'round_robin' | 'pool_play_knockout' | 'single_elimination' | 'double_elimination';
  poolCount?: number; // For pool_play_knockout: number of pools (default: 2)
  advancePerPool?: number; // Teams that advance from each pool to knockout (default: 2)
  maxDailyGamesPerTeam?: number;
}

export class ScheduleGenerationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ScheduleGenerationError';
    this.code = code;
  }
}

// ─── Private Utilities ───────────────────────────────────────────────────────

/**
 * Robust time parser: handles 12h (h:mm a) and 24h (HH:mm) formats with regex fallback.
 */
function parseTime(timeStr: string, referenceDate: Date): Date {
  if (!timeStr) return new Date(NaN);

  const formats = ['HH:mm', 'h:mm a', 'h:mm A', 'HH:mm:ss'];
  for (const f of formats) {
    const d = parse(timeStr, f, referenceDate);
    if (!isNaN(d.getTime())) return d;
  }

  // Regex fallback for non-standard inputs like "8:00pm" or "08:00"
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    const [, hours, mins, ampm] = match;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
    const date = new Date(referenceDate);
    date.setHours(h, parseInt(mins), 0, 0);
    return date;
  }
  return new Date(NaN);
}

/**
 * CRITICAL-2 FIX: Avoids UTC offset issues by treating "YYYY-MM-DD" as LOCAL midnight.
 * `new Date("2026-08-16")` parses as UTC midnight → shifts to Aug 15 in UTC-6.
 * This parser always returns correct local noon regardless of timezone.
 */
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date();
  return new Date(year, month - 1, day);
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function bracketSeedOrder(totalRounds: number): number[] {
  let seeds = [0];
  for (let round = 1; round <= totalRounds; round++) {
    const bracketSize = Math.pow(2, round);
    seeds = seeds.flatMap(seed => [seed, bracketSize - 1 - seed]);
  }
  return seeds;
}

function buildFirstKnockoutOpponentMap(qualifierCount: number): Array<Set<number>> {
  const totalRounds = Math.max(1, Math.ceil(Math.log2(qualifierCount)));
  const seedOrder = bracketSeedOrder(totalRounds);
  const openingMatches: number[][] = [];
  const opponents = Array.from({ length: qualifierCount }, () => new Set<number>());
  const connect = (left: number, right: number) => {
    opponents[left].add(right);
    opponents[right].add(left);
  };

  for (let index = 0; index < seedOrder.length; index += 2) {
    openingMatches.push(
      [seedOrder[index], seedOrder[index + 1]].filter(seed => seed < qualifierCount)
    );
  }

  openingMatches.forEach((entrants, matchIndex) => {
    if (entrants.length === 2) {
      connect(entrants[0], entrants[1]);
      return;
    }

    const siblingIndex = matchIndex % 2 === 0 ? matchIndex + 1 : matchIndex - 1;
    openingMatches[siblingIndex].forEach(opponent => connect(entrants[0], opponent));
  });

  return opponents;
}

function buildPoolQualifierOrder(numPools: number, advancePerPool: number): TeamIdentity[] {
  const qualifierCount = numPools * advancePerPool;
  const openingOpponents = buildFirstKnockoutOpponentMap(qualifierCount);

  const assignedPools = Array<number>(qualifierCount).fill(-1);
  const rows: number[][] = [];
  const basePools = Array.from({ length: numPools }, (_, index) => index);
  const candidateRows = [basePools, [...basePools].reverse()].flatMap(row =>
    basePools.map(shift => row.map((_, index) => row[(index + shift) % numPools]))
  );

  const assignRank = (rank: number): boolean => {
    if (rank === advancePerPool) return true;
    const candidates = rank === 0 ? [basePools] : candidateRows;
    for (const pools of candidates) {
      let valid = true;
      for (let index = 0; index < numPools; index++) {
        const seedIndex = rank * numPools + index;
        for (const opponentIndex of openingOpponents[seedIndex]) {
          const opponentRank = Math.floor(opponentIndex / numPools);
          const opponentPool = opponentRank === rank
            ? pools[opponentIndex % numPools]
            : assignedPools[opponentIndex];
          if (opponentPool === pools[index]) {
            valid = false;
            break;
          }
        }
        if (!valid) break;
      }
      if (!valid) continue;
      rows[rank] = pools;
      pools.forEach((pool, index) => { assignedPools[rank * numPools + index] = pool; });
      if (assignRank(rank + 1)) return true;
      pools.forEach((_, index) => { assignedPools[rank * numPools + index] = -1; });
    }
    return false;
  };

  if (!assignRank(0)) {
    throw new ScheduleGenerationError(
      'POOL_SEEDING_CONFLICT',
      'The selected pool advancement could not be seeded without an opening same-pool rematch.'
    );
  }

  return rows.flatMap((pools, rank) => pools.map(poolIndex => {
    const label = String.fromCharCode(65 + poolIndex);
    return { id: 'tbd', name: `TBD (Pool ${label} - ${ordinal(rank + 1)})` };
  }));
}

function normalizeFields(fields: Array<string | ScheduleField>): ScheduleField[] {
  const unique = new Map<string, ScheduleField>();
  fields.forEach((field, index) => {
    const normalized = typeof field === 'string'
      ? { id: field.trim(), name: field.trim() }
      : { id: field.id.trim(), name: field.name.trim() };
    if (!normalized.id || !normalized.name) return;
    if (!unique.has(normalized.id)) {
      unique.set(normalized.id, normalized);
    } else if (unique.get(normalized.id)?.name !== normalized.name) {
      throw new ScheduleGenerationError(
        'DUPLICATE_FIELD_ID',
        `Field resource ${normalized.id || index + 1} has conflicting names.`
      );
    }
  });
  return [...unique.values()];
}

function assertValidConfig(config: ScheduleConfig): void {
  if (!Number.isFinite(config.gameLength) || config.gameLength <= 0) {
    throw new ScheduleGenerationError('INVALID_GAME_LENGTH', 'Match duration must be greater than zero.');
  }
  if (!Number.isFinite(config.breakLength) || config.breakLength < 0) {
    throw new ScheduleGenerationError('INVALID_BREAK_LENGTH', 'Rest time cannot be negative.');
  }
  if (config.gamesPerTeam !== undefined && (!Number.isInteger(config.gamesPerTeam) || config.gamesPerTeam <= 0)) {
    throw new ScheduleGenerationError('INVALID_GAME_COUNT', 'Games per team must be a positive whole number.');
  }
  if (config.maxDailyGamesPerTeam !== undefined &&
      (!Number.isInteger(config.maxDailyGamesPerTeam) || config.maxDailyGamesPerTeam <= 0)) {
    throw new ScheduleGenerationError('INVALID_DAILY_GAME_COUNT', 'Maximum daily games must be a positive whole number.');
  }
}

type LeagueEdge = {
  a: number;
  b: number;
  virtual?: boolean;
  home?: number;
  away?: number;
};

type PlannedLeagueMatch = {
  t1: TeamIdentity;
  t2: TeamIdentity;
  rotationIndex: number;
  plannedTimeKey: string;
  plannedFieldId: string;
};

function orientRegularLeagueEdges(sourceEdges: LeagueEdge[], teamCount: number, degree: number): LeagueEdge[] {
  const edges = sourceEdges.map(edge => ({ ...edge }));
  if (degree % 2 === 1) {
    for (let team = 0; team < teamCount; team += 2) {
      edges.push({ a: team, b: team + 1, virtual: true });
    }
  }

  const adjacency = Array.from({ length: teamCount }, () => [] as number[]);
  edges.forEach((edge, index) => {
    adjacency[edge.a].push(index);
    adjacency[edge.b].push(index);
  });
  const used = new Set<number>();

  const walk = (team: number) => {
    while (adjacency[team].length > 0) {
      const edgeIndex = adjacency[team].pop()!;
      if (used.has(edgeIndex)) continue;
      used.add(edgeIndex);
      const edge = edges[edgeIndex];
      const opponent = edge.a === team ? edge.b : edge.a;
      edge.home = team;
      edge.away = opponent;
      walk(opponent);
    }
  };

  for (let team = 0; team < teamCount; team++) walk(team);
  return edges.filter(edge => !edge.virtual);
}

function buildRegularLeagueEdges(teamCount: number, gamesPerTeam: number): LeagueEdge[] {
  if ((teamCount * gamesPerTeam) % 2 !== 0) {
    throw new ScheduleGenerationError(
      'UNEQUAL_GAME_COUNT',
      `${teamCount} teams cannot each play exactly ${gamesPerTeam} games. Choose an even games-per-team value or add/remove a team.`
    );
  }

  const edges: LeagueEdge[] = [];
  const fullCycles = Math.floor(gamesPerTeam / (teamCount - 1));
  const remainder = gamesPerTeam % (teamCount - 1);

  for (let cycle = 0; cycle < fullCycles; cycle++) {
    for (let a = 0; a < teamCount; a++) {
      for (let b = a + 1; b < teamCount; b++) edges.push({ a, b });
    }
  }

  for (let offset = 1; offset <= Math.floor(remainder / 2); offset++) {
    const seen = new Set<string>();
    for (let a = 0; a < teamCount; a++) {
      const b = (a + offset) % teamCount;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: Math.min(a, b), b: Math.max(a, b) });
    }
  }

  if (remainder % 2 === 1) {
    if (teamCount % 2 !== 0) {
      throw new ScheduleGenerationError('UNEQUAL_GAME_COUNT', 'The requested equal schedule is mathematically impossible.');
    }
    for (let a = 0; a < teamCount / 2; a++) edges.push({ a, b: a + teamCount / 2 });
  }

  return orientRegularLeagueEdges(edges, teamCount, gamesPerTeam);
}

function leaguePairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function buildRoundRobinPairTemplates(teamCount: number): Array<Array<[number, number]>> {
  const bracketSize = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  let rotation = Array.from({ length: bracketSize }, (_, index) => index < teamCount ? index : -1);
  const rounds: Array<Array<[number, number]>> = [];

  for (let round = 0; round < bracketSize - 1; round++) {
    const pairings: Array<[number, number]> = [];
    for (let index = 0; index < bracketSize / 2; index++) {
      const left = rotation[index];
      const right = rotation[bracketSize - 1 - index];
      if (left >= 0 && right >= 0) pairings.push([left, right]);
    }
    rounds.push(pairings);
    rotation = [rotation[0], rotation[bracketSize - 1], ...rotation.slice(1, bracketSize - 1)];
  }

  return rounds;
}

function buildRegularLeagueRounds(teamCount: number, gamesPerTeam: number): LeagueEdge[][] {
  const buckets = new Map<string, LeagueEdge[]>();
  buildRegularLeagueEdges(teamCount, gamesPerTeam).forEach(edge => {
    const key = leaguePairKey(edge.a, edge.b);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(edge);
  });

  const templates = buildRoundRobinPairTemplates(teamCount);
  const maxPairingFrequency = Math.max(0, ...[...buckets.values()].map(edges => edges.length));
  const rounds: LeagueEdge[][] = [];

  for (let pass = 0; pass < maxPairingFrequency; pass++) {
    templates.forEach(template => {
      const round = template.flatMap(([a, b]) => {
        const edge = buckets.get(leaguePairKey(a, b))?.shift();
        return edge ? [edge] : [];
      });
      if (round.length > 0) rounds.push(round);
    });
  }

  const unassigned = [...buckets.values()].reduce((total, edges) => total + edges.length, 0);
  if (unassigned > 0) {
    throw new ScheduleGenerationError('ROUND_CONSTRUCTION_FAILED', 'The league matchups could not be partitioned into conflict-free rounds.');
  }
  return rounds;
}

function minimumCostAssignment(costs: number[][]): number[] {
  const rowCount = costs.length;
  const columnCount = costs[0]?.length || 0;
  if (rowCount === 0) return [];
  const u = Array(rowCount + 1).fill(0);
  const v = Array(columnCount + 1).fill(0);
  const matchedRow = Array(columnCount + 1).fill(0);
  const previousColumn = Array(columnCount + 1).fill(0);

  for (let row = 1; row <= rowCount; row++) {
    matchedRow[0] = row;
    let currentColumn = 0;
    const minimum = Array(columnCount + 1).fill(Number.POSITIVE_INFINITY);
    const used = Array(columnCount + 1).fill(false);
    do {
      used[currentColumn] = true;
      const currentRow = matchedRow[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column++) {
        if (used[column]) continue;
        const reducedCost = costs[currentRow - 1][column - 1] - u[currentRow] - v[column];
        if (reducedCost < minimum[column]) {
          minimum[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minimum[column] < delta) {
          delta = minimum[column];
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column++) {
        if (used[column]) {
          u[matchedRow[column]] += delta;
          v[column] -= delta;
        } else {
          minimum[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRow[currentColumn] !== 0);

    do {
      const nextColumn = previousColumn[currentColumn];
      matchedRow[currentColumn] = matchedRow[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignment = Array(rowCount).fill(-1);
  for (let column = 1; column <= columnCount; column++) {
    if (matchedRow[column] > 0) assignment[matchedRow[column] - 1] = column - 1;
  }
  return assignment;
}

// ─── League Engine ────────────────────────────────────────────────────────────

/**
 * Generates a full League Season schedule.
 *
 * Integrity guarantees:
 * - No team plays two games at the same time on the same day (L1)
 * - No field hosts more than one game at the same timeslot (L-CRITICAL-1)
 * - Blackout dates parsed as local time, not UTC (L-CRITICAL-2)
 * - No duplicate pairings within the same pool iteration (L3)
 * - Game IDs are collision-safe (L4)
 */
export function generateLeagueSchedule(config: ScheduleConfig): TournamentGame[] {
  assertValidConfig(config);
  resetMatchIds();
  const {
    teams, fields, startDate, endDate, startTime, endTime,
    gameLength, breakLength, playDays = [1, 2, 3, 4, 5, 6, 0],
    gamesPerTeam = 10, doubleHeaderOption = 'none', blackoutDates = [],
    blackoutDaysOfWeek = []
  } = config;

  const teamIdentities = teams.map((t, idx) =>
    typeof t === 'string' ? { id: `t_${idx}`, name: t } : t
  );
  const normalizedFields = normalizeFields(fields);
  if (teamIdentities.length < 2 || normalizedFields.length === 0) return [];

  const duplicateTeamIds = teamIdentities.filter(
    (team, index) => teamIdentities.findIndex(candidate => candidate.id === team.id) !== index
  );
  if (duplicateTeamIds.length > 0) {
    throw new ScheduleGenerationError('DUPLICATE_TEAM_ID', 'Every team must have a unique scheduling identity.');
  }

  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : addDays(startD, 120);
  if (isAfter(startD, endD)) {
    throw new ScheduleGenerationError('INVALID_DATE_RANGE', 'The season end date must be on or after its start date.');
  }

  const planningTimeKeys: string[] = [];
  let planningTime = parseTime(startTime, startD);
  const planningEndTime = parseTime(endTime, startD);
  while (!isNaN(planningTime.getTime()) && !isNaN(planningEndTime.getTime()) &&
      !isAfter(addMinutes(planningTime, gameLength), planningEndTime)) {
    planningTimeKeys.push(format(planningTime, 'HH:mm'));
    planningTime = addMinutes(planningTime, gameLength + breakLength);
  }
  if (planningTimeKeys.length === 0) {
    throw new ScheduleGenerationError('INVALID_DAILY_WINDOW', 'The daily window cannot fit a complete match.');
  }

  const pendingRounds: Array<{ roundIndex: number; games: PlannedLeagueMatch[] }> = buildRegularLeagueRounds(teamIdentities.length, gamesPerTeam).map((round, roundIndex) => ({
    roundIndex,
    games: round.map((edge, rotationIndex) => ({
      t1: teamIdentities[edge.home!],
      t2: teamIdentities[edge.away!],
      rotationIndex,
      plannedTimeKey: '',
      plannedFieldId: '',
    })),
  }));

  const plannedTimeCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  const timeColumns = planningTimeKeys.flatMap(timeKey =>
    Array.from({ length: normalizedFields.length }, () => timeKey)
  );
  const timePlanningChunks: PlannedLeagueMatch[][] = [];
  pendingRounds.forEach(round => {
    for (let offset = 0; offset < round.games.length; offset += timeColumns.length) {
      const chunk = round.games.slice(offset, offset + timeColumns.length);
      timePlanningChunks.push(chunk);
      const costs = chunk.map(game => timeColumns.map((timeKey, columnIndex) => {
        const currentUse = (plannedTimeCounts.get(game.t1.id)!.get(timeKey) || 0) +
          (plannedTimeCounts.get(game.t2.id)!.get(timeKey) || 0);
        const spreadAfter = [game.t1.id, game.t2.id].reduce((sum, teamId) => {
          const teamCounts = plannedTimeCounts.get(teamId)!;
          const values = planningTimeKeys.map(candidate =>
            (teamCounts.get(candidate) || 0) + (candidate === timeKey ? 1 : 0)
          );
          return sum + Math.max(...values) - Math.min(...values);
        }, 0);
        return spreadAfter * 1_000 + currentUse * 100 + columnIndex;
      }));
      const assignment = minimumCostAssignment(costs);
      chunk.forEach((game, index) => {
        const timeKey = timeColumns[assignment[index]];
        game.plannedTimeKey = timeKey;
        for (const teamId of [game.t1.id, game.t2.id]) {
          const counts = plannedTimeCounts.get(teamId)!;
          counts.set(timeKey, (counts.get(timeKey) || 0) + 1);
        }
      });
    }
  });

  for (let iteration = 0; iteration < 10_000; iteration++) {
    let bestSwap: { left: PlannedLeagueMatch; right: PlannedLeagueMatch; delta: number } | null = null;
    timePlanningChunks.forEach(chunk => {
      for (let leftIndex = 0; leftIndex < chunk.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < chunk.length; rightIndex++) {
          const left = chunk[leftIndex];
          const right = chunk[rightIndex];
          if (left.plannedTimeKey === right.plannedTimeKey) continue;
          let delta = 0;
          for (const teamId of [left.t1.id, left.t2.id]) {
            const counts = plannedTimeCounts.get(teamId)!;
            const from = counts.get(left.plannedTimeKey) || 0;
            const to = counts.get(right.plannedTimeKey) || 0;
            delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
          }
          for (const teamId of [right.t1.id, right.t2.id]) {
            const counts = plannedTimeCounts.get(teamId)!;
            const from = counts.get(right.plannedTimeKey) || 0;
            const to = counts.get(left.plannedTimeKey) || 0;
            delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
          }
          if (delta < (bestSwap?.delta ?? 0)) bestSwap = { left, right, delta };
        }
      }
    });
    if (!bestSwap) break;
    const selectedSwap = bestSwap as { left: PlannedLeagueMatch; right: PlannedLeagueMatch; delta: number };
    const leftTime = selectedSwap.left.plannedTimeKey;
    const rightTime = selectedSwap.right.plannedTimeKey;
    for (const teamId of [selectedSwap.left.t1.id, selectedSwap.left.t2.id]) {
      const counts = plannedTimeCounts.get(teamId)!;
      counts.set(leftTime, (counts.get(leftTime) || 0) - 1);
      counts.set(rightTime, (counts.get(rightTime) || 0) + 1);
    }
    for (const teamId of [selectedSwap.right.t1.id, selectedSwap.right.t2.id]) {
      const counts = plannedTimeCounts.get(teamId)!;
      counts.set(rightTime, (counts.get(rightTime) || 0) - 1);
      counts.set(leftTime, (counts.get(leftTime) || 0) + 1);
    }
    selectedSwap.left.plannedTimeKey = rightTime;
    selectedSwap.right.plannedTimeKey = leftTime;
  }

  const fieldPlanningChunks = pendingRounds.flatMap(round => {
    const byTime = new Map<string, PlannedLeagueMatch[]>();
    round.games.forEach(game => {
      if (!byTime.has(game.plannedTimeKey)) byTime.set(game.plannedTimeKey, []);
      byTime.get(game.plannedTimeKey)!.push(game);
    });
    return [...byTime.values()].flatMap(gamesAtTime => {
      const chunks: PlannedLeagueMatch[][] = [];
      for (let offset = 0; offset < gamesAtTime.length; offset += normalizedFields.length) {
        chunks.push(gamesAtTime.slice(offset, offset + normalizedFields.length));
      }
      return chunks;
    });
  });

  const plannedFieldCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  fieldPlanningChunks.forEach(chunk => {
      const costs = chunk.map(game => normalizedFields.map(field => {
        const t1Counts = plannedFieldCounts.get(game.t1.id)!;
        const t2Counts = plannedFieldCounts.get(game.t2.id)!;
        const currentUse = (t1Counts.get(field.id) || 0) + (t2Counts.get(field.id) || 0);
        const spreadAfter = [game.t1.id, game.t2.id].reduce((sum, teamId) => {
          const teamCounts = plannedFieldCounts.get(teamId)!;
          const values = normalizedFields.map(candidate =>
            (teamCounts.get(candidate.id) || 0) + (candidate.id === field.id ? 1 : 0)
          );
          return sum + Math.max(...values) - Math.min(...values);
        }, 0);
        return spreadAfter * 1_000 + currentUse * 100 + normalizedFields.indexOf(field);
      }));
      const assignment = minimumCostAssignment(costs);
      chunk.forEach((game, index) => {
        const field = normalizedFields[assignment[index]];
        game.plannedFieldId = field.id;
        for (const teamId of [game.t1.id, game.t2.id]) {
          const teamCounts = plannedFieldCounts.get(teamId)!;
          teamCounts.set(field.id, (teamCounts.get(field.id) || 0) + 1);
        }
      });
  });
  for (let iteration = 0; iteration < 10_000; iteration++) {
    let bestSwap: { left: PlannedLeagueMatch; right: PlannedLeagueMatch; delta: number } | null = null;
    fieldPlanningChunks.forEach(chunk => {
        for (let leftIndex = 0; leftIndex < chunk.length; leftIndex++) {
          for (let rightIndex = leftIndex + 1; rightIndex < chunk.length; rightIndex++) {
            const left = chunk[leftIndex];
            const right = chunk[rightIndex];
            if (left.plannedFieldId === right.plannedFieldId) continue;
            let delta = 0;
            for (const teamId of [left.t1.id, left.t2.id]) {
              const counts = plannedFieldCounts.get(teamId)!;
              const from = counts.get(left.plannedFieldId) || 0;
              const to = counts.get(right.plannedFieldId) || 0;
              delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
            }
            for (const teamId of [right.t1.id, right.t2.id]) {
              const counts = plannedFieldCounts.get(teamId)!;
              const from = counts.get(right.plannedFieldId) || 0;
              const to = counts.get(left.plannedFieldId) || 0;
              delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
            }
            if (delta < (bestSwap?.delta ?? 0)) bestSwap = { left, right, delta };
        }
      }
    });
    if (!bestSwap) break;
    const selectedSwap = bestSwap as { left: PlannedLeagueMatch; right: PlannedLeagueMatch; delta: number };
    const leftField = selectedSwap.left.plannedFieldId;
    const rightField = selectedSwap.right.plannedFieldId;
    for (const teamId of [selectedSwap.left.t1.id, selectedSwap.left.t2.id]) {
      const counts = plannedFieldCounts.get(teamId)!;
      counts.set(leftField, (counts.get(leftField) || 0) - 1);
      counts.set(rightField, (counts.get(rightField) || 0) + 1);
    }
    for (const teamId of [selectedSwap.right.t1.id, selectedSwap.right.t2.id]) {
      const counts = plannedFieldCounts.get(teamId)!;
      counts.set(rightField, (counts.get(rightField) || 0) - 1);
      counts.set(leftField, (counts.get(leftField) || 0) + 1);
    }
    selectedSwap.left.plannedFieldId = rightField;
    selectedSwap.right.plannedFieldId = leftField;
  }

  // An exact pass prevents a locally balanced plan from trapping one team on a
  // field too often. It is bounded and falls back to the minimum-cost plan for
  // unusually large leagues.
  const fieldUseCap = Math.ceil(gamesPerTeam / normalizedFields.length);
  const fieldChunks = fieldPlanningChunks;
  const plannedFieldImbalance = teamIdentities.reduce((largest, team) => {
    const counts = plannedFieldCounts.get(team.id)!;
    const values = normalizedFields.map(field => counts.get(field.id) || 0);
    return Math.max(largest, Math.max(...values) - Math.min(...values));
  }, 0);
  if (plannedFieldImbalance > 1 && normalizedFields.length > 1 &&
      normalizedFields.length <= 8 && teamIdentities.length <= 16 && fieldChunks.length <= 80) {
    const exactCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
    let exploredNodes = 0;
    const maximumNodes = 75_000;
    const assignChunk = (chunkIndex: number): boolean => {
      if (chunkIndex === fieldChunks.length) return true;
      const chunk = fieldChunks[chunkIndex];
      const assignGame = (gameIndex: number, usedFields: Set<string>): boolean => {
        if (exploredNodes++ >= maximumNodes) return false;
        if (gameIndex === chunk.length) return assignChunk(chunkIndex + 1);
        const game = chunk[gameIndex];
        const originalField = game.plannedFieldId;
        const candidates = normalizedFields
          .filter(field => !usedFields.has(field.id))
          .filter(field => (exactCounts.get(game.t1.id)!.get(field.id) || 0) < fieldUseCap)
          .filter(field => (exactCounts.get(game.t2.id)!.get(field.id) || 0) < fieldUseCap)
          .sort((left, right) => {
            const leftUse = (exactCounts.get(game.t1.id)!.get(left.id) || 0) + (exactCounts.get(game.t2.id)!.get(left.id) || 0);
            const rightUse = (exactCounts.get(game.t1.id)!.get(right.id) || 0) + (exactCounts.get(game.t2.id)!.get(right.id) || 0);
            return leftUse - rightUse || left.id.localeCompare(right.id);
          });
        for (const field of candidates) {
          game.plannedFieldId = field.id;
          usedFields.add(field.id);
          for (const teamId of [game.t1.id, game.t2.id]) {
            const counts = exactCounts.get(teamId)!;
            counts.set(field.id, (counts.get(field.id) || 0) + 1);
          }
          if (assignGame(gameIndex + 1, usedFields)) return true;
          for (const teamId of [game.t1.id, game.t2.id]) {
            const counts = exactCounts.get(teamId)!;
            counts.set(field.id, (counts.get(field.id) || 0) - 1);
          }
          usedFields.delete(field.id);
          game.plannedFieldId = originalField;
        }
        return false;
      };
      return assignGame(0, new Set());
    };
    if (assignChunk(0)) {
      teamIdentities.forEach(team => {
        const planned = plannedFieldCounts.get(team.id)!;
        planned.clear();
        exactCounts.get(team.id)!.forEach((count, fieldId) => planned.set(fieldId, count));
      });
    }
  }

  // Final joint pass assigns a concrete time-and-field slot. Optimizing these
  // dimensions together avoids a fair time plan forcing a biased field plan.
  const slotColumns = planningTimeKeys.flatMap(timeKey =>
    normalizedFields.map(field => ({ timeKey, fieldId: field.id }))
  );
  const jointTimeCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  const jointFieldCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  timePlanningChunks.forEach(chunk => {
    const costs = chunk.map(game => slotColumns.map((slotColumn, columnIndex) => {
      const allocationSpread = (
        counts: Map<string, Map<string, number>>,
        keys: string[],
        selectedKey: string
      ) => [game.t1.id, game.t2.id].reduce((sum, teamId) => {
        const teamCounts = counts.get(teamId)!;
        const values = keys.map(key => (teamCounts.get(key) || 0) + (key === selectedKey ? 1 : 0));
        return sum + Math.max(...values) - Math.min(...values);
      }, 0);
      const currentUse = [game.t1.id, game.t2.id].reduce((sum, teamId) =>
        sum + (jointTimeCounts.get(teamId)!.get(slotColumn.timeKey) || 0) +
          (jointFieldCounts.get(teamId)!.get(slotColumn.fieldId) || 0), 0);
      return allocationSpread(jointTimeCounts, planningTimeKeys, slotColumn.timeKey) * 2_000 +
        allocationSpread(jointFieldCounts, normalizedFields.map(field => field.id), slotColumn.fieldId) * 2_000 +
        currentUse * 100 + columnIndex;
    }));
    const assignment = minimumCostAssignment(costs);
    chunk.forEach((game, index) => {
      const slotColumn = slotColumns[assignment[index]];
      game.plannedTimeKey = slotColumn.timeKey;
      game.plannedFieldId = slotColumn.fieldId;
      for (const teamId of [game.t1.id, game.t2.id]) {
        const timeCounts = jointTimeCounts.get(teamId)!;
        const fieldCounts = jointFieldCounts.get(teamId)!;
        timeCounts.set(slotColumn.timeKey, (timeCounts.get(slotColumn.timeKey) || 0) + 1);
        fieldCounts.set(slotColumn.fieldId, (fieldCounts.get(slotColumn.fieldId) || 0) + 1);
      }
    });
  });
  for (let iteration = 0; iteration < 10_000; iteration++) {
    let bestMove: { game: PlannedLeagueMatch; timeKey: string; fieldId: string; delta: number } | null = null;
    timePlanningChunks.forEach(chunk => {
      const occupied = new Set(chunk.map(game => `${game.plannedTimeKey}:${game.plannedFieldId}`));
      chunk.forEach(game => {
        const currentSlot = `${game.plannedTimeKey}:${game.plannedFieldId}`;
        slotColumns.forEach(slotColumn => {
          const candidateSlot = `${slotColumn.timeKey}:${slotColumn.fieldId}`;
          if (candidateSlot !== currentSlot && occupied.has(candidateSlot)) return;
          let delta = 0;
          for (const teamId of [game.t1.id, game.t2.id]) {
            const timeCounts = jointTimeCounts.get(teamId)!;
            const fieldCounts = jointFieldCounts.get(teamId)!;
            if (slotColumn.timeKey !== game.plannedTimeKey) {
              const from = timeCounts.get(game.plannedTimeKey) || 0;
              const to = timeCounts.get(slotColumn.timeKey) || 0;
              delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
            }
            if (slotColumn.fieldId !== game.plannedFieldId) {
              const from = fieldCounts.get(game.plannedFieldId) || 0;
              const to = fieldCounts.get(slotColumn.fieldId) || 0;
              delta += (from - 1) ** 2 + (to + 1) ** 2 - from ** 2 - to ** 2;
            }
          }
          if (delta < (bestMove?.delta ?? 0)) {
            bestMove = { game, timeKey: slotColumn.timeKey, fieldId: slotColumn.fieldId, delta };
          }
        });
      });
    });
    if (!bestMove) break;
    const selectedMove = bestMove as { game: PlannedLeagueMatch; timeKey: string; fieldId: string; delta: number };
    for (const teamId of [selectedMove.game.t1.id, selectedMove.game.t2.id]) {
      const timeCounts = jointTimeCounts.get(teamId)!;
      const fieldCounts = jointFieldCounts.get(teamId)!;
      timeCounts.set(selectedMove.game.plannedTimeKey, (timeCounts.get(selectedMove.game.plannedTimeKey) || 0) - 1);
      timeCounts.set(selectedMove.timeKey, (timeCounts.get(selectedMove.timeKey) || 0) + 1);
      fieldCounts.set(selectedMove.game.plannedFieldId, (fieldCounts.get(selectedMove.game.plannedFieldId) || 0) - 1);
      fieldCounts.set(selectedMove.fieldId, (fieldCounts.get(selectedMove.fieldId) || 0) + 1);
    }
    selectedMove.game.plannedTimeKey = selectedMove.timeKey;
    selectedMove.game.plannedFieldId = selectedMove.fieldId;
  }
  const jointFieldImbalance = teamIdentities.reduce((largest, team) => {
    const counts = jointFieldCounts.get(team.id)!;
    const values = normalizedFields.map(field => counts.get(field.id) || 0);
    return Math.max(largest, Math.max(...values) - Math.min(...values));
  }, 0);
  const jointTimeImbalance = teamIdentities.reduce((largest, team) => {
    const counts = jointTimeCounts.get(team.id)!;
    const values = planningTimeKeys.map(timeKey => counts.get(timeKey) || 0);
    return Math.max(largest, Math.max(...values) - Math.min(...values));
  }, 0);
  if ((jointFieldImbalance > 1 || jointTimeImbalance > 1) &&
      normalizedFields.length <= 8 && teamIdentities.length <= 16 && timePlanningChunks.length <= 80) {
    const exactTimeCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
    const exactFieldCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
    const timeUseCap = Math.ceil(gamesPerTeam / planningTimeKeys.length);
    const jointFieldUseCap = Math.ceil(gamesPerTeam / normalizedFields.length);
    let exploredNodes = 0;
    const assignChunk = (chunkIndex: number): boolean => {
      if (chunkIndex === timePlanningChunks.length) return true;
      const chunk = timePlanningChunks[chunkIndex];
      const assignGame = (gameIndex: number, occupiedSlots: Set<string>): boolean => {
        if (exploredNodes++ >= 250_000) return false;
        if (gameIndex === chunk.length) return assignChunk(chunkIndex + 1);
        const game = chunk[gameIndex];
        const originalTime = game.plannedTimeKey;
        const originalField = game.plannedFieldId;
        const candidates = slotColumns
          .filter(slotColumn => !occupiedSlots.has(`${slotColumn.timeKey}:${slotColumn.fieldId}`))
          .filter(slotColumn => [game.t1.id, game.t2.id].every(teamId =>
            (exactTimeCounts.get(teamId)!.get(slotColumn.timeKey) || 0) < timeUseCap &&
            (exactFieldCounts.get(teamId)!.get(slotColumn.fieldId) || 0) < jointFieldUseCap
          ))
          .sort((left, right) => {
            const use = (slotColumn: { timeKey: string; fieldId: string }) =>
              [game.t1.id, game.t2.id].reduce((sum, teamId) => sum +
                (exactTimeCounts.get(teamId)!.get(slotColumn.timeKey) || 0) +
                (exactFieldCounts.get(teamId)!.get(slotColumn.fieldId) || 0), 0);
            return use(left) - use(right) ||
              left.timeKey.localeCompare(right.timeKey) || left.fieldId.localeCompare(right.fieldId);
          });
        for (const slotColumn of candidates) {
          const slotKey = `${slotColumn.timeKey}:${slotColumn.fieldId}`;
          game.plannedTimeKey = slotColumn.timeKey;
          game.plannedFieldId = slotColumn.fieldId;
          occupiedSlots.add(slotKey);
          for (const teamId of [game.t1.id, game.t2.id]) {
            const timeCounts = exactTimeCounts.get(teamId)!;
            const fieldCounts = exactFieldCounts.get(teamId)!;
            timeCounts.set(slotColumn.timeKey, (timeCounts.get(slotColumn.timeKey) || 0) + 1);
            fieldCounts.set(slotColumn.fieldId, (fieldCounts.get(slotColumn.fieldId) || 0) + 1);
          }
          if (assignGame(gameIndex + 1, occupiedSlots)) return true;
          for (const teamId of [game.t1.id, game.t2.id]) {
            const timeCounts = exactTimeCounts.get(teamId)!;
            const fieldCounts = exactFieldCounts.get(teamId)!;
            timeCounts.set(slotColumn.timeKey, (timeCounts.get(slotColumn.timeKey) || 0) - 1);
            fieldCounts.set(slotColumn.fieldId, (fieldCounts.get(slotColumn.fieldId) || 0) - 1);
          }
          occupiedSlots.delete(slotKey);
          game.plannedTimeKey = originalTime;
          game.plannedFieldId = originalField;
        }
        return false;
      };
      return assignGame(0, new Set());
    };
    assignChunk(0);
  }

  // ── Generate all available slots ─────────────────────────────────────
  const availableSlots: { date: Date; time: Date; field: ScheduleField }[] = [];
  let currentDay = new Date(startD);

  while (!isAfter(currentDay, endD)) {
    const dayKey = format(currentDay, 'yyyy-MM-dd');
    // LEAGUE-CRITICAL-2 FIX: compare dates as local strings, not via new Date() which UTC-shifts
    const isBlackout = blackoutDates.some(d => {
      const clean = d.includes('T') ? d.split('T')[0] : d;
      return clean === dayKey;
    });
    const isDayBlackout = blackoutDaysOfWeek.includes(currentDay.getDay());

    if (playDays.includes(currentDay.getDay()) && !isBlackout && !isDayBlackout) {
      let currentTime = parseTime(startTime, currentDay);
      const dayEndTime = parseTime(endTime, currentDay);

      if (!isNaN(currentTime.getTime()) && !isNaN(dayEndTime.getTime())) {
        while (!isAfter(addMinutes(currentTime, gameLength), dayEndTime)) {
          for (const field of normalizedFields) {
            availableSlots.push({ date: new Date(currentDay), time: new Date(currentTime), field });
          }
          currentTime = addMinutes(currentTime, gameLength + breakLength);
        }
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  // ── Assign games to slots ─────────────────────────────────────────────
  const finalGames: TournamentGame[] = [];
  // Tracks per-day team usage: key = "date", value = [{teamId, time, field}]
  const dailyTeamUsage = new Map<string, { teamId: string; time: string; field: string }[]>();
  const teamTimeCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  const teamFieldCounts = new Map(teamIdentities.map(team => [team.id, new Map<string, number>()]));
  const timeKeys = [...new Set(availableSlots.map(slot => format(slot.time, 'HH:mm')))];
  const fieldKeys = normalizedFields.map(field => field.id);

  const projectedSpread = (
    teamId: string,
    selectedKey: string,
    keys: string[],
    counts: Map<string, Map<string, number>>
  ) => {
    const teamCounts = counts.get(teamId)!;
    const values = keys.map(key => (teamCounts.get(key) || 0) + (key === selectedKey ? 1 : 0));
    return values.length ? Math.max(...values) - Math.min(...values) : 0;
  };

  const increment = (counts: Map<string, Map<string, number>>, teamId: string, key: string) => {
    const teamCounts = counts.get(teamId)!;
    teamCounts.set(key, (teamCounts.get(key) || 0) + 1);
  };

  for (const slot of availableSlots) {
    if (pendingRounds.every(round => round.games.length === 0)) break;

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    const timeKey = format(slot.time, 'HH:mm');
    const slotTimeFormatted = format(slot.time, 'h:mm a');

    if (!dailyTeamUsage.has(dayKey)) dailyTeamUsage.set(dayKey, []);
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    const candidates: Array<{
      roundPosition: number;
      gamePosition: number;
      t1: TeamIdentity;
      t2: TeamIdentity;
      rotationIndex: number;
      plannedTimeKey: string;
      plannedFieldId: string;
      score: number[];
    }> = [];
    for (let roundPosition = 0; roundPosition < pendingRounds.length; roundPosition++) {
      const pendingRound = pendingRounds[roundPosition];
      if (pendingRound.games.length === 0) continue;
      const hasPlannedTime = pendingRound.games.some(game => game.plannedTimeKey === timeKey);
      if (!hasPlannedTime) break;
      const hasPlannedField = pendingRound.games.some(game =>
        game.plannedTimeKey === timeKey && game.plannedFieldId === slot.field.id
      );
      for (let gamePosition = 0; gamePosition < pendingRound.games.length; gamePosition++) {
        const { t1, t2, rotationIndex, plannedTimeKey, plannedFieldId } = pendingRound.games[gamePosition];
        if (plannedTimeKey !== timeKey) continue;
        if (hasPlannedField && plannedFieldId !== slot.field.id) continue;

      // L1: Team cannot play two games at the same time on the same day
      const isT1Busy = todaysGames.some(g => (g.teamId === t1.id) && g.time === timeKey);
      const isT2Busy = todaysGames.some(g => (g.teamId === t2.id) && g.time === timeKey);
        if (isT1Busy || isT2Busy) continue;

      // LEAGUE-CRITICAL-1: Field cannot host multiple games at the same time
      const fieldIsBusy = finalGames.some(g =>
        g.resourceId === slot.field.id &&
        g.date === dayKey &&
        g.time === slotTimeFormatted
      );
        if (fieldIsBusy) continue;

      // Double-header enforcement
      const t1DailyCount = todaysGames.filter(g => g.teamId === t1.id).length;
      const t2DailyCount = todaysGames.filter(g => g.teamId === t2.id).length;

        if (doubleHeaderOption === 'none') {
          if (t1DailyCount >= 1 || t2DailyCount >= 1) continue;
        } else if (doubleHeaderOption === 'sameTeam') {
        // LOGIC-3 FIX: A team's second game MUST be against the same opponent.
        // If a team has played 1 game already today, they can only play again if it's vs the same team.
        if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
        if (t1DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === t1.id || g.team2Id === t1.id));
          const firstOppId = firstGame ? (firstGame.team1Id === t1.id ? firstGame.team2Id : firstGame.team1Id) : null;
          if (firstOppId !== t2.id) continue;
        }
        if (t2DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === t2.id || g.team2Id === t2.id));
          const firstOppId = firstGame ? (firstGame.team1Id === t2.id ? firstGame.team2Id : firstGame.team1Id) : null;
          if (firstOppId !== t1.id) continue;
        }
        } else if (doubleHeaderOption === 'differentTeams') {
        if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
        if (t1DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === t1.id || g.team2Id === t1.id));
          const firstOpponent = firstGame ? (firstGame.team1Id === t1.id ? firstGame.team2Id : firstGame.team1Id) : null;
          if (firstOpponent === t2.id) continue;
        }
        if (t2DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === t2.id || g.team2Id === t2.id));
          const firstOpponent = firstGame ? (firstGame.team1Id === t2.id ? firstGame.team2Id : firstGame.team1Id) : null;
          if (firstOpponent === t1.id) continue;
        }
        }

        const timeSpread = projectedSpread(t1.id, timeKey, timeKeys, teamTimeCounts) +
          projectedSpread(t2.id, timeKey, timeKeys, teamTimeCounts);
        const fieldSpread = projectedSpread(t1.id, slot.field.id, fieldKeys, teamFieldCounts) +
          projectedSpread(t2.id, slot.field.id, fieldKeys, teamFieldCounts);
        const currentTimeUse = (teamTimeCounts.get(t1.id)!.get(timeKey) || 0) +
          (teamTimeCounts.get(t2.id)!.get(timeKey) || 0);
        const currentFieldUse = (teamFieldCounts.get(t1.id)!.get(slot.field.id) || 0) +
          (teamFieldCounts.get(t2.id)!.get(slot.field.id) || 0);
        candidates.push({
          roundPosition,
          gamePosition,
          t1,
          t2,
          rotationIndex,
          plannedTimeKey,
          plannedFieldId,
          score: [
            pendingRound.roundIndex,
            plannedFieldId === slot.field.id ? 0 : 1,
            timeSpread,
            fieldSpread,
            currentTimeUse,
            currentFieldUse,
            rotationIndex,
          ],
        });
      }

      break;
    }

    candidates.sort((left, right) => {
      for (let index = 0; index < left.score.length; index++) {
        if (left.score[index] !== right.score[index]) return left.score[index] - right.score[index];
      }
      return 0;
    });

    const selected = candidates[0];
    if (selected) {
      const { t1, t2 } = selected;
      pendingRounds[selected.roundPosition].games.splice(selected.gamePosition, 1);
      finalGames.push({
        id: nextMatchId('lg'),
        team1: t1.name, team2: t2.name, team1Id: t1.id, team2Id: t2.id,
        team1LogoUrl: t1.logoUrl, team2LogoUrl: t2.logoUrl,
        score1: 0, score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'),
        time: slotTimeFormatted,
        location: slot.field.name,
        resourceId: slot.field.id,
        isCompleted: false,
        updatedAt: new Date().toISOString()
      });

      todaysGames.push({ teamId: t1.id, time: timeKey, field: slot.field.id });
      todaysGames.push({ teamId: t2.id, time: timeKey, field: slot.field.id });
      increment(teamTimeCounts, t1.id, timeKey);
      increment(teamTimeCounts, t2.id, timeKey);
      increment(teamFieldCounts, t1.id, slot.field.id);
      increment(teamFieldCounts, t2.id, slot.field.id);
    }
  }

  const remainingMatches = pendingRounds.reduce((total, round) => total + round.games.length, 0);
  if (remainingMatches > 0) {
    throw new ScheduleGenerationError(
      'INSUFFICIENT_CAPACITY',
      `${remainingMatches} league matches could not fit within the selected dates, fields, rest rules, and daily limits.`
    );
  }

  return finalGames;
}

// ─── Tournament Engine ───────────────────────────────────────────────────────

/**
 * Generates tournament schedules for:
 *   - round_robin: All teams play each other once (Berger algorithm)
 *   - pool_play_knockout: Snake-seeded pools → round-robin within pools → elimination bracket
 *   - single_elimination: Standard single-loss elimination with proper seeding
 *   - double_elimination: Full WB + LB with Grand Final and optional reset match
 *
 * Integrity guarantees (all formats):
 * - No team in two matches at the same time (rest period enforced)
 * - No field double-booked at the same timeslot
 * - Phase ordering enforced: pool → quarters → semis → final
 * - All match IDs are unique (monotonic counter)
 * - Bracket links (winnerTo, loserTo) are structurally correct
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  assertValidConfig(config);
  resetMatchIds();
  const {
    teams, fields, startDate, endDate, startTime, endTime,
    gameLength, breakLength, gamesPerTeam, dailyWindows,
    tournamentType = 'round_robin',
    maxDailyGamesPerTeam = 3,
    poolCount = 2,
    advancePerPool = 2,
  } = config;

  const teamList = teams.map((t, i) =>
    typeof t === 'string' ? { id: `t_${i}`, name: t } : t
  );
  const normalizedFields = normalizeFields(fields);
  if (teamList.length < 2) return [];
  if (normalizedFields.length === 0) return [];
  if (new Set(teamList.map(team => team.id)).size !== teamList.length) {
    throw new ScheduleGenerationError('DUPLICATE_TEAM_ID', 'Every tournament team must have a unique scheduling identity.');
  }
  if (tournamentType === 'double_elimination' && (teamList.length & (teamList.length - 1)) !== 0) {
    throw new ScheduleGenerationError(
      'DOUBLE_ELIMINATION_TEAM_COUNT',
      'Double elimination currently requires 2, 4, 8, 16, or 32 teams so every loss path remains structurally valid.'
    );
  }

  // ── Matchup Generation ──────────────────────────────────────────────

  const matchups: any[] = [];

  // ── ROUND ROBIN ───────────────────────────────────────────────────────
  if (tournamentType === 'round_robin') {
    const requestedGames = gamesPerTeam || teamList.length - 1;
    const edges = buildRegularLeagueEdges(teamList.length, requestedGames);
    edges.forEach(edge => {
      const t1 = teamList[edge.home!];
      const t2 = teamList[edge.away!];
      matchups.push({
      t1: t1.name, t2: t2.name, t1Id: t1.id, t2Id: t2.id,
      t1LogoUrl: t1.logoUrl, t2LogoUrl: t2.logoUrl,
      round: 'Pool Play'
    });
    });
  }

  // ── POOL PLAY KNOCKOUT ────────────────────────────────────────────────
  // MODERATE-2 FIX: True pool partitioning with snake seeding + RR within pools + knockout bracket
  else if (tournamentType === 'pool_play_knockout') {
    const numPools = Math.min(poolCount, Math.floor(teamList.length / 2));
    const pools: TeamIdentity[][] = Array.from({ length: numPools }, () => []);

    // Snake seed: Team 1→Pool A, Team 2→Pool B, Team 3→Pool B, Team 4→Pool A...
    teamList.forEach((team, idx) => {
      const snake = Math.floor(idx / numPools) % 2 === 0
        ? idx % numPools
        : numPools - 1 - (idx % numPools);
      pools[snake].push(team);
    });

    // Generate round-robin within each pool
    pools.forEach((poolTeams, poolIdx) => {
      const poolLabel = String.fromCharCode(65 + poolIdx); // A, B, C...
      const requestedPoolGames = gamesPerTeam || poolTeams.length - 1;
      if (requestedPoolGames > poolTeams.length - 1) {
        throw new ScheduleGenerationError(
          'POOL_GAME_COUNT',
          `Pool ${poolLabel} has ${poolTeams.length} teams, so each team can play at most ${poolTeams.length - 1} unique pool games.`
        );
      }
      const edges = buildRegularLeagueEdges(poolTeams.length, requestedPoolGames);
      edges.forEach(edge => {
        const t1 = poolTeams[edge.home!];
        const t2 = poolTeams[edge.away!];
        matchups.push({
        t1: t1.name, t2: t2.name, t1Id: t1.id, t2Id: t2.id,
        t1LogoUrl: t1.logoUrl, t2LogoUrl: t2.logoUrl,
        round: `Pool ${poolLabel}`, pool: poolIdx
      });
      });
    });

    // Knockout bracket: top `advancePerPool` from each pool advance.
    const totalAdvancing = numPools * advancePerPool;
    if (totalAdvancing > teamList.length) {
      throw new ScheduleGenerationError(
        'INVALID_POOL_ADVANCEMENT',
        'The number of advancing teams cannot exceed the number of tournament teams.'
      );
    }
    if (totalAdvancing >= 2) {
      const qualifiers = buildPoolQualifierOrder(numPools, advancePerPool);
      buildEliminationBracket(qualifiers, matchups, false, 'Knockout');
    }
  }

  // ── SINGLE ELIMINATION ────────────────────────────────────────────────
  else if (tournamentType === 'single_elimination') {
    buildEliminationBracket(teamList, matchups, false, 'Main');
  }

  // ── DOUBLE ELIMINATION ────────────────────────────────────────────────
  else if (tournamentType === 'double_elimination') {
    buildEliminationBracket(teamList, matchups, true, 'WB');
  }

  const finalMatchups = matchups.map(match => ({
    ...match,
    id: match.id || nextMatchId('tg'),
  }));

  // ── Slot Generation ─────────────────────────────────────────────────

  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : startD;
  // Guard: eachDayOfInterval throws if start > end
  if (isAfter(startD, endD)) return [];
  const dayInterval = eachDayOfInterval({ start: startD, end: endD });
  const slots: { date: Date; time: Date; field: ScheduleField }[] = [];

  dayInterval.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const window = dailyWindows?.find(w => w.date === dayStr);
    if (dailyWindows && dailyWindows.length > 0 && !window) return;
    if (config.playDays && !config.playDays.includes(day.getDay())) return;
    if (config.blackoutDaysOfWeek?.includes(day.getDay())) return;
    if (config.blackoutDates?.some(value => value.split('T')[0] === dayStr)) return;
    let currentTime = parseTime(window?.startTime || startTime, day);
    const dayEndTime = parseTime(window?.endTime || endTime, day);

    if (!isNaN(currentTime.getTime()) && !isNaN(dayEndTime.getTime())) {
      while (!isAfter(addMinutes(currentTime, gameLength), dayEndTime)) {
        for (const f of normalizedFields) {
          slots.push({ date: new Date(day), time: new Date(currentTime), field: f });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
  });

  // ── Game Assignment ──────────────────────────────────────────────────

  const finalGames: TournamentGame[] = [];
  const scheduledById = new Map<string, TournamentGame>();
  const dailyPossibleTeamCounts = new Map<string, number>();
  const unscheduled = [...finalMatchups];
  const poolMatches = finalMatchups.filter(match => String(match.round).startsWith('Pool '));
  const poolTeamIds = new Map<string, Set<string>>();
  poolMatches.forEach(match => {
    const label = String(match.round).replace('Pool ', '');
    if (!poolTeamIds.has(label)) poolTeamIds.set(label, new Set());
    if (match.t1Id && match.t1Id !== 'tbd') poolTeamIds.get(label)!.add(match.t1Id);
    if (match.t2Id && match.t2Id !== 'tbd') poolTeamIds.get(label)!.add(match.t2Id);
  });

  const incomingMatches = (match: any) => finalMatchups.filter(candidate =>
    (candidate.winnerTo && candidate.winnerTo === match.id) ||
    (candidate.loserTo && candidate.loserTo === match.id)
  );
  const dependencies = (match: any) => {
    const incoming = incomingMatches(match);
    if (match.isResetMatch) {
      const championship = finalMatchups.find(candidate =>
        candidate.stage === 'GF' && candidate.round === 'Championship'
      );
      if (championship && !incoming.includes(championship)) incoming.push(championship);
    }
    if (match.stage === 'Knockout' && incoming.length === 0) incoming.push(...poolMatches);
    return incoming;
  };

  const possibleMemo = new Map<string, Set<string>>();
  const possibleTeams = (match: any, trail = new Set<string>()): Set<string> => {
    if (possibleMemo.has(match.id)) return possibleMemo.get(match.id)!;
    if (trail.has(match.id)) return new Set();
    const nextTrail = new Set(trail).add(match.id);
    const possible = new Set<string>();
    [match.t1Id, match.t2Id].forEach((id: string | undefined) => {
      if (id && id !== 'tbd' && id !== 'bye') possible.add(id);
    });
    const placeholderText = `${match.t1 || ''} ${match.t2 || ''}`;
    for (const poolLabel of placeholderText.matchAll(/Pool ([A-Z])/g)) {
      poolTeamIds.get(poolLabel[1])?.forEach(id => possible.add(id));
    }
    dependencies(match).forEach(source => {
      possibleTeams(source, nextTrail).forEach(id => possible.add(id));
    });
    possibleMemo.set(match.id, possible);
    return possible;
  };

  // Group slots by timeslot (Date + Time).
  const slotsByTime = new Map<string, { date: Date; time: Date; field: ScheduleField }[]>();
  slots.forEach(s => {
    const key = `${format(s.date, 'yyyy-MM-dd')}_${format(s.time, 'HH:mm')}`;
    if (!slotsByTime.has(key)) slotsByTime.set(key, []);
    slotsByTime.get(key)!.push(s);
  });

  const sortedTimes = Array.from(slotsByTime.keys()).sort();

  for (const timeKey of sortedTimes) {
    if (unscheduled.length === 0) break;
    const currentSlots = slotsByTime.get(timeKey)!;
    const dayKey = format(currentSlots[0].date, 'yyyy-MM-dd');
    const slotTimeStr = format(currentSlots[0].time, 'h:mm a');
    const currentTimestamp = currentSlots[0].time.getTime();
    const assignedPossibleTeams: Set<string>[] = [];

    for (const slot of currentSlots) {
      if (unscheduled.length === 0) break;

      let foundMatchupIndex = -1;
      for (let i = 0; i < unscheduled.length; i++) {
        const match = unscheduled[i];
        const requiredMatches = dependencies(match);
        if (requiredMatches.some(source => !scheduledById.has(source.id))) continue;
        const earliestTimestamp = requiredMatches.reduce((latest, source) => {
          const scheduled = scheduledById.get(source.id)!;
          const sourceStart = parse(scheduled.time, 'h:mm a', parseLocalDate(scheduled.date));
          return Math.max(latest, addMinutes(sourceStart, gameLength + breakLength).getTime());
        }, 0);
        if (currentTimestamp < earliestTimestamp) continue;
        const possible = possibleTeams(match);
        if (assignedPossibleTeams.some(existing => [...possible].some(id => existing.has(id)))) continue;
        if ([...possible].some(id => (dailyPossibleTeamCounts.get(`${dayKey}:${id}`) || 0) >= maxDailyGamesPerTeam)) continue;
        foundMatchupIndex = i;
        break;
      }

      if (foundMatchupIndex !== -1) {
        const match = unscheduled.splice(foundMatchupIndex, 1)[0];
        const scheduledGame: TournamentGame = {
          id: match.id || nextMatchId('tg'),
          team1: match.t1, team2: match.t2,
          team1Id: match.t1Id || 'tbd', team2Id: match.t2Id || 'tbd',
          team1LogoUrl: match.t1LogoUrl, team2LogoUrl: match.t2LogoUrl,
          score1: 0, score2: 0,
          date: dayKey,
          time: slotTimeStr,
          location: slot.field.name,
          resourceId: slot.field.id,
          isCompleted: false,
          updatedAt: new Date().toISOString(),
          round: match.round,
          stage: match.stage || (
            match.round?.includes('WB') ? 'WB' :
            match.round?.includes('LB') ? 'LB' :
            match.round?.includes('Pool') ? 'Pool' : 'Main'
          ),
          pool: match.pool,
          winnerTo: match.winnerTo,
          winnerToSlot: match.winnerToSlot,
          loserTo: match.loserTo,
          loserToSlot: match.loserToSlot,
          isResetMatch: match.isResetMatch || false,
          isConditional: match.isConditional || false,
        };
        finalGames.push(scheduledGame);
        scheduledById.set(match.id, scheduledGame);
        const scheduledPossible = possibleTeams(match);
        assignedPossibleTeams.push(scheduledPossible);
        scheduledPossible.forEach(id => {
          const key = `${dayKey}:${id}`;
          dailyPossibleTeamCounts.set(key, (dailyPossibleTeamCounts.get(key) || 0) + 1);
        });
      }
    }
  }

  if (unscheduled.length > 0) {
    throw new ScheduleGenerationError(
      'INSUFFICIENT_CAPACITY',
      `${unscheduled.length} tournament matches could not fit after respecting bracket dependencies, fields, and rest periods.`
    );
  }

  return finalGames;
}

// ─── Bracket Builder (Single / Double Elimination) ──────────────────────────

/**
 * Builds WB matchups (and LB + Grand Final if isDouble) and pushes them into `matchups`.
 *
 * WB seeding follows standard topological order: 1v(N), (N/2+1)v(N/2), 2v(N-1)...
 * so the strongest seeds meet only in later rounds.
 *
 * Double Elimination:
 * - LB catches losers from each WB round
 * - LB has 2*(totalRounds-1) rounds
 * - Grand Final: WB winner vs LB winner
 * - Grand Final Reset: If LB winner wins GF, a second GF is played (modeled as isResetMatch)
 */
function buildEliminationBracket(
  teamList: TeamIdentity[],
  matchups: any[],
  isDouble: boolean,
  stageName: string
): void {
  const numTeams = teamList.length;
  const totalRounds = Math.max(1, Math.ceil(Math.log2(numTeams)));

  // ── Winners Bracket ─────────────────────────────────────────────────
  const roundMatches: any[][] = Array.from({ length: totalRounds }, () => []);

  for (let r = 0; r < totalRounds; r++) {
    const numMatches = Math.pow(2, totalRounds - r - 1);
    for (let m = 0; m < numMatches; m++) {
      const isFinal = r === totalRounds - 1;
      const isSemi = r === totalRounds - 2;
      const label = isFinal
        ? (isDouble ? 'Winners Bracket Final' : 'Championship')
        : isSemi
          ? (isDouble ? 'Winners Bracket Semi-Finals' : 'Semi-Finals')
          : isDouble ? `WB Round ${r + 1}` : `Round ${r + 1}`;
      roundMatches[r].push({
        id: nextMatchId(`wb_r${r}_m${m}`),
        round: label, stage: stageName,
        t1: 'TBD', t2: 'TBD'
      });
    }
  }

  // Link WB progression
  for (let r = 0; r < totalRounds - 1; r++) {
    for (let m = 0; m < roundMatches[r].length; m++) {
      const parentIdx = Math.floor(m / 2);
      const slotName = m % 2 === 0 ? 'team1' : 'team2';
      roundMatches[r][m].winnerTo = roundMatches[r + 1][parentIdx].id;
      roundMatches[r][m].winnerToSlot = slotName;
    }
  }

  // Populate Round 1 with seeded teams — standard topological seeding (1v8, 4v5, 2v7, 3v6)
  // LOGIC-2 FIX: Run expansion exactly `totalRounds` times so the seed array has
  // exactly 2^totalRounds = bracketSize entries (not 2^(totalRounds+1)).
  const seeds = bracketSeedOrder(totalRounds);
  // seeds now has exactly bracketSize entries: [0, 7, 3, 4, 1, 6, 2, 5] for 8-team
  // → Match 0: Seed1 vs Seed8, Match 1: Seed4 vs Seed5, Match 2: Seed2 vs Seed7, Match 3: Seed3 vs Seed6

  const firstRound = roundMatches[0];
  for (let i = 0; i < firstRound.length; i++) {
    const t1Idx = seeds[i * 2];
    const t2Idx = seeds[i * 2 + 1];
    firstRound[i].t1 = t1Idx < numTeams ? teamList[t1Idx].name : 'BYE';
    firstRound[i].t1Id = t1Idx < numTeams ? teamList[t1Idx].id : 'bye';
    firstRound[i].t1LogoUrl = t1Idx < numTeams ? teamList[t1Idx].logoUrl : undefined;
    firstRound[i].t2 = t2Idx < numTeams ? teamList[t2Idx].name : 'BYE';
    firstRound[i].t2Id = t2Idx < numTeams ? teamList[t2Idx].id : 'bye';
    firstRound[i].t2LogoUrl = t2Idx < numTeams ? teamList[t2Idx].logoUrl : undefined;
  }

  if (!isDouble) {
    const removed = new Set<string>();
    firstRound.forEach((match, index) => {
      const t1Bye = match.t1Id === 'bye';
      const t2Bye = match.t2Id === 'bye';
      if (t1Bye === t2Bye || totalRounds === 1) return;
      const advancing = t1Bye
        ? { name: match.t2, id: match.t2Id, logoUrl: match.t2LogoUrl }
        : { name: match.t1, id: match.t1Id, logoUrl: match.t1LogoUrl };
      const parent = roundMatches[1][Math.floor(index / 2)];
      const slot = index % 2 === 0 ? 't1' : 't2';
      parent[slot] = advancing.name;
      parent[`${slot}Id`] = advancing.id;
      parent[`${slot}LogoUrl`] = advancing.logoUrl;
      removed.add(match.id);
    });
    roundMatches.forEach(round => round.forEach(match => {
      if (!removed.has(match.id)) matchups.push(match);
    }));
    return;
  }

  if (totalRounds === 1) {
    const opening = firstRound[0];
    const grandFinalId = nextMatchId('gf');
    const resetId = nextMatchId('gf_reset');
    opening.winnerTo = grandFinalId;
    opening.winnerToSlot = 'team1';
    opening.loserTo = grandFinalId;
    opening.loserToSlot = 'team2';
    matchups.push(opening, {
      id: grandFinalId,
      round: 'Championship',
      stage: 'GF',
      t1: 'TBD (Winners Bracket)',
      t2: 'TBD (Losers Bracket)',
      t1Id: 'tbd',
      t2Id: 'tbd',
    }, {
      id: resetId,
      round: 'Championship Decider',
      stage: 'GF',
      t1: 'TBD (Championship Team 1)',
      t2: 'TBD (Championship Team 2)',
      t1Id: 'tbd',
      t2Id: 'tbd',
      isResetMatch: true,
      isConditional: true,
    });
    return;
  }

  roundMatches.forEach(rm => rm.forEach(m => matchups.push(m)));

  // ── Losers Bracket (Double Elimination only) ────────────────────────
  if (!isDouble) return;

  // MINOR-3 FIX: Grand Final + Reset match
  const grandFinalId = nextMatchId('gf');
  const grandFinalResetId = nextMatchId('gf_reset');

  const lbMatchups: any[] = [];

  const linkMatch = (source: any, targetId: string, targetSlot: 'team1' | 'team2', isWinner: boolean) => {
    if (isWinner) {
      source.winnerTo = targetId;
      source.winnerToSlot = targetSlot;
    } else {
      source.loserTo = targetId;
      source.loserToSlot = targetSlot;
    }
  };

  // LB Phase 1: Catch WB Round 1 losers
  const wbR0 = roundMatches[0];
  const lbr1Count = Math.max(1, Math.floor(wbR0.length / 2));
  const lbr1: any[] = [];
  for (let i = 0; i < lbr1Count; i++) {
    const m = { id: nextMatchId(`lb_r1_m${i}`), round: 'LB Round 1', stage: 'LB', t1: 'TBD', t2: 'TBD' };
    lbr1.push(m);
    lbMatchups.push(m);
  }
  // Link WB R0 losers into LB R1 (pairs of losers meet each other)
  for (let i = 0; i < wbR0.length; i++) {
    const targetIdx = Math.floor(i / 2);
    const slotName = i % 2 === 0 ? 'team1' : 'team2';
    if (lbr1[targetIdx]) linkMatch(wbR0[i], lbr1[targetIdx].id, slotName, false);
  }

  // LB Phases 2+: For each subsequent WB round, LB winners meet incoming WB losers
  let lastLBRound: any[] = lbr1;
  for (let r = 1; r < totalRounds; r++) {
    const wbRound = roundMatches[r];
    const isFinalWB = r === totalRounds - 1;

    // Step A: LB survivors meet WB losers
    const lbrX: any[] = [];
    for (let i = 0; i < wbRound.length; i++) {
      const label = isFinalWB ? 'Losers Bracket Final' : `LB Round ${r * 2}`;
      const m = { id: nextMatchId(`lb_rx_r${r}_m${i}`), round: label, stage: 'LB', t1: 'TBD', t2: 'TBD' };
      lbrX.push(m);
      lbMatchups.push(m);

      // MODERATE-1 FIX: Guard — lastLBRound may be shorter than wbRound
      if (lastLBRound[i]) linkMatch(lastLBRound[i], m.id, 'team1', true);
      linkMatch(wbRound[i], m.id, 'team2', false);
    }

    if (isFinalWB) {
      // LB Finals winner → Grand Final team2 slot
      if (lbrX[0]) linkMatch(lbrX[0], grandFinalId, 'team2', true);
      // WB Finals winner → Grand Final team1 slot
      linkMatch(wbRound[0], grandFinalId, 'team1', true);
    } else {
      // Step B: LB internal round (winners of Step A play each other)
      const lbrY: any[] = [];
      const nextCount = Math.max(1, Math.floor(lbrX.length / 2));
      for (let i = 0; i < nextCount; i++) {
        const m = {
          id: nextMatchId(`lb_ry_r${r}_m${i}`),
          round: `LB Round ${r * 2 + 1}`,
          stage: 'LB',
          t1: 'TBD', t2: 'TBD'
        };
        lbrY.push(m);
        lbMatchups.push(m);
        if (lbrX[i * 2]) linkMatch(lbrX[i * 2], m.id, 'team1', true);
        if (lbrX[i * 2 + 1]) linkMatch(lbrX[i * 2 + 1], m.id, 'team2', true);
      }
      lastLBRound = lbrY.length > 0 ? lbrY : lbrX;
    }
  }

  // Grand Final
  lbMatchups.push({
    id: grandFinalId,
    round: 'Championship',
    stage: 'GF',
    t1: 'TBD (Winners Bracket)',
    t2: 'TBD (Losers Bracket)',
    t1Id: 'tbd', t2Id: 'tbd',
  });

  // MINOR-3 FIX: Grand Final Reset Match
  // Only played if LB winner defeats the undefeated WB winner in GF.
  // Modeled as a conditional match — UI should hide until triggered.
  lbMatchups.push({
    id: grandFinalResetId,
    round: 'Championship Decider',
    stage: 'GF',
    t1: 'TBD (Championship Team 1)',
    t2: 'TBD (Championship Team 2)',
    t1Id: 'tbd', t2Id: 'tbd',
    isResetMatch: true,   // UI flag: only show when triggered
    isConditional: true,  // Only played if LB winner wins Grand Final
  });

  lbMatchups.forEach(m => matchups.push(m));
}

/**
 * MISS-5: Bracket Auto-Advancement
 * Takes a list of tournament games and advances the winner/loser of a specific match
 * to their respective next nodes in the bracket.
 */
export type BracketScoreValidation =
  | { valid: true }
  | { valid: false; code: string; message: string };

export class BracketProgressionError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BracketProgressionError';
    this.code = code;
  }
}

function unresolvedParticipant(id: string | null | undefined, name: string | null | undefined): boolean {
  const normalizedId = String(id || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim().toLowerCase();
  return !normalizedId || normalizedId === 'tbd' || normalizedId === 'bye' ||
    !normalizedName || normalizedName === 'bye' || normalizedName.includes('tbd');
}

export function isTournamentGameScorable(game: TournamentGame): boolean {
  return !game.isConditional &&
    !unresolvedParticipant(game.team1Id, game.team1) &&
    !unresolvedParticipant(game.team2Id, game.team2);
}

function isEliminationGame(game: TournamentGame): boolean {
  const stage = String(game.stage || '').toLowerCase();
  const round = String(game.round || '').toLowerCase();
  if (stage === 'pool' || round.startsWith('pool')) return false;
  return Boolean(
    game.winnerTo || game.loserTo || game.isResetMatch ||
    ['main', 'knockout', 'wb', 'lb', 'gf'].includes(stage) ||
    round.includes('championship') || round.includes('semi-final') ||
    round.includes('quarter-final') || /^round\s+\d+/.test(round)
  );
}

function isPoolGame(game: TournamentGame): boolean {
  return String(game.stage || '').toLowerCase() === 'pool' ||
    String(game.round || '').toLowerCase().startsWith('pool');
}

function hasSeededPoolQualifiers(games: TournamentGame[]): boolean {
  return games.some(game => game.stage === 'Knockout' && [game.team1Id, game.team2Id].some(id => {
    const normalized = String(id || '').trim().toLowerCase();
    return normalized && normalized !== 'tbd' && normalized !== 'bye';
  }));
}

function directDownstreamIds(games: TournamentGame[], game: TournamentGame): string[] {
  const ids = [game.winnerTo, game.loserTo].filter((id): id is string => Boolean(id));
  if (isPoolGame(game)) {
    ids.push(...games.filter(candidate => candidate.stage === 'Knockout').map(candidate => candidate.id));
  }
  if (game.stage === 'GF' && game.round === 'Championship' && !game.isResetMatch) {
    const reset = games.find(candidate => candidate.isResetMatch);
    if (reset) ids.push(reset.id);
  }
  return [...new Set(ids)];
}

export function hasCompletedBracketDescendant(games: TournamentGame[], matchId: string): boolean {
  const source = games.find(game => game.id === matchId);
  if (!source) return false;

  const visited = new Set<string>();
  const queue = directDownstreamIds(games, source);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const target = games.find(game => game.id === id);
    if (!target) continue;
    if (target.isCompleted) return true;
    queue.push(...directDownstreamIds(games, target));
  }
  return false;
}

export function validateBracketScoreSubmission(
  games: TournamentGame[],
  matchId: string,
  score1: number,
  score2: number
): BracketScoreValidation {
  const match = games.find(game => game.id === matchId);
  if (!match) return { valid: false, code: 'MATCH_NOT_FOUND', message: 'Match not found.' };
  if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 999 || score2 > 999) {
    return { valid: false, code: 'INVALID_SCORE', message: 'Scores must be whole numbers from 0 to 999.' };
  }
  if (!isTournamentGameScorable(match)) {
    return {
      valid: false,
      code: match.isConditional ? 'MATCH_CONDITIONAL' : 'MATCH_UNRESOLVED',
      message: match.isConditional
        ? 'This conditional match is not active.'
        : 'Both tournament participants must be resolved before a score can be submitted.',
    };
  }
  if (isPoolGame(match) && hasSeededPoolQualifiers(games)) {
    return {
      valid: false,
      code: 'POOL_RESULTS_LOCKED',
      message: 'Pool results cannot change after knockout qualifiers have been seeded.',
    };
  }
  if (isEliminationGame(match) && score1 === score2) {
    return { valid: false, code: 'ELIMINATION_TIE', message: 'Elimination matches require a decisive winner.' };
  }
  if (hasCompletedBracketDescendant(games, matchId)) {
    return {
      valid: false,
      code: 'DOWNSTREAM_COMPLETE',
      message: 'This result cannot be changed because a dependent bracket match is already complete.',
    };
  }
  return { valid: true };
}

export type TournamentWinnerSelection = 'team1' | 'team2';

export function recordTournamentScore(
  games: TournamentGame[],
  matchId: string,
  score1: number,
  score2: number,
  explicitWinner?: TournamentWinnerSelection
): TournamentGame[] {
  const match = games.find(game => game.id === matchId);
  if (!match) throw new BracketProgressionError('MATCH_NOT_FOUND', 'Match not found.');

  let effectiveScore1 = score1;
  let effectiveScore2 = score2;
  if (explicitWinner === 'team1' && effectiveScore1 <= effectiveScore2) effectiveScore1 = effectiveScore2 + 1;
  if (explicitWinner === 'team2' && effectiveScore2 <= effectiveScore1) effectiveScore2 = effectiveScore1 + 1;

  const advanced = advanceBracketMatch(games, matchId, effectiveScore1, effectiveScore2);
  const winnerSlot: TournamentWinnerSelection | undefined = explicitWinner ||
    (score1 > score2 ? 'team1' : score2 > score1 ? 'team2' : undefined);
  const winnerId = winnerSlot === 'team1' ? match.team1Id : winnerSlot === 'team2' ? match.team2Id : null;
  const scoredIndex = advanced.findIndex(game => game.id === matchId);
  advanced[scoredIndex] = {
    ...advanced[scoredIndex],
    score1,
    score2,
    isCompleted: true,
    isDisputed: false,
    disputeNotes: undefined,
    winnerId,
    explicitWinner: explicitWinner || null,
  } as TournamentGame;
  return advanced;
}

export function advanceBracketMatch(
  games: TournamentGame[],
  matchId: string,
  score1: number,
  score2: number
): TournamentGame[] {
  const updatedGames = [...games];
  const idx = updatedGames.findIndex(g => g.id === matchId);
  if (idx === -1) return updatedGames;

  const match = updatedGames[idx];
  const validation = validateBracketScoreSubmission(updatedGames, matchId, score1, score2);
  if (!validation.valid) {
    throw new BracketProgressionError(validation.code, validation.message);
  }

  const winnerId = (score1 > score2 ? match.team1Id : match.team2Id) ?? null;
  const winnerName = (score1 > score2 ? match.team1 : match.team2) ?? "TBD";
  const winnerLogo = (score1 > score2 ? match.team1LogoUrl : match.team2LogoUrl) ?? null;

  const loserId = (score1 > score2 ? match.team2Id : match.team1Id) ?? null;
  const loserName = (score1 > score2 ? match.team2 : match.team1) ?? "TBD";
  const loserLogo = (score1 > score2 ? match.team2LogoUrl : match.team1LogoUrl) ?? null;

  // 1. Advance Winner
  if (match.winnerTo) {
    const targetIdx = updatedGames.findIndex(g => g.id === match.winnerTo);
    if (targetIdx !== -1) {
      const slot = match.winnerToSlot || 'team1';
      updatedGames[targetIdx] = {
        ...updatedGames[targetIdx],
        [slot]: winnerName,
        [`${slot}Id`]: winnerId,
        [`${slot}LogoUrl`]: winnerLogo,
        [`score${slot === 'team1' ? '1' : '2'}`]: 0
      };
    }
  }

  // 2. Advance Loser (Double Elimination)
  if (match.loserTo) {
    const targetIdx = updatedGames.findIndex(g => g.id === match.loserTo);
    if (targetIdx !== -1 && !updatedGames[targetIdx].isResetMatch) {
      const slot = match.loserToSlot || 'team1';
      updatedGames[targetIdx] = {
        ...updatedGames[targetIdx],
        [slot]: loserName,
        [`${slot}Id`]: loserId,
        [`${slot}LogoUrl`]: loserLogo,
        [`score${slot === 'team1' ? '1' : '2'}`]: 0
      };
    }
  }

  // A reset is needed only when the losers-bracket champion (GF team2)
  // hands the undefeated winners-bracket champion (GF team1) its first loss.
  if (match.stage === 'GF' && match.round === 'Championship' && !match.isResetMatch) {
    const resetIdx = updatedGames.findIndex(game => game.isResetMatch);
    if (resetIdx !== -1) {
      const losersBracketChampionWon = score2 > score1;
      updatedGames[resetIdx] = losersBracketChampionWon
        ? {
            ...updatedGames[resetIdx],
            team1: match.team1,
            team1Id: match.team1Id,
            team1LogoUrl: match.team1LogoUrl,
            team2: match.team2,
            team2Id: match.team2Id,
            team2LogoUrl: match.team2LogoUrl,
            score1: 0,
            score2: 0,
            isCompleted: false,
            isConditional: false,
          }
        : {
            ...updatedGames[resetIdx],
            team1: 'TBD (Championship Team 1)',
            team1Id: 'tbd',
            team1LogoUrl: undefined,
            team2: 'TBD (Championship Team 2)',
            team2Id: 'tbd',
            team2LogoUrl: undefined,
            score1: 0,
            score2: 0,
            isCompleted: false,
            isConditional: true,
          };
    }
  }

  // Helper to ensure we don't return 'undefined' fields which crash Firestore
  const sanitize = (g: TournamentGame): TournamentGame => {
    const cleaned: any = {};
    Object.entries(g).forEach(([k, v]) => {
      if (v !== undefined) cleaned[k] = v;
    });
    return cleaned as TournamentGame;
  };

  return updatedGames.map(sanitize);
}
