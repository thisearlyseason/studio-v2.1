import { link, lstat, open, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { STAGING_PROJECT_ID } from './guard.mjs';
import { assertExactFixtureJournal, assertManagedPath, assertManagedUid } from './manifest.mjs';

const NEGATIVE_ALIASES = new Set(['qa-suspended', 'qa-removed-member']);
const CREDENTIAL_CONFINEMENT_ERROR = 'Credential recovery required: credential path confinement changed.';

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

function confinementError() {
  return new Error(CREDENTIAL_CONFINEMENT_ERROR);
}

function statType(stats) {
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isBlockDevice()) return 'block-device';
  if (stats.isCharacterDevice()) return 'character-device';
  if (stats.isFIFO()) return 'fifo';
  if (stats.isSocket()) return 'socket';
  return 'other';
}

function statIdentity(stats) {
  return { device: stats.dev, inode: stats.ino, type: statType(stats) };
}

function identityMatches(stats, identity) {
  return stats.dev === identity.device && stats.ino === identity.inode && statType(stats) === identity.type;
}

function parentComponentPaths(target) {
  const paths = [];
  let current = dirname(target);
  while (true) {
    paths.unshift(current);
    const next = dirname(current);
    if (next === current) return paths;
    current = next;
  }
}

async function snapshotCredentialParents(target) {
  const parents = [];
  for (const path of parentComponentPaths(target)) {
    try {
      parents.push({ path, exists: true, identity: statIdentity(await lstat(path)) });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw confinementError();
      parents.push({ path, exists: false });
    }
  }
  return parents;
}

async function revalidateCredentialConfinement({ target, repositoryRoot, parents }) {
  try {
    for (const parent of parents) {
      let current;
      try {
        current = await lstat(parent.path);
      } catch (error) {
        if (error?.code === 'ENOENT' && !parent.exists) continue;
        throw error;
      }
      if (!parent.exists || !identityMatches(current, parent.identity)) throw confinementError();
    }
    await resolveExternalCredentialPath(target, repositoryRoot);
  } catch {
    throw confinementError();
  }
}

function assertOwnedCredentialFile(stats, identity, expectedSize) {
  if (
    !stats.isFile()
    || !identityMatches(stats, identity)
    || (stats.mode & 0o777) !== 0o600
    || (expectedSize !== undefined && stats.size !== expectedSize)
  ) {
    throw confinementError();
  }
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
  const confinement = {
    target,
    repositoryRoot,
    parents: await snapshotCredentialParents(target),
  };
  let file;
  try {
    file = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return { target, passwords: null, confinement };
    throw error;
  }
  if (!file.isFile() || file.isSymbolicLink() || (file.mode & 0o777) !== 0o600) {
    throw new Error('Credential recovery required: existing credential file must be a regular 0600 file.');
  }
  return { target, passwords: parseCredentialPayload(await readFile(target, 'utf8'), definition), confinement };
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

export function createLifecycle({ auth, firestore, clock = () => new Date(), randomBytes, definition, repositoryRoot = process.cwd(), manifestPath: configuredManifestPath, logger = () => {}, faultInjector = () => {}, linkFile = link, openCredentialFile = open, unlinkFile = unlink } = {}) {
  if (!auth || !firestore) throw new Error('Auth and Firestore adapters are required.');
  if (typeof randomBytes !== 'function') throw new Error('randomBytes must be injected.');
  if (typeof logger !== 'function') throw new Error('logger must be a function.');
  if (typeof faultInjector !== 'function') throw new Error('faultInjector must be a function.');
  if (typeof linkFile !== 'function' || typeof openCredentialFile !== 'function' || typeof unlinkFile !== 'function') {
    throw new Error('Credential publication file operations must be functions.');
  }
  assertDefinition(definition);

  const identityByUid = new Map(definition.identities.map(identity => [identity.uid, identity]));
  const identityByAlias = new Map(definition.identities.map(identity => [identity.alias, identity]));
  const documentByPath = new Map(definition.documents.map(document => [document.path, document]));
  const ownershipProofByUid = new Map(definition.documents
    .filter(document => document.kind === 'auth-ownership')
    .map(document => [document.uid, document]));
  let lastSeededManifestPath = null;
  let manifestWriteSequence = 0;
  let credentialWriteSequence = 0;

  function injectFault(stage, details = {}) {
    return faultInjector(stage, { runId: definition.runId, ...details });
  }

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
      version: 2,
      runId: definition.runId,
      projectId: STAGING_PROJECT_ID,
      authUids: definition.identities.map(identity => identity.uid),
      firestorePaths: definition.documents.map(document => document.path),
      state,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: definition.expiresAt,
      transitions: {
        'qa-suspended': { version: 1, state: 'active' },
        'qa-removed-member': { version: 1, state: 'active' },
      },
    };
  }

  async function readManifest(manifestPath) {
    try {
      return assertExactFixtureJournal(JSON.parse(await readFile(manifestPath, 'utf8')), definition);
    } catch (error) {
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
  }

  async function writeManifest(manifestPath, manifest) {
    const normalized = assertExactFixtureJournal({
      ...manifest,
      updatedAt: nowIso(clock),
    }, definition);
    const tempPath = join(dirname(manifestPath), `.${basename(manifestPath)}.${process.pid}-${++manifestWriteSequence}.tmp`);
    try {
      await writeFile(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await injectFault('manifest.beforeRename', { manifestPath, state: normalized.state });
      await rename(tempPath, manifestPath);
    } finally {
      await unlink(tempPath).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
    return normalized;
  }

  async function publishCredentials(target, payload, confinement) {
    const tempPath = join(dirname(target), `.${basename(target)}.${process.pid}-${++credentialWriteSequence}.tmp`);
    const expectedSize = Buffer.byteLength(payload, 'utf8');
    let handle = null;
    let ownedIdentity = null;
    try {
      await injectFault('credentials.beforeTempCreate');
      await revalidateCredentialConfinement(confinement);
      try {
        handle = await openCredentialFile(tempPath, 'wx', 0o600);
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error('Credential recovery required: private temporary credential already exists.');
        }
        throw new Error('Credential recovery required: private temporary credential creation failed.');
      }
      const initialStats = await handle.stat().catch(() => { throw confinementError(); });
      if (!initialStats.isFile() || initialStats.size !== 0) throw confinementError();
      ownedIdentity = statIdentity(initialStats);
      await revalidateCredentialConfinement(confinement);
      assertOwnedCredentialFile(await handle.stat().catch(() => { throw confinementError(); }), ownedIdentity, 0);
      assertOwnedCredentialFile(await lstat(tempPath).catch(() => { throw confinementError(); }), ownedIdentity, 0);
      try {
        await handle.writeFile(payload, { encoding: 'utf8' });
        await handle.sync();
      } catch {
        throw new Error('Credential recovery required: private temporary credential write failed.');
      }
      assertOwnedCredentialFile(await handle.stat().catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      assertOwnedCredentialFile(await lstat(tempPath).catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      await injectFault('credentials.beforePublish');
      await revalidateCredentialConfinement(confinement);
      assertOwnedCredentialFile(await handle.stat().catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      assertOwnedCredentialFile(await lstat(tempPath).catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      try {
        await linkFile(tempPath, target);
      } catch (error) {
        if (error?.code === 'EEXIST') throw new Error('Credential recovery required: credential target appeared during seed.');
        if (new Set(['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV']).has(error?.code)) {
          throw new Error('Credential recovery required: atomic hard-link publication is unavailable on the target filesystem.');
        }
        throw new Error('Credential recovery required: atomic credential publication failed.');
      }
      await injectFault('credentials.afterPublish');
      await revalidateCredentialConfinement(confinement);
      assertOwnedCredentialFile(await handle.stat().catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      assertOwnedCredentialFile(await lstat(tempPath).catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
      assertOwnedCredentialFile(await lstat(target).catch(() => { throw confinementError(); }), ownedIdentity, expectedSize);
    } finally {
      let descriptorOwned = false;
      if (handle && ownedIdentity) {
        try {
          descriptorOwned = identityMatches(await handle.stat(), ownedIdentity);
        } catch {
          descriptorOwned = false;
        }
      }
      if (handle) {
        await handle.close().catch(() => {
          throw new Error('Credential recovery required: private temporary credential cleanup failed.');
        });
      }
      if (ownedIdentity && descriptorOwned) {
        let pathStats = null;
        try {
          pathStats = await lstat(tempPath);
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            throw new Error('Credential recovery required: private temporary credential cleanup failed.');
          }
        }
        if (pathStats) {
          if (!identityMatches(pathStats, ownedIdentity)) throw confinementError();
          await unlinkFile(tempPath).catch(error => {
            if (error?.code !== 'ENOENT') {
              throw new Error('Credential recovery required: private temporary credential cleanup failed.');
            }
          });
        }
      }
    }
  }

  function assertManifestForDefinition(manifest) {
    if (manifest && (manifest.runId !== definition.runId || manifest.expiresAt !== definition.expiresAt)) {
      throw new Error('Manifest does not match the exact fixture definition.');
    }
  }

  function assertReseedableManifest(manifest) {
    if (!manifest) return;
    const transitionStarted = Object.values(manifest.transitions).some(transition => transition.state !== 'active');
    if (manifest.state === 'cleaned' || transitionStarted) {
      throw new Error('Re-seed requires cleanup and a new run after a negative transition or completed cleanup.');
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

  async function persistOwnershipProof(identity, manifestPath, manifest) {
    const proof = ownershipProofByUid.get(identity.uid);
    if (!proof || proof.uid !== identity.uid) throw new Error('Fixture definition is missing an exact Auth ownership proof.');
    const nextManifest = manifest;
    if (!nextManifest.firestorePaths.includes(proof.path)) throw new Error('Manifest is missing its pre-journaled ownership proof.');
    await firestore.set(proof.path, proof.data);
    return nextManifest;
  }

  async function hasExactOwnershipProof(identity, manifest) {
    const proof = ownershipProofByUid.get(identity.uid);
    if (!proof || !manifest.firestorePaths.includes(proof.path)) return false;
    const data = snapshotData(await firestore.get(proof.path));
    return Boolean(data && data.uid === identity.uid && markerMatches(data, proof.data));
  }

  async function seed({ manifestPath, credentialPath } = {}) {
    if (typeof manifestPath !== 'string' || typeof credentialPath !== 'string') {
      throw new Error('manifestPath and credentialPath are required.');
    }
    const existingManifest = await readManifest(manifestPath);
    assertManifestForDefinition(existingManifest);
    if (existingManifest) {
      assertReseedableManifest(existingManifest);
    }
    const credentials = await readExistingCredentials(credentialPath, repositoryRoot, definition);
    const existingAuth = await checkForCollisions();
    if (!credentials.passwords && existingAuth.size > 0) {
      throw new Error('Credential recovery required: marked Auth users already exist without an exact-run credential file.');
    }
    let manifest = existingManifest ? { ...existingManifest } : await writeManifest(manifestPath, freshManifest());
    const passwords = credentials.passwords || new Map(definition.identities.map(identity => [
      identity.uid,
      Buffer.from(randomBytes(24)).toString('base64url'),
    ]));

    try {
      manifest = await persistPartial(manifestPath, manifest);
      for (const identity of definition.identities) {
        const existing = await getAuthUser(identity.uid);
        if (!existing) {
          manifest = await persistOwnershipProof(identity, manifestPath, manifest);
          await auth.createUser({
            uid: identity.uid,
            email: identity.email,
            displayName: identity.displayName,
            emailVerified: identity.emailVerified,
            disabled: false,
            password: passwords.get(identity.uid),
          });
          await injectFault(`seed.${identity.alias}.afterAuthCreate`, { alias: identity.alias });
          await auth.setCustomUserClaims(identity.uid, identity.customClaims);
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
      }

      for (const document of definition.documents) {
        await firestore.set(document.path, document.data);
        await injectFault(`seed.${document.kind}.afterFirestore`, { alias: document.alias });
      }

      if (!credentials.passwords) {
        await publishCredentials(credentials.target, credentialPayload(definition, passwords), credentials.confinement);
      }
      manifest = await writeManifest(manifestPath, { ...manifest, state: 'seeded' });
      lastSeededManifestPath = manifestPath;
      emit('seeded', manifest);
      return manifest;
    } catch (error) {
      try {
        manifest = await persistPartial(manifestPath, manifest);
      } catch {
        // Atomic persistence keeps the previous complete manifest recoverable.
      }
      throw error;
    }
  }

  async function inspect({ manifestPath } = {}) {
    const manifest = await readManifest(manifestPath);
    if (!manifest) throw new Error('Fixture manifest does not exist.');
    assertManifestForDefinition(manifest);
    const drift = [];
    const aliases = new Set();
    let authPresent = 0;
    let firestorePresent = 0;
    const cleaned = manifest.state === 'cleaned';
    const recordDrift = (kind, alias, field, reason) => drift.push({ kind, alias, field, reason });
    for (const uid of manifest.authUids) {
      const identity = identityByUid.get(uid);
      const user = await getAuthUser(uid);
      if (user) authPresent += 1;
      if (cleaned) {
        if (user) recordDrift('auth', identity?.alias || 'unknown', 'presence', 'unexpected-after-cleanup');
        continue;
      }
      if (!identity) {
        recordDrift('auth', 'unknown', 'uid', 'not-in-definition');
        continue;
      }
      if (!user) {
        recordDrift('auth', identity.alias, 'presence', 'missing');
        continue;
      }
      const expectedFields = {
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        emailVerified: identity.emailVerified,
        disabled: false,
        customClaims: identity.customClaims,
      };
      for (const [field, expected] of Object.entries(expectedFields)) {
        if (!isDeepStrictEqual(user[field], expected)) recordDrift('auth', identity.alias, field, 'mismatch');
      }
      if (!drift.some(item => item.kind === 'auth' && item.alias === identity.alias)) aliases.add(identity.alias);
    }
    for (const path of manifest.firestorePaths) {
      const document = documentByPath.get(path);
      const data = snapshotData(await firestore.get(path));
      if (data) firestorePresent += 1;
      if (cleaned) {
        if (data) recordDrift('firestore', document?.alias || 'unknown', 'presence', 'unexpected-after-cleanup');
        continue;
      }
      if (!document) {
        recordDrift('firestore', 'unknown', 'path', 'not-in-definition');
        continue;
      }
      if (!data) {
        const transition = manifest.transitions[document.alias];
        const allowedRemovedCache = document.kind === 'membership-cache'
          && document.alias === 'qa-removed-member'
          && ['applying', 'removed'].includes(transition?.state)
          && Boolean(transition?.startedAt);
        if (!allowedRemovedCache) recordDrift('firestore', document.alias, 'presence', 'missing');
        continue;
      }
      if (
        document.kind === 'membership-cache'
        && document.alias === 'qa-removed-member'
        && (manifest.transitions[document.alias]?.state === 'removed' || manifest.transitions[document.alias]?.cacheDeletedAt)
      ) {
        recordDrift('firestore', document.alias, 'presence', 'unexpected-after-transition');
        continue;
      }
      const expected = { ...document.data };
      const transition = manifest.transitions[document.alias];
      if (document.kind === 'user' && document.alias === 'qa-suspended' && (transition?.state === 'suspended' || transition?.firestoreUpdatedAt)) {
        expected.accountStatus = 'suspended';
      }
      if (document.kind === 'member' && document.alias === 'qa-removed-member' && (transition?.state === 'removed' || transition?.firestoreUpdatedAt)) {
        expected.status = 'removed';
      }
      const expectedFields = new Set(Object.keys(expected));
      for (const [field, expectedValue] of Object.entries(expected)) {
        const ambiguousSuspendedState = document.kind === 'user'
          && document.alias === 'qa-suspended'
          && field === 'accountStatus'
          && transition?.state === 'applying'
          && !transition.firestoreUpdatedAt
          && ['active', 'suspended'].includes(data[field]);
        const ambiguousRemovedState = document.kind === 'member'
          && document.alias === 'qa-removed-member'
          && field === 'status'
          && transition?.state === 'applying'
          && !transition.firestoreUpdatedAt
          && ['active', 'removed'].includes(data[field]);
        if (!ambiguousSuspendedState && !ambiguousRemovedState && !isDeepStrictEqual(data[field], expectedValue)) {
          recordDrift('firestore', document.alias, field, 'mismatch');
        }
      }
      if (Object.keys(data).some(field => !expectedFields.has(field))) {
        recordDrift('firestore', document.alias, 'shape', 'unexpected-fields');
      }
      if (identityByAlias.has(document.alias)) aliases.add(document.alias);
    }
    return {
      ok: drift.length === 0,
      aliases: [...aliases].sort(),
      counts: {
        expected: { auth: manifest.authUids.length, firestore: manifest.firestorePaths.length },
        actualPresent: { auth: authPresent, firestore: firestorePresent },
      },
      states: { manifest: manifest.state, problems: drift.length },
      drift,
      uidSuffixes: manifest.authUids.map(uid => uid.slice(`${definition.runId}-`.length)).sort(),
    };
  }

  async function applyNegativeState(alias) {
    if (!NEGATIVE_ALIASES.has(alias)) throw new Error('Negative lifecycle transitions are limited to suspended and removed fixture aliases.');
    const manifestPath = configuredManifestPath || lastSeededManifestPath;
    if (!manifestPath) throw new Error('Negative lifecycle transition requires a persistent seeded baseline manifest.');
    let manifest = await readManifest(manifestPath);
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
    const finalState = alias === 'qa-suspended' ? 'suspended' : 'removed';
    const priorTransition = manifest.transitions[alias];
    const resumed = priorTransition?.state === 'applying';
    const userPath = `users/${identity.uid}`;
    const userDocument = snapshotData(await firestore.get(userPath));
    const authUser = await getAuthUser(identity.uid);
    const expectedUser = documentByPath.get(userPath);
    if (
      !userDocument
      || !expectedUser
      || !markerMatches(userDocument, expectedUser.data)
      || !authUser
      || !authClaimsMatch(authUser.customClaims, identity.customClaims)
    ) {
      throw new Error('Negative lifecycle transition requires an active baseline.');
    }

    const checkpoint = async transition => {
      manifest = await writeManifest(manifestPath, {
        ...manifest,
        transitions: { ...manifest.transitions, [alias]: transition },
      });
      return manifest.transitions[alias];
    };

    if (priorTransition?.state === finalState) {
      const finalMember = alias === 'qa-removed-member' ? definition.members.find(item => item.alias === alias) : null;
      const finalRemoteState = alias === 'qa-suspended'
        ? userDocument.accountStatus === 'suspended'
        : snapshotData(await firestore.get(finalMember.path))?.status === 'removed'
          && !snapshotData(await firestore.get(finalMember.membershipPath));
      if (!finalRemoteState) throw new Error('Completed negative transition has drifted from its persisted state.');
      return { alias, state: finalState, resumed: true, uidSuffix: identity.uid.slice(`${definition.runId}-`.length) };
    }

    if (!priorTransition || !['active', 'applying'].includes(priorTransition.state)) {
      throw new Error('Negative lifecycle transition manifest state is invalid.');
    }
    let transition = priorTransition.state === 'active'
      ? await checkpoint({ version: 1, state: 'applying', startedAt: nowIso(clock) })
      : priorTransition;

    if (alias === 'qa-suspended') {
      const allowedAccountStates = priorTransition.state === 'active' ? ['active'] : ['active', 'suspended'];
      if (!allowedAccountStates.includes(userDocument.accountStatus)) throw new Error('Negative lifecycle transition requires an active or resumable suspended state.');
      if (userDocument.accountStatus === 'active') {
        await firestore.set(userPath, { ...userDocument, accountStatus: 'suspended' });
        await injectFault('transition.qa-suspended.afterFirestore', { alias });
      }
      if (!transition.firestoreUpdatedAt) transition = await checkpoint({ ...transition, firestoreUpdatedAt: nowIso(clock) });
      await auth.revokeRefreshTokens(identity.uid);
      await injectFault('transition.qa-suspended.afterRevoke', { alias });
      transition = await checkpoint({ ...transition, revokedAt: nowIso(clock) });
      transition = await checkpoint({ ...transition, state: 'suspended', completedAt: nowIso(clock) });
      return { alias, state: 'suspended', resumed, uidSuffix: identity.uid.slice(`${definition.runId}-`.length) };
    }

    const member = definition.members.find(item => item.alias === alias);
    const memberDocument = snapshotData(await firestore.get(member.path));
    const membershipDocument = snapshotData(await firestore.get(member.membershipPath));
    const allowedMemberStates = priorTransition.state === 'active' ? ['active'] : ['active', 'removed'];
    if (!memberDocument || !markerMatches(memberDocument, member) || !allowedMemberStates.includes(memberDocument.status)) {
      throw new Error('Negative lifecycle transition requires an active membership baseline.');
    }
    const expectedMembership = documentByPath.get(member.membershipPath);
    if (
      !expectedMembership
      || (priorTransition.state === 'active' && !membershipDocument)
      || (membershipDocument && (!markerMatches(membershipDocument, expectedMembership.data) || membershipDocument.status !== 'active'))
    ) {
      throw new Error('Negative lifecycle transition requires an active membership-cache baseline.');
    }
    if (memberDocument.status === 'active') {
      await firestore.set(member.path, { ...memberDocument, status: 'removed' });
      await injectFault('transition.qa-removed-member.afterFirestore', { alias });
    }
    if (!transition.firestoreUpdatedAt) transition = await checkpoint({ ...transition, firestoreUpdatedAt: nowIso(clock) });
    if (membershipDocument) {
      await firestore.delete(member.membershipPath);
      await injectFault('transition.qa-removed-member.afterCacheDelete', { alias });
    }
    if (!transition.cacheDeletedAt) transition = await checkpoint({ ...transition, cacheDeletedAt: nowIso(clock) });
    await auth.revokeRefreshTokens(identity.uid);
    await injectFault('transition.qa-removed-member.afterRevoke', { alias });
    transition = await checkpoint({ ...transition, revokedAt: nowIso(clock) });
    transition = await checkpoint({ ...transition, state: 'removed', completedAt: nowIso(clock) });
    return { alias, state: 'removed', resumed, uidSuffix: identity.uid.slice(`${definition.runId}-`.length) };
  }

  async function cleanup({ manifestPath } = {}) {
    const retainedAliases = { auth: new Set(), firestore: new Set() };
    const failureAliases = { auth: new Set(), firestore: new Set() };
    const aliasSummary = aliases => ({ count: aliases.size, aliases: [...aliases].sort() });
    const result = (deleted = { auth: 0, firestore: 0 }) => {
      const retained = Object.entries(retainedAliases)
        .filter(([, aliases]) => aliases.size > 0)
        .map(([kind]) => kind);
      const failures = Object.values(failureAliases).reduce((count, aliases) => count + aliases.size, 0);
      return {
        ok: retained.length === 0 && failures === 0,
        deleted,
        retained,
        followUp: {
          retained: {
            auth: aliasSummary(retainedAliases.auth),
            firestore: aliasSummary(retainedAliases.firestore),
          },
          failures: {
            auth: aliasSummary(failureAliases.auth),
            firestore: aliasSummary(failureAliases.firestore),
          },
        },
      };
    };
    const manifest = await readManifest(manifestPath);
    if (!manifest) return result();
    assertManifestForDefinition(manifest);
    let firestoreDeleted = 0;
    let authDeleted = 0;
    const ownershipPaths = new Set([...ownershipProofByUid.values()].map(proof => proof.path));
    const paths = manifest.firestorePaths
      .filter(path => !ownershipPaths.has(path))
      .sort((left, right) => right.split('/').length - left.split('/').length);
    for (const path of paths) {
      const document = documentByPath.get(path);
      const alias = document?.alias || 'unknown';
      let existing;
      try {
        existing = snapshotData(await firestore.get(path));
      } catch {
        failureAliases.firestore.add(alias);
        continue;
      }
      if (!existing) continue;
      if (!document || !markerMatches(existing, document.data)) {
        retainedAliases.firestore.add(alias);
        continue;
      }
      try {
        await firestore.delete(path);
        firestoreDeleted += 1;
      } catch {
        failureAliases.firestore.add(alias);
      }
    }
    const authRemovedOrAbsent = new Set();
    for (const uid of manifest.authUids) {
      const identity = identityByUid.get(uid);
      const alias = identity?.alias || 'unknown';
      let existing;
      try {
        existing = await getAuthUser(uid);
      } catch {
        failureAliases.auth.add(alias);
        continue;
      }
      if (!existing) {
        authRemovedOrAbsent.add(uid);
        continue;
      }
      let mayRemoveFreshUnclaimedUser = false;
      if (manifest.state === 'partial' && existing.uid === uid && !existing.customClaims?.qaFixture && identity) {
        try {
          mayRemoveFreshUnclaimedUser = await hasExactOwnershipProof(identity, manifest);
        } catch {
          failureAliases.firestore.add(alias);
          retainedAliases.auth.add(alias);
          continue;
        }
      }
      if (!identity || (!markerMatches(existing.customClaims, identity.customClaims) && !mayRemoveFreshUnclaimedUser)) {
        retainedAliases.auth.add(alias);
        continue;
      }
      try {
        await auth.deleteUser(uid);
        authDeleted += 1;
        authRemovedOrAbsent.add(uid);
      } catch {
        failureAliases.auth.add(alias);
      }
    }
    for (const proof of ownershipProofByUid.values()) {
      if (!manifest.firestorePaths.includes(proof.path)) continue;
      if (!authRemovedOrAbsent.has(proof.uid)) {
        retainedAliases.firestore.add(proof.alias);
        continue;
      }
      let existing;
      try {
        existing = snapshotData(await firestore.get(proof.path));
      } catch {
        failureAliases.firestore.add(proof.alias);
        continue;
      }
      if (!existing) continue;
      if (existing.uid !== proof.uid || !markerMatches(existing, proof.data)) {
        retainedAliases.firestore.add(proof.alias);
        continue;
      }
      try {
        await firestore.delete(proof.path);
        firestoreDeleted += 1;
      } catch {
        failureAliases.firestore.add(proof.alias);
      }
    }
    const cleanupResult = result({ auth: authDeleted, firestore: firestoreDeleted });
    if (cleanupResult.ok) await writeManifest(manifestPath, { ...manifest, state: 'cleaned' });
    return cleanupResult;
  }

  return { seed, inspect, cleanup, applyNegativeState };
}
