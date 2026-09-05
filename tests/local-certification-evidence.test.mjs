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
  validateScenarioResults,
} from '../scripts/qa/certification/local/evidence.mjs';

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
      assertions: [{ label: 'stored once', observed: 'true' }],
    }));
    await mkdir(path.join(directory, 'cleanup'));
    await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
      state: 'OBSERVED',
      counts: result.cleanup.counts,
    }));
    result.cleanup.proof = ['cleanup/marker.json'];
    assert.equal(validateScenarioResults([scenario], [result], options)[0].scenarioId, scenario.id);
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
  ];
  for (const unsafe of unsafeValues) {
    assert.throws(
      () => validateScenarioResults([scenario], [validResult({ cases: [unsafe] })]),
      /protected evidence value/,
    );
  }
});

test('recorder writes sanitized JSON and Markdown with explicit external blockers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'task3-evidence-'));
  try {
    await writeFile(path.join(directory, 'cleanup-marker-final-cert-t3-evidence-a1'), JSON.stringify({
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
    const written = await recorder.writeSummary({ markdownPath: path.join(directory, '02-identity.md') });
    assert.equal(written.results.length, 1);
    const json = JSON.parse(await readFile(path.join(directory, 'results.json'), 'utf8'));
    const markdown = await readFile(path.join(directory, '02-identity.md'), 'utf8');
    assert.equal(json.runId, 'final-cert-t3-evidence-a1');
    assert.deepEqual(json.runErrors, [{ stage: 'preflight', diagnostic: 'sanitized shared failure' }]);
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
