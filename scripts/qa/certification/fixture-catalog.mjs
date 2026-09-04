import { CERTIFICATION_SCENARIOS } from './scenario-catalog.mjs';

const RUN_SUFFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const FIXED_NOW = '2026-09-04T18:00:00.000Z';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fixtureTimestamp(value) {
  return { __fixtureTimestamp: value };
}

function unique(values) {
  return [...new Set(values)];
}

export function buildFixtureCatalog(runSuffix) {
  if (typeof runSuffix !== 'string' || !RUN_SUFFIX_PATTERN.test(runSuffix)) {
    throw new Error('Fixture catalog requires a lowercase run suffix using only letters, numbers, and internal hyphens.');
  }

  const runId = `final-cert-${runSuffix}`;
  const legacyPhase2 = runSuffix === 'phase2';
  const scopedId = alias => legacyPhase2 ? alias : `${alias}-${runSuffix}`;
  const emailFor = alias => legacyPhase2
    ? `${alias}@phase2.test`
    : `${alias}.${runSuffix}@phase2.test`;
  const visibleMarker = marker => legacyPhase2 ? marker : `${marker}-${runSuffix.toUpperCase()}`;
  const timestamp = value => fixtureTimestamp(value);

  const identityDefinitions = [
    ['qa-coach-owner-a', 'registered', 'coach', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-coach-owner-b', 'registered', 'coach', 'active', ['qa-team-b'], 'free', '/dashboard'],
    ['qa-pro-owner', 'registered', 'coach', 'active', ['qa-pro-team'], 'team', '/dashboard'],
    ['qa-elite-owner', 'registered', 'coach', 'active', ['qa-elite-squad-1', 'qa-elite-squad-2', 'qa-elite-squad-3'], 'elite', '/club'],
    ['qa-school-owner', 'registered', 'admin', 'active', ['qa-school-squad-1', 'qa-school-squad-2', 'qa-school-squad-3'], 'school', '/club'],
    ['qa-school-delegate', 'registered', 'admin', 'active', ['qa-school-squad-1'], 'school', '/club'],
    ['qa-league-owner-a', 'registered', 'league_creator', 'active', ['qa-team-c'], 'league', '/competition'],
    ['qa-league-owner-b', 'registered', 'league_creator', 'active', [], 'league', '/competition'],
    ['qa-team-assistant', 'registered', 'coach', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-team-member', 'registered', 'adult_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-parent-a', 'registered', 'parent', 'active', ['qa-team-a', 'qa-team-c'], 'free', '/family'],
    ['qa-parent-b', 'registered', 'parent', 'active', ['qa-team-b'], 'free', '/family'],
    ['qa-adult-player-a', 'registered', 'adult_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-adult-player-b', 'registered', 'adult_player', 'active', ['qa-team-b'], 'free', '/dashboard'],
    ['qa-youth-invite', 'mailbox-only', 'youth_player', 'accountless', ['qa-team-c'], 'free', null],
    ['qa-youth-active', 'registered', 'youth_player', 'active', ['qa-team-a'], 'free', '/dashboard'],
    ['qa-superadmin', 'registered', 'superadmin', 'active', [], 'free', '/admin'],
    ['qa-fake-superadmin', 'registered', 'superadmin', 'active', [], 'free', '/dashboard'],
    ['qa-unverified', 'registered', 'coach', 'unverified', [], 'free', '/verify-email'],
    ['qa-suspended', 'registered', 'adult_player', 'suspended', ['qa-team-a'], 'free', null],
    ['qa-removed-member', 'registered', 'adult_player', 'removed', [], 'free', '/dashboard'],
    ['qa-pending-delete', 'registered', 'adult_player', 'pending-delete', ['qa-team-a'], 'free', null],
    ['qa-owner-delete-blocked', 'registered', 'coach', 'active', ['qa-disposable-team'], 'free', '/dashboard'],
    ['qa-multi-org', 'registered', 'coach', 'active', ['qa-team-a', 'qa-team-b'], 'free', '/dashboard'],
    ['qa-public-submitter', 'public-only', 'visitor', 'accountless', [], 'free', null],
    ['qa-demo-a', 'anonymous-session', 'demo', 'anonymous', [], 'free', '/dashboard'],
    ['qa-demo-b', 'anonymous-session', 'demo', 'anonymous', [], 'free', '/dashboard'],
  ];

  const identities = identityDefinitions.map(([
    alias,
    accountKind,
    role,
    state,
    tenantAliases,
    planId,
    expectedLanding,
  ]) => ({
    alias,
    accountKind,
    uid: accountKind === 'registered' ? scopedId(alias) : null,
    email: accountKind === 'registered' || accountKind === 'mailbox-only' || accountKind === 'public-only'
      ? emailFor(alias)
      : null,
    role,
    state,
    verified: accountKind === 'registered' && state !== 'unverified',
    disabled: state === 'suspended',
    claims: alias === 'qa-superadmin' ? { role: 'superadmin' } : null,
    tenantAliases,
    tenantIds: tenantAliases.map(scopedId),
    leagueAliases: alias === 'qa-league-owner-a' || alias === 'qa-multi-org' || alias === 'qa-removed-member'
      ? ['qa-league-a']
      : alias === 'qa-league-owner-b'
        ? ['qa-league-b']
        : alias === 'qa-owner-delete-blocked'
          ? ['qa-disposable-league']
          : [],
    planId,
    expectedLanding,
    cleanupOwner: accountKind === 'anonymous-session' ? 'local-batch' : 'fixture-batch',
  }));

  const identityByAlias = new Map(identities.map(identity => [identity.alias, identity]));
  const uidFor = alias => identityByAlias.get(alias)?.uid || scopedId(alias);
  const teamIdFor = alias => scopedId(alias);

  const teamDefinitions = [
    ['qa-team-a', 'qa-coach-owner-a', visibleMarker('FALCON-A'), 'Phase 2 Falcons', 'Basketball', 'team', '#C81E1E', null],
    ['qa-team-b', 'qa-coach-owner-b', visibleMarker('BLUEBIRD-B'), 'Phase 2 Bluebirds', 'Soccer', 'free', '#1D4ED8', null],
    ['qa-team-c', 'qa-league-owner-a', visibleMarker('GOLDEN-C'), 'Phase 2 Goldens', 'Volleyball', 'free', '#B7791F', null],
    ['qa-pro-team', 'qa-pro-owner', visibleMarker('CRIMSON-PRO'), 'Crimson Pro', 'Basketball', 'team', '#991B1B', null],
    ['qa-elite-squad-1', 'qa-elite-owner', visibleMarker('ELITE-ONE'), 'Elite North', 'Hockey', 'elite', '#6D28D9', 'qa-club-elite'],
    ['qa-elite-squad-2', 'qa-elite-owner', visibleMarker('ELITE-TWO'), 'Elite Central', 'Hockey', 'elite', '#7C3AED', 'qa-club-elite'],
    ['qa-elite-squad-3', 'qa-elite-owner', visibleMarker('ELITE-THREE'), 'Elite South', 'Hockey', 'elite', '#8B5CF6', 'qa-club-elite'],
    ['qa-school-squad-1', 'qa-school-owner', visibleMarker('SCHOOL-VARSITY'), 'School Varsity', 'Basketball', 'school', '#065F46', 'qa-school'],
    ['qa-school-squad-2', 'qa-school-owner', visibleMarker('SCHOOL-JV'), 'School Junior Varsity', 'Basketball', 'school', '#047857', 'qa-school'],
    ['qa-school-squad-3', 'qa-school-owner', visibleMarker('SCHOOL-FRESHMAN'), 'School Freshman', 'Basketball', 'school', '#059669', 'qa-school'],
    ['qa-disposable-team', 'qa-owner-delete-blocked', visibleMarker('DISPOSABLE-OWNER'), 'Disposable Owner Guard', 'Soccer', 'free', '#374151', null],
  ];

  const teams = teamDefinitions.map(([
    alias,
    ownerAlias,
    marker,
    name,
    sport,
    planId,
    primaryColor,
    organizationAlias,
  ]) => ({
    alias,
    id: teamIdFor(alias),
    ownerAlias,
    ownerUserId: uidFor(ownerAlias),
    visibleMarker: marker,
    name: `${marker} ${name}`,
    sport,
    type: alias.startsWith('qa-school-squad-') ? 'school_squad' : 'youth',
    ageGroup: alias.includes('school') ? 'High School' : 'U16',
    planId,
    plan_type: planId,
    isPro: planId !== 'free',
    isDemo: true,
    organizationAlias,
    organizationId: organizationAlias ? scopedId(organizationAlias) : null,
    primaryColor,
    createdAt: timestamp('2026-08-01T12:00:00.000Z'),
    moduleVisibility: {
      attendance: true,
      equipment: true,
      facilities: true,
      feed: true,
      files: true,
      fundraising: true,
      practice: true,
      volunteers: true,
    },
    features: {
      feed: true,
      roster: true,
      practice: true,
      playbook: true,
      volunteer: true,
      fundraising: true,
      tacticalChat: true,
    },
  }));

  const organizations = [
    {
      alias: 'qa-club-elite',
      id: scopedId('qa-club-elite'),
      kind: 'club',
      visibleMarker: visibleMarker('CLUB-PURPLE'),
      name: `${visibleMarker('CLUB-PURPLE')} Elite Club`,
      ownerAlias: 'qa-elite-owner',
      ownerUserId: uidFor('qa-elite-owner'),
      delegateAliases: [],
      squadAliases: ['qa-elite-squad-1', 'qa-elite-squad-2', 'qa-elite-squad-3'],
      capacity: 8,
    },
    {
      alias: 'qa-school',
      id: scopedId('qa-school'),
      kind: 'school',
      visibleMarker: visibleMarker('SCHOOL-GREEN'),
      name: `${visibleMarker('SCHOOL-GREEN')} Academy`,
      ownerAlias: 'qa-school-owner',
      ownerUserId: uidFor('qa-school-owner'),
      delegateAliases: ['qa-school-delegate'],
      squadAliases: ['qa-school-squad-1', 'qa-school-squad-2', 'qa-school-squad-3'],
      capacity: 15,
    },
  ];

  const households = [
    {
      alias: 'qa-household-a',
      id: scopedId('qa-household-a'),
      parentAlias: 'qa-parent-a',
      parentUserId: uidFor('qa-parent-a'),
      children: [
        { playerAlias: 'qa-player-youth-a', teamAlias: 'qa-team-a', loginAlias: 'qa-youth-active' },
        { playerAlias: 'qa-player-youth-c', teamAlias: 'qa-team-c', loginAlias: 'qa-youth-invite' },
      ],
      teamAliases: ['qa-team-a', 'qa-team-c'],
    },
    {
      alias: 'qa-household-b',
      id: scopedId('qa-household-b'),
      parentAlias: 'qa-parent-b',
      parentUserId: uidFor('qa-parent-b'),
      children: [{ playerAlias: 'qa-player-youth-b', teamAlias: 'qa-team-b', loginAlias: null }],
      teamAliases: ['qa-team-b'],
    },
  ];

  const leagues = [
    {
      alias: 'qa-league-a',
      id: scopedId('qa-league-a'),
      ownerAlias: 'qa-league-owner-a',
      creatorId: uidFor('qa-league-owner-a'),
      visibleMarker: visibleMarker('LEAGUE-ORANGE-A'),
      name: `${visibleMarker('LEAGUE-ORANGE-A')} League`,
      status: 'published',
      divisionAliases: ['qa-division-a-u14', 'qa-division-a-u16'],
      teamAliases: ['qa-team-a', 'qa-team-c'],
    },
    {
      alias: 'qa-league-b',
      id: scopedId('qa-league-b'),
      ownerAlias: 'qa-league-owner-b',
      creatorId: uidFor('qa-league-owner-b'),
      visibleMarker: visibleMarker('LEAGUE-TEAL-B'),
      name: `${visibleMarker('LEAGUE-TEAL-B')} League`,
      status: 'draft',
      divisionAliases: ['qa-division-b-u14'],
      teamAliases: ['qa-team-b'],
    },
    {
      alias: 'qa-disposable-league',
      id: scopedId('qa-disposable-league'),
      ownerAlias: 'qa-owner-delete-blocked',
      creatorId: uidFor('qa-owner-delete-blocked'),
      visibleMarker: visibleMarker('LEAGUE-DISPOSABLE'),
      name: `${visibleMarker('LEAGUE-DISPOSABLE')} Owner Guard`,
      status: 'draft',
      divisionAliases: [],
      teamAliases: ['qa-disposable-team'],
    },
  ];

  const tournaments = [
    {
      alias: 'qa-tournament-a',
      id: scopedId('qa-tournament-a'),
      teamAlias: 'qa-team-a',
      organizerAlias: 'qa-coach-owner-a',
      visibleMarker: visibleMarker('TOURNAMENT-RED-A'),
      name: `${visibleMarker('TOURNAMENT-RED-A')} Cup`,
      status: 'published',
      format: 'pool-to-bracket',
      hasDownstreamDependency: true,
    },
    {
      alias: 'qa-tournament-b',
      id: scopedId('qa-tournament-b'),
      teamAlias: 'qa-team-b',
      organizerAlias: 'qa-coach-owner-b',
      visibleMarker: visibleMarker('TOURNAMENT-BLUE-B'),
      name: `${visibleMarker('TOURNAMENT-BLUE-B')} Cup`,
      status: 'draft',
      format: 'round-robin',
      hasDownstreamDependency: false,
    },
  ];

  const subscriptionDefinitions = [
    ['billing-free', 'qa-coach-owner-b', 'free', 'none', null, 1],
    ['billing-trialing', 'qa-pro-owner', 'team', 'trialing', 'month', 1],
    ['billing-active-monthly', 'qa-elite-owner', 'elite', 'active', 'month', 8],
    ['billing-active-annual', 'qa-school-owner', 'school', 'active', 'year', 15],
    ['billing-past-due', 'qa-coach-owner-a', 'team', 'past_due', 'month', 1],
    ['billing-canceled', 'qa-league-owner-b', 'league', 'canceled', 'month', 1],
    ['billing-addon', 'qa-league-owner-a', 'league', 'active', 'year', 17],
    ['billing-customer-deleted', 'qa-owner-delete-blocked', 'free', 'customer_deleted', null, 1],
  ];
  const subscriptions = subscriptionDefinitions.map(([
    alias,
    ownerAlias,
    planId,
    status,
    interval,
    capacity,
  ]) => ({
    alias,
    id: scopedId(alias),
    ownerAlias,
    ownerUserId: uidFor(ownerAlias),
    planId,
    status,
    interval,
    capacity,
    addonQuantity: alias === 'billing-addon' ? 2 : 0,
    livemode: false,
    providerObjectSelector: `metadata.fixture_run_id=${runId};metadata.fixture_alias=${alias}`,
  }));

  const files = [
    ['qa-file-allowed', 'allowed', 'qa-team-a', 'application/pdf', 'application/pdf', 128_000, false, false],
    ['qa-file-oversized', 'oversized', 'qa-team-a', 'video/mp4', 'video/mp4', 52_428_801, false, false],
    ['qa-file-mime-spoofed', 'mime-spoofed', 'qa-team-b', 'image/png', 'application/x-msdownload', 24_000, false, false],
    ['qa-file-deleted', 'deleted', 'qa-team-b', 'application/pdf', 'application/pdf', 64_000, false, true],
    ['qa-file-public', 'public', 'qa-team-c', 'image/jpeg', 'image/jpeg', 96_000, true, false],
    ['qa-file-private', 'private', 'qa-team-a', 'application/pdf', 'application/pdf', 72_000, false, false],
  ].map(([alias, fixtureCase, teamAlias, declaredMime, detectedMime, sizeBytes, isPublic, deleted]) => ({
    alias,
    id: scopedId(alias),
    case: fixtureCase,
    teamAlias,
    teamId: teamIdFor(teamAlias),
    name: `${visibleMarker(teamAlias.toUpperCase())}-${fixtureCase}.bin`,
    declaredMime,
    detectedMime,
    sizeBytes,
    isPublic,
    deleted,
    storagePath: `qa-fixtures/${runId}/${teamAlias}/${scopedId(alias)}`,
  }));

  const timeFixtures = [
    ['qa-time-past', 'past', 'qa-team-a', '2026-08-15T18:00:00.000Z', '2026-08-15T19:30:00.000Z'],
    ['qa-time-current', 'current', 'qa-team-a', '2026-09-04T18:00:00.000Z', '2026-09-04T19:30:00.000Z'],
    ['qa-time-future', 'future', 'qa-team-b', '2026-10-15T18:00:00.000Z', '2026-10-15T19:30:00.000Z'],
    ['qa-time-cross-midnight', 'cross-midnight', 'qa-team-a', '2026-11-01T23:30:00.000-07:00', '2026-11-02T01:30:00.000-07:00'],
    ['qa-time-dst-spring', 'dst-spring-forward', 'qa-team-c', '2027-03-14T01:30:00.000-07:00', '2027-03-14T03:30:00.000-06:00'],
    ['qa-time-dst-fall', 'dst-fall-back', 'qa-team-b', '2026-11-01T01:15:00.000-06:00', '2026-11-01T01:45:00.000-07:00'],
  ].map(([alias, fixtureCase, teamAlias, startsAt, endsAt]) => ({
    alias,
    id: scopedId(alias),
    case: fixtureCase,
    teamAlias,
    teamId: teamIdFor(teamAlias),
    timeZone: 'America/Edmonton',
    startsAt,
    endsAt,
  }));

  const raceFixtures = [
    ['qa-race-team-capacity', 'team-capacity', ['qa-elite-owner', 'qa-school-owner']],
    ['qa-race-join-code', 'join-code', ['qa-parent-a', 'qa-adult-player-b']],
    ['qa-race-rsvp', 'rsvp', ['qa-team-member', 'qa-adult-player-a']],
    ['qa-race-poll-vote', 'poll-vote', ['qa-team-member', 'qa-adult-player-a']],
    ['qa-race-booking', 'facility-booking', ['qa-coach-owner-a', 'qa-team-assistant']],
    ['qa-race-registration', 'public-registration', ['qa-public-submitter', 'qa-demo-a']],
  ].map(([alias, fixtureCase, participantAliases]) => ({
    alias,
    id: scopedId(alias),
    case: fixtureCase,
    barrierKey: `${runId}:${fixtureCase}:barrier`,
    participantAliases,
    expectedWinnerCount: 1,
  }));

  const fixtures = Object.fromEntries([
    'organization', 'roster', 'recruiting', 'family', 'schedule', 'practice', 'chat',
    'file', 'compliance', 'competition', 'facility', 'equipment', 'public', 'billing',
  ].map(domain => [domain, []]));
  const firestoreDocuments = [];

  const addDocument = (domain, descriptor) => {
    const entry = {
      ...descriptor,
      fixtureRunId: runId,
      cleanupOwner: descriptor.cleanupOwner || 'fixture-batch',
    };
    fixtures[domain].push(entry);
    firestoreDocuments.push({
      path: descriptor.path,
      domain,
      data: {
        ...descriptor.data,
        fixtureRunId: runId,
        fixtureAlias: descriptor.alias,
        synthetic: true,
      },
    });
  };

  for (const identity of identities.filter(value => value.accountKind === 'registered')) {
    const profile = {
      id: identity.uid,
      uid: identity.uid,
      email: identity.email,
      name: identity.alias.replaceAll('-', ' '),
      role: identity.role,
      plan_type: identity.planId,
      planId: identity.planId,
      emailVerified: identity.verified,
      createdAt: timestamp(FIXED_NOW),
      updatedAt: timestamp(FIXED_NOW),
    };
    if (identity.alias === 'qa-suspended') profile.accountStatus = 'suspended';
    if (identity.alias === 'qa-pending-delete') profile.deletionStatus = 'pending';
    if (identity.alias === 'qa-school-owner') profile.isPrimaryClubAuthority = true;
    if (identity.alias === 'qa-elite-owner') profile.isPrimaryClubAuthority = true;
    if (identity.alias === 'qa-school-delegate') profile.isSchoolAdmin = true;
    addDocument('organization', {
      alias: identity.alias,
      path: `users/${identity.uid}`,
      data: profile,
    });
  }

  for (const team of teams) {
    addDocument('organization', {
      alias: team.alias,
      path: `teams/${team.id}`,
      data: { ...team, id: team.id, teamName: team.name },
    });
  }

  const membershipDefinitions = [
    ['qa-team-a', 'qa-coach-owner-a', 'Admin', 'Head Coach', 'active'],
    ['qa-team-a', 'qa-team-assistant', 'Admin', 'Assistant Coach', 'active'],
    ['qa-team-a', 'qa-team-member', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-parent-a', 'Member', 'Parent', 'active'],
    ['qa-team-a', 'qa-adult-player-a', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-youth-active', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-suspended', 'Member', 'Player', 'removed'],
    ['qa-team-a', 'qa-removed-member', 'Member', 'Player', 'removed'],
    ['qa-team-a', 'qa-pending-delete', 'Member', 'Player', 'active'],
    ['qa-team-a', 'qa-multi-org', 'Admin', 'Assistant Coach', 'active'],
    ['qa-team-b', 'qa-coach-owner-b', 'Admin', 'Head Coach', 'active'],
    ['qa-team-b', 'qa-parent-b', 'Member', 'Parent', 'active'],
    ['qa-team-b', 'qa-adult-player-b', 'Member', 'Player', 'active'],
    ['qa-team-b', 'qa-multi-org', 'Member', 'Player', 'active'],
    ['qa-team-c', 'qa-parent-a', 'Member', 'Parent', 'active'],
    ['qa-team-c', 'qa-league-owner-a', 'Admin', 'League Organizer', 'active'],
    ['qa-pro-team', 'qa-pro-owner', 'Admin', 'Head Coach', 'active'],
    ['qa-elite-squad-1', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-elite-squad-2', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-elite-squad-3', 'qa-elite-owner', 'Admin', 'Club Owner', 'active'],
    ['qa-school-squad-1', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-school-squad-1', 'qa-school-delegate', 'Admin', 'School Admin', 'active'],
    ['qa-school-squad-2', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-school-squad-3', 'qa-school-owner', 'Admin', 'Athletic Director', 'active'],
    ['qa-disposable-team', 'qa-owner-delete-blocked', 'Admin', 'Head Coach', 'active'],
  ];

  for (const [teamAlias, userAlias, role, position, status] of membershipDefinitions) {
    const user = identityByAlias.get(userAlias);
    const team = teams.find(value => value.alias === teamAlias);
    const data = {
      id: user.uid,
      userId: user.uid,
      name: user.alias.replaceAll('-', ' '),
      email: user.email,
      role,
      position,
      status,
      isDeleted: false,
      ownerUserId: team.ownerUserId,
      joinedAt: timestamp('2026-08-01T12:00:00.000Z'),
    };
    if (userAlias === 'qa-youth-active') data.playerId = scopedId('qa-player-youth-a');
    addDocument('roster', {
      alias: `${teamAlias}-${userAlias}-member`,
      path: `teams/${team.id}/members/${user.uid}`,
      data,
    });
    if (status === 'active') {
      addDocument('roster', {
        alias: `${userAlias}-${teamAlias}-membership`,
        path: `users/${user.uid}/teamMemberships/${team.id}`,
        data: {
          teamId: team.id,
          name: team.name,
          teamName: team.name,
          userId: user.uid,
          status: 'active',
          role,
          position,
          ownerUserId: team.ownerUserId,
          planId: team.planId,
          plan_type: team.plan_type,
          isPro: team.isPro,
          isDemo: true,
          type: team.type,
          ...(team.organizationAlias === 'qa-school' ? { schoolId: team.organizationId } : {}),
          joinedAt: timestamp('2026-08-01T12:00:00.000Z'),
        },
      });
    }
  }

  const players = [
    ['qa-player-adult-a', 'qa-adult-player-a', null, 'qa-team-a', 'Alex', visibleMarker('FALCON-A'), false],
    ['qa-player-youth-a', 'qa-youth-active', 'qa-parent-a', 'qa-team-a', 'Youth A', visibleMarker('FALCON-A'), false],
    ['qa-player-youth-c', null, 'qa-parent-a', 'qa-team-c', 'Youth C', visibleMarker('GOLDEN-C'), true],
    ['qa-player-adult-b', 'qa-adult-player-b', null, 'qa-team-b', 'Blair', visibleMarker('BLUEBIRD-B'), true],
    ['qa-player-youth-b', null, 'qa-parent-b', 'qa-team-b', 'Youth B', visibleMarker('BLUEBIRD-B'), false],
    ['qa-player-pending-delete', 'qa-pending-delete', null, 'qa-team-a', 'Delete', visibleMarker('DISPOSABLE'), false],
  ];
  for (const [alias, userAlias, parentAlias, teamAlias, firstName, lastName, publicEnabled] of players) {
    addDocument('roster', {
      alias,
      path: `players/${scopedId(alias)}`,
      data: {
        id: scopedId(alias),
        userId: userAlias ? uidFor(userAlias) : null,
        parentId: parentAlias ? uidFor(parentAlias) : null,
        primaryTeamId: teamIdFor(teamAlias),
        joinedTeamIds: [teamIdFor(teamAlias)],
        firstName,
        lastName,
        email: userAlias ? emailFor(userAlias) : null,
        emergencyContact: `${lastName} synthetic guardian`,
        medicalNotes: `${lastName} synthetic private medical value`,
        recruitingProfileEnabled: publicEnabled,
      },
    });
    addDocument('recruiting', {
      alias: `${alias}-profile`,
      path: `players/${scopedId(alias)}/recruitingProfiles/${scopedId('qa-recruiting-profile')}`,
      data: {
        playerId: scopedId(alias),
        publicEnabled,
        metric: alias.includes('b') ? 'BLUEBIRD-B-82' : 'FALCON-A-71',
        contactNote: `${lastName} synthetic private recruiting contact`,
        videoUrl: `https://example.test/${runId}/${alias}/highlight`,
      },
    });
    addDocument('recruiting', {
      alias: `${alias}-evaluation`,
      path: `players/${scopedId(alias)}/evaluations/${scopedId('qa-evaluation')}`,
      data: {
        playerId: scopedId(alias),
        score: alias.includes('b') ? 82 : 71,
        notes: `${lastName} synthetic private evaluation`,
        createdAt: timestamp(FIXED_NOW),
      },
    });
  }

  for (const household of households) {
    addDocument('family', {
      alias: household.alias,
      path: `households/${household.id}`,
      data: {
        ...household,
        childPlayerIds: household.children.map(child => scopedId(child.playerAlias)),
        teamIds: household.teamAliases.map(teamIdFor),
      },
    });
  }
  for (const demoAlias of ['qa-demo-a', 'qa-demo-b']) {
    addDocument('organization', {
      alias: `${demoAlias}-workspace`,
      path: `demoWorkspaces/${scopedId(demoAlias)}`,
      cleanupOwner: 'local-batch',
      data: {
        alias: demoAlias,
        persona: 'shared-synthetic-coach-persona',
        workspaceMarker: visibleMarker(demoAlias === 'qa-demo-a' ? 'DEMO-A' : 'DEMO-B'),
        expiresAt: timestamp('2026-09-05T18:00:00.000Z'),
        billingAllowed: false,
      },
    });
  }
  addDocument('family', {
    alias: 'qa-youth-invite-record',
    path: `youthInvites/${scopedId('qa-youth-invite-record')}`,
    data: {
      parentId: uidFor('qa-parent-a'),
      playerId: scopedId('qa-player-youth-c'),
      recipientAlias: 'qa-youth-invite',
      recipientEmail: emailFor('qa-youth-invite'),
      status: 'pending',
      expiresAt: timestamp('2026-09-11T18:00:00.000Z'),
    },
  });
  for (const household of households) {
    for (const child of household.children) {
      addDocument('family', {
        alias: `${household.alias}-${child.playerAlias}-balance`,
        path: `teams/${teamIdFor(child.teamAlias)}/payments/${scopedId(`${child.playerAlias}-balance`)}`,
        data: {
          userId: household.parentUserId,
          playerId: scopedId(child.playerAlias),
          amountCents: child.teamAlias === 'qa-team-b' ? 7800 : 4200,
          status: child.teamAlias === 'qa-team-c' ? 'pending' : 'paid',
          currency: 'cad',
        },
      });
    }
  }

  for (const timeFixture of timeFixtures) {
    const marker = teams.find(team => team.alias === timeFixture.teamAlias).visibleMarker;
    addDocument('schedule', {
      alias: timeFixture.alias,
      path: `teams/${timeFixture.teamId}/events/${timeFixture.id}`,
      data: {
        id: timeFixture.id,
        title: `${marker} ${timeFixture.case} event`,
        type: timeFixture.case === 'future' ? 'practice' : 'game',
        eventType: timeFixture.case === 'future' ? 'practice' : 'game',
        startsAt: timeFixture.startsAt,
        endsAt: timeFixture.endsAt,
        date: timeFixture.startsAt.slice(0, 10),
        startTime: timeFixture.startsAt.slice(11, 16),
        endDate: timeFixture.endsAt.slice(0, 10),
        endTime: timeFixture.endsAt.slice(11, 16),
        timeZone: timeFixture.timeZone,
        status: 'published',
      },
    });
  }
  for (const [teamAlias, marker] of [['qa-team-a', visibleMarker('FALCON-A')], ['qa-team-b', visibleMarker('BLUEBIRD-B')]]) {
    addDocument('schedule', {
      alias: `${teamAlias}-future-event`,
      path: `teams/${teamIdFor(teamAlias)}/events/qa-future-event`,
      data: {
        id: 'qa-future-event',
        title: `${marker} Future Practice`,
        type: 'practice',
        eventType: 'practice',
        date: '2026-10-15',
        startTime: '18:00',
        endTime: '19:30',
        createdBy: uidFor(teamAlias === 'qa-team-a' ? 'qa-coach-owner-a' : 'qa-coach-owner-b'),
      },
    });
    addDocument('schedule', {
      alias: `${teamAlias}-cross-midnight`,
      path: `teams/${teamIdFor(teamAlias)}/events/qa-cross-midnight`,
      data: {
        id: 'qa-cross-midnight',
        title: `${marker} Overnight Tournament`,
        type: 'tournament',
        eventType: 'tournament',
        date: '2026-11-01',
        endDate: '2026-11-02',
        startTime: '23:30',
        endTime: '01:30',
        createdBy: uidFor(teamAlias === 'qa-team-a' ? 'qa-coach-owner-a' : 'qa-coach-owner-b'),
      },
    });
  }

  addDocument('practice', {
    alias: 'qa-practice-plan-a',
    path: `teams/${teamIdFor('qa-team-a')}/practicePlans/${scopedId('qa-practice-plan-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Press Break`, status: 'assigned', drillIds: [scopedId('qa-drill-a')] },
  });
  addDocument('practice', {
    alias: 'qa-drill-a',
    path: `teams/${teamIdFor('qa-team-a')}/drills/${scopedId('qa-drill-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Closeout Drill`, order: 1, durationMinutes: 12 },
  });
  addDocument('practice', {
    alias: 'qa-film-a',
    path: `teams/${teamIdFor('qa-team-a')}/videos/${scopedId('qa-film-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Film`, storagePath: `qa-fixtures/${runId}/qa-team-a/film.mp4`, status: 'ready' },
  });

  const chatMembersByTeam = {
    'qa-team-a': membershipDefinitions.filter(value => value[0] === 'qa-team-a' && value[4] === 'active').map(value => uidFor(value[1])),
    'qa-team-b': membershipDefinitions.filter(value => value[0] === 'qa-team-b' && value[4] === 'active').map(value => uidFor(value[1])),
  };
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
  ]) {
    addDocument('chat', {
      alias: `${teamAlias}-chat`,
      path: `teams/${teamIdFor(teamAlias)}/groupChats/qa-team-chat`,
      data: {
        id: 'qa-team-chat',
        name: `${marker} Team Chat`,
        createdBy: uidFor(ownerAlias),
        memberIds: chatMembersByTeam[teamAlias],
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('chat', {
      alias: `${teamAlias}-chat-message`,
      path: `teams/${teamIdFor(teamAlias)}/groupChats/qa-team-chat/messages/qa-seed-message`,
      data: {
        id: 'qa-seed-message',
        authorId: uidFor(ownerAlias),
        senderId: uidFor(ownerAlias),
        text: `${marker} synthetic private message`,
        createdAt: timestamp(FIXED_NOW),
      },
    });
    addDocument('chat', {
      alias: `${teamAlias}-feed-post`,
      path: `teams/${teamIdFor(teamAlias)}/feed/${scopedId(`${teamAlias}-feed-post`)}`,
      data: { authorId: uidFor(ownerAlias), text: `${marker} synthetic private feed post`, createdAt: timestamp(FIXED_NOW) },
    });
    addDocument('chat', {
      alias: `${teamAlias}-poll`,
      path: `teams/${teamIdFor(teamAlias)}/polls/${scopedId(`${teamAlias}-poll`)}`,
      data: { question: `${marker} practice time?`, options: ['Early', 'Late'], votes: {}, status: 'open' },
    });
  }

  for (const file of files) {
    addDocument('file', {
      alias: file.alias,
      path: `teams/${file.teamId}/files/${file.id}`,
      data: {
        ...file,
        url: `https://example.test/${runId}/${file.teamAlias}/${file.id}`,
        createdAt: timestamp(FIXED_NOW),
      },
    });
  }
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
    ['qa-team-c', visibleMarker('GOLDEN-C'), 'qa-coach-owner-a'],
  ]) {
    addDocument('compliance', {
      alias: `${teamAlias}-waiver`,
      path: `teams/${teamIdFor(teamAlias)}/waivers/${scopedId(`${teamAlias}-waiver-v1`)}`,
      data: { title: `${marker} Waiver`, version: 1, status: teamAlias === 'qa-team-b' ? 'draft' : 'published', ownerId: uidFor(ownerAlias) },
    });
    addDocument('compliance', {
      alias: `${teamAlias}-incident`,
      path: `teams/${teamIdFor(teamAlias)}/incidents/${scopedId(`${teamAlias}-incident`)}`,
      data: { title: `${marker} Synthetic Incident`, subjectPlayerId: scopedId(teamAlias === 'qa-team-b' ? 'qa-player-youth-b' : 'qa-player-youth-a'), immutable: true },
    });
  }
  addDocument('compliance', {
    alias: 'qa-school-global-waiver',
    path: `organizations/${scopedId('qa-school')}/waivers/${scopedId('qa-school-global-waiver-v2')}`,
    data: { title: `${visibleMarker('SCHOOL-GREEN')} Global Waiver`, version: 2, status: 'published', squadIds: organizations[1].squadAliases.map(teamIdFor) },
  });
  addDocument('compliance', {
    alias: 'qa-registration-form-a',
    path: `leagues/${scopedId('qa-league-a')}/forms/${scopedId('qa-registration-form-a')}`,
    data: { title: `${visibleMarker('LEAGUE-ORANGE-A')} Registration`, status: 'published', fields: [{ id: 'jersey', type: 'text', required: true }] },
  });
  addDocument('compliance', {
    alias: 'qa-registration-form-b',
    path: `leagues/${scopedId('qa-league-b')}/forms/${scopedId('qa-registration-form-b')}`,
    data: { title: `${visibleMarker('LEAGUE-TEAL-B')} Registration`, status: 'draft', fields: [{ id: 'division', type: 'select', required: true }] },
  });

  for (const organization of organizations) {
    addDocument('organization', {
      alias: organization.alias,
      path: `organizations/${organization.id}`,
      data: { ...organization, squadIds: organization.squadAliases.map(teamIdFor) },
    });
  }
  for (const league of leagues) {
    addDocument('competition', {
      alias: league.alias,
      path: `leagues/${league.id}`,
      data: { ...league, teamIds: league.teamAliases.map(teamIdFor), createdAt: timestamp(FIXED_NOW) },
    });
    for (const divisionAlias of league.divisionAliases) {
      addDocument('competition', {
        alias: divisionAlias,
        path: `leagues/${league.id}/divisions/${scopedId(divisionAlias)}`,
        data: { id: scopedId(divisionAlias), name: `${league.visibleMarker} ${divisionAlias.split('-').at(-1)}`, status: 'active' },
      });
    }
  }
  for (const [leagueAlias, userAlias, status] of [
    ['qa-league-a', 'qa-league-owner-a', 'active'],
    ['qa-league-a', 'qa-multi-org', 'active'],
    ['qa-league-a', 'qa-removed-member', 'revoked'],
    ['qa-league-b', 'qa-league-owner-b', 'active'],
    ['qa-disposable-league', 'qa-owner-delete-blocked', 'active'],
  ]) {
    const leagueId = scopedId(leagueAlias);
    const userId = uidFor(userAlias);
    const membership = { leagueId, userId, status, joinedAt: timestamp('2026-08-01T12:00:00.000Z') };
    addDocument('competition', {
      alias: `${userAlias}-${leagueAlias}-user-membership`,
      path: `users/${userId}/leagueMemberships/${leagueId}`,
      data: membership,
    });
    addDocument('competition', {
      alias: `${leagueAlias}-${userAlias}-member`,
      path: `leagues/${leagueId}/members/${userId}`,
      data: membership,
    });
  }
  for (const tournament of tournaments) {
    addDocument('competition', {
      alias: tournament.alias,
      path: `teams/${teamIdFor(tournament.teamAlias)}/tournaments/${tournament.id}`,
      data: { ...tournament, teamId: teamIdFor(tournament.teamAlias), createdAt: timestamp(FIXED_NOW) },
    });
  }
  addDocument('competition', {
    alias: 'qa-game-active-a',
    path: `teams/${teamIdFor('qa-team-a')}/games/${scopedId('qa-game-active-a')}`,
    data: { status: 'active', homeScore: 2, awayScore: 1, title: `${visibleMarker('FALCON-A')} Active Game` },
  });
  addDocument('competition', {
    alias: 'qa-game-completed-a',
    path: `teams/${teamIdFor('qa-team-a')}/games/${scopedId('qa-game-completed-a')}`,
    data: { status: 'completed', homeScore: 4, awayScore: 3, downstreamGameId: scopedId('qa-game-final-a'), title: `${visibleMarker('FALCON-A')} Completed Game` },
  });
  addDocument('competition', {
    alias: 'qa-game-cancelled-b',
    path: `teams/${teamIdFor('qa-team-b')}/games/${scopedId('qa-game-cancelled-b')}`,
    data: { status: 'cancelled', homeScore: 0, awayScore: 0, title: `${visibleMarker('BLUEBIRD-B')} Cancelled Game` },
  });

  const facilityDefinitions = [
    ['qa-facility-a', 'qa-coach-owner-a', 'qa-team-a', visibleMarker('FALCON-A'), '100 Synthetic Red Way'],
    ['qa-facility-b', 'qa-coach-owner-b', 'qa-team-b', visibleMarker('BLUEBIRD-B'), '200 Synthetic Blue Way'],
    ['qa-facility-school', 'qa-school-owner', 'qa-school-squad-1', visibleMarker('SCHOOL-GREEN'), '300 Synthetic School Way'],
  ];
  for (const [alias, ownerAlias, teamAlias, marker, address] of facilityDefinitions) {
    const facilityId = scopedId(alias);
    const fieldId = scopedId(`${alias}-field`);
    addDocument('facility', {
      alias,
      path: `facilities/${facilityId}`,
      data: { id: facilityId, name: `${marker} Facility`, address, clubId: uidFor(ownerAlias), teamId: teamIdFor(teamAlias), isDemo: true },
    });
    addDocument('facility', {
      alias: `${alias}-field`,
      path: `facilities/${facilityId}/fields/${fieldId}`,
      data: { id: fieldId, facilityId, name: `${marker} Main Field`, isDemo: true },
    });
    addDocument('facility', {
      alias: `${alias}-booking-primary`,
      path: `facilities/${facilityId}/bookings/${scopedId(`${alias}-booking-primary`)}`,
      data: { fieldId, teamId: teamIdFor(teamAlias), startsAt: '2026-10-15T18:00:00.000Z', endsAt: '2026-10-15T19:30:00.000Z', status: 'confirmed' },
    });
    addDocument('facility', {
      alias: `${alias}-booking-overlap`,
      path: `facilities/${facilityId}/bookings/${scopedId(`${alias}-booking-overlap`)}`,
      data: { fieldId, teamId: teamIdFor(teamAlias), startsAt: '2026-10-15T18:30:00.000Z', endsAt: '2026-10-15T20:00:00.000Z', status: 'conflict-candidate' },
    });
  }
  for (const [teamAlias, marker, quantity] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 5],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 3],
    ['qa-school-squad-1', visibleMarker('SCHOOL-GREEN'), 12],
  ]) {
    addDocument('equipment', {
      alias: `${teamAlias}-equipment`,
      path: `teams/${teamIdFor(teamAlias)}/equipment/${scopedId(`${teamAlias}-equipment`)}`,
      data: { name: `${marker} Training Bib`, quantity, available: quantity - 1, status: 'active' },
    });
    addDocument('equipment', {
      alias: `${teamAlias}-equipment-assignment`,
      path: `teams/${teamIdFor(teamAlias)}/equipmentAssignments/${scopedId(`${teamAlias}-equipment-assignment`)}`,
      data: { equipmentId: scopedId(`${teamAlias}-equipment`), assigneeId: uidFor(teamAlias === 'qa-team-b' ? 'qa-adult-player-b' : 'qa-adult-player-a'), quantity: 1, status: 'assigned' },
    });
  }

  addDocument('public', {
    alias: 'qa-contact-submission',
    path: `publicSubmissions/${scopedId('qa-contact-submission')}`,
    data: { kind: 'contact', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+contact.${runSuffix}@phase2.test`, phone: '+15550100001', message: `${visibleMarker('PUBLIC-CONTACT')} synthetic inquiry`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-beta-submission',
    path: `publicSubmissions/${scopedId('qa-beta-submission')}`,
    data: { kind: 'beta', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+beta.${runSuffix}@phase2.test`, phone: '+15550100002', message: `${visibleMarker('PUBLIC-BETA')} synthetic request`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-coach-referral',
    path: `publicSubmissions/${scopedId('qa-coach-referral')}`,
    data: { kind: 'coach-referral', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+referral.${runSuffix}@phase2.test`, phone: '+15550100003', message: `${visibleMarker('PUBLIC-REFERRAL')} synthetic referral`, status: 'accepted' },
  });
  addDocument('public', {
    alias: 'qa-event-registration',
    path: `publicRegistrations/${scopedId('qa-event-registration')}`,
    data: { kind: 'event-registration', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+registration.${runSuffix}@phase2.test`, phone: '+15550100004', teamId: teamIdFor('qa-team-a'), status: 'accepted', idempotencyKey: `${runId}:event-registration` },
  });
  addDocument('public', {
    alias: 'qa-volunteer-opportunity-a',
    path: `teams/${teamIdFor('qa-team-a')}/volunteers/${scopedId('qa-volunteer-opportunity-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Gate Duty`, status: 'published', capacity: 2, signups: {} },
  });
  addDocument('public', {
    alias: 'qa-volunteer-opportunity-b',
    path: `teams/${teamIdFor('qa-team-b')}/volunteers/${scopedId('qa-volunteer-opportunity-b')}`,
    data: { title: `${visibleMarker('BLUEBIRD-B')} Field Duty`, status: 'draft', capacity: 3, signups: {} },
  });
  addDocument('public', {
    alias: 'qa-volunteer-submission-a',
    path: `teams/${teamIdFor('qa-team-a')}/volunteers/${scopedId('qa-volunteer-opportunity-a')}/submissions/${scopedId('qa-volunteer-submission-a')}`,
    data: { kind: 'volunteer', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+volunteer.${runSuffix}@phase2.test`, phone: '+15550100005', status: 'pending', idempotencyKey: `${runId}:volunteer` },
  });
  addDocument('public', {
    alias: 'qa-donation-a',
    path: `teams/${teamIdFor('qa-team-a')}/fundraising/${scopedId('qa-fundraiser-a')}/donations/${scopedId('qa-donation-a')}`,
    data: { kind: 'donation', submitterAlias: 'qa-public-submitter', email: `qa-public-submitter+donation.${runSuffix}@phase2.test`, phone: '+15550100006', amountCents: 2500, currency: 'cad', status: 'test-succeeded', livemode: false, idempotencyKey: `${runId}:donation` },
  });

  for (const subscription of subscriptions) {
    addDocument('billing', {
      alias: subscription.alias,
      path: `fixtureBillingStates/${subscription.id}`,
      data: { ...subscription },
    });
  }
  addDocument('billing', {
    alias: 'qa-fundraiser-a',
    path: `teams/${teamIdFor('qa-team-a')}/fundraising/${scopedId('qa-fundraiser-a')}`,
    data: { title: `${visibleMarker('FALCON-A')} Travel Fund`, goalCents: 100000, raisedCents: 2500, status: 'published', livemode: false },
  });
  addDocument('billing', {
    alias: 'qa-fundraiser-b',
    path: `teams/${teamIdFor('qa-team-b')}/fundraising/${scopedId('qa-fundraiser-b')}`,
    data: { title: `${visibleMarker('BLUEBIRD-B')} Equipment Fund`, goalCents: 75000, raisedCents: 0, status: 'draft', livemode: false },
  });
  addDocument('billing', {
    alias: 'qa-connect-account-selector',
    path: `fixtureProviderStates/${scopedId('qa-connect-account-selector')}`,
    data: { provider: 'stripe-connect', mode: 'test', livemode: false, accountSelector: `metadata.fixture_run_id=${runId}`, status: 'requires-onboarding' },
  });

  const alertAudienceDefinitions = [
    ['qa-alert', 'Everyone', 'everyone', '2026-09-04T18:00:00.000Z'],
    ['qa-player-alert', 'Player', 'players', '2026-09-04T18:01:00.000Z'],
    ['qa-coach-alert', 'Coach', 'coaches', '2026-09-04T18:02:00.000Z'],
    ['qa-parent-alert', 'Parent', 'parents', '2026-09-04T18:03:00.000Z'],
  ];
  for (const [teamAlias, marker, ownerAlias] of [
    ['qa-team-a', visibleMarker('FALCON-A'), 'qa-coach-owner-a'],
    ['qa-team-b', visibleMarker('BLUEBIRD-B'), 'qa-coach-owner-b'],
  ]) {
    for (const [alias, label, audience, createdAt] of alertAudienceDefinitions) {
      if (teamAlias === 'qa-team-b' && alias !== 'qa-alert') continue;
      addDocument('chat', {
        alias: `${teamAlias}-${alias}`,
        path: `teams/${teamIdFor(teamAlias)}/alerts/${alias}`,
        data: {
          id: alias,
          title: `${marker} ${label} Alert`,
          message: `${marker} synthetic ${audience} message`,
          audience,
          createdBy: uidFor(ownerAlias),
          createdAt: timestamp(createdAt),
        },
      });
    }
  }

  for (const race of raceFixtures) {
    addDocument('organization', {
      alias: race.alias,
      path: `fixtureRaceBarriers/${race.id}`,
      data: { ...race, arrivals: [], released: false },
    });
  }

  const recursiveRoots = unique([
    ...firestoreDocuments.map(document => document.path.split('/').slice(0, 2).join('/')),
    `auditFixtureMetadata/${runId}`,
  ]).sort();
  const authUids = identities
    .filter(identity => identity.accountKind === 'registered')
    .map(identity => identity.uid);
  const storagePrefixes = unique(files.map(file => `${file.storagePath.split('/').slice(0, 3).join('/')}/`)
    .concat(`qa-fixtures/${runId}/practice/`, `qa-fixtures/${runId}/pending-delete/`));

  const providers = {
    firebase: {
      environment: 'emulator',
      allowedProjectPrefix: 'demo-',
      requireLoopback: true,
    },
    stripe: {
      mode: 'test',
      livemode: false,
      objectSelector: `metadata.fixture_run_id=${runId}`,
      prices: ['team', 'elite', 'league', 'school'].flatMap(planId => (
        ['month', 'year'].map(interval => ({
          alias: `qa-price-${planId}-${interval}`,
          planId,
          interval,
          livemode: false,
          objectSelector: `metadata.fixture_run_id=${runId};metadata.plan_id=${planId};metadata.interval=${interval}`,
        }))
      )),
      allowedOperations: ['test-clock', 'test-customer', 'test-subscription', 'test-payment-intent'],
      forbiddenOperations: ['live-charge', 'payout', 'transfer', 'refund', 'dispute'],
    },
    stripeConnect: {
      mode: 'test',
      livemode: false,
      objectSelector: `metadata.fixture_run_id=${runId}`,
      payoutsEnabled: false,
      transfersEnabled: false,
    },
    resend: {
      mode: 'safe-sink',
      recipientDomain: 'phase2.test',
      retainActionLinks: false,
      retainRawPayloads: false,
    },
    fcm: {
      mode: 'synthetic',
      tokenSelector: `fixtureRunId=${runId}`,
      physicalEvidenceRequired: true,
    },
    rss: {
      mode: 'controlled',
      cases: ['valid', 'malformed', 'duplicate', 'slow', 'redirect', 'unsafe-host'],
      privateNetworkAllowed: false,
    },
    calendar: {
      mode: 'disposable',
      tokenRetention: false,
    },
  };

  const cleanupSelectors = {
    fixtureRunId: runId,
    owner: 'fixture-batch',
    firestore: {
      recursiveRoots,
      metadata: { field: 'fixtureRunId', equals: runId },
    },
    auth: { uids: authUids },
    storage: { prefixes: storagePrefixes },
    stripe: { metadata: { fixture_run_id: runId, livemode: 'false' } },
    stripeConnect: { metadata: { fixture_run_id: runId, livemode: 'false' } },
    resend: { tag: `fixture-run-id:${runId}`, retainActionLinks: false },
    fcm: { field: 'fixtureRunId', equals: runId },
  };

  const activeAliases = identities
    .filter(identity => identity.accountKind === 'registered' && identity.verified && !identity.disabled && identity.state !== 'pending-delete')
    .map(identity => identity.alias);
  const blockedAliases = [
    { alias: 'qa-unverified', signInStatus: 200, sessionStatus: 403, reason: 'verification-required' },
    { alias: 'qa-suspended', signInStatus: 400, authError: 'USER_DISABLED', reason: 'account-suspended' },
    { alias: 'qa-pending-delete', signInStatus: 200, sessionStatus: 403, reason: 'deletion-pending' },
  ];

  return deepFreeze({
    runSuffix,
    runId,
    generatedAt: FIXED_NOW,
    scenarioIds: CERTIFICATION_SCENARIOS.map(scenario => scenario.id),
    identities,
    activeAliases,
    blockedAliases,
    teams,
    organizations,
    households,
    leagues,
    tournaments,
    subscriptions,
    files,
    timeFixtures,
    raceFixtures,
    fixtures,
    providers,
    firestoreDocuments,
    cleanupSelectors,
  });
}
