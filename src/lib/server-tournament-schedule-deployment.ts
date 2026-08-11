import { createHash, randomUUID } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { validateSchedule } from '@/lib/intelligent-scheduler';
import {
  BracketProgressionError,
  generateTournamentSchedule,
  recordTournamentScore,
} from '@/lib/scheduler-utils';
import { calculateTournamentStandings } from '@/lib/tournament-standings';
import type { TournamentGame } from '@/components/providers/team-provider';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_GAMES = 1_000;
const BATCH_SIZE = 350;
const GLOBAL_LOCK_MS = 5 * 60 * 1_000;

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

function tournamentDefinitionHash(event: RawEvent): string {
  return stableHash(JSON.stringify({
    date: event.date,
    endDate: event.endDate,
    tournamentType: event.tournamentType,
    tournamentTeams: event.tournamentTeams,
    tournamentTeamsData: event.tournamentTeamsData,
    selectedFields: event.selectedFields,
    manualVenue: event.manualVenue,
    gameLength: event.gameLength,
    breakLength: event.breakLength,
    gamesPerTeam: event.gamesPerTeam,
    maxDailyGamesPerTeam: event.maxDailyGamesPerTeam,
    poolCount: event.poolCount,
    advancePerPool: event.advancePerPool,
    dailyWindows: event.dailyWindows,
  }));
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

function eventInterval(data: FirebaseFirestore.DocumentData): Interval | null {
  const date = cleanDate(data.date);
  const startMinute = parseTime(data.startTime ?? data.time);
  if (!date || startMinute === null) return null;
  const explicitEnd = parseTime(data.endTime);
  const duration = positiveInteger(data.durationMinutes ?? data.gameLength, 60);
  return {
    date,
    startMinute,
    endMinute: explicitEnd !== null && explicitEnd > startMinute ? explicitEnd : startMinute + duration,
  };
}

async function isAuthorizedTeamStaff(teamId: string, actor: Actor): Promise<boolean> {
  if (actor.role === 'superadmin') return true;
  const [team, user, directMember] = await Promise.all([
    adminDb.collection('teams').doc(teamId).get(),
    adminDb.collection('users').doc(actor.uid).get(),
    adminDb.collection('teams').doc(teamId).collection('members').doc(actor.uid).get(),
  ]);
  if (!team.exists) return false;
  if (team.data()?.ownerUserId === actor.uid) return true;
  const linkedPlayerId = text(user.data()?.linkedPlayerId, 200);
  const linkedMember = linkedPlayerId
    ? await adminDb.collection('teams').doc(teamId).collection('members').doc(linkedPlayerId).get()
    : null;
  const member = directMember.exists ? directMember.data() : linkedMember?.data();
  return text(member?.role, 80) === 'Admin' || [
    'Coach', 'Head Coach', 'Assistant Coach', 'Team Representative',
    'Athletic Director', 'Director of Athletics', 'Staff', 'Manager', 'Squad Leader',
    'Coach Guest', 'Team Lead', 'Platform Admin',
  ].includes(text(member?.position, 80));
}

async function acquireLock(holder: string): Promise<void> {
  const ref = adminDb.collection('scheduleBookingLocks').doc('global');
  const now = Date.now();
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.recoveryRequired === true) {
      throw new TournamentScheduleDeploymentError(
        'SCHEDULE_RECOVERY_REQUIRED',
        'Scheduling is temporarily locked because a previous deployment requires recovery.',
        503
      );
    }
    if (snapshot.exists && Number(snapshot.data()?.expiresAt || 0) > now && snapshot.data()?.holder !== holder) {
      throw new TournamentScheduleDeploymentError('SCHEDULE_DEPLOYMENT_BUSY', 'Another schedule is being deployed. Try again shortly.', 409);
    }
    transaction.set(ref, { holder, expiresAt: now + GLOBAL_LOCK_MS, updatedAt: now, recoveryRequired: false });
  });
}

async function releaseLock(holder: string): Promise<void> {
  const ref = adminDb.collection('scheduleBookingLocks').doc('global');
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.data()?.holder === holder && snapshot.data()?.recoveryRequired !== true) transaction.delete(ref);
  }).catch(error => console.error('[tournament-schedule] Failed to release lock:', error));
}

async function markLockRecoveryRequired(holder: string, error: unknown): Promise<void> {
  const ref = adminDb.collection('scheduleBookingLocks').doc('global');
  const now = Date.now();
  await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    transaction.set(ref, {
      ...(!snapshot.exists ? { holder } : {}),
      recoveryRequired: true,
      recoveryFailedAt: new Date(now).toISOString(),
      recoveryError: error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown compensation error',
      expiresAt: now + 24 * 60 * 60 * 1_000,
      updatedAt: now,
    }, { merge: true });
  });
}

export async function withTournamentScheduleMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  const holder = randomUUID();
  await acquireLock(holder);
  try {
    return await operation();
  } finally {
    await releaseLock(holder);
  }
}

async function validateExternalConflicts(teamId: string, eventId: string, games: PreparedGame[]): Promise<void> {
  const currentSource = tournamentSourceId(teamId, eventId);
  const dates = games.map(game => game.date).sort();
  const participantIds = [...new Set(games.flatMap(game => game.possibleTeamIds))];
  const resourceIds = [...new Set(games.map(game => game.resourceId))];
  const [bookings, ...teamEventSnapshots] = await Promise.all([
    adminDb.collection('scheduleBookings').where('date', '>=', dates[0]).where('date', '<=', dates.at(-1)!).get(),
    ...participantIds.map(id => adminDb.collection('teams').doc(id).collection('events').get()),
    ...resourceIds.map(resourceId => adminDb.collectionGroup('events').where('resourceId', '==', resourceId).get()),
  ]);
  const conflicts: string[] = [];
  games.forEach(game => {
    const interval = intervalFor(game);
    bookings.docs.forEach(document => {
      const data = document.data();
      if (data.sourceId === currentSource) return;
      const other = { date: cleanDate(data.date), startMinute: Number(data.startMinute), endMinute: Number(data.endMinute) };
      if (!other.date || !Number.isFinite(other.startMinute) || !Number.isFinite(other.endMinute) || !overlaps(interval, other)) return;
      if (data.resourceId === game.resourceId) conflicts.push(`${game.location} is already booked at ${game.date} ${game.time}.`);
      const otherTeams = Array.isArray(data.teamIds) ? data.teamIds : [];
      if (game.possibleTeamIds.some(id => otherTeams.includes(id))) conflicts.push(`A possible participant in ${game.id} is already booked at ${game.date} ${game.time}.`);
    });
    teamEventSnapshots.forEach(snapshot => snapshot.docs.forEach(document => {
      if (document.ref.parent.parent?.id === teamId && document.id === eventId) return;
      const data = document.data();
      if (data.sourceId === currentSource) return;
      const other = eventInterval(data);
      if (!other || !overlaps(interval, other)) return;
      const eventTeamId = text(data.teamId, 200) || document.ref.parent.parent?.id || '';
      if (game.possibleTeamIds.includes(eventTeamId)) conflicts.push(`${eventTeamId} already has ${text(data.title, 160) || 'an event'} at ${game.date} ${game.time}.`);
      if (text(data.resourceId, 400) === game.resourceId) conflicts.push(`${game.location} already hosts ${text(data.title, 160) || 'an event'} at ${game.date} ${game.time}.`);
    }));
  });
  if (conflicts.length) {
    throw new TournamentScheduleDeploymentError(
      'EXTERNAL_SCHEDULE_CONFLICT',
      'The tournament conflicts with another schedule.',
      409,
      [...new Set(conflicts)].slice(0, 25)
    );
  }
}

async function commitOperations(operations: Array<(batch: FirebaseFirestore.WriteBatch) => void>): Promise<void> {
  for (let index = 0; index < operations.length; index += BATCH_SIZE) {
    const batch = adminDb.batch();
    operations.slice(index, index + BATCH_SIZE).forEach(operation => operation(batch));
    await batch.commit();
  }
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

function bookingRestoreOperations(
  previousDocuments: FirebaseFirestore.QueryDocumentSnapshot[],
  touchedRefs: FirebaseFirestore.DocumentReference[]
): Array<(batch: FirebaseFirestore.WriteBatch) => void> {
  const previousByPath = new Map(previousDocuments.map(document => [document.ref.path, document]));
  const refsByPath = new Map(touchedRefs.map(ref => [ref.path, ref]));
  previousDocuments.forEach(document => refsByPath.set(document.ref.path, document.ref));
  return [...refsByPath.values()].map(ref => {
    const previous = previousByPath.get(ref.path);
    return previous
      ? batch => batch.set(ref, previous.data())
      : batch => batch.delete(ref);
  });
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

export async function deployTournamentSchedule(input: {
  teamId: string;
  eventId: string;
  games: unknown;
  actor: Actor;
}): Promise<PreparedGame[]> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  if (!await isAuthorizedTeamStaff(input.teamId, input.actor)) {
    throw new TournamentScheduleDeploymentError('FORBIDDEN', 'Only authorized team staff can deploy this tournament schedule.', 403);
  }
  const eventRef = adminDb.collection('teams').doc(input.teamId).collection('events').doc(input.eventId);
  const holder = randomUUID();
  await acquireLock(holder);
  try {
    const eventSnapshot = await eventRef.get();
    if (!eventSnapshot.exists || eventSnapshot.data()?.isTournament !== true || eventSnapshot.data()?.isArchived === true) {
      throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Active tournament not found.', 404);
    }
    const event = eventSnapshot.data() as RawEvent;
    const expectedDefinitionHash = tournamentDefinitionHash(event);
    const games = prepareTournamentScheduleForDeployment(event, input.games);
    await validateExternalConflicts(input.teamId, input.eventId, games);
    const currentSource = tournamentSourceId(input.teamId, input.eventId);
    const oldBookings = await adminDb.collection('scheduleBookings').where('sourceId', '==', currentSource).get();
    const desired = new Set(games.map(game => adminDb.collection('scheduleBookings').doc(bookingId(input.teamId, input.eventId, game.id)).path));
    const operations: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
    const touchedRefs: FirebaseFirestore.DocumentReference[] = [];
    oldBookings.docs.forEach(document => {
      if (!desired.has(document.ref.path)) {
        touchedRefs.push(document.ref);
        operations.push(batch => batch.delete(document.ref));
      }
    });
    const now = new Date().toISOString();
    games.forEach(game => {
      const interval = intervalFor(game);
      const ref = adminDb.collection('scheduleBookings').doc(bookingId(input.teamId, input.eventId, game.id));
      touchedRefs.push(ref);
      operations.push(batch => batch.set(ref, {
        id: ref.id,
        sourceType: 'tournament',
        sourceId: currentSource,
        sourceGameId: game.id,
        hostTeamId: input.teamId,
        eventId: input.eventId,
        teamIds: game.possibleTeamIds,
        resourceId: game.resourceId,
        location: game.location,
        date: game.date,
        startMinute: interval.startMinute,
        endMinute: interval.endMinute,
        startTime: game.time,
        durationMinutes: game.durationMinutes,
        isConditional: game.isConditional === true,
        updatedAt: now,
      }));
    });
    await executeCompensatedScheduleMutation({
      mutate: () => commitOperations(operations),
      publish: async () => {
        await adminDb.runTransaction(async transaction => {
          const freshEvent = await transaction.get(eventRef);
          if (!freshEvent.exists || freshEvent.data()?.isArchived === true ||
              tournamentDefinitionHash((freshEvent.data() || {}) as RawEvent) !== expectedDefinitionHash) {
            throw new TournamentScheduleDeploymentError(
              'TOURNAMENT_CONFIGURATION_CHANGED',
              'The tournament roster or scheduling configuration changed during publication. Generate the schedule again.',
              409
            );
          }
          transaction.update(eventRef, {
            tournamentGames: games.map(game => Object.fromEntries(
              Object.entries(game).filter(([key]) => key !== 'possibleTeamIds')
            )),
            scheduleUpdatedAt: now,
            scheduleUpdatedBy: input.actor.uid,
          });
        });
      },
      compensate: () => commitOperations(bookingRestoreOperations(oldBookings.docs, touchedRefs)),
      onCompensationFailure: error => markLockRecoveryRequired(holder, error),
    });
    return games;
  } finally {
    await releaseLock(holder);
  }
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

export async function archiveTournamentSchedule(input: {
  teamId: string;
  eventId: string;
  actor: Actor;
}): Promise<void> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  if (!await isAuthorizedTeamStaff(input.teamId, input.actor)) {
    throw new TournamentScheduleDeploymentError('FORBIDDEN', 'Only authorized team staff can archive this tournament.', 403);
  }
  const eventRef = adminDb.collection('teams').doc(input.teamId).collection('events').doc(input.eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists || eventSnapshot.data()?.isTournament !== true) {
    throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
  }

  const holder = randomUUID();
  await acquireLock(holder);
  try {
    const bookings = await adminDb.collection('scheduleBookings')
      .where('sourceId', '==', tournamentSourceId(input.teamId, input.eventId))
      .get();
    await executeCompensatedScheduleMutation({
      mutate: () => commitOperations(bookings.docs.map(document => batch => batch.delete(document.ref))),
      publish: async () => { await eventRef.update({
        isArchived: true,
        scheduleArchivedAt: new Date().toISOString(),
        scheduleArchivedBy: input.actor.uid,
      }); },
      compensate: () => commitOperations(bookingRestoreOperations(bookings.docs, [])),
      onCompensationFailure: error => markLockRecoveryRequired(holder, error),
    });
  } finally {
    await releaseLock(holder);
  }
}

export async function deleteTournament(input: {
  teamId: string;
  eventId: string;
  actor: Actor;
}): Promise<void> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  if (!await isAuthorizedTeamStaff(input.teamId, input.actor)) {
    throw new TournamentScheduleDeploymentError('FORBIDDEN', 'Only authorized team staff can delete this tournament.', 403);
  }
  const eventRef = adminDb.collection('teams').doc(input.teamId).collection('events').doc(input.eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists || eventSnapshot.data()?.isTournament !== true) {
    throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
  }

  const holder = randomUUID();
  await acquireLock(holder);
  try {
    const bookings = await adminDb.collection('scheduleBookings')
      .where('sourceId', '==', tournamentSourceId(input.teamId, input.eventId))
      .get();
    await executeCompensatedScheduleMutation({
      mutate: () => commitOperations(bookings.docs.map(document => batch => batch.delete(document.ref))),
      publish: () => adminDb.recursiveDelete(eventRef),
      compensate: () => commitOperations(bookingRestoreOperations(bookings.docs, [])),
      onCompensationFailure: error => markLockRecoveryRequired(holder, error),
    });
  } finally {
    await releaseLock(holder);
  }
}

export async function clearTournamentSchedule(input: {
  teamId: string;
  eventId: string;
  actor: Actor;
}): Promise<void> {
  if (!ID_PATTERN.test(input.teamId) || !ID_PATTERN.test(input.eventId)) {
    throw new TournamentScheduleDeploymentError('INVALID_TOURNAMENT', 'Invalid tournament identifier.');
  }
  if (!await isAuthorizedTeamStaff(input.teamId, input.actor)) {
    throw new TournamentScheduleDeploymentError('FORBIDDEN', 'Only authorized team staff can clear this tournament schedule.', 403);
  }
  const eventRef = adminDb.collection('teams').doc(input.teamId).collection('events').doc(input.eventId);
  const eventSnapshot = await eventRef.get();
  if (!eventSnapshot.exists || eventSnapshot.data()?.isTournament !== true) {
    throw new TournamentScheduleDeploymentError('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
  }

  const holder = randomUUID();
  await acquireLock(holder);
  try {
    const bookings = await adminDb.collection('scheduleBookings')
      .where('sourceId', '==', tournamentSourceId(input.teamId, input.eventId))
      .get();
    await executeCompensatedScheduleMutation({
      mutate: () => commitOperations(bookings.docs.map(document => batch => batch.delete(document.ref))),
      publish: async () => { await eventRef.update({
        tournamentGames: [],
        scheduleClearedAt: new Date().toISOString(),
        scheduleClearedBy: input.actor.uid,
      }); },
      compensate: () => commitOperations(bookingRestoreOperations(bookings.docs, [])),
      onCompensationFailure: error => markLockRecoveryRequired(holder, error),
    });
  } finally {
    await releaseLock(holder);
  }
}
