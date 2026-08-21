import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const policy = await import('../src/lib/global-waiver-policy.ts').catch(() => ({}));

const documents = [
  {
    id: 'protocol_1720000000000_global',
    title: 'Season waiver',
    type: 'waiver',
    waiverAudience: 'participant',
    isClubMaster: true,
    isGlobal: true,
  },
  {
    id: 'protocol_1720000000000_0',
    title: 'Season waiver',
    type: 'waiver',
    waiverAudience: 'participant',
    isClubMaster: true,
    teamId: 'team-a',
  },
  {
    id: 'protocol_1720000000000_1',
    title: 'Season waiver',
    type: 'waiver',
    waiverAudience: 'participant',
    isClubMaster: true,
    teamId: 'team-b',
  },
];

test('global waiver copies collapse to one deployment, including legacy IDs', () => {
  assert.equal(typeof policy.groupGlobalWaiverDeployments, 'function');

  const grouped = policy.groupGlobalWaiverDeployments(documents);

  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].deploymentId, 'protocol_1720000000000');
  assert.equal(grouped[0].document.id, 'protocol_1720000000000_global');
  assert.deepEqual(
    grouped[0].teamDocuments.map(document => [document.teamId, document.id]),
    [
      ['team-a', 'protocol_1720000000000_0'],
      ['team-b', 'protocol_1720000000000_1'],
    ]
  );
});

test('global waiver mutations select every copy in the deployment and no unrelated waiver', () => {
  assert.equal(typeof policy.filterGlobalWaiverDeploymentCopies, 'function');
  const selected = policy.filterGlobalWaiverDeploymentCopies([
    ...documents,
    { id: 'protocol_9999999999999_0', isClubMaster: true, teamId: 'team-a' },
    { id: 'local-waiver', isClubMaster: false, teamId: 'team-a' },
  ], 'protocol_1720000000000');

  assert.deepEqual(selected.map(document => document.id), [
    'protocol_1720000000000_global',
    'protocol_1720000000000_0',
    'protocol_1720000000000_1',
  ]);
});

test('participant waiver completes only after every active non-staff participant signs', () => {
  assert.equal(typeof policy.calculateGlobalWaiverCompletion, 'function');
  const deployment = policy.groupGlobalWaiverDeployments(documents)[0];
  const members = [
    { id: 'player-a', teamId: 'team-a', position: 'Player', status: 'active' },
    { id: 'player-b', teamId: 'team-b', position: 'Goalkeeper', status: 'active' },
    { id: 'coach-a', teamId: 'team-a', position: 'Head Coach', status: 'active' },
    { id: 'removed-player', teamId: 'team-a', position: 'Player', status: 'removed' },
  ];

  const partial = policy.calculateGlobalWaiverCompletion({
    deployment,
    teamIds: ['team-a', 'team-b'],
    members,
    participantSignatures: [
      { teamId: 'team-a', memberId: 'player-a', documentId: 'protocol_1720000000000_0' },
    ],
    coachSignatures: [],
  });
  assert.deepEqual(
    { required: partial.required, signed: partial.signed, isComplete: partial.isComplete },
    { required: 2, signed: 1, isComplete: false }
  );

  const complete = policy.calculateGlobalWaiverCompletion({
    deployment,
    teamIds: ['team-a', 'team-b'],
    members,
    participantSignatures: [
      { teamId: 'team-a', memberId: 'player-a', documentId: 'protocol_1720000000000_0' },
      { teamId: 'team-b', memberId: 'player-b', documentId: 'protocol_1720000000000_1' },
    ],
    coachSignatures: [],
  });
  assert.equal(complete.isComplete, true);
  assert.equal(complete.completedTeams, 2);
});

test('team waiver requires one coach or staff signature from every sub-squad', () => {
  const teamDocuments = documents.map(document => ({ ...document, waiverAudience: 'team' }));
  const deployment = policy.groupGlobalWaiverDeployments(teamDocuments)[0];
  const members = [
    { id: 'coach-a', userId: 'coach-user-a', teamId: 'team-a', position: 'Head Coach', status: 'active' },
    { id: 'staff-b', userId: 'staff-user-b', teamId: 'team-b', position: 'Manager', status: 'active' },
  ];

  const partial = policy.calculateGlobalWaiverCompletion({
    deployment,
    teamIds: ['team-a', 'team-b'],
    members,
    participantSignatures: [],
    coachSignatures: [
      { teamId: 'team-a', signedBy: 'coach-user-a', waiverDocId: 'protocol_1720000000000_0' },
    ],
  });
  assert.deepEqual(
    { required: partial.required, signed: partial.signed, completedTeams: partial.completedTeams, isComplete: partial.isComplete },
    { required: 2, signed: 1, completedTeams: 1, isComplete: false }
  );

  const complete = policy.calculateGlobalWaiverCompletion({
    deployment,
    teamIds: ['team-a', 'team-b'],
    members,
    participantSignatures: [],
    coachSignatures: [
      { teamId: 'team-a', signedBy: 'coach-user-a', waiverDocId: 'protocol_1720000000000_0' },
      { teamId: 'team-b', signedBy: 'staff-user-b', waiverDocId: 'protocol_1720000000000_1' },
    ],
  });
  assert.equal(complete.isComplete, true);
  assert.equal(complete.completedTeams, 2);
});

test('waiver library exposes assigned active documents after signing as well as before', () => {
  assert.equal(typeof policy.getVisibleWaiverDocuments, 'function');
  const visible = policy.getVisibleWaiverDocuments({
    documents: [
      { id: 'all', title: 'All participants', type: 'waiver', isActive: true, assignedTo: ['all'] },
      { id: 'mine', title: 'Mine', type: 'waiver', isActive: true, assignedTo: ['member-a'] },
      { id: 'other', title: 'Other', type: 'waiver', isActive: true, assignedTo: ['member-b'] },
      { id: 'inactive', title: 'Old', type: 'waiver', isActive: false, assignedTo: ['all'] },
    ],
    memberIds: ['member-a'],
    isStaff: false,
  });

  assert.deepEqual(visible.map(document => document.id), ['all', 'mine']);
});

test('legacy waivers without an isActive field remain active while explicitly disabled waivers do not', () => {
  assert.equal(typeof policy.isActiveWaiverDocument, 'function');
  assert.equal(policy.isActiveWaiverDocument({ id: 'legacy', type: 'waiver' }), true);
  assert.equal(policy.isActiveWaiverDocument({ id: 'disabled', type: 'waiver', isActive: false }), false);
});

test('parent waiver access follows roster parent links as well as legacy parent email', () => {
  assert.equal(typeof policy.getSigningMemberIds, 'function');
  const ids = policy.getSigningMemberIds({
    user: { id: 'parent-user', email: 'parent@example.com' },
    members: [
      { id: 'self', userId: 'parent-user' },
      { id: 'linked-child', parentId: 'parent-user' },
      { id: 'legacy-child', parentEmail: 'PARENT@example.com' },
      { id: 'other-child', parentId: 'someone-else', parentEmail: 'other@example.com' },
    ],
  });
  assert.deepEqual(ids, ['self', 'linked-child', 'legacy-child']);
});

test('payment settings live inside the Finance tab and the signing modal owns responsive spacing', () => {
  const club = fs.readFileSync(new URL('../src/app/(dashboard)/club/page.tsx', import.meta.url), 'utf8');
  const coaches = fs.readFileSync(new URL('../src/app/(dashboard)/coaches-corner/page.tsx', import.meta.url), 'utf8');
  const financeStart = club.indexOf('<TabsContent value="finance"');
  const financeEnd = club.indexOf('</TabsContent>', financeStart);
  const paymentSettings = club.indexOf('<HubStripeSettings');

  assert.ok(financeStart >= 0 && paymentSettings > financeStart && paymentSettings < financeEnd);
  assert.match(coaches, /DialogContent className="[^\"]*p-0[^\"]*overflow-hidden/);
  assert.match(coaches, /data-waiver-signing-body/);
});
