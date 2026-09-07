import { createHash } from 'node:crypto';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';
import { authorizeDashboardRoute } from '@/lib/dashboard-route-policy';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { hashLeagueScorekeeperPin, verifyLeagueScorekeeperPin } from '@/lib/server-competition-credential';
import { assertScheduleMutationLock, withScheduleMutationLock, ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import { leagueBillingOwnerUserId, scorekeeperLeague } from '@/lib/public-portal-data';
import { publicLeagueGameProjection, recalculatePublicLeagueStandings, leagueGameVersionFloor } from '@/lib/public-league-scoring';

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

/** Every caller reads lifecycle and the canonical billing owner in its transaction. */
export async function readActiveScoringLeague(transaction: Transaction, leagueId: string): Promise<Data> {
  const snapshot = await transaction.get(adminDb.collection('leagues').doc(leagueId));
  if (!snapshot.exists) fail('League not found.', 404);
  const league = snapshot.data()!;
  if (league.isArchived === true || league.is_active === false || league.isDeleted === true) fail('League portal is inactive.', 404);
  const ownerId = leagueBillingOwnerUserId(league);
  if (!ownerId) fail('League billing owner is unavailable.', 403);
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
