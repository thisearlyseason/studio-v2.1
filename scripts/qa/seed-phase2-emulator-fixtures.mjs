import process from 'node:process';
import { applicationDefault, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const PASSWORD = process.env.AUDIT_FIXTURE_PASSWORD || '';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';

const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function emulatorHostname(value) {
  const host = value.split(':')[0]?.replace(/^\[/, '').replace(/\]$/, '');
  return host || '';
}

function assertSafeEnvironment() {
  if (!PROJECT_ID.startsWith('demo-')) {
    throw new Error('Refusing to seed: GCLOUD_PROJECT must use a demo-* Firebase project ID.');
  }
  if (!allowedHosts.has(emulatorHostname(AUTH_HOST))) {
    throw new Error('Refusing to seed: FIREBASE_AUTH_EMULATOR_HOST must be loopback.');
  }
  if (!allowedHosts.has(emulatorHostname(FIRESTORE_HOST))) {
    throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST must be loopback.');
  }
  if (PASSWORD.length < 16) {
    throw new Error('AUDIT_FIXTURE_PASSWORD must be supplied at runtime and contain at least 16 characters.');
  }
}

const identities = [
  { alias: 'qa-coach-owner-a', uid: 'qa-coach-owner-a', role: 'coach', verified: true },
  { alias: 'qa-coach-owner-b', uid: 'qa-coach-owner-b', role: 'coach', verified: true },
  { alias: 'qa-team-assistant', uid: 'qa-team-assistant', role: 'coach', verified: true },
  { alias: 'qa-team-member', uid: 'qa-team-member', role: 'adult_player', verified: true },
  { alias: 'qa-parent-a', uid: 'qa-parent-a', role: 'parent', verified: true },
  { alias: 'qa-parent-b', uid: 'qa-parent-b', role: 'parent', verified: true },
  { alias: 'qa-adult-player-a', uid: 'qa-adult-player-a', role: 'adult_player', verified: true },
  { alias: 'qa-adult-player-b', uid: 'qa-adult-player-b', role: 'adult_player', verified: true },
  { alias: 'qa-youth-active', uid: 'qa-youth-active', role: 'youth_player', verified: true },
  { alias: 'qa-superadmin', uid: 'qa-superadmin', role: 'superadmin', verified: true, claims: { role: 'superadmin' } },
  { alias: 'qa-fake-superadmin', uid: 'qa-fake-superadmin', role: 'superadmin', verified: true },
  { alias: 'qa-unverified', uid: 'qa-unverified', role: 'coach', verified: false },
  { alias: 'qa-suspended', uid: 'qa-suspended', role: 'adult_player', verified: true, disabled: true },
  { alias: 'qa-removed-member', uid: 'qa-removed-member', role: 'adult_player', verified: true },
  { alias: 'qa-pending-delete', uid: 'qa-pending-delete', role: 'adult_player', verified: true },
  { alias: 'qa-multi-team', uid: 'qa-multi-team', role: 'coach', verified: true },
];

function emailFor(alias) {
  return `${alias}@phase2.test`;
}

async function upsertAuthUser(auth, identity) {
  const properties = {
    email: emailFor(identity.alias),
    emailVerified: identity.verified,
    disabled: identity.disabled === true,
    displayName: identity.alias.replaceAll('-', ' '),
    password: PASSWORD,
  };
  try {
    await auth.getUser(identity.uid);
    await auth.updateUser(identity.uid, properties);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid: identity.uid, ...properties });
  }
  await auth.setCustomUserClaims(identity.uid, identity.claims || null);
}

function member(uid, overrides = {}) {
  return {
    id: uid,
    userId: uid,
    name: uid.replaceAll('-', ' '),
    email: emailFor(uid),
    role: 'Member',
    position: 'Player',
    status: 'active',
    isDeleted: false,
    joinedAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')),
    ...overrides,
  };
}

function team(teamId, ownerUserId, name, accent) {
  const isPaidFixture = teamId === 'qa-team-a';
  return {
    id: teamId,
    name,
    teamName: name,
    ownerUserId,
    planId: isPaidFixture ? 'team' : 'free',
    plan_type: isPaidFixture ? 'team' : 'free',
    isPro: isPaidFixture,
    // Browser workflows must never dispatch real push or email notifications.
    isDemo: true,
    sport: teamId === 'qa-team-a' ? 'Basketball' : 'Soccer',
    ageGroup: teamId === 'qa-team-a' ? 'U16' : 'U14',
    primaryColor: accent,
    createdAt: Timestamp.fromDate(new Date('2026-08-01T12:00:00Z')),
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
  };
}

async function seedFirestore(db) {
  const fixtureRoots = [
    db.collection('teams').doc('qa-team-a'),
    db.collection('teams').doc('qa-team-b'),
  ];
  for (const root of fixtureRoots) await db.recursiveDelete(root);

  const batch = db.batch();
  const now = Timestamp.fromDate(new Date('2026-09-03T12:00:00Z'));

  for (const identity of identities) {
    const profile = {
      id: identity.uid,
      uid: identity.uid,
      email: emailFor(identity.alias),
      name: identity.alias.replaceAll('-', ' '),
      role: identity.role,
      plan_type: 'free',
      planId: 'free',
      emailVerified: identity.verified,
      createdAt: now,
      updatedAt: now,
    };
    if (identity.alias === 'qa-suspended') profile.accountStatus = 'suspended';
    if (identity.alias === 'qa-pending-delete') profile.deletionStatus = 'pending';
    batch.set(db.collection('users').doc(identity.uid), profile);
  }

  batch.set(db.collection('teams').doc('qa-team-a'), team('qa-team-a', 'qa-coach-owner-a', 'Phase 2 Falcons', '#C81E1E'));
  batch.set(db.collection('teams').doc('qa-team-b'), team('qa-team-b', 'qa-coach-owner-b', 'Phase 2 Bluebirds', '#1D4ED8'));

  const teamAMembers = [
    member('qa-coach-owner-a', { role: 'Admin', position: 'Head Coach', ownerUserId: 'qa-coach-owner-a' }),
    member('qa-team-assistant', { role: 'Admin', position: 'Assistant Coach', ownerUserId: 'qa-coach-owner-a' }),
    member('qa-team-member'),
    member('qa-parent-a', { position: 'Parent' }),
    member('qa-adult-player-a'),
    member('qa-youth-active', { playerId: 'qa-player-youth-a' }),
    member('qa-removed-member', { status: 'removed' }),
    member('qa-pending-delete'),
    member('qa-multi-team', { position: 'Assistant Coach' }),
  ];
  const teamBMembers = [
    member('qa-coach-owner-b', { role: 'Admin', position: 'Head Coach', ownerUserId: 'qa-coach-owner-b' }),
    member('qa-parent-b', { position: 'Parent' }),
    member('qa-adult-player-b'),
    member('qa-multi-team'),
  ];
  for (const value of teamAMembers) {
    batch.set(db.collection('teams').doc('qa-team-a').collection('members').doc(value.id), value);
  }
  for (const value of teamBMembers) {
    batch.set(db.collection('teams').doc('qa-team-b').collection('members').doc(value.id), value);
  }

  const membershipPairs = [
    ['qa-coach-owner-a', 'qa-team-a'], ['qa-team-assistant', 'qa-team-a'],
    ['qa-team-member', 'qa-team-a'], ['qa-parent-a', 'qa-team-a'],
    ['qa-adult-player-a', 'qa-team-a'], ['qa-youth-active', 'qa-team-a'],
    ['qa-pending-delete', 'qa-team-a'], ['qa-multi-team', 'qa-team-a'],
    ['qa-coach-owner-b', 'qa-team-b'], ['qa-parent-b', 'qa-team-b'],
    ['qa-adult-player-b', 'qa-team-b'], ['qa-multi-team', 'qa-team-b'],
  ];
  for (const [uid, teamId] of membershipPairs) {
    const membershipTeamName = teamId === 'qa-team-a' ? 'Phase 2 Falcons' : 'Phase 2 Bluebirds';
    batch.set(db.collection('users').doc(uid).collection('teamMemberships').doc(teamId), {
      teamId,
      name: membershipTeamName,
      teamName: membershipTeamName,
      userId: uid,
      status: 'active',
      joinedAt: now,
    });
  }

  batch.set(db.collection('players').doc('qa-player-adult-a'), {
    id: 'qa-player-adult-a', userId: 'qa-adult-player-a', primaryTeamId: 'qa-team-a',
    firstName: 'Alex', lastName: 'Falcon', recruitingProfileEnabled: false,
    email: emailFor('qa-adult-player-a'), medicalNotes: 'Synthetic Team A private value',
  });
  batch.set(db.collection('players').doc('qa-player-youth-a'), {
    id: 'qa-player-youth-a', userId: 'qa-youth-active', parentId: 'qa-parent-a',
    primaryTeamId: 'qa-team-a', joinedTeamIds: ['qa-team-a'], firstName: 'Youth',
    lastName: 'Falcon', recruitingProfileEnabled: false,
  });
  batch.set(db.collection('players').doc('qa-player-adult-b'), {
    id: 'qa-player-adult-b', userId: 'qa-adult-player-b', primaryTeamId: 'qa-team-b',
    firstName: 'Blair', lastName: 'Bluebird', recruitingProfileEnabled: true,
    email: emailFor('qa-adult-player-b'), medicalNotes: 'Synthetic Team B private value',
  });

  for (const [teamId, marker] of [['qa-team-a', 'FALCON-A'], ['qa-team-b', 'BLUEBIRD-B']]) {
    const owner = teamId === 'qa-team-a' ? 'qa-coach-owner-a' : 'qa-coach-owner-b';
    batch.set(db.collection('teams').doc(teamId).collection('events').doc('qa-future-event'), {
      id: 'qa-future-event', title: `${marker} Future Practice`, type: 'practice', eventType: 'practice',
      date: '2026-10-15', startTime: '18:00', endTime: '19:30', createdBy: owner,
    });
    batch.set(db.collection('teams').doc(teamId).collection('events').doc('qa-cross-midnight'), {
      id: 'qa-cross-midnight', title: `${marker} Overnight Tournament`, type: 'tournament', eventType: 'tournament',
      date: '2026-11-01', endDate: '2026-11-02', startTime: '23:30', endTime: '01:30', createdBy: owner,
    });
    batch.set(db.collection('teams').doc(teamId).collection('groupChats').doc('qa-team-chat'), {
      id: 'qa-team-chat', name: `${marker} Team Chat`, createdBy: owner,
      memberIds: teamId === 'qa-team-a'
        ? teamAMembers.filter(value => value.status === 'active').map(value => value.userId)
        : teamBMembers.map(value => value.userId),
      createdAt: now,
    });
    batch.set(db.collection('teams').doc(teamId).collection('groupChats').doc('qa-team-chat').collection('messages').doc('qa-seed-message'), {
      id: 'qa-seed-message', authorId: owner, senderId: owner,
      text: `${marker} synthetic private message`, createdAt: now,
    });
    batch.set(db.collection('teams').doc(teamId).collection('files').doc('qa-private-file'), {
      id: 'qa-private-file', name: `${marker}-private.pdf`, category: 'Audit',
      url: `https://example.test/${teamId}/private.pdf`, createdBy: owner, createdAt: now,
    });
    batch.set(db.collection('teams').doc(teamId).collection('facilities').doc('qa-field'), {
      id: 'qa-field', name: `${marker} Field`, address: `${marker} synthetic address`, createdAt: now,
    });
    batch.set(db.collection('teams').doc(teamId).collection('alerts').doc('qa-alert'), {
      id: 'qa-alert', title: `${marker} Everyone Alert`, message: `${marker} synthetic everyone message`,
      audience: 'everyone', createdBy: owner, createdAt: Timestamp.fromDate(new Date('2026-09-03T12:00:00Z')),
    });
    if (teamId === 'qa-team-a') {
      batch.set(db.collection('teams').doc(teamId).collection('alerts').doc('qa-player-alert'), {
        id: 'qa-player-alert', title: `${marker} Player Alert`, message: `${marker} synthetic player message`,
        audience: 'players', createdBy: owner, createdAt: Timestamp.fromDate(new Date('2026-09-03T12:01:00Z')),
      });
      batch.set(db.collection('teams').doc(teamId).collection('alerts').doc('qa-coach-alert'), {
        id: 'qa-coach-alert', title: `${marker} Coach Alert`, message: `${marker} synthetic coach message`,
        audience: 'coaches', createdBy: owner, createdAt: Timestamp.fromDate(new Date('2026-09-03T12:02:00Z')),
      });
      batch.set(db.collection('teams').doc(teamId).collection('alerts').doc('qa-parent-alert'), {
        id: 'qa-parent-alert', title: `${marker} Parent Alert`, message: `${marker} synthetic parent message`,
        audience: 'parents', createdBy: owner, createdAt: Timestamp.fromDate(new Date('2026-09-03T12:03:00Z')),
      });
    }
  }

  batch.set(db.collection('auditFixtureMetadata').doc('phase2'), {
    fixtureVersion: 1,
    projectId: PROJECT_ID,
    aliases: identities.map(identity => identity.alias),
    teamIds: ['qa-team-a', 'qa-team-b'],
    seededAt: FieldValue.serverTimestamp(),
    synthetic: true,
  });

  await batch.commit();
}

async function main() {
  assertSafeEnvironment();
  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  for (const identity of identities) await upsertAuthUser(auth, identity);
  await seedFirestore(db);

  console.log(`Seeded ${identities.length} synthetic Phase 2 identities and two isolated tenants in ${PROJECT_ID}.`);
  console.log('Fixture password was accepted from the runtime environment and was not printed or persisted.');
  await deleteApp(app);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
