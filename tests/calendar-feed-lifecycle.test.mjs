import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCalendarFeedMutation } from '../src/lib/calendar-feed-lifecycle.ts';
import { publicCalendarFeedFailure } from '../functions/src/calendar-feed-public-boundary.ts';

const activeTeamFeed = {
  id: 'a'.repeat(64),
  active: true,
  serverIssued: true,
  type: 'team',
  teamId: 'team-a',
};

test('calendar feed rotation deactivates the prior exact scope before issuing a replacement', () => {
  const result = resolveCalendarFeedMutation({
    action: 'rotate',
    type: 'team',
    teamId: 'team-a',
    teamIds: [],
    feeds: [activeTeamFeed],
    nextToken: 'b'.repeat(64),
  });

  assert.deepEqual(result, {
    kind: 'issue',
    token: 'b'.repeat(64),
    deactivateIds: ['a'.repeat(64)],
  });
});

test('calendar feed revoke is scope-specific and never deactivates a neighbouring feed', () => {
  const result = resolveCalendarFeedMutation({
    action: 'revoke',
    type: 'team',
    teamId: 'team-a',
    teamIds: [],
    feeds: [
      activeTeamFeed,
      { ...activeTeamFeed, id: 'c'.repeat(64), teamId: 'team-b' },
    ],
    nextToken: 'd'.repeat(64),
  });

  assert.deepEqual(result, {
    kind: 'revoked',
    deactivateIds: ['a'.repeat(64)],
  });
});

test('calendar feed create reuses only an active server-issued feed with the exact normalized scope', () => {
  const result = resolveCalendarFeedMutation({
    action: 'create',
    type: 'multi',
    teamId: null,
    teamIds: ['team-a', 'team-c'],
    feeds: [
      { id: 'e'.repeat(64), active: true, serverIssued: true, type: 'multi', teamIds: ['team-a', 'team-c'] },
      { id: 'f'.repeat(64), active: true, serverIssued: false, type: 'multi', teamIds: ['team-a', 'team-c'] },
    ],
    nextToken: 'g'.repeat(64),
  });

  assert.deepEqual(result, {
    kind: 'existing',
    token: 'e'.repeat(64),
    deactivateIds: [],
  });
});

test('public calendar fetch failures are intentionally non-enumerating not-found responses', () => {
  for (const reason of ['malformed', 'unknown', 'inactive', 'revoked', 'unauthorized', 'invalid-scope']) {
    assert.deepEqual(publicCalendarFeedFailure(reason), {
      status: 404,
      body: 'Calendar feed not found.',
    });
  }
});
