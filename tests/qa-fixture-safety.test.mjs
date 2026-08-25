import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import { runCli } from '../scripts/qa-fixtures/cli.mjs';
import { createFirebaseAdapter } from '../scripts/qa-fixtures/firebase-adapter.mjs';
import { chmod, mkdir, mkdtemp, readFile, readdir, stat, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING = STAGING_PROJECT_ID;
const RUN_ID = 'qa-phase7-20260824T140000Z-ab12cd34ef56';
const EXPIRES_AT = '2026-08-31T14:00:00.000Z';
const repositoryRoot = process.cwd();

function hostedArgs(command, ...args) {
  return [
    command,
    '--project', STAGING,
    '--confirm-project', STAGING,
    ...args,
  ];
}

function hostedEnvironment() {
  return { ALLOW_STAGING_QA_FIXTURES: 'true' };
}

function approvedActiveTransitions() {
  return {
    'qa-suspended': { version: 1, state: 'active' },
    'qa-removed-member': { version: 1, state: 'active' },
  };
}

function directAdapter(auth, firestore, calls = []) {
  return {
    projectId: STAGING,
    auth: {
      getUser: async (...args) => {
        calls.push('auth.getUser');
        return auth.getUser(...args);
      },
      createUser: async (...args) => {
        calls.push('auth.createUser');
        return auth.createUser(...args);
      },
      updateUser: async (...args) => {
        calls.push('auth.updateUser');
        return auth.updateUser(...args);
      },
      setCustomUserClaims: async (...args) => {
        calls.push('auth.setCustomUserClaims');
        return auth.setCustomUserClaims(...args);
      },
      revokeRefreshTokens: async (...args) => {
        calls.push('auth.revokeRefreshTokens');
        return auth.revokeRefreshTokens(...args);
      },
      deleteUser: async (...args) => {
        calls.push('auth.deleteUser');
        return auth.deleteUser(...args);
      },
    },
    firestore: {
      get: async (...args) => {
        calls.push('firestore.get');
        return firestore.get(...args);
      },
      set: async (...args) => {
        calls.push('firestore.set');
        return firestore.set(...args);
      },
      delete: async (...args) => {
        calls.push('firestore.delete');
        return firestore.delete(...args);
      },
    },
  };
}

function adcAdminSdk(credential, { appProjectId = null, clientCalls = null } = {}) {
  const app = {
    name: 'qa-fixtures-staging',
    options: appProjectId ? { projectId: appProjectId } : {},
    auth: () => {
      clientCalls?.push('auth');
      return {
      getUser: async uid => ({ uid }),
      createUser: async input => ({ uid: input.uid }),
      updateUser: async () => {},
      setCustomUserClaims: async () => {},
      revokeRefreshTokens: async () => {},
      deleteUser: async () => {},
      };
    },
    firestore: () => {
      clientCalls?.push('firestore');
      return {
        doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, delete: async () => {} }),
      };
    },
  };
  return {
    getApps: () => [],
    initializeApp(options) {
      app.options = { ...options, ...app.options };
      return app;
    },
    credential: { applicationDefault: () => credential },
  };
}

class FakeAuth {
  constructor() {
    this.users = new Map();
    this.deleted = [];
    this.revoked = [];
    this.failSetCustomClaimsFor = null;
    this.failAfterCreateFor = null;
    this.failGetFor = null;
    this.failDeleteFor = null;
  }

  async getUser(uid) {
    if (uid === this.failGetFor) throw new Error('simulated Auth read failure with unsafe details omitted');
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
    if (input.uid === this.failAfterCreateFor) throw new Error('simulated ambiguous Auth create response');
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
    if (uid === this.failDeleteFor) throw new Error('simulated Auth delete failure with unsafe details omitted');
    this.deleted.push(uid);
    this.users.delete(uid);
  }
}

class FakeFirestore {
  constructor() {
    this.documents = new Map();
    this.deleted = [];
    this.failPath = null;
    this.failAfterSetPath = null;
    this.failGetPath = null;
    this.failDeletePath = null;
  }

  inject(path, data) {
    this.documents.set(path, structuredClone(data));
  }

  has(path) {
    return this.documents.has(path);
  }

  async get(path) {
    if (path === this.failGetPath) throw new Error('simulated Firestore read failure with unsafe details omitted');
    const data = this.documents.get(path);
    return data === undefined ? null : structuredClone(data);
  }

  async set(path, data) {
    if (path === this.failPath) throw new Error('simulated Firestore write failure');
    this.documents.set(path, structuredClone(data));
    if (path === this.failAfterSetPath) throw new Error('simulated ambiguous Firestore write response');
  }

  async delete(path) {
    if (path === this.failDeletePath) throw new Error('simulated Firestore delete failure with unsafe details omitted');
    this.deleted.push(path);
    this.documents.delete(path);
  }
}

async function lifecycleFixture(t, runId = RUN_ID) {
  const directory = await mkdtemp(join(tmpdir(), 'qa-fixture-lifecycle-'));
  t.after(async () => {
    await removeCredentialFile(join(directory, 'credentials.json'), process.cwd());
    await unlink(join(directory, 'remote-state.json')).catch(error => {
      if (error?.code !== 'ENOENT') throw error;
    });
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

async function hardExitSeedProcess(fixture, alias) {
  const remoteStatePath = join(fixture.directory, 'remote-state.json');
  await writeFile(remoteStatePath, JSON.stringify({
    auth: Object.fromEntries([...fixture.auth.users].map(([uid, user]) => [uid, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
      disabled: user.disabled,
      customClaims: user.customClaims,
    }])),
    firestore: Object.fromEntries(fixture.firestore.documents),
  }));
  const lifecycleUrl = pathToFileURL(resolve(repositoryRoot, 'scripts/qa-fixtures/lifecycle.mjs')).href;
  const definitionUrl = pathToFileURL(resolve(repositoryRoot, 'scripts/qa-fixtures/definition.mjs')).href;
  const script = `
    import { readFile, writeFile } from 'node:fs/promises';
    const { createLifecycle } = await import(${JSON.stringify(lifecycleUrl)});
    const { buildFixtureDefinition } = await import(${JSON.stringify(definitionUrl)});
    const remoteStatePath = ${JSON.stringify(remoteStatePath)};
    const remote = JSON.parse(await readFile(remoteStatePath, 'utf8'));
    const persist = () => writeFile(remoteStatePath, JSON.stringify(remote));
    const missingUser = () => {
      const error = new Error('User not found');
      error.code = 'auth/user-not-found';
      return error;
    };
    const auth = {
      async getUser(uid) {
        if (!remote.auth[uid]) throw missingUser();
        return structuredClone(remote.auth[uid]);
      },
      async createUser(input) {
        if (remote.auth[input.uid]) throw new Error('duplicate auth user');
        remote.auth[input.uid] = { ...input, customClaims: {} };
        delete remote.auth[input.uid].password;
        await persist();
        return structuredClone(remote.auth[input.uid]);
      },
      async updateUser(uid, input) {
        if (!remote.auth[uid]) throw missingUser();
        remote.auth[uid] = { ...remote.auth[uid], ...input };
        delete remote.auth[uid].password;
        await persist();
        return structuredClone(remote.auth[uid]);
      },
      async setCustomUserClaims(uid, customClaims) {
        if (!remote.auth[uid]) throw missingUser();
        remote.auth[uid].customClaims = structuredClone(customClaims);
        await persist();
      },
      async revokeRefreshTokens() {},
      async deleteUser(uid) {
        delete remote.auth[uid];
        await persist();
      },
    };
    const firestore = {
      async get(path) {
        return remote.firestore[path] === undefined ? null : structuredClone(remote.firestore[path]);
      },
      async set(path, data) {
        remote.firestore[path] = structuredClone(data);
        await persist();
      },
      async delete(path) {
        delete remote.firestore[path];
        await persist();
      },
    };
    const definition = buildFixtureDefinition({ runId: ${JSON.stringify(fixture.definition.runId)}, expiresAt: ${JSON.stringify(EXPIRES_AT)} });
    const lifecycle = createLifecycle({
      auth,
      firestore,
      clock: () => new Date('2026-08-24T14:00:00.000Z'),
      randomBytes: size => Buffer.alloc(size, 7),
      definition,
      repositoryRoot: ${JSON.stringify(repositoryRoot)},
      manifestPath: ${JSON.stringify(fixture.inputs.manifestPath)},
      faultInjector(stage) {
        if (stage === ${JSON.stringify(`seed.${alias}.afterAuthCreate`)}) process.exit(86);
      },
    });
    await lifecycle.seed({
      manifestPath: ${JSON.stringify(fixture.inputs.manifestPath)},
      credentialPath: ${JSON.stringify(fixture.inputs.credentialPath)},
    });
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
  const remote = JSON.parse(await readFile(remoteStatePath, 'utf8'));
  fixture.auth.users = new Map(Object.entries(remote.auth));
  fixture.firestore.documents = new Map(Object.entries(remote.firestore));
  return child;
}

test('importing the CLI exposes commands without executing an adapter operation', async () => {
  const cli = await import(`../scripts/qa-fixtures/cli.mjs?inert=${Date.now()}`);
  assert.equal(typeof cli.runCli, 'function');
  const source = await readFile(resolve(repositoryRoot, 'scripts/qa-fixtures/cli.mjs'), 'utf8');
  assert.match(source, /import\.meta\.url/);
  assert.match(source, /process\.argv/);
});

test('cli preflight resolves staging intent without Auth or Firestore mutation', async () => {
  const calls = [];
  const lines = [];
  await runCli({
    argv: hostedArgs('preflight'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: async () => directAdapter(new FakeAuth(), new FakeFirestore(), calls),
    stdout: line => lines.push(line),
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(JSON.parse(lines.join('')), {
    command: 'preflight',
    projectId: STAGING,
    origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app',
    plannedAliases: 9,
    plannedTeams: 2,
    safe: true,
  });
});

test('cli rejects repository-local credential output before adapter mutation', async () => {
  const calls = [];
  await assert.rejects(() => runCli({
    argv: hostedArgs('seed', '--credentials', 'tmp/creds.json'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: async () => directAdapter(new FakeAuth(), new FakeFirestore(), calls),
  }), /outside the repository/i);
  assert.deepEqual(calls, []);
});

test('cli resolves the repository boundary independently of a nested working directory', async () => {
  let factoryCalls = 0;
  const error = await runCli({
    argv: hostedArgs(
      'seed',
      '--credentials', '../credentials.json',
      '--manifest', '/tmp/qa-fixture-manifest.json',
    ),
    env: hostedEnvironment(),
    cwd: resolve(repositoryRoot, 'scripts'),
    repositoryRoot,
    adapterFactory: async () => {
      factoryCalls += 1;
      throw new Error('adapter factory must not run');
    },
  }).then(() => null, reason => reason);
  assert.match(error.message, /outside the repository/i);
  assert.equal(factoryCalls, 0);
});

test('cli rejects repository-local manifest input before adapter mutation', async () => {
  const calls = [];
  await assert.rejects(() => runCli({
    argv: hostedArgs('inspect', '--manifest', 'tmp/manifest.json'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: async () => directAdapter(new FakeAuth(), new FakeFirestore(), calls),
  }), /outside the repository/i);
  assert.deepEqual(calls, []);
});

test('cli rejects unsupported commands without initializing an adapter', async () => {
  let initialized = false;
  await assert.rejects(() => runCli({
    argv: hostedArgs('destroy-everything'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: async () => {
      initialized = true;
      return directAdapter(new FakeAuth(), new FakeFirestore());
    },
  }), /unsupported fixture command/i);
  assert.equal(initialized, false);
});

test('cli rejects invalid requested intent before constructing an adapter', async () => {
  const invalidRequests = [
    { argv: hostedArgs('preflight'), env: {} },
    { argv: hostedArgs('preflight'), env: { ...hostedEnvironment(), FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' } },
    {
      argv: ['preflight', '--project', 'production-project', '--confirm-project', STAGING],
      env: hostedEnvironment(),
    },
  ];
  for (const { argv, env } of invalidRequests) {
    let factoryCalls = 0;
    await assert.rejects(() => runCli({
      argv,
      env,
      cwd: repositoryRoot,
      adapterFactory: async () => {
        factoryCalls += 1;
        throw new Error('adapter factory must not run');
      },
    }), /ALLOW_STAGING_QA_FIXTURES|emulator|confirmations/i);
    assert.equal(factoryCalls, 0, argv.join(' '));
  }
});

test('cli seed rejects an existing incomplete transition journal before adapter construction or connection', async t => {
  for (const item of [
    { name: 'omitted transitions', transitions: undefined },
    { name: 'one transition alias', transitions: { 'qa-suspended': { version: 1, state: 'active' } } },
  ]) {
    await t.test(item.name, async t => {
      const fixture = await lifecycleFixture(t);
      const manifest = {
        version: 2,
        runId: RUN_ID,
        projectId: STAGING,
        authUids: [],
        firestorePaths: [],
        state: 'planned',
        expiresAt: EXPIRES_AT,
      };
      if (item.transitions !== undefined) manifest.transitions = item.transitions;
      await writeFile(fixture.inputs.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      const beforeManifest = await readFile(fixture.inputs.manifestPath, 'utf8');
      let factoryCalls = 0;
      let connectCalls = 0;

      await assert.rejects(() => runCli({
        argv: hostedArgs(
          'seed',
          '--manifest', fixture.inputs.manifestPath,
          '--credentials', fixture.inputs.credentialPath,
          '--expires-at', EXPIRES_AT,
        ),
        env: hostedEnvironment(),
        cwd: repositoryRoot,
        runIdGenerator: () => RUN_ID,
        adapterFactory: async () => {
          factoryCalls += 1;
          return {
            projectId: STAGING,
            connect() {
              connectCalls += 1;
              return directAdapter(fixture.auth, fixture.firestore);
            },
          };
        },
      }), /transition/i);

      assert.equal(factoryCalls, 0);
      assert.equal(connectCalls, 0);
      assert.equal(await readFile(fixture.inputs.manifestPath, 'utf8'), beforeManifest);
      await assert.rejects(() => stat(fixture.inputs.credentialPath), /ENOENT/);
      assert.equal(fixture.auth.users.size, 0);
      assert.equal(fixture.firestore.documents.size, 0);
    });
  }
});

test('cli seed sanitizes an injected manifest read denial before adapter construction', async t => {
  const fixture = await lifecycleFixture(t);
  await writeFile(fixture.inputs.manifestPath, `${JSON.stringify({
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'planned',
    expiresAt: EXPIRES_AT,
    transitions: approvedActiveTransitions(),
  }, null, 2)}\n`, { mode: 0o600 });
  const stdout = [];
  const stderr = [];
  let manifestReadCalls = 0;
  let factoryCalls = 0;
  const rawDiagnostic = `EACCES: permission denied, open '${fixture.inputs.manifestPath}'`;

  const error = await runCli({
    argv: hostedArgs(
      'seed',
      '--manifest', fixture.inputs.manifestPath,
      '--credentials', fixture.inputs.credentialPath,
      '--expires-at', EXPIRES_AT,
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    manifestReadFile: async path => {
      manifestReadCalls += 1;
      assert.equal(path, fixture.inputs.manifestPath);
      const error = new Error(rawDiagnostic);
      error.code = 'EACCES';
      throw error;
    },
    adapterFactory: async () => {
      factoryCalls += 1;
      throw new Error('adapter factory must not run');
    },
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  }).then(() => null, reason => reason);

  assert.equal(error?.message, 'Fixture manifest could not be read.');
  assert.doesNotMatch(error.message, /EACCES|permission denied/i);
  assert.equal(error.message.includes(fixture.inputs.manifestPath), false);
  assert.equal(manifestReadCalls, 1);
  assert.equal(factoryCalls, 0);
  assert.deepEqual(stdout, []);
  assert.deepEqual(stderr, []);
});

test('cli rejects caller-supplied run IDs before generator or adapter access', async t => {
  const fixture = await lifecycleFixture(t);
  let generatorCalls = 0;
  let adapterCalls = 0;
  await assert.rejects(() => runCli({
    argv: hostedArgs(
      'seed',
      '--manifest', fixture.inputs.manifestPath,
      '--credentials', fixture.inputs.credentialPath,
      '--run-id', RUN_ID,
      '--expires-at', EXPIRES_AT,
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    runIdGenerator() {
      generatorCalls += 1;
      return RUN_ID;
    },
    adapterFactory: async () => {
      adapterCalls += 1;
      return directAdapter(fixture.auth, fixture.firestore);
    },
  }), /run ID.*generated internally/i);
  await assert.rejects(() => runCli({
    argv: hostedArgs(
      'seed',
      '--manifest', fixture.inputs.manifestPath,
      '--credentials', fixture.inputs.credentialPath,
      `--run-id=${RUN_ID}`,
      '--expires-at', EXPIRES_AT,
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    runIdGenerator() {
      generatorCalls += 1;
      return RUN_ID;
    },
    adapterFactory: async () => {
      adapterCalls += 1;
      return directAdapter(fixture.auth, fixture.firestore);
    },
  }), /run ID.*generated internally/i);
  assert.equal(generatorCalls, 0);
  assert.equal(adapterCalls, 0);
  assert.equal(fixture.auth.users.size, 0);
  assert.equal(fixture.firestore.documents.size, 0);
});

test('cli seed obtains its run ID from the injected internal generator seam', async t => {
  const fixture = await lifecycleFixture(t);
  let generatorCalls = 0;
  await runCli({
    argv: hostedArgs(
      'seed',
      '--manifest', fixture.inputs.manifestPath,
      '--credentials', fixture.inputs.credentialPath,
      '--expires-at', EXPIRES_AT,
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    runIdGenerator() {
      generatorCalls += 1;
      return RUN_ID;
    },
    adapterFactory: async () => directAdapter(fixture.auth, fixture.firestore),
    stdout: () => {},
  });
  assert.equal(generatorCalls, 1);
  assert.equal(JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8')).runId, RUN_ID);
});

test('cli transition uses a fresh lifecycle with the persistent seeded manifest after guard resolution', async t => {
  const fixture = await lifecycleFixture(t);
  const seededCalls = [];
  const seededOutput = [];
  await runCli({
    argv: hostedArgs(
      'seed',
      '--manifest', fixture.inputs.manifestPath,
      '--credentials', fixture.inputs.credentialPath,
      '--expires-at', EXPIRES_AT,
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    runIdGenerator: () => RUN_ID,
    adapterFactory: async () => directAdapter(fixture.auth, fixture.firestore, seededCalls),
    stdout: line => seededOutput.push(line),
  });
  assert.ok(seededCalls.length > 0);
  assert.equal(seededOutput.length, 1);

  const transitionCalls = [];
  const lines = [];
  await runCli({
    argv: hostedArgs(
      'transition',
      '--manifest', fixture.inputs.manifestPath,
      '--alias', 'qa-suspended',
    ),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: async () => directAdapter(fixture.auth, fixture.firestore, transitionCalls),
    stdout: line => lines.push(line),
  });
  assert.equal(transitionCalls.includes('firestore.set'), true);
  assert.equal(transitionCalls.includes('auth.revokeRefreshTokens'), true);
  assert.deepEqual(JSON.parse(lines.join('')), {
    command: 'transition',
    alias: 'qa-suspended',
    state: 'suspended',
    uidSuffix: 'suspended',
  });
});

test('firebase adapter exposes only exact Auth and document operations', async () => {
  const calls = [];
  const app = {
    name: 'qa-fixtures-staging',
    options: { projectId: STAGING },
    auth: () => ({
      getUser: async uid => ({ uid }),
      createUser: async input => ({ uid: input.uid }),
      updateUser: async () => {},
      setCustomUserClaims: async () => {},
      revokeRefreshTokens: async () => {},
      deleteUser: async () => {},
    }),
    firestore: () => ({
      doc: path => ({
        get: async () => ({ exists: false }),
        set: async data => calls.push(['set', path, data]),
        delete: async () => calls.push(['delete', path]),
      }),
    }),
  };
  const adapter = await createFirebaseAdapter({
    adminSdk: {
      getApps: () => [app],
      getApp: () => app,
    },
    env: {},
  });
  const connected = adapter.connect();
  assert.deepEqual(Object.keys(connected.auth).sort(), [
    'createUser', 'deleteUser', 'getUser', 'revokeRefreshTokens', 'setCustomUserClaims', 'updateUser',
  ]);
  assert.deepEqual(Object.keys(connected.firestore).sort(), ['delete', 'get', 'set']);
  await connected.firestore.set(`users/${RUN_ID}-owner-a`, { qaFixture: true });
  await connected.firestore.delete(`users/${RUN_ID}-owner-a`);
  assert.deepEqual(calls.map(([operation]) => operation), ['set', 'delete']);
});

test('firebase adapter normalizes a CommonJS default Admin namespace before inspecting apps', async () => {
  const app = {
    name: 'qa-fixtures-staging',
    options: { projectId: STAGING },
    auth: () => ({
      getUser: async () => {}, createUser: async () => {}, updateUser: async () => {},
      setCustomUserClaims: async () => {}, revokeRefreshTokens: async () => {}, deleteUser: async () => {},
    }),
    firestore: () => ({ doc: () => ({ get: async () => {}, set: async () => {}, delete: async () => {} }) }),
  };
  const adapter = await createFirebaseAdapter({
    adminSdk: { default: { apps: [app] } },
    env: {},
  });
  assert.equal(adapter.projectId, STAGING);
  assert.equal(typeof adapter.connect, 'function');
});

test('firebase adapter awaits ADC credential project discovery before exposing clients', async () => {
  let discoveryCalls = 0;
  const adapter = await createFirebaseAdapter({
    adminSdk: adcAdminSdk({
      async getProjectId() {
        discoveryCalls += 1;
        return STAGING;
      },
    }),
    env: {},
  });
  assert.equal(adapter.projectId, STAGING);
  assert.equal(discoveryCalls, 1);
});

test('cli fails closed when asynchronously discovered ADC project is not staging', async () => {
  let discoveryCalls = 0;
  await assert.rejects(() => runCli({
    argv: hostedArgs('preflight'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: () => createFirebaseAdapter({
      adminSdk: adcAdminSdk({
        async getProjectId() {
          discoveryCalls += 1;
          return 'production-project';
        },
      }),
      env: {},
    }),
  }), /resolved project/i);
  assert.equal(discoveryCalls, 1);
});

test('discovered production project rejects before constructing Auth or Firestore clients', async () => {
  const clientCalls = [];
  await assert.rejects(() => runCli({
    argv: hostedArgs('preflight'),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    adapterFactory: () => createFirebaseAdapter({
      adminSdk: adcAdminSdk({ async getProjectId() { return 'production-project'; } }, { clientCalls }),
      env: {},
    }),
  }), /resolved project/i);
  assert.deepEqual(clientCalls, []);
});

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
    randomSuffix: 'ab12cd34ef56',
  }), RUN_ID);
  assert.match(createRunId({
    now: new Date('2026-08-24T14:00:00.000Z'),
    randomSuffix: 'ab12cd34ef56',
  }), new RegExp(`^${MANAGED_PREFIX}\\d{8}T\\d{6}Z-[a-z0-9]{12,32}$`));
  for (const invalid of [
    'qa-phase7-fix1b',
    'qa-phase7-20260824T140000Z-ab12',
    'qa-phase7-20261324T140000Z-ab12cd34ef56',
    'qa-phase7-20260824T250000Z-ab12cd34ef56',
    'qa-phase7-20260824T140000Z-AB12CD34EF56',
  ]) {
    assert.throws(() => validateManifest({
      version: 2,
      runId: invalid,
      projectId: STAGING,
      authUids: [],
      firestorePaths: [],
      state: 'planned',
      transitions: {},
    }), /run ID/i);
  }
  assert.throws(() => createRunId({
    now: new Date('2026-08-24T14:00:00.000Z'),
    randomSuffix: 'short',
  }), /randomSuffix/i);
});

test('managed UIDs must belong to the exact run namespace', () => {
  assertManagedUid(`${RUN_ID}-owner-a`, RUN_ID);
  assert.throws(() => assertManagedUid('unrelated-user', RUN_ID), /managed uid/i);
  assert.throws(() => assertManagedUid(`${RUN_ID}-owner-a`, 'qa-phase7-20260824T140001Z-cd34ef56ab78'), /run/i);
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
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: ['unrelated-user'],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
  }), /managed uid/i);
});

test('manifest validation requires a complete supported lifecycle manifest', () => {
  const manifest = validateManifest({
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
    state: 'planned',
    transitions: approvedActiveTransitions(),
  });
  assert.equal(manifest.version, 2);
  assert.equal(manifest.projectId, STAGING);
  assert.equal(manifest.runId, RUN_ID);
  assert.equal(manifest.state, 'planned');
  assert(Object.isFrozen(manifest));
  assert(Object.isFrozen(manifest.authUids));
  assert(Object.isFrozen(manifest.firestorePaths));
  assert.throws(() => validateManifest({
    version: 1,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /version/i);
  assert.throws(() => validateManifest({
    version: 2,
    runId: RUN_ID,
    projectId: 'production-project',
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /project/i);
  assert.throws(() => validateManifest({
    version: 2,
    runId: 'other-run',
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'planned',
  }), /run/i);
  assert.throws(() => validateManifest({
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [],
    firestorePaths: [],
    state: 'invalid',
  }), /state|lifecycle/i);
});

test('manifest v2 requires exactly both approved transition records', () => {
  const base = {
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
    state: 'planned',
  };
  const activeTransitions = {
    'qa-suspended': { version: 1, state: 'active' },
    'qa-removed-member': { version: 1, state: 'active' },
  };

  assert.doesNotThrow(() => validateManifest({ ...base, transitions: activeTransitions }));
  for (const transitions of [
    undefined,
    {},
    { 'qa-suspended': activeTransitions['qa-suspended'] },
    { 'qa-removed-member': activeTransitions['qa-removed-member'] },
  ]) {
    const candidate = { ...base };
    if (transitions !== undefined) candidate.transitions = transitions;
    assert.throws(() => validateManifest(candidate), /transition/i);
  }
});

test('manifest validation returns a deeply frozen normalized copy without mutating input', () => {
  const input = {
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`, `${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`, `qaAuditRuns/${RUN_ID}`],
    state: 'partial',
    transitions: approvedActiveTransitions(),
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

test('manifest transition validation enforces alias-specific ordered checkpoint schemas', () => {
  const baseManifest = {
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [`${RUN_ID}-owner-a`],
    firestorePaths: [`qaAuditRuns/${RUN_ID}`],
    state: 'seeded',
    transitions: approvedActiveTransitions(),
  };
  const cases = [
    {
      name: 'active forbids progress checkpoints',
      alias: 'qa-suspended',
      transition: { version: 1, state: 'active', firestoreUpdatedAt: '2026-08-24T14:00:01.000Z' },
      accepted: false,
    },
    {
      name: 'active forbids completion checkpoints',
      alias: 'qa-removed-member',
      transition: { version: 1, state: 'active', completedAt: '2026-08-24T14:00:05.000Z' },
      accepted: false,
    },
    {
      name: 'applying requires a start checkpoint',
      alias: 'qa-suspended',
      transition: { version: 1, state: 'applying' },
      accepted: false,
    },
    {
      name: 'applying forbids a completion checkpoint',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        completedAt: '2026-08-24T14:00:05.000Z',
      },
      accepted: false,
    },
    {
      name: 'suspended never permits a cache-deletion checkpoint',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        cacheDeletedAt: '2026-08-24T14:00:02.000Z',
      },
      accepted: false,
    },
    {
      name: 'suspended revocation cannot precede its Firestore checkpoint',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
      },
      accepted: false,
    },
    {
      name: 'removed cache deletion cannot precede its Firestore checkpoint',
      alias: 'qa-removed-member',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        cacheDeletedAt: '2026-08-24T14:00:02.000Z',
      },
      accepted: false,
    },
    {
      name: 'removed revocation cannot precede cache deletion',
      alias: 'qa-removed-member',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
      },
      accepted: false,
    },
    {
      name: 'final suspended requires its start checkpoint',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'suspended',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
        completedAt: '2026-08-24T14:00:04.000Z',
      },
      accepted: false,
    },
    {
      name: 'final checkpoints must be monotonically nondecreasing',
      alias: 'qa-removed-member',
      transition: {
        version: 1,
        state: 'removed',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:02.000Z',
        cacheDeletedAt: '2026-08-24T14:00:01.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
        completedAt: '2026-08-24T14:00:04.000Z',
      },
      accepted: false,
    },
    {
      name: 'active has no checkpoints',
      alias: 'qa-suspended',
      transition: { version: 1, state: 'active' },
      accepted: true,
    },
    {
      name: 'suspended applying checkpoints are sequential',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
      },
      accepted: true,
    },
    {
      name: 'removed applying checkpoints are sequential',
      alias: 'qa-removed-member',
      transition: {
        version: 1,
        state: 'applying',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        cacheDeletedAt: '2026-08-24T14:00:02.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
      },
      accepted: true,
    },
    {
      name: 'final suspended contains every ordered required checkpoint',
      alias: 'qa-suspended',
      transition: {
        version: 1,
        state: 'suspended',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
        completedAt: '2026-08-24T14:00:04.000Z',
      },
      accepted: true,
    },
    {
      name: 'final removed contains every ordered required checkpoint',
      alias: 'qa-removed-member',
      transition: {
        version: 1,
        state: 'removed',
        startedAt: '2026-08-24T14:00:00.000Z',
        firestoreUpdatedAt: '2026-08-24T14:00:01.000Z',
        cacheDeletedAt: '2026-08-24T14:00:02.000Z',
        revokedAt: '2026-08-24T14:00:03.000Z',
        completedAt: '2026-08-24T14:00:04.000Z',
      },
      accepted: true,
    },
  ];

  for (const item of cases) {
    const candidate = { ...baseManifest, transitions: { ...approvedActiveTransitions(), [item.alias]: item.transition } };
    if (item.accepted) {
      assert.doesNotThrow(() => validateManifest(candidate), item.name);
    } else {
      assert.throws(() => validateManifest(candidate), undefined, item.name);
    }
  }
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
  const assistant = definition.identities.find(item => item.alias === 'qa-team-assistant');
  const assistantMembership = definition.members.find(item => item.alias === 'qa-team-assistant');
  assert.equal(assistant.role, 'coach');
  assert.equal(assistant.customClaims.role, 'coach');
  assert.equal(assistantMembership.role, 'Admin');
  assert.equal(assistantMembership.position, 'Assistant Coach');
  assert.notEqual(assistantMembership.userId, definition.teams[0].ownerUserId);
  for (const member of definition.members) {
    const identity = definition.identities.find(item => item.alias === member.alias);
    assert.equal(member.id, member.userId);
    assert.equal(member.path, `teams/${member.teamId}/members/${member.userId}`);
    assert.equal(member.membershipPath, `users/${member.userId}/teamMemberships/${member.teamId}`);
    assert.equal(definition.documents.some(document => document.path === member.membershipPath), true);
    assert.equal(member.name, identity.name);
    assert.equal(member.playerId, `p_${member.userId}`);
    assert.match(member.jersey, /^\d+$/);
    assert.equal(typeof member.avatar, 'string');
  }
});

test('definition uses the verified same-origin avatar asset for every roster member', async () => {
  const definition = buildFixtureDefinition({ runId: RUN_ID, expiresAt: EXPIRES_AT });
  const origin = new URL('https://staging.example/');
  const avatarPath = '/icon.png';
  const asset = await stat(join(repositoryRoot, 'src/app/icon.png'));

  assert.equal(asset.isFile(), true);
  for (const member of definition.members) {
    assert.equal(member.avatar, avatarPath);
    assert.equal(new URL(member.avatar, origin).origin, origin.origin);
    assert.doesNotMatch(member.avatar, /example\.test/i);
  }
});

test('seed is idempotent only for matching marked resources', async t => {
  const fixture = await lifecycleFixture(t);
  const first = await fixture.lifecycle.seed(fixture.inputs);
  const second = await fixture.lifecycle.seed(fixture.inputs);
  assert.deepEqual(second.authUids, first.authUids);

  const collisionRunId = 'qa-phase7-20260824T140001Z-cd34ef56ab78';
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
  assert.deepEqual(partial.authUids, fixture.definition.identities.map(item => item.uid));
  assert.deepEqual(partial.firestorePaths, fixture.definition.documents.map(item => item.path));
});

test('partial seed retry fails closed instead of emitting credentials with missing passwords', async t => {
  const fixture = await lifecycleFixture(t);
  fixture.firestore.failPath = fixture.definition.documents[1].path;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /simulated/i);
  fixture.firestore.failPath = null;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /credential recovery/i);
  await assert.rejects(() => readFile(fixture.inputs.credentialPath, 'utf8'), /ENOENT/);
});

test('seed records the ownership marker for newly created Auth users', async t => {
  const fixture = await lifecycleFixture(t);
  const identity = fixture.definition.identities[0];
  const manifest = await fixture.lifecycle.seed(fixture.inputs);
  assert.equal(manifest.authUids.includes(identity.uid), true);
  assert.equal((await fixture.auth.getUser(identity.uid)).customClaims.qaFixture, true);
});

test('claims failure persists the newly created exact Auth UID for cleanup', async t => {
  const fixture = await lifecycleFixture(t);
  const identity = fixture.definition.identities[0];
  fixture.auth.failSetCustomClaimsFor = identity.uid;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /custom-claim write failure/i);
  const partial = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(partial.state, 'partial');
  assert.deepEqual(partial.authUids, fixture.definition.identities.map(item => item.uid));
  const proofPath = `qaAuditRuns/${RUN_ID}/authOwnership/${identity.uid}`;
  assert.deepEqual(partial.firestorePaths, fixture.definition.documents.map(item => item.path));
  assert.equal(fixture.firestore.has(proofPath), true);
  let proofPresentAtAuthDeletion = false;
  const deleteUser = fixture.auth.deleteUser.bind(fixture.auth);
  fixture.auth.deleteUser = async uid => {
    proofPresentAtAuthDeletion = fixture.firestore.has(proofPath);
    return deleteUser(uid);
  };
  await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.deepEqual(fixture.auth.deleted, [identity.uid]);
  assert.equal(proofPresentAtAuthDeletion, true);
  assert.equal(fixture.firestore.has(proofPath), false);
  await assert.rejects(() => fixture.auth.getUser(identity.uid), /not found/i);
});

test('active re-seed journals partial before a hard exit so exact cleanup removes the recreated claimless user', async t => {
  for (const priorState of ['seeded']) {
    const fixture = await lifecycleFixture(t);
    const identity = fixture.definition.identities[0];
    await fixture.lifecycle.seed(fixture.inputs);
    fixture.auth.users.delete(identity.uid);

    const child = await hardExitSeedProcess(fixture, identity.alias);
    assert.equal(child.status, 86, child.stderr || child.stdout);
    assert.deepEqual((await fixture.auth.getUser(identity.uid)).customClaims, {});
    const persistedAfterExit = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));

    const cleanup = await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
    assert.deepEqual(cleanup.retained, [], `${priorState} re-seed retained managed resources`);
    assert.equal(persistedAfterExit.state, 'partial');
    assert.equal(fixture.auth.users.size, 0);
    assert.equal(fixture.firestore.documents.size, 0);
  }
});

test('re-seed rejects applying, final, and cleaned runs before adapter mutation', async t => {
  const cases = [
    { name: 'suspended applying', alias: 'qa-suspended', transitionState: 'applying' },
    { name: 'removed applying', alias: 'qa-removed-member', transitionState: 'applying' },
    { name: 'suspended final', alias: 'qa-suspended', transitionState: 'final' },
    { name: 'removed final', alias: 'qa-removed-member', transitionState: 'final' },
    { name: 'cleaned active run', cleaned: true },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const fixture = await lifecycleFixture(t);
      await fixture.lifecycle.seed(fixture.inputs);
      if (item.transitionState === 'applying') {
        const manifest = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
        manifest.transitions[item.alias] = {
          version: 1,
          state: 'applying',
          startedAt: '2026-08-24T14:00:01.000Z',
        };
        await writeFile(fixture.inputs.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'w' });
      }
      if (item.transitionState === 'final') await fixture.lifecycle.applyNegativeState(item.alias);
      if (item.cleaned) await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });

      const beforeManifest = await readFile(fixture.inputs.manifestPath, 'utf8');
      const beforeAuth = structuredClone([...fixture.auth.users]);
      const beforeFirestore = structuredClone([...fixture.firestore.documents]);
      const calls = [];
      const adapter = directAdapter(fixture.auth, fixture.firestore, calls);
      const lifecycle = createLifecycle({
        ...fixture.lifecycleOptions,
        auth: adapter.auth,
        firestore: adapter.firestore,
      });

      await assert.rejects(() => lifecycle.seed(fixture.inputs), /cleanup.*new run/i);
      const mutations = calls.filter(call => /createUser|updateUser|setCustomUserClaims|revokeRefreshTokens|deleteUser|firestore\.set|firestore\.delete/.test(call));
      assert.deepEqual(mutations, []);
      assert.deepEqual([...fixture.auth.users], beforeAuth);
      assert.deepEqual([...fixture.firestore.documents], beforeFirestore);
      assert.equal(await readFile(fixture.inputs.manifestPath, 'utf8'), beforeManifest);
    });
  }
});

test('re-seed rejects omitted or one-alias transition journals before credential or adapter access', async t => {
  const cases = [
    { name: 'omitted transitions', alter(manifest) { delete manifest.transitions; } },
    {
      name: 'one transition alias',
      alter(manifest) {
        manifest.transitions = { 'qa-suspended': manifest.transitions['qa-suspended'] };
      },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async caseTest => {
      const fixture = await lifecycleFixture(caseTest);
      await fixture.lifecycle.seed(fixture.inputs);
      const malformed = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
      item.alter(malformed);
      await writeFile(fixture.inputs.manifestPath, `${JSON.stringify(malformed, null, 2)}\n`, { mode: 0o600, flag: 'w' });

      const beforeManifest = await readFile(fixture.inputs.manifestPath, 'utf8');
      const beforeCredentials = await readFile(fixture.inputs.credentialPath, 'utf8');
      const beforeAuth = structuredClone([...fixture.auth.users]);
      const beforeFirestore = structuredClone([...fixture.firestore.documents]);
      const calls = [];
      const adapter = directAdapter(fixture.auth, fixture.firestore, calls);
      const lifecycle = createLifecycle({
        ...fixture.lifecycleOptions,
        auth: adapter.auth,
        firestore: adapter.firestore,
      });

      await assert.rejects(() => lifecycle.seed(fixture.inputs), /transition/i);
      assert.deepEqual(calls, []);
      assert.equal(await readFile(fixture.inputs.manifestPath, 'utf8'), beforeManifest);
      assert.equal(await readFile(fixture.inputs.credentialPath, 'utf8'), beforeCredentials);
      assert.deepEqual([...fixture.auth.users], beforeAuth);
      assert.deepEqual([...fixture.firestore.documents], beforeFirestore);
    });
  }
});

test('seed pre-journals every intended resource before an ambiguous Auth create response', async t => {
  const fixture = await lifecycleFixture(t);
  const identity = fixture.definition.identities[0];
  fixture.auth.failAfterCreateFor = identity.uid;

  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /ambiguous Auth create/i);
  const partial = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(partial.state, 'partial');
  assert.deepEqual(partial.authUids, fixture.definition.identities.map(item => item.uid));
  assert.deepEqual(partial.firestorePaths, fixture.definition.documents.map(item => item.path));

  fixture.auth.failAfterCreateFor = null;
  const cleanup = await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(cleanup.retained.length, 0);
  await assert.rejects(() => fixture.auth.getUser(identity.uid), /not found/i);
});

test('seed cleanup recovers an exact marked document after an ambiguous Firestore response', async t => {
  const fixture = await lifecycleFixture(t);
  const target = fixture.definition.documents[0];
  fixture.firestore.failAfterSetPath = target.path;
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /ambiguous Firestore/i);
  assert.equal(fixture.firestore.has(target.path), true);
  fixture.firestore.failAfterSetPath = null;
  const cleanup = await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.deepEqual(cleanup.retained, []);
  assert.equal(fixture.firestore.has(target.path), false);
});

test('atomic manifest failure preserves the last complete JSON document and removes its temp file', async t => {
  const fixture = await lifecycleFixture(t);
  let beforeRenameCalls = 0;
  const lifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    faultInjector(stage) {
      if (stage === 'manifest.beforeRename' && ++beforeRenameCalls === 2) {
        throw new Error('simulated interruption before manifest rename');
      }
    },
  });
  await assert.rejects(() => lifecycle.seed(fixture.inputs), /interruption/i);
  const persisted = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(persisted.version, 2);
  assert.equal(persisted.state, 'partial');
  const names = await import('node:fs/promises').then(fs => fs.readdir(fixture.directory));
  assert.equal(names.some(name => name.includes('.manifest.json.') && name.endsWith('.tmp')), false);
});

test('cleanup retains an unmarked exact-namespace user from a forged partial manifest without ownership proof', async t => {
  const fixture = await lifecycleFixture(t);
  const identity = fixture.definition.identities[0];
  await fixture.auth.createUser({ uid: identity.uid, email: identity.email });
  await writeFile(fixture.inputs.manifestPath, JSON.stringify({
    version: 2,
    runId: RUN_ID,
    projectId: STAGING,
    authUids: [identity.uid],
    firestorePaths: [],
    state: 'partial',
    createdAt: '2026-08-24T14:00:00.000Z',
    updatedAt: '2026-08-24T14:00:00.000Z',
    expiresAt: EXPIRES_AT,
    transitions: approvedActiveTransitions(),
  }));
  const result = await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.deepEqual(result.deleted, { auth: 0, firestore: 0 });
  assert.deepEqual(result.retained, ['auth']);
  assert.equal((await fixture.auth.getUser(identity.uid)).uid, identity.uid);
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

  const mismatched = await lifecycleFixture(t, 'qa-phase7-20260824T140002Z-ef56ab78cd90');
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

test('credential publication hard exit leaves no partial target and only a private complete temp file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'qa-fixture-credential-publish-'));
  const manifestPath = join(directory, 'manifest.json');
  const credentialPath = join(directory, 'credentials.json');
  t.after(async () => {
    for (const name of await readdir(directory)) {
      await unlink(join(directory, name)).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  });
  const lifecycleUrl = pathToFileURL(resolve(repositoryRoot, 'scripts/qa-fixtures/lifecycle.mjs')).href;
  const definitionUrl = pathToFileURL(resolve(repositoryRoot, 'scripts/qa-fixtures/definition.mjs')).href;
  const script = `
    import { createLifecycle } from ${JSON.stringify(lifecycleUrl)};
    import { buildFixtureDefinition } from ${JSON.stringify(definitionUrl)};
    const users = new Map();
    const documents = new Map();
    const auth = {
      async getUser(uid) {
        if (!users.has(uid)) { const error = new Error('missing'); error.code = 'auth/user-not-found'; throw error; }
        return structuredClone(users.get(uid));
      },
      async createUser(input) { users.set(input.uid, { ...input, customClaims: {} }); },
      async updateUser(uid, input) { users.set(uid, { ...users.get(uid), ...input }); },
      async setCustomUserClaims(uid, claims) { users.set(uid, { ...users.get(uid), customClaims: structuredClone(claims) }); },
      async revokeRefreshTokens() {},
      async deleteUser(uid) { users.delete(uid); },
    };
    const firestore = {
      async get(path) { return documents.has(path) ? structuredClone(documents.get(path)) : null; },
      async set(path, data) { documents.set(path, structuredClone(data)); },
      async delete(path) { documents.delete(path); },
    };
    const definition = buildFixtureDefinition({ runId: ${JSON.stringify(RUN_ID)}, expiresAt: ${JSON.stringify(EXPIRES_AT)} });
    const lifecycle = createLifecycle({
      auth,
      firestore,
      definition,
      randomBytes: size => Buffer.alloc(size, 7),
      repositoryRoot: ${JSON.stringify(repositoryRoot)},
      manifestPath: ${JSON.stringify(manifestPath)},
      faultInjector(stage) { if (stage === 'credentials.beforePublish') process.exit(87); },
    });
    await lifecycle.seed({ manifestPath: ${JSON.stringify(manifestPath)}, credentialPath: ${JSON.stringify(credentialPath)} });
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { encoding: 'utf8' });
  assert.equal(child.status, 87, child.stderr || child.stdout);
  await assert.rejects(() => stat(credentialPath), /ENOENT/);
  const tempNames = (await readdir(directory)).filter(name => name.includes('.credentials.json.') && name.endsWith('.tmp'));
  assert.equal(tempNames.length, 1);
  const tempPath = join(directory, tempNames[0]);
  assert.equal((await stat(tempPath)).mode & 0o777, 0o600);
  const payload = JSON.parse(await readFile(tempPath, 'utf8'));
  assert.equal(payload.version, 1);
  assert.equal(payload.runId, RUN_ID);
  assert.equal(payload.identities.length, 9);
});

test('credential publication preserves a target that appears before exclusive publish', async t => {
  const fixture = await lifecycleFixture(t);
  const existing = 'operator-owned recovery marker';
  const lifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    async faultInjector(stage) {
      if (stage === 'credentials.beforePublish') {
        await writeFile(fixture.inputs.credentialPath, existing, { mode: 0o600, flag: 'wx' });
      }
    },
  });
  await assert.rejects(() => lifecycle.seed(fixture.inputs), /credential target appeared|recovery required/i);
  assert.equal(await readFile(fixture.inputs.credentialPath, 'utf8'), existing);
  const names = await readdir(fixture.directory);
  assert.equal(names.some(name => name.includes('.credentials.json.') && name.endsWith('.tmp')), false);
});

test('credential publication sanitizes unsupported hard-link capability failures', async t => {
  for (const [index, code] of ['EPERM', 'ENOTSUP', 'EOPNOTSUPP'].entries()) {
    await t.test(code, async caseTest => {
      const fixture = await lifecycleFixture(caseTest, `qa-phase7-20260824T14002${index + 1}Z-${code.toLowerCase()}ab12cd34ef56`);
      const lifecycle = createLifecycle({
        ...fixture.lifecycleOptions,
        async linkFile() {
          const error = new Error(`${fixture.inputs.credentialPath}: raw hard-link diagnostic`);
          error.code = code;
          throw error;
        },
      });

      await assert.rejects(() => lifecycle.seed(fixture.inputs), error => {
        assert.match(error.message, /credential recovery required/i);
        assert.equal(error.message.includes(fixture.directory), false);
        assert.equal(error.message.includes('raw hard-link diagnostic'), false);
        return true;
      });
      await assert.rejects(() => stat(fixture.inputs.credentialPath), /ENOENT/);
      const names = await readdir(fixture.directory);
      assert.equal(names.some(name => name.includes('.credentials.json.') && name.endsWith('.tmp')), false);
    });
  }
});

test('credential publication sanitizes an exact temporary-file unlink failure', async t => {
  const fixture = await lifecycleFixture(t, 'qa-phase7-20260824T140020Z-ab12cd34ef56');
  let retainedTempPath = null;
  t.after(async () => {
    if (retainedTempPath) {
      await unlink(retainedTempPath).catch(error => {
        if (error?.code !== 'ENOENT') throw error;
      });
    }
  });
  const lifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    async unlinkFile(path) {
      if (path.includes('.credentials.json.') && path.endsWith('.tmp')) {
        retainedTempPath = path;
        const error = new Error(`${path}: raw unlink diagnostic`);
        error.code = 'EACCES';
        throw error;
      }
      return unlink(path);
    },
  });

  await assert.rejects(() => lifecycle.seed(fixture.inputs), error => {
    assert.match(error.message, /credential recovery required/i);
    assert.equal(error.message.includes(fixture.directory), false);
    assert.equal(error.message.includes('raw unlink diagnostic'), false);
    return true;
  });
  assert.ok(retainedTempPath);
  const published = JSON.parse(await readFile(fixture.inputs.credentialPath, 'utf8'));
  assert.equal(published.runId, fixture.definition.runId);
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
  credentials.runId = 'qa-phase7-20260824T140099Z-aa99bb88cc77';
  await chmod(fixture.inputs.credentialPath, 0o600);
  await writeFile(fixture.inputs.credentialPath, JSON.stringify(credentials), { mode: 0o600, flag: 'w' });
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /credential recovery/i);
});

test('seed rebinds matching Auth user passwords to a validated exact-run credential file', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const credentials = JSON.parse(await readFile(fixture.inputs.credentialPath, 'utf8'));
  for (const identity of fixture.definition.identities) {
    await fixture.auth.updateUser(identity.uid, { password: 'different-password' });
  }
  await fixture.lifecycle.seed(fixture.inputs);
  for (const item of credentials.identities) {
    const identity = fixture.definition.identities.find(candidate => candidate.alias === item.alias);
    assert.equal((await fixture.auth.getUser(identity.uid)).password, item.password);
  }
});

test('credential reuse rejects an Auth user whose exact marker alias does not match', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const identity = fixture.definition.identities[0];
  const user = await fixture.auth.getUser(identity.uid);
  await fixture.auth.setCustomUserClaims(identity.uid, { ...user.customClaims, qaFixtureAlias: 'wrong-alias' });
  await assert.rejects(() => fixture.lifecycle.seed(fixture.inputs), /collision/i);
});

test('seed logger emits only sanitized fields and never credential values', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const credentials = JSON.parse(await readFile(fixture.inputs.credentialPath, 'utf8'));
  assert.ok(fixture.logs.length > 0);
  const output = JSON.stringify(fixture.logs);
  for (const item of credentials.identities) assert.equal(output.includes(item.password), false);
});

test('a throwing logger cannot downgrade a completed seed manifest', async t => {
  const fixture = await lifecycleFixture(t);
  const lifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    logger: () => { throw new Error('logger failure'); },
  });
  const manifest = await lifecycle.seed(fixture.inputs);
  assert.equal(manifest.state, 'seeded');
  assert.equal(JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8')).state, 'seeded');
});

test('inspect reports full sanitized absence drift for planned and partial manifests', async t => {
  for (const state of ['planned', 'partial']) {
    const fixture = await lifecycleFixture(t, state === 'planned'
      ? 'qa-phase7-20260824T140010Z-ab12cd34ef56'
      : 'qa-phase7-20260824T140011Z-cd34ef56ab78');
    const timestamp = '2026-08-24T14:00:00.000Z';
    await writeFile(fixture.inputs.manifestPath, `${JSON.stringify({
      version: 2,
      runId: fixture.definition.runId,
      projectId: STAGING,
      authUids: fixture.definition.identities.map(identity => identity.uid),
      firestorePaths: fixture.definition.documents.map(document => document.path),
      state,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: EXPIRES_AT,
      transitions: {
        'qa-suspended': { version: 1, state: 'active' },
        'qa-removed-member': { version: 1, state: 'active' },
      },
    }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });

    const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
    assert.equal(inspection.ok, false, state);
    assert.deepEqual(inspection.counts.actualPresent, { auth: 0, firestore: 0 });
    assert.equal(inspection.drift.length, 49);
    assert.equal(inspection.drift.filter(item => item.kind === 'auth').length, 9);
    assert.equal(inspection.drift.filter(item => item.kind === 'firestore').length, 40);
    assert.equal(inspection.drift.every(item => item.field === 'presence' && item.reason === 'missing'), true);
    const serialized = JSON.stringify(inspection.drift);
    assert.equal(serialized.includes(fixture.definition.runId), false);
    assert.equal(serialized.includes('users/'), false);
  }
});

test('inspect rejects unexpected Firestore fields while allowing only persisted negative transition shapes', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const team = fixture.definition.documents.find(document => document.kind === 'team');
  const original = await fixture.firestore.get(team.path);
  await fixture.firestore.set(team.path, { ...original, harmlessExtra: 'ordinary-value' });
  let inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(inspection.ok, false);
  assert.equal(inspection.drift.some(item => (
    item.kind === 'firestore'
    && item.alias === team.alias
    && item.field === 'shape'
    && item.reason === 'unexpected-fields'
  )), true);
  assert.equal(JSON.stringify(inspection.drift).includes('ordinary-value'), false);

  await fixture.firestore.set(team.path, original);
  await fixture.lifecycle.applyNegativeState('qa-suspended');
  await fixture.lifecycle.applyNegativeState('qa-removed-member');
  inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(inspection.ok, true);
  assert.equal(inspection.drift.length, 0);
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

test('inspect compares every deterministic fixture field and identifies exact drift categories', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const driftTargets = [
    [fixture.definition.documents.find(item => item.kind === 'team'), 'sentinel', 'wrong-sentinel'],
    [fixture.definition.documents.find(item => item.kind === 'member'), 'avatar', '/wrong.png'],
    [fixture.definition.documents.find(item => item.kind === 'membership-cache'), 'position', 'Wrong'],
    [fixture.definition.documents.find(item => item.kind === 'user'), 'activePlanId', 'pro'],
  ];
  for (const [document, field, value] of driftTargets) {
    const original = await fixture.firestore.get(document.path);
    await fixture.firestore.set(document.path, { ...original, [field]: value });
    const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
    assert.equal(inspection.ok, false, `${document.kind}.${field}`);
    assert.equal(inspection.drift.some(item => item.alias === document.alias && item.field === field), true);
    await fixture.firestore.set(document.path, original);
  }
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
  const manifest = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(manifest.transitions['qa-suspended'].state, 'suspended');
  assert.match(manifest.transitions['qa-suspended'].revokedAt, /Z$/);
  assert.equal(manifest.transitions['qa-removed-member'].state, 'removed');
  assert.match(manifest.transitions['qa-removed-member'].revokedAt, /Z$/);
  const cacheDefinition = fixture.definition.documents.find(item => item.path === member.membershipPath);
  await fixture.firestore.set(member.membershipPath, cacheDefinition.data);
  const drifted = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(drifted.ok, false);
  assert.equal(drifted.drift.some(item => item.field === 'presence' && item.reason === 'unexpected-after-transition'), true);
});

test('negative transition resumes after interruption between remote mutation and checkpoint persistence', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  let interrupted = false;
  const interruptedLifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    faultInjector(stage) {
      if (!interrupted && stage === 'transition.qa-suspended.afterFirestore') {
        interrupted = true;
        throw new Error('simulated transition interruption');
      }
    },
  });
  await assert.rejects(() => interruptedLifecycle.applyNegativeState('qa-suspended'), /interruption/i);
  let manifest = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(manifest.transitions['qa-suspended'].state, 'applying');
  assert.equal((await fixture.firestore.get(`users/${fixture.definition.identities.find(item => item.alias === 'qa-suspended').uid}`)).accountStatus, 'suspended');

  const result = await createLifecycle(fixture.lifecycleOptions).applyNegativeState('qa-suspended');
  assert.equal(result.state, 'suspended');
  assert.equal(result.resumed, true);
  manifest = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.equal(manifest.transitions['qa-suspended'].state, 'suspended');
  assert.match(manifest.transitions['qa-suspended'].firestoreUpdatedAt, /Z$/);
  assert.match(manifest.transitions['qa-suspended'].revokedAt, /Z$/);
});

test('removed-member transition resumes after an ambiguous cache deletion boundary', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  let interrupted = false;
  const lifecycle = createLifecycle({
    ...fixture.lifecycleOptions,
    faultInjector(stage) {
      if (!interrupted && stage === 'transition.qa-removed-member.afterCacheDelete') {
        interrupted = true;
        throw new Error('simulated cache deletion interruption');
      }
    },
  });
  await assert.rejects(() => lifecycle.applyNegativeState('qa-removed-member'), /interruption/i);
  const member = fixture.definition.members.find(item => item.alias === 'qa-removed-member');
  assert.equal(await fixture.firestore.get(member.membershipPath), null);
  const resumed = await createLifecycle(fixture.lifecycleOptions).applyNegativeState('qa-removed-member');
  assert.equal(resumed.resumed, true);
  assert.equal(resumed.state, 'removed');
  const manifest = JSON.parse(await readFile(fixture.inputs.manifestPath, 'utf8'));
  assert.match(manifest.transitions['qa-removed-member'].cacheDeletedAt, /Z$/);
  assert.match(manifest.transitions['qa-removed-member'].revokedAt, /Z$/);
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
  assert.deepEqual(fixture.firestore.deleted.sort(), [...manifest.firestorePaths].sort());
  const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(inspection.ok, true);
  assert.equal(inspection.states.manifest, 'cleaned');
  assert.deepEqual(inspection.counts.actualPresent, { auth: 0, firestore: 0 });
  assert.equal(inspection.states.problems, 0);
});

test('cleanup returns sanitized alias counts and continues after adapter read and delete failures', async t => {
  const fixture = await lifecycleFixture(t);
  await fixture.lifecycle.seed(fixture.inputs);
  const [authReadFailure, authDeleteFailure] = fixture.definition.identities;
  const [firestoreReadFailure, firestoreDeleteFailure] = fixture.definition.documents.filter(document => document.kind === 'team');
  fixture.auth.failGetFor = authReadFailure.uid;
  fixture.auth.failDeleteFor = authDeleteFailure.uid;
  fixture.firestore.failGetPath = firestoreReadFailure.path;
  fixture.firestore.failDeletePath = firestoreDeleteFailure.path;

  const result = await fixture.lifecycle.cleanup({ manifestPath: fixture.inputs.manifestPath });
  assert.equal(result.ok, false);
  assert.deepEqual(result.deleted, { auth: 7, firestore: 36 });
  assert.deepEqual(result.followUp, {
    retained: {
      auth: { count: 0, aliases: [] },
      firestore: { count: 2, aliases: ['qa-coach-owner-a', 'qa-coach-owner-b'] },
    },
    failures: {
      auth: { count: 2, aliases: ['qa-coach-owner-a', 'qa-coach-owner-b'] },
      firestore: { count: 2, aliases: ['qa-team-a', 'qa-team-b'] },
    },
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(RUN_ID), false);
  assert.equal(serialized.includes('users/'), false);
  assert.equal(serialized.includes('simulated'), false);
  assert.equal(fixture.auth.users.size, 2);
  assert.equal(fixture.firestore.documents.size, 4);
});

test('seed CLI stdout contains only aliases, counts, state, and opaque UID suffixes', async t => {
  const fixture = await lifecycleFixture(t);
  const lines = [];
  await runCli({
    argv: hostedArgs('seed', '--manifest', fixture.inputs.manifestPath, '--credentials', fixture.inputs.credentialPath, '--expires-at', EXPIRES_AT),
    env: hostedEnvironment(),
    cwd: repositoryRoot,
    runIdGenerator: () => RUN_ID,
    adapterFactory: async () => directAdapter(fixture.auth, fixture.firestore),
    stdout: line => lines.push(line),
  });
  const output = JSON.parse(lines.join(''));
  assert.deepEqual(Object.keys(output).sort(), ['aliases', 'command', 'counts', 'state', 'uidSuffixes']);
  assert.equal(JSON.stringify(output).includes(RUN_ID), false);
  assert.equal(JSON.stringify(output).includes('users/'), false);
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
