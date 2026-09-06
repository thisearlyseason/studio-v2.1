import { DIMENSION_NAMES, makeDimension } from '../evidence.mjs';
import { OPERATIONS_SCENARIO_IDS } from '../selection.mjs';

const caseId = (scenarioId, dimension) => `operations-${scenarioId}-${dimension}`;

// This registry is intentionally separate from cleanup ownership. Several
// operations rows have provider/background/device cleanup owners, but they
// still require a local operations contribution. Case IDs are explicit so a
// legacy-child event cannot accidentally satisfy a neighboring scenario.
export const LOCAL_OPERATIONS_CASE_REQUIREMENTS = Object.freeze(Object.fromEntries(
  OPERATIONS_SCENARIO_IDS.map(scenarioId => [scenarioId, Object.freeze(Object.fromEntries(
    DIMENSION_NAMES.map(dimension => [dimension, Object.freeze([caseId(scenarioId, dimension)])]),
  ))]),
));

function parseCertificationEvents(output) {
  return String(output || '').split(/\r?\n/).flatMap(line => {
    if (!line.startsWith('CERTIFICATION_EVENT ')) return [];
    try { return [JSON.parse(line.slice('CERTIFICATION_EVENT '.length))]; } catch { return []; }
  });
}

// Operations must never inherit the whole scenario assertion bag.  A case
// artifact may contain only assertions that its declared contract selected.
export function selectCaseOwnedOperationAssertions(assertions, requiredPatterns) {
  const selected = [];
  for (const pattern of requiredPatterns) {
    const matches = assertions.filter(assertion => pattern.test(assertion.label));
    if (matches.length === 0) throw new Error(`Missing required operation assertion: ${pattern}.`);
    for (const assertion of matches) if (!selected.includes(assertion)) selected.push(assertion);
  }
  return Object.freeze(selected);
}

function externalRequirementsFor(scenario) {
  return scenario.environments.filter(environment => environment !== 'local-emulator').map(environment => {
    if (environment === 'staging') return 'exact staging revision';
    if (environment === 'provider-test-mode') return 'approved QA provider test-mode delivery evidence';
    if (environment === 'physical-device') return 'physical-device receipt and cleanup evidence';
    if (environment === 'background-jobs') return 'deployed scheduler invocation with correlated logs';
    return `${environment} evidence`;
  });
}

function resultForScenario({ scenario, context, events, cleanup, execution }) {
  const requirements = LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenario.id];
  const cases = events.filter(event => event.type === 'case' && event.scenarioId === scenario.id &&
    DIMENSION_NAMES.includes(event.dimension) && requirements[event.dimension].includes(event.caseId));
  const dimensions = Object.fromEntries(DIMENSION_NAMES.map(dimension => {
    const expected = requirements[dimension];
    const matching = cases.filter(item => item.dimension === dimension);
    const matchingIds = new Set(matching.map(item => item.caseId));
    const failed = matching.some(item => item.state === 'FAIL');
    const observed = expected.every(id => matchingIds.has(id)) && matching.every(item => item.state === 'OBSERVED');
    const notObserved = matching.some(item => item.state === 'NOT_OBSERVED');
    return [dimension, makeDimension(
      failed ? 'FAIL' : observed ? 'OBSERVED' : notObserved ? 'NOT_OBSERVED' : 'BLOCKED_PRECONDITION',
      matching.map(item => item.caseId),
      failed ? 'A case-owned operational assertion failed.'
        : notObserved ? matching.map(item => item.observed).join(' ')
          : !context.browserEnabled && ['console', 'responsive'].includes(dimension)
            ? 'Browser mode was not enabled for this local operation run.'
            : `Missing exact operational case: ${expected.filter(id => !matchingIds.has(id)).join(', ')}.`,
    )];
  }));
  const missingDimensions = DIMENSION_NAMES.filter(dimension => dimensions[dimension].state !== 'OBSERVED');
  const sharedCleanup = cleanup || {
    cleanupId: 'shared-fixture-cleanup-not-observed', selectors: ['fixture-catalog-exact-selectors'],
    counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, state: 'BLOCKED_PRECONDITION', proof: [],
  };
  const localCleanup = scenario.cleanupOwner === 'local-batch' && sharedCleanup.state === 'OBSERVED';
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    environmentGaps: scenario.environments.filter(environment => environment !== 'local-emulator'),
    commit: context.commit,
    revision: 'local',
    startedAt: cases.map(item => item.startedAt).sort()[0] || execution.startedAt,
    completedAt: cases.map(item => item.completedAt).sort().at(-1) || execution.completedAt,
    role: scenario.roles.join('/'),
    tenantAlias: 'catalog-scoped',
    dimensions,
    cases,
    cleanup: {
      owner: scenario.cleanupOwner,
      reference: sharedCleanup.cleanupId,
      selectors: [...sharedCleanup.selectors],
      counts: { ...sharedCleanup.counts },
      state: localCleanup ? 'OBSERVED' : 'BLOCKED_PRECONDITION',
      proof: [...sharedCleanup.proof],
    },
    artifacts: [...new Set(cases.flatMap(item => item.artifacts || []))],
    missingDimensions,
    externalRequirements: externalRequirementsFor(scenario),
    outcome: cases.some(item => item.state === 'FAIL') ? 'FAIL' : 'BLOCKED_PRECONDITION',
  };
}

const operationHandler = async ({ scenario, context, events, cleanup, execution }) =>
  resultForScenario({ scenario, context, events, cleanup, execution });

export const handlers = Object.freeze(Object.fromEntries(
  OPERATIONS_SCENARIO_IDS.map(id => [id, operationHandler]),
));

export function assertOperationsHandlerExactness(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Operations handlers must be an object keyed by frozen scenario ID.');
  }
  const expected = new Set(OPERATIONS_SCENARIO_IDS);
  const actual = Object.keys(registry);
  const missing = OPERATIONS_SCENARIO_IDS.filter(id => !Object.prototype.hasOwnProperty.call(registry, id));
  const extra = actual.filter(id => !expected.has(id));
  if (missing.length > 0) throw new Error(`Operations handler registry is missing handler(s): ${missing.join(', ')}.`);
  if (extra.length > 0) throw new Error(`Operations handler registry has unexpected handler(s): ${extra.join(', ')}.`);
  for (const id of OPERATIONS_SCENARIO_IDS) {
    if (typeof registry[id] !== 'function') throw new Error(`Operations handler for ${id} must be a function.`);
  }
  return Object.freeze([...OPERATIONS_SCENARIO_IDS]);
}

assertOperationsHandlerExactness(handlers);

export async function runOperationsBatch(context, scenarios) {
  assertOperationsHandlerExactness(handlers);
  if (!context?.operations || typeof context.operations.execute !== 'function') {
    throw new Error('Operations batch requires the managed local lifecycle executor.');
  }
  const events = parseCertificationEvents(context.certificationObservation?.stdout || '');
  const cleanup = events.find(event => event.type === 'cleanup');
  const execution = {
    startedAt: context.certificationObservation?.startedAt || context.now(),
    completedAt: context.certificationObservation?.completedAt || context.now(),
  };
  const results = [];
  const runErrors = [];
  for (const scenario of scenarios) {
    try {
      results.push(await context.operations.execute({ scenario, handler: handlers[scenario.id], context, events, cleanup, execution }));
    } catch (error) {
      runErrors.push({
        scenarioId: scenario.id,
        stage: 'operations-dispatch',
        diagnostic: String(error instanceof Error ? error.message : error).slice(0, 500),
      });
    }
  }
  return { results, runErrors };
}
