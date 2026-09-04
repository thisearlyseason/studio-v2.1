import assert from 'node:assert/strict';
import test from 'node:test';
import { Timestamp } from 'firebase/firestore';

import { feedTimestampToDate, formatFeedDistance } from '../src/lib/feed-date.ts';

test('feed timestamps accept live Firestore Timestamp values', () => {
  const timestamp = Timestamp.fromDate(new Date('2026-09-04T18:00:00.000Z'));
  assert.equal(feedTimestampToDate(timestamp)?.toISOString(), '2026-09-04T18:00:00.000Z');
  assert.equal(
    formatFeedDistance(timestamp, new Date('2026-09-04T18:05:00.000Z')),
    '5 minutes ago',
  );
});

test('feed timestamps accept ISO strings and serialized emulator shapes', () => {
  assert.equal(
    feedTimestampToDate('2026-09-04T18:00:00.000Z')?.toISOString(),
    '2026-09-04T18:00:00.000Z',
  );
  assert.equal(
    feedTimestampToDate({ _seconds: 1_788_544_800, _nanoseconds: 0 })?.toISOString(),
    '2026-09-04T18:00:00.000Z',
  );
});

test('feed timestamp rendering fails soft for missing or malformed legacy data', () => {
  assert.equal(feedTimestampToDate('not-a-date'), null);
  assert.equal(formatFeedDistance('not-a-date'), 'recently');
  assert.equal(formatFeedDistance(undefined), 'recently');
});
