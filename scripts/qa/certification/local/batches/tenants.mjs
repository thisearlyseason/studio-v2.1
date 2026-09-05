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
      actorAlias: caseId === 'team-create-cross-tenant-created-team-denial' ? 'qa-coach-owner-b' : 'qa-fresh-coach',
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
  if (scenarioId === 'family-enable-youth-login' && caseId.endsWith('-cross-household-child-denial')) {
    return Object.freeze({ actorAlias: 'qa-parent-b', targetAlias: 'qa-team-c', operation: 'permission' });
  }
  if (scenarioId === 'family-enable-youth-login' && caseId.endsWith('-guardian-invite-and-youth-activation')) {
    return Object.freeze({ actorAlias: 'qa-public-submitter', targetAlias: base[1], operation: 'create' });
  }
  if (scenarioId === 'family-enable-youth-login' && ['console', 'responsive'].includes(dimension)) {
    return Object.freeze({ actorAlias: 'qa-youth-invite', targetAlias: base[1], operation: 'read' });
  }
  if (scenarioId === 'recruiting-public-scout-projection' && caseId.endsWith('-canonical-editor-status-transitions')) {
    return Object.freeze({ actorAlias: 'qa-coach-owner-b', targetAlias: base[1], operation: 'update' });
  }
  if (scenarioId === 'recruiting-public-scout-projection' && caseId === 'recruiting-public-cross-tenant-private-root-denial') {
    return Object.freeze({ actorAlias: 'qa-coach-owner-a', targetAlias: base[1], operation: 'permission' });
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
  const targetAlias = scenarioId === 'family-children-invites-team-cards' &&
      ['family-children-role-boundary', 'family-children-cross-tenant-denial', 'family-children-workflow-network'].includes(caseId)
    ? 'qa-player-youth-c'
    : scenarioId === 'roster-parent-player-self-views' &&
        ['roster-self-role-boundary', 'roster-self-cross-tenant-denial', 'roster-self-workflow-network'].includes(caseId)
      ? 'qa-player-adult-a'
      : scenarioId === 'roster-member-add-edit-remove-reinstate' &&
          ['roster-lifecycle-role-boundary', 'roster-lifecycle-cross-tenant-denial', 'roster-lifecycle-workflow-network'].includes(caseId)
        ? 'qa-roster-accented-player'
        : base[1];
  return Object.freeze({ actorAlias, targetAlias, operation });
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

// These are execution contracts, not naming conventions. A tenant scenario can
// be OBSERVED only when its case artifacts contain each exact assertion emitted
// by the real route/rules/browser work below.
export const LOCAL_TENANT_OPERATION_CONTRACTS = Object.freeze({
  'teams-create-and-capacity': Object.freeze([
    'tenant team create capacity race requests settle', 'tenant team create one-seat race single winner',
    'tenant team create one-seat race exhausted denial',
    'tenant team create qa-fresh-coach succeeds', 'tenant team create qa-fresh-admin succeeds',
    'tenant team create qa-fresh-league-creator succeeds', 'tenant team create owner server-derived',
  ]),
  'teams-join-by-code': Object.freeze([
    'tenant join active invitation resolves', 'tenant join concurrent duplicate requests settle',
    'tenant child concurrent join creates one roster row', 'tenant join wrong guardian child enrollment denied',
  ]),
  'teams-profile-branding-settings': Object.freeze([
    'tenant teams-profile-branding-settings authorized lifecycle mutation', 'tenant branding unsafe type denied',
    'tenant branding owner replacement succeeds', 'tenant branding Storage removal reconciled',
    'tenant settings browser edit survives reload', 'tenant settings browser exact viewports',
  ]),
  'teams-module-visibility': Object.freeze([
    'tenant all eight module keys persisted', 'tenant module eight navigation entries hidden',
    'tenant module eight direct routes denied', 'tenant module two viewport executions',
  ]),
  'teams-seasonal-reset-delete-quota-resolution': Object.freeze([
    'tenant seasonal selected games deleted', 'tenant seasonal user membership removed',
    'tenant seasonal player team projection removed', 'tenant seasonal repeated complete reset succeeds',
  ]),
  'organization-club-school-overview': Object.freeze([
    'tenant school overview owner aggregate', 'tenant school overview delegated administrator',
    'tenant school overview other institution denied', 'tenant school overview constituent refresh visible',
  ]),
  'organization-create-allocate-remove-squads': Object.freeze([
    'tenant organization outsider allocation denied', 'tenant organization squad seat released',
    'tenant organization squad seat allocated', 'tenant organization allocation projection reconciled',
  ]),
  'organization-global-waivers-documents-admins': Object.freeze([
    'tenant global waiver master and copies reconcile', 'tenant school administrator server-resolved target',
    'tenant school administrator member projection', 'tenant school administrator user projection revoked',
  ]),
  'roster-member-add-edit-remove-reinstate': Object.freeze([
    'tenant roster member removed', 'tenant roster member reinstated', 'tenant roster reinstate persisted',
  ]),
  'roster-search-filter-sort-export': Object.freeze([
    'tenant roster accented search and removed filter', 'tenant roster real manifest download',
    'tenant roster manifest bytes nonempty', 'tenant roster manifest private fields omitted',
    'tenant roster manifest content stable across viewports',
    'tenant roster search export two viewports', 'tenant roster export dialog containment',
  ]),
  'roster-parent-player-self-views': Object.freeze([
    'tenant roster-parent-player-self-views authorized lifecycle mutation',
    'tenant roster-parent-player-self-views lifecycle field reconciled',
  ]),
  'recruiting-private-profile-crud': Object.freeze([
    'tenant recruiting private editor updates 1', 'tenant recruiting private editor updates 4',
    'tenant recruiting private cross-team editor denied', 'tenant recruiting private video reload',
  ]),
  'recruiting-public-scout-projection': Object.freeze([
    'tenant recruiting active profile published', 'tenant recruiting private contact direct read denied',
    'tenant recruiting canonical active status persisted', 'tenant recruiting editor saves committed',
  ]),
  'family-children-invites-team-cards': Object.freeze([
    'tenant family child 1 edit', 'tenant family child 2 edit', 'tenant family two child cards refresh',
  ]),
  'family-schedule-waivers-payments': Object.freeze([
    'tenant family waiver other guardian denied', 'tenant family waiver guardian participant route succeeds',
    'tenant family waiver records guardian signer separately', 'tenant family waiver guardian ceremony explicit',
  ]),
  'family-enable-youth-login': Object.freeze([
    'tenant youth invite created by guardian', 'tenant youth invitation redemption',
    'tenant youth never inherits guardian identity', 'tenant youth invitation single-use denial',
    'tenant youth activated new-tab dashboard', 'tenant youth player self-view route both viewports',
  ]),
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
    ...(event.originalDiagnostic ? { originalDiagnostic: String(event.originalDiagnostic).slice(0, 500) } : {}),
    ...(Array.isArray(event.restorationDiagnostics) ? {
      restorationDiagnostics: event.restorationDiagnostics.map(value => String(value).slice(0, 500)),
    } : {}),
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
