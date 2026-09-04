import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import {
  DIMENSION_NAMES,
  OBSERVATION_STATES,
  createEvidenceRecorder,
  makeDimension,
  validateScenarioResults,
} from '../scripts/qa/certification/local/evidence.mjs';

const [scenario] = CERTIFICATION_SCENARIOS;

function validResult(overrides = {}) {
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
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
      selectors: [],
      counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
      state: 'OBSERVED',
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
    const recorder = createEvidenceRecorder({
      scenarios: [scenario],
      runId: 'final-cert-t3-evidence-a1',
      commit: '0123456789abcdef0123456789abcdef01234567',
      outputDir: directory,
    });
    recorder.recordScenario(validResult());
    const written = await recorder.writeSummary({ markdownPath: path.join(directory, '02-identity.md') });
    assert.equal(written.results.length, 1);
    const json = JSON.parse(await readFile(path.join(directory, 'results.json'), 'utf8'));
    const markdown = await readFile(path.join(directory, '02-identity.md'), 'utf8');
    assert.equal(json.runId, 'final-cert-t3-evidence-a1');
    assert.match(markdown, /BLOCKED_PRECONDITION/);
    assert.match(markdown, /exact staging revision/);
    assert.doesNotMatch(markdown, /password|cookie|oobCode|Bearer/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
