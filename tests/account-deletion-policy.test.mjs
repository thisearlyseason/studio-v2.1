import assert from 'node:assert/strict';
import test from 'node:test';
import * as accountDeletionPolicy from '../functions/src/account-deletion.ts';

const {
  USER_ARRAY_TARGETS,
  USER_DOCUMENT_TARGETS,
  USER_MAP_TARGETS,
} = accountDeletionPolicy;

test('account purge covers personal profiles, memberships, messages, invites, and calendar data', () => {
  const documentTargets = new Set(
    USER_DOCUMENT_TARGETS.map((target) => `${target.collection}:${target.field}`),
  );

  for (const expected of [
    'calendarFeeds:userId',
    'calendarSync:userId',
    'notificationDeviceTokens:userId',
    'members:userId',
    'messages:authorId',
    'signatures:userId',
    'invites:parentId',
    'invites:createdBy',
  ]) {
    assert.equal(documentTargets.has(expected), true, expected);
  }
});

test('account purge removes organization access caches and embedded participation maps', () => {
  assert.deepEqual(
    USER_ARRAY_TARGETS.map((target) => `${target.collection}:${target.field}`).sort(),
    ['groupChats:memberIds', 'leagues:memberUserIds', 'tournaments:memberUserIds'],
  );

  const mapTargets = new Set(
    USER_MAP_TARGETS.map((target) => `${target.collectionGroup}:${target.mapField}`),
  );
  for (const expected of [
    'volunteers:signups',
    'fundraising:finances',
    'equipment:assignments',
    'events:userRsvps',
    'drills:watchedBy',
  ]) {
    assert.equal(mapTargets.has(expected), true, expected);
  }
});

test('financial audit collections are not silently destroyed by account purge', () => {
  const collections = new Set(USER_DOCUMENT_TARGETS.map((target) => target.collection));
  for (const retained of [
    'subscriptions',
    'payments',
    'donations',
    'stripeWebhookEvents',
  ]) {
    assert.equal(collections.has(retained), false, retained);
  }
});
