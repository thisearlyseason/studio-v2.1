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

test('FCM does not reuse an active worker configured for a different Firebase project', async () => {
  assert.equal(
    typeof serviceWorkerModule.waitForConfiguredServiceWorker,
    'function',
    'waitForConfiguredServiceWorker must exist'
  );

  const expectedScriptUrl = 'https://example.test/sw.js?firebaseConfig=staging';
  const staleWorker = {
    state: 'activated',
    scriptURL: 'https://example.test/sw.js?firebaseConfig=production',
  };
  const listeners = new Map();
  const installingWorker = {
    state: 'installing',
    scriptURL: expectedScriptUrl,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
  const registration = {
    active: staleWorker,
    installing: installingWorker,
    waiting: null,
  };
  let settled = false;
  const resultPromise = serviceWorkerModule
    .waitForConfiguredServiceWorker(registration, expectedScriptUrl)
    .then(result => {
      settled = true;
      return result;
    });

  await Promise.resolve();
  assert.equal(settled, false, 'the stale active worker must not be returned');

  installingWorker.state = 'activated';
  registration.active = installingWorker;
  listeners.get('statechange')();

  assert.equal(await resultPromise, registration);
});
