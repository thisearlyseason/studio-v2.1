import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { validateSchedule } from '@/lib/intelligent-scheduler';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const GAME_ID_PATTERN = /^[A-Za-z0-9_-]{1,180}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GAMES = 1_000;
const BATCH_SIZE = 350;
const GLOBAL_LOCK_MS = 5 * 60 * 1_000;

type LeagueTeam = {
  teamName?: unknown;
  teamLogoUrl?: unknown;
  status?: unknown;
  wins?: unknown;
  losses?: unknown;
  ties?: unknown;
  points?: unknown;
};

type LeagueData = {
  name?: unknown;
  creatorId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  teams?: Record<string, LeagueTeam>;
  memberTeamIds?: unknown;
  schedule?: unknown;
  scorekeeperPin?: unknown;
  schedulerConfig?: {
    gameLength?: unknown;
    breakLength?: unknown;
    gamesPerTeam?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    startTime?: unknown;
    endTime?: unknown;
    playDays?: unknown;
    blackoutDates?: unknown;
    blackoutDaysOfWeek?: unknown;
    doubleHeaderOption?: unknown;
    selectedFields?: unknown;
  };
};

type RawGame = Record<string, unknown>;

export type NormalizedLeagueGame = {
  id: string;
  team1: string;
  team2: string;
  team1Id: string;
  team2Id: string;
  team1LogoUrl?: string;
  team2LogoUrl?: string;
  score1: number;
  score2: number;
  date: string;
  time: string;
  location: string;
  resourceId: string;
  durationMinutes: number;
  isCompleted: boolean;
  isExhibition?: boolean;
  isDisputed?: boolean;
  disputeNotes?: string;
  reportedBy?: string;
  updatedAt: string;
  createdAt?: string;
};

type Interval = {
  date: string;
  startMinute: number;
  endMinute: number;
};

type DeploymentActor = {
  uid: string;
  role?: string;
};

export type LeagueScheduleDeploymentInput = {
  leagueId: string;
  action: 'replace' | 'append';
  actor: DeploymentActor;
  games?: unknown;
  game?: unknown;
};

export type LeagueScheduleGameMutationInput = {
  leagueId: string;
  gameId: string;
  action: 'score' | 'dispute';
  actor: DeploymentActor;
  score1?: unknown;
  score2?: unknown;
  pin?: unknown;
  notes?: unknown;
};

export type LeagueScheduleClearMode = 'clear' | 'archive' | 'purge';

export type LeagueScheduleClearInput = {
  leagueId: string;
  mode: LeagueScheduleClearMode;
  actor: DeploymentActor;
};

export type LeagueTeamRemovalInput = {
  leagueId: string;
  teamId: string;
  actor: DeploymentActor;
};

export type LeagueScheduleConfigurationInput = {
  leagueId: string;
  actor: DeploymentActor;
  config: unknown;
  invalidateExisting?: boolean;
};

export class ScheduleDeploymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly conflicts: string[] = []
  ) {
    super(message);
    this.name = 'ScheduleDeploymentError';
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stableHash(value: string, length = 32): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function cleanDate(value: unknown): string {
  const candidate = text(value, 40).split('T')[0];
  if (!DATE_PATTERN.test(candidate)) return '';
  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? candidate
    : '';
}

function parseTime(value: unknown): number | null {
  const candidate = text(value, 20).toUpperCase().replace(/\s+/g, ' ');
  const match = candidate.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    if (match[3] === 'PM' && hour !== 12) hour += 12;
    if (match[3] === 'AM' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function formatTime(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 24 * 60 ? parsed : fallback;
}

function activeLeagueTeams(league: LeagueData): Map<string, LeagueTeam> {
  return new Map(Object.entries(league.teams || {}).filter(([, team]) =>
    team.status === 'accepted' || team.status === 'assigned'
  ));
}

function selectedResources(league: LeagueData): string[] {
  return Array.isArray(league.schedulerConfig?.selectedFields)
    ? league.schedulerConfig!.selectedFields
      .map(value => text(value, 300))
      .filter(Boolean)
    : [];
}

function displayResourceName(resourceId: string): string {
  const separator = resourceId.indexOf(':');
  return separator >= 0 ? resourceId.slice(separator + 1).trim() : resourceId;
}

function resolveResourceId(
  rawResourceId: unknown,
  location: string,
  resources: string[]
): string {
  const candidate = text(rawResourceId, 300);
  if (resources.length === 0) {
    throw new ScheduleDeploymentError(
      'RESOURCE_CONFIGURATION_REQUIRED',
      'Configure at least one league field before deploying matches.'
    );
  }
  if (candidate && resources.includes(candidate)) return candidate;
  if (candidate) {
    throw new ScheduleDeploymentError(
      'UNCONFIGURED_RESOURCE',
      'Every match must use one of the league fields selected by the organizer.'
    );
  }

  const lookup = (candidate || location).toLocaleLowerCase();
  const matches = resources.filter(resource =>
    displayResourceName(resource).toLocaleLowerCase() === lookup
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new ScheduleDeploymentError(
      'AMBIGUOUS_RESOURCE',
      `The location "${location}" matches multiple configured resources. Select a specific field.`
    );
  }
  if (!location) {
    throw new ScheduleDeploymentError('RESOURCE_REQUIRED', 'Every match requires a field or location.');
  }
  throw new ScheduleDeploymentError(
    'UNCONFIGURED_RESOURCE',
    `The location "${location}" is not one of the league's selected fields.`
  );
}

function manualGameId(leagueId: string, game: RawGame, resourceId: string): string {
  return `manual_${stableHash(JSON.stringify([
    leagueId,
    text(game.team1Id, 200),
    text(game.team2Id, 200),
    cleanDate(game.date),
    parseTime(game.time),
    resourceId,
  ]), 24)}`;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

export async function runRecoverableDeployment<T>(
  apply: () => Promise<T>,
  recover: () => Promise<void>
): Promise<T> {
  try {
    return await apply();
  } catch (error) {
    let recoveryError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await recover();
        recoveryError = undefined;
        break;
      } catch (candidate) {
        recoveryError = candidate;
      }
    }
    if (recoveryError) {
      console.error('[league-schedule] Projection recovery failed:', recoveryError);
      await adminDb.collection('scheduleBookingLocks').doc('global').set({
        recoveryRequired: true,
        recoveryFailedAt: new Date().toISOString(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1_000,
      }, { merge: true }).catch(lockError => {
        console.error('[league-schedule] Failed to preserve recovery lock:', lockError);
      });
      throw new ScheduleDeploymentError(
        'SCHEDULE_RECOVERY_REQUIRED',
        'The schedule could not be updated or restored automatically. Scheduling is locked pending recovery.',
        503
      );
    }
    throw error;
  }
}

function normalizeGame(
  rawValue: unknown,
  leagueId: string,
  league: LeagueData,
  mode: 'replace' | 'existing' | 'manual',
  index: number
): NormalizedLeagueGame {
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    throw new ScheduleDeploymentError('INVALID_GAME', `Match ${index + 1} is not a valid object.`);
  }
  const raw = rawValue as RawGame;
  const teams = activeLeagueTeams(league);
  const team1Id = text(raw.team1Id, 200);
  const team2Id = text(raw.team2Id, 200);
  if (!ID_PATTERN.test(team1Id) || !ID_PATTERN.test(team2Id) || team1Id === team2Id) {
    throw new ScheduleDeploymentError(
      'INVALID_MATCHUP',
      `Match ${index + 1} must contain two different enrolled teams.`
    );
  }
  const team1 = teams.get(team1Id);
  const team2 = teams.get(team2Id);
  if (!team1 || !team2) {
    throw new ScheduleDeploymentError(
      'TEAM_NOT_ENROLLED',
      `Match ${index + 1} contains a team that is not accepted into this league.`
    );
  }

  const date = cleanDate(raw.date);
  const startMinute = parseTime(raw.time);
  const location = text(raw.location, 240);
  if (!date || startMinute === null || !location) {
    throw new ScheduleDeploymentError(
      'INCOMPLETE_GAME',
      `Match ${index + 1} requires a valid date, start time, and location.`
    );
  }
  const configuredDuration = positiveInteger(league.schedulerConfig?.gameLength, 60);
  const submittedDuration = raw.durationMinutes === undefined || raw.durationMinutes === null
    ? configuredDuration
    : positiveInteger(raw.durationMinutes, 0);
  if (submittedDuration !== configuredDuration) {
    throw new ScheduleDeploymentError(
      'DURATION_MISMATCH',
      `Match ${index + 1} must use the configured ${configuredDuration}-minute duration.`
    );
  }
  const durationMinutes = configuredDuration;
  if (startMinute + durationMinutes > 24 * 60) {
    throw new ScheduleDeploymentError(
      'OVERNIGHT_GAME',
      `Match ${index + 1} cannot extend beyond the end of its scheduled date.`
    );
  }

  const resourceId = resolveResourceId(raw.resourceId, location, selectedResources(league));
  let id = text(raw.id, 180);
  if (mode === 'manual') id = manualGameId(leagueId, raw, resourceId);
  if (!GAME_ID_PATTERN.test(id)) {
    throw new ScheduleDeploymentError(
      'INVALID_GAME_ID',
      `Match ${index + 1} requires a stable identifier.`
    );
  }

  const preserveState = mode === 'existing';
  const score1 = preserveState && Number.isFinite(Number(raw.score1)) ? Number(raw.score1) : 0;
  const score2 = preserveState && Number.isFinite(Number(raw.score2)) ? Number(raw.score2) : 0;
  const now = new Date().toISOString();
  return withoutUndefined({
    id,
    team1: text(team1.teamName, 160) || text(raw.team1, 160) || 'Team 1',
    team2: text(team2.teamName, 160) || text(raw.team2, 160) || 'Team 2',
    team1Id,
    team2Id,
    team1LogoUrl: text(team1.teamLogoUrl, 2_000) || undefined,
    team2LogoUrl: text(team2.teamLogoUrl, 2_000) || undefined,
    score1,
    score2,
    date,
    time: formatTime(startMinute),
    location: displayResourceName(resourceId),
    resourceId,
    durationMinutes,
    isCompleted: preserveState && raw.isCompleted === true,
    isExhibition: mode === 'manual' || (preserveState && raw.isExhibition === true) ? true : undefined,
    isDisputed: preserveState && raw.isDisputed === true ? true : undefined,
    disputeNotes: preserveState ? text(raw.disputeNotes, 2_000) || undefined : undefined,
    reportedBy: preserveState ? text(raw.reportedBy, 200) || undefined : undefined,
    updatedAt: now,
    createdAt: preserveState ? text(raw.createdAt, 60) || undefined : now,
  }) as NormalizedLeagueGame;
}

function intervalForGame(game: NormalizedLeagueGame): Interval {
  const startMinute = parseTime(game.time)!;
  return {
    date: game.date,
    startMinute,
    endMinute: startMinute + game.durationMinutes,
  };
}

function overlaps(left: Interval, right: Interval): boolean {
  return left.date === right.date &&
    left.startMinute < right.endMinute &&
    right.startMinute < left.endMinute;
}

export function validateLeagueScheduleGames(games: NormalizedLeagueGame[]): void {
  if (games.length === 0) {
    throw new ScheduleDeploymentError('EMPTY_SCHEDULE', 'A league schedule must contain at least one match.');
  }
  if (games.length > MAX_GAMES) {
    throw new ScheduleDeploymentError('SCHEDULE_TOO_LARGE', `A league schedule cannot exceed ${MAX_GAMES} matches.`);
  }

  const ids = new Set<string>();
  const conflicts: string[] = [];
  for (let leftIndex = 0; leftIndex < games.length; leftIndex++) {
    const left = games[leftIndex];
    if (ids.has(left.id)) conflicts.push(`Duplicate match identifier: ${left.id}.`);
    ids.add(left.id);
    const leftInterval = intervalForGame(left);
    for (let rightIndex = leftIndex + 1; rightIndex < games.length; rightIndex++) {
      const right = games[rightIndex];
      if (!overlaps(leftInterval, intervalForGame(right))) continue;
      const sharedTeam = [left.team1Id, left.team2Id].find(teamId =>
        teamId === right.team1Id || teamId === right.team2Id
      );
      if (sharedTeam) {
        conflicts.push(`${sharedTeam} is assigned to overlapping matches ${left.id} and ${right.id}.`);
      }
      if (left.resourceId === right.resourceId) {
        conflicts.push(`${left.location} is assigned to overlapping matches ${left.id} and ${right.id}.`);
      }
    }
  }
  if (conflicts.length > 0) {
    throw new ScheduleDeploymentError(
      'SCHEDULE_CONFLICT',
      'The schedule contains overlapping teams or fields.',
      409,
      conflicts.slice(0, 25)
    );
  }
}

export function prepareLeagueScheduleForDeployment(
  leagueId: string,
  league: LeagueData,
  action: 'replace' | 'append',
  gamesValue?: unknown,
  gameValue?: unknown
): { games: NormalizedLeagueGame[]; appendedGame?: NormalizedLeagueGame; idempotent: boolean } {
  if (!ID_PATTERN.test(leagueId)) {
    throw new ScheduleDeploymentError('INVALID_LEAGUE', 'Invalid league identifier.');
  }

  if (action === 'replace') {
    if (!Array.isArray(gamesValue)) {
      throw new ScheduleDeploymentError('INVALID_SCHEDULE', 'A complete schedule array is required.');
    }
    if (gamesValue.length > MAX_GAMES) {
      throw new ScheduleDeploymentError('SCHEDULE_TOO_LARGE', `A league schedule cannot exceed ${MAX_GAMES} matches.`);
    }
    const games = gamesValue.map((game, index) =>
      normalizeGame(game, leagueId, league, 'replace', index)
    );
    validateLeagueScheduleGames(games);
    return { games, idempotent: false };
  }

  const existingRaw = Array.isArray(league.schedule) ? league.schedule : [];
  if (existingRaw.length >= MAX_GAMES) {
    throw new ScheduleDeploymentError('SCHEDULE_TOO_LARGE', `A league schedule cannot exceed ${MAX_GAMES} matches.`);
  }
  const existing = existingRaw.map((game, index) =>
    normalizeGame(game, leagueId, league, 'existing', index)
  );
  const appendedGame = normalizeGame(gameValue, leagueId, league, 'manual', existing.length);
  const duplicate = existing.find(game => game.id === appendedGame.id);
  if (duplicate) return { games: existing, appendedGame: duplicate, idempotent: true };
  const games = [...existing, appendedGame];
  validateLeagueScheduleGames(games);
  return { games, appendedGame, idempotent: false };
}

export function validateLeagueDeploymentIntegrity(
  league: LeagueData,
  games: NormalizedLeagueGame[]
): void {
  const scheduler = league.schedulerConfig || {};
  const report = validateSchedule(games, {
    teams: [...activeLeagueTeams(league)].map(([id, team]) => ({
      id,
      name: text(team.teamName, 160) || id,
    })),
    fields: selectedResources(league).map(resourceId => ({
      id: resourceId,
      name: displayResourceName(resourceId),
    })),
    startDate: cleanDate(scheduler.startDate) || cleanDate(league.startDate),
    endDate: cleanDate(scheduler.endDate) || cleanDate(league.endDate),
    startTime: text(scheduler.startTime, 20),
    endTime: text(scheduler.endTime, 20),
    gameLength: positiveInteger(scheduler.gameLength, 60),
    breakLength: Number.isInteger(Number(scheduler.breakLength)) && Number(scheduler.breakLength) >= 0
      ? Number(scheduler.breakLength)
      : 15,
    gamesPerTeam: positiveInteger(scheduler.gamesPerTeam, 10),
    playDays: Array.isArray(scheduler.playDays) ? scheduler.playDays.map(Number) : undefined,
    blackoutDates: Array.isArray(scheduler.blackoutDates) ? scheduler.blackoutDates.map(value => text(value, 40)) : [],
    blackoutDaysOfWeek: Array.isArray(scheduler.blackoutDaysOfWeek)
      ? scheduler.blackoutDaysOfWeek.map(Number)
      : [],
    doubleHeaderOption: scheduler.doubleHeaderOption === 'sameTeam' || scheduler.doubleHeaderOption === 'differentTeams'
      ? scheduler.doubleHeaderOption
      : 'none',
  });
  if (!report.isValid) {
    throw new ScheduleDeploymentError(
      'INVALID_GENERATED_SCHEDULE',
      'The league schedule failed completeness or fairness validation.',
      409,
      report.conflicts.slice(0, 25)
    );
  }
}

export function validateLeagueAppendIntegrity(league: LeagueData, games: NormalizedLeagueGame[]): void {
  const scheduler = league.schedulerConfig || {};
  if (!league.schedulerConfig && !league.startDate && !league.endDate) return;

  const startDate = cleanDate(scheduler.startDate) || cleanDate(league.startDate);
  const endDate = cleanDate(scheduler.endDate) || cleanDate(league.endDate);
  const startMinute = parseTime(text(scheduler.startTime, 20));
  const endMinute = parseTime(text(scheduler.endTime, 20));
  if (!startDate || !endDate || startMinute === null || endMinute === null || endMinute <= startMinute) {
    throw new ScheduleDeploymentError(
      'INVALID_SCHEDULER_CONFIGURATION',
      'The league scheduling window must be complete before adding manual fixtures.'
    );
  }

  if (Array.isArray(scheduler.playDays) && scheduler.playDays.length === 0) {
    throw new ScheduleDeploymentError(
      'INVALID_SCHEDULER_CONFIGURATION',
      'Select at least one league play day before adding manual fixtures.'
    );
  }
  const playDays = Array.isArray(scheduler.playDays)
    ? new Set(scheduler.playDays.map(Number))
    : null;
  const blackoutDates = new Set(
    (Array.isArray(scheduler.blackoutDates) ? scheduler.blackoutDates : []).map(cleanDate)
  );
  const blackoutDays = new Set(
    (Array.isArray(scheduler.blackoutDaysOfWeek) ? scheduler.blackoutDaysOfWeek : []).map(Number)
  );
  const minimumGap = positiveInteger(scheduler.gameLength, 60) +
    (Number.isInteger(Number(scheduler.breakLength)) && Number(scheduler.breakLength) >= 0
      ? Number(scheduler.breakLength)
      : 15);
  const gamesPerTeam = positiveInteger(scheduler.gamesPerTeam, 0);
  const doubleHeaders = scheduler.doubleHeaderOption === 'sameTeam' || scheduler.doubleHeaderOption === 'differentTeams'
    ? scheduler.doubleHeaderOption
    : 'none';
  const teamGames = new Map<string, NormalizedLeagueGame[]>();

  games.forEach(game => {
    if (game.date < startDate || game.date > endDate) {
      throw new ScheduleDeploymentError('OUTSIDE_SEASON', `Match ${game.id} is outside the configured season.`);
    }
    const day = new Date(`${game.date}T12:00:00`).getDay();
    if ((playDays && !playDays.has(day)) || blackoutDates.has(game.date) || blackoutDays.has(day)) {
      throw new ScheduleDeploymentError('DISALLOWED_PLAY_DATE', `Match ${game.id} is scheduled on an unavailable date.`);
    }
    const interval = intervalForGame(game);
    if (interval.startMinute < startMinute || interval.endMinute > endMinute) {
      throw new ScheduleDeploymentError('OUTSIDE_DAILY_WINDOW', `Match ${game.id} falls outside the configured daily time window.`);
    }
    for (const teamId of [game.team1Id, game.team2Id]) {
      if (!teamGames.has(teamId)) teamGames.set(teamId, []);
      teamGames.get(teamId)!.push(game);
    }
  });

  teamGames.forEach((teamSchedule, teamId) => {
    const officialGames = teamSchedule.filter(game => game.isExhibition !== true);
    if (gamesPerTeam > 0 && officialGames.length > gamesPerTeam) {
      throw new ScheduleDeploymentError('GAME_LIMIT_EXCEEDED', `Team ${teamId} exceeds the configured games-per-team limit.`);
    }
    const byDate = new Map<string, NormalizedLeagueGame[]>();
    teamSchedule.forEach(game => {
      if (!byDate.has(game.date)) byDate.set(game.date, []);
      byDate.get(game.date)!.push(game);
    });
    byDate.forEach((dailyGames, date) => {
      dailyGames.sort((left, right) => intervalForGame(left).startMinute - intervalForGame(right).startMinute);
      const maximum = doubleHeaders === 'none' ? 1 : 2;
      if (dailyGames.length > maximum) {
        throw new ScheduleDeploymentError('TEAM_DAILY_LIMIT', `Team ${teamId} exceeds the daily match limit on ${date}.`);
      }
      for (let index = 1; index < dailyGames.length; index++) {
        const previous = intervalForGame(dailyGames[index - 1]);
        const current = intervalForGame(dailyGames[index]);
        if (current.startMinute - previous.startMinute < minimumGap) {
          throw new ScheduleDeploymentError('REST_VIOLATION', `Team ${teamId} does not receive the configured rest interval on ${date}.`);
        }
      }
      if (dailyGames.length === 2) {
        const opponents = dailyGames.map(game => game.team1Id === teamId ? game.team2Id : game.team1Id);
        if (doubleHeaders === 'sameTeam' && opponents[0] !== opponents[1]) {
          throw new ScheduleDeploymentError('DOUBLEHEADER_OPPONENT', `Team ${teamId} may only play the same opponent in a same-team doubleheader.`);
        }
        if (doubleHeaders === 'differentTeams' && opponents[0] === opponents[1]) {
          throw new ScheduleDeploymentError('DOUBLEHEADER_OPPONENT', `Team ${teamId} must play different opponents in this doubleheader.`);
        }
      }
    });
  });
}

export async function acquireScheduleMutationLock(holder: string): Promise<void> {
  const ref = adminDb.collection('scheduleBookingLocks').doc('global');
  const now = Date.now();
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const expiresAt = Number(snapshot.data()?.expiresAt || 0);
    if (snapshot.data()?.recoveryRequired === true) {
      throw new ScheduleDeploymentError(
        'SCHEDULE_RECOVERY_REQUIRED',
        'Scheduling is temporarily locked because a previous deployment requires recovery.',
        503
      );
    }
    if (snapshot.exists && expiresAt > now && snapshot.data()?.holder !== holder) {
      throw new ScheduleDeploymentError(
        'SCHEDULE_DEPLOYMENT_BUSY',
        'Another schedule is currently being deployed. Try again shortly.',
        409
      );
    }
    transaction.set(ref, { holder, expiresAt: now + GLOBAL_LOCK_MS, updatedAt: now, recoveryRequired: false });
  });
}

export async function releaseScheduleMutationLock(holder: string): Promise<void> {
  const ref = adminDb.collection('scheduleBookingLocks').doc('global');
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.holder === holder && snapshot.data()?.recoveryRequired !== true) transaction.delete(ref);
  }).catch(error => {
    console.error('[league-schedule] Failed to release deployment lock:', error);
  });
}

export async function withScheduleMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const holder = randomUUID();
  await acquireScheduleMutationLock(holder);
  try {
    return await operation();
  } finally {
    await releaseScheduleMutationLock(holder);
  }
}

function eventInterval(data: FirebaseFirestore.DocumentData): Interval | null {
  const date = cleanDate(data.date);
  const startMinute = parseTime(data.startTime ?? data.time);
  if (!date || startMinute === null) return null;
  const explicitEnd = parseTime(data.endTime);
  const duration = positiveInteger(data.durationMinutes ?? data.gameLength, 60);
  const endMinute = explicitEnd !== null && explicitEnd > startMinute
    ? explicitEnd
    : Math.min(24 * 60, startMinute + duration);
  return { date, startMinute, endMinute };
}

async function validateExternalConflicts(
  leagueId: string,
  games: NormalizedLeagueGame[],
  teamEventSnapshots: FirebaseFirestore.QuerySnapshot[]
): Promise<void> {
  const sourceId = `league:${leagueId}`;
  const dates = games.map(game => game.date).sort();
  const bookingSnapshot = await adminDb.collection('scheduleBookings')
    .where('date', '>=', dates[0])
    .where('date', '<=', dates[dates.length - 1])
    .get();
  const conflicts: string[] = [];

  for (const game of games) {
    const interval = intervalForGame(game);
    for (const booking of bookingSnapshot.docs) {
      const data = booking.data();
      if (data.sourceId === sourceId) continue;
      const other: Interval = {
        date: cleanDate(data.date),
        startMinute: Number(data.startMinute),
        endMinute: Number(data.endMinute),
      };
      if (!other.date || !Number.isFinite(other.startMinute) ||
          !Number.isFinite(other.endMinute) || !overlaps(interval, other)) continue;
      const bookedTeams = Array.isArray(data.teamIds) ? data.teamIds : [];
      if ([game.team1Id, game.team2Id].some(teamId => bookedTeams.includes(teamId))) {
        conflicts.push(`A team in ${game.id} is already booked at ${game.date} ${game.time}.`);
      }
      if (data.resourceId === game.resourceId) {
        conflicts.push(`${game.location} is already booked at ${game.date} ${game.time}.`);
      }
    }
  }

  for (const snapshot of teamEventSnapshots) {
    for (const event of snapshot.docs) {
      const data = event.data();
      if (data.leagueId === leagueId || event.id.startsWith(`lg_${leagueId}_`)) continue;
      const other = eventInterval(data);
      if (!other) continue;
      const eventTeamId = text(data.teamId, 200) || event.ref.parent.parent?.id || '';
      const eventResourceId = text(data.resourceId, 300);
      const eventLocation = text(data.location, 240).toLocaleLowerCase();
      for (const game of games) {
        if (!overlaps(intervalForGame(game), other)) continue;
        if (eventTeamId && (game.team1Id === eventTeamId || game.team2Id === eventTeamId)) {
          conflicts.push(`${eventTeamId} already has ${text(data.title, 160) || 'an event'} at ${game.date} ${game.time}.`);
        }
        if ((eventResourceId && eventResourceId === game.resourceId) ||
            (eventLocation && eventLocation === game.location.toLocaleLowerCase())) {
          conflicts.push(`${game.location} already hosts ${text(data.title, 160) || 'an event'} at ${game.date} ${game.time}.`);
        }
      }
    }
  }

  if (conflicts.length > 0) {
    throw new ScheduleDeploymentError(
      'EXTERNAL_SCHEDULE_CONFLICT',
      'The schedule conflicts with existing team events or facility bookings.',
      409,
      [...new Set(conflicts)].slice(0, 25)
    );
  }
}

function bookingId(leagueId: string, gameId: string): string {
  return `league_${stableHash(`${leagueId}:${gameId}`, 40)}`;
}

function eventId(leagueId: string, gameId: string): string {
  return `lg_${leagueId}_${gameId}`;
}

function teamEvent(
  leagueId: string,
  leagueName: string,
  game: NormalizedLeagueGame,
  teamId: string,
  now: string
): Record<string, unknown> {
  const isHome = teamId === game.team1Id;
  const myName = isHome ? game.team1 : game.team2;
  const opponentId = isHome ? game.team2Id : game.team1Id;
  const opponentName = isHome ? game.team2 : game.team1;
  const id = eventId(leagueId, game.id);
  return {
    id,
    teamId,
    title: `League Match vs ${opponentName}`,
    eventType: 'game',
    isLeagueGame: true,
    isHome,
    leagueId,
    leagueName,
    sourceType: 'league',
    sourceId: `league:${leagueId}`,
    sourceGameId: game.id,
    date: game.date,
    startTime: game.time,
    endTime: formatTime(parseTime(game.time)! + game.durationMinutes),
    durationMinutes: game.durationMinutes,
    location: game.location,
    resourceId: game.resourceId,
    description: `Official season fixture for ${leagueName}. Matchup: ${myName} vs ${opponentName}`,
    matchTeamIds: [teamId, opponentId],
    createdAt: game.createdAt || now,
    updatedAt: now,
  };
}

async function commitOperations(
  operations: Array<(batch: FirebaseFirestore.WriteBatch) => void>
): Promise<void> {
  for (let index = 0; index < operations.length; index += BATCH_SIZE) {
    const batch = adminDb.batch();
    operations.slice(index, index + BATCH_SIZE).forEach(operation => operation(batch));
    await batch.commit();
  }
}

type ProjectionBackup = {
  ref: FirebaseFirestore.DocumentReference;
  data: FirebaseFirestore.DocumentData;
};

function backupDocuments(
  documents: FirebaseFirestore.QueryDocumentSnapshot[]
): ProjectionBackup[] {
  return documents.map(document => ({ ref: document.ref, data: document.data() }));
}

async function restoreLeagueProjection(
  leagueId: string,
  bookingBackups: ProjectionBackup[],
  eventBackups: ProjectionBackup[]
): Promise<void> {
  const sourceId = `league:${leagueId}`;
  const [currentBookings, currentLeagueEvents, currentSourceEvents] = await Promise.all([
    adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
    adminDb.collectionGroup('events').where('leagueId', '==', leagueId).get(),
    adminDb.collectionGroup('events').where('sourceId', '==', sourceId).get(),
  ]);
  const currentEvents = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  [...currentLeagueEvents.docs, ...currentSourceEvents.docs].forEach(document => {
    if (document.data().sourceId === sourceId || document.id.startsWith(`lg_${leagueId}_`)) {
      currentEvents.set(document.ref.path, document);
    }
  });
  await commitOperations([
    ...currentBookings.docs.map(document =>
      (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
    ),
    ...[...currentEvents.values()].map(document =>
      (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
    ),
    ...bookingBackups.map(backup =>
      (batch: FirebaseFirestore.WriteBatch) => batch.set(backup.ref, backup.data)
    ),
    ...eventBackups.map(backup =>
      (batch: FirebaseFirestore.WriteBatch) => batch.set(backup.ref, backup.data)
    ),
  ]);
}

export function prepareLeagueScheduleClearUpdates(
  mode: LeagueScheduleClearMode,
  actorUid: string,
  now: string
): Record<string, unknown> {
  const updates: Record<string, unknown> = {
    schedule: [],
    scheduleClearedAt: now,
    scheduleClearedBy: actorUid,
    scheduleUpdatedAt: now,
    scheduleUpdatedBy: actorUid,
  };
  if (mode === 'archive') updates.isArchived = true;
  if (mode === 'purge') updates.teams = {};
  return updates;
}

export async function deployLeagueSchedule(input: LeagueScheduleDeploymentInput): Promise<{
  games: NormalizedLeagueGame[];
  appendedGame?: NormalizedLeagueGame;
  idempotent: boolean;
}> {
  if (!ID_PATTERN.test(input.leagueId)) {
    throw new ScheduleDeploymentError('INVALID_LEAGUE', 'Invalid league identifier.');
  }
  const leagueRef = adminDb.collection('leagues').doc(input.leagueId);
  const leagueSnapshot = await leagueRef.get();
  if (!leagueSnapshot.exists) {
    throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
  }
  const initialLeague = leagueSnapshot.data() as LeagueData;
  if (input.actor.role !== 'superadmin' && initialLeague.creatorId !== input.actor.uid) {
    throw new ScheduleDeploymentError(
      'FORBIDDEN',
      'Only the league organizer can deploy this schedule.',
      403
    );
  }

  const holder = randomUUID();
  await acquireScheduleMutationLock(holder);
  try {
    const lockedLeagueSnapshot = await leagueRef.get();
    if (!lockedLeagueSnapshot.exists) {
      throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
    }
    const league = lockedLeagueSnapshot.data() as LeagueData;
    if (input.actor.role !== 'superadmin' && league.creatorId !== input.actor.uid) {
      throw new ScheduleDeploymentError(
        'FORBIDDEN',
        'Only the league organizer can deploy this schedule.',
        403
      );
    }
  const prepared = prepareLeagueScheduleForDeployment(
      input.leagueId,
      league,
      input.action,
      input.games,
      input.game
  );
  if (prepared.idempotent) return prepared;

    if (input.action === 'replace') {
      validateLeagueDeploymentIntegrity(league, prepared.games);
    } else {
      validateLeagueAppendIntegrity(league, prepared.games);
    }

    const oldSchedule = Array.isArray(league.schedule) ? league.schedule as RawGame[] : [];
    const relevantTeamIds = new Set<string>([
      ...prepared.games.flatMap(game => [game.team1Id, game.team2Id]),
      ...oldSchedule.flatMap(game => [text(game.team1Id, 200), text(game.team2Id, 200)]),
      ...(Array.isArray(league.memberTeamIds) ? league.memberTeamIds.map(value => text(value, 200)) : []),
    ].filter(ID_PATTERN.test.bind(ID_PATTERN)));
    const teamEventSnapshots = await Promise.all(
      [...relevantTeamIds].map(teamId =>
        adminDb.collection('teams').doc(teamId).collection('events').get()
      )
    );
    const resourceEventSnapshots = await Promise.all(
      [...new Set(prepared.games.map(game => game.resourceId))].map(resourceId =>
        adminDb.collectionGroup('events').where('resourceId', '==', resourceId).get()
      )
    );
    const locationEventSnapshots = await Promise.all(
      [...new Set(prepared.games.map(game => game.location))].map(location =>
        adminDb.collectionGroup('events').where('location', '==', location).get()
      )
    );
    await validateExternalConflicts(
      input.leagueId,
      prepared.games,
      [...teamEventSnapshots, ...resourceEventSnapshots, ...locationEventSnapshots]
    );

    const sourceId = `league:${input.leagueId}`;
    const [oldBookingSnapshot, staleLeagueEventsSnapshot, staleSourceEventsSnapshot] = await Promise.all([
      adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
      adminDb.collectionGroup('events').where('leagueId', '==', input.leagueId).get(),
      adminDb.collectionGroup('events').where('sourceId', '==', sourceId).get(),
    ]);
    const previousEventDocuments = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...staleLeagueEventsSnapshot.docs, ...staleSourceEventsSnapshot.docs].forEach(document => {
      if (document.data().sourceId === sourceId || document.id.startsWith(`lg_${input.leagueId}_`)) {
        previousEventDocuments.set(document.ref.path, document);
      }
    });
    const desiredBookingPaths = new Set(prepared.games.map(game =>
      adminDb.collection('scheduleBookings').doc(bookingId(input.leagueId, game.id)).path
    ));
    const desiredEventPaths = new Set(prepared.games.flatMap(game =>
      [game.team1Id, game.team2Id].map(teamId =>
        adminDb.collection('teams').doc(teamId).collection('events')
          .doc(eventId(input.leagueId, game.id)).path
      )
    ));
    const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

    oldBookingSnapshot.docs.forEach(document => {
      if (!desiredBookingPaths.has(document.ref.path)) {
        operations.push(batch => batch.delete(document.ref));
      }
    });
    previousEventDocuments.forEach(document => {
      if (document.id.startsWith(`lg_${input.leagueId}_`) && !desiredEventPaths.has(document.ref.path)) {
        operations.push(batch => batch.delete(document.ref));
      }
    });

    const now = new Date().toISOString();
    const leagueName = text(league.name, 160) || 'League';
    prepared.games.forEach(game => {
      const interval = intervalForGame(game);
      const bookingRef = adminDb.collection('scheduleBookings')
        .doc(bookingId(input.leagueId, game.id));
      operations.push(batch => batch.set(bookingRef, {
        id: bookingRef.id,
        sourceType: 'league',
        sourceId,
        sourceGameId: game.id,
        leagueId: input.leagueId,
        teamIds: [game.team1Id, game.team2Id],
        resourceId: game.resourceId,
        location: game.location,
        date: game.date,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
        startTime: game.time,
        durationMinutes: game.durationMinutes,
        updatedAt: now,
      }));
      [game.team1Id, game.team2Id].forEach(teamId => {
        const ref = adminDb.collection('teams').doc(teamId).collection('events')
          .doc(eventId(input.leagueId, game.id));
        operations.push(batch => batch.set(
          ref,
          teamEvent(input.leagueId, leagueName, game, teamId, now)
        ));
      });
    });
    const leagueUpdates: Record<string, unknown> = {
      schedule: prepared.games,
      scheduleUpdatedAt: now,
      scheduleUpdatedBy: input.actor.uid,
    };
    if (input.action === 'replace') {
      activeLeagueTeams(league).forEach((_, teamId) => {
        leagueUpdates[`teams.${teamId}.wins`] = 0;
        leagueUpdates[`teams.${teamId}.losses`] = 0;
        leagueUpdates[`teams.${teamId}.ties`] = 0;
        leagueUpdates[`teams.${teamId}.points`] = 0;
      });
    }
    const bookingBackups = backupDocuments(oldBookingSnapshot.docs);
    const eventBackups = backupDocuments([...previousEventDocuments.values()]);
    await runRecoverableDeployment(
      async () => {
        await commitOperations(operations);
        await leagueRef.update(leagueUpdates);
      },
      async () => {
        await restoreLeagueProjection(input.leagueId, bookingBackups, eventBackups);
      }
    );
    return prepared;
  } finally {
    await releaseScheduleMutationLock(holder);
  }
}

async function mutateLeagueScheduleGameUnlocked(input: LeagueScheduleGameMutationInput): Promise<NormalizedLeagueGame[]> {
  if (!ID_PATTERN.test(input.leagueId) || !GAME_ID_PATTERN.test(input.gameId)) {
    throw new ScheduleDeploymentError('INVALID_GAME', 'Invalid league match identifier.');
  }
  const leagueRef = adminDb.collection('leagues').doc(input.leagueId);
  const now = new Date().toISOString();
  const result = await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(leagueRef);
    if (!snapshot.exists) throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
    const league = snapshot.data() as LeagueData;
    if (input.actor.role !== 'superadmin' && league.creatorId !== input.actor.uid) {
      throw new ScheduleDeploymentError('FORBIDDEN', 'Only the league organizer can update match results.', 403);
    }
    const schedule = Array.isArray(league.schedule)
      ? (league.schedule as RawGame[]).map((game, index) => normalizeGame(game, input.leagueId, league, 'existing', index))
      : [];
    const gameIndex = schedule.findIndex(game => game.id === input.gameId);
    if (gameIndex < 0) throw new ScheduleDeploymentError('GAME_NOT_FOUND', 'League match not found.', 404);

    if (input.action === 'score') {
      const score1 = Number(input.score1);
      const score2 = Number(input.score2);
      if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 9_999 || score2 > 9_999) {
        throw new ScheduleDeploymentError('INVALID_SCORE', 'Scores must be whole numbers between 0 and 9999.');
      }
      const scoringPin = text(league.scorekeeperPin, 100);
      const actorCanBypassPin = input.actor.role === 'admin' || input.actor.role === 'superadmin';
      if (scoringPin && text(input.pin, 100) !== scoringPin && !actorCanBypassPin) {
        throw new ScheduleDeploymentError('INVALID_SCOREKEEPER_PIN', 'Invalid scorekeeper verification PIN.', 403);
      }
      schedule[gameIndex] = {
        ...schedule[gameIndex],
        score1,
        score2,
        isCompleted: true,
        isDisputed: undefined,
        disputeNotes: undefined,
        reportedBy: 'League Office',
        updatedAt: now,
      };
    } else {
      const notes = text(input.notes, 2_000);
      if (!notes) throw new ScheduleDeploymentError('DISPUTE_NOTES_REQUIRED', 'Dispute notes are required.');
      schedule[gameIndex] = {
        ...schedule[gameIndex],
        isDisputed: true,
        disputeNotes: notes,
        updatedAt: now,
      };
    }

    const teams = Object.fromEntries(Object.entries(league.teams || {}).map(([teamId, team]) => [teamId, {
      ...team,
      wins: 0,
      losses: 0,
      ties: 0,
      points: 0,
    }]));
    schedule.forEach(game => {
      if (!game.isCompleted || game.isExhibition) return;
      const team1 = teams[game.team1Id];
      const team2 = teams[game.team2Id];
      if (!team1 || !team2) return;
      if (game.score1 > game.score2) {
        team1.wins = Number(team1.wins || 0) + 1;
        team1.points = Number(team1.points || 0) + 3;
        team2.losses = Number(team2.losses || 0) + 1;
      } else if (game.score2 > game.score1) {
        team2.wins = Number(team2.wins || 0) + 1;
        team2.points = Number(team2.points || 0) + 3;
        team1.losses = Number(team1.losses || 0) + 1;
      } else {
        team1.ties = Number(team1.ties || 0) + 1;
        team1.points = Number(team1.points || 0) + 1;
        team2.ties = Number(team2.ties || 0) + 1;
        team2.points = Number(team2.points || 0) + 1;
      }
    });
    transaction.update(leagueRef, {
      schedule,
      teams,
      scheduleUpdatedAt: now,
      scheduleUpdatedBy: input.actor.uid,
    });
    return { schedule, game: schedule[gameIndex], leagueName: text(league.name, 160) || 'League' };
  });

  if (input.action === 'score') {
    const game = result.game;
    const batch = adminDb.batch();
    const sync = (teamId: string, myScore: number, opponentScore: number, opponent: string, opponentTeamId: string) => {
      const ref = adminDb.collection('teams').doc(teamId).collection('games').doc(`lg_${game.id}`);
      batch.set(ref, withoutUndefined({
        id: ref.id,
        teamId,
        opponent,
        date: game.date,
        myScore,
        opponentScore,
        result: myScore > opponentScore ? 'Win' : myScore < opponentScore ? 'Loss' : 'Tie',
        location: game.location,
        notes: `Official result from ${result.leagueName}`,
        leagueId: input.leagueId,
        leagueGameId: game.id,
        matchTeamIds: [teamId, opponentTeamId],
        updatedAt: now,
      }));
    };
    sync(game.team1Id, game.score1, game.score2, game.team2, game.team2Id);
    sync(game.team2Id, game.score2, game.score1, game.team1, game.team1Id);
    await batch.commit();
  }
  return result.schedule;
}

export async function mutateLeagueScheduleGame(
  input: LeagueScheduleGameMutationInput
): Promise<NormalizedLeagueGame[]> {
  return withScheduleMutationLock(() => mutateLeagueScheduleGameUnlocked(input));
}

export async function removeLeagueTeamMembership(input: LeagueTeamRemovalInput): Promise<void> {
  if (!ID_PATTERN.test(input.leagueId) || !ID_PATTERN.test(input.teamId)) {
    throw new ScheduleDeploymentError('INVALID_LEAGUE_TEAM', 'Invalid league or team identifier.');
  }
  const leagueRef = adminDb.collection('leagues').doc(input.leagueId);
  const holder = randomUUID();
  await acquireScheduleMutationLock(holder);
  try {
    const snapshot = await leagueRef.get();
    if (!snapshot.exists) throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
    const league = snapshot.data() as LeagueData;
    if (input.actor.role !== 'superadmin' && league.creatorId !== input.actor.uid) {
      throw new ScheduleDeploymentError('FORBIDDEN', 'Only the league organizer can remove a team.', 403);
    }

    const sourceId = `league:${input.leagueId}`;
    const [bookings, leagueEvents, sourceEvents] = await Promise.all([
      adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
      adminDb.collectionGroup('events').where('leagueId', '==', input.leagueId).get(),
      adminDb.collectionGroup('events').where('sourceId', '==', sourceId).get(),
    ]);
    const eventDocuments = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...leagueEvents.docs, ...sourceEvents.docs].forEach(document => {
      const data = document.data();
      if (data.sourceId === sourceId || document.id.startsWith(`lg_${input.leagueId}_`)) {
        eventDocuments.set(document.ref.path, document);
      }
    });

    const now = new Date().toISOString();
    const leagueUpdates = {
      ...prepareLeagueScheduleClearUpdates('clear', input.actor.uid, now),
      [`teams.${input.teamId}`]: FieldValue.delete(),
      memberTeamIds: FieldValue.arrayRemove(input.teamId),
      rosterUpdatedAt: now,
      rosterUpdatedBy: input.actor.uid,
    };
    const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [
      ...bookings.docs.map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
      ...[...eventDocuments.values()].map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
      batch => batch.update(leagueRef, leagueUpdates),
    ];
    if (!input.teamId.startsWith('manual_') && !input.teamId.startsWith('recruit_')) {
      operations.push(batch => batch.update(adminDb.collection('teams').doc(input.teamId), {
        [`leagueIds.${input.leagueId}`]: FieldValue.delete(),
      }));
    }
    await commitOperations(operations);
  } finally {
    await releaseScheduleMutationLock(holder);
  }
}

export async function clearLeagueSchedule(input: LeagueScheduleClearInput): Promise<void> {
  if (!ID_PATTERN.test(input.leagueId)) {
    throw new ScheduleDeploymentError('INVALID_LEAGUE', 'Invalid league identifier.');
  }
  if (!['clear', 'archive', 'purge'].includes(input.mode)) {
    throw new ScheduleDeploymentError('INVALID_CLEAR_MODE', 'Invalid league schedule cleanup mode.');
  }

  const leagueRef = adminDb.collection('leagues').doc(input.leagueId);
  const leagueSnapshot = await leagueRef.get();
  if (!leagueSnapshot.exists) {
    throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
  }
  const initialLeague = leagueSnapshot.data() as LeagueData;
  if (input.actor.role !== 'superadmin' && initialLeague.creatorId !== input.actor.uid) {
    throw new ScheduleDeploymentError(
      'FORBIDDEN',
      'Only the league organizer can clear this schedule.',
      403
    );
  }

  const holder = randomUUID();
  await acquireScheduleMutationLock(holder);
  try {
    const lockedLeagueSnapshot = await leagueRef.get();
    if (!lockedLeagueSnapshot.exists) {
      throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
    }
    const league = lockedLeagueSnapshot.data() as LeagueData;
    if (input.actor.role !== 'superadmin' && league.creatorId !== input.actor.uid) {
      throw new ScheduleDeploymentError(
        'FORBIDDEN',
        'Only the league organizer can clear this schedule.',
        403
      );
    }

    const sourceId = `league:${input.leagueId}`;
    const [bookings, leagueEvents, sourceEvents] = await Promise.all([
      adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
      adminDb.collectionGroup('events').where('leagueId', '==', input.leagueId).get(),
      adminDb.collectionGroup('events').where('sourceId', '==', sourceId).get(),
    ]);
    const eventDocuments = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...leagueEvents.docs, ...sourceEvents.docs].forEach(document => {
      const data = document.data();
      if (data.sourceId === sourceId || document.id.startsWith(`lg_${input.leagueId}_`)) {
        eventDocuments.set(document.ref.path, document);
      }
    });
    const deletionOperations = [
      ...bookings.docs.map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
      ...[...eventDocuments.values()].map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
    ];

    const now = new Date().toISOString();
    const bookingBackups = backupDocuments(bookings.docs);
    const eventBackups = backupDocuments([...eventDocuments.values()]);
    await runRecoverableDeployment(
      async () => {
        await commitOperations(deletionOperations);
        await leagueRef.update(prepareLeagueScheduleClearUpdates(input.mode, input.actor.uid, now));
      },
      async () => {
        await restoreLeagueProjection(input.leagueId, bookingBackups, eventBackups);
      }
    );
  } finally {
    await releaseScheduleMutationLock(holder);
  }
}

function normalizeSchedulerConfiguration(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScheduleDeploymentError('INVALID_SCHEDULER_CONFIGURATION', 'A complete scheduler configuration is required.');
  }
  const raw = value as Record<string, unknown>;
  const startDate = cleanDate(raw.startDate);
  const endDate = cleanDate(raw.endDate);
  const startTime = text(raw.startTime, 20);
  const endTime = text(raw.endTime, 20);
  const startMinute = parseTime(startTime);
  const endMinute = parseTime(endTime);
  const gameLength = positiveInteger(raw.gameLength, 0);
  const gamesPerTeam = positiveInteger(raw.gamesPerTeam, 0);
  const breakValue = Number(raw.breakLength);
  const breakLength = Number.isInteger(breakValue) && breakValue >= 0 && breakValue <= 24 * 60
    ? breakValue
    : -1;
  const playDays = Array.isArray(raw.playDays)
    ? [...new Set(raw.playDays.map(Number))].filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const selectedFields = Array.isArray(raw.selectedFields)
    ? [...new Set(raw.selectedFields.map(field => text(field, 300)).filter(Boolean))].slice(0, 100)
    : [];
  if (!startDate || !endDate || startDate > endDate || startMinute === null || endMinute === null ||
      endMinute <= startMinute || !gameLength || breakLength < 0 || !gamesPerTeam ||
      playDays.length === 0 || selectedFields.length === 0) {
    throw new ScheduleDeploymentError(
      'INVALID_SCHEDULER_CONFIGURATION',
      'Use a valid season range, daily window, game count, rest interval, play days, and at least one field.'
    );
  }
  const blackoutDates = Array.isArray(raw.blackoutDates)
    ? [...new Set(raw.blackoutDates.map(cleanDate).filter(Boolean))].slice(0, 500)
    : [];
  const blackoutDaysOfWeek = Array.isArray(raw.blackoutDaysOfWeek)
    ? [...new Set(raw.blackoutDaysOfWeek.map(Number))]
      .filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const doubleHeaderOption = raw.doubleHeaderOption === 'sameTeam' || raw.doubleHeaderOption === 'differentTeams'
    ? raw.doubleHeaderOption
    : 'none';
  return {
    startDate,
    endDate,
    startTime,
    endTime,
    gameLength: String(gameLength),
    breakLength: String(breakLength),
    gamesPerTeam: String(gamesPerTeam),
    playDays,
    selectedFields,
    blackoutDates,
    blackoutDaysOfWeek,
    doubleHeaderOption,
  };
}

export async function configureLeagueSchedule(input: LeagueScheduleConfigurationInput): Promise<void> {
  if (!ID_PATTERN.test(input.leagueId)) {
    throw new ScheduleDeploymentError('INVALID_LEAGUE', 'Invalid league identifier.');
  }
  const schedulerConfig = normalizeSchedulerConfiguration(input.config);
  await withScheduleMutationLock(async () => {
    const leagueRef = adminDb.collection('leagues').doc(input.leagueId);
    const snapshot = await leagueRef.get();
    if (!snapshot.exists) throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
    const league = snapshot.data() as LeagueData;
    if (input.actor.role !== 'superadmin' && league.creatorId !== input.actor.uid) {
      throw new ScheduleDeploymentError('FORBIDDEN', 'Only the league organizer can configure this schedule.', 403);
    }
    const existingSchedule = Array.isArray(league.schedule) ? league.schedule : [];
    if (existingSchedule.length > 0 && input.invalidateExisting !== true) {
      throw new ScheduleDeploymentError(
        'SCHEDULE_CONFIGURATION_CONFLICT',
        'Changing scheduler parameters requires explicit invalidation of the published schedule.',
        409
      );
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      schedulerConfig,
      startDate: schedulerConfig.startDate,
      endDate: schedulerConfig.endDate,
      scheduleUpdatedAt: now,
      scheduleUpdatedBy: input.actor.uid,
    };
    if (existingSchedule.length === 0) {
      await leagueRef.update(updates);
      return;
    }

    const sourceId = `league:${input.leagueId}`;
    const [bookings, leagueEvents, sourceEvents] = await Promise.all([
      adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId).get(),
      adminDb.collectionGroup('events').where('leagueId', '==', input.leagueId).get(),
      adminDb.collectionGroup('events').where('sourceId', '==', sourceId).get(),
    ]);
    const eventDocuments = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    [...leagueEvents.docs, ...sourceEvents.docs].forEach(document => {
      if (document.data().sourceId === sourceId || document.id.startsWith(`lg_${input.leagueId}_`)) {
        eventDocuments.set(document.ref.path, document);
      }
    });
    const deletionOperations = [
      ...bookings.docs.map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
      ...[...eventDocuments.values()].map(document =>
        (batch: FirebaseFirestore.WriteBatch) => batch.delete(document.ref)
      ),
    ];
    updates.schedule = [];
    activeLeagueTeams(league).forEach((_, teamId) => {
      updates[`teams.${teamId}.wins`] = 0;
      updates[`teams.${teamId}.losses`] = 0;
      updates[`teams.${teamId}.ties`] = 0;
      updates[`teams.${teamId}.points`] = 0;
    });
    await runRecoverableDeployment(
      async () => {
        await commitOperations(deletionOperations);
        await leagueRef.update(updates);
      },
      () => restoreLeagueProjection(
        input.leagueId,
        backupDocuments(bookings.docs),
        backupDocuments([...eventDocuments.values()])
      )
    );
  });
}
