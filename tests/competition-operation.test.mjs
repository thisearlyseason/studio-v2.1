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

test('competition operation returns an exact replay without rerunning the mutation', async () => {
  const { db, records } = communicationDb({}, { serializeTransactions: true });
  const identity = canonicalCompetitionRequest({ requestId: 'league-create-0001', tenantId: 'team-a', kind: 'league.create', payload: { name: 'Metro' } });
  let mutationCount = 0;
  const mutate = async transaction => {
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
