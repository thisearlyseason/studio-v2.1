import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import { prepareTournamentScheduleForDeployment } from '../src/lib/server-tournament-schedule-deployment.ts';

const REQUIRED_ALIASES = [
  'qa-coach-owner-a',
  'qa-coach-owner-b',
  'qa-pro-owner',
  'qa-elite-owner',
  'qa-school-owner',
  'qa-school-delegate',
  'qa-league-owner-a',
  'qa-league-owner-b',
  'qa-team-assistant',
  'qa-team-member',
  'qa-parent-a',
  'qa-parent-b',
  'qa-adult-player-a',
  'qa-adult-player-b',
  'qa-youth-invite',
  'qa-youth-active',
  'qa-superadmin',
  'qa-fake-superadmin',
  'qa-unverified',
  'qa-suspended',
  'qa-removed-member',
  'qa-pending-delete',
  'qa-owner-delete-blocked',
  'qa-multi-org',
  'qa-public-submitter',
  'qa-demo-a',
  'qa-demo-b',
];

const REQUIRED_DOMAINS = [
  'organization',
  'roster',
  'recruiting',
  'family',
  'schedule',
  'practice',
  'chat',
  'file',
  'compliance',
  'competition',
  'facility',
  'equipment',
  'public',
  'billing',
];

function byAlias(catalog, alias) {
  return catalog.identities.find(identity => identity.alias === alias);
}

function fixtureByAlias(catalog, alias) {
  return catalog.firestoreDocuments.find(document => document.data.fixtureAlias === alias);
}

function validateEnvironment(environment) {
  return spawnSync(
    process.execPath,
    ['scripts/qa/seed-phase2-emulator-fixtures.mjs', '--validate-environment-only'],
    {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        AUDIT_FIXTURE_PASSWORD: 'runtime-only-validation-value',
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
        GCLOUD_PROJECT: 'demo-final-certification',
        GOOGLE_CLOUD_PROJECT: 'demo-final-certification',
        ...environment,
      },
    },
  );
}

test('catalog contains every required alias with deterministic run-scoped references', () => {
  const first = buildFixtureCatalog('unit-a1');
  const second = buildFixtureCatalog('unit-a1');

  assert.deepEqual(first, second);
  assert.deepEqual(first.identities.map(identity => identity.alias), REQUIRED_ALIASES);
  assert.equal(new Set(first.identities.map(identity => identity.alias)).size, REQUIRED_ALIASES.length);
  assert.equal(first.runSuffix, 'unit-a1');
  assert.match(first.runId, /^final-cert-unit-a1$/);
  assert.ok(first.identities.every(identity => identity.cleanupOwner));
  assert.ok(first.identities.every(identity => !('password' in identity)));
  assert.ok(first.identities.every(identity => !('token' in identity)));
  assert.throws(() => buildFixtureCatalog('PRODUCTION'), /lowercase run suffix/);
  assert.throws(() => buildFixtureCatalog('../escape'), /lowercase run suffix/);
});

test('catalog preserves the frozen scenario selection without mutating it', () => {
  const before = CERTIFICATION_SCENARIOS.map(scenario => scenario.id);
  const catalog = buildFixtureCatalog('scenario-copy');

  assert.equal(Object.isFrozen(CERTIFICATION_SCENARIOS), true);
  assert.deepEqual(catalog.scenarioIds, before);
  assert.deepEqual(CERTIFICATION_SCENARIOS.map(scenario => scenario.id), before);
  assert.notStrictEqual(catalog.scenarioIds, CERTIFICATION_SCENARIOS);
});

test('tenants are visibly distinct and Parent A links only Team A and Team C', () => {
  const catalog = buildFixtureCatalog('tenant-a1');
  const teamAliases = catalog.teams.map(team => team.alias);
  const markers = catalog.teams.map(team => team.visibleMarker);

  assert.ok(teamAliases.includes('qa-team-a'));
  assert.ok(teamAliases.includes('qa-team-b'));
  assert.ok(teamAliases.includes('qa-team-c'));
  assert.equal(new Set(markers).size, markers.length);

  assert.deepEqual(byAlias(catalog, 'qa-parent-a').tenantAliases, ['qa-team-a', 'qa-team-c']);
  assert.deepEqual(byAlias(catalog, 'qa-parent-b').tenantAliases, ['qa-team-b']);
  assert.ok(!byAlias(catalog, 'qa-parent-a').tenantAliases.includes('qa-team-b'));
  assert.ok(!byAlias(catalog, 'qa-parent-b').tenantAliases.includes('qa-team-a'));

  assert.equal(catalog.households.find(household => household.alias === 'qa-household-a').children.length, 2);
  assert.deepEqual(
    catalog.households.find(household => household.alias === 'qa-household-a').teamAliases,
    ['qa-team-a', 'qa-team-c'],
  );
  assert.equal(catalog.teams.filter(team => team.ownerAlias === 'qa-coach-owner-a').length, 1);
  assert.equal(catalog.teams.find(team => team.alias === 'qa-team-c').ownerAlias, 'qa-league-owner-a');
});

test('membership projections carry the authority fields needed before team documents hydrate', () => {
  const catalog = buildFixtureCatalog('projection-a1');
  const eliteOwner = byAlias(catalog, 'qa-elite-owner');
  const eliteMemberships = catalog.fixtures.roster.filter(fixture => (
    fixture.path.startsWith(`users/${eliteOwner.uid}/teamMemberships/`)
  ));

  assert.equal(eliteMemberships.length, 3);
  assert.ok(eliteMemberships.every(fixture => fixture.data.planId === 'elite'));
  assert.ok(eliteMemberships.every(fixture => fixture.data.isPro === true));
  assert.ok(eliteMemberships.every(fixture => fixture.data.ownerUserId === eliteOwner.uid));
  assert.ok(eliteMemberships.every(fixture => !fixture.data.clubId));
});

test('destructive, demo, and tenant-distinction fixtures preserve their lifecycle boundaries', () => {
  const catalog = buildFixtureCatalog('lifecycle-a1');
  const publicAliases = new Set(catalog.fixtures.public.map(fixture => fixture.alias));
  const billingAliases = new Set(catalog.fixtures.billing.map(fixture => fixture.alias));

  assert.ok(catalog.leagues.some(league => (
    league.alias === 'qa-disposable-league' && league.ownerAlias === 'qa-owner-delete-blocked'
  )));
  assert.equal(
    catalog.fixtures.roster.find(fixture => fixture.alias === 'qa-team-a-qa-suspended-member')?.data.status,
    'removed',
  );
  assert.ok(publicAliases.has('qa-volunteer-opportunity-a'));
  assert.ok(publicAliases.has('qa-volunteer-opportunity-b'));
  assert.ok(billingAliases.has('qa-fundraiser-a'));
  assert.ok(billingAliases.has('qa-fundraiser-b'));
  assert.ok(catalog.firestoreDocuments.some(document => document.path.includes('demoWorkspaces/qa-demo-a-lifecycle-a1')));
  assert.ok(catalog.firestoreDocuments.some(document => document.path.includes('demoWorkspaces/qa-demo-b-lifecycle-a1')));
  assert.deepEqual(byAlias(catalog, 'qa-multi-org').leagueAliases, ['qa-league-a']);
  assert.ok(catalog.firestoreDocuments.some(document => (
    document.path.includes('/leagueMemberships/qa-league-a-lifecycle-a1') &&
    document.data.userId === byAlias(catalog, 'qa-multi-org').uid &&
    document.data.status === 'active'
  )));
  assert.ok(catalog.firestoreDocuments.some(document => (
    document.path.includes('/leagueMemberships/qa-league-a-lifecycle-a1') &&
    document.data.userId === byAlias(catalog, 'qa-removed-member').uid &&
    document.data.status === 'revoked'
  )));
});

test('catalog supplies every requested data domain plus file, time, and race negatives', () => {
  const catalog = buildFixtureCatalog('domain-a1');

  for (const domain of REQUIRED_DOMAINS) {
    assert.ok(catalog.fixtures[domain].length > 0, `${domain} fixtures must not be empty`);
  }

  assert.deepEqual(
    new Set(catalog.files.map(file => file.case)),
    new Set(['allowed', 'oversized', 'mime-spoofed', 'deleted', 'public', 'private']),
  );
  assert.ok(catalog.timeFixtures.some(fixture => fixture.case === 'cross-midnight'));
  assert.ok(catalog.timeFixtures.some(fixture => fixture.case === 'dst-spring-forward'));
  assert.ok(catalog.timeFixtures.some(fixture => fixture.case === 'dst-fall-back'));
  assert.ok(catalog.raceFixtures.every(fixture => fixture.barrierKey && fixture.participantAliases.length === 2));
  assert.ok(catalog.leagues.length >= 2);
  assert.ok(catalog.tournaments.length >= 2);
  assert.ok(catalog.organizations.some(organization => organization.kind === 'club'));
  assert.ok(catalog.organizations.some(organization => organization.kind === 'school'));
});

test('application readers receive tournament, feed, waiver, and conflict records at their real paths', () => {
  const catalog = buildFixtureCatalog('reader-a1');
  const tournament = fixtureByAlias(catalog, 'qa-tournament-a');
  const gameIds = new Set(tournament.data.tournamentGames.map(game => game.id));

  assert.match(tournament.path, /^teams\/[^/]+\/events\/[^/]+$/);
  assert.equal(tournament.data.isTournament, true);
  assert.equal(tournament.data.isArchived, false);
  assert.ok(tournament.data.tournamentTeamsData.length >= 4);
  assert.ok(['single_elimination', 'double_elimination', 'round_robin', 'pool_play_knockout'].includes(tournament.data.tournamentType));
  assert.ok(tournament.data.tournamentGames.length >= 3);
  assert.ok(tournament.data.tournamentGames.some(game => game.winnerTo));
  for (const game of tournament.data.tournamentGames) {
    for (const target of [game.winnerTo, game.loserTo].filter(Boolean)) assert.ok(gameIds.has(target));
  }

  assert.ok(catalog.fixtures.chat.filter(fixture => fixture.alias.endsWith('-feed-post'))
    .every(fixture => fixture.path.includes('/feedPosts/')));
  const waivers = catalog.fixtures.compliance.filter(fixture => fixture.path.startsWith('teams/') && fixture.alias.endsWith('-waiver'));
  assert.ok(waivers.every(fixture => (
    fixture.path.includes('/documents/') &&
    fixture.data.type === 'waiver' &&
    typeof fixture.data.isActive === 'boolean'
  )));
  assert.ok(waivers.some(fixture => fixture.data.isActive === true));
  assert.ok(waivers.some(fixture => fixture.data.isActive === false));

  const bookings = catalog.fixtures.facility.filter(fixture => fixture.alias.includes('-booking-'));
  assert.ok(bookings.length >= 2);
  assert.ok(bookings.every(fixture => fixture.path.startsWith('scheduleBookings/')));
  assert.ok(bookings.every(fixture => (
    /^\d{4}-\d{2}-\d{2}$/.test(fixture.data.date) &&
    Number.isInteger(fixture.data.startMinute) &&
    Number.isInteger(fixture.data.endMinute) &&
    fixture.data.endMinute > fixture.data.startMinute &&
    fixture.data.resourceId && fixture.data.teamIds.length > 0
  )));
  assert.equal(bookings[0].data.resourceId, bookings[1].data.resourceId);
  assert.ok(bookings[0].data.startMinute < bookings[1].data.endMinute);
  assert.ok(bookings[1].data.startMinute < bookings[0].data.endMinute);
});

test('seeded tournament bracket passes the application schedule preparer with a real dependency target', () => {
  const catalog = buildFixtureCatalog('topology-a1');
  const event = fixtureByAlias(catalog, 'qa-tournament-a').data;
  const prepared = prepareTournamentScheduleForDeployment(event, event.tournamentGames);
  const ids = new Set(prepared.map(game => game.id));

  assert.equal(prepared.length, 3);
  assert.ok(prepared.some(game => game.winnerTo && ids.has(game.winnerTo)));
});

test('game and public portal fixtures satisfy their list and visibility contracts', () => {
  const catalog = buildFixtureCatalog('portal-a1');
  const games = catalog.fixtures.competition.filter(fixture => fixture.path.includes('/games/'));
  const publicVolunteer = fixtureByAlias(catalog, 'qa-volunteer-opportunity-a');
  const privateVolunteer = fixtureByAlias(catalog, 'qa-volunteer-opportunity-b');
  const publicFundraiser = fixtureByAlias(catalog, 'qa-fundraiser-a');
  const privateFundraiser = fixtureByAlias(catalog, 'qa-fundraiser-b');
  const donation = fixtureByAlias(catalog, 'qa-donation-a');

  assert.ok(games.length >= 3);
  assert.ok(games.every(game => typeof game.data.date === 'string' && !Number.isNaN(Date.parse(game.data.date))));
  assert.deepEqual(
    [publicVolunteer.data.isShareable, privateVolunteer.data.isShareable],
    [true, false],
  );
  assert.ok(publicVolunteer.data.date && publicVolunteer.data.spots > 0);
  assert.ok(privateVolunteer.data.date && privateVolunteer.data.spots > 0);
  assert.ok(Object.values(publicVolunteer.data.signups).some(signup => signup.source === 'public_portal'));
  assert.deepEqual(
    [publicFundraiser.data.isShareable, privateFundraiser.data.isShareable],
    [true, false],
  );
  assert.ok(publicFundraiser.data.deadline && publicFundraiser.data.goalAmount > 0);
  assert.ok(Number.isFinite(publicFundraiser.data.currentAmount));
  assert.ok(privateFundraiser.data.deadline && privateFundraiser.data.goalAmount > 0);
  assert.equal(donation.path.startsWith(`${publicFundraiser.path}/donations/`), true);
  assert.equal(donation.data.source, 'public_portal');
  assert.equal(typeof donation.data.amount, 'number');
});

test('school hub and projections carry real squad links and delegated authority', () => {
  const catalog = buildFixtureCatalog('school-a1');
  const owner = byAlias(catalog, 'qa-school-owner');
  const delegate = byAlias(catalog, 'qa-school-delegate');
  const outsider = byAlias(catalog, 'qa-coach-owner-b');
  const hub = fixtureByAlias(catalog, 'qa-school-hub');
  const squads = catalog.teams.filter(team => team.type === 'school_squad');

  assert.match(hub.path, /^teams\/[^/]+$/);
  assert.equal(hub.data.type, 'school_hub');
  assert.equal(hub.data.ownerUserId, owner.uid);
  assert.deepEqual(hub.data.schoolAdminIds, [delegate.uid]);
  assert.ok(!hub.data.schoolAdminIds.includes(outsider.uid));
  assert.equal(squads.length, 3);
  assert.ok(squads.every(squad => squad.schoolId === hub.data.id));

  for (const identity of [owner, delegate]) {
    const projections = catalog.fixtures.roster.filter(fixture => (
      fixture.path.startsWith(`users/${identity.uid}/teamMemberships/`)
    ));
    assert.ok(projections.some(fixture => fixture.data.type === 'school_hub' && fixture.data.teamId === hub.data.id));
    assert.equal(projections.filter(fixture => fixture.data.type === 'school_squad').length, identity === owner ? 3 : 1);
    assert.ok(projections.filter(fixture => fixture.data.type === 'school_squad')
      .every(fixture => fixture.data.schoolId === hub.data.id));
  }
});

test('real user and team records expose coherent local entitlements without outbound recipients', () => {
  const catalog = buildFixtureCatalog('entitlement-a1');
  const expectedProfiles = new Map([
    ['qa-pro-owner', ['team', 'trialing', 1]],
    ['qa-elite-owner', ['elite', 'active', 8]],
    ['qa-school-owner', ['school', 'active', 15]],
    ['qa-league-owner-a', ['league', 'active', 17]],
    ['qa-coach-owner-a', ['team', 'past_due', 1]],
    ['qa-league-owner-b', ['league', 'canceled', 1]],
  ]);

  for (const [alias, [planType, status, limit]] of expectedProfiles) {
    const profile = fixtureByAlias(catalog, alias).data;
    assert.equal(profile.plan_type, planType);
    assert.equal(profile.subscription_status, status);
    assert.equal(profile.team_limit, limit);
    assert.equal(profile.notificationsEnabled, false);
    assert.deepEqual(profile.fcmTokens, []);
    assert.deepEqual(profile.webPushSubscriptions, []);
    assert.equal(profile.providerProvisioning, 'unprovisioned-test-descriptor');
  }

  assert.ok(catalog.teams.every(team => team.isDemo !== true));
  assert.ok(catalog.teams.every(team => team.outboundProvidersEnabled === false));
  assert.equal(fixtureByAlias(catalog, 'qa-pro-owner').data.subscription_status, 'trialing');
  assert.equal(fixtureByAlias(catalog, 'qa-coach-owner-a').data.subscription_status, 'past_due');
});

test('storage fixtures have deterministic payload generators, real policy paths, and exact lifecycle cleanup', () => {
  const catalog = buildFixtureCatalog('storage-a1');
  const present = catalog.storageObjects.filter(object => object.lifecycle === 'present');
  const deleted = catalog.storageObjects.filter(object => object.lifecycle === 'delete-after-write');
  const negative = catalog.storageObjects.filter(object => object.lifecycle === 'negative-upload-only');

  assert.ok(present.some(object => object.access === 'public' && object.path.startsWith('teams/') && object.path.includes('/branding/')));
  assert.ok(present.some(object => object.access === 'private' && object.path.startsWith('players/') && object.path.includes('/videos/')));
  assert.ok(present.some(object => object.ownerAlias === 'qa-pending-delete'));
  assert.ok(deleted.length >= 1);
  assert.deepEqual(new Set(negative.map(object => object.case)), new Set(['oversized', 'mime-spoofed']));
  assert.ok(catalog.storageObjects.every(object => object.payloadGenerator === 'repeat-seed-v1'));
  assert.ok(catalog.storageObjects.every(object => Number.isInteger(object.sizeBytes) && object.sizeBytes > 0));
  assert.deepEqual(
    catalog.cleanupSelectors.storage.objectPaths,
    catalog.storageObjects.map(object => object.path).sort(),
  );
  assert.ok(catalog.cleanupSelectors.storage.objectPaths.every(path => !path.includes('*')));
});

test('provider fixtures are explicit test or safe-sink records and never live mode', () => {
  const { providers, subscriptions } = buildFixtureCatalog('provider-a1');

  assert.equal(providers.stripe.mode, 'test');
  assert.equal(providers.stripe.livemode, false);
  assert.equal(providers.stripeConnect.mode, 'test');
  assert.equal(providers.stripeConnect.livemode, false);
  assert.equal(providers.resend.mode, 'safe-sink');
  assert.equal(providers.firebase.environment, 'emulator');
  assert.equal(providers.stripe.prices.length, 8);
  assert.deepEqual(
    new Set(providers.stripe.prices.map(price => price.planId)),
    new Set(['team', 'elite', 'league', 'school']),
  );
  assert.deepEqual(
    new Set(providers.stripe.prices.map(price => price.interval)),
    new Set(['month', 'year']),
  );
  assert.ok(providers.stripe.prices.every(price => price.livemode === false && price.objectSelector));
  assert.ok(subscriptions.every(subscription => subscription.livemode === false));
  assert.deepEqual(
    subscriptions.map(subscription => subscription.alias),
    [
      'billing-free',
      'billing-trialing',
      'billing-active-monthly',
      'billing-active-annual',
      'billing-past-due',
      'billing-canceled',
      'billing-addon',
      'billing-customer-deleted',
    ],
  );
});

test('public submitter payloads use unique synthetic contact coordinates per scenario', () => {
  const catalog = buildFixtureCatalog('public-a1');
  const submissions = catalog.fixtures.public.filter(fixture => fixture.data.submitterAlias === 'qa-public-submitter');
  const kinds = new Set(submissions.map(fixture => fixture.data.kind));

  assert.deepEqual(
    kinds,
    new Set(['contact', 'beta', 'coach-referral', 'event-registration', 'volunteer', 'donation']),
  );
  assert.equal(new Set(submissions.map(fixture => fixture.data.email)).size, submissions.length);
  assert.equal(new Set(submissions.map(fixture => fixture.data.phone)).size, submissions.length);
  assert.ok(submissions.every(fixture => fixture.data.email.endsWith('@phase2.test')));
});

test('cleanup selectors are exact, run-bounded, and cover every seeded document and account', () => {
  const catalog = buildFixtureCatalog('cleanup-a1');
  const selectors = catalog.cleanupSelectors;
  const allSelectorText = JSON.stringify(selectors);

  assert.equal(selectors.fixtureRunId, catalog.runId);
  assert.ok(!allSelectorText.includes('*'));
  assert.ok(!allSelectorText.includes('production'));
  assert.ok(selectors.firestore.recursiveRoots.every(path => path.split('/').length >= 2));
  assert.ok(selectors.firestore.recursiveRoots.every(path => path.includes('cleanup-a1')));
  assert.ok(selectors.auth.uids.every(uid => uid.includes('cleanup-a1')));
  assert.deepEqual(selectors.storage.objectPaths, catalog.storageObjects.map(object => object.path).sort());
  assert.deepEqual(selectors.stripe.metadata, { fixture_run_id: catalog.runId, livemode: 'false' });
  assert.ok(selectors.firestore.recursiveRoots.includes(`auditFixtureMetadata/${catalog.runId}`));

  for (const document of catalog.firestoreDocuments) {
    assert.ok(
      selectors.firestore.recursiveRoots.some(root => document.path === root || document.path.startsWith(`${root}/`)),
      `cleanup selectors must own ${document.path}`,
    );
  }
  for (const identity of catalog.identities.filter(identity => identity.accountKind === 'registered')) {
    assert.ok(selectors.auth.uids.includes(identity.uid));
  }
});

test('catalog is deeply frozen so later batches cannot rewrite fixture ownership', () => {
  const catalog = buildFixtureCatalog('frozen-a1');

  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.identities), true);
  assert.equal(Object.isFrozen(catalog.identities[0]), true);
  assert.equal(Object.isFrozen(catalog.cleanupSelectors.firestore.recursiveRoots), true);
  assert.throws(() => catalog.identities.push({ alias: 'forged' }), TypeError);
  assert.throws(() => { catalog.cleanupSelectors.fixtureRunId = 'forged'; }, TypeError);
});

test('seeder refuses production and every non-loopback emulator target before connecting', () => {
  const production = validateEnvironment({
    GCLOUD_PROJECT: 'the-squad-v2',
    GOOGLE_CLOUD_PROJECT: 'the-squad-v2',
  });
  assert.notEqual(production.status, 0);
  assert.match(`${production.stdout}${production.stderr}`, /must use a demo-/);

  for (const [variable, value] of [
    ['FIREBASE_AUTH_EMULATOR_HOST', 'firebase.example.test:9099'],
    ['FIRESTORE_EMULATOR_HOST', '10.0.0.5:8080'],
    ['FIREBASE_STORAGE_EMULATOR_HOST', 'staging.example.test:9199'],
  ]) {
    const result = validateEnvironment({ [variable]: value });
    assert.notEqual(result.status, 0, `${variable} must be rejected`);
    assert.match(`${result.stdout}${result.stderr}`, new RegExp(`${variable} must be loopback`));
  }
});

test('seeder rejects authority suffix, userinfo, path, missing port, and invalid port tricks', () => {
  const invalidAuthorities = [
    '[::1]@example.test:9099',
    'user@127.0.0.1:9099',
    '127.0.0.1:9099/path',
    'localhost',
    'localhost:not-a-port',
    '127.0.0.1:0',
    '[::1]:65536',
  ];
  for (const variable of [
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
  ]) {
    for (const authority of invalidAuthorities) {
      const result = validateEnvironment({ [variable]: authority });
      assert.notEqual(result.status, 0, `${variable} must reject ${authority}`);
      assert.match(`${result.stdout}${result.stderr}`, new RegExp(`${variable} must be loopback`));
    }
  }
});

test('seeder accepts all supported loopback host spellings without connecting', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
    const result = validateEnvironment({
      FIREBASE_AUTH_EMULATOR_HOST: `${host}:9099`,
      FIRESTORE_EMULATOR_HOST: `${host}:8080`,
      FIREBASE_STORAGE_EMULATOR_HOST: `${host}:9199`,
    });
    assert.equal(result.status, 0, `${host} should be accepted: ${result.stderr}`);
  }
});
