import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { installCleanupSignalHandlers, main } from '../scripts/qa/certification/run-local-batches.mjs';
import { runOperationsBatch } from '../scripts/qa/certification/local/batches/operations.mjs';

test('runner signal handlers await exact harness cleanup and remove every listener', async () => {
  const signalSource = new EventEmitter();
  signalSource.exitCode = undefined;
  let closeCalls = 0;
  installCleanupSignalHandlers(signalSource, () => ({
    async close() { closeCalls += 1; },
  }));
  signalSource.emit('SIGINT');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closeCalls, 1);
  assert.equal(signalSource.exitCode, 130);
  assert.equal(signalSource.listenerCount('SIGINT'), 0);
  assert.equal(signalSource.listenerCount('SIGTERM'), 0);
});

function dependencies(overrides = {}) {
  const events = [];
  const scenariosRecorded = [];
  const runErrors = [];
  return {
    events,
    scenariosRecorded,
    console: { log: message => events.push(['log', message]), error: message => events.push(['error', message]) },
    environment: {},
    now: () => new Date('2026-09-04T18:00:00.000Z'),
    randomBytes: () => Buffer.from('a1b2c3d4', 'hex'),
    getCommit: () => '0123456789abcdef0123456789abcdef01234567',
    startHarness: async options => {
      events.push(['start', options]);
      return {
        runId: `final-cert-${options.runSuffix}`,
        runSuffix: options.runSuffix,
        browserEnabled: options.browser,
        runLegacyCertificationAudit: async ({ batches }) => {
          events.push(['child', batches]);
          return { code: 0, stdout: '', stderr: '', startedAt: '2026-09-04T18:00:00.000Z', completedAt: '2026-09-04T18:00:00.000Z' };
        },
        close: async () => events.push(['close']),
      };
    },
    runIdentityBatch: async (_context, scenarios) => {
      events.push(['batch', scenarios.map(scenario => scenario.id)]);
      return { results: scenarios.map(scenario => ({ scenarioId: scenario.id, outcome: 'BLOCKED_PRECONDITION' })), runErrors: [] };
    },
    runTenantsBatch: async (_context, scenarios) => {
      events.push(['tenants', scenarios.map(scenario => scenario.id)]);
      return { results: scenarios.map(scenario => ({ scenarioId: scenario.id, outcome: 'BLOCKED_PRECONDITION' })), runErrors: [] };
    },
    runOperationsBatch: async (_context, scenarios) => {
      events.push(['operations', scenarios.map(scenario => scenario.id)]);
      return { results: scenarios.map(scenario => ({ scenarioId: scenario.id, outcome: 'BLOCKED_PRECONDITION' })), runErrors: [] };
    },
    createEvidenceRecorder: ({ scenarios }) => ({
      recordScenario(result) { scenariosRecorded.push(result); },
      recordRunError(error) { runErrors.push(error); events.push(['run-error', error]); },
      async writeSummary() {
        events.push(['write']);
        return { results: scenariosRecorded, runErrors, selected: scenarios.map(scenario => scenario.id) };
      },
    }),
    rootDir: new URL('..', import.meta.url).pathname,
    outputRoot: '/tmp/task3-runner-output',
    markdownPath: '/tmp/task3-runner-output/02-identity.md',
    ...overrides,
  };
}

test('list reports identity ownership without starting the harness', async () => {
  const deps = dependencies();
  const result = await main(['--list'], deps);
  assert.equal(result.exitCode, 0);
  assert.equal(result.list.identity.length, 11);
  assert.equal(deps.events.some(([name]) => name === 'start'), false);
  assert.equal(deps.events.some(([name]) => name === 'log'), true);
});

test('runner executes selected scenarios, writes summary, and always closes harness', async () => {
  const deps = dependencies();
  const result = await main(['--scenario', 'authentication-password-reset'], deps);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(deps.scenariosRecorded.map(value => value.scenarioId), ['authentication-password-reset']);
  assert.deepEqual(deps.events.map(([name]) => name), ['start', 'child', 'batch', 'write', 'log', 'close']);
});

test('tenant-only and combined selections use one child lifecycle and isolated evidence targets', async () => {
  const recorderOptions = [];
  const deps = dependencies({
    markdownPath: undefined,
    createEvidenceRecorder: options => {
      recorderOptions.push(options);
      return {
        recordScenario(result) { deps.scenariosRecorded.push(result); },
        recordRunError() {},
        async writeSummary({ markdownPath }) { return { results: [], runErrors: [], markdownPath }; },
      };
    },
  });
  await main(['--scenario', 'teams-create-and-capacity'], deps);
  assert.equal(deps.events.filter(([name]) => name === 'child').length, 1);
  assert.deepEqual(deps.events.find(([name]) => name === 'child')[1], ['tenants']);
  assert.match(recorderOptions[0].outputDir, /task-4/);
  assert.match(recorderOptions[0].markdownPath || '', /03-tenants\.md$/);
});

test('operations selection has its own evidence target and uses the shared lifecycle once', async () => {
  const recorderOptions = [];
  const deps = dependencies({
    markdownPath: undefined,
    createEvidenceRecorder: options => {
      recorderOptions.push(options);
      return {
        recordScenario(result) { deps.scenariosRecorded.push(result); },
        recordRunError() {},
        async writeSummary({ markdownPath }) { return { results: [], runErrors: [], markdownPath }; },
      };
    },
  });
  await main(['--scenario', 'events-event-crud-recurrence'], deps);
  assert.equal(deps.events.filter(([name]) => name === 'child').length, 1);
  assert.deepEqual(deps.events.find(([name]) => name === 'child')[1], ['operations']);
  assert.deepEqual(deps.events.find(([name]) => name === 'operations')[1], ['events-event-crud-recurrence']);
  assert.match(recorderOptions[0].outputDir, /task-5/);
  assert.match(recorderOptions[0].markdownPath || '', /04-operations\.md$/);
});

test('browser selection refuses a missing wrapper before starting any process', async () => {
  const deps = dependencies();
  await assert.rejects(() => main(['--batch', 'identity', '--browser'], deps), /PLAYWRIGHT_CLI is required/);
  assert.equal(deps.events.some(([name]) => name === 'start'), false);
});

test('managed operations runner exits nonzero and persists a selected-row child failure', async () => {
  const deps = dependencies({ runOperationsBatch });
  const start = deps.startHarness;
  deps.startHarness = async options => ({
    ...await start(options),
    runLegacyCertificationAudit: async () => ({ code: 1, stderr: 'Event visibility timeout', stdout: 'CERTIFICATION_EVENT ' + JSON.stringify({
      type: 'scenario-error', scenarioId: 'events-event-crud-recurrence', stage: 'operations-runtime', diagnostic: 'Event visibility timeout',
    }) }),
  });
  const result = await main(['--scenario', 'events-event-crud-recurrence'], deps);
  assert.equal(result.exitCode, 1);
  assert.ok(result.summary.runErrors.some(error => error.scenarioId === 'events-event-crud-recurrence' && error.diagnostic === 'Event visibility timeout'));
  assert.equal(deps.events.at(-1)[0], 'close');
});

test('runner closes the harness when the batch throws', async () => {
  const deps = dependencies({
    runIdentityBatch: async () => { throw new Error('sanitized batch failure'); },
  });
  await assert.rejects(() => main(['identity'], deps), /sanitized batch failure/);
  assert.deepEqual(deps.events.map(([name]) => name), ['start', 'child', 'close']);
});

test('runner returns a failing exit code when any scenario outcome is FAIL', async () => {
  const deps = dependencies({
    runIdentityBatch: async (_context, scenarios) => ({
      results: scenarios.map((scenario, index) => ({
        scenarioId: scenario.id,
        outcome: index === 0 ? 'FAIL' : 'BLOCKED_PRECONDITION',
      })),
      runErrors: [],
    }),
  });
  const result = await main(['--batch', 'identity'], deps);
  assert.equal(result.exitCode, 1);
  assert.equal(deps.events.at(-1)[0], 'close');
});

test('runner propagates fail-fast to the child harness instead of applying it only after execution', async () => {
  const deps = dependencies();
  await main(['--scenario', 'teams-create-and-capacity', '--fail-fast'], deps);
  const start = deps.events.find(([name]) => name === 'start')[1];
  assert.equal(start.failFast, true);
});

test('runner persists shared run errors without attributing them to a scenario', async () => {
  const deps = dependencies({
    runIdentityBatch: async (_context, scenarios) => ({
      results: scenarios.map(scenario => ({ scenarioId: scenario.id, outcome: 'BLOCKED_PRECONDITION' })),
      runErrors: [{ stage: 'identity-child', diagnostic: 'sanitized startup failure' }],
    }),
  });
  const result = await main(['--scenario', 'authentication-password-reset'], deps);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(deps.events.find(([name]) => name === 'run-error')[1], {
    stage: 'identity-child', diagnostic: 'sanitized startup failure',
  });
});

test('main preserves the first signal exit status after awaited cleanup', async () => {
  const signalSource = new EventEmitter();
  signalSource.exitCode = undefined;
  const deps = dependencies({
    signalSource,
    runIdentityBatch: async () => {
      signalSource.emit('SIGTERM');
      await new Promise(resolve => setImmediate(resolve));
      return { results: [], runErrors: [] };
    },
    createEvidenceRecorder: () => ({
      recordScenario() {},
      recordRunError() {},
      async writeSummary() { return { results: [], runErrors: [] }; },
    }),
  });
  const result = await main(['--scenario', 'authentication-password-reset'], deps);
  assert.equal(result.exitCode, 143);
  assert.equal(signalSource.exitCode, 143);
});
