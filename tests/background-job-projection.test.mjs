import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const worker = await import('../functions/src/league-public-projection.ts').catch(() => ({}));
const syncPublicLeagueView = worker.syncPublicLeagueView || (async () => ({ action: 'missing' }));
const syncPublicLeagueViews = worker.syncPublicLeagueViews || (async () => ({ synced: -1 }));
const syncPublicLeagueViewPages = worker.syncPublicLeagueViewPages || (async () => ({ synced: -1 }));

function fixture() {
  const records = new Map([
    ['leagues/l', { data: { creatorId: 'u', billingOwnerUserId: 'u', tenantId: 'profile:u', lifecycleVersion: 1, name: 'League', teams: {}, schedule: [] }, version: 200 }],
    ['users/u', { data: { role: 'league_creator', plan_type: 'league', subscription_status: 'active' }, version: 190 }],
  ]);
  let fail = false;
  let writes = 0;
  let publicWrites = 0;
  return {
    records,
    get writes() { return writes; },
    get publicWrites() { return publicWrites; },
    failNext() { fail = true; },
    runTransaction: async operation => operation({
      read: async (collection, id) => {
        const value = records.get(`${collection}/${id}`);
        return value ? { exists: true, data: structuredClone(value.data), version: value.version } : { exists: false, data: {}, version: 0 };
      },
      write: async (collection, id, data) => {
        if (fail) { fail = false; throw new Error('partial failure'); }
        writes += 1;
        if (collection === 'publicLeagueViews') publicWrites += 1;
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
  assert.equal(db.publicWrites, 1);
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
  assert.equal(db.records.has('leaguePublicProjectionState/l'), false);
  assert.equal((await syncPublicLeagueView('l', 400, db)).action, 'unchanged');
});

test('current missing or ineligible authority revokes even when the delivered event version predates projection state', async () => {
  for (const makeIneligible of [
    db => db.records.delete('leagues/l'),
    db => db.records.delete('users/u'),
    db => db.records.get('users/u').data.accountStatus = 'suspended',
  ]) {
    const db = fixture();
    await syncPublicLeagueView('l', 200, db);
    makeIneligible(db);
    assert.equal((await syncPublicLeagueView('l', 100, db)).action, 'revoked');
    assert.equal(db.records.has('publicLeagueViews/l'), false);
    assert.equal(db.records.has('leaguePublicProjectionState/l'), false);
  }
});

test('transaction retry after concurrent source recreation preserves and refreshes the eligible projection', async () => {
  const db = fixture();
  await syncPublicLeagueView('l', 200, db);
  const recreatedLeague = structuredClone(db.records.get('leagues/l'));
  recreatedLeague.data.name = 'Recreated during transaction';
  recreatedLeague.version = 300;
  db.records.delete('leagues/l');
  let attempts = 0;
  const retryingStore = {
    async runTransaction(operation) {
      attempts += 1;
      const snapshot = new Map([...db.records].map(([key, value]) => [key, structuredClone(value)]));
      const changes = [];
      const result = await operation({
        async read(collection, id) {
          const value = snapshot.get(`${collection}/${id}`);
          return value ? { exists: true, data: structuredClone(value.data), version: value.version } : { exists: false, data: {}, version: 0 };
        },
        async write(collection, id, data) { changes.push(['write', `${collection}/${id}`, structuredClone(data)]); },
        async delete(collection, id) { changes.push(['delete', `${collection}/${id}`]); },
      });
      if (attempts === 1) {
        db.records.set('leagues/l', recreatedLeague);
        return this.runTransaction(operation);
      }
      for (const [action, path, data] of changes) {
        if (action === 'delete') db.records.delete(path);
        else db.records.set(path, { data, version: 1_000 + attempts });
      }
      return result;
    },
  };
  assert.equal((await syncPublicLeagueView('l', 100, retryingStore)).action, 'written');
  assert.equal(attempts, 2);
  assert.equal(db.records.get('publicLeagueViews/l').data.name, 'Recreated during transaction');
  assert.deepEqual(db.records.get('leaguePublicProjectionState/l').data, { sourceVersion: 300 });
});

test('an older source event cannot overwrite a projection written from a newer source revision', async () => {
  const db = fixture();
  await syncPublicLeagueView('l', 200, db);
  db.records.get('publicLeagueViews/l').data.name = 'Future revision';
  db.records.get('publicLeagueViews/l').version = 500;
  db.records.set('leaguePublicProjectionState/l', { data: { sourceVersion: 500 }, version: 501 });
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

test('paginated entitlement fanout processes more than 100 Leagues exactly once with no trailing page residue', async () => {
  const ids = Array.from({ length: 205 }, (_, index) => `league-${index}`);
  const calls = [];
  const pages = [ids.slice(0, 100), ids.slice(100, 200), ids.slice(200)];
  const result = await syncPublicLeagueViewPages(async cursor => {
    const index = cursor === undefined ? 0 : Number(cursor);
    return { ids: pages[index], nextCursor: index + 1 < pages.length ? String(index + 1) : undefined };
  }, 900, async id => { calls.push(id); return { action: 'written' }; });
  assert.equal(result.synced, 205);
  assert.deepEqual(calls, ids);
});

test('production membership recovery delegates projection repair to the canonical worker', async () => {
  const source = await readFile(new URL('../scripts/backfill-league-member-users.mjs', import.meta.url), 'utf8');
  assert.match(source, /syncPublicLeagueView/);
  assert.doesNotMatch(source, /function publicLeagueView/);
  assert.doesNotMatch(source, /publicViewRef\.set\(/);
});

test('production owner and tenant trigger fanout uses a stable cursor instead of a capped query', async () => {
  const source = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /orderBy\(admin\.firestore\.FieldPath\.documentId\(\)\)/);
  assert.match(source, /query\.startAfter\(cursor\)/);
  assert.match(source, /syncPublicLeagueViewPages\(loadPage/);
});
