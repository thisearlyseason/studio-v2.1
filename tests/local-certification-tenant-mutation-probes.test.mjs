import assert from 'node:assert/strict';
import test from 'node:test';

import {
  encodeFirestoreValue,
  patchFirestoreFields,
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
