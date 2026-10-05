import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertSchedulerTargetSafety,
  buildSchedulerFixtureGraph,
} from '../scripts/qa/certification/run-scheduler-batches.mjs';

test('scheduler certification refuses production and non-owned identifiers', () => {
  assert.throws(
    () => assertSchedulerTargetSafety({ projectId: 'the-squad-v2-10575712-17216', runId: 'sched-cert-safe' }),
    /isolated staging project/i,
  );
  assert.throws(
    () => assertSchedulerTargetSafety({ projectId: 'the-squad-v2-staging', runId: 'ordinary-user' }),
    /staging-owned run identifier/i,
  );
  assert.doesNotThrow(() => assertSchedulerTargetSafety({
    projectId: 'the-squad-v2-staging',
    runId: 'sched-cert-20260908-0212',
  }));
});

test('scheduler fixture graph owns every destructive path and keeps its live exclusion separate', () => {
  const graph = buildSchedulerFixtureGraph({
    runId: 'sched-cert-20260908-0212',
    now: new Date('2026-09-08T02:12:00.000Z'),
  });

  assert.equal(graph.event.date, '2026-09-07');
  assert.equal(graph.event.startTime, '23:59');
  assert.equal(graph.team.timeZone, 'America/Edmonton');
  assert.equal(graph.reminderUser.role, 'adult_player');
  assert.equal(graph.reminderUser.fcmTokens.length, 1);
  assert.equal(graph.liveUser.isAnonymousFixture, false);
  assert.equal(graph.anonymousUser.isAnonymousFixture, true);
  assert.equal(graph.purgeOwnerRequestExpectedStatus, 'blocked');
  assert.deepEqual(graph.schedulerJobs, [
    'firebase-schedule-purgeExpiredDeletionRequests-us-central1',
    'firebase-schedule-sendUpcomingEventReminders-us-central1',
    'firebase-schedule-cleanupAnonymousUsers-us-central1',
  ]);
  assert.ok(graph.cleanupPaths.every(path => path.includes('sched-cert-20260908-0212')));
  assert.equal(new Set(graph.cleanupPaths).size, graph.cleanupPaths.length);
});
