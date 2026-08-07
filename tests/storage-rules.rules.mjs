import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const projectId = 'demo-squad-storage-rules';
const bucket = `gs://${projectId}.appspot.com`;
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await Promise.all([testEnv.clearFirestore(), testEnv.clearStorage()]);
});

async function seedDocument(path, data) {
  await testEnv.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedFile(path, contentType = 'image/png') {
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.storage(bucket).ref(path).putString('seed', 'raw', { contentType });
  });
}

function storage(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, claims).storage(bucket);
}

function anonymousStorage() {
  return testEnv.unauthenticatedContext().storage(bucket);
}

function upload(clientStorage, path, data = 'content', contentType = 'image/png') {
  return clientStorage.ref(path).putString(data, 'raw', { contentType });
}

test('team storage is limited to owners and active roster members', async () => {
  await seedDocument('teams/team-1', { ownerUserId: 'owner-1' });
  await seedDocument('teams/team-1/members/active-1', { status: 'active' });
  await seedDocument('teams/team-1/members/legacy-1', { role: 'Member' });
  await seedDocument('teams/team-1/members/removed-1', { status: 'removed' });
  await seedDocument('teams/team-1/members/deleted-1', { status: 'active', isDeleted: true });
  await seedFile('teams/team-1/logo.png');

  for (const uid of ['owner-1', 'active-1', 'legacy-1']) {
    await assertSucceeds(storage(uid).ref('teams/team-1/logo.png').getDownloadURL());
    await assertSucceeds(upload(storage(uid), `teams/team-1/${uid}.png`));
  }
  for (const uid of ['removed-1', 'deleted-1', 'outsider-1']) {
    await assertFails(storage(uid).ref('teams/team-1/logo.png').getDownloadURL());
    await assertFails(upload(storage(uid), `teams/team-1/${uid}.png`));
  }
  await assertFails(anonymousStorage().ref('teams/team-1/logo.png').getDownloadURL());
});

test('player media is limited to the athlete, guardians, and primary team owner', async () => {
  await seedDocument('teams/team-1', { ownerUserId: 'coach-1' });
  await seedDocument('players/player-1', {
    userId: 'athlete-1',
    parentId: 'parent-1',
    guardianIds: ['guardian-1'],
    primaryTeamId: 'team-1',
  });
  await seedFile('players/player-1/thumbnails/existing.png');

  for (const uid of ['athlete-1', 'parent-1', 'guardian-1', 'coach-1']) {
    await assertSucceeds(storage(uid).ref('players/player-1/thumbnails/existing.png').getDownloadURL());
  }
  await assertFails(storage('outsider-1').ref('players/player-1/thumbnails/existing.png').getDownloadURL());
  await assertFails(anonymousStorage().ref('players/player-1/thumbnails/existing.png').getDownloadURL());
});

test('player uploads enforce media types and image size limits', async () => {
  await seedDocument('players/player-1', { userId: 'athlete-1' });
  const athleteStorage = storage('athlete-1');

  await assertSucceeds(upload(athleteStorage, 'players/player-1/thumbnails/photo.png'));
  await assertSucceeds(upload(athleteStorage, 'players/player-1/videos/clip.mp4', 'video', 'video/mp4'));
  await assertFails(upload(athleteStorage, 'players/player-1/thumbnails/payload.txt', 'text', 'text/plain'));
  await assertFails(athleteStorage.ref('players/player-1/thumbnails/large.png').put(
    new Uint8Array(5 * 1024 * 1024 + 1),
    { contentType: 'image/png' },
  ));
});

test('user profile storage is private and accepts only bounded images', async () => {
  await seedFile('users/user-1/avatar.jpg', 'image/jpeg');
  const ownerStorage = storage('user-1');

  await assertSucceeds(ownerStorage.ref('users/user-1/avatar.jpg').getDownloadURL());
  await assertSucceeds(upload(ownerStorage, 'users/user-1/new-avatar.jpg', 'image', 'image/jpeg'));
  await assertFails(storage('other-1').ref('users/user-1/avatar.jpg').getDownloadURL());
  await assertFails(anonymousStorage().ref('users/user-1/avatar.jpg').getDownloadURL());
  await assertFails(upload(ownerStorage, 'users/user-1/avatar.svg', '<svg/>', 'image/svg+xml'));
  await assertFails(upload(ownerStorage, 'users/user-1/profile.txt', 'text', 'text/plain'));
  await assertFails(ownerStorage.ref('users/user-1/large.jpg').put(
    new Uint8Array(5 * 1024 * 1024 + 1),
    { contentType: 'image/jpeg' },
  ));
});

test('unknown storage paths are reserved for superadmins', async () => {
  await seedFile('internal/report.png');
  await assertFails(storage('user-1').ref('internal/report.png').getDownloadURL());
  await assertFails(upload(storage('user-1'), 'internal/user.png'));
  await assertSucceeds(storage('admin-1', { role: 'superadmin' }).ref('internal/report.png').getDownloadURL());
});
