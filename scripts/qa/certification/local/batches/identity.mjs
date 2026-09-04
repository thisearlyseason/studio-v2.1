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

const SCENARIO_REQUIREMENTS = Object.freeze({
  'marketing-legal-contact-beta-coach-referral': Object.freeze({
    external: Object.freeze(['approved QA mailbox/provider delivery-once evidence', 'exact staging revision']),
    localGap: 'visible form submissions, malformed/oversize/duplicate/rate-limit cases, and trusted-admin-only record access were not migrated',
  }),
  'authentication-email-password-login': Object.freeze({
    external: Object.freeze(['durable hosted session on the exact staging revision']),
    localGap: 'unknown-user, delayed response, rapid double-submit, complete active-role browser matrix, and full auth-form responsive states remain',
  }),
  'authentication-logout-revocation-multi-tab': Object.freeze({
    external: Object.freeze(['hosted multi-tab logout and admin revocation on the exact staging revision']),
    localGap: 'Back/cache/direct-route denial, admin-side token revocation, and mobile logout remain',
  }),
  'authentication-password-reset': Object.freeze({
    external: Object.freeze(['approved QA mailbox action completed in memory only', 'exact staging revision']),
    localGap: 'emulator OOB valid/reused/modified/expired/wrong-recipient transitions, provider failure, and responsive reset UI remain',
  }),
  'account-lifecycle-disable-delete-cancel-purge': Object.freeze({
    external: Object.freeze(['authorized disposable staging lifecycle records', 'Function/scheduler invocation with sanitized correlated logs', 'safe bounded purge fault injection']),
    localGap: 'schedule/cancel/suspend/restore/cross-user/owner/subscription guards and exact purge retry were not migrated',
  }),
  'signup-onboarding-coach-admin-league-parent-adult-player-signup': Object.freeze({
    external: Object.freeze(['approved QA mailbox verification for five disposable roles', 'exact staging revision']),
    localGap: 'five new UI-created accounts, invalid/duplicate/aborted/provider-failure cases, privileged-field denials, and responsive flows remain',
  }),
  'signup-onboarding-youth-invitation-signup': Object.freeze({
    external: Object.freeze(['approved QA mailbox invite delivery', 'exact staging revision']),
    localGap: 'fresh invite creation/redemption, modified/expired/reused/wrong-recipient cases, cross-guardian denial, PII allowlist, and responsive flows remain',
  }),
  'signup-onboarding-missing-profile-onboarding': Object.freeze({
    external: Object.freeze(['durable hosted missing-profile and partial-profile sessions on the exact staging revision']),
    localGap: 'dynamic missing/partial profiles, fail-closed route/API checks, all role completions, privileged-field denial, and responsive flows remain',
  }),
  'demo-seed-use-exit-expiry-cleanup': Object.freeze({
    external: Object.freeze(['exact staging revision for durable demo isolation', 'scheduled cleanup adapter with retry and partial-failure evidence']),
    localGap: 'two fresh anonymous contexts, cross-ID tampering, duplicate launch, billing denial, expiry boundary, and cleanup retry remain',
  }),
  'dashboard-shell-role-landing-and-route-policy': Object.freeze({
    external: Object.freeze(['durable role/plan/state sessions on the exact staging revision']),
    localGap: 'complete role-plan-state direct-route/navigation agreement plus refresh/new-tab/Back and both viewports remain',
  }),
  'administration-access-and-user-directory': Object.freeze({
    external: Object.freeze(['authorized disposable trusted claim on the exact staging revision', 'safe claim revocation and restoration authority']),
    localGap: 'directory query/search/sort/target isolation, every non-SA role, claim revocation, malformed target, rules, and both viewports remain',
  }),
});

const SUPPORTED_SCENARIOS = new Set([
  'authentication-email-password-login',
  'authentication-logout-revocation-multi-tab',
  'dashboard-shell-role-landing-and-route-policy',
  'administration-access-and-user-directory',
]);

export function parseLegacyPassLabels(output) {
  const labels = new Set();
  for (const line of String(output || '').split(/\r?\n/)) {
    const match = line.match(/^PASS (.+): (?:.*)$/);
    if (match) labels.add(match[1]);
  }
  return labels;
}

function labelsIncludeAll(labels, fragments) {
  return fragments.every(fragment => [...labels].some(label => label.includes(fragment)));
}

function baseDimensions(localGap) {
  return Object.fromEntries(DIMENSION_NAMES.map(name => [
    name,
    makeDimension('NOT_OBSERVED', [], `Local ${name} contract incomplete: ${localGap}.`),
  ]));
}

function observedCases(labels, fragments, dimension) {
  return fragments.flatMap((fragment, index) => (
    [...labels].some(label => label.includes(fragment))
      ? [{
        caseId: `${dimension}-compatibility-${index + 1}`,
        dimension,
        role: 'catalog alias',
        tenantAlias: 'catalog-scoped',
        expected: 'named compatibility assertion succeeds',
        observed: 'OBSERVED',
      }]
      : []
  ));
}

function applySupportedObservations(scenarioId, labels, dimensions, cases) {
  if (scenarioId === 'authentication-email-password-login') {
    const permissionLabels = [
      'qa-unverified blocked session creation',
      'qa-suspended blocked Auth error',
      'pending-delete blocked session creation',
      'removed member denied former team context',
    ];
    if (labelsIncludeAll(labels, permissionLabels)) {
      dimensions.permission = makeDimension('OBSERVED', ['permission-compatibility-1', 'permission-compatibility-2', 'permission-compatibility-3', 'permission-compatibility-4'], 'Unverified, disabled, pending-delete, and removed-member boundaries were observed locally.');
      cases.push(...observedCases(labels, permissionLabels, 'permission'));
    }
    const networkLabels = ['active session for', 'blocked session creation'];
    if (labelsIncludeAll(labels, networkLabels)) {
      dimensions.network = makeDimension('OBSERVED', ['network-compatibility-1', 'network-compatibility-2'], 'Local Auth and secure-session response boundaries were observed.');
      cases.push(...observedCases(labels, networkLabels, 'network'));
    }
    return;
  }
  if (scenarioId === 'authentication-logout-revocation-multi-tab') {
    const happyLabels = ['logout revokes the browser session', 'second tab observes logout'];
    if (labelsIncludeAll(labels, happyLabels)) {
      dimensions.happyPath = makeDimension('OBSERVED', ['happyPath-compatibility-1', 'happyPath-compatibility-2'], 'Visible logout cleared the primary and peer tab locally.');
      cases.push(...observedCases(labels, happyLabels, 'happyPath'));
    }
    const networkLabels = ['logged-out session endpoint denial'];
    if (labelsIncludeAll(labels, networkLabels)) {
      dimensions.network = makeDimension('OBSERVED', ['network-compatibility-1'], 'The logged-out session endpoint returned the expected denial locally.');
      cases.push(...observedCases(labels, networkLabels, 'network'));
    }
    return;
  }
  if (scenarioId === 'administration-access-and-user-directory') {
    const partialLabels = ['profile-only fake superadmin denied admin API', 'claim-controlled superadmin reaches admin API'];
    cases.push(...observedCases(labels, partialLabels, 'permission'));
    return;
  }
  if (scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    const partialLabels = ['owner billing browser route', 'member staff route denial', 'parent finance browser route', 'player finance browser route denial'];
    cases.push(...observedCases(labels, partialLabels, 'permission'));
  }
}

function scenarioResult({ scenario, context, labels, failure, cleanupObserved }) {
  const requirements = SCENARIO_REQUIREMENTS[scenario.id];
  if (!requirements) throw new Error(`Missing Task 3 identity requirements for ${scenario.id}.`);
  const startedAt = context.now();
  const dimensions = baseDimensions(requirements.localGap);
  const cases = [];
  if (labels) applySupportedObservations(scenario.id, labels, dimensions, cases);
  if (failure) {
    dimensions.network = makeDimension('FAIL', ['runner-command-failure'], 'The local identity compatibility command did not complete.');
    cases.push({
      caseId: 'runner-command-failure',
      dimension: 'network',
      role: scenario.roles.join('/'),
      tenantAlias: 'catalog-scoped',
      expected: 'local identity command exits successfully',
      observed: 'FAIL with sanitized diagnostics',
    });
  }
  const missingDimensions = DIMENSION_NAMES.filter(name => dimensions[name].state !== 'OBSERVED');
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    commit: context.commit,
    revision: 'local',
    startedAt,
    completedAt: context.now(),
    role: scenario.roles.join('/'),
    tenantAlias: scenario.roles.includes('V') ? 'not-applicable' : 'catalog-scoped',
    dimensions,
    cases,
    cleanup: {
      owner: scenario.cleanupOwner,
      selectors: ['fixture-catalog exact selectors'],
      counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
      state: scenario.cleanupOwner === 'background-batch'
        ? 'BLOCKED_PRECONDITION'
        : cleanupObserved
          ? 'OBSERVED'
          : 'NOT_OBSERVED',
    },
    artifacts: [],
    missingDimensions,
    externalRequirements: [...requirements.external],
    outcome: failure ? 'FAIL' : 'BLOCKED_PRECONDITION',
  };
}

export async function runIdentityBatch(context, scenarios) {
  const shouldRunCompatibility = scenarios.some(scenario => SUPPORTED_SCENARIOS.has(scenario.id));
  let labels = new Set();
  let failure = null;
  if (shouldRunCompatibility) {
    try {
      const observation = await context.runLegacyIdentityAudit();
      labels = parseLegacyPassLabels(observation.stdout);
    } catch (error) {
      failure = error;
    }
  }
  const cleanupObserved = labels.has('post-cleanup Storage object is absent');
  return scenarios.map((scenario, index) => scenarioResult({
    scenario,
    context,
    labels,
    failure: failure && index === 0 ? failure : null,
    cleanupObserved,
  }));
}
