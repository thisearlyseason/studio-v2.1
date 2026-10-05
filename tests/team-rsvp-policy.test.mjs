import assert from 'node:assert/strict';
import test from 'node:test';
import { canUpdateTeamRsvp, rsvpParticipantId } from '../src/lib/team-rsvp-policy.ts';

const activeEvent = { status: 'scheduled', isArchived: false };

test('a non-staff parent may RSVP for an active child but never their own root membership', () => {
  assert.equal(canUpdateTeamRsvp({
    event: activeEvent,
    callerUid: 'parent-a',
    callerRole: 'parent',
    callerIsStaff: false,
    callerHasActiveMembership: true,
    participantId: 'youth-a',
    participant: { parentId: 'parent-a' },
  }), true);
  assert.equal(canUpdateTeamRsvp({
    event: activeEvent,
    callerUid: 'parent-a',
    callerRole: 'parent',
    callerIsStaff: false,
    callerHasActiveMembership: true,
    participantId: 'parent-a',
    participant: { userId: 'parent-a' },
  }), false);
});

test('outsiders and inactive events cannot receive an RSVP while staff retains team override', () => {
  assert.equal(canUpdateTeamRsvp({
    event: activeEvent,
    callerUid: 'parent-b',
    callerRole: 'parent',
    callerIsStaff: false,
    callerHasActiveMembership: false,
    participantId: 'youth-a',
    participant: { parentId: 'parent-a' },
  }), false);
  assert.equal(canUpdateTeamRsvp({
    event: { status: 'cancelled' },
    callerUid: 'coach-a',
    callerRole: 'coach',
    callerIsStaff: true,
    callerHasActiveMembership: true,
    participantId: 'youth-a',
    participant: { parentId: 'parent-a' },
  }), false);
  assert.equal(canUpdateTeamRsvp({
    event: { isArchived: true },
    callerUid: 'coach-a',
    callerRole: 'coach',
    callerIsStaff: true,
    callerHasActiveMembership: true,
    participantId: 'youth-a',
    participant: { parentId: 'parent-a' },
  }), false);
  assert.equal(canUpdateTeamRsvp({
    event: activeEvent,
    callerUid: 'coach-a',
    callerRole: 'coach',
    callerIsStaff: true,
    callerHasActiveMembership: true,
    participantId: 'youth-a',
    participant: { parentId: 'parent-a' },
  }), true);
});

test('a removed participant account cannot RSVP even for its own former membership', () => {
  assert.equal(canUpdateTeamRsvp({
    event: activeEvent,
    callerUid: 'removed-player',
    callerRole: 'adult_player',
    callerIsStaff: false,
    callerHasActiveMembership: false,
    participantId: 'removed-player',
    participant: { userId: 'removed-player' },
  }), false);
});

test('guardian RSVP uses an invited child account identity when present', () => {
  assert.equal(rsvpParticipantId({ id: 'player-document', userId: 'youth-login' }), 'youth-login');
  assert.equal(rsvpParticipantId({ id: 'accountless-player' }), 'accountless-player');
});
