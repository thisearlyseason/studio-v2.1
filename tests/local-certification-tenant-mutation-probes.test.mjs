import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeFirestoreValue,
  patchFirestoreFields,
  probeForgedWatchProgressDenial,
} from '../scripts/qa/certification/local/tenant-mutation-probes.mjs';

test('tenant mutation probe encodes nested values and sends an authenticated masked patch', async () => {
  const requests = [];
  const response = await patchFirestoreFields({
    projectId: 'demo-tenant-certification',
    documentPath: 'teams/run-team',
    idToken: 'local-token',
    fields: { description: 'run marker', features: { chat: true }, count: 2 },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { status: 200, async json() { return { ok: true }; } };
    },
  });
  assert.equal(response.status, 200);
  assert.match(requests[0].url, /^http:\/\/127\.0\.0\.1:8080\//);
  assert.match(requests[0].url, /updateMask\.fieldPaths=description/);
  assert.match(requests[0].url, /updateMask\.fieldPaths=features/);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer local-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    fields: {
      description: { stringValue: 'run marker' },
      features: { mapValue: { fields: { chat: { booleanValue: true } } } },
      count: { integerValue: '2' },
    },
  });
  assert.deepEqual(encodeFirestoreValue(['a', false, null]), {
    arrayValue: { values: [{ stringValue: 'a' }, { booleanValue: false }, { nullValue: null }] },
  });
});

test('tenant mutation probe rejects authority-bearing fields and non-loopback projects', async () => {
  for (const field of ['ownerUserId', 'userId', 'parentId', 'parentUid', 'parent_uid', 'inviteToken', 'invite_token', 'guardianIds', 'isPro', 'planId', 'plan', 'isDemo', 'demoSessionOwnerId']) {
    await assert.rejects(() => patchFirestoreFields({
      projectId: 'demo-tenant-certification', documentPath: 'teams/run-team', idToken: 'token',
      fields: { [field]: 'forged' }, fetchImpl: async () => { throw new Error('must not request'); },
    }), /authority-bearing field/);
  }
  await assert.rejects(() => patchFirestoreFields({
    projectId: 'production-project', documentPath: 'teams/run-team', idToken: 'token',
    fields: { description: 'x' }, fetchImpl: async () => { throw new Error('must not request'); },
  }), /demo project/);
  await assert.rejects(() => patchFirestoreFields({
    projectId: 'demo-tenant-certification', documentPath: '../teams/run-team', idToken: 'token',
    fields: { description: 'x' }, fetchImpl: async () => { throw new Error('must not request'); },
  }), /exact document path/);
});

test('forged watch-progress denial probe sends only the exact foreign self-keyed mutation to loopback', async () => {
  const requests = [];
  const response = await probeForgedWatchProgressDenial({
    projectId: 'demo-tenant-certification',
    documentPath: 'players/player-a/videos/film-a/watchProgress/coach-a',
    idToken: 'adult-player-token',
    actorUid: 'adult-player-a',
    targetUserId: 'coach-a',
    percentage: 100,
    watchedAt: '2026-09-06T12:00:00.000Z',
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { status: 403, async json() { return { error: { status: 'PERMISSION_DENIED' } }; } };
    },
  });

  assert.equal(response.status, 403);
  assert.equal(requests.length, 1);
  assert.match(requests[0].url, /^http:\/\/127\.0\.0\.1:8080\//);
  assert.match(requests[0].url, /players\/player-a\/videos\/film-a\/watchProgress\/coach-a/);
  assert.equal(requests[0].init.headers.Authorization, 'Bearer adult-player-token');
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    fields: {
      userId: { stringValue: 'coach-a' },
      percentage: { integerValue: '100' },
      watchedAt: { stringValue: '2026-09-06T12:00:00.000Z' },
    },
  });
});

test('forged watch-progress denial probe fails closed outside its exact negative-security contract', async () => {
  const baseline = {
    projectId: 'demo-tenant-certification',
    documentPath: 'players/player-a/videos/film-a/watchProgress/coach-a',
    idToken: 'adult-player-token',
    actorUid: 'adult-player-a',
    targetUserId: 'coach-a',
    percentage: 100,
    watchedAt: '2026-09-06T12:00:00.000Z',
    fetchImpl: async () => ({ status: 403, async json() { return {}; } }),
  };
  await assert.rejects(() => probeForgedWatchProgressDenial({ ...baseline, projectId: 'production-project' }), /demo project/);
  await assert.rejects(() => probeForgedWatchProgressDenial({ ...baseline, actorUid: 'coach-a' }), /distinct actor and target/);
  await assert.rejects(() => probeForgedWatchProgressDenial({ ...baseline, documentPath: 'teams/team-a/watchProgress/coach-a' }), /exact watch-progress document path/);
  await assert.rejects(() => probeForgedWatchProgressDenial({ ...baseline, documentPath: 'players/player-a/videos/film-a/watchProgress/other-user' }), /target must match/);
  await assert.rejects(() => probeForgedWatchProgressDenial({ ...baseline, fetchImpl: async () => ({ status: 200, async json() { return {}; } }) }), /expected 403 denial, received 200/);
});
