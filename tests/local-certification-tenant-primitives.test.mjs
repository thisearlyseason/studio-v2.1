import assert from 'node:assert/strict';
import test from 'node:test';

import { awaitEventually, runTwoParty } from '../scripts/qa/certification/local/assertions.mjs';
import { createFixtureMutations } from '../scripts/qa/certification/local/fixture-mutations.mjs';

test('dynamic Firestore writes require registration and exact overlays restore in reverse order', async () => {
  const records = new Map([['teams/run-team', { name: 'before' }]]);
  const operations = [];
  const firestore = {
    async read(path) { return records.has(path) ? structuredClone(records.get(path)) : null; },
    async write(path, value) { operations.push(['write', path, value]); records.set(path, structuredClone(value)); },
    async remove(path) { operations.push(['remove', path]); records.delete(path); },
  };
  const mutations = createFixtureMutations({
    projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit', firestore,
    baselineRoots: ['teams/qa-team-a'],
  });
  await assert.rejects(() => mutations.writeDynamicDocument('teams/unregistered', {}), /registered before write/);
  mutations.registerDynamicDocument('run-team', 'teams/run-team');
  await mutations.withFirestoreOverlay(['teams/run-team'], async () => {
    await mutations.writeDynamicDocument('teams/run-team', { name: 'during' });
    assert.deepEqual(records.get('teams/run-team'), { name: 'during' });
  });
  assert.deepEqual(records.get('teams/run-team'), { name: 'before' });
  const cleanup = await mutations.cleanup();
  assert.equal(cleanup.state, 'OBSERVED');
  assert.ok(cleanup.selectors.every(value => !value.includes('teams/run-team')));
  assert.ok(operations.length >= 2);
});

test('dynamic cleanup refuses baseline destruction and retains failed resources', async () => {
  const mutations = createFixtureMutations({
    projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit',
    firestore: { async read() { return {}; }, async write() {}, async remove() { throw new Error('transient'); } },
    baselineRoots: ['teams/qa-team-a'], maxAttempts: 1,
  });
  assert.throws(() => mutations.registerDynamicDocument('bad', 'teams/qa-team-a'), /baseline root/);
  mutations.registerDynamicDocument('created', 'teams/run-created');
  const cleanup = await mutations.cleanup();
  assert.equal(cleanup.state, 'FAIL');
  assert.equal(cleanup.residuals.length, 1);
});

test('two-party barrier releases both callbacks together and eventual probes are bounded', async () => {
  const order = [];
  const settled = await runTwoParty('capacity-race', [
    async () => { order.push('a'); return 'A'; },
    async () => { order.push('b'); return 'B'; },
  ], { timeoutMs: 100 });
  assert.deepEqual(settled.map(item => item.status), ['fulfilled', 'fulfilled']);
  assert.deepEqual(new Set(order), new Set(['a', 'b']));

  let attempts = 0;
  const value = await awaitEventually('projection', async () => ++attempts, current => current === 3, { timeoutMs: 100, intervalMs: 1 });
  assert.equal(value, 3);
  await assert.rejects(() => awaitEventually('never', async () => false, Boolean, { timeoutMs: 5, intervalMs: 1 }), /never/);
});
