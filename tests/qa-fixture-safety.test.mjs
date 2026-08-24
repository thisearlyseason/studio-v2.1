import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MANAGED_PREFIX,
  STAGING_PROJECT_ID,
  assertHostedStagingIntent,
} from '../scripts/qa-fixtures/guard.mjs';
import {
  assertManagedPath,
  assertManagedUid,
  createRunId,
  validateManifest,
} from '../scripts/qa-fixtures/manifest.mjs';
import { buildFixtureDefinition } from '../scripts/qa-fixtures/definition.mjs';
import { createLifecycle, removeCredentialFile } from '../scripts/qa-fixtures/lifecycle.mjs';
import { chmod, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING = STAGING_PROJECT_ID;
const RUN_ID = 'qa-phase7-20260824T140000Z-ab12';
const EXPIRES_AT = '2026-08-31T14:00:00.000Z';

class FakeAuth {
  constructor() {
    this.users = new Map();
    this.deleted = [];
    this.revoked = [];
    this.failSetCustomClaimsFor = null;
  }

  async getUser(uid) {
    const user = this.users.get(uid);
    if (!user) {
      const error = new Error('User not found');
      error.code = 'auth/user-not-found';
      throw error;
    }
    return structuredClone(user);
  }

  async createUser(input) {
    if (this.users.has(input.uid)) throw new Error('duplicate auth user');
    const user = { ...input, customClaims: structuredClone(input.customClaims || {}) };
    this.users.set(input.uid, user);
    return structuredClone(user);
  }

  async updateUser(uid, input) {
    const user = this.users.get(uid);
    if (!user) throw new Error('User not found');
    this.users.set(uid, { ...user, ...input });
    return this.getUser(uid);
  }

  async setCustomUserClaims(uid, customClaims) {
    if (uid === this.failSetCustomClaimsFor) throw new Error('simulated custom-claim write failure');
    const user = this.users.get(uid);
    if (!user) throw new Error('User not found');
    this.users.set(uid, { ...user, customClaims: structuredClone(customClaims) });
  }

  async revokeRefreshTokens(uid) {
    this.revoked.push(uid);
  }

  async deleteUser(uid) {
    this.deleted.push(uid);
    this.users.delete(uid);
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.deleted = [];
    this.failPath = null;
  }

  inject(path, data) {
    this.documents.set(path, structuredClone(data));
  }

  has(path) {
    return this.documents.has(path);
  }

  async get(path) {
    const data = this.documents.get(path);
    return data === undefined ? null : structuredClone(data);
  }

  async set(path, data) {
    if (path === this.failPath) throw new Error('simulated Firestore write failure');
    this.documents.set(path, structuredClone(data));
  }

  async delete(path) {
    this.deleted.push(path);
    this.documents.delete(path);
  }
}

async function lifecycleFixture(t, runId = RUN_ID) {
  const directory = await mkdtemp(join(tmpdir(), 'qa-fixture-lifecycle-'));
  t.after(async () => {
    await removeCredentialFile(join(directory, 'credentials.json'), process.cwd());
  });
  const definition = buildFixtureDefinition({ runId, expiresAt: EXPIRES_AT });
  const auth = new FakeAuth();
  const firestore = new FakeFirestore();
  const inputs = {
    manifestPath: join(directory, 'manifest.json'),
    credentialPath: join(directory, 'credentials.json'),
  };
  const logs = [];
  const lifecycleOptions = {
    auth,
    firestore,
    clock: () => new Date('2026-08-24T14:00:00.000Z'),
    randomBytes: size => Buffer.alloc(size, 7),
    definition,
    repositoryRoot: process.cwd(),
    manifestPath: inputs.manifestPath,
    logger: entry => logs.push(entry),
  };
  const lifecycle = createLifecycle(lifecycleOptions);
  return {
    auth,
    definition,
    directory,
    firestore,
    lifecycleOptions,
    lifecycle,
    inputs,
    logs,
  };
}

test('hosted fixture intent requires both exact staging confirmations', () => {
  assert.throws(() => assertHostedStagingIntent({
    argv: ['--project', STAGING],
    env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
    resolvedProjectId: STAGING,
  }), /confirm-project/);
});

test('hosted fixture intent rejects production, default, and emulator targets', () => {
  for (const resolvedProjectId of ['studio-6850142148-fe343', 'production-project']) {
    assert.throws(() => assertHostedStagingIntent({
      argv: ['--project', STAGING, '--confirm-project', STAGING],
      env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
      resolvedProjectId,
    }), /resolved project/i);
  }
  assert.throws(() => assertHostedStagingIntent({
    argv: ['--project', STAGING, '--confirm-project', STAGING],
    env: { ALLOW_STAGING_QA_FIXTURES: 'true', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    resolvedProjectId: STAGING,
  }), /emulator/i);
});

test('hosted fixture intent rejects duplicate, missing, or malformed flag values', () => {
  const base = {
    env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
    resolvedProjectId: STAGING,
  };
  assert.throws(() => assertHostedStagingIntent({
    ...base,
    argv: ['--project', STAGING, '--project', STAGING, '--confirm-project', STAGING],
  }), /--project/);
  assert.throws(() => assertHostedStagingIntent({
    ...base,
    argv: ['--project', STAGING, '--confirm-project'],
  }), /--confirm-project/);
  assert.throws(() => assertHostedStagingIntent({
    ...base,
    argv: ['--project', STAGING, '--confirm-project', STAGING, '--confirm-project', 'other'],
  }), /--confirm-project/);
});

test('hosted fixture intent requires the exact opt-in and rejects every emulator variable', () => {
  for (const env of [
    {},
    { ALLOW_STAGING_QA_FIXTURES: 'TRUE' },
    { ALLOW_STAGING_QA_FIXTURES: 'true', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
    { ALLOW_STAGING_QA_FIXTURES: 'true', FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' },
  ]) {
    assert.throws(() => assertHostedStagingIntent({
      argv: ['--project', STAGING, '--confirm-project', STAGING],
      env,
      resolvedProjectId: STAGING,
    }), /ALLOW_STAGING_QA_FIXTURES|emulator/i);
  }
});

test('hosted fixture intent returns only the isolated staging project after all checks pass', () => {
  assert.deepEqual(assertHostedStagingIntent({
    argv: ['--project', STAGING, '--confirm-project', STAGING],
    env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
    resolvedProjectId: STAGING,
  }), { projectId: STAGING });
});

test('run IDs use the fixed prefix and deterministic UTC timestamp and suffix', () => {
  assert.equal(createRunId({
    now: new Date('2026-08-24T14:00:00.000Z'),
    randomSuffix: 'ab12',
  }), RUN_ID);
  assert.match(createRunId({
    now: new Date('2026-08-24T14:00:00.000Z'),
    randomSuffix: 'ab12',
  }), new RegExp(`^${MANAGED_PREFIX}\\d{8}T\\d{6}Z-[a-z0-9]+$`));
});

test('managed UIDs must belong to the exact run namespace', () => {
  assertManagedUid(`${RUN_ID}-owner-a`, RUN_ID);
  assert.throws(() => assertManagedUid('unrelated-user', RUN_ID), /managed uid/i);
  assert.throws(() => assertManagedUid(`${RUN_ID}-owner-a`, 'qa-phase7-20260824T140001Z-cd34'), /run/i);
  assert.throws(() => assertManagedUid(`${RUN_ID}/owner-a`, RUN_ID), /managed uid/i);
});

test('managed Firestore paths must be normalized and belong to the exact run namespace', () => {
  assertManagedPath(`qaAuditRuns/${RUN_ID}`, RUN_ID);
  assertManagedPath(`qaFixtures/${RUN_ID}/users/${RUN_ID}-owner-a`, RUN_ID);
  assert.throws(() => assertManagedPath(`qaAuditRuns/${RUN_ID}/../other`, RUN_ID), /path/i);
  assert.throws(() => assertManagedPath(`qaAuditRuns//${RUN_ID}`, RUN_ID), /path/i);
  assert.throws(() => assertManagedPath('qaAuditRuns/other-run', RUN_ID), /run/i);
  assert.throws(() => assertManagedPath(`qaAuditRuns/${RUN_ID}/users/unrelated-user`, RUN_ID), /managed|run/i);
});

test('manifest validation rejects resources outside its exact run namespace', () => {
  assert.throws(() => validateManifest({
    version: 1,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: ['unrelated-user'],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
  }), /managed uid/i);
});

test('manifest validation requires a complete supported lifecycle manifest', () => {
  const manifest = validateManifest({
    version: 1,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
    state: 'planned',
  });
  assert.equal(manifest.version, 1);
  assert.equal(manifest.projectId, STAGING);
  assert.equal(manifest.runId, RUN_ID);
  assert.equal(manifest.state, 'planned');
  assert(Object.isFrozen(manifest));
  assert(Object.isFrozen(manifest.authUids));
  assert(Object.isFrozen(manifest.firestorePaths));
  assert.throws(() => validateManifest({
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /version/i);
  assert.throws(() => validateManifest({
    version: 1,
    runId: RUN_ID,
    projectId: 'production-project',
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /project/i);
  assert.throws(() => validateManifest({
    version: 1,
    runId: 'other-run',
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /run/i);
  assert.throws(() => validateManifest({
    version: 1,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'invalid',
  }), /state|lifecycle/i);
});

test('manifest validation returns a deeply frozen normalized copy without mutating input', () => {
  const input = {
    version: 1,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`, `${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`, `qaAuditRuns/${RUN_ID}`],
    state: 'partial',
    metadata: { note: 'ignored by the safety manifest' },
  };
  assert.throws(() => validateManifest(input), /unknown|manifest field/i);

  delete input.metadata;
  input.authUids = [`${RUN_ID}-owner-a`];
  input.firestorePaths = [`qaAuditRuns/${RUN_ID}`];
  const result = validateManifest(input);
  assert.notEqual(result, input);
  assert.notEqual(result.authUids, input.authUids);
  assert.equal(result.metadata, undefined);
  assert(Object.isFrozen(result));
  assert.throws(() => {
    result.authUids.push(`${RUN_ID}-owner-b`);
  }, TypeError);
});

test('definition contains the approved identities and two distinct tenants', () => {
  const definition = buildFixtureDefinition({ runId: RUN_ID, expiresAt: EXPIRES_AT });
  assert.deepEqual(definition.identities.map(item => item.alias), [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant',
    'qa-team-member', 'qa-multi-org', 'qa-fake-superadmin',
    'qa-unverified', 'qa-suspended', 'qa-removed-member',
  ]);
  assert.notEqual(definition.teams[0].sentinel, definition.teams[1].sentinel);
  assert.equal(definition.identities.find(item => item.alias === 'qa-fake-superadmin').customClaims.role, undefined);
  assert.equal(definition.identities.find(item => item.alias === 'qa-suspended').accountStatus, 'active');
  assert.equal(definition.members.find(item => item.alias === 'qa-removed-member').status, 'active');
  assert.equal(definition.members.filter(item => item.alias === 'qa-multi-org').length, 2);
  for (const member of definition.members) {
    assert.equal(member.id, member.userId);
    assert.equal(member.path, `teams/${member.teamId}/members/${member.userId}`);
    assert.equal(member.membershipPath, `users/${member.userId}/teamMemberships/${member.teamId}`);
    assert.equal(definition.documents.some(document => document.path === member.membershipPath), true);
  }
});

test('seed is idempotent only for matching marked resources', async t => {
  const fixture = await lifecycleFixture(t);
  const first = await fixture.lifecycle.seed(fixture.inputs);
  const second = await fixture.lifecycle.seed(fixture.inputs);
  assert.deepEqual(second.authUids, first.authUids);

  const collisionRunId = 'qa-phase7-20260824T140001Z-cd34';
  const collision = await lifecycleFixture(t, collisionRunId);
  collision.firestore.inject(`users/${collision.definition.identities[0].uid}`, { qaFixture: false });
  await assert.rejects(() => collision.lifecycle.seed(collision.inputs), /collision/i);
});

test('seed leaves a partial manifest after a recorded write fails', async t => {
  const fixture = await lifecycleFixture(t);
  fixture.firestore.failPath = fixture.definition.documents[1].path;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /simulated/i);
  const partial = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(partial.state, 'partial');
  assert.equal(partial.authUids.length, fixture.definition.identities.length);
  assert.equal(partial.firestorePaths.length, 1);
});

test('partial seed retry fails closed instead of emitting credentials with missing passwords', async t => {
  const fixture = await lifecycleFixture(t);
  fixture.firestore.failPath = fixture.definition.documents[1].path;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /simulated/i);
  fixture.firestore.failPath = null;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /credential recovery/i);
  await assert.rejects(() => readFile(fixture.inputs.credentialPath, 'utf8'), /ENOENT/);
});

test('seed creates new Auth users with their ownership marker before recording them', async t => {
  const fixture = await lifecycleFixture(t);
  const identity = fixture.definition.identities[0];
  fixture.auth.failSetCustomClaimsFor = identity.uid;
  const manifest = await fixture.lifecycle.seed(fixture.inputs);
  assert.equal(manifest.authUids.includes(identity.uid), true);
  assert.equal((await fixture.auth.getUser(identity.uid)).customClaims.qaFixture, true);
});

test('seed rejects duplicate resource paths and mismatched resource markers', async t => {
  const fixture = await lifecycleFixture(t);
  const duplicate = structuredClone(fixture.definition);
  duplicate.documents.push(structuredClone(duplicate.documents[0]));
  assert.throws(() => createLifecycle({
    auth: fixture.auth,
    firestore: fixture.firestore,
    definition: duplicate,
    randomBytes: size => Buffer.alloc(size, 3),
    repositoryRoot: process.cwd(),
  }), /duplicate/i);

  const mismatched = await lifecycleFixture(t, 'qa-phase7-20260824T140002Z-ef56');
  const target = mismatched.definition.documents[0];
  mismatched.firestore.inject(target.path, { ...target.data, qaFixtureAlias: 'different-alias' });
  await assert.rejects(() => mismatched.lifecycle.seed(mismatched.inputs), /collision|marker/i);
});

test('seed writes private browser credentials and returns redacted inspection output', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const mode = (await stat(fixture.inputs.credentialPath)).mode & 0o777;
  assert.equal(mode, 0o600);
  const credentialText = await readFile(fixture.inputs.credentialPath, 'utf8');
  assert.match(credentialText, /qa-coach-owner-a/);
  const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(inspection.ok, true);
  assert.equal(JSON.stringify(inspection).includes('BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcH'), false);
  assert.deepEqual(inspection.aliases.sort(), fixture.definition.identities.map(item => item.alias).sort());
});

test('seed rejects an existing credential file unless it is exact-run, regular, and mode 0600', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  await chmod(fixture.inputs.credentialPath, 0o644);
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /credential/i);
});

test('seed rejects a 0600 credential file that belongs to a different run', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const credentials = JSON.parse(await readFile(fixture.inputs.credentialPath, 'utf8'));
  credentials.runId = 'qa-phase7-20260824T140099Z-zz99';
  await chmod(fixture.inputs.credentialPath, 0o600);
  await writeFile(fixture.inputs.credentialPath, JSON.stringify(credentials), { mode: 0o600, flag: 'w' });
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /credential recovery/i);
});

test('seed logger emits only sanitized fields and never credential values', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const credentials = JSON.parse(await readFile(fixture.inputs.credentialPath, 'utf8'));
  assert.ok(fixture.logs.length > 0);
  const output = JSON.stringify(fixture.logs);
  for (const item of credentials.identities) assert.equal(output.includes(item.password), false);
});

test('inspect detects active membership-cache drift on an exact manifest resource', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const membership = fixture.definition.members.find(item => item.alias === 'qa-multi-org');
  const cache = await fixture.firestore.get(membership.membershipPath);
  await fixture.firestore.set(membership.membershipPath, { ...cache, role: 'Admin' });
  const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(inspection.ok, false);
});

test('inspect detects a forged fake-superadmin Auth role claim', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const identity = fixture.definition.identities.find(item => item.alias === 'qa-fake-superadmin');
  const user = await fixture.auth.getUser(identity.uid);
  await fixture.auth.setCustomUserClaims(identity.uid, { ...user.customClaims, role: 'superadmin' });
  assert.equal((await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath })).ok, false);
});

test('negative states require a seeded active baseline and revoke sessions after transition', async t => {
  const fixture = await lifecycleFixture(t);
  await assert.rejects(() => fixture.lifecycle.applyNegativeState('qa-suspended'), /baseline/i);
  await fixture.lifecycle.seed(fixture.inputs);
  const result = await fixture.lifecycle.applyNegativeState('qa-suspended');
  assert.equal(result.state, 'suspended');
  const suspended = fixture.definition.identities.find(item => item.alias === 'qa-suspended');
  assert.equal((await fixture.firestore.get(`users/${suspended.uid}`)).accountStatus, 'suspended');
  assert.deepEqual(fixture.auth.revoked, [suspended.uid]);
  await assert.rejects(() => fixture.lifecycle.applyNegativeState('qa-team-member'), /limited/i);

  const removed = await fixture.lifecycle.applyNegativeState('qa-removed-member');
  assert.equal(removed.state, 'removed');
  const member = fixture.definition.members.find(item => item.alias === 'qa-removed-member');
  assert.equal((await fixture.firestore.get(member.path)).status, 'removed');
  assert.equal(await fixture.firestore.get(member.membershipPath), null);
});

test('a fresh lifecycle instance transitions only after persistent seeded baseline verification', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const freshLifecycle = createLifecycle(fixture.lifecycleOptions);
  assert.equal((await freshLifecycle.applyNegativeState('qa-suspended')).state, 'suspended');
});

test('negative state transition refuses a drifted baseline marker before revoking sessions', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const identity = fixture.definition.identities.find(item => item.alias === 'qa-suspended');
  const userPath = `users/${identity.uid}`;
  const user = await fixture.firestore.get(userPath);
  await fixture.firestore.set(userPath, { ...user, qaFixtureAlias: 'drifted' });
  await assert.rejects(() => fixture.lifecycle.applyNegativeState('qa-suspended'), /baseline/i);
  assert.deepEqual(fixture.auth.revoked, []);
});

test('cleanup deletes only exact manifest resources and is idempotent', async t => {
  const fixture = await lifecycleFixture(t);
  const manifest = await fixture.lifecycle.seed(fixture.inputs);
  fixture.firestore.inject('users/unrelated', { qaFixture: false });
  await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.deepEqual(fixture.auth.deleted.sort(), [...manifest.authUids].sort());
  assert.equal(fixture.firestore.has('users/unrelated'), true);
  assert.deepEqual(fixture.firestore.deleted, [...fixture.firestore.deleted].sort((left, right) => right.split('/').length - left.split('/').length));
});

test('credential-file removal refuses repository paths and removes only a caller-selected temporary file', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  assert.equal(await removeCredentialFile(fixture.inputs.credentialPath, process.cwd()), true);
  assert.equal(await removeCredentialFile(fixture.inputs.credentialPath, process.cwd()), false);
  const repositoryCredential = join(process.cwd(), 'qa-fixture-credentials.json');
  await assert.rejects(() => removeCredentialFile(repositoryCredential, process.cwd()), /outside/i);
});

test('credential paths through a symlinked parent into the repository are rejected', async t => {
  const fixture = await lifecycleFixture(t);
  const externalParent = join(fixture.directory, 'external');
  const linkedParent = join(externalParent, 'repo-link');
  await mkdir(externalParent);
  await symlink(process.cwd(), linkedParent);
  await assert.rejects(() => fixture.lifecycle.seed({
    ...fixture.inputs,
    credentialPath: join(linkedParent, '.git'),
  }), /outside/i);
});

test('credential removal rejects a symlinked parent that physically targets the repository', async t => {
  const fixture = await lifecycleFixture(t);
  const externalParent = join(fixture.directory, 'removal-external');
  const linkedParent = join(externalParent, 'repo-link');
  await mkdir(externalParent);
  await symlink(process.cwd(), linkedParent);
  await assert.rejects(() => removeCredentialFile(join(linkedParent, '.git'), process.cwd()), /outside/i);
});
