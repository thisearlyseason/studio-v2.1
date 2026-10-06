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

test('team approval requires a schedulable roster and confirmed payment', () => {
  const league = {teams: {recruit_entry: {status:'pending'}}};
  const entry = {protocol_id:'team_config', status:'pending',registrationCost:0};
  const check = (l=league,e=entry) => authorityModule.leagueTeamApprovalError(l,e,'entry');
  assert.equal(check(),null);
  assert.match(check({...league,schedule:[{id:'game'}]}),/before generating/);
  assert.match(check({...league,isArchived:true}),/before generating/);
  assert.match(check(league,{...entry,protocol_id:'player_config'}),/team registration/);
  assert.match(check(league,{...entry,registrationCost:20,payment:{mode:'stripe',status:'pending'},payment_received:true}),/Stripe must confirm/);
  assert.equal(check(league,{...entry,registrationCost:20,payment:{mode:'stripe',status:'paid'}}),null);
  assert.match(check(league,{...entry,registrationCost:20,payment:{mode:'offline'}}),/offline payment/);
  assert.equal(check(league,{...entry,registrationCost:20,payment:{mode:'offline'},payment_received:true}),null);
  assert.equal(check({...league,schedule:[{}]},{...entry,status:'accepted'}),null);
});
