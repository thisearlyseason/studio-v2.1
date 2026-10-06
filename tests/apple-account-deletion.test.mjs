import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppleDeletionService } from '../src/lib/apple-deletion/service.ts';

function fixture() {
  let now = 1_800_000_000_000, sequence = 0;
  const records = new Map(), events = [];
  const identities = {
    web: { uid: 'account-a', appleSubject: 'apple-a', provider: 'custom', authTime: now / 1000 },
    apple: { uid: 'account-a', appleSubject: 'apple-a', provider: 'apple.com', authTime: now / 1000 },
    other: { uid: 'account-b', appleSubject: 'apple-b', provider: 'apple.com', authTime: now / 1000 },
  };
  const deps = {
    now: () => now, random: () => Buffer.alloc(32, ++sequence).toString('base64url'),
    identify: async token => { if (!identities[token]) throw Error('invalid_identity'); return identities[token]; },
    eligible: async uid => { events.push(['eligible', uid]); },
    store: {
      create: async (key, value) => { assert.equal(records.has(key), false); records.set(key, { ...value }); },
      read: async key => records.get(key),
      claim: async (key, uid, time) => {
        const r = records.get(key);
        if (!r || r.uid !== uid || r.status !== 'ready' || r.expiresAt <= time) return false;
        r.status = 'processing'; return true;
      },
      finish: async (key, status, purgeAt) => { Object.assign(records.get(key), { status, ...(purgeAt ? { purgeAt } : {}) }); },
    },
    revoke: async (token, code, type) => { events.push(['revoke', token, code, type]); },
    schedule: async uid => { events.push(['schedule', uid]); return '2027-01-22T08:00:00.000Z'; },
  };
  return { deps, events, records, identities, service: createAppleDeletionService(deps), advance: ms => { now += ms; } };
}

test('only the original account is scheduled, after verified Apple revocation', async () => {
  const f = fixture(), { handle } = await f.service.prepare('web');
  assert.deepEqual(await f.service.challenge(handle), { uid: 'account-a', appleSubject: 'apple-a' });
  assert.deepEqual(await f.service.complete(handle, 'apple', 'fresh-code', 'CODE'), { purgeAt: '2027-01-22T08:00:00.000Z' });
  assert.deepEqual(f.events.filter(e => e[0] !== 'eligible'), [['revoke', 'apple', 'fresh-code', 'CODE'], ['schedule', 'account-a']]);
  const stored = JSON.stringify([...f.records]);
  for (const secret of [handle, 'fresh-code']) assert.equal(stored.includes(secret), false);
});

test('wrong UID, changed Apple subject and non-Apple credential cannot revoke or delete', async () => {
  for (const change of ['uid', 'subject', 'provider']) {
    const f = fixture(), { handle } = await f.service.prepare('web');
    if (change === 'subject') f.identities.apple.appleSubject = 'apple-b';
    if (change === 'provider') f.identities.apple.provider = 'google.com';
    await assert.rejects(f.service.complete(handle, change === 'uid' ? 'other' : 'apple', 'code', 'CODE'));
    assert.equal(f.events.some(e => ['revoke', 'schedule'].includes(e[0])), false);
  }
});

test('expired intent and stale or future provider authentication are denied', async () => {
  for (const state of ['expired', 'stale', 'future']) {
    const f = fixture(), { handle } = await f.service.prepare('web');
    if (state === 'expired') f.advance(301000);
    if (state === 'stale') f.identities.apple.authTime -= 301;
    if (state === 'future') f.identities.apple.authTime += 61;
    await assert.rejects(f.service.complete(handle, 'apple', 'code', 'CODE'));
    assert.equal(f.events.some(e => e[0] === 'revoke'), false);
  }
});

test('revocation failure leaves the account unscheduled and consumes the attempted intent', async () => {
  const f = fixture(); f.deps.revoke = async () => { throw Error('provider-private-error'); };
  const service = createAppleDeletionService(f.deps), { handle } = await service.prepare('web');
  await assert.rejects(service.complete(handle, 'apple', 'code', 'CODE'), /revocation_failed/);
  assert.equal(f.events.some(e => e[0] === 'schedule'), false);
  await assert.rejects(service.complete(handle, 'apple', 'code', 'CODE'));
});

test('concurrent completion and replay revoke and schedule at most once', async () => {
  const f = fixture(), { handle } = await f.service.prepare('web');
  const attempts = await Promise.allSettled([f.service.complete(handle, 'apple', 'code', 'CODE'), f.service.complete(handle, 'apple', 'code', 'CODE')]);
  assert.equal(attempts.filter(v => v.status === 'fulfilled').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'revoke').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'schedule').length, 1);
  assert.deepEqual(await f.service.complete(handle, 'apple', 'code', 'CODE'), { purgeAt: '2027-01-22T08:00:00.000Z' });
  assert.equal(f.events.filter(e => e[0] === 'revoke').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'schedule').length, 1);
});

test('confirmed revocation survives a scheduling failure and resumes only for the same identity', async () => {
  const f = fixture(), schedule = f.deps.schedule, identify = f.deps.identify;
  let failed = false;
  f.deps.schedule = async uid => { if (!failed) { failed = true; throw Error('transient-auth-failure'); } return schedule(uid); };
  f.deps.identify = async (token, recovery) => { if (failed && !recovery) throw Error('account-pending'); return identify(token); };
  const service = createAppleDeletionService(f.deps), { handle } = await service.prepare('web');
  await assert.rejects(service.complete(handle, 'apple', 'code', 'CODE'), /transient-auth-failure/);
  assert.equal([...f.records.values()][0].status, 'revoked');
  await assert.rejects(service.complete(handle, 'other', 'code', 'CODE'));
  assert.deepEqual(await service.complete(handle, 'apple', 'code', 'CODE'), { purgeAt: '2027-01-22T08:00:00.000Z' });
  assert.equal(f.events.filter(e => e[0] === 'revoke').length, 1);
});

test('eligibility changed during the provider round trip prevents scheduling', async () => {
  const f = fixture(); let nowOwnsTeam = false;
  f.deps.revoke = async () => { nowOwnsTeam = true; };
  f.deps.eligible = async () => { if (nowOwnsTeam) throw Error('ownership_changed'); };
  const service = createAppleDeletionService(f.deps), { handle } = await service.prepare('web');
  await assert.rejects(service.complete(handle, 'apple', 'code', 'CODE'), /ownership_changed/);
  assert.equal(f.events.some(e => e[0] === 'schedule'), false);
  assert.equal([...f.records.values()][0].status, 'revoked');
});

test('ownership or subscription restriction is checked before intent and again before revocation', async () => {
  const f = fixture(), { handle } = await f.service.prepare('web');
  f.deps.eligible = async () => { throw Error('ownership_blocked'); };
  const service = createAppleDeletionService(f.deps);
  await assert.rejects(service.prepare('web'), /ownership_blocked/);
  await assert.rejects(service.complete(handle, 'apple', 'code', 'CODE'), /ownership_blocked/);
  assert.equal(f.events.some(e => e[0] === 'revoke'), false);
});

test('cancelled preparation has no destructive effects; malformed input is rejected', async () => {
  const f = fixture(), { handle } = await f.service.prepare('web');
  assert.equal(f.events.some(e => e[0] === 'schedule' || e[0] === 'revoke'), false);
  for (const code of ['', 'x'.repeat(4097), 'a\nb']) await assert.rejects(f.service.complete(handle, 'apple', code, 'CODE'));
  await assert.rejects(f.service.challenge('not-a-handle'));
  await assert.rejects(f.service.complete(handle, 'apple', 'code', 'REFRESH_TOKEN'));
  assert.equal(f.events.some(e => e[0] === 'revoke'), false);
});
