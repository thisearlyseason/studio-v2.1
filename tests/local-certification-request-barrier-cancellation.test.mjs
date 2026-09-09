import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('audit.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'runServerRequestBarrier');
assert.ok(declaration);

function fixture({ arrived = false, afterRead = () => {} } = {}) {
  const state = {};
  const writes = [];
  const requests = [];
  const doc = {
    async set(value) { Object.assign(state, value); writes.push(value.state); },
    async get() {
      afterRead();
      return { data: () => ({ ...state, arrivals: arrived ? { first: 'observed', second: 'observed' } : {} }) };
    },
  };
  const run = new Function('activeOperationResourceRegistry', 'OPERATIONS_SCENARIO_IDS', 'activeCertificationScenario',
    'certificationRunId', 'registerDynamicFirestoreRoot', 'withEmulatorAuthAdmin',
    `${declaration.getText(tree)}; return runServerRequestBarrier;`)(
    null, [], null, 'cancellation-test', () => {}, async callback => callback({}, { doc: () => doc }),
  );
  const participants = ['first', 'second'].map(alias => ({ alias, execute: ({ signal }) => {
    requests.push(alias);
    return new Promise((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener('abort', () => { requests.push(`${alias}-stopped`); reject(signal.reason); }, { once: true });
    });
  } }));
  return { run, participants, state, writes, requests };
}

test('a cancelled scenario cannot create or dispatch a request barrier', async () => {
  const controller = new AbortController();
  controller.abort(new Error('scenario deadline reached'));
  const barrier = fixture();
  await assert.rejects(() => barrier.run('event', barrier.participants, { signal: controller.signal, timeoutMs: 40 }), /scenario deadline reached/);
  assert.deepEqual(barrier.writes, []);
  assert.deepEqual(barrier.requests, []);
});

for (const arrived of [false, true]) test(`scenario cancellation drains the barrier ${arrived ? 'after release' : 'before both arrivals'}`, async () => {
  const controller = new AbortController();
  const barrier = fixture({ arrived });
  const pending = barrier.run('event', barrier.participants, { signal: controller.signal, timeoutMs: 40 });
  const rejected = assert.rejects(pending, /scenario deadline reached/);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(new Error('scenario deadline reached'));
  await rejected;
  assert.equal(barrier.state.state, 'cancelled');
  assert.deepEqual(barrier.requests, ['first', 'second', 'first-stopped', 'second-stopped']);
  if (!arrived) assert.deepEqual(barrier.writes, ['open', 'cancelled']);
});

test('a scenario cancelled during the arrival read never releases the requests', async () => {
  const controller = new AbortController();
  const barrier = fixture({ arrived: true, afterRead: () => controller.abort(new Error('scenario deadline reached')) });
  await assert.rejects(() => barrier.run('event', barrier.participants, { signal: controller.signal, timeoutMs: 40 }), /scenario deadline reached/);
  assert.deepEqual(barrier.writes, ['open', 'cancelled']);
});

test('a completed barrier preserves both observed responses without leaving a timeout guard', async () => {
  const barrier = fixture({ arrived: true });
  const before = process.getActiveResourcesInfo().filter(type => type === 'Timeout').length;
  const result = await barrier.run('event', [
    { alias: 'first', execute: async () => ({ status: 200 }) },
    { alias: 'second', execute: async () => ({ status: 409 }) },
  ], { timeoutMs: 40 });
  assert.deepEqual(result.settled.map(item => item.value.status), [200, 409]);
  assert.equal(result.barrier.finalState, 'released');
  assert.equal(process.getActiveResourcesInfo().filter(type => type === 'Timeout').length, before);
});
