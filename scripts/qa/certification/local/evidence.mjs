import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const OBSERVATION_STATES = Object.freeze([
  'OBSERVED',
  'NOT_OBSERVED',
  'BLOCKED_PRECONDITION',
  'FAIL',
]);

export const DIMENSION_NAMES = Object.freeze([
  'happyPath',
  'negativePath',
  'permission',
  'persistence',
  'console',
  'network',
  'responsive',
]);

const PROTECTED_KEY_PATTERN = /(?:password|cookie|authorization|actionurl|actionlink|oobcode|rawproviderpayload|sessiontoken|refreshtoken|idtoken|providersecret)/i;
const PROTECTED_VALUE_PATTERN = /(?:password\s*[=:]|cookie\s*[=:]|authorization\s*[=:]|bearer\s+[a-z0-9._~-]+|oobcode=|mode=(?:resetpassword|verifyemail)|sk_live_[a-z0-9]+|rk_live_[a-z0-9]+)/i;
const URL_QUERY_PATTERN = /https?:\/\/[^\s]+\?[^\s]+/i;

function assertPlainString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Scenario result requires ${label}.`);
}

function assertNoProtectedEvidence(value, pathLabel = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoProtectedEvidence(child, `${pathLabel}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (PROTECTED_KEY_PATTERN.test(key)) {
        throw new Error(`Found protected evidence value at ${pathLabel}.${key}.`);
      }
      assertNoProtectedEvidence(child, `${pathLabel}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && (PROTECTED_VALUE_PATTERN.test(value) || URL_QUERY_PATTERN.test(value))) {
    throw new Error(`Found protected evidence value at ${pathLabel}.`);
  }
}

export function makeDimension(state, caseIds = [], note = '') {
  if (!OBSERVATION_STATES.includes(state)) throw new Error(`Invalid observation state ${state}.`);
  return Object.freeze({
    state,
    caseIds: Object.freeze([...caseIds]),
    note,
  });
}

function validateCleanup(scenario, result) {
  const cleanup = result.cleanup;
  if (!cleanup || typeof cleanup !== 'object') throw new Error(`${result.scenarioId} requires cleanup metadata.`);
  if (cleanup.owner !== scenario.cleanupOwner) {
    throw new Error(`${result.scenarioId} cleanup owner must remain ${scenario.cleanupOwner}.`);
  }
  if (!cleanup.counts || !Number.isInteger(cleanup.counts.deleted) ||
      !Number.isInteger(cleanup.counts.restored) ||
      !Number.isInteger(cleanup.counts.retainedAuditRecords)) {
    throw new Error(`${result.scenarioId} requires cleanup counts.`);
  }
  if (!OBSERVATION_STATES.includes(cleanup.state)) {
    throw new Error(`${result.scenarioId} cleanup has invalid state ${cleanup.state}.`);
  }
}

function validateResult(scenario, result) {
  assertPlainString(result.environment, 'environment');
  assertPlainString(result.commit, 'commit');
  assertPlainString(result.revision, 'revision');
  assertPlainString(result.startedAt, 'startedAt');
  assertPlainString(result.completedAt, 'completedAt');
  assertPlainString(result.role, 'role');
  assertPlainString(result.tenantAlias, 'tenantAlias');
  if (!OBSERVATION_STATES.includes(result.outcome)) {
    throw new Error(`${result.scenarioId} has invalid outcome ${result.outcome}.`);
  }
  if (!result.dimensions || typeof result.dimensions !== 'object') {
    throw new Error(`${result.scenarioId} requires dimensions.`);
  }
  for (const name of DIMENSION_NAMES) {
    const dimension = result.dimensions[name];
    if (!dimension) throw new Error(`${result.scenarioId} is missing dimension ${name}.`);
    if (!OBSERVATION_STATES.includes(dimension.state)) {
      throw new Error(`${result.scenarioId} dimension ${name} has invalid state ${dimension.state}.`);
    }
    if (!Array.isArray(dimension.caseIds)) {
      throw new Error(`${result.scenarioId} dimension ${name} requires caseIds.`);
    }
  }
  validateCleanup(scenario, result);
  if (!Array.isArray(result.cases) || !Array.isArray(result.artifacts) ||
      !Array.isArray(result.missingDimensions) || !Array.isArray(result.externalRequirements)) {
    throw new Error(`${result.scenarioId} requires case, artifact, missing-dimension, and external-requirement arrays.`);
  }
  assertNoProtectedEvidence(result);
  return result;
}

export function validateScenarioResults(scenarios, results) {
  const scenariosById = new Map(scenarios.map(scenario => [scenario.id, scenario]));
  const resultsById = new Map();
  for (const result of results) {
    if (!scenariosById.has(result.scenarioId)) throw new Error(`Unexpected scenario result ${result.scenarioId}.`);
    if (resultsById.has(result.scenarioId)) throw new Error(`Duplicate scenario result ${result.scenarioId}.`);
    resultsById.set(result.scenarioId, result);
  }
  for (const scenario of scenarios) {
    if (!resultsById.has(scenario.id)) throw new Error(`Missing scenario result ${scenario.id}.`);
  }
  return Object.freeze(scenarios.map(scenario => validateResult(scenario, resultsById.get(scenario.id))));
}

function markdownForSummary({ runId, commit, results }) {
  const lines = [
    '# Task 3 identity local certification observations',
    '',
    `- Run: \`${runId}\``,
    `- Commit: \`${commit}\``,
    '- Environment: loopback Firebase emulators and local Next server only',
    '- Result boundary: local observations do not constitute final coverage-matrix PASS',
    '',
    '| Scenario | Outcome | Observed dimensions | Missing dimensions |',
    '|---|---|---|---|',
  ];
  for (const result of results) {
    const observed = DIMENSION_NAMES.filter(name => result.dimensions[name].state === 'OBSERVED');
    const missing = DIMENSION_NAMES.filter(name => result.dimensions[name].state !== 'OBSERVED');
    lines.push(`| \`${result.scenarioId}\` | ${result.outcome} | ${observed.join(', ') || 'none'} | ${missing.join(', ') || 'none'} |`);
  }
  lines.push('', '## Remaining external requirements', '');
  for (const result of results) {
    const requirements = result.externalRequirements.length > 0
      ? result.externalRequirements.join('; ')
      : 'none';
    lines.push(`- \`${result.scenarioId}\`: ${requirements}`);
  }
  lines.push('', '## Cleanup', '');
  for (const result of results) {
    const counts = result.cleanup.counts;
    lines.push(`- \`${result.scenarioId}\` (${result.cleanup.owner}): ${result.cleanup.state}; deleted ${counts.deleted}, restored ${counts.restored}, retained audit records ${counts.retainedAuditRecords}.`);
  }
  lines.push('');
  return lines.join('\n');
}

async function writeAtomically(filePath, contents) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, contents, { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, filePath);
}

export function createEvidenceRecorder({ scenarios, runId, commit, outputDir }) {
  const recorded = [];
  return Object.freeze({
    recordScenario(result) {
      recorded.push(result);
    },
    async writeSummary({ markdownPath }) {
      const results = validateScenarioResults(scenarios, recorded);
      const summary = { runId, commit, generatedAt: new Date().toISOString(), results };
      assertNoProtectedEvidence(summary);
      await writeAtomically(path.join(outputDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
      await writeAtomically(markdownPath, markdownForSummary(summary));
      return summary;
    },
  });
}
