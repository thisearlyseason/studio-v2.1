import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { validateSchedule } from '@/lib/intelligent-scheduler';
import {
  BracketProgressionError,
  generateTournamentSchedule,
  recordTournamentScore,
} from '@/lib/scheduler-utils';
import { calculateTournamentStandings } from '@/lib/tournament-standings';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { assertScheduleMutationLock, withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import type { TournamentGame } from '@/components/providers/team-provider';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GAMES = 1_000;

type Actor = { uid: string; email?: string; role?: string };
type RawEvent = Record<string, any>;
type Interval = { date: string; startMinute: number; endMinute: number };
type PreparedGame = TournamentGame & {
  resourceId: string;
  location: string;
  durationMinutes: number;
  possibleTeamIds: string[];
};

export type TournamentScheduleMutationInput = {
  teamId: string;
  eventId: string;
  action: 'score' | 'dispute' | 'assign-referee' | 'clear-referee' | 'seed-pools';
  actor: Actor;
  gameId?: unknown;
  score1?: unknown;
  score2?: unknown;
  explicitWinner?: unknown;
  pin?: unknown;
  notes?: unknown;
  refereeId?: unknown;
};

export type TournamentScheduleCommandInput = {
  teamId: string;
  eventId: string;
  action: 'deploy' | 'clear' | 'add-referee' | 'remove-referee' | 'assign-referee' | 'seed-pools';
  requestId: string;
  expectedVersion: number;
  expectedScheduleVersion: number;
  actor: Actor;
  games?: unknown;
  gameId?: unknown;
  refereeId?: unknown;
  referee?: unknown;
};

export type TournamentScheduleCommandResult = {
  success: true;
  schedule: TournamentGame[];
  refereePool: RawEvent[];
  scheduleVersion: number;
  lifecycleVersion: number;
};

export class TournamentScheduleDeploymentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly conflicts: string[] = []
  ) {
    super(message);
    this.name = 'TournamentScheduleDeploymentError';
  }
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function stableHash(value: string, length = 40): string {
  return createHash('sha256').update(value).digest('hex').slice(0, length);
}

function cleanDate(value: unknown): string {
  const candidate = text(value, 40).split('T')[0];
  if (!DATE_PATTERN.test(candidate)) return '';
  const [year, month, day] = candidate.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
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
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

function formatTime(minuteOfDay: number): string {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 24 * 60 ? parsed : fallback;
}

function intervalFor(game: Pick<PreparedGame, 'date' | 'time' | 'durationMinutes'>): Interval {
  const startMinute = parseTime(game.time)!;
  return { date: game.date, startMinute, endMinute: startMinute + game.durationMinutes };
}

function overlaps(left: Interval, right: Interval): boolean {
  return left.date === right.date && left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

function configuredResourceIds(event: RawEvent): Set<string> {
  const selectedFields = Array.isArray(event.selectedFields) ? event.selectedFields : [];
  const venueKey = text(event.manualVenue || event.location || 'custom', 240).toLowerCase();
  const resources = new Set<string>();
  selectedFields.forEach(fieldValue => {
    const field = typeof fieldValue === 'string'
      ? text(fieldValue, 400)
      : text(fieldValue?.id, 400);
    if (!field) return;
    resources.add(field.includes(':') ? field : `custom:${venueKey}:${field.toLowerCase()}`);
  });
  if (resources.size === 0) {
    throw new TournamentScheduleDeploymentError(
      'INVALID_RESOURCE_CONFIGURATION',
      'The tournament must have at least one configured field resource before a schedule can be deployed.'
    );
  }
  return resources;
}

function bookingId(teamId: string, eventId: string, gameId: string): string {
  return `tournament_${stableHash(`${teamId}:${eventId}:${gameId}`)}`;
}

function tournamentSourceId(teamId: string, eventId: string): string {
  return `tournament:${teamId}:${eventId}`;
}

function sanitizeGame(
  raw: unknown,
  event: RawEvent,
  index: number,
  allowedResourceIds: Set<string>,
  configuredDuration: number
): PreparedGame {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TournamentScheduleDeploymentError('INVALID_GAME', `Match ${index + 1} is invalid.`);
  }
  const game = raw as Record<string, any>;
  const id = text(game.id, 180);
  const date = cleanDate(game.date);
  const startMinute = parseTime(game.time);
  const location = text(game.location, 240);
  const resourceId = text(game.resourceId, 400);
  if (!ID_PATTERN.test(id) || !date || startMinute === null || !location || !resourceId) {
    throw new TournamentScheduleDeploymentError(
      'INCOMPLETE_GAME',
      `Match ${index + 1} requires a stable ID, date, time, location, and field resource.`
    );
  }
  if (!allowedResourceIds.has(resourceId)) {
    throw new TournamentScheduleDeploymentError(
      'UNCONFIGURED_RESOURCE',
      `Match ${id} uses a field resource that is not configured for this tournament.`
    );
  }
  if (game.durationMinutes !== undefined && Number(game.durationMinutes) !== configuredDuration) {
    throw new TournamentScheduleDeploymentError(
      'INVALID_GAME_DURATION',
      `Match ${id} must use the configured ${configuredDuration}-minute duration.`
    );
  }
  if (startMinute + configuredDuration > 24 * 60) {
    throw new TournamentScheduleDeploymentError('OVERNIGHT_GAME', `Match ${id} cannot extend past midnight.`);
  }
  return {
    ...game,
    id,
    team1: text(game.team1, 160) || 'TBD',
    team2: text(game.team2, 160) || 'TBD',
    team1Id: text(game.team1Id, 200) || 'tbd',
    team2Id: text(game.team2Id, 200) || 'tbd',
    score1: Number.isFinite(Number(game.score1)) ? Number(game.score1) : 0,
    score2: Number.isFinite(Number(game.score2)) ? Number(game.score2) : 0,
    date,
    time: formatTime(startMinute),
    location,
    resourceId,
    durationMinutes: configuredDuration,
    possibleTeamIds: [],
    isCompleted: game.isCompleted === true,
    updatedAt: text(game.updatedAt, 60) || new Date().toISOString(),
  } as PreparedGame;
}

function canonicalTournamentSchedule(event: RawEvent): TournamentGame[] {
  const tournamentType = text(event.tournamentType, 40) as
    | 'round_robin'
    | 'pool_play_knockout'
    | 'single_elimination'
    | 'double_elimination';
  try {
    return generateTournamentSchedule({
      teams: Array.isArray(event.tournamentTeamsData) ? event.tournamentTeamsData : [],
      fields: [{ id: 'canonical', name: 'Canonical Field' }],
      startDate: '2000-01-01',
      endDate: '2000-01-01',
      startTime: '00:00',
      endTime: '23:59',
      gameLength: 1,
      breakLength: 0,
      gamesPerTeam: positiveInteger(event.gamesPerTeam, 3),
      maxDailyGamesPerTeam: MAX_GAMES,
      tournamentType,
      poolCount: positiveInteger(event.poolCount, 2),
      advancePerPool: positiveInteger(event.advancePerPool, 2),
    });
  } catch (error) {
    throw new TournamentScheduleDeploymentError(
      'INVALID_TOURNAMENT_FORMAT',
      error instanceof Error ? error.message : 'The tournament format configuration is invalid.'
    );
  }
}

function validateCanonicalTopology(event: RawEvent, games: PreparedGame[]): void {
  const canonical = canonicalTournamentSchedule(event);
  if (canonical.length !== games.length) {
    throw new TournamentScheduleDeploymentError(
      'INVALID_TOURNAMENT_TOPOLOGY',
      `The submitted bracket has ${games.length} matches, but the configured format requires ${canonical.length}.`
    );
  }

  const submittedById = new Map(games.map(game => [game.id, game]));
  const topologyFields = [
    'round', 'stage', 'pool', 'winnerTo', 'winnerToSlot', 'loserTo', 'loserToSlot',
  ] as const;
  for (const expected of canonical) {
    const submitted = submittedById.get(expected.id);
    if (!submitted) {
      throw new TournamentScheduleDeploymentError(
        'INVALID_TOURNAMENT_TOPOLOGY',
        `The submitted bracket is missing canonical match ${expected.id}.`
      );
    }
    for (const field of topologyFields) {
      if (submitted[field] !== expected[field]) {
        throw new TournamentScheduleDeploymentError(
          'INVALID_TOURNAMENT_TOPOLOGY',
          `Match ${expected.id} does not follow the configured tournament bracket.`
        );
      }
    }
    if (Boolean(submitted.isResetMatch) !== Boolean(expected.isResetMatch) ||
        Boolean(submitted.isConditional) !== Boolean(expected.isConditional)) {
      throw new TournamentScheduleDeploymentError(
        'INVALID_TOURNAMENT_TOPOLOGY',
        `Match ${expected.id} has invalid conditional or reset-match behavior.`
      );
    }

    for (const slot of ['team1', 'team2'] as const) {
      const idField = `${slot}Id` as 'team1Id' | 'team2Id';
      if (submitted[idField] !== expected[idField] || submitted[slot] !== expected[slot]) {
        throw new TournamentScheduleDeploymentError(
          'INVALID_TOURNAMENT_ENTRANTS',
          `Match ${expected.id} does not preserve the configured seed placement for ${slot}.`
        );
      }
    }
  }
}

function derivePossibleTeams(games: PreparedGame[]): void {
  const byId = new Map(games.map(game => [game.id, game]));
  const incoming = new Map<string, PreparedGame[]>();
  const poolTeams = new Map<string, Set<string>>();
  games.forEach(game => {
    [game.winnerTo, game.loserTo].filter(Boolean).forEach(targetId => {
      if (!incoming.has(targetId!)) incoming.set(targetId!, []);
      incoming.get(targetId!)!.push(game);
    });
    const poolMatch = String(game.round || '').match(/^Pool ([A-Z])$/);
    if (!poolMatch) return;
    if (!poolTeams.has(poolMatch[1])) poolTeams.set(poolMatch[1], new Set());
    [game.team1Id, game.team2Id]
      .filter(id => id && id !== 'tbd' && id !== 'bye')
      .forEach(id => poolTeams.get(poolMatch[1])!.add(id!));
  });
  const reset = games.find(game => game.isResetMatch);
  const championship = games.find(game =>
    !game.isResetMatch && game.stage === 'GF' && game.round === 'Championship'
  );
  if (reset && championship) {
    if (!incoming.has(reset.id)) incoming.set(reset.id, []);
    incoming.get(reset.id)!.push(championship);
  }
  const memo = new Map<string, Set<string>>();
  const resolve = (game: PreparedGame, trail = new Set<string>()): Set<string> => {
    if (memo.has(game.id)) return memo.get(game.id)!;
    if (trail.has(game.id)) {
      throw new TournamentScheduleDeploymentError('BRACKET_CYCLE', 'The tournament bracket contains a dependency cycle.');
    }
    const possible = new Set<string>();
    [game.team1Id, game.team2Id]
      .filter(id => id && id !== 'tbd' && id !== 'bye')
      .forEach(id => possible.add(id!));
    for (const match of `${game.team1} ${game.team2}`.matchAll(/Pool ([A-Z])/g)) {
      poolTeams.get(match[1])?.forEach(id => possible.add(id));
    }
    (incoming.get(game.id) || []).forEach(source => {
      resolve(source, new Set(trail).add(game.id)).forEach(id => possible.add(id));
    });
    memo.set(game.id, possible);
    return possible;
  };
  games.forEach(game => {
    for (const target of [game.winnerTo, game.loserTo].filter(Boolean)) {
      if (!byId.has(target!)) {
        throw new TournamentScheduleDeploymentError('DANGLING_BRACKET_LINK', `Match ${game.id} links to a missing bracket match.`);
      }
    }
    game.possibleTeamIds = [...resolve(game)].sort();
  });
}

function validateInternalConflicts(games: PreparedGame[], maxDailyGamesPerTeam: number): void {
  if (games.length === 0 || games.length > MAX_GAMES) {
    throw new TournamentScheduleDeploymentError('INVALID_SCHEDULE_SIZE', `A tournament schedule must contain 1-${MAX_GAMES} matches.`);
  }
  const ids = new Set<string>();
  const dailyPossibleAppearances = new Map<string, number>();
  const conflicts: string[] = [];
  games.forEach((left, leftIndex) => {
    if (ids.has(left.id)) conflicts.push(`Duplicate match identifier: ${left.id}.`);
    ids.add(left.id);
    left.possibleTeamIds.forEach(teamId => {
      const key = `${left.date}:${teamId}`;
      const count = (dailyPossibleAppearances.get(key) || 0) + 1;
      dailyPossibleAppearances.set(key, count);
      if (count > maxDailyGamesPerTeam) {
        conflicts.push(`Possible participant ${teamId} can appear in ${count} matches on ${left.date}, exceeding the daily limit of ${maxDailyGamesPerTeam}.`);
      }
    });
    games.slice(leftIndex + 1).forEach(right => {
      if (!overlaps(intervalFor(left), intervalFor(right))) return;
      if (left.resourceId === right.resourceId) conflicts.push(`${left.location} is double-booked by ${left.id} and ${right.id}.`);
      if (left.possibleTeamIds.some(id => right.possibleTeamIds.includes(id))) {
        conflicts.push(`A possible participant is double-booked by ${left.id} and ${right.id}.`);
      }
    });
  });
  if (conflicts.length) {
    throw new TournamentScheduleDeploymentError(
      'SCHEDULE_CONFLICT',
      'The tournament contains scheduling conflicts.',
      409,
      [...new Set(conflicts)].slice(0, 25)
    );
  }
}

export function isAuthorizedTeamStaffFromRecords({
  teamId,
  actor,
  team,
  directMember,
}: {
  teamId: string;
  actor: Actor;
  team?: FirebaseFirestore.DocumentData | null;
  directMember?: FirebaseFirestore.DocumentData | null;
  // Extra records are deliberately ignored. A linked player membership grants
  // youth member access, never staff authority.
  user?: FirebaseFirestore.DocumentData | null;
  linkedMember?: FirebaseFirestore.DocumentData | null;
}): boolean {
  if (actor.role === 'superadmin') return true;
  if (!team) return false;
  if (team.ownerUserId === actor.uid) return true;
  if (!directMember || directMember.status === 'removed' || directMember.isDeleted === true) return false;
  if (text(directMember.userId ?? actor.uid, 200) !== actor.uid) return false;
  if (text(directMember.teamId ?? teamId, 200) !== teamId) return false;
  return text(directMember.role, 80) === 'Admin' || [
    'Coach', 'Head Coach', 'Assistant Coach', 'Team Representative',
    'Athletic Director', 'Director of Athletics', 'Staff', 'Manager', 'Squad Leader',
    'Coach Guest', 'Team Lead', 'Platform Admin',
  ].includes(text(directMember.position, 80));
}

async function isAuthorizedTeamStaff(teamId: string, actor: Actor): Promise<boolean> {
  const [team, directMember] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    adminDb.collection('teams').doc(teamId).collection('members').doc(actor.uid).get(),
  ]);
  return isAuthorizedTeamStaffFromRecords({
    teamId,
    actor,
    team: team.exists ? team.data() : null,
    directMember: directMember.exists ? directMember.data() : null,
  });
}

export async function withTournamentScheduleMutationLock<T>(operation: (holder: string) => Promise<T>): Promise<T> {
  return withScheduleMutationLock(operation);
}

export async function executeCompensatedScheduleMutation(input: {
  mutate: () => Promise<void>;
  publish: () => Promise<void>;
  compensate: () => Promise<void>;
  onCompensationFailure: (error: unknown) => Promise<void>;
}): Promise<void> {
  try {
    await input.mutate();
    await input.publish();
  } catch (error) {
    let compensationError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await input.compensate();
        compensationError = undefined;
        break;
      } catch (candidate) {
        compensationError = candidate;
      }
    }
    if (compensationError) {
      await input.onCompensationFailure(compensationError);
      throw new TournamentScheduleDeploymentError(
        'SCHEDULE_RECOVERY_REQUIRED',
        'The tournament schedule could not be published or restored automatically. Scheduling is locked pending recovery.',
        503
      );
    }
    throw error;
  }
}

export function prepareTournamentScheduleForDeployment(
  eventValue: unknown,
  gamesValue: unknown
): PreparedGame[] {
  if (!eventValue || typeof eventValue !== 'object' || Array.isArray(eventValue)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Tournament configuration is invalid.');
  }
  if (!Array.isArray(gamesValue)) {
    throw new TournamentScheduleDeploymentError('INVALID_SCHEDULE', 'A complete tournament schedule is required.');
  }
  const event = eventValue as RawEvent;
  const allowedResourceIds = configuredResourceIds(event);
  const configuredDuration = positiveInteger(event.gameLength, 60);
  const maxDailyGamesPerTeam = positiveInteger(event.maxDailyGamesPerTeam, 3);
  const games = gamesValue.map((game, index) =>
    sanitizeGame(game, event, index, allowedResourceIds, configuredDuration));
  validateCanonicalTopology(event, games);
  derivePossibleTeams(games);
  validateInternalConflicts(games, maxDailyGamesPerTeam);
  const report = validateSchedule(games, {
    teams: Array.isArray(event.tournamentTeamsData) ? event.tournamentTeamsData : [],
    fields: [...new Map(games.map(game => [game.resourceId, { id: game.resourceId, name: game.location }])).values()],
    startDate: cleanDate(event.date),
    endDate: cleanDate(event.endDate) || cleanDate(event.date),
    startTime: '00:00',
    endTime: '23:59',
    gameLength: positiveInteger(event.gameLength, 60),
    breakLength: Number.isInteger(Number(event.breakLength)) && Number(event.breakLength) >= 0 ? Number(event.breakLength) : 15,
    gamesPerTeam: positiveInteger(event.gamesPerTeam, 3),
    maxDailyGamesPerTeam,
    tournamentType: event.tournamentType || 'round_robin',
    dailyWindows: Array.isArray(event.dailyWindows) ? event.dailyWindows : [],
    poolCount: positiveInteger(event.poolCount, 2),
    advancePerPool: positiveInteger(event.advancePerPool, 2),
    doubleHeaderOption: 'differentTeams',
  });
  if (!report.isValid) {
    throw new TournamentScheduleDeploymentError(
      'INVALID_GENERATED_SCHEDULE',
      'The generated tournament failed integrity validation.',
      409,
      report.conflicts.slice(0, 25)
    );
  }
  return games;
}

function refereeKey(referee: RawEvent): string {
  return text(referee.email, 320).toLowerCase();
}

function activeReferee(pool: RawEvent[], refereeIdValue: unknown): RawEvent {
  const refereeId = text(refereeIdValue, 180);
  const referee = pool.find((candidate: RawEvent) => text(candidate.id, 180) === refereeId);
  if (!referee) throw new TournamentScheduleDeploymentError('REFEREE_NOT_FOUND', 'Tournament referee not found.', 404);
  if (referee.status === 'removed' || referee.isDeleted === true) {
    throw new TournamentScheduleDeploymentError('REFEREE_INELIGIBLE', 'This referee is not eligible for assignment.', 403);
  }
  return referee;
}

function publicReferee(referee: RawEvent): RawEvent {
  return {
    id: text(referee.id, 180),
    name: text(referee.name, 160),
    certLevel: text(referee.certLevel, 120) || null,
    status: referee.status === 'removed' ? 'removed' : 'active',
  };
}

function refereeInterval(game: TournamentGame, event: RawEvent): Interval {
  const date = cleanDate(game.date);
  const startMinute = parseTime(game.time);
  const durationMinutes = positiveInteger((game as RawEvent).durationMinutes ?? event.gameLength, 60);
  if (!date || startMinute === null || startMinute + durationMinutes > 24 * 60) {
    throw new TournamentScheduleDeploymentError('INVALID_GAME_INTERVAL', 'The selected match has an invalid date or time.');
  }
  return { date, startMinute, endMinute: startMinute + durationMinutes };
}

function assertTournamentVersions(event: RawEvent, expectedVersion: number, expectedScheduleVersion: number): void {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 ||
      !Number.isSafeInteger(expectedScheduleVersion) || expectedScheduleVersion < 0) {
    throw new TournamentScheduleDeploymentError('INVALID_VERSION', 'Current Tournament lifecycle and schedule versions are required.');
  }
  if ((event.lifecycleVersion ?? 0) !== expectedVersion || (event.scheduleVersion ?? 0) !== expectedScheduleVersion) {
    throw new TournamentScheduleDeploymentError('TOURNAMENT_VERSION_CONFLICT', 'The Tournament changed. Refresh before retrying.', 409);
  }
  if (event.isArchived === true || event.isTournament !== true || event.is_active === false || event.isActive === false || event.status === 'cancelled') {
    throw new TournamentScheduleDeploymentError('TOURNAMENT_LIFECYCLE_STATE_CONFLICT', 'This Tournament is not active.', 409);
  }
}

function sanitizedReferee(value: unknown, id: string): RawEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TournamentScheduleDeploymentError('INVALID_REFEREE', 'Referee details are required.');
  }
  const raw = value as RawEvent;
  const name = text(raw.name, 160);
  const email = text(raw.email, 320).toLowerCase();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new TournamentScheduleDeploymentError('INVALID_REFEREE', 'A referee name and valid email are required.');
  }
  return {
    id,
    name,
    email,
    phone: text(raw.phone, 80) || null,
    certLevel: text(raw.certLevel, 120) || null,
    status: 'active',
  };
}

function seedTournamentPools(event: RawEvent, games: TournamentGame[], now: string): TournamentGame[] {
  if (event.tournamentType !== 'pool_play_knockout') {
    throw new TournamentScheduleDeploymentError('POOL_QUALIFICATION_ONLY', 'Only pool-play tournaments can seed qualifiers.');
  }
  const poolGames = games.filter(game => Number.isInteger(game.pool));
  const knockoutGames = games.filter(game => game.stage === 'Knockout');
  if (!poolGames.length || poolGames.some(game => !game.isCompleted || game.isDisputed)) {
    throw new TournamentScheduleDeploymentError('POOL_PLAY_INCOMPLETE', 'Every pool match requires an undisputed final score before seeding qualifiers.', 409);
  }
  if (knockoutGames.some(game => game.isCompleted || !['tbd', 'bye'].includes(String(game.team1Id)) || !['tbd', 'bye'].includes(String(game.team2Id)))) {
    throw new TournamentScheduleDeploymentError('POOL_RESULTS_LOCKED', 'The knockout bracket has already been seeded or played.', 409);
  }
  const teams = Array.isArray(event.tournamentTeamsData) ? event.tournamentTeamsData : [];
  const poolIndices = [...new Set(poolGames.map(game => Number(game.pool)))].sort((a, b) => a - b);
  const advancePerPool = positiveInteger(event.advancePerPool, 2);
  const qualifiers = new Map<string, RawEvent>();
  for (const poolIndex of poolIndices) {
    const standings = calculateTournamentStandings(teams, games, poolIndex);
    if (standings.length < advancePerPool) {
      throw new TournamentScheduleDeploymentError('POOL_QUALIFIERS_MISSING', 'A pool does not contain enough eligible qualifiers.', 409);
    }
    standings.slice(0, advancePerPool).forEach((team, index) => qualifiers.set(`${String.fromCharCode(65 + poolIndex)}:${index + 1}`, team));
  }
  let seededSlots = 0;
  const result = games.map(game => {
    if (game.stage !== 'Knockout') return game;
    const update: RawEvent = {};
    for (const slot of ['team1', 'team2'] as const) {
      const match = String(game[slot] || '').match(/Pool ([A-Z])\s*-\s*(\d+)(?:st|nd|rd|th)/i);
      if (!match) continue;
      const qualifier = qualifiers.get(`${match[1].toUpperCase()}:${Number(match[2])}`);
      if (!qualifier) throw new TournamentScheduleDeploymentError('POOL_QUALIFIERS_MISSING', 'A bracket qualifier could not be resolved.', 409);
      update[slot] = qualifier.name;
      update[`${slot}Id`] = qualifier.id;
      update[`${slot}LogoUrl`] = teams.find((candidate: RawEvent) => candidate.id === qualifier.id)?.logoUrl;
      seededSlots++;
    }
    return Object.keys(update).length ? { ...game, ...update, updatedAt: now } : game;
  });
  if (!seededSlots) throw new TournamentScheduleDeploymentError('QUALIFIER_PLACEHOLDERS_MISSING', 'No pool qualifier placeholders were found.', 409);
  return result;
}

async function executeRecoverableTournamentClear(
  input: TournamentScheduleCommandInput,
  identity: ReturnType<typeof canonicalCompetitionRequest>,
  teamRef: FirebaseFirestore.DocumentReference,
  eventRef: FirebaseFirestore.DocumentReference,
): Promise<TournamentScheduleCommandResult> {
  const operationRef = adminDb.collection('competitionOperations').doc(identity.operationId);
  const progressRef = adminDb.collection('competitionOperationProgress').doc(identity.operationId);
  const assignmentQuery = () => adminDb.collection('tournamentRefereeAssignments').where('teamId', '==', input.teamId).where('eventId', '==', input.eventId).limit(200);
  const bookingQuery = () => adminDb.collection('scheduleBookings').where('sourceId', '==', tournamentSourceId(input.teamId, input.eventId)).limit(200);
  return withTournamentScheduleMutationLock(async holder => {
    const replay = await adminDb.runTransaction(async transaction => {
      await assertScheduleMutationLock(transaction, holder);
      await resolveCompetitionAuthority({ transaction, actorUid: input.actor.uid, actorRole: input.actor.role, teamId: input.teamId, domain: 'tournament' });
      const [eventSnapshot, receipt, progress] = await Promise.all([
        transaction.get(eventRef), transaction.get(operationRef), transaction.get(progressRef),
      ]);
      if (receipt.exists) {
        const data = receipt.data() || {};
        if (data.payloadHash !== identity.payloadHash || data.actorUid !== input.actor.uid || data.requestId !== identity.requestId) throw new Error('Request collision.');
        return data.result as TournamentScheduleCommandResult;
      }
      if (!eventSnapshot.exists) throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
      const event = eventSnapshot.data() as RawEvent;
      if (event.teamId && event.teamId !== input.teamId) throw new TournamentScheduleDeploymentError('TOURNAMENT_TENANT_MISMATCH', 'Tournament tenant mismatch.', 403);
      assertTournamentVersions(event, input.expectedVersion, input.expectedScheduleVersion);
      if ((event.tournamentGames || []).some((game: TournamentGame) => game.isCompleted || game.isDisputed)) throw new TournamentScheduleDeploymentError('SCHEDULE_DEPENDENCY_CONFLICT', 'A Tournament with results or disputes cannot be cleared.', 409);
      const progressData = progress.data() || {};
      if (progress.exists && (progressData.payloadHash !== identity.payloadHash || progressData.actorUid !== input.actor.uid || progressData.requestId !== identity.requestId)) throw new Error('Request collision.');
      const marker = event.scheduleClearOperationId;
      if (marker && marker !== identity.operationId) throw new TournamentScheduleDeploymentError('SCHEDULE_CLEAR_IN_PROGRESS', 'Another schedule clear must finish before this Tournament can change.', 409);
      if (!progress.exists) transaction.create(progressRef, { requestId: identity.requestId, payloadHash: identity.payloadHash, actorUid: input.actor.uid, teamId: input.teamId, eventId: input.eventId, state: 'clearing', deletedCount: 0, createdAt: new Date().toISOString() });
      transaction.update(eventRef, { scheduleClearOperationId: identity.operationId });
      return null;
    });
    if (replay) return replay;

    let deletedCount = 0;
    for (let pass = 0; pass < 10_000; pass++) {
      const [bookings, assignments] = await Promise.all([bookingQuery().get(), assignmentQuery().get()]);
      const documents = [...bookings.docs, ...assignments.docs];
      if (!documents.length) break;
      const batch = adminDb.batch();
      for (const document of documents) batch.delete(document.ref);
      deletedCount += documents.length;
      batch.set(progressRef, { requestId: identity.requestId, payloadHash: identity.payloadHash, actorUid: input.actor.uid, teamId: input.teamId, eventId: input.eventId, state: 'clearing', deletedCount, updatedAt: new Date().toISOString() });
      await batch.commit();
      if (pass === 9_999) throw new TournamentScheduleDeploymentError('SCHEDULE_CLEAR_INCOMPLETE', 'Schedule cleanup did not converge. Retry the same request.', 503);
    }

    return runCompetitionOperation({
      actorUid: input.actor.uid,
      identity,
      authorizeTransaction: async transaction => {
        await assertScheduleMutationLock(transaction, holder);
        await resolveCompetitionAuthority({ transaction, actorUid: input.actor.uid, actorRole: input.actor.role, teamId: input.teamId, domain: 'tournament' });
      },
    }, async ({ transaction }) => {
      const [eventSnapshot, remainingBookings, remainingAssignments] = await Promise.all([
        transaction.get(eventRef), transaction.get(bookingQuery().limit(1)), transaction.get(assignmentQuery().limit(1)),
      ]);
      if (!eventSnapshot.exists) throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
      const event = eventSnapshot.data() as RawEvent;
      assertTournamentVersions(event, input.expectedVersion, input.expectedScheduleVersion);
      if (event.scheduleClearOperationId !== identity.operationId || !remainingBookings.empty || !remainingAssignments.empty) throw new TournamentScheduleDeploymentError('SCHEDULE_CLEAR_INCOMPLETE', 'Schedule cleanup is incomplete. Retry the same request.', 503);
      if ((event.tournamentGames || []).some((game: TournamentGame) => game.isCompleted || game.isDisputed)) throw new TournamentScheduleDeploymentError('SCHEDULE_DEPENDENCY_CONFLICT', 'A Tournament with results or disputes cannot be cleared.', 409);
      const profiles = await transaction.get(adminDb.collection('tournamentReferees').where('eventId', '==', input.eventId));
      const ownedProfiles = profiles.docs.filter(document => document.data().teamId === input.teamId);
      const existingIds = new Set(ownedProfiles.map(document => text(document.data().refereeId, 180)));
      const pool: RawEvent[] = Array.isArray(event.refereePool) ? event.refereePool : [];
      if (pool.length > 200) throw new TournamentScheduleDeploymentError('REFEREE_POOL_TOO_LARGE', 'The referee pool exceeds the supported migration limit.', 409);
      const now = new Date().toISOString();
      for (const legacy of pool) {
        const refereeId = text(legacy.id, 180);
        if (!refereeId || existingIds.has(refereeId) || !refereeKey(legacy)) continue;
        transaction.set(adminDb.collection('tournamentReferees').doc(`trp_${stableHash(`${input.teamId}:${input.eventId}:${refereeId}`)}`), { ...legacy, id: refereeId, teamId: input.teamId, eventId: input.eventId, refereeId, updatedAt: now });
      }
      const nextScheduleVersion = input.expectedScheduleVersion + 1;
      transaction.update(eventRef, { tournamentGames: [], refereePool: pool.map(publicReferee), scheduleVersion: nextScheduleVersion, scheduleUpdatedAt: now, scheduleUpdatedBy: input.actor.uid, scheduleStatus: 'pending', bracketStatus: 'pending', deploymentStatus: 'undeployed', deploymentError: '', scheduleClearedAt: now, scheduleClearedBy: input.actor.uid, scheduleClearOperationId: FieldValue.delete() });
      transaction.create(eventRef.collection('scheduleAudits').doc(identity.operationId), { operationId: identity.operationId, requestId: identity.requestId, action: 'clear', actorUid: input.actor.uid, lifecycleVersion: input.expectedVersion, scheduleVersion: nextScheduleVersion, createdAt: now });
      transaction.delete(progressRef);
      return { success: true, schedule: [], refereePool: pool.map(publicReferee), scheduleVersion: nextScheduleVersion, lifecycleVersion: input.expectedVersion };
    });
  });
}

export async function executeTournamentScheduleCommand(input: TournamentScheduleCommandInput): Promise<TournamentScheduleCommandResult> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  const payload = {
    action: input.action,
    teamId: input.teamId,
    eventId: input.eventId,
    expectedVersion: input.expectedVersion,
    expectedScheduleVersion: input.expectedScheduleVersion,
    ...(input.games !== undefined ? { games: input.games } : {}),
    ...(input.gameId !== undefined ? { gameId: input.gameId } : {}),
    ...(input.refereeId !== undefined ? { refereeId: input.refereeId } : {}),
    ...(input.referee !== undefined ? { referee: input.referee } : {}),
  };
  const identity = canonicalCompetitionRequest({
    requestId: input.requestId,
    tenantId: input.teamId,
    kind: 'tournament-schedule',
    payload,
  });
  const teamRef = adminDb.collection('teams').doc(input.teamId);
  const eventRef = teamRef.collection('events').doc(input.eventId);
  if (input.action === 'clear') return executeRecoverableTournamentClear(input, identity, teamRef, eventRef);
  return withTournamentScheduleMutationLock(holder => runCompetitionOperation({
    actorUid: input.actor.uid,
    identity,
    authorizeTransaction: async transaction => {
      await assertScheduleMutationLock(transaction, holder);
      await resolveCompetitionAuthority({
        transaction,
        actorUid: input.actor.uid,
        actorRole: input.actor.role,
        teamId: input.teamId,
        domain: 'tournament',
      });
    },
  }, async ({ transaction }) => {
    const eventSnapshot = await transaction.get(eventRef);
    if (!eventSnapshot.exists) throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
    const event = eventSnapshot.data() as RawEvent;
    if (event.teamId && event.teamId !== input.teamId) throw new TournamentScheduleDeploymentError('TOURNAMENT_TENANT_MISMATCH', 'Tournament tenant mismatch.', 403);
    assertTournamentVersions(event, input.expectedVersion, input.expectedScheduleVersion);
    if (event.scheduleClearOperationId) throw new TournamentScheduleDeploymentError('SCHEDULE_CLEAR_IN_PROGRESS', 'A schedule clear must finish before this Tournament can change.', 409);

    let games: TournamentGame[] = Array.isArray(event.tournamentGames) ? event.tournamentGames.map((game: TournamentGame) => ({ ...game })) : [];
    let pool: RawEvent[] = Array.isArray(event.refereePool) ? event.refereePool.map((item: RawEvent) => ({ ...item })) : [];
    const now = new Date().toISOString();
    const nextScheduleVersion = input.expectedScheduleVersion + 1;
    const assignmentCollection = adminDb.collection('tournamentRefereeAssignments');
    const ownedAssignments = await transaction.get(assignmentCollection.where('eventId', '==', input.eventId));
    const privateRefereeCollection = adminDb.collection('tournamentReferees');
    const refereeProfiles = await transaction.get(privateRefereeCollection.where('eventId', '==', input.eventId));
    const ownedRefereeProfiles = refereeProfiles.docs.filter(document => document.data().teamId === input.teamId);
    const privateProfilesByReferee = new Map(ownedRefereeProfiles.map(document => [text(document.data().refereeId, 180), document.data()]));
    let migratedProfileCount = 0;
    if (pool.length > 200) throw new TournamentScheduleDeploymentError('REFEREE_POOL_TOO_LARGE', 'The referee pool exceeds the supported migration limit.', 409);
    for (const legacy of pool) {
      const refereeId = text(legacy.id, 180);
      if (!refereeId || privateProfilesByReferee.has(refereeId) || !refereeKey(legacy) || (input.action === 'remove-referee' && refereeId === text(input.refereeId, 180))) continue;
      const profile = { ...legacy, id: refereeId, teamId: input.teamId, eventId: input.eventId, refereeId, updatedAt: now };
      transaction.set(privateRefereeCollection.doc(`trp_${stableHash(`${input.teamId}:${input.eventId}:${refereeId}`)}`), profile);
      privateProfilesByReferee.set(refereeId, profile);
      migratedProfileCount++;
    }
    const teamSnapshot = await transaction.get(teamRef);
    if (event.tournamentType !== 'round_robin' && input.action !== 'clear' && teamSnapshot.data()?.isPro !== true) {
      throw new TournamentScheduleDeploymentError('ADVANCED_TOURNAMENT_ENTITLEMENT_REQUIRED', 'This squad plan supports basic Round Robin tournaments only.', 403);
    }
    if (['assign-referee', 'remove-referee'].includes(input.action)) {
      const authoritativeAssignments = new Map<string, RawEvent>(
        ownedAssignments.docs
          .filter(document => document.data().teamId === input.teamId)
          .map(document => [document.data().gameId, document.data()]),
      );
      games = games.map(game => {
        const assignment = authoritativeAssignments.get(game.id);
        return assignment && assignment.refereeId === game.refereeId
          ? game
          : { ...game, refereeId: undefined, refereeName: undefined };
      });
    }
    const sourceId = tournamentSourceId(input.teamId, input.eventId);
    const oldBookings = input.action === 'deploy' || input.action === 'clear'
      ? await transaction.get(adminDb.collection('scheduleBookings').where('sourceId', '==', sourceId))
      : null;

    let assignmentRef: FirebaseFirestore.DocumentReference | null = null;
    let assignmentData: RawEvent | null = null;
    let conflictingAssignments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    if (input.action === 'assign-referee' && text(input.refereeId, 180)) {
      const referee = activeReferee(pool, input.refereeId);
      const profile = privateProfilesByReferee.get(text(referee.id, 180)) || referee;
      const key = refereeKey(profile);
      if (!key) throw new TournamentScheduleDeploymentError('REFEREE_INELIGIBLE', 'This referee profile is incomplete.', 403);
      const target = games.find(game => game.id === text(input.gameId, 180));
      if (!target) throw new TournamentScheduleDeploymentError('GAME_NOT_FOUND', 'Tournament match not found.', 404);
      const interval = refereeInterval(target, event);
      const assignments = await transaction.get(assignmentCollection.where('refereeKey', '==', key));
      conflictingAssignments = assignments.docs.filter(document => {
        const data = document.data();
        return !(data.teamId === input.teamId && data.eventId === input.eventId && data.gameId === target.id) &&
          overlaps(interval, { date: cleanDate(data.date), startMinute: Number(data.startMinute), endMinute: Number(data.endMinute) });
      });
      if (conflictingAssignments.length) {
        throw new TournamentScheduleDeploymentError('REFEREE_CONFLICT', 'The referee is assigned to an overlapping match.', 409);
      }
      assignmentRef = assignmentCollection.doc(`tr_${stableHash(`${input.teamId}:${input.eventId}:${target.id}`)}`);
      assignmentData = {
        teamId: input.teamId, eventId: input.eventId, gameId: target.id,
        refereeId: text(referee.id, 180), refereeKey: key, refereeName: text(referee.name, 160),
        date: interval.date, startMinute: interval.startMinute, endMinute: interval.endMinute,
        scheduleVersion: nextScheduleVersion, updatedAt: now,
      };
    }

    if (input.action === 'deploy') {
      if (games.some(game => game.isCompleted || game.isDisputed || game.refereeId) || ownedAssignments.docs.some(document => document.data().teamId === input.teamId)) {
        throw new TournamentScheduleDeploymentError('SCHEDULE_DEPENDENCY_CONFLICT', 'Completed, disputed, or assigned matches must be resolved before redeployment.', 409);
      }
      const prepared = prepareTournamentScheduleForDeployment(event, input.games);
      const dates = [...new Set(prepared.map(game => game.date))];
      const externalBookings = [] as FirebaseFirestore.QueryDocumentSnapshot[];
      for (const date of dates) {
        const snapshot = await transaction.get(adminDb.collection('scheduleBookings').where('date', '==', date));
        externalBookings.push(...snapshot.docs.filter(document => document.data().sourceId !== sourceId));
      }
      const conflicts: string[] = [];
      for (const game of prepared) for (const document of externalBookings) {
        const data = document.data();
        const other = { date: cleanDate(data.date), startMinute: Number(data.startMinute), endMinute: Number(data.endMinute) };
        if (!other.date || !overlaps(intervalFor(game), other)) continue;
        if (data.resourceId === game.resourceId || game.possibleTeamIds.some(id => Array.isArray(data.teamIds) && data.teamIds.includes(id))) conflicts.push(`${game.id} overlaps an existing schedule booking.`);
      }
      if (conflicts.length) throw new TournamentScheduleDeploymentError('EXTERNAL_SCHEDULE_CONFLICT', 'The tournament conflicts with another schedule.', 409, conflicts.slice(0, 25));
      if (prepared.length + (oldBookings?.size || 0) + migratedProfileCount + 4 > 450) throw new TournamentScheduleDeploymentError('SCHEDULE_TOO_LARGE', 'This schedule exceeds the atomic deployment budget.', 409);
      games = prepared.map(game => Object.fromEntries(Object.entries(game).filter(([key]) => key !== 'possibleTeamIds')) as TournamentGame);
      for (const document of oldBookings?.docs || []) transaction.delete(document.ref);
      for (const game of prepared) {
        const interval = intervalFor(game);
        const ref = adminDb.collection('scheduleBookings').doc(bookingId(input.teamId, input.eventId, game.id));
        transaction.set(ref, { id: ref.id, sourceType: 'tournament', sourceId, sourceGameId: game.id, hostTeamId: input.teamId, eventId: input.eventId,
          teamIds: game.possibleTeamIds, resourceId: game.resourceId, location: game.location, date: game.date,
          startMinute: interval.startMinute, endMinute: interval.endMinute, startTime: game.time, durationMinutes: game.durationMinutes,
          isConditional: game.isConditional === true, updatedAt: now });
      }
    } else if (input.action === 'clear') {
      if (games.some(game => game.isCompleted || game.isDisputed)) throw new TournamentScheduleDeploymentError('SCHEDULE_DEPENDENCY_CONFLICT', 'A Tournament with results or disputes cannot be cleared.', 409);
      games = [];
      for (const document of oldBookings?.docs || []) transaction.delete(document.ref);
      for (const document of ownedAssignments.docs) if (document.data().teamId === input.teamId) transaction.delete(document.ref);
    } else if (input.action === 'add-referee') {
      const added = sanitizedReferee(input.referee, `ref_${identity.operationId.slice(12, 36)}`);
      if (pool.some(candidate => refereeKey(candidate) === refereeKey(added)) || ownedRefereeProfiles.some(document => refereeKey(document.data()) === refereeKey(added))) {
        throw new TournamentScheduleDeploymentError('REFEREE_EXISTS', 'This referee is already in the Tournament pool.', 409);
      }
      pool.push(publicReferee(added));
      transaction.create(privateRefereeCollection.doc(`trp_${stableHash(`${input.teamId}:${input.eventId}:${added.id}`)}`), {
        ...added, teamId: input.teamId, eventId: input.eventId, refereeId: added.id, createdAt: now, updatedAt: now,
      });
    } else if (input.action === 'remove-referee') {
      const removed = activeReferee(pool, input.refereeId);
      pool = pool.filter(candidate => text(candidate.id, 180) !== text(removed.id, 180));
      games = games.map(game => game.refereeId === removed.id ? { ...game, refereeId: undefined, refereeName: undefined, updatedAt: now } : game);
      for (const document of ownedAssignments.docs) if (document.data().teamId === input.teamId && document.data().refereeId === removed.id) transaction.delete(document.ref);
      for (const document of ownedRefereeProfiles) if (document.data().refereeId === removed.id) transaction.delete(document.ref);
    } else if (input.action === 'assign-referee') {
      const gameId = text(input.gameId, 180);
      const index = games.findIndex(game => game.id === gameId);
      if (index < 0) throw new TournamentScheduleDeploymentError('GAME_NOT_FOUND', 'Tournament match not found.', 404);
      const previousAssignment = ownedAssignments.docs.find(document => document.data().teamId === input.teamId && document.data().gameId === gameId);
      if (previousAssignment) transaction.delete(previousAssignment.ref);
      if (assignmentData && assignmentRef) {
        games[index] = { ...games[index], refereeId: assignmentData.refereeId, refereeName: assignmentData.refereeName, updatedAt: now };
        transaction.set(assignmentRef, assignmentData);
      } else {
        games[index] = { ...games[index], refereeId: undefined, refereeName: undefined, updatedAt: now };
      }
    } else {
      games = seedTournamentPools(event, games, now);
    }

    games = sanitizeTournamentGames(games);
    // The event document is team-readable. Keep contact details exclusively in
    // the server-only profile collection and repair legacy projections whenever
    // any schedule command touches the event.
    pool = pool.map(publicReferee);
    transaction.update(eventRef, {
      tournamentGames: games,
      refereePool: pool,
      scheduleVersion: nextScheduleVersion,
      scheduleUpdatedAt: now,
      scheduleUpdatedBy: input.actor.uid,
      ...(input.action === 'deploy' ? { setupStatus: 'complete', scheduleStatus: 'ready', bracketStatus: 'ready', deploymentStatus: 'deployed', deploymentError: '' } : {}),
      ...(input.action === 'clear' ? { scheduleStatus: 'pending', bracketStatus: 'pending', deploymentStatus: 'undeployed', deploymentError: '', scheduleClearedAt: now, scheduleClearedBy: input.actor.uid } : {}),
    });
    transaction.create(eventRef.collection('scheduleAudits').doc(identity.operationId), {
      operationId: identity.operationId,
      requestId: identity.requestId,
      action: input.action,
      actorUid: input.actor.uid,
      lifecycleVersion: input.expectedVersion,
      scheduleVersion: nextScheduleVersion,
      createdAt: now,
    });
    return { success: true, schedule: games, refereePool: pool, scheduleVersion: nextScheduleVersion, lifecycleVersion: input.expectedVersion };
  }));
}

function sanitizeTournamentGames(games: TournamentGame[]): TournamentGame[] {
  return games.map(game => Object.fromEntries(
    Object.entries(game).filter(([, value]) => value !== undefined)
  ) as TournamentGame);
}

async function mutateTournamentScheduleUnlocked(input: TournamentScheduleMutationInput): Promise<TournamentGame[]> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  if (!await isAuthorizedTeamStaff(input.teamId, input.actor)) {
    throw new TournamentScheduleDeploymentError('FORBIDDEN', 'Only authorized team staff can update this tournament.', 403);
  }
  const eventRef = adminDb.collection('teams').doc(input.teamId).collection('events').doc(input.eventId);
  return adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(eventRef);
    if (!snapshot.exists || snapshot.data()?.isTournament !== true || snapshot.data()?.isArchived === true) {
      throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Active tournament not found.', 404);
    }
    const event = snapshot.data() as RawEvent;
    let games = Array.isArray(event.tournamentGames)
      ? event.tournamentGames.map((game: TournamentGame) => ({ ...game }))
      : [];
    const now = new Date().toISOString();

    if (input.action === 'score') {
      const gameId = text(input.gameId, 180);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new TournamentScheduleDeploymentError('GAME_NOT_FOUND', 'Tournament match not found.', 404);
      const score1 = Number(input.score1);
      const score2 = Number(input.score2);
      if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 999 || score2 > 999) {
        throw new TournamentScheduleDeploymentError('INVALID_SCORE', 'Scores must be whole numbers between 0 and 999.');
      }
      const scoringCode = text(event.scoringCode, 100);
      const actorCanBypassPin = input.actor.role === 'admin' || input.actor.role === 'superadmin';
      if (scoringCode && text(input.pin, 100) !== scoringCode && !actorCanBypassPin) {
        throw new TournamentScheduleDeploymentError('INVALID_SCOREKEEPER_PIN', 'Invalid scorekeeper code.', 403);
      }
      try {
        const explicitWinner = input.explicitWinner === 'team1' || input.explicitWinner === 'team2'
          ? input.explicitWinner
          : undefined;
        games = recordTournamentScore(games, gameId, score1, score2, explicitWinner)
          .map(game => game.id === gameId ? { ...game, updatedAt: now } : game);
      } catch (error) {
        if (error instanceof BracketProgressionError) {
          throw new TournamentScheduleDeploymentError(error.code, error.message, 409);
        }
        throw error;
      }
    } else if (input.action === 'dispute') {
      const gameId = text(input.gameId, 180);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new TournamentScheduleDeploymentError('GAME_NOT_FOUND', 'Tournament match not found.', 404);
      const notes = text(input.notes, 2_000);
      if (!notes) throw new TournamentScheduleDeploymentError('DISPUTE_NOTES_REQUIRED', 'Dispute notes are required.');
      games[gameIndex] = { ...games[gameIndex], isDisputed: true, disputeNotes: notes, updatedAt: now };
    } else if (input.action === 'assign-referee') {
      const gameId = text(input.gameId, 180);
      const gameIndex = games.findIndex(game => game.id === gameId);
      if (gameIndex < 0) throw new TournamentScheduleDeploymentError('GAME_NOT_FOUND', 'Tournament match not found.', 404);
      const refereeId = text(input.refereeId, 180);
      const referee = (Array.isArray(event.refereePool) ? event.refereePool : [])
        .find((candidate: RawEvent) => text(candidate.id, 180) === refereeId);
      if (refereeId && !referee) throw new TournamentScheduleDeploymentError('REFEREE_NOT_FOUND', 'Tournament referee not found.', 404);
      if (referee) {
        const target = games[gameIndex];
        const targetStart = Date.parse(`${cleanDate(target.date)}T00:00:00`) + (parseTime(target.time) || 0) * 60_000;
        const conflict = games.find((game, index) => {
          if (index === gameIndex || game.refereeId !== refereeId || cleanDate(game.date) !== cleanDate(target.date)) return false;
          const gameStart = Date.parse(`${cleanDate(game.date)}T00:00:00`) + (parseTime(game.time) || 0) * 60_000;
          return Math.abs(gameStart - targetStart) < 90 * 60_000;
        });
        if (conflict) {
          throw new TournamentScheduleDeploymentError('REFEREE_CONFLICT', 'The referee is already assigned to another nearby match.', 409);
        }
      }
      games[gameIndex] = {
        ...games[gameIndex],
        refereeId: referee ? text(referee.id, 180) : undefined,
        refereeName: referee ? text(referee.name, 160) : undefined,
        updatedAt: now,
      };
    } else if (input.action === 'clear-referee') {
      const refereeId = text(input.refereeId, 180);
      if (!refereeId) throw new TournamentScheduleDeploymentError('REFEREE_REQUIRED', 'A referee identifier is required.');
      games = games.map(game => game.refereeId === refereeId
        ? { ...game, refereeId: undefined, refereeName: undefined, updatedAt: now }
        : game);
    } else {
      if (event.tournamentType !== 'pool_play_knockout') {
        throw new TournamentScheduleDeploymentError('POOL_QUALIFICATION_ONLY', 'Only pool-play tournaments can seed qualifiers.');
      }
      const poolGames = games.filter(game => Number.isInteger(game.pool));
      if (poolGames.length === 0 || poolGames.some(game => !game.isCompleted)) {
        throw new TournamentScheduleDeploymentError('POOL_PLAY_INCOMPLETE', 'Every pool match requires a final score before seeding qualifiers.', 409);
      }
      const teams = Array.isArray(event.tournamentTeamsData) ? event.tournamentTeamsData : [];
      const poolIndices = [...new Set(poolGames.map(game => Number(game.pool)))].sort((left, right) => left - right);
      const advancePerPool = positiveInteger(event.advancePerPool, 2);
      const qualifiers = new Map<string, { id: string; name: string; logoUrl?: string }>();
      poolIndices.forEach(poolIndex => {
        calculateTournamentStandings(teams, games, poolIndex).slice(0, advancePerPool).forEach((team, index) => {
          qualifiers.set(`${String.fromCharCode(65 + poolIndex)}:${index + 1}`, {
            id: team.id,
            name: team.name,
            logoUrl: teams.find((candidate: RawEvent) => candidate.id === team.id)?.logoUrl,
          });
        });
      });
      let seededSlots = 0;
      games = games.map(game => {
        if (game.stage !== 'Knockout') return game;
        const update: Partial<TournamentGame> = {};
        for (const slot of ['team1', 'team2'] as const) {
          const match = String(game[slot] || '').match(/Pool ([A-Z])\s*-\s*(\d+)(?:st|nd|rd|th)/i);
          if (!match) continue;
          const qualifier = qualifiers.get(`${match[1].toUpperCase()}:${Number(match[2])}`);
          if (!qualifier) continue;
          update[slot] = qualifier.name;
          update[`${slot}Id` as 'team1Id' | 'team2Id'] = qualifier.id;
          update[`${slot}LogoUrl` as 'team1LogoUrl' | 'team2LogoUrl'] = qualifier.logoUrl;
          seededSlots++;
        }
        return Object.keys(update).length > 0 ? { ...game, ...update, updatedAt: now } : game;
      });
      if (seededSlots === 0) {
        throw new TournamentScheduleDeploymentError('QUALIFIER_PLACEHOLDERS_MISSING', 'No pool qualifier placeholders were found.', 409);
      }
    }

    games = sanitizeTournamentGames(games);
    transaction.update(eventRef, {
      tournamentGames: games,
      scheduleUpdatedAt: now,
      scheduleUpdatedBy: input.actor.uid,
    });
    return games;
  });
}

export async function mutateTournamentSchedule(input: TournamentScheduleMutationInput): Promise<TournamentGame[]> {
  return withTournamentScheduleMutationLock(() => mutateTournamentScheduleUnlocked(input));
}
