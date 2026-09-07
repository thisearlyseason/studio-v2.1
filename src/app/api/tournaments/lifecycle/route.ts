import { NextRequest, NextResponse } from 'next/server';
import type { DocumentData, DocumentReference, Transaction } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { assertScheduleMutationLock, ScheduleDeploymentError, withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import { buildTournamentReplicationConfig, buildTournamentReplicationEvent, TOURNAMENT_BLUEPRINT_FIELDS } from '@/lib/server-tournament-replication';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { normalizeTeamEventInterval, teamEventConflictDates, teamEventIntervalsOverlap } from '@/lib/team-event-interval';
import { buildTeamEventBooking } from '@/lib/server-team-event-booking';

export const runtime = 'nodejs';
const ID = /^[A-Za-z0-9_-]{1,200}$/;
// Leave room below Firestore's 500-write ceiling for the receipt and audit.
const WRITE_BUDGET = 400;
const EDITABLE = new Set<string>([...TOURNAMENT_BLUEPRINT_FIELDS, 'title', 'isTournament', 'tournamentTeams', 'tournamentTeamsData']);
const SCHEDULE_FIELDS = new Set(['date', 'endDate', 'startTime', 'endTime', 'location', 'tournamentType', 'tournamentTeams', 'tournamentTeamsData', 'gameLength', 'breakLength', 'gamesPerTeam', 'maxDailyGamesPerTeam', 'poolCount', 'advancePerPool', 'dailyWindows', 'selectedFields', 'manualVenue']);
const REGISTRATION_FIELDS = new Set(['registrationCost', 'customFormFields', 'waiverIds', 'waiverDocuments', 'teamWaiverText']);
class LifecycleError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
function fail(message: string, status = 400): never { throw new LifecycleError(message, status); }
function record(value: unknown): DocumentData { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('A valid Tournament payload is required.'); return value as DocumentData; }
function day(value: unknown): string {
  const text = typeof value === 'string' ? value.split('T')[0] : '';
  const parsed = new Date(`${text}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) fail('Invalid Tournament date.');
  return text;
}
const normalized = (value: unknown) => String(value || '').trim().toLocaleLowerCase();
function editable(value: unknown): DocumentData {
  const data = record(value);
  if (Object.keys(data).some(key => !EDITABLE.has(key))) fail('Unsupported Tournament lifecycle field.');
  if (('isTournament' in data && data.isTournament !== true) || ('eventType' in data && data.eventType !== 'tournament')) fail('Tournament kind cannot change.');
  return data;
}
function validate(data: DocumentData, allowEmptyRoster = false): void {
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 200) fail('A Tournament title is required.');
  if (day(data.endDate || data.date) < day(data.date)) fail('Invalid Tournament date range.');
  if (!['round_robin', 'single_elimination', 'double_elimination', 'pool_play_knockout'].includes(data.tournamentType)) fail('Invalid Tournament format.');
  for (const [field, minimum, maximum] of [['gameLength', 1, 720], ['breakLength', 0, 720], ['gamesPerTeam', 1, 100], ['maxDailyGamesPerTeam', 1, 100]] as const) {
    if (!Number.isInteger(data[field]) || data[field] < minimum || data[field] > maximum) fail(`Invalid ${field}.`);
  }
  if (!Array.isArray(data.selectedFields) || !data.selectedFields.length || data.selectedFields.some((field: unknown) => typeof field !== 'string' || !field.trim()) || new Set(data.selectedFields.map(normalized)).size !== data.selectedFields.length) fail('Valid unique field resources are required.');
  if (!Array.isArray(data.dailyWindows) || !data.dailyWindows.length) fail('Daily Tournament windows are required.');
  for (const window of data.dailyWindows) {
    if (!window || day(window.date) < day(data.date) || day(window.date) > day(data.endDate || data.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.endTime) || window.startTime >= window.endTime) fail('Invalid Tournament daily window.');
  }
  const teams = data.tournamentTeamsData;
  if (!Array.isArray(teams) || teams.length > 64 || (!allowEmptyRoster && teams.length < 2)) fail('A Tournament requires 2–64 teams.');
  if (teams.some(team => !team || !ID.test(team.id) || typeof team.name !== 'string' || !team.name.trim()) || new Set(teams.map(team => team.id)).size !== teams.length || new Set(teams.map(team => normalized(team.name))).size !== teams.length) fail('Tournament teams require unique identities and names.');
  if (teams.length > 1 && data.tournamentType === 'round_robin' && (teams.length * data.gamesPerTeam) % 2 !== 0) fail('This team count cannot each play the requested number of games.');
  if (teams.length && data.tournamentType === 'double_elimination' && (teams.length & (teams.length - 1)) !== 0) fail('Double elimination requires a power-of-two team count.');
  if (teams.length && data.tournamentType === 'pool_play_knockout' && (!Number.isInteger(data.poolCount) || data.poolCount < 2 || data.poolCount > Math.floor(teams.length / 2) || !Number.isInteger(data.advancePerPool) || data.advancePerPool < 1 || data.advancePerPool > Math.floor(teams.length / data.poolCount))) fail('Invalid Tournament pool topology.');
}
function assertAdvancedEntitlement(team: DocumentData, data: DocumentData): void {
  if (team.isPro !== true && data.tournamentType !== 'round_robin') fail('This squad plan supports basic Round Robin tournaments only.', 403);
}
function hasSchedule(event: DocumentData): boolean {
  return Boolean(event.tournamentGames?.length || event.schedule?.length || event.deploymentStatus === 'deployed' || event.bracketStatus === 'ready');
}
function scheduleValue(event: DocumentData, key: string): unknown {
  if (key === 'date' || key === 'endDate') return day(event[key] || event.date);
  if (key === 'tournamentTeamsData') return (event.tournamentTeamsData || []).map((team: DocumentData) => [team.id, team.name, team.teamId || '', team.division || '', team.pool ?? null, team.seed ?? null]);
  if ((key === 'poolCount' || key === 'advancePerPool') && event.tournamentType !== 'pool_play_knockout') return null;
  return event[key];
}
async function configs(transaction: Transaction, ref: DocumentReference) {
  const snapshots = await transaction.get(ref.collection('registration').limit(WRITE_BUDGET));
  if (snapshots.size >= WRITE_BUDGET) fail('Tournament exceeds the atomic lifecycle write budget.', 409);
  return snapshots.docs;
}

async function prepareBooking(transaction: Transaction, teamId: string, eventId: string, event: DocumentData, now: string) {
  const interval = normalizeTeamEventInterval(event);
  if (!interval) {
    if (event.startTime || event.endTime) fail('Invalid Tournament event time.');
    return null;
  }
  const bookingId = `team_event_${teamId}_${eventId}`;
  const events = await transaction.get(adminDb.collection('teams').doc(teamId).collection('events'));
  if (events.docs.some(doc => doc.id !== eventId && doc.data().isArchived !== true && teamEventIntervalsOverlap(interval, normalizeTeamEventInterval(doc.data())))) fail('This Tournament conflicts with an existing squad event.', 409);
  for (const date of teamEventConflictDates(interval)) {
    const bookings = await transaction.get(adminDb.collection('scheduleBookings').where('date', '==', date));
    for (const booking of bookings.docs) {
      if (booking.id === bookingId) continue;
      const data = booking.data();
      if (!teamEventIntervalsOverlap(interval, { date: String(data.date), startMinute: Number(data.startMinute), endMinute: Number(data.endMinute) })) continue;
      if (data.teamIds?.includes(teamId) || (event.resourceId && event.resourceId === data.resourceId) || (event.location && normalized(event.location) === normalized(data.location))) fail('This Tournament conflicts with a team or facility booking.', 409);
    }
  }
  return buildTeamEventBooking({ bookingId, teamId, eventId, event, interval, now });
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'tournament-lifecycle', 60, 60 * 60 * 1000); if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 100_000);
    const action = String(body.action), teamId = String(body.teamId || ''), eventId = String(body.eventId || '');
    if (!['create', 'configure', 'replicate', 'archive', 'delete'].includes(action) || !ID.test(teamId) || (action !== 'create' && !ID.test(eventId))) fail('Invalid Tournament lifecycle request.');
    if (Object.keys(body).some(key => !['action', 'requestId', 'teamId', 'eventId', 'expectedVersion', 'payload'].includes(key))) fail('Unsupported Tournament request field.');
    if (action !== 'create' && (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 0)) fail('A current Tournament version is required.');
    const payload = record(body.payload);
    const identity = canonicalCompetitionRequest({ requestId: String(body.requestId || ''), tenantId: teamId, kind: 'tournament-lifecycle', payload: body });
    const teamRef = adminDb.collection('teams').doc(teamId), eventRef = teamRef.collection('events').doc(eventId || '_new');
    const result = await withScheduleMutationLock(holder => runCompetitionOperation({
      actorUid: auth.uid, identity,
      authorizeTransaction: async transaction => {
        await assertScheduleMutationLock(transaction, holder);
        await resolveCompetitionAuthority({ transaction, actorUid: auth.uid, actorRole: auth.role, teamId, domain: 'tournament' });
        // Domain entitlement and tenant are current even when returning a receipt.
        const team = (await transaction.get(teamRef)).data() || {};
        if (action === 'create') for (const division of Array.isArray(payload.divisions) ? payload.divisions : []) assertAdvancedEntitlement(team, record(division));
        if (action === 'replicate' || action === 'configure') {
          const current = await transaction.get(eventRef);
          if (current.exists) assertAdvancedEntitlement(team, { ...current.data(), ...payload });
        }
      },
    }, async ({ transaction }) => {
      const team = (await transaction.get(teamRef)).data() || {};
      const sourceSnapshot = action === 'create' ? null : await transaction.get(eventRef);
      const source = sourceSnapshot?.data() || {};
      if (action !== 'create') {
        if (!sourceSnapshot?.exists || source.isTournament !== true) fail('Tournament not found.', 404);
        if (source.teamId && source.teamId !== teamId) fail('Tournament tenant mismatch.', 403);
        if ((source.lifecycleVersion ?? 0) !== body.expectedVersion) fail('Tournament changed. Refresh before retrying.', 409);
        if (source.isArchived === true && !['delete', 'replicate'].includes(action)) fail('Tournament is archived.', 409);
      }
      const now = new Date().toISOString();
      const version = Number(source.lifecycleVersion || 0) + 1;
      const auditRef = adminDb.collection('tournamentLifecycleAudits').doc(identity.operationId);
      if (action === 'create' || action === 'replicate') {
        let definitions: DocumentData[];
        let sourceConfigs: Awaited<ReturnType<typeof configs>> = [];
        if (action === 'create') {
          if (Object.keys(payload).some(key => key !== 'divisions') || !Array.isArray(payload.divisions) || !payload.divisions.length) fail('Tournament divisions are required.');
          definitions = payload.divisions.map((value: unknown) => editable(value));
        } else {
          if (Object.keys(payload).some(key => key !== 'title')) fail('A replica accepts only its new title.');
          definitions = [{ ...source, title: payload.title }];
          sourceConfigs = await configs(transaction, eventRef);
        }
        if (definitions.length * 4 + sourceConfigs.length + 2 > WRITE_BUDGET) fail('Tournament exceeds the atomic lifecycle write budget.');
        const existing = await transaction.get(teamRef.collection('events'));
        const names = new Set<string>();
        for (const definition of definitions) {
          validate(definition, action === 'replicate'); assertAdvancedEntitlement(team, definition);
          const name = `${normalized(definition.title)}:${normalized(definition.divisionTitle)}`;
          if (names.has(name) || existing.docs.some(doc => doc.data().isTournament === true && `${normalized(doc.data().title)}:${normalized(doc.data().divisionTitle)}` === name)) fail('A Tournament with this title and division already exists.', 409);
          names.add(name);
        }
        const prepared = definitions.map((definition, index) => {
          const id = `trn_${identity.operationId.slice(12)}_${index}`;
          const registrationCode = `T${identity.operationId.slice(12, 32).toUpperCase()}${index}`;
          const event = buildTournamentReplicationEvent({ source: definition, title: definition.title, eventId: id, teamId, actorUid: auth.uid, ownerUserId: String(team.ownerUserId || auth.uid), registrationCode, now });
          if (action === 'create') { event.tournamentTeamsData = definition.tournamentTeamsData; event.tournamentTeams = definition.tournamentTeamsData.map((value: DocumentData) => value.name); }
          return { ref: teamRef.collection('events').doc(id), id, registrationCode, event: { ...event, lifecycleVersion: 1 } };
        });
        for (const item of prepared) {
          for (const ref of [item.ref, adminDb.collection('tournamentRegistrationCodes').doc(item.id), adminDb.collection('tournamentRegistrationCodes').doc(item.registrationCode)]) if ((await transaction.get(ref)).exists) fail('Tournament identity collision.', 409);
        }
        const bookings = await Promise.all(prepared.map(item => prepareBooking(transaction, teamId, item.id, item.event, now)));
        for (let a = 0; a < prepared.length; a++) for (let b = a + 1; b < prepared.length; b++) {
          if (teamEventIntervalsOverlap(normalizeTeamEventInterval(prepared[a].event), normalizeTeamEventInterval(prepared[b].event))) fail('Timed Tournament divisions overlap.', 409);
        }
        for (const item of prepared) {
          transaction.create(item.ref, item.event);
          for (const code of [item.id, item.registrationCode]) transaction.create(adminDb.collection('tournamentRegistrationCodes').doc(code), { teamId, eventId: item.id, updatedAt: now });
          // The configuration itself is accepted Registration data: retain its IDs,
          // schema and fees, while requiring explicit activation for the new event.
          for (const config of sourceConfigs) transaction.create(item.ref.collection('registration').doc(config.id), buildTournamentReplicationConfig(config.data()));
        }
        for (const booking of bookings) if (booking) transaction.create(adminDb.collection('scheduleBookings').doc(String(booking.id)), booking);
        transaction.create(auditRef, { action, actorUid: auth.uid, teamId, eventIds: prepared.map(item => item.id), createdAt: now });
        return { success: true, operationState: 'complete', eventId: prepared[0].id, eventIds: prepared.map(item => item.id), lifecycleVersion: 1 };
      }
      const registration = await configs(transaction, eventRef);
      if (action === 'configure') {
        const changes = editable(payload), next = { ...source, ...changes };
        validate(next, !hasSchedule(source)); assertAdvancedEntitlement(team, next);
        const changed = Object.keys(changes).filter(key => JSON.stringify(source[key]) !== JSON.stringify(changes[key]));
        if (hasSchedule(source) && changed.some(key => SCHEDULE_FIELDS.has(key) && JSON.stringify(scheduleValue(source, key)) !== JSON.stringify(scheduleValue(next, key)))) fail('Clear the existing schedule through Tournament scheduling before changing its configuration.', 409);
        const entries = await transaction.get(eventRef.collection('registrationEntries').limit(1));
        if ((registration.length || !entries.empty) && changed.some(key => REGISTRATION_FIELDS.has(key))) fail('Accepted Registration configuration must be edited through Registration.', 409);
        const siblings = await transaction.get(teamRef.collection('events'));
        if (siblings.docs.some(doc => doc.id !== eventId && doc.data().isTournament === true && normalized(doc.data().title) === normalized(next.title) && normalized(doc.data().divisionTitle) === normalized(next.divisionTitle))) fail('A Tournament with this title and division already exists.', 409);
        const booking = await prepareBooking(transaction, teamId, eventId, next, now);
        transaction.update(eventRef, { ...changes, lifecycleVersion: version, updatedAt: now });
        const bookingRef = adminDb.collection('scheduleBookings').doc(`team_event_${teamId}_${eventId}`);
        if (booking) transaction.set(bookingRef, booking); else transaction.delete(bookingRef);
      } else {
        if (Object.keys(payload).length) fail('Archive and delete do not accept configuration changes.');
        const bookings = await transaction.get(adminDb.collection('scheduleBookings').where('sourceId', '==', `tournament:${teamId}:${eventId}`));
        const calendarBooking = adminDb.collection('scheduleBookings').doc(`team_event_${teamId}_${eventId}`);
        const mappings = await transaction.get(adminDb.collection('tournamentRegistrationCodes').where('eventId', '==', eventId));
        if (bookings.size + registration.length + mappings.size + 4 > WRITE_BUDGET) fail('Tournament exceeds the atomic lifecycle write budget.', 409);
        if (action === 'delete') {
          const dependencies = await Promise.all(['registrationEntries', 'registrations', 'archived_waivers', 'brackets', 'scores', 'audit', 'scoreAudit', 'disputes'].map(name => transaction.get(eventRef.collection(name).limit(1))));
          if (registration.length || dependencies.some(snapshot => !snapshot.empty) || hasSchedule(source) || source.registrationCount > 0 || source.registrationEntryCount > 0 || Object.keys(source.teamAgreements || {}).length || source.archived_waivers?.length) fail('This Tournament has retained Registration or competition history. Archive it instead.', 409);
          transaction.delete(eventRef);
        } else {
          for (const config of registration) transaction.update(config.ref, { is_active: false });
          transaction.update(eventRef, { isArchived: true, lifecycleVersion: version, scheduleArchivedAt: now, scheduleArchivedBy: auth.uid, updatedAt: now });
        }
        for (const booking of bookings.docs) transaction.delete(booking.ref);
        transaction.delete(calendarBooking);
        for (const mapping of mappings.docs) if (mapping.data().teamId === teamId) transaction.delete(mapping.ref);
      }
      transaction.create(auditRef, { action, teamId, eventId, actorUid: auth.uid, lifecycleVersion: version, createdAt: now });
      return { success: true, operationState: 'complete', eventId, lifecycleVersion: version, ...(action === 'delete' ? { deleted: true } : {}) };
    }));
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = error instanceof LifecycleError || error instanceof RequestBodyError || error instanceof ScheduleDeploymentError ? error.status : message.startsWith('Forbidden') ? 403 : message === 'Request collision.' ? 409 : message.startsWith('Invalid competition') ? 400 : 500;
    if (status === 500) console.error('[tournament lifecycle] Operation failed:', message);
    return NextResponse.json({ error: status === 500 ? 'Unable to complete Tournament lifecycle operation. Retry the same request.' : message }, { status });
  }
}
