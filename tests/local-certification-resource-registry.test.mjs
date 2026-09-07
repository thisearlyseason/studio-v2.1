import assert from 'node:assert/strict';
import test from 'node:test';

test('dynamic registry retries deletion and restoration and returns measured cleanup', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry({ maxAttempts: 2 });
  let deleteAttempts = 0;
  let restoreAttempts = 0;
  let deleted = false;
  let restored = false;
  registry.register({
    id: 'auth:signup-coach',
    kind: 'deleted',
    async cleanup() {
      deleteAttempts += 1;
      if (deleteAttempts === 1) throw new Error('transient auth cleanup');
      deleted = true;
      return true;
    },
    async verify() { return deleted; },
  });
  registry.register({
    id: 'claim:trusted-admin',
    kind: 'restored',
    async cleanup() {
      restoreAttempts += 1;
      if (restoreAttempts === 1) throw new Error('transient claim restore');
      restored = true;
      return true;
    },
    async verify() { return restored; },
  });

  const result = await registry.cleanup();
  assert.equal(result.state, 'OBSERVED');
  assert.deepEqual(result.counts, { deleted: 1, restored: 1, retainedAuditRecords: 0 });
  assert.deepEqual(result.residuals, []);
  assert.equal(deleteAttempts, 2);
  assert.equal(restoreAttempts, 2);
  assert.deepEqual(result.selectors, ['auth:signup-coach', 'claim:trusted-admin']);
  assert.deepEqual(result.outcomes, [
    { selector: 'auth:signup-coach', kind: 'deleted', mutation: 'deleted', state: 'RECONCILED', attempts: 2 },
    { selector: 'claim:trusted-admin', kind: 'restored', mutation: 'restored', state: 'RECONCILED', attempts: 2 },
  ]);
});

test('dynamic registry attempts every resource and reports residual postconditions', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry({ maxAttempts: 2 });
  let inviteAttempts = 0;
  let demoAttempts = 0;
  registry.register({
    id: 'firestore:invite-youth', kind: 'deleted',
    async cleanup() { inviteAttempts += 1; throw new Error('invite delete unavailable'); },
    async verify() { return false; },
  });
  registry.register({
    id: 'demo:context-a', kind: 'deleted',
    async cleanup() { demoAttempts += 1; },
    async verify() { return false; },
  });

  const result = await registry.cleanup();
  assert.equal(result.state, 'FAIL');
  assert.equal(inviteAttempts, 2);
  assert.equal(demoAttempts, 2);
  assert.deepEqual(result.counts, { deleted: 0, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.residuals.map(item => item.id), ['demo:context-a', 'firestore:invite-youth']);
  assert.deepEqual(result.outcomes, [
    { selector: 'firestore:invite-youth', kind: 'deleted', mutation: 'none', state: 'RESIDUAL', attempts: 2 },
    { selector: 'demo:context-a', kind: 'deleted', mutation: 'none', state: 'RESIDUAL', attempts: 2 },
  ]);
  assert.equal(result.diagnostics.length >= 3, true);
});

test('dynamic registry is idempotent after successful cleanup', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry({ maxAttempts: 2 });
  let calls = 0;
  registry.register({
    id: 'auth:one', kind: 'deleted',
    async cleanup() { calls += 1; return true; },
    async verify() { return true; },
  });
  const first = await registry.cleanup();
  const second = await registry.cleanup();
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('dynamic registry reconciles an already-absent resource without counting a delete', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry();
  registry.register({
    id: 'auth:already-absent', kind: 'deleted',
    async cleanup() { return false; },
    async verify() { return true; },
  });
  const result = await registry.cleanup();
  assert.equal(result.state, 'OBSERVED');
  assert.deepEqual(result.counts, { deleted: 0, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.reconciled, { deleted: 1, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.outcomes, [
    { selector: 'auth:already-absent', kind: 'deleted', mutation: 'none', state: 'RECONCILED', attempts: 1 },
  ]);
});

test('dynamic registry preserves a measured mutation when verification fails transiently', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry({ maxAttempts: 2 });
  let present = true;
  let verificationAttempts = 0;
  registry.register({
    id: 'auth:deleted-before-transient-verification', kind: 'deleted',
    async cleanup() {
      if (!present) return false;
      present = false;
      return true;
    },
    async verify() {
      verificationAttempts += 1;
      if (verificationAttempts === 1) throw new Error('transient verification read');
      return !present;
    },
  });

  const result = await registry.cleanup();
  assert.equal(result.state, 'OBSERVED');
  assert.deepEqual(result.counts, { deleted: 1, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.reconciled, { deleted: 1, restored: 0, retainedAuditRecords: 0 });
  assert.equal(verificationAttempts, 2);
});

test('dynamic registry executes exact resources registered by an unmeasured cleanup obligation', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const registry = registryModule.createResourceRegistry({ maxAttempts: 2 });
  const calls = [];
  let exactRootPresent = true;
  registry.register({
    id: 'discovery:demo-owner',
    kind: 'obligation',
    async cleanup() {
      calls.push('discover');
      registry.register({
        id: 'firestore:demo-owner:teams/team-a',
        kind: 'deleted',
        async cleanup() {
          calls.push('teams/team-a');
          const existed = exactRootPresent;
          exactRootPresent = false;
          return existed;
        },
        async verify() { return !exactRootPresent; },
      });
      return false;
    },
    async verify() { return true; },
  });

  const result = await registry.cleanup();
  assert.equal(result.state, 'OBSERVED');
  assert.deepEqual(calls, ['discover', 'teams/team-a']);
  assert.deepEqual(result.counts, { deleted: 1, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.reconciled, { deleted: 1, restored: 0, retainedAuditRecords: 0 });
  assert.deepEqual(result.selectors, ['discovery:demo-owner', 'firestore:demo-owner:teams/team-a']);
});

test('cleanup results merge immediate scenario cleanup with final fallback cleanup', async () => {
  const registryModule = await import('../scripts/qa/certification/local/resource-registry.mjs');
  const merged = registryModule.mergeResourceCleanupResults([
    {
      state: 'OBSERVED',
      counts: { deleted: 2, restored: 1, retainedAuditRecords: 0 },
      reconciled: { deleted: 3, restored: 1, retainedAuditRecords: 0 },
      selectors: ['auth:youth', 'firestore:youth'], residuals: [], diagnostics: [],
    },
    {
      state: 'FAIL',
      counts: { deleted: 4, restored: 0, retainedAuditRecords: 1 },
      reconciled: { deleted: 4, restored: 0, retainedAuditRecords: 1 },
      selectors: ['firestore:youth', 'auth:signup'],
      residuals: [{ id: 'auth:signup', kind: 'deleted' }],
      diagnostics: [{ id: 'auth:signup', attempt: 3, diagnostic: 'still present' }],
    },
  ]);
  assert.equal(merged.state, 'FAIL');
  assert.deepEqual(merged.counts, { deleted: 6, restored: 1, retainedAuditRecords: 1 });
  assert.deepEqual(merged.reconciled, { deleted: 7, restored: 1, retainedAuditRecords: 1 });
  assert.deepEqual(merged.selectors, ['auth:youth', 'firestore:youth', 'auth:signup']);
  assert.deepEqual(merged.outcomes, []);
  assert.deepEqual(merged.residuals, [{ id: 'auth:signup', kind: 'deleted' }]);
  assert.equal(merged.diagnostics.length, 1);
});
