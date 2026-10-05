import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getApps } from 'firebase-admin/app';
test('actual new routes refuse web distribution without initializing Firebase Admin', async () => {
  const saved = { mode: process.env.NEXT_PUBLIC_APP_DISTRIBUTION, enabled: process.env.NATIVE_AUTH_ENABLED };
  try {
    process.env.NEXT_PUBLIC_APP_DISTRIBUTION = 'web';
    process.env.NATIVE_AUTH_ENABLED = 'true';
    const before = getApps().length;
    for (const action of ['start', 'complete', 'redeem']) {
      const route = await import(`../src/app/api/native-auth/${action}/route.ts`);
      const res = await route.POST(new Request(`https://www.thesquad.pro/api/native-auth/${action}`, { method: 'POST' }));
      assert.equal(res.status, 404);
      assert.equal(res.headers.get('Cache-Control'), 'no-store');
    }
    assert.equal(getApps().length, before);
  } finally {
    if (saved.mode === undefined) delete process.env.NEXT_PUBLIC_APP_DISTRIBUTION; else process.env.NEXT_PUBLIC_APP_DISTRIBUTION = saved.mode;
    if (saved.enabled === undefined) delete process.env.NATIVE_AUTH_ENABLED; else process.env.NATIVE_AUTH_ENABLED = saved.enabled;
  }
});
