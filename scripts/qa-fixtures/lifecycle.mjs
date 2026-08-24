import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import { STAGING_PROJECT_ID } from './guard.mjs';
import { assertManagedPath, assertManagedUid, validateManifest } from './manifest.mjs';

const NEGATIVE_ALIASES = new Set(['qa-suspended', 'qa-removed-member']);

function nowIso(clock) {
  const value = typeof clock === 'function' ? clock() : new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('clock must return a valid date.');
  return date.toISOString();
}

function isNotFound(error) {
  return error?.code === 'auth/user-not-found' || error?.code === 'ENOENT';
}

function snapshotData(value) {
  if (value === null || value === undefined) return null;
  if (typeof value.exists === 'boolean') return value.exists ? value.data() : null;
  return value;
}

function markerMatches(data, expected) {
  return data
    && data.qaFixture === true
    && data.qaFixtureVersion === 1
    && data.qaFixtureRunId === expected.qaFixtureRunId
    && data.qaFixtureAlias === expected.qaFixtureAlias
    && data.qaFixtureExpiresAt === expected.qaFixtureExpiresAt;
}

function collision(kind) {
  return new Error(`Fixture ${kind} collision: existing resource is not the exact marked fixture.`);
}

function assertDefinition(definition) {
  if (!definition || typeof definition !== 'object' || !Array.isArray(definition.identities) || !Array.isArray(definition.documents)) {
    throw new Error('A complete fixture definition is required.');
  }
  const paths = definition.documents.map(document => document.path);
  if (new Set(paths).size !== paths.length) throw new Error('Fixture definition contains duplicate document paths.');
  const uids = definition.identities.map(identity => identity.uid);
  if (new Set(uids).size !== uids.length) throw new Error('Fixture definition contains duplicate Auth UIDs.');
  for (const uid of uids) assertManagedUid(uid, definition.runId);
  for (const path of paths) assertManagedPath(path, definition.runId);
}

function assertOutsideRepository(path, repositoryRoot) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Credential path must be an absolute path.');
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) throw new Error('repositoryRoot must be an absolute path.');
  const target = resolve(path);
  const root = resolve(repositoryRoot);
  const fromRoot = relative(root, target);
  if (fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))) {
    throw new Error('Credential path must be outside the repository.');
  }
  return target;
}

/** Remove one externally-stored credential file. Browser orchestration owns when it calls this. */
export async function removeCredentialFile(path, repositoryRoot) {
  const target = assertOutsideRepository(path, repositoryRoot);
  let file;
  try {
    file = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error('Credential removal accepts only a regular file.');
  }
  await unlink(target);
  return true;
}

function credentialPayload(definition, passwords) {
  return JSON.stringify({
    version: 1,
    runId: definition.runId,
    identities: definition.identities.map(identity => ({
      alias: identity.alias,
      email: identity.email,
      password: passwords.get(identity.uid),
    })),
  });
}

export function createLifecycle({ auth, firestore, clock = () => new Date(), randomBytes, definition, repositoryRoot = process.cwd() } = {}) {
  if (!auth || !firestore) throw new Error('Auth and Firestore adapters are required.');
  if (typeof randomBytes !== 'function') throw new Error('randomBytes must be injected.');
  assertDefinition(definition);

  const identityByUid = new Map(definition.identities.map(identity => [identity.uid, identity]));
  const identityByAlias = new Map(definition.identities.map(identity => [identity.alias, identity]));
  const documentByPath = new Map(definition.documents.map(document => [document.path, document]));
  let baselineSeeded = false;

  function freshManifest(state = 'planned') {
    const timestamp = nowIso(clock);
    return {
      version: 1,
      runId: definition.runId,
      projectId: STAGING_PROJECT_ID,
      authUids: [],
      firestorePaths: [],
      state,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: definition.expiresAt,
    };
  }

  async function readManifest(manifestPath) {
    try {
      return validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function writeManifest(manifestPath, manifest) {
    const normalized = validateManifest({
      ...manifest,
      updatedAt: nowIso(clock),
    });
    await writeFile(manifestPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
  }

  function assertManifestForDefinition(manifest) {
    if (manifest && (manifest.runId !== definition.runId || manifest.expiresAt !== definition.expiresAt)) {
      throw new Error('Manifest does not match the exact fixture definition.');
    }
  }

  async function getAuthUser(uid) {
    try {
      return await auth.getUser(uid);
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async function checkForCollisions() {
    for (const identity of definition.identities) {
      const user = await getAuthUser(identity.uid);
      if (user && !markerMatches(user.customClaims, identity.customClaims)) throw collision('Auth user');
    }
    for (const document of definition.documents) {
      const existing = snapshotData(await firestore.get(document.path));
      if (existing && !markerMatches(existing, document.data)) throw collision('Firestore document');
    }
  }

  async function persistPartial(manifestPath, manifest) {
    return writeManifest(manifestPath, { ...manifest, state: 'partial' });
  }

  async function seed({ manifestPath, credentialPath } = {}) {
    if (typeof manifestPath !== 'string' || typeof credentialPath !== 'string') {
      throw new Error('manifestPath and credentialPath are required.');
    }
    assertOutsideRepository(credentialPath, repositoryRoot);
    const existingManifest = await readManifest(manifestPath);
    assertManifestForDefinition(existingManifest);
    await checkForCollisions();
    let manifest = existingManifest ? { ...existingManifest } : freshManifest();
    const passwords = new Map();

    try {
      for (const identity of definition.identities) {
        const existing = await getAuthUser(identity.uid);
        if (!existing) {
          const password = Buffer.from(randomBytes(24)).toString('base64url');
          passwords.set(identity.uid, password);
          await auth.createUser({
            uid: identity.uid,
            email: identity.email,
            displayName: identity.displayName,
            emailVerified: identity.emailVerified,
            disabled: false,
            password,
            customClaims: identity.customClaims,
          });
        } else {
          await auth.updateUser(identity.uid, {
            email: identity.email,
            displayName: identity.displayName,
            emailVerified: identity.emailVerified,
            disabled: false,
          });
          await auth.setCustomUserClaims(identity.uid, identity.customClaims);
        }
        if (!manifest.authUids.includes(identity.uid)) {
          manifest = await persistPartial(manifestPath, { ...manifest, authUids: [...manifest.authUids, identity.uid] });
        }
      }

      for (const document of definition.documents) {
        await firestore.set(document.path, document.data);
        if (!manifest.firestorePaths.includes(document.path)) {
          manifest = await persistPartial(manifestPath, { ...manifest, firestorePaths: [...manifest.firestorePaths, document.path] });
        }
      }

      try {
        await writeFile(credentialPath, credentialPayload(definition, passwords), { mode: 0o600, flag: 'wx' });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
      manifest = await writeManifest(manifestPath, { ...manifest, state: 'seeded' });
      baselineSeeded = true;
      return manifest;
    } catch (error) {
      await persistPartial(manifestPath, manifest);
      throw error;
    }
  }

  async function inspect({ manifestPath } = {}) {
    const manifest = await readManifest(manifestPath);
    if (!manifest) throw new Error('Fixture manifest does not exist.');
    assertManifestForDefinition(manifest);
    const problems = [];
    const aliases = new Set();
    for (const uid of manifest.authUids) {
      const identity = identityByUid.get(uid);
      const user = await getAuthUser(uid);
      if (!identity || !user || !markerMatches(user.customClaims, identity.customClaims)) problems.push('auth');
      else aliases.add(identity.alias);
    }
    for (const path of manifest.firestorePaths) {
      const document = documentByPath.get(path);
      const data = snapshotData(await firestore.get(path));
      if (!document || !data || !markerMatches(data, document.data)) {
        problems.push('firestore');
        continue;
      }
      if (document.kind === 'user') {
        const mayBeSuspended = document.alias === 'qa-suspended';
        if (data.role !== document.data.role || (data.accountStatus !== 'active' && !(mayBeSuspended && data.accountStatus === 'suspended'))) {
          problems.push('user-state');
        }
        const userMembers = definition.members.filter(member => member.userId === data.uid && manifest.firestorePaths.includes(member.path));
        for (const member of userMembers) {
          const membership = snapshotData(await firestore.get(member.path));
          const cached = data.teamMemberships?.[member.teamId];
          if (!membership || (membership.status === 'active' && (!cached || cached.role !== membership.role)) || (membership.status === 'removed' && cached !== undefined)) {
            problems.push('tenant-relation');
          }
        }
      }
      if (document.kind === 'member') {
        const mayBeRemoved = document.alias === 'qa-removed-member';
        if (data.role !== document.data.role || (data.status !== 'active' && !(mayBeRemoved && data.status === 'removed')) || data.teamId !== document.data.teamId) {
          problems.push('tenant-relation');
        }
      }
      if (identityByAlias.has(document.alias)) aliases.add(document.alias);
    }
    return {
      ok: problems.length === 0,
      aliases: [...aliases].sort(),
      counts: { auth: manifest.authUids.length, firestore: manifest.firestorePaths.length },
      states: { manifest: manifest.state, problems: problems.length },
      uidSuffixes: manifest.authUids.map(uid => uid.slice(`${definition.runId}-`.length)).sort(),
    };
  }

  async function applyNegativeState(alias) {
    if (!NEGATIVE_ALIASES.has(alias)) throw new Error('Negative lifecycle transitions are limited to suspended and removed fixture aliases.');
    if (!baselineSeeded) throw new Error('Negative lifecycle transition requires seeded baseline evidence.');
    const identity = identityByAlias.get(alias);
    const userPath = `users/${identity.uid}`;
    const userDocument = snapshotData(await firestore.get(userPath));
    const authUser = await getAuthUser(identity.uid);
    const expectedUser = documentByPath.get(userPath);
    if (
      !userDocument
      || !expectedUser
      || !markerMatches(userDocument, expectedUser.data)
      || userDocument.accountStatus !== 'active'
      || !authUser
      || !markerMatches(authUser.customClaims, identity.customClaims)
    ) {
      throw new Error('Negative lifecycle transition requires an active baseline.');
    }

    if (alias === 'qa-suspended') {
      await firestore.set(userPath, { ...userDocument, accountStatus: 'suspended' });
      await auth.revokeRefreshTokens(identity.uid);
      return { alias, state: 'suspended', uidSuffix: identity.uid.slice(`${definition.runId}-`.length) };
    }

    const member = definition.members.find(item => item.alias === alias);
    const memberDocument = snapshotData(await firestore.get(member.path));
    if (!memberDocument || !markerMatches(memberDocument, member) || memberDocument.status !== 'active') {
      throw new Error('Negative lifecycle transition requires an active membership baseline.');
    }
    const teamMemberships = { ...(userDocument.teamMemberships || {}) };
    delete teamMemberships[member.teamId];
    await firestore.set(member.path, { ...memberDocument, status: 'removed' });
    await firestore.set(userPath, { ...userDocument, teamMemberships, activeTeamId: null });
    await auth.revokeRefreshTokens(identity.uid);
    return { alias, state: 'removed', uidSuffix: identity.uid.slice(`${definition.runId}-`.length) };
  }

  async function cleanup({ manifestPath } = {}) {
    const manifest = await readManifest(manifestPath);
    if (!manifest) return { deleted: { auth: 0, firestore: 0 }, retained: [] };
    assertManifestForDefinition(manifest);
    const retained = [];
    let firestoreDeleted = 0;
    let authDeleted = 0;
    const paths = [...manifest.firestorePaths].sort((left, right) => right.split('/').length - left.split('/').length);
    for (const path of paths) {
      const document = documentByPath.get(path);
      const existing = snapshotData(await firestore.get(path));
      if (!existing) continue;
      if (!document || !markerMatches(existing, document.data)) {
        retained.push('firestore');
        continue;
      }
      await firestore.delete(path);
      firestoreDeleted += 1;
    }
    for (const uid of manifest.authUids) {
      const identity = identityByUid.get(uid);
      const existing = await getAuthUser(uid);
      if (!existing) continue;
      if (!identity || !markerMatches(existing.customClaims, identity.customClaims)) {
        retained.push('auth');
        continue;
      }
      await auth.deleteUser(uid);
      authDeleted += 1;
    }
    if (retained.length === 0) await writeManifest(manifestPath, { ...manifest, state: 'cleaned' });
    return { deleted: { auth: authDeleted, firestore: firestoreDeleted }, retained };
  }

  return { seed, inspect, cleanup, applyNegativeState };
}
