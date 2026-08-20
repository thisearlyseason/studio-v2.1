import assert from 'node:assert/strict';
import test from 'node:test';

const authorityModule = await import('../src/lib/server-league-registration-authority.ts').catch(() => ({}));

test('league registration deletion trusts league ownership or the verified token role only', () => {
  assert.equal(
    typeof authorityModule.canDeleteLeagueRegistration,
    'function',
    'canDeleteLeagueRegistration must exist'
  );

  const canDelete = authorityModule.canDeleteLeagueRegistration;

  assert.equal(canDelete({ creatorId: 'owner-1', actorUid: 'owner-1', actorRole: 'coach' }), true);
  assert.equal(canDelete({ creatorId: 'owner-1', actorUid: 'other-1', actorRole: 'superadmin' }), true);
  assert.equal(
    canDelete({
      creatorId: 'owner-1',
      actorUid: 'other-1',
      actorRole: 'coach',
      profileRole: 'superadmin',
    }),
    false,
    'a mutable profile role must not grant cross-tenant deletion authority'
  );
});
