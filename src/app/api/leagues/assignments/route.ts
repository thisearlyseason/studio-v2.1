import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { verifyFirebaseToken, type DecodedToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { assertLeagueScheduleVersion, assertScheduleMutationLock, prepareLeagueProjectionClear, prepareLeagueScheduleClearUpdates, ScheduleDeploymentError, withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const ASSIGNABLE_PROTOCOLS = new Set(['player_config', 'individual_config', 'team_config']);
function validId(value: unknown): value is string { return typeof value === 'string' && ID_PATTERN.test(value); }
function conflict(message: string): never { throw new ScheduleDeploymentError('ASSIGNMENT_CONFLICT', message, 409); }
function version(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) throw new ScheduleDeploymentError('INVALID_VERSION', 'Current League and assignment versions are required.');
  return Number(value);
}
function applicantName(entry: DocumentData): string {
  const name = entry.answers?.fullName || entry.answers?.name || entry.answers?.teamName;
  return typeof name === 'string' ? name.trim().slice(0, 160) : 'New Applicant';
}
function errorResponse(error: unknown) {
  if (error instanceof ScheduleDeploymentError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'Only current authorized staff can manage this assignment.' }, { status: 403 });
  if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
  if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
  console.error('[leagues/assignments] Error:', error);
  return NextResponse.json({ error: 'Unable to update the league assignment.' }, { status: 503 });
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof Response) return auth;
  try {
    const teamId = req.nextUrl.searchParams.get('teamId');
    if (!validId(teamId)) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
    if (auth.signInProvider === 'anonymous') throw new Error('Forbidden competition mutation.');
    const assignments = await adminDb.runTransaction(async transaction => {
      await resolveCompetitionAuthority({ transaction, teamId, actorUid: auth.uid, actorRole: auth.role });
      const snapshot = await transaction.get(adminDb.collectionGroup('registrationEntries').where('assigned_team_id', '==', teamId).limit(200));
      const rows = await Promise.all(snapshot.docs.filter(document => document.data().status === 'assigned').map(async document => {
        const leagueId = document.ref.path.split('/')[1];
        if (!validId(leagueId) || document.ref.path !== `leagues/${leagueId}/registrationEntries/${document.id}`) return null;
        const league = await transaction.get(adminDb.collection('leagues').doc(leagueId));
        if (!league.exists || league.data()?.isArchived === true) return null;
        const entry = document.data();
        if (entry.league_id && entry.league_id !== leagueId) return null;
        return {
          id: document.id, league_id: leagueId, protocol_id: entry.protocol_id,
          status: 'assigned', assigned_team_id: teamId, answers: { fullName: applicantName(entry) },
          lifecycleVersion: league.data()?.lifecycleVersion ?? 0, assignmentVersion: entry.assignmentVersion ?? 0,
        };
      }));
      return rows.filter(Boolean);
    });
    return NextResponse.json({ assignments });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof Response) return auth;
  try {
    if (auth.signInProvider === 'anonymous') throw new Error('Forbidden competition mutation.');
    const limited = await enforceUserRateLimit(auth.uid, 'league-assignment', 200, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 10_000);
    const { leagueId, entryId, teamId, action } = body;
    if (!validId(leagueId) || !validId(entryId) || (action !== 'assign' && action !== 'respond') ||
        !(validId(teamId) || (action === 'assign' && teamId === null)) ||
        (action === 'respond' && body.status !== 'accepted' && body.status !== 'declined')) {
      return NextResponse.json({ error: 'Invalid league assignment.' }, { status: 400 });
    }
    const expectedVersion = version(body.expectedVersion);
    const expectedAssignmentVersion = version(body.expectedAssignmentVersion);
    const leagueRef = adminDb.collection('leagues').doc(leagueId);
    const entryRef = leagueRef.collection('registrationEntries').doc(entryId);
    const authorize = async (transaction: Transaction, actor: DecodedToken) => {
      await resolveCompetitionAuthority({ transaction, actorUid: actor.uid, actorRole: actor.role, ...(action === 'assign' ? { leagueId } : { teamId: teamId! }) });
      const league = await transaction.get(leagueRef);
      if (!league.exists) throw new ScheduleDeploymentError('LEAGUE_NOT_FOUND', 'League not found.', 404);
      // League tenant is server-owned. Responding staff authority belongs to the assigned squad.
      const tenantId = league.data()?.tenantId;
      if (typeof tenantId !== 'string' || !tenantId) conflict('The League requires an organizer ownership migration.');
      return tenantId;
    };
    const tenantId = await adminDb.runTransaction(transaction => authorize(transaction, auth));
    const payload = { leagueId, entryId, teamId, action, expectedVersion, expectedAssignmentVersion, ...(action === 'respond' ? { status: body.status } : {}) };
    const identity = canonicalCompetitionRequest({ requestId: String(body.requestId || ''), tenantId, kind: 'league.assignment', payload });
    const result = await withScheduleMutationLock(holder => runCompetitionOperation({
      actorUid: auth.uid, identity,
      authorizeTransaction: async transaction => {
        await assertScheduleMutationLock(transaction, holder);
        if (await authorize(transaction, auth) !== tenantId) conflict('The League tenant changed.');
      },
    }, async ({ transaction }) => {
      const [leagueSnapshot, entrySnapshot, privateSnapshot, teamSnapshot] = await Promise.all([
        transaction.get(leagueRef), transaction.get(entryRef), transaction.get(leagueRef.collection('private').doc('lifecycle')),
        teamId ? transaction.get(adminDb.collection('teams').doc(teamId)) : Promise.resolve(null),
      ]);
      if (!entrySnapshot.exists) throw new ScheduleDeploymentError('REGISTRATION_NOT_FOUND', 'Registration not found.', 404);
      const league = leagueSnapshot.data()!;
      const entry = entrySnapshot.data()!;
      assertLeagueScheduleVersion(league, expectedVersion);
      if ((entry.assignmentVersion ?? 0) !== expectedAssignmentVersion) conflict('This assignment changed. Refresh before responding.');
      if (entry.league_id && entry.league_id !== leagueId) conflict('The Registration belongs to another League.');
      if (!ASSIGNABLE_PROTOCOLS.has(entry.protocol_id)) conflict('This registration cannot be assigned.');
      if (entry.status === 'accepted') conflict('Accepted enrollment requires a dedicated enrollment-removal operation.');
      if (action === 'respond' && (entry.assigned_team_id !== teamId || entry.status !== 'assigned')) conflict('This assignment is no longer pending for your squad.');
      if (teamId && (!teamSnapshot?.exists || !league.teams?.[teamId])) conflict('Choose an enrolled platform squad.');
      const team = teamSnapshot?.data() || {};
      const nextStatus = action === 'respond' ? body.status as 'accepted' | 'declined' : teamId ? 'assigned' : 'pending';
      const recruitId = `recruit_${entryId}`;
      const schedule = Array.isArray(league.schedule) ? league.schedule : [];
      const affectsSchedule = entry.protocol_id === 'team_config' && schedule.some((game: DocumentData) =>
        [game.team1Id, game.team2Id].some(id => id === recruitId || id === teamId || id === entry.assigned_team_id));
      const clear = affectsSchedule ? await prepareLeagueProjectionClear(transaction, leagueId) : null;
      const now = new Date().toISOString();
      const rootUpdates: DocumentData = { lifecycleVersion: expectedVersion + 1 };
      const privateData = privateSnapshot.data() || {};
      if (entry.protocol_id !== 'team_config') {
        privateData.individualRecruits = {
          ...(privateData.individualRecruits || {}),
          [recruitId]: {
            ...(privateData.individualRecruits?.[recruitId] || {}),
            status: nextStatus, teamId, teamName: teamId ? String(team.teamName || team.name || 'Squad') : null,
          },
        };
      } else if (action === 'assign') {
        if (league.teams?.[recruitId]) rootUpdates[`teams.${recruitId}.status`] = nextStatus;
      } else if (action === 'respond') {
        if (nextStatus === 'accepted') {
          const existing = league.teams?.[teamId!] || {};
          const enrollment = { ...(league.teams?.[recruitId] || {}), ...existing };
          rootUpdates[`teams.${recruitId}`] = FieldValue.delete();
          rootUpdates[`teams.${teamId}`] = {
            ...Object.fromEntries(['division', 'origin', 'manual', 'signedAt'].filter(field => enrollment[field] !== undefined).map(field => [field, enrollment[field]])),
            teamName: String(team.teamName || team.name || 'Squad'), teamLogoUrl: String(team.teamLogoUrl || ''),
            status: 'accepted', wins: Number(existing.wins || 0), losses: Number(existing.losses || 0),
            ties: Number(existing.ties || 0), points: Number(existing.points || 0),
          };
          rootUpdates.memberTeamIds = [...new Set((Array.isArray(league.memberTeamIds) ? league.memberTeamIds : []).filter((id: string) => id !== recruitId).concat(teamId))];
        } else if (league.teams?.[recruitId]) rootUpdates[`teams.${recruitId}.status`] = 'declined';
      }
      if (clear) Object.assign(rootUpdates, prepareLeagueScheduleClearUpdates('clear', auth.uid, now));
      clear?.();
      transaction.update(entryRef, {
        assigned_team_id: teamId, assigned_team_owner_id: teamId ? team.ownerUserId || null : null,
        status: nextStatus, assignmentVersion: expectedAssignmentVersion + 1,
        assignmentUpdatedAt: now, assignmentUpdatedBy: auth.uid,
      });
      transaction.update(leagueRef, rootUpdates);
      if (entry.protocol_id !== 'team_config') transaction.set(leagueRef.collection('private').doc('lifecycle'), privateData);
      if (action === 'respond' && nextStatus === 'accepted' && teamSnapshot) transaction.update(teamSnapshot.ref, { [`leagueIds.${leagueId}`]: true });
      if (action === 'assign' && teamSnapshot) {
        const alertRef = teamSnapshot.ref.collection('alerts').doc(identity.operationId);
        transaction.set(alertRef, { id: alertRef.id, title: 'New League Assignment', message: `${applicantName(entry)} has been assigned to your squad by the league organizer.`, audience: 'coaches', targetUserId: null, createdAt: now, createdBy: auth.uid });
      }
      return { success: true, lifecycleVersion: expectedVersion + 1, assignmentVersion: expectedAssignmentVersion + 1 };
    }));
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
