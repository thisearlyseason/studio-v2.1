import { assertManagedUid } from './manifest.mjs';

const V2_IDENTITY_SPECS = [
  ['qa-coach-owner-a', 'Coach Owner A', 'Admin', 'active', true],
  ['qa-coach-owner-b', 'Coach Owner B', 'Admin', 'active', true],
  ['qa-team-assistant', 'Team Assistant', 'coach', 'active', true],
  ['qa-team-member', 'Team Member', 'Member', 'active', true],
  ['qa-multi-org', 'Multi Organization Member', 'Member', 'active', true],
  ['qa-fake-superadmin', 'Fake Superadmin', 'superadmin', 'active', true],
  ['qa-unverified', 'Unverified Member', 'Member', 'active', false],
  ['qa-suspended', 'Suspended Baseline Member', 'Member', 'active', true],
  ['qa-removed-member', 'Removed Baseline Member', 'Member', 'active', true],
];

const V3_IDENTITY_SPECS = [
  ...V2_IDENTITY_SPECS,
  ['qa-parent-a', 'Parent A', 'parent', 'active', true],
  ['qa-parent-b', 'Parent B', 'parent', 'active', true],
  ['qa-adult-player-a', 'Adult Player A', 'adult_player', 'active', true],
  ['qa-adult-player-b', 'Adult Player B', 'adult_player', 'active', true],
  ['qa-youth-active', 'Youth Player A', 'youth_player', 'active', true],
  ['qa-league-creator', 'League Creator', 'league_creator', 'active', true],
  ['qa-school-admin', 'School Administrator', 'admin', 'active', true],
  ['qa-superadmin', 'Trusted Superadmin', 'superadmin', 'active', true],
  ['qa-pending-delete', 'Pending Delete Baseline', 'Member', 'active', true],
  ['qa-missing-profile', 'Missing Profile', 'Member', 'active', true],
  ['qa-no-team', 'No Team Member', 'Member', 'active', true],
];

function identitySpecsFor(manifestVersion) {
  if (manifestVersion === 2) return V2_IDENTITY_SPECS;
  if (manifestVersion === 3) return V3_IDENTITY_SPECS;
  throw new Error('manifestVersion must be 2 or 3.');
}

function marker(runId, alias, expiresAt) {
  return {
    qaFixture: true,
    qaFixtureVersion: 1,
    qaFixtureRunId: runId,
    qaFixtureAlias: alias,
    qaFixtureExpiresAt: expiresAt,
  };
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeDeep(child);
  return Object.freeze(value);
}

/**
 * Build the non-secret, deterministic fixture graph for one isolated run.
 * Negative accounts deliberately start in their positive baseline state and
 * are transitioned only through lifecycle.applyNegativeState().
 */
export function buildFixtureDefinition({ runId, expiresAt, manifestVersion = 3 } = {}) {
  assertManagedUid(`${runId}-definition`, runId);
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
    throw new Error('expiresAt must be an ISO timestamp.');
  }

  const identitySpecs = identitySpecsFor(manifestVersion);
  const identities = identitySpecs.map(([alias, displayName, role, accountStatus, emailVerified]) => {
    const uid = `${runId}-${alias.replace(/^qa-/, '')}`;
    const claims = marker(runId, alias, expiresAt);
    if (alias !== 'qa-fake-superadmin') claims.role = role;
    return {
      alias,
      uid,
      email: `${alias}@example.test`,
      name: displayName,
      displayName,
      role,
      accountStatus,
      emailVerified,
      customClaims: claims,
    };
  });
  const byAlias = new Map(identities.map(identity => [identity.alias, identity]));

  const teams = [
    {
      alias: 'qa-team-a',
      id: `${runId}-team-a`,
      name: 'QA Fixture Team A',
      teamName: 'QA Fixture Team A',
      sentinel: 'qa-fixture-team-a-only',
      ownerUserId: byAlias.get('qa-coach-owner-a').uid,
    },
    {
      alias: 'qa-team-b',
      id: `${runId}-team-b`,
      name: 'QA Fixture Team B',
      teamName: 'QA Fixture Team B',
      sentinel: 'qa-fixture-team-b-only',
      ownerUserId: byAlias.get('qa-coach-owner-b').uid,
    },
    ...(manifestVersion === 3 ? [{
      alias: 'qa-school',
      id: `${runId}-school`,
      name: 'QA Fixture School',
      teamName: 'QA Fixture School',
      sentinel: 'qa-fixture-school-only',
      ownerUserId: byAlias.get('qa-school-admin').uid,
      type: 'school',
      isInstitution: true,
      status: 'active',
      schoolAdminIds: [byAlias.get('qa-school-admin').uid],
      planId: 'school',
      planType: 'school',
      isPro: true,
    }] : []),
  ].map(team => ({
    ...team,
    createdBy: team.ownerUserId,
    planId: team.planId || 'free',
    planType: team.planType || 'free',
    isPro: team.isPro || false,
    ...marker(runId, team.alias, expiresAt),
  }));

  const teamA = teams[0];
  const teamB = teams[1];
  const membershipSpecs = [
    ['qa-coach-owner-a', teamA, 'Admin', 'Coach'],
    ['qa-coach-owner-b', teamB, 'Admin', 'Coach'],
    ['qa-team-assistant', teamA, 'Admin', 'Assistant Coach'],
    ['qa-team-member', teamA, 'Member', 'Player'],
    ['qa-multi-org', teamA, 'Member', 'Player'],
    ['qa-multi-org', teamB, 'Member', 'Player'],
    ['qa-fake-superadmin', teamA, 'Member', 'Player'],
    ['qa-unverified', teamA, 'Member', 'Player'],
    ['qa-suspended', teamA, 'Member', 'Player'],
    ['qa-removed-member', teamA, 'Member', 'Player'],
    ...(manifestVersion === 3 ? [
      ['qa-parent-a', teamA, 'Member', 'Parent', {
        playerId: `${runId}-player-youth-active`,
        parentId: byAlias.get('qa-parent-a').uid,
        guardianIds: [byAlias.get('qa-parent-a').uid],
      }],
      ['qa-parent-b', teamB, 'Member', 'Parent', {
        playerId: `${runId}-youth-player-b`,
        parentId: byAlias.get('qa-parent-b').uid,
        guardianIds: [byAlias.get('qa-parent-b').uid],
      }],
      ['qa-adult-player-a', teamA, 'Member', 'Player', {
        playerId: `${runId}-player-adult-a`,
        parentId: byAlias.get('qa-adult-player-a').uid,
        guardianIds: [byAlias.get('qa-adult-player-a').uid],
      }],
      ['qa-adult-player-b', teamB, 'Member', 'Player', {
        playerId: `${runId}-player-adult-b`,
        parentId: byAlias.get('qa-adult-player-b').uid,
        guardianIds: [byAlias.get('qa-adult-player-b').uid],
      }],
      ['qa-youth-active', teamA, 'Member', 'Player', {
        playerId: `${runId}-player-youth-active`,
        parentId: byAlias.get('qa-parent-a').uid,
        guardianIds: [byAlias.get('qa-parent-a').uid],
      }],
      ['qa-pending-delete', teamA, 'Member', 'Player'],
      ['qa-school-admin', teams.find(team => team.alias === 'qa-school'), 'Admin', 'Athletic Director'],
    ] : []),
  ];
  const members = membershipSpecs.map(([alias, team, role, position, relationships = {}], index) => {
    const identity = byAlias.get(alias);
    return {
      alias,
      id: identity.uid,
      path: `teams/${team.id}/members/${identity.uid}`,
      membershipPath: `users/${identity.uid}/teamMemberships/${team.id}`,
      userId: identity.uid,
      ownerUserId: team.ownerUserId,
      teamId: team.id,
      name: identity.name,
      playerId: relationships.playerId || `p_${identity.uid}`,
      role,
      position,
      jersey: String(index + 1),
      avatar: '/icon.png',
      status: 'active',
      ...relationships,
      ...marker(runId, alias, expiresAt),
    };
  });

  const userDocuments = identities
    .filter(identity => manifestVersion !== 3 || identity.alias !== 'qa-missing-profile')
    .map(identity => ({
    alias: identity.alias,
    kind: 'user',
    path: `users/${identity.uid}`,
    data: {
      id: identity.uid,
      uid: identity.uid,
      email: identity.email,
      name: identity.name,
      displayName: identity.displayName,
      role: identity.role,
      accountStatus: identity.accountStatus,
      activePlanId: identity.alias === 'qa-school-admin' ? 'school' : 'free',
      proTeamLimit: 1,
      ...(identity.alias === 'qa-multi-org'
        ? { activeTeamId: teamA.id }
        : members.find(member => member.alias === identity.alias)
          ? { activeTeamId: members.find(member => member.alias === identity.alias).teamId }
          : {}),
      ...marker(runId, identity.alias, expiresAt),
      ...(identity.alias === 'qa-school-admin' ? {
        role: 'admin',
        isSchoolAdmin: true,
        planId: 'school',
        plan_type: 'school',
        activePlanId: 'school',
      } : {}),
    },
  }));
  const ownershipDocuments = identities.map(identity => ({
    alias: identity.alias,
    kind: 'auth-ownership',
    uid: identity.uid,
    path: `qaAuditRuns/${runId}/authOwnership/${identity.uid}`,
    data: {
      uid: identity.uid,
      ...marker(runId, identity.alias, expiresAt),
    },
  }));
  const teamDocuments = teams.map(team => ({ alias: team.alias, kind: 'team', path: `teams/${team.id}`, data: team }));
  const memberDocuments = members.map(member => ({ alias: member.alias, kind: 'member', path: member.path, data: member }));
  const membershipDocuments = members.map(member => {
    const team = teams.find(item => item.id === member.teamId);
    const identity = byAlias.get(member.alias);
    return {
      alias: member.alias,
      kind: 'membership-cache',
      path: member.membershipPath,
      data: {
        id: member.teamId,
        teamId: member.teamId,
        name: team.name,
        teamName: team.teamName,
        role: member.role,
        position: member.position,
        status: member.status,
        ownerUserId: member.ownerUserId,
        planId: team.planId,
        planType: team.planType,
        isPro: team.isPro,
        userId: identity.uid,
        ...(team.type ? { type: team.type } : {}),
        ...(team.isInstitution === true ? { isInstitution: true } : {}),
        ...(member.parentId ? { parentId: member.parentId } : {}),
        ...(member.guardianIds ? { guardianIds: member.guardianIds } : {}),
        ...marker(runId, member.alias, expiresAt),
      },
    };
  });

  const playerDocuments = manifestVersion === 3 ? [
    {
      alias: 'qa-youth-active',
      id: `${runId}-player-youth-active`,
      name: 'Youth Player A',
      userId: byAlias.get('qa-youth-active').uid,
      teamId: teamA.id,
      parentId: byAlias.get('qa-parent-a').uid,
      guardianIds: [byAlias.get('qa-parent-a').uid],
      isMinor: true,
    },
    {
      alias: 'qa-parent-b',
      id: `${runId}-youth-player-b`,
      name: 'Youth Player B',
      userId: null,
      teamId: teamB.id,
      parentId: byAlias.get('qa-parent-b').uid,
      guardianIds: [byAlias.get('qa-parent-b').uid],
      isMinor: true,
    },
    ...['qa-adult-player-a', 'qa-adult-player-b'].map(alias => {
      const identity = byAlias.get(alias);
      const membership = members.find(member => member.alias === alias);
      return {
        alias,
        id: membership.playerId,
        name: identity.name,
        userId: identity.uid,
        teamId: membership.teamId,
        parentId: identity.uid,
        guardianIds: [identity.uid],
        isMinor: false,
      };
    }),
  ].map(player => ({
    alias: player.alias,
    kind: 'player',
    path: `players/${player.id}`,
    data: {
      ...player,
      ...marker(runId, player.alias, expiresAt),
    },
  })) : [];
  const leagueDocuments = manifestVersion === 3 ? [{
    alias: 'qa-league',
    kind: 'league',
    path: `leagues/${runId}-league`,
    data: {
      id: `${runId}-league`,
      name: 'QA Fixture League',
      sentinel: 'qa-fixture-league-only',
      creatorId: byAlias.get('qa-league-creator').uid,
      ownerUserId: byAlias.get('qa-league-creator').uid,
      memberUserIds: [byAlias.get('qa-league-creator').uid],
      memberTeamIds: [],
      isActive: true,
      ...marker(runId, 'qa-league', expiresAt),
    },
  }] : [];
  const expectedAbsentDocuments = manifestVersion === 3 ? [{
    alias: 'qa-missing-profile',
    kind: 'user',
    path: `users/${byAlias.get('qa-missing-profile').uid}`,
  }] : [];

  return freezeDeep({
    manifestVersion,
    runId,
    expiresAt,
    identities,
    teams,
    members,
    documents: [
      ...ownershipDocuments,
      ...userDocuments,
      ...teamDocuments,
      ...memberDocuments,
      ...membershipDocuments,
      ...playerDocuments,
      ...leagueDocuments,
    ],
    expectedAbsentDocuments,
  });
}

export function fixturePlanSummary({ manifestVersion = 3 } = {}) {
  const identitySpecs = identitySpecsFor(manifestVersion);
  const aliases = identitySpecs.map(([alias]) => alias);
  const teamAliases = manifestVersion === 3
    ? ['qa-team-a', 'qa-team-b', 'qa-school']
    : ['qa-team-a', 'qa-team-b'];
  const firestoreDocuments = manifestVersion === 3 ? 81 : 40;
  return freezeDeep({
    manifestVersion,
    aliases,
    teamAliases,
    identityCount: aliases.length,
    teamCount: teamAliases.length,
    resourceCounts: {
      authUids: aliases.length,
      firestoreDocuments,
      expectedAbsentDocuments: manifestVersion === 3 ? 1 : 0,
    },
  });
}
