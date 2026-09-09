const assert = require('node:assert/strict');
const test = require('node:test');
const { sendUpcomingEventReminders } = require('../lib/index.js');

test('deployed scheduler declares every required Web Push secret binding', () => {
  const bindings = sendUpcomingEventReminders.__endpoint.secretEnvironmentVariables || [];
  assert.deepEqual(bindings.map(value => value.key).sort(), [
    'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT',
  ]);
});
