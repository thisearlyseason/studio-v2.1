import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';

const projectId = 'demo-the-squad-rules-test';
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await Promise.all([testEnv.clearFirestore(), testEnv.clearStorage()]);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users', 'owner'), { role: 'coach' }),
      setDoc(doc(db, 'users', 'parent'), { role: 'parent' }),
      setDoc(doc(db, 'users', 'player'), { role: 'adult_player' }),
      setDoc(doc(db, 'users', 'outsider'), { role: 'adult_player' }),
      setDoc(doc(db, 'users', 'suspended'), {
        role: 'adult_player',
        accountStatus: 'suspended',
      }),
      setDoc(doc(db, 'teams', 'team-a'), { ownerUserId: 'owner' }),
      setDoc(doc(db, 'teams', 'attacker-team'), { ownerUserId: 'outsider' }),
      setDoc(doc(db, 'players', 'private-player'), {
        userId: 'player',
        parentId: 'parent',
        primaryTeamId: 'team-a',
        recruitingProfileEnabled: false,
      }),
      setDoc(doc(db, 'players', 'public-player'), {
        userId: 'player',
        parentId: 'parent',
        primaryTeamId: 'team-a',
        recruitingProfileEnabled: true,
      }),
    ]);

    const storage = context.storage();
    await Promise.all([
      storage.ref('players/private-player/avatar/private.png')
        .putString('private image', 'raw', { contentType: 'image/png' }),
      storage.ref('players/public-player/avatar/public.png')
        .putString('public image', 'raw', { contentType: 'image/png' }),
      storage.ref('teams/team-a/branding/logo.png')
        .putString('team logo', 'raw', { contentType: 'image/png' }),
    ]);
  });
});

after(async () => {
  await testEnv?.cleanup();
});

function storageFor(uid, claims = {}) {
  return testEnv.authenticatedContext(uid, {
    email_verified: true,
    ...claims,
  }).storage();
}

test('disabled recruiting media is private while enabled profiles are public', async () => {
  const anonymousStorage = testEnv.unauthenticatedContext().storage();
  const parentStorage = storageFor('parent');

  await assertFails(
    anonymousStorage.ref('players/private-player/avatar/private.png').getMetadata(),
  );
  await assertSucceeds(
    anonymousStorage.ref('players/public-player/avatar/public.png').getMetadata(),
  );
  await assertSucceeds(
    parentStorage.ref('players/private-player/avatar/private.png').getMetadata(),
  );
});

test('player uploads require family/team authority and safe content types', async () => {
  const parentStorage = storageFor('parent');
  const outsiderStorage = storageFor('outsider');

  await assertSucceeds(
    parentStorage.ref('players/private-player/avatar/replacement.webp')
      .putString('safe image', 'raw', { contentType: 'image/webp' }),
  );
  await assertFails(
    outsiderStorage.ref('players/private-player/avatar/forged.png')
      .putString('forged image', 'raw', { contentType: 'image/png' }),
  );
  await assertFails(
    parentStorage.ref('players/private-player/avatar/script.svg')
      .putString('<svg onload="alert(1)"/>', 'raw', { contentType: 'image/svg+xml' }),
  );
});

test('an unrelated team owner cannot manage another player media after a forged linkage', async () => {
  const attackerStorage = storageFor('outsider');
  await assertFails(
    attackerStorage.ref('players/private-player/avatar/forged.png')
      .putString('forged image', 'raw', { contentType: 'image/png' }),
  );
});

test('team branding is public but only the owner can modify it', async () => {
  const anonymousStorage = testEnv.unauthenticatedContext().storage();
  const ownerStorage = storageFor('owner');
  const outsiderStorage = storageFor('outsider');

  await assertSucceeds(
    anonymousStorage.ref('teams/team-a/branding/logo.png').getMetadata(),
  );
  await assertSucceeds(
    ownerStorage.ref('teams/team-a/branding/banner.png')
      .putString('banner', 'raw', { contentType: 'image/png' }),
  );
  await assertFails(
    outsiderStorage.ref('teams/team-a/branding/forged.png')
      .putString('forged', 'raw', { contentType: 'image/png' }),
  );
});

test('unsupported storage paths are denied by default', async () => {
  const ownerStorage = storageFor('owner');

  await assertFails(
    ownerStorage.ref('unscoped/private.txt')
      .putString('private', 'raw', { contentType: 'text/plain' }),
  );
});

test('unverified and suspended accounts cannot read private account media', async () => {
  const unverifiedStorage = storageFor('parent', { email_verified: false });
  const suspendedStorage = storageFor('suspended');

  await assertFails(
    unverifiedStorage.ref('players/private-player/avatar/private.png').getMetadata(),
  );
  await assertFails(
    suspendedStorage.ref('players/private-player/avatar/private.png').getMetadata(),
  );
});
