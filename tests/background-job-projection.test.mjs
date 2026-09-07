import assert from 'node:assert/strict';
import test from 'node:test';

const worker = await import('../functions/src/league-public-projection.ts').catch(() => ({}));
const syncPublicLeagueView = worker.syncPublicLeagueView || (async () => ({ action: 'missing' }));
const syncPublicLeagueViews = worker.syncPublicLeagueViews || (async () => ({ synced: -1 }));

function fixture() {
  const records = new Map([
    ['leagues/l', { data: { creatorId: 'u', billingOwnerUserId: 'u', tenantId: 'profile:u', lifecycleVersion: 1, name: 'League', teams: {}, schedule: [] }, version: 200 }],
    ['users/u', { data: { role: 'league_creator', plan_type: 'league', subscription_status: 'active' }, version: 190 }],
  ]);
  let fail = false;
  let writes = 0;
  return {
    records,
    get writes() { return writes; },
    failNext() { fail = true; },
    runTransaction: async operation => operation({
      read: async (collection, id) => {
        const value = records.get(`${collection}/${id}`);
        return value ? { exists: true, data: structuredClone(value.data), version: value.version } : { exists: false, data: {}, version: 0 };
      },
      write: async (collection, id, data) => {
        if (fail) { fail = false; throw new Error('partial failure'); }
        writes += 1;
        records.set(`${collection}/${id}`, { data: structuredClone(data), version: 1_000 + writes });
      },
      delete: async (collection, id) => { if (records.delete(`${collection}/${id}`)) writes += 1; },
    }),
  };
}

test('a failed write is retryable and concurrent duplicate delivery converges to one projection write', async () => {
  const db = fixture();
  db.failNext();
  await assert.rejects(syncPublicLeagueView('l', 200, db), /partial failure/);
  assert.equal((await syncPublicLeagueView('l', 200, db)).action, 'written');
  assert.deepEqual((await Promise.all([syncPublicLeagueView('l', 200, db), syncPublicLeagueView('l', 200, db)])).map(result => result.action), ['unchanged', 'unchanged']);
  assert.equal(db.writes, 1);
});

test('a stale delete event cannot remove a recreated newer projection', async () => {
  const db = fixture();
  await syncPublicLeagueView('l', 200, db);
  db.records.get('leagues/l').data.name = 'Recreated';
  db.records.get('leagues/l').version = 2_000;
  assert.equal((await syncPublicLeagueView('l', 150, db)).action, 'written');
  assert.equal(db.records.get('publicLeagueViews/l').data.name, 'Recreated');
});

test('a source delete revokes once while a duplicate retry is harmless', async () => {
  const db = fixture();
  await syncPublicLeagueView('l', 200, db);
  db.records.get('publicLeagueViews/l').version = 300;
  db.records.delete('leagues/l');
  assert.equal((await syncPublicLeagueView('l', 400, db)).action, 'revoked');
  assert.equal((await syncPublicLeagueView('l', 400, db)).action, 'unchanged');
});

test('an older source event cannot overwrite a projection written from a newer source revision', async () => {
  const db = fixture();
  await syncPublicLeagueView('l', 200, db);
  db.records.get('publicLeagueViews/l').data.name = 'Future revision';
  db.records.get('publicLeagueViews/l').version = 500;
  db.records.get('leagues/l').version = 400;
  assert.equal((await syncPublicLeagueView('l', 300, db)).action, 'unchanged');
  assert.equal(db.records.get('publicLeagueViews/l').data.name, 'Future revision');
});

test('entitlement fanout deduplicates League IDs and reports bounded failures for trigger retry', async () => {
  const calls = [];
  const result = await syncPublicLeagueViews(['a', 'a', 'b'], 500, async (id, version) => {
    calls.push([id, version]);
    if (id === 'b') throw new Error('injected League failure');
    return { action: 'written' };
  }).catch(error => ({ error: error.message }));
  assert.deepEqual(calls, [['a', 500], ['b', 500]]);
  assert.match(result.error, /1 League projection sync failed/);
});
