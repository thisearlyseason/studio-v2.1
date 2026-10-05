import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeOnboarding, profileWrites } from '../src/lib/native-auth/onboarding.ts';
const user = { uid: 'qa-athlete', emailVerified: true, email: 'ATHLETE@native.test', photoURL: 'https://example.test/photo.png' };
const valid = { fullName: '  QA   Athlete ', role: 'adult_player', adultConfirmed: true, termsAccepted: true, joinCode: ' demo_c ' };
const now = 1800000000000;

test('free profile uses verified identity and preserves join destination', () => {
  const data = parseNativeOnboarding(valid), writes = profileWrites(user, data, now);
  assert.equal(data.fullName, 'QA Athlete');
  assert.equal(writes.user.id, 'qa-athlete');
  assert.equal(writes.user.fullName, 'QA Athlete');
  assert.equal(writes.user.email, 'athlete@native.test');
  assert.equal(writes.user.notificationsEnabled, false);
  assert.equal(writes.user.upcomingEventNotificationsEnabled, false);
  assert.equal(writes.player.userId, 'qa-athlete');
  assert.equal(writes.player.isMinor, false);
  assert.equal(writes.returnPath, '/teams/join?code=DEMO_C');
  for (const key of ['isPro', 'subscription_status', 'plan_type', 'isPrimaryClubAuthority', 'teamId', 'guardianIds']) assert.equal(key in writes.user, false);
});

test('every allowed role stays free and non-authoritative', () => {
  // Profiles without a join code enter the dashboard; team creation is an explicit action.
  for (const role of ['coach', 'parent', 'admin', 'league_creator']) {
    const writes = profileWrites(user, parseNativeOnboarding({ ...valid, role, joinCode: '' }), now);
    assert.equal(writes.returnPath, '/dashboard', role);
    assert.equal(writes.player, null);
    assert.equal(writes.user.role, role);
    for (const key of ['isStaff', 'isPro', 'subscription_status', 'plan_type', 'isPrimaryClubAuthority', 'teamId', 'guardianIds']) {
      assert.equal(key in writes.user, false, `${role} must not acquire ${key}`);
    }
  }
  const parent = profileWrites(user, parseNativeOnboarding({ ...valid, role: 'parent' }), now);
  assert.equal(parent.returnPath, '/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C');
});

test('age/consent, name, and authority validation cannot be bypassed', () => {
  for (const change of [{ adultConfirmed: false }, { adultConfirmed: 'true' }, { termsAccepted: false }, { fullName: ' ' }, { fullName: 'A'.repeat(121) }, { fullName: 'Name\u0000Injected' }, { role: 'superadmin' }, { role: 'youth_player' }, { plan_type: 'pro' }, { joinCode: 'A'.repeat(129) }, { joinCode: 'CODE\nINJECT' }]) {
    assert.throws(() => parseNativeOnboarding({ ...valid, ...change }), { code: 'invalid_request' });
  }
});

test('provider photo and identity data cannot insert unsafe resource schemes', () => {
  const writes = profileWrites({ ...user, photoURL: 'javascript:alert(1)' }, parseNativeOnboarding(valid), now);
  assert.equal('avatarUrl' in writes.user, false);
  assert.throws(() => profileWrites({ ...user, emailVerified: false }, parseNativeOnboarding(valid), now), { code: 'account_unavailable' });
});
