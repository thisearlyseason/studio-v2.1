import { CERTIFICATION_SCENARIOS } from '../scenario-catalog.mjs';

export const LOCAL_BATCH_ORDER = Object.freeze(['identity']);

export const SCENARIO_BATCH_ASSIGNMENTS = Object.freeze({
  identity: Object.freeze([
    'marketing-legal-contact-beta-coach-referral',
    'authentication-email-password-login',
    'authentication-logout-revocation-multi-tab',
    'authentication-password-reset',
    'account-lifecycle-disable-delete-cancel-purge',
    'signup-onboarding-coach-admin-league-parent-adult-player-signup',
    'signup-onboarding-youth-invitation-signup',
    'signup-onboarding-missing-profile-onboarding',
    'demo-seed-use-exit-expiry-cleanup',
    'dashboard-shell-role-landing-and-route-policy',
    'administration-access-and-user-directory',
  ]),
});

const assignmentByScenarioId = new Map(
  Object.entries(SCENARIO_BATCH_ASSIGNMENTS).flatMap(([batch, ids]) => (
    ids.map(id => [id, batch])
  )),
);

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a ${flag === '--batch' ? 'batch name' : 'scenario ID'}.`);
  return value;
}

export function parseLocalBatchArgs(argv) {
  if (!Array.isArray(argv)) throw new TypeError('Local certification arguments must be an array.');
  const batches = [];
  const scenarioIds = [];
  let browser = false;
  let failFast = false;
  let list = false;
  let allLocal = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === 'identity') {
      batches.push('identity');
      continue;
    }
    if (argument === '--batch') {
      const batch = readValue(argv, index, argument);
      if (!LOCAL_BATCH_ORDER.includes(batch)) throw new Error(`Unknown local batch ${batch}.`);
      batches.push(batch);
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      scenarioIds.push(readValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === '--browser') browser = true;
    else if (argument === '--fail-fast') failFast = true;
    else if (argument === '--list') list = true;
    else if (argument === '--all-local') allLocal = true;
    else throw new Error(`Unknown local certification argument ${argument}.`);
  }

  if (!list && !allLocal && batches.length === 0 && scenarioIds.length === 0) {
    throw new Error('Local certification requires --batch, --scenario, --all-local, --list, or positional identity.');
  }

  return {
    batches: allLocal ? [...LOCAL_BATCH_ORDER] : [...new Set(batches)],
    scenarioIds: [...new Set(scenarioIds)],
    browser,
    failFast,
    list,
  };
}

export function selectLocalScenarios({
  batches = [],
  scenarioIds = [],
  catalog = CERTIFICATION_SCENARIOS,
} = {}) {
  const byId = new Map(catalog.map(scenario => [scenario.id, scenario]));
  const requestedIds = new Set();

  for (const batch of batches) {
    const assigned = SCENARIO_BATCH_ASSIGNMENTS[batch];
    if (!assigned) throw new Error(`Unknown local batch ${batch}.`);
    assigned.forEach(id => requestedIds.add(id));
  }
  for (const id of scenarioIds) {
    if (!byId.has(id)) throw new Error(`Unknown certification scenario ${id}.`);
    if (!assignmentByScenarioId.has(id)) {
      throw new Error(`Certification scenario ${id} is not assigned to a local Task 3 batch.`);
    }
    requestedIds.add(id);
  }

  for (const id of requestedIds) {
    if (!byId.has(id)) throw new Error(`Assigned certification scenario ${id} is absent from the frozen catalog.`);
  }

  return Object.freeze(catalog.filter(scenario => requestedIds.has(scenario.id)));
}

export function groupScenariosByBatch(scenarios) {
  const grouped = new Map();
  for (const batch of LOCAL_BATCH_ORDER) {
    const values = scenarios.filter(scenario => assignmentByScenarioId.get(scenario.id) === batch);
    if (values.length > 0) grouped.set(batch, Object.freeze(values));
  }
  return grouped;
}
