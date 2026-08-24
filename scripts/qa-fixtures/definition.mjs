import { assertManagedUid } from './manifest.mjs';

const IDENTITY_SPECS = [
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
export function buildFixtureDefinition({ runId, expiresAt } = {}) {
  assertManagedUid(`${runId}-definition`, runId);
  if (typeof expiresAt !== 'string' || Number.isNaN(Date.parse(expiresAt))) {
    throw new Error('expiresAt must be an ISO timestamp.');
  }

  const identities = IDENTITY_SPECS.map(([alias, displayName, role, accountStatus, emailVerified]) => {
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
  ].map(team => ({
    ...team,
    createdBy: team.ownerUserId,
    planId: 'free',
    planType: 'free',
    isPro: false,
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
  ];
  const members = membershipSpecs.map(([alias, team, role, position], index) => {
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
      playerId: `p_${identity.uid}`,
      role,
      position,
      jersey: String(index + 1),
      avatar: `https://example.test/avatars/${alias}.png`,
      status: 'active',
      ...marker(runId, alias, expiresAt),
    };
  });

  const userDocuments = identities.map(identity => ({
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
      activePlanId: 'free',
      proTeamLimit: 1,
      activeTeamId: identity.alias === 'qa-multi-org'
        ? teamA.id
        : members.find(member => member.alias === identity.alias)?.teamId,
      ...marker(runId, identity.alias, expiresAt),
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
        planId: 'free',
        planType: 'free',
        isPro: false,
        userId: identity.uid,
        ...marker(runId, member.alias, expiresAt),
      },
    };
  });

  return freezeDeep({
    runId,
    expiresAt,
    identities,
    teams,
    members,
    documents: [...ownershipDocuments, ...userDocuments, ...teamDocuments, ...memberDocuments, ...membershipDocuments],
  });
}
