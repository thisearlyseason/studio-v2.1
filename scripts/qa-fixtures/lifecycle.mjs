import { lstat, readFile, realpath, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

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

function authClaimsMatch(actual, expected) {
  return markerMatches(actual, expected) && actual?.role === expected.role;
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

async function resolveExternalCredentialPath(path, repositoryRoot) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Credential path must be an absolute path.');
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) throw new Error('repositoryRoot must be an absolute path.');
  const target = resolve(path);
  const root = await realpath(resolve(repositoryRoot));
  let parent = dirname(target);
  let suffix = basename(target);
  let resolvedParent;
  while (!resolvedParent) {
    try {
      resolvedParent = await realpath(parent);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const next = dirname(parent);
      if (next === parent) throw new Error('Credential path parent must exist.');
      suffix = join(basename(parent), suffix);
      parent = next;
    }
  }
  const physicalTarget = join(resolvedParent, suffix);
  const fromRoot = relative(root, physicalTarget);
  if (fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot))) {
    throw new Error('Credential path must be outside the repository.');
  }
  return target;
}

/** Remove one externally-stored credential file. Browser orchestration owns when it calls this. */
export async function removeCredentialFile(path, repositoryRoot) {
  const target = await resolveExternalCredentialPath(path, repositoryRoot);
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

function parseCredentialPayload(text, definition) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Credential recovery required: existing credential file is invalid.');
  }
  if (!payload || payload.version !== 1 || payload.runId !== definition.runId || !Array.isArray(payload.identities)) {
    throw new Error('Credential recovery required: existing credential file is for a different run.');
  }
  const credentials = new Map();
  for (const item of payload.identities) {
    if (!item || typeof item.alias !== 'string' || typeof item.email !== 'string' || typeof item.password !== 'string' || item.password.length === 0) {
      throw new Error('Credential recovery required: existing credential file is incomplete.');
    }
    credentials.set(item.alias, item);
  }
  if (
    credentials.size !== definition.identities.length
    || definition.identities.some(identity => credentials.get(identity.alias)?.email !== identity.email)
  ) {
    throw new Error('Credential recovery required: existing credential file does not contain the exact fixture identities.');
  }
  return new Map(definition.identities.map(identity => [identity.uid, credentials.get(identity.alias).password]));
}

async function readExistingCredentials(path, repositoryRoot, definition) {
  const target = await resolveExternalCredentialPath(path, repositoryRoot);
  let file;
  try {
    file = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return { target, passwords: null };
    throw error;
  }
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== 0o600) {
    throw new Error('Credential recovery required: existing credential file must be a regular 0600 file.');
  }
  return { target, passwords: parseCredentialPayload(await readFile(target, 'utf8'), definition) };
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

export function createLifecycle({ auth, firestore, clock = () => new Date(), randomBytes, definition, repositoryRoot = process.cwd(), manifestPath: configuredManifestPath, logger = () => {} } = {}) {
  if (!auth || !firestore) throw new Error('Auth and Firestore adapters are required.');
  if (typeof randomBytes !== 'function') throw new Error('randomBytes must be injected.');
  if (typeof logger !== 'function') throw new Error('logger must be a function.');
  assertDefinition(definition);

  const identityByUid = new Map(definition.identities.map(identity => [identity.uid, identity]));
  const identityByAlias = new Map(definition.identities.map(identity => [identity.alias, identity]));
  const documentByPath = new Map(definition.documents.map(document => [document.path, document]));
  let lastSeededManifestPath = null;

  function emit(event, manifest) {
    try {
      void Promise.resolve(logger({
        event,
        runId: definition.runId,
        aliases: definition.identities.map(identity => identity.alias),
        counts: { auth: manifest.authUids.length, firestore: manifest.firestorePaths.length },
        uidSuffixes: manifest.authUids.map(uid => uid.slice(`${definition.runId}-`.length)).sort(),
      })).catch(() => {});
    } catch {
      // Lifecycle logging is diagnostic only and must never change persisted state.
    }
  }

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
    const existingAuth = new Map();
    for (const identity of definition.identities) {
      const user = await getAuthUser(identity.uid);
      if (user && !authClaimsMatch(user.customClaims, identity.customClaims)) throw collision('Auth user');
      if (user) existingAuth.set(identity.uid, user);
    }
    for (const document of definition.documents) {
      const existing = snapshotData(await firestore.get(document.path));
      if (existing && !markerMatches(existing, document.data)) throw collision('Firestore document');
    }
    return existingAuth;
  }

  async function persistPartial(manifestPath, manifest) {
    return writeManifest(manifestPath, { ...manifest, state: 'partial' });
  }

  async function seed({ manifestPath, credentialPath } = {}) {
    if (typeof manifestPath !== 'string' || typeof credentialPath !== 'string') {
      throw new Error('manifestPath and credentialPath are required.');
    }
    const existingManifest = await readManifest(manifestPath);
    assertManifestForDefinition(existingManifest);
    const credentials = await readExistingCredentials(credentialPath, repositoryRoot, definition);
    const existingAuth = await checkForCollisions();
    if (!credentials.passwords && existingAuth.size > 0) {
      throw new Error('Credential recovery required: marked Auth users already exist without an exact-run credential file.');
    }
    let manifest = existingManifest ? { ...existingManifest } : freshManifest();
    const passwords = credentials.passwords || new Map(definition.identities.map(identity => [
      identity.uid,
      Buffer.from(randomBytes(24)).toString('base64url'),
    ]));

    try {
      for (const identity of definition.identities) {
        const existing = await getAuthUser(identity.uid);
        if (!existing) {
          await auth.createUser({
            uid: identity.uid,
            email: identity.email,
            displayName: identity.displayName,
            emailVerified: identity.emailVerified,
            disabled: false,
            password: passwords.get(identity.uid),
            customClaims: identity.customClaims,
          });
        } else {
          await auth.updateUser(identity.uid, {
            email: identity.email,
            displayName: identity.displayName,
            emailVerified: identity.emailVerified,
            disabled: false,
            ...(credentials.passwords ? { password: passwords.get(identity.uid) } : {}),
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

      if (!credentials.passwords) {
        try {
          await writeFile(credentials.target, credentialPayload(definition, passwords), { mode: 0o600, flag: 'wx' });
        } catch (error) {
          if (error?.code === 'EEXIST') throw new Error('Credential recovery required: credential target appeared during seed.');
          throw error;
        }
      }
      manifest = await writeManifest(manifestPath, { ...manifest, state: 'seeded' });
      lastSeededManifestPath = manifestPath;
      emit('seeded', manifest);
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
      if (!identity || !user || !authClaimsMatch(user.customClaims, identity.customClaims)) problems.push('auth');
      else aliases.add(identity.alias);
    }
    for (const path of manifest.firestorePaths) {
      const document = documentByPath.get(path);
      const data = snapshotData(await firestore.get(path));
      if (!document) {
        problems.push('firestore');
        continue;
      }
      if (!data) {
        const member = definition.members.find(item => item.membershipPath === path);
        const directMember = member ? snapshotData(await firestore.get(member.path)) : null;
        if (document.kind === 'membership-cache' && member?.alias === 'qa-removed-member' && directMember?.status === 'removed') continue;
        problems.push('firestore');
        continue;
      }
      if (!markerMatches(data, document.data)) {
        problems.push('firestore');
        continue;
      }
      if (document.kind === 'user') {
        const mayBeSuspended = document.alias === 'qa-suspended';
        if (data.role !== document.data.role || (data.accountStatus !== 'active' && !(mayBeSuspended && data.accountStatus === 'suspended'))) {
          problems.push('user-state');
        }
      }
      if (document.kind === 'member') {
        const mayBeRemoved = document.alias === 'qa-removed-member';
        if (data.id !== data.userId || data.id !== document.data.userId || data.role !== document.data.role || (data.status !== 'active' && !(mayBeRemoved && data.status === 'removed')) || data.teamId !== document.data.teamId) {
          problems.push('tenant-relation');
        }
      }
      if (document.kind === 'membership-cache') {
        const member = definition.members.find(item => item.membershipPath === path);
        const directMember = member ? snapshotData(await firestore.get(member.path)) : null;
        if (!member || !directMember || directMember.status !== 'active' || data.teamId !== member.teamId || data.userId !== member.userId || data.role !== directMember.role || data.status !== directMember.status) {
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
    const manifestPath = configuredManifestPath || lastSeededManifestPath;
    if (!manifestPath) throw new Error('Negative lifecycle transition requires a persistent seeded baseline manifest.');
    const manifest = await readManifest(manifestPath);
    if (
      !manifest
      || manifest.state !== 'seeded'
      || manifest.authUids.length !== definition.identities.length
      || manifest.firestorePaths.length !== definition.documents.length
      || definition.identities.some(identity => !manifest.authUids.includes(identity.uid))
      || definition.documents.some(document => !manifest.firestorePaths.includes(document.path))
    ) {
      throw new Error('Negative lifecycle transition requires persistent seeded baseline evidence.');
    }
    assertManifestForDefinition(manifest);
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
      || !authClaimsMatch(authUser.customClaims, identity.customClaims)
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
    const membershipDocument = snapshotData(await firestore.get(member.membershipPath));
    if (!memberDocument || !markerMatches(memberDocument, member) || memberDocument.status !== 'active') {
      throw new Error('Negative lifecycle transition requires an active membership baseline.');
    }
    const expectedMembership = documentByPath.get(member.membershipPath);
    if (!membershipDocument || !expectedMembership || !markerMatches(membershipDocument, expectedMembership.data) || membershipDocument.status !== 'active') {
      throw new Error('Negative lifecycle transition requires an active membership-cache baseline.');
    }
    await firestore.set(member.path, { ...memberDocument, status: 'removed' });
    await firestore.delete(member.membershipPath);
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
