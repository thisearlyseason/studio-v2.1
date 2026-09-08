import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as accountDeletionPolicy from '../functions/src/account-deletion.ts';

const {
  filterUserMapDocuments,
  loadUserMapDocumentsByUid,
  USER_ARRAY_TARGETS,
  USER_DOCUMENT_TARGETS,
  USER_MAP_TARGETS,
} = accountDeletionPolicy;

test('embedded user-map collections are enumerated once per purge batch, not once per user', async () => {
  const calls = [];
  const firstPage = [
    { id: 'both', data: () => ({ signups: { user_a: {}, user_b: {} } }) },
  ];
  const secondPage = [
    { id: 'other', data: () => ({ signups: { user_c: {} } }) },
  ];
  const result = await loadUserMapDocumentsByUid(
    [{ collectionGroup: 'volunteers', mapField: 'signups' }],
    new Set(['user_a', 'user_b']),
    async (target, cursor) => {
      calls.push(`${target.collectionGroup}:${cursor || 'start'}`);
      return cursor ? { documents: secondPage } : { documents: firstPage, nextCursor: 'page-2' };
    },
  );

  assert.deepEqual(calls, ['volunteers:start', 'volunteers:page-2']);
  assert.deepEqual(result.failedTargets, []);
  assert.deepEqual(result.documentsByTarget.get('volunteers:signups')?.get('user_a')?.map(doc => doc.id), ['both']);
  assert.deepEqual(result.documentsByTarget.get('volunteers:signups')?.get('user_b')?.map(doc => doc.id), ['both']);
});

test('a failed dynamic-map scan is surfaced without discarding other target results', async () => {
  const result = await loadUserMapDocumentsByUid(
    [
      { collectionGroup: 'volunteers', mapField: 'signups' },
      { collectionGroup: 'events', mapField: 'userRsvps' },
    ],
    new Set(['user_a']),
    async target => {
      if (target.collectionGroup === 'events') throw new Error('index unavailable');
      return { documents: [{ data: () => ({ signups: { user_a: {} } }) }] };
    },
  );
  assert.deepEqual(result.failedTargets, ['events:userRsvps']);
  assert.equal(result.documentsByTarget.get('volunteers:signups')?.get('user_a')?.length, 1);
});

test('embedded user-map cleanup selects only documents containing the exact UID key', () => {
  const docs = [
    { id: 'exact', data: () => ({ signups: { user_a: { quantity: 2 }, user_ab: { quantity: 4 } } }) },
    { id: 'similar', data: () => ({ signups: { user_ab: { quantity: 4 } } }) },
    { id: 'missing', data: () => ({}) },
  ];

  assert.deepEqual(filterUserMapDocuments(docs, 'signups', 'user_a').map((doc) => doc.id), ['exact']);
});

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

test('every account-purge collection-group query has a deployed single-field index', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json', import.meta.url), 'utf8'));
  const deployed = new Set((config.fieldOverrides || []).flatMap((override) =>
    (override.indexes || [])
      .filter((index) => index.queryScope === 'COLLECTION_GROUP')
      .map(() => `${override.collectionGroup}:${override.fieldPath}`),
  ));
  const required = [
    ...USER_DOCUMENT_TARGETS
      .filter((target) => target.scope === 'collectionGroup')
      .map((target) => `${target.collection}:${target.field}`),
    ...USER_ARRAY_TARGETS
      .filter((target) => target.scope === 'collectionGroup')
      .map((target) => `${target.collection}:${target.field}`),
  ];

  assert.deepEqual(required.filter((entry) => !deployed.has(entry)).sort(), []);
});
