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

test('dynamic cleanup removes and verifies descendants even when the registered root document is absent', async () => {
  const records = new Map([['teams/run-created/games/orphan', { id: 'orphan' }]]);
  const firestore = {
    async read(path) { return records.get(path) ?? null; },
    async hasDescendants(path) { return [...records.keys()].some(candidate => candidate.startsWith(`${path}/`)); },
    async write(path, value) { records.set(path, value); },
    async remove(path) { for (const candidate of [...records.keys()]) if (candidate === path || candidate.startsWith(`${path}/`)) records.delete(candidate); },
  };
  const mutations = createFixtureMutations({ projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit', firestore });
  mutations.registerDynamicDocument('run-created', 'teams/run-created');
  const cleanup = await mutations.cleanup();
  assert.equal(cleanup.state, 'OBSERVED');
  assert.equal(records.size, 0);
  assert.equal(cleanup.counts.deleted, 1);
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

test('overlay reports both the original callback failure and restoration failure without replacing either', async () => {
  const records = new Map([['teams/run-team', { value: 'before' }]]);
  const mutations = createFixtureMutations({
    projectId: 'demo-tenant-certification', runId: 'final-cert-t4-unit', maxAttempts: 1,
    firestore: {
      async read(path) { return records.get(path) ?? null; },
      async write() { throw new Error('restore failed'); },
      async remove(path) { records.delete(path); },
    },
  });
  await assert.rejects(
    () => mutations.withFirestoreOverlay(['teams/run-team'], async () => {
      records.set('teams/run-team', { value: 'during' });
      throw new Error('operation failed');
    }),
    error => error instanceof AggregateError &&
      error.errors.some(item => item.message === 'operation failed') &&
      error.errors.some(item => item.message === 'restore failed')
  );
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

test('two-party timeout terminates a noncooperative participant within the owned bound', async () => {
  let stopped = false;
  let settled = false;
  const startedAt = Date.now();
  await assert.rejects(() => runTwoParty('stuck-http', [
    async () => {
      while (!stopped) await new Promise(resolve => setTimeout(resolve, 1));
      settled = true;
    },
    async signal => { while (!signal.aborted) await new Promise(resolve => setTimeout(resolve, 1)); },
  ], {
    timeoutMs: 5,
    settleTimeoutMs: 5,
    async terminate() { stopped = true; },
  }), /timed out/);
  assert.equal(settled, true);
  assert.ok(Date.now() - startedAt < 250);
});

test('eventual assertion bounds a probe that never resolves', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    () => awaitEventually('stuck projection', () => new Promise(() => {}), Boolean, { timeoutMs: 10 }),
    /stuck projection/
  );
  assert.ok(Date.now() - startedAt < 250);
});
