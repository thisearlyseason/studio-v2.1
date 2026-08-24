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

const STAGING = STAGING_PROJECT_ID;
const RUN_ID = 'qa-phase7-20260824T140000Z-ab12';

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
