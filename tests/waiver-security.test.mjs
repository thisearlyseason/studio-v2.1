import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildWaiverVersionIdentity,
  canSignWaiverAssignment,
  canonicalWaiverRecordMatches,
  normalizeWaiverVersion,
  validateCoachWaiverSignatureInput,
  validateWaiverSignatureInput,
} from '../src/lib/waiver-security.ts';

test('waiver version identity is deterministic and changes with material text', () => {
  const first = buildWaiverVersionIdentity({ title: '  Travel Waiver ', content: 'Line one\r\nLine two', version: 1, waiverAudience: 'participant', assignedTo: ['member_b', 'member_a'] });
  const same = buildWaiverVersionIdentity({ title: 'Travel Waiver', content: 'Line one\nLine two', version: 1, waiverAudience: 'participant', assignedTo: ['member_a', 'member_b'] });
  const changed = buildWaiverVersionIdentity({ title: 'Travel Waiver', content: 'Line one\nLine changed', version: 2, waiverAudience: 'participant', assignedTo: ['member_a', 'member_b'] });
  assert.deepEqual(first, same);
  assert.equal(first.version, 1);
  assert.match(first.textHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.textHash, changed.textHash);
});

test('waiver identity binds audience and exact normalized assignment semantics', () => {
  const participant = buildWaiverVersionIdentity({ title: 'Terms', content: 'Body', version: 1, waiverAudience: 'participant', assignedTo: ['all'] });
  const team = buildWaiverVersionIdentity({ title: 'Terms', content: 'Body', version: 1, waiverAudience: 'team', assignedTo: ['all'] });
  const targeted = buildWaiverVersionIdentity({ title: 'Terms', content: 'Body', version: 1, waiverAudience: 'participant', assignedTo: ['member-a'] });
  assert.notEqual(participant.textHash, team.textHash);
  assert.notEqual(participant.textHash, targeted.textHash);
  assert.deepEqual(targeted.assignedTo, ['member-a']);
  assert.throws(() => buildWaiverVersionIdentity({ title: 'Terms', content: 'Body', version: 1, waiverAudience: 'participant', assignedTo: [] }), /assignment/i);
});

test('waiver versions normalize legacy documents to one and reject invalid values', () => {
  assert.equal(normalizeWaiverVersion(undefined), 1);
  assert.equal(normalizeWaiverVersion(3), 3);
  for (const value of [0, -1, 1.5, '2', Number.NaN]) {
    assert.throws(() => normalizeWaiverVersion(value), /version/i);
  }
});

test('signature input rejects timestamp event and unknown-field tampering', () => {
  const valid = {
    teamId: 'team_a', memberId: 'member_a', documentId: 'waiver_a', signatureName: 'Player A',
    expectedVersion: 2, expectedTextHash: 'a'.repeat(64),
  };
  assert.deepEqual(validateWaiverSignatureInput(valid), valid);
  for (const tamper of [
    { signedAt: '2000-01-01T00:00:00.000Z' },
    { eventId: 'foreign-event' },
    { unexpected: true },
  ]) {
    assert.throws(() => validateWaiverSignatureInput({ ...valid, ...tamper }), /unsupported/i);
  }
});

test('signature input validates identifiers signature and optional stale-version guards', () => {
  assert.throws(() => validateWaiverSignatureInput({ teamId: 'team', memberId: 'member', documentId: 'waiver', signatureName: 'Name' }), /version.*hash/i);
  for (const invalid of [
    {},
    { teamId: '../x', memberId: 'member', documentId: 'waiver', signatureName: 'Name' },
    { teamId: 'team', memberId: 'member', documentId: 'waiver', signatureName: ' ' },
    { teamId: 'team', memberId: 'member', documentId: 'waiver', signatureName: 'Name', expectedVersion: 0 },
    { teamId: 'team', memberId: 'member', documentId: 'waiver', signatureName: 'Name', expectedTextHash: 'nope' },
  ]) assert.throws(() => validateWaiverSignatureInput(invalid), /valid|version|hash/i);
});

test('coach signature input has its own exact allowlist and stale-version guards', () => {
  const valid = { teamId: 'team_a', documentId: 'waiver_a', signatureName: 'Coach A', expectedVersion: 2, expectedTextHash: 'b'.repeat(64) };
  assert.deepEqual(validateCoachWaiverSignatureInput(valid), valid);
  for (const tamper of [{ memberId: 'player' }, { signedAt: '2000-01-01' }, { eventId: 'event' }]) {
    assert.throws(() => validateCoachWaiverSignatureInput({ ...valid, ...tamper }), /unsupported/i);
  }
  assert.throws(() => validateCoachWaiverSignatureInput({ teamId: 'team', documentId: 'waiver', signatureName: 'Coach' }), /version.*hash/i);
});

test('immutable waiver records accept exact canonical replay and reject conflicting overwrite', () => {
  const expected = { documentId: 'waiver-a', version: 2, textHash: 'a'.repeat(64), waiverText: 'Terms', signedBy: 'u-a', signerName: 'Player A' };
  assert.equal(canonicalWaiverRecordMatches(expected, { ...expected }), true);
  assert.equal(canonicalWaiverRecordMatches({ ...expected, waiverText: 'Changed' }, expected), false);
  assert.equal(canonicalWaiverRecordMatches({ ...expected, signerName: 'Tampered Name' }, expected), false);
  assert.equal(canonicalWaiverRecordMatches({ ...expected, signedAt: 'different' }, expected), true);
});

test('signature assignment requires exact intended subject or all assignment', () => {
  assert.equal(canSignWaiverAssignment(['all'], ['member-a', 'player-a']), true);
  assert.equal(canSignWaiverAssignment(['member-a'], ['member-a', 'player-a']), true);
  assert.equal(canSignWaiverAssignment(['player-a'], ['member-a', 'player-a']), true);
  assert.equal(canSignWaiverAssignment(['member-b'], ['member-a', 'player-a']), false);
});
