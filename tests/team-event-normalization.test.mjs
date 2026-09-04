import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTeamEvent } from '../src/lib/team-event-normalization.ts';

test('legacy subcollection events inherit their containing team ID', () => {
  assert.deepEqual(
    normalizeTeamEvent({ id: 'event-1', title: 'Practice' }, 'team-a'),
    { id: 'event-1', title: 'Practice', teamId: 'team-a' },
  );
});

test('an explicit event team ID is preserved', () => {
  assert.equal(normalizeTeamEvent({ id: 'event-2', teamId: 'team-b' }, 'team-a').teamId, 'team-b');
});

test('events without any team context fail closed', () => {
  assert.equal(normalizeTeamEvent({ id: 'event-3' }, ''), null);
});
