import { DIMENSION_NAMES, makeDimension } from '../evidence.mjs';

export const IDENTITY_EXECUTION_ORDER = Object.freeze([
  'marketing-legal-contact-beta-coach-referral',
  'authentication-email-password-login',
  'dashboard-shell-role-landing-and-route-policy',
  'administration-access-and-user-directory',
  'signup-onboarding-missing-profile-onboarding',
  'signup-onboarding-coach-admin-league-parent-adult-player-signup',
  'signup-onboarding-youth-invitation-signup',
  'authentication-password-reset',
  'authentication-logout-revocation-multi-tab',
  'demo-seed-use-exit-expiry-cleanup',
  'account-lifecycle-disable-delete-cancel-purge',
]);

const caseSet = (prefix, overrides = {}) => Object.freeze(Object.fromEntries(DIMENSION_NAMES.map(dimension => [
  dimension,
  Object.freeze(overrides[dimension] || [`${prefix}-${dimension}`]),
])));

export const LOCAL_IDENTITY_CASE_REQUIREMENTS = Object.freeze({
  'marketing-legal-contact-beta-coach-referral': caseSet('marketing-local', {
    negativePath: ['marketing-malformed-oversize-duplicate-rate-limit'],
    permission: ['marketing-admin-field-and-record-isolation'],
    persistence: ['marketing-stored-once-local-transport'],
    responsive: ['marketing-public-forms-two-viewports'],
  }),
  'authentication-email-password-login': caseSet('login-local', {
    happyPath: ['login-twenty-active-browser-landings'],
    negativePath: ['login-wrong-unknown-timeout-double-submit'],
    permission: ['login-blocked-state-and-tenant-denials'],
    persistence: ['login-deep-link-refresh-new-tab'],
    responsive: ['login-form-two-viewports'],
  }),
  'authentication-logout-revocation-multi-tab': caseSet('logout-local', {
    happyPath: ['logout-primary-peer-session-revocation'],
    negativePath: ['logout-back-reload-direct-api-denial'],
    permission: ['logout-emulator-admin-token-revocation'],
    persistence: ['logout-refresh-new-tab-back'],
    responsive: ['logout-mobile-containment'],
  }),
  'authentication-password-reset': caseSet('reset-local', {
    happyPath: ['reset-known-oob-new-password-transition'],
    negativePath: ['reset-unknown-reused-modified-wrong-account'],
    permission: ['reset-nonenumeration-and-single-recipient'],
    persistence: ['reset-old-denied-new-accepted-reload'],
    responsive: ['reset-request-action-two-viewports'],
  }),
  'account-lifecycle-disable-delete-cancel-purge': caseSet('lifecycle-local', {
    happyPath: ['lifecycle-schedule-cancel-suspend-restore'],
    negativePath: ['lifecycle-owner-subscription-invalid-transition'],
    permission: ['lifecycle-cross-user-and-admin-boundary'],
    persistence: ['lifecycle-state-reload-and-local-retry'],
    responsive: ['lifecycle-settings-admin-desktop'],
  }),
  'signup-onboarding-coach-admin-league-parent-adult-player-signup': caseSet('signup-local', {
    happyPath: ['signup-five-role-create-verify-landings'],
    negativePath: ['signup-invalid-duplicate-aborted-provider-failure'],
    permission: ['signup-preverification-and-privileged-field-denial'],
    persistence: ['signup-five-role-profile-reload'],
    responsive: ['signup-five-role-two-viewports'],
  }),
  'signup-onboarding-youth-invitation-signup': caseSet('youth-local', {
    happyPath: ['youth-invite-create-redeem-linkage'],
    negativePath: ['youth-modified-expired-reused-wrong-recipient'],
    permission: ['youth-cross-guardian-team-and-pii-allowlist'],
    persistence: ['youth-player-membership-refresh-relogin'],
    responsive: ['youth-invite-activation-two-viewports'],
  }),
  'signup-onboarding-missing-profile-onboarding': caseSet('onboarding-local', {
    happyPath: ['onboarding-missing-partial-role-completion'],
    negativePath: ['onboarding-validation-double-submit-refresh'],
    permission: ['onboarding-protected-route-api-and-field-denial'],
    persistence: ['onboarding-profile-landing-refresh-relogin'],
    responsive: ['onboarding-states-two-viewports'],
  }),
  'demo-seed-use-exit-expiry-cleanup': caseSet('demo-local', {
    happyPath: ['demo-two-context-seed-use-exit'],
    negativePath: ['demo-cross-id-duplicate-billing-expiry-retry'],
    permission: ['demo-registered-and-cross-context-denial'],
    persistence: ['demo-refresh-back-exit-isolation'],
    responsive: ['demo-workspace-exit-error-two-viewports'],
  }),
  'dashboard-shell-role-landing-and-route-policy': caseSet('dashboard-local', {
    happyPath: ['dashboard-twenty-role-plan-state-landings'],
    negativePath: ['dashboard-navigation-direct-route-denials'],
    permission: ['dashboard-complete-role-plan-state-policy'],
    persistence: ['dashboard-refresh-new-tab-back-team-session'],
    responsive: ['dashboard-policy-two-viewports'],
  }),
  'administration-access-and-user-directory': caseSet('admin-local', {
    happyPath: ['admin-directory-search-sort-target-isolation'],
    negativePath: ['admin-malformed-target-and-every-nonsa-denial'],
    permission: ['admin-claim-revoke-refresh-restore-rules'],
    persistence: ['admin-session-revoke-restore-continuity'],
    responsive: ['admin-directory-denial-two-viewports'],
  }),
});

const EXTERNAL_REQUIREMENTS = Object.freeze({
  'marketing-legal-contact-beta-coach-referral': ['exact staging revision', 'approved QA mailbox/provider delivery-once evidence'],
  'authentication-email-password-login': ['durable hosted session on the exact staging revision'],
  'authentication-logout-revocation-multi-tab': ['hosted multi-tab logout and admin revocation on the exact staging revision'],
  'authentication-password-reset': ['approved QA mailbox action and actual delivery on the exact staging revision'],
  'account-lifecycle-disable-delete-cancel-purge': ['authorized staging lifecycle records', 'real Function/scheduler invocation with correlated logs', 'bounded staging fault injection'],
  'signup-onboarding-coach-admin-league-parent-adult-player-signup': ['approved mailbox delivery for five staging roles', 'exact staging revision'],
  'signup-onboarding-youth-invitation-signup': ['approved invite mailbox delivery on the exact staging revision'],
  'signup-onboarding-missing-profile-onboarding': ['durable hosted missing/partial-profile sessions on the exact staging revision'],
  'demo-seed-use-exit-expiry-cleanup': ['exact staging revision', 'actual scheduled cleanup/retry logs'],
  'dashboard-shell-role-landing-and-route-policy': ['durable role/plan/state sessions on the exact staging revision'],
  'administration-access-and-user-directory': ['authorized staging trusted-claim revoke/restore on the exact revision'],
});

export function parseCertificationEvents(output) {
  const events = [];
  for (const line of String(output || '').split(/\r?\n/)) {
    if (!line.startsWith('CERTIFICATION_EVENT ')) continue;
    try {
      events.push(JSON.parse(line.slice('CERTIFICATION_EVENT '.length)));
    } catch {
      // A malformed event is never accepted as evidence.
    }
  }
  return events;
}

function resultForScenario({ scenario, context, events, cleanup, execution }) {
  const requirements = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenario.id];
  const rawCases = events.filter(event =>
    event.type === 'case' && event.scenarioId === scenario.id &&
    DIMENSION_NAMES.includes(event.dimension) &&
    requirements[event.dimension].includes(event.caseId));
  const casesById = new Map();
  for (const event of rawCases) {
    const existing = casesById.get(event.caseId);
    if (!existing) {
      casesById.set(event.caseId, { ...event, diagnostics: [event.observed] });
      continue;
    }
    casesById.set(event.caseId, {
      ...existing,
      state: existing.state === 'FAIL' || event.state === 'FAIL'
        ? 'FAIL'
        : existing.state === 'NOT_OBSERVED' || event.state === 'NOT_OBSERVED'
          ? 'NOT_OBSERVED'
          : 'OBSERVED',
      observed: existing.state !== 'OBSERVED' ? existing.observed : event.observed,
      startedAt: [existing.startedAt, event.startedAt].sort()[0],
      completedAt: [existing.completedAt, event.completedAt].sort().at(-1),
      artifacts: [...new Set([...(existing.artifacts || []), ...(event.artifacts || [])])],
      diagnostics: [...existing.diagnostics, event.observed],
    });
  }
  const cases = [...casesById.values()];
  const dimensions = {};
  for (const dimension of DIMENSION_NAMES) {
    const required = requirements[dimension];
    const matching = cases.filter(item => item.dimension === dimension);
    const matchingIds = new Set(matching.map(item => item.caseId));
    const failed = matching.some(item => item.state === 'FAIL');
    const notObserved = matching.some(item => item.state === 'NOT_OBSERVED');
    const complete = required.every(caseId => matchingIds.has(caseId)) &&
      matching.every(item => item.state === 'OBSERVED');
    const missingBrowser = !context.browserEnabled && ['console', 'responsive'].includes(dimension);
    dimensions[dimension] = makeDimension(
      failed ? 'FAIL' : complete ? 'OBSERVED' : notObserved ? 'NOT_OBSERVED' : 'BLOCKED_PRECONDITION',
      matching.map(item => item.caseId),
      failed
        ? 'A locally executed case failed; see its structured diagnostic and artifact.'
        : notObserved
          ? matching.filter(item => item.state === 'NOT_OBSERVED').map(item => item.observed).join(' ')
        : complete
          ? 'Every required locally safe case for this dimension was observed.'
          : missingBrowser
            ? 'Browser capability was not enabled for this run.'
            : `Missing locally required cases: ${required.filter(caseId => !matchingIds.has(caseId)).join(', ')}.`,
    );
  }
  const missingDimensions = DIMENSION_NAMES.filter(name => dimensions[name].state !== 'OBSERVED');
  const hasFailure = cases.some(item => item.state === 'FAIL');
  const hasExecutedCase = cases.length > 0;
  const sharedCleanup = cleanup || {
    cleanupId: 'shared-fixture-cleanup-not-observed',
    selectors: ['fixture-catalog-exact-selectors'],
    counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
    state: 'BLOCKED_PRECONDITION',
    proof: ['cleanup-not-observed'],
  };
  const backgroundOwned = scenario.cleanupOwner === 'background-batch';
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    environmentGaps: scenario.environments.filter(value => value !== 'local-emulator'),
    commit: context.commit,
    revision: 'local',
    startedAt: cases.length > 0
      ? cases.map(item => item.startedAt).sort()[0]
      : execution.startedAt,
    completedAt: cases.length > 0
      ? cases.map(item => item.completedAt).sort().at(-1)
      : execution.completedAt,
    role: scenario.roles.join('/'),
    tenantAlias: scenario.roles.includes('V') ? 'not-applicable' : 'catalog-scoped',
    dimensions,
    cases,
    cleanup: {
      owner: scenario.cleanupOwner,
      reference: sharedCleanup.cleanupId,
      selectors: [...sharedCleanup.selectors],
      counts: { ...sharedCleanup.counts },
      state: sharedCleanup.state === 'OBSERVED' && !backgroundOwned
        ? 'OBSERVED'
        : backgroundOwned ? 'BLOCKED_PRECONDITION' : sharedCleanup.state,
      proof: [...sharedCleanup.proof],
    },
    artifacts: [...new Set(cases.flatMap(item => item.artifacts || []))],
    missingDimensions,
    externalRequirements: [...EXTERNAL_REQUIREMENTS[scenario.id]],
    outcome: hasFailure ? 'FAIL' : 'BLOCKED_PRECONDITION',
  };
}

export async function runIdentityBatch(context, scenarios) {
  const selectedIds = IDENTITY_EXECUTION_ORDER.filter(id => scenarios.some(scenario => scenario.id === id));
  let observation;
  let events = [];
  const runErrors = [];
  const startedAt = context.now();
  try {
    observation = await context.runLegacyIdentityAudit(selectedIds);
    events = parseCertificationEvents(observation.stdout);
    if (observation.code !== 0 && !events.some(event => event.type === 'case' && event.state === 'FAIL')) {
      runErrors.push({ stage: 'identity-child', diagnostic: 'Identity child exited unsuccessfully without a case event.' });
    }
  } catch (error) {
    const diagnostic = error instanceof Error ? error.message : String(error);
    events = parseCertificationEvents(diagnostic);
    if (!events.some(event => event.type === 'case' && event.state === 'FAIL')) {
      runErrors.push({ stage: 'identity-child', diagnostic });
    }
  }
  const execution = {
    startedAt: observation?.startedAt || startedAt,
    completedAt: observation?.completedAt || context.now(),
  };
  const cleanup = events.find(event => event.type === 'cleanup');
  return {
    results: scenarios.map(scenario => resultForScenario({ scenario, context, events, cleanup, execution })),
    runErrors,
  };
}
