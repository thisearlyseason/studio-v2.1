import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureMutations } from '../scripts/qa/certification/local/fixture-mutations.mjs';
import { withAttendanceMemberships, selectScheduleTeam, runOperationScenarioSequence, operationSessionName, registerScheduleDiscovery, snapshotScheduleRoots } from '../scripts/qa/certification/local/schedule-isolation.mjs';
import { createResourceRegistry } from '../scripts/qa/certification/local/resource-registry.mjs';

for (const fails of [false, true]) {
  test(`attendance restores member documents and projections before the next scenario (${fails ? 'failure' : 'success'})`, async () => {
    const data = new Map([
      ['users/member/teamMemberships/team-a', { teamId: 'team-a' }],
      ['teams/pro/members/assistant', { role: 'Viewer', nested: { retained: true } }],
    ]);
    const baseline = structuredClone(data);
    const mutations = createFixtureMutations({ projectId: 'demo-schedule', runId: 'final-cert-schedule-test', firestore: {
      read: async path => structuredClone(data.get(path) ?? null),
      write: async (path, value) => { data.set(path, structuredClone(value)); },
      remove: async path => { data.delete(path); },
      hasDescendants: async () => false,
    } });
    const execute = () => withAttendanceMemberships(mutations, 'pro', ['member', 'assistant'], async () => {
      for (const uid of ['member', 'assistant']) {
        data.set(`teams/pro/members/${uid}`, { role: 'Coach' });
        data.set(`users/${uid}/teamMemberships/pro`, { teamId: 'pro' });
      }
      if (fails) throw new Error('selected attendance row failed');
      return 'observed';
    });
    if (fails) await assert.rejects(execute, /selected attendance row failed/);
    else assert.equal(await execute(), 'observed');
    assert.deepEqual(data, baseline, 'a fresh Event login must see the exact original membership set');
    await execute().catch(() => {});
    assert.deepEqual(data, baseline, 'the later RSVP invocation is equally isolated');
    assert.equal((await mutations.cleanup()).state, 'OBSERVED');
  });
}

test('schedule navigation selects the intended team before mounting the events page', async () => {
  const calls = [];
  const page = {
    evaluate: async (fn, teamId) => {
      globalThis.localStorage = { setItem: (...args) => calls.push(['storage', ...args]) };
      try { fn(teamId); } finally { delete globalThis.localStorage; }
    },
    goto: async url => { calls.push(['navigate', url]); },
  };
  await selectScheduleTeam(page, { teamId: 'team-a', url: 'http://127.0.0.1:9001/events' });
  assert.deepEqual(calls, [['storage', 'sf_session_team_id', 'team-a'], ['navigate', 'http://127.0.0.1:9001/events']]);
});

for (const failFast of [false, true]) {
  test(`selected runtime failures close their sessions and ${failFast ? 'stop' : 'continue'} the sequence`, async () => {
    const calls = [];
    await assert.rejects(() => runOperationScenarioSequence(['attendance', 'events'], {
      failFast,
      execute: async id => { calls.push(`execute:${id}`); if (id === 'attendance') throw new Error('runtime failure'); },
      finalize: async id => { calls.push(`close:${id}`); },
      onError: (id, error) => { calls.push(`error:${id}:${error.message}`); },
    }), /selected operation/);
    assert.deepEqual(calls, ['execute:attendance', 'close:attendance', 'error:attendance:runtime failure',
      ...(!failFast ? ['execute:events', 'close:events'] : [])]);
  });
}

test('attendance and RSVP cannot reuse an authenticated browser profile name', () => {
  assert.notEqual(operationSessionName('run', 'attendance', 'parent'), operationSessionName('run', 'rsvp', 'parent'));
});

test('scenario discovery registers and reconciles newly created events, descendants and bookings without deleting baseline data', async () => {
  const paths = new Set(['teams/a/events/baseline', 'scheduleBookings/team_event_a_baseline']);
  const registry = createResourceRegistry();
  const registered = [];
  await registerScheduleDiscovery({ registry, scopeId: 'attendance', snapshot: async () => [...paths], registerRoot: path => {
    registered.push(path);
    registry.register({ id: path, kind: 'deleted', cleanup: async () => paths.delete(path), verify: async () => !paths.has(path) });
  } });
  paths.add('teams/a/events/new'); paths.add('scheduleBookings/team_event_a_new');
  const cleaned = await registry.cleanup();
  assert.deepEqual(new Set(registered), new Set(['teams/a/events/new', 'scheduleBookings/team_event_a_new']));
  assert.equal(cleaned.state, 'OBSERVED');
  assert.deepEqual([...paths], ['teams/a/events/baseline', 'scheduleBookings/team_event_a_baseline']);
});

test('schedule discovery uses the actual hostTeamId booking schema, including orphan bookings', async () => {
  const paths = await snapshotScheduleRoots({
    doc: () => ({ collection: () => ({ listDocuments: async () => [{ path: 'teams/a/events/one' }] }) }),
    collection: name => ({ where: (field, operation, teamId) => ({ get: async () => {
      assert.equal(name, 'scheduleBookings'); assert.equal(field, 'hostTeamId'); assert.equal(operation, '=='); assert.equal(teamId, 'a');
      return { docs: [{ ref: { path: 'scheduleBookings/team_event_a_orphan' } }] };
    } }) }),
  }, ['a']);
  assert.deepEqual(paths, ['teams/a/events/one', 'scheduleBookings/team_event_a_orphan']);
});
