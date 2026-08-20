import assert from 'node:assert/strict';
import test from 'node:test';

const serviceWorkerModule = await import('../src/lib/service-worker-registration.ts').catch(() => ({}));

test('FCM waits for an active service worker before subscribing for a token', async () => {
  assert.equal(
    typeof serviceWorkerModule.waitForActiveServiceWorker,
    'function',
    'waitForActiveServiceWorker must exist'
  );

  const installingRegistration = { active: null };
  const activeRegistration = { active: { state: 'activated' } };
  let markReady;
  const ready = new Promise(resolve => {
    markReady = resolve;
  });

  let settled = false;
  const resultPromise = serviceWorkerModule
    .waitForActiveServiceWorker(installingRegistration, ready)
    .then(result => {
      settled = true;
      return result;
    });

  await Promise.resolve();
  assert.equal(settled, false, 'an installing registration must not be used for PushManager.subscribe');

  markReady(activeRegistration);
  assert.equal(await resultPromise, activeRegistration);
});
