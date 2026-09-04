import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';
import nextEnvironment from '@next/env';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import * as fixtureCatalogModule from '../scripts/qa/certification/fixture-catalog.mjs';
import { prepareTournamentScheduleForDeployment } from '../src/lib/server-tournament-schedule-deployment.ts';
import * as scheduleDeploymentModule from '../src/lib/server-schedule-deployment.ts';

const { processEnv, resetEnv } = nextEnvironment;

const NEXT_SERVER_STUB = `
  export class NextResponse extends Response {
    static json(body, init = {}) {
      const headers = new Headers(init.headers || {});
      if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      return new NextResponse(JSON.stringify(body), { ...init, headers });
    }
  }
  export class NextRequest extends Request {}
`;

async function importActualRouteWithBoundaryStubs(relativePath, stubs) {
  const entryPoint = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'certification-provider-boundary',
      setup(esbuild) {
        esbuild.onResolve({ filter: /.*/ }, args => (
          Object.hasOwn(stubs, args.path)
            ? { path: args.path, namespace: 'certification-provider-boundary' }
            : null
        ));
        esbuild.onLoad({ filter: /.*/, namespace: 'certification-provider-boundary' }, args => ({
          contents: stubs[args.path],
          loader: 'js',
        }));
      },
    }],
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

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
  assert.notDeepEqual(bookings[0].data.teamIds, bookings[1].data.teamIds);
  assert.ok(bookings[0].data.startMinute < bookings[1].data.endMinute);
  assert.ok(bookings[1].data.startMinute < bookings[0].data.endMinute);
});

test('seeded tournament bracket passes the application schedule preparer with a real dependency target', () => {
  const catalog = buildFixtureCatalog('topology-a1');
  const event = fixtureByAlias(catalog, 'qa-tournament-a').data;
  const selectedFields = event.selectedFields;
  assert.ok(selectedFields.every(field => typeof field === 'string'));
  const browserUniqueFields = selectedFields.filter((fieldId, index, fields) => (
    fields.findIndex(candidate => candidate.toLowerCase() === fieldId.toLowerCase()) === index
  ));
  const prepared = prepareTournamentScheduleForDeployment(event, event.tournamentGames);
  const ids = new Set(prepared.map(game => game.id));

  assert.deepEqual(browserUniqueFields, [
    'qa-facility-a-topology-a1:FALCON-A-TOPOLOGY-A1 Main Field',
  ]);
  assert.equal(prepared.length, 3);
  assert.ok(prepared.every(game => browserUniqueFields.includes(game.resourceId)));
  assert.ok(prepared.some(game => game.winnerTo && ids.has(game.winnerTo)));
});

test('facility booking identity matches the picker and rejects a different-team overlap on the shared field', () => {
  const catalog = buildFixtureCatalog('facility-a1');
  const booking = fixtureByAlias(catalog, 'qa-facility-a-booking-primary').data;
  const expectedPickerResource = 'qa-facility-a-facility-a1:FALCON-A-FACILITY-A1 Main Field';

  assert.equal(booking.resourceId, expectedPickerResource);
  assert.equal(typeof scheduleDeploymentModule.findExternalBookingConflicts, 'function');

  const conflicts = scheduleDeploymentModule.findExternalBookingConflicts(
    'qa-league-a-facility-a1',
    [{
      id: 'different-team-game',
      team1Id: 'unrelated-team-1',
      team2Id: 'unrelated-team-2',
      date: '2026-10-15',
      time: '6:15 PM',
      location: 'FALCON-A-FACILITY-A1 Facility - FALCON-A-FACILITY-A1 Main Field',
      resourceId: expectedPickerResource,
      durationMinutes: 60,
    }],
    [{ id: 'fixture-booking', ...booking }],
  );

  assert.deepEqual(conflicts, [
    'FALCON-A-FACILITY-A1 Facility - FALCON-A-FACILITY-A1 Main Field is already booked at 2026-10-15 6:15 PM.',
  ]);
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
  assert.deepEqual(
    new Set(catalog.storageObjects.map(object => object.payloadGenerator)),
    new Set(['solid-png-v1', 'solid-jpeg-v1', 'tiny-mp4-v1', 'exact-size-v1', 'mime-spoof-pe-v1']),
  );
  assert.ok(catalog.storageObjects.every(object => Number.isInteger(object.sizeBytes) && object.sizeBytes > 0));
  assert.deepEqual(
    catalog.cleanupSelectors.storage.objectPaths,
    catalog.storageObjects.map(object => object.path).sort(),
  );
  assert.ok(catalog.cleanupSelectors.storage.objectPaths.every(path => !path.includes('*')));
});

test('positive Storage fixtures decode as their declared media and the spoof detects as an executable', async () => {
  assert.equal(typeof fixtureCatalogModule.materializeFixtureMediaBytes, 'function');
  assert.equal(typeof fixtureCatalogModule.inspectFixtureMedia, 'function');
  const catalog = buildFixtureCatalog('media-a1');
  const expected = new Map([
    ['qa-file-allowed', { detectedMime: 'image/png', width: 16, height: 16 }],
    ['qa-file-deleted', { detectedMime: 'image/png', width: 16, height: 16 }],
    ['qa-file-public', { detectedMime: 'image/jpeg', width: 16, height: 16 }],
    ['qa-file-private', { detectedMime: 'video/mp4', durationSeconds: 1, videoCodec: 'avc1' }],
    ['qa-file-pending-delete', { detectedMime: 'video/mp4', durationSeconds: 1, videoCodec: 'avc1' }],
  ]);

  for (const [alias, expectedMetadata] of expected) {
    const object = catalog.storageObjects.find(candidate => candidate.alias === alias);
    const first = fixtureCatalogModule.materializeFixtureMediaBytes(object);
    const second = fixtureCatalogModule.materializeFixtureMediaBytes(object);
    assert.deepEqual(first, second, `${alias} bytes must be deterministic`);
    assert.equal(first.length, object.sizeBytes, `${alias} descriptor must match actual bytes`);
    assert.deepEqual(await fixtureCatalogModule.inspectFixtureMedia(first), expectedMetadata);
  }

  const spoof = catalog.storageObjects.find(object => object.alias === 'qa-file-mime-spoofed');
  const spoofBytes = fixtureCatalogModule.materializeFixtureMediaBytes(spoof);
  const spoofMetadata = await fixtureCatalogModule.inspectFixtureMedia(spoofBytes);
  assert.equal(spoof.contentType, 'image/png');
  assert.equal(spoofMetadata.detectedMime, 'application/x-msdownload');
  assert.equal(spoofMetadata.detectedMime, spoof.detectedMime);
  assert.notEqual(spoofMetadata.detectedMime, spoof.contentType);
});

test('fixture event, document, and drill notifications cannot leave the local boundary', async () => {
  const clientDelivery = await import('../src/lib/client-team-notification.ts');
  const fixtureTeam = buildFixtureCatalog('outbound-a1').teams.find(team => team.alias === 'qa-pro-team');
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    for (const source of ['event', 'document', 'drill']) {
      const result = await clientDelivery.dispatchTeamNotification({
        source,
        team: fixtureTeam,
        idToken: 'synthetic-test-token',
        teamId: fixtureTeam.id,
        memberUserIds: ['synthetic-member'],
        title: 'Synthetic title',
        body: 'Synthetic body',
        emailSubject: 'Synthetic subject',
        emailHtml: '<p>Synthetic body</p>',
      });
      assert.deepEqual(result, { status: 'suppressed', requestCount: 0 });
    }
    assert.deepEqual(calls, [], 'event, document, and drill must not call the real fetch boundary');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('dotenv-loaded credentials cannot escape actual account and team provider entry paths', async () => {
  const environmentKeys = [
    'AUDIT_OUTBOUND_PROVIDER_MODE',
    'RESEND_API_KEY',
    'RESEND_BASE_URL',
    'STRIPE_SECRET_KEY',
    '__NEXT_PROCESSED_ENV',
  ];
  const previousEnvironment = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const externalAttempts = [];

  try {
    for (const key of environmentKeys) delete process.env[key];
    processEnv([{
      path: '.env.local',
      contents: [
        'AUDIT_OUTBOUND_PROVIDER_MODE=block',
        'RESEND_API_KEY=re_dotenv_synthetic_value',
        'STRIPE_SECRET_KEY=sk_test_dotenv_synthetic_value',
      ].join('\n'),
    }], process.cwd(), { error() {} }, true);
    assert.equal(process.env.AUDIT_OUTBOUND_PROVIDER_MODE, 'block');
    assert.match(process.env.RESEND_API_KEY || '', /^re_dotenv_/);
    assert.match(process.env.STRIPE_SECRET_KEY || '', /^sk_test_dotenv_/);

    globalThis.fetch = async (...args) => {
      externalAttempts.push(args);
      return new Response(JSON.stringify({ id: 'intercepted-provider-attempt' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    console.error = () => {};

    const passwordResetRoute = await importActualRouteWithBoundaryStubs(
      '../src/app/api/email/reset-password/route.ts',
      {
        'next/server': NEXT_SERVER_STUB,
        'firebase-admin': `
          export function auth() {
            return { generatePasswordResetLink: async () => 'http://127.0.0.1/reset-link' };
          }
        `,
        '@/lib/firebase-admin': 'export function ensureAdminInit() {}; export const adminDb = {};',
        '@/lib/email-templates': `
          export function passwordResetEmail() {
            return { subject: 'Local reset', html: '<p>Local reset</p>' };
          }
        `,
        '@/lib/server-request-guards': `
          export class RequestBodyError extends Error {}
          export async function readJsonBodyWithLimit(request) { return request.json(); }
          export async function enforcePublicRateLimit() { return null; }
        `,
      },
    );
    const passwordResponse = await passwordResetRoute.POST(new Request('http://127.0.0.1/api/email/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fixture-reset@phase2.test' }),
    }));
    assert.equal(passwordResponse.status, 500, 'password-reset handler must fail closed in audit mode');

    const genericEmailRoute = await importActualRouteWithBoundaryStubs(
      '../src/app/api/email/send/route.ts',
      {
        'next/server': NEXT_SERVER_STUB,
        '@/lib/api-auth': `export async function verifyFirebaseToken() { return { uid: 'fixture-coach', role: 'coach' }; }`,
        '@/lib/firebase-admin': 'export const adminDb = {};',
        '@/lib/server-team-access': `
          export async function getTeamAuthority() { return { isStaff: true }; }
          export async function findActiveTeamMember() {
            return { data: { email: 'fixture-member@phase2.test', userId: 'fixture-member' } };
          }
        `,
        '@/lib/server-request-guards': `
          export class RequestBodyError extends Error {}
          export async function readJsonBodyWithLimit(request) { return request.json(); }
          export async function enforceUserRateLimit() { return null; }
        `,
      },
    );
    const genericResponse = await genericEmailRoute.POST(new Request('http://127.0.0.1/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'fixture-team',
        recipientUserIds: ['fixture-member'],
        subject: 'Fixture notification',
        html: '<p>Fixture notification</p>',
      }),
    }));
    assert.equal(genericResponse.status, 500, 'generic team-email handler must fail closed in audit mode');

    const stripeClient = await import('../src/lib/stripe-client.ts');
    assert.throws(() => stripeClient.getStripe(), /Stripe outbound provider access is blocked/);
    assert.deepEqual(externalAttempts, [], 'no actual provider SDK may reach fetch in audit mode');
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    resetEnv();
    for (const [key, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('audit mode blocks shared and direct notification provider entry paths', async () => {
  const previousAuditMode = process.env.AUDIT_OUTBOUND_PROVIDER_MODE;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;
  const originalConsoleError = console.error;
  globalThis.__certificationPushAttempts = [];
  try {
    process.env.AUDIT_OUTBOUND_PROVIDER_MODE = 'block';
    process.env.INTERNAL_API_SECRET = 'synthetic-local-secret';
    console.error = () => {};
    const notificationDelivery = await importActualRouteWithBoundaryStubs(
      '../src/lib/server-notification-delivery.ts',
      {
        'firebase-admin': `
          export function messaging() {
            return {
              async sendEachForMulticast() {
                globalThis.__certificationPushAttempts.push('shared-fcm-multicast');
                return { successCount: 1, failureCount: 0 };
              },
            };
          }
        `,
        'web-push': `
          export function setVapidDetails() {}
          export async function sendNotification() {
            globalThis.__certificationPushAttempts.push('shared-web-push');
          }
        `,
        '@/lib/firebase-admin': `
          export const adminDb = {
            collection() {
              return {
                doc(userId) {
                  return {
                    async get() {
                      return {
                        id: userId,
                        exists: true,
                        data() {
                          return { fcmTokens: ['synthetic_fcm_token_1234567890'], webPushSubscriptions: [] };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        `,
        '@/lib/web-push-subscription': `
          export function normalizeWebPushSubscription() { return null; }
          export function webPushSubscriptionId() { return 'synthetic-subscription'; }
        `,
      },
    );
    await assert.rejects(
      () => notificationDelivery.sendNotificationToUsers({
        recipientUserIds: ['fixture-member'],
        title: 'Local fixture notification',
        body: 'This must never reach a notification provider.',
      }),
      /Notification outbound provider access is blocked/,
    );
    assert.deepEqual(globalThis.__certificationPushAttempts, []);

    const notifyRoute = await importActualRouteWithBoundaryStubs(
      '../src/app/api/notify/route.ts',
      {
        'next/server': NEXT_SERVER_STUB,
        'firebase-admin': `
          export function messaging() {
            return {
              async sendEachForMulticast() {
                globalThis.__certificationPushAttempts.push('fcm-multicast');
                return { successCount: 1, failureCount: 0 };
              },
              async send() {
                globalThis.__certificationPushAttempts.push('fcm-send');
                return 'synthetic-message-id';
              },
            };
          }
        `,
        '@/lib/firebase-admin': 'export const adminDb = {};',
        '@/lib/api-auth': `export async function verifyFirebaseToken() { throw new Error('internal request must not authenticate'); }`,
        '@/lib/server-team-access': `
          export async function getTeamAuthority() { throw new Error('internal request must not resolve authority'); }
          export async function findActiveTeamMember() { throw new Error('internal request must not resolve members'); }
        `,
        '@/lib/server-notification-delivery': `
          export async function sendNotificationToUsers() {
            throw new Error('internal request must use the direct messaging path');
          }
        `,
        '@/lib/server-request-guards': `
          export class RequestBodyError extends Error {}
          export async function readJsonBodyWithLimit(request) { return request.json(); }
          export async function enforceUserRateLimit() { return null; }
        `,
      },
    );
    const response = await notifyRoute.POST(new Request('http://127.0.0.1/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': 'synthetic-local-secret',
      },
      body: JSON.stringify({
        tokens: ['synthetic_fcm_token_1234567890'],
        title: 'Local fixture notification',
        body: 'This must never reach FCM.',
      }),
    }));

    assert.equal(response.status, 500, 'notify handler must fail closed in audit mode');
    assert.deepEqual(globalThis.__certificationPushAttempts, []);
  } finally {
    console.error = originalConsoleError;
    delete globalThis.__certificationPushAttempts;
    if (previousAuditMode === undefined) delete process.env.AUDIT_OUTBOUND_PROVIDER_MODE;
    else process.env.AUDIT_OUTBOUND_PROVIDER_MODE = previousAuditMode;
    if (previousInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previousInternalSecret;
  }
});

test('isolated server provider boundary blocks inherited Stripe and Resend credentials', async () => {
  const serverBoundary = await import('../src/lib/server-outbound-provider-policy.ts');
  const isolatedEnvironment = {
    AUDIT_OUTBOUND_PROVIDER_MODE: 'block',
    STRIPE_SECRET_KEY: 'sk_live_inherited_value',
    RESEND_API_KEY: 're_inherited_value',
  };
  assert.equal(serverBoundary.isOutboundProviderBlocked(isolatedEnvironment), true);
  assert.throws(
    () => serverBoundary.assertOutboundProviderAllowed('stripe', isolatedEnvironment),
    /blocked for the isolated emulator audit/,
  );
  assert.throws(
    () => serverBoundary.assertOutboundProviderAllowed('resend', isolatedEnvironment),
    /blocked for the isolated emulator audit/,
  );

  const previous = {
    AUDIT_OUTBOUND_PROVIDER_MODE: process.env.AUDIT_OUTBOUND_PROVIDER_MODE,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  try {
    process.env.AUDIT_OUTBOUND_PROVIDER_MODE = 'block';
    process.env.STRIPE_SECRET_KEY = isolatedEnvironment.STRIPE_SECRET_KEY;
    process.env.RESEND_API_KEY = isolatedEnvironment.RESEND_API_KEY;
    const stripeClient = await import('../src/lib/stripe-client.ts');
    const resendClient = await import('../src/lib/server-resend-client.ts');
    assert.throws(() => stripeClient.getStripe(), /Stripe outbound provider access is blocked/);
    assert.throws(() => resendClient.getResend(), /Resend outbound provider access is blocked/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('provider factories retain their configured behavior when audit block mode is absent', async () => {
  const keys = ['AUDIT_OUTBOUND_PROVIDER_MODE', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const interceptedRequests = [];
  try {
    delete process.env.AUDIT_OUTBOUND_PROVIDER_MODE;
    process.env.STRIPE_SECRET_KEY = 'sk_test_synthetic_provider_value';
    process.env.RESEND_API_KEY = 're_synthetic_provider_value';
    globalThis.fetch = async (...args) => {
      interceptedRequests.push(args);
      return new Response(JSON.stringify({ id: 'synthetic-provider-id' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const stripeClient = await import('../src/lib/stripe-client.ts');
    const resendClient = await import('../src/lib/server-resend-client.ts');
    assert.equal(typeof stripeClient.getStripe().customers.create, 'function');
    const delivery = await resendClient.getResend().emails.send({
      from: 'Fixture <fixture@phase2.test>',
      to: ['recipient@phase2.test'],
      subject: 'Synthetic delivery',
      html: '<p>Synthetic delivery</p>',
    });
    assert.equal(delivery.data?.id, 'synthetic-provider-id');
    assert.equal(interceptedRequests.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
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
