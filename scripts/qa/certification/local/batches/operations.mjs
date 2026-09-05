import { OPERATIONS_SCENARIO_IDS } from '../selection.mjs';

// This registry is intentionally separate from cleanup ownership. Several
// operations rows have provider/background/device cleanup owners, but they
// still require a local operations contribution.
const operationHandler = async ({ scenario }) => ({ scenarioId: scenario.id });

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
  const results = [];
  const runErrors = [];
  for (const scenario of scenarios) {
    try {
      results.push(await context.operations.execute({ scenario, handler: handlers[scenario.id] }));
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
