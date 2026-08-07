import assert from 'node:assert/strict';
import test from 'node:test';
import { isAlertRelevantToRecipient } from '../src/lib/alert-audience.ts';

const player = { userId: 'player-1', isStaff: false, isPlayer: true, isParent: false };
const coach = { userId: 'coach-1', isStaff: true, isPlayer: false, isParent: false };

test('only alerts intended for the signed-in role can enter the inbox or badge count', () => {
  assert.equal(isAlertRelevantToRecipient({ audience: 'everyone' }, player), true);
  assert.equal(isAlertRelevantToRecipient({ audience: 'players' }, player), true);
  assert.equal(isAlertRelevantToRecipient({ audience: 'coaches' }, player), false);
  assert.equal(isAlertRelevantToRecipient({ audience: 'coaches' }, coach), true);
  assert.equal(isAlertRelevantToRecipient({ audience: 'unknown' }, coach), false);
});

test('a targeted alert is visible only to its exact recipient', () => {
  assert.equal(isAlertRelevantToRecipient({ audience: 'everyone', targetUserId: 'player-1' }, player), true);
  assert.equal(isAlertRelevantToRecipient({ audience: 'players', targetUserId: 'someone-else' }, player), false);
});
