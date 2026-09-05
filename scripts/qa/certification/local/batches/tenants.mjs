import { DIMENSION_NAMES, makeDimension } from '../evidence.mjs';
import { inspectTenantCapabilities, TENANT_SCENARIO_CAPABILITIES } from '../tenant-capabilities.mjs';
import { parseCertificationEvents } from './identity.mjs';

export const TENANT_EXECUTION_ORDER = Object.freeze([
  'roster-parent-player-self-views', 'recruiting-public-scout-projection',
  'family-children-invites-team-cards', 'organization-club-school-overview',
  'teams-create-and-capacity', 'teams-join-by-code',
  'teams-profile-branding-settings', 'teams-module-visibility',
  'roster-member-add-edit-remove-reinstate', 'roster-search-filter-sort-export',
  'recruiting-private-profile-crud', 'family-schedule-waivers-payments',
  'family-enable-youth-login', 'organization-create-allocate-remove-squads',
  'organization-global-waivers-documents-admins',
  'teams-seasonal-reset-delete-quota-resolution',
]);

const caseSet = prefix => Object.freeze(Object.fromEntries(DIMENSION_NAMES.map(dimension => [
  dimension, Object.freeze([`${prefix}-${dimension}`]),
])));

export const LOCAL_TENANT_CASE_REQUIREMENTS = Object.freeze(Object.fromEntries([
  ['teams-create-and-capacity', 'team-create'],
  ['teams-join-by-code', 'team-join'],
  ['teams-profile-branding-settings', 'team-settings'],
  ['teams-module-visibility', 'team-modules'],
  ['teams-seasonal-reset-delete-quota-resolution', 'team-destructive'],
  ['organization-club-school-overview', 'organization-overview'],
  ['organization-create-allocate-remove-squads', 'organization-squads'],
  ['organization-global-waivers-documents-admins', 'organization-documents'],
  ['roster-member-add-edit-remove-reinstate', 'roster-lifecycle'],
  ['roster-search-filter-sort-export', 'roster-discovery'],
  ['roster-parent-player-self-views', 'roster-self'],
  ['recruiting-private-profile-crud', 'recruiting-private'],
  ['recruiting-public-scout-projection', 'recruiting-public'],
  ['family-children-invites-team-cards', 'family-children'],
  ['family-schedule-waivers-payments', 'family-aggregates'],
  ['family-enable-youth-login', 'family-youth-login'],
].map(([id, prefix]) => [id, caseSet(prefix)])));

function resultForScenario({ scenario, context, events, cleanup, execution, capabilities }) {
  const requirements = LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id];
  const cases = events.filter(event => event.type === 'case' && event.scenarioId === scenario.id &&
    DIMENSION_NAMES.includes(event.dimension) && requirements[event.dimension].includes(event.caseId));
  const missingCapabilities = (TENANT_SCENARIO_CAPABILITIES[scenario.id] || [])
    .filter(name => capabilities.missing.includes(name));
  const dimensions = {};
  for (const dimension of DIMENSION_NAMES) {
    const matching = cases.filter(item => item.dimension === dimension);
    const failed = matching.some(item => item.state === 'FAIL');
    const observed = matching.length === requirements[dimension].length && matching.every(item => item.state === 'OBSERVED');
    const notObserved = matching.some(item => item.state === 'NOT_OBSERVED');
    dimensions[dimension] = makeDimension(
      failed ? 'FAIL' : observed ? 'OBSERVED' : notObserved ? 'NOT_OBSERVED' : 'BLOCKED_PRECONDITION',
      matching.map(item => item.caseId),
      failed ? 'A locally executed tenant case failed.' : observed ? 'The exact locally safe case was observed.' :
        missingCapabilities.length ? `Missing fixture capabilities: ${missingCapabilities.join(', ')}.` :
          !context.browserEnabled && ['console', 'responsive'].includes(dimension) ? 'Browser capability was not enabled.' :
            `The exact ${dimension} tenant journey was not emitted by the local child.`,
    );
  }
  const cleanupEvent = cleanup || { cleanupId: 'tenant-cleanup-not-observed', selectors: ['tenant-dynamic-registry'], counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, state: 'BLOCKED_PRECONDITION', proof: [] };
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    environmentGaps: scenario.environments.filter(value => value !== 'local-emulator'),
    commit: context.commit,
    revision: 'local',
    startedAt: cases.map(item => item.startedAt).sort()[0] || execution.startedAt,
    completedAt: cases.map(item => item.completedAt).sort().at(-1) || execution.completedAt,
    role: scenario.roles.join('/'),
    tenantAlias: scenario.roles.includes('V') ? 'public-recruiting-projection' : 'team-a+team-b+team-c',
    dimensions,
    cases,
    cleanup: { owner: scenario.cleanupOwner, reference: cleanupEvent.cleanupId, selectors: [...cleanupEvent.selectors], counts: { ...cleanupEvent.counts }, state: cleanupEvent.state, proof: [...cleanupEvent.proof] },
    artifacts: [...new Set(cases.flatMap(item => item.artifacts || []))],
    missingDimensions: DIMENSION_NAMES.filter(name => dimensions[name].state !== 'OBSERVED'),
    externalRequirements: ['exact staging revision', ...(scenario.id === 'family-enable-youth-login' ? ['approved QA mailbox delivery'] : [])],
    outcome: cases.some(item => item.state === 'FAIL') ? 'FAIL' : 'BLOCKED_PRECONDITION',
  };
}

export async function runTenantsBatch(context, scenarios) {
  const capabilities = inspectTenantCapabilities(context.fixtures);
  const observation = context.certificationObservation;
  const events = parseCertificationEvents(observation?.stdout || '');
  const cleanup = events.find(event => event.type === 'cleanup');
  const execution = { startedAt: observation?.startedAt || context.now(), completedAt: observation?.completedAt || context.now() };
  return {
    results: scenarios.map(scenario => resultForScenario({ scenario, context, events, cleanup, execution, capabilities })),
    runErrors: observation ? [] : [{ stage: 'tenant-child', diagnostic: 'Shared certification child observation was unavailable.' }],
  };
}
