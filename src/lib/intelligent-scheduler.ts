import { addMinutes, differenceInMinutes, isValid, parse, parseISO } from 'date-fns';
import type { TournamentGame } from '@/components/providers/team-provider';
import {
  type ScheduleConfig,
  generateLeagueSchedule,
  generateTournamentSchedule,
} from './scheduler-utils';

export interface ValidationReport {
  isValid: boolean;
  conflicts: string[];
  fairnessScore: number;
  warnings: string[];
}

export interface IntelligentConfig extends ScheduleConfig {
  maxCorrectionAttempts?: number;
  minRestMinutes?: number;
  maxDailyGamesPerTeam?: number;
}

type ScheduleKind = 'league' | 'tournament';
type ConfiguredTeam = { id: string; name: string };

const PLACEHOLDER_TEAM_IDS = new Set(['tbd', 'bye']);

function configuredTeams(config: IntelligentConfig): ConfiguredTeam[] {
  return config.teams.map((team, index) => typeof team === 'string'
    ? { id: `t_${index}`, name: team }
    : { id: team.id, name: team.name });
}

function cleanDate(value: string): string {
  return value.includes('T') ? value.split('T')[0] : value;
}

function parseDateTime(date: string, time: string): Date | null {
  const reference = parseISO(cleanDate(date));
  if (!isValid(reference)) return null;
  for (const timeFormat of ['h:mm a', 'HH:mm', 'HH:mm:ss']) {
    const parsed = parse(time, timeFormat, reference);
    if (isValid(parsed)) return parsed;
  }
  return null;
}

function concreteTeamId(value: string | undefined): string | null {
  if (!value || PLACEHOLDER_TEAM_IDS.has(value.toLowerCase())) return null;
  return value;
}

function addConflict(conflicts: string[], message: string): void {
  if (!conflicts.includes(message)) conflicts.push(message);
}

function validateConfiguration(config: IntelligentConfig, conflicts: string[]): void {
  const teams = configuredTeams(config);
  if (teams.length < 2) addConflict(conflicts, 'At least two teams are required.');
  if (new Set(teams.map(team => team.id)).size !== teams.length) {
    addConflict(conflicts, 'Every team must have a unique scheduling identity.');
  }
  if (!config.fields.length) addConflict(conflicts, 'At least one field or venue is required.');
  if (!Number.isFinite(config.gameLength) || config.gameLength <= 0) {
    addConflict(conflicts, 'Match duration must be greater than zero.');
  }
  if (!Number.isFinite(config.breakLength) || config.breakLength < 0) {
    addConflict(conflicts, 'Rest time cannot be negative.');
  }
  if (config.gamesPerTeam !== undefined &&
      (!Number.isInteger(config.gamesPerTeam) || config.gamesPerTeam <= 0)) {
    addConflict(conflicts, 'Games per team must be a positive whole number.');
  }

  const startDate = parseISO(cleanDate(config.startDate));
  const endDate = config.endDate ? parseISO(cleanDate(config.endDate)) : null;
  if (!isValid(startDate) || (endDate && !isValid(endDate))) {
    addConflict(conflicts, 'The schedule contains an invalid date range.');
  } else if (endDate && startDate.getTime() > endDate.getTime()) {
    addConflict(conflicts, 'The schedule end date must be on or after its start date.');
  }
}

function validateConfiguredWindows(
  games: TournamentGame[],
  config: IntelligentConfig,
  conflicts: string[]
): void {
  const startDate = parseISO(cleanDate(config.startDate));
  const endDate = config.endDate ? parseISO(cleanDate(config.endDate)) : null;
  const blackoutDates = new Set((config.blackoutDates || []).map(cleanDate));

  for (const game of games) {
    const dateKey = cleanDate(game.date || '');
    const gameStart = parseDateTime(dateKey, game.time || '');
    if (!gameStart) {
      addConflict(conflicts, `Match ${game.id} has an invalid date or start time.`);
      continue;
    }
    if (!game.location && !game.resourceId) {
      addConflict(conflicts, `Match ${game.id} has no field or venue.`);
    }
    if (isValid(startDate) && gameStart.getTime() < startDate.getTime()) {
      addConflict(conflicts, `Match ${game.id} is scheduled before the configured start date.`);
    }
    if (endDate && isValid(endDate)) {
      const endOfConfiguredDate = addMinutes(endDate, 24 * 60 - 1);
      if (gameStart.getTime() > endOfConfiguredDate.getTime()) {
        addConflict(conflicts, `Match ${game.id} is scheduled after the configured end date.`);
      }
    }
    if (config.playDays && !config.playDays.includes(gameStart.getDay())) {
      addConflict(conflicts, `Match ${game.id} is scheduled on a disabled play day.`);
    }
    if (config.blackoutDaysOfWeek?.includes(gameStart.getDay()) || blackoutDates.has(dateKey)) {
      addConflict(conflicts, `Match ${game.id} is scheduled during a blackout.`);
    }

    const dailyWindow = config.dailyWindows?.find(window => window.date === dateKey);
    if (config.dailyWindows?.length && !dailyWindow) {
      addConflict(conflicts, `Match ${game.id} is scheduled on a date without an available daily window.`);
      continue;
    }
    const windowStart = parseDateTime(dateKey, dailyWindow?.startTime || config.startTime);
    const windowEnd = parseDateTime(dateKey, dailyWindow?.endTime || config.endTime);
    if (!windowStart || !windowEnd) {
      addConflict(conflicts, `Match ${game.id} depends on an invalid daily time window.`);
      continue;
    }
    if (gameStart.getTime() < windowStart.getTime() ||
        addMinutes(gameStart, config.gameLength).getTime() > windowEnd.getTime()) {
      addConflict(conflicts, `Match ${game.id} falls outside its configured daily time window.`);
    }
  }
}

function validateRoundRobinFairness(
  games: TournamentGame[],
  teams: ConfiguredTeam[],
  expectedGamesByTeam: Map<string, number>,
  conflicts: string[],
  warnings: string[]
): {
  gameCountSpread: number;
  homeAwayImbalance: number;
  opponentSpread: number;
  startTimeImbalance: number;
  fieldImbalance: number;
} {
  const knownIds = new Set(teams.map(team => team.id));
  const counts = new Map(teams.map(team => [team.id, 0]));
  const homeCounts = new Map(teams.map(team => [team.id, 0]));
  const awayCounts = new Map(teams.map(team => [team.id, 0]));
  const pairCounts = new Map<string, number>();
  const startTimeCounts = new Map(teams.map(team => [team.id, new Map<string, number>()]));
  const fieldCounts = new Map(teams.map(team => [team.id, new Map<string, number>()]));
  const usedStartTimes = new Set<string>();
  const usedFields = new Set<string>();

  for (let left = 0; left < teams.length; left++) {
    for (let right = left + 1; right < teams.length; right++) {
      pairCounts.set([teams[left].id, teams[right].id].sort().join(':'), 0);
    }
  }

  for (const game of games) {
    const team1Id = concreteTeamId(game.team1Id);
    const team2Id = concreteTeamId(game.team2Id);
    if (!team1Id || !team2Id || !knownIds.has(team1Id) || !knownIds.has(team2Id)) continue;
    counts.set(team1Id, (counts.get(team1Id) || 0) + 1);
    counts.set(team2Id, (counts.get(team2Id) || 0) + 1);
    homeCounts.set(team1Id, (homeCounts.get(team1Id) || 0) + 1);
    awayCounts.set(team2Id, (awayCounts.get(team2Id) || 0) + 1);
    const pairKey = [team1Id, team2Id].sort().join(':');
    pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
    const startTime = String(game.time || '').trim().toUpperCase();
    const field = String(game.resourceId || game.location || '').trim();
    if (startTime) {
      usedStartTimes.add(startTime);
      for (const teamId of [team1Id, team2Id]) {
        const teamCounts = startTimeCounts.get(teamId)!;
        teamCounts.set(startTime, (teamCounts.get(startTime) || 0) + 1);
      }
    }
    if (field) {
      usedFields.add(field);
      for (const teamId of [team1Id, team2Id]) {
        const teamCounts = fieldCounts.get(teamId)!;
        teamCounts.set(field, (teamCounts.get(field) || 0) + 1);
      }
    }
  }

  const expectedAppearances = [...expectedGamesByTeam.values()].reduce((sum, count) => sum + count, 0);
  if (expectedAppearances % 2 !== 0) {
    addConflict(conflicts, 'The requested games-per-team totals cannot produce an equal schedule.');
  } else if (games.length !== expectedAppearances / 2) {
    addConflict(
      conflicts,
      `Incomplete schedule: expected ${expectedAppearances / 2} matches but generated ${games.length}.`
    );
  }

  for (const team of teams) {
    const expected = expectedGamesByTeam.get(team.id) || 0;
    const actual = counts.get(team.id) || 0;
    if (actual !== expected) {
      addConflict(
        conflicts,
        `Team ${team.name} requires ${expected} game${expected === 1 ? '' : 's'} but has ${actual}.`
      );
    }
    const home = homeCounts.get(team.id) || 0;
    const away = awayCounts.get(team.id) || 0;
    if (Math.abs(home - away) > 1) {
      addConflict(conflicts, `Home/away imbalance: ${team.name} has ${home} home and ${away} away games.`);
    }
  }

  const countValues = [...counts.values()];
  const gameCountSpread = countValues.length ? Math.max(...countValues) - Math.min(...countValues) : 0;
  if (gameCountSpread > 0) {
    warnings.push(`Uneven match distribution: teams differ by ${gameCountSpread} game${gameCountSpread === 1 ? '' : 's'}.`);
  }

  const homeAwayImbalance = teams.reduce((largest, team) => Math.max(
    largest,
    Math.abs((homeCounts.get(team.id) || 0) - (awayCounts.get(team.id) || 0))
  ), 0);
  const pairValues = [...pairCounts.values()];
  const opponentSpread = pairValues.length ? Math.max(...pairValues) - Math.min(...pairValues) : 0;
  if (opponentSpread > 1) {
    addConflict(conflicts, `Opponent imbalance: matchup frequencies differ by ${opponentSpread} games.`);
  }

  const allocationSpread = (countsByTeam: Map<string, Map<string, number>>, keys: Set<string>) =>
    teams.reduce((largest, team) => {
      const values = [...keys].map(key => countsByTeam.get(team.id)?.get(key) || 0);
      const spread = values.length > 1 ? Math.max(...values) - Math.min(...values) : 0;
      return Math.max(largest, spread);
    }, 0);
  const startTimeImbalance = allocationSpread(startTimeCounts, usedStartTimes);
  const fieldImbalance = allocationSpread(fieldCounts, usedFields);
  if (startTimeImbalance > 1) {
    warnings.push(`Start-time imbalance: a team receives one start slot ${startTimeImbalance} more times than another.`);
  }
  if (fieldImbalance > 1) {
    warnings.push(`Field imbalance: a team uses one field ${fieldImbalance} more times than another.`);
  }

  return { gameCountSpread, homeAwayImbalance, opponentSpread, startTimeImbalance, fieldImbalance };
}

function validateTournamentCompleteness(
  games: TournamentGame[],
  config: IntelligentConfig,
  teams: ConfiguredTeam[],
  conflicts: string[],
  warnings: string[]
): {
  gameCountSpread: number;
  homeAwayImbalance: number;
  opponentSpread: number;
  startTimeImbalance: number;
  fieldImbalance: number;
} {
  const format = config.tournamentType || 'round_robin';
  if (format === 'round_robin') {
    const expected = config.gamesPerTeam || teams.length - 1;
    return validateRoundRobinFairness(
      games,
      teams,
      new Map(teams.map(team => [team.id, expected])),
      conflicts,
      warnings
    );
  }

  if (format === 'pool_play_knockout') {
    const poolCount = Math.max(2, Math.min(config.poolCount || 2, Math.floor(teams.length / 2)));
    const pools: ConfiguredTeam[][] = Array.from({ length: poolCount }, () => []);
    teams.forEach((team, index) => {
      const row = Math.floor(index / poolCount);
      const column = row % 2 === 0 ? index % poolCount : poolCount - 1 - (index % poolCount);
      pools[column].push(team);
    });
    const poolGames = games.filter(game => String(game.round || '').startsWith('Pool '));
    const expectedByTeam = new Map<string, number>();
    pools.forEach(pool => pool.forEach(team => {
      expectedByTeam.set(team.id, config.gamesPerTeam || pool.length - 1);
    }));
    const fairness = validateRoundRobinFairness(
      poolGames,
      teams,
      expectedByTeam,
      conflicts,
      warnings
    );
    const advancing = poolCount * (config.advancePerPool || 2);
    const expectedTotal = [...expectedByTeam.values()].reduce((sum, count) => sum + count, 0) / 2 + advancing - 1;
    if (games.length !== expectedTotal) {
      addConflict(conflicts, `Incomplete tournament: expected ${expectedTotal} matches but generated ${games.length}.`);
    }
    return fairness;
  }

  const expectedTotal = format === 'single_elimination'
    ? teams.length - 1
    : teams.length * 2 - 1;
  if (games.length !== expectedTotal) {
    addConflict(conflicts, `Incomplete tournament: expected ${expectedTotal} matches but generated ${games.length}.`);
  }
  return {
    gameCountSpread: 0,
    homeAwayImbalance: 0,
    opponentSpread: 0,
    startTimeImbalance: 0,
    fieldImbalance: 0,
  };
}

function validateBracketDependencies(
  games: TournamentGame[],
  config: IntelligentConfig,
  conflicts: string[]
): void {
  const gameById = new Map<string, TournamentGame>();
  for (const game of games) {
    if (gameById.has(game.id)) addConflict(conflicts, `Duplicate match ID: ${game.id}.`);
    else gameById.set(game.id, game);
  }

  const edges = new Map<string, Set<string>>();
  const occupiedTargetSlots = new Map<string, string>();
  const incomingSlots = new Map<string, Set<string>>();
  const minimumStartGap = config.minRestMinutes ?? (config.gameLength + config.breakLength);

  const checkLink = (
    source: TournamentGame,
    targetId: string | undefined,
    targetSlot: 'team1' | 'team2' | undefined,
    result: 'winner' | 'loser'
  ) => {
    if (!targetId) return;
    if (!targetSlot) {
      addConflict(conflicts, `Match ${source.id} sends its ${result} to ${targetId} without a target slot.`);
      return;
    }
    const target = gameById.get(targetId);
    if (!target) {
      addConflict(conflicts, `Match ${source.id} references missing dependency target ${targetId}.`);
      return;
    }
    if (targetId === source.id) {
      addConflict(conflicts, `Match ${source.id} depends on itself.`);
      return;
    }
    if (!edges.has(source.id)) edges.set(source.id, new Set());
    edges.get(source.id)!.add(targetId);

    const slotKey = `${targetId}:${targetSlot}`;
    const previousSource = occupiedTargetSlots.get(slotKey);
    if (previousSource && previousSource !== source.id) {
      addConflict(conflicts, `Dependency collision: matches ${previousSource} and ${source.id} both feed ${slotKey}.`);
    } else {
      occupiedTargetSlots.set(slotKey, source.id);
    }
    if (!incomingSlots.has(targetId)) incomingSlots.set(targetId, new Set());
    incomingSlots.get(targetId)!.add(targetSlot);

    const sourceStart = parseDateTime(source.date, source.time);
    const targetStart = parseDateTime(target.date, target.time);
    if (sourceStart && targetStart &&
        differenceInMinutes(targetStart, sourceStart) < minimumStartGap) {
      addConflict(conflicts, `Dependency timing: match ${targetId} starts before match ${source.id} can finish and rest.`);
    }
  };

  for (const game of games) {
    checkLink(game, game.winnerTo, game.winnerToSlot, 'winner');
    checkLink(game, game.loserTo, game.loserToSlot, 'loser');
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (gameId: string): boolean => {
    if (visiting.has(gameId)) return true;
    if (visited.has(gameId)) return false;
    visiting.add(gameId);
    for (const targetId of edges.get(gameId) || []) {
      if (visit(targetId)) return true;
    }
    visiting.delete(gameId);
    visited.add(gameId);
    return false;
  };
  for (const gameId of gameById.keys()) {
    if (visit(gameId)) {
      addConflict(conflicts, 'Bracket dependencies contain a cycle.');
      break;
    }
  }

  if (config.tournamentType === 'pool_play_knockout') {
    const poolGames = games.filter(game => String(game.round || '').startsWith('Pool '));
    const knockoutGames = games.filter(game => game.stage === 'Knockout');
    const latestPoolReady = poolGames.reduce((latest, game) => {
      const start = parseDateTime(game.date, game.time);
      return start ? Math.max(latest, addMinutes(start, minimumStartGap).getTime()) : latest;
    }, 0);
    for (const game of knockoutGames) {
      const start = parseDateTime(game.date, game.time);
      if (start && start.getTime() < latestPoolReady) {
        addConflict(conflicts, `Dependency timing: knockout match ${game.id} starts before pool play is complete.`);
      }
    }
  }

  for (const game of games) {
    if (game.isResetMatch) {
      const championship = games.find(candidate =>
        candidate.id !== game.id && candidate.stage === 'GF' && candidate.round === 'Championship'
      );
      if (!championship) {
        addConflict(conflicts, `Reset match ${game.id} has no championship dependency.`);
      } else {
        const sourceStart = parseDateTime(championship.date, championship.time);
        const targetStart = parseDateTime(game.date, game.time);
        if (sourceStart && targetStart &&
            differenceInMinutes(targetStart, sourceStart) < minimumStartGap) {
          addConflict(conflicts, `Dependency timing: reset match ${game.id} starts before the championship can finish and rest.`);
        }
      }
    }

    if (game.isResetMatch || String(game.round || '').startsWith('Pool ')) continue;
    const slots = incomingSlots.get(game.id) || new Set<string>();
    const isPoolSeedEntry = config.tournamentType === 'pool_play_knockout' &&
      game.stage === 'Knockout' && slots.size === 0;
    if (isPoolSeedEntry) continue;
    for (const slot of ['team1', 'team2'] as const) {
      const id = slot === 'team1' ? game.team1Id : game.team2Id;
      const name = slot === 'team1' ? game.team1 : game.team2;
      const unresolved = !concreteTeamId(id) && name?.toUpperCase().includes('TBD');
      const isPoolQualifier = config.tournamentType === 'pool_play_knockout' &&
        game.stage === 'Knockout' && /Pool [A-Z]/.test(name || '');
      if (unresolved && !slots.has(slot) && !isPoolQualifier) {
        addConflict(conflicts, `Match ${game.id} has an unresolved ${slot} slot with no dependency feeder.`);
      }
    }
  }
}

/**
 * Validates a generated schedule for completeness, conflicts, fairness, and
 * tournament dependency integrity.
 */
export function validateSchedule(
  games: TournamentGame[],
  config: IntelligentConfig,
  kind: ScheduleKind = config.tournamentType ? 'tournament' : 'league'
): ValidationReport {
  const conflicts: string[] = [];
  const warnings: string[] = [];
  const teams = configuredTeams(config);
  const knownTeamIds = new Set(teams.map(team => team.id));
  const minimumStartGap = config.minRestMinutes ?? (config.gameLength + config.breakLength);
  const maxGames = config.maxDailyGamesPerTeam ??
    (kind === 'tournament' ? 3 : config.doubleHeaderOption === 'none' ? 1 : 2);
  const teamDailyGames = new Map<string, TournamentGame[]>();
  const fieldOccupancy = new Map<string, TournamentGame[]>();

  validateConfiguration(config, conflicts);
  validateConfiguredWindows(games, config, conflicts);

  for (const game of games) {
    const team1Id = concreteTeamId(game.team1Id);
    const team2Id = concreteTeamId(game.team2Id);
    if (team1Id && team2Id && team1Id === team2Id) {
      addConflict(conflicts, `Match ${game.id} schedules ${game.team1} against itself.`);
    }
    for (const teamId of [team1Id, team2Id]) {
      if (!teamId) continue;
      if (!knownTeamIds.has(teamId)) {
        addConflict(conflicts, `Match ${game.id} references unknown team ${teamId}.`);
      }
      const dayKey = `${cleanDate(game.date)}:${teamId}`;
      if (!teamDailyGames.has(dayKey)) teamDailyGames.set(dayKey, []);
      teamDailyGames.get(dayKey)!.push(game);
    }

    const resource = game.resourceId || game.location;
    if (resource) {
      const fieldKey = `${cleanDate(game.date)}:${resource}`;
      if (!fieldOccupancy.has(fieldKey)) fieldOccupancy.set(fieldKey, []);
      fieldOccupancy.get(fieldKey)!.push(game);
    }
  }

  for (const [key, dailyGames] of teamDailyGames.entries()) {
    if (dailyGames.length > maxGames) {
      addConflict(conflicts, `Team overload: ${key} has ${dailyGames.length} games in one day.`);
    }
    dailyGames.sort((left, right) =>
      (parseDateTime(left.date, left.time)?.getTime() || 0) -
      (parseDateTime(right.date, right.time)?.getTime() || 0));
    for (let index = 0; index < dailyGames.length - 1; index++) {
      const firstStart = parseDateTime(dailyGames[index].date, dailyGames[index].time);
      const secondStart = parseDateTime(dailyGames[index + 1].date, dailyGames[index + 1].time);
      if (!firstStart || !secondStart) continue;
      const gap = differenceInMinutes(secondStart, firstStart);
      if (gap === 0) {
        addConflict(conflicts, `Team double booking: ${key} has two games at ${dailyGames[index].time}.`);
      } else if (gap < minimumStartGap) {
        addConflict(conflicts, `Rest violation: ${key} has less than the required ${minimumStartGap}-minute start gap.`);
      }
    }
    if (kind === 'league' && dailyGames.length === 2) {
      const option = config.doubleHeaderOption || 'none';
      const teamId = key.slice(key.lastIndexOf(':') + 1);
      const opponentIds = dailyGames.map(game =>
        game.team1Id === teamId ? game.team2Id : game.team1Id
      );
      if (option === 'sameTeam' && opponentIds[0] !== opponentIds[1]) {
        addConflict(conflicts, `Double-header opponent rule: ${key} must face the same opponent twice.`);
      }
      if (option === 'differentTeams' && opponentIds[0] === opponentIds[1]) {
        addConflict(conflicts, `Double-header opponent rule: ${key} must face different opponents.`);
      }
    }
  }

  for (const [fieldKey, fieldGames] of fieldOccupancy.entries()) {
    fieldGames.sort((left, right) =>
      (parseDateTime(left.date, left.time)?.getTime() || 0) -
      (parseDateTime(right.date, right.time)?.getTime() || 0));
    for (let index = 0; index < fieldGames.length - 1; index++) {
      const firstStart = parseDateTime(fieldGames[index].date, fieldGames[index].time);
      const secondStart = parseDateTime(fieldGames[index + 1].date, fieldGames[index + 1].time);
      if (firstStart && secondStart && differenceInMinutes(secondStart, firstStart) < config.gameLength) {
        addConflict(conflicts, `Venue conflict: ${fieldKey} has overlapping matches.`);
      }
    }
  }

  const fairness = kind === 'league'
    ? validateRoundRobinFairness(
        games,
        teams,
        new Map(teams.map(team => [team.id, config.gamesPerTeam ?? 10])),
        conflicts,
        warnings
      )
    : validateTournamentCompleteness(games, config, teams, conflicts, warnings);

  if (kind === 'tournament') validateBracketDependencies(games, config, conflicts);

  const fairnessPenalty = fairness.gameCountSpread * 20 +
    Math.max(0, fairness.homeAwayImbalance - 1) * 10 +
    Math.max(0, fairness.opponentSpread - 1) * 10 +
    (fairness.startTimeImbalance > 1 ? 10 : 0) +
    (fairness.fieldImbalance > 1 ? 10 : 0);

  return {
    isValid: conflicts.length === 0,
    conflicts,
    fairnessScore: Math.max(0, 100 - fairnessPenalty),
    warnings,
  };
}

function correctSchedule(
  games: TournamentGame[],
  config: IntelligentConfig,
  attemptsRemaining: number,
  kind: ScheduleKind
): TournamentGame[] {
  if (attemptsRemaining <= 0) return games;
  const report = validateSchedule(games, config, kind);
  if (report.isValid) return games;
  return games.map(game => ({ ...game }));
}

export function generateIntelligentLeagueSchedule(config: IntelligentConfig): {
  games: TournamentGame[];
  report: ValidationReport;
} {
  let games = generateLeagueSchedule(config);
  let report = validateSchedule(games, config, 'league');
  if (!report.isValid) {
    const optimized = correctSchedule(games, config, config.maxCorrectionAttempts || 3, 'league');
    const newReport = validateSchedule(optimized, config, 'league');
    if (newReport.conflicts.length < report.conflicts.length) {
      games = optimized;
      report = newReport;
    }
  }
  return { games, report };
}

export function generateIntelligentTournamentSchedule(config: IntelligentConfig): {
  games: TournamentGame[];
  report: ValidationReport;
} {
  let games = generateTournamentSchedule(config);
  let report = validateSchedule(games, config, 'tournament');
  if (!report.isValid) {
    const optimized = correctSchedule(games, config, config.maxCorrectionAttempts || 3, 'tournament');
    const newReport = validateSchedule(optimized, config, 'tournament');
    if (newReport.conflicts.length < report.conflicts.length) {
      games = optimized;
      report = newReport;
    }
  }
  return { games, report };
}
