import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWebPushSubscription,
  webPushSubscriptionId,
} from '../src/lib/web-push-subscription.ts';

const valid = {
  endpoint: 'https://push.example.test/subscription/abc',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};

test('normalizes a bounded HTTPS web push subscription', () => {
  assert.deepEqual(normalizeWebPushSubscription(valid), valid);
  assert.match(webPushSubscriptionId(valid), /^[a-f0-9]{64}$/);
});

test('rejects a non-HTTPS or incomplete web push subscription', () => {
  assert.equal(
    normalizeWebPushSubscription({ ...valid, endpoint: 'http://push.example.test/x' }),
    null
  );
  assert.equal(
    normalizeWebPushSubscription({ endpoint: valid.endpoint, keys: { auth: valid.keys.auth } }),
    null
  );
});
