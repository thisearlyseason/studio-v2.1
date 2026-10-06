import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserAuthGate } from '../src/lib/native-auth/browser-gate.ts';
test('remounted login waits for the previous owner and stale release cannot unlock a new account', () => {
  const gate = createBrowserAuthGate(), seen = [];
  const unsubscribe = gate.subscribe(() => seen.push(gate.busy()));
  const releaseOld = gate.acquire();
  assert.equal(gate.acquire(), null);
  releaseOld();
  const releaseNew = gate.acquire();
  releaseOld();
  assert.equal(gate.busy(), true);
  releaseNew(); unsubscribe();
  assert.deepEqual(seen, [true, false, true, false]);
});
