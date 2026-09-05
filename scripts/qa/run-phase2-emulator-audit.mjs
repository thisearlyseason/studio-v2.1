import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { Agent as HttpAgent } from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildFixtureCatalog, inspectFixtureMedia } from './certification/fixture-catalog.mjs';
import { parseLoopbackHttpOrigin } from './certification/local/boundary.mjs';
import {
  IDENTITY_EXECUTION_ORDER,
  LOCAL_IDENTITY_CASE_REQUIREMENTS,
} from './certification/local/batches/identity.mjs';
import { CERTIFICATION_SCENARIOS } from './certification/scenario-catalog.mjs';
import { DIMENSION_NAMES } from './certification/local/evidence.mjs';
import { createResourceRegistry, mergeResourceCleanupResults } from './certification/local/resource-registry.mjs';

export function resolveAuditRuntimeConfiguration({ environment = process.env, argv = process.argv.slice(2) } = {}) {
  const baseUrl = parseLoopbackHttpOrigin(
    environment.AUDIT_BASE_URL || 'http://127.0.0.1:9001',
    'Legacy audit loopback base URL',
  );
  const selectedScenarios = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--scenario') continue;
    const scenarioId = argv[index + 1];
    if (!scenarioId || scenarioId.startsWith('--')) throw new Error('--scenario requires a scenario ID.');
    selectedScenarios.push(scenarioId);
    index += 1;
  }
  const allowedScenarios = new Set(IDENTITY_EXECUTION_ORDER);
  for (const scenarioId of selectedScenarios) {
    if (!allowedScenarios.has(scenarioId)) throw new Error(`Unknown Task 3 identity scenario ${scenarioId}.`);
  }
  return {
    projectId: environment.AUDIT_FIREBASE_PROJECT_ID || 'demo-the-squad-audit',
    baseUrl,
    fixtureRunSuffix: environment.AUDIT_FIXTURE_RUN_SUFFIX || 'phase2',
    browserSessionPrefix: environment.AUDIT_BROWSER_SESSION_PREFIX || 'phase2',
    certificationIdentity: argv.includes('--certification-identity'),
    runBrowser: argv.includes('--browser'),
    selectedScenarios: [...new Set(selectedScenarios)],
  };
}

const runtimeConfiguration = resolveAuditRuntimeConfiguration();
const PROJECT_ID = runtimeConfiguration.projectId;
const BASE_URL = runtimeConfiguration.baseUrl;
const FIXTURE_RUN_SUFFIX = runtimeConfiguration.fixtureRunSuffix;
const BROWSER_SESSION_PREFIX = runtimeConfiguration.browserSessionPrefix;
const FIXTURES = buildFixtureCatalog(FIXTURE_RUN_SUFFIX);
const runBrowser = runtimeConfiguration.runBrowser;
const certificationIdentity = runtimeConfiguration.certificationIdentity;
const selectedIdentityScenarios = new Set(
  runtimeConfiguration.selectedScenarios.length > 0
    ? runtimeConfiguration.selectedScenarios
    : IDENTITY_EXECUTION_ORDER,
);
const scheduleAppOnly = process.argv.includes('--schedule-app-only');
const teamSwitchOnly = process.argv.includes('--team-switch-only');
const alertsOnly = process.argv.includes('--alerts-only');
const identityOnly = process.argv.includes('--identity-only');
const identityStateOnly = process.argv.includes('--identity-state-only');
const deletionLoginOnly = process.argv.includes('--deletion-login-only');
const surfaceSmokeOnly = process.argv.includes('--surface-smoke-only');
const surfaceRemainderOnly = process.argv.includes('--surface-remainder-only');
const tournamentDenialOnly = process.argv.includes('--tournament-denial-only');
const parentAdminSurfaceOnly = process.argv.includes('--parent-admin-surface-only');
const workflowCommunicationOnly = process.argv.includes('--workflow-communication-only');
const workflowChatProbeOnly = process.argv.includes('--workflow-chat-probe-only');
const workflowEventsOnly = process.argv.includes('--workflow-events-only');
const workflowFacilitiesOnly = process.argv.includes('--workflow-facilities-only');
const workflowEquipmentOnly = process.argv.includes('--workflow-equipment-only');
const playwrightCli = process.env.PLAYWRIGHT_CLI || '';
const password = randomBytes(24).toString('base64url');
const sensitiveValues = new Set([password]);
const certificationSensitiveAliases = new Map();
const children = [];
const ownedBrowserSessions = new Set();
const logDir = path.join(os.tmpdir(), `the-squad-phase2-${process.pid}`);
const certificationArtifactDir = process.env.AUDIT_ARTIFACT_DIR || path.join(logDir, 'certification-artifacts');
const certificationRunId = process.env.AUDIT_CERTIFICATION_RUN_ID || `legacy-${FIXTURES.runId}`;
const certificationCommit = process.env.AUDIT_CERTIFICATION_COMMIT || 'legacy-unbound-candidate';
const browserSessionRegistry = process.env.AUDIT_BROWSER_SESSION_REGISTRY || '';
const processGroupRegistry = process.env.AUDIT_PROCESS_GROUP_REGISTRY || '';
let fixturesSeeded = false;
let cleanupStarted = false;
let activeCertificationScenario = null;
let activeCertificationAssertions = [];
const dynamicResourceRegistry = createResourceRegistry({ maxAttempts: 3 });
const completedDynamicCleanupRuns = [];
const certificationScenarioById = new Map(CERTIFICATION_SCENARIOS.map(scenario => [scenario.id, scenario]));
const DASHBOARD_POLICY_PATHS = Object.freeze([
  '/admin',
  '/family',
  '/family/payments',
  '/dashboard/billing',
  '/club',
  '/competition',
  '/facilities',
]);
const certificationNotObservedCases = Object.freeze({
  'authentication-password-reset': Object.freeze({
    'reset-unknown-reused-modified-wrong-account': 'The Auth emulator exposes no supported clock control for a still-unused password-reset OOB code, and the protocol binds the recipient in the code rather than accepting a caller-selected account. Expiration and recipient-tampered action are not observed locally.',
  }),
  'account-lifecycle-disable-delete-cancel-purge': Object.freeze({
    'lifecycle-state-reload-and-local-retry': 'The real scheduled purge worker is not available through a deterministic local invocation seam; direct audit-registry deletion is cleanup evidence only and is not worker evidence.',
  }),
  'demo-seed-use-exit-expiry-cleanup': Object.freeze({
    'demo-cross-id-duplicate-billing-expiry-retry': 'Cross-ID, idempotency, and billing denials were exercised, but the real scheduled demo-expiry worker and injected retry path are not available through a deterministic local seam.',
    'demo-refresh-back-exit-isolation': 'Browser refresh, exit, and graph reconciliation were exercised, but application-owned pending-exit recovery was not invoked; audit-registry recovery is not application-worker evidence.',
  }),
});

function buildDashboardPolicyCases(fixture) {
  const claimsRole = fixture.alias === 'qa-superadmin' ? 'superadmin' : '';
  const role = claimsRole === 'superadmin'
    ? claimsRole
    : fixture.role === 'superadmin' ? '' : fixture.role;
  const primaryAuthority = fixture.alias === 'qa-school-owner' || fixture.alias === 'qa-elite-owner';
  const management = ['coach', 'admin', 'league_creator', 'superadmin'].includes(role) || primaryAuthority;
  const institution = role === 'superadmin' || primaryAuthority ||
    (management && ['elite', 'elite_teams', 'league', 'elite_league', 'school'].includes(fixture.planId));
  const competition = role === 'superadmin' || role === 'league_creator' ||
    (management && ['league', 'elite_league', 'school'].includes(fixture.planId));
  const allowed = pathname => {
    if (pathname === '/admin') return role === 'superadmin';
    if (pathname === '/family' || pathname === '/family/payments') return role === 'parent' || role === 'superadmin';
    if (pathname === '/dashboard/billing' || pathname === '/facilities') return management;
    if (pathname === '/club') return institution;
    if (pathname === '/competition') return competition;
    throw new Error(`Unhandled dashboard policy path: ${pathname}`);
  };
  return DASHBOARD_POLICY_PATHS.map(pathname => ({
    path: pathname,
    expected: allowed(pathname) ? pathname : '/dashboard',
    allowed: allowed(pathname),
  }));
}

function requiredDashboardNavigationPaths(fixture) {
  const required = [];
  if (fixture.role === 'parent') required.push('/family');
  if (fixture.alias === 'qa-school-owner' || fixture.alias === 'qa-elite-owner') required.push('/club');
  if (fixture.role === 'league_creator') required.push('/competition');
  if (fixture.alias === 'qa-superadmin') required.push('/admin');
  return required;
}

function certificationActorAliases(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') return ['qa-public-submitter', 'qa-team-member', 'qa-superadmin'];
  if (scenarioId === 'authentication-email-password-login' || scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    return [...FIXTURES.activeAliases, ...BLOCKED_AUDIT_PLAN.api.map(item => item.alias)];
  }
  const actors = {
    'authentication-logout-revocation-multi-tab': ['qa-coach-owner-a', 'qa-superadmin'],
    'authentication-password-reset': ['qa-coach-owner-a', 'qa-coach-owner-b', 'qa-public-submitter'],
    'account-lifecycle-disable-delete-cancel-purge': ['qa-team-member', 'qa-parent-a', 'qa-superadmin', 'qa-owner-delete-blocked', 'qa-pro-owner'],
    'signup-onboarding-coach-admin-league-parent-adult-player-signup': ['signup-self', 'signup-child', 'signup-coach', 'signup-school_ad', 'signup-league_creator'],
    'signup-onboarding-youth-invitation-signup': ['qa-parent-a', 'qa-parent-b', 'qa-youth-invite', 'qa-team-member', 'qa-removed-member', 'qa-coach-owner-b'],
    'signup-onboarding-missing-profile-onboarding': ['missing-adult_player', 'missing-parent', 'missing-coach', 'missing-admin', 'missing-league_creator'],
    'demo-seed-use-exit-expiry-cleanup': ['qa-demo-a', 'qa-demo-b', 'qa-coach-owner-a'],
    'administration-access-and-user-directory': ['qa-superadmin', ...FIXTURES.activeAliases.filter(alias => alias !== 'qa-superadmin'), ...BLOCKED_AUDIT_PLAN.api.map(item => item.alias)],
  };
  return actors[scenarioId] || ['catalog-scenario-actor'];
}

function certificationTenantAlias(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') return 'not-applicable';
  if (scenarioId === 'administration-access-and-user-directory') return 'platform-admin';
  if (scenarioId === 'demo-seed-use-exit-expiry-cleanup') return 'isolated-demo-a+isolated-demo-b';
  return 'qa-team-a+qa-team-b+qa-team-c';
}

export function createAuditShutdownState() {
  let exitCode = null;
  return Object.freeze({
    get exitCode() { return exitCode; },
    request(requestedExitCode) {
      if (exitCode === null) exitCode = requestedExitCode;
    },
    throwIfRequested() {
      if (exitCode === null) return;
      const error = new Error('Local certification was interrupted; exact cleanup will now run.');
      error.exitCode = exitCode;
      throw error;
    },
  });
}

const shutdownState = createAuditShutdownState();

function emitCertificationEvent(event) {
  const sanitized = JSON.parse(redact(JSON.stringify(sanitizeCertificationArtifact(event))));
  console.log(`CERTIFICATION_EVENT ${JSON.stringify(sanitized)}`);
}

export function sanitizeCertificationArtifact(value) {
  if (Array.isArray(value)) return value.map(sanitizeCertificationArtifact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      /(?:password|cookie|authorization|actionurl|actionlink|oobcode|token|secret)/i.test(key)
        ? '[redacted]'
        : sanitizeCertificationArtifact(child),
    ]));
  }
  if (typeof value !== 'string') return value;
  let sanitized = value.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[synthetic-email]');
  for (const [sensitive, alias] of certificationSensitiveAliases) {
    sanitized = sanitized.replaceAll(sensitive, `[${alias}]`);
  }
  return sanitized
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: [redacted]')
    .replace(/https?:\/\/[^\s]+\?[^\s]+/gi, '[redacted-url]')
    .replace(/(?:oobCode|password|token|secret)=[^\s&]+/gi, '[redacted]');
}

export function registerCertificationSensitiveAlias(value, alias) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Sensitive alias value is required.');
  if (!/^[a-z0-9][a-z0-9_-]{0,80}$/i.test(String(alias || ''))) throw new Error('Sensitive alias label is invalid.');
  certificationSensitiveAliases.set(value, alias);
  sensitiveValues.add(value);
}

export function selectCertificationCaseAssertions(assertions, requiredPatterns) {
  const selected = [];
  for (const pattern of requiredPatterns) {
    const matches = assertions.filter(assertion => pattern.test(assertion.label));
    if (matches.length === 0) throw new Error(`Missing required assertion for case: ${pattern}.`);
    for (const match of matches) if (!selected.includes(match)) selected.push(match);
  }
  return selected;
}

const certificationCaseContracts = Object.freeze({
  'authentication-email-password-login': Object.freeze([
    { dimension: 'happyPath', caseId: 'login-twenty-active-browser-landings', requirements: [{ pattern: / login destination$/, minCount: 20 }] },
    { dimension: 'negativePath', caseId: 'login-wrong-unknown-timeout-double-submit', requirements: [
      /unknown identity generic Auth denial/, /wrong password generic Auth denial/,
      /unknown-user visible generic failure parity/, /login timeout visible recovery/,
      /login double-submit single session request/,
    ] },
    { dimension: 'permission', caseId: 'login-blocked-state-and-tenant-denials', requirements: [
      { pattern: / certification blocked state$/, minCount: 3 }, { pattern: /scoped tenant request /, minCount: 5 },
    ] },
    { dimension: 'persistence', caseId: 'login-deep-link-refresh-new-tab', requirements: [
      /protected deep-link return/, /login owner session refresh and Back destination/,
      /login owner session new-tab destination/,
    ] },
    { dimension: 'console', caseId: 'login-local-console', requirements: [{ pattern: /login workflow console errors$/, minCount: 20 }] },
    { dimension: 'network', caseId: 'login-local-network', requirements: [{ pattern: /login workflow unexpected responses$/, minCount: 20 }] },
    { dimension: 'responsive', caseId: 'login-form-two-viewports', requirements: [
      /login surface desktop routes/, /login surface mobile routes/, /login complete form states two viewports/,
    ] },
  ]),
  'marketing-legal-contact-beta-coach-referral': Object.freeze([
    { dimension: 'happyPath', caseId: 'marketing-local-happyPath', requirements: [
      /marketing local contact persistence/, /marketing local beta persistence/, /marketing visible contact success/, /marketing visible beta success/, /marketing visible referral success/,
    ] },
    { dimension: 'negativePath', caseId: 'marketing-malformed-oversize-duplicate-rate-limit', requirements: [
      /marketing malformed submission denial/, /marketing oversized payload denial/, /marketing rate-limit enforcement/,
      /marketing duplicate referral idempotency/, /marketing visible contact validation/, /marketing visible beta validation/,
    ] },
    { dimension: 'permission', caseId: 'marketing-admin-field-and-record-isolation', requirements: [
      /marketing contact privileged status ignored/, /marketing anonymous record read denied/, /marketing member record read denied/, /marketing trusted record read/,
    ] },
    { dimension: 'persistence', caseId: 'marketing-stored-once-local-transport', requirements: [
      /marketing contact stored once/, /marketing beta stored once/, /marketing referral stored once/, /marketing exact dynamic cleanup/,
    ] },
    { dimension: 'console', caseId: 'marketing-local-console', requirements: [
      /marketing submitted forms console errors/,
    ] },
    { dimension: 'network', caseId: 'marketing-local-network', requirements: [
      /marketing no-outbound memory sink/, /marketing local sink persistence/, /marketing submitted forms unexpected responses/,
    ] },
    { dimension: 'responsive', caseId: 'marketing-public-forms-two-viewports', requirements: [
      /marketing public surfaces desktop routes/, /marketing public surfaces mobile routes/, /marketing full form states two viewports/,
    ] },
  ]),
  'authentication-logout-revocation-multi-tab': Object.freeze([
    { dimension: 'happyPath', caseId: 'logout-primary-peer-session-revocation', requirements: [
      /cert logout primary denial/, /cert logout peer denial/, /cert logout session denial/,
    ] },
    { dimension: 'negativePath', caseId: 'logout-back-reload-direct-api-denial', requirements: [
      /cert logout Back reload direct denial/, /cert logout direct route denial/, /logout direct API denial without cookie/,
    ] },
    { dimension: 'permission', caseId: 'logout-emulator-admin-token-revocation', requirements: [
      /logout emulator-admin revoked cookie denial/, /logout admin revoked open tabs denied/, /logout admin revoked fresh tab denied/,
    ] },
    { dimension: 'persistence', caseId: 'logout-refresh-new-tab-back', requirements: [
      /cert logout protected cache content cleared after revocation/, /logout post-revocation fresh session/,
    ] },
    { dimension: 'console', caseId: 'logout-local-console', requirements: [
      /cert logout workflow console errors/, /logout admin revocation console errors/,
    ] },
    { dimension: 'network', caseId: 'logout-local-network', requirements: [
      /cert logout workflow unexpected responses/, /logout admin revocation unexpected responses/,
    ] },
    { dimension: 'responsive', caseId: 'logout-mobile-containment', requirements: [
      /cert logout desktop containment/, /cert logout mobile containment/,
    ] },
  ]),
  'authentication-password-reset': Object.freeze([
    { dimension: 'happyPath', caseId: 'reset-known-oob-new-password-transition', requirements: [
      /reset valid OOB redemption/, /reset old password denial/, /reset new password acceptance/, /reset action visible completion/,
    ] },
    { dimension: 'negativePath', caseId: 'reset-unknown-reused-modified-wrong-account', requirements: [
      /reset unknown email nonenumeration/, /reset modified OOB denial/, /reset reused OOB denial/,
      /reset wrong-account password unchanged/, /reset wrong-account reset attempt denied/, /reset oversized payload denial/, /reset double-submit single request/,
      /reset action missing-password visible error/, /reset action consumed reload status/,
    ] },
    { dimension: 'permission', caseId: 'reset-nonenumeration-and-single-recipient', requirements: [
      /reset OOB recipient binding/, /reset wrong-account password unchanged/, /known-provider-block reset request path/, /unknown reset request path/,
    ] },
    { dimension: 'persistence', caseId: 'reset-old-denied-new-accepted-reload', requirements: [
      /reset exact password restoration/, /reset restored identity sign-in/, /reset action completion reload state/,
    ] },
    { dimension: 'console', caseId: 'reset-local-console', requirements: [
      /known-provider-block reset request allowlisted console errors/, /reset action console errors/,
    ] },
    { dimension: 'network', caseId: 'reset-local-network', requirements: [
      /known-provider-block reset request expected failure response/, /reset action unexpected responses/,
    ] },
    { dimension: 'responsive', caseId: 'reset-request-action-two-viewports', requirements: [
      /reset request and action states two viewports/,
    ] },
  ]),
  'account-lifecycle-disable-delete-cancel-purge': Object.freeze([
    { dimension: 'happyPath', caseId: 'lifecycle-schedule-cancel-suspend-restore', requirements: [
      /lifecycle self schedule deletion/, /lifecycle self cancel deletion/, /lifecycle suspend account/, /lifecycle restore account/,
    ] },
    { dimension: 'negativePath', caseId: 'lifecycle-owner-subscription-invalid-transition', requirements: [
      /lifecycle owner guard/, /lifecycle subscription guard/, /lifecycle invalid cancel transition denial/, /lifecycle wrong confirmation denial/,
    ] },
    { dimension: 'permission', caseId: 'lifecycle-cross-user-and-admin-boundary', requirements: [
      /lifecycle cross-user nonadmin denial/, /lifecycle self target isolation/,
    ] },
    { dimension: 'persistence', caseId: 'lifecycle-state-reload-and-local-retry', requirements: [
      /lifecycle purge clock boundary/, /lifecycle injected partial failure retained for retry/, /lifecycle retry terminal reconciliation/,
    ] },
    { dimension: 'console', caseId: 'lifecycle-local-console', requirements: [/lifecycle browser workflow console errors/] },
    { dimension: 'network', caseId: 'lifecycle-local-network', requirements: [/lifecycle browser workflow unexpected responses/] },
    { dimension: 'responsive', caseId: 'lifecycle-settings-admin-desktop', requirements: [
      /lifecycle admin surface desktop routes/, /lifecycle settings surface mobile routes/,
    ] },
  ]),
  'signup-onboarding-coach-admin-league-parent-adult-player-signup': Object.freeze([
    { dimension: 'happyPath', caseId: 'signup-five-role-create-verify-landings', requirements: [
      { pattern: /signup .* verified destination and reload/, minCount: 5 },
    ] },
    { dimension: 'negativePath', caseId: 'signup-invalid-duplicate-aborted-provider-failure', requirements: [
      /signup duplicate email denial/, /signup invalid input UI denial/, /signup aborted delivery UI recovery/, /signup provider failure delivery UI recovery/,
    ] },
    { dimension: 'permission', caseId: 'signup-preverification-and-privileged-field-denial', requirements: [
      { pattern: /signup .* preverification session denial/, minCount: 5 }, /signup privileged field injection denied/,
    ] },
    { dimension: 'persistence', caseId: 'signup-five-role-profile-reload', requirements: [
      { pattern: /signup .* persisted role/, minCount: 5 }, { pattern: /signup .* verified destination and reload/, minCount: 5 },
    ] },
    { dimension: 'console', caseId: 'signup-local-console', requirements: [{ pattern: /signup .* workflow console errors/, minCount: 5 }] },
    { dimension: 'network', caseId: 'signup-local-network', requirements: [{ pattern: /signup .* workflow unexpected responses/, minCount: 5 }] },
    { dimension: 'responsive', caseId: 'signup-five-role-two-viewports', requirements: [{ pattern: /signup .* two viewport states/, minCount: 5 }] },
  ]),
  'signup-onboarding-youth-invitation-signup': Object.freeze([
    { dimension: 'happyPath', caseId: 'youth-invite-create-redeem-linkage', requirements: [
      /youth invitation redemption/, /youth player login linkage/, /youth browser exact player linkage/,
    ] },
    { dimension: 'negativePath', caseId: 'youth-modified-expired-reused-wrong-recipient', requirements: [
      /youth modified token denial/, /youth expired token denial/, /youth reused invitation denial/, /youth wrong-existing-account denial/,
    ] },
    { dimension: 'permission', caseId: 'youth-cross-guardian-team-and-pii-allowlist', requirements: [
      /youth cross-guardian target nondisclosure/, /youth other-player denial/, /youth removed-member denial/,
      /youth wrong-team staff denial/, /youth invite PII allowlist/, /youth activated tenant authority/,
      /youth forged primary-team cannot mint membership/, /youth forged joined-teams cannot mint membership/,
      /youth removed child cannot mint membership/, /youth post-invite team change denial/,
    ] },
    { dimension: 'persistence', caseId: 'youth-player-membership-refresh-relogin', requirements: [
      /youth player login state/, /youth profile player linkage/, /youth relogin profile persistence/,
    ] },
    { dimension: 'console', caseId: 'youth-local-console', requirements: [/youth activation workflow console errors/] },
    { dimension: 'network', caseId: 'youth-local-network', requirements: [/youth activation workflow unexpected responses/] },
    { dimension: 'responsive', caseId: 'youth-invite-activation-two-viewports', requirements: [/youth active invitation two viewports/] },
  ]),
  'signup-onboarding-missing-profile-onboarding': Object.freeze([
    { dimension: 'happyPath', caseId: 'onboarding-missing-partial-role-completion', requirements: [
      /missing profile session establishment/, /partial profile privileged API denial/, /onboarding persisted role-without-plan partial profile/,
      /onboarding transient read failure recovery/, { pattern: /onboarding role .* completion destination/, minCount: 5 },
    ] },
    { dimension: 'negativePath', caseId: 'onboarding-validation-double-submit-refresh', requirements: [
      /onboarding empty validation/, /onboarding overlong validation/, /onboarding double-submit single profile write/, /onboarding mid-form refresh reset/,
    ] },
    { dimension: 'permission', caseId: 'onboarding-protected-route-api-and-field-denial', requirements: [
      /missing profile privileged API denial/, /onboarding privileged field injection denied/, /onboarding sensitive route matrix denied/,
    ] },
    { dimension: 'persistence', caseId: 'onboarding-profile-landing-refresh-relogin', requirements: [
      { pattern: /onboarding role .* relogin destination/, minCount: 5 },
    ] },
    { dimension: 'console', caseId: 'onboarding-local-console', requirements: [{ pattern: /onboarding role .* workflow console errors/, minCount: 5 }] },
    { dimension: 'network', caseId: 'onboarding-local-network', requirements: [{ pattern: /onboarding role .* workflow unexpected responses/, minCount: 5 }] },
    { dimension: 'responsive', caseId: 'onboarding-states-two-viewports', requirements: [{ pattern: /onboarding role .* two viewport states/, minCount: 5 }] },
  ]),
  'demo-seed-use-exit-expiry-cleanup': Object.freeze([
    { dimension: 'happyPath', caseId: 'demo-two-context-seed-use-exit', requirements: [
      /demo context 1 seed/, /demo context 2 seed/, /demo two-browser-context workspace use/, /demo browser exact exit cleanup/,
    ] },
    { dimension: 'negativePath', caseId: 'demo-cross-id-duplicate-billing-expiry-retry', requirements: [
      /demo cross-ID denial/, /demo context 1 duplicate seed idempotency/, /demo context 1 billing denial/,
      /demo expiry boundary/, /demo injected cleanup failure retained/, /demo cleanup retry recovery/,
    ] },
    { dimension: 'permission', caseId: 'demo-registered-and-cross-context-denial', requirements: [
      /demo registered-account exclusion/, /demo peer-context exit isolation/, /demo cross-context graph denial/,
    ] },
    { dimension: 'persistence', caseId: 'demo-refresh-back-exit-isolation', requirements: [
      /demo context 1 exited session denial/, /demo context .* graph exact reconciliation/, /demo pending cleanup recovery/,
    ] },
    { dimension: 'console', caseId: 'demo-local-console', requirements: [/demo browser console errors/] },
    { dimension: 'network', caseId: 'demo-local-network', requirements: [/demo browser unexpected responses/] },
    { dimension: 'responsive', caseId: 'demo-workspace-exit-error-two-viewports', requirements: [/demo browser two viewport states/] },
  ]),
  'dashboard-shell-role-landing-and-route-policy': Object.freeze([
    { dimension: 'happyPath', caseId: 'dashboard-twenty-role-plan-state-landings', requirements: [{ pattern: / login destination$/, minCount: 20 }] },
    { dimension: 'negativePath', caseId: 'dashboard-navigation-direct-route-denials', requirements: [
      { pattern: /dashboard policy denied route/, minCount: 19 }, { pattern: /dashboard blocked-state protected data denial .* message/, minCount: 3 },
    ] },
    { dimension: 'permission', caseId: 'dashboard-complete-role-plan-state-policy', requirements: [
      { pattern: /dashboard complete route policy /, minCount: 20 }, { pattern: /dashboard visible navigation agreement /, minCount: 20 },
    ] },
    { dimension: 'persistence', caseId: 'dashboard-refresh-new-tab-back-team-session', requirements: [{ pattern: / refresh and Back destination$/, minCount: 20 }] },
    { dimension: 'console', caseId: 'dashboard-local-console', requirements: [{ pattern: / persistence console errors$/, minCount: 20 }] },
    { dimension: 'network', caseId: 'dashboard-local-network', requirements: [{ pattern: / persistence failed responses$/, minCount: 20 }] },
    { dimension: 'responsive', caseId: 'dashboard-policy-two-viewports', requirements: [
      { pattern: /dashboard policy two viewport containment/, minCount: 20 }, { pattern: /dashboard visible navigation two viewport containment/, minCount: 20 },
    ] },
  ]),
  'administration-access-and-user-directory': Object.freeze([
    { dimension: 'happyPath', caseId: 'admin-directory-search-sort-target-isolation', requirements: [
      /admin directory target search visibility/, /admin directory actual ascending sort/, /admin directory actual descending sort/, /admin detail target substitution denied/,
    ] },
    { dimension: 'negativePath', caseId: 'admin-malformed-target-and-every-nonsa-denial', requirements: [
      /admin malformed target denial/, { pattern: /admin non-SA denial /, minCount: 19 }, { pattern: /admin browser non-SA route denial /, minCount: 22 },
    ] },
    { dimension: 'permission', caseId: 'admin-claim-revoke-refresh-restore-rules', requirements: [
      /admin revoked already-issued token denial/, /admin open page revoked open tabs denied/,
      { pattern: /admin rules direct read denial /, minCount: 19 },
    ] },
    { dimension: 'persistence', caseId: 'admin-session-revoke-restore-continuity', requirements: [
      /admin restored claim access/, /admin open page restored browser continuity/,
    ] },
    { dimension: 'console', caseId: 'admin-local-console', requirements: [/admin directory workflow console errors/] },
    { dimension: 'network', caseId: 'admin-local-network', requirements: [/admin directory workflow unexpected responses/] },
    { dimension: 'responsive', caseId: 'admin-directory-denial-two-viewports', requirements: [/admin directory mobile containment/, /trusted administration surface desktop routes/] },
  ]),
});

function normalizedCaseRequirement(requirement) {
  return requirement instanceof RegExp ? { pattern: requirement, minCount: 1 } : requirement;
}

export function buildCompletedCertificationCases(scenarioId, assertions) {
  const contracts = certificationCaseContracts[scenarioId] || [];
  return contracts.flatMap(contract => {
    const requirements = contract.requirements.map(normalizedCaseRequirement);
    const complete = requirements.every(({ pattern, minCount = 1 }) =>
      assertions.filter(assertion => pattern.test(assertion.label)).length >= minCount);
    if (!complete) return [];
    const patterns = requirements.map(({ pattern }) => pattern);
    return [{ ...contract, assertions: selectCertificationCaseAssertions(assertions, patterns) }];
  });
}

function recordCompletedCertificationCases(scenarioId) {
  const notObserved = certificationNotObservedCases[scenarioId] || {};
  for (const completed of buildCompletedCertificationCases(scenarioId, activeCertificationAssertions)) {
    if (notObserved[completed.caseId]) continue;
    const requiredIds = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId]?.[completed.dimension] || [];
    if (!requiredIds.includes(completed.caseId)) {
      throw new Error(`Case contract ${completed.caseId} is not frozen for ${scenarioId}/${completed.dimension}.`);
    }
    const firstCapturedAt = completed.assertions
      .map(assertion => assertion.capturedAt)
      .filter(Boolean)
      .sort()[0] || null;
    recordCertificationCase(
      scenarioId,
      completed.dimension,
      completed.caseId,
      `${completed.assertions.length} case-owned assertion(s) completed`,
      'every named locally safe assertion in this case contract completed',
      firstCapturedAt,
      { assertions: completed.assertions },
    );
  }
  for (const [caseId, reason] of Object.entries(notObserved)) {
    const dimension = Object.entries(LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId])
      .find(([, caseIds]) => caseIds.includes(caseId))?.[0];
    if (!dimension) throw new Error(`NOT_OBSERVED case ${caseId} is outside the frozen scenario contract.`);
    const timestamp = new Date().toISOString();
    emitCertificationEvent({
      type: 'case', scenarioId, caseId, dimension,
      runId: certificationRunId, commit: certificationCommit,
      actorAliases: certificationActorAliases(scenarioId),
      role: certificationScenarioById.get(scenarioId).roles.join('/'),
      tenantAlias: certificationTenantAlias(scenarioId),
      expected: 'locally safe contract completed', observed: reason, state: 'NOT_OBSERVED',
      startedAt: timestamp, completedAt: timestamp, artifacts: [],
    });
  }
}

function recordCertificationCase(
  scenarioId,
  dimension,
  caseId,
  observed,
  expected = 'locally safe contract completed',
  caseStartedAt = null,
  { assertions = activeCertificationAssertions, role, tenantAlias } = {},
) {
  const scenario = certificationScenarioById.get(scenarioId);
  const startedAt = new Date().toISOString();
  const relativeArtifact = `cases/${caseId}.json`;
  mkdirSync(path.join(certificationArtifactDir, 'cases'), { recursive: true });
  const artifact = {
    runId: certificationRunId, commit: certificationCommit,
    scenarioId, caseId, dimension, expected: String(expected), observed: String(observed),
    actorAliases: certificationActorAliases(scenarioId),
    assertions,
    capturedAt: startedAt,
  };
  writeFileSync(path.join(certificationArtifactDir, relativeArtifact), `${JSON.stringify(sanitizeCertificationArtifact(artifact), null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    runId: certificationRunId, commit: certificationCommit,
    actorAliases: certificationActorAliases(scenarioId),
    role: role || scenario.roles.join('/'),
    tenantAlias: tenantAlias || certificationTenantAlias(scenarioId),
    expected: String(expected), observed: String(observed), state: 'OBSERVED',
    startedAt: caseStartedAt || startedAt, completedAt: new Date().toISOString(), artifacts: [relativeArtifact],
  });
}

function recordCertificationFailure(scenarioId, dimension, caseId, error) {
  const scenario = certificationScenarioById.get(scenarioId);
  const timestamp = new Date().toISOString();
  const diagnostic = redact(error instanceof Error ? error.message : String(error)).slice(0, 500);
  const relativeArtifact = `cases/${caseId}-failure-${Date.now()}.json`;
  mkdirSync(path.join(certificationArtifactDir, 'cases'), { recursive: true });
  writeFileSync(path.join(certificationArtifactDir, relativeArtifact), `${JSON.stringify(sanitizeCertificationArtifact({
    runId: certificationRunId,
    commit: certificationCommit,
    scenarioId,
    caseId,
    dimension,
    actorAliases: certificationActorAliases(scenarioId),
    expected: 'locally safe contract completed',
    observed: diagnostic,
    diagnostic,
    capturedAt: timestamp,
  }), null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    runId: certificationRunId, commit: certificationCommit,
    actorAliases: certificationActorAliases(scenarioId),
    role: scenario.roles.join('/'), tenantAlias: certificationTenantAlias(scenarioId),
    expected: 'locally safe contract completed', observed: diagnostic, state: 'FAIL',
    startedAt: timestamp, completedAt: timestamp, artifacts: [relativeArtifact],
  });
}

const firebaseConfig = JSON.stringify({
  projectId: PROJECT_ID,
  apiKey: 'phase2-emulator-api-key',
  appId: '1:123456789:web:phase2audit',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: '123456789',
});

const OUTBOUND_CREDENTIAL_PATTERN = /^(?:STRIPE_|NEXT_PUBLIC_STRIPE_|RESEND_|WEB_PUSH_|NEXT_PUBLIC_WEB_PUSH_|NEXT_PUBLIC_FCM_|OWNER_FCM_TOKEN$|OWNER_NOTIFICATION_EMAIL$|INTERNAL_API_SECRET$|FIREBASE_SERVICE_ACCOUNT_JSON$|GOOGLE_APPLICATION_CREDENTIALS$)/;
const OUTBOUND_CREDENTIAL_KEYS = Object.freeze([
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_PRICE_TEAM_MONTHLY',
  'STRIPE_PRICE_TEAM_ANNUAL',
  'STRIPE_PRICE_ELITE_TEAMS_MONTHLY',
  'STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
  'STRIPE_PRICE_ELITE_LEAGUE_MONTHLY',
  'STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
  'STRIPE_PRICE_SCHOOLS_MONTHLY',
  'STRIPE_PRICE_SCHOOLS_ANNUAL',
  'STRIPE_PRICE_EXTRA_TEAM_MONTHLY',
  'STRIPE_PRICE_EXTRA_TEAM_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'RESEND_BASE_URL',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'WEB_PUSH_VAPID_SUBJECT',
  'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_FCM_VAPID_KEY',
  'OWNER_FCM_TOKEN',
  'OWNER_NOTIFICATION_EMAIL',
  'INTERNAL_API_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS',
]);

export function buildIsolatedAuditEnvironment(baseEnvironment, overrides = {}) {
  const isolated = { ...baseEnvironment, ...overrides };
  for (const key of Object.keys(isolated)) {
    if (OUTBOUND_CREDENTIAL_PATTERN.test(key)) isolated[key] = '';
  }
  for (const key of OUTBOUND_CREDENTIAL_KEYS) isolated[key] = '';
  isolated.AUDIT_OUTBOUND_PROVIDER_MODE = 'block';
  return isolated;
}

const env = buildIsolatedAuditEnvironment(process.env, {
  AUDIT_FIXTURE_PASSWORD: password,
  AUDIT_FIXTURE_RUN_SUFFIX: FIXTURE_RUN_SUFFIX,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: firebaseConfig,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
});

const identityByAlias = new Map(FIXTURES.identities.map(identity => [identity.alias, identity]));

export function buildBlockedAuditPlan(blockedAliases) {
  const entries = blockedAliases.map(identity => Object.freeze({ ...identity }));
  return Object.freeze({
    api: Object.freeze(entries),
    browser: Object.freeze(entries.filter(identity => identity.browserPath && identity.browserTitle)),
  });
}

export function buildIdentityApiTargets(fixtures) {
  const teamAId = fixtures.teams.find(team => team.alias === 'qa-team-a')?.id;
  const teamBId = fixtures.teams.find(team => team.alias === 'qa-team-b')?.id;
  if (!teamAId || !teamBId) throw new Error('Identity API audit requires Team A and Team B fixture IDs.');
  return Object.freeze({ teamAId, teamBId });
}

export function buildIdentityApiRequestPlan(fixtures) {
  const { teamAId, teamBId } = buildIdentityApiTargets(fixtures);
  return Object.freeze([
    Object.freeze({ alias: 'qa-coach-owner-a', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 200 }),
    Object.freeze({ alias: 'qa-coach-owner-a', pathname: `/api/teams/chat?teamId=${teamBId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-coach-owner-b', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-removed-member', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-pending-delete', pathname: `/api/teams/chat?teamId=${teamBId}`, expectedStatus: 403 }),
  ]);
}

const BLOCKED_AUDIT_PLAN = buildBlockedAuditPlan(FIXTURES.blockedAliases);

function emailForAlias(alias) {
  const email = identityByAlias.get(alias)?.email;
  if (!email) throw new Error(`Fixture alias ${alias} does not have a registered email identity.`);
  return email;
}

function storageObjectUrl(objectPath) {
  return `http://127.0.0.1:9199/v0/b/${PROJECT_ID}.appspot.com/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function redact(value) {
  let output = String(value || '');
  for (const secret of sensitiveValues) output = output.replaceAll(secret, '[redacted]');
  return output.replace(/Bearer\s+\S+/gi, '[redacted]');
}

function registerSensitiveValue(value) {
  if (typeof value === 'string' && value) sensitiveValues.add(value);
  return value;
}

function waitForPort(port, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) reject(new Error(`Timed out waiting for port ${port}.`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function startProcess(command, args, logName) {
  const logPath = path.join(logDir, logName);
  const output = openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd: process.cwd(), env, stdio: ['ignore', output, output], detached: process.platform !== 'win32',
  });
  if (processGroupRegistry && process.platform !== 'win32') {
    mkdirSync(path.dirname(processGroupRegistry), { recursive: true });
    appendFileSync(processGroupRegistry, `${child.pid}\n`, { mode: 0o600 });
  }
  children.push(child);
  return child;
}

export function terminateChildProcessTree(child, signal = 'SIGTERM', killProcess = process.kill, platform = process.platform) {
  if (!child || child.killed || !Number.isInteger(child.pid)) return;
  try {
    if (platform === 'win32') child.kill(signal);
    else killProcess(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function terminateOwnedChildAndWait(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  terminateChildProcessTree(child);
  const completed = await Promise.race([
    exited.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!completed) {
    terminateChildProcessTree(child, 'SIGKILL');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))]);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    const diagnostic = output.length > 2_000 ? output.slice(-2_000) : output;
    throw new Error(redact(`${path.basename(command)} exited ${result.status}.\n${diagnostic}`));
  }
  return result.stdout.trim();
}

async function signIn(alias, suppliedPassword = password) {
  return signInEmail(emailForAlias(alias), suppliedPassword);
}

async function signInEmail(email, suppliedPassword = password) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=phase2',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email, password: suppliedPassword, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  return { status: response.status, body };
}

export function localTransportDiagnostic(method, pathname, error) {
  const rawCode = error?.cause?.code || error?.code || error?.name || 'unknown';
  const code = String(rawCode).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) || 'unknown';
  return `Local ${String(method || 'GET').toUpperCase()} ${pathname} transport failed (${code}).`;
}

export function isExpiredDemoCreation(creationTimeMs, nowMs, lifetimeMs = 15 * 60 * 1000) {
  return Number.isFinite(creationTimeMs) && Number.isFinite(nowMs) && nowMs - creationTimeMs > lifetimeMs;
}

export function isDeletionPurgeDue(purgeAtMs, nowMs) {
  return Number.isFinite(purgeAtMs) && Number.isFinite(nowMs) && purgeAtMs <= nowMs;
}

async function apiStatus(pathname, token, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
        'Connection': 'close',
      },
      redirect: 'manual',
    });
  } catch (error) {
    throw new Error(localTransportDiagnostic(init.method, pathname, error));
  }
  return response.status;
}

async function apiJsonResult(pathname, token, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
        'Connection': 'close',
      },
      redirect: 'manual',
    });
  } catch (error) {
    throw new Error(localTransportDiagnostic(init.method, pathname, error));
  }
  let body = null;
  try { body = await response.json(); } catch { /* status remains authoritative */ }
  return { status: response.status, body };
}

async function publicJsonStatus(pathname, body, headers = {}) {
  try {
    return (await fetch(`${BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Connection': 'close' },
      body: JSON.stringify(body),
      redirect: 'manual',
    })).status;
  } catch (error) {
    throw new Error(localTransportDiagnostic('POST', pathname, error));
  }
}

async function createDisposableIdentity(label, { anonymous = false } = {}) {
  const endpoint = anonymous ? 'accounts:signUp' : 'accounts:signUp';
  const body = anonymous
    ? { returnSecureToken: true }
    : { email: `${FIXTURES.runId}-${label}@phase2.test`, password, returnSecureToken: true };
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/${endpoint}?key=phase2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (response.status !== 200) throw new Error(`Disposable identity ${label} creation returned ${response.status}.`);
  registerDynamicAuthIdentity(payload.localId, label);
  return payload;
}

async function deleteDisposableIdentity(idToken) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify({ idToken }),
  });
  if (response.status !== 200) throw new Error(`Disposable identity cleanup returned ${response.status}.`);
}

async function createSessionCookie(idToken) {
  const response = await fetch(`${BASE_URL}/api/auth/session`, {
    method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, redirect: 'manual',
  });
  if (response.status !== 200) throw new Error(`Session creation returned ${response.status}.`);
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return cookies.map(value => value.split(';')[0]).filter(Boolean).join('; ');
}

async function deleteFirestoreMatches(collectionId, fieldPath, stringValue, authorizationToken) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
  };
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue } } },
    } }),
  });
  if (response.status !== 200) throw new Error(`Firestore cleanup query returned ${response.status}.`);
  const rows = await response.json();
  let deleted = 0;
  for (const row of rows) {
    const name = row.document?.name;
    if (!name) continue;
    const deletion = await fetch(`http://127.0.0.1:8080/v1/${name}`, { method: 'DELETE', headers });
    if (![200, 404].includes(deletion.status)) throw new Error(`Firestore cleanup delete returned ${deletion.status}.`);
    deleted += 1;
  }
  return deleted;
}

export function selectLatestOob(payload, email, requestType, excludedCodes = new Set()) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const match = [...(payload?.oobCodes || [])].reverse().find(item =>
    String(item.email || '').trim().toLowerCase() === normalizedEmail &&
    item.requestType === requestType &&
    typeof item.oobCode === 'string' && !excludedCodes.has(item.oobCode));
  const actionLabel = requestType === 'PASSWORD_RESET' ? 'password-reset' : requestType;
  if (!match) throw new Error(`No ${actionLabel} OOB was found for the selected synthetic recipient.`);
  return match;
}

export function selectLatestPasswordResetOob(payload, email, excludedCodes = new Set()) {
  return selectLatestOob(payload, email, 'PASSWORD_RESET', excludedCodes);
}

async function readEmulatorOobCodes() {
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`, { headers: { 'Connection': 'close' } });
  if (response.status !== 200) throw new Error(`Auth emulator OOB query returned ${response.status}.`);
  return response.json();
}

async function redeemPasswordReset(oobCode, newPassword) {
  return fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    body: JSON.stringify({ oobCode, newPassword }),
  });
}

async function redeemEmailVerification(oobCode) {
  return fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify({ oobCode }),
  });
}

export function withRoleClaim(claims, role) {
  return { ...(claims || {}), role };
}

export function fixtureDocumentByAlias(catalog, alias) {
  const document = catalog.firestoreDocuments.find(value => value.data.fixtureAlias === alias);
  if (!document) throw new Error(`Missing fixture document for alias ${alias}.`);
  return document;
}

export async function deleteOwnedAdminApp(app) {
  await app.delete();
}

export async function waitForIdTokenRevocationBoundary(idToken, {
  now = () => Date.now(),
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) {
  let authTime;
  try {
    authTime = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')).auth_time;
  } catch {
    authTime = undefined;
  }
  if (!Number.isInteger(authTime)) throw new Error('ID token does not contain a valid auth_time.');
  const boundary = (authTime + 1) * 1000;
  while (now() < boundary) await wait(boundary - now());
}

async function withEmulatorAuthAdmin(callback) {
  const adminModule = await import('firebase-admin');
  const admin = adminModule.default || adminModule;
  const appName = `task3-auth-admin-${process.pid}-${Date.now()}`;
  const app = admin.initializeApp({
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    httpAgent: new HttpAgent({ keepAlive: false }),
  }, appName);
  try {
    return await callback(admin.auth(app), admin.firestore(app), admin.storage(app).bucket());
  } finally {
    await deleteOwnedAdminApp(app);
  }
}

async function getAuthUserByEmailIfPresent(authAdmin, email) {
  try {
    return await authAdmin.getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

function registerDynamicAuthIdentity(uid, label, registry = dynamicResourceRegistry) {
  registerCertificationSensitiveAlias(uid, label);
  registry.register({
    id: `auth:${label}:${uid}`,
    kind: 'deleted',
    async cleanup() {
      return withEmulatorAuthAdmin(async authAdmin => {
        try {
          await authAdmin.getUser(uid);
          await authAdmin.deleteUser(uid);
          return true;
        } catch (error) {
          if (error?.code === 'auth/user-not-found') return false;
          throw error;
        }
      });
    },
    async verify() {
      return withEmulatorAuthAdmin(async authAdmin => {
        try {
          await authAdmin.getUser(uid);
          return false;
        } catch (error) {
          if (error?.code === 'auth/user-not-found') return true;
          throw error;
        }
      });
    },
  });
}

function registerDynamicFirestoreRoot(documentPath, label, registry = dynamicResourceRegistry) {
  registry.register({
    id: `firestore:${label}`,
    kind: 'deleted',
    async cleanup() {
      return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const ref = firestoreAdmin.doc(documentPath);
        const existed = (await ref.get()).exists || (await ref.listCollections()).length > 0;
        await firestoreAdmin.recursiveDelete(ref);
        return existed;
      });
    },
    async verify() {
      return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const ref = firestoreAdmin.doc(documentPath);
        return !(await ref.get()).exists && (await ref.listCollections()).length === 0;
      });
    },
  });
}

async function registerBrowserDemoGraph(uid, label) {
  // The Auth identity and root are registered before graph discovery so a
  // failure during discovery still has an exact fallback owner.
  registerDynamicAuthIdentity(uid, `${label}-auth`);
  registerDynamicFirestoreRoot(`users/${uid}`, `${label}-user`);
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const [teams, leagues] = await Promise.all([
      firestoreAdmin.collection('teams').where('demoSessionOwnerId', '==', uid).get(),
      firestoreAdmin.collection('leagues').where('creatorId', '==', uid).get(),
    ]);
    teams.docs.forEach((document, index) => registerDynamicFirestoreRoot(document.ref.path, `${label}-team-${index + 1}`));
    leagues.docs.forEach((document, index) => registerDynamicFirestoreRoot(document.ref.path, `${label}-league-${index + 1}`));
  });
}

function registerClaimRestoration(uid, originalClaims, label, registry = dynamicResourceRegistry) {
  const expected = JSON.stringify(originalClaims || {});
  registry.register({
    id: `claim:${label}:${uid}`,
    kind: 'restored',
    async cleanup() {
      return withEmulatorAuthAdmin(async authAdmin => {
        const current = await authAdmin.getUser(uid);
        if (JSON.stringify(current.customClaims || {}) === expected) return false;
        await authAdmin.setCustomUserClaims(uid, originalClaims || null);
        await authAdmin.revokeRefreshTokens(uid);
        return true;
      });
    },
    async verify() {
      return withEmulatorAuthAdmin(async authAdmin =>
        JSON.stringify((await authAdmin.getUser(uid)).customClaims || {}) === expected);
    },
  });
}

function registerDynamicStorageObject(objectPath, label, registry = dynamicResourceRegistry) {
  registry.register({
    id: `storage:${label}`,
    kind: 'deleted',
    async cleanup() {
      return withEmulatorAuthAdmin(async (_authAdmin, _firestoreAdmin, bucket) => {
        const file = bucket.file(objectPath);
        const [exists] = await file.exists();
        await file.delete({ ignoreNotFound: true });
        return exists;
      });
    },
    async verify() {
      return withEmulatorAuthAdmin(async (_authAdmin, _firestoreAdmin, bucket) =>
        !(await bucket.file(objectPath).exists())[0]);
    },
  });
}

function registerFirestoreDocumentRestoration(documentPath, originalValue, label, registry = dynamicResourceRegistry) {
  const expected = JSON.stringify(originalValue);
  registry.register({
    id: `restore-firestore:${label}`,
    kind: 'restored',
    async cleanup() {
      return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const ref = firestoreAdmin.doc(documentPath);
        const current = await ref.get();
        if (current.exists && JSON.stringify(current.data()) === expected) return false;
        await ref.set(originalValue);
        return true;
      });
    },
    async verify() {
      return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const current = await firestoreAdmin.doc(documentPath).get();
        return current.exists && JSON.stringify(current.data()) === expected;
      });
    },
  });
}

async function runCertificationApiScenario(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') {
    expectEqual(await publicJsonStatus('/api/public/submissions', { type: 'contact', values: {} }), 400, 'marketing malformed submission denial');
    expectEqual(await publicJsonStatus('/api/referrals/coach', { website: 'bot-filled' }), 200, 'marketing honeypot neutral response');
    const suffix = FIXTURES.runId.slice(-24);
    const contactEmail = `contact-${suffix}@phase2.test`;
    const betaEmail = `beta-${suffix}@phase2.test`;
    const coachEmail = `coach-${suffix}@phase2.test`;
    const cleanupIdentity = await signIn('qa-superadmin');
    expectEqual(cleanupIdentity.status, 200, 'marketing cleanup authorization');
    try {
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'contact', name: 'Oversize', email: contactEmail, organization: 'Task 3', inquiry: 'x'.repeat(25_000),
      }, { 'x-forwarded-for': `oversize-${suffix}` }), 413, 'marketing oversized payload denial');
      const rateStatuses = [];
      for (let index = 0; index < 7; index += 1) {
        rateStatuses.push(await publicJsonStatus('/api/public/submissions', { type: 'contact', values: {} }, {
          'x-forwarded-for': `rate-${suffix}`,
        }));
      }
      expectEqual(rateStatuses.slice(0, 6).every(status => status === 400), true, 'marketing rate-limit prethreshold validation');
      expectEqual(rateStatuses[6], 429, 'marketing rate-limit enforcement');
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'contact', name: 'Certification Visitor', email: contactEmail, organization: 'Task 3', inquiry: 'Local isolated inquiry', status: 'attacker-controlled',
      }, { 'x-forwarded-for': `contact-${suffix}` }), 200, 'marketing local contact persistence');
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'beta', fullName: 'Certification Coach', email: betaEmail, role: 'coach', organization: 'Task 3',
        sports: 'Soccer', scale: 'One team', currentTools: 'Local test', frustrations: 'Synthetic local-only case',
        mustHave: 'Safe deterministic flow', whyBeta: 'Certification', tested_before: 'no', frequency: 'Weekly',
        address_street: '1 Test Way', address_city: 'Edmonton', address_state: 'AB', address_zip: 'T0T0T0',
      }, { 'x-forwarded-for': `beta-${suffix}` }), 200, 'marketing local beta persistence');
      const referralBody = {
        parentName: 'Certification Parent', coachName: 'Certification Coach', coachEmail,
        submissionId: `task3-${suffix}-referral`, website: '',
      };
      const referral = await apiJsonResult('/api/referrals/coach', null, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `referral-${suffix}` },
        body: JSON.stringify(referralBody),
      });
      expectEqual(referral.status, 200, 'marketing accepted local mail transport');
      expectEqual(referral.body?.localTransport, true, 'marketing no-outbound memory sink');
      const duplicate = await apiJsonResult('/api/referrals/coach', null, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `referral-${suffix}` },
        body: JSON.stringify(referralBody),
      });
      expectEqual(duplicate.status, 200, 'marketing duplicate referral idempotency');
      expectEqual(duplicate.body?.duplicate, true, 'marketing duplicate delivered once marker');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const contactRows = await firestoreAdmin.collection('contact_inquiries').where('email', '==', contactEmail).get();
        const betaRows = await firestoreAdmin.collection('beta_applications').where('email', '==', betaEmail).get();
        const referralRows = await firestoreAdmin.collection('parent_coach_referrals').where('coachEmail', '==', coachEmail).get();
        expectEqual(contactRows.size, 1, 'marketing contact stored once');
        expectEqual(contactRows.docs[0]?.data().status, 'new', 'marketing contact privileged status ignored');
        expectEqual(betaRows.size, 1, 'marketing beta stored once');
        expectEqual(referralRows.size, 1, 'marketing referral stored once');
        expectEqual(referralRows.docs[0]?.data().deliveryStatus, 'accepted_local_sink', 'marketing local sink persistence');
        expectEqual(Boolean(contactRows.docs[0]?.data()), true, 'marketing trusted record read');
        const firestoreDocumentUrl = collectionAndId =>
          `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionAndId}`;
        const contactDocument = `contact_inquiries/${contactRows.docs[0].id}`;
        const anonymousRead = await fetch(firestoreDocumentUrl(contactDocument), { headers: { Connection: 'close' } });
        expectEqual([401, 403].includes(anonymousRead.status), true, 'marketing anonymous record read denied');
        const member = await signIn('qa-team-member');
        const memberRead = await fetch(firestoreDocumentUrl(contactDocument), {
          headers: { Authorization: `Bearer ${member.body.idToken}`, Connection: 'close' },
        });
        expectEqual(memberRead.status, 403, 'marketing member record read denied');
      });
    } finally {
      const deleted = await deleteFirestoreMatches('contact_inquiries', 'email', contactEmail, cleanupIdentity.body.idToken) +
        await deleteFirestoreMatches('beta_applications', 'email', betaEmail, cleanupIdentity.body.idToken) +
        await deleteFirestoreMatches('parent_coach_referrals', 'coachEmail', coachEmail, 'owner');
      expectEqual(deleted, 3, 'marketing exact dynamic cleanup');
    }
    return;
  }

  if (scenarioId === 'authentication-email-password-login') {
    const tokens = new Map();
    for (const alias of FIXTURES.activeAliases) {
      const result = await signIn(alias);
      expectEqual(result.status, 200, `${alias} certification sign-in`);
      expectEqual(await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }), 200, `${alias} certification session`);
      tokens.set(alias, result.body.idToken);
    }
    const unknown = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=phase2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email: `unknown-${FIXTURES.runId}@phase2.test`, password, returnSecureToken: true }),
    });
    expectEqual(unknown.status, 400, 'unknown identity generic Auth denial');
    const wrong = await signIn('qa-coach-owner-a', 'definitely-wrong');
    expectEqual(wrong.status, 400, 'wrong password generic Auth denial');
    for (const blockedIdentity of BLOCKED_AUDIT_PLAN.api) {
      const result = await signIn(blockedIdentity.alias);
      expectEqual(result.status, blockedIdentity.signInStatus, `${blockedIdentity.alias} certification blocked state`);
      if (result.status === 200) tokens.set(blockedIdentity.alias, result.body.idToken);
    }
    for (const target of buildIdentityApiRequestPlan(FIXTURES)) {
      expectEqual(await apiStatus(target.pathname, tokens.get(target.alias)), target.expectedStatus, `scoped tenant request ${target.alias} ${target.expectedStatus}`);
    }
    return;
  }

  if (scenarioId === 'authentication-password-reset') {
    expectEqual(await publicJsonStatus('/api/email/reset-password', { email: 'invalid' }), 400, 'reset invalid email denial');
    expectEqual(await publicJsonStatus('/api/email/reset-password', { email: `${'x'.repeat(5_000)}@phase2.test` }), 413, 'reset oversized payload denial');
    expectEqual(await publicJsonStatus('/api/email/reset-password', { email: `unknown-${FIXTURES.runId}@phase2.test` }), 200, 'reset unknown email nonenumeration');
    const knownStatus = await publicJsonStatus('/api/email/reset-password', { email: emailForAlias('qa-coach-owner-b') });
    expectEqual(knownStatus, 200, 'reset known local no-outbound neutral response after OOB generation');
    const targetEmail = emailForAlias('qa-coach-owner-b');
    const resetCode = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail);
    registerSensitiveValue(resetCode.oobCode);
    expectEqual(resetCode.email.toLowerCase(), targetEmail.toLowerCase(), 'reset OOB recipient binding');
    expectEqual((await redeemPasswordReset(`${resetCode.oobCode}modified`, 'replacement-password-a')).status, 400, 'reset modified OOB denial');
    const replacementPassword = `replacement-${FIXTURES.runId}`;
    expectEqual((await redeemPasswordReset(resetCode.oobCode, replacementPassword)).status, 200, 'reset valid OOB redemption');
    expectEqual((await redeemPasswordReset(resetCode.oobCode, 'reused-password')).status, 400, 'reset reused OOB denial');
    expectEqual((await signIn('qa-coach-owner-b')).status, 400, 'reset old password denial');
    expectEqual((await signIn('qa-coach-owner-b', replacementPassword)).status, 200, 'reset new password acceptance');
    expectEqual((await signIn('qa-coach-owner-a')).status, 200, 'reset wrong-account password unchanged');

    const restoreStatus = await publicJsonStatus('/api/email/reset-password', { email: targetEmail });
    expectEqual(restoreStatus, 200, 'reset restoration OOB generation with neutral response');
    const restoreCode = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail, new Set([resetCode.oobCode]));
    registerSensitiveValue(restoreCode.oobCode);
    expectEqual((await redeemPasswordReset(restoreCode.oobCode, password)).status, 200, 'reset exact password restoration');
    expectEqual((await signIn('qa-coach-owner-b')).status, 200, 'reset restored identity sign-in');
    return;
  }

  if (scenarioId === 'authentication-logout-revocation-multi-tab') {
    const active = await signIn('qa-coach-owner-a');
    expectEqual(active.status, 200, 'logout active identity sign-in');
    const cookie = await createSessionCookie(active.body.idToken);
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200, 'logout active session cookie accepted');
    const cleared = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'DELETE', headers: { Origin: BASE_URL, Cookie: cookie }, redirect: 'manual',
    });
    expectEqual(cleared.status, 200, 'logout cookie clear response');
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`)).status, 401, 'logout direct API denial without cookie');
    await withEmulatorAuthAdmin(async authAdmin => {
      await waitForIdTokenRevocationBoundary(active.body.idToken);
      await authAdmin.revokeRefreshTokens(identityByAlias.get('qa-coach-owner-a').uid);
    });
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401, 'logout emulator-admin revoked cookie denial');
    const refreshed = await signIn('qa-coach-owner-a');
    expectEqual(refreshed.status, 200, 'logout post-revocation fresh sign-in');
    expectEqual(await apiStatus('/api/auth/session', refreshed.body.idToken, { method: 'POST' }), 200, 'logout post-revocation fresh session');
    return;
  }

  if (scenarioId === 'account-lifecycle-disable-delete-cancel-purge') {
    const trusted = await signIn('qa-superadmin');
    expectEqual(trusted.status, 200, 'lifecycle trusted administrator sign-in');
    const ownerBlocked = identityByAlias.get('qa-owner-delete-blocked');
    expectEqual(await apiStatus(`/api/admin/users/${ownerBlocked.uid}/account-control`, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'schedule_deletion', confirmationEmail: ownerBlocked.email }),
    }), 409, 'lifecycle owner guard');
    expectEqual(await apiStatus(`/api/admin/users/${identityByAlias.get('qa-pro-owner').uid}/account-control`, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'schedule_deletion', confirmationEmail: emailForAlias('qa-pro-owner') }),
    }), 409, 'lifecycle subscription guard');
    expectEqual(await apiStatus('/api/admin/users/not%2Fa-valid-id/account-control', trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 400, 'lifecycle malformed target denial');
    const target = identityByAlias.get('qa-team-member');
    const targetPath = `/api/admin/users/${target.uid}/account-control`;
    const targetAction = (action, confirmationEmail) => apiStatus(targetPath, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action, ...(confirmationEmail ? { confirmationEmail } : {}) }),
    });
    const nonAdmin = await signIn('qa-parent-a');
    expectEqual(await apiStatus(targetPath, nonAdmin.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 403, 'lifecycle cross-user nonadmin denial');
    expectEqual(await targetAction('schedule_deletion', 'wrong-account@phase2.test'), 400, 'lifecycle wrong confirmation denial');
    try {
      expectEqual(await targetAction('cancel_deletion'), 409, 'lifecycle invalid cancel transition denial');
      const selfIdentity = await signIn('qa-team-member');
      expectEqual(await apiStatus('/api/account/deletion-request', selfIdentity.body.idToken, { method: 'POST', body: '{}' }), 200, 'lifecycle self schedule deletion');
      expectEqual(await targetAction('cancel_deletion'), 200, 'lifecycle self cancel deletion');
      expectEqual(await apiStatus(`/api/admin/users/${nonAdmin.body.localId}/account-control`, nonAdmin.body.idToken, {
        method: 'POST', body: JSON.stringify({ action: 'suspend' }),
      }), 403, 'lifecycle self target isolation');
      expectEqual(await targetAction('schedule_deletion', target.email), 200, 'lifecycle schedule deletion');
      expectEqual(await targetAction('schedule_deletion', target.email), 200, 'lifecycle idempotent schedule retry');
      expectEqual(await targetAction('suspend'), 409, 'lifecycle suspend while pending denial');
      expectEqual((await signIn('qa-team-member')).status, 400, 'lifecycle pending identity sign-in denial');
      expectEqual(await targetAction('cancel_deletion'), 200, 'lifecycle cancel deletion');
      expectEqual((await signIn('qa-team-member')).status, 200, 'lifecycle canceled identity sign-in restored');
      expectEqual(await targetAction('suspend'), 200, 'lifecycle suspend account');
      expectEqual((await signIn('qa-team-member')).status, 400, 'lifecycle suspended identity sign-in denial');
      expectEqual(await targetAction('restore'), 200, 'lifecycle restore account');
      expectEqual((await signIn('qa-team-member')).status, 200, 'lifecycle restored identity sign-in');
    } finally {
      const cancelStatus = await targetAction('cancel_deletion');
      if (![200, 409].includes(cancelStatus)) throw new Error(`Lifecycle cancellation cleanup returned ${cancelStatus}.`);
      const restoreStatus = await targetAction('restore');
      if (![200, 409].includes(restoreStatus)) throw new Error(`Lifecycle restoration cleanup returned ${restoreStatus}.`);
      const deletedLogs = await deleteFirestoreMatches('adminAuditLogs', 'targetUid', target.uid, 'owner');
      expectEqual(deletedLogs >= 4, true, 'lifecycle exact audit-log cleanup');
    }
    expectEqual(isDeletionPurgeDue(10_001, 10_000), false, 'lifecycle purge clock boundary before due');
    expectEqual(isDeletionPurgeDue(10_000, 10_000), true, 'lifecycle purge clock boundary');
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin, bucket) => {
      const email = `${FIXTURES.runId}-lifecycle-purge@phase2.test`;
      const account = await authAdmin.createUser({ email, password, emailVerified: true });
      const userRef = firestoreAdmin.collection('users').doc(account.uid);
      const requestRef = firestoreAdmin.collection('accountDeletionRequests').doc(account.uid);
      const financialRef = firestoreAdmin.collection('paymentRecords').doc(`retained-${account.uid}`);
      const storageFile = bucket.file(`users/${account.uid}/avatar.jpg`);
      registerDynamicAuthIdentity(account.uid, 'lifecycle-purge-probe');
      registerDynamicFirestoreRoot(userRef.path, 'lifecycle-purge-probe-user');
      registerDynamicFirestoreRoot(requestRef.path, 'lifecycle-purge-probe-request');
      registerDynamicFirestoreRoot(financialRef.path, 'lifecycle-purge-probe-financial-final');
      registerDynamicStorageObject(`users/${account.uid}/avatar.jpg`, 'lifecycle-purge-probe-avatar');
      await userRef.set({ id: account.uid, role: 'adult_player', deletionStatus: 'pending' });
      await requestRef.set({ uid: account.uid, status: 'pending', purgeAt: new Date(10_000) });
      await financialRef.set({ userId: account.uid, retainedByPolicy: true });
      await storageFile.save(Buffer.from('task3-local-purge-probe'), { resumable: false });
      let authAttempts = 0;
      const purgeRegistry = createResourceRegistry({ maxAttempts: 2 });
      purgeRegistry.register({
        id: 'financial:retained-record', kind: 'retainedAuditRecord',
        async cleanup() { return false; }, async verify() { return (await financialRef.get()).exists; },
      });
      purgeRegistry.register({
        id: 'firestore:deletion-request', kind: 'deleted',
        async cleanup() { const existed = (await requestRef.get()).exists; await requestRef.delete(); return existed; },
        async verify() { return !(await requestRef.get()).exists; },
      });
      purgeRegistry.register({
        id: 'firestore:user-profile', kind: 'deleted',
        async cleanup() { const existed = (await userRef.get()).exists; await firestoreAdmin.recursiveDelete(userRef); return existed; },
        async verify() { return !(await userRef.get()).exists; },
      });
      purgeRegistry.register({
        id: 'storage:user-avatar', kind: 'deleted',
        async cleanup() { const [exists] = await storageFile.exists(); await storageFile.delete({ ignoreNotFound: true }); return exists; },
        async verify() { return !(await storageFile.exists())[0]; },
      });
      purgeRegistry.register({
        id: 'auth:user', kind: 'deleted',
        async cleanup() {
          authAttempts += 1;
          if (authAttempts === 1) throw new Error('injected local Auth deletion failure');
          await authAdmin.deleteUser(account.uid);
          return true;
        },
        async verify() {
          return authAdmin.getUser(account.uid).then(() => false, error => {
            if (error?.code === 'auth/user-not-found') return true;
            throw error;
          });
        },
      });
      const purged = await purgeRegistry.cleanup();
      expectEqual(purged.diagnostics.length, 1, 'lifecycle injected partial failure retained for retry');
      expectEqual(purged.state, 'OBSERVED', 'lifecycle retry terminal reconciliation');
      expectEqual(purged.counts.deleted, 4, 'lifecycle Auth Firestore Storage delete reconciliation');
      expectEqual(purged.counts.retainedAuditRecords, 1, 'lifecycle retained financial record reconciliation');
    });
    return;
  }

  if (scenarioId === 'signup-onboarding-coach-admin-league-parent-adult-player-signup') {
    for (const role of ['coach', 'admin', 'league', 'parent', 'adult-player']) {
      const identity = await createDisposableIdentity(`signup-${role}`);
      try {
        expectEqual(await apiStatus('/api/auth/session', identity.idToken, { method: 'POST' }), 403, `signup ${role} preverification gate`);
      } finally {
        await deleteDisposableIdentity(identity.idToken);
      }
    }
    const duplicate = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=phase2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email: emailForAlias('qa-coach-owner-a'), password, returnSecureToken: true }),
    });
    expectEqual(duplicate.status, 400, 'signup duplicate email denial');
    const member = await signIn('qa-team-member');
    const memberUid = identityByAlias.get('qa-team-member').uid;
    const privilegeAttempt = await fetch(
      `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${memberUid}?updateMask.fieldPaths=role`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${member.body.idToken}`, Connection: 'close' },
        body: JSON.stringify({ fields: { role: { stringValue: 'superadmin' } } }),
      },
    );
    expectEqual(privilegeAttempt.status, 403, 'signup privileged field injection denied');
    return;
  }

  if (scenarioId === 'signup-onboarding-youth-invitation-signup') {
    expectEqual((await fetch(`${BASE_URL}/api/invites/youth?token=modified`)).status, 404, 'youth modified token denial');
    expectEqual(await publicJsonStatus('/api/invites/youth', { token: 'modified', password: 'long-enough' }), 401, 'youth unauthenticated invite mutation denial');
    const parent = await signIn('qa-parent-a');
    const otherParent = await signIn('qa-parent-b');
    const player = fixtureDocumentByAlias(FIXTURES, 'qa-player-youth-c');
    const youthEmail = emailForAlias('qa-youth-invite');
    expectEqual(await apiStatus('/api/invites/youth', otherParent.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
    }), 404, 'youth cross-guardian target nondisclosure');
    for (const [alias, label] of [
      ['qa-adult-player-a', 'other-player'],
      ['qa-team-member', 'other-member'],
      ['qa-removed-member', 'removed-member'],
      ['qa-coach-owner-b', 'wrong-team staff'],
    ]) {
      const identity = await signIn(alias);
      expectEqual(await apiStatus('/api/invites/youth', identity.body.idToken, {
        method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
      }), 404, `youth ${label} denial`);
    }
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const playerRef = firestoreAdmin.collection('players').doc(player.data.id);
      const originalPlayer = (await playerRef.get()).data();
      const youthCleanupRegistry = createResourceRegistry({ maxAttempts: 3 });
      const createdInviteTokens = new Set();
      let conflictingIdentity = null;
      let createdYouthUid = null;
      let primaryFailure = null;
      registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-api-player', dynamicResourceRegistry);
      registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-api-player', youthCleanupRegistry);
      try {
        const teamC = FIXTURES.teams.find(team => team.alias === 'qa-team-c');
        const forgedTeam = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
        const runTeamHintAttack = async (label, playerPatch) => {
          const attackEmail = `${FIXTURES.runId}-youth-${label}@phase2.test`;
          const attackRegistry = createResourceRegistry({ maxAttempts: 3 });
          registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, `youth-${label}-player`, attackRegistry);
          await playerRef.update(playerPatch);
          const attackInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
            method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: attackEmail }),
          });
          expectEqual(attackInvite.status, 200, `youth forged ${label} invitation create`);
          registerDynamicFirestoreRoot(`invites/${attackInvite.body.token}`, `youth-${label}-invite`, attackRegistry);
          const redemption = await apiJsonResult('/api/invites/youth', null, {
            method: 'PUT', body: JSON.stringify({ token: attackInvite.body.token, password }),
          });
          expectEqual(redemption.status, 200, `youth forged ${label} activation remains teamless`);
          const attackUser = await getAuthUserByEmailIfPresent(authAdmin, attackEmail);
          if (attackUser) {
            registerDynamicAuthIdentity(attackUser.uid, `youth-${label}-user`, attackRegistry);
            registerDynamicFirestoreRoot(`users/${attackUser.uid}`, `youth-${label}-user`, attackRegistry);
            registerDynamicFirestoreRoot(`teams/${forgedTeam.id}/members/${attackUser.uid}`, `youth-${label}-member`, attackRegistry);
          }
          const forgedMemberExists = attackUser
            ? (await firestoreAdmin.collection('teams').doc(forgedTeam.id).collection('members').doc(attackUser.uid).get()).exists
            : false;
          const attackCleanup = await attackRegistry.cleanup();
          completedDynamicCleanupRuns.push(attackCleanup);
          if (attackCleanup.state !== 'OBSERVED') throw new Error(`Youth ${label} cleanup retained owned resources.`);
          expectEqual(forgedMemberExists, false, `youth forged ${label} cannot mint membership`);
        };
        await runTeamHintAttack('primary-team', { primaryTeamId: forgedTeam.id, joinedTeamIds: [] });
        await runTeamHintAttack('joined-teams', { primaryTeamId: null, joinedTeamIds: [forgedTeam.id] });

        const authorizedRosterRef = firestoreAdmin
          .collection('teams').doc(teamC.id).collection('members').doc(player.data.id);
        registerDynamicFirestoreRoot(authorizedRosterRef.path, 'youth-authorized-roster');
        registerDynamicFirestoreRoot(authorizedRosterRef.path, 'youth-authorized-roster', youthCleanupRegistry);
        const authorizedRoster = {
          id: player.data.id,
          playerId: player.data.id,
          parentId: identityByAlias.get('qa-parent-a').uid,
          name: 'Youth C',
          role: 'Member',
          position: 'Player',
          status: 'active',
          isDeleted: false,
          ownerUserId: teamC.ownerUserId,
        };

        const removedRegistry = createResourceRegistry({ maxAttempts: 3 });
        registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-removed-player', removedRegistry);
        registerDynamicFirestoreRoot(authorizedRosterRef.path, 'youth-removed-roster', removedRegistry);
        await playerRef.update({ primaryTeamId: teamC.id, joinedTeamIds: [teamC.id] });
        await authorizedRosterRef.set({ ...authorizedRoster, status: 'removed' });
        const removedEmail = `${FIXTURES.runId}-youth-removed@phase2.test`;
        const removedInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: removedEmail }),
        });
        registerDynamicFirestoreRoot(`invites/${removedInvite.body.token}`, 'youth-removed-invite', removedRegistry);
        expectEqual(removedInvite.status, 200, 'youth removed child invitation remains teamless');
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: removedInvite.body.token, password }),
        })).status, 200, 'youth removed child teamless activation');
        const removedUser = await getAuthUserByEmailIfPresent(authAdmin, removedEmail);
        if (removedUser) {
          registerDynamicAuthIdentity(removedUser.uid, 'youth-removed-user', removedRegistry);
          registerDynamicFirestoreRoot(`users/${removedUser.uid}`, 'youth-removed-user', removedRegistry);
          registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${removedUser.uid}`, 'youth-removed-member-projection', removedRegistry);
        }
        const removedProjectionExists = removedUser
          ? (await firestoreAdmin.collection('teams').doc(teamC.id).collection('members').doc(removedUser.uid).get()).exists
          : false;
        const removedCleanup = await removedRegistry.cleanup();
        completedDynamicCleanupRuns.push(removedCleanup);
        if (removedCleanup.state !== 'OBSERVED') throw new Error('Youth removed-child cleanup retained owned resources.');
        expectEqual(removedProjectionExists, false, 'youth removed child cannot mint membership');

        await playerRef.set(originalPlayer);
        await authorizedRosterRef.set(authorizedRoster);
        const changedEmail = `${FIXTURES.runId}-youth-team-changed@phase2.test`;
        const changedInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: changedEmail }),
        });
        expectEqual(changedInvite.status, 200, 'youth post-invite team change setup');
        registerDynamicFirestoreRoot(`invites/${changedInvite.body.token}`, 'youth-team-changed-invite', youthCleanupRegistry);
        await authorizedRosterRef.update({ status: 'removed' });
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: changedInvite.body.token, password }),
        })).status, 409, 'youth post-invite team change denial');
        expectEqual(await getAuthUserByEmailIfPresent(authAdmin, changedEmail), null, 'youth stale invite Auth rollback');
        await authorizedRosterRef.set(authorizedRoster);

        const expired = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
        });
        expectEqual(expired.status, 200, 'youth fresh expiring invitation create');
        createdInviteTokens.add(registerSensitiveValue(expired.body.token));
        registerDynamicFirestoreRoot(`invites/${expired.body.token}`, 'youth-api-expired-invite');
        registerDynamicFirestoreRoot(`invites/${expired.body.token}`, 'youth-api-expired-invite', youthCleanupRegistry);
        await firestoreAdmin.collection('invites').doc(expired.body.token).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
        expectEqual((await fetch(`${BASE_URL}/api/invites/youth?token=${expired.body.token}`)).status, 404, 'youth expired token denial');

        const activeInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
        });
        expectEqual(activeInvite.status, 200, 'youth fresh invitation create');
        createdInviteTokens.add(registerSensitiveValue(activeInvite.body.token));
        registerDynamicFirestoreRoot(`invites/${activeInvite.body.token}`, 'youth-api-active-invite');
        registerDynamicFirestoreRoot(`invites/${activeInvite.body.token}`, 'youth-api-active-invite', youthCleanupRegistry);
        const lookup = await apiJsonResult(`/api/invites/youth?token=${activeInvite.body.token}`, null);
        expectEqual(lookup.status, 200, 'youth invitation lookup');
        expectEqual(
          Object.keys(lookup.body.invite).sort().join(','),
          'childFirstName,childLastName',
          'youth invite PII allowlist',
        );

        conflictingIdentity = await createDisposableIdentity('youth-wrong-account');
        const wrongAccountRegistry = createResourceRegistry({ maxAttempts: 3 });
        registerDynamicAuthIdentity(conflictingIdentity.localId, 'youth-api-wrong-account', dynamicResourceRegistry);
        registerDynamicAuthIdentity(conflictingIdentity.localId, 'youth-api-wrong-account', wrongAccountRegistry);
        await authAdmin.updateUser(conflictingIdentity.localId, { email: youthEmail });
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 409, 'youth wrong-existing-account denial');
        const wrongAccountCleanup = await wrongAccountRegistry.cleanup();
        completedDynamicCleanupRuns.push(wrongAccountCleanup);
        if (wrongAccountCleanup.state !== 'OBSERVED') throw new Error('Youth wrong-account cleanup retained owned resources.');
        conflictingIdentity = null;

        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 200, 'youth invitation redemption');
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 404, 'youth reused invitation denial');
        const youth = await signIn('qa-youth-invite');
        expectEqual(youth.status, 200, 'youth activated identity sign-in');
        createdYouthUid = youth.body.localId;
        registerDynamicAuthIdentity(createdYouthUid, 'youth-api');
        registerDynamicFirestoreRoot(`users/${createdYouthUid}`, 'youth-api');
        registerDynamicAuthIdentity(createdYouthUid, 'youth-api', youthCleanupRegistry);
        registerDynamicFirestoreRoot(`users/${createdYouthUid}`, 'youth-api', youthCleanupRegistry);
        expectEqual(await apiStatus('/api/auth/session', youth.body.idToken, { method: 'POST' }), 200, 'youth activated session');
        const linkedPlayer = (await playerRef.get()).data();
        expectEqual(linkedPlayer.userId, createdYouthUid, 'youth player login linkage');
        expectEqual(linkedPlayer.hasLogin, true, 'youth player login state');
        const youthProfile = await firestoreAdmin.collection('users').doc(createdYouthUid).get();
        expectEqual(youthProfile.data()?.linkedPlayerId, player.data.id, 'youth profile player linkage');
        registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${createdYouthUid}`, 'youth-api-team-member');
        registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${createdYouthUid}`, 'youth-api-team-member', youthCleanupRegistry);
        expectEqual(await apiStatus(`/api/teams/chat?teamId=${teamC.id}`, youth.body.idToken), 200, 'youth activated tenant authority');
        const relogin = await signIn('qa-youth-invite');
        expectEqual(relogin.status, 200, 'youth relogin profile persistence');
        expectEqual(await apiStatus(`/api/teams/chat?teamId=${teamC.id}`, relogin.body.idToken), 200, 'youth relogin tenant authority persistence');
      } catch (error) {
        primaryFailure = error;
        throw error;
      } finally {
        if (!createdYouthUid) {
          const user = await getAuthUserByEmailIfPresent(authAdmin, youthEmail);
          createdYouthUid = user?.uid || null;
          if (createdYouthUid) {
            registerDynamicAuthIdentity(createdYouthUid, 'youth-api-fallback');
            registerDynamicFirestoreRoot(`users/${createdYouthUid}`, 'youth-api-fallback');
            registerDynamicAuthIdentity(createdYouthUid, 'youth-api-fallback', youthCleanupRegistry);
            registerDynamicFirestoreRoot(`users/${createdYouthUid}`, 'youth-api-fallback', youthCleanupRegistry);
            const teamC = FIXTURES.teams.find(team => team.alias === 'qa-team-c');
            registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${createdYouthUid}`, 'youth-api-team-member-fallback');
            registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${createdYouthUid}`, 'youth-api-team-member-fallback', youthCleanupRegistry);
          }
        }
        const immediateCleanup = await youthCleanupRegistry.cleanup();
        completedDynamicCleanupRuns.push(immediateCleanup);
        if (immediateCleanup.state !== 'OBSERVED' && !primaryFailure) {
          throw new Error('Youth API cleanup retained owned resources.');
        }
      }
    });
    return;
  }

  if (scenarioId === 'signup-onboarding-missing-profile-onboarding') {
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const email = `${FIXTURES.runId}-missing-profile@phase2.test`;
      const account = await authAdmin.createUser({ email, password, emailVerified: true, displayName: 'Missing Profile' });
      registerDynamicAuthIdentity(account.uid, 'missing-profile-api');
      registerDynamicFirestoreRoot(`users/${account.uid}`, 'missing-profile-api');
      registerDynamicFirestoreRoot(`players/p_${account.uid}`, 'missing-profile-api-player');
      const userRef = firestoreAdmin.collection('users').doc(account.uid);
      try {
        const missing = await signInEmail(email);
        expectEqual(missing.status, 200, 'missing profile verified identity sign-in');
        expectEqual(await apiStatus('/api/auth/session', missing.body.idToken, { method: 'POST' }), 200, 'missing profile session establishment');
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'missing profile privileged API denial');
        const injectedProfile = await fetch(
          `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${account.uid}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${missing.body.idToken}`, Connection: 'close' },
            body: JSON.stringify({ fields: {
              id: { stringValue: account.uid }, fullName: { stringValue: 'Injected' }, email: { stringValue: email },
              role: { stringValue: 'superadmin' }, isStaff: { booleanValue: true },
            } }),
          },
        );
        expectEqual(injectedProfile.status, 403, 'onboarding privileged field injection denied');
        const sensitiveStatuses = await Promise.all([
          apiStatus('/api/admin/newsletter', missing.body.idToken),
          apiStatus(`/api/admin/users/${identityByAlias.get('qa-team-member').uid}/account-control`, missing.body.idToken, {
            method: 'POST', body: JSON.stringify({ action: 'suspend' }),
          }),
        ]);
        expectEqual(sensitiveStatuses.every(status => status === 403), true, 'onboarding sensitive route matrix denied');
        await userRef.set({ id: account.uid, email, fullName: 'Partial Profile' });
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'partial profile privileged API denial');
        await userRef.set({ role: 'adult_player', notificationsEnabled: false }, { merge: true });
        const persisted = await userRef.get();
        expectEqual(
          persisted.data()?.role === 'adult_player' &&
            !('planId' in (persisted.data() || {})) && !('plan_type' in (persisted.data() || {})),
          true,
          'onboarding persisted role-without-plan partial profile',
        );
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'completed nonadmin profile API denial');
      } finally {
        // The global registry owns exact deletion and postcondition proof.
      }
    });
    return;
  }

  if (scenarioId === 'demo-seed-use-exit-expiry-cleanup') {
    const contexts = [await createDisposableIdentity('demo-a', { anonymous: true }), await createDisposableIdentity('demo-b', { anonymous: true })];
    const seededGraphs = [];
    const remaining = new Set(contexts.map(identity => identity.idToken));
    try {
      for (const [index, identity] of contexts.entries()) {
        const seeded = await apiJsonResult('/api/demo/seed', identity.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) });
        expectEqual(seeded.status, 200, `demo context ${index + 1} seed`);
        seededGraphs.push({ uid: identity.localId, teamIds: [...(seeded.body?.teamIds || [])] });
        registerDynamicFirestoreRoot(`users/${identity.localId}`, `demo-context-${index + 1}-user`);
        for (const [teamIndex, teamId] of (seeded.body?.teamIds || []).entries()) {
          registerDynamicFirestoreRoot(`teams/${teamId}`, `demo-context-${index + 1}-team-${teamIndex + 1}`);
        }
        registerDynamicFirestoreRoot(`leagues/demo_league_${identity.localId.slice(-4)}`, `demo-context-${index + 1}-league`);
        expectEqual(await apiStatus('/api/demo/seed', identity.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) }), 200, `demo context ${index + 1} duplicate seed idempotency`);
        expectEqual(await apiStatus('/api/stripe/connect/status?userId=other&teamId=other', identity.idToken), 403, `demo context ${index + 1} billing denial`);
      }
      const registered = await signIn('qa-coach-owner-a');
      expectEqual(await apiStatus('/api/demo/seed', registered.body.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) }), 403, 'demo registered-account exclusion');
      expectEqual(await apiStatus('/api/demo/seed', contexts[0].idToken, { method: 'POST', body: JSON.stringify({ planId: 'invalid' }) }), 400, 'demo invalid plan denial');
      expectEqual(await apiStatus(`/api/teams/chat?teamId=${seededGraphs[0].teamIds[0]}`, contexts[1].idToken), 403, 'demo cross-ID denial');
      expectEqual(await apiStatus(`/api/teams/chat?teamId=${seededGraphs[1].teamIds[0]}`, contexts[0].idToken), 403, 'demo cross-context graph denial');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        for (const [index, graph] of seededGraphs.entries()) {
          const teams = await firestoreAdmin.collection('teams').where('demoSessionOwnerId', '==', graph.uid).get();
          const leagues = await firestoreAdmin.collection('leagues').where('creatorId', '==', graph.uid).get();
          const user = await firestoreAdmin.collection('users').doc(graph.uid).get();
          expectEqual(teams.size, graph.teamIds.length, `demo context ${index + 1} distinct team graph count`);
          expectEqual(leagues.size, 1, `demo context ${index + 1} distinct league graph count`);
          expectEqual(user.exists, true, `demo context ${index + 1} distinct user graph count`);
        }
      });
      for (const [index, identity] of contexts.entries()) {
        const cookie = await createSessionCookie(identity.idToken);
        const response = await fetch(`${BASE_URL}/api/demo/exit`, {
          method: 'POST', headers: { Origin: BASE_URL, Cookie: cookie }, redirect: 'manual',
        });
        expectEqual(response.status, 204, `demo context ${index + 1} exact exit cleanup`);
        expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401, `demo context ${index + 1} exited session denial`);
        if (index === 0) {
          const peerCookie = await createSessionCookie(contexts[1].idToken);
          expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: peerCookie } })).status, 200, 'demo peer-context exit isolation');
        }
        remaining.delete(identity.idToken);
      }
      await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
        for (const [index, graph] of seededGraphs.entries()) {
          const teams = await firestoreAdmin.collection('teams').where('demoSessionOwnerId', '==', graph.uid).get();
          const leagues = await firestoreAdmin.collection('leagues').where('creatorId', '==', graph.uid).get();
          const user = await firestoreAdmin.collection('users').doc(graph.uid).get();
          const authAbsent = await authAdmin.getUser(graph.uid).then(() => false, error => {
            if (error?.code === 'auth/user-not-found') return true;
            throw error;
          });
          expectEqual(teams.empty && leagues.empty && !user.exists && authAbsent, true, `demo context ${index + 1} graph exact reconciliation`);
        }
        const probeRef = firestoreAdmin.collection('task3CleanupProbes').doc(`demo-retry-${FIXTURES.runId}`);
        await probeRef.set({ owner: 'task3-demo-cleanup', pending: true });
        registerDynamicFirestoreRoot(probeRef.path, 'demo-retry-probe');
        let attempts = 0;
        const retryRegistry = createResourceRegistry({ maxAttempts: 2 });
        retryRegistry.register({
          id: 'firestore:demo-retry-probe', kind: 'deleted',
          async cleanup() {
            attempts += 1;
            if (attempts === 1) throw new Error('injected local cleanup failure');
            await firestoreAdmin.recursiveDelete(probeRef);
            return true;
          },
          async verify() { return !(await probeRef.get()).exists; },
        });
        const retried = await retryRegistry.cleanup();
        expectEqual(retried.diagnostics.length, 1, 'demo injected cleanup failure retained');
        expectEqual(retried.state, 'OBSERVED', 'demo cleanup retry recovery');
        expectEqual((await probeRef.get()).exists, false, 'demo pending cleanup recovery');
      });
      expectEqual(isExpiredDemoCreation(1_000, 1_000 + 15 * 60 * 1000), false, 'demo expiry boundary before threshold');
      expectEqual(isExpiredDemoCreation(1_000, 1_001 + 15 * 60 * 1000), true, 'demo expiry boundary');
      expectEqual((await fetch(`${BASE_URL}/api/demo/exit`, {
        method: 'POST', headers: { Origin: 'http://127.0.0.1:65535' }, redirect: 'manual',
      })).status, 403, 'demo cross-origin exit denial');
    } finally {
      // Every disposable identity and seeded graph is registered at creation for global retry cleanup.
    }
    return;
  }

  if (scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    for (const alias of FIXTURES.activeAliases) {
      const result = await signIn(alias);
      expectEqual(result.status, 200, `${alias} dashboard policy sign-in`);
      expectEqual(await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }), 200, `${alias} dashboard policy session`);
    }
    return;
  }

  if (scenarioId === 'administration-access-and-user-directory') {
    const trusted = await signIn('qa-superadmin');
    expectEqual(await apiStatus('/api/admin/newsletter', trusted.body.idToken), 200, 'admin trusted directory access');
    for (const alias of FIXTURES.activeAliases.filter(alias => alias !== 'qa-superadmin')) {
      const result = await signIn(alias);
      expectEqual(await apiStatus('/api/admin/newsletter', result.body.idToken), 403, `admin non-SA denial ${alias}`);
    }
    for (const alias of FIXTURES.activeAliases.filter(alias => alias !== 'qa-superadmin')) {
      const identity = await signIn(alias);
      const directAdminRead = await fetch(
        `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/adminAuditLogs?pageSize=1`,
        { headers: { Authorization: `Bearer ${identity.body.idToken}`, Connection: 'close' } },
      );
      expectEqual(directAdminRead.status, 403, `admin rules direct read denial ${alias}`);
    }
    expectEqual(await apiStatus('/api/admin/users/not%2Fvalid/account-control', trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 400, 'admin malformed target denial');
    await withEmulatorAuthAdmin(async authAdmin => {
      const superadmin = identityByAlias.get('qa-superadmin');
      const user = await authAdmin.getUser(superadmin.uid);
      const originalClaims = { ...(user.customClaims || {}) };
      registerClaimRestoration(superadmin.uid, originalClaims, 'administration-scenario');
      try {
        await authAdmin.setCustomUserClaims(superadmin.uid, withRoleClaim(originalClaims, 'coach'));
        await waitForIdTokenRevocationBoundary(trusted.body.idToken);
        await authAdmin.revokeRefreshTokens(superadmin.uid);
        expectEqual(await apiStatus('/api/admin/newsletter', trusted.body.idToken), 401, 'admin revoked already-issued token denial');
        const revoked = await signIn('qa-superadmin');
        expectEqual(revoked.status, 200, 'admin revoked-claim identity can refresh');
        expectEqual(await apiStatus('/api/admin/newsletter', revoked.body.idToken), 403, 'admin refreshed token denied after claim revoke');
      } finally {
        await authAdmin.setCustomUserClaims(superadmin.uid, originalClaims);
        await authAdmin.revokeRefreshTokens(superadmin.uid);
      }
      const restored = await signIn('qa-superadmin');
      expectEqual(restored.status, 200, 'admin restored-claim identity refresh');
      expectEqual(await apiStatus('/api/admin/newsletter', restored.body.idToken), 200, 'admin restored claim access');
    });
  }
}

function expectEqual(actual, expected, label) {
  const assertion = { label, expected: String(expected), observed: String(actual), capturedAt: new Date().toISOString() };
  if (activeCertificationScenario) activeCertificationAssertions.push(assertion);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  console.log(`PASS ${label}: ${actual}`);
}

function cli(session, args, { sensitive = false } = {}) {
  shutdownState.throwIfRequested();
  const output = run(playwrightCli, [`-s=${session}`, '--raw', ...args], sensitive ? { stdio: 'pipe' } : {});
  shutdownState.throwIfRequested();
  return output;
}

function browserSessionName(label) {
  const session = `${BROWSER_SESSION_PREFIX}-${label}`;
  ownedBrowserSessions.add(session);
  syncBrowserSessionRegistry();
  return session;
}

function syncBrowserSessionRegistry() {
  if (!browserSessionRegistry) return;
  mkdirSync(path.dirname(browserSessionRegistry), { recursive: true });
  writeFileSync(
    browserSessionRegistry,
    ownedBrowserSessions.size > 0 ? `${[...ownedBrowserSessions].join('\n')}\n` : '',
    { mode: 0o600 },
  );
}

export async function closeOwnedBrowserSessions(sessions, closeSession, maxAttempts = 2) {
  let pending = [...sessions].reverse();
  const failures = new Map();
  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    const retry = [];
    for (const session of pending) {
      try {
        await closeSession(session);
        sessions.delete(session);
        failures.delete(session);
      } catch (error) {
        failures.set(session, error);
        retry.push(session);
      }
    }
    pending = retry;
  }
  if (sessions.size > 0) {
    throw new Error(`Failed to close ${sessions.size} owned browser session(s) after ${maxAttempts} attempts.`);
  }
}

export async function closeBrowserSessionsCreatedAfter(sessions, baseline, closeSession, maxAttempts = 2) {
  const created = new Set([...sessions].filter(session => !baseline.has(session)));
  const createdNames = [...created];
  try {
    await closeOwnedBrowserSessions(created, closeSession, maxAttempts);
  } finally {
    for (const session of createdNames) {
      if (!created.has(session)) sessions.delete(session);
    }
  }
}

export async function closeOneOwnedBrowserSession(sessions, session, closeSession, maxAttempts = 2) {
  if (!sessions.has(session)) throw new Error('Cannot close a browser session that is not owned by this audit.');
  const exact = new Set([session]);
  await closeOwnedBrowserSessions(exact, closeSession, maxAttempts);
  sessions.delete(session);
}

async function closeBrowserSessionNow(session) {
  await closeOneOwnedBrowserSession(ownedBrowserSessions, session, async exactSession => {
    run(playwrightCli, [`-s=${exactSession}`, '--raw', 'close'], { stdio: 'pipe' });
  });
  syncBrowserSessionRegistry();
}

async function browserLogin(alias, expectedPath, sessionLabel = alias) {
  return browserLoginCredentials(emailForAlias(alias), password, expectedPath, sessionLabel, alias);
}

async function browserLoginCredentials(email, suppliedPassword, expectedPath, sessionLabel, diagnosticLabel = 'disposable identity') {
  const session = browserSessionName(sessionLabel);
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.stack || error.message);
    const onResponse = response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.locator('#email').fill(${JSON.stringify(email)});
      await page.locator('#password').fill(${JSON.stringify(suppliedPassword)});
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 20000 });
      return {
        url: page.url(),
        loginFailed: await page.getByText('Login Failed', { exact: true }).count(),
        sessionFailed: await page.getByText('Session Setup Failed', { exact: true }).count(),
        consoleErrors,
        failedResponses: failedResponses.filter(item => item.url.startsWith(${JSON.stringify(BASE_URL)})),
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  const result = JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
  result.pathname = new URL(result.url).pathname;
  if (result.pathname !== expectedPath) {
    const consoleErrors = cli(session, ['console', 'error']);
    const requests = cli(session, ['requests']);
    throw new Error(
      `${diagnosticLabel} remained at ${result.pathname}; loginFailed=${result.loginFailed}, ` +
      `sessionFailed=${result.sessionFailed}.\n${consoleErrors}\n${requests}`,
    );
  }
  expectEqual(result.pathname, expectedPath, `${diagnosticLabel} login destination`);
  expectEqual(result.consoleErrors.length, 0, `${diagnosticLabel} login workflow console errors`);
  expectEqual(result.failedResponses.length, 0, `${diagnosticLabel} login workflow unexpected responses`);
  return session;
}

function browserPath(session, pathname) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
    return { url: page.url() };
  }`;
  return new URL(JSON.parse(cli(session, ['run-code', code])).url).pathname;
}

function browserRouteAudit(session, pathname, { mobile = false } = {}) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => { if (response.status() >= 500) failedResponses.push(response.url()); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
      await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
      await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserLoginFailureAudit(alias, suppliedPassword, expectedPath, expectedTitle, sessionLabel) {
  const session = browserSessionName(`${sessionLabel}-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.stack || error.message);
    const onResponse = response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.getByLabel('Email Address').fill(${JSON.stringify(identityByAlias.has(alias) ? emailForAlias(alias) : alias)});
      await page.locator('#password').fill(${JSON.stringify(suppliedPassword)});
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.getByText(${JSON.stringify(expectedTitle)}, { exact: true })
        .waitFor({ state: 'visible', timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        expectedTitle: await page.getByText(${JSON.stringify(expectedTitle)}, { exact: true }).count(),
        body: (await page.locator('body').innerText()).slice(0, 500),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  const result = JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
  expectEqual(result.pathname, expectedPath, `${sessionLabel} path`);
  if (result.expectedTitle !== 1) {
    console.log(`${sessionLabel} body diagnostic: ${JSON.stringify(result.body)}`);
    console.log(`${sessionLabel} console diagnostic: ${JSON.stringify(result.consoleErrors)}`);
    console.log(`${sessionLabel} request diagnostic: ${JSON.stringify(result.failedResponses)}`);
  }
  expectEqual(result.expectedTitle, 1, `${sessionLabel} message`);
}

function browserLoginTimeoutAndFormStateAudit() {
  const session = openAnonymousBrowser('cert-login-timeout-form-states');
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const signInPattern = '**/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword**';
    let lateClientAbortCount = 0;
    const routeHandlerErrors = [];
    let resolveRouteHandlerComplete;
    const routeHandlerComplete = new Promise(resolve => { resolveRouteHandlerComplete = resolve; });
    const delayPastClientTimeout = async route => {
      try {
        await page.waitForTimeout(16000);
        try {
          await route.continue();
        } catch (error) {
          if (String(error.message || error).includes('Route is already handled')) lateClientAbortCount += 1;
          else routeHandlerErrors.push(String(error.message || error));
        }
      } catch (error) {
        routeHandlerErrors.push(String(error.message || error));
      } finally {
        resolveRouteHandlerComplete();
      }
    };
    await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
    const viewportFits = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    }
    const form = page.locator('form').first();
    const emptyInvalid = await form.evaluate(element => !element.checkValidity());
    await page.getByLabel('Email Address').fill('not-an-email');
    await page.locator('#password').fill('temporary');
    const invalidEmail = await page.getByLabel('Email Address').evaluate(element => !element.checkValidity());
    const visibility = page.getByRole('button', { name: 'Show password' });
    await visibility.click();
    const passwordVisible = await page.locator('#password').getAttribute('type');
    await page.route(signInPattern, delayPastClientTimeout);
    await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-coach-owner-a'))});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.locator('#password').press('Enter');
    await page.getByText('Login Failed', { exact: true }).waitFor({ state: 'visible', timeout: 18000 });
    const recoveredButton = await page.getByRole('button', { name: 'Sign In' }).isEnabled();
    await routeHandlerComplete;
    await page.unroute(signInPattern, delayPastClientTimeout);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 20000 });
    return {
      emptyInvalid, invalidEmail, passwordVisible, recoveredButton, viewportFits,
      lateClientAbortCount, routeHandlerErrors,
      pathname: await page.evaluate(() => window.location.pathname),
    };
  }`], { sensitive: true }));
  expectEqual(result.emptyInvalid, true, 'login empty form validation state');
  expectEqual(result.invalidEmail, true, 'login invalid email validation state');
  expectEqual(result.passwordVisible, 'text', 'login password visibility state');
  expectEqual(result.recoveredButton, true, 'login timeout visible recovery');
  expectEqual(result.lateClientAbortCount === 0 || result.lateClientAbortCount === 1, true, 'login timeout route lifecycle reconciled');
  expectEqual(result.routeHandlerErrors.join(' | '), '', 'login timeout route handler errors');
  expectEqual(result.pathname, '/dashboard', 'login timeout recovery keyboard destination');
  expectEqual(result.viewportFits.every(Boolean), true, 'login complete form states two viewports');
}

function browserProtectedReturnAudit() {
  const session = browserSessionName(`protected-return-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/facilities`, '--browser', 'chrome']);
  const code = `async page => {
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-coach-owner-a'))});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(() => window.location.pathname === '/facilities', null, { timeout: 15000 });
    return await page.evaluate(() => window.location.pathname);
  }`;
  return JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
}

function browserLogoutAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const observedPages = new Set();
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      const responseUrl = response.url();
      if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
        failedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
      }
    };
    const observe = target => {
      target.on('console', onConsole); target.on('pageerror', onPageError); target.on('response', onResponse); observedPages.add(target);
    };
    observe(page);
    const peer = await page.context().newPage();
    observe(peer);
    let direct;
    try {
    await peer.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await peer.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 15000 });
    const protectedContentBefore = (await peer.locator('body').innerText()).length > 100;
    const desktopFits = await peer.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    await page.goto(${JSON.stringify(`${BASE_URL}/settings`)});
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await peer.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
    await page.goBack();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.reload();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    direct = await page.context().newPage();
    observe(direct);
    await direct.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await direct.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.setViewportSize({ width: 390, height: 844 });
    return {
      primaryPath: await page.evaluate(() => window.location.pathname),
      peerPath: await peer.evaluate(() => window.location.pathname),
      directPath: await direct.evaluate(() => window.location.pathname),
      sessionStatus: sessionResponse.status(),
      protectedContentBefore,
      protectedContentAfter: (await peer.locator('body').innerText()).includes('Dashboard'),
      desktopFits,
      fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      consoleErrors,
      failedResponses: failedResponses.filter(item => item.status >= 500),
    };
    } finally {
      for (const target of observedPages) {
        target.off('console', onConsole); target.off('pageerror', onPageError); target.off('response', onResponse);
      }
      if (direct && !direct.isClosed()) await direct.close();
      if (!peer.isClosed()) await peer.close();
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function browserAdminOpenTabRevocationAudit(assertionPrefix = 'logout admin') {
  const session = await browserLogin('qa-superadmin', '/admin', `cert-${assertionPrefix.replaceAll(' ', '-')}-revoke-${process.pid}`);
  cli(session, ['run-code', `async page => {
    const peer = await page.context().newPage();
    await peer.goto(${JSON.stringify(`${BASE_URL}/admin`)});
    await peer.waitForFunction(() => window.location.pathname === '/admin', null, { timeout: 15000 });
    return true;
  }`]);
  const superadmin = identityByAlias.get('qa-superadmin');
  await withEmulatorAuthAdmin(async authAdmin => {
    const originalClaims = { ...((await authAdmin.getUser(superadmin.uid)).customClaims || {}) };
    registerClaimRestoration(superadmin.uid, originalClaims, `${assertionPrefix.replaceAll(' ', '-')}-open-tab`);
    try {
      await authAdmin.setCustomUserClaims(superadmin.uid, withRoleClaim(originalClaims, 'coach'));
      const revocationProbe = await signIn('qa-superadmin');
      expectEqual(revocationProbe.status, 200, `${assertionPrefix} revocation boundary probe`);
      await waitForIdTokenRevocationBoundary(revocationProbe.body.idToken);
      await authAdmin.revokeRefreshTokens(superadmin.uid);
      const result = JSON.parse(cli(session, ['run-code', `async page => {
        const pages = page.context().pages();
        const consoleErrors = [];
        const failedResponses = [];
        const onConsole = message => {
          if (message.type() !== 'error') return;
          const value = message.text();
          if (value.includes('Failed to load resource:')) return;
          consoleErrors.push(value);
        };
        const onPageError = error => consoleErrors.push(error.message);
        const onResponse = response => {
          const responseUrl = response.url();
          if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
            const pathname = responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0];
            if (!(response.status() === 401 && pathname === '/api/auth/session')) {
              failedResponses.push({ status: response.status(), pathname });
            }
          }
        };
        for (const target of pages) { target.on('console', onConsole); target.on('pageerror', onPageError); target.on('response', onResponse); }
        let fresh;
        try {
          await Promise.all(pages.map(target => target.reload()));
          await Promise.all(pages.map(target => target.waitForFunction(() => window.location.pathname !== '/admin', null, { timeout: 15000 })));
          fresh = await page.context().newPage();
          fresh.on('console', onConsole); fresh.on('pageerror', onPageError); fresh.on('response', onResponse);
          await fresh.goto(${JSON.stringify(`${BASE_URL}/admin`)});
          await fresh.waitForFunction(() => window.location.pathname !== '/admin', null, { timeout: 15000 });
          return {
            openPaths: await Promise.all(pages.map(target => target.evaluate(() => window.location.pathname))),
            freshPath: await fresh.evaluate(() => window.location.pathname), consoleErrors, failedResponses,
          };
        } finally {
          for (const target of pages) { target.off('console', onConsole); target.off('pageerror', onPageError); target.off('response', onResponse); }
          if (fresh) { fresh.off('console', onConsole); fresh.off('pageerror', onPageError); fresh.off('response', onResponse); await fresh.close(); }
        }
      }`]));
      expectEqual(result.openPaths.every(pathname => pathname === '/login'), true, `${assertionPrefix} revoked open tabs denied`);
      expectEqual(result.freshPath, '/login', `${assertionPrefix} revoked fresh tab denied`);
      expectEqual(result.consoleErrors.length, 0, `${assertionPrefix} revocation console errors`);
      expectEqual(result.failedResponses.length, 0, `${assertionPrefix} revocation unexpected responses`);
    } finally {
      await authAdmin.setCustomUserClaims(superadmin.uid, originalClaims);
      await authAdmin.revokeRefreshTokens(superadmin.uid);
    }
  });
  const restored = await browserLogin('qa-superadmin', '/admin', `cert-${assertionPrefix.replaceAll(' ', '-')}-restored-${process.pid}`);
  expectEqual(browserPath(restored, '/admin'), '/admin', `${assertionPrefix} restored browser continuity`);
}

async function runIdentityBrowserAudit() {
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `identity-owner-${process.pid}`);
  const assistant = await browserLogin('qa-team-assistant', '/dashboard', `identity-assistant-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `identity-member-${process.pid}`);
  const parent = await browserLogin('qa-parent-a', '/family', `identity-parent-${process.pid}`);
  const player = await browserLogin('qa-adult-player-a', '/dashboard', `identity-player-${process.pid}`);
  await browserLogin('qa-youth-active', '/dashboard', `identity-youth-${process.pid}`);
  await browserLogin('qa-multi-org', '/dashboard', `identity-multi-${process.pid}`);

  const ownerBilling = browserRouteAudit(owner, '/dashboard/billing');
  expectEqual(ownerBilling.pathname, '/dashboard/billing', 'owner billing browser route');
  expectEqual(ownerBilling.fits, true, 'owner billing desktop viewport');
  expectEqual(ownerBilling.consoleErrors.length, 0, 'owner billing console errors');
  expectEqual(ownerBilling.failedResponses.length, 0, 'owner billing failed responses');

  const assistantStaff = browserRouteAudit(assistant, '/facilities');
  expectEqual(assistantStaff.pathname, '/facilities', 'assistant staff route');
  expectEqual(assistantStaff.consoleErrors.length, 0, 'assistant staff route console errors');
  expectEqual(assistantStaff.failedResponses.length, 0, 'assistant staff route failed responses');

  const memberStaff = browserRouteAudit(member, '/facilities');
  expectEqual(memberStaff.pathname, '/dashboard', 'member staff route denial');

  const parentFinance = browserRouteAudit(parent, '/family/payments', { mobile: true });
  expectEqual(parentFinance.pathname, '/family/payments', 'parent finance browser route');
  expectEqual(parentFinance.fits, true, 'parent finance mobile viewport');
  expectEqual(parentFinance.consoleErrors.length, 0, 'parent finance console errors');
  expectEqual(parentFinance.failedResponses.length, 0, 'parent finance failed responses');

  const playerFinance = browserRouteAudit(player, '/family/payments');
  expectEqual(playerFinance.pathname, '/dashboard', 'player finance browser route denial');

  expectEqual(browserProtectedReturnAudit(), '/facilities', 'protected deep link resumes after login');

  const logout = browserLogoutAudit(owner);
  expectEqual(logout.primaryPath, '/login', 'logout revokes the browser session');
  expectEqual(logout.peerPath, '/login', 'second tab observes logout');
  expectEqual(logout.sessionStatus, 401, 'logged-out session endpoint denial');

  runIdentityStateBrowserAudit();
}

function runIdentityStateBrowserAudit() {
  browserLoginFailureAudit('qa-coach-owner-a', 'definitely-wrong-password', '/login', 'Login Failed', 'wrong-password login uses generic failure copy');
  browserLoginFailureAudit('qa-suspended', password, '/login', 'Login Failed', 'disabled login uses generic failure copy');
  browserLoginFailureAudit('qa-unverified', password, '/verify-email', 'Verify Your Email', 'unverified login reaches verification gate');
  browserLoginFailureAudit('qa-pending-delete', password, '/login', 'Session Setup Failed', 'deletion-pending login is denied');
}

function openAnonymousBrowser(label) {
  const session = browserSessionName(`${label}-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/`, '--browser', 'chrome']);
  return session;
}

function assertTwoViewportRoutes(session, cases, label) {
  assertSurfaceSweep(browserSurfaceSweep(session, cases), `${label} desktop`);
  assertSurfaceSweep(browserSurfaceSweep(session, cases, { mobile: true }), `${label} mobile`);
}

async function runAllActiveBrowserLandings(labelPrefix, { retainAliases = [] } = {}) {
  const sessions = new Map();
  const retained = new Set(retainAliases);
  for (const alias of FIXTURES.activeAliases) {
    const fixture = identityByAlias.get(alias);
    const session = await browserLogin(alias, fixture.expectedLanding, `${labelPrefix}-${alias}-${process.pid}`);
    if (retained.has(alias)) sessions.set(alias, session);
    else await closeBrowserSessionNow(session);
  }
  return sessions;
}

function browserLandingPersistenceAudit(session, expectedPath, label) {
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() < 400) return;
      const responseUrl = response.url();
      const localPath = responseUrl.startsWith(${JSON.stringify(BASE_URL)})
        ? responseUrl.slice(${JSON.stringify(BASE_URL)}.length).split('?')[0]
        : 'external-origin';
      failedResponses.push({ status: response.status(), path: localPath });
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      const peer = await page.context().newPage();
      await peer.goto(${JSON.stringify(`${BASE_URL}${expectedPath}`)});
      await peer.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.goBack();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      const output = {
        pathname: await page.evaluate(() => window.location.pathname),
        peerPathname: await peer.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
      await peer.close();
      return output;
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`]));
  expectEqual(result.pathname, expectedPath, `${label} refresh and Back destination`);
  expectEqual(result.peerPathname, expectedPath, `${label} new-tab destination`);
  expectEqual(result.fits, true, `${label} mobile containment`);
  if (result.consoleErrors.length > 0) console.log(`${label} persistence console diagnostic: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`${label} persistence failed response diagnostic: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(result.consoleErrors.length, 0, `${label} persistence console errors`);
  expectEqual(result.failedResponses.length, 0, `${label} persistence failed responses`);
}

function browserLoginDoubleSubmitAudit() {
  const session = openAnonymousBrowser('cert-login-delayed-double-submit');
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    let sessionRequests = 0;
    const routePattern = '**/api/auth/session';
    const delayed = async route => {
      sessionRequests += 1;
      await page.waitForTimeout(750);
      await route.continue();
    };
    await page.route(routePattern, delayed);
    try {
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-coach-owner-a'))});
      await page.locator('#password').fill(${JSON.stringify(password)});
      const submit = page.getByRole('button', { name: 'Sign In' });
      const bounds = await submit.boundingBox();
      if (!bounds) throw new Error('Sign-in button has no clickable bounds.');
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });
      await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 20000 });
      return { pathname: await page.evaluate(() => window.location.pathname), sessionRequests };
    } finally {
      await page.unroute(routePattern, delayed);
    }
  }`], { sensitive: true }));
  expectEqual(result.pathname, '/dashboard', 'login delayed response eventual destination');
  expectEqual(result.sessionRequests, 1, 'login double-submit single session request');
}

function browserResetRequestAudit(email, expectedText, label, { mobile = false, expectedFailureStatus = null, doubleSubmit = false } = {}) {
  const session = openAnonymousBrowser(`cert-reset-${label}`);
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    let resetRequests = 0;
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      const responseUrl = response.url();
      if (response.status() >= 400) failedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
    };
    const onRequest = request => {
      if (request.url().startsWith(${JSON.stringify(`${BASE_URL}/api/email/reset-password`) })) resetRequests += 1;
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    page.on('request', onRequest);
    try {
      const viewportFits = [];
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      }
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.getByRole('button', { name: 'Forgot?' }).click();
      await page.getByLabel('Account Email').fill(${JSON.stringify(email)});
      const submit = page.getByRole('button', { name: 'Send Reset Link' });
      ${doubleSubmit ? `const bounds = await submit.boundingBox();
      if (!bounds) throw new Error('Reset submit button has no clickable bounds.');
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });` : 'await submit.click();'}
      await page.getByText(${JSON.stringify(expectedText)}, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
        resetRequests,
        viewportFits,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
      page.off('request', onRequest);
    }
  }`], { sensitive: true }));
  expectEqual(result.pathname, '/login', `${label} reset request path`);
  expectEqual(result.fits, true, `${label} reset request viewport`);
  const expectedFailures = expectedFailureStatus === null ? [] : [{ status: expectedFailureStatus, pathname: '/api/email/reset-password' }];
  expectEqual(JSON.stringify(result.failedResponses), JSON.stringify(expectedFailures), `${label} reset request expected failure response`);
  const expectedResourceConsoleErrors = expectedFailureStatus === null ? 0 : 1;
  expectEqual(result.consoleErrors.length, expectedResourceConsoleErrors, `${label} reset request allowlisted console errors`);
  if (doubleSubmit) expectEqual(result.resetRequests, 1, 'reset double-submit single request');
  expectEqual(result.viewportFits.every(Boolean), true, `${label} reset request two viewport states`);
}

async function browserResetActionAudit() {
  const targetEmail = emailForAlias('qa-coach-owner-b');
  expectEqual(await publicJsonStatus('/api/email/reset-password', { email: targetEmail }), 200, 'reset browser action OOB generation');
  const action = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail);
  registerSensitiveValue(action.oobCode);
  const actionUrl = new URL(action.oobLink);
  if (actionUrl.origin !== 'http://127.0.0.1:9099') throw new Error('Reset action link escaped the loopback Auth emulator.');
  actionUrl.searchParams.delete('continueUrl');
  const missingPasswordUrl = actionUrl.toString();
  const replacementPassword = `browser-reset-${FIXTURES.runId}`;
  actionUrl.searchParams.set('newPassword', replacementPassword);
  const completionUrl = actionUrl.toString();
  const session = openAnonymousBrowser('cert-reset-action');
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const responseStatuses = [];
    const onConsole = message => {
      if (message.type() !== 'error') return;
      const value = message.text();
      if (value.includes('Failed to load resource:')) return;
      consoleErrors.push(value);
    };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.url().startsWith('http://127.0.0.1:9099/emulator/action')) responseStatuses.push(response.status());
    };
    page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
    try {
      const fits = [];
      await page.setViewportSize({ width: 1440, height: 900 });
      const missing = await page.goto(${JSON.stringify(missingPasswordUrl)}, { waitUntil: 'domcontentloaded' });
      const missingVisible = (await page.locator('body').innerText()).includes('missing newPassword');
      fits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await page.setViewportSize({ width: 390, height: 844 });
      const completed = await page.goto(${JSON.stringify(completionUrl)}, { waitUntil: 'domcontentloaded' });
      const completionVisible = (await page.locator('body').innerText()).includes('password has been successfully updated');
      fits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const reused = await page.reload({ waitUntil: 'domcontentloaded' });
      const reusedVisible = (await page.locator('body').innerText()).includes('expired or the link has already been used');
      return {
        missingStatus: missing.status(), completedStatus: completed.status(), reusedStatus: reused.status(),
        missingVisible, completionVisible, reusedVisible, fits, consoleErrors, responseStatuses,
      };
    } finally {
      page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
    }
  }`], { sensitive: true }));
  expectEqual(result.missingStatus, 400, 'reset action missing-password visible error status');
  expectEqual(result.missingVisible, true, 'reset action missing-password visible error');
  expectEqual(result.completedStatus, 200, 'reset action visible completion status');
  expectEqual(result.completionVisible, true, 'reset action visible completion');
  expectEqual(result.reusedStatus, 400, 'reset action consumed reload status');
  expectEqual(result.reusedVisible, true, 'reset action completion reload state');
  expectEqual(result.fits.every(Boolean), true, 'reset request and action states two viewports');
  expectEqual(result.consoleErrors.length, 0, 'reset action console errors');
  expectEqual(JSON.stringify(result.responseStatuses), JSON.stringify([400, 200, 400]), 'reset action unexpected responses');
  expectEqual((await signIn('qa-coach-owner-b', replacementPassword)).status, 200, 'reset browser action new password acceptance');
  expectEqual((await signIn('qa-coach-owner-a', replacementPassword)).status, 400, 'reset wrong-account reset attempt denied');
  expectEqual((await signIn('qa-coach-owner-a')).status, 200, 'reset wrong-account password unchanged after action');
  expectEqual(await publicJsonStatus('/api/email/reset-password', { email: targetEmail }), 200, 'reset browser action restoration OOB generation');
  const restore = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail, new Set([action.oobCode]));
  registerSensitiveValue(restore.oobCode);
  expectEqual((await redeemPasswordReset(restore.oobCode, password)).status, 200, 'reset browser action exact password restoration');
}

function browserSignupFailureAudit(mode) {
  const session = openAnonymousBrowser(`cert-signup-${mode}`);
  const email = `${FIXTURES.runId}-signup-${mode}@phase2.test`;
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const apiPattern = '**/api/email/verify-email';
    const firebasePattern = '**/identitytoolkit.googleapis.com/v1/accounts:sendOobCode**';
    const apiFailure = async route => ${mode === 'aborted' ? "route.abort('failed')" : "route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'local injected provider failure' }) })"};
    const firebaseFailure = async route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { message: 'LOCAL_INJECTED_DELIVERY_FAILURE' } }) });
    await page.route(apiPattern, apiFailure);
    await page.route(firebasePattern, firebaseFailure);
    try {
      await page.goto(${JSON.stringify(`${BASE_URL}/signup`)});
      await page.getByRole('radio', { name: /^Adult Athlete/ }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      await page.getByRole('button', { name: 'Continue' }).click();
      const form = page.locator('form');
      const emptyInvalid = await form.evaluate(element => !element.checkValidity());
      await page.locator('#signup-name').fill('Failure Recovery');
      await page.locator('#signup-email').fill(${JSON.stringify(email)});
      await page.locator('#signup-password').fill(${JSON.stringify(password)});
      await page.locator('#signup-password-confirmation').fill(${JSON.stringify(password)});
      await page.getByRole('button', { name: /^Create Account$/ }).click();
      await page.getByText('Signup Error', { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname), emptyInvalid,
        buttonEnabled: await page.getByRole('button', { name: /^Create Account$/ }).isEnabled(),
      };
    } finally {
      await page.unroute(apiPattern, apiFailure);
      await page.unroute(firebasePattern, firebaseFailure);
    }
  }`], { sensitive: true }));
  expectEqual(result.emptyInvalid, true, 'signup invalid input UI denial');
  const modeLabel = mode.replace('-', ' ');
  expectEqual(result.pathname, '/signup', `signup ${modeLabel} delivery UI path`);
  expectEqual(result.buttonEnabled, true, `signup ${modeLabel} delivery UI recovery`);
  return email;
}

async function runCertificationBrowserScenario(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') {
    const session = openAnonymousBrowser('cert-marketing');
    assertTwoViewportRoutes(session, ['/', '/privacy', '/terms', '/safety', '/beta', '/refer-a-coach'].map(pathname => ({ path: pathname, expected: pathname })), 'marketing public surfaces');
    const suffix = FIXTURES.runId.slice(-20);
    const coachEmail = `browser-coach-${suffix}@phase2.test`;
    const contactEmail = `browser-contact-${suffix}@phase2.test`;
    const betaEmail = `browser-beta-${suffix}@phase2.test`;
    const cleanupIdentity = await signIn('qa-superadmin');
    expectEqual(cleanupIdentity.status, 200, 'marketing browser cleanup authorization');
    const form = JSON.parse(cli(session, ['run-code', `async page => {
      const consoleErrors = [];
      const unexpectedResponses = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        const responseUrl = response.url();
        if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
          unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
        }
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);
      try {
        const viewportFits = [];
        await page.goto(${JSON.stringify(`${BASE_URL}/`)});
        const contactSubmit = page.getByRole('button', { name: 'Send Inquiry' });
        const contactInitiallyDisabled = await contactSubmit.isDisabled();
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          await page.locator('#contact-name').scrollIntoViewIfNeeded();
          viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        }
        await page.locator('#contact-name').fill('Browser Contact');
        await page.locator('#contact-email').fill(${JSON.stringify(contactEmail)});
        await page.locator('#contact-organization').fill('Task 3');
        await page.locator('#contact-inquiry').fill('Local browser certification inquiry');
        await contactSubmit.click();
        await page.getByText('Message Received', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
        const contactSuccess = await page.getByText('Message Received', { exact: true }).count();

        await page.goto(${JSON.stringify(`${BASE_URL}/beta`)});
        const betaForm = page.locator('#application-form form:visible').last();
        const betaInitiallyInvalid = await betaForm.evaluate(element => !element.checkValidity());
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        }
        const values = {
          fullName: 'Browser Beta', email: ${JSON.stringify(betaEmail)}, org: 'Task 3', sports: 'Soccer',
          scale: 'One team', current_tools: 'Local tools', frustrations: 'Synthetic test',
          must_have: 'Safe behavior', why_beta: 'Certification', address_street: '1 Test Way',
          address_city: 'Edmonton', address_state: 'AB', address_zip: 'T0T0T0',
        };
        for (const [id, value] of Object.entries(values)) await betaForm.locator('#' + id).fill(value);
        await betaForm.locator('#role').selectOption('coach');
        await betaForm.locator('#frequency').selectOption('weekly');
        await betaForm.locator('input[name="tested_before"][value="no"]').check();
        await betaForm.locator('input[name="devices"]').first().check();
        await betaForm.locator('input[type="checkbox"][required]').check();
        await betaForm.getByRole('button', { name: /Submit Application/ }).click();
        await page.getByText('Application Received', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
        const betaSuccess = await page.getByText('Application Received', { exact: true }).count();

        await page.goto(${JSON.stringify(`${BASE_URL}/refer-a-coach`)});
        await page.setViewportSize({ width: 390, height: 844 });
        const submit = page.getByRole('button', { name: 'Send to coach' });
        const initiallyDisabled = await submit.isDisabled();
        await page.getByLabel('Your name').fill('Browser Parent');
        await page.getByLabel("Coach’s name").fill('Browser Coach');
        await page.getByLabel("Coach’s email").fill(${JSON.stringify(coachEmail)});
        await submit.click();
        await page.getByText('Referral sent', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
        return {
          initiallyDisabled, contactInitiallyDisabled, betaInitiallyInvalid, contactSuccess, betaSuccess,
          referralSuccess: await page.getByText('Referral sent', { exact: true }).count(),
          viewportFits,
          fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          consoleErrors,
          unexpectedResponses,
        };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
      }
    }`], { sensitive: true }));
    expectEqual(form.initiallyDisabled, true, 'marketing visible empty-form validation');
    expectEqual(form.contactInitiallyDisabled, true, 'marketing visible contact validation');
    expectEqual(form.betaInitiallyInvalid, true, 'marketing visible beta validation');
    expectEqual(form.contactSuccess, 1, 'marketing visible contact success');
    expectEqual(form.betaSuccess, 1, 'marketing visible beta success');
    expectEqual(form.referralSuccess, 1, 'marketing visible referral success');
    expectEqual(form.viewportFits.every(Boolean), true, 'marketing full form states two viewports');
    expectEqual(form.fits, true, 'marketing submitted form mobile containment');
    expectEqual(form.consoleErrors.length, 0, 'marketing submitted forms console errors');
    expectEqual(form.unexpectedResponses.length, 0, 'marketing submitted forms unexpected responses');
    expectEqual(
      await deleteFirestoreMatches('parent_coach_referrals', 'coachEmail', coachEmail, 'owner') +
        await deleteFirestoreMatches('contact_inquiries', 'email', contactEmail, cleanupIdentity.body.idToken) +
        await deleteFirestoreMatches('beta_applications', 'email', betaEmail, cleanupIdentity.body.idToken),
      3,
      'marketing browser submissions exact cleanup',
    );
    return;
  }
  if (scenarioId === 'authentication-email-password-login') {
    const sessions = await runAllActiveBrowserLandings('cert-login', { retainAliases: ['qa-coach-owner-a'] });
    browserLandingPersistenceAudit(sessions.get('qa-coach-owner-a'), '/dashboard', 'login owner session');
    expectEqual(browserProtectedReturnAudit(), '/facilities', 'login protected deep-link return');
    browserLoginDoubleSubmitAudit();
    runIdentityStateBrowserAudit();
    browserLoginFailureAudit(
      `unknown-${FIXTURES.runId}@phase2.test`,
      password,
      '/login',
      'Login Failed',
      'unknown-user visible generic failure parity',
    );
    browserLoginTimeoutAndFormStateAudit();
    const session = openAnonymousBrowser('cert-login-responsive');
    assertTwoViewportRoutes(session, [{ path: '/login', expected: '/login' }], 'login surface');
    return;
  }
  if (scenarioId === 'authentication-logout-revocation-multi-tab') {
    const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `cert-logout-${process.pid}`);
    const logout = browserLogoutAudit(owner);
    expectEqual(logout.primaryPath, '/login', 'cert logout primary denial');
    expectEqual(logout.peerPath, '/login', 'cert logout peer denial');
    expectEqual(logout.directPath, '/login', 'cert logout Back reload direct denial');
    expectEqual(logout.sessionStatus, 401, 'cert logout session denial');
    expectEqual(logout.protectedContentBefore, true, 'cert logout protected listener content present before revocation');
    expectEqual(logout.protectedContentAfter, false, 'cert logout protected cache content cleared after revocation');
    expectEqual(logout.desktopFits, true, 'cert logout desktop containment');
    expectEqual(logout.fits, true, 'cert logout mobile containment');
    expectEqual(logout.consoleErrors.length, 0, 'cert logout workflow console errors');
    expectEqual(logout.failedResponses.length, 0, 'cert logout workflow unexpected responses');
    expectEqual(browserPath(owner, '/dashboard'), '/login', 'cert logout direct route denial');
    await browserAdminOpenTabRevocationAudit();
    return;
  }
  if (scenarioId === 'authentication-password-reset') {
    browserResetRequestAudit(`unknown-${FIXTURES.runId}@phase2.test`, 'A reset link was sent', 'unknown', { mobile: true });
    browserResetRequestAudit(emailForAlias('qa-coach-owner-b'), 'A reset link was sent', 'known-provider-block', { doubleSubmit: true });
    await browserResetActionAudit();
    return;
  }
  if (scenarioId === 'account-lifecycle-disable-delete-cancel-purge') {
    const trusted = await browserLogin('qa-superadmin', '/admin', `cert-lifecycle-admin-${process.pid}`);
    const owner = await browserLogin('qa-owner-delete-blocked', '/dashboard', `cert-lifecycle-owner-${process.pid}`);
    assertTwoViewportRoutes(trusted, [{ path: '/admin', expected: '/admin' }], 'lifecycle admin surface');
    assertTwoViewportRoutes(owner, [{ path: '/settings', expected: '/settings' }], 'lifecycle settings surface');
    const adminObserved = browserRouteAudit(trusted, '/admin');
    const settingsObserved = browserRouteAudit(owner, '/settings', { mobile: true });
    expectEqual(adminObserved.consoleErrors.length + settingsObserved.consoleErrors.length, 0, 'lifecycle browser workflow console errors');
    expectEqual(adminObserved.failedResponses.length + settingsObserved.failedResponses.length, 0, 'lifecycle browser workflow unexpected responses');
    return;
  }
  if (scenarioId === 'signup-onboarding-coach-admin-league-parent-adult-player-signup') {
    const surface = openAnonymousBrowser('cert-signup-surface');
    assertTwoViewportRoutes(surface, [{ path: '/signup', expected: '/signup' }], 'five-role signup surface');
    const roles = [
      { id: 'self', name: 'Adult Athlete', expectedRole: 'adult_player', destination: '/teams/join' },
      { id: 'child', name: 'Parent / Guardian', expectedRole: 'parent', destination: '/family' },
      { id: 'coach', name: 'Coach / Team Manager', expectedRole: 'coach', destination: '/teams/new', plan: 'Starter' },
      { id: 'school_ad', name: 'School / Athletic Director', expectedRole: 'admin', destination: '/pricing' },
      { id: 'league_creator', name: 'League / Tournament Organizer', expectedRole: 'league_creator', destination: '/competition', plan: 'Starter' },
    ];
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      for (const [index, role] of roles.entries()) {
        const email = `${FIXTURES.runId}-ui-${role.id}@phase2.test`;
        let createdUser = null;
        const session = openAnonymousBrowser(`cert-signup-${role.id}`);
        try {
          const signup = JSON.parse(cli(session, ['run-code', `async page => {
            const consoleErrors = [];
            const unexpectedResponses = [];
            const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
            const onPageError = error => consoleErrors.push(error.message);
            const onResponse = response => {
              const responseUrl = response.url();
              if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
                unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
              }
            };
            page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
            try {
            await page.goto(${JSON.stringify(`${BASE_URL}/signup`)});
            const viewportFits = [];
            for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
              await page.setViewportSize(viewport);
              viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            }
            await page.getByRole('radio', { name: new RegExp(${JSON.stringify(`^${role.name}`)}) }).click();
            await page.getByRole('button', { name: 'Continue' }).click();
            ${role.id === 'self' || role.id === 'child'
              ? "await page.getByRole('button', { name: 'Continue' }).click();"
              : role.plan
                ? `await page.getByText(${JSON.stringify(role.plan)}, { exact: true }).click(); await page.getByRole('button', { name: 'Continue' }).click();`
                : "await page.getByRole('button', { name: 'Continue' }).click();"}
            await page.locator('#signup-name').fill(${JSON.stringify(`Certification ${role.name}`)});
            await page.locator('#signup-email').fill(${JSON.stringify(email)});
            await page.locator('#signup-password').fill(${JSON.stringify(password)});
            await page.locator('#signup-password-confirmation').fill(${JSON.stringify(password)});
            const submit = page.getByRole('button', { name: /Create Account/ });
            ${index === 0 ? `const bounds = await submit.boundingBox();
            if (!bounds) throw new Error('Create-account button has no clickable bounds.');
            await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });` : 'await submit.click();'}
            await page.waitForFunction(() => window.location.pathname === '/verify-email', null, { timeout: 20000 });
            return {
              pathname: await page.evaluate(() => window.location.pathname),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
              viewportFits, consoleErrors, unexpectedResponses,
            };
            } finally {
              page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
            }
          }`], { sensitive: true }));
          expectEqual(signup.pathname, '/verify-email', `signup ${role.id} UI verification gate`);
          expectEqual(signup.fits, true, `signup ${role.id} viewport containment`);
          expectEqual(signup.viewportFits.every(Boolean), true, `signup ${role.id} two viewport states`);
          expectEqual(signup.consoleErrors.length, 0, `signup ${role.id} workflow console errors`);
          expectEqual(signup.unexpectedResponses.length, 0, `signup ${role.id} workflow unexpected responses`);
          createdUser = await authAdmin.getUserByEmail(email);
          registerDynamicAuthIdentity(createdUser.uid, `signup-browser-${role.id}`);
          registerDynamicFirestoreRoot(`users/${createdUser.uid}`, `signup-browser-${role.id}`);
          registerDynamicFirestoreRoot(`players/p_${createdUser.uid}`, `signup-browser-${role.id}-player`);
          expectEqual(createdUser.emailVerified, false, `signup ${role.id} preverification state`);
          const preverification = await signInEmail(email);
          expectEqual(await apiStatus('/api/auth/session', preverification.body.idToken, { method: 'POST' }), 403, `signup ${role.id} preverification session denial`);
          const action = selectLatestOob(await readEmulatorOobCodes(), email, 'VERIFY_EMAIL');
          registerSensitiveValue(action.oobCode);
          expectEqual((await redeemEmailVerification(action.oobCode)).status, 200, `signup ${role.id} in-memory verification action`);
          const landing = JSON.parse(cli(session, ['run-code', `async page => {
            await page.getByRole('button', { name: "I've Verified My Email" }).click();
            await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(role.destination)}, { timeout: 20000 });
            await page.reload();
            await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(role.destination)}, { timeout: 20000 });
            return {
              pathname: await page.evaluate(() => window.location.pathname),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            };
          }`], { sensitive: true }));
          expectEqual(landing.pathname, role.destination, `signup ${role.id} verified destination and reload`);
          expectEqual(landing.fits, true, `signup ${role.id} verified viewport containment`);
          const profile = await firestoreAdmin.collection('users').doc(createdUser.uid).get();
          expectEqual(profile.data()?.role, role.expectedRole, `signup ${role.id} persisted role`);
          const refreshed = await authAdmin.getUser(createdUser.uid);
          expectEqual(refreshed.customClaims?.role === 'superadmin', false, `signup ${role.id} privileged claim denial`);
        } finally {
          if (!createdUser) {
            createdUser = await getAuthUserByEmailIfPresent(authAdmin, email);
            if (createdUser) {
              registerDynamicAuthIdentity(createdUser.uid, `signup-browser-${role.id}-fallback`);
              registerDynamicFirestoreRoot(`users/${createdUser.uid}`, `signup-browser-${role.id}-fallback`);
              registerDynamicFirestoreRoot(`players/p_${createdUser.uid}`, `signup-browser-${role.id}-player-fallback`);
            }
          }
          await closeBrowserSessionNow(session);
        }
      }
      for (const mode of ['aborted', 'provider-failure']) {
        const failedEmail = browserSignupFailureAudit(mode);
        const retained = await authAdmin.getUserByEmail(failedEmail).then(() => true, error => {
          if (error?.code === 'auth/user-not-found') return false;
          throw error;
        });
        expectEqual(retained, false, `signup ${mode} delivery account cleanup`);
      }
    });
    return;
  }
  if (scenarioId === 'signup-onboarding-youth-invitation-signup') {
    const invalid = openAnonymousBrowser('cert-youth-invalid');
    assertTwoViewportRoutes(invalid, [{ path: '/signup/youth', expected: '/signup/youth' }], 'youth invalid invitation surface');
    await closeBrowserSessionNow(invalid);
    const parent = await signIn('qa-parent-a');
    const player = fixtureDocumentByAlias(FIXTURES, 'qa-player-youth-c');
    const youthEmail = emailForAlias('qa-youth-invite');
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const playerRef = firestoreAdmin.collection('players').doc(player.data.id);
      const originalPlayer = (await playerRef.get()).data();
      const youthBrowserCleanupRegistry = createResourceRegistry({ maxAttempts: 3 });
      let inviteToken = null;
      let createdUid = null;
      let primaryFailure = null;
      registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-browser-player');
      registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-browser-player', youthBrowserCleanupRegistry);
      try {
        const teamC = FIXTURES.teams.find(team => team.alias === 'qa-team-c');
        const rosterRef = firestoreAdmin.collection('teams').doc(teamC.id).collection('members').doc(player.data.id);
        registerDynamicFirestoreRoot(rosterRef.path, 'youth-browser-authorized-roster');
        registerDynamicFirestoreRoot(rosterRef.path, 'youth-browser-authorized-roster', youthBrowserCleanupRegistry);
        await rosterRef.set({
          id: player.data.id,
          playerId: player.data.id,
          parentId: identityByAlias.get('qa-parent-a').uid,
          name: 'Youth C',
          role: 'Member',
          position: 'Player',
          status: 'active',
          isDeleted: false,
          ownerUserId: teamC.ownerUserId,
        });
        const invite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({
            action: 'create', childId: player.data.id,
            email: youthEmail,
          }),
        });
        expectEqual(invite.status, 200, 'youth browser invitation setup');
        inviteToken = registerSensitiveValue(invite.body.token);
        registerDynamicFirestoreRoot(`invites/${inviteToken}`, 'youth-browser-invite');
        registerDynamicFirestoreRoot(`invites/${inviteToken}`, 'youth-browser-invite', youthBrowserCleanupRegistry);
        const session = browserSessionName(`cert-youth-active-${process.pid}`);
        cli(session, ['open', `${BASE_URL}/signup/youth?token=${inviteToken}`, '--browser', 'chrome'], { sensitive: true });
        const active = JSON.parse(cli(session, ['run-code', `async page => {
          const consoleErrors = [];
          const unexpectedResponses = [];
          const onConsole = message => {
            if (message.type() !== 'error') return;
            const value = message.text();
            if (value.includes('Failed to load resource:') && value.includes('404 (Not Found)')) return;
            consoleErrors.push(value);
          };
          const onPageError = error => consoleErrors.push(error.message);
          const onResponse = response => {
            const responseUrl = response.url();
            if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
              unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
            }
          };
          page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
          try {
          await page.getByText('Create Your Password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          const observations = [];
          for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            observations.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          }
          const passwordField = page.locator('#youth-password');
          const confirmation = page.locator('#youth-password-confirmation');
          await passwordField.fill('short');
          await confirmation.fill('different');
          const shortPasswordInvalid = await passwordField.evaluate(element => !element.checkValidity());
          await passwordField.fill(${JSON.stringify(password)});
          await confirmation.fill('different-password');
          await page.getByRole('button', { name: 'Activate My Account' }).click();
          await page.getByText('Passwords do not match', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
          await confirmation.fill(${JSON.stringify(password)});
          const submit = page.getByRole('button', { name: 'Activate My Account' });
          const bounds = await submit.boundingBox();
          if (!bounds) throw new Error('Youth activation button has no clickable bounds.');
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });
          await page.getByText('Account Created!', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          await page.reload();
          await page.getByText('Invitation Error', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          return {
            observations,
            pathname: await page.evaluate(() => window.location.pathname),
            shortPasswordInvalid,
            consumedReloadDenied: await page.getByText('Invitation Error', { exact: true }).count(),
            consoleErrors,
            unexpectedResponses: unexpectedResponses.filter(item => !(item.status === 404 && item.pathname === '/api/invites/youth')),
          };
          } finally {
            page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
          }
        }`], { sensitive: true }));
        expectEqual(active.pathname, '/signup/youth', 'youth active invitation browser path');
        expectEqual(active.observations.every(Boolean), true, 'youth active invitation two viewports');
        expectEqual(active.shortPasswordInvalid, true, 'youth browser short password validation');
        expectEqual(active.consumedReloadDenied, 1, 'youth browser consumed invitation reload denial');
        expectEqual(active.consoleErrors.join(' | '), '', 'youth activation workflow console errors');
        expectEqual(JSON.stringify(active.unexpectedResponses), '[]', 'youth activation workflow unexpected responses');
        const youth = await authAdmin.getUserByEmail(youthEmail);
        createdUid = youth.uid;
        registerDynamicAuthIdentity(createdUid, 'youth-browser');
        registerDynamicFirestoreRoot(`users/${createdUid}`, 'youth-browser');
        registerDynamicFirestoreRoot(`teams/${FIXTURES.teams.find(team => team.alias === 'qa-team-c').id}/members/${createdUid}`, 'youth-browser-team-member');
        registerDynamicAuthIdentity(createdUid, 'youth-browser', youthBrowserCleanupRegistry);
        registerDynamicFirestoreRoot(`users/${createdUid}`, 'youth-browser', youthBrowserCleanupRegistry);
        registerDynamicFirestoreRoot(`teams/${FIXTURES.teams.find(team => team.alias === 'qa-team-c').id}/members/${createdUid}`, 'youth-browser-team-member', youthBrowserCleanupRegistry);
        const linkedPlayer = (await playerRef.get()).data();
        expectEqual(linkedPlayer.userId, createdUid, 'youth browser exact player linkage');
      } catch (error) {
        primaryFailure = error;
        throw error;
      } finally {
        if (!createdUid) {
          createdUid = (await getAuthUserByEmailIfPresent(authAdmin, youthEmail))?.uid || null;
          if (createdUid) {
            registerDynamicAuthIdentity(createdUid, 'youth-browser-fallback');
            registerDynamicFirestoreRoot(`users/${createdUid}`, 'youth-browser-fallback');
            registerDynamicFirestoreRoot(`teams/${FIXTURES.teams.find(team => team.alias === 'qa-team-c').id}/members/${createdUid}`, 'youth-browser-team-member-fallback');
            registerDynamicAuthIdentity(createdUid, 'youth-browser-fallback', youthBrowserCleanupRegistry);
            registerDynamicFirestoreRoot(`users/${createdUid}`, 'youth-browser-fallback', youthBrowserCleanupRegistry);
            registerDynamicFirestoreRoot(`teams/${FIXTURES.teams.find(team => team.alias === 'qa-team-c').id}/members/${createdUid}`, 'youth-browser-team-member-fallback', youthBrowserCleanupRegistry);
          }
        }
        const browserCleanup = await youthBrowserCleanupRegistry.cleanup();
        completedDynamicCleanupRuns.push(browserCleanup);
        if (browserCleanup.state !== 'OBSERVED' && !primaryFailure) {
          throw new Error('Youth browser cleanup retained owned resources.');
        }
        expectEqual((await playerRef.get()).data()?.userId, originalPlayer?.userId, 'youth browser exact cleanup');
      }
    });
    return;
  }
  if (scenarioId === 'signup-onboarding-missing-profile-onboarding') {
    const anonymous = openAnonymousBrowser('cert-onboarding-anonymous');
    try {
      const anonymousDenial = JSON.parse(cli(anonymous, ['run-code', `async page => {
        const consoleErrors = [];
        const unexpectedResponses = [];
        const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
        const onPageError = error => consoleErrors.push(error.message);
        const onResponse = response => {
          const responseUrl = response.url();
          if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
            unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
          }
        };
        page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
        try {
          const viewports = [];
          for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            await page.goto(${JSON.stringify(`${BASE_URL}/onboarding`)}, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 15000 });
            viewports.push({
              pathname: await page.evaluate(() => window.location.pathname),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            });
          }
          return { viewports, consoleErrors, unexpectedResponses };
        } finally {
          page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
        }
      }`]));
      expectEqual(
        anonymousDenial.viewports.every(item => item.pathname === '/login' && item.fits),
        true,
        'missing-profile anonymous onboarding redirect two viewports',
      );
      expectEqual(anonymousDenial.consoleErrors.length, 0, 'missing-profile anonymous onboarding console errors');
      expectEqual(anonymousDenial.unexpectedResponses.length, 0, 'missing-profile anonymous onboarding unexpected responses');
    } finally {
      await closeBrowserSessionNow(anonymous);
    }
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const email = `${FIXTURES.runId}-missing-profile-browser@phase2.test`;
      const account = await authAdmin.createUser({ email, password, emailVerified: true, displayName: 'Browser Missing Profile' });
      registerDynamicAuthIdentity(account.uid, 'missing-profile-browser');
      registerDynamicFirestoreRoot(`users/${account.uid}`, 'missing-profile-browser');
      registerDynamicFirestoreRoot(`players/p_${account.uid}`, 'missing-profile-browser-player');
      try {
        const session = await browserLoginCredentials(email, password, '/onboarding', `cert-onboarding-missing-${process.pid}`, 'missing-profile browser identity');
        const completion = JSON.parse(cli(session, ['run-code', `async page => {
          const clientErrors = [];
          const unexpectedResponses = [];
          let profileWrites = 0;
          const onConsole = message => { if (message.type() === 'error') clientErrors.push(message.text()); };
          const onPageError = error => clientErrors.push(error.stack || error.message);
          const onRequest = request => {
            if (
              request.url().includes('google.firestore.v1.Firestore/Write/channel') &&
              decodeURIComponent(request.postData() || '').includes(${JSON.stringify(account.uid)})
            ) profileWrites += 1;
          };
          const onResponse = response => {
            const responseUrl = response.url();
            if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
              unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
            }
          };
          page.on('console', onConsole);
          page.on('pageerror', onPageError);
          page.on('request', onRequest);
          page.on('response', onResponse);
          try {
          const viewportFits = [];
          for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          }
          const profileFormReady = await page.locator('#onboarding-name')
            .waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
          if (!profileFormReady) {
            return {
              profileFormReady,
              pathname: await page.evaluate(() => window.location.pathname),
              body: (await page.locator('body').innerText()).slice(0, 500),
              clientErrors,
            };
          }
          let injectedReadFailures = 0;
          const listenPattern = 'http://127.0.0.1:8080/**';
          const preFaultErrorCount = clientErrors.length;
          const failOneRead = async route => {
            injectedReadFailures += 1;
            if (injectedReadFailures === 1) {
              await route.abort('failed');
              resolveInjectedRead();
            } else await route.continue();
          };
          let resolveInjectedRead;
          const injectedRead = new Promise(resolve => { resolveInjectedRead = resolve; });
          await page.route(listenPattern, failOneRead);
          const readRequest = page.waitForRequest(request => request.url().startsWith('http://127.0.0.1:8080/'));
          await page.reload();
          await readRequest;
          await injectedRead;
          await page.unroute(listenPattern, failOneRead);
          await page.reload();
          await page.locator('#onboarding-name').waitFor({ state: 'visible', timeout: 15000 });
          const faultConsoleErrors = clientErrors.splice(preFaultErrorCount);
          const expectedReadFaultConsoleCount = faultConsoleErrors.filter(value => value === 'Failed to load resource: net::ERR_FAILED').length;
          clientErrors.push(...faultConsoleErrors.filter(value => value !== 'Failed to load resource: net::ERR_FAILED'));
          const form = page.locator('form');
          await page.locator('#onboarding-name').fill('');
          const emptyInvalid = await form.evaluate(element => !element.checkValidity());
          await page.locator('#onboarding-name').evaluate(element => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            setter.call(element, 'x'.repeat(121));
            element.dispatchEvent(new Event('input', { bubbles: true }));
          });
          await page.getByRole('button', { name: 'Continue' }).click();
          await page.getByText('Valid name required', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
          const overlongDenied = await page.getByText('Valid name required', { exact: true }).count();
          await page.locator('#onboarding-name').fill('Draft Name');
          await page.locator('#role-admin').click();
          await page.reload();
          await page.locator('#onboarding-name').waitFor({ state: 'visible', timeout: 15000 });
          const midRefreshReset = (await page.locator('#onboarding-name').inputValue()) === 'Browser Missing Profile' && await page.locator('#role-adult_player').isChecked();
          await page.locator('#onboarding-name').fill('Browser Completed Profile');
          await page.locator('#role-coach').click();
          profileWrites = 0;
          const button = page.getByRole('button', { name: 'Continue' });
          const bounds = await button.boundingBox();
          if (!bounds) throw new Error('Onboarding button has no clickable bounds.');
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });
          await page.waitForFunction(() => window.location.pathname === '/teams/new', null, { timeout: 15000 });
          await page.reload();
          await page.waitForFunction(() => window.location.pathname === '/teams/new', null, { timeout: 15000 });
          return {
            pathname: await page.evaluate(() => window.location.pathname),
            fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            emptyInvalid, overlongDenied, midRefreshReset, profileWrites, viewportFits, clientErrors, unexpectedResponses,
            injectedReadFailures, expectedReadFaultConsoleCount,
          };
          } finally {
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
            page.off('request', onRequest);
            page.off('response', onResponse);
          }
        }`], { sensitive: true }));
        if (completion.profileFormReady === false) {
          const bufferedConsole = cli(session, ['console', 'error']);
          throw new Error(`Missing-profile onboarding form did not become ready at ${completion.pathname}: ${completion.body}; clientErrors=${JSON.stringify(completion.clientErrors)}; console=${bufferedConsole}`);
        }
        expectEqual(completion.pathname, '/teams/new', 'missing profile completed-role landing and reload');
        expectEqual(completion.fits, true, 'missing profile mobile completion containment');
        expectEqual(completion.emptyInvalid, true, 'onboarding empty validation');
        expectEqual(completion.overlongDenied, 1, 'onboarding overlong validation');
        expectEqual(completion.midRefreshReset, true, 'onboarding mid-form refresh reset');
        expectEqual(completion.profileWrites, 1, 'onboarding double-submit single profile write');
        expectEqual(completion.viewportFits.every(Boolean), true, 'onboarding real forms two viewports');
        expectEqual(completion.clientErrors.join(' | '), '', 'onboarding workflows console errors');
        expectEqual(JSON.stringify(completion.unexpectedResponses), '[]', 'onboarding workflows unexpected responses');
        expectEqual(completion.viewportFits.every(Boolean), true, 'onboarding role coach two viewport states');
        expectEqual(completion.clientErrors.join(' | '), '', 'onboarding role coach workflow console errors');
        expectEqual(JSON.stringify(completion.unexpectedResponses), '[]', 'onboarding role coach workflow unexpected responses');
        expectEqual(completion.expectedReadFaultConsoleCount, 1, 'onboarding injected read failure console signal');
        expectEqual(completion.injectedReadFailures >= 1, true, 'onboarding transient read failure recovery');
        const profile = await firestoreAdmin.collection('users').doc(account.uid).get();
        expectEqual(profile.data()?.role, 'coach', 'missing profile browser completion persistence');
        expectEqual(completion.pathname, '/teams/new', 'onboarding role coach completion destination');
        const relogin = await browserLoginCredentials(email, password, '/dashboard', `cert-onboarding-relogin-coach-${process.pid}`, 'onboarding role coach');
        expectEqual(browserPath(relogin, '/dashboard'), '/dashboard', 'onboarding role coach relogin destination');
      } finally {
        // The global registry owns exact deletion and postcondition proof.
      }
    });
    const remainingRoles = [
      { role: 'adult_player', destination: '/teams/join', relogin: '/dashboard' },
      { role: 'parent', destination: '/family', relogin: '/family' },
      { role: 'admin', destination: '/teams/new', relogin: '/club' },
      { role: 'league_creator', destination: '/competition', relogin: '/competition' },
    ];
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      for (const item of remainingRoles) {
        const email = `${FIXTURES.runId}-missing-${item.role}@phase2.test`;
        const account = await authAdmin.createUser({ email, password, emailVerified: true, displayName: `Missing ${item.role}` });
        registerDynamicAuthIdentity(account.uid, `missing-profile-${item.role}`);
        registerDynamicFirestoreRoot(`users/${account.uid}`, `missing-profile-${item.role}`);
        registerDynamicFirestoreRoot(`players/p_${account.uid}`, `missing-profile-${item.role}-player`);
        try {
          const session = await browserLoginCredentials(email, password, '/onboarding', `cert-onboarding-${item.role}-${process.pid}`, `onboarding role ${item.role}`);
          const result = JSON.parse(cli(session, ['run-code', `async page => {
            const consoleErrors = [];
            const unexpectedResponses = [];
            const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
            const onPageError = error => consoleErrors.push(error.message);
            const onResponse = response => {
              const url = response.url();
              if (url.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
                unexpectedResponses.push({ status: response.status(), pathname: url.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
              }
            };
            page.on('console', onConsole);
            page.on('pageerror', onPageError);
            page.on('response', onResponse);
            try {
            await page.locator('#onboarding-name').waitFor({ state: 'visible', timeout: 15000 });
            const viewportFits = [];
            for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
              await page.setViewportSize(viewport);
              viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
            }
            await page.locator('#onboarding-name').fill(${JSON.stringify(`Completed ${item.role}`)});
            await page.locator(${JSON.stringify(`#role-${item.role}`)}).click();
            await page.getByRole('button', { name: 'Continue' }).click();
            await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(item.destination)}, { timeout: 15000 });
            return { pathname: await page.evaluate(() => window.location.pathname), viewportFits, consoleErrors, unexpectedResponses };
            } finally {
              page.off('console', onConsole);
              page.off('pageerror', onPageError);
              page.off('response', onResponse);
            }
          }`]));
          expectEqual(result.pathname, item.destination, `onboarding role ${item.role} completion destination`);
          expectEqual(result.viewportFits.every(Boolean), true, `onboarding role ${item.role} two viewport states`);
          expectEqual(result.consoleErrors.length, 0, `onboarding role ${item.role} workflow console errors`);
          expectEqual(result.unexpectedResponses.length, 0, `onboarding role ${item.role} workflow unexpected responses`);
          const persisted = await firestoreAdmin.collection('users').doc(account.uid).get();
          expectEqual(persisted.data()?.role, item.role, `onboarding role ${item.role} persisted role`);
          await closeBrowserSessionNow(session);
          const relogin = await browserLoginCredentials(email, password, item.relogin, `cert-onboarding-relogin-${item.role}-${process.pid}`, `onboarding role ${item.role}`);
          expectEqual(browserPath(relogin, item.relogin), item.relogin, `onboarding role ${item.role} relogin destination`);
        } finally {
          // The shared dynamic registry owns deletion, retries, and postcondition proof.
        }
      }
    });
    return;
  }
  if (scenarioId === 'demo-seed-use-exit-expiry-cleanup') {
    const session = openAnonymousBrowser('cert-demo');
    const peerSession = openAnonymousBrowser('cert-demo-peer-context');
    assertTwoViewportRoutes(session, [{ path: '/', expected: '/' }], 'demo public surfaces');
    const peerJourney = JSON.parse(cli(peerSession, ['run-code', `async page => {
      const consoleErrors = [];
      const unexpectedResponses = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        const url = response.url();
        if (url.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) unexpectedResponses.push({ status: response.status(), pathname: url.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);
      try {
      await page.goto(${JSON.stringify(`${BASE_URL}/`)});
      await page.getByRole('button', { name: 'Experience Demo' }).click();
      await page.getByRole('button', { name: /Open Starter Plan Demo/ }).click();
      await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 30000 });
      await page.getByText('Demo Mode', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
      const viewportFits = [];
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      }
      return { status: sessionResponse.status(), uid: (await sessionResponse.json()).uid, viewportFits, consoleErrors, unexpectedResponses };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
      }
    }`]));
    expectEqual(peerJourney.status, 200, 'demo peer browser context session');
    await registerBrowserDemoGraph(peerJourney.uid, 'demo-browser-peer');
    expectEqual(peerJourney.viewportFits.every(Boolean), true, 'demo peer browser two viewport states');
    expectEqual(peerJourney.consoleErrors.length, 0, 'demo peer browser console errors');
    expectEqual(peerJourney.unexpectedResponses.length, 0, 'demo peer browser unexpected responses');
    const mainSeed = JSON.parse(cli(session, ['run-code', `async page => {
      const consoleErrors = [];
      const unexpectedResponses = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        const url = response.url();
        if (url.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) unexpectedResponses.push({ status: response.status(), pathname: url.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
      };
      page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
      try {
        await page.goto(${JSON.stringify(`${BASE_URL}/`)});
        await page.getByRole('button', { name: 'Experience Demo' }).click();
        await page.getByRole('button', { name: /Open Starter Plan Demo/ }).click();
        await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 30000 });
        await page.getByText('Demo Mode', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
        const response = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
        return { status: response.status(), uid: (await response.json()).uid, consoleErrors, unexpectedResponses };
      } finally { page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse); }
    }`]));
    expectEqual(mainSeed.status, 200, 'demo main browser context session');
    await registerBrowserDemoGraph(mainSeed.uid, 'demo-browser-main');
    expectEqual(mainSeed.consoleErrors.length, 0, 'demo main seed workflow console errors');
    expectEqual(mainSeed.unexpectedResponses.length, 0, 'demo main seed workflow unexpected responses');
    const journey = JSON.parse(cli(session, ['run-code', `async page => {
      const consoleErrors = [];
      const unexpectedResponses = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        const responseUrl = response.url();
        if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
          unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
        }
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('response', onResponse);
      try {
        await page.getByText('Demo Mode', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
        const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
        const uid = (await sessionResponse.json()).uid;
        const viewportFits = [];
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
          await page.setViewportSize(viewport);
          viewportFits.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 30000 });
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        await page.setViewportSize({ width: 1280, height: 800 });
        const exitResponse = page.waitForResponse(response =>
          response.url().endsWith('/api/demo/exit') && response.request().method() === 'POST',
          { timeout: 15000 },
        );
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.getByRole('menuitem', { name: 'Sign Out' }).click();
        const exit = await exitResponse;
        await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 15000 });
        return {
          exitStatus: exit.status(),
          pathname: await page.evaluate(() => window.location.pathname),
          fits,
          uid,
          viewportFits,
          consoleErrors,
          unexpectedResponses,
        };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('response', onResponse);
      }
    }`]));
    expectEqual(journey.exitStatus, 204, 'demo browser exact exit cleanup');
    expectEqual(journey.pathname, '/login', 'demo browser exited direct-route denial');
    expectEqual(journey.fits, true, 'demo browser mobile containment');
    expectEqual(journey.uid !== peerJourney.uid, true, 'demo two-browser-context workspace use');
    expectEqual(journey.viewportFits.every(Boolean), true, 'demo browser two viewport states');
    if (journey.consoleErrors.length > 0) console.log(`demo browser console diagnostic: ${JSON.stringify(journey.consoleErrors)}`);
    expectEqual(journey.consoleErrors.length, 0, 'demo browser console errors');
    expectEqual(journey.unexpectedResponses.length, 0, 'demo browser unexpected responses');
    const peerExit = exitDemoBrowserContext(peerSession);
    expectEqual(peerExit.status, 204, 'demo peer browser exact exit cleanup');
    expectEqual(peerExit.pathname, '/login', 'demo peer browser direct-route denial');
    if (peerExit.consoleErrors.length > 0 || peerExit.unexpectedResponses.length > 0) {
      console.log(`demo peer exit diagnostic: ${JSON.stringify(peerExit)}`);
    }
    expectEqual(peerExit.consoleErrors.length, 0, 'demo peer exit workflow console errors');
    expectEqual(peerExit.unexpectedResponses.length, 0, 'demo peer exit workflow unexpected responses');
    return;
  }
  if (scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    for (const alias of FIXTURES.activeAliases) {
      const fixture = identityByAlias.get(alias);
      let session;
      try {
        session = await browserLogin(alias, fixture.expectedLanding, `cert-dashboard-${alias}-${process.pid}`);
        browserLandingPersistenceAudit(session, fixture.expectedLanding, `dashboard ${alias}`);
        const policyCases = buildDashboardPolicyCases(fixture);
        const directCases = [
          { path: fixture.expectedLanding, expected: fixture.expectedLanding },
          ...policyCases.map(item => ({ path: item.path, expected: item.expected, waitForPathChange: !item.allowed })),
        ];
        const desktopPolicy = browserSurfaceSweep(session, directCases);
        assertSurfaceSweep(desktopPolicy, `dashboard direct policy ${alias}`);
        const mobilePolicy = browserSurfaceSweep(session, directCases, { mobile: true });
        assertSurfaceSweep(mobilePolicy, `dashboard mobile policy ${alias}`);
        for (let index = 0; index < policyCases.length; index += 1) {
          const item = policyCases[index];
          expectEqual(desktopPolicy.results[index + 1].actual, item.expected, `dashboard complete route policy ${alias} ${item.path}`);
          expectEqual(mobilePolicy.results[index + 1].actual, item.expected, `dashboard mobile route policy ${alias} ${item.path}`);
          if (!item.allowed) {
            expectEqual(desktopPolicy.results[index + 1].actual, '/dashboard', `dashboard policy denied route ${alias} ${item.path}`);
          }
        }
        expectEqual(
          desktopPolicy.results.every(item => item.mobileFits) && mobilePolicy.results.every(item => item.mobileFits),
          true,
          `dashboard policy two viewport containment ${alias}`,
        );
        const allowedPaths = policyCases.filter(item => item.allowed).map(item => item.path);
        const requiredPaths = requiredDashboardNavigationPaths(fixture);
        const visibleNavigation = browserVisibleSensitiveNavigationAudit(session, allowedPaths, requiredPaths, '/settings');
        expectEqual(visibleNavigation.observations.every(item => item.deniedVisible.length === 0), true, `dashboard visible navigation denied links ${alias}`);
        expectEqual(visibleNavigation.observations.every(item => item.missingRequired.length === 0), true, `dashboard visible navigation required links ${alias}`);
        expectEqual(visibleNavigation.consoleErrors.length, 0, `dashboard visible navigation console errors ${alias}`);
        expectEqual(visibleNavigation.unexpectedResponses.length, 0, `dashboard visible navigation unexpected responses ${alias}`);
        expectEqual(visibleNavigation.observations.every(item => item.fits), true, `dashboard visible navigation agreement ${alias}`);
        expectEqual(visibleNavigation.observations.every(item => item.fits), true, `dashboard visible navigation two viewport containment ${alias}`);
      } finally {
        if (session) await closeBrowserSessionNow(session);
      }
    }
    for (const blockedIdentity of BLOCKED_AUDIT_PLAN.browser) {
      browserLoginFailureAudit(
        blockedIdentity.alias,
        password,
        blockedIdentity.browserPath,
        blockedIdentity.browserTitle,
        `dashboard blocked-state protected data denial ${blockedIdentity.alias}`,
      );
    }
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (scenarioId === 'administration-access-and-user-directory') {
    const trusted = await browserLogin('qa-superadmin', '/admin', `cert-admin-trusted-${process.pid}`);
    assertTwoViewportRoutes(trusted, [{ path: '/admin', expected: '/admin' }], 'trusted administration surface');
    for (const alias of FIXTURES.activeAliases.filter(alias => alias !== 'qa-superadmin')) {
      const fixture = identityByAlias.get(alias);
      let session;
      try {
        session = await browserLogin(alias, fixture.expectedLanding, `cert-admin-denial-${alias}-${process.pid}`);
        const denial = browserSurfaceSweep(session, [
          { path: '/admin', expected: '/dashboard', waitForPathChange: true },
        ], { mobile: true });
        assertSurfaceSweep(denial, `admin browser non-SA policy ${alias}`);
        expectEqual(denial.results[0].actual, '/dashboard', `admin browser non-SA route denial ${alias}`);
      } finally {
        if (session) await closeBrowserSessionNow(session);
      }
    }
    for (const blocked of BLOCKED_AUDIT_PLAN.browser) {
      browserLoginFailureAudit(blocked.alias, password, blocked.browserPath, blocked.browserTitle, `admin browser non-SA route denial ${blocked.alias}`);
    }
    const directory = JSON.parse(cli(trusted, ['run-code', `async page => {
      const consoleErrors = [];
      const unexpectedResponses = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      const onResponse = response => {
        const responseUrl = response.url();
        if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
          unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
        }
      };
      page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
      try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: /Users Directory/ }).click();
      const search = page.getByPlaceholder('Search by name, email, phone, or org...');
      await search.waitFor({ state: 'visible', timeout: 15000 });
      await search.fill(${JSON.stringify(emailForAlias('qa-team-member'))});
      const target = page.getByText(${JSON.stringify(emailForAlias('qa-team-member'))}, { exact: true });
      await target.waitFor({ state: 'visible', timeout: 15000 });
      const targetCount = await target.count();
      const otherCount = await page.getByText(${JSON.stringify(emailForAlias('qa-parent-a'))}, { exact: true }).count();
      const targetButton = page.locator('button').filter({ hasText: ${JSON.stringify(emailForAlias('qa-team-member'))} }).first();
      await targetButton.click();
      const firstTargetDetails = await page.getByText(${JSON.stringify(identityByAlias.get('qa-team-member').uid)}, { exact: true }).count();
      await search.fill(${JSON.stringify(emailForAlias('qa-parent-a'))});
      const second = page.getByText(${JSON.stringify(emailForAlias('qa-parent-a'))}, { exact: true });
      await second.waitFor({ state: 'visible', timeout: 15000 });
      const firstDetailsAfterSubstitution = await page.getByText(${JSON.stringify(identityByAlias.get('qa-team-member').uid)}, { exact: true }).count();
      await search.fill('');
      const rows = page.locator('button').filter({ has: page.locator('p.font-mono') });
      await page.waitForFunction(() => document.querySelectorAll('button p.font-mono').length > 2, null, { timeout: 15000 });
      const readVisibleNames = () => rows.locator('p.text-sm.font-black').allInnerTexts();
      const compareNames = (left, right) => {
        const a = left.toLowerCase();
        const b = right.toLowerCase();
        if (a < b) return -1;
        if (a > b) return 1;
        return 0;
      };
      const expectedAscending = (await readVisibleNames()).sort(compareNames);
      const expectedDescending = [...expectedAscending].sort((a, b) => compareNames(b, a));
      const header = page.getByRole('button', { name: new RegExp('Name / Email') });
      await header.click();
      await page.waitForFunction(expected => JSON.stringify(Array.from(document.querySelectorAll('button p.text-sm.font-black')).map(element => (element.textContent || '').trim())) === JSON.stringify(expected), expectedAscending, { timeout: 15000 });
      const ascending = await rows.locator('p.text-sm.font-black').allInnerTexts();
      await header.click();
      await page.waitForFunction(expected => JSON.stringify(Array.from(document.querySelectorAll('button p.text-sm.font-black')).map(element => (element.textContent || '').trim())) === JSON.stringify(expected), expectedDescending, { timeout: 15000 });
      const descending = await rows.locator('p.text-sm.font-black').allInnerTexts();
      const actualAscending = JSON.stringify(ascending) === JSON.stringify(expectedAscending);
      const actualDescending = JSON.stringify(descending) === JSON.stringify(expectedDescending);
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      return {
        targetCount, otherCount, firstTargetDetails, firstDetailsAfterSubstitution,
        actualAscending, actualDescending, mobileFits,
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors, unexpectedResponses,
      };
      } finally {
        page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse);
      }
    }`]));
    expectEqual(directory.targetCount >= 1, true, 'admin directory target search visibility');
    expectEqual(directory.otherCount, 0, 'admin directory search isolation');
    expectEqual(directory.fits, true, 'admin directory desktop containment');
    expectEqual(directory.firstTargetDetails, 1, 'admin directory detail target binding');
    expectEqual(directory.firstDetailsAfterSubstitution, 0, 'admin detail target substitution denied');
    expectEqual(directory.actualAscending, true, 'admin directory actual ascending sort');
    expectEqual(directory.actualDescending, true, 'admin directory actual descending sort');
    expectEqual(directory.mobileFits, true, 'admin directory mobile containment');
    expectEqual(directory.consoleErrors.length, 0, 'admin directory workflow console errors');
    expectEqual(directory.unexpectedResponses.length, 0, 'admin directory workflow unexpected responses');
    await browserAdminOpenTabRevocationAudit('admin open page');
  }
}

export async function executeCertificationScenarioStages({
  scenarioIds,
  runBrowser: browserEnabled,
  runApiScenario,
  runBrowserScenario,
  closeScenarioBrowsers,
  recordFailure,
  recordSkipped,
}) {
  const failures = [];
  let stopped = false;
  for (const scenarioId of scenarioIds) {
    if (stopped) {
      recordSkipped(scenarioId);
      continue;
    }
    try {
      await runApiScenario(scenarioId);
      if (browserEnabled) await runBrowserScenario(scenarioId);
    } catch (error) {
      const failure = { scenarioId, stage: error?.certificationStage || 'api', error };
      failures.push(failure);
      recordFailure(failure);
      stopped = true;
    } finally {
      try {
        await closeScenarioBrowsers(scenarioId);
      } catch (error) {
        const failure = { scenarioId, stage: 'browser-cleanup', error };
        failures.push(failure);
        recordFailure(failure);
        stopped = true;
      }
    }
  }
  return { failures };
}

async function runCertificationIdentityScenarios() {
  const scenarioIds = IDENTITY_EXECUTION_ORDER.filter(id => selectedIdentityScenarios.has(id));
  let sessionBaseline = new Set();
  const result = await executeCertificationScenarioStages({
    scenarioIds,
    runBrowser,
    async runApiScenario(scenarioId) {
      shutdownState.throwIfRequested();
      activeCertificationScenario = scenarioId;
      activeCertificationAssertions = [];
      sessionBaseline = new Set(ownedBrowserSessions);
      await runCertificationApiScenario(scenarioId);
    },
    async runBrowserScenario(scenarioId) {
      try {
        await runCertificationBrowserScenario(scenarioId);
        recordCompletedCertificationCases(scenarioId);
      } catch (error) {
        error.certificationStage = 'browser';
        throw error;
      }
    },
    async closeScenarioBrowsers() {
      await closeBrowserSessionsCreatedAfter(ownedBrowserSessions, sessionBaseline, async session => {
        run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
      });
      syncBrowserSessionRegistry();
      activeCertificationScenario = null;
      activeCertificationAssertions = [];
    },
    recordFailure({ scenarioId, stage, error }) {
      const dimension = stage === 'api' ? 'network' : 'console';
      const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId][dimension][0];
      recordCertificationFailure(scenarioId, dimension, caseId, error);
    },
    recordSkipped(scenarioId) {
      emitCertificationEvent({ type: 'scenario-skipped', scenarioId, reason: 'Stopped after the first certification failure; cleanup only.' });
    },
  });
  if (result.failures.length > 0) throw new Error(`${result.failures.length} selected certification scenario stage(s) failed with structured case evidence.`);
}

function browserVisibleAdminNavigationAudit(session, shouldExposeAdmin, canonicalPath) {
  const observations = JSON.parse(cli(session, ['run-code', `async page => {
    const baseUrl = ${JSON.stringify(BASE_URL)};
    const canonicalPath = ${JSON.stringify(canonicalPath)};
    const observations = [];
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto(baseUrl + canonicalPath);
      let visibleAdminItems;
      const navigationTrigger = viewport.width < 640
        ? page.getByRole('button', { name: 'More', exact: true })
        : page.getByRole('button', { name: 'Open account menu' });
      await navigationTrigger.waitFor({ state: 'visible', timeout: 15000 });
      await navigationTrigger.click();
      if (viewport.width < 640) {
        const mobileAdminLink = page.getByRole('link', { name: 'Go to Admin Page' });
        visibleAdminItems = await mobileAdminLink.count() > 0 && await mobileAdminLink.isVisible() ? 1 : 0;
      } else {
        const desktopAdminItem = page.getByRole('menuitem', { name: 'Go to Admin Page' });
        visibleAdminItems = await desktopAdminItem.count() > 0 && await desktopAdminItem.isVisible() ? 1 : 0;
      }
      observations.push({
        visibleAdminItems,
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      });
      await page.keyboard.press('Escape');
    }
    return observations;
  }`]));
  return {
    agreement: observations.every(item => item.visibleAdminItems === (shouldExposeAdmin ? 1 : 0)),
    fits: observations.every(item => item.fits),
  };
}

function browserVisibleSensitiveNavigationAudit(session, allowedPaths, requiredPaths, canonicalPath) {
  return JSON.parse(cli(session, ['run-code', `async page => {
    const baseUrl = ${JSON.stringify(BASE_URL)};
    const policyPaths = ${JSON.stringify(DASHBOARD_POLICY_PATHS)};
    const allowedPaths = new Set(${JSON.stringify(allowedPaths)});
    const requiredPaths = ${JSON.stringify(requiredPaths)};
    const canonicalPath = ${JSON.stringify(canonicalPath)};
    const observations = [];
    const consoleErrors = [];
    const unexpectedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      const responseUrl = response.url();
      if (responseUrl.startsWith(baseUrl + '/') && response.status() >= 400) {
        unexpectedResponses.push({ status: response.status(), pathname: responseUrl.slice(baseUrl.length).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await page.goto(baseUrl + canonicalPath);
        await page.waitForFunction(expected => window.location.pathname === expected, canonicalPath, { timeout: 15000 });
        const navigationTrigger = viewport.width < 640
          ? page.getByRole('button', { name: 'More', exact: true })
          : page.getByRole('button', { name: 'Open account menu' });
        await navigationTrigger.waitFor({ state: 'visible', timeout: 15000 });
        await navigationTrigger.click();
        const visiblePaths = [];
        for (const pathname of policyPaths) {
          const link = page.locator('a[href=' + JSON.stringify(pathname) + ']:visible');
          if (await link.count() > 0) visiblePaths.push(pathname);
        }
        const institutionHubButton = page.getByRole('button', { name: /School Hub|Club Hub/ });
        if (!visiblePaths.includes('/club') && await institutionHubButton.count() > 0 && await institutionHubButton.first().isVisible()) {
          visiblePaths.push('/club');
        }
        const adminMenuItem = page.getByRole('menuitem', { name: 'Go to Admin Page' });
        if (!visiblePaths.includes('/admin') && await adminMenuItem.count() > 0 && await adminMenuItem.first().isVisible()) {
          visiblePaths.push('/admin');
        }
        observations.push({
          viewport: viewport.width,
          deniedVisible: visiblePaths.filter(pathname => !allowedPaths.has(pathname)),
          missingRequired: requiredPaths.filter(pathname => !visiblePaths.includes(pathname)),
          fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        });
        await page.keyboard.press('Escape');
      }
      return { observations, consoleErrors, unexpectedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`]));
}

function exitDemoBrowserContext(session) {
  return JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const unexpectedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      const url = response.url();
      if (url.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) unexpectedResponses.push({ status: response.status(), pathname: url.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
    };
    page.on('console', onConsole); page.on('pageerror', onPageError); page.on('response', onResponse);
    try {
      const response = await page.request.post(${JSON.stringify(`${BASE_URL}/api/demo/exit`)});
      await page.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
      await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 15000 });
      return { status: response.status(), pathname: await page.evaluate(() => window.location.pathname), consoleErrors, unexpectedResponses };
    } finally { page.off('console', onConsole); page.off('pageerror', onPageError); page.off('response', onResponse); }
  }`]));
}

function browserSurfaceSweep(session, cases, { mobile = false } = {}) {
  const code = `async page => {
    const cases = ${JSON.stringify(cases)};
    const results = [];
    let activePath = '';
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => {
      if (message.type() === 'error') consoleErrors.push({ path: activePath, message: message.text() });
    };
    const onPageError = error => consoleErrors.push({ path: activePath, message: error.message });
    const onResponse = response => {
      const responseUrl = response.url();
      if (responseUrl.startsWith(${JSON.stringify(`${BASE_URL}/`)}) && response.status() >= 400) {
        failedResponses.push({ path: activePath, status: response.status(), pathname: responseUrl.slice(${BASE_URL.length}).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
      for (const item of cases) {
        activePath = item.path;
        const expectedPaths = Array.isArray(item.expected) ? item.expected : [item.expected];
        try {
          await page.goto(${JSON.stringify(BASE_URL)} + item.path, { waitUntil: 'domcontentloaded' });
        } catch (error) {
          if (!String(error?.message || error).includes('net::ERR_ABORTED')) throw error;
        }
        const transitionTimeout = item.waitForPathChange ? 30000 : 15000;
        try {
          await page.waitForFunction(expectedPaths => expectedPaths.includes(window.location.pathname), expectedPaths, { timeout: transitionTimeout });
        } catch (error) {
          const actualPath = await page.evaluate(() => window.location.pathname);
          throw new Error('route sweep timeout requested=' + item.path + ' expected=' + JSON.stringify(expectedPaths) + ' actual=' + actualPath + ': ' + String(error?.message || error));
        }
        results.push({
          requested: item.path,
          expected: item.expected,
          expectRestricted: item.expectRestricted === true,
          expectRestrictedOn: item.expectRestrictedOn || '',
          actual: await page.evaluate(() => window.location.pathname),
          applicationError: await page.getByText(/Application error: a client-side exception/).count(),
          restricted: await page.getByText(/Access Restricted|Access Denied|Institutional Hub Locked|Elite Upgrade Required/i).count(),
          mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        });
      }
      return { results, consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertSurfaceSweep(result, label) {
  const routeFailures = result.results.filter(item => {
    const expectedPaths = Array.isArray(item.expected) ? item.expected : [item.expected];
    const missingRestriction = item.expectRestricted === true && item.restricted < 1;
    const missingConditionalRestriction = item.expectRestrictedOn === item.actual && item.restricted < 1;
    return !expectedPaths.includes(item.actual) || item.applicationError !== 0 || item.mobileFits !== true || missingRestriction || missingConditionalRestriction;
  });
  if (routeFailures.length > 0) console.log(`${label} route diagnostics: ${JSON.stringify(routeFailures)}`);
  if (result.consoleErrors.length > 0) console.log(`${label} console diagnostics: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`${label} response diagnostics: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(routeFailures.length, 0, `${label} routes, application errors, and mobileFits`);
  expectEqual(result.consoleErrors.length, 0, `${label} console errors`);
  expectEqual(result.failedResponses.length, 0, `${label} failed responses`);
}

async function runSurfaceSmokeAudit({ remainderOnly = false, includeMember = true } = {}) {
  if (!remainderOnly) {
    const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `surface-owner-${process.pid}`);
    const assistant = await browserLogin('qa-team-assistant', '/dashboard', `surface-assistant-${process.pid}`);

    assertSurfaceSweep(browserSurfaceSweep(owner, [
      '/team', '/events', '/calendar', '/roster', '/feed', '/chats', '/practice', '/drills',
      '/files', '/volunteers', '/fundraising', '/facilities', '/equipment', '/games', '/settings',
      '/dashboard/billing', '/leagues', '/tournaments', '/manage-tournaments', '/coaches-corner',
      '/teams/join', '/teams/new',
    ].map(pathname => ({ path: pathname, expected: pathname })).concat([
      { path: '/club', expected: '/dashboard' },
      { path: '/competition', expected: '/dashboard' },
      { path: '/admin', expected: '/dashboard' },
    ])), 'owner remaining surface sweep');

    assertSurfaceSweep(browserSurfaceSweep(assistant, [
      '/facilities', '/equipment', '/fundraising', '/volunteers', '/manage-tournaments', '/teams/new',
    ].map(pathname => ({ path: pathname, expected: pathname })), { mobile: true }), 'assistant remaining surface sweep');
  }

  const member = includeMember
    ? await browserLogin('qa-team-member', '/dashboard', `surface-member-${process.pid}`)
    : null;
  const parent = await browserLogin('qa-parent-a', '/family', `surface-parent-${process.pid}`);
  const admin = await browserLogin('qa-superadmin', '/admin', `surface-admin-${process.pid}`);

  if (member) assertSurfaceSweep(browserSurfaceSweep(member, [
    '/team', '/events', '/calendar', '/roster', '/feed', '/chats', '/practice', '/drills', '/files',
    '/games', '/settings', '/leagues', '/volunteers',
  ].map(pathname => ({ path: pathname, expected: pathname })).concat([
    { path: '/tournaments', expected: ['/manage-tournaments', '/dashboard'], expectRestrictedOn: '/manage-tournaments', waitForPathChange: true },
  ]).concat([
    '/facilities', '/equipment', '/fundraising', '/manage-tournaments', '/teams/new',
    '/dashboard/billing', '/family', '/admin', '/club', '/competition', '/coaches-corner',
  ].map(pathname => ({ path: pathname, expected: '/dashboard' }))), { mobile: true }), 'member remaining surface sweep');

  assertSurfaceSweep(browserSurfaceSweep(parent, [
    { path: '/family', expected: '/family' },
    { path: '/family/payments', expected: '/family/payments' },
    { path: '/facilities', expected: '/family' },
    { path: '/admin', expected: '/family' },
  ], { mobile: true }), 'parent remaining surface sweep');

  assertSurfaceSweep(browserSurfaceSweep(admin, [
    { path: '/admin', expected: '/admin' },
    { path: '/admin/plans', expected: '/admin/plans' },
    { path: '/family', expected: '/family' },
    { path: '/club', expected: '/club' },
    { path: '/competition', expected: '/competition' },
  ], { mobile: true }), 'trusted admin remaining surface sweep');
}

function browserOwnerCommunicationSetup(session, marker) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    const dismissPriorityAlerts = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
        const visible = await alert.waitFor({ state: 'visible', timeout: 1800 }).then(() => true).catch(() => false);
        if (!visible) break;
        await alert.getByRole('button', { name: 'Got It' }).click();
        await alert.waitFor({ state: 'hidden' });
      }
    };
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    await page.getByPlaceholder(/What's the play/).waitFor({ timeout: 10000 });
    await dismissPriorityAlerts();

    await page.getByRole('button', { name: 'Create poll' }).click();
    await page.getByRole('button', { name: 'Launch Poll' }).click();
    await page.getByText('Poll Incomplete', { exact: true }).waitFor();
    const incompletePoll = await page.getByText('Poll Incomplete', { exact: true }).count();
    await dismissPriorityAlerts();
    await page.locator('[toast-close]').click({ force: true });
    await page.getByPlaceholder('e.g. Best time for training?').fill(${JSON.stringify(`QA Poll ${marker}`)});
    await page.getByPlaceholder('Option 1').fill('Morning');
    await page.getByPlaceholder('Option 2').fill('Evening');
    await page.getByRole('button', { name: 'Launch Poll' }).click();
    await page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await dismissPriorityAlerts();

    let postButtonCount = 0;
    let postButtonEnabled = false;
    let composerValue = '';
    for (let attempt = 0; attempt < 5 && !postButtonEnabled; attempt += 1) {
      const composer = page.getByPlaceholder(/What's the play/);
      await composer.waitFor({ state: 'visible', timeout: 10000 });
      await composer.fill(${JSON.stringify(`QA Feed ${marker}`)});
      await page.waitForTimeout(350);
      const postButton = page.getByRole('button', { name: 'Post to Squad' });
      postButtonCount = await postButton.count();
      postButtonEnabled = postButtonCount === 1 ? await postButton.isEnabled() : false;
      composerValue = await page.getByPlaceholder(/What's the play/).inputValue().catch(() => '');
      if (postButtonEnabled) await postButton.click();
    }
    if (!postButtonEnabled) {
      throw new Error('feed composer diagnostic: ' + JSON.stringify({
        postButtonCount,
        postButtonEnabled,
        composerValue,
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1200),
        buttons: await page.getByRole('button').allTextContents(),
        activeTeamId: await page.evaluate(() => localStorage.getItem('sf_session_team_id')),
      }));
    }
    await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      incompletePoll,
      postAfterReload: await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).count(),
      pollAfterReload: await page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserMemberCommunication(session, marker) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    const postText = page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true });
    await postText.waitFor({ timeout: 10000 });
    const ownerPostVisible = await postText.count();
    const postCard = postText.locator('xpath=ancestor::div[.//button[@aria-label="Post comment"]][1]');
    await postCard.getByPlaceholder('Write to squad...').fill(${JSON.stringify(`QA Comment ${marker}`)});
    await postCard.getByRole('button', { name: 'Post comment' }).click();
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });

    const pollQuestion = page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true });
    await pollQuestion.waitFor();
    const pollCard = pollQuestion.locator('xpath=ancestor::div[.//button[.//span[normalize-space()="Morning"]]][1]');
    await pollCard.getByText('Morning', { exact: true }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    const commentAfterReload = await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).count();
    const reloadedPoll = page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true });
    await reloadedPoll.waitFor();
    const reloadedPollCard = reloadedPoll.locator('xpath=ancestor::div[.//button[.//span[normalize-space()="Morning"]]][1]');
    const voteAfterReload = await reloadedPollCard.getByText('1 v', { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    const chatInput = page.getByPlaceholder('Tactical update...');
    const chatReady = await chatInput.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!chatReady) {
      throw new Error('chat detail diagnostic: ' + JSON.stringify({
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1200),
        consoleErrors,
        failedResponses,
      }));
    }
    await chatInput.fill(${JSON.stringify(`QA Chat ${marker}`)});
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      ownerPostVisible,
      commentAfterReload,
      voteAfterReload,
      chatAfterReload: await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).count(),
      teamBLeak: await page.getByText(/BLUEBIRD-B/).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerCommunicationVerify(session, marker) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    const memberComment = await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).count();
    const postText = page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true });
    const postCard = postText.locator('xpath=ancestor::div[.//button[starts-with(@aria-label,"Delete post by")]][1]');
    await postCard.getByRole('button', { name: /Delete post by/ }).click();
    await postText.waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    const deletedAfterReload = await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      memberComment,
      deletedAfterReload,
      chatVisible: await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).count(),
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runCommunicationWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `communication-owner-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `communication-member-${process.pid}`);
  const setup = browserOwnerCommunicationSetup(owner, marker);
  expectEqual(setup.incompletePoll, 1, 'feed rejects incomplete poll');
  expectEqual(setup.postAfterReload, 1, 'owner feed post persists after reload');
  expectEqual(setup.pollAfterReload, 1, 'owner poll persists after reload');
  expectEqual(setup.consoleErrors.length, 0, 'owner feed workflow console errors');
  expectEqual(setup.failedResponses.length, 0, 'owner feed workflow failed responses');

  const memberResult = browserMemberCommunication(member, marker);
  expectEqual(memberResult.ownerPostVisible, 1, 'member sees owner feed post');
  expectEqual(memberResult.commentAfterReload, 1, 'member comment persists for owner');
  expectEqual(memberResult.voteAfterReload, 1, 'member poll vote persists after reload');
  expectEqual(memberResult.chatAfterReload, 1, 'member chat message persists after reload');
  expectEqual(memberResult.teamBLeak, 0, 'Team B chat content is absent from Team A UI');
  expectEqual(memberResult.consoleErrors.length, 0, 'member communication workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member communication workflow failed responses');

  const ownerResult = browserOwnerCommunicationVerify(owner, marker);
  expectEqual(ownerResult.memberComment, 1, 'member comment persists for owner');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner feed post delete persists after reload');
  expectEqual(ownerResult.chatVisible, 1, 'member chat message persists for owner');
}

function browserOwnerEventCreate(session, marker) {
  const title = `QA Event ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: '+ New Activity' }).click();
    const form = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText('Activity Incomplete', { exact: true }).waitFor();
    const incomplete = await page.getByText('Activity Incomplete', { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await form.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(title)});
    await form.getByRole('button', { name: 'Pick Date' }).first().click();
    const dateButton = page.getByRole('button', { name: /September 20/ }).first();
    await dateButton.waitFor({ timeout: 5000 });
    await dateButton.click();
    await form.locator('input[type="time"]').fill('18:30');
    await form.locator('textarea').fill('Synthetic browser-audit event');
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 10000 });
    return {
      incomplete,
      createdAfterReload: await page.getByText(${JSON.stringify(title)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserMemberEventRsvp(session, marker) {
  const title = `QA Event ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    const eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
    await eventTitle.waitFor({ timeout: 10000 });
    await eventTitle.click();
    const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
    const editControls = await details.getByRole('button', { name: 'Edit Activity' }).count();
    const goingControls = await details.getByRole('button', { name: 'Going' }).count();
    if (goingControls === 0) {
      throw new Error('member event RSVP diagnostic: ' + JSON.stringify({
        body: (await details.innerText()).slice(0, 1800),
        buttons: await details.getByRole('button').allTextContents(),
        pathname: await page.evaluate(() => window.location.pathname),
      }));
    }
    await details.getByRole('button', { name: 'Going' }).click();
    await details.getByText('GOING', { exact: true }).first().waitFor({ timeout: 10000 });
    await details.getByRole('button', { name: 'Close event details' }).click();
    await page.reload();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
    const reloaded = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
    await reloaded.getByText('GOING', { exact: true }).first().waitFor({ timeout: 10000 });
    return {
      eventVisible: await page.getByText(${JSON.stringify(title)}, { exact: true }).count(),
      editControls,
      rsvpAfterReload: await reloaded.getByText('GOING', { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerEventEditDelete(session, marker) {
  const original = `QA Event ${marker}`;
  const updated = `QA Event Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    await page.getByText(${JSON.stringify(original)}, { exact: true }).last().click();
    const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${original}`)} });
    await details.getByRole('button', { name: 'Edit Activity' }).click();
    const form = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
    await form.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(updated)});
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 10000 });
    const close = page.getByRole('button', { name: 'Close event details' });
    if (await close.count()) await close.click();
    await page.reload();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 10000 });
    const editedAfterReload = await page.getByText(${JSON.stringify(updated)}, { exact: true }).count();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).last().click();
    const updatedDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${updated}`)} });
    await updatedDetails.getByRole('button', { name: ${JSON.stringify(`Delete ${updated}`)} }).click();
    const confirmation = page.getByRole('alertdialog');
    await confirmation.getByRole('button', { name: 'Delete Activity' }).click();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    return {
      editedAfterReload,
      deletedAfterReload: await page.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runEventWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `events-owner-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `events-member-${process.pid}`);
  const created = browserOwnerEventCreate(owner, marker);
  expectEqual(created.incomplete, 1, 'event rejects incomplete activity');
  expectEqual(created.createdAfterReload > 0, true, 'owner event create persists after reload');
  expectEqual(created.consoleErrors.length, 0, 'owner event create console errors');
  expectEqual(created.failedResponses.length, 0, 'owner event create failed responses');
  const memberResult = browserMemberEventRsvp(member, marker);
  expectEqual(memberResult.eventVisible > 0, true, 'member sees owner event');
  expectEqual(memberResult.editControls, 0, 'member cannot edit team event');
  expectEqual(memberResult.rsvpAfterReload > 0, true, 'member RSVP persists after reload');
  expectEqual(memberResult.consoleErrors.length, 0, 'member event workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member event workflow failed responses');
  const ownerResult = browserOwnerEventEditDelete(owner, marker);
  expectEqual(ownerResult.editedAfterReload > 0, true, 'owner event edit persists after reload');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner event delete persists after reload');
  expectEqual(ownerResult.consoleErrors.length, 0, 'owner event edit/delete console errors');
  expectEqual(ownerResult.failedResponses.length, 0, 'owner event edit/delete failed responses');
}

function browserFacilityWorkflow(session, marker) {
  const facility = `QA Facility ${marker}`;
  const updatedFacility = `QA Facility Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/facilities`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Enroll Facility' }).click();
    const enrollment = page.getByRole('dialog', { name: 'Facility Registration' });
    const commit = enrollment.getByRole('button', { name: 'Commit Facility Enrollment' });
    const initiallyDisabled = await commit.isDisabled();
    await enrollment.getByPlaceholder('e.g. Metro Sports Complex').fill(${JSON.stringify(facility)});
    const nameOnlyDisabled = await commit.isDisabled();
    await enrollment.getByPlaceholder('123 Stadium Way, City, State…').fill('100 QA Avenue');
    const completeEnabled = await commit.isEnabled();
    await commit.click();
    await page.getByText(${JSON.stringify(facility)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(facility)}, { exact: true }).waitFor({ timeout: 10000 });
    const createdAfterReload = await page.getByText(${JSON.stringify(facility)}, { exact: true }).count();

    await page.getByRole('button', { name: ${JSON.stringify(`Edit ${facility}`)} }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Facility' });
    await edit.getByPlaceholder('e.g. Metro Sports Complex').fill(${JSON.stringify(updatedFacility)});
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ timeout: 10000 });
    const editedAfterReload = await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).count();
    return {
      initiallyDisabled,
      nameOnlyDisabled,
      completeEnabled,
      createdAfterReload,
      editedAfterReload,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserFacilityResourceWorkflow(session, marker) {
  const updatedFacility = `QA Facility Updated ${marker}`;
  const resource = `QA Court ${marker}`;
  const updatedResource = `QA Court Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.getByPlaceholder('e.g. Field A, Court 1...').fill(${JSON.stringify(resource)});
    await page.getByRole('button', { name: 'Add Resource' }).click();
    await page.getByText(${JSON.stringify(resource)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: ${JSON.stringify(`Rename ${resource}`)} }).click();
    const rename = page.getByRole('textbox', { name: ${JSON.stringify(`Rename ${resource}`)} });
    await rename.fill(${JSON.stringify(updatedResource)});
    await page.getByRole('button', { name: ${JSON.stringify(`Save ${resource} name`)} }).click();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ timeout: 10000 });
    const resourceRenamedAfterReload = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${updatedResource}`)} }).click();
    const resourceAfterCancel = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${updatedResource}`)} }).click();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    const resourceAfterDelete = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Decommission ${updatedFacility}`)} }).click();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    return {
      resourceRenamedAfterReload,
      resourceAfterCancel,
      resourceAfterDelete,
      facilityAfterDelete: await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runFacilityWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `facilities-owner-${process.pid}`);
  const result = browserFacilityWorkflow(owner, marker);
  expectEqual(result.initiallyDisabled && result.nameOnlyDisabled && result.completeEnabled, true, 'facility requires name and address');
  expectEqual(result.createdAfterReload, 1, 'facility create persists after reload');
  expectEqual(result.editedAfterReload, 1, 'facility edit persists after reload');
  expectEqual(result.consoleErrors.length, 0, 'facility workflow console errors');
  expectEqual(result.failedResponses.length, 0, 'facility workflow failed responses');
  const resources = browserFacilityResourceWorkflow(owner, marker);
  expectEqual(resources.resourceRenamedAfterReload, 1, 'resource rename persists after reload');
  expectEqual(resources.resourceAfterCancel, 1, 'resource delete cancel preserves record');
  expectEqual(resources.resourceAfterDelete, 0, 'resource delete persists after reload');
  expectEqual(resources.facilityAfterDelete, 0, 'facility delete persists after reload');
  expectEqual(resources.consoleErrors.length, 0, 'facility resource workflow console errors');
  expectEqual(resources.failedResponses.length, 0, 'facility resource workflow failed responses');
}

function browserEquipmentCreateEdit(session, marker) {
  const asset = `QA Cones ${marker}`;
  const updated = `QA Training Cones ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/equipment`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Add Asset' }).click();
    const enrollment = page.getByRole('dialog', { name: 'Enroll Equipment Asset' });
    await enrollment.getByPlaceholder('e.g. Away Jerseys').fill(${JSON.stringify(asset)});
    await enrollment.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Training Gear' }).click();
    await enrollment.locator('input[type="number"]').first().fill('3');
    await enrollment.getByRole('button', { name: 'Commit Asset to Vault' }).click();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ timeout: 10000 });
    const createdAfterReload = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    const search = page.getByPlaceholder('Search inventory ledger...');
    await search.fill('not-present-' + ${JSON.stringify(marker)});
    const hiddenBySearch = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await search.fill('QA Cones');
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor();
    const foundBySearch = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Edit ${asset}`)} }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Equipment Asset' });
    await edit.locator('input').first().fill(${JSON.stringify(updated)});
    await edit.getByRole('button', { name: 'Commit Synchronization' }).click();
    await search.fill('');
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      createdAfterReload,
      hiddenBySearch,
      foundBySearch,
      editedAfterReload: await page.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserEquipmentAssignReturnDelete(session, marker) {
  const asset = `QA Training Cones ${marker}`;
  const memberName = 'qa team member';
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.getByRole('button', { name: 'Assign to Player' }).click();
    const assignment = page.getByRole('dialog', { name: 'Deploy Asset' });
    await assignment.getByRole('combobox').click();
    await page.getByRole('option', { name: /qa team member/i }).click();
    await assignment.locator('input[type="number"]').fill('4');
    await assignment.getByRole('button', { name: 'Dispatch Asset' }).click();
    await page.getByText('Quota Exceeded', { exact: true }).waitFor();
    const rejectedOverAssignment = await page.getByText('Quota Exceeded', { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await assignment.locator('input[type="number"]').fill('1');
    await assignment.getByRole('button', { name: 'Dispatch Asset' }).click();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ timeout: 10000 });
    const assignmentAfterReload = await page.getByText(${JSON.stringify(memberName)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${asset}`)} }).click();
    await page.getByText('Asset Still Assigned', { exact: true }).waitFor({ timeout: 10000 });
    const blockedDelete = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await page.getByRole('button', { name: new RegExp('Return ' + ${JSON.stringify(asset)} + ' from', 'i') }).click();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    const availableAfterReturn = await page.locator('div').filter({ hasText: /^Available3$/ }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${asset}`)} }).click();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    return {
      rejectedOverAssignment,
      assignmentAfterReload,
      blockedDelete,
      availableAfterReturn,
      deletedAfterReload: await page.getByText(${JSON.stringify(asset)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runEquipmentWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `equipment-owner-${process.pid}`);
  const first = browserEquipmentCreateEdit(owner, marker);
  expectEqual(first.createdAfterReload, 1, 'equipment create persists after reload');
  expectEqual(first.hiddenBySearch === 0 && first.foundBySearch === 1, true, 'equipment search filters inventory');
  expectEqual(first.editedAfterReload, 1, 'equipment edit persists after reload');
  expectEqual(first.consoleErrors.length, 0, 'equipment create/edit console errors');
  expectEqual(first.failedResponses.length, 0, 'equipment create/edit failed responses');
  const second = browserEquipmentAssignReturnDelete(owner, marker);
  expectEqual(second.rejectedOverAssignment, 1, 'equipment rejects over-assignment');
  expectEqual(second.assignmentAfterReload, 1, 'equipment assignment persists after reload');
  expectEqual(second.blockedDelete, 1, 'assigned equipment deletion is blocked');
  expectEqual(second.availableAfterReturn > 0, true, 'equipment return restores availability');
  expectEqual(second.deletedAfterReload, 0, 'equipment delete persists after reload');
  expectEqual(second.consoleErrors.length, 0, 'equipment assignment workflow console errors');
  expectEqual(second.failedResponses.length, 0, 'equipment assignment workflow failed responses');
}

async function runChatProbeAudit() {
  const member = await browserLogin('qa-team-member', '/dashboard', `chat-probe-${process.pid}`);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push({ status: response.status(), url: response.url() }); });
    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    const input = page.getByPlaceholder('Tactical update...');
    const ready = await input.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    return {
      ready,
      pathname: await page.evaluate(() => window.location.pathname),
      body: (await page.locator('body').innerText()).slice(0, 1500),
      consoleErrors,
      failedResponses,
    };
  }`;
  const result = JSON.parse(cli(member, ['run-code', code]));
  if (!result.ready) console.log(`chat probe diagnostic: ${JSON.stringify(result)}`);
  expectEqual(result.ready, true, 'seeded member chat detail loads');
}

function browserScheduleAppAudit(session) {
  const code = `async page => {
    const onlineConsoleErrors = [];
    const offlineConsoleErrors = [];
    let offlinePhase = false;
    const recordConsoleError = text => (offlinePhase ? offlineConsoleErrors : onlineConsoleErrors).push(text);
    page.on('console', message => { if (message.type() === 'error') recordConsoleError(message.text()); });
    page.on('pageerror', error => recordConsoleError(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/schedule-app`)});
    await page.getByRole('heading', { name: 'My Schedule' }).waitFor();
    await page.getByText(/Live ·/).waitFor({ timeout: 10000 });
    const teamAEvent = await page.getByText(/FALCON-A Future Practice/).count();
    const leakedTeamBEvent = await page.getByText(/BLUEBIRD-B Future Practice/).count();

    await page.evaluate(() => {
      localStorage.setItem('squad_schedule_todos', JSON.stringify([{ id: 'legacy-secret', text: 'LEGACY PROFILE SECRET', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]));
      localStorage.setItem('squad_schedule_v2:user:qa-adult-player-a:todos', '{broken');
      localStorage.setItem('squad_schedule_v2:user:qa-adult-player-b:todos', JSON.stringify([{ id: 'other-secret', text: 'OTHER PROFILE SECRET', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]));
    });
    await page.reload();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    const corruptionRecovered = await page.getByText('All Clear', { exact: true }).count();
    const legacyLeak = await page.getByText('LEGACY PROFILE SECRET', { exact: true }).count();
    const otherProfileLeak = await page.getByText('OTHER PROFILE SECRET', { exact: true }).count();

    await page.getByRole('button', { name: 'Add Task' }).click();
    await page.getByPlaceholder('What needs to get done?').fill('Bring audit cones');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('squad_schedule_v2:user:qa-adult-player-a:todos');
      return typeof raw === 'string' && raw.includes('Bring audit cones');
    });
    await page.reload();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    const persistedTodo = await page.getByText('Bring audit cones', { exact: true }).count();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const serviceWorkerState = await page.evaluate(async () => ({
      scheduleShellCached: Boolean(await caches.match('/schedule-app')),
      controller: navigator.serviceWorker.controller?.scriptURL || '',
      registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
        active: registration.active?.scriptURL || '',
        installing: registration.installing?.scriptURL || '',
        waiting: registration.waiting?.scriptURL || '',
      })),
      cacheNames: await caches.keys(),
    }));
    if (!serviceWorkerState.scheduleShellCached) {
      throw new Error('schedule shell cache diagnostic: ' + JSON.stringify(serviceWorkerState));
    }
    const scheduleShellCached = serviceWorkerState.scheduleShellCached;
    offlinePhase = true;
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'My Schedule' }).waitFor({ timeout: 10000 })
      .catch(() => { throw new Error('offline schedule shell did not render'); });
    await page.getByRole('button', { name: /To-Do List/ }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    const offlineTodo = await page.getByText('Bring audit cones', { exact: true }).count();
    await page.context().setOffline(false);
    await page.waitForTimeout(250);
    offlinePhase = false;

    await page.goto(${JSON.stringify(`${BASE_URL}/settings`)});
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 })
      .catch(() => { throw new Error('profile switch did not reach login: ' + page.url()); });
    await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-adult-player-b'))});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(5000);
    if (await page.evaluate(() => window.location.pathname) === '/login') {
      throw new Error('Team B login remained unauthenticated: ' + JSON.stringify({
        url: page.url(),
        loginFailed: await page.getByText('Login Failed', { exact: true }).count(),
        sessionFailed: await page.getByText('Session Setup Failed', { exact: true }).count(),
      }));
    }
    await page.goto(${JSON.stringify(`${BASE_URL}/schedule-app`)});
    await page.getByText(/Live ·/).waitFor({ timeout: 10000 });
    const teamBEvent = await page.getByText(/BLUEBIRD-B Future Practice/).count();
    const switchedTeamALeak = await page.getByText(/FALCON-A Future Practice/).count();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    const switchedTodoLeak = await page.getByText('Bring audit cones', { exact: true }).count();

    return {
      teamAEvent,
      leakedTeamBEvent,
      corruptionRecovered,
      legacyLeak,
      otherProfileLeak,
      persistedTodo,
      mobileFits,
      scheduleShellCached,
      offlineTodo,
      teamBEvent,
      switchedTeamALeak,
      switchedTodoLeak,
      onlineConsoleErrors,
      offlineConsoleErrors,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
}

function assertScheduleAppAudit(result) {
  // Chromium can deliver this native registration error after connectivity is
  // restored even though the update request began during the offline interval.
  const unexpectedOnlineErrors = result.onlineConsoleErrors.filter(message =>
    message !== 'A bad HTTP response code (404) was received when fetching the script.'
  );
  if (unexpectedOnlineErrors.length > 0) {
    console.log(`Schedule companion unexpected online console errors: ${JSON.stringify(unexpectedOnlineErrors)}`);
  }
  const unexpectedOfflineErrors = result.offlineConsoleErrors.filter(message =>
    !/ERR_INTERNET_DISCONNECTED|webpack-hmr|Failed to fetch|bad HTTP response code \(404\)/.test(message)
  );
  if (unexpectedOfflineErrors.length > 0) {
    console.log(`Schedule companion unexpected offline console errors: ${JSON.stringify(unexpectedOfflineErrors)}`);
  }
  expectEqual(result.teamAEvent, 1, 'schedule companion loads current Team A event');
  expectEqual(result.leakedTeamBEvent, 0, 'schedule companion hides Team B event from Team A user');
  expectEqual(result.corruptionRecovered, 1, 'schedule companion recovers from corrupt todo storage');
  expectEqual(result.legacyLeak, 0, 'schedule companion ignores unscoped legacy todo data');
  expectEqual(result.otherProfileLeak, 0, 'schedule companion ignores another profile todo data');
  expectEqual(result.persistedTodo, 1, 'schedule companion todo CRUD persists after reload');
  expectEqual(result.mobileFits, true, 'schedule companion fits mobile viewport');
  expectEqual(result.scheduleShellCached, true, 'schedule companion shell is present in service-worker cache');
  expectEqual(result.offlineTodo, 1, 'schedule companion shell and todos reload offline');
  expectEqual(result.teamBEvent, 1, 'schedule companion switches to current Team B event');
  expectEqual(result.switchedTeamALeak, 0, 'schedule companion removes Team A events after profile switch');
  expectEqual(result.switchedTodoLeak, 0, 'schedule companion removes Team A todos after profile switch');
  expectEqual(unexpectedOnlineErrors.length, 0, 'schedule companion unexpected online console errors');
  expectEqual(unexpectedOfflineErrors.length, 0, 'schedule companion unexpected offline console errors');
}

function browserTeamSwitchAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
    const priorityAlert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
    if (await priorityAlert.count()) {
      await priorityAlert.getByRole('button', { name: 'Got It' }).click();
      await priorityAlert.waitFor({ state: 'hidden' });
    }
    await page.getByText('FALCON-A Future Practice', { exact: true }).waitFor();
    const initialTeamBLeak = await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).count();

    const switchDesktop = async teamId => {
      const clickVisibleTeam = id => page.evaluate(teamId => {
        const row = Array.from(document.querySelectorAll('button[data-team-switch-id="' + teamId + '"]'))
          .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
        if (!row) return false;
        row.click();
        return true;
      }, id);
      if (await clickVisibleTeam(teamId)) return;
      const trigger = page.locator('button[data-testid="squad-switcher-trigger"]:visible').first();
      await trigger.click();
      await page.waitForFunction(id => Array.from(document.querySelectorAll('button[data-team-switch-id="' + id + '"]'))
        .some(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }), teamId);
      if (!await clickVisibleTeam(teamId)) throw new Error('visible team row disappeared before selection: ' + teamId);
    };
    await switchDesktop('qa-team-b');
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('FALCON-A Future Practice'));
    const teamAAfterSwitch = await page.getByText('FALCON-A Future Practice', { exact: true }).count();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await switchDesktop('qa-team-a');
      await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
      await switchDesktop('qa-team-b');
      await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    }
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    const selectedAfterRapidSwitch = await page.evaluate(() => localStorage.getItem('sf_session_team_id'));

    await page.reload();
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    const teamAAfterReload = await page.getByText('FALCON-A Future Practice', { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar' }).waitFor();
    await page.goBack();
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    const selectedAfterBack = await page.evaluate(() => localStorage.getItem('sf_session_team_id'));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[data-testid="squad-switcher-trigger"]:visible').first().click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('button[data-team-switch-id="qa-team-a"]'))
        .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
      if (!row) throw new Error('mobile Team A switch row is not visible');
      row.click();
    });
    await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
    await page.getByText('FALCON-A Future Practice', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('BLUEBIRD-B Future Practice'));
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    return {
      initialTeamBLeak,
      teamAAfterSwitch,
      selectedAfterRapidSwitch,
      teamAAfterReload,
      selectedAfterBack,
      mobileFits,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertTeamSwitchAudit(result) {
  if (result.consoleErrors.length > 0) console.log(`Team switch console errors: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`Team switch failed responses: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(result.initialTeamBLeak, 0, 'active Team A view excludes Team B event');
  expectEqual(result.teamAAfterSwitch, 0, 'active Team B view removes Team A event');
  expectEqual(result.selectedAfterRapidSwitch, 'qa-team-b', 'rapid switching settles on requested team');
  expectEqual(result.teamAAfterReload, 0, 'Team B selection persists without Team A event after reload');
  expectEqual(result.selectedAfterBack, 'qa-team-b', 'Team B selection survives navigation back');
  expectEqual(result.mobileFits, true, 'active-team switcher fits mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'active-team switching browser console errors');
  expectEqual(result.failedResponses.length, 0, 'active-team switching failed responses');
}

function browserAlertsAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    const receivedTitles = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const appeared = await alert.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false);
      if (!appeared) break;
      receivedTitles.push((await alert.locator('h2:not(.sr-only)').textContent()) || '');
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }

    const alertButton = page.getByRole('button', { name: /^Open alerts/ });
    const alertButtonName = await alertButton.getAttribute('aria-label');
    await alertButton.click();
    const inbox = page.getByRole('dialog', { name: 'Squad Alert Inbox' });
    await inbox.waitFor();
    await inbox.getByRole('button', { name: 'Show History' }).click();
    const historyEveryone = await inbox.getByText('FALCON-A Everyone Alert', { exact: true }).count();
    const historyPlayer = await inbox.getByText('FALCON-A Player Alert', { exact: true }).count();
    const wrongCoach = await inbox.getByText('FALCON-A Coach Alert', { exact: true }).count();
    const wrongParent = await inbox.getByText('FALCON-A Parent Alert', { exact: true }).count();
    const otherTenant = await inbox.getByText('BLUEBIRD-B Everyone Alert', { exact: true }).count();
    await inbox.getByRole('button', { name: 'Close' }).click();

    await page.reload();
    const reopened = await page.getByRole('dialog', { name: 'High Priority Team Alert' })
      .waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /^Open alerts/ }).click();
    const mobileInbox = page.getByRole('dialog', { name: 'Squad Alert Inbox' });
    await mobileInbox.waitFor();
    const mobileBox = await mobileInbox.boundingBox();
    const mobileFits = Boolean(mobileBox && mobileBox.x >= -0.5 && mobileBox.y >= -0.5 && mobileBox.x + mobileBox.width <= 390.5 && mobileBox.y + mobileBox.height <= 844.5);

    return {
      receivedTitles,
      alertButtonName,
      historyEveryone,
      historyPlayer,
      wrongCoach,
      wrongParent,
      otherTenant,
      reopened,
      mobileFits,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertAlertsAudit(result) {
  expectEqual(result.receivedTitles.length, 2, 'adult player receives exactly two eligible alerts');
  expectEqual(result.receivedTitles.includes('FALCON-A Everyone Alert'), true, 'everyone alert reaches adult player');
  expectEqual(result.receivedTitles.includes('FALCON-A Player Alert'), true, 'player alert reaches adult player');
  expectEqual(result.alertButtonName, 'Open alerts', 'unread alert count clears after acknowledgement');
  expectEqual(result.historyEveryone, 1, 'acknowledged everyone alert appears once in history');
  expectEqual(result.historyPlayer, 1, 'acknowledged player alert appears once in history');
  expectEqual(result.wrongCoach, 0, 'coach-only alert is hidden from player');
  expectEqual(result.wrongParent, 0, 'parent-only alert is hidden from player');
  expectEqual(result.otherTenant, 0, 'other-tenant alert is hidden from player');
  expectEqual(result.reopened, false, 'acknowledged alerts stay cleared after reload');
  expectEqual(result.mobileFits, true, 'alert history fits mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'alert lifecycle browser console errors');
  expectEqual(result.failedResponses.length, 0, 'alert lifecycle failed responses');
}

async function runApiAudit() {
  const tokens = new Map();
  const { teamAId, teamBId } = buildIdentityApiTargets(FIXTURES);
  for (const alias of FIXTURES.activeAliases) {
    const result = await signIn(alias);
    expectEqual(result.status, 200, `${alias} emulator sign-in`);
    tokens.set(alias, result.body.idToken);
  }

  for (const blockedIdentity of BLOCKED_AUDIT_PLAN.api) {
    const result = await signIn(blockedIdentity.alias);
    expectEqual(result.status, blockedIdentity.signInStatus, `${blockedIdentity.alias} blocked sign-in expectation`);
    if (blockedIdentity.authError) {
      expectEqual(result.body?.error?.message, blockedIdentity.authError, `${blockedIdentity.alias} blocked Auth error`);
    }
    if (blockedIdentity.signInStatus === 200) tokens.set(blockedIdentity.alias, result.body.idToken);
    if (blockedIdentity.sessionStatus) {
      expectEqual(
        await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }),
        blockedIdentity.sessionStatus,
        blockedIdentity.alias === 'qa-pending-delete'
          ? 'pending-delete blocked session creation'
          : `${blockedIdentity.alias} blocked session creation`,
      );
    }
  }

  for (const alias of FIXTURES.activeAliases) {
    const fixture = identityByAlias.get(alias);
    expectEqual(
      await apiStatus('/api/auth/session', tokens.get(alias), { method: 'POST' }),
      200,
      `${alias} active session for ${fixture.expectedLanding}`,
    );
  }

  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-coach-owner-a')),
    200,
    'Team A owner reads Team A chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamBId}`, tokens.get('qa-coach-owner-a')),
    403,
    'Team A owner denied Team B chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-coach-owner-b')),
    403,
    'Team B owner denied Team A chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-removed-member')),
    403,
    'removed member denied former team context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-pending-delete')),
    403,
    'deletion-pending account denied server API',
  );
  expectEqual(
    await apiStatus('/api/admin/newsletter', tokens.get('qa-fake-superadmin')),
    403,
    'profile-only fake superadmin denied admin API',
  );
  expectEqual(
    await apiStatus('/api/admin/newsletter', tokens.get('qa-superadmin')),
    200,
    'claim-controlled superadmin reaches admin API',
  );

  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  const proTeam = FIXTURES.teams.find(team => team.alias === 'qa-pro-team');
  const schoolSquad = FIXTURES.teams.find(team => team.alias === 'qa-school-squad-1');
  const tournament = FIXTURES.tournaments.find(value => value.alias === 'qa-tournament-a');
  const volunteerA = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-volunteer-opportunity-a');
  const volunteerB = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-volunteer-opportunity-b');
  const fundraiserA = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-fundraiser-a');
  const fundraiserB = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-fundraiser-b');

  expectEqual(
    (await fetch(`${BASE_URL}/api/public/tournaments/${teamA.id}/${tournament.id}`)).status,
    200,
    'seeded tournament reader returns published bracket',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/volunteer?teamId=${teamA.id}&oppId=${volunteerA.path.split('/').at(-1)}`)).status,
    200,
    'published volunteer public GET',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/volunteer?teamId=${teamB.id}&oppId=${volunteerB.path.split('/').at(-1)}`)).status,
    404,
    'unpublished volunteer public GET denial',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/fundraising?teamId=${teamA.id}&fundId=${fundraiserA.path.split('/').at(-1)}`)).status,
    200,
    'published fundraiser public GET',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/fundraising?teamId=${teamB.id}&fundId=${fundraiserB.path.split('/').at(-1)}`)).status,
    404,
    'unpublished fundraiser public GET denial',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-pro-owner').uid}&teamId=${proTeam.id}`, tokens.get('qa-pro-owner')),
    200,
    'active local entitlement reaches Connect status without provider call',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-school-delegate').uid}&teamId=${schoolSquad.id}`, tokens.get('qa-school-delegate')),
    200,
    'school delegate reaches hub-backed entitlement',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-coach-owner-b').uid}&teamId=${schoolSquad.id}`, tokens.get('qa-coach-owner-b')),
    403,
    'school outsider denied hub-backed entitlement',
  );

  const publicObject = FIXTURES.storageObjects.find(object => object.access === 'public' && object.lifecycle === 'present');
  const allowedObject = FIXTURES.storageObjects.find(object => object.case === 'allowed');
  const privateObject = FIXTURES.storageObjects.find(object => object.case === 'private');
  const pendingObject = FIXTURES.storageObjects.find(object => object.case === 'pending-delete');
  const deletedObject = FIXTURES.storageObjects.find(object => object.lifecycle === 'delete-after-write');
  const publicResponse = await fetch(storageObjectUrl(publicObject.path));
  expectEqual(publicResponse.status, 200, 'public Storage object is anonymously readable');
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await publicResponse.arrayBuffer()))).detectedMime,
    'image/jpeg',
    'persisted public Storage object decodes as JPEG',
  );
  const allowedResponse = await fetch(storageObjectUrl(allowedObject.path), {
    headers: { Authorization: `Bearer ${tokens.get('qa-adult-player-a')}` },
  });
  expectEqual(allowedResponse.status, 200, 'allowed Storage object is readable by its owner');
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await allowedResponse.arrayBuffer()))).detectedMime,
    'image/png',
    'persisted allowed Storage object decodes as PNG',
  );
  const privateResponse = await fetch(storageObjectUrl(privateObject.path), {
    headers: { Authorization: `Bearer ${tokens.get('qa-adult-player-a')}` },
  });
  expectEqual(
    privateResponse.status,
    200,
    'private Storage object is readable by its owner',
  );
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await privateResponse.arrayBuffer()))).detectedMime,
    'video/mp4',
    'persisted private Storage object has playable MP4 metadata',
  );
  expectEqual(
    (await fetch(storageObjectUrl(privateObject.path), { headers: { Authorization: `Bearer ${tokens.get('qa-coach-owner-b')}` } })).status,
    403,
    'private Storage object rejects cross-tenant reader',
  );
  expectEqual(
    (await fetch(storageObjectUrl(pendingObject.path), { headers: { Authorization: `Bearer ${tokens.get('qa-pending-delete')}` } })).status,
    403,
    'pending-delete Storage object is denied',
  );
  expectEqual((await fetch(storageObjectUrl(deletedObject.path))).status, 404, 'deleted Storage lifecycle object is absent');
}

async function runBrowserAudit() {
  if (!playwrightCli) throw new Error('PLAYWRIGHT_CLI is required with --browser.');
  if (certificationIdentity) {
    await runIdentityBrowserAudit();
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (workflowChatProbeOnly) {
    await runChatProbeAudit();
    return;
  }
  if (workflowEventsOnly) {
    await runEventWorkflowAudit();
    return;
  }
  if (workflowFacilitiesOnly) {
    await runFacilityWorkflowAudit();
    return;
  }
  if (workflowEquipmentOnly) {
    await runEquipmentWorkflowAudit();
    return;
  }
  if (workflowCommunicationOnly) {
    await runCommunicationWorkflowAudit();
    return;
  }
  if (tournamentDenialOnly) {
    const member = await browserLogin('qa-team-member', '/dashboard', `tournament-denial-${process.pid}`);
    assertSurfaceSweep(browserSurfaceSweep(member, [
      { path: '/tournaments', expected: ['/manage-tournaments', '/dashboard'], expectRestrictedOn: '/manage-tournaments', waitForPathChange: true },
    ], { mobile: true }), 'member tournament route denial');
    return;
  }
  if (parentAdminSurfaceOnly) {
    await runSurfaceSmokeAudit({ remainderOnly: true, includeMember: false });
    return;
  }
  if (surfaceRemainderOnly) {
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (surfaceSmokeOnly) {
    await runSurfaceSmokeAudit();
    return;
  }
  if (deletionLoginOnly) {
    browserLoginFailureAudit('qa-pending-delete', password, '/login', 'Session Setup Failed', 'deletion-pending login is denied');
    return;
  }
  if (identityStateOnly) {
    runIdentityStateBrowserAudit();
    return;
  }
  if (identityOnly) {
    await runIdentityBrowserAudit();
    return;
  }
  if (scheduleAppOnly) {
    const player = await browserLogin('qa-adult-player-a', '/dashboard', `schedule-app-player-${process.pid}`);
    assertScheduleAppAudit(browserScheduleAppAudit(player));
    return;
  }
  if (teamSwitchOnly) {
    const multiTeam = await browserLogin('qa-multi-org', '/dashboard', `team-switch-${process.pid}`);
    assertTeamSwitchAudit(browserTeamSwitchAudit(multiTeam));
    return;
  }
  if (alertsOnly) {
    const player = await browserLogin('qa-adult-player-a', '/dashboard', `alerts-${process.pid}`);
    assertAlertsAudit(browserAlertsAudit(player));
    return;
  }
  const trusted = await browserLogin('qa-superadmin', '/admin');
  const fake = await browserLogin('qa-fake-superadmin', '/dashboard');
  const parent = await browserLogin('qa-parent-a', '/family');
  const player = await browserLogin('qa-adult-player-a', '/dashboard');

  expectEqual(browserPath(trusted, '/admin'), '/admin', 'trusted superadmin browser route');
  expectEqual(browserPath(fake, '/admin'), '/dashboard', 'fake superadmin browser route denial');
  expectEqual(browserPath(parent, '/family'), '/family', 'parent family browser route');
  expectEqual(browserPath(player, '/family'), '/dashboard', 'adult player family browser route denial');

  const alreadyCovered = new Set([
    'qa-superadmin', 'qa-fake-superadmin', 'qa-parent-a', 'qa-adult-player-a',
  ]);
  for (const alias of FIXTURES.activeAliases.filter(value => !alreadyCovered.has(value))) {
    const fixture = identityByAlias.get(alias);
    await browserLogin(alias, fixture.expectedLanding, `catalog-${alias}-${process.pid}`);
  }

  for (const blockedIdentity of BLOCKED_AUDIT_PLAN.browser) {
    browserLoginFailureAudit(blockedIdentity.alias,
      password,
      blockedIdentity.browserPath,
      blockedIdentity.browserTitle,
      `catalog-blocked-${blockedIdentity.alias}`,
    );
  }
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  let dynamicCleanup = {
    state: 'OBSERVED', counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 },
    reconciled: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, selectors: [], residuals: [], diagnostics: [],
  };
  if (runBrowser && playwrightCli) {
    try {
      await closeOwnedBrowserSessions(ownedBrowserSessions, async session => {
        run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
      });
    } catch (error) {
      console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    } finally {
      syncBrowserSessionRegistry();
    }
  }
  try {
    const finalDynamicCleanup = await dynamicResourceRegistry.cleanup();
    dynamicCleanup = mergeResourceCleanupResults([...completedDynamicCleanupRuns, finalDynamicCleanup]);
    if (dynamicCleanup.state !== 'OBSERVED') {
      console.error(`Dynamic cleanup retained ${dynamicCleanup.residuals.length} owned resource(s).`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(redact(error instanceof Error ? error.message : error));
    dynamicCleanup = { ...dynamicCleanup, state: 'FAIL', diagnostics: [{ diagnostic: 'dynamic cleanup execution failed' }] };
    process.exitCode = 1;
  }
  if (fixturesSeeded) {
    try {
      const cleanupOutput = run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs', '--cleanup-only']);
      expectEqual(
        cleanupOutput.includes(`Cleaned exact Auth, Firestore, and Storage selectors for ${FIXTURES.runId}.`),
        true,
        'post-cleanup Storage object is absent',
      );
      const measuredLine = cleanupOutput.split(/\r?\n/).find(line => line.startsWith('FIXTURE_CLEANUP_RESULT '));
      if (!measuredLine) throw new Error('Fixture cleanup did not return measured operation counts.');
      const measuredCleanup = JSON.parse(measuredLine.slice('FIXTURE_CLEANUP_RESULT '.length));
      const cleanupCounts = {
        deleted: measuredCleanup.counts.deleted + dynamicCleanup.counts.deleted,
        restored: measuredCleanup.counts.restored + dynamicCleanup.counts.restored,
        retainedAuditRecords: measuredCleanup.counts.retainedAuditRecords + dynamicCleanup.counts.retainedAuditRecords,
      };
      const cleanupState = dynamicCleanup.state === 'OBSERVED' ? 'OBSERVED' : 'FAIL';
      mkdirSync(path.join(certificationArtifactDir, 'cleanup'), { recursive: true });
      writeFileSync(path.join(certificationArtifactDir, 'cleanup/fixture-cleanup-marker.json'), `${JSON.stringify(sanitizeCertificationArtifact({
        runId: certificationRunId,
        commit: certificationCommit,
        fixtureRunId: FIXTURES.runId,
        state: cleanupState,
        counts: cleanupCounts,
        measured: { fixture: measuredCleanup.measured, dynamic: dynamicCleanup },
        capturedAt: new Date().toISOString(),
      }), null, 2)}\n`, { mode: 0o600 });
      emitCertificationEvent({
        type: 'cleanup',
        runId: certificationRunId,
        commit: certificationCommit,
        cleanupId: `fixture-cleanup-${FIXTURES.runId}`,
        selectors: [
          `auth:${FIXTURES.cleanupSelectors.auth.uids.length}-exact-uids`,
          `firestore:${FIXTURES.cleanupSelectors.firestore.recursiveRoots.length}-exact-roots`,
          `storage:${FIXTURES.cleanupSelectors.storage.objectPaths.length}-exact-paths`,
          ...dynamicCleanup.selectors,
        ],
        counts: cleanupCounts,
        state: cleanupState,
        proof: ['cleanup/fixture-cleanup-marker.json'],
      });
    } catch (error) {
      console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    }
  }
  await Promise.all(children.reverse().map(child => terminateOwnedChildAndWait(child)));
}

async function main() {
  await import('node:fs/promises').then(fs => fs.mkdir(logDir, { recursive: true }));
  process.once('SIGINT', () => shutdownState.request(130));
  process.once('SIGTERM', () => shutdownState.request(143));

  startProcess('npx', ['firebase', '--project', PROJECT_ID, 'emulators:start', '--only', 'auth,firestore,storage'], 'firebase.log');
  await Promise.all([waitForPort(9099), waitForPort(8080), waitForPort(9199)]);
  run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs']);
  fixturesSeeded = true;

  startProcess('npm', ['run', 'dev'], 'next.log');
  await waitForHttp(`${BASE_URL}/login`);

  if (certificationIdentity) {
    await runCertificationIdentityScenarios();
  } else {
    if (!scheduleAppOnly && !teamSwitchOnly && !alertsOnly && !identityOnly && !identityStateOnly && !deletionLoginOnly && !surfaceSmokeOnly && !surfaceRemainderOnly && !tournamentDenialOnly && !parentAdminSurfaceOnly && !workflowCommunicationOnly && !workflowChatProbeOnly && !workflowEventsOnly && !workflowFacilitiesOnly && !workflowEquipmentOnly) await runApiAudit();
    if (runBrowser) await runBrowserAudit();
  }
  console.log(`Phase 2 emulator audit completed${runBrowser ? ' with browser routes' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(error => {
      if (shutdownState.exitCode === null) console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = shutdownState.exitCode || 1;
    })
    .finally(cleanup);
}
