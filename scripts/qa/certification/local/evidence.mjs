import { existsSync, readFileSync, realpathSync } from 'node:fs';
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

const PROTECTED_KEY_PATTERN = /(?:password|cookie|authorization|actionurl|actionlink|oobcode|rawproviderpayload|parentuid|invitetoken|(?:^|_)token|(?:^|_)uid|userid|sessiontoken|sessioncode|refreshtoken|idtoken|providersecret|joincode|teamcode|invitecode|medicalnotes|parentemail|privatecontact)/i;
// Normalize before matching so casing and punctuation cannot turn a protected
// credential or private subject identifier into admissible evidence.
const PROTECTED_NORMALIZED_KEYS = new Set([
  'parentuid', 'guardianuid', 'childuid', 'userid',
  'invitetoken', 'accesstoken', 'sessiontoken', 'sessioncode',
  'refreshtoken', 'idtoken', 'joincode', 'teamcode', 'invitecode',
  'medicalnotes', 'privatecontact', 'parentemail',
]);
const PROTECTED_VALUE_PATTERN = /(?:password\s*[=:]|cookie\s*[=:]|authorization\s*[=:]|bearer\s+[a-z0-9._~-]+|oobcode=|mode=(?:resetpassword|verifyemail)|sk_live_[a-z0-9]+|rk_live_[a-z0-9]+|synthetic-private-[a-z0-9_-]+|\b[a-f0-9]{48}\b)/i;
const URL_QUERY_PATTERN = /(?:https?:\/\/|\/)\S*\?\S+/i;

export function serializeEvidenceFailure(error, redact = value => String(value), maxLength = 500) {
  const nested = error instanceof AggregateError ? [...error.errors] : [];
  const original = nested[0] || error?.cause || error;
  const restoration = nested.slice(1);
  const clean = value => redact(value instanceof Error ? value.message : String(value)).slice(0, maxLength);
  return Object.freeze({
    diagnostic: clean(error),
    originalDiagnostic: clean(original),
    restorationDiagnostics: Object.freeze(restoration.map(clean)),
  });
}

function assertPlainString(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Scenario result requires ${label}.`);
}

function assertClosedObject(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  const unexpected = Object.keys(value).filter(key => !allowedKeys.includes(key));
  if (unexpected.length > 0) throw new Error(`${label} contains non-allowlisted ${label.toLowerCase()} fields: ${unexpected.join(', ')}.`);
}

function parseTimestamp(value, label) {
  assertPlainString(value, label);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`Scenario result requires an ISO timestamp for ${label}.`);
  }
  return parsed;
}

function resolveContainedArtifact(artifactRoot, relativePath) {
  assertPlainString(relativePath, 'artifact path');
  const root = realpathSync(artifactRoot);
  const candidate = path.resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path must be contained below the run artifact directory: ${relativePath}.`);
  }
  if (!existsSync(candidate)) throw new Error(`Artifact must exist: ${relativePath}.`);
  const realCandidate = realpathSync(candidate);
  if (realCandidate !== root && !realCandidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Artifact path must be contained below the run artifact directory: ${relativePath}.`);
  }
  return realCandidate;
}

function assertNoProtectedEvidence(value, pathLabel = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertNoProtectedEvidence(child, `${pathLabel}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (PROTECTED_KEY_PATTERN.test(key) || PROTECTED_NORMALIZED_KEYS.has(key.replace(/[^A-Za-z0-9]/g, '').toLowerCase())) {
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

function validateCleanup(scenario, result, { artifactRoot, expectedRunId, expectedCommit } = {}) {
  const cleanup = result.cleanup;
  if (!cleanup || typeof cleanup !== 'object') throw new Error(`${result.scenarioId} requires cleanup metadata.`);
  assertClosedObject(cleanup, ['owner', 'reference', 'selectors', 'counts', 'state', 'proof'], 'Cleanup');
  if (cleanup.owner !== scenario.cleanupOwner) {
    throw new Error(`${result.scenarioId} cleanup owner must remain ${scenario.cleanupOwner}.`);
  }
  if (!cleanup.counts || !Number.isInteger(cleanup.counts.deleted) ||
      !Number.isInteger(cleanup.counts.restored) ||
      !Number.isInteger(cleanup.counts.retainedAuditRecords)) {
    throw new Error(`${result.scenarioId} requires cleanup counts.`);
  }
  assertClosedObject(cleanup.counts, ['deleted', 'restored', 'retainedAuditRecords'], 'Cleanup count');
  if (Object.values(cleanup.counts).some(value => value < 0)) {
    throw new Error(`${result.scenarioId} requires nonnegative cleanup counts.`);
  }
  if (!Array.isArray(cleanup.selectors) || cleanup.selectors.length === 0) {
    throw new Error(`${result.scenarioId} requires cleanup selectors.`);
  }
  if (!Array.isArray(cleanup.proof) || cleanup.proof.length === 0) {
    throw new Error(`${result.scenarioId} requires cleanup proof.`);
  }
  if (!OBSERVATION_STATES.includes(cleanup.state)) {
    throw new Error(`${result.scenarioId} cleanup has invalid state ${cleanup.state}.`);
  }
  const hasObservedLocalCase = result.cases.some(item => item.state === 'OBSERVED');
  if (hasObservedLocalCase && scenario.cleanupOwner === 'local-batch' && cleanup.state !== 'OBSERVED') {
    throw new Error(`${result.scenarioId} observed local cases require an observed cleanup state.`);
  }
  if (artifactRoot) {
    for (const proof of cleanup.proof) {
      const proofPath = resolveContainedArtifact(artifactRoot, proof);
      const parsed = JSON.parse(readFileSync(proofPath, 'utf8'));
      assertNoProtectedEvidence(parsed, `cleanup artifact ${proof}`);
      assertClosedObject(parsed, ['runId', 'commit', 'fixtureRunId', 'state', 'counts', 'measured', 'capturedAt'], 'Cleanup artifact');
      assertClosedObject(parsed.counts, ['deleted', 'restored', 'retainedAuditRecords'], 'Cleanup artifact count');
      if (parsed.measured !== undefined) {
        assertClosedObject(parsed.measured, ['fixture', 'dynamic'], 'Cleanup measurement');
        assertClosedObject(parsed.measured.fixture, ['firestore', 'auth', 'storage'], 'Fixture cleanup measurement');
        const dynamic = parsed.measured.dynamic;
        assertClosedObject(dynamic, ['state', 'counts', 'reconciled', 'selectors', 'residuals', 'diagnostics'], 'Dynamic cleanup measurement');
        assertClosedObject(dynamic.counts, ['deleted', 'restored', 'retainedAuditRecords'], 'Dynamic cleanup count');
        assertClosedObject(dynamic.reconciled, ['deleted', 'restored', 'retainedAuditRecords'], 'Dynamic cleanup reconciliation');
        if (!Array.isArray(dynamic.selectors) || !Array.isArray(dynamic.residuals) || !Array.isArray(dynamic.diagnostics)) {
          throw new Error(`${result.scenarioId} cleanup measurement arrays are invalid.`);
        }
        for (const residual of dynamic.residuals) assertClosedObject(residual, ['id', 'kind'], 'Cleanup residual');
        for (const diagnostic of dynamic.diagnostics) assertClosedObject(diagnostic, ['id', 'attempt', 'diagnostic'], 'Cleanup diagnostic');
      }
      if ((expectedRunId && parsed.runId !== expectedRunId) || (expectedCommit && parsed.commit !== expectedCommit)) {
        throw new Error(`${result.scenarioId} cleanup proof run/candidate provenance does not match.`);
      }
      const cleanupCapturedAt = parseTimestamp(parsed.capturedAt, 'cleanup artifact capturedAt');
      if (cleanupCapturedAt < parseTimestamp(result.startedAt, 'result startedAt')) {
        throw new Error(`${result.scenarioId} cleanup proof timestamp predates the result.`);
      }
      // A local run can reconcile its disposable records even when the frozen
      // scenario assigns final cleanup to a later background or physical-device
      // batch. Preserve that external gate without discarding proven local
      // cleanup.
      const externalCleanupOwner = ['background-batch', 'physical-device-batch'].includes(scenario.cleanupOwner);
      const stateMatches = parsed.state === cleanup.state ||
        (externalCleanupOwner && cleanup.state === 'BLOCKED_PRECONDITION' && parsed.state === 'OBSERVED');
      if (!stateMatches || JSON.stringify(parsed.counts) !== JSON.stringify(cleanup.counts)) {
        throw new Error(`${result.scenarioId} cleanup proof does not reconcile with cleanup metadata.`);
      }
    }
  }
}

function validateFamilyBrowserRuntimeLifecycle(caseRecord, execution) {
  if (caseRecord.caseId !== 'family-children-workflow-console' && caseRecord.caseId !== 'family-children-workflow-responsive') return;
  const targetAlias = caseRecord.runtimeTarget?.alias;
  const requiredPhases = [
    'family-runtime-after-create-link-relink',
    'family-runtime-after-browser-unlink',
    'family-runtime-after-browser-remove',
  ];
  const matching = (method, route, operation, minimum = 1) => execution.requests.filter(request =>
    request.method === method && request.route === route && request.status >= 200 && request.status < 300 &&
    request.operation === operation && request.executorAlias === 'qa-parent-a' && request.targetAlias === targetAlias,
  ).length >= minimum;
  const rendered = execution.observations.filter(observation =>
    observation.kind === 'browser-render' && observation.actorAlias === 'qa-parent-a' &&
    observation.targetAlias === targetAlias && observation.operation === 'read',
  );
  const reconciledPhases = new Set(execution.reconciliations.filter(record =>
    record.actorAlias === 'qa-parent-a' && record.targetAlias === targetAlias && record.operation === 'persistence',
  ).map(record => record.sourceCaseId));
  const adminPhases = new Set(execution.adminTargets.filter(record =>
    record.actorAlias === 'qa-parent-a' && record.targetAlias === targetAlias && record.operation === 'read',
  ).map(record => record.sourceCaseId));
  const hasSyntheticOnlyObservation = execution.observations.some(observation => observation.kind === 'browser-work');
  if (!matching('POST', '/api/family/children', 'create') ||
      !matching('POST', '/api/teams/join', 'create', 2) ||
      !matching('PATCH', '/api/family/children', 'update', 2) ||
      !matching('DELETE', '/api/family/children', 'delete') ||
      rendered.length < 3 || hasSyntheticOnlyObservation ||
      requiredPhases.some(phase => !reconciledPhases.has(phase) || !adminPhases.has(phase))) {
    throw new Error(`${caseRecord.caseId} requires in-interval browser runtime lifecycle evidence, exact reconciliation, and rendered observations.`);
  }
}

function validateResult(scenario, result, { artifactRoot, caseRequirements, expectedRunId, expectedCommit, caseShape, caseAssociationResolver, operationContracts, operationAssertionOwners } = {}) {
  assertNoProtectedEvidence(result);
  assertClosedObject(result, [
    'scenarioId', 'environment', 'environmentGaps', 'commit', 'revision', 'startedAt', 'completedAt',
    'role', 'tenantAlias', 'dimensions', 'cases', 'cleanup', 'artifacts', 'missingDimensions',
    'externalRequirements', 'outcome',
  ], 'Result');
  assertPlainString(result.environment, 'environment');
  if (!scenario.environments.includes(result.environment)) {
    throw new Error(`${result.scenarioId} environment is outside its frozen contract.`);
  }
  if (!Array.isArray(result.environmentGaps)) throw new Error(`${result.scenarioId} requires environment gaps.`);
  const derivedEnvironmentGaps = scenario.environments.filter(value => value !== result.environment);
  if (JSON.stringify(result.environmentGaps) !== JSON.stringify(derivedEnvironmentGaps)) {
    throw new Error(`${result.scenarioId} environment gaps do not match its frozen contract.`);
  }
  assertPlainString(result.commit, 'commit');
  if (expectedCommit && result.commit !== expectedCommit) throw new Error(`${result.scenarioId} result candidate provenance does not match.`);
  assertPlainString(result.revision, 'revision');
  const resultStartedAt = parseTimestamp(result.startedAt, 'startedAt');
  const resultCompletedAt = parseTimestamp(result.completedAt, 'completedAt');
  if (resultCompletedAt < resultStartedAt) throw new Error(`${result.scenarioId} result timestamp order is invalid.`);
  assertPlainString(result.role, 'role');
  assertPlainString(result.tenantAlias, 'tenantAlias');
  if (!OBSERVATION_STATES.includes(result.outcome)) {
    throw new Error(`${result.scenarioId} has invalid outcome ${result.outcome}.`);
  }
  if (!result.dimensions || typeof result.dimensions !== 'object') {
    throw new Error(`${result.scenarioId} requires dimensions.`);
  }
  assertClosedObject(result.dimensions, DIMENSION_NAMES, 'Dimensions');
  if (!Array.isArray(result.cases) || !Array.isArray(result.artifacts) ||
      !Array.isArray(result.missingDimensions) || !Array.isArray(result.externalRequirements)) {
    throw new Error(`${result.scenarioId} requires case, artifact, missing-dimension, and external-requirement arrays.`);
  }
  const casesById = new Map();
  const observedAssertionLabels = new Set();
  const requiredByDimension = caseRequirements?.[scenario.id] || {};
  for (const caseRecord of result.cases) {
    assertClosedObject(caseRecord, [
      'actorAliases', 'actorAlias', 'targetAlias', 'operation', 'network', 'console', 'responsive',
      'cleanupRefs', 'execution', 'runtimeTarget', 'caseId', 'dimension', 'role', 'tenantAlias', 'expected', 'observed',
      'state', 'startedAt', 'completedAt', 'artifacts', 'artifactEvents', 'type', 'scenarioId', 'runId', 'commit',
      'diagnostic', 'diagnostics', 'originalDiagnostic', 'restorationDiagnostics',
    ], 'Case');
    assertPlainString(caseRecord.caseId, 'caseId');
    if (casesById.has(caseRecord.caseId)) throw new Error(`${result.scenarioId} has duplicate case ID ${caseRecord.caseId}.`);
    assertPlainString(caseRecord.dimension, 'case dimension');
    assertPlainString(caseRecord.role, 'case role');
    assertPlainString(caseRecord.tenantAlias, 'case tenantAlias');
    if (!Array.isArray(caseRecord.actorAliases) || caseRecord.actorAliases.length === 0 ||
        caseRecord.actorAliases.some(alias => typeof alias !== 'string' || alias.length === 0)) {
      throw new Error(`${caseRecord.caseId} requires exact actor aliases.`);
    }
    assertPlainString(caseRecord.expected, 'case expected');
    assertPlainString(caseRecord.observed, 'case observed');
    if (caseRecord.diagnostics !== undefined && (!Array.isArray(caseRecord.diagnostics) ||
        caseRecord.diagnostics.some(value => typeof value !== 'string' || value.length === 0))) {
      throw new Error(`${caseRecord.caseId} diagnostics must contain non-empty strings.`);
    }
    const caseStartedAt = parseTimestamp(caseRecord.startedAt, 'case startedAt');
    const caseCompletedAt = parseTimestamp(caseRecord.completedAt, 'case completedAt');
    if (caseCompletedAt < caseStartedAt || caseStartedAt < resultStartedAt || caseCompletedAt > resultCompletedAt) {
      throw new Error(`${caseRecord.caseId} timestamp range is invalid.`);
    }
    if (!['OBSERVED', 'NOT_OBSERVED', 'FAIL'].includes(caseRecord.state)) throw new Error(`${caseRecord.caseId} has invalid case state.`);
    if (!DIMENSION_NAMES.includes(caseRecord.dimension)) throw new Error(`${caseRecord.caseId} has invalid case dimension.`);
    if (!Array.isArray(caseRecord.artifacts)) throw new Error(`${caseRecord.caseId} requires artifacts.`);
    if (caseShape === 'operations' && caseRecord.state === 'OBSERVED') {
      const execution = caseRecord.execution;
      assertClosedObject(execution, ['actor', 'operation', 'requests', 'reconciliation', 'observer', 'timeBound', 'cleanupReference'], 'Operation execution');
      for (const key of ['actor', 'operation', 'reconciliation', 'observer', 'timeBound', 'cleanupReference']) assertPlainString(execution?.[key], `operation execution ${key}`);
      if (!Array.isArray(execution.requests) || execution.requests.length === 0) throw new Error(`${caseRecord.caseId} requires operation requests.`);
      for (const request of execution.requests) {
        assertClosedObject(request, ['method', 'pathname', 'status'], 'Operation request');
        assertPlainString(request.method, 'operation request method');
        assertPlainString(request.pathname, 'operation request pathname');
        if (request.status !== 'observed' && (!Number.isInteger(request.status) || request.status < 100 || request.status > 599)) throw new Error('Invalid operation request status.');
      }
      if (execution.cleanupReference !== result.cleanup?.reference) throw new Error(`${caseRecord.caseId} cleanup reference must bind the exact measured cleanup.`);
    }
    if (caseShape === 'tenant') {
      assertPlainString(caseRecord.actorAlias, 'case actorAlias');
      assertPlainString(caseRecord.targetAlias, 'case targetAlias');
      if (!['create', 'read', 'update', 'delete', 'permission', 'persistence'].includes(caseRecord.operation)) {
        throw new Error(`${caseRecord.caseId} requires a tenant operation.`);
      }
      if (!caseRecord.network || typeof caseRecord.network.transport !== 'string' || typeof caseRecord.network.observed !== 'boolean' ||
          !caseRecord.console || typeof caseRecord.console.observed !== 'boolean' ||
          !caseRecord.responsive || typeof caseRecord.responsive.observed !== 'boolean' ||
          !Array.isArray(caseRecord.cleanupRefs) || caseRecord.cleanupRefs.length === 0) {
        throw new Error(`${caseRecord.caseId} requires tenant network, console, responsive, and cleanup associations.`);
      }
      assertClosedObject(caseRecord.network, ['transport', 'observed', 'reason'], 'Network observation');
      assertClosedObject(caseRecord.console, ['observed', 'reason'], 'Console observation');
      assertClosedObject(caseRecord.responsive, ['observed', 'reason'], 'Responsive observation');
      if (caseRecord.runtimeTarget !== undefined) {
        const runtimeTarget = caseRecord.runtimeTarget;
        assertClosedObject(runtimeTarget, ['alias', 'resourcePath', 'registeredAt'], 'Runtime target');
        if (typeof runtimeTarget.alias !== 'string' || !/^run-family-child-[A-Za-z0-9_-]{1,180}$/.test(runtimeTarget.alias) ||
            typeof runtimeTarget.resourcePath !== 'string' || !/^players\/child_t4_[A-Za-z0-9_-]{1,200}$/.test(runtimeTarget.resourcePath)) {
          throw new Error(`${caseRecord.caseId} has an invalid run-owned runtime target.`);
        }
        if (caseRecord.targetAlias !== runtimeTarget.alias) {
          throw new Error(`${caseRecord.caseId} runtime target must match its exact target alias.`);
        }
        parseTimestamp(runtimeTarget.registeredAt, 'runtime target registeredAt');
      }
      if (operationContracts && caseRecord.state === 'OBSERVED') {
        const execution = caseRecord.execution;
        if (!execution || !Array.isArray(execution.requests) || !Array.isArray(execution.adminTargets) ||
            !Array.isArray(execution.observations) || !Array.isArray(execution.reconciliations)) {
          throw new Error(`${caseRecord.caseId} requires runtime request and Admin-reconciliation evidence.`);
        }
        assertClosedObject(execution, [
          'startedAt', 'completedAt', 'requests', 'adminTargets', 'observations', 'reconciliations', 'runtimeTarget',
        ], 'Execution');
        const executionStartedAt = parseTimestamp(execution.startedAt, 'execution startedAt');
        const executionCompletedAt = parseTimestamp(execution.completedAt, 'execution completedAt');
        if (executionStartedAt < caseStartedAt || executionCompletedAt > caseCompletedAt || executionCompletedAt < executionStartedAt) {
          throw new Error(`${caseRecord.caseId} execution interval is outside its case interval.`);
        }
        if (caseRecord.runtimeTarget !== undefined && JSON.stringify(execution.runtimeTarget) !== JSON.stringify(caseRecord.runtimeTarget)) {
          throw new Error(`${caseRecord.caseId} runtime target must bind its execution evidence.`);
        }
        for (const request of execution.requests) {
          const allowed = new Set([
            'transport', 'method', 'route', 'status', 'executorAlias', 'targetAlias', 'operation', 'startedAt', 'completedAt',
          ]);
          if (!request || Object.keys(request).some(key => !allowed.has(key)) ||
              request.transport !== 'loopback-http' || !/^(GET|POST|PATCH|PUT|DELETE)$/.test(request.method) ||
              !request.route?.startsWith('/') || request.route.includes('?') || !Number.isInteger(request.status) ||
              typeof request.executorAlias !== 'string' ||
              !['create', 'read', 'update', 'delete', 'permission', 'persistence'].includes(request.operation)) {
            throw new Error(`${caseRecord.caseId} has invalid allowlisted runtime request evidence.`);
          }
          const startedAt = parseTimestamp(request.startedAt, 'request startedAt');
          const completedAt = parseTimestamp(request.completedAt, 'request completedAt');
          if (completedAt < startedAt || startedAt < executionStartedAt || completedAt > executionCompletedAt) {
            throw new Error(`${caseRecord.caseId} request interval is outside its execution interval.`);
          }
        }
        for (const target of execution.adminTargets) {
          assertClosedObject(target, ['targetAlias', 'actorAlias', 'operation', 'observedAt', 'sourceCaseId'], 'Admin target');
          assertPlainString(target.targetAlias, 'Admin target alias');
          assertPlainString(target.actorAlias, 'Admin target actor alias');
          if (!['read', 'persistence'].includes(target.operation)) throw new Error(`${caseRecord.caseId} has invalid Admin target operation.`);
          const observedAt = parseTimestamp(target.observedAt, 'Admin target observedAt');
          if (observedAt < executionStartedAt || observedAt > executionCompletedAt) throw new Error(`${caseRecord.caseId} Admin target is outside its execution interval.`);
        }
        for (const [kind, records] of [['observation', execution.observations], ['reconciliation', execution.reconciliations]]) {
          for (const record of records) {
            assertClosedObject(record, [
              ...(kind === 'reconciliation' ? ['sourceCaseId'] : ['kind']),
              'actorAlias', 'targetAlias', 'operation', 'startedAt', 'completedAt',
            ], `${kind[0].toUpperCase()}${kind.slice(1)}`);
            if (kind === 'reconciliation') assertPlainString(record.sourceCaseId, 'reconciliation sourceCaseId');
            else assertPlainString(record.kind, 'observation kind');
            assertPlainString(record.actorAlias, `${kind} actorAlias`);
            assertPlainString(record.targetAlias, `${kind} targetAlias`);
            if (!['create', 'read', 'update', 'delete', 'permission', 'persistence'].includes(record.operation)) {
              throw new Error(`${caseRecord.caseId} has invalid ${kind} operation.`);
            }
            const startedAt = parseTimestamp(record.startedAt, `${kind} startedAt`);
            const completedAt = parseTimestamp(record.completedAt, `${kind} completedAt`);
            if (completedAt < startedAt || startedAt < executionStartedAt || completedAt > executionCompletedAt) {
              throw new Error(`${caseRecord.caseId} ${kind} interval is outside its execution interval.`);
            }
          }
        }
        const runtimeOperations = [
          ...execution.requests.map(request => ({ ...request, actorAlias: request.executorAlias })),
          ...execution.adminTargets.map(target => ({ ...target, startedAt: target.observedAt, completedAt: target.observedAt })),
          ...execution.observations,
          ...execution.reconciliations,
        ];
        if (runtimeOperations.length === 0) throw new Error(`${caseRecord.caseId} requires runtime operation evidence.`);
        if (!runtimeOperations.some(item => item.actorAlias === caseRecord.actorAlias &&
            item.targetAlias === caseRecord.targetAlias && item.operation === caseRecord.operation)) {
          throw new Error(`${caseRecord.caseId} runtime operation does not match its claimed actor, target, and operation.`);
        }
        if (caseRecord.runtimeTarget !== undefined) {
          const registeredAt = parseTimestamp(caseRecord.runtimeTarget.registeredAt, 'runtime target registeredAt');
          const boundOperations = runtimeOperations.filter(item => item.targetAlias === caseRecord.targetAlias);
          if (boundOperations.length === 0 || boundOperations.some(item => parseTimestamp(item.startedAt, 'runtime target operation startedAt') < registeredAt)) {
            throw new Error(`${caseRecord.caseId} runtime target was not registered before its bound operation.`);
          }
        }
        if (result.scenarioId === 'family-children-invites-team-cards') {
          validateFamilyBrowserRuntimeLifecycle(caseRecord, execution);
        }
      }
      if (!caseRecord.actorAliases.includes(caseRecord.actorAlias)) {
        throw new Error(`${caseRecord.caseId} actorAlias must be one of its exact actor aliases.`);
      }
      const expectedAssociation = caseAssociationResolver?.(result.scenarioId, caseRecord.dimension, caseRecord.caseId, caseRecord.runtimeTarget);
      if (expectedAssociation && (caseRecord.actorAlias !== expectedAssociation.actorAlias ||
          caseRecord.targetAlias !== expectedAssociation.targetAlias || caseRecord.operation !== expectedAssociation.operation)) {
        throw new Error(`${caseRecord.caseId} tenant actor, target, or operation association does not match its contract.`);
      }
    }
    const artifactEvents = Array.isArray(caseRecord.artifactEvents)
      ? caseRecord.artifactEvents
      : [{
          expected: caseRecord.expected,
          observed: caseRecord.observed,
          state: caseRecord.state,
          artifacts: caseRecord.artifacts,
        }];
    for (const event of artifactEvents) {
      assertClosedObject(event, ['expected', 'observed', 'state', 'artifacts'], 'Artifact event');
      assertPlainString(event.expected, 'artifact event expected');
      assertPlainString(event.observed, 'artifact event observed');
      if (!['OBSERVED', 'NOT_OBSERVED', 'FAIL'].includes(event.state) || !Array.isArray(event.artifacts) ||
          (event.state === 'NOT_OBSERVED' && event.artifacts.length > 0)) {
        throw new Error(`${caseRecord.caseId} has invalid artifact event provenance.`);
      }
    }
    const derivedArtifactEventState = artifactEvents.some(event => event.state === 'FAIL')
      ? 'FAIL'
      : artifactEvents.some(event => event.state === 'NOT_OBSERVED')
        ? 'NOT_OBSERVED'
        : 'OBSERVED';
    if (caseRecord.state !== derivedArtifactEventState) {
      throw new Error(`${caseRecord.caseId} artifact event state does not reconcile with its case state.`);
    }
    const eventArtifactUnion = [...new Set(artifactEvents.flatMap(event => event.artifacts))];
    if (JSON.stringify(eventArtifactUnion) !== JSON.stringify(caseRecord.artifacts)) {
      throw new Error(`${caseRecord.caseId} artifact event provenance does not reconcile with its artifacts.`);
    }
    const allowedCases = requiredByDimension[caseRecord.dimension];
    if (allowedCases && !allowedCases.includes(caseRecord.caseId)) {
      throw new Error(`${caseRecord.caseId} is not a required case for ${caseRecord.dimension}.`);
    }
    if (artifactRoot) {
      if (caseRecord.state !== 'NOT_OBSERVED' && caseRecord.artifacts.length === 0) throw new Error(`${caseRecord.caseId} requires an inspectable artifact.`);
      for (const artifact of caseRecord.artifacts) {
        const matchingArtifactEvents = artifactEvents.filter(event => event.artifacts.includes(artifact));
        if (matchingArtifactEvents.length !== 1) {
          throw new Error(`${caseRecord.caseId} artifact must map to one exact event.`);
        }
        const artifactEvent = matchingArtifactEvents[0];
        const artifactPath = resolveContainedArtifact(artifactRoot, artifact);
        const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));
        assertNoProtectedEvidence(parsed, `artifact ${artifact}`);
        assertClosedObject(parsed, [
          'runId', 'commit', 'scenarioId', 'caseId', 'dimension', 'actorAliases', 'role', 'tenantAlias',
          'actorAlias', 'targetAlias', 'operation', 'network', 'console', 'responsive', 'cleanupRefs', 'runtimeTarget',
          'execution', 'expected', 'observed', 'diagnostic', 'originalDiagnostic', 'restorationDiagnostics',
          'assertions', 'capturedAt',
        ], 'Artifact');
        if ((expectedRunId && parsed.runId !== expectedRunId) || (expectedCommit && parsed.commit !== expectedCommit)) {
          throw new Error(`${caseRecord.caseId} artifact run/candidate provenance does not match.`);
        }
        if (parsed.scenarioId !== result.scenarioId || parsed.caseId !== caseRecord.caseId || parsed.dimension !== caseRecord.dimension) {
          throw new Error(`${caseRecord.caseId} artifact provenance does not match its case.`);
        }
        if (JSON.stringify(parsed.actorAliases) !== JSON.stringify(caseRecord.actorAliases)) {
          throw new Error(`${caseRecord.caseId} artifact actor provenance does not match its case.`);
        }
        if (caseShape === 'tenant') {
          for (const key of ['actorAlias', 'targetAlias', 'operation', 'network', 'console', 'responsive', 'cleanupRefs', 'runtimeTarget', ...(operationContracts ? ['execution'] : [])]) {
            if (JSON.stringify(parsed[key]) !== JSON.stringify(caseRecord[key])) {
              throw new Error(`${caseRecord.caseId} artifact tenant association ${key} does not match its case.`);
            }
          }
        }
        if (caseShape === 'operations' && JSON.stringify(parsed.execution) !== JSON.stringify(caseRecord.execution)) {
          throw new Error(`${caseRecord.caseId} artifact execution does not match its case.`);
        }
        if (parsed.expected !== artifactEvent.expected || parsed.observed !== artifactEvent.observed) {
          throw new Error(`${caseRecord.caseId} artifact expected/observed provenance does not match its case.`);
        }
        const artifactCapturedAt = parseTimestamp(parsed.capturedAt, 'artifact capturedAt');
        if (artifactCapturedAt < caseStartedAt || artifactCapturedAt > caseCompletedAt) {
          throw new Error(`${caseRecord.caseId} artifact timestamp is outside its case range.`);
        }
        if (artifactEvent.state === 'OBSERVED' && (!Array.isArray(parsed.assertions) || parsed.assertions.length === 0)) {
          throw new Error(`${caseRecord.caseId} observed artifact requires exact assertions.`);
        }
        for (const assertion of parsed.assertions || []) {
          assertClosedObject(assertion, ['id', 'label', 'expected', 'observed', 'capturedAt'], 'Assertion');
          if (caseShape === 'operations' || assertion.id !== undefined) assertPlainString(assertion.id, 'artifact assertion id');
          if (caseShape === 'operations') {
            const owner = `${result.scenarioId}:${caseRecord.caseId}`;
            const previous = operationAssertionOwners.get(assertion.id);
            if (previous && previous !== owner) throw new Error(`${owner} reuses shared assertion ID ${assertion.id} from ${previous}.`);
            operationAssertionOwners.set(assertion.id, owner);
          }
          assertPlainString(assertion.label, 'artifact assertion label');
          if (String(assertion.expected) !== String(assertion.observed)) {
            throw new Error(`${caseRecord.caseId} artifact assertion mismatch for ${assertion.label}.`);
          }
          const assertionCapturedAt = parseTimestamp(assertion.capturedAt, 'artifact assertion capturedAt');
          if (assertionCapturedAt < caseStartedAt || assertionCapturedAt > caseCompletedAt) {
            throw new Error(`${caseRecord.caseId} artifact assertion timestamp is outside its case range.`);
          }
          observedAssertionLabels.add(assertion.label);
        }
      }
    }
    casesById.set(caseRecord.caseId, caseRecord);
  }
  const referencedCases = new Set();
  for (const name of DIMENSION_NAMES) {
    const dimension = result.dimensions[name];
    if (!dimension) throw new Error(`${result.scenarioId} is missing dimension ${name}.`);
    assertClosedObject(dimension, ['state', 'caseIds', 'note'], 'Dimension');
    if (!OBSERVATION_STATES.includes(dimension.state)) {
      throw new Error(`${result.scenarioId} dimension ${name} has invalid state ${dimension.state}.`);
    }
    if (!Array.isArray(dimension.caseIds)) {
      throw new Error(`${result.scenarioId} dimension ${name} requires caseIds.`);
    }
    if (dimension.state === 'OBSERVED' && dimension.caseIds.length === 0) {
      throw new Error(`${result.scenarioId} observed dimension ${name} requires cases.`);
    }
    const required = requiredByDimension[name];
    if (dimension.state === 'OBSERVED' && required &&
        (required.some(caseId => !dimension.caseIds.includes(caseId)) || dimension.caseIds.some(caseId => !required.includes(caseId)))) {
      throw new Error(`${result.scenarioId} observed ${name} does not contain its required case set.`);
    }
    for (const caseId of dimension.caseIds) {
      const caseRecord = casesById.get(caseId);
      if (!caseRecord) throw new Error(`${result.scenarioId} is missing referenced case ${caseId}.`);
      if (caseRecord.dimension !== name) throw new Error(`${caseId} dimension mismatch: expected ${name}.`);
      if (dimension.state === 'OBSERVED' && caseRecord.state !== 'OBSERVED') {
        throw new Error(`${caseId} cannot support observed dimension ${name}.`);
      }
      referencedCases.add(caseId);
    }
  }
  for (const caseId of casesById.keys()) {
    if (!referencedCases.has(caseId)) throw new Error(`${result.scenarioId} has unreferenced case ${caseId}.`);
  }
  const derivedMissing = DIMENSION_NAMES.filter(name => result.dimensions[name].state !== 'OBSERVED');
  if (JSON.stringify(result.missingDimensions) !== JSON.stringify(derivedMissing)) {
    throw new Error(`${result.scenarioId} missingDimensions do not match dimension states.`);
  }
  const hasFailure = DIMENSION_NAMES.some(name => result.dimensions[name].state === 'FAIL') ||
    result.cases.some(caseRecord => caseRecord.state === 'FAIL');
  if ((result.outcome === 'FAIL') !== hasFailure) throw new Error(`${result.scenarioId} outcome does not match case failures.`);
  if (result.outcome === 'OBSERVED' && (derivedMissing.length > 0 || result.externalRequirements.length > 0 || result.environmentGaps.length > 0)) {
    throw new Error(`${result.scenarioId} observed outcome conflicts with missing dimensions, external requirements, or environment gaps.`);
  }
  const artifactUnion = [...new Set(result.cases.flatMap(item => item.artifacts))];
  if (JSON.stringify(result.artifacts) !== JSON.stringify(artifactUnion)) {
    throw new Error(`${result.scenarioId} artifact list does not reconcile with case artifacts.`);
  }
  if (caseShape === 'tenant') {
    for (const caseRecord of result.cases) {
      if (!caseRecord.cleanupRefs.includes(result.cleanup.reference)) {
        throw new Error(`${caseRecord.caseId} cleanup references do not include the exact scenario cleanup.`);
      }
    }
    const requiredOperations = operationContracts?.[result.scenarioId] || [];
    const allLocalDimensionsObserved = DIMENSION_NAMES.every(name => result.dimensions[name].state === 'OBSERVED');
    if (allLocalDimensionsObserved && artifactRoot) {
      const missingOperations = requiredOperations.filter(label => !observedAssertionLabels.has(label));
      if (missingOperations.length > 0) {
        throw new Error(`${result.scenarioId} is missing mandatory executed assertions: ${missingOperations.join(', ')}.`);
      }
    }
  }
  validateCleanup(scenario, result, { artifactRoot, expectedRunId, expectedCommit });
  return result;
}

export function validateScenarioResults(scenarios, results, options = {}) {
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
  const operationAssertionOwners = new Map();
  return Object.freeze(scenarios.map(scenario => validateResult(scenario, resultsById.get(scenario.id), { ...options, operationAssertionOwners })));
}

export function markdownForSummary({ runId, commit, results, runErrors, title = 'Local certification' }) {
  const lines = [
    `# ${title} local certification observations`,
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
  if (runErrors.length > 0) {
    lines.push('', '## Shared run errors', '');
    for (const error of runErrors) lines.push(`- ${error.stage}: ${error.diagnostic}`);
  }
  lines.push('', '## Remaining external requirements', '');
  for (const result of results) {
    const requirements = result.externalRequirements.length > 0
      ? result.externalRequirements.join('; ')
      : 'none';
    lines.push(`- \`${result.scenarioId}\`: ${requirements}`);
  }
  lines.push('', '## Cleanup', '');
  const cleanupGroups = new Map();
  for (const result of results) {
    const reference = result.cleanup.reference || result.cleanup.proof.join('+');
    if (!cleanupGroups.has(reference)) cleanupGroups.set(reference, { cleanup: result.cleanup, results: [] });
    cleanupGroups.get(reference).results.push(result);
  }
  for (const [reference, group] of cleanupGroups) {
    const counts = group.cleanup.counts;
    lines.push(`- Shared proof \`${reference}\`: ${group.cleanup.state}; deleted ${counts.deleted}, restored ${counts.restored}, retained audit records ${counts.retainedAuditRecords}.`);
    for (const result of group.results) {
      lines.push(`  - \`${result.scenarioId}\` (${result.cleanup.owner}): ${result.cleanup.state}.`);
    }
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

export function createEvidenceRecorder({ scenarios, runId, commit, outputDir, caseRequirements, caseAssociationResolver, operationContracts, title = 'Local certification', batch }) {
  const recorded = [];
  const runErrors = [];
  return Object.freeze({
    recordScenario(result) {
      recorded.push(result);
    },
    recordRunError(error) {
      const unexpected = Object.keys(error || {}).filter(key => ![
        'scenarioId', 'stage', 'diagnostic', 'originalDiagnostic', 'restorationDiagnostics',
      ].includes(key));
      if (unexpected.length > 0) throw new Error(`Run error contains non-allowlisted fields: ${unexpected.join(', ')}.`);
      assertPlainString(error?.stage, 'run error stage');
      assertPlainString(error?.diagnostic, 'run error diagnostic');
      if (error.scenarioId !== undefined) assertPlainString(error.scenarioId, 'run error scenarioId');
      assertNoProtectedEvidence(error);
      if (error.originalDiagnostic !== undefined) assertPlainString(error.originalDiagnostic, 'run error originalDiagnostic');
      if (error.restorationDiagnostics !== undefined && (!Array.isArray(error.restorationDiagnostics) ||
          error.restorationDiagnostics.some(value => typeof value !== 'string' || value.length === 0))) {
        throw new Error('Run error restorationDiagnostics must be nonempty strings.');
      }
      runErrors.push({
        ...(error.scenarioId ? { scenarioId: error.scenarioId } : {}),
        stage: error.stage,
        diagnostic: error.diagnostic,
        ...(error.originalDiagnostic ? { originalDiagnostic: error.originalDiagnostic } : {}),
        ...(error.restorationDiagnostics ? { restorationDiagnostics: [...error.restorationDiagnostics] } : {}),
      });
    },
    async writeSummary({ markdownPath }) {
      const results = validateScenarioResults(scenarios, recorded, {
        artifactRoot: outputDir,
        caseRequirements,
        expectedRunId: runId,
        expectedCommit: commit,
        caseShape: batch === 'tenants' ? 'tenant' : batch === 'operations' ? 'operations' : 'identity',
        caseAssociationResolver,
        operationContracts,
      });
      const summary = { runId, commit, title, generatedAt: new Date().toISOString(), runErrors, results };
      assertNoProtectedEvidence(summary);
      await writeAtomically(path.join(outputDir, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
      await writeAtomically(markdownPath, markdownForSummary(summary));
      return summary;
    },
  });
}
