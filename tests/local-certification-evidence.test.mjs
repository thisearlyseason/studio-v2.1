import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import {
  DIMENSION_NAMES,
  OBSERVATION_STATES,
  createEvidenceRecorder,
  makeDimension,
  markdownForSummary,
  serializeEvidenceFailure,
  validateScenarioResults,
} from '../scripts/qa/certification/local/evidence.mjs';
import { tenantCaseAssociationFor } from '../scripts/qa/certification/local/batches/tenants.mjs';

const [scenario] = CERTIFICATION_SCENARIOS;

function validResult(overrides = {}) {
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    environmentGaps: ['staging'],
    commit: '0123456789abcdef0123456789abcdef01234567',
    revision: 'local',
    startedAt: '2026-09-04T18:00:00.000Z',
    completedAt: '2026-09-04T18:01:00.000Z',
    role: 'V',
    tenantAlias: 'not-applicable',
    dimensions: Object.fromEntries(DIMENSION_NAMES.map(name => [
      name,
      makeDimension('BLOCKED_PRECONDITION', [], `${name} requires staging evidence`),
    ])),
    cases: [],
    cleanup: {
      owner: scenario.cleanupOwner,
      selectors: ['fixture-run:final-cert-t3-evidence-a1'],
      counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
      state: 'OBSERVED',
      proof: ['cleanup-marker-final-cert-t3-evidence-a1'],
    },
    artifacts: [],
    missingDimensions: [...DIMENSION_NAMES],
    externalRequirements: ['exact staging revision'],
    outcome: 'BLOCKED_PRECONDITION',
    ...overrides,
  };
}

test('evidence states and dimensions match the strict local observation schema', () => {
  assert.deepEqual(OBSERVATION_STATES, [
    'OBSERVED', 'NOT_OBSERVED', 'BLOCKED_PRECONDITION', 'FAIL',
  ]);
  assert.deepEqual(DIMENSION_NAMES, [
    'happyPath', 'negativePath', 'permission', 'persistence', 'console', 'network', 'responsive',
  ]);
  assert.deepEqual(makeDimension('OBSERVED', ['case-a'], 'sanitized note'), {
    state: 'OBSERVED', caseIds: ['case-a'], note: 'sanitized note',
  });
  assert.ok(Object.isFrozen(makeDimension('OBSERVED')));
});

test('aggregate failure serialization preserves the original and every restoration cause', () => {
  const error = new AggregateError([
    new Error('operation failed'),
    new Error('restore team failed'),
    new Error('verify Storage failed'),
  ], 'operation and restoration failed');
  assert.deepEqual(serializeEvidenceFailure(error, value => String(value)), {
    diagnostic: 'operation and restoration failed',
    originalDiagnostic: 'operation failed',
    restorationDiagnostics: ['restore team failed', 'verify Storage failed'],
  });
});

test('validation rejects internally inconsistent observed dimensions, cases, gaps, and cleanup', () => {
  const observed = validResult({
    dimensions: Object.fromEntries(DIMENSION_NAMES.map(name => [
      name,
      makeDimension(name === 'happyPath' ? 'OBSERVED' : 'BLOCKED_PRECONDITION', name === 'happyPath' ? ['case-a'] : [], 'local evidence'),
    ])),
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
  });
  assert.throws(() => validateScenarioResults([scenario], [observed]), /missing referenced case case-a/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ missingDimensions: [] })]), /missingDimensions/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ cleanup: {
    ...validResult().cleanup,
    counts: { deleted: -1, restored: 0, retainedAuditRecords: 0 },
  } })]), /nonnegative cleanup counts/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ cleanup: {
    ...validResult().cleanup,
    selectors: [],
  } })]), /cleanup selectors/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ cleanup: {
    ...validResult().cleanup,
    proof: [],
  } })]), /cleanup proof/);
});

test('validation rejects unsupported environments, invalid time ranges, and blocked cleanup for observed cases', () => {
  const caseRecord = {
    actorAliases: ['qa-public-submitter'],
    caseId: 'marketing-local-happyPath',
    dimension: 'happyPath',
    role: 'V',
    tenantAlias: 'not-applicable',
    expected: 'stored once',
    observed: 'stored once',
    state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z',
    completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: ['cases/marketing-local-happyPath.json'],
  };
  const result = validResult({
    dimensions: {
      ...validResult().dimensions,
      happyPath: makeDimension('OBSERVED', [caseRecord.caseId], 'exact local case'),
    },
    cases: [caseRecord],
    artifacts: [...caseRecord.artifacts],
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
  });
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, environment: 'production' }]), /environment/i);
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, environmentGaps: [] }]), /environment gaps/i);
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, startedAt: 'not-a-time' }]), /timestamp/i);
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, completedAt: '2026-09-04T17:59:00.000Z' }]), /timestamp/i);
  assert.throws(() => validateScenarioResults([scenario], [{
    ...result,
    cleanup: { ...result.cleanup, state: 'BLOCKED_PRECONDITION' },
  }]), /cleanup state/i);
});

test('physical-device-owned rows retain local cleanup proof while their external cleanup gate remains blocked', async () => {
  const reminder = CERTIFICATION_SCENARIOS.find(item => item.id === 'reminders-same-day-fcm-scheduler');
  const directory = await mkdtemp(path.join(os.tmpdir(), 'reminder-cleanup-proof-'));
  const runId = 'final-cert-reminder-cleanup-proof';
  const commit = '0123456789abcdef0123456789abcdef01234567';
  try {
    await mkdir(path.join(directory, 'cleanup'));
    await writeFile(path.join(directory, 'cleanup/fixture-cleanup-marker.json'), JSON.stringify({
      runId, commit, fixtureRunId: 'reminder-fixture', state: 'OBSERVED',
      counts: { deleted: 4, restored: 0, retainedAuditRecords: 0 },
      measured: { fixture: { firestore: 4, auth: 0, storage: 0 }, dynamic: { state: 'OBSERVED', counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, reconciled: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, selectors: [], residuals: [], diagnostics: [] } },
      capturedAt: '2026-09-04T18:02:00.000Z',
    }));
    const result = {
      ...validResult({ scenarioId: reminder.id, role: reminder.roles.join('/'), environmentGaps: reminder.environments.filter(value => value !== 'local-emulator'), externalRequirements: ['physical-device receipt and cleanup evidence'] }),
      commit,
      cleanup: { owner: reminder.cleanupOwner, reference: 'fixture-cleanup-reminder', selectors: ['firestore:run-owned-reminder'], counts: { deleted: 4, restored: 0, retainedAuditRecords: 0 }, state: 'BLOCKED_PRECONDITION', proof: ['cleanup/fixture-cleanup-marker.json'] },
    };
    assert.equal(validateScenarioResults([reminder], [result], { artifactRoot: directory, expectedRunId: runId, expectedCommit: commit })[0].cleanup.state, 'BLOCKED_PRECONDITION');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('validation enforces required case IDs and inspectable contained artifact provenance', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'task3-artifact-validation-'));
  const casesDirectory = path.join(directory, 'cases');
  await mkdir(casesDirectory);
  const caseId = 'marketing-local-happyPath';
  const caseRecord = {
    actorAliases: ['qa-public-submitter'],
    caseId,
    dimension: 'happyPath',
    role: 'V',
    tenantAlias: 'not-applicable',
    expected: 'stored once',
    observed: 'stored once',
    state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z',
    completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: [`cases/${caseId}.json`],
  };
  const result = validResult({
    dimensions: {
      ...validResult().dimensions,
      happyPath: makeDimension('OBSERVED', [caseId], 'exact local case'),
    },
    cases: [caseRecord],
    artifacts: [...caseRecord.artifacts],
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
  });
  const options = {
    artifactRoot: directory,
    caseRequirements: { [scenario.id]: { happyPath: [caseId] } },
  };
  try {
    assert.throws(() => validateScenarioResults([scenario], [result], options), /artifact.*exist/i);
    await writeFile(path.join(casesDirectory, `${caseId}.json`), JSON.stringify({
      scenarioId: scenario.id,
      caseId,
      dimension: 'happyPath',
      actorAliases: caseRecord.actorAliases,
      expected: caseRecord.expected,
      observed: caseRecord.observed,
      capturedAt: '2026-09-04T18:00:01.500Z',
      assertions: [{ id: 'assertion-1', label: 'stored once', expected: 'true', observed: 'true', capturedAt: '2026-09-04T18:00:01.250Z' }],
    }));
    await mkdir(path.join(directory, 'cleanup'));
    await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
      state: 'OBSERVED',
      counts: result.cleanup.counts,
      capturedAt: '2026-09-04T18:02:00.000Z',
    }));
    result.cleanup.proof = ['cleanup/marker.json'];
    assert.equal(validateScenarioResults([scenario], [result], options)[0].scenarioId, scenario.id);
    await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
      state: 'OBSERVED', counts: result.cleanup.counts, capturedAt: '2026-09-04T18:02:00.000Z',
      nestedPrivateEnvelope: { dateOfBirth: 'synthetic-alias-value' },
    }));
    assert.throws(() => validateScenarioResults([scenario], [result], options), /non-allowlisted cleanup artifact fields/i);
    await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
      state: 'OBSERVED', counts: result.cleanup.counts, capturedAt: '2026-09-04T18:02:00.000Z',
    }));
    assert.throws(() => validateScenarioResults([scenario], [{
      ...result,
      cases: [{ ...caseRecord, caseId: 'uncontracted-case' }],
      dimensions: { ...result.dimensions, happyPath: makeDimension('OBSERVED', ['uncontracted-case'], 'bad') },
    }], options), /required case/i);
    assert.throws(() => validateScenarioResults([scenario], [{
      ...result,
      cases: [{ ...caseRecord, artifacts: ['../outside.json'] }],
      artifacts: ['../outside.json'],
    }], options), /contained/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('validation rejects observed outcomes with required environment gaps and adversarial artifact contents', async () => {
  assert.throws(() => validateScenarioResults([scenario], [validResult({
    outcome: 'OBSERVED',
    externalRequirements: [],
  })]), /environment gaps/i);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'task3-adversarial-artifact-'));
  await mkdir(path.join(directory, 'cases'));
  await mkdir(path.join(directory, 'cleanup'));
  const caseId = 'marketing-local-happyPath';
  const caseRecord = {
    actorAliases: ['qa-public-submitter'], caseId, dimension: 'happyPath', role: 'V',
    tenantAlias: 'not-applicable', expected: 'stored once', observed: 'stored once', state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: [`cases/${caseId}.json`],
  };
  const result = validResult({
    dimensions: { ...validResult().dimensions, happyPath: makeDimension('OBSERVED', [caseId], 'local') },
    cases: [caseRecord], artifacts: [...caseRecord.artifacts],
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
    cleanup: { ...validResult().cleanup, proof: ['cleanup/marker.json'] },
  });
  const options = {
    artifactRoot: directory,
    caseRequirements: { [scenario.id]: { happyPath: [caseId] } },
    expectedRunId: 'final-cert-t3-evidence-a1',
    expectedCommit: result.commit,
  };
  await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
    runId: options.expectedRunId, commit: result.commit, capturedAt: '2026-09-04T18:02:00.000Z',
    state: 'OBSERVED', counts: result.cleanup.counts,
  }));
  const writeArtifact = artifact => writeFile(path.join(directory, `cases/${caseId}.json`), JSON.stringify(artifact));
  const baseArtifact = {
    runId: options.expectedRunId, commit: result.commit,
    scenarioId: scenario.id, caseId, dimension: 'happyPath', actorAliases: caseRecord.actorAliases,
    expected: caseRecord.expected, observed: caseRecord.observed, capturedAt: '2026-09-04T18:00:01.500Z',
    assertions: [{ label: 'stored once', expected: 'true', observed: 'true', capturedAt: '2026-09-04T18:00:01.250Z' }],
  };
  try {
    await writeArtifact({ ...baseArtifact, assertions: [{ ...baseArtifact.assertions[0], observed: 'false' }] });
    assert.throws(() => validateScenarioResults([scenario], [result], options), /assertion.*mismatch/i);
    await writeArtifact({ ...baseArtifact, assertions: [{ ...baseArtifact.assertions[0], password: 'exposed' }] });
    assert.throws(() => validateScenarioResults([scenario], [result], options), /protected evidence/i);
    await writeArtifact({ ...baseArtifact, capturedAt: '2026-09-04T19:00:00.000Z' });
    assert.throws(() => validateScenarioResults([scenario], [result], options), /artifact timestamp/i);
    await writeArtifact({ ...baseArtifact, runId: 'foreign-run' });
    assert.throws(() => validateScenarioResults([scenario], [result], options), /run\/candidate provenance/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('validation reconciles successful case provenance with its observed dimension', () => {
  const caseRecord = {
    actorAliases: ['qa-public-submitter'],
    caseId: 'marketing-happy-local',
    dimension: 'happyPath',
    role: 'V',
    tenantAlias: 'not-applicable',
    expected: 'HTTP 202 accepted once',
    observed: 'HTTP 202 accepted once',
    state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z',
    completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: ['cases/marketing-happy-local.json'],
  };
  const dimensions = { ...validResult().dimensions, happyPath: makeDimension('OBSERVED', [caseRecord.caseId], 'local transport observed') };
  const result = validResult({
    dimensions,
    cases: [caseRecord],
    artifacts: [...caseRecord.artifacts],
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
  });
  assert.equal(validateScenarioResults([scenario], [result])[0].cases[0].caseId, caseRecord.caseId);
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, cases: [{ ...caseRecord, dimension: 'network' }] }]), /dimension mismatch/);
  assert.throws(() => validateScenarioResults([scenario], [{ ...result, cases: [caseRecord, caseRecord] }]), /duplicate case ID/);
  assert.throws(() => validateScenarioResults([scenario], [{
    ...result,
    cases: [{
      ...caseRecord,
      artifactEvents: [{
        expected: caseRecord.expected,
        observed: 'cleanup failed',
        state: 'FAIL',
        artifacts: [...caseRecord.artifacts],
      }],
    }],
  }]), /artifact event state/i);
});

test('validation requires exactly one complete result per selected scenario', () => {
  assert.deepEqual(validateScenarioResults([scenario], [validResult()]).map(result => result.scenarioId), [scenario.id]);
  assert.throws(() => validateScenarioResults([scenario], []), /Missing scenario result/);
  assert.throws(
    () => validateScenarioResults([scenario], [validResult(), validResult()]),
    /Duplicate scenario result/,
  );
  const dimensions = { ...validResult().dimensions };
  delete dimensions.network;
  assert.throws(
    () => validateScenarioResults([scenario], [validResult({ dimensions })]),
    /missing dimension network/,
  );
});

test('local evidence rejects final PASS and incomplete provenance or cleanup metadata', () => {
  assert.throws(() => validateScenarioResults([scenario], [validResult({ outcome: 'PASS' })]), /invalid outcome PASS/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ commit: '' })]), /requires commit/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ environment: '' })]), /requires environment/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ role: '' })]), /requires role/);
  assert.throws(() => validateScenarioResults([scenario], [validResult({ tenantAlias: '' })]), /requires tenantAlias/);
  assert.throws(
    () => validateScenarioResults([scenario], [validResult({ cleanup: { owner: scenario.cleanupOwner } })]),
    /requires cleanup counts/,
  );
});

test('evidence refuses credentials, session material, action links, query strings, and provider payloads', () => {
  const unsafeValues = [
    { note: 'password=NeverPersistThis' },
    { note: 'https://example.test/action?mode=reset&oobCode=abc' },
    { cookie: 'session=abc' },
    { authorization: 'Bearer abc' },
    { rawProviderPayload: { id: 'evt_123' } },
    { note: 'sk_live_1234567890' },
    { inviteToken: 'not-length-shaped' },
    { invite_token: 'short' },
    { parentUid: 'parent-public-alias-value' },
    { PARENT_UID: 'parent-public-alias-value' },
    { guardianUid: 'guardian-public-alias-value' },
    { GUARDIAN_UID: 'guardian-public-alias-value' },
    { childUid: 'child-public-alias-value' },
    { child_uid: 'child-public-alias-value' },
    { accessToken: 'short-access-material' },
    { ACCESS_TOKEN: 'short-access-material' },
    { medical_notes: 'private medical material' },
    { private_contact: 'private contact material' },
    { userId: 'unaliased-sensitive-uid' },
    { note: 'synthetic-private-roster-4' },
    { note: '/api/invites/youth?token=action-material' },
  ];
  for (const unsafe of unsafeValues) {
    assert.throws(
      () => validateScenarioResults([scenario], [validResult({ cases: [unsafe] })]),
      /protected evidence value/,
    );
  }
});

test('evidence uses closed result and nested metadata shapes instead of private-field denylists', () => {
  assert.throws(
    () => validateScenarioResults([scenario], [validResult({ extra: { dateOfBirth: 'alias-value' } })]),
    /non-allowlisted result fields/,
  );
  assert.throws(
    () => validateScenarioResults([scenario], [validResult({
      dimensions: { ...validResult().dimensions, happyPath: { ...validResult().dimensions.happyPath, phoneNumber: 'alias-value' } },
    })]),
    /non-allowlisted dimension fields/,
  );
  assert.throws(
    () => validateScenarioResults([scenario], [validResult({
      cleanup: { ...validResult().cleanup, counts: { ...validResult().cleanup.counts, homeAddress: 'alias-value' } },
    })]),
    /non-allowlisted cleanup count fields/,
  );
});

test('tenant evidence binds exact actor, target, operation, observations, and cleanup reference', () => {
  const tenantScenario = CERTIFICATION_SCENARIOS.find(item => item.id === 'teams-join-by-code');
  const association = tenantCaseAssociationFor(tenantScenario.id, 'happyPath');
  const caseId = 'team-join-happyPath';
  const caseRecord = {
    actorAliases: ['qa-public-submitter'],
    ...association,
    caseId,
    dimension: 'happyPath',
    role: tenantScenario.roles.join('/'),
    tenantAlias: 'qa-team-a',
    expected: 'exact team resolves',
    observed: 'exact team resolves',
    state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z',
    completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: ['cases/team-join-happyPath.json'],
    network: { transport: 'loopback-http', observed: true },
    console: { observed: false, reason: 'separate browser case' },
    responsive: { observed: false, reason: 'separate browser case' },
    cleanupRefs: ['fixture-cleanup-final-cert-t4-evidence-a1'],
    execution: {
      startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z',
      requests: [{
        transport: 'loopback-http', method: 'GET', route: '/api/teams/resolve', status: 200,
        executorAlias: 'qa-public-submitter', targetAlias: 'qa-team-a', operation: 'read',
        startedAt: '2026-09-04T18:00:01.100Z', completedAt: '2026-09-04T18:00:01.900Z',
      }],
      adminTargets: [], observations: [], reconciliations: [],
    },
  };
  const result = {
    scenarioId: tenantScenario.id,
    environment: 'local-emulator',
    environmentGaps: tenantScenario.environments.filter(value => value !== 'local-emulator'),
    commit: '0123456789abcdef0123456789abcdef01234567', revision: 'local',
    startedAt: '2026-09-04T18:00:00.000Z', completedAt: '2026-09-04T18:01:00.000Z',
    role: tenantScenario.roles.join('/'), tenantAlias: 'qa-team-a',
    dimensions: Object.fromEntries(DIMENSION_NAMES.map(name => [name,
      makeDimension(name === 'happyPath' ? 'OBSERVED' : 'BLOCKED_PRECONDITION', name === 'happyPath' ? [caseId] : [], 'exact local state'),
    ])),
    cases: [caseRecord],
    cleanup: {
      owner: tenantScenario.cleanupOwner, reference: 'fixture-cleanup-final-cert-t4-evidence-a1',
      selectors: ['fixture-run:final-cert-t4-evidence-a1'], counts: { deleted: 1, restored: 0, retainedAuditRecords: 0 },
      state: 'OBSERVED', proof: ['cleanup/marker.json'],
    },
    artifacts: [...caseRecord.artifacts],
    missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'),
    externalRequirements: ['exact staging revision'], outcome: 'BLOCKED_PRECONDITION',
  };
  const options = {
    caseShape: 'tenant',
    caseRequirements: { [tenantScenario.id]: { happyPath: [caseId] } },
    caseAssociationResolver: tenantCaseAssociationFor,
    operationContracts: { [tenantScenario.id]: [] },
  };
  assert.equal(validateScenarioResults([tenantScenario], [result], options)[0].cases[0].actorAlias, association.actorAlias);
  const replaceCase = replacement => [{ ...result, cases: [{ ...caseRecord, ...replacement }] }];
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({ actorAlias: 'qa-parent-b' }), options), /actorAlias|association|runtime operation/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({ targetAlias: 'qa-team-b' }), options), /association|runtime operation/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({ cleanupRefs: [] }), options), /associations/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({ network: {} }), options), /associations/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({ cleanupRefs: ['unrelated-cleanup'] }), options), /exact scenario cleanup/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({
    operation: 'create',
  }), options), /runtime operation/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({
    execution: { ...caseRecord.execution, requests: [], adminTargets: [], observations: [], reconciliations: [] },
  }), options), /runtime operation evidence/);
  assert.throws(() => validateScenarioResults([tenantScenario], replaceCase({
    execution: { ...caseRecord.execution, extra: { phoneNumber: 'alias-value' } },
  }), options), /non-allowlisted execution fields/i);
});

test('runtime family evidence rejects missing, mismatched, static, or late-registered child targets', () => {
  const tenantScenario = CERTIFICATION_SCENARIOS.find(item => item.id === 'family-children-invites-team-cards');
  const caseId = 'family-children-child-edit-and-two-card-refresh';
  const runtimeTarget = {
    alias: 'run-family-child-final-cert-t4-evidence',
    resourcePath: 'players/child_t4_final_cert_t4_evidence',
    registeredAt: '2026-09-04T18:00:00.000Z',
  };
  const association = tenantCaseAssociationFor(tenantScenario.id, 'happyPath', caseId, runtimeTarget);
  const caseRecord = {
    actorAliases: ['qa-parent-a'], ...association, runtimeTarget, caseId, dimension: 'happyPath',
    role: tenantScenario.roles.join('/'), tenantAlias: 'qa-team-a', expected: 'exact runtime child lifecycle',
    observed: 'exact runtime child lifecycle', state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z', artifacts: [],
    network: { transport: 'loopback-http', observed: true, reason: 'case-owned runtime request capture' },
    console: { observed: false, reason: 'separate browser case' },
    responsive: { observed: false, reason: 'separate browser case' }, cleanupRefs: ['fixture-cleanup-runtime-target'],
    execution: {
      startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z', runtimeTarget,
      requests: [{ transport: 'loopback-http', method: 'POST', route: '/api/family/children', status: 201,
        executorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'create',
        startedAt: '2026-09-04T18:00:01.100Z', completedAt: '2026-09-04T18:00:01.200Z' }],
      adminTargets: [],
      observations: [{ kind: 'case-work', actorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'update',
        startedAt: '2026-09-04T18:00:01.300Z', completedAt: '2026-09-04T18:00:01.900Z' }],
      reconciliations: [],
    },
  };
  const result = {
    scenarioId: tenantScenario.id, environment: 'local-emulator',
    environmentGaps: tenantScenario.environments.filter(value => value !== 'local-emulator'),
    commit: '0123456789abcdef0123456789abcdef01234567', revision: 'local',
    startedAt: '2026-09-04T18:00:00.000Z', completedAt: '2026-09-04T18:01:00.000Z',
    role: tenantScenario.roles.join('/'), tenantAlias: 'qa-team-a',
    dimensions: Object.fromEntries(DIMENSION_NAMES.map(name => [name,
      makeDimension(name === 'happyPath' ? 'OBSERVED' : 'BLOCKED_PRECONDITION', name === 'happyPath' ? [caseId] : [], 'exact local state'),
    ])),
    cases: [caseRecord],
    cleanup: { owner: tenantScenario.cleanupOwner, reference: 'fixture-cleanup-runtime-target', selectors: ['dynamic:runtime-child'],
      counts: { deleted: 1, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED', proof: ['cleanup/runtime-target.json'] },
    artifacts: [], missingDimensions: DIMENSION_NAMES.filter(name => name !== 'happyPath'), externalRequirements: ['exact staging revision'], outcome: 'BLOCKED_PRECONDITION',
  };
  const options = { caseShape: 'tenant', caseRequirements: { [tenantScenario.id]: { happyPath: [caseId] } }, caseAssociationResolver: tenantCaseAssociationFor, operationContracts: { [tenantScenario.id]: [] } };
  assert.equal(validateScenarioResults([tenantScenario], [result], options)[0].cases[0].targetAlias, runtimeTarget.alias);
  const replace = replacement => [{ ...result, cases: [{ ...caseRecord, ...replacement }] }];
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ runtimeTarget: undefined }), options), /registered runtime child target/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ targetAlias: 'qa-player-youth-a' }), options), /runtime target|association/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ runtimeTarget: { ...runtimeTarget, resourcePath: 'players/qa-player-youth-a' } }), options), /run-owned runtime target/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ execution: { ...caseRecord.execution, runtimeTarget: { ...runtimeTarget, alias: 'run-family-child-other' } } }), options), /bind its execution evidence/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ runtimeTarget: { ...runtimeTarget, registeredAt: '2026-09-04T18:00:01.500Z' }, execution: { ...caseRecord.execution, runtimeTarget: { ...runtimeTarget, registeredAt: '2026-09-04T18:00:01.500Z' } } }), options), /not registered before/i);
});

test('runtime family browser evidence requires in-interval lifecycle requests, reconciliation, and rendered observations', () => {
  const tenantScenario = CERTIFICATION_SCENARIOS.find(item => item.id === 'family-children-invites-team-cards');
  const caseId = 'family-children-workflow-console';
  const runtimeTarget = {
    alias: 'run-family-child-final-cert-t4-browser',
    resourcePath: 'players/child_t4_final_cert_t4_browser',
    registeredAt: '2026-09-04T18:00:00.000Z',
  };
  const association = tenantCaseAssociationFor(tenantScenario.id, 'console', caseId, runtimeTarget);
  const execution = {
    startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z', runtimeTarget,
    requests: [
      ['POST', '/api/family/children', 201, 'create', '01.100', '01.200'],
      ['POST', '/api/teams/join', 200, 'create', '01.210', '01.300'],
      ['PATCH', '/api/family/children', 200, 'update', '01.310', '01.400'],
      ['POST', '/api/teams/join', 200, 'create', '01.410', '01.500'],
      ['PATCH', '/api/family/children', 200, 'update', '01.510', '01.600'],
      ['DELETE', '/api/family/children', 200, 'delete', '01.610', '01.700'],
    ].map(([method, route, status, operation, started, completed]) => ({
      transport: 'loopback-http', method, route, status, executorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation,
      startedAt: `2026-09-04T18:00:${started}Z`, completedAt: `2026-09-04T18:00:${completed}Z`,
    })),
    adminTargets: [
      'family-runtime-after-create-link-relink',
      'family-runtime-after-browser-unlink',
      'family-runtime-after-browser-remove',
    ].map(sourceCaseId => ({ targetAlias: runtimeTarget.alias, actorAlias: 'qa-parent-a', operation: 'read', observedAt: '2026-09-04T18:00:01.800Z', sourceCaseId })),
    observations: [0, 1, 2].map(index => ({ kind: 'browser-render', actorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'read', startedAt: `2026-09-04T18:00:01.${510 + index * 10}Z`, completedAt: `2026-09-04T18:00:01.${519 + index * 10}Z` })),
    reconciliations: [
      'family-runtime-after-create-link-relink',
      'family-runtime-after-browser-unlink',
      'family-runtime-after-browser-remove',
    ].map(sourceCaseId => ({ sourceCaseId, actorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'persistence', startedAt: '2026-09-04T18:00:01.700Z', completedAt: '2026-09-04T18:00:01.800Z' })),
  };
  const caseRecord = {
    actorAliases: ['qa-parent-a'], ...association, runtimeTarget, caseId, dimension: 'console',
    role: tenantScenario.roles.join('/'), tenantAlias: 'qa-team-a', expected: 'browser runtime child lifecycle',
    observed: 'browser runtime child lifecycle', state: 'OBSERVED',
    startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:02.000Z', artifacts: [],
    network: { transport: 'loopback-http', observed: true, reason: 'case-owned runtime request capture' },
    console: { observed: true, reason: 'case-owned browser console capture' },
    responsive: { observed: false, reason: 'server probe; viewport is a separate dimension' },
    cleanupRefs: ['fixture-cleanup-runtime-browser-target'], execution,
  };
  const result = {
    scenarioId: tenantScenario.id, environment: 'local-emulator',
    environmentGaps: tenantScenario.environments.filter(value => value !== 'local-emulator'),
    commit: '0123456789abcdef0123456789abcdef01234567', revision: 'local',
    startedAt: '2026-09-04T18:00:00.000Z', completedAt: '2026-09-04T18:01:00.000Z',
    role: tenantScenario.roles.join('/'), tenantAlias: 'qa-team-a',
    dimensions: Object.fromEntries(DIMENSION_NAMES.map(name => [name,
      makeDimension(name === 'console' ? 'OBSERVED' : 'BLOCKED_PRECONDITION', name === 'console' ? [caseId] : [], 'exact local state'),
    ])),
    cases: [caseRecord],
    cleanup: { owner: tenantScenario.cleanupOwner, reference: 'fixture-cleanup-runtime-browser-target', selectors: ['dynamic:runtime-child'],
      counts: { deleted: 1, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED', proof: ['cleanup/runtime-browser-target.json'] },
    artifacts: [], missingDimensions: DIMENSION_NAMES.filter(name => name !== 'console'), externalRequirements: ['exact staging revision'], outcome: 'BLOCKED_PRECONDITION',
  };
  const options = { caseShape: 'tenant', caseRequirements: { [tenantScenario.id]: { console: [caseId] } }, caseAssociationResolver: tenantCaseAssociationFor, operationContracts: { [tenantScenario.id]: [] } };
  assert.equal(validateScenarioResults([tenantScenario], [result], options)[0].cases[0].targetAlias, runtimeTarget.alias);
  const replace = replacement => [{ ...result, cases: [{ ...caseRecord, ...replacement }] }];
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ execution: { ...execution, requests: [], adminTargets: [], observations: [{ ...execution.observations[0], kind: 'browser-work' }], reconciliations: [] } }), options), /browser runtime lifecycle evidence/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ execution: { ...execution, requests: execution.requests.map((request, index) => index === 0 ? { ...request, startedAt: '2026-09-04T18:00:02.001Z' } : request) } }), options), /outside its execution interval/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ execution: { ...execution, reconciliations: [] } }), options), /browser runtime lifecycle evidence/i);
  assert.throws(() => validateScenarioResults([tenantScenario], replace({ execution: { ...execution, reconciliations: execution.reconciliations.map(record => ({ ...record, targetAlias: 'qa-player-youth-a' })) } }), options), /browser runtime lifecycle evidence/i);
});

test('recorder writes sanitized JSON and Markdown with explicit external blockers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'task3-evidence-'));
  try {
    await writeFile(path.join(directory, 'cleanup-marker-final-cert-t3-evidence-a1'), JSON.stringify({
      runId: 'final-cert-t3-evidence-a1',
      commit: '0123456789abcdef0123456789abcdef01234567',
      capturedAt: '2026-09-04T18:02:00.000Z',
      state: 'OBSERVED',
      counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
    }));
    const recorder = createEvidenceRecorder({
      scenarios: [scenario],
      runId: 'final-cert-t3-evidence-a1',
      commit: '0123456789abcdef0123456789abcdef01234567',
      outputDir: directory,
    });
    recorder.recordScenario(validResult());
    recorder.recordRunError({ stage: 'preflight', diagnostic: 'sanitized shared failure' });
    recorder.recordRunError({
      scenarioId: scenario.id, stage: 'scenario-cleanup-or-runner', diagnostic: 'combined failure',
      originalDiagnostic: 'operation failure', restorationDiagnostics: ['restoration failure'],
    });
    const written = await recorder.writeSummary({ markdownPath: path.join(directory, '02-identity.md') });
    assert.equal(written.results.length, 1);
    const json = JSON.parse(await readFile(path.join(directory, 'results.json'), 'utf8'));
    const markdown = await readFile(path.join(directory, '02-identity.md'), 'utf8');
    assert.equal(json.runId, 'final-cert-t3-evidence-a1');
    assert.deepEqual(json.runErrors, [
      { stage: 'preflight', diagnostic: 'sanitized shared failure' },
      {
        scenarioId: scenario.id, stage: 'scenario-cleanup-or-runner', diagnostic: 'combined failure',
        originalDiagnostic: 'operation failure', restorationDiagnostics: ['restoration failure'],
      },
    ]);
    assert.match(markdown, /BLOCKED_PRECONDITION/);
    assert.match(markdown, /exact staging revision/);
    assert.doesNotMatch(markdown, /password|cookie|oobCode|Bearer/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Markdown renders one shared cleanup measurement with per-scenario ownership', () => {
  const secondScenario = CERTIFICATION_SCENARIOS[1];
  const first = validResult({ cleanup: { ...validResult().cleanup, reference: 'shared-cleanup' } });
  const second = {
    ...validResult(),
    scenarioId: secondScenario.id,
    environmentGaps: secondScenario.environments.filter(value => value !== 'local-emulator'),
    role: secondScenario.roles.join('/'),
    tenantAlias: 'catalog-scoped',
    cleanup: { ...validResult().cleanup, owner: secondScenario.cleanupOwner, reference: 'shared-cleanup' },
  };
  const markdown = markdownForSummary({
    runId: 'final-cert-t3-evidence-a1',
    commit: '0123456789abcdef0123456789abcdef01234567',
    results: [first, second],
    runErrors: [],
  });
  assert.equal((markdown.match(/deleted 0, restored 0, retained audit records 0/g) || []).length, 1);
  assert.ok(markdown.includes(`\`${scenario.id}\` (${scenario.cleanupOwner})`));
  assert.ok(markdown.includes(`\`${secondScenario.id}\` (${secondScenario.cleanupOwner})`));
});
