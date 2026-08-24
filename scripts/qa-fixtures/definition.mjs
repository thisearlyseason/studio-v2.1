import { assertManagedUid } from './manifest.mjs';

const IDENTITY_SPECS = [
  ['qa-coach-owner-a', 'Coach Owner A', 'Admin', 'active', true],
  ['qa-coach-owner-b', 'Coach Owner B', 'Admin', 'active', true],
  ['qa-team-assistant', 'Team Assistant', 'Assistant', 'active', true],
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

function membershipId(runId, alias, teamKey) {
  return `${runId}-membership-${alias.replace(/^qa-/, '')}-${teamKey}`;
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
    ['qa-team-assistant', teamA, 'Assistant', 'Assistant Coach'],
    ['qa-team-member', teamA, 'Member', 'Player'],
    ['qa-multi-org', teamA, 'Member', 'Player'],
    ['qa-multi-org', teamB, 'Member', 'Player'],
    ['qa-fake-superadmin', teamA, 'Member', 'Player'],
    ['qa-unverified', teamA, 'Member', 'Player'],
    ['qa-suspended', teamA, 'Member', 'Player'],
    ['qa-removed-member', teamA, 'Member', 'Player'],
  ];
  const members = membershipSpecs.map(([alias, team, role, position]) => {
    const identity = byAlias.get(alias);
    const id = membershipId(runId, alias, team.alias);
    return {
      alias,
      id,
      path: `teams/${team.id}/members/${id}`,
      userId: identity.uid,
      ownerUserId: team.ownerUserId,
      teamId: team.id,
      role,
      position,
      status: 'active',
      ...marker(runId, alias, expiresAt),
    };
  });

  const activeMemberships = new Map(identities.map(identity => [identity.alias, {}]));
  for (const member of members) {
    activeMemberships.get(member.alias)[member.teamId] = {
      id: member.teamId,
      teamId: member.teamId,
      role: member.role,
      status: member.status,
      ownerUserId: member.ownerUserId,
    };
  }

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
      activeTeamId: identity.alias === 'qa-multi-org' ? teamA.id : Object.keys(activeMemberships.get(identity.alias))[0],
      teamMemberships: activeMemberships.get(identity.alias),
      ...marker(runId, identity.alias, expiresAt),
    },
  }));
  const teamDocuments = teams.map(team => ({ alias: team.alias, kind: 'team', path: `teams/${team.id}`, data: team }));
  const memberDocuments = members.map(member => ({ alias: member.alias, kind: 'member', path: member.path, data: member }));

  return freezeDeep({
    runId,
    expiresAt,
    identities,
    teams,
    members,
    documents: [...userDocuments, ...teamDocuments, ...memberDocuments],
  });
}
