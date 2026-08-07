import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const projectId = 'demo-squad-rules';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

function userDb(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).firestore();
}

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

test('a new user can create a safe signup profile for every supported persona', async () => {
  for (const role of ['parent', 'adult_player', 'youth_player', 'coach', 'admin', 'league_creator']) {
    const uid = `new-${role}`;
    await assertSucceeds(setDoc(doc(userDb(uid), 'users', uid), {
      id: uid,
      fullName: 'New User',
      email: `${uid}@example.com`,
      role,
      activePlanId: 'starter_squad',
      proTeamLimit: 0,
      notificationsEnabled: true,
    }));
  }
});

test('a new user cannot create a privileged or paid profile', async () => {
  const uid = 'new-user';
  await assertFails(setDoc(doc(userDb(uid), 'users', uid), {
    id: uid, role: 'superadmin', activePlanId: 'starter_squad', proTeamLimit: 0,
  }));
  await assertFails(setDoc(doc(userDb(uid), 'users', uid), {
    id: uid, role: 'coach', plan_type: 'school', team_limit: 100,
  }));
});

test('users can update ordinary profile and notification fields', async () => {
  await seed('users/user-1', {
    id: 'user-1', role: 'parent', plan_type: 'free', team_limit: 1,
    name: 'Original', notificationsEnabled: true,
  });
  const ref = doc(userDb('user-1'), 'users', 'user-1');
  await assertSucceeds(updateDoc(ref, {
    name: 'Updated', phone: '555-0100', notificationsEnabled: false,
    seenAlertIds: ['alert-1'],
  }));
  const snapshot = await assertSucceeds(getDoc(ref));
  assert.equal(snapshot.data().name, 'Updated');
});

test('users cannot change their own role, plan, quota, billing identity, or authority', async () => {
  await seed('users/user-1', {
    id: 'user-1', role: 'parent', plan_type: 'free', team_limit: 1,
  });
  const ref = doc(userDb('user-1'), 'users', 'user-1');
  for (const update of [
    { role: 'superadmin' },
    { plan_type: 'school' },
    { team_limit: 100 },
    { stripe_customer_id: 'cus_attacker' },
    { subscription_status: 'active' },
    { isPrimaryClubAuthority: true },
  ]) {
    await assertFails(updateDoc(ref, update));
  }
});

test('a superadmin claim can manage server-owned user fields', async () => {
  await seed('users/user-1', { id: 'user-1', role: 'parent', plan_type: 'free', team_limit: 1 });
  const ref = doc(userDb('admin-1', { role: 'superadmin' }), 'users', 'user-1');
  await assertSucceeds(updateDoc(ref, { plan_type: 'school', team_limit: 15 }));
});

test('a signed-in user cannot insert themselves into an unrelated roster', async () => {
  await seed('teams/team-1', { id: 'team-1', ownerUserId: 'coach-1', teamName: 'Team One' });
  await assertFails(setDoc(doc(userDb('attacker'), 'teams', 'team-1', 'members', 'attacker'), {
    id: 'attacker', userId: 'attacker', ownerUserId: 'attacker', role: 'Member', teamId: 'team-1',
  }));
});

test('demo workspaces are isolated to the account that created them', async () => {
  await seed('teams/demo-team-1', {
    id: 'demo-team-1', ownerUserId: 'fictional-coach', demoOwnerUserId: 'demo-user', isDemo: true,
  });
  await seed('teams/demo-team-1/members/demo-user', {
    id: 'demo-user', userId: 'demo-user', role: 'Member', isDemo: true,
  });
  await assertSucceeds(getDoc(doc(userDb('demo-user'), 'teams', 'demo-team-1')));
  await assertFails(getDoc(doc(userDb('other-user'), 'teams', 'demo-team-1')));
  await assertFails(setDoc(doc(userDb('other-user'), 'teams', 'demo-team-1', 'members', 'forged'), {
    id: 'forged', userId: 'other-user', isDemo: true,
  }));
});

test('isDemo alone cannot create cross-account users or players', async () => {
  await assertFails(setDoc(doc(userDb('attacker'), 'users', 'victim'), {
    id: 'victim', role: 'youth_player', isDemo: true,
  }));
  await assertFails(setDoc(doc(userDb('attacker'), 'players', 'victim-player'), {
    id: 'victim-player', isDemo: true,
  }));
  await assertSucceeds(setDoc(doc(userDb('demo-user'), 'players', 'demo-player'), {
    id: 'demo-player', isDemo: true, demoOwnerUserId: 'demo-user',
  }));
});

test('raw recruiting records are not anonymously readable, while a linked guardian can read them', async () => {
  await seed('players/player-1', {
    id: 'player-1', name: 'Athlete', parentId: 'parent-1', recruitingProfileEnabled: true,
  });
  await seed('players/player-1/recruitingProfile/profile', { fullName: 'Athlete' });
  await assertFails(getDoc(doc(anonDb(), 'players', 'player-1')));
  await assertFails(getDoc(doc(anonDb(), 'players', 'player-1', 'recruitingProfile', 'profile')));
  await assertSucceeds(getDoc(doc(userDb('parent-1'), 'players', 'player-1')));
  await assertSucceeds(getDoc(doc(userDb('parent-1'), 'players', 'player-1', 'recruitingProfile', 'profile')));
});

test('a parent can create and maintain their child athlete record without a userId', async () => {
  const ref = doc(userDb('parent-1'), 'players', 'child-1');
  await assertSucceeds(setDoc(ref, {
    id: 'child-1', firstName: 'Youth', lastName: 'Athlete', parentId: 'parent-1', isMinor: true,
  }));
  await assertSucceeds(updateDoc(ref, { pendingInviteEmail: 'athlete@example.com' }));
  await assertFails(updateDoc(doc(userDb('other-parent'), 'players', 'child-1'), { firstName: 'Changed' }));
});

test('youth invite tokens cannot be read or mutated from the client', async () => {
  await seed('invites/token-1', { parentId: 'parent-1', email: 'athlete@example.com', used: false });
  await assertFails(getDoc(doc(anonDb(), 'invites', 'token-1')));
  await assertFails(getDoc(doc(userDb('parent-1'), 'invites', 'token-1')));
  await assertFails(updateDoc(doc(userDb('parent-1'), 'invites', 'token-1'), { used: true }));
});

test('public lead collections accept writes only through the server API', async () => {
  for (const collectionName of ['beta_applications', 'newsletter_signups', 'contact_inquiries']) {
    const payload = { email: 'lead@example.com', createdAt: new Date(), status: 'new' };
    await assertFails(setDoc(doc(anonDb(), collectionName, 'anonymous'), payload));
    await assertFails(setDoc(doc(userDb('signed-in'), collectionName, 'signed-in'), payload));
  }
});

test('a team creator can still create the team and initial roster in one batch', async () => {
  const db = userDb('coach-1');
  const batch = writeBatch(db);
  batch.set(doc(db, 'teams', 'team-new'), {
    id: 'team-new', ownerUserId: 'coach-1', createdBy: 'coach-1', planId: 'free', isPro: false,
  });
  batch.set(doc(db, 'teams', 'team-new', 'members', 'coach-1'), {
    id: 'coach-1', userId: 'coach-1', ownerUserId: 'coach-1', role: 'Admin', teamId: 'team-new',
  });
  await assertSucceeds(batch.commit());
});

test('public league entries must use the validated API while league creators retain manual entry', async () => {
  await seed('leagues/league-1', { id: 'league-1', creatorId: 'league-owner', name: 'Summer League' });
  const entry = { league_id: 'league-1', answers: { name: 'Applicant' }, status: 'pending' };
  await assertFails(setDoc(doc(anonDb(), 'leagues', 'league-1', 'registrationEntries', 'public-forged'), entry));
  await assertFails(setDoc(doc(userDb('outsider'), 'leagues', 'league-1', 'registrationEntries', 'member-forged'), entry));
  await assertSucceeds(setDoc(doc(userDb('league-owner'), 'leagues', 'league-1', 'registrationEntries', 'manual'), entry));
});

async function seedTeamWithMember(uid = 'member-1', memberData = {}) {
  await seed('teams/team-1', { id: 'team-1', ownerUserId: 'coach-1', teamName: 'Team One' });
  await seed(`teams/team-1/members/${uid}`, {
    id: uid, userId: uid, role: 'Member', position: 'Player', teamId: 'team-1', ...memberData,
  });
}

test('team members can create chats and author messages, while outsiders cannot', async () => {
  await seedTeamWithMember();
  const member = userDb('member-1');
  const outsider = userDb('outsider');
  await assertSucceeds(setDoc(doc(member, 'teams', 'team-1', 'groupChats', 'chat-1'), {
    id: 'chat-1', createdBy: 'member-1', memberIds: ['member-1'], name: 'Travel',
  }));
  await assertSucceeds(setDoc(doc(member, 'teams', 'team-1', 'groupChats', 'chat-1', 'messages', 'message-1'), {
    authorId: 'member-1', author: 'Member', content: 'Hello',
  }));
  await assertFails(setDoc(doc(outsider, 'teams', 'team-1', 'groupChats', 'chat-1', 'messages', 'message-2'), {
    authorId: 'outsider', author: 'Outsider', content: 'Unauthorized',
  }));
});

test('removed and deleted roster records do not retain squad access', async () => {
  await seedTeamWithMember('removed-member', { status: 'removed' });
  await seedTeamWithMember('deleted-member', { isDeleted: true });
  await seedTeamWithMember('removed-staff', { status: 'removed', position: 'Assistant Coach' });
  await seed('teams/team-1/events/event-1', { title: 'Private Practice' });
  await seed('teams/team-1/fundraising/fund-1', { title: 'Travel', finances: {} });
  await seed('teams/team-1/groupChats/chat-removed-member', {
    id: 'chat-removed-member', createdBy: 'removed-member', memberIds: ['removed-member'], name: 'Archived',
  });

  for (const uid of ['removed-member', 'deleted-member', 'removed-staff']) {
    const db = userDb(uid);
    await assertFails(getDoc(doc(db, 'teams', 'team-1')));
    await assertFails(getDoc(doc(db, 'teams', 'team-1', 'events', 'event-1')));
    await assertFails(setDoc(doc(db, 'teams', 'team-1', 'groupChats', `chat-${uid}`), {
      id: `chat-${uid}`, createdBy: uid, memberIds: [uid], name: 'Unauthorized',
    }));
  }

  await assertFails(updateDoc(
    doc(userDb('removed-staff'), 'teams', 'team-1', 'fundraising', 'fund-1'),
    { title: 'Unauthorized staff edit' },
  ));
  await assertFails(getDoc(doc(userDb('outsider'), 'teams', 'team-1', 'events', 'event-1')));
  await assertFails(updateDoc(
    doc(userDb('removed-member'), 'teams', 'team-1', 'groupChats', 'chat-removed-member'),
    { name: 'Unauthorized creator edit' },
  ));

  await assertSucceeds(updateDoc(
    doc(userDb('coach-1'), 'teams', 'team-1', 'members', 'removed-member'),
    { status: 'active' },
  ));
  await assertSucceeds(getDoc(doc(userDb('removed-member'), 'teams', 'team-1')));
});

test('members can vote in polls but cannot rewrite another member message', async () => {
  await seedTeamWithMember('member-1');
  await seedTeamWithMember('member-2');
  await seed('teams/team-1/groupChats/chat-1', {
    id: 'chat-1', createdBy: 'member-1', memberIds: ['member-1', 'member-2'],
  });
  await seed('teams/team-1/groupChats/chat-1/messages/message-1', {
    authorId: 'member-1', content: 'Original', poll: { voters: {}, totalVotes: 0 },
  });
  const ref = doc(userDb('member-2'), 'teams', 'team-1', 'groupChats', 'chat-1', 'messages', 'message-1');
  await assertSucceeds(updateDoc(ref, { poll: { voters: { 'member-2': 0 }, totalVotes: 1 } }));
  await assertFails(updateDoc(ref, { content: 'Rewritten' }));
});

test('members can add only their own pending volunteer signup and staff can verify it', async () => {
  await seedTeamWithMember('member-1');
  await seedTeamWithMember('staff-1', { position: 'Assistant Coach' });
  await seed('teams/team-1/volunteers/opp-1', { title: 'Gate Duty', signups: {} });
  const memberRef = doc(userDb('member-1'), 'teams', 'team-1', 'volunteers', 'opp-1');
  await assertSucceeds(updateDoc(memberRef, {
    'signups.member-1': {
      userId: 'member-1', userName: 'Member', status: 'pending', isConfirmed: false,
    },
  }));
  await assertFails(updateDoc(memberRef, { 'signups.member-1.status': 'verified' }));
  const staffRef = doc(userDb('staff-1'), 'teams', 'team-1', 'volunteers', 'opp-1');
  await assertSucceeds(updateDoc(staffRef, { 'signups.member-1.status': 'verified' }));
});

test('fundraising totals and donation verification cannot be forged by members or outsiders', async () => {
  await seedTeamWithMember('member-1');
  await seedTeamWithMember('staff-1', { position: 'Assistant Coach' });
  await seed('teams/team-1/fundraising/fund-1', {
    title: 'Travel Fund', currentAmount: 100, finances: {}, isShareable: true,
  });
  await seed('teams/team-1/fundraising/fund-1/donations/donation-1', {
    donorName: 'Supporter', amount: 25, status: 'pending',
  });

  const memberFund = doc(userDb('member-1'), 'teams', 'team-1', 'fundraising', 'fund-1');
  await assertFails(updateDoc(memberFund, { currentAmount: 1000000 }));
  await assertSucceeds(updateDoc(memberFund, {
    'finances.member-1': { userId: 'member-1', status: 'joined', contributed: 0 },
  }));
  await assertFails(updateDoc(memberFund, {
    'finances.attacker': { userId: 'attacker', status: 'joined', contributed: 0 },
  }));

  const memberDonation = doc(userDb('member-1'), 'teams', 'team-1', 'fundraising', 'fund-1', 'donations', 'donation-1');
  await assertFails(updateDoc(memberDonation, { status: 'verified' }));
  await assertFails(setDoc(doc(userDb('outsider'), 'teams', 'team-1', 'fundraising', 'fund-1', 'donations', 'forged'), {
    donorName: 'Forged', amount: 999999, status: 'verified',
  }));
  const staffDonation = doc(userDb('staff-1'), 'teams', 'team-1', 'fundraising', 'fund-1', 'donations', 'donation-1');
  await assertSucceeds(updateDoc(staffDonation, { status: 'verified' }));
});

test('members cannot bypass the event action API by rewriting event attendance directly', async () => {
  await seedTeamWithMember('member-1');
  await seed('teams/team-1/events/event-1', { title: 'Practice', userRsvps: {}, assignments: [] });
  const memberRef = doc(userDb('member-1'), 'teams', 'team-1', 'events', 'event-1');
  await assertFails(updateDoc(memberRef, { 'userRsvps.member-1': 'going' }));
  const ownerRef = doc(userDb('coach-1'), 'teams', 'team-1', 'events', 'event-1');
  await assertSucceeds(updateDoc(ownerRef, { 'userRsvps.member-1': 'going' }));
});

test('staff-like roles cannot modify facilities owned by another account', async () => {
  await seed('users/other-coach', { id: 'other-coach', role: 'coach' });
  await seed('facilities/facility-1', { id: 'facility-1', clubId: 'owner-1', name: 'Main Gym', isDemo: true });
  await assertFails(updateDoc(doc(userDb('other-coach'), 'facilities', 'facility-1'), { name: 'Taken Over' }));
  await assertSucceeds(updateDoc(doc(userDb('owner-1'), 'facilities', 'facility-1'), { name: 'Updated Gym' }));
});

test('guardians cannot forge child waiver signatures directly and must use the validated API', async () => {
  await seed('teams/team-1', { id: 'team-1', ownerUserId: 'coach-1', teamName: 'Team One' });
  await seed('teams/team-1/members/child-1', {
    id: 'child-1', userId: 'child-user', parentId: 'parent-1', role: 'Member', teamId: 'team-1',
  });
  const signature = {
    documentId: 'waiver-1', userId: 'parent-1', memberId: 'child-1',
    signatureName: 'Forged Guardian', signedByParent: true,
  };
  await assertFails(setDoc(
    doc(userDb('parent-1'), 'teams', 'team-1', 'members', 'child-1', 'signatures', 'waiver-1'),
    signature,
  ));
  await assertSucceeds(setDoc(
    doc(userDb('child-1'), 'teams', 'team-1', 'members', 'child-1', 'signatures', 'waiver-1'),
    { ...signature, userId: 'child-1', signedByParent: false },
  ));
});
