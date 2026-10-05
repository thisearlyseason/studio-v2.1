import assert from 'node:assert/strict';
import test from 'node:test';

test('installed apps retry push migration when returning to the foreground', async () => {
  const lifecycle = await import('../src/lib/push-foreground-refresh.ts').catch(() => ({}));
  assert.equal(typeof lifecycle.listenForPushForegroundRefresh, 'function');
  const listeners = new Map();
  const page = {
    addEventListener: (name, fn) => listeners.set(`page:${name}`, fn),
    removeEventListener: (name) => listeners.delete(`page:${name}`),
  };
  const documentSurface = {
    visibilityState: 'hidden',
    addEventListener: (name, fn) => listeners.set(`document:${name}`, fn),
    removeEventListener: (name) => listeners.delete(`document:${name}`),
  };
  let attempts = 0;
  const dispose = lifecycle.listenForPushForegroundRefresh({
    page,
    documentSurface,
    onForeground: () => { attempts += 1; },
  });
  listeners.get('document:visibilitychange')();
  assert.equal(attempts, 0);
  documentSurface.visibilityState = 'visible';
  listeners.get('document:visibilitychange')();
  listeners.get('page:pageshow')();
  assert.equal(attempts, 2);
  dispose();
  assert.equal(listeners.size, 0);
});
