import assert from 'node:assert/strict';
import test from 'node:test';
import { createFixtureMutations } from '../scripts/qa/certification/local/fixture-mutations.mjs';
import { withAttendanceMemberships, selectScheduleTeam, runOperationScenarioSequence, operationSessionName, registerScheduleDiscovery, snapshotScheduleRoots } from '../scripts/qa/certification/local/schedule-isolation.mjs';
import * as scheduleIsolation from '../scripts/qa/certification/local/schedule-isolation.mjs';
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

test('operation scenario timeout selection extends only the Chat browser row', async () => {
  const completed = [];
  const failures = [];
  await assert.rejects(() => runOperationScenarioSequence([
    'tournament-registration-waiver-lifecycle',
    'chat-channel-message-unread',
  ], {
    timeoutMs: scenarioId => scenarioId === 'chat-channel-message-unread' ? 50 : 5,
    execute: async scenarioId => {
      await new Promise(resolve => setTimeout(resolve, 15));
      completed.push(scenarioId);
    },
    finalize: async () => {},
    onError: scenarioId => failures.push(scenarioId),
    failFast: false,
  }), /1 selected operation scenario/);
  assert.deepEqual(failures, ['tournament-registration-waiver-lifecycle']);
  assert.deepEqual(completed, [
    'tournament-registration-waiver-lifecycle',
    'chat-channel-message-unread',
  ]);
});

test('long-running browser media workflows have explicit bounded lifecycle caps', () => {
  assert.equal(typeof scheduleIsolation.operationScenarioTimeoutMs, 'function');
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(false, 'practice-film-upload-coach-marks-watch'), 60_000);
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(true, 'ordinary-operation-row'), 60_000);
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(true, 'chat-channel-message-unread'), 90_000);
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(true, 'practice-film-upload-coach-marks-watch'), 120_000);
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(true, 'files-library-crud-download'), 120_000);
  assert.equal(scheduleIsolation.operationScenarioTimeoutMs(true, 'files-avatar-branding-player-media-paths'), 120_000);
});

test('the full Event browser lifecycle can finish after one minute while a stalled lifecycle still times out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const outcome = [];
  const pending = runOperationScenarioSequence(['events-event-crud-recurrence'], {
    timeoutMs: id => scheduleIsolation.operationScenarioTimeoutMs(true, id),
    execute: async () => { await new Promise(resolve => setTimeout(resolve, 65_000)); outcome.push('observed'); },
    finalize: async () => outcome.push('cleaned'),
    onError: () => outcome.push('failed'),
  });
  const settled = pending.then(() => null, error => error);
  await Promise.resolve();
  t.mock.timers.tick(65_000);
  assert.equal(await settled, null, 'three Event logins, CRUD, recurrence and API reconciliation share one bounded lifecycle');
  assert.deepEqual(outcome, ['observed', 'cleaned']);

  const stalled = runOperationScenarioSequence(['events-event-crud-recurrence'], {
    timeoutMs: id => scheduleIsolation.operationScenarioTimeoutMs(true, id),
    execute: (_id, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    finalize: async () => outcome.push('stalled-cleaned'),
    onError: (_id, error) => outcome.push(error.message),
  });
  const rejected = assert.rejects(stalled, /1 selected operation scenario/);
  await Promise.resolve();
  t.mock.timers.tick(90_000);
  await rejected;
  assert.deepEqual(outcome.slice(2), ['stalled-cleaned', 'Operation scenario events-event-crud-recurrence timed out after 90000ms.']);
});

test('an aborted operation phase cannot emit completion or begin its next phase', async () => {
  assert.equal(typeof scheduleIsolation.runOperationStage, 'function');
  const controller = new AbortController();
  const phases = [];
  const calls = [];
  const run = execute => scheduleIsolation.runOperationStage('event-crud', {
    signal: controller.signal, execute, onStage: phase => phases.push(phase),
  });
  await assert.rejects(() => run(async () => {
    calls.push('crud');
    controller.abort(new Error('scenario deadline reached'));
  }), /scenario deadline reached/);
  await assert.rejects(() => run(async () => calls.push('recurrence')), /scenario deadline reached/);
  assert.deepEqual(calls, ['crud']);
  assert.deepEqual(phases.map(({ stage, state }) => ({ stage, state })), [
    { stage: 'event-crud', state: 'started' },
    { stage: 'event-crud', state: 'failed' },
  ]);
  assert.ok(phases.every(phase => typeof phase.startedAt === 'string'));
  assert.ok(phases[1].elapsedMs >= 0);
});

test('a synchronous browser command cannot conceal a passed scenario deadline', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  const calls = [];
  let failure;
  await assert.rejects(() => runOperationScenarioSequence(['events'], {
    timeoutMs: 60_000,
    execute: async (_id, { checkDeadline }) => {
      assert.equal(typeof checkDeadline, 'function', 'the runner must expose a wall-clock deadline checkpoint');
      calls.push('browser-command');
      t.mock.timers.setTime(60_001);
      checkDeadline();
      calls.push('next-browser-command');
    },
    finalize: async () => calls.push('cleanup'),
    onError: (_id, error) => { failure = error; },
  }), /selected operation scenario/);
  assert.match(failure.message, /events timed out after 60000ms/);
  assert.deepEqual(calls, ['browser-command', 'cleanup']);
});

test('an aborted operation clears its termination guard after the execution settles', async () => {
  const timeoutCount = () => process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
  const before = timeoutCount();
  await assert.rejects(() => runOperationScenarioSequence(['events'], {
    timeoutMs: 1,
    execute: (_id, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    finalize: async () => {},
    onError: () => {},
  }), /selected operation scenario/);
  assert.equal(timeoutCount(), before, 'completed cancellation must not leave a live termination timer');
});

test('attendance and RSVP cannot reuse an authenticated browser profile name', () => {
  assert.notEqual(operationSessionName('run', 'attendance', 'parent'), operationSessionName('run', 'rsvp', 'parent'));
  const longA = operationSessionName('final-certification-run-with-long-id', 'tournaments-create-configure-replicate-archive', 'ui-owner-tournament-archive-cancel');
  const longB = operationSessionName('final-certification-run-with-long-id', 'tournaments-create-configure-replicate-archive', 'ui-owner-tournament-lifecycle-console');
  assert.ok(longA.length <= 64, 'browser session names must fit the CLI transport path');
  assert.notEqual(longA, longB, 'shortened case sessions must remain isolated');
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
