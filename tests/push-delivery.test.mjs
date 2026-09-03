import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('team chat sends only to other channel members', async () => {
  const chat = await source('../src/app/api/teams/chat/message/route.ts');
  const sender = await source('../src/lib/server-notification-delivery.ts');
  assert.match(chat, /memberId !== auth\.uid/);
  assert.match(chat, /return sendNotificationToUsers/);
  assert.match(sender, /sendEachForMulticast/);
  assert.match(sender, /webpush\.sendNotification/);
});

test('notify route keeps authorization before shared delivery', async () => {
  const notify = await source('../src/app/api/notify/route.ts');
  assert.match(notify, /getTeamAuthority/);
  assert.match(notify, /findActiveTeamMember/);
  assert.match(notify, /sendNotificationToUsers/);
});
