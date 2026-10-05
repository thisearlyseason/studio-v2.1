import type { TournamentGame } from '@/components/providers/team-provider';
import {
  analyzeTieredFeasibility,
  generateTieredPreliminaryMatchups,
  TieredScheduleError,
  type TieredPreliminaryInput,
} from './preliminary-scheduler';

export type TieredScheduleInput = TieredPreliminaryInput & {
  minimumRestMinutes: number;
  maximumGamesPerTeamPerDay: number;
};

export type TieredScheduleValidation = { valid: boolean; conflicts: string[] };

export type TieredScheduleHealth = {
  gamesPerTeam: { minimum: number; maximum: number };
  opponentVariety: 'Good' | 'Limited';
  restBalanceMinutes: { minimum: number; maximum: number };
  startTimeDistributionSpread: number;
  fieldDistributionSpread: number;
  hardConstraintViolations: number;
};

export class TieredScheduleAllocationError extends Error {
  constructor(public readonly conflicts: string[]) {
    super(conflicts.join(' '));
    this.name = 'TieredScheduleAllocationError';
  }
}

type Slot = { date: string; minute: number; fieldId: string; fieldName: string };

function parseMinute(value: string): number | null {
  const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : null;
  }
  const twelve = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(value || '').trim());
  if (!twelve) return null;
  let hour = Number(twelve[1]);
  const minute = Number(twelve[2]);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (twelve[3].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (twelve[3].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function renderMinute(value: number): string {
  const hour24 = Math.floor(value / 60);
  const minute = value % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour = hour24 % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function timestamp(date: string, minute: number): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60);
}

function slots(input: TieredScheduleInput): Slot[] {
  const interval = input.gameDurationMinutes + input.transitionMinutes;
  return [...input.dailyWindows]
    .sort((left, right) => left.date.localeCompare(right.date) || left.startTime.localeCompare(right.startTime))
    .flatMap(window => {
      const start = parseMinute(window.startTime);
      const end = parseMinute(window.endTime);
      if (start === null || end === null || end <= start) return [];
      const result: Slot[] = [];
      for (let minute = start; minute + input.gameDurationMinutes <= end; minute += interval) {
        for (const field of input.fields) result.push({ date: window.date, minute, fieldId: field.id, fieldName: field.name });
      }
      return result;
    });
}

function gameStart(game: TournamentGame): number | null {
  const minute = parseMinute(game.time);
  return minute === null || !/^\d{4}-\d{2}-\d{2}$/.test(game.date) ? null : timestamp(game.date, minute);
}

export function validateTieredSchedule(games: TournamentGame[], input: TieredScheduleInput): TieredScheduleValidation {
  const conflicts: string[] = [];
  const add = (message: string) => { if (!conflicts.includes(message)) conflicts.push(message); };
  const teams = new Set(input.teams.map(team => team.id));
  const resources = new Set(input.fields.map(field => field.id));
  const ids = new Set<string>();
  const appearances = new Map(input.teams.map(team => [team.id, 0]));
  const byTeam = new Map<string, TournamentGame[]>();
  const byResource = new Map<string, TournamentGame[]>();

  for (const game of games) {
    if (!game.id || ids.has(game.id)) add(`Duplicate or missing match identity ${game.id || '(empty)'}.`);
    ids.add(game.id);
    if (!game.team1Id || !game.team2Id || !teams.has(game.team1Id) || !teams.has(game.team2Id)) add(`Match ${game.id} references a missing team.`);
    if (game.team1Id && game.team1Id === game.team2Id) add(`Match ${game.id} schedules a team against itself.`);
    if (!game.resourceId || !resources.has(game.resourceId)) add(`Match ${game.id} references an unavailable resource.`);
    if (game.phase !== 'preliminary') add(`Match ${game.id} is not a preliminary game.`);

    const minute = parseMinute(game.time);
    const window = input.dailyWindows.find(candidate => candidate.date === game.date);
    const windowStart = window ? parseMinute(window.startTime) : null;
    const windowEnd = window ? parseMinute(window.endTime) : null;
    if (minute === null || windowStart === null || windowEnd === null || minute < windowStart || minute + input.gameDurationMinutes > windowEnd) {
      add(`Match ${game.id} falls outside an available tournament window.`);
    }

    for (const teamId of [game.team1Id, game.team2Id]) {
      if (!teamId || !teams.has(teamId)) continue;
      appearances.set(teamId, (appearances.get(teamId) || 0) + 1);
      const list = byTeam.get(teamId) || [];
      list.push(game);
      byTeam.set(teamId, list);
    }
    if (game.resourceId) {
      const list = byResource.get(game.resourceId) || [];
      list.push(game);
      byResource.set(game.resourceId, list);
    }
  }

  for (const [teamId, count] of appearances) if (count !== input.gamesPerTeam) {
    add(`Team ${teamId} requires ${input.gamesPerTeam} preliminary games but has ${count}.`);
  }

  const minimumStartGap = (input.gameDurationMinutes + input.minimumRestMinutes) * 60_000;
  for (const [teamId, teamGames] of byTeam) {
    const byDay = new Map<string, number>();
    teamGames.forEach(game => byDay.set(game.date, (byDay.get(game.date) || 0) + 1));
    for (const [date, count] of byDay) if (count > input.maximumGamesPerTeamPerDay) add(`Team ${teamId} exceeds its daily game limit on ${date}.`);
    const starts = teamGames.map(game => ({ game, start: gameStart(game) })).filter(item => item.start !== null).sort((a, b) => a.start! - b.start!);
    for (let index = 1; index < starts.length; index++) if (starts[index].start! - starts[index - 1].start! < minimumStartGap) {
      add(`Team ${teamId} has overlapping games or insufficient rest.`);
    }
  }

  const gameDurationMs = input.gameDurationMinutes * 60_000;
  for (const [resourceId, resourceGames] of byResource) {
    const starts = resourceGames.map(game => ({ game, start: gameStart(game) })).filter(item => item.start !== null).sort((a, b) => a.start! - b.start!);
    for (let index = 1; index < starts.length; index++) if (starts[index].start! - starts[index - 1].start! < gameDurationMs) {
      add(`Resource ${resourceId} contains overlapping games.`);
    }
  }

  return { valid: conflicts.length === 0, conflicts };
}

function health(games: TournamentGame[], input: TieredScheduleInput, validation: TieredScheduleValidation): TieredScheduleHealth {
  const appearances = new Map(input.teams.map(team => [team.id, 0]));
  const pairs = new Map<string, number>();
  const fieldCounts = new Map(input.fields.map(field => [field.id, 0]));
  const startCounts = new Map<string, number>();
  const byTeam = new Map<string, number[]>();
  for (const game of games) {
    if (game.team1Id) appearances.set(game.team1Id, (appearances.get(game.team1Id) || 0) + 1);
    if (game.team2Id) appearances.set(game.team2Id, (appearances.get(game.team2Id) || 0) + 1);
    const pair = [game.team1Id, game.team2Id].sort().join(':');
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
    if (game.resourceId) fieldCounts.set(game.resourceId, (fieldCounts.get(game.resourceId) || 0) + 1);
    startCounts.set(game.time, (startCounts.get(game.time) || 0) + 1);
    const start = gameStart(game);
    if (start !== null) for (const teamId of [game.team1Id, game.team2Id]) if (teamId) {
      const values = byTeam.get(teamId) || [];
      values.push(start);
      byTeam.set(teamId, values);
    }
  }
  const rests: number[] = [];
  for (const values of byTeam.values()) {
    values.sort((a, b) => a - b);
    for (let index = 1; index < values.length; index++) rests.push((values[index] - values[index - 1]) / 60_000 - input.gameDurationMinutes);
  }
  const spread = (values: number[]) => values.length ? Math.max(...values) - Math.min(...values) : 0;
  const counts = [...appearances.values()];
  return {
    gamesPerTeam: { minimum: Math.min(...counts), maximum: Math.max(...counts) },
    opponentVariety: [...pairs.values()].every(count => count === 1) ? 'Good' : 'Limited',
    restBalanceMinutes: { minimum: rests.length ? Math.min(...rests) : 0, maximum: rests.length ? Math.max(...rests) : 0 },
    startTimeDistributionSpread: spread([...startCounts.values()]),
    fieldDistributionSpread: spread([...fieldCounts.values()]),
    hardConstraintViolations: validation.conflicts.length,
  };
}

export function generateTieredPreliminarySchedule(input: TieredScheduleInput) {
  const feasibility = analyzeTieredFeasibility(input);
  if (!feasibility.feasible) throw new TieredScheduleAllocationError(feasibility.conflicts);
  let matchups;
  try {
    matchups = generateTieredPreliminaryMatchups(input);
  } catch (error) {
    if (error instanceof TieredScheduleError) throw new TieredScheduleAllocationError(error.conflicts);
    throw error;
  }

  const availableSlots = slots(input);
  const games: TournamentGame[] = [];
  const usedResources = new Set<string>();
  const startsByTeam = new Map<string, number[]>();
  const dailyByTeam = new Map<string, number>();
  const requiredGap = (input.gameDurationMinutes + input.minimumRestMinutes) * 60_000;

  for (const matchup of matchups) {
    const slot = availableSlots.find(candidate => {
      const resourceKey = `${candidate.date}:${candidate.minute}:${candidate.fieldId}`;
      if (usedResources.has(resourceKey)) return false;
      const start = timestamp(candidate.date, candidate.minute);
      return [matchup.team1Id, matchup.team2Id].every(teamId => {
        if ((dailyByTeam.get(`${candidate.date}:${teamId}`) || 0) >= input.maximumGamesPerTeamPerDay) return false;
        return (startsByTeam.get(teamId) || []).every(previous => Math.abs(start - previous) >= requiredGap);
      });
    });
    if (!slot) throw new TieredScheduleAllocationError([`Unable to allocate ${matchup.team1} vs ${matchup.team2} without violating a hard scheduling constraint.`]);
    const start = timestamp(slot.date, slot.minute);
    usedResources.add(`${slot.date}:${slot.minute}:${slot.fieldId}`);
    for (const teamId of [matchup.team1Id, matchup.team2Id]) {
      const starts = startsByTeam.get(teamId) || [];
      starts.push(start);
      startsByTeam.set(teamId, starts);
      const dailyKey = `${slot.date}:${teamId}`;
      dailyByTeam.set(dailyKey, (dailyByTeam.get(dailyKey) || 0) + 1);
    }
    games.push({
      ...matchup,
      score1: 0,
      score2: 0,
      date: slot.date,
      time: renderMinute(slot.minute),
      location: slot.fieldName,
      resourceId: slot.fieldId,
      isCompleted: false,
    });
  }

  const validation = validateTieredSchedule(games, input);
  if (!validation.valid) throw new TieredScheduleAllocationError(validation.conflicts);
  return { games, feasibility, health: health(games, input, validation), validation };
}
