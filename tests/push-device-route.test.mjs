import assert from 'node:assert/strict';
import test from 'node:test';
import {
  communicationDb,
  communicationRequest,
  loadCommunicationRoute,
} from './helpers/communication-route-harness.mjs';
import { webPushSubscriptionId } from '../src/lib/web-push-subscription.ts';

const subscription = {
  endpoint: 'https://push.example.test/subscription/shared-browser',
  keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
};

test('signing in as User B atomically transfers the browser endpoint away from User A', async () => {
  const subscriptionId = webPushSubscriptionId(subscription);
  const { db, records } = communicationDb({
    'users/user-a': { webPushSubscriptions: [subscription] },
    'users/user-b': { webPushSubscriptions: [] },
    [`notificationWebPushSubscriptions/${subscriptionId}`]: { userId: 'user-a' },
  });
  const loaded = await loadCommunicationRoute(
    '../../src/app/api/notifications/device/route.ts',
    db,
    { uid: 'user-b', isAnonymous: false },
  );
  try {
    const response = await loaded.route.POST(communicationRequest({ subscription }));
    assert.equal(response.status, 200);
    assert.deepEqual(records.get('users/user-a').webPushSubscriptions, []);
    assert.deepEqual(records.get('users/user-b').webPushSubscriptions, [subscription]);
    assert.equal(records.get(`notificationWebPushSubscriptions/${subscriptionId}`).userId, 'user-b');
  } finally {
    loaded.dispose();
  }
});

test('authenticated opt-out removes only the caller endpoint and its matching ownership record', async () => {
  const subscriptionId = webPushSubscriptionId(subscription);
  const other = {
    endpoint: 'https://push.example.test/subscription/other-browser',
    keys: { p256dh: 'q'.repeat(87), auth: 'b'.repeat(22) },
  };
  const { db, records } = communicationDb({
    'users/user-b': { webPushSubscriptions: [subscription, other] },
    [`notificationWebPushSubscriptions/${subscriptionId}`]: { userId: 'user-b' },
  });
  const loaded = await loadCommunicationRoute(
    '../../src/app/api/notifications/device/route.ts',
    db,
    { uid: 'user-b', isAnonymous: false },
  );
  try {
    const response = await loaded.route.DELETE(communicationRequest({ subscription }));
    assert.equal(response.status, 200);
    assert.deepEqual(records.get('users/user-b').webPushSubscriptions, [other]);
    assert.equal(records.has(`notificationWebPushSubscriptions/${subscriptionId}`), false);
  } finally {
    loaded.dispose();
  }
});

test('User A cannot delete an endpoint ownership record after it has transferred to User B', async () => {
  const subscriptionId = webPushSubscriptionId(subscription);
  const { db, records } = communicationDb({
    'users/user-a': { webPushSubscriptions: [subscription] },
    'users/user-b': { webPushSubscriptions: [subscription] },
    [`notificationWebPushSubscriptions/${subscriptionId}`]: { userId: 'user-b' },
  });
  const loaded = await loadCommunicationRoute(
    '../../src/app/api/notifications/device/route.ts',
    db,
    { uid: 'user-a', isAnonymous: false },
  );
  try {
    const response = await loaded.route.DELETE(communicationRequest({ subscription }));
    assert.equal(response.status, 200);
    assert.deepEqual(records.get('users/user-a').webPushSubscriptions, []);
    assert.deepEqual(records.get('users/user-b').webPushSubscriptions, [subscription]);
    assert.equal(records.get(`notificationWebPushSubscriptions/${subscriptionId}`).userId, 'user-b');
  } finally {
    loaded.dispose();
  }
});
