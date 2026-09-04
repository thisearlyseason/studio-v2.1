import assert from 'node:assert/strict';
import test from 'node:test';

const serviceWorkerModule = await import('../src/lib/service-worker-registration.ts').catch(() => ({}));

test('push registration waits for an active service worker before subscribing', async () => {
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

test('primary service worker has one stable URL without embedded Firebase credentials', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(new URL('../src/lib/service-worker-registration.ts', import.meta.url), 'utf8')
  );
  assert.match(source, /register\('\/sw\.js'/);
  assert.doesNotMatch(source, /firebaseConfig|FirebaseOptions/);
});
