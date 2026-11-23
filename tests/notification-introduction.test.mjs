import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, communicationRequest, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

test('notification onboarding saves only the signed-in account choice and preserves it on a retry', async () => {
  const { db, records } = communicationDb({
    'users/coach': { notificationInvitationPending: true },
    'users/other': { notificationInvitationPending: true },
  });
  const app = await loadCommunicationRoute('../../src/app/api/notifications/introduction/route.ts', db, { uid: 'coach' });
  try {
    const choose = (choice, reminders) => app.route.POST(communicationRequest({ choice, reminders, uid: 'other' }));
    assert.equal((await choose('guide', false)).status, 200);
    assert.equal(records.get('users/coach').notificationInvitationPending, true);
    assert.equal((await choose('enable', true)).status, 200);
    assert.equal((await choose('skip', false)).status, 200);
    assert.equal(records.get('users/coach').notificationsEnabled, true);
    assert.equal(records.get('users/coach').upcomingEventNotificationsEnabled, true);
    assert.equal(records.get('users/coach').notificationInvitationPending, false);
    assert.deepEqual(records.get('users/other'), { notificationInvitationPending: true });
  } finally { app.dispose(); }
});
