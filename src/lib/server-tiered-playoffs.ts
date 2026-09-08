import type { DocumentData } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { assertScheduleMutationLock, withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import { calculateTieredStandings, resolveTieredRanking } from '@/lib/tiered-playoffs/standings';
import { allocateTieredDivisions, applyTieredSeedOverride, resetTieredSeedOverrides, tieredStandingsFingerprint } from '@/lib/tiered-playoffs/seeding';
import { generateTieredDivisionBracket, scheduleTieredPlayoffBrackets, validateTieredBrackets } from '@/lib/tiered-playoffs/brackets';
import { validateTieredPlayoffsConfig, type TieredPlayoffsConfig } from '@/lib/tiered-playoffs/types';
import { recordTournamentScore } from '@/lib/scheduler-utils';

const ID = /^[A-Za-z0-9_-]{1,200}$/;
const ACTIONS = new Set(['preview-seeding', 'apply-seed-override', 'reset-seeding', 'lock-seeding', 'generate-brackets', 'publish-playoffs', 'withdraw-team', 'disqualify-team']);

export class TieredPlayoffsCommandError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
    this.name = 'TieredPlayoffsCommandError';
  }
}

export type TieredPlayoffsCommandInput = {
  action: string;
  requestId: string;
  teamId: string;
  eventId: string;
  expectedVersion: number;
  expectedScheduleVersion: number;
  payload: Record<string, unknown>;
  actor: { uid: string; role?: string; email?: string };
};

function fail(code: string, message: string, status = 400): never {
  throw new TieredPlayoffsCommandError(code, message, status);
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function currentEvent(source: DocumentData, input: TieredPlayoffsCommandInput): TieredPlayoffsConfig {
  if (source.teamId && source.teamId !== input.teamId) fail('TOURNAMENT_TENANT_MISMATCH', 'Tournament tenant mismatch.', 403);
  if (source.isTournament !== true || source.tournamentType !== 'tiered_playoffs') fail('INVALID_TIERED_TOURNAMENT', 'Tiered Playoffs tournament not found.', 404);
  if (source.isArchived === true || source.isDeleted === true || source.is_active === false || source.isActive === false || source.status === 'cancelled') {
    fail('TOURNAMENT_INACTIVE', 'This Tiered Playoffs tournament is not active.', 409);
  }
  if (source.lifecycleVersion !== input.expectedVersion || source.scheduleVersion !== input.expectedScheduleVersion) {
    fail('TOURNAMENT_VERSION_CONFLICT', 'The Tournament changed. Refresh before retrying.', 409);
  }
  const teams = Array.isArray(source.tournamentTeamsData) ? source.tournamentTeamsData : [];
  const eligible = teams.filter((team: DocumentData) => team.eligibleForPlayoffs !== false && !['withdrawn', 'disqualified'].includes(String(team.tieredStatus || '')));
  const validation = validateTieredPlayoffsConfig(source.tieredPlayoffs, eligible.length);
  if (!validation.valid) fail('INVALID_TIERED_CONFIGURATION', validation.errors[0] || 'Tiered Playoffs configuration is invalid.');
  return source.tieredPlayoffs as TieredPlayoffsConfig;
}

function eligibleTeams(source: DocumentData) {
  return (Array.isArray(source.tournamentTeamsData) ? source.tournamentTeamsData : [])
    .filter((team: DocumentData) => team.eligibleForPlayoffs !== false && !['withdrawn', 'disqualified'].includes(String(team.tieredStatus || '')));
}

function requirePreliminaryResults(source: DocumentData) {
  const eligible = new Set(eligibleTeams(source).map((team: DocumentData) => team.id));
  const games = (Array.isArray(source.tournamentGames) ? source.tournamentGames : []).filter((game: DocumentData) =>
    game.phase !== 'playoff' && eligible.has(game.team1Id) && eligible.has(game.team2Id));
  const blocking = games.filter((game: DocumentData) => game.isCompleted !== true || game.isDisputed === true);
  if (!games.length || blocking.length) {
    fail('PRELIMINARY_RESULTS_INCOMPLETE', `Playoff seeding is blocked by ${blocking.length || 1} missing or disputed preliminary result${blocking.length === 1 ? '' : 's'}.`, 409);
  }
  return games;
}

function resizeDivisions(config: TieredPlayoffsConfig, teamCount: number) {
  const maximumDivisions = Math.max(1, Math.floor(teamCount / 2));
  const definitions = config.divisions.definitions.slice(0, Math.min(config.divisions.definitions.length, maximumDivisions));
  const base = Math.floor(teamCount / definitions.length);
  const remainder = teamCount % definitions.length;
  return definitions.map((definition, index) => ({ ...definition, size: base + (index < remainder ? 1 : 0) }));
}

export async function executeTieredPlayoffsCommand(input: TieredPlayoffsCommandInput) {
  if (!ACTIONS.has(input.action) || !ID.test(input.teamId) || !ID.test(input.eventId) || !input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    fail('INVALID_COMMAND', 'Invalid Tiered Playoffs command.');
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || !Number.isSafeInteger(input.expectedScheduleVersion) || input.expectedScheduleVersion < 0) {
    fail('INVALID_VERSION', 'Current Tournament lifecycle and schedule versions are required.');
  }
  const identity = canonicalCompetitionRequest({
    requestId: input.requestId,
    tenantId: input.teamId,
    kind: 'tiered-playoffs',
    payload: {
      action: input.action,
      teamId: input.teamId,
      eventId: input.eventId,
      expectedVersion: input.expectedVersion,
      expectedScheduleVersion: input.expectedScheduleVersion,
      payload: input.payload,
    },
  });
  const teamRef = adminDb.collection('teams').doc(input.teamId);
  const eventRef = teamRef.collection('events').doc(input.eventId);

  return withScheduleMutationLock(holder => runCompetitionOperation({
    actorUid: input.actor.uid,
    identity,
    authorizeTransaction: async transaction => {
      await assertScheduleMutationLock(transaction, holder);
      await resolveCompetitionAuthority({ transaction, actorUid: input.actor.uid, actorRole: input.actor.role, teamId: input.teamId, domain: 'tournament' });
      const team = (await transaction.get(teamRef)).data() || {};
      if (team.isPro !== true) fail('ADVANCED_TOURNAMENT_ENTITLEMENT_REQUIRED', 'Tiered Playoffs requires the current squad Pro allocation.', 403);
    },
  }, async ({ transaction }) => {
    const snapshot = await transaction.get(eventRef);
    if (!snapshot.exists) fail('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
    const source = snapshot.data() || {};
    const config = currentEvent(source, input);
    const now = new Date().toISOString();
    const nextVersion = input.expectedVersion + 1;
    let nextConfig = clean(config);
    let nextGames = clean(Array.isArray(source.tournamentGames) ? source.tournamentGames : []);
    let nextTeams: DocumentData[] | null = null;
    let result: Record<string, unknown> = {};

    if (input.action === 'preview-seeding') {
      if (Object.keys(input.payload).length) fail('UNSUPPORTED_PAYLOAD', 'Seeding preview does not accept additional fields.');
      if (config.playoffs.status !== 'pending' || config.seeding.status === 'locked') fail('SEEDING_STATE_CONFLICT', 'Locked or generated playoff placement cannot be recalculated.', 409);
      const preliminary = requirePreliminaryResults(source);
      const teams = eligibleTeams(source) as Array<{ id: string; name: string }>;
      const standings = calculateTieredStandings(teams, preliminary, config.standings);
      const ranking = resolveTieredRanking(standings, preliminary, config.standings);
      if (ranking.unresolvedGroups.length) fail('UNRESOLVED_TIE', 'One or more playoff seeds require an explicit organizer tie decision.', 409);
      const calculated = allocateTieredDivisions(ranking.ranked, config.divisions.definitions, config.divisions.sizing);
      nextConfig.seeding = {
        status: 'review',
        calculated,
        approved: clean(calculated),
        standingsFingerprint: tieredStandingsFingerprint(preliminary, config.standings as unknown as Record<string, unknown>),
        lockedAt: null,
        lockedBy: null,
      };
      result = { standings, calculated, approved: calculated };
    } else if (input.action === 'apply-seed-override') {
      if (config.seeding.status !== 'review') fail('SEEDING_STATE_CONFLICT', 'Seed overrides require an unlocked seeding review.', 409);
      if (Object.keys(input.payload).some(key => !['teamId', 'targetOverallSeed'].includes(key))) fail('UNSUPPORTED_PAYLOAD', 'Unsupported seed override field.');
      nextConfig.seeding.approved = applyTieredSeedOverride(config.seeding.calculated, config.seeding.approved, {
        teamId: String(input.payload.teamId || ''),
        targetOverallSeed: Number(input.payload.targetOverallSeed),
        actorUid: input.actor.uid,
        timestamp: now,
      });
      result = { approved: nextConfig.seeding.approved };
    } else if (input.action === 'reset-seeding') {
      if (Object.keys(input.payload).length) fail('UNSUPPORTED_PAYLOAD', 'Seeding reset does not accept additional fields.');
      if (config.seeding.status !== 'review') fail('SEEDING_STATE_CONFLICT', 'Only an unlocked seeding review can be reset.', 409);
      nextConfig.seeding.approved = resetTieredSeedOverrides(config.seeding.calculated);
      result = { approved: nextConfig.seeding.approved };
    } else if (input.action === 'lock-seeding') {
      if (Object.keys(input.payload).length) fail('UNSUPPORTED_PAYLOAD', 'Seed locking does not accept additional fields.');
      if (config.seeding.status !== 'review' || !config.seeding.approved.length) fail('SEEDING_STATE_CONFLICT', 'Preview valid playoff placement before locking seeds.', 409);
      const preliminary = requirePreliminaryResults(source);
      const fingerprint = tieredStandingsFingerprint(preliminary, config.standings as unknown as Record<string, unknown>);
      if (fingerprint !== config.seeding.standingsFingerprint) fail('SEEDING_STALE', 'Preliminary results changed. Recalculate placement before locking.', 409);
      nextConfig.seeding = { ...nextConfig.seeding, status: 'locked', lockedAt: now, lockedBy: input.actor.uid };
      result = { approved: nextConfig.seeding.approved, lockedAt: now };
    } else if (input.action === 'generate-brackets') {
      if (Object.keys(input.payload).length) fail('UNSUPPORTED_PAYLOAD', 'Bracket generation does not accept additional fields.');
      if (config.seeding.status !== 'locked' || config.playoffs.status !== 'pending') fail('PLAYOFF_STATE_CONFLICT', 'Lock current playoff seeds before generating brackets.', 409);
      const unscheduled = config.divisions.definitions.flatMap(division => generateTieredDivisionBracket(division, config.seeding.approved));
      for (const division of config.divisions.definitions) {
        const placements = config.seeding.approved.filter(row => row.divisionId === division.id);
        const validation = validateTieredBrackets(unscheduled.filter(game => game.playoffDivisionId === division.id), placements);
        if (!validation.valid) fail('INVALID_PLAYOFF_BRACKET', validation.conflicts[0] || `Division ${division.name} bracket is invalid.`, 409);
      }
      const preliminary = nextGames.filter((game: DocumentData) => game.phase !== 'playoff');
      const fields = [...new Map(preliminary
        .filter((game: DocumentData) => typeof game.resourceId === 'string' && game.resourceId && typeof game.location === 'string' && game.location)
        .map((game: DocumentData) => [game.resourceId, { id: game.resourceId, name: game.location }])).values()];
      const dailyWindows = Array.isArray(source.dailyWindows) ? source.dailyWindows : [];
      if (!fields.length || !dailyWindows.length) fail('PLAYOFF_AVAILABILITY_REQUIRED', 'Configure playoff dates, operating windows, and field resources before generating brackets.', 409);
      const brackets = scheduleTieredPlayoffBrackets(unscheduled, {
        fields,
        dailyWindows,
        gameDurationMinutes: config.preliminary.gameDurationMinutes,
        minimumRestMinutes: config.preliminary.minimumRestMinutes,
        transitionMinutes: config.preliminary.transitionMinutes,
        occupiedGames: preliminary,
      });
      nextGames = [...nextGames.filter((game: DocumentData) => game.phase !== 'playoff'), ...clean(brackets)];
      nextConfig.playoffs.status = 'ready';
      result = { brackets };
    } else if (input.action === 'publish-playoffs') {
      if (Object.keys(input.payload).length) fail('UNSUPPORTED_PAYLOAD', 'Playoff publication does not accept additional fields.');
      if (config.seeding.status !== 'locked' || config.playoffs.status !== 'ready') fail('PLAYOFF_STATE_CONFLICT', 'Generate valid playoff brackets before publishing.', 409);
      const brackets = nextGames.filter((game: DocumentData) => game.phase === 'playoff');
      if (!brackets.length) fail('PLAYOFF_BRACKETS_MISSING', 'No playoff brackets are ready to publish.', 409);
      nextConfig.playoffs = { ...nextConfig.playoffs, status: 'published', publishedAt: now, publishedBy: input.actor.uid };
      result = { publishedAt: now };
    } else if (input.action === 'withdraw-team' || input.action === 'disqualify-team') {
      if (Object.keys(input.payload).some(key => !['teamId', 'reason'].includes(key))) fail('UNSUPPORTED_PAYLOAD', 'Unsupported team status field.');
      const teamId = String(input.payload.teamId || '');
      const reason = String(input.payload.reason || '').trim();
      if (!ID.test(teamId) || !reason || reason.length > 1_000) fail('INVALID_TEAM_STATUS', 'A valid team and reason are required.');
      const teams: DocumentData[] = clean(Array.isArray(source.tournamentTeamsData) ? source.tournamentTeamsData : []);
      const teamIndex = teams.findIndex((team: DocumentData) => team.id === teamId);
      if (teamIndex < 0) fail('TEAM_NOT_FOUND', 'Tournament team not found.', 404);
      if (teams[teamIndex].eligibleForPlayoffs === false) fail('TEAM_STATUS_CONFLICT', 'This team is already unavailable for playoffs.', 409);
      const tieredStatus = input.action === 'withdraw-team' ? 'withdrawn' : 'disqualified';
      teams[teamIndex] = { ...teams[teamIndex], eligibleForPlayoffs: false, tieredStatus, tieredStatusReason: reason, tieredStatusAt: now, tieredStatusBy: input.actor.uid };
      if (config.playoffs.status === 'pending' && config.seeding.status !== 'locked' && config.seeding.status !== 'stale') {
        const remaining = teams.filter((team: DocumentData) => team.eligibleForPlayoffs !== false).length;
        if (remaining < 2) fail('INSUFFICIENT_PLAYOFF_TEAMS', 'At least two eligible teams are required to continue Tiered Playoffs.', 409);
        nextConfig.divisions.definitions = resizeDivisions(config, remaining);
        nextConfig.seeding = { status: 'pending', calculated: [], approved: [], standingsFingerprint: null, lockedAt: null, lockedBy: null };
      } else {
        let changed = true;
        while (changed) {
          changed = false;
          const playable = nextGames.find((game: DocumentData) => game.phase === 'playoff' && game.isCompleted !== true &&
            (game.team1Id === teamId || game.team2Id === teamId) && game.team1Id !== 'tbd' && game.team2Id !== 'tbd' && game.team1Id !== game.team2Id);
          if (playable) {
            nextGames = recordTournamentScore(nextGames, playable.id, playable.team1Id === teamId ? 0 : 1, playable.team2Id === teamId ? 0 : 1);
            changed = true;
          }
        }
      }
      result = { teamId, status: tieredStatus };
      nextTeams = teams;
    }

    const persistedConfig = clean(nextConfig);
    const persistedGames = clean(nextGames);
    transaction.update(eventRef, { tieredPlayoffs: persistedConfig, tournamentGames: persistedGames,
      ...(nextTeams ? { tournamentTeamsData: clean(nextTeams) } : {}),
      lifecycleVersion: nextVersion, updatedAt: now });
    transaction.create(eventRef.collection('audit').doc(identity.operationId), {
      action: input.action,
      actorUid: input.actor.uid,
      teamId: input.teamId,
      eventId: input.eventId,
      lifecycleVersion: nextVersion,
      createdAt: now,
    });
    return clean({ success: true, lifecycleVersion: nextVersion, scheduleVersion: input.expectedScheduleVersion, ...result });
  }));
}
