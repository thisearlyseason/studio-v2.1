import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb } from './helpers/communication-route-harness.mjs';
import {
  canonicalCompetitionRequest,
  runCompetitionOperation,
} from '../src/lib/server-competition-operation.ts';

test('competition request identity is canonical across object key order and bounded by tenant and mutation kind', () => {
  const first = canonicalCompetitionRequest({
    requestId: 'league-edit-0001', tenantId: 'team-a', kind: 'league.edit', payload: { version: 2, updates: { sport: 'Soccer', name: 'A' } },
  });
  const replay = canonicalCompetitionRequest({
    requestId: 'league-edit-0001', tenantId: 'team-a', kind: 'league.edit', payload: { updates: { name: 'A', sport: 'Soccer' }, version: 2 },
  });
  const changed = canonicalCompetitionRequest({
    requestId: 'league-edit-0001', tenantId: 'team-a', kind: 'league.edit', payload: { version: 3, updates: { name: 'A', sport: 'Soccer' } },
  });
  assert.deepEqual(first, replay);
  assert.equal(first.requestId, 'league-edit-0001');
  assert.match(first.payloadHash, /^[a-f0-9]{64}$/);
  assert.match(first.operationId, /^competition_[a-f0-9]{40}$/);
  assert.equal(changed.operationId, first.operationId);
  assert.notEqual(changed.payloadHash, first.payloadHash);
  assert.notEqual(canonicalCompetitionRequest({ requestId: 'league-edit-0001', tenantId: 'team-b', kind: 'league.edit', payload: {} }).operationId, first.operationId);
  assert.throws(() => canonicalCompetitionRequest({ requestId: 'bad request', tenantId: 'team-a', kind: 'league.edit', payload: {} }), /requestId/);
  assert.throws(() => canonicalCompetitionRequest({ requestId: 'valid-request', tenantId: 'team-a', kind: 'league.edit', payload: { invalid: undefined } }), /payload/);
});

test('competition payload hashing preserves dangerous own JSON keys without prototype collisions', () => {
  const base = { requestId: 'prototype-key-0001', tenantId: 'team-a', kind: 'league.edit' };
  const empty = canonicalCompetitionRequest({ ...base, payload: {} });
  const dangerous = canonicalCompetitionRequest({ ...base, payload: JSON.parse('{"__proto__":{"admin":true}}') });
  assert.notEqual(dangerous.payloadHash, empty.payloadHash);
});

test('durable exact replay returns the stored result without starting a new transaction mutation', async () => {
  const { db, records } = communicationDb({}, { serializeTransactions: true });
  const identity = canonicalCompetitionRequest({ requestId: 'league-create-0001', tenantId: 'team-a', kind: 'league.create', payload: { name: 'Metro' } });
  let mutationCount = 0;
  const mutate = async ({ transaction }) => {
    mutationCount += 1;
    transaction.set(db.collection('leagues').doc('league-a'), { name: 'Metro' });
    return { leagueId: 'league-a', created: true };
  };
  const [first, replay] = await Promise.all([
    runCompetitionOperation({ db, identity, actorUid: 'owner-a' }, mutate),
    runCompetitionOperation({ db, identity, actorUid: 'owner-a' }, mutate),
  ]);
  assert.deepEqual(replay, first);
  assert.equal(mutationCount, 1);
  assert.equal(records.get(`competitionOperations/${identity.operationId}`).payloadHash, identity.payloadHash);
});

test('competition operation rejects reuse of a request identity with a changed payload', async () => {
  const { db } = communicationDb({}, { serializeTransactions: true });
  const first = canonicalCompetitionRequest({ requestId: 'score-submit-0001', tenantId: 'team-a', kind: 'score.submit', payload: { home: 2, away: 1 } });
  const collision = canonicalCompetitionRequest({ requestId: 'score-submit-0001', tenantId: 'team-a', kind: 'score.submit', payload: { home: 3, away: 1 } });
  await runCompetitionOperation({ db, identity: first, actorUid: 'staff-a' }, async () => ({ accepted: true }));
  await assert.rejects(
    () => runCompetitionOperation({ db, identity: collision, actorUid: 'staff-a' }, async () => ({ accepted: true })),
    /Request collision/,
  );
});

test('transaction retries commit mutation writes and one durable external-effect intent without promising one callback invocation', async () => {
  const { db: baseDb, records } = communicationDb({}, { serializeTransactions: true });
  let injectedRetry = false;
  const db = {
    ...baseDb,
    async runTransaction(work) {
      if (!injectedRetry) {
        injectedRetry = true;
        await work({
          get: ref => ref.get(),
          create() {}, set() {}, update() {}, delete() {},
        });
      }
      return baseDb.runTransaction(work);
    },
  };
  const identity = canonicalCompetitionRequest({ requestId: 'retry-proof-0001', tenantId: 'team-a', kind: 'league.create', payload: { name: 'Retry League' } });
  let callbackInvocations = 0;
  const result = await runCompetitionOperation({ db, identity, actorUid: 'owner-a' }, async context => {
    callbackInvocations += 1;
    context.transaction.set(db.collection('leagues').doc('retry-league'), { name: 'Retry League' });
    context.queueExternalEffect({ effectId: 'notify-owner', kind: 'notification.send', payload: { userId: 'owner-a' } });
    return { leagueId: 'retry-league' };
  });
  assert.deepEqual(result, { leagueId: 'retry-league' });
  assert.equal(callbackInvocations, 2);
  assert.deepEqual(records.get('leagues/retry-league'), { name: 'Retry League' });
  const effects = [...records].filter(([path]) => path.startsWith('competitionOperationOutbox/'));
  assert.equal(effects.length, 1);
  assert.equal(effects[0][1].status, 'pending');
  assert.deepEqual(records.get(`competitionOperations/${identity.operationId}`).effectIds, ['notify-owner']);

  await runCompetitionOperation({ db, identity, actorUid: 'owner-a' }, async () => {
    assert.fail('a durable replay must not invoke the transaction mutation callback');
  });
  assert.equal(callbackInvocations, 2);
});
