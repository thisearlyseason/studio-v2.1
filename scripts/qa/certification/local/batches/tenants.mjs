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

const scenarioCaseSet = (prefix, workflow) => Object.freeze({
  happyPath: Object.freeze([`${prefix}-authorized-consumer-graph`, `${prefix}-${workflow}`]),
  negativePath: Object.freeze([`${prefix}-validation-boundaries`, `${prefix}-missing-target-denial`]),
  permission: Object.freeze([`${prefix}-role-boundary`, `${prefix}-cross-tenant-denial`]),
  persistence: Object.freeze([`${prefix}-saved-state-refresh`, `${prefix}-independent-session-reload`]),
  console: Object.freeze([`${prefix}-workflow-console`]),
  network: Object.freeze([`${prefix}-workflow-network`]),
  responsive: Object.freeze([`${prefix}-workflow-responsive`]),
});

const specializedCaseSet = (prefix, cases) => Object.freeze({
  happyPath: Object.freeze([`${prefix}-happyPath`, `${prefix}-${cases.happyPath}`]),
  negativePath: Object.freeze([`${prefix}-negativePath`, `${prefix}-${cases.negativePath}`]),
  permission: Object.freeze([`${prefix}-permission`, `${prefix}-${cases.permission}`]),
  persistence: Object.freeze([`${prefix}-persistence`, `${prefix}-${cases.persistence}`]),
  console: Object.freeze([`${prefix}-console`]),
  network: Object.freeze([`${prefix}-network`]),
  responsive: Object.freeze([`${prefix}-responsive`]),
});

const TENANT_SCENARIO_ASSOCIATION_BASE = Object.freeze({
  'teams-create-and-capacity': ['qa-fresh-coach', 'run-created-squad'],
  'teams-join-by-code': ['qa-public-submitter', 'qa-team-a'],
  'teams-profile-branding-settings': ['qa-coach-owner-a', 'qa-team-a'],
  'teams-module-visibility': ['qa-coach-owner-a', 'qa-team-a'],
  'teams-seasonal-reset-delete-quota-resolution': ['qa-owner-delete-blocked', 'run-created-reset-squad'],
  'organization-club-school-overview': ['qa-school-owner', 'qa-school'],
  'organization-create-allocate-remove-squads': ['qa-school-owner', 'qa-school'],
  'organization-global-waivers-documents-admins': ['qa-school-owner', 'qa-school'],
  'roster-member-add-edit-remove-reinstate': ['qa-coach-owner-a', 'qa-team-a'],
  'roster-search-filter-sort-export': ['qa-coach-owner-a', 'qa-team-a'],
  'roster-parent-player-self-views': ['qa-parent-a', 'qa-player-youth-a'],
  'recruiting-private-profile-crud': ['qa-coach-owner-a', 'qa-player-adult-a'],
  'recruiting-public-scout-projection': ['qa-public-submitter', 'qa-player-adult-b'],
  'family-children-invites-team-cards': ['qa-parent-a', 'qa-player-youth-a'],
  'family-schedule-waivers-payments': ['qa-parent-a', 'qa-household-a'],
  'family-enable-youth-login': ['qa-parent-a', 'qa-player-youth-c'],
});

const OPERATION_BY_DIMENSION = Object.freeze({
  happyPath: 'create', negativePath: 'permission', permission: 'permission', persistence: 'persistence',
  console: 'read', network: 'read', responsive: 'read',
});

export function tenantCaseAssociationFor(scenarioId, dimension, caseId = '') {
  const base = TENANT_SCENARIO_ASSOCIATION_BASE[scenarioId];
  if (!base || !OPERATION_BY_DIMENSION[dimension]) return null;
  if (scenarioId === 'teams-create-and-capacity') {
    return Object.freeze({
      actorAlias: dimension === 'permission' && caseId.endsWith('-tenant-isolation') ? 'qa-coach-owner-b' : 'qa-fresh-coach',
      targetAlias: base[1],
      operation: dimension === 'happyPath' ? 'create'
        : dimension === 'negativePath' || dimension === 'permission' ? 'permission'
          : dimension === 'persistence' ? 'persistence' : 'read',
    });
  }
  if (scenarioId === 'teams-module-visibility' && ['console', 'responsive'].includes(dimension)) {
    return Object.freeze({ actorAlias: 'qa-team-member', targetAlias: base[1], operation: 'read' });
  }
  if (scenarioId === 'teams-join-by-code' && caseId.endsWith('-guardian-child-enrollment-race')) {
    return Object.freeze({ actorAlias: 'qa-parent-a', targetAlias: base[1], operation: 'create' });
  }
  if (scenarioId === 'teams-join-by-code' && caseId.endsWith('-inactive-code-current-state-denial')) {
    return Object.freeze({ actorAlias: 'qa-parent-a', targetAlias: base[1], operation: 'permission' });
  }
  if (scenarioId === 'teams-join-by-code' && caseId.endsWith('-cross-guardian-enrollment-denial')) {
    return Object.freeze({ actorAlias: 'qa-parent-b', targetAlias: base[1], operation: 'permission' });
  }
  if (scenarioId === 'family-enable-youth-login' && ['console', 'responsive'].includes(dimension)) {
    return Object.freeze({ actorAlias: 'qa-youth-invite', targetAlias: base[1], operation: 'read' });
  }
  if (scenarioId === 'recruiting-public-scout-projection' && caseId.endsWith('-canonical-editor-status-transitions')) {
    return Object.freeze({ actorAlias: 'qa-coach-owner-b', targetAlias: base[1], operation: 'update' });
  }
  if (scenarioId === 'teams-seasonal-reset-delete-quota-resolution') {
    return Object.freeze({
      actorAlias: dimension === 'permission' ? 'qa-coach-owner-b' : 'qa-owner-delete-blocked',
      targetAlias: base[1],
      operation: ['happyPath', 'persistence'].includes(dimension) ? 'delete'
        : dimension === 'negativePath' || dimension === 'permission' ? 'permission' : 'read',
    });
  }
  const mutationLifecycleScenarios = new Set([
    'teams-profile-branding-settings', 'teams-module-visibility',
    'organization-club-school-overview', 'organization-create-allocate-remove-squads',
    'organization-global-waivers-documents-admins', 'roster-member-add-edit-remove-reinstate',
    'roster-search-filter-sort-export', 'roster-parent-player-self-views',
    'recruiting-private-profile-crud', 'family-children-invites-team-cards',
    'family-schedule-waivers-payments',
  ]);
  const specialized = ['teams-join-by-code', 'recruiting-public-scout-projection', 'family-enable-youth-login'].includes(scenarioId);
  const outsider = scenarioId === 'recruiting-public-scout-projection' ? 'qa-coach-owner-a'
    : scenarioId.startsWith('family-') ? 'qa-parent-b' : 'qa-coach-owner-b';
  const actorAlias = scenarioId === 'family-enable-youth-login' && caseId.endsWith('-guardian-invite-and-youth-activation') ? 'qa-youth-invite'
    : dimension === 'negativePath' || dimension === 'network' ? 'qa-public-submitter'
    : dimension === 'permission' ? (specialized && !caseId.endsWith('-tenant-isolation') ? 'qa-public-submitter' : outsider)
      : base[0];
  const isMandatoryMutationCase = LOCAL_TENANT_CASE_REQUIREMENTS[scenarioId]?.happyPath?.[1] === caseId;
  const operation = dimension === 'happyPath' && scenarioId === 'family-enable-youth-login' ? 'create'
    : dimension === 'happyPath' && isMandatoryMutationCase && mutationLifecycleScenarios.has(scenarioId) ? 'update'
    : dimension === 'happyPath' ? 'read' : OPERATION_BY_DIMENSION[dimension];
  return Object.freeze({ actorAlias, targetAlias: base[1], operation });
}

export const LOCAL_TENANT_CASE_REQUIREMENTS = Object.freeze({
  'teams-create-and-capacity': specializedCaseSet('team-create', {
    happyPath: 'fresh-role-creator-graph', negativePath: 'missing-target-denial',
    permission: 'cross-tenant-created-team-denial', persistence: 'created-graph-independent-read',
  }),
  'teams-join-by-code': specializedCaseSet('team-join', {
    happyPath: 'guardian-child-enrollment-race', negativePath: 'inactive-code-current-state-denial',
    permission: 'cross-guardian-enrollment-denial', persistence: 'opaque-session-independent-reload',
  }),
  'teams-profile-branding-settings': scenarioCaseSet('team-settings', 'owner-settings-and-branding-edit'),
  'teams-module-visibility': scenarioCaseSet('team-modules', 'all-eight-toggle-and-direct-denial'),
  'teams-seasonal-reset-delete-quota-resolution': specializedCaseSet('team-destructive', {
    happyPath: 'complete-reset-projection-reconciliation', negativePath: 'missing-target-denial',
    permission: 'cross-tenant-reset-denial', persistence: 'repeat-reset-state-reconciliation',
  }),
  'organization-club-school-overview': scenarioCaseSet('organization-overview', 'constituent-count-and-visibility-refresh'),
  'organization-create-allocate-remove-squads': scenarioCaseSet('organization-squads', 'seat-release-and-reallocation'),
  'organization-global-waivers-documents-admins': scenarioCaseSet('organization-documents', 'master-copy-update-and-admin-boundary'),
  'roster-member-add-edit-remove-reinstate': scenarioCaseSet('roster-lifecycle', 'remove-reinstate-projection'),
  'roster-search-filter-sort-export': scenarioCaseSet('roster-discovery', 'accented-filter-and-manifest-download'),
  'roster-parent-player-self-views': scenarioCaseSet('roster-self', 'guardian-child-edit-and-sibling-boundary'),
  'recruiting-private-profile-crud': scenarioCaseSet('recruiting-private', 'profile-metrics-contact-media-edit'),
  'recruiting-public-scout-projection': specializedCaseSet('recruiting-public', {
    happyPath: 'canonical-editor-status-transitions', negativePath: 'missing-target-denial',
    permission: 'cross-tenant-private-root-denial', persistence: 'canonical-profile-independent-read',
  }),
  'family-children-invites-team-cards': scenarioCaseSet('family-children', 'child-edit-and-two-card-refresh'),
  'family-schedule-waivers-payments': scenarioCaseSet('family-aggregates', 'guardian-signature-and-ledger-refresh'),
  'family-enable-youth-login': specializedCaseSet('family-youth-login', {
    happyPath: 'guardian-invite-and-youth-activation', negativePath: 'missing-target-denial',
    permission: 'cross-household-child-denial', persistence: 'activated-child-independent-read',
  }),
});

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
  const scenarioErrors = events.filter(event => event.type === 'scenario-error').map(event => ({
    stage: event.stage || `tenant-scenario:${event.scenarioId}`,
    diagnostic: String(event.diagnostic || 'Tenant scenario failed outside a case boundary.').slice(0, 500),
  }));
  const hasStructuredFailure = events.some(event => event.type === 'case' && event.state === 'FAIL');
  const execution = { startedAt: observation?.startedAt || context.now(), completedAt: observation?.completedAt || context.now() };
  const runErrors = !observation
    ? [{ stage: 'tenant-child', diagnostic: 'Shared certification child observation was unavailable.' }]
    : observation.code !== 0 && !hasStructuredFailure
      ? [{
          stage: 'tenant-child',
          diagnostic: (context.redact ? context.redact(observation.stderr) : String(observation.stderr || ''))
            .trim().slice(0, 500) || `Tenant child exited with code ${observation.code}.`,
        }]
      : scenarioErrors;
  return {
    results: scenarios.map(scenario => resultForScenario({ scenario, context, events, cleanup, execution, capabilities })),
    runErrors,
  };
}
