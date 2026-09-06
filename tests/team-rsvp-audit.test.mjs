import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTeamRsvpAuditRecord } from '../src/lib/team-rsvp-audit.ts';

test('RSVP audit records retain only the authoritative actor, participant, status, and timestamp', () => {
  assert.deepEqual(buildTeamRsvpAuditRecord({
    actorId: 'coach-a',
    participantId: 'athlete-a',
    status: 'going',
    occurredAt: '2026-09-06T02:30:00.000Z',
  }), {
    actorId: 'coach-a',
    participantId: 'athlete-a',
    status: 'going',
    occurredAt: '2026-09-06T02:30:00.000Z',
  });
});

test('RSVP audit records reject invalid identifiers, statuses, and timestamps', () => {
  for (const input of [
    { actorId: '', participantId: 'athlete-a', status: 'going', occurredAt: '2026-09-06T02:30:00.000Z' },
    { actorId: 'coach-a', participantId: '', status: 'going', occurredAt: '2026-09-06T02:30:00.000Z' },
    { actorId: 'coach-a', participantId: 'athlete-a', status: 'unknown', occurredAt: '2026-09-06T02:30:00.000Z' },
    { actorId: 'coach-a', participantId: 'athlete-a', status: 'going', occurredAt: 'not-a-date' },
  ]) {
    assert.throws(() => buildTeamRsvpAuditRecord(input), /Invalid RSVP audit record/);
  }
});
