import { createHash } from 'node:crypto';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';
import { authorizeDashboardRoute } from '@/lib/dashboard-route-policy';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { hashLeagueScorekeeperPin, hashTournamentScorekeeperCode, verifyLeagueScorekeeperPin, verifyTournamentScorekeeperCode } from '@/lib/server-competition-credential';
import { assertScheduleMutationLock, withScheduleMutationLock, ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import { leagueBillingOwnerUserId, permitsLegacyOrPaidPortals, scorekeeperLeague } from '@/lib/public-portal-data';
import { publicLeagueGameProjection, recalculatePublicLeagueStandings, leagueGameVersionFloor } from '@/lib/public-league-scoring';
import { scorekeeperTournament } from '@/lib/public-portal-data';
import { BracketProgressionError, hasCompletedBracketDescendant, recordTournamentScore, validateBracketScoreSubmission } from '@/lib/scheduler-utils';
import { TournamentScheduleDeploymentError, withTournamentScheduleMutationLock } from '@/lib/server-tournament-schedule-deployment';
import type { TournamentGame } from '@/components/providers/team-provider';
import { reconcileTieredAfterPlayoffMutation, reconcileTieredAfterPreliminaryMutation } from '@/lib/tiered-playoffs/lifecycle';
import type { TieredPlayoffsConfig } from '@/lib/tiered-playoffs/types';

type Data = Record<string, any>;
export type CompetitionScoringCommand = {
  requestId: string;
  competitionKind: 'league';
  competitionId: string;
  gameId: string;
  expectedGameVersion: number;
  credential?: string;
  actor?: { uid: string; role?: string };
  score?: { home: unknown; away: unknown };
  notes?: unknown;
  reason?: unknown;
  outcome?: unknown;
};
type Action = 'score' | 'dispute' | 'resolve-dispute';
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
function fail(message: string, status = 409): never { throw new ScheduleDeploymentError('LEAGUE_SCORING_REJECTED', message, status); }
function validScore(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9999; }
function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000) fail('A reason of 1 to 2000 characters is required.', 400);
  return value.trim();
}

/** Legacy teams can omit status, but an explicit inactive lifecycle never grants access. */
export function isActiveCompetitionTeam(team: Data | undefined): boolean {
  const status = typeof team?.status === 'string' ? team.status.trim().toLowerCase() : team?.status;
  return !!team && !isAccountAccessBlocked(team) && team.isDeleted !== true && team.isArchived !== true && team.is_active !== false && team.isActive !== false && (status == null || status === '' || status === 'active');
}

async function assertLeagueTenantOwner(transaction: Transaction, league: Data, ownerId: string): Promise<void> {
  const tenants = new Set<string>();
  for (const value of [league.tenantId, league.hostTeamId, league.ownerTeamId, league.teamId]) {
    if (value == null || value === '') continue;
    if (typeof value !== 'string' || !/^[^/\s]{1,200}$/.test(value)) fail('League tenant is invalid.', 403);
    tenants.add(value);
  }
  if (tenants.size !== 1) fail('League tenant is missing or ambiguous.', 403);
  const [tenantId] = tenants;
  if (tenantId.startsWith('profile:')) {
    if (tenantId !== `profile:${ownerId}` || league.creatorId !== ownerId) fail('League profile ownership is inconsistent.', 403);
    return;
  }
  const tenant = await transaction.get(adminDb.collection('teams').doc(tenantId));
  if (!tenant.exists || !isActiveCompetitionTeam(tenant.data()) || tenant.data()?.ownerUserId !== ownerId) fail('League tenant ownership is inactive or inconsistent.', 403);
}

/** Every caller reads lifecycle and the canonical billing owner in its transaction. */
export async function readActiveScoringLeague(transaction: Transaction, leagueId: string): Promise<Data> {
  const snapshot = await transaction.get(adminDb.collection('leagues').doc(leagueId));
  if (!snapshot.exists) fail('League not found.', 404);
  const league = snapshot.data()!;
  if (league.isArchived === true || league.is_active === false || league.isDeleted === true) fail('League portal is inactive.', 404);
  const ownerId = leagueBillingOwnerUserId(league);
  if (!ownerId || !/^[^/\s]{1,200}$/.test(ownerId)) fail('League billing owner is unavailable.', 403);
  await assertLeagueTenantOwner(transaction, league, ownerId);
  const owner = await transaction.get(adminDb.collection('users').doc(ownerId));
  const profile = owner.data();
  if (!owner.exists || isAccountAccessBlocked(profile) || profile?.isDeleted === true || profile?.status === 'removed' || !authorizeDashboardRoute('/competition', profile || null).allowed) fail('The billing owner does not have competition access.', 403);
  if ((league.isDemo === true || league.demoSeeded === true) && (league.isDemo !== true || league.demoSeeded !== true || league.demoSessionOwnerId !== ownerId || league.creatorId !== ownerId || league.tenantId !== `profile:${ownerId}` || profile?.isDemo !== true)) fail('The demo League owner could not be verified.', 403);
  return league;
}

function assertDownstreamAvailable(schedule: Data[], game: Data): void {
  const visited = new Set<string>([game.id]);
  const pending = [game];
  while (pending.length) {
    const current = pending.pop()!;
    const targets = [current.winnerTo, current.loserTo].filter(value => typeof value === 'string' && value);
    for (const target of targets) {
      const next = schedule.find(candidate => candidate.id === target);
      if (!next) fail('A downstream match is missing. Repair the schedule before scoring.');
      if (visited.has(next.id)) fail('The schedule contains a conflicting dependency.');
      visited.add(next.id);
      if (next.isStarted === true || next.startedAt || next.status === 'in_progress' || next.status === 'live' || next.isCompleted === true || next.isDisputed === true || Number(next.score1 || 0) !== 0 || Number(next.score2 || 0) !== 0 || next.scoredAt) fail('A downstream match has started or been scored.');
      pending.push(next);
    }
  }
}

async function runScoreCommand(input: CompetitionScoringCommand, action: Action) {
  if (input.competitionKind !== 'league' || !safeId(input.competitionId) || !safeId(input.gameId)) fail('Invalid League or game identifier.', 400);
  if (!Number.isSafeInteger(input.expectedGameVersion) || input.expectedGameVersion < 0) fail('A current numeric game version is required.', 400);
  const notes = action === 'dispute' ? requiredText(input.notes) : null;
  const reason = action === 'resolve-dispute' ? requiredText(input.reason) : null;
  const outcome = action === 'resolve-dispute' ? input.outcome : null;
  if (action === 'resolve-dispute' && outcome !== 'uphold' && outcome !== 'correct') fail('Choose uphold or correct.', 400);
  const score = action === 'score' || outcome === 'correct' ? input.score : null;
  if ((action === 'score' || outcome === 'correct') && (!score || !validScore(score.home) || !validScore(score.away))) fail('Scores must be whole numbers from 0 to 9999.', 400);
  const leagueRef = adminDb.collection('leagues').doc(input.competitionId);
  const privateRef = leagueRef.collection('private').doc('lifecycle');
  let currentLeague: Data = {};
  let currentPrivate: Data = {};
  let migratedHash = '';
  const authorize = async (transaction: Transaction) => {
    const league = await readActiveScoringLeague(transaction, input.competitionId);
    const privateSnapshot = await transaction.get(privateRef);
    const privateData = privateSnapshot.data() || {};
    if (!Array.isArray(league.schedule) || !league.schedule.some((game: Data) => game.id === input.gameId)) fail('League match not found.', 404);
    const ownerId = leagueBillingOwnerUserId(league);
    // Task 1 owns tenant derivation and entitlement, including legacy profile tenants.
    const authority = await resolveCompetitionAuthority({ transaction, leagueId: input.competitionId, actorUid: input.actor?.uid || ownerId, actorRole: input.actor?.role });
    let actorUid: string;
    migratedHash = '';
    if (input.actor) {
      const actor = await transaction.get(adminDb.collection('users').doc(input.actor.uid));
      if (actor.exists && (isAccountAccessBlocked(actor.data()) || actor.data()?.isDeleted === true || actor.data()?.status === 'removed')) fail('Actor access is inactive.', 403);
      if (action === 'resolve-dispute' && league.creatorId !== input.actor.uid && authority.role !== 'owner' && authority.role !== 'superadmin') fail('Only the organizer can resolve disputes.', 403);
      actorUid = `user:${input.actor.uid}`;
    } else {
      if (action === 'resolve-dispute') fail('Only the organizer can resolve disputes.', 403);
      const pin = typeof input.credential === 'string' ? input.credential.trim() : '';
      const legacyPin = typeof league.scorekeeperPin === 'string' ? league.scorekeeperPin.trim() : '';
      const storedHash = typeof privateData.scorekeeperPinHash === 'string' ? privateData.scorekeeperPinHash : '';
      const hash = storedHash || (legacyPin ? hashLeagueScorekeeperPin(input.competitionId, legacyPin) : '');
      if (!hash) fail('Scorekeeper access is not configured for this league.');
      if (!verifyLeagueScorekeeperPin(input.competitionId, pin, hash)) fail('Invalid scorekeeper PIN.', 403);
      migratedHash = legacyPin ? hash : '';
      actorUid = `scorekeeper:${createHash('sha256').update(hash).digest('hex').slice(0, 24)}`;
    }
    currentLeague = league;
    currentPrivate = privateData;
    return { tenantId: authority.tenantId, actorUid };
  };
  const preflight = await adminDb.runTransaction(authorize);
  const identity = canonicalCompetitionRequest({ requestId: input.requestId, tenantId: preflight.tenantId, kind: 'league-scoring', payload: {
    action, competitionId: input.competitionId, gameId: input.gameId, expectedGameVersion: input.expectedGameVersion, score, notes, reason, outcome,
  } });
  return withScheduleMutationLock(holder => runCompetitionOperation({ actorUid: preflight.actorUid, identity,
    authorizeTransaction: async transaction => {
      await assertScheduleMutationLock(transaction, holder);
      const fresh = await authorize(transaction);
      if (fresh.tenantId !== preflight.tenantId || fresh.actorUid !== preflight.actorUid) fail('League authority changed. Refresh before retrying.', 403);
    },
  }, async ({ transaction, queueExternalEffect }) => {
    const league = currentLeague;
    const schedule: Data[] = league.schedule.map((game: Data) => ({ ...game }));
    if (new Set(schedule.map(game => game.id)).size !== schedule.length) fail('The schedule contains duplicate game identities.');
    const game = schedule.find(candidate => candidate.id === input.gameId)!;
    const version = game.gameVersion ?? 0;
    if (!Number.isSafeInteger(version) || version !== input.expectedGameVersion) fail('The match changed. Refresh before retrying.');
    if (!safeId(game.team1Id) || !safeId(game.team2Id) || game.team1Id === game.team2Id || !['accepted', 'assigned'].includes(league.teams?.[game.team1Id]?.status) || !['accepted', 'assigned'].includes(league.teams?.[game.team2Id]?.status)) fail('This match does not have two enrolled team assignments.');
    assertDownstreamAvailable(schedule, game);
    if (action === 'score' && game.isDisputed === true) fail('Resolve the open dispute before scoring.');
    if (action === 'dispute' && (game.isDisputed === true || game.isCompleted !== true)) fail('Only an official completed result can be disputed.');
    if (action === 'resolve-dispute' && game.isDisputed !== true) fail('This match has no open dispute.');
    if (outcome === 'uphold' && (game.isCompleted !== true || !validScore(game.score1) || !validScore(game.score2))) fail('The recorded result is incomplete. Supply an explicit correction.');
    const projectionRefs = [game.team1Id, game.team2Id].map(teamId => adminDb.collection('teams').doc(teamId).collection('games').doc(`lg_${game.id}`));
    const projections = await Promise.all(projectionRefs.map(ref => transaction.get(ref)));
    if (projections.some(snapshot => snapshot.exists && (snapshot.data()?.leagueId !== input.competitionId || snapshot.data()?.leagueGameId !== game.id))) fail('An official game projection belongs to a different match.');
    const before = { score1: game.score1 ?? 0, score2: game.score2 ?? 0, isCompleted: game.isCompleted === true, isDisputed: game.isDisputed === true, gameVersion: version };
    const now = new Date().toISOString();
    if (score) { game.score1 = score.home; game.score2 = score.away; game.isCompleted = true; }
    game.isDisputed = action === 'dispute';
    game.gameVersion = version + 1;
    game.reportedBy = preflight.actorUid;
    game.updatedAt = now;
    // Reasons are private audit data, not member-readable schedule fields.
    delete game.disputeNotes;
    const teams = recalculatePublicLeagueStandings(league.teams, schedule);
    transaction.update(leagueRef, { schedule, teams, gameVersionFloor: Math.max(leagueGameVersionFloor(league), game.gameVersion), scheduleUpdatedAt: now, scheduleUpdatedBy: preflight.actorUid,
      ...(migratedHash ? { scorekeeperPin: FieldValue.delete(), scorekeeperPinHash: FieldValue.delete() } : {}),
    });
    if (migratedHash) transaction.set(privateRef, { ...currentPrivate, scorekeeperPinHash: migratedHash, updatedAt: now });
    for (const [teamId, opponentTeamId, myScore, opponentScore, opponent] of [
      [game.team1Id, game.team2Id, game.score1, game.score2, game.team2],
      [game.team2Id, game.team1Id, game.score2, game.score1, game.team1],
    ]) {
      const ref = adminDb.collection('teams').doc(teamId).collection('games').doc(`lg_${game.id}`);
      if (game.isDisputed) transaction.delete(ref);
      else transaction.set(ref, publicLeagueGameProjection({ leagueId: input.competitionId, leagueName: String(league.name || 'League'), game, teamId, opponentTeamId, opponent: String(opponent || 'Opponent'), myScore, opponentScore, updatedAt: now }));
    }
    transaction.create(leagueRef.collection('scoreAudit').doc(identity.operationId), { operationId: identity.operationId, requestId: identity.requestId, action, gameId: input.gameId, actorUid: preflight.actorUid, before,
      after: { score1: game.score1, score2: game.score2, isCompleted: game.isCompleted, isDisputed: game.isDisputed, gameVersion: game.gameVersion }, notes, reason, outcome, createdAt: now });
    queueExternalEffect({ effectId: 'spectator-refresh', kind: 'league-spectator-refresh', payload: { leagueId: input.competitionId, gameId: input.gameId, gameVersion: game.gameVersion } });
    return { success: true, gameVersion: game.gameVersion, schedule: scorekeeperLeague(input.competitionId, { ...league, schedule }).schedule };
  }));
}

export const submitCompetitionScore = (input: CompetitionScoringCommand) => runScoreCommand(input, 'score');
export const openCompetitionDispute = (input: CompetitionScoringCommand) => runScoreCommand(input, 'dispute');
export const resolveCompetitionDispute = (input: CompetitionScoringCommand) => runScoreCommand(input, 'resolve-dispute');

export function competitionScoringInput(body: Record<string, unknown>, actor?: CompetitionScoringCommand['actor']): CompetitionScoringCommand {
  return { competitionKind: 'league', competitionId: String(body.leagueId || ''), gameId: String(body.gameId || ''), requestId: String(body.requestId || ''), expectedGameVersion: body.expectedGameVersion as number,
    credential: typeof body.code === 'string' ? body.code : typeof body.pin === 'string' ? body.pin : '', actor,
    score: { home: body.score1, away: body.score2 }, notes: body.notes, reason: body.reason, outcome: body.outcome };
}

export type TournamentScoringCommand = {
  requestId: string;
  teamId: string;
  eventId: string;
  gameId: string;
  expectedLifecycleVersion: number;
  expectedScheduleVersion: number;
  expectedGameVersion: number;
  expectedCredentialVersion: number;
  actor?: { uid: string; role?: string };
  credential?: string;
  score?: { home: unknown; away: unknown };
  explicitWinner?: unknown;
  notes?: unknown;
  reason?: unknown;
  resolution?: unknown;
  correctedScore?: { home: unknown; away: unknown };
};

type TournamentScoringAction = 'score' | 'dispute' | 'resolve-dispute';

function tournamentFail(code: string, message: string, status = 409): never {
  throw new TournamentScheduleDeploymentError(code, message, status);
}

function tournamentScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 999;
}

function requiredTournamentText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 2_000) {
    tournamentFail('INVALID_REASON', `${label} must contain 1 to 2000 characters.`, 400);
  }
  return value.trim();
}

function clearTournamentProgression(games: TournamentGame[], source: TournamentGame): TournamentGame[] {
  const next = games.map(game => ({ ...game }));
  const clear = (targetId: string | undefined, slot: 'team1' | 'team2' | undefined, expectedTeamId: string | undefined) => {
    if (!targetId || !slot) return;
    const index = next.findIndex(game => game.id === targetId);
    if (index < 0) tournamentFail('BRACKET_DEPENDENCY_MISSING', 'A dependent bracket match is missing.');
    const idKey = `${slot}Id` as 'team1Id' | 'team2Id';
    if (expectedTeamId && next[index][idKey] !== expectedTeamId) return;
    next[index] = {
      ...next[index],
      [slot]: 'TBD',
      [idKey]: 'tbd',
      [`${slot}LogoUrl`]: undefined,
      [`score${slot === 'team1' ? '1' : '2'}`]: 0,
    } as TournamentGame;
  };
  const winnerId = (source as Data).winnerId || (source.score1 > source.score2 ? source.team1Id : source.score2 > source.score1 ? source.team2Id : undefined);
  const loserId = winnerId === source.team1Id ? source.team2Id : winnerId === source.team2Id ? source.team1Id : undefined;
  clear(source.winnerTo, source.winnerToSlot, winnerId || undefined);
  clear(source.loserTo, source.loserToSlot, loserId);
  return next;
}

export function tournamentScoringInput(body: Record<string, unknown>, actor?: TournamentScoringCommand['actor']): TournamentScoringCommand {
  const corrected = body.correctedScore && typeof body.correctedScore === 'object' && !Array.isArray(body.correctedScore)
    ? body.correctedScore as Record<string, unknown>
    : null;
  return {
    requestId: String(body.requestId || ''), teamId: String(body.teamId || ''), eventId: String(body.eventId || ''), gameId: String(body.gameId || ''),
    expectedLifecycleVersion: body.expectedLifecycleVersion as number, expectedScheduleVersion: body.expectedScheduleVersion as number,
    expectedGameVersion: body.expectedGameVersion as number, expectedCredentialVersion: body.expectedCredentialVersion as number,
    actor, credential: typeof body.code === 'string' ? body.code : '', score: { home: body.score1, away: body.score2 }, explicitWinner: body.explicitWinner,
    notes: body.notes, reason: body.reason, resolution: body.resolution,
    correctedScore: corrected ? { home: corrected.home, away: corrected.away } : undefined,
  };
}

export async function runTournamentScoringCommand(input: TournamentScoringCommand, action: TournamentScoringAction) {
  if (!safeId(input.teamId) || !safeId(input.eventId) || !safeId(input.gameId)) tournamentFail('INVALID_TOURNAMENT', 'Invalid Tournament or match identifier.', 400);
  for (const version of [input.expectedLifecycleVersion, input.expectedScheduleVersion, input.expectedGameVersion, input.expectedCredentialVersion]) {
    if (!Number.isSafeInteger(version) || version < 0) tournamentFail('INVALID_VERSION', 'Current Tournament, schedule, match, and credential versions are required.', 400);
  }
  const notes = action === 'dispute' ? requiredTournamentText(input.notes, 'Dispute details') : null;
  const reason = action === 'resolve-dispute' ? requiredTournamentText(input.reason, 'Resolution reason') : null;
  const resolution = action === 'resolve-dispute' ? input.resolution : null;
  if (action === 'resolve-dispute' && !['uphold', 'correct', 'void'].includes(String(resolution))) tournamentFail('INVALID_RESOLUTION', 'Choose uphold, correct, or void.', 400);
  const score = action === 'score' ? input.score : resolution === 'correct' ? input.correctedScore : null;
  const explicitWinner = action === 'score' && (input.explicitWinner === 'team1' || input.explicitWinner === 'team2') ? input.explicitWinner : undefined;
  if (action === 'score' && input.explicitWinner !== undefined && !explicitWinner) tournamentFail('INVALID_WINNER', 'Choose a valid Tournament winner.', 400);
  if (score && (!tournamentScore(score.home) || !tournamentScore(score.away))) tournamentFail('INVALID_SCORE', 'Scores must be whole numbers from 0 to 999.', 400);
  if ((action === 'score' || resolution === 'correct') && !score) tournamentFail('INVALID_SCORE', 'A valid score is required.', 400);

  const teamRef = adminDb.collection('teams').doc(input.teamId);
  const eventRef = teamRef.collection('events').doc(input.eventId);
  const credentialRef = eventRef.collection('private').doc('scoring');
  let currentEvent: Data = {};
  let currentCredential: Data = {};
  let currentActorUid = '';
  let migratedHash = '';
  let migratedCredentialVersion = input.expectedCredentialVersion;
  const authorize = async (transaction: Transaction) => {
    const [teamSnapshot, eventSnapshot, credentialSnapshot] = await Promise.all([
      transaction.get(teamRef), transaction.get(eventRef), transaction.get(credentialRef),
    ]);
    if (!teamSnapshot.exists || !eventSnapshot.exists) tournamentFail('TOURNAMENT_NOT_FOUND', 'Tournament not found.', 404);
    const team = teamSnapshot.data() || {};
    const event = eventSnapshot.data() || {};
    if (!isActiveCompetitionTeam(team)) tournamentFail('TOURNAMENT_TENANT_INACTIVE', 'The Tournament squad is inactive.', 403);
    if (!input.actor && !permitsLegacyOrPaidPortals(team.planId, team.plan_type, team.subscriptionPlanId)) tournamentFail('TOURNAMENT_ENTITLEMENT_REQUIRED', 'This subscription does not include Tournament scoring.', 403);
    if (event.isTournament !== true || event.teamId !== input.teamId || event.isArchived === true || event.isDeleted === true || event.is_active === false || event.isActive === false || event.status === 'cancelled') {
      tournamentFail('TOURNAMENT_INACTIVE', 'Tournament is inactive.', 409);
    }
    const authorityActor = input.actor?.uid || String(team.ownerUserId || '');
    const authority = await resolveCompetitionAuthority({ transaction, actorUid: authorityActor, actorRole: input.actor?.role, teamId: input.teamId, domain: 'tournament' });
    if (event.tournamentType !== 'round_robin' && team.isPro !== true) tournamentFail('ADVANCED_TOURNAMENT_ENTITLEMENT_REQUIRED', 'This plan does not include advanced Tournament scoring.', 403);
    const privateCredential = credentialSnapshot.data() || {};
    const eventCredentialVersion = Number(event.credentialVersion || 0);
    const privateCredentialVersion = Number(privateCredential.credentialVersion || 0);
    if (eventCredentialVersion !== privateCredentialVersion) {
      tournamentFail('CREDENTIAL_VERSION_CONFLICT', 'The scorekeeper credential changed. Refresh before retrying.', 409);
    }
    migratedHash = '';
    migratedCredentialVersion = privateCredentialVersion;
    if (input.actor) {
      if (action === 'resolve-dispute' && authority.role !== 'owner' && authority.role !== 'superadmin') tournamentFail('FORBIDDEN', 'Only the Tournament owner can resolve disputes.', 403);
      currentActorUid = `user:${input.actor.uid}`;
    } else {
      if (action === 'resolve-dispute') tournamentFail('FORBIDDEN', 'Only the Tournament owner can resolve disputes.', 403);
      const supplied = String(input.credential || '').trim();
      const storedHash = typeof privateCredential.scorekeeperCodeHash === 'string' ? privateCredential.scorekeeperCodeHash : '';
      const legacyCode = typeof event.scoringCode === 'string' ? event.scoringCode.trim() : '';
      const credentialHash = storedHash || (legacyCode ? hashTournamentScorekeeperCode(input.teamId, input.eventId, legacyCode) : '');
      if (!credentialHash || !verifyTournamentScorekeeperCode(input.teamId, input.eventId, supplied, credentialHash)) tournamentFail('INVALID_SCOREKEEPER_CODE', 'Invalid scorekeeper code.', 403);
      if (legacyCode) { migratedHash = credentialHash; migratedCredentialVersion = privateCredentialVersion + 1; }
      currentActorUid = `scorekeeper:${createHash('sha256').update(credentialHash).digest('hex').slice(0, 24)}`;
    }
    currentEvent = event;
    currentCredential = privateCredential;
    return { tenantId: authority.tenantId, actorUid: currentActorUid };
  };

  const preflight = await adminDb.runTransaction(authorize);
  const payload = { action, teamId: input.teamId, eventId: input.eventId, gameId: input.gameId,
    expectedLifecycleVersion: input.expectedLifecycleVersion, expectedScheduleVersion: input.expectedScheduleVersion,
    expectedGameVersion: input.expectedGameVersion, expectedCredentialVersion: input.expectedCredentialVersion,
    score, ...(explicitWinner ? { explicitWinner } : {}), notes, reason, resolution };
  const identity = canonicalCompetitionRequest({ requestId: input.requestId, tenantId: preflight.tenantId, kind: 'tournament-scoring', payload });

  return withTournamentScheduleMutationLock(holder => runCompetitionOperation({ actorUid: preflight.actorUid, identity,
    authorizeTransaction: async transaction => {
      await assertScheduleMutationLock(transaction, holder);
      const fresh = await authorize(transaction);
      if (fresh.tenantId !== preflight.tenantId || fresh.actorUid !== preflight.actorUid) tournamentFail('AUTHORITY_CHANGED', 'Tournament authority changed. Refresh before retrying.', 403);
    },
  }, async ({ transaction, queueExternalEffect }) => {
    if (Number(currentCredential.credentialVersion || 0) !== input.expectedCredentialVersion) {
      tournamentFail('CREDENTIAL_VERSION_CONFLICT', 'The scorekeeper credential changed. Refresh before retrying.', 409);
    }
    if (Number(currentEvent.lifecycleVersion || 0) !== input.expectedLifecycleVersion || Number(currentEvent.scheduleVersion || 0) !== input.expectedScheduleVersion) {
      tournamentFail('TOURNAMENT_VERSION_CONFLICT', 'The Tournament schedule changed. Refresh before retrying.', 409);
    }
    let games: TournamentGame[] = Array.isArray(currentEvent.tournamentGames) ? currentEvent.tournamentGames.map((game: TournamentGame) => ({ ...game })) : [];
    if (new Set(games.map(game => game.id)).size !== games.length) tournamentFail('DUPLICATE_GAME', 'The Tournament schedule contains duplicate match identities.');
    const index = games.findIndex(game => game.id === input.gameId);
    if (index < 0) tournamentFail('GAME_NOT_FOUND', 'Tournament match not found.', 404);
    const game = games[index];
    if (Number(game.gameVersion || 0) !== input.expectedGameVersion) tournamentFail('GAME_VERSION_CONFLICT', 'The match changed. Refresh before retrying.', 409);
    if (hasCompletedBracketDescendant(games, game.id)) tournamentFail('DOWNSTREAM_COMPLETE', 'A dependent bracket result is already complete.', 409);
    if (action === 'score' && game.isDisputed === true) tournamentFail('DISPUTE_OPEN', 'Resolve the open dispute before changing this score.', 409);
    if (action === 'dispute' && (game.isCompleted !== true || game.isDisputed === true)) tournamentFail('INVALID_DISPUTE', 'Only an undisputed completed result can be disputed.', 409);
    if (action === 'dispute') {
      const validation = validateBracketScoreSubmission(games, game.id, Number(game.score1), Number(game.score2));
      if (!validation.valid && validation.code === 'POOL_RESULTS_LOCKED') tournamentFail(validation.code, validation.message, 409);
    }
    if (action === 'resolve-dispute' && game.isDisputed !== true) tournamentFail('DISPUTE_NOT_FOUND', 'This match has no open dispute.', 409);
    if (resolution === 'uphold' && (game.isCompleted !== true || !tournamentScore(game.score1) || !tournamentScore(game.score2))) {
      tournamentFail('INVALID_PRIOR_RESULT', 'The disputed result is incomplete and cannot be upheld.', 409);
    }
    const priorScore = { home: Number(game.score1 || 0), away: Number(game.score2 || 0) };
    const priorGames = games.map(candidate => ({ ...candidate }));
    try {
      if (action === 'score' || resolution === 'correct') {
        const validation = validateBracketScoreSubmission(games, game.id, score!.home as number, score!.away as number);
        if (!validation.valid) tournamentFail(validation.code, validation.message, validation.code === 'MATCH_NOT_FOUND' ? 404 : validation.code === 'INVALID_SCORE' ? 400 : 409);
        games = recordTournamentScore(games, game.id, score!.home as number, score!.away as number, action === 'score' ? explicitWinner : undefined);
      } else if (action === 'dispute') {
        games = clearTournamentProgression(games, game);
        games[index] = { ...games[index], isDisputed: true };
      } else if (resolution === 'uphold') {
        games = recordTournamentScore(games, game.id, priorScore.home, priorScore.away);
      } else {
        games = clearTournamentProgression(games, game);
        games[index] = { ...games[index], score1: 0, score2: 0, isCompleted: false, isDisputed: false, winnerId: null } as TournamentGame;
      }
    } catch (error) {
      if (error instanceof TournamentScheduleDeploymentError) throw error;
      if (error instanceof BracketProgressionError) tournamentFail(error.code, error.message, 409);
      throw error;
    }
    const now = new Date().toISOString();
    games = games.map((candidate, candidateIndex) => {
      const before = priorGames[candidateIndex];
      const changed = JSON.stringify(candidate) !== JSON.stringify(before);
      return changed ? { ...candidate, gameVersion: Number(before?.gameVersion || 0) + 1, updatedAt: now } : candidate;
    }).map(candidate => Object.fromEntries(
      Object.entries(candidate).filter(([, value]) => value !== undefined),
    ) as TournamentGame);
    const updatedGame = games.find(candidate => candidate.id === input.gameId)!;
    const nextTieredPlayoffs = currentEvent.tournamentType === 'tiered_playoffs' && currentEvent.tieredPlayoffs
      ? game.phase === 'playoff'
        ? reconcileTieredAfterPlayoffMutation(currentEvent.tieredPlayoffs as TieredPlayoffsConfig, games)
        : reconcileTieredAfterPreliminaryMutation(currentEvent.tieredPlayoffs as TieredPlayoffsConfig, games)
      : currentEvent.tieredPlayoffs;
    const nextScheduleVersion = input.expectedScheduleVersion + 1;
    const resultingScore = updatedGame.isCompleted ? { home: Number(updatedGame.score1 || 0), away: Number(updatedGame.score2 || 0) } : null;
    transaction.update(eventRef, {
      tournamentGames: games, scheduleVersion: nextScheduleVersion, scheduleUpdatedAt: now, scheduleUpdatedBy: preflight.actorUid,
      ...(nextTieredPlayoffs ? { tieredPlayoffs: nextTieredPlayoffs } : {}),
      ...(migratedHash ? { credentialVersion: migratedCredentialVersion, scorekeeperConfigured: true, scoringCode: FieldValue.delete(), scoringCodeHash: FieldValue.delete() } : {}),
    });
    if (migratedHash) transaction.set(credentialRef, { ...currentCredential, teamId: input.teamId, eventId: input.eventId, scorekeeperCodeHash: migratedHash, credentialVersion: migratedCredentialVersion, updatedAt: now, migratedFromLegacy: true });
    transaction.create(eventRef.collection('scoreAudit').doc(identity.operationId), {
      operationId: identity.operationId, requestId: identity.requestId, action, gameId: input.gameId, actorUid: preflight.actorUid,
      lifecycleVersion: input.expectedLifecycleVersion, scheduleVersion: nextScheduleVersion, priorScore, resultingScore,
      priorState: { isCompleted: game.isCompleted === true, isDisputed: game.isDisputed === true, gameVersion: input.expectedGameVersion },
      resultingState: { isCompleted: updatedGame.isCompleted === true, isDisputed: updatedGame.isDisputed === true, gameVersion: updatedGame.gameVersion },
      notes, reason, resolution, bracketImpact: games.filter((candidate, candidateIndex) => JSON.stringify(candidate) !== JSON.stringify(priorGames[candidateIndex])).map(candidate => candidate.id),
      createdAt: now,
    });
    queueExternalEffect({ effectId: 'spectator-refresh', kind: 'tournament-spectator-refresh', payload: { teamId: input.teamId, eventId: input.eventId, scheduleVersion: nextScheduleVersion } });
    const tournament = JSON.parse(JSON.stringify(scorekeeperTournament(input.eventId, {
      ...currentEvent,
      tournamentGames: games,
      ...(nextTieredPlayoffs ? { tieredPlayoffs: nextTieredPlayoffs } : {}),
      scheduleVersion: nextScheduleVersion,
      credentialVersion: migratedCredentialVersion,
      scorekeeperConfigured: Boolean(migratedHash || currentCredential.scorekeeperCodeHash || currentEvent.scorekeeperConfigured),
    })));
    return { success: true, lifecycleVersion: input.expectedLifecycleVersion, scheduleVersion: nextScheduleVersion,
      credentialVersion: migratedCredentialVersion, gameVersion: Number(updatedGame.gameVersion || 0),
      tournament };
  }));
}

export const submitTournamentScore = (input: TournamentScoringCommand) => runTournamentScoringCommand(input, 'score');
export const openTournamentDispute = (input: TournamentScoringCommand) => runTournamentScoringCommand(input, 'dispute');
export const resolveTournamentDispute = (input: TournamentScoringCommand) => runTournamentScoringCommand(input, 'resolve-dispute');
