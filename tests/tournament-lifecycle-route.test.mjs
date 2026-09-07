import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute, communicationRequest } from './helpers/communication-route-harness.mjs';
process.env.RESEND_API_KEY = 're_test_local_only'; // Resend SDK is replaced at the test network boundary.

const seed = {
  'teams/team-a': { ownerUserId: 'owner', planId: 'elite_squad', isPro: true },
  'teams/team-a/members/staff': { userId: 'staff', position: 'Coach', status: 'active' },
  'teams/team-b': { ownerUserId: 'other', planId: 'elite_squad', isPro: true },
};
const blueprint = { title: 'Cup', date: '2026-10-01', endDate: '2026-10-01', eventType: 'tournament', isTournament: true,
  tournamentType: 'round_robin', tournamentTeamsData: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], tournamentTeams: ['Alpha', 'Beta'],
  gameLength: 30, breakLength: 5, gamesPerTeam: 1, maxDailyGamesPerTeam: 2, selectedFields: ['Field A'],
  dailyWindows: [{ date: '2026-10-01', startTime: '09:00', endTime: '17:00' }], divisionTitle: 'Gold',
};
const create = (changes = {}) => ({ action: 'create', requestId: 'create-cup-0001', teamId: 'team-a', payload: { divisions: [{ ...blueprint, ...changes }] } });
async function call(db, body, uid = 'owner', routePath) {
  const app = await loadCommunicationRoute(routePath || '../../src/app/api/tournaments/lifecycle/route.ts', db, { uid });
  try {
    const response = await app.route.POST(communicationRequest(body));
    return { status: response.status, body: await response.json() };
  } finally { app.dispose(); }
}

test('Starter cannot create an advanced Tournament format', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a': { ownerUserId: 'owner', planId: 'starter_squad' } });
  assert.equal((await call(db, create({ tournamentType: 'single_elimination' }))).status, 403);
  assert.equal([...records.keys()].some(path => path.includes('/events/')), false);
});

test('advanced formats require the current squad Pro allocation even with a paid-looking plan label', async () => {
  const { db } = communicationDb({ ...seed, 'teams/team-a': { ownerUserId: 'owner', planId: 'elite_squad', isPro: false } });
  assert.equal((await call(db, create({ tournamentType: 'single_elimination' }))).status, 403);
});

test('create replay has deterministic divisions and a payload collision cannot append events', async () => {
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const body = create(); body.payload.divisions.push({ ...blueprint, divisionTitle: 'Silver' });
  const a = await call(db, body), b = await call(db, body);
  assert.equal(a.status, 200); assert.deepEqual(b.body, a.body);
  assert.equal([...records.keys()].filter(path => /^teams\/team-a\/events\/[^/]+$/.test(path)).length, 2);
  assert.equal((await call(db, { ...body, payload: { divisions: [{ ...blueprint, title: 'Different' }] } })).status, 409);
});

test('invalid topology and duplicate names are rejected without partial creation', async () => {
  for (const change of [{ tournamentType: 'unknown' }, { gameLength: 0 }, { selectedFields: [] }, { tournamentTeamsData: [{ id: 'a', name: 'A' }, { id: 'a', name: 'B' }] }, { tournamentTeamsData: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], gamesPerTeam: 1 }]) {
    const { db, records } = communicationDb(seed);
    assert.equal((await call(db, create(change))).status, 400);
    assert.equal([...records.keys()].some(path => path.includes('/events/')), false);
  }
  const { db } = communicationDb({ ...seed, 'teams/team-a/events/existing': { ...blueprint, teamId: 'team-a' } });
  assert.equal((await call(db, create())).status, 409);
});

test('a transaction-time organizer demotion prevents create', async () => {
  const { db } = communicationDb(seed, { beforeTransaction({ records }) { records.set('teams/team-a/members/staff', { userId: 'staff', role: 'player', status: 'removed' }); } });
  assert.equal((await call(db, create(), 'staff')).status, 403);
});

test('bounded multi-division commit failure leaves no events or successful receipt and retries atomically', async () => {
  const { db, records } = communicationDb(seed);
  const original = db.runTransaction.bind(db); let fail = true;
  db.runTransaction = work => original(async tx => { let eventWrites = 0; const result = await work({ ...tx, create(ref, value) { if (ref.path.includes('/events/')) eventWrites++; return tx.create(ref, value); }, set(ref, value) { if (ref.path.includes('/events/')) eventWrites++; return tx.set(ref, value); } }); if (fail && eventWrites > 1) throw Error('Injected atomic commit failure'); return result; });
  const body = create(); body.payload.divisions.push({ ...blueprint, divisionTitle: 'Silver' });
  assert.equal((await call(db, body)).status, 500);
  assert.equal([...records.keys()].some(path => path.includes('/events/') || path.startsWith('competitionOperations/') || path.startsWith('competitionOperationOutbox/')), false);
  assert.equal(db.notifications.length, 0); assert.equal(db.emails.length, 0);
  fail = false; const result = await call(db, body);
  assert.equal(result.status, 200); assert.equal(result.body.operationState, 'complete'); assert.equal(result.body.eventIds.length, 2);
});

test('configure preserves Registration identities and schedules; schedule-sensitive edits fail atomically', async () => {
  const event = { ...blueprint, teamId: 'team-a', lifecycleVersion: 3, tournamentGames: [{ id: 'g' }], registrationCode: 'ACCEPTED' };
  const config = { is_active: true, form_id: 'f', fee_id: 'fee', waiver_ids: ['w'], form_version: 4, config_hash: 'hash' };
  const entry = { id: 'e', fee_id: 'fee', form_id: 'f', waiver_id: 'w', responses: { private: 'answer' } };
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': event, 'teams/team-a/events/cup/registration/config': config, 'teams/team-a/events/cup/registrationEntries/e': entry });
  const body = { action: 'configure', requestId: 'configure-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 3, payload: { description: 'Updated' } };
  assert.equal((await call(db, body)).status, 200);
  assert.deepEqual(records.get('teams/team-a/events/cup/registration/config'), config); assert.deepEqual(records.get('teams/team-a/events/cup/registrationEntries/e'), entry);
  assert.deepEqual(records.get('teams/team-a/events/cup').tournamentGames, [{ id: 'g' }]);
  const before = structuredClone([...records]);
  assert.equal((await call(db, { ...body, requestId: 'configure-cup-0002', expectedVersion: 4, payload: { gameLength: 40 } })).status, 409);
  assert.deepEqual([...records], before);
});

test('archive atomically cancels portal activation and bookings while retaining Registration and audit data', async () => {
  const entry = { form_id: 'form', fee_id: 'fee', waiver_id: 'waiver', responses: { private: 'answer' } };
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 0, registrationCode: 'CUPCODE' },
    'teams/team-a/events/cup/registration/config': { is_active: true, form_id: 'form', fee_id: 'fee' }, 'teams/team-a/events/cup/registrationEntries/e': entry,
    'tournamentRegistrationCodes/CUPCODE': { teamId: 'team-a', eventId: 'cup' }, 'scheduleBookings/game': { sourceId: 'tournament:team-a:cup' } });
  const body = { action: 'archive', requestId: 'archive-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 0, payload: {} };
  assert.equal((await call(db, body, 'other')).status, 403);
  assert.equal((await call(db, body, 'staff')).status, 200);
  assert.equal(records.get('teams/team-a/events/cup').isArchived, true); assert.equal(records.get('teams/team-a/events/cup/registration/config').is_active, false);
  assert.deepEqual(records.get('teams/team-a/events/cup/registrationEntries/e'), entry); assert.equal(records.has('scheduleBookings/game'), false); assert.equal(records.has('tournamentRegistrationCodes/CUPCODE'), false);
  assert.equal((await call(db, { ...body, action: 'delete', requestId: 'delete-cup-0001', expectedVersion: 1 })).status, 409);
});

test('delete empty Tournament replays after removal and rechecks current authority', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 0, tournamentTeamsData: [], tournamentTeams: [] } });
  const body = { action: 'delete', requestId: 'delete-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 0, payload: {} };
  const a = await call(db, body, 'staff'); assert.equal(a.status, 200); assert.equal(records.has('teams/team-a/events/cup'), false);
  assert.deepEqual((await call(db, body, 'staff')).body, a.body);
  records.set('teams/team-a/members/staff', { role: 'player', status: 'removed' }); assert.equal((await call(db, body, 'staff')).status, 403);
});

test('legacy event endpoint cannot create, convert, delete or replicate Tournament lifecycle state', async () => {
  for (const body of [
    { action: 'create', event: { ...blueprint, startTime: '09:00', endTime: '10:00' } },
    { action: 'update', eventId: 'cup', event: { title: 'Renamed' } },
    { action: 'delete', eventId: 'cup' }, { action: 'replicate', eventId: 'cup', title: 'Replica' },
    { action: 'create-series', event: { ...blueprint, startTime: '09:00', endTime: '10:00' }, recurrence: { frequency: 'weekly', count: 2 } },
  ]) {
    const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a' } });
    const before = structuredClone([...records]);
    const result = await call(db, { ...body, teamId: 'team-a' }, 'owner', '../../src/app/api/teams/events/action/route.ts');
    assert.equal(result.status, 410); assert.deepEqual([...records], before);
  }
});

test('legacy schedule DELETE rejects destructive work without identity and version', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a' } });
  const app = await loadCommunicationRoute('../../src/app/api/tournaments/schedule/route.ts', db, { uid: 'owner' });
  try {
    const response = await app.route.DELETE(communicationRequest({ teamId: 'team-a', eventId: 'cup', action: 'delete' }));
    assert.ok([400, 410].includes(response.status)); assert.equal(records.has('teams/team-a/events/cup'), true);
  } finally { app.dispose(); }
});

test('replica keeps accepted config IDs but resets activation and excludes credentials, private submissions and audits', async () => {
  const sourceConfig = { title: 'Signup', is_active: true, form_id: 'accepted-form', fee_id: 'accepted-fee', form_schema: [{ id: 'accepted-field' }], selected_team_waivers: ['accepted-waiver'], scoringCode: 'PRIVATE', privateAudit: ['private'] };
  const { db, records } = communicationDb({ ...seed,
    'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 2, scoringCode: 'SECRET', tournamentGames: [{ id: 'old' }], registrationCount: 5 },
    'teams/team-a/events/cup/registration/team_config': sourceConfig,
    'teams/team-a/events/cup/registrationEntries/private': { responses: 'private' },
  });
  const result = await call(db, { action: 'replicate', requestId: 'replicate-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 2, payload: { title: 'New Cup' } });
  assert.equal(result.status, 200);
  const root = `teams/team-a/events/${result.body.eventId}`;
  const event = records.get(root), config = records.get(`${root}/registration/team_config`);
  assert.deepEqual(event.tournamentGames, []); assert.deepEqual(event.tournamentTeamsData, []); assert.equal(event.scoringCode, undefined);
  assert.equal(config.is_active, false); assert.equal(config.form_id, 'accepted-form'); assert.equal(config.fee_id, 'accepted-fee'); assert.deepEqual(config.selected_team_waivers, ['accepted-waiver']);
  assert.equal(config.scoringCode, undefined); assert.equal(config.privateAudit, undefined);
  assert.equal([...records.keys()].some(path => path.startsWith(`${root}/registrationEntries/`)), false);
  assert.deepEqual(records.get('teams/team-a/events/cup/registration/team_config'), sourceConfig);
});

test('timed lifecycle creation records a booking and refuses a conflicting replica without partial state', async () => {
  const { db, records } = communicationDb(seed);
  const created = await call(db, create({ startTime: '09:00', endTime: '10:00', location: 'Central Fields' }));
  assert.equal(created.status, 200);
  const eventId = created.body.eventId;
  assert.equal(records.has(`scheduleBookings/team_event_team-a_${eventId}`), true);
  const before = structuredClone([...records]);
  const replica = await call(db, { action: 'replicate', requestId: 'timed-replica-0001', teamId: 'team-a', eventId, expectedVersion: 1, payload: { title: 'Conflicting Cup' } });
  assert.equal(replica.status, 409); assert.deepEqual([...records], before);
});

test('a stale Registration configuration save cannot reactivate an archived Tournament', async () => {
  const config = { is_active: false, form_id: 'accepted-form', fee_id: 'accepted-fee', form_version: 1, config_hash: 'hash' };
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, isArchived: true }, 'teams/team-a/events/cup/registration/team_config': config });
  const result = await call(db, { targetKind: 'tournament', targetId: 'team-a', eventId: 'cup', configId: 'team_config', expectedVersion: 1, expectedHash: 'hash', config: { title: 'Signup', type: 'team', is_active: true, form_schema: [] } }, 'owner', '../../src/app/api/registrations/config/route.ts');
  assert.equal(result.status, 409); assert.deepEqual(records.get('teams/team-a/events/cup/registration/team_config'), config);
});

test('invalid calendar dates fail validation', async () => {
  const bad = communicationDb(seed);
  assert.equal((await call(bad.db, create({ date: '2026-99-99' }))).status, 400);
});

test('scheduled cosmetic roster edits preserve fixtures and calendar-day equivalence', async () => {
  const games = [{ id: 'g', team1Id: 'a', team2Id: 'b' }];
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 1, tournamentGames: games } });
  const updatedTeams = blueprint.tournamentTeamsData.map(team => ({ ...team, logoUrl: 'https://example.test/logo.png' }));
  const result = await call(db, { action: 'configure', requestId: 'cosmetic-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 1, payload: { date: '2026-10-01T18:00:00.000Z', tournamentTeamsData: updatedTeams, description: 'Updated' } });
  assert.equal(result.status, 200); assert.deepEqual(records.get('teams/team-a/events/cup').tournamentGames, games);
});

test('archive revalidates actor, tenant and version in its committing transaction', async () => {
  for (const [change, status] of [
    [records => records.set('teams/team-a/members/staff', { position: 'Player', status: 'removed' }), 403],
    [records => records.set('teams/team-a/events/cup', { ...records.get('teams/team-a/events/cup'), teamId: 'team-b' }), 403],
    [records => records.set('teams/team-a/events/cup', { ...records.get('teams/team-a/events/cup'), lifecycleVersion: 2 }), 409],
  ]) {
    let attempts = 0;
    const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 1 } }, { beforeTransaction({ records }) { if (++attempts === 2) change(records); } });
    assert.equal((await call(db, { action: 'archive', requestId: 'race-archive-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 1, payload: {} }, 'staff')).status, status);
    assert.notEqual(records.get('teams/team-a/events/cup').isArchived, true);
    assert.equal([...records.keys()].some(path => path.startsWith('competitionOperations/')), false);
  }
});

test('description-only configure of a timed scheduled Tournament ignores its own game bookings', async () => {
  const event = { ...blueprint, teamId: 'team-a', lifecycleVersion: 1, startTime: '09:00', endTime: '17:00', location: 'Central Fields', tournamentGames: [{ id: 'game', date: '2026-10-01', time: '09:00' }] };
  const ownedBooking = { sourceId: 'tournament:team-a:cup', teamIds: ['team-a'], location: 'Central Fields', date: '2026-10-01', startMinute: 540, endMinute: 570 };
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/events/cup': event, 'scheduleBookings/game': ownedBooking });
  const result = await call(db, { action: 'configure', requestId: 'timed-description-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 1, payload: { description: 'Updated only' } });
  assert.equal(result.status, 200);
  assert.equal(records.get('teams/team-a/events/cup').description, 'Updated only');
  assert.deepEqual(records.get('teams/team-a/events/cup').tournamentGames, event.tournamentGames);
  assert.deepEqual(records.get('scheduleBookings/game'), ownedBooking);
});

for (const [kind, history] of [
    ['current responses', { 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 1, userRsvps: { member: 'going' } } }],
    ['immutable audit', { 'teams/team-a/events/cup': { ...blueprint, teamId: 'team-a', lifecycleVersion: 1 }, 'teams/team-a/events/cup/rsvpAudit/receipt': { actorUid: 'member', status: 'going', requestId: 'accepted-rsvp' } }],
  ]) {
  test(`Tournament delete preserves RSVP ${kind} and requires archive`, async () => {
    const { db, records } = communicationDb({ ...seed, ...history });
    const before = structuredClone([...records]);
    const input = { action: 'delete', requestId: 'delete-rsvp-cup-0001', teamId: 'team-a', eventId: 'cup', expectedVersion: 1, payload: {} };
    assert.equal((await call(db, input)).status, 409); assert.deepEqual([...records], before);
    assert.equal((await call(db, { ...input, action: 'archive', requestId: 'archive-rsvp-cup-0001' })).status, 200);
    for (const [path, value] of Object.entries(history)) {
      if (path.endsWith('/cup')) assert.deepEqual(records.get(path).userRsvps, value.userRsvps);
      else assert.deepEqual(records.get(path), value);
    }
  });
}

test('Tournament creation queues one server-owned push/email effect and replay cannot duplicate it', async () => {
  const { db, records } = communicationDb({ ...seed,
    'teams/team-a/members/member': { userId: 'member', position: 'Player', status: 'active', email: 'member@example.test' },
    'teams/team-a/members/removed': { userId: 'removed', position: 'Player', status: 'removed' },
  });
  const body = create(); body.payload.divisions.push({ ...blueprint, divisionTitle: 'Silver' });
  const first = await call(db, body), replay = await call(db, body);
  assert.equal(first.status, 200); assert.deepEqual(replay.body, first.body);
  const effects = [...records.values()].filter(value => value.kind === 'tournament-created-notification');
  assert.equal(effects.length, 1);
  assert.equal(db.notifications.length, 1);
  assert.deepEqual(db.notifications[0].recipientUserIds.sort(), ['member', 'staff']);
  assert.equal(db.emails.length, 1);
  assert.deepEqual(db.emails[0].messages[0].to, ['member@example.test']);
  assert.equal(effects[0].status, 'delivered');
  assert.deepEqual(effects[0].payload.eventIds, first.body.eventIds);
  assert.deepEqual(effects[0].payload.channels, ['push', 'email']);
  assert.equal(effects[0].payload.teamId, 'team-a');
});

test('notification provider failure retains the Tournament and retries only the failed channel', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/members/member': { userId: 'member', status: 'active', email: 'member@example.test' } });
  db.emailSendFailure = 'Injected email provider rejection';
  const body = create();
  assert.equal((await call(db, body)).status, 200);
  const effects = () => [...records.values()].filter(value => value.kind === 'tournament-created-notification');
  assert.equal(effects()[0].status, 'failed'); assert.equal(db.notifications.length, 1);
  db.emailSendFailure = null;
  assert.equal((await call(db, body)).status, 200);
  assert.equal(effects()[0].status, 'delivered'); assert.equal(db.notifications.length, 1); assert.equal(db.emails.length, 2);
  assert.equal((await call(db, body)).status, 200); assert.equal(db.emails.length, 2);
});

test('partial push delivery does not block email or repeat successful pushes on email retry', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/members/member': { userId: 'member', status: 'active', email: 'member@example.test' } });
  const effect = () => [...records.values()].find(value => value.kind === 'tournament-created-notification');
  db.notificationResult = { fcmSuccessCount: 1, fcmFailureCount: 1, webPushSuccessCount: 1, webPushFailureCount: 1 };
  db.emailSendFailure = 'retryable email failure';
  const body = create();
  assert.equal((await call(db, body)).status, 200);
  assert.equal(db.emails.length, 1, 'partial push must not prevent independent email attempt');
  assert.equal(effect().pushStatus, 'partial');
  assert.deepEqual(effect().pushResult, db.notificationResult);
  assert.equal(effect().status, 'failed');
  db.emailSendFailure = '';
  assert.equal((await call(db, body)).status, 200);
  assert.equal(db.notifications.length, 1, 'successful push targets must not receive a replay duplicate');
  assert.equal(db.emails.length, 2);
  assert.equal(effect().status, 'delivered');
  assert.equal(effect().pushStatus, 'partial');
  assert.equal((await call(db, body)).status, 200);
  assert.equal(db.notifications.length, 1); assert.equal(db.emails.length, 2);
});

test('throwing push provider records failure but independently delivers email without replaying push', async () => {
  const { db, records } = communicationDb({ ...seed, 'teams/team-a/members/member': { userId: 'member', status: 'active', email: 'member@example.test' } });
  db.notificationSendFailure = 'provider unavailable';
  const body = create();
  assert.equal((await call(db, body)).status, 200);
  assert.equal(db.emails.length, 1, 'thrown push failure must not prevent email');
  const effect = [...records.values()].find(value => value.kind === 'tournament-created-notification');
  assert.equal(effect.pushStatus, 'failed'); assert.equal(effect.pushError, 'provider unavailable');
  assert.equal(effect.status, 'delivered');
  assert.equal((await call(db, body)).status, 200);
  assert.equal(db.notifications.length, 1); assert.equal(db.emails.length, 1);
});

test('push attempt is durably checkpointed before calling the provider', async () => {
  const { db, records } = communicationDb(seed);
  let attemptedBeforeDispatch = false;
  db.onNotificationSend = () => { attemptedBeforeDispatch = [...records.values()].find(value => value.kind === 'tournament-created-notification')?.pushAttempted === true; };
  assert.equal((await call(db, create())).status, 200);
  assert.equal(attemptedBeforeDispatch, true);
});

test('demo and outbound-disabled teams retain creation but suppress notification delivery', async () => {
  for (const flag of [{ isDemo: true }, { outboundProvidersEnabled: false }]) {
    const { db, records } = communicationDb({ ...seed, 'teams/team-a': { ...seed['teams/team-a'], ...flag } });
    assert.equal((await call(db, create())).status, 200); assert.equal(db.notifications.length, 0); assert.equal(db.emails.length, 0);
    assert.equal([...records.values()].find(value => value.kind === 'tournament-created-notification').status, 'suppressed');
  }
});

test('durable notification claim selects current active recipients and concurrent workers do not redispatch', async () => {
  const { db, records } = communicationDb({ ...seed,
    'teams/team-a/members/old': { userId: 'old', status: 'removed', email: 'old@example.test' },
    'teams/team-a/members/current': { userId: 'current', status: 'active', email: 'current@example.test' },
    'competitionOperationOutbox/effect': { operationId: 'operation', kind: 'tournament-created-notification', status: 'pending', attempts: 0, payload: { teamId: 'team-a', actorUid: 'owner', eventIds: ['cup'], event: { title: 'Cup', date: '2026-10-01' } } },
  }, { serializeTransactions: true });
  const app = await loadCommunicationRoute('../../src/lib/server-tournament-created-notification.ts', db, { uid: 'owner' });
  try {
    await Promise.all([app.route.deliverTournamentCreatedNotification('operation'), app.route.deliverTournamentCreatedNotification('operation')]);
    assert.equal(records.get('competitionOperationOutbox/effect').status, 'delivered');
    assert.equal(records.get('competitionOperationOutbox/effect').attempts, 1);
    assert.equal(db.notifications.length, 1); assert.deepEqual(db.notifications[0].recipientUserIds.sort(), ['current', 'staff']);
    assert.equal(db.emails.length, 1); assert.deepEqual(db.emails[0].messages[0].to, ['current@example.test']);
  } finally { app.dispose(); }
});
