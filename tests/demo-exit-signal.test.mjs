import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelDemoExitPending, clearDemoExitPending, DEMO_EXIT_CANCELLED_EVENT, DEMO_EXIT_EVENT, DEMO_EXIT_PENDING_KEY, DEMO_EXIT_RETRY_REQUIRED_KEY, markDemoExitPending, requireDemoExitRetry } from '../src/lib/client-auth.ts';

test('marking demo exit persists the guard and synchronously signals live readers', () => {
  const writes = [];
  const target = new EventTarget();
  let signaled = 0;
  target.addEventListener(DEMO_EXIT_EVENT, () => { signaled += 1; });
  globalThis.localStorage = {
    setItem: (key, value) => writes.push([key, value]),
    removeItem: key => writes.push([key, null]),
  };
  globalThis.window = target;

  try {
    markDemoExitPending();
    assert.deepEqual(writes, [[DEMO_EXIT_PENDING_KEY, 'true']]);
    requireDemoExitRetry();
    assert.deepEqual(writes, [[DEMO_EXIT_PENDING_KEY, 'true'], [DEMO_EXIT_RETRY_REQUIRED_KEY, 'true']]);
    assert.equal(signaled, 1);
    let resumed = 0;
    target.addEventListener(DEMO_EXIT_CANCELLED_EVENT, () => { resumed += 1; });
    clearDemoExitPending();
    assert.deepEqual(writes.slice(-2), [[DEMO_EXIT_PENDING_KEY, null], [DEMO_EXIT_RETRY_REQUIRED_KEY, null]]);
    assert.equal(resumed, 0);
    cancelDemoExitPending();
    assert.deepEqual(writes.slice(-2), [[DEMO_EXIT_PENDING_KEY, null], [DEMO_EXIT_RETRY_REQUIRED_KEY, null]]);
    assert.equal(resumed, 1);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});
