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

test('overlay restoration attempts every path and final cleanup retries exact residuals', async () => {
  const records = new Map([
    ['teams/run-team/settings/a', { value: 'before-a' }],
    ['teams/run-team/settings/b', { value: 'before-b' }],
  ]);
  let failedB = false;
  const firestore = {
    async read(path) { return records.has(path) ? structuredClone(records.get(path)) : null; },
    async write(path, value) {
      if (path.endsWith('/b') && value.value === 'before-b' && !failedB) {
        failedB = true;
        throw new Error('transient restore');
      }
      records.set(path, structuredClone(value));
    },
    async remove(path) { records.delete(path); },
  };
  const mutations = createFixtureMutations({
    projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit', firestore,
    baselineRoots: ['teams/qa-team-a'], maxAttempts: 2,
  });
  await assert.rejects(
    () => mutations.withFirestoreOverlay([...records.keys()], async () => {
      for (const path of records.keys()) records.set(path, { value: 'during' });
    }),
    /transient restore/
  );
  assert.deepEqual(records.get('teams/run-team/settings/a'), { value: 'before-a' });
  assert.deepEqual(records.get('teams/run-team/settings/b'), { value: 'during' });
  const cleanup = await mutations.cleanup();
  assert.equal(cleanup.state, 'OBSERVED');
  assert.equal(cleanup.counts.restored, 2);
  assert.deepEqual(records.get('teams/run-team/settings/b'), { value: 'before-b' });
  assert.equal(cleanup.residuals.length, 0);
});

test('overlay verification treats Firestore field reordering as the same before-image', async () => {
  const records = new Map([['players/p-a', { nested: { z: 1, a: 2 }, joinedTeamIds: ['a', 'b'] }]]);
  const firestore = {
    async read(path) { return structuredClone(records.get(path) ?? null); },
    async write(path, value) {
      records.set(path, { joinedTeamIds: structuredClone(value.joinedTeamIds), nested: { a: value.nested.a, z: value.nested.z } });
    },
    async remove(path) { records.delete(path); },
  };
  const mutations = createFixtureMutations({
    projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit', firestore,
    baselineRoots: ['players/p-a'], maxAttempts: 1,
  });
  await mutations.withFirestoreOverlay(['players/p-a'], async () => records.set('players/p-a', { changed: true }));
  const cleanup = await mutations.cleanup();
  assert.equal(cleanup.state, 'OBSERVED');
  assert.equal(cleanup.residuals.length, 0);
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

test('two-party timeout aborts and settles both participants before returning', async () => {
  let lateMutation = false;
  let slowSettled = false;
  await assert.rejects(
    () => runTwoParty('late-race', [
      async signal => {
        await new Promise(resolve => setTimeout(resolve, 25));
        if (!signal.aborted) lateMutation = true;
        slowSettled = true;
      },
      async signal => { while (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 1)); },
    ], { timeoutMs: 2 }),
    /timed out/
  );
  assert.equal(slowSettled, true);
  assert.equal(lateMutation, false);
});
