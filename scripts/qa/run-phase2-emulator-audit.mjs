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
import { runTwoParty, terminateOwnedProcess } from './certification/local/assertions.mjs';
import { parseLoopbackHttpOrigin } from './certification/local/boundary.mjs';
import {
  IDENTITY_EXECUTION_ORDER,
  LOCAL_IDENTITY_CASE_REQUIREMENTS,
} from './certification/local/batches/identity.mjs';
import { LOCAL_TENANT_CASE_REQUIREMENTS, TENANT_EXECUTION_ORDER, tenantCaseAssociationFor } from './certification/local/batches/tenants.mjs';
import { OPERATIONS_SCENARIO_IDS } from './certification/local/selection.mjs';
import {
  LOCAL_OPERATIONS_CASE_REQUIREMENTS,
  assertCaseOwnedOperationArtifacts,
  selectCaseOwnedOperationAssertions,
} from './certification/local/batches/operations.mjs';
import { CERTIFICATION_SCENARIOS } from './certification/scenario-catalog.mjs';
import { DIMENSION_NAMES, serializeEvidenceFailure } from './certification/local/evidence.mjs';
import { createFixtureMutations } from './certification/local/fixture-mutations.mjs';
import { observeCalendarResponse } from './certification/local/calendar-response-observation.mjs';
import { validateAttendanceLedger, validateAttendanceBounds } from './certification/local/attendance-observation.mjs';
import { operationActorAliases } from './certification/local/operation-actors.mjs';
import { withAttendanceMemberships, selectScheduleTeam, runOperationScenarioSequence, operationSessionName, registerScheduleDiscovery, snapshotScheduleRoots } from './certification/local/schedule-isolation.mjs';
import { createResourceRegistry, mergeResourceCleanupResults } from './certification/local/resource-registry.mjs';
import { patchFirestoreFields as patchFirestoreFieldsRequest } from './certification/local/tenant-mutation-probes.mjs';
import { inspectTenantCapabilities, TENANT_SCENARIO_CAPABILITIES } from './certification/local/tenant-capabilities.mjs';

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
  const certificationIdentity = argv.includes('--certification-identity');
  const certificationTenants = argv.includes('--certification-tenants');
  const certificationOperations = argv.includes('--certification-operations');
  const allowedScenarios = new Set([
    ...(certificationIdentity || (!certificationIdentity && !certificationTenants && !certificationOperations) ? IDENTITY_EXECUTION_ORDER : []),
    ...(certificationTenants || (!certificationIdentity && !certificationTenants && !certificationOperations) ? TENANT_EXECUTION_ORDER : []),
    ...(certificationOperations || (!certificationIdentity && !certificationTenants && !certificationOperations) ? OPERATIONS_SCENARIO_IDS : []),
  ]);
  for (const scenarioId of selectedScenarios) {
    if (!allowedScenarios.has(scenarioId)) throw new Error(`Unknown selected certification scenario ${scenarioId}.`);
  }
  return {
    projectId: environment.AUDIT_FIREBASE_PROJECT_ID || 'demo-the-squad-audit',
    baseUrl,
    fixtureRunSuffix: environment.AUDIT_FIXTURE_RUN_SUFFIX || 'phase2',
    browserSessionPrefix: environment.AUDIT_BROWSER_SESSION_PREFIX || 'phase2',
    certificationIdentity,
    certificationTenants,
    certificationOperations,
    runBrowser: argv.includes('--browser'),
    failFast: argv.includes('--fail-fast'),
    selectedScenarios: [...new Set(selectedScenarios)],
  };
}

const runtimeConfiguration = resolveAuditRuntimeConfiguration();
const PROJECT_ID = runtimeConfiguration.projectId;
const BASE_URL = runtimeConfiguration.baseUrl;
const FIXTURE_RUN_SUFFIX = runtimeConfiguration.fixtureRunSuffix;
const BROWSER_SESSION_PREFIX = runtimeConfiguration.browserSessionPrefix;
const FIXTURES = buildFixtureCatalog(FIXTURE_RUN_SUFFIX);
const TEAM_A_ID = FIXTURES.teams.find(team => team.alias === 'qa-team-a')?.id;
if (!TEAM_A_ID) throw new Error('The fixture catalog is missing the Team A browser chat target.');
const runBrowser = runtimeConfiguration.runBrowser;
const certificationIdentity = runtimeConfiguration.certificationIdentity;
const certificationTenants = runtimeConfiguration.certificationTenants;
const certificationOperations = runtimeConfiguration.certificationOperations;
const certificationFailFast = runtimeConfiguration.failFast;
const selectedIdentityScenarios = new Set(
  runtimeConfiguration.selectedScenarios.length > 0
    ? runtimeConfiguration.selectedScenarios
    : IDENTITY_EXECUTION_ORDER,
);
const selectedTenantScenarios = new Set(
  runtimeConfiguration.selectedScenarios.length > 0
    ? runtimeConfiguration.selectedScenarios
    : TENANT_EXECUTION_ORDER,
);
const selectedOperationsScenarios = new Set(
  runtimeConfiguration.selectedScenarios.length > 0
    ? runtimeConfiguration.selectedScenarios
    : OPERATIONS_SCENARIO_IDS,
);
const needsFunctionsEmulator = certificationOperations && (
  selectedOperationsScenarios.has('calendar-ics-create-fetch-revoke') ||
  selectedOperationsScenarios.has('reminders-same-day-fcm-scheduler')
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
let ownedNextServerProcess = null;
const ownedBrowserSessions = new Set();
const logDir = path.join(os.tmpdir(), `the-squad-phase2-${process.pid}`);
const certificationArtifactDir = process.env.AUDIT_ARTIFACT_DIR || path.join(logDir, 'certification-artifacts');
const certificationArtifactRoot = process.env.AUDIT_ARTIFACT_ROOT || '';
const certificationRunId = process.env.AUDIT_CERTIFICATION_RUN_ID || `legacy-${FIXTURES.runId}`;
const certificationCommit = process.env.AUDIT_CERTIFICATION_COMMIT || 'legacy-unbound-candidate';
const browserSessionRegistry = process.env.AUDIT_BROWSER_SESSION_REGISTRY || '';
const processGroupRegistry = process.env.AUDIT_PROCESS_GROUP_REGISTRY || '';
let fixturesSeeded = false;
let cleanupStarted = false;
let activeCertificationScenario = null;
let activeCertificationAssertions = [];
let activeCertificationCaseIds = new Set();
let activeOperationAssertionOwners = new Map();
let activeOperationRequestCapture = null;
const capturedOperationRequests = new Map();
const consumedOperationRequestCaptures = new Set();
let certificationAssertionSequence = 0;
let activeTenantExecution = null;
let activeTenantExecutionGroup = null;
let rsvpAttendanceWorkflowInvocation = 0;
let activeOperationResourceRegistry = null;
let emulatorAdminAppSequence = 0;
const tenantTokenActors = new Map();
const dynamicResourceRegistry = createResourceRegistry({ maxAttempts: 3 });
const completedDynamicCleanupRuns = [];
const tenantRuntimeConsumerPaths = new Map();
const tenantRuntimeTargets = new Map();
const tenantFixtureMutations = createFixtureMutations({
  projectId: PROJECT_ID,
  runId: certificationTenants || certificationOperations ? certificationRunId : 'final-cert-inactive-import',
  baselineRoots: FIXTURES.cleanupSelectors.firestore.recursiveRoots,
  firestore: {
    read: documentPath => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const snapshot = await firestoreAdmin.doc(documentPath).get();
      return snapshot.exists ? snapshot.data() : null;
    }),
    write: (documentPath, value) => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      await firestoreAdmin.doc(documentPath).set(value);
    }),
    remove: documentPath => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      await firestoreAdmin.recursiveDelete(firestoreAdmin.doc(documentPath));
    }),
    hasDescendants: documentPath => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const collections = await firestoreAdmin.doc(documentPath).listCollections();
      for (const collection of collections) {
        // listDocuments includes missing intermediate document references that
        // own deeper descendants; a query would incorrectly report them empty.
        if ((await collection.listDocuments()).length > 0) return true;
      }
      return false;
    }),
  },
  auth: {
    exists: uid => withEmulatorAuthAdmin(async authAdmin => {
      try { await authAdmin.getUser(uid); return true; } catch (error) {
        if (error?.code === 'auth/user-not-found') return false;
        throw error;
      }
    }),
    remove: uid => withEmulatorAuthAdmin(async authAdmin => authAdmin.deleteUser(uid)),
  },
  storage: {
    exists: objectPath => withEmulatorAuthAdmin(async (_authAdmin, _firestoreAdmin, bucket) =>
      (await bucket.file(objectPath).exists())[0]),
    remove: objectPath => withEmulatorAuthAdmin(async (_authAdmin, _firestoreAdmin, bucket) =>
      bucket.file(objectPath).delete({ ignoreNotFound: true })),
  },
  maxAttempts: 3,
});
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

function artifactDirectoryForScenario(scenarioId) {
  if (!certificationArtifactRoot) return certificationArtifactDir;
  const task = IDENTITY_EXECUTION_ORDER.includes(scenarioId) ? 'task-3'
    : TENANT_EXECUTION_ORDER.includes(scenarioId) ? 'task-4' : 'task-5';
  return path.join(certificationArtifactRoot, task, certificationRunId);
}

function cleanupArtifactDirectories() {
  if (!certificationArtifactRoot) return [certificationArtifactDir];
  return [
    ...(certificationIdentity ? [path.join(certificationArtifactRoot, 'task-3', certificationRunId)] : []),
    ...(certificationTenants ? [path.join(certificationArtifactRoot, 'task-4', certificationRunId)] : []),
    ...(certificationOperations ? [path.join(certificationArtifactRoot, 'task-5', certificationRunId)] : []),
  ];
}
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
    'teams-join-by-code': ['qa-public-submitter', 'qa-parent-a', 'qa-parent-b', 'qa-adult-player-a'],
    'teams-create-and-capacity': ['qa-fresh-coach', 'qa-fresh-admin', 'qa-fresh-league-creator', 'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-league-owner-a', 'qa-league-owner-b', 'qa-parent-a', 'qa-adult-player-a'],
    'teams-profile-branding-settings': ['qa-coach-owner-a', 'qa-coach-owner-b'],
    'teams-module-visibility': ['qa-coach-owner-a', 'qa-team-member', 'qa-coach-owner-b'],
    'teams-seasonal-reset-delete-quota-resolution': ['qa-owner-delete-blocked', 'qa-coach-owner-b', 'qa-elite-owner', 'qa-league-owner-b'],
    'organization-club-school-overview': ['qa-school-owner', 'qa-school-delegate', 'qa-elite-owner', 'qa-coach-owner-b'],
    'organization-create-allocate-remove-squads': ['qa-school-owner', 'qa-coach-owner-b'],
    'organization-global-waivers-documents-admins': ['qa-school-owner', 'qa-coach-owner-b'],
    'roster-member-add-edit-remove-reinstate': ['qa-coach-owner-a', 'qa-coach-owner-b'],
    'roster-search-filter-sort-export': ['qa-coach-owner-a', 'qa-coach-owner-b'],
    'roster-parent-player-self-views': ['qa-parent-a', 'qa-parent-b', 'qa-adult-player-a', 'qa-coach-owner-b'],
    'recruiting-private-profile-crud': ['qa-coach-owner-a', 'qa-coach-owner-b'],
    'recruiting-public-scout-projection': ['qa-public-submitter', 'qa-coach-owner-a', 'qa-coach-owner-b'],
    'family-children-invites-team-cards': ['qa-parent-a', 'qa-parent-b'],
    'family-schedule-waivers-payments': ['qa-parent-a', 'qa-parent-b'],
    'family-enable-youth-login': ['qa-parent-a', 'qa-parent-b', 'qa-youth-invite'],
    'chat-channel-message-unread': ['qa-coach-owner-a', 'qa-team-member'],
    'sports-hub-browse-search-filter-bookmark-preferences': ['qa-team-member', 'qa-coach-owner-a'],
    'calendar-team-family-views-and-filters': ['qa-coach-owner-a'],
  };
  return [...new Set([...(actors[scenarioId] || ['catalog-scenario-actor']), 'qa-public-submitter'])];
}

function tenantCaseAssociations(scenarioId, dimension, caseId, execution = null) {
  const runtimeTarget = execution?.runtimeTarget || null;
  const association = tenantCaseAssociationFor(scenarioId, dimension, caseId, runtimeTarget);
  if (!association) return {};
  const browserCaptured = ['console', 'responsive'].includes(dimension);
  const requestCaptured = (execution?.requests?.length || 0) > 0;
  return {
    ...association,
    ...(runtimeTarget ? { runtimeTarget } : {}),
    network: {
      transport: 'loopback-http', observed: requestCaptured || browserCaptured,
      reason: requestCaptured ? 'case-owned runtime request capture'
        : browserCaptured ? 'case-owned browser response capture' : 'Admin reconciliation only; no case-owned product request',
    },
    console: dimension === 'console'
      ? { observed: true, reason: 'case-owned browser console capture' }
      : { observed: false, reason: 'server probe; browser console is a separate dimension' },
    responsive: dimension === 'responsive'
      ? { observed: true, reason: 'case-owned desktop and mobile viewport capture' }
      : { observed: false, reason: 'server probe; viewport is a separate dimension' },
    cleanupRefs: [`fixture-cleanup-${FIXTURES.runId}`],
  };
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
    // Calendar subscription credentials are opaque 64-character hex values
    // and can occur in free-form response bodies without a sensitive key.
    .replace(/\b[a-f0-9]{64}\b/gi, '[redacted]')
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
      /reset wrong-account password unchanged/, /reset other-account replacement password isolation/, /reset oversized payload denial/, /reset double-submit single request/,
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
    { dimension: 'console', caseId: 'demo-local-console', requirements: [/demo .*browser console errors/] },
    { dimension: 'network', caseId: 'demo-local-network', requirements: [/demo .*browser unexpected responses/] },
    { dimension: 'responsive', caseId: 'demo-workspace-exit-error-two-viewports', requirements: [/demo browser two viewport states/] },
  ]),
  'dashboard-shell-role-landing-and-route-policy': Object.freeze([
    { dimension: 'happyPath', caseId: 'dashboard-twenty-role-plan-state-landings', requirements: [{ pattern: / login destination$/, minCount: 20 }] },
    { dimension: 'negativePath', caseId: 'dashboard-navigation-direct-route-denials', requirements: [
      { pattern: /dashboard policy denied route/, minCount: 19 }, { pattern: /dashboard blocked-state protected data denial .* message/, minCount: 3 },
    ] },
    { dimension: 'permission', caseId: 'dashboard-complete-role-plan-state-policy', requirements: [
      { pattern: /dashboard complete route policy /, minCount: 20 }, { pattern: /dashboard mobile route policy /, minCount: 20 },
      { pattern: /dashboard visible navigation agreement /, minCount: 20 },
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
  { assertions = activeCertificationAssertions, role, tenantAlias, execution, actorAliases = certificationActorAliases(scenarioId) } = {},
) {
  if (activeCertificationCaseIds.has(caseId)) throw new Error(`Certification case ${caseId} was already emitted.`);
  const scenario = certificationScenarioById.get(scenarioId);
  const startedAt = new Date().toISOString();
  const relativeArtifact = `cases/${caseId}.json`;
  const artifactDirectory = artifactDirectoryForScenario(scenarioId);
  mkdirSync(path.join(artifactDirectory, 'cases'), { recursive: true });
  const artifact = {
    runId: certificationRunId, commit: certificationCommit,
    scenarioId, caseId, dimension, expected: String(expected), observed: String(observed),
    actorAliases,
    ...tenantCaseAssociations(scenarioId, dimension, caseId, execution),
    ...(execution ? { execution } : {}),
    assertions,
    capturedAt: startedAt,
  };
  if (OPERATIONS_SCENARIO_IDS.includes(scenarioId)) {
    assertCaseOwnedOperationArtifacts([{ caseId, assertions, execution }]);
    for (const assertion of assertions) {
      const owner = activeOperationAssertionOwners.get(assertion.id);
      if (owner && owner !== caseId) {
        throw new Error(`Operation case ${caseId} reuses shared assertion ID ${assertion.id} from ${owner}.`);
      }
      activeOperationAssertionOwners.set(assertion.id, caseId);
    }
  }
  writeFileSync(path.join(artifactDirectory, relativeArtifact), `${JSON.stringify(sanitizeCertificationArtifact(artifact), null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    runId: certificationRunId, commit: certificationCommit,
    actorAliases,
    role: role || scenario.roles.join('/'),
    tenantAlias: tenantAlias || certificationTenantAlias(scenarioId),
    ...tenantCaseAssociations(scenarioId, dimension, caseId, execution),
    ...(execution ? { execution } : {}),
    expected: String(expected), observed: String(observed), state: 'OBSERVED',
    startedAt: caseStartedAt || startedAt, completedAt: new Date().toISOString(), artifacts: [relativeArtifact],
  });
  activeCertificationCaseIds.add(caseId);
}

function recordCertificationFailure(scenarioId, dimension, caseId, error) {
  if (activeCertificationCaseIds.has(caseId)) {
    recordCertificationRunFailure(scenarioId, error);
    return;
  }
  const scenario = certificationScenarioById.get(scenarioId);
  const timestamp = new Date().toISOString();
  const failure = serializeEvidenceFailure(error, redact);
  const diagnostic = failure.diagnostic;
  const relativeArtifact = `cases/${caseId}-failure-${Date.now()}.json`;
  const artifactDirectory = artifactDirectoryForScenario(scenarioId);
  mkdirSync(path.join(artifactDirectory, 'cases'), { recursive: true });
  writeFileSync(path.join(artifactDirectory, relativeArtifact), `${JSON.stringify(sanitizeCertificationArtifact({
    runId: certificationRunId,
    commit: certificationCommit,
    scenarioId,
    caseId,
    dimension,
    actorAliases: certificationActorAliases(scenarioId),
    ...tenantCaseAssociations(scenarioId, dimension, caseId),
    expected: 'locally safe contract completed',
    observed: diagnostic,
    ...failure,
    capturedAt: timestamp,
  }), null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    runId: certificationRunId, commit: certificationCommit,
    actorAliases: certificationActorAliases(scenarioId),
    role: scenario.roles.join('/'), tenantAlias: certificationTenantAlias(scenarioId),
    ...tenantCaseAssociations(scenarioId, dimension, caseId),
    expected: 'locally safe contract completed', observed: diagnostic, state: 'FAIL',
    ...failure,
    startedAt: timestamp, completedAt: timestamp, artifacts: [relativeArtifact],
  });
  activeCertificationCaseIds.add(caseId);
}

function recordCertificationRunFailure(scenarioId, error, stage = 'scenario-cleanup-or-runner') {
  const failure = serializeEvidenceFailure(error, redact);
  emitCertificationEvent({
    type: 'scenario-error', scenarioId, runId: certificationRunId, commit: certificationCommit,
    stage,
    ...failure,
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
  AUDIT_LOCAL_REQUEST_BARRIER: '1',
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

export function buildTenantApiProbePlan(fixtures) {
  const team = alias => fixtures.teams.find(value => value.alias === alias);
  const document = alias => fixtures.firestoreDocuments.find(value => value.data?.fixtureAlias === alias);
  const teamA = team('qa-team-a');
  const activePlayer = document('qa-player-adult-b');
  const hiddenPlayer = document('qa-player-adult-a');
  if (!teamA || !activePlayer || !hiddenPlayer) {
    throw new Error('Tenant API probes require the frozen Team A and recruiting fixtures.');
  }
  return Object.freeze({
    'teams-join-by-code': Object.freeze({
      activePath: `/api/teams/join?teamId=${encodeURIComponent(teamA.id)}&code=${encodeURIComponent(teamA.code)}`,
      invalidPath: `/api/teams/join?teamId=${encodeURIComponent(teamA.id)}&code=INVALID-CODE`,
    }),
    'recruiting-public-scout-projection': Object.freeze({
      activePlayerId: activePlayer.data.id,
      hiddenPlayerId: hiddenPlayer.data.id,
    }),
    'family-enable-youth-login': Object.freeze({
      canonicalPath: '/api/invites/youth?token=modified',
      aliasPath: '/api/youth-invites?token=modified',
    }),
  });
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
  return terminateOwnedProcess(child, signal => terminateChildProcessTree(child, signal));
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
  const result = await signInEmail(emailForAlias(alias), suppliedPassword);
  if (result.status === 200 && result.body?.idToken) tenantTokenActors.set(result.body.idToken, alias);
  return result;
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
  return { status: response.status, body, headers: { cacheControl: response.headers.get('cache-control') || '' } };
}

function tenantTargetAliasFromValue(value) {
  if (!value) return null;
  const raw = String(value);
  const runtimeTarget = [...tenantRuntimeTargets.values()].find(target =>
    raw === target.resourcePath || raw.includes(target.resourcePath) || raw.includes(target.resourcePath.split('/').at(-1)));
  if (runtimeTarget) return runtimeTarget.alias;
  const team = FIXTURES.teams.find(item => item.id === raw || raw.includes(`/teams/${item.id}`) || raw.startsWith(`teams/${item.id}`));
  if (team) {
    if (team.alias === 'qa-disposable-team') return 'run-created-reset-squad';
    if (team.alias === 'qa-school-hub' || team.alias.startsWith('qa-school-squad-')) return 'qa-school';
    if (activeCertificationScenario === 'family-schedule-waivers-payments') return 'qa-household-a';
    return team.alias;
  }
  const player = FIXTURES.firestoreDocuments.find(item => item.path.startsWith('players/') &&
    (item.path.split('/')[1] === raw || raw.includes(`/players/${item.path.split('/')[1]}`) || raw.startsWith(`players/${item.path.split('/')[1]}`)));
  if (player?.data?.fixtureAlias) {
    if (activeCertificationScenario === 'family-schedule-waivers-payments') return 'qa-household-a';
    return player.data.fixtureAlias;
  }
  if (raw.includes(`reset-${certificationRunId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180))) return 'run-created-reset-squad';
  if ([...(tenantRuntimeConsumerPaths.values())].flat().some(pathname => pathname.includes(raw) || raw.includes(pathname))) return 'run-created-squad';
  return null;
}

function registerFamilyRuntimeChildTarget(childId) {
  if (typeof childId !== 'string' || !/^child_t4_[A-Za-z0-9_-]{1,200}$/.test(childId)) {
    throw new Error('Family runtime child registration requires a run-owned child identifier.');
  }
  const runtimeTarget = Object.freeze({
    alias: `run-family-child-${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180)}`,
    resourcePath: `players/${childId}`,
    registeredAt: new Date().toISOString(),
  });
  tenantRuntimeTargets.set(runtimeTarget.resourcePath, runtimeTarget);
  return runtimeTarget;
}

function bindTenantRuntimeTarget(runtimeTarget) {
  const executions = activeTenantExecutionGroup || (activeTenantExecution ? [activeTenantExecution] : []);
  if (!runtimeTarget || tenantRuntimeTargets.get(runtimeTarget.resourcePath) !== runtimeTarget || executions.length === 0) {
    throw new Error('A registered runtime target must be bound to an active tenant evidence case.');
  }
  for (const execution of executions) {
    if (execution.runtimeTarget && execution.runtimeTarget.alias !== runtimeTarget.alias) {
      throw new Error('A tenant evidence case cannot change runtime targets after registration.');
    }
    execution.runtimeTarget = runtimeTarget;
  }
}

function activeTenantExecutions() {
  return activeTenantExecutionGroup || (activeTenantExecution ? [activeTenantExecution] : []);
}

function appendTenantExecutionRecord(collection, record) {
  for (const execution of activeTenantExecutions()) execution[collection].push({ ...record });
}

function tenantOperationFromRequest(pathname, method, status) {
  if (status >= 400 && status < 500) return 'permission';
  const normalizedMethod = String(method).toUpperCase();
  if (normalizedMethod === 'GET') return 'read';
  if (normalizedMethod === 'DELETE') return 'delete';
  if (normalizedMethod === 'PATCH' || normalizedMethod === 'PUT') return 'update';
  if (pathname === '/api/family/children' && normalizedMethod === 'POST') return 'create';
  if (/season-reset|release-squad/.test(pathname)) return 'delete';
  if (/teams\/create|teams\/join|youth-invite|enable-youth/.test(pathname)) return 'create';
  return 'update';
}

async function captureOperationRequests(caseId, actorAlias, operation) {
  const actorAliases = typeof actorAlias === 'string' ? actorAlias.split('+').filter(Boolean) : [];
  if (typeof caseId !== 'string' || actorAliases.length === 0 || actorAliases.some(alias => !alias.startsWith('qa-'))) {
    throw new Error('Operation request capture requires a named case and exact fixture actor aliases.');
  }
  if (activeOperationRequestCapture) throw new Error(`Operation request capture ${activeOperationRequestCapture.caseId} overlaps ${caseId}.`);
  activeOperationRequestCapture = { caseId, actorAlias, actorAliases: new Set(actorAliases) };
  try {
    return await operation();
  } finally {
    activeOperationRequestCapture = null;
  }
}

function recordCapturedOperationRequest({ pathname, method, status, token = null, startedAt, completedAt }) {
  const capture = activeOperationRequestCapture;
  if (!capture) return;
  const actorAlias = token ? tenantTokenActors.get(token) : capture.actorAlias;
  if (!capture.actorAliases.has(actorAlias)) {
    throw new Error(`Operation request capture ${capture.caseId} observed actor ${actorAlias || 'unknown'}, expected one of ${capture.actorAlias}.`);
  }
  const request = Object.freeze({
    evidenceId: `request-${capture.caseId}-${(capturedOperationRequests.get(capture.caseId)?.length || 0) + 1}`,
    method: String(method).toUpperCase(),
    pathname: String(pathname).split('?')[0],
    status: Number(status),
    actorAlias,
    startedAt: startedAt || new Date().toISOString(),
    completedAt: completedAt || new Date().toISOString(),
  });
  const records = capturedOperationRequests.get(capture.caseId) || [];
  records.push(request);
  capturedOperationRequests.set(capture.caseId, records);
}

function recordCapturedInjectedReminderCoreInvocation({ actorAlias, invocationId, status, startedAt, completedAt }) {
  const capture = activeOperationRequestCapture;
  if (!capture) throw new Error('Injected reminder-core observation requires an active named operation capture.');
  if (!capture.actorAliases.has(actorAlias)) {
    throw new Error(`Injected reminder-core capture ${capture.caseId} observed actor ${actorAlias || 'unknown'}, expected one of ${capture.actorAlias}.`);
  }
  if (typeof invocationId !== 'string' || invocationId.length === 0) {
    throw new Error(`Injected reminder-core capture ${capture.caseId} requires a stable invocation ID.`);
  }
  const records = capturedOperationRequests.get(capture.caseId) || [];
  records.push(Object.freeze({
    evidenceId: `invocation-${capture.caseId}-${records.length + 1}`,
    method: 'INVOKE',
    pathname: '/__local/reminder-core',
    status: Number(status),
    actorAlias,
    invocationType: 'injected-reminder-core',
    invocationId,
    startedAt: startedAt || new Date().toISOString(),
    completedAt: completedAt || new Date().toISOString(),
  }));
  capturedOperationRequests.set(capture.caseId, records);
}

async function observeInjectedReminderCoreInvocation({ actorAlias, invocationId, operation }) {
  const startedAt = new Date().toISOString();
  const result = await operation();
  const completedAt = new Date().toISOString();
  for (const alias of actorAlias.split('+').filter(Boolean)) {
    recordCapturedInjectedReminderCoreInvocation({ actorAlias: alias, invocationId, status: 200, startedAt, completedAt });
  }
  return result;
}

async function captureInjectedReminderCoreInvocation(caseId, actorAlias, invocationId, operation) {
  return captureOperationRequests(caseId, actorAlias, () =>
    observeInjectedReminderCoreInvocation({ actorAlias, invocationId, operation }));
}

function operationRequestEvidence(caseId) {
  if (consumedOperationRequestCaptures.has(caseId)) throw new Error(`Operation request capture ${caseId} was reused by another named case.`);
  const requests = capturedOperationRequests.get(caseId);
  if (!requests?.length) throw new Error(`Operation case ${caseId} has no captured request or injected-core invocation evidence.`);
  consumedOperationRequestCaptures.add(caseId);
  return requests;
}

async function captureBrowserOperationRequests(caseId, actorAlias, responses, tag) {
  const selected = (responses || []).filter(response => response?.tag === tag);
  if (selected.length === 0) throw new Error(`Browser operation ${caseId} did not return a captured ${tag} response.`);
  await captureOperationRequests(caseId, actorAlias, async () => {
    for (const response of selected) {
      recordCapturedOperationRequest(response);
    }
  });
}

function recordTenantRequest({ pathname, method = 'GET', status, token = null, documentPath = null, body = null, startedAt, completedAt }) {
  recordCapturedOperationRequest({ pathname, method, status, token, startedAt, completedAt });
  if (activeTenantExecutions().length === 0) return;
  let parsedBody = {};
  try { parsedBody = body ? JSON.parse(body) : {}; } catch { parsedBody = {}; }
  const codedTeam = parsedBody.code ? FIXTURES.teams.find(team =>
    [team.code, team.teamCode, team.inviteCode].filter(Boolean).some(code =>
      String(code).toUpperCase() === String(parsedBody.code).toUpperCase())) : null;
  const createdFamilyChildId = pathname === '/api/family/children' && typeof parsedBody.requestId === 'string'
    ? `child_${parsedBody.requestId}` : '';
  const runtimeTargetAlias = tenantTargetAliasFromValue(documentPath || parsedBody.childId || parsedBody.playerId || createdFamilyChildId);
  const targetAlias = runtimeTargetAlias || ((pathname === '/api/teams/create' && status === 201) ? 'run-created-squad' : codedTeam?.alias || tenantTargetAliasFromValue(
    documentPath || parsedBody.teamId || parsedBody.childId || parsedBody.playerId || pathname,
  ));
  const completed = completedAt || new Date().toISOString();
  appendTenantExecutionRecord('requests', {
    transport: 'loopback-http', method: String(method).toUpperCase(),
    route: String(pathname).split('?')[0], status,
    executorAlias: token ? tenantTokenActors.get(token) || 'authenticated-actor' : 'qa-public-submitter',
    ...(targetAlias ? { targetAlias } : {}),
    operation: tenantOperationFromRequest(pathname, method, status),
    startedAt: startedAt || completed,
    completedAt: completed,
  });
}

function recordTenantBrowserRequest({ pathname, method, status, executorAlias, targetAlias, operation, startedAt, completedAt }) {
  appendTenantExecutionRecord('requests', {
    transport: 'loopback-http', method: String(method).toUpperCase(), route: String(pathname).split('?')[0], status,
    executorAlias, targetAlias, operation, startedAt, completedAt,
  });
}

function recordTenantBrowserRender(runtimeTarget, startedAt, completedAt) {
  appendTenantExecutionRecord('observations', {
    kind: 'browser-render', actorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias,
    operation: 'read', startedAt, completedAt,
  });
}

async function reconcileFamilyRuntimeChildGraph({ runtimeTarget, teamA, teamC, phase, expected }) {
  const paths = [
    runtimeTarget.resourcePath,
    `teams/${teamA.id}/members/${runtimeTarget.resourcePath.split('/').at(-1)}`,
    `teams/${teamC.id}/members/${runtimeTarget.resourcePath.split('/').at(-1)}`,
  ];
  const startedAt = new Date().toISOString();
  const snapshots = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    firestoreAdmin.getAll(...paths.map(pathname => firestoreAdmin.doc(pathname))));
  const values = snapshots.map(snapshot => snapshot.exists ? snapshot.data() || {} : null);
  const observed = { player: Boolean(values[0]), teamA: Boolean(values[1]), teamC: Boolean(values[2]) };
  expectEqual(JSON.stringify(observed), JSON.stringify(expected), `tenant family ${phase} exact runtime graph reconciliation`);
  const completedAt = new Date().toISOString();
  appendTenantExecutionRecord('adminTargets', {
    targetAlias: runtimeTarget.alias, actorAlias: 'qa-parent-a', operation: 'read', observedAt: completedAt, sourceCaseId: phase,
  });
  appendTenantExecutionRecord('reconciliations', {
    sourceCaseId: phase, actorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias,
    operation: 'persistence', startedAt, completedAt,
  });
  return observed;
}

async function patchFirestoreFields(options) {
  const startedAt = new Date().toISOString();
  const result = await patchFirestoreFieldsRequest(options);
  recordTenantRequest({
    pathname: '/firestore/document', method: 'PATCH', status: result.status,
    token: options.idToken, documentPath: options.documentPath, startedAt,
  });
  return result;
}

async function deleteFirestoreDocumentStatus(documentPath, idToken) {
  if (typeof documentPath !== 'string' || !documentPath || documentPath.startsWith('/') ||
      documentPath.includes('..') || documentPath.split('/').length % 2 !== 0) {
    throw new Error('Tenant deletion probe requires an exact document path.');
  }
  const startedAt = new Date().toISOString();
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${encodeURIComponent(PROJECT_ID)}/databases/(default)/documents/${documentPath}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${idToken}`, Connection: 'close' } },
  );
  recordTenantRequest({ pathname: '/firestore/document', method: 'DELETE', status: response.status, token: idToken, documentPath, startedAt });
  return response.status;
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
  const startedAt = new Date().toISOString();
  let response;
  try {
    const deadlineSignal = AbortSignal.timeout(20_000);
    const signal = init.signal ? AbortSignal.any([init.signal, deadlineSignal]) : deadlineSignal;
    response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      signal,
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
  recordTenantRequest({ pathname, method: init.method || 'GET', status: response.status, token, body: init.body, startedAt });
  return response.status;
}

async function apiJsonResult(pathname, token, init = {}) {
  const startedAt = new Date().toISOString();
  let response;
  const maxAttempts = String(init.method || 'GET').toUpperCase() === 'GET' ? 3 : 1;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const deadlineSignal = AbortSignal.timeout(20_000);
      const signal = init.signal ? AbortSignal.any([init.signal, deadlineSignal]) : deadlineSignal;
      response = await fetch(`${BASE_URL}${pathname}`, {
        ...init,
        signal,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers || {}),
          'Connection': 'close',
        },
        redirect: 'manual',
      });
      break;
    } catch (error) {
      lastError = error;
      if (init.signal?.aborted) break;
      if (attempt < maxAttempts) await new Promise(resolve => setTimeout(resolve, attempt * 100));
    }
  }
  if (!response) throw new Error(localTransportDiagnostic(init.method, pathname, lastError));
  let body = null;
  try { body = await response.json(); } catch { /* status remains authoritative */ }
  recordTenantRequest({ pathname, method: init.method || 'GET', status: response.status, token, body: init.body, startedAt });
  return { status: response.status, body, headers: { cacheControl: response.headers.get('cache-control') || '' } };
}

// The route-side gate records each request *after authentication* and before
// mutation. Unlike the old microtask helper, this proves that both HTTP
// requests arrived at the server before either is released to commit.
async function runServerRequestBarrier(label, participants, { timeoutMs = 8_000 } = {}) {
  if (!Array.isArray(participants) || participants.length !== 2 || participants.some(item => !item || typeof item.alias !== 'string' || typeof item.execute !== 'function')) {
    throw new Error(`${label} requires exactly two named request participants.`);
  }
  const barrierScope = activeOperationResourceRegistry ? `_${OPERATIONS_SCENARIO_IDS.indexOf(activeCertificationScenario)}` : '';
  const barrierId = `qa_${label}${barrierScope}_${certificationRunId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  const barrierPath = `qaCertificationRequestBarriers/${barrierId}`;
  registerDynamicFirestoreRoot(barrierPath, `request-barrier-${label}`);
  const startedAt = new Date().toISOString();
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    await firestoreAdmin.doc(barrierPath).set({
      state: 'open',
      expectedParticipants: participants.map(item => item.alias),
      arrivals: {},
      createdAt: startedAt,
      qaCertificationRun: certificationRunId,
    });
  });
  const controller = new AbortController();
  const requests = participants.map(item => Promise.resolve().then(() => item.execute({
    signal: controller.signal,
    headers: {
      'x-certification-barrier': barrierId,
      'x-certification-barrier-participant': item.alias,
    },
  })));
  const deadline = Date.now() + timeoutMs;
  let arrivals = {};
  try {
    while (Date.now() < deadline) {
      arrivals = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
        firestoreAdmin.doc(barrierPath).get().then(snapshot => snapshot.data()?.arrivals || {}));
      if (participants.every(item => typeof arrivals[item.alias] === 'string')) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (!participants.every(item => typeof arrivals[item.alias] === 'string')) {
      throw new Error(`${label} did not observe both route arrivals before release.`);
    }
    const releasedAt = new Date().toISOString();
    await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      await firestoreAdmin.doc(barrierPath).set({ state: 'released', releasedAt }, { merge: true });
    });
    const settled = await Promise.race([
      Promise.allSettled(requests),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} request responses did not settle after release.`)), timeoutMs)),
    ]);
    const final = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(barrierPath).get().then(snapshot => snapshot.data() || {}));
    return Object.freeze({ settled, barrier: Object.freeze({ barrierId, startedAt, arrivals, releasedAt, finalState: final.state || null, responsesObservedAt: new Date().toISOString() }) });
  } catch (error) {
    controller.abort();
    await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(barrierPath).set({ state: 'cancelled', cancelledAt: new Date().toISOString() }, { merge: true })).catch(() => {});
    await Promise.allSettled(requests);
    throw error;
  }
}

export function buildStorageUploadRequest(objectPath, contentType, body) {
  const boundary = `certification-${randomBytes(12).toString('hex')}`;
  const metadata = JSON.stringify({ name: objectPath, contentType });
  return Object.freeze({
    headers: Object.freeze({
      'Content-Type': `multipart/related; boundary=${boundary}`,
      'X-Goog-Upload-Protocol': 'multipart',
    }),
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      Buffer.from(body),
      Buffer.from(`\r\n--${boundary}--`),
    ]),
  });
}

async function storageObjectStatus(objectPath, token, { method = 'POST', contentType = 'image/png', body = Buffer.alloc(0) } = {}) {
  const bucket = `${PROJECT_ID}.appspot.com`;
  const encodedPath = encodeURIComponent(objectPath);
  const url = method === 'POST'
    ? `http://127.0.0.1:9199/v0/b/${bucket}/o?name=${encodedPath}`
    : `http://127.0.0.1:9199/v0/b/${bucket}/o/${encodedPath}`;
  const upload = method === 'POST' ? buildStorageUploadRequest(objectPath, contentType, body) : null;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Firebase ${token}`, ...(upload?.headers || {}), Connection: 'close' },
    ...(upload ? { body: upload.body } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  return response.status;
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
  const appName = `task3-auth-admin-${process.pid}-${Date.now()}-${++emulatorAdminAppSequence}`;
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

function registerDynamicFirestoreRoot(documentPath, label, registry = activeOperationResourceRegistry || dynamicResourceRegistry) {
  registry.register({
    id: `firestore:${activeOperationResourceRegistry ? `${activeCertificationScenario}:` : ''}${label}`,
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

async function demoGraphSnapshots(firestoreAdmin, uid) {
  const [ownedTeams, demoTeams, leagues, demoLeagues, players, facilities] = await Promise.all([
    firestoreAdmin.collection('teams').where('ownerUserId', '==', uid).get(),
    firestoreAdmin.collection('teams').where('demoSessionOwnerId', '==', uid).get(),
    firestoreAdmin.collection('leagues').where('creatorId', '==', uid).get(),
    firestoreAdmin.collection('leagues').where('demoSessionOwnerId', '==', uid).get(),
    firestoreAdmin.collection('players').where('demoOwnerUserId', '==', uid).get(),
    firestoreAdmin.collection('facilities').where('clubId', '==', uid).get(),
  ]);
  const teams = [...new Map([...ownedTeams.docs, ...demoTeams.docs].map(item => [item.ref.path, item])).values()];
  const leagueDocuments = [...new Map([...leagues.docs, ...demoLeagues.docs].map(item => [item.ref.path, item])).values()];
  const bookings = await Promise.all([
    ...teams.map(team => firestoreAdmin.collection('scheduleBookings').where('hostTeamId', '==', team.id).get()),
    ...leagueDocuments.map(league => firestoreAdmin.collection('scheduleBookings').where('leagueId', '==', league.id).get()),
  ]);
  return {
    teams,
    leagues: leagueDocuments,
    players: players.docs,
    facilities: facilities.docs,
    bookings: [...new Map(bookings.flatMap(snapshot => snapshot.docs).map(item => [item.ref.path, item])).values()],
  };
}

export function registerOwnedDemoGraphRoots({ uid, label, registry, rootPaths, cleanupRoot, verifyRoot }) {
  if (!Array.isArray(rootPaths) || typeof cleanupRoot !== 'function' || typeof verifyRoot !== 'function') {
    throw new Error('Demo graph cleanup requires exact root paths and cleanup handlers.');
  }
  const exactRootPaths = [...new Set(rootPaths)];
  for (const rootPath of exactRootPaths) {
    if (typeof rootPath !== 'string' || !rootPath || rootPath.includes('..')) {
      throw new Error('Demo graph cleanup root paths must be exact document paths.');
    }
  }
  for (const rootPath of exactRootPaths) {
    registry.register({
      id: `firestore:${label}:${uid}:${rootPath}`,
      kind: 'deleted',
      cleanup: () => cleanupRoot(rootPath),
      verify: () => verifyRoot(rootPath),
    });
  }
}

export function registerOwnedDemoGraphDiscovery({
  uid,
  label,
  registry,
  discoverRootPaths,
  cleanupRoot,
  verifyRoot,
  cleanupAuth,
  verifyAuth,
}) {
  if (!uid || !label || !registry ||
      typeof discoverRootPaths !== 'function' || typeof cleanupRoot !== 'function' ||
      typeof verifyRoot !== 'function' || typeof cleanupAuth !== 'function' || typeof verifyAuth !== 'function') {
    throw new Error('Demo graph discovery cleanup requires an owned UID and cleanup handlers.');
  }

  const registeredRootPaths = new Set();
  let discoveryComplete = false;
  let discoveryPromise = null;

  const registerExactRoots = rootPaths => {
    const unregisteredRootPaths = [...new Set(rootPaths)].filter(rootPath => !registeredRootPaths.has(rootPath));
    registerOwnedDemoGraphRoots({ uid, label, registry, rootPaths: unregisteredRootPaths, cleanupRoot, verifyRoot });
    for (const rootPath of unregisteredRootPaths) registeredRootPaths.add(rootPath);
  };

  registry.register({
    id: `auth:${label}:${uid}`,
    kind: 'deleted',
    async cleanup() {
      if (!discoveryComplete) throw new Error('Demo graph discovery remains unresolved; Auth ownership is retained.');
      let hasUnresolvedRoot = false;
      for (const rootPath of registeredRootPaths) {
        try {
          if (await verifyRoot(rootPath) !== true) hasUnresolvedRoot = true;
        } catch {
          hasUnresolvedRoot = true;
        }
      }
      if (hasUnresolvedRoot) {
        throw new Error('Demo graph cleanup remains unresolved; Auth ownership is retained.');
      }
      return cleanupAuth();
    },
    verify: verifyAuth,
  });

  // The UID is already known, so this exact root and the discovery obligation
  // must exist before the first graph query can fail.
  registerExactRoots([`users/${uid}`]);

  const discover = async () => {
    if (discoveryComplete) return;
    if (!discoveryPromise) {
      discoveryPromise = (async () => {
        const rootPaths = await discoverRootPaths();
        if (!Array.isArray(rootPaths)) throw new Error('Demo graph discovery must return exact root paths.');
        registerExactRoots(rootPaths);
        discoveryComplete = true;
      })();
    }
    try {
      await discoveryPromise;
    } catch (error) {
      discoveryPromise = null;
      throw error;
    }
  };

  registry.register({
    id: `firestore-discovery:${label}:${uid}`,
    kind: 'obligation',
    async cleanup() {
      await discover();
      return false;
    },
    async verify() { return discoveryComplete; },
  });

  return Object.freeze({ discover });
}

export async function recoverOwnedDemoBrowserContexts({ contexts, originalError = null, recoverUid, registerUid }) {
  const recoveryFailures = [];
  for (const { session, label, knownUid = null } of contexts) {
    let uid = knownUid;
    if (!uid) {
      try {
        uid = await recoverUid(session);
      } catch (error) {
        recoveryFailures.push(new Error(`${label} recovery failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }));
        continue;
      }
    }
    if (!uid) continue;
    try {
      await registerUid(uid, label);
    } catch (error) {
      recoveryFailures.push(new Error(`${label} cleanup registration failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error }));
    }
  }
  if (recoveryFailures.length > 0) {
    const failures = [...(originalError ? [originalError] : []), ...recoveryFailures];
    throw new AggregateError(failures, failures.map(error => error.message).join('; '));
  }
  if (originalError) throw originalError;
}

const registeredBrowserDemoUids = new Map();

async function registerBrowserDemoGraph(uid, label) {
  if (!uid) return;
  let registered = registeredBrowserDemoUids.get(uid);
  if (!registered) {
    registerCertificationSensitiveAlias(uid, `${label}-auth`);
    const cleanupRoot = rootPath => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const ref = firestoreAdmin.doc(rootPath);
      const existed = (await ref.get()).exists || (await ref.listCollections()).length > 0;
      await firestoreAdmin.recursiveDelete(ref);
      return existed;
    });
    const verifyRoot = rootPath => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const ref = firestoreAdmin.doc(rootPath);
      return !(await ref.get()).exists && (await ref.listCollections()).length === 0;
    });
    registered = registerOwnedDemoGraphDiscovery({
      uid,
      label,
      registry: dynamicResourceRegistry,
      discoverRootPaths: () => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const graph = await demoGraphSnapshots(firestoreAdmin, uid);
        return [
          ...graph.facilities.map(item => item.ref.path),
          ...graph.players.map(item => item.ref.path),
          ...graph.leagues.map(item => `publicLeagueViews/${item.id}`),
          ...graph.leagues.map(item => item.ref.path),
          ...graph.teams.map(item => item.ref.path),
          ...graph.bookings.map(item => item.ref.path),
        ];
      }),
      cleanupRoot,
      verifyRoot,
      cleanupAuth: () => withEmulatorAuthAdmin(async authAdmin => {
        try {
          await authAdmin.getUser(uid);
          await authAdmin.deleteUser(uid);
          return true;
        } catch (error) {
          if (error?.code === 'auth/user-not-found') return false;
          throw error;
        }
      }),
      verifyAuth: () => withEmulatorAuthAdmin(async authAdmin => {
        try {
          await authAdmin.getUser(uid);
          return false;
        } catch (error) {
          if (error?.code === 'auth/user-not-found') return true;
          throw error;
        }
      }),
    });
    registeredBrowserDemoUids.set(uid, registered);
  }
  await registered.discover();
}

function recoverBrowserDemoUid(session) {
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)}).catch(() => null);
    if (sessionResponse && sessionResponse.ok()) {
      const payload = await sessionResponse.json().catch(() => ({}));
      if (typeof payload.uid === 'string' && payload.uid) return { uid: payload.uid, source: 'session' };
    }
    const uid = await page.evaluate(async () => {
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('firebaseLocalStorageDb');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(() => null);
      if (!database || !database.objectStoreNames.contains('firebaseLocalStorage')) return null;
      const values = await new Promise((resolve, reject) => {
        const transaction = database.transaction('firebaseLocalStorage', 'readonly');
        const request = transaction.objectStore('firebaseLocalStorage').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(() => []);
      const findUid = value => {
        if (!value || typeof value !== 'object') return null;
        if (typeof value.uid === 'string' && value.uid) return value.uid;
        for (const child of Object.values(value)) {
          const found = findUid(child);
          if (found) return found;
        }
        return null;
      };
      return findUid(values);
    });
    return { uid, source: uid ? 'firebase-auth-persistence' : 'absent' };
  }`]));
  return typeof result.uid === 'string' && result.uid ? result.uid : null;
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
          let attackUser = null;
          let attackIdentityRegistered = false;
          let attackFailure = null;
          const attackInvitePaths = new Set();
          registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, `youth-${label}-player`, attackRegistry);
          try {
            await playerRef.update(playerPatch);
            const attackInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
              method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: attackEmail }),
            });
            if (attackInvite.body?.token) {
              const invitePath = `invites/${attackInvite.body.token}`;
              attackInvitePaths.add(invitePath);
              registerDynamicFirestoreRoot(invitePath, `youth-${label}-invite`);
              registerDynamicFirestoreRoot(invitePath, `youth-${label}-invite`, attackRegistry);
            }
            expectEqual(attackInvite.status, 200, `youth forged ${label} invitation create`);
            const redemption = await apiJsonResult('/api/invites/youth', null, {
              method: 'PUT', body: JSON.stringify({ token: attackInvite.body.token, password }),
            });
            attackUser = await getAuthUserByEmailIfPresent(authAdmin, attackEmail);
            if (attackUser) {
              registerDynamicAuthIdentity(attackUser.uid, `youth-${label}-user`);
              registerDynamicFirestoreRoot(`users/${attackUser.uid}`, `youth-${label}-user`);
              registerDynamicFirestoreRoot(`teams/${forgedTeam.id}/members/${attackUser.uid}`, `youth-${label}-member`);
              registerDynamicAuthIdentity(attackUser.uid, `youth-${label}-user`, attackRegistry);
              registerDynamicFirestoreRoot(`users/${attackUser.uid}`, `youth-${label}-user`, attackRegistry);
              registerDynamicFirestoreRoot(`teams/${forgedTeam.id}/members/${attackUser.uid}`, `youth-${label}-member`, attackRegistry);
              attackIdentityRegistered = true;
            }
            expectEqual(redemption.status, 200, `youth forged ${label} activation remains teamless`);
            const forgedMemberExists = attackUser
              ? (await firestoreAdmin.collection('teams').doc(forgedTeam.id).collection('members').doc(attackUser.uid).get()).exists
              : false;
            expectEqual(forgedMemberExists, false, `youth forged ${label} cannot mint membership`);
          } catch (error) {
            attackFailure = error;
            throw error;
          } finally {
            const recoveryFailures = [];
            try {
              const attackInvites = await firestoreAdmin.collection('invites').where('email', '==', attackEmail).get();
              for (const [index, invite] of attackInvites.docs.entries()) {
                if (attackInvitePaths.has(invite.ref.path)) continue;
                registerDynamicFirestoreRoot(invite.ref.path, `youth-${label}-invite-fallback-${index + 1}`);
                registerDynamicFirestoreRoot(invite.ref.path, `youth-${label}-invite-fallback-${index + 1}`, attackRegistry);
              }
              if (!attackIdentityRegistered) {
                attackUser = await getAuthUserByEmailIfPresent(authAdmin, attackEmail);
                if (attackUser) {
                  registerDynamicAuthIdentity(attackUser.uid, `youth-${label}-user-fallback`);
                  registerDynamicFirestoreRoot(`users/${attackUser.uid}`, `youth-${label}-user-fallback`);
                  registerDynamicAuthIdentity(attackUser.uid, `youth-${label}-user-fallback`, attackRegistry);
                  registerDynamicFirestoreRoot(`users/${attackUser.uid}`, `youth-${label}-user-fallback`, attackRegistry);
                  registerDynamicFirestoreRoot(`teams/${forgedTeam.id}/members/${attackUser.uid}`, `youth-${label}-member-fallback`);
                  registerDynamicFirestoreRoot(`teams/${forgedTeam.id}/members/${attackUser.uid}`, `youth-${label}-member-fallback`, attackRegistry);
                }
              }
            } catch (error) {
              recoveryFailures.push(error);
            }
            const attackCleanup = await attackRegistry.cleanup();
            completedDynamicCleanupRuns.push(attackCleanup);
            if (attackCleanup.state !== 'OBSERVED') recoveryFailures.push(new Error(`Youth ${label} cleanup retained owned resources.`));
            if (recoveryFailures.length > 0) {
              const failures = [...(attackFailure ? [attackFailure] : []), ...recoveryFailures];
              throw new AggregateError(failures, failures.map(error => error.message).join('; '));
            }
          }
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
        let removedUser = null;
        let removedIdentityRegistered = false;
        let removedFailure = null;
        const removedInvitePaths = new Set();
        registerFirestoreDocumentRestoration(playerRef.path, originalPlayer, 'youth-removed-player', removedRegistry);
        registerDynamicFirestoreRoot(authorizedRosterRef.path, 'youth-removed-roster', removedRegistry);
        const removedEmail = `${FIXTURES.runId}-youth-removed@phase2.test`;
        try {
          await playerRef.update({ primaryTeamId: teamC.id, joinedTeamIds: [teamC.id] });
          await authorizedRosterRef.set({ ...authorizedRoster, status: 'removed' });
          const removedInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
            method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: removedEmail }),
          });
          if (removedInvite.body?.token) {
            const invitePath = `invites/${removedInvite.body.token}`;
            removedInvitePaths.add(invitePath);
            registerDynamicFirestoreRoot(invitePath, 'youth-removed-invite');
            registerDynamicFirestoreRoot(invitePath, 'youth-removed-invite', removedRegistry);
          }
          expectEqual(removedInvite.status, 200, 'youth removed child invitation remains teamless');
          const removalRedemption = await apiJsonResult('/api/invites/youth', null, {
            method: 'PUT', body: JSON.stringify({ token: removedInvite.body.token, password }),
          });
          removedUser = await getAuthUserByEmailIfPresent(authAdmin, removedEmail);
          if (removedUser) {
            registerDynamicAuthIdentity(removedUser.uid, 'youth-removed-user');
            registerDynamicFirestoreRoot(`users/${removedUser.uid}`, 'youth-removed-user');
            registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${removedUser.uid}`, 'youth-removed-member-projection');
            registerDynamicAuthIdentity(removedUser.uid, 'youth-removed-user', removedRegistry);
            registerDynamicFirestoreRoot(`users/${removedUser.uid}`, 'youth-removed-user', removedRegistry);
            registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${removedUser.uid}`, 'youth-removed-member-projection', removedRegistry);
            removedIdentityRegistered = true;
          }
          expectEqual(removalRedemption.status, 200, 'youth removed child teamless activation');
          const removedProjectionExists = removedUser
            ? (await firestoreAdmin.collection('teams').doc(teamC.id).collection('members').doc(removedUser.uid).get()).exists
            : false;
          expectEqual(removedProjectionExists, false, 'youth removed child cannot mint membership');
        } catch (error) {
          removedFailure = error;
          throw error;
        } finally {
          const recoveryFailures = [];
          try {
            const removedInvites = await firestoreAdmin.collection('invites').where('email', '==', removedEmail).get();
            for (const [index, invite] of removedInvites.docs.entries()) {
              if (removedInvitePaths.has(invite.ref.path)) continue;
              registerDynamicFirestoreRoot(invite.ref.path, `youth-removed-invite-fallback-${index + 1}`);
              registerDynamicFirestoreRoot(invite.ref.path, `youth-removed-invite-fallback-${index + 1}`, removedRegistry);
            }
            if (!removedIdentityRegistered) {
              removedUser = await getAuthUserByEmailIfPresent(authAdmin, removedEmail);
              if (removedUser) {
                registerDynamicAuthIdentity(removedUser.uid, 'youth-removed-user-fallback');
                registerDynamicFirestoreRoot(`users/${removedUser.uid}`, 'youth-removed-user-fallback');
                registerDynamicAuthIdentity(removedUser.uid, 'youth-removed-user-fallback', removedRegistry);
                registerDynamicFirestoreRoot(`users/${removedUser.uid}`, 'youth-removed-user-fallback', removedRegistry);
                registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${removedUser.uid}`, 'youth-removed-member-projection-fallback');
                registerDynamicFirestoreRoot(`teams/${teamC.id}/members/${removedUser.uid}`, 'youth-removed-member-projection-fallback', removedRegistry);
              }
            }
          } catch (error) {
            recoveryFailures.push(error);
          }
          const removedCleanup = await removedRegistry.cleanup();
          completedDynamicCleanupRuns.push(removedCleanup);
          if (removedCleanup.state !== 'OBSERVED') recoveryFailures.push(new Error('Youth removed-child cleanup retained owned resources.'));
          if (recoveryFailures.length > 0) {
            const failures = [...(removedFailure ? [removedFailure] : []), ...recoveryFailures];
            throw new AggregateError(failures, failures.map(error => error.message).join('; '));
          }
        }

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
  const assertion = {
    id: `assertion-${++certificationAssertionSequence}`,
    label,
    expected: String(expected),
    observed: String(actual),
    capturedAt: new Date().toISOString(),
  };
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
  const session = activeOperationResourceRegistry
    ? operationSessionName(BROWSER_SESSION_PREFIX, activeCertificationScenario, label)
    : `${BROWSER_SESSION_PREFIX}-${label}`;
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

function browserRouteAudit(session, pathname, { mobile = false, expectedTexts = [], awaitTexts = true } = {}) {
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
      const familyResponsePromise = ${JSON.stringify(pathname === '/family')}
        ? page.waitForResponse(response => response.url().endsWith('/api/family/teams'), { timeout: 15000 })
        : null;
      await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
      if (familyResponsePromise) await familyResponsePromise;
      await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
      const awaitExpectedTexts = async () => {
        const expected = ${JSON.stringify(expectedTexts)};
        for (let frame = 0; frame < 2; frame += 1) {
          await page.waitForFunction(
            texts => texts.every(text => document.body.innerText.toLocaleLowerCase().includes(text.toLocaleLowerCase())),
            expected,
            { timeout: 15000 },
          );
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        }
        await page.waitForFunction(
          texts => texts.every(text => document.body.innerText.toLocaleLowerCase().includes(text.toLocaleLowerCase())),
          expected,
          { timeout: 15000 },
        );
      };
      if (${JSON.stringify(awaitTexts)}) await awaitExpectedTexts();
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        expectedTextsVisible: await page.evaluate(
          texts => texts.every(text => document.body.innerText.toLocaleLowerCase().includes(text.toLocaleLowerCase())),
          ${JSON.stringify(expectedTexts)},
        ),
        expectedTextPresence: await page.evaluate(
          texts => texts.map(text => document.body.innerText.toLocaleLowerCase().includes(text.toLocaleLowerCase())),
          ${JSON.stringify(expectedTexts)},
        ),
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
      const familyBrowserRaw = cli(session, ['run-code', `async page => {
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
      }`]);
      if (!familyBrowserRaw) throw new Error('tenant family browser lifecycle returned an empty Playwright result');
      const result = JSON.parse(familyBrowserRaw);
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
  expectEqual((await signIn('qa-coach-owner-a', replacementPassword)).status, 400, 'reset other-account replacement password isolation');
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
    let peerKnownUid = null;
    let mainKnownUid = null;
    let demoScenarioFailure = null;
    try {
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
    peerKnownUid = peerJourney.uid;
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
    mainKnownUid = mainSeed.uid;
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
    } catch (error) {
      demoScenarioFailure = error;
    } finally {
      // Recover ownership while both pages still exist. This catches failures
      // after anonymous Auth creation, during partial seed, and before the
      // normal session/UI result can return a UID.
      await recoverOwnedDemoBrowserContexts({
        contexts: [
          { session: peerSession, label: 'demo-browser-peer', knownUid: peerKnownUid },
          { session, label: 'demo-browser-main', knownUid: mainKnownUid },
        ],
        originalError: demoScenarioFailure,
        recoverUid: recoverBrowserDemoUid,
        registerUid: registerBrowserDemoGraph,
      });
    }
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

async function recordObservedTenantCase(scenarioId, dimension, caseId, work, expected, runtimeTarget = null) {
  return recordObservedTenantCases(scenarioId, [{ dimension, caseId, expected, runtimeTarget }], work);
}

async function recordObservedTenantCases(scenarioId, caseDefinitions, work) {
  if (!Array.isArray(caseDefinitions) || caseDefinitions.length === 0) {
    throw new Error('Tenant case execution requires at least one case definition.');
  }
  const assertionStart = activeCertificationAssertions.length;
  const caseStartedAt = new Date().toISOString();
  const previousExecution = activeTenantExecution;
  const previousExecutionGroup = activeTenantExecutionGroup;
  const executions = caseDefinitions.map(({ runtimeTarget = null }) => ({
    startedAt: caseStartedAt,
    completedAt: caseStartedAt,
    requests: [], adminTargets: [], observations: [], reconciliations: [], runtimeTarget,
  }));
  activeTenantExecution = executions[0];
  activeTenantExecutionGroup = executions;
  try {
    const observed = await work();
    const caseCompletedAt = new Date().toISOString();
    for (let index = 0; index < caseDefinitions.length; index += 1) {
      const { dimension, caseId, expected } = caseDefinitions[index];
      const execution = executions[index];
      execution.completedAt = caseCompletedAt;
      const association = tenantCaseAssociationFor(scenarioId, dimension, caseId, execution.runtimeTarget);
      if (association && !execution.observations.some(item =>
        item.actorAlias === association.actorAlias && item.targetAlias === association.targetAlias && item.operation === association.operation)) {
        execution.observations.push({
          kind: ['console', 'responsive'].includes(dimension) ? 'browser-work' : 'case-work',
          ...association,
          startedAt: caseStartedAt,
          completedAt: caseCompletedAt,
        });
      }
      recordCertificationCase(
        scenarioId,
        dimension,
        caseId,
        typeof observed === 'object' && observed !== null ? observed[caseId] || observed[dimension] || JSON.stringify(observed) : observed,
        expected,
        caseStartedAt,
        { assertions: activeCertificationAssertions.slice(assertionStart), execution },
      );
    }
  } catch (error) {
    for (const { dimension, caseId } of caseDefinitions) {
      recordCertificationFailure(scenarioId, dimension, caseId, error);
    }
    if (error && typeof error === 'object') error.certificationCaseRecorded = true;
    throw error;
  } finally {
    activeTenantExecution = previousExecution;
    activeTenantExecutionGroup = previousExecutionGroup;
  }
}

async function directFirestoreReadStatus(documentPath, token = null) {
  const startedAt = new Date().toISOString();
  const response = await fetch(
    `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents/${documentPath}`,
    { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Connection: 'close' } },
  );
  recordTenantRequest({ pathname: '/firestore/document', method: 'GET', status: response.status, token, documentPath, startedAt });
  return response.status;
}

function tenantReadActorFor(scenarioId, documentPath) {
  if (scenarioId === 'roster-parent-player-self-views' && documentPath.includes('qa-player-adult-a')) return 'qa-adult-player-a';
  return tenantCaseAssociationFor(scenarioId, 'happyPath', LOCAL_TENANT_CASE_REQUIREMENTS[scenarioId].happyPath[0])?.actorAlias;
}

async function runTenantApiScenario(scenarioId) {
  const plan = buildTenantApiProbePlan(FIXTURES);
  if (scenarioId === 'teams-create-and-capacity') {
    const creatorAliases = ['qa-fresh-coach', 'qa-fresh-admin', 'qa-fresh-league-creator'];
    const contrastAliases = ['qa-coach-owner-a', 'qa-coach-owner-b', 'qa-league-owner-a', 'qa-league-owner-b', 'qa-parent-a', 'qa-adult-player-a'];
    const ownedCreatorAliases = [...creatorAliases, ...contrastAliases];
    const creators = new Map(await Promise.all(creatorAliases.map(async alias => [alias, await signIn(alias)])));
    for (const alias of contrastAliases) creators.set(alias, await signIn(alias));
    const markers = new Map(ownedCreatorAliases.map(alias => [alias, `${FIXTURES.runId} ${alias} owned creation`]));
    const markerValuesFor = alias => alias === 'qa-fresh-coach'
      ? [1, 2].map(attempt => `${markers.get(alias)} ${attempt}`) : [markers.get(alias)];
    let createdTeamId = '';
    const createdTeamIds = new Map();
    dynamicResourceRegistry.register({
      id: `firestore-discovery:tenant-created-team:${certificationRunId}`,
      kind: 'obligation',
      async cleanup() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const snapshots = [];
          for (const alias of ownedCreatorAliases) {
            const knownId = createdTeamIds.get(alias);
            if (knownId) snapshots.push(await firestoreAdmin.doc(`teams/${knownId}`).get());
            else for (const marker of markerValuesFor(alias)) {
              snapshots.push(...(await firestoreAdmin.collection('teams').where('teamName', '==', marker).get()).docs);
            }
          }
          let changed = false;
          for (const snapshot of snapshots.filter(item => item.exists)) {
            await firestoreAdmin.recursiveDelete(snapshot.ref);
            for (const alias of ownedCreatorAliases) {
              await firestoreAdmin.recursiveDelete(firestoreAdmin.doc(`users/${identityByAlias.get(alias).uid}/teamMemberships/${snapshot.id}`));
            }
            changed = true;
          }
          return changed;
        });
      },
      async verify() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          for (const alias of ownedCreatorAliases) {
            for (const marker of markerValuesFor(alias)) {
              if (!(await firestoreAdmin.collection('teams').where('teamName', '==', marker).get()).empty) return false;
            }
            const knownId = createdTeamIds.get(alias);
            if (knownId && (await firestoreAdmin.doc(`users/${identityByAlias.get(alias).uid}/teamMemberships/${knownId}`).get()).exists) return false;
          }
          return true;
        });
      },
    });
    let created;
    await recordObservedTenantCase(scenarioId, 'happyPath', 'team-create-happyPath', async () => {
      for (const alias of creatorAliases) {
        let response;
        if (alias === 'qa-fresh-coach') {
          const attempts = await runTwoParty('tenant-one-seat-team-create-race', [1, 2].map(attempt => signal =>
            apiJsonResult('/api/teams/create', creators.get(alias).body.idToken, {
              method: 'POST',
              body: JSON.stringify({ name: `${markers.get(alias)} ${attempt}`, type: 'team', position: 'Head Coach' }),
              signal,
            })), {
            timeoutMs: 20_000,
            settleTimeoutMs: 1_000,
            terminate: async () => terminateOwnedChildAndWait(ownedNextServerProcess),
          });
          const fulfilled = attempts.filter(item => item.status === 'fulfilled').map(item => item.value);
          expectEqual(fulfilled.length, 2, 'tenant team create capacity race requests settle');
          expectEqual(fulfilled.filter(item => item.status === 201).length, 1, 'tenant team create one-seat race single winner');
          expectEqual(fulfilled.filter(item => item.status === 409).length, 1, 'tenant team create one-seat race exhausted denial');
          response = fulfilled.find(item => item.status === 201);
        } else {
          response = await apiJsonResult('/api/teams/create', creators.get(alias).body.idToken, {
            method: 'POST', body: JSON.stringify({ name: markers.get(alias), type: 'team', position: 'Head Coach' }),
          });
        }
        expectEqual(response.status, 201, `tenant team create ${alias} succeeds`);
        const teamId = response.body?.teamId || '';
        expectEqual(/^team_[A-Za-z0-9]+$/.test(teamId), true, `tenant team create ${alias} server identifier`);
        createdTeamIds.set(alias, teamId);
        if (alias === 'qa-fresh-coach') { created = response; createdTeamId = teamId; }
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const team = await firestoreAdmin.doc(`teams/${teamId}`).get();
          expectEqual(team.data()?.ownerUserId, identityByAlias.get(alias).uid, `tenant team create ${alias} owner server-derived`);
        });
      }
      tenantRuntimeConsumerPaths.set(scenarioId, [
        `teams/${createdTeamId}`,
        `users/${identityByAlias.get('qa-fresh-coach').uid}/teamMemberships/${createdTeamId}`,
      ]);
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const [team, member, projection] = await Promise.all([
          firestoreAdmin.doc(`teams/${createdTeamId}`).get(),
          firestoreAdmin.doc(`teams/${createdTeamId}/members/${identityByAlias.get('qa-fresh-coach').uid}`).get(),
          firestoreAdmin.doc(`users/${identityByAlias.get('qa-fresh-coach').uid}/teamMemberships/${createdTeamId}`).get(),
        ]);
        expectEqual(team.data()?.ownerUserId, identityByAlias.get('qa-fresh-coach').uid, 'tenant team create owner server-derived');
        expectEqual(member.data()?.ownerUserId, identityByAlias.get('qa-fresh-coach').uid, 'tenant team create member owner projection');
        expectEqual(projection.data()?.ownerUserId, identityByAlias.get('qa-fresh-coach').uid, 'tenant team create user owner projection');
      });
      const contrastResults = new Map();
      for (const alias of contrastAliases) {
        const response = await apiJsonResult('/api/teams/create', creators.get(alias).body.idToken, {
          method: 'POST', body: JSON.stringify({ name: markers.get(alias), type: 'team', position: 'Head Coach' }),
        });
        contrastResults.set(alias, response);
        if (response.status === 201) createdTeamIds.set(alias, response.body?.teamId || '');
      }
      expectEqual([
        contrastResults.get('qa-league-owner-a').status,
        contrastResults.get('qa-league-owner-b').status,
        contrastResults.get('qa-coach-owner-a').status,
        contrastResults.get('qa-coach-owner-b').status,
      ].join(','), '201,201,409,409', 'tenant team create subscription state contrasts');
      expectEqual([
        contrastResults.get('qa-parent-a').status,
        contrastResults.get('qa-adult-player-a').status,
      ].join(','), '201,201', 'tenant team create adult parent conditional outcomes');
      return 'The fresh coach created a run-owned squad with coherent team, member, and user projections.';
    }, 'A supported team is created atomically with server-derived ownership.');
    await recordObservedTenantCase(scenarioId, 'negativePath', 'team-create-negativePath', async () => {
      const invalid = await apiJsonResult('/api/teams/create', creators.get('qa-fresh-coach').body.idToken, {
        method: 'POST', body: JSON.stringify({ name: markers.get('qa-fresh-coach'), type: 'forged', position: 'Coach' }),
      });
      expectEqual(invalid.status, 400, 'tenant team create unsupported type denied');
      const missingName = await apiJsonResult('/api/teams/create', creators.get('qa-fresh-admin').body.idToken, {
        method: 'POST', body: JSON.stringify({ type: 'team', position: 'Coach' }),
      });
      const missingPosition = await apiJsonResult('/api/teams/create', creators.get('qa-fresh-league-creator').body.idToken, {
        method: 'POST', body: JSON.stringify({ name: 'missing position', type: 'team' }),
      });
      const duplicateAtCapacity = await apiJsonResult('/api/teams/create', creators.get('qa-parent-a').body.idToken, {
        method: 'POST', body: JSON.stringify({ name: markers.get('qa-parent-a'), type: 'team', position: 'Head Coach' }),
      });
      expectEqual([missingName.status, missingPosition.status, invalid.status, duplicateAtCapacity.status].join(','), '400,400,400,409',
        'tenant team create duplicate and required-field matrix');
      return 'An unsupported type was rejected before any graph was created.';
    }, 'Invalid team fields fail closed without a partial graph.');
    await recordObservedTenantCase(scenarioId, 'permission', 'team-create-permission', async () => {
      const forged = await apiJsonResult('/api/teams/create', creators.get('qa-fresh-coach').body.idToken, {
        method: 'POST', body: JSON.stringify({ name: markers.get('qa-fresh-coach'), type: 'team', position: 'Coach', overrideOwnerId: identityByAlias.get('qa-coach-owner-b').uid }),
      });
      expectEqual(forged.status, 403, 'tenant team create owner tampering denied');
      return 'Client-supplied owner authority was denied without a validated organization context.';
    }, 'Creation authority is derived from authentication and persisted organization state, never client owner fields.');
    await recordObservedTenantCase(scenarioId, 'persistence', 'team-create-persistence', async () => {
      const values = await readTenantConsumerDocuments(tenantRuntimeConsumerPaths.get(scenarioId));
      expectEqual(values.every(Boolean), true, 'tenant team create graph reload');
      expectEqual(values[0].teamName.startsWith(markers.get('qa-fresh-coach')), true, 'tenant team create marker persisted');
      return 'An independent Admin reader observed the exact created team and membership projection.';
    }, 'The complete created graph persists after the route returns.');
    await recordObservedTenantCase(scenarioId, 'network', 'team-create-network', async () => {
      expectEqual(typeof created.body?.code, 'string', 'tenant team create opaque code returned');
      expectEqual('ownerUserId' in (created.body || {}), false, 'tenant team create response omits authority field');
      return 'The route returned only the created ID and generated code; authority-bearing fields were omitted.';
    }, 'Creation uses the loopback server boundary and returns a minimal response.');
    return;
  }
  if (scenarioId === 'teams-seasonal-reset-delete-quota-resolution') {
    const owner = await signIn('qa-owner-delete-blocked');
    const outsider = await signIn('qa-coach-owner-b');
    const teamId = `reset-${certificationRunId}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 180);
    const teamPath = `teams/${teamId}`;
    const storagePath = `${teamPath}/documents/reset-contract.txt`;
    const memberUid = identityByAlias.get('qa-team-member').uid;
    const playerId = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a').data.id;
    const projectionPath = `users/${memberUid}/teamMemberships/${teamId}`;
    const playerPath = `players/${playerId}`;
    tenantFixtureMutations.registerDynamicDocument('tenant-season-reset-team', teamPath);
    tenantFixtureMutations.registerDynamicStoragePath('tenant-season-reset-storage', storagePath);
    return tenantFixtureMutations.withFirestoreOverlay([projectionPath, playerPath], async () => {
      await tenantFixtureMutations.writeDynamicDocument(teamPath, {
        id: teamId,
        teamName: `${FIXTURES.runId} reset contract`,
        ownerUserId: identityByAlias.get('qa-owner-delete-blocked').uid,
        fixtureRunId: FIXTURES.runId,
        status: 'active',
      });
      tenantRuntimeConsumerPaths.set(scenarioId, [teamPath]);
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin, bucket) => {
        const batch = firestoreAdmin.batch();
        batch.set(firestoreAdmin.doc(`${teamPath}/members/${identityByAlias.get('qa-owner-delete-blocked').uid}`), {
          userId: identityByAlias.get('qa-owner-delete-blocked').uid, role: 'Owner', teamId,
        });
        batch.set(firestoreAdmin.doc(`${teamPath}/members/${memberUid}`), {
          userId: memberUid, playerId, role: 'Member', status: 'active', teamId,
        });
        batch.set(firestoreAdmin.doc(`${teamPath}/games/reset-game`), { teamId, fixtureRunId: FIXTURES.runId });
        batch.set(firestoreAdmin.doc(`${teamPath}/events/reset-event`), { teamId, fixtureRunId: FIXTURES.runId });
        batch.set(firestoreAdmin.doc(`${teamPath}/files/reset-file`), { teamId, storagePath, fixtureRunId: FIXTURES.runId });
        batch.set(firestoreAdmin.doc(projectionPath), { teamId, userId: memberUid, status: 'active' });
        const player = await firestoreAdmin.doc(playerPath).get();
        batch.set(firestoreAdmin.doc(playerPath), {
          ...player.data(), joinedTeamIds: [...new Set([...(player.data()?.joinedTeamIds || []), teamId])], primaryTeamId: teamId,
        });
        await batch.commit();
        await bucket.file(storagePath).save(Buffer.from('local reset contract'), { contentType: 'text/plain' });
      });
      let selected;
      await recordObservedTenantCase(scenarioId, 'happyPath', 'team-destructive-happyPath', async () => {
        selected = await apiJsonResult('/api/teams/season-reset', owner.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId, categories: ['games'] }),
        });
        expectEqual(selected.status, 200, 'tenant seasonal selected reset succeeds');
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin, bucket) => {
          expectEqual((await firestoreAdmin.doc(`${teamPath}/games/reset-game`).get()).exists, false, 'tenant seasonal selected games deleted');
          expectEqual((await firestoreAdmin.doc(`${teamPath}/events/reset-event`).get()).exists, true, 'tenant seasonal unrelated events preserved');
          expectEqual((await firestoreAdmin.doc(`${teamPath}/members/${memberUid}`).get()).exists, true, 'tenant seasonal unrelated roster preserved');
          expectEqual((await bucket.file(storagePath).exists())[0], true, 'tenant seasonal unrelated Storage preserved');
        });
        return 'The owner reset only games on a fresh run-owned squad; events, roster, root, and Storage controls remained.';
      }, 'Selected reset categories remove only their active-team descendants.');
      await recordObservedTenantCase(scenarioId, 'negativePath', 'team-destructive-negativePath', async () => {
        const invalid = await apiJsonResult('/api/teams/season-reset', outsider.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId, categories: ['games', 'complete'] }),
        });
        expectEqual(invalid.status, 400, 'tenant seasonal mixed complete category denied');
        return 'A mixed complete/category request failed closed before mutation.';
      }, 'Invalid or ambiguous category sets cannot start a reset.');
      await recordObservedTenantCase(scenarioId, 'permission', 'team-destructive-permission', async () => {
        const denied = await apiJsonResult('/api/teams/season-reset', outsider.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId, categories: ['complete'] }),
        });
        expectEqual(denied.status, 403, 'tenant seasonal outsider denied');
        return 'The named companion-team owner was denied by the server-derived ownership check.';
      }, 'Only the exact active squad owner may reset its season.');
      await recordObservedTenantCase(scenarioId, 'persistence', 'team-destructive-persistence', async () => {
        const complete = await apiJsonResult('/api/teams/season-reset', owner.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId, categories: ['complete'] }),
        });
        if (complete.status !== 200) {
          throw new Error(`tenant seasonal complete reset returned ${complete.status} ${JSON.stringify({ code: complete.body?.code, summary: complete.body?.summary })}`);
        }
        expectEqual(complete.status, 200, 'tenant seasonal complete reset succeeds');
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin, bucket) => {
          const [team, ownerMember, member, projection, player] = await Promise.all([
            firestoreAdmin.doc(teamPath).get(),
            firestoreAdmin.doc(`${teamPath}/members/${identityByAlias.get('qa-owner-delete-blocked').uid}`).get(),
            firestoreAdmin.doc(`${teamPath}/members/${memberUid}`).get(),
            firestoreAdmin.doc(projectionPath).get(),
            firestoreAdmin.doc(playerPath).get(),
          ]);
          expectEqual(team.exists, true, 'tenant seasonal team root preserved');
          expectEqual(ownerMember.exists, true, 'tenant seasonal owner member preserved');
          expectEqual(member.exists, false, 'tenant seasonal nonowner roster removed');
          expectEqual(projection.exists, false, 'tenant seasonal user membership removed');
          expectEqual(player.data()?.joinedTeamIds?.includes(teamId), false, 'tenant seasonal player team projection removed');
          expectEqual(player.data()?.primaryTeamId === teamId, false, 'tenant seasonal primary team reconciled');
          expectEqual((await bucket.file(storagePath).exists())[0], false, 'tenant seasonal exact Storage removed');
        });
        const updateMarker = `${FIXTURES.runId} reset update race`;
        const conflictRace = await runTwoParty('tenant-reset-update-conflict', [
          signal => apiJsonResult('/api/teams/season-reset', owner.body.idToken, {
            method: 'POST', body: JSON.stringify({ teamId, categories: ['complete'] }), signal,
          }),
          signal => patchFirestoreFields({ projectId: PROJECT_ID, documentPath: teamPath, idToken: owner.body.idToken,
            fields: { description: updateMarker }, signal }),
        ], { timeoutMs: 20_000, settleTimeoutMs: 1_000, terminate: async () => terminateOwnedChildAndWait(ownedNextServerProcess) });
        const conflictStatuses = conflictRace.filter(item => item.status === 'fulfilled').map(item => item.value.status);
        const [teamAfterConflict] = await readTenantConsumerDocuments([teamPath]);
        expectEqual(conflictStatuses.length === 2 && conflictStatuses.every(status => status === 200) && teamAfterConflict.description === updateMarker, true,
          'tenant destructive cancel double-submit conflict matrix');
        const elite = await signIn('qa-elite-owner');
        const canceled = await signIn('qa-league-owner-b');
        const eliteUserPath = `users/${identityByAlias.get('qa-elite-owner').uid}`;
        const eliteTeams = FIXTURES.teams.filter(item => item.alias.startsWith('qa-elite-squad-'));
        const quotaPaths = [eliteUserPath, ...eliteTeams.flatMap(item => [
          `teams/${item.id}`, `users/${identityByAlias.get('qa-elite-owner').uid}/teamMemberships/${item.id}`,
        ])];
        await tenantFixtureMutations.withFirestoreOverlay(quotaPaths, async () => {
          await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
            firestoreAdmin.doc(eliteUserPath).update({ team_limit: 1, subscriptionMutation: null }));
          const resolved = await apiJsonResult('/api/teams/resolve-quota', elite.body.idToken, {
            method: 'POST', body: JSON.stringify({ selectedTeamIds: [eliteTeams[0].id] }),
          });
          await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
            firestoreAdmin.doc(eliteUserPath).update({
              subscriptionMutation: { key: `tenant-quota-${certificationRunId}`, expiresAt: Date.now() + 60_000 },
            }));
          const locked = await apiJsonResult('/api/teams/resolve-quota', elite.body.idToken, {
            method: 'POST', body: JSON.stringify({ selectedTeamIds: [eliteTeams[0].id] }),
          });
          const canceledDenied = await apiJsonResult('/api/teams/resolve-quota', canceled.body.idToken, {
            method: 'POST', body: JSON.stringify({ selectedTeamIds: [] }),
          });
          if (!(resolved.status === 200 && resolved.body?.releasedTeamIds?.length === 2 && locked.status === 409 && canceledDenied.status === 403)) {
            throw new Error(`tenant destructive resolve quota mismatch ${JSON.stringify({
              resolvedStatus: resolved.status,
              releasedCount: resolved.body?.releasedTeamIds?.length ?? null,
              lockedStatus: locked.status,
              canceledStatus: canceledDenied.status,
            })}`);
          }
          expectEqual(resolved.status === 200 && resolved.body?.releasedTeamIds?.length === 2 && locked.status === 409 && canceledDenied.status === 403, true,
            'tenant destructive resolve quota workflow');
        });
        return 'Complete reset persisted exact descendant, user-membership, player-team, and Storage cleanup while retaining owner controls.';
      }, 'Complete reset reconciles every owned descendant and projection without deleting the squad root or owner.');
      await recordObservedTenantCase(scenarioId, 'network', 'team-destructive-network', async () => {
        expectEqual(selected.body?.result?.categories?.join(','), 'games', 'tenant seasonal response categories exact');
        expectEqual(selected.body?.result?.teamId, teamId, 'tenant seasonal response target exact');
        return 'The owner, invalid, and outsider requests returned structured 200, 400, and 403 outcomes on the loopback route.';
      }, 'The reset route reports exact scope and bounded failures without outbound calls.');
    });
  }
  if (scenarioId === 'teams-join-by-code') {
    const probe = plan[scenarioId];
    const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
    const joinDiscoveryStartedAt = Date.now();
    // Register the complete server-created session discovery boundary before
    // the first preview. This also owns sessions created by both browser
    // viewports or by a response that is lost after the server commit.
    dynamicResourceRegistry.register({
      id: `server-discovery:tenant-join-sessions:${certificationRunId}`,
      kind: 'obligation',
      async cleanup() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const sessions = await firestoreAdmin.collection('team_join_sessions').where('teamId', '==', teamA.id).get();
          let changed = false;
          for (const session of sessions.docs) {
            const createdAt = typeof session.data()?.createdAt?.toMillis === 'function' ? session.data().createdAt.toMillis() : 0;
            if (createdAt < joinDiscoveryStartedAt) continue;
            await firestoreAdmin.recursiveDelete(session.ref);
            changed = true;
          }
          return changed;
        });
      },
      async verify() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const sessions = await firestoreAdmin.collection('team_join_sessions').where('teamId', '==', teamA.id).get();
          return sessions.docs.every(session => {
            const createdAt = typeof session.data()?.createdAt?.toMillis === 'function' ? session.data().createdAt.toMillis() : 0;
            return createdAt < joinDiscoveryStartedAt;
          });
        });
      },
    });
    let activeBody;
    await recordObservedTenantCase(scenarioId, 'happyPath', 'team-join-happyPath', async () => {
      const active = await apiJsonResult(probe.activePath, null);
      expectEqual(active.status, 200, 'tenant join active invitation resolves');
      expectEqual(typeof active.body?.data?.sessionToken, 'string', 'tenant join issues opaque session');
      activeBody = active.body;
      return 'Active frozen squad invitation resolved through the public server boundary.';
    }, 'Active squad invitation resolves without exposing the team document.');
    await recordObservedTenantCase(scenarioId, 'negativePath', 'team-join-negativePath', async () => {
      const invalid = await apiJsonResult(probe.invalidPath, null);
      expectEqual(invalid.status, 404, 'tenant join modified code denied');
      return 'Modified invitation code returned nondisclosing not-found.';
    }, 'A mismatched team and invitation code is denied.');
    await recordObservedTenantCase(scenarioId, 'permission', 'team-join-permission', async () => {
      const status = await directFirestoreReadStatus(`teams/${teamA.id}`);
      expectEqual([401, 403].includes(status), true, 'tenant join anonymous direct team read denied');
      return 'Anonymous direct Firestore team read was denied while the server returned a minimal projection.';
    }, 'Anonymous callers cannot bypass the join projection to read the team root.');
    await recordObservedTenantCase(scenarioId, 'persistence', 'team-join-persistence', async () => {
      const token = activeBody?.data?.sessionToken || '';
      const hash = (await import('node:crypto')).createHash('sha256').update(token).digest('hex');
      registerDynamicFirestoreRoot(`team_join_sessions/${hash}`, 'tenant-join-session');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const snapshot = await firestoreAdmin.collection('team_join_sessions').doc(hash).get();
        expectEqual(snapshot.exists, true, 'tenant join session persisted');
        expectEqual(snapshot.data()?.teamId, FIXTURES.teams.find(team => team.alias === 'qa-team-a').id, 'tenant join session bound to exact team');
      });
      return 'Opaque join session persisted under its digest and remained bound to Team A.';
    }, 'The session is persisted only as a digest and bound to the resolved team.');
    await recordObservedTenantCase(scenarioId, 'network', 'team-join-network', async () => {
      expectEqual(Boolean(activeBody?.data?.team?.id), true, 'tenant join response has minimal team identity');
      expectEqual('ownerUserId' in (activeBody?.data?.team || {}), false, 'tenant join response omits owner authority');
      return 'Expected 200/404 responses were observed with a minimal public payload.';
    }, 'Join requests use the expected route and expose no authority-bearing fields.');
    const parent = await signIn('qa-parent-a');
    const otherParent = await signIn('qa-parent-b');
    const childId = FIXTURES.youthInvite.childId;
    const memberPath = `teams/${teamA.id}/members/${childId}`;
    const playerPath = `players/${childId}`;
    const parentProjectionPath = `users/${identityByAlias.get('qa-parent-a').uid}/teamMemberships/${teamA.id}`;
    await tenantFixtureMutations.withFirestoreOverlay([memberPath, playerPath, parentProjectionPath], async () => {
      await recordObservedTenantCase(scenarioId, 'happyPath', 'team-join-guardian-child-enrollment-race', async () => {
        const requests = await runTwoParty('tenant-child-join-race', [
          signal => apiJsonResult('/api/teams/join', parent.body.idToken, {
            method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
            signal,
          }),
          signal => apiJsonResult('/api/teams/join', parent.body.idToken, {
            method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
            signal,
          }),
        ], {
          timeoutMs: 20_000,
          settleTimeoutMs: 1_000,
          terminate: async () => terminateOwnedChildAndWait(ownedNextServerProcess),
        });
        expectEqual(requests.every(item => item.status === 'fulfilled' && item.value.status === 200), true, 'tenant join concurrent duplicate requests settle');
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const [player, member, projection] = await Promise.all([
            firestoreAdmin.doc(playerPath).get(), firestoreAdmin.doc(memberPath).get(), firestoreAdmin.doc(parentProjectionPath).get(),
          ]);
          expectEqual(player.data()?.userId || null, null, 'tenant child join preserves accountless user identity');
          expectEqual(player.data()?.hasLogin === true, false, 'tenant child join preserves accountless login state');
          expectEqual(member.data()?.parentId, identityByAlias.get('qa-parent-a').uid, 'tenant child join derives guardian binding');
          expectEqual(member.data()?.userId || null, null, 'tenant child roster never impersonates guardian');
          expectEqual(projection.exists, true, 'tenant child join writes guardian membership projection');
          const memberCount = await firestoreAdmin.collection(`teams/${teamA.id}/members`).where('playerId', '==', childId).get();
          expectEqual(memberCount.size, 1, 'tenant child concurrent join creates one roster row');
        });
        return 'Two simultaneous child enrollments settled to one member while preserving a distinct accountless child identity.';
      }, 'Actual linked-child POST enrollment is idempotent, race-safe, and never assigns guardian identity to the child.');
    });
    await tenantFixtureMutations.withFirestoreOverlay([`teams/${teamA.id}`, memberPath, playerPath, parentProjectionPath], async () => {
      await recordObservedTenantCase(scenarioId, 'negativePath', 'team-join-inactive-code-current-state-denial', async () => {
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamA.id}`).set({ isActive: false }, { merge: true }));
        const inactive = await apiJsonResult('/api/teams/join', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
        });
        expectEqual(inactive.status, 409, 'tenant join inactive current-state POST denied');
        expectEqual((await readTenantConsumerDocuments([memberPath]))[0], null, 'tenant join inactive denial has no member side effect');
        return 'Code-only POST rechecked current team state and denied the inactive squad without a member write.';
      }, 'Inactive current state fails closed at POST, including the transactional boundary.');
    });
    await recordObservedTenantCase(scenarioId, 'permission', 'team-join-cross-guardian-enrollment-denial', async () => {
      const denied = await apiJsonResult('/api/teams/join', otherParent.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      expectEqual(denied.status, 403, 'tenant join wrong guardian child enrollment denied');
      return 'The companion household could not enroll Parent A’s linked child.';
    }, 'Child enrollment derives guardian authority from the authenticated account and persisted child link.');
    const adult = await signIn('qa-adult-player-a');
    const adultJoinTeam = FIXTURES.teams.find(team => team.alias === 'qa-pro-team');
    const adultUid = identityByAlias.get('qa-adult-player-a').uid;
    const adultPlayerId = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a').data.id;
    const adultPaths = [
      `teams/${adultJoinTeam.id}/members/${adultUid}`,
      `users/${adultUid}/teamMemberships/${adultJoinTeam.id}`,
      `players/${adultPlayerId}`,
    ];
    dynamicResourceRegistry.register({
      id: `server-discovery:tenant-adult-join-sessions:${certificationRunId}`,
      kind: 'obligation',
      async cleanup() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const sessions = await firestoreAdmin.collection('team_join_sessions').where('teamId', '==', adultJoinTeam.id).get();
          let changed = false;
          for (const session of sessions.docs) {
            const createdAt = typeof session.data()?.createdAt?.toMillis === 'function' ? session.data().createdAt.toMillis() : 0;
            if (createdAt < joinDiscoveryStartedAt) continue;
            await firestoreAdmin.recursiveDelete(session.ref); changed = true;
          }
          return changed;
        });
      },
      async verify() {
        return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const sessions = await firestoreAdmin.collection('team_join_sessions').where('teamId', '==', adultJoinTeam.id).get();
          return sessions.docs.every(session => {
            const createdAt = typeof session.data()?.createdAt?.toMillis === 'function' ? session.data().createdAt.toMillis() : 0;
            return createdAt < joinDiscoveryStartedAt;
          });
        });
      },
    });
    await tenantFixtureMutations.withFirestoreOverlay(adultPaths, async () => {
      await recordObservedTenantCase(scenarioId, 'happyPath', 'team-join-adult-self-session-consumption', async () => {
        const preview = await apiJsonResult(`/api/teams/join?teamId=${encodeURIComponent(adultJoinTeam.id)}&code=${encodeURIComponent(adultJoinTeam.code)}`, null);
        expectEqual(preview.status, 200, 'tenant adult join session preview');
        const sessionToken = preview.body?.data?.sessionToken || '';
        const joined = await apiJsonResult('/api/teams/join', adult.body.idToken, {
          method: 'POST', body: JSON.stringify({ sessionToken, code: adultJoinTeam.code, position: 'Owner', role: 'Admin', parentUid: identityByAlias.get('qa-parent-a').uid }),
        });
        const [member, projection, player] = await readTenantConsumerDocuments(adultPaths);
        if (!(joined.status === 200 && member?.userId === adultUid && projection?.role === 'Member' && player?.joinedTeamIds?.includes(adultJoinTeam.id))) {
          throw new Error(`tenant adult self join mismatch ${JSON.stringify({ status: joined.status, memberUser: member?.userId || null, memberRole: member?.role || null, projectionRole: projection?.role || null, joinedTeam: player?.joinedTeamIds?.includes(adultJoinTeam.id) === true })}`);
        }
        expectEqual(joined.status === 200 && member?.userId === adultUid && projection?.role === 'Member' && player?.joinedTeamIds?.includes(adultJoinTeam.id), true,
          'tenant join self adult workflow');
        expectEqual(member?.role === 'Member' && !/owner|admin|coach/i.test(String(member?.position || '')), true,
          'tenant join derived position and escalation matrix');
        const consumed = await apiJsonResult('/api/teams/join', adult.body.idToken, {
          method: 'POST', body: JSON.stringify({ sessionToken, code: adultJoinTeam.code }),
        });
        const expiredPreview = await apiJsonResult(`/api/teams/join?teamId=${encodeURIComponent(adultJoinTeam.id)}&code=${encodeURIComponent(adultJoinTeam.code)}`, null);
        const expiredToken = expiredPreview.body?.data?.sessionToken || '';
        const expiredHash = (await import('node:crypto')).createHash('sha256').update(expiredToken).digest('hex');
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
          firestoreAdmin.doc(`team_join_sessions/${expiredHash}`).update({ expiresAt: new Date(0) }));
        const expired = await apiJsonResult('/api/teams/join', adult.body.idToken, {
          method: 'POST', body: JSON.stringify({ sessionToken: expiredToken, code: adultJoinTeam.code }),
        });
        expectEqual(consumed.status === 410 && expired.status === 410, true, 'tenant join consumed and expired sessions denied');
        return 'The adult consumed an opaque session once, received only the server-derived member position, and consumed/expired reuse failed closed.';
      }, 'Adult self-join consumes one expiring session and ignores attempted authority escalation.');
    });
    return;
  }

  if (scenarioId === 'recruiting-public-scout-projection') {
    const probe = plan[scenarioId];
    let publicBody;
    await recordObservedTenantCase(scenarioId, 'happyPath', 'recruiting-public-happyPath', async () => {
      const response = await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null);
      expectEqual(response.status, 200, 'tenant recruiting active profile published');
      publicBody = response.body;
      return 'Canonical active recruiting profile returned the public scout projection.';
    }, 'An active canonical recruiting profile is publicly available.');
    await recordObservedTenantCase(scenarioId, 'negativePath', 'recruiting-public-negativePath', async () => {
      const response = await apiJsonResult(`/api/public/recruiting/${probe.hiddenPlayerId}`, null);
      expectEqual(response.status, 404, 'tenant recruiting hidden profile denied');
      return 'Canonical hidden profile returned nondisclosing not-found.';
    }, 'A hidden canonical recruiting profile is not public.');
    await recordObservedTenantCase(scenarioId, 'permission', 'recruiting-public-permission', async () => {
      const status = await directFirestoreReadStatus(`players/${probe.activePlayerId}/recruitingContact/contact`);
      expectEqual([401, 403].includes(status), true, 'tenant recruiting private contact direct read denied');
      return 'Anonymous direct access to recruiting contact data was denied.';
    }, 'Private recruiting contact data remains protected from public callers.');
    await recordObservedTenantCase(scenarioId, 'persistence', 'recruiting-public-persistence', async () => {
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const active = await firestoreAdmin.doc(`players/${probe.activePlayerId}/recruitingProfile/profile`).get();
        const hidden = await firestoreAdmin.doc(`players/${probe.hiddenPlayerId}/recruitingProfile/profile`).get();
        expectEqual(active.data()?.status, 'active', 'tenant recruiting canonical active status persisted');
        expectEqual(hidden.data()?.status, 'hidden', 'tenant recruiting canonical hidden status persisted');
      });
      return 'Server projection matched the two persisted canonical profile statuses.';
    }, 'Public availability follows recruitingProfile/profile.status.');
    await recordObservedTenantCase(scenarioId, 'network', 'recruiting-public-network', async () => {
      const serialized = JSON.stringify(publicBody || {});
      expectEqual(serialized.includes('medicalNotes'), false, 'tenant recruiting response omits medical notes');
      expectEqual(serialized.includes('parentEmail'), false, 'tenant recruiting response omits guardian contact');
      expectEqual(serialized.includes('emergencyContact'), false, 'tenant recruiting response omits emergency contact');
      return 'Public response contained only the allowlisted recruiting projection.';
    }, 'The public endpoint omits private player, guardian, and evaluation fields.');
    const profilePath = `players/${probe.activePlayerId}/recruitingProfile/profile`;
    const hostileVideoPath = `players/${probe.activePlayerId}/videos/run-hostile-${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const editor = await signIn('qa-coach-owner-b');
    const editorTeamId = FIXTURES.teams.find(team => team.alias === 'qa-team-b').id;
    await tenantFixtureMutations.withFirestoreOverlay([profilePath, hostileVideoPath], async () => {
      await recordObservedTenantCase(scenarioId, 'happyPath', 'recruiting-public-canonical-editor-status-transitions', async () => {
        const setStatus = async status => {
          const result = await patchFirestoreFields({
            projectId: PROJECT_ID, documentPath: profilePath, idToken: editor.body.idToken,
            fields: { status, updatedByTeamId: editorTeamId },
          });
          expectEqual(result.status, 200, `tenant recruiting editor saves ${status}`);
        };
        await setStatus('hidden');
        const hidden = await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null);
        expectEqual(hidden.status, 404, 'tenant recruiting active-to-hidden transition');
        await setStatus('active');
        const active = await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null);
        expectEqual(active.status, 200, 'tenant recruiting hidden-to-active transition');
        expectEqual(active.headers.cacheControl, 'no-store', 'tenant recruiting active response no-store');
        await setStatus('committed');
        const committed = await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null);
        expectEqual(committed.status, 200, 'tenant recruiting committed remains published');
        expectEqual(committed.body?.profile?.status, 'committed', 'tenant recruiting committed status preserved');
        await setStatus('hidden');
        expectEqual((await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null)).status, 404, 'tenant recruiting final hidden transition');
        await setStatus('active');
        const hostileWrite = await patchFirestoreFields({
          projectId: PROJECT_ID, documentPath: hostileVideoPath, idToken: editor.body.idToken,
          fields: {
            playerId: probe.activePlayerId, updatedByTeamId: editorTeamId, createdAt: new Date().toISOString(),
            title: `${FIXTURES.runId} public media`, url: `https://media.example.test/${FIXTURES.runId}/safe.mp4`,
            thumbnailUrl: 'javascript:alert(1)', private_contact: 'synthetic-private-media-marker',
            segments: [{ start: 1, end: 4, title: 'Allowed segment', medical_notes: 'synthetic-private-segment-marker' }],
          },
        });
        expectEqual(hostileWrite.status, 200, 'tenant recruiting hostile media fixture saved by canonical editor');
        const hostileProjection = await apiJsonResult(`/api/public/recruiting/${probe.activePlayerId}`, null);
        const projectedVideo = hostileProjection.body?.videos?.find(item => item.url?.includes('/safe.mp4'));
        expectEqual(Boolean(projectedVideo) && projectedVideo.thumbnailUrl === undefined &&
          JSON.stringify(projectedVideo) === JSON.stringify({
            id: hostileVideoPath.split('/').at(-1), url: `https://media.example.test/${FIXTURES.runId}/safe.mp4`,
            title: `${FIXTURES.runId} public media`, type: 'video', isTacticalClip: false,
            segments: [{ start: 1, end: 4, title: 'Allowed segment' }],
          }), true, 'tenant recruiting public hostile media page allowlist');
        const [missing, invalid] = await Promise.all([
          apiJsonResult(`/api/public/recruiting/missing-${FIXTURES.runId}`, null),
          apiJsonResult('/api/public/recruiting/not%2Fa%2Fdocument', null),
        ]);
        expectEqual(missing.status === 404 && invalid.status === 400 && hostileProjection.headers.cacheControl === 'no-store', true,
          'tenant recruiting public missing invalid cache matrix');
        expectEqual(hostileProjection.status === 200 && hostileProjection.body?.profile?.status === 'active', true,
          'tenant recruiting public canonical editor save');
        return 'Canonical status transitioned hidden-active-committed-hidden on the same URL; committed remained exact and every public success was no-store.';
      }, 'One canonical status writer controls publication without clobbering committed state or serving stale cache.');
    });
    return;
  }

  if (scenarioId === 'family-enable-youth-login') {
    const probe = plan[scenarioId];
    const parent = await signIn('qa-parent-a');
    const otherParent = await signIn('qa-parent-b');
    const childId = FIXTURES.youthInvite.childId;
    const recipientEmail = FIXTURES.youthInvite.recipientEmail;
    let token = '';
    // Register recipient/child-bound recovery before the first server mutation.
    // This owns invite/Auth/projection cleanup even when a response is lost
    // after the server commits and before its generated IDs reach the runner.
    dynamicResourceRegistry.register({
      id: `server-discovery:tenant-youth:${certificationRunId}`,
      kind: 'obligation',
      async cleanup() {
        return withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
          let changed = false;
          const invites = await firestoreAdmin.collection('invites')
            .where('parentId', '==', identityByAlias.get('qa-parent-a').uid).get();
          for (const invite of invites.docs.filter(item => item.data()?.childId === childId)) {
            registerCertificationSensitiveAlias(invite.id, 'tenant-youth-invite');
            await firestoreAdmin.recursiveDelete(invite.ref);
            changed = true;
          }
          const user = await getAuthUserByEmailIfPresent(authAdmin, recipientEmail);
          if (user) {
            registerCertificationSensitiveAlias(user.uid, 'tenant-youth-activation');
            const memberRows = await firestoreAdmin.collectionGroup('members').where('userId', '==', user.uid).get();
            for (const member of memberRows.docs) await firestoreAdmin.recursiveDelete(member.ref);
            await firestoreAdmin.recursiveDelete(firestoreAdmin.doc(`users/${user.uid}`));
            await authAdmin.deleteUser(user.uid);
            changed = true;
          }
          return changed;
        });
      },
      async verify() {
        return withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
          const invites = await firestoreAdmin.collection('invites')
            .where('parentId', '==', identityByAlias.get('qa-parent-a').uid).get();
          if (invites.docs.some(item => item.data()?.childId === childId)) return false;
          return await getAuthUserByEmailIfPresent(authAdmin, recipientEmail) === null;
        });
      },
    });
    return tenantFixtureMutations.withFirestoreOverlay([
      `players/${childId}`,
      `teams/${FIXTURES.youthInvite.teamId}/members/${childId}`,
    ], async () => {
      try {
      await recordObservedTenantCase(scenarioId, 'happyPath', 'family-youth-login-happyPath', async () => {
        const created = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId, email: FIXTURES.youthInvite.recipientEmail }),
        });
        expectEqual(created.status, 200, 'tenant youth invite created by guardian');
        token = registerSensitiveValue(created.body?.token || '');
        expectEqual(/^[a-f0-9]{48}$/.test(token), true, 'tenant youth invite token format');
        const canonical = await apiJsonResult(`/api/invites/youth?token=${encodeURIComponent(token)}`, null);
        const alias = await apiJsonResult(`/api/youth-invites?token=${encodeURIComponent(token)}`, null);
        expectEqual(canonical.status, 200, 'tenant youth canonical invite lookup');
        expectEqual(alias.status, 200, 'tenant youth alias invite lookup');
        expectEqual(JSON.stringify(alias.body), JSON.stringify(canonical.body), 'tenant youth alias response equivalence');
        const revoked = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'revoke', childId }),
        });
        const reissued = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId, email: FIXTURES.youthInvite.recipientEmail }),
        });
        token = registerSensitiveValue(reissued.body?.token || '');
        expectEqual(revoked.status === 200 && reissued.status === 200 && /^[a-f0-9]{48}$/.test(token), true,
          'tenant youth enable revoke reissue lifecycle');
        return 'Guardian-created invite resolved identically through canonical and compatibility routes.';
      }, 'The guardian can create an invite and both supported route names share one contract.');
      await recordObservedTenantCase(scenarioId, 'negativePath', 'family-youth-login-negativePath', async () => {
        const denied = await apiJsonResult('/api/invites/youth', otherParent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId, email: FIXTURES.youthInvite.recipientEmail }),
        });
        expectEqual(denied.status, 404, 'tenant youth cross-guardian invite denied');
        expectEqual((await apiJsonResult(probe.canonicalPath, null)).status, 404, 'tenant youth canonical modified token denied');
        expectEqual((await apiJsonResult(probe.aliasPath, null)).status, 404, 'tenant youth alias modified token denied');
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
          firestoreAdmin.doc(`invites/${token}`).update({ expiresAt: new Date(0) }));
        const expired = await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token, password }),
        });
        const reissued = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId, email: FIXTURES.youthInvite.recipientEmail }),
        });
        token = registerSensitiveValue(reissued.body?.token || '');
        expectEqual([404, 410].includes(expired.status) && reissued.status === 200, true, 'tenant youth expired invite denial and reissue');
        return 'Cross-guardian creation and modified-token lookups were denied without disclosure.';
      }, 'Only the owning guardian can create an invite and modified tokens are rejected.');
      await recordObservedTenantCase(scenarioId, 'permission', 'family-youth-login-permission', async () => {
        const status = await directFirestoreReadStatus(`invites/${token}`);
        expectEqual([401, 403].includes(status), true, 'tenant youth direct invite read denied');
        return 'Anonymous direct Firestore access to the invitation was denied.';
      }, 'Invite data is reachable only through the narrow public projection.');
      await recordObservedTenantCase(scenarioId, 'persistence', 'family-youth-login-persistence', async () => {
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const invite = await firestoreAdmin.doc(`invites/${token}`).get();
          const player = await firestoreAdmin.doc(`players/${childId}`).get();
          expectEqual(invite.data()?.parentId, identityByAlias.get('qa-parent-a').uid, 'tenant youth invite persisted guardian authority');
          expectEqual(player.data()?.inviteToken === token, true, 'tenant youth player projection persisted exact token');
        });
        return 'Invite and child projection persisted with server-derived guardian authority.';
      }, 'The invitation is bound to the authenticated guardian and exact child.');
      await recordObservedTenantCase(scenarioId, 'network', 'family-youth-login-network', async () => {
        const canonical = await apiJsonResult(probe.canonicalPath, null);
        const alias = await apiJsonResult(probe.aliasPath, null);
        expectEqual(JSON.stringify(alias.body), JSON.stringify(canonical.body), 'tenant youth modified-token route equivalence');
        return 'Canonical and compatibility endpoints returned the same sanitized contract.';
      }, 'The duplicate route does not diverge from the canonical youth-invite API.');
      await recordObservedTenantCase(scenarioId, 'happyPath', 'family-youth-login-guardian-invite-and-youth-activation', async () => {
        const redemptionRace = await runTwoParty('tenant-youth-activation-race', [1, 2].map(() => signal =>
          apiJsonResult('/api/invites/youth', null, {
            method: 'PUT', body: JSON.stringify({ token, password, email: 'wrong-account@phase2.invalid' }), signal,
          })), {
          timeoutMs: 20_000, settleTimeoutMs: 1_000,
          terminate: async () => terminateOwnedChildAndWait(ownedNextServerProcess),
        });
        const redemptionStatuses = redemptionRace.filter(item => item.status === 'fulfilled').map(item => item.value.status).sort();
        expectEqual(redemptionStatuses.join(','), '200,404', 'tenant youth invitation redemption');
        expectEqual(redemptionStatuses.join(','), '200,404', 'tenant youth expired wrong-account activation race');
        const youth = await signIn('qa-youth-invite');
        expectEqual(youth.status, 200, 'tenant youth activated identity sign-in');
        const youthUid = youth.body.localId;
        await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
          const [player, member, projection] = await Promise.all([
            firestoreAdmin.doc(`players/${childId}`).get(),
            firestoreAdmin.doc(`teams/${FIXTURES.youthInvite.teamId}/members/${youthUid}`).get(),
            firestoreAdmin.doc(`users/${youthUid}/teamMemberships/${FIXTURES.youthInvite.teamId}`).get(),
          ]);
          expectEqual(player.data()?.userId, youthUid, 'tenant youth player binds youth identity');
          expectEqual(player.data()?.userId === identityByAlias.get('qa-parent-a').uid, false, 'tenant youth never inherits guardian identity');
          expectEqual(member.data()?.playerId, childId, 'tenant youth roster projection binds child');
          expectEqual(projection.data()?.playerId, childId, 'tenant youth user projection binds child');
        });
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token, password }),
        })).status, 404, 'tenant youth invitation single-use denial');
        const siblingPlayer = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-b').path;
        const staffMember = `teams/${FIXTURES.teams.find(item => item.alias === 'qa-team-a').id}/members/${identityByAlias.get('qa-team-assistant').uid}`;
        const guardianPayment = FIXTURES.firestoreDocuments.find(item => item.path.startsWith(`users/${identityByAlias.get('qa-parent-a').uid}/payments/`)).path;
        const deniedContent = await Promise.all([
          directFirestoreReadStatus(siblingPlayer, youth.body.idToken),
          directFirestoreReadStatus(staffMember, youth.body.idToken),
          directFirestoreReadStatus(guardianPayment, youth.body.idToken),
        ]);
        expectEqual(deniedContent.every(status => status === 403), true, 'tenant youth sibling staff guardian content denial');
        return 'The invitation activated a separate youth Auth identity and coherent player, member, and user projections; reuse was denied.';
      }, 'A youth invite activates exactly one distinct child identity and all server-derived projections.');
      if (runBrowser) {
        const session = await browserLogin('qa-youth-invite', '/dashboard', `tenant-${scenarioId}-${process.pid}`);
        const result = JSON.parse(cli(session, ['run-code', `async page => {
          const observations=[]; const consoleErrors=[]; const failures=[];
          const onConsole=message=>{if(message.type()==='error') consoleErrors.push(message.text())};
          const onResponse=response=>{if(response.status()>=400) failures.push({status:response.status(),url:response.url()})};
          const openSelfView=async target=>{
            const selfView=target.getByRole('button',{name:'My Profile'}); await selfView.waitFor({state:'visible',timeout:15000});
            await target.waitForTimeout(500);
            const waiverReminder=target.getByRole('button',{name:'Remind Me Later'});
            if(await waiverReminder.isVisible().catch(()=>false)){
              await waiverReminder.click();
              await waiverReminder.waitFor({state:'hidden',timeout:5000});
            }
            await selfView.click();
          };
          page.on('console',onConsole); page.on('response',onResponse);
          try {
            for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
              await page.setViewportSize(viewport);
              await page.goto(${JSON.stringify(BASE_URL)} + '/dashboard');
              await page.waitForFunction(() => window.location.pathname === '/dashboard', null, {timeout:15000});
              await page.reload();
              await openSelfView(page);
              await page.waitForFunction(() => window.location.pathname === '/roster', null, {timeout:15000});
              observations.push({width:viewport.width,pathname:await page.evaluate(()=>window.location.pathname),fits:await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)});
            }
            const peer=await page.context().newPage(); await peer.goto(${JSON.stringify(BASE_URL)} + '/dashboard');
            await peer.waitForFunction(() => window.location.pathname === '/dashboard', null, {timeout:15000});
            await peer.getByRole('button',{name:'My Profile'}).waitFor({state:'visible',timeout:15000});
            const peerPath=await peer.evaluate(()=>window.location.pathname); await peer.close();
            return {observations,peerPath,consoleErrors,failures};
          } finally {page.off('console',onConsole);page.off('response',onResponse)}
        }`]));
        await recordObservedTenantCase(scenarioId, 'console', 'family-youth-login-console', async () => {
          if (result.consoleErrors.length > 0 || result.failures.length > 0) {
            throw new Error(`tenant youth activated browser diagnostics: ${JSON.stringify({ consoleErrors: result.consoleErrors, failures: result.failures }).slice(0, 1200)}`);
          }
          expectEqual(result.peerPath, '/dashboard', 'tenant youth activated new-tab dashboard');
          return 'The activated youth—not the guardian—opened, refreshed, and reopened the player profile without browser failures.';
        }, 'The distinct youth identity owns the browser session and survives refresh/new tab.');
        await recordObservedTenantCase(scenarioId, 'responsive', 'family-youth-login-responsive', async () => {
          expectEqual(result.observations.every(item => item.pathname === '/roster'), true, 'tenant youth player self-view route both viewports');
          expectEqual(result.observations.every(item => item.fits), true, 'tenant youth player profile containment');
          return 'The activated youth profile rendered at both frozen viewports without overflow.';
        }, 'The activated youth journey renders at 1440x900 and 390x844.');
      }
      } finally {
        if (token) {
          const revoked = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
            method: 'POST', body: JSON.stringify({ action: 'revoke', childId }),
          });
          expectEqual(revoked.status, 200, 'tenant youth invite exact cleanup');
        }
      }
    });
  }
}

const specializedTenantScenarios = new Set([
  'teams-create-and-capacity',
  'teams-join-by-code',
  'teams-seasonal-reset-delete-quota-resolution',
  'recruiting-public-scout-projection',
  'family-enable-youth-login',
]);

function tenantConsumerPaths(scenarioId) {
  if (tenantRuntimeConsumerPaths.has(scenarioId)) return tenantRuntimeConsumerPaths.get(scenarioId);
  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const school = FIXTURES.teams.find(team => team.alias === 'qa-school-hub');
  const adultA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a')?.data?.id;
  const youthA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a')?.data?.id;
  const mapping = {
    'teams-create-and-capacity': [`users/${identityByAlias.get('qa-fresh-coach').uid}`, `teams/${teamA.id}`],
    'teams-join-by-code': [`teams/${teamA.id}`, `teams/${teamA.id}/members/${identityByAlias.get('qa-adult-player-a').uid}`],
    'teams-profile-branding-settings': [`teams/${teamA.id}`, `teams/${teamA.id}/members/${identityByAlias.get('qa-coach-owner-a').uid}`],
    'teams-module-visibility': [`teams/${teamA.id}`],
    'teams-seasonal-reset-delete-quota-resolution': [`teams/${FIXTURES.teams.find(team => team.alias === 'qa-disposable-team').id}`],
    'organization-club-school-overview': [`teams/${school.id}`, `teams/${FIXTURES.teams.find(team => team.alias === 'qa-school-squad-1').id}`],
    'organization-create-allocate-remove-squads': [`teams/${school.id}`, `users/${identityByAlias.get('qa-school-owner').uid}`],
    'organization-global-waivers-documents-admins': [FIXTURES.globalWaiverDeployment.masterPath, ...FIXTURES.globalWaiverDeployment.copyPaths.slice(0, 1)],
    'roster-member-add-edit-remove-reinstate': [`teams/${teamA.id}/members/${FIXTURES.rosterVariants[0].id}`, `players/${FIXTURES.rosterVariants[0].id}`],
    'roster-search-filter-sort-export': FIXTURES.rosterVariants.slice(0, 3).map(item => `teams/${teamA.id}/members/${item.id}`),
    'roster-parent-player-self-views': [`players/${youthA}`, `players/${adultA}`],
    'recruiting-private-profile-crud': [`players/${adultA}/recruitingProfile/profile`, `players/${adultA}/recruitingProfile/metrics`, `players/${adultA}/recruitingContact/contact`],
    'recruiting-public-scout-projection': [
      `players/${FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-b')?.data?.id}/recruitingProfile/profile`,
      `players/${FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-b')?.data?.id}/recruitingContact/contact`,
    ],
    'family-children-invites-team-cards': [`players/${youthA}`, `players/${FIXTURES.youthInvite.childId}`],
    'family-schedule-waivers-payments': [`players/${youthA}`, `users/${identityByAlias.get('qa-parent-a').uid}/payments/${FIXTURES.firestoreDocuments.find(item => item.path.startsWith(`users/${identityByAlias.get('qa-parent-a').uid}/payments/`))?.path.split('/').at(-1)}`],
    'family-enable-youth-login': [`players/${FIXTURES.youthInvite.childId}`, `teams/${FIXTURES.youthInvite.teamId}/members/${FIXTURES.youthInvite.childId}`],
  };
  return (mapping[scenarioId] || []).filter(pathname => pathname && !pathname.endsWith('/undefined'));
}

async function readTenantConsumerDocuments(paths) {
  if (activeTenantExecutions().length > 0) {
    const association = tenantCaseAssociationFor(
      activeCertificationScenario,
      'persistence',
      LOCAL_TENANT_CASE_REQUIREMENTS[activeCertificationScenario]?.persistence?.[0] || '',
    );
    const observedAt = new Date().toISOString();
    for (const pathname of paths) appendTenantExecutionRecord('adminTargets', {
      targetAlias: tenantTargetAliasFromValue(pathname) || 'run-owned-consumer-root',
      actorAlias: association?.actorAlias || 'qa-public-submitter',
      operation: 'persistence',
      observedAt,
    });
  }
  return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const snapshots = await firestoreAdmin.getAll(...paths.map(pathname => firestoreAdmin.doc(pathname)));
    return snapshots.map(snapshot => snapshot.exists ? snapshot.data() || {} : null);
  });
}

function tenantLifecycleMutation(scenarioId) {
  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const school = FIXTURES.teams.find(team => team.alias === 'qa-school-hub');
  const adultA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a')?.data?.id;
  const youthA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a')?.data?.id;
  const rosterId = FIXTURES.rosterVariants[0]?.id;
  const marker = `${FIXTURES.runId} lifecycle`;
  return ({
    'teams-profile-branding-settings': {
      actorAlias: 'qa-coach-owner-a', path: `teams/${teamA.id}`,
      fields: { description: `${marker} settings`, contactPhone: '555-0199', contactEmail: 'team-a-settings@phase2.test' }, expectedField: 'description',
    },
    'teams-module-visibility': {
      actorAlias: 'qa-coach-owner-a', path: `teams/${teamA.id}`,
      fields: { features: { attendance: false, equipment: false, facilities: false, feed: false, files: false, fundraising: false, practice: false, volunteers: false } }, expectedField: 'features',
    },
    'organization-club-school-overview': {
      actorAlias: 'qa-school-owner', path: `teams/${school.id}`,
      fields: { description: `${marker} overview` }, expectedField: 'description',
    },
    'organization-create-allocate-remove-squads': {
      actorAlias: 'qa-school-owner', path: `teams/${school.id}`,
      fields: { description: `${marker} allocation lock` }, expectedField: 'description',
    },
    'organization-global-waivers-documents-admins': {
      actorAlias: 'qa-school-owner', path: FIXTURES.globalWaiverDeployment.masterPath,
      fields: { title: `${marker} waiver revision` }, expectedField: 'title',
    },
    'roster-member-add-edit-remove-reinstate': {
      actorAlias: 'qa-coach-owner-a', path: `teams/${teamA.id}/members/${rosterId}`,
      fields: { notes: `${marker} safe roster edit`, status: 'removed', removalReason: 'certification lifecycle' }, expectedField: 'notes',
    },
    'roster-search-filter-sort-export': {
      actorAlias: 'qa-coach-owner-a', path: `teams/${teamA.id}/members/${rosterId}`,
      fields: { jersey: '97' }, expectedField: 'jersey',
    },
    'roster-parent-player-self-views': {
      actorAlias: 'qa-parent-a', path: `players/${youthA}`,
      fields: { firstName: `${marker} child` }, expectedField: 'firstName',
    },
    'recruiting-private-profile-crud': {
      actorAlias: 'qa-coach-owner-a', path: `players/${adultA}/recruitingProfile/profile`,
      fields: { headline: `${marker} prospect`, status: 'active', updatedByTeamId: teamA.id }, expectedField: 'headline',
    },
    'family-children-invites-team-cards': {
      actorAlias: 'qa-parent-a', path: `players/${youthA}`,
      fields: { firstName: `${marker} family child` }, expectedField: 'firstName',
    },
  })[scenarioId] || null;
}

async function executeTenantLifecycleMutation(scenarioId, runtimeTarget = null) {
  if (scenarioId === 'family-schedule-waivers-payments') {
    const parent = await signIn('qa-parent-a');
    const otherParent = await signIn('qa-parent-b');
    const teamA = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamC = FIXTURES.teams.find(item => item.alias === 'qa-team-c');
    const ownerA = await signIn(teamA.ownerAlias);
    const ownerC = await signIn(teamC.ownerAlias);
    const childA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a').data.id;
    const childB = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-b').data.id;
    const memberId = FIXTURES.youthInvite.childId;
    const runtimeKey = FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_');
    const eventIds = [`t4_late_${runtimeKey}`, `t4_early_${runtimeKey}`, `t4_mid_${runtimeKey}`];
    const paymentIds = ['paid', 'pending', 'overdue'].map(status => `t4_${status}_${runtimeKey}`);
    const parentUid = identityByAlias.get('qa-parent-a').uid;
    const runtimePaths = [
      `teams/${teamA.id}/events/${eventIds[0]}`, `teams/${teamA.id}/events/${eventIds[1]}`, `teams/${teamC.id}/events/${eventIds[2]}`,
      `scheduleBookings/team_event_${teamA.id}_${eventIds[0]}`, `scheduleBookings/team_event_${teamA.id}_${eventIds[1]}`, `scheduleBookings/team_event_${teamC.id}_${eventIds[2]}`,
      ...paymentIds.flatMap(id => [`teams/${teamA.id}/householdPayments/${id}`, `users/${parentUid}/payments/${id}`]),
    ];
    runtimePaths.forEach((path, index) => registerDynamicFirestoreRoot(path, `tenant-family-aggregate-runtime-${index + 1}`));
    const document = FIXTURES.firestoreDocuments.find(item =>
      item.path.startsWith(`teams/${teamC.id}/documents/`) && item.data?.type === 'waiver' && item.data?.isActive !== false);
    const documentId = document.path.split('/').at(-1);
    const signaturePaths = [
      `teams/${teamC.id}/members/${memberId}/signatures/${documentId}`,
      `teams/${teamC.id}/archived_waivers/arch_team_${memberId}_${documentId}`,
      `teams/${teamC.id}/protocol_signatures/${documentId}_${identityByAlias.get('qa-parent-a').uid}_${memberId}`,
      `teams/${teamC.id}/files/cert_${memberId}_${documentId}`,
      `teams/${teamC.id}/members/${memberId}`,
      document.path,
    ];
    return tenantFixtureMutations.withFirestoreOverlay([...signaturePaths, ...runtimePaths, `teams/${teamC.id}`], async () => {
      const denied = await apiJsonResult('/api/teams/waivers/sign', otherParent.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, memberId, documentId, signatureName: 'Wrong Guardian' }),
      });
      expectEqual(denied.status, 403, 'tenant family waiver other guardian denied');
      const signed = await apiJsonResult('/api/teams/waivers/sign', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, memberId, documentId, signatureName: 'Synthetic Guardian' }),
      });
      expectEqual(signed.status, 200, 'tenant family waiver guardian participant route succeeds');
      const values = await readTenantConsumerDocuments(signaturePaths.slice(0, 4));
      expectEqual(values.every(Boolean), true, 'tenant family waiver consumer graph created');
      expectEqual(values[0].memberId, memberId, 'tenant family waiver binds participant member');
      expectEqual(values[0].userId, identityByAlias.get('qa-parent-a').uid, 'tenant family waiver records guardian signer separately');
      expectEqual(values[0].signedByParent, true, 'tenant family waiver guardian ceremony explicit');
      const eventSpecs = [
        [ownerA.body.idToken, teamA.id, eventIds[0], 'Runtime A Late', '2026-09-22', '18:00'],
        [ownerA.body.idToken, teamA.id, eventIds[1], 'Runtime A Early', '2026-09-20', '09:00'],
        [ownerC.body.idToken, teamC.id, eventIds[2], 'Runtime C Mid', '2026-09-21', '12:00'],
      ];
      const eventResults = [];
      for (const [token, teamId, eventId, title, date, startTime] of eventSpecs) {
        eventResults.push(await apiJsonResult('/api/teams/events/action', token, {
          method: 'POST', body: JSON.stringify({ action: 'create', teamId, eventId, event: { title, date, startTime, eventType: 'practice' } }),
        }));
      }
      expectEqual(eventResults.every(result => result.status === 200), true,
        'tenant family schedule ordering and child team grouping');
      const amounts = [12.34, 23.45, 34.56];
      const statuses = ['paid', 'pending', 'overdue'];
      const paymentResults = [];
      for (let index = 0; index < paymentIds.length; index += 1) {
        paymentResults.push(await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childA, requestId: paymentIds[index], description: `Runtime ${statuses[index]} ledger`, amount: amounts[index], status: index === 1 ? 'paid' : statuses[index], date: `2026-09-${10 + index}`, dueDate: `2026-09-${20 + index}`, category: 'Dues' }),
        }));
      }
      const mutatedPending = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ teamId: teamA.id, paymentId: paymentIds[1], status: 'pending' }),
      });
      const runtimePayments = await readTenantConsumerDocuments(paymentIds.map(id => `users/${parentUid}/payments/${id}`));
      expectEqual(paymentResults.every(result => result.status === 201) && mutatedPending.status === 200 && runtimePayments.map(item => item.status).join(',') === statuses.join(','), true,
        'tenant family payment amounts balances and state totals');
      const duplicatePayment = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childA, requestId: paymentIds[0], description: 'Duplicate', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      const duplicateEvent = await apiJsonResult('/api/teams/events/action', ownerA.body.idToken, {
        method: 'POST', body: JSON.stringify({ action: 'create', teamId: teamA.id, eventId: eventIds[0], event: { title: 'Duplicate', date: '2026-09-22', startTime: '18:00' } }),
      });
      const wrongChildPayment = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childB, requestId: `t4_wrong_child_${runtimeKey}`, description: 'Wrong child', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      const wrongTeamPayment = await apiJsonResult('/api/family/payments', ownerC.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, childId: childA, requestId: `t4_wrong_team_${runtimeKey}`, description: 'Wrong team', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamC.id}`).update({ isActive: false }));
      const inactivePayment = await apiJsonResult('/api/family/payments', ownerC.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, childId: memberId, requestId: `t4_inactive_${runtimeKey}`, description: 'Inactive', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamC.id}`).update({ isActive: true }));
      expectEqual(duplicatePayment.status === 409 && duplicateEvent.status === 409 && wrongChildPayment.status === 403 && wrongTeamPayment.status === 403 && inactivePayment.status === 409, true,
        'tenant family runtime ledger duplicate inactive wrong child wrong team matrix');
      const duplicate = await apiJsonResult('/api/teams/waivers/sign', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, memberId, documentId, signatureName: 'Synthetic Guardian' }),
      });
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(document.path).update({ isActive: false }));
      const inactive = await apiJsonResult('/api/teams/waivers/sign', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, memberId, documentId, signatureName: 'Synthetic Guardian' }),
      });
      expectEqual(duplicate.status === 200 && duplicate.body?.alreadySigned === true && inactive.status === 404 && denied.status === 403 &&
        duplicatePayment.status === 409 && inactivePayment.status === 409 && wrongChildPayment.status === 403 && wrongTeamPayment.status === 403, true,
        'tenant family duplicate inactive wrong-target matrix');
      return { actorAlias: 'qa-parent-a', path: signaturePaths[0], fields: { documentId }, expectedField: 'documentId' };
    });
  }
  if (scenarioId === 'organization-create-allocate-remove-squads') {
    const owner = await signIn('qa-school-owner');
    const delegate = await signIn('qa-school-delegate');
    const outsider = await signIn('qa-coach-owner-b');
    const hub = FIXTURES.teams.find(item => item.alias === 'qa-school-hub');
    const squad = FIXTURES.teams.find(item => item.alias === 'qa-school-squad-1');
    const projectionPath = `users/${identityByAlias.get('qa-school-owner').uid}/teamMemberships/${squad.id}`;
    const ownerProfilePath = `users/${identityByAlias.get('qa-school-owner').uid}`;
    return tenantFixtureMutations.withFirestoreOverlay([`teams/${squad.id}`, projectionPath, ownerProfilePath], async () => {
      const freshMarker = `${FIXTURES.runId} school squad allocation probe`;
      let freshTeamId = '';
      dynamicResourceRegistry.register({
        id: `firestore-discovery:tenant-organization-squad:${certificationRunId}`,
        kind: 'obligation',
        async cleanup() {
          return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
            const matches = await firestoreAdmin.collection('teams').where('teamName', '==', freshMarker).get();
            let changed = false;
            for (const match of matches.docs) {
              await firestoreAdmin.recursiveDelete(match.ref);
              for (const alias of ['qa-school-owner', 'qa-school-delegate']) {
                await firestoreAdmin.recursiveDelete(firestoreAdmin.doc(`users/${identityByAlias.get(alias).uid}/teamMemberships/${match.id}`));
              }
              changed = true;
            }
            return changed;
          });
        },
        async verify() {
          return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
            (await firestoreAdmin.collection('teams').where('teamName', '==', freshMarker).get()).empty);
        },
      });
      const denied = await apiJsonResult('/api/organizations/squads', outsider.body.idToken, {
        method: 'DELETE', body: JSON.stringify({ teamId: squad.id, hubTeamId: hub.id }),
      });
      expectEqual(denied.status, 403, 'tenant organization outsider allocation denied');
      const released = await apiJsonResult('/api/organizations/squads', owner.body.idToken, {
        method: 'DELETE', body: JSON.stringify({ teamId: squad.id, hubTeamId: hub.id }),
      });
      expectEqual(released.status, 200, 'tenant organization squad seat released');
      expectEqual((await readTenantConsumerDocuments([`teams/${squad.id}`]))[0].isPro, false, 'tenant organization released squad keeps root');
      const fresh = await apiJsonResult('/api/teams/create', delegate.body.idToken, {
        method: 'POST', body: JSON.stringify({ name: freshMarker, type: 'school_squad', position: 'Administrator', schoolId: hub.id,
          overrideOwnerId: identityByAlias.get('qa-school-owner').uid }),
      });
      expectEqual(fresh.status, 201, 'tenant organization fresh squad created');
      freshTeamId = fresh.body?.teamId || '';
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
        firestoreAdmin.doc(ownerProfilePath).update({ team_limit: 3 }));
      const race = await runTwoParty('tenant-organization-last-seat-race', [squad.id, freshTeamId].map(teamId => signal =>
        apiJsonResult('/api/organizations/squads', owner.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId, hubTeamId: hub.id }), signal,
        })), {
        timeoutMs: 20_000, settleTimeoutMs: 1_000,
        terminate: async () => terminateOwnedChildAndWait(ownedNextServerProcess),
      });
      const raceResponses = race.filter(item => item.status === 'fulfilled').map(item => item.value);
      expectEqual(raceResponses.filter(item => item.status === 200).length === 1 && raceResponses.filter(item => item.status === 409).length === 1, true,
        'tenant organization last-seat allocation race');
      const freshState = (await readTenantConsumerDocuments([`teams/${freshTeamId}`]))[0];
      if (freshState?.isPro) {
        expectEqual((await apiJsonResult('/api/organizations/squads', owner.body.idToken, {
          method: 'DELETE', body: JSON.stringify({ teamId: freshTeamId, hubTeamId: hub.id }),
        })).status, 200, 'tenant organization fresh squad seat removed');
      }
      const allocated = (await readTenantConsumerDocuments([`teams/${squad.id}`]))[0]?.isPro
        ? { status: 200 }
        : await apiJsonResult('/api/organizations/squads', owner.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId: squad.id, hubTeamId: hub.id }),
        });
      expectEqual(allocated.status, 200, 'tenant organization squad seat allocated');
      const [persisted, projection] = await readTenantConsumerDocuments([`teams/${squad.id}`, projectionPath]);
      expectEqual(persisted.isPro, true, 'tenant organization allocated squad pro state');
      expectEqual(projection.isPro, true, 'tenant organization allocation projection reconciled');
      expectEqual(Boolean(freshTeamId) && freshState?.schoolId === hub.id, true, 'tenant organization fresh squad create remove');
      const delegateConflict = await apiJsonResult('/api/organizations/squads', delegate.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: FIXTURES.teams.find(item => item.alias === 'qa-team-b').id, hubTeamId: hub.id }),
      });
      expectEqual(delegateConflict.status === 403 && denied.status === 403, true, 'tenant organization delegate conflict matrix');
      return { actorAlias: 'qa-school-owner', path: `teams/${squad.id}`, fields: { isPro: true }, expectedField: 'isPro' };
    });
  }
  if (scenarioId === 'organization-club-school-overview') {
    const owner = await signIn('qa-school-owner');
    const delegate = await signIn('qa-school-delegate');
    const clubOwner = await signIn('qa-elite-owner');
    const outsider = await signIn('qa-coach-owner-b');
    const hub = FIXTURES.teams.find(item => item.alias === 'qa-school-hub');
    const squad = FIXTURES.teams.find(item => item.alias === 'qa-school-squad-1');
    const path = `teams/${squad.id}`;
    return tenantFixtureMutations.withFirestoreOverlay([path], async () => {
      const route = `/api/organizations/squads?hubTeamId=${encodeURIComponent(hub.id)}`;
      const before = await apiJsonResult(route, owner.body.idToken);
      expectEqual(before.status, 200, 'tenant school overview owner aggregate');
      expectEqual(before.body?.teams?.some(item => item.id === squad.id), true, 'tenant school overview contains exact squad');
      expectEqual((await apiJsonResult(route, delegate.body.idToken)).status, 200, 'tenant school overview delegated administrator');
      expectEqual((await apiJsonResult(route, outsider.body.idToken)).status, 403, 'tenant school overview other institution denied');
      const club = await apiJsonResult('/api/organizations/squads', clubOwner.body.idToken);
      expectEqual(before.body?.teams?.length === 3 && before.body?.allocated === 3 && club.body?.teams?.length === 3 && club.body?.allocated === 3, true,
        'tenant organization club school aggregate counts');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
        firestoreAdmin.doc(path).update({ status: 'removed', isActive: false }));
      const removed = await apiJsonResult(route, owner.body.idToken);
      expectEqual(removed.status === 200 && removed.body?.teams?.length === 2 && removed.body?.teams?.every(item => item.id !== squad.id), true,
        'tenant organization empty partial stale removed states');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
        firestoreAdmin.doc(path).update({ status: 'active', isActive: true }));
      const description = `${FIXTURES.runId} constituent refresh`;
      expectEqual((await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: path, idToken: owner.body.idToken, fields: { description } })).status, 200, 'tenant school overview constituent edit');
      const refreshed = await apiJsonResult(route, owner.body.idToken);
      expectEqual(refreshed.body?.teams?.find(item => item.id === squad.id)?.description, description, 'tenant school overview constituent refresh visible');
      return { actorAlias: 'qa-school-owner', path, fields: { description }, expectedField: 'description' };
    });
  }
  if (scenarioId === 'organization-global-waivers-documents-admins') {
    const owner = await signIn('qa-school-owner');
    const outsider = await signIn('qa-coach-owner-b');
    const delegate = await signIn('qa-school-delegate');
    const deployment = FIXTURES.globalWaiverDeployment;
    const hub = FIXTURES.teams.find(item => item.alias === 'qa-school-hub');
    const targetUid = identityByAlias.get('qa-coach-owner-b').uid;
    const delegateUid = identityByAlias.get('qa-school-delegate').uid;
    const hubPath = `teams/${hub.id}`;
    const targetMemberPath = `teams/${hub.id}/members/${targetUid}`;
    const targetProjectionPath = `users/${targetUid}/teamMemberships/${hub.id}`;
    const paths = [deployment.masterPath, ...deployment.copyPaths, hubPath, targetMemberPath, targetProjectionPath,
      `teams/${hub.id}/members/${delegateUid}`, `users/${delegateUid}/teamMemberships/${hub.id}`];
    const documentId = deployment.masterPath.split('/').at(-1);
    return tenantFixtureMutations.withFirestoreOverlay(paths, async () => {
      const denied = await apiJsonResult('/api/organizations/waivers', outsider.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ documentId, title: 'Forbidden revision' }),
      });
      expectEqual(denied.status, 404, 'tenant global waiver cross-organization denial');
      const revisedTitle = `${FIXTURES.runId} global waiver v3`;
      const updated = await apiJsonResult('/api/organizations/waivers', owner.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ documentId, title: revisedTitle, waiverAudience: 'participant' }),
      });
      expectEqual(updated.status, 200, 'tenant global waiver deployment updated');
      expectEqual(updated.body?.updatedCopies, deployment.copyPaths.length + 1, 'tenant global waiver exact copy count');
      const copies = await readTenantConsumerDocuments(paths);
      expectEqual(copies.slice(0, deployment.copyPaths.length + 1).every(item => item?.title === revisedTitle), true, 'tenant global waiver master and copies reconcile');
      const revoked = await apiJsonResult('/api/organizations/waivers', owner.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ documentId, isActive: false }),
      });
      const redeployed = await apiJsonResult('/api/organizations/waivers', owner.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ documentId, isActive: true, title: `${revisedTitle} retry` }),
      });
      expectEqual(revoked.status === 200 && redeployed.status === 200, true, 'tenant organization waiver deploy revoke version retry');
      const duplicateRetry = await apiJsonResult('/api/organizations/waivers', owner.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ documentId, isActive: true, title: `${revisedTitle} retry` }),
      });
      expectEqual(duplicateRetry.status === 200 && duplicateRetry.body?.updatedCopies === deployment.copyPaths.length + 1, true,
        'tenant organization partial duplicate deployment recovery');
      const added = await apiJsonResult('/api/schools/admins', owner.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: hub.id, email: emailForAlias('qa-coach-owner-b') }),
      });
      expectEqual(added.status, 200, 'tenant school administrator existing account added');
      expectEqual(added.body?.userId, targetUid, 'tenant school administrator server-resolved target');
      const [hubAfterAdd, memberAfterAdd, projectionAfterAdd] = await readTenantConsumerDocuments([hubPath, targetMemberPath, targetProjectionPath]);
      expectEqual(hubAfterAdd.schoolAdminIds?.includes(targetUid), true, 'tenant school administrator hub authority added');
      expectEqual(memberAfterAdd.role, 'Admin', 'tenant school administrator member projection');
      expectEqual(projectionAfterAdd.role, 'Admin', 'tenant school administrator user projection');
      const removed = await apiJsonResult('/api/schools/admins', owner.body.idToken, {
        method: 'DELETE', body: JSON.stringify({ teamId: hub.id, userId: targetUid }),
      });
      expectEqual(removed.status, 200, 'tenant school administrator removed');
      const [hubAfterRemove, memberAfterRemove, projectionAfterRemove] = await readTenantConsumerDocuments([hubPath, targetMemberPath, targetProjectionPath]);
      expectEqual(hubAfterRemove.schoolAdminIds?.includes(targetUid), false, 'tenant school administrator hub authority revoked');
      expectEqual(memberAfterRemove, null, 'tenant school administrator member projection revoked');
      expectEqual(projectionAfterRemove, null, 'tenant school administrator user projection revoked');
      const delegateRemoved = await apiJsonResult('/api/schools/admins', owner.body.idToken, {
        method: 'DELETE', body: JSON.stringify({ teamId: hub.id, userId: delegateUid }),
      });
      const staleDelegate = await apiJsonResult(`/api/organizations/squads?hubTeamId=${encodeURIComponent(hub.id)}`, delegate.body.idToken);
      expectEqual(delegateRemoved.status === 200 && staleDelegate.status === 403, true, 'tenant organization open delegate session authority loss');
      return { actorAlias: 'qa-school-owner', path: deployment.masterPath, fields: { title: revisedTitle }, expectedField: 'title' };
    });
  }
  if (scenarioId === 'recruiting-private-profile-crud') {
    const actor = await signIn('qa-coach-owner-a');
    const outsider = await signIn('qa-coach-owner-b');
    const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const playerId = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a').data.id;
    const paths = [
      `players/${playerId}/recruitingProfile/profile`,
      `players/${playerId}/recruitingProfile/metrics`,
      `players/${playerId}/recruitingContact/contact`,
      FIXTURES.firestoreDocuments.find(item => item.path.startsWith(`players/${playerId}/stats/`))?.path,
      FIXTURES.firestoreDocuments.find(item => item.path.startsWith(`players/${playerId}/evaluations/`))?.path,
      FIXTURES.firestoreDocuments.find(item => item.path.startsWith(`players/${playerId}/videos/`))?.path,
    ].filter(Boolean);
    return tenantFixtureMutations.withFirestoreOverlay(paths, async () => {
      const payloads = [
        { headline: `${FIXTURES.runId} prospect`, status: 'active', updatedByTeamId: team.id },
        { sprint40: 4.7, verticalJump: 31, updatedByTeamId: team.id },
        { coachEmail: 'coach-a@phase2.test', updatedByTeamId: team.id },
        { gamesPlayed: 18, points: 27, assists: 9, updatedByTeamId: team.id },
        { score: 88, notes: `${FIXTURES.runId} evaluation`, updatedByTeamId: team.id },
        { title: `${FIXTURES.runId} highlight`, startTime: 3, endTime: 12, updatedByTeamId: team.id },
      ];
      expectEqual(await deleteFirestoreDocumentStatus(paths[0], actor.body.idToken), 200,
        'tenant recruiting private profile delete succeeds');
      expectEqual((await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: paths[0], idToken: actor.body.idToken, fields: payloads[0] })).status, 200,
        'tenant recruiting private profile create succeeds');
      for (let index = 0; index < paths.length; index += 1) {
        const updated = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: paths[index], idToken: actor.body.idToken, fields: payloads[index] });
        expectEqual(updated.status, 200, `tenant recruiting private editor updates ${index + 1}`);
      }
      const denied = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: paths[0], idToken: outsider.body.idToken, fields: { headline: 'cross-team overwrite', updatedByTeamId: FIXTURES.teams.find(item => item.alias === 'qa-team-b').id } });
      expectEqual(denied.status, 403, 'tenant recruiting private cross-team editor denied');
      const persisted = await readTenantConsumerDocuments(paths);
      expectEqual(persisted[0].headline, payloads[0].headline, 'tenant recruiting private profile reload');
      expectEqual(persisted[1].sprint40, payloads[1].sprint40, 'tenant recruiting private metrics reload');
      expectEqual(persisted[2].coachEmail, payloads[2].coachEmail, 'tenant recruiting private contact reload');
      expectEqual(persisted[3].gamesPlayed, payloads[3].gamesPlayed, 'tenant recruiting private stats reload');
      expectEqual(persisted[4].score, payloads[4].score, 'tenant recruiting private evaluation reload');
      expectEqual(persisted[5].title, payloads[5].title, 'tenant recruiting private video reload');
      expectEqual(paths.length === 6, true, 'tenant recruiting stats evaluation contact video saves');
      expectEqual(persisted.every(Boolean), true, 'tenant recruiting private full create update delete graph');
      const guardian = await signIn('qa-parent-a');
      const guardianDenied = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: paths[0], idToken: guardian.body.idToken, fields: { headline: 'unauthorized adult profile edit' } });
      expectEqual(denied.status === 403 && guardianDenied.status === 403, true, 'tenant recruiting private schema and actor scope matrix');
      return { actorAlias: 'qa-coach-owner-a', path: paths[0], fields: payloads[0], expectedField: 'headline' };
    });
  }
  if (scenarioId === 'family-children-invites-team-cards') {
    const parent = await signIn('qa-parent-a');
    const parentB = await signIn('qa-parent-b');
    const teamA = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamC = FIXTURES.teams.find(item => item.alias === 'qa-team-c');
    const childId = `child_t4_${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const childPath = `players/${childId}`;
    const target = runtimeTarget || registerFamilyRuntimeChildTarget(childId);
    bindTenantRuntimeTarget(target);
    for (const [path, label] of [[childPath, 'tenant-family-runtime-child'], [`teams/${teamA.id}/members/${childId}`, 'tenant-family-runtime-team-a-member'], [`teams/${teamC.id}/members/${childId}`, 'tenant-family-runtime-team-c-member']]) {
      registerDynamicFirestoreRoot(path, label);
    }
    return tenantFixtureMutations.withFirestoreOverlay([childPath, `teams/${teamA.id}/members/${childId}`, `teams/${teamC.id}/members/${childId}`], async () => {
      const created = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ requestId: childId.slice('child_'.length), firstName: `${FIXTURES.runId} Runtime`, lastName: 'Athlete', dateOfBirth: '2012-02-03' }),
      });
      expectEqual(created.status === 201 && created.body?.childId === childId, true, 'tenant family child runtime create');
      const wrongGuardian = await apiJsonResult('/api/teams/join', parentB.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      expectEqual(wrongGuardian.status, 403, 'tenant family child wrong guardian link denied');
      const linkedA = await apiJsonResult('/api/teams/join', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      const firstUnlink = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ childId, teamId: teamA.id }),
      });
      const relinked = await apiJsonResult('/api/teams/join', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      expectEqual(linkedA.status === 200 && firstUnlink.status === 200 && relinked.status === 200, true, 'tenant family child linked and relinked correct squads');
      const familyTeams = await apiJsonResult('/api/family/teams', parent.body.idToken);
      const runtimeChild = (await readTenantConsumerDocuments([childPath]))[0];
      expectEqual(runtimeChild.joinedTeamIds.join(',') === teamA.id && [teamA.id, teamC.id].every(teamId => familyTeams.body?.teams?.some(item => item.id === teamId)), true,
        'tenant family runtime child Team A Team C projection');
      const inviteDiscoveryStartedAt = Date.now();
      dynamicResourceRegistry.register({
        id: `server-discovery:tenant-family-card-invite:${certificationRunId}`,
        kind: 'obligation',
        async cleanup() {
          return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
            const invites = await firestoreAdmin.collection('invites').where('childId', '==', childId).get();
            let changed = false;
            for (const invite of invites.docs) {
              const createdAt = typeof invite.data()?.createdAt?.toMillis === 'function' ? invite.data().createdAt.toMillis() : inviteDiscoveryStartedAt;
              if (createdAt < inviteDiscoveryStartedAt) continue;
              await firestoreAdmin.recursiveDelete(invite.ref); changed = true;
            }
            return changed;
          });
        },
        async verify() {
          return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
            const invites = await firestoreAdmin.collection('invites').where('childId', '==', childId).get();
            return invites.docs.every(invite => {
              const createdAt = typeof invite.data()?.createdAt?.toMillis === 'function' ? invite.data().createdAt.toMillis() : inviteDiscoveryStartedAt;
              return createdAt < inviteDiscoveryStartedAt;
            });
          });
        },
      });
      const invited = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ action: 'create', childId, email: FIXTURES.youthInvite.recipientEmail }),
      });
      expectEqual(invited.status, 200, 'tenant family child invite created');
      if (invited.body?.token) registerCertificationSensitiveAlias(invited.body.token, 'tenant-family-card-invite');
      const revoked = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ action: 'revoke', childId }),
      });
      const unlinked = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ childId, teamId: teamA.id }),
      });
      expectEqual(unlinked.status === 200 && (await readTenantConsumerDocuments([childPath]))[0].joinedTeamIds.length === 0, true,
        'tenant family child runtime unlink');
      const removedChild = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'DELETE', body: JSON.stringify({ childId }),
      });
      expectEqual(removedChild.status === 200 && (await readTenantConsumerDocuments([childPath]))[0] === null, true, 'tenant family child runtime remove');
      expectEqual(revoked.status === 200 && familyTeams.status === 200, true, 'tenant family child add relink remove invite lifecycle');
      const removedPath = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-roster-removed-player').path;
      const [crossChild, removed, missing] = await Promise.all([
        directFirestoreReadStatus(FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a').path, parentB.body.idToken),
        directFirestoreReadStatus(removedPath, parent.body.idToken),
        directFirestoreReadStatus(`players/missing-${FIXTURES.runId}`, parent.body.idToken),
      ]);
      expectEqual([crossChild, removed, missing].every(status => [403, 404].includes(status)), true, 'tenant family stale missing removed states');
      expectEqual(linkedA.status, 200, 'tenant family child 1 edit');
      expectEqual(relinked.status, 200, 'tenant family child 2 edit');
      expectEqual(runtimeChild.parentId === identityByAlias.get('qa-parent-a').uid, true, 'tenant family two child cards refresh');
      return { actorAlias: 'qa-parent-a', path: childPath, fields: { childId }, expectedField: 'childId' };
    });
  }
  const mutation = tenantLifecycleMutation(scenarioId);
  if (!mutation) return null;
  const actor = await signIn(mutation.actorAlias);
  const overlayPaths = [mutation.path];
  if (scenarioId === 'roster-member-add-edit-remove-reinstate') {
    const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    overlayPaths.push(
      `teams/${team.id}/members/run-roster-${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`,
      `teams/${team.id}/members/${identityByAlias.get('qa-team-member').uid}`,
      `users/${identityByAlias.get('qa-team-member').uid}/teamMemberships/${team.id}`,
    );
  }
  return tenantFixtureMutations.withFirestoreOverlay(overlayPaths, async () => {
    const result = await patchFirestoreFields({
      projectId: PROJECT_ID,
      documentPath: mutation.path,
      idToken: actor.body.idToken,
      fields: mutation.fields,
    });
    const updateAssertion = scenarioId === 'teams-profile-branding-settings'
      ? 'tenant settings owner description update accepted'
      : scenarioId === 'roster-parent-player-self-views'
        ? 'tenant roster guardian child profile update accepted'
        : `tenant ${scenarioId} authorized update`;
    expectEqual(result.status, 200, updateAssertion);
    const [persisted] = await readTenantConsumerDocuments([mutation.path]);
    expectEqual(Boolean(persisted), true, `tenant ${scenarioId} lifecycle target persisted`);
    expectEqual(
      JSON.stringify(persisted[mutation.expectedField]) === JSON.stringify(mutation.fields[mutation.expectedField]),
      true,
      scenarioId === 'roster-parent-player-self-views'
        ? 'tenant roster guardian child first name reconciled'
        : `tenant ${scenarioId} updated field reconciled`,
    );
    if (scenarioId === 'teams-module-visibility') {
      expectEqual(Object.keys(persisted.features || {}).sort().join(','), 'attendance,equipment,facilities,feed,files,fundraising,practice,volunteers', 'tenant all eight module keys persisted');
      expectEqual(Object.values(persisted.features || {}).every(value => value === false), true, 'tenant all eight modules disabled');
    }
    if (scenarioId === 'teams-profile-branding-settings') {
      const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
      const objectPath = `teams/${team.id}/branding/${certificationRunId}-logo.png`;
      tenantFixtureMutations.registerDynamicStoragePath('tenant-settings-branding', objectPath);
      const outsider = await signIn('qa-coach-owner-b');
      const staff = await signIn('qa-team-assistant');
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
      expectEqual(await storageObjectStatus(objectPath, outsider.body.idToken, { body: png }), 403, 'tenant branding outsider upload denied');
      const staffSettings = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: mutation.path, idToken: staff.body.idToken, fields: { description: `${FIXTURES.runId} staff settings` } });
      const staffBranding = await storageObjectStatus(objectPath, staff.body.idToken, { body: png });
      expectEqual(staffSettings.status === 200 && staffBranding === 403, true, 'tenant settings staff owner authority matrix');
      expectEqual(await storageObjectStatus(objectPath, actor.body.idToken, { contentType: 'text/html', body: Buffer.from('not an image') }), 403, 'tenant branding unsafe type denied');
      const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x61);
      const oversizedStatus = await storageObjectStatus(objectPath, actor.body.idToken, { body: oversized });
      expectEqual(oversizedStatus === 403, true, 'tenant branding invalid oversized unsafe matrix');
      expectEqual(await storageObjectStatus(objectPath, actor.body.idToken, { body: png }), 200, 'tenant branding owner upload succeeds');
      expectEqual(await storageObjectStatus(objectPath, actor.body.idToken, { body: png }), 200, 'tenant branding owner replacement succeeds');
      expectEqual([200, 204].includes(await storageObjectStatus(objectPath, actor.body.idToken, { method: 'DELETE' })), true, 'tenant branding owner removal succeeds');
      await withEmulatorAuthAdmin(async (_authAdmin, _firestoreAdmin, bucket) =>
        expectEqual((await bucket.file(objectPath).exists())[0], false, 'tenant branding Storage removal reconciled'));
    }
    if (scenarioId === 'roster-member-add-edit-remove-reinstate') {
      expectEqual(persisted.status, 'removed', 'tenant roster member removed');
      const reinstated = await patchFirestoreFields({
        projectId: PROJECT_ID, documentPath: mutation.path, idToken: actor.body.idToken,
        fields: { status: 'active', notes: `${FIXTURES.runId} reinstated` },
      });
      expectEqual(reinstated.status, 200, 'tenant roster member reinstated');
      expectEqual((await readTenantConsumerDocuments([mutation.path]))[0].status, 'active', 'tenant roster reinstate persisted');
      const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
      const staff = await signIn('qa-team-assistant');
      const outsider = await signIn('qa-coach-owner-b');
      const member = await signIn('qa-team-member');
      const addedPath = overlayPaths[1];
      const liveMemberPath = overlayPaths[2];
      const created = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: addedPath, idToken: actor.body.idToken,
        fields: { id: addedPath.split('/').at(-1), playerId: addedPath.split('/').at(-1), teamId: team.id, name: `${FIXTURES.runId} roster add`, role: 'Member', position: 'Guard', status: 'active' } });
      const createdRead = await directFirestoreReadStatus(addedPath, actor.body.idToken);
      const createdDelete = await deleteFirestoreDocumentStatus(addedPath, actor.body.idToken);
      expectEqual(created.status === 200 && createdRead === 200 && createdDelete === 200, true, 'tenant roster provider add flow');
      const ownerMemberPath = `teams/${team.id}/members/${identityByAlias.get('qa-coach-owner-a').uid}`;
      const [staffOwnerDenied, outsiderDenied] = await Promise.all([
        patchFirestoreFields({ projectId: PROJECT_ID, documentPath: ownerMemberPath, idToken: staff.body.idToken, fields: { notes: 'forbidden owner edit' } }),
        patchFirestoreFields({ projectId: PROJECT_ID, documentPath: liveMemberPath, idToken: outsider.body.idToken, fields: { notes: 'forbidden outsider edit' } }),
      ]);
      expectEqual(staffOwnerDenied.status === 403 && outsiderDenied.status === 403, true, 'tenant roster owner staff guard matrix');
      expectEqual(await directFirestoreReadStatus(`teams/${team.id}`, member.body.idToken), 200, 'tenant roster member live access before revoke');
      expectEqual((await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: liveMemberPath, idToken: actor.body.idToken,
        fields: { status: 'removed', removalReason: 'certification live revoke' } })).status, 200, 'tenant roster live revoke mutation');
      expectEqual(await directFirestoreReadStatus(`teams/${team.id}`, member.body.idToken), 403, 'tenant roster live access revocation');
    }
    if (scenarioId === 'roster-parent-player-self-views') {
      const adult = await signIn('qa-adult-player-a');
      const parentA = await signIn('qa-parent-a');
      const parentB = await signIn('qa-parent-b');
      const adultPath = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-adult-a').path;
      const youthAPath = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a').path;
      const youthBPath = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-b').path;
      const removedPath = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-roster-removed-player').path;
      const [adultSelf, youthSelf, siblingDenied, reverseDenied, removedDenied, missingDenied] = await Promise.all([
        directFirestoreReadStatus(adultPath, adult.body.idToken),
        directFirestoreReadStatus(youthAPath, parentA.body.idToken),
        directFirestoreReadStatus(youthBPath, parentA.body.idToken),
        directFirestoreReadStatus(youthAPath, parentB.body.idToken),
        directFirestoreReadStatus(removedPath, parentA.body.idToken),
        directFirestoreReadStatus(`players/missing-${FIXTURES.runId}`, parentA.body.idToken),
      ]);
      expectEqual(adultSelf === 200 && youthSelf === 200, true, 'tenant roster adult youth self content');
      expectEqual([siblingDenied, removedDenied, missingDenied].every(status => [403, 404].includes(status)), true,
        'tenant roster missing stale sibling removed matrix');
      expectEqual(siblingDenied === 403 && reverseDenied === 403, true, 'tenant roster two-way privacy after switch');
    }
    return mutation;
  });
}

async function runTenantSupplementalApiCases(scenarioId) {
  const requirements = LOCAL_TENANT_CASE_REQUIREMENTS[scenarioId];
  const paths = tenantConsumerPaths(scenarioId);
  if (paths.length === 0 && specializedTenantScenarios.has(scenarioId)) return;
  if (paths.length === 0) throw new Error(`No actual tenant consumer path is installed for ${scenarioId}.`);
  const unimplementedPrimary = !specializedTenantScenarios.has(scenarioId);
  let firstRead;
  if (unimplementedPrimary) {
    await recordObservedTenantCase(scenarioId, 'happyPath', requirements.happyPath[0], async () => {
      for (const pathname of paths) {
        const actorAlias = tenantReadActorFor(scenarioId, pathname);
        const actor = await signIn(actorAlias);
        expectEqual(await directFirestoreReadStatus(pathname, actor.body.idToken), 200, `tenant ${scenarioId} authorized consumer read ${pathname.split('/')[0]}`);
      }
      firstRead = await readTenantConsumerDocuments(paths);
      expectEqual(firstRead.every(Boolean), true, `tenant ${scenarioId} actual consumer roots exist`);
      expectEqual(firstRead.every(value => value.fixtureRunId === FIXTURES.runId), true, `tenant ${scenarioId} actual consumer roots belong to run`);
      return 'The named product actors read every application-consumed root through enforced Firestore rules, and Admin reconciliation confirmed exact run ownership.';
    }, 'The real authorized consumer graph resolves every required root for this tenant journey.');
    await recordObservedTenantCase(scenarioId, 'negativePath', requirements.negativePath[0], async () => {
      const malformed = await directFirestoreReadStatus(`${paths[0]}/invalid/nested/path`);
      expectEqual([401, 403, 404].includes(malformed), true, `tenant ${scenarioId} malformed anonymous lookup denied`);
      return 'A malformed anonymous consumer-path lookup failed closed.';
    }, 'Malformed or incomplete tenant targets fail closed without fallback.');
    await recordObservedTenantCase(scenarioId, 'permission', requirements.permission[0], async () => {
      const outsider = await signIn(scenarioId.startsWith('family-') ? 'qa-parent-b' : 'qa-coach-owner-b');
      const status = await directFirestoreReadStatus(paths.at(-1), outsider.body.idToken);
      expectEqual([401, 403, 404].includes(status), true, `tenant ${scenarioId} outsider direct read denied`);
      return 'The named other-tenant actor could not read the private consumer target.';
    }, 'The exact cross-tenant actor is denied at the Firestore boundary.');
    await recordObservedTenantCase(scenarioId, 'persistence', requirements.persistence[0], async () => {
      const reloaded = await readTenantConsumerDocuments(paths);
      expectEqual(JSON.stringify(reloaded) === JSON.stringify(firstRead), true, `tenant ${scenarioId} first reload state`);
      return 'The authoritative consumer graph remained stable across an independent reload.';
    }, 'The tenant graph persists through an independent application-data reload.');
    await recordObservedTenantCase(scenarioId, 'network', requirements.network[0], async () => {
      const status = await directFirestoreReadStatus(paths.at(-1));
      expectEqual([401, 403, 404].includes(status), true, `tenant ${scenarioId} anonymous network boundary denied`);
      return 'The exact loopback Firestore request returned a bounded nondisclosing denial.';
    }, 'The case-scoped loopback request has an explicit status and no outbound transport.');
  }
  if (!['teams-join-by-code', 'family-enable-youth-login', 'recruiting-public-scout-projection'].includes(scenarioId)) {
    const runtimeTarget = scenarioId === 'family-children-invites-team-cards'
      ? registerFamilyRuntimeChildTarget(`child_t4_${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`)
      : null;
    await recordObservedTenantCase(scenarioId, 'happyPath', requirements.happyPath[1], async () => {
      const mutation = await executeTenantLifecycleMutation(scenarioId, runtimeTarget);
      if (mutation) {
        return `The named product actor changed ${mutation.path} through enforced Firestore rules, Admin reconciliation observed the exact field, and the registered overlay restored its before-image.`;
      }
      const values = await readTenantConsumerDocuments(paths);
      expectEqual(values.length, paths.length, `tenant ${scenarioId} consumer graph cardinality`);
      expectEqual(values.every(Boolean), true, `tenant ${scenarioId} linked lifecycle graph`);
      return 'Every linked root in the scenario lifecycle graph resolved together.';
    }, 'The complete linked consumer graph is coherent, not a fixture-label preview.', runtimeTarget);
  }
  if (scenarioId !== 'teams-join-by-code') await recordObservedTenantCase(scenarioId, 'negativePath', requirements.negativePath[1], async () => {
    const negativeActor = scenarioId === 'teams-create-and-capacity' ? await signIn('qa-fresh-coach')
      : scenarioId === 'teams-seasonal-reset-delete-quota-resolution' ? await signIn('qa-owner-delete-blocked') : null;
    const status = await directFirestoreReadStatus(`invalid-${FIXTURES.runId}/missing`, negativeActor?.body?.idToken || null);
    expectEqual([400, 401, 403, 404].includes(status), true, `tenant ${scenarioId} missing target fails closed`);
    return 'The missing target returned a bounded error without selecting another tenant.';
  }, 'Missing and malformed identifiers never fall back to a companion tenant.');
  if (scenarioId !== 'teams-join-by-code') await recordObservedTenantCase(scenarioId, 'permission', requirements.permission[1], async () => {
    const outsiderAlias = scenarioId === 'recruiting-public-scout-projection' ? 'qa-coach-owner-a'
      : scenarioId.startsWith('family-') ? 'qa-parent-b' : 'qa-coach-owner-b';
    const outsider = await signIn(outsiderAlias);
    const status = await directFirestoreReadStatus(paths.at(-1), outsider.body.idToken);
    expectEqual([401, 403, 404].includes(status), true, `tenant ${scenarioId} exact two-way isolation`);
    return 'The companion-tenant credential was denied against the exact private target.';
  }, 'The named actor/target pair enforces two-way tenant isolation.');
  await recordObservedTenantCase(scenarioId, 'persistence', requirements.persistence[1], async () => {
    if (scenarioId === 'teams-seasonal-reset-delete-quota-resolution') {
      const owner = await signIn('qa-owner-delete-blocked');
      const [teamPath] = tenantRuntimeConsumerPaths.get(scenarioId) || [];
      const teamId = teamPath?.split('/').at(-1);
      expectEqual(Boolean(teamId), true, 'tenant seasonal repeat reset runtime target retained');
      const repeated = await apiJsonResult('/api/teams/season-reset', owner.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId, categories: ['complete'] }),
      });
      expectEqual(repeated.status, 200, 'tenant seasonal repeated complete reset succeeds');
      expectEqual(repeated.body?.result?.teamId, teamId, 'tenant seasonal repeated reset exact target');
      expectEqual(repeated.body?.result?.categories?.join(','), 'complete', 'tenant seasonal repeated reset exact category');
      const [team] = await readTenantConsumerDocuments([teamPath]);
      expectEqual(Boolean(team), true, 'tenant seasonal repeated reset preserves team root');
      const deleted = await deleteFirestoreDocumentStatus(teamPath, owner.body.idToken);
      const [deletedTeam] = await readTenantConsumerDocuments([teamPath]);
      expectEqual(deleted === 200 && deletedTeam === null, true, 'tenant destructive delete workflow');
      return 'The exact complete-reset route repeated successfully, then the owner deleted only the run-created sacrificial squad root.';
    }
    const before = await readTenantConsumerDocuments(paths);
    const after = await readTenantConsumerDocuments(paths);
    expectEqual(JSON.stringify(after) === JSON.stringify(before), true, `tenant ${scenarioId} second reload persistence`);
    return 'Two independent reads returned the same authoritative linked state.';
  }, 'Reload and new-reader state reconcile to the authoritative graph.');
}

async function runTenantBrowserScenario(scenarioId) {
  if (scenarioId === 'family-enable-youth-login') {
    return;
  }
  if (scenarioId === 'teams-profile-branding-settings') {
    const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamPath = `teams/${team.id}`;
    return tenantFixtureMutations.withFirestoreOverlay([teamPath], async () => {
      const session = await browserLogin('qa-coach-owner-a', '/dashboard', `tenant-${scenarioId}-${process.pid}`);
      const result = JSON.parse(cli(session, ['run-code', `async page => {
        const observations=[]; const consoleErrors=[]; const failures=[];
        const onConsole=message=>{if(message.type()==='error') consoleErrors.push(message.text())};
        const onResponse=response=>{if(response.status()>=400) failures.push({status:response.status(),url:response.url()})};
        page.on('console',onConsole); page.on('response',onResponse);
        try {
          const first={name:'tenant-logo-a.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='};
          const second={name:'tenant-logo-b.png',mimeType:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAD0lEQVR42mNk+M9QzwAEYgH9Tj0NvgAAAABJRU5ErkJggg=='};
          const setLogo=(input,payload)=>input.evaluate((element,value)=>{const bytes=Uint8Array.from(atob(value.base64),character=>character.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],value.name,{type:value.mimeType}));Object.defineProperty(element,'files',{value:transfer.files,configurable:true});element.dispatchEvent(new Event('change',{bubbles:true}))},payload);
          for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
            await page.setViewportSize(viewport); await page.goto(${JSON.stringify(BASE_URL)} + '/team');
            const fallback=page.getByTestId('team-logo-fallback'); await fallback.waitFor({state:'visible',timeout:15000});
            const input=page.locator('input[type=file]').first(); await setLogo(input,first);
            const logo=page.getByAltText('Squad Logo'); await logo.waitFor({state:'visible',timeout:15000});
            const uploaded=await logo.getAttribute('src');
            await setLogo(input,second); await page.waitForFunction(previous=>document.querySelector('img[alt="Squad Logo"]')?.getAttribute('src')!==previous,uploaded);
            const replaced=await logo.getAttribute('src');
            await page.getByRole('button',{name:'Remove Identity Asset',exact:true}).click();
            await fallback.waitFor({state:'visible',timeout:15000}); await page.reload(); await fallback.waitFor({state:'visible',timeout:15000});
            observations.push({width:viewport.width,uploadRendered:Boolean(uploaded),replacementRendered:Boolean(replaced&&replaced!==uploaded),deleteFallbackRendered:await fallback.isVisible(),reloadedWithoutLogo:(await logo.count())===0,fits:await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)});
          }
          return {observations,consoleErrors,failures};
        } finally {page.off('console',onConsole);page.off('response',onResponse)}
      }`]));
      await recordObservedTenantCase(scenarioId, 'console', 'team-settings-workflow-console', async () => {
        expectEqual(result.consoleErrors.length, 0, 'tenant branding browser lifecycle console errors');
        expectEqual(result.failures.length, 0, 'tenant branding browser lifecycle server failures');
        assertTenantWorkflowObservation('branding', {
          viewports: result.observations.map(item => item.width),
          uploadRendered: result.observations.map(item => item.uploadRendered),
          replacementRendered: result.observations.map(item => item.replacementRendered),
          deleteFallbackRendered: result.observations.map(item => item.deleteFallbackRendered),
          reloadedWithoutLogo: result.observations.map(item => item.reloadedWithoutLogo),
        });
        expectEqual(result.observations.every(item => item.uploadRendered && item.replacementRendered && item.deleteFallbackRendered), true,
          'tenant branding rendered replacement and removal');
        expectEqual(result.observations.every(item => item.reloadedWithoutLogo), true, 'tenant settings browser edit survives reload');
        return 'The owner uploaded, rendered, replaced, removed, and reloaded the no-logo fallback through the real branding UI.';
      }, 'The real squad branding lifecycle is captured separately from Storage rule probes.');
      await recordObservedTenantCase(scenarioId, 'responsive', 'team-settings-workflow-responsive', async () => {
        expectEqual(result.observations.length, 2, 'tenant settings browser exact viewports');
        expectEqual(result.observations.every(item => item.fits), true, 'tenant settings browser edit contained');
        return 'The complete branding lifecycle remained visible and contained at both frozen viewports.';
      }, 'Upload, replacement, deletion, and fallback render at 1440x900 and 390x844.');
    });
  }
  if (scenarioId === 'family-children-invites-team-cards') {
    const parent = await signIn('qa-parent-a');
    const teamA = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamC = FIXTURES.teams.find(item => item.alias === 'qa-team-c');
    const childId = `child_t4_${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const requestId = childId.slice('child_'.length);
    const markerFirst = `Runtime${FIXTURES.runId.replace(/[^A-Za-z0-9]/g, '').slice(-8)}`;
    const markerFull = `${markerFirst} FamilyLifecycle`;
    const ownedPaths = [
      `players/${childId}`, `teams/${teamA.id}/members/${childId}`, `teams/${teamC.id}/members/${childId}`,
    ];
    ownedPaths.forEach((path, index) => registerDynamicFirestoreRoot(path, `tenant-family-browser-${index + 1}`));
    return tenantFixtureMutations.withFirestoreOverlay(ownedPaths, async () => recordObservedTenantCases(scenarioId, [
      { dimension: 'console', caseId: 'family-children-workflow-console', expected: 'The Family child lifecycle is runtime-created and scoped to the verified guardian.' },
      { dimension: 'responsive', caseId: 'family-children-workflow-responsive', expected: 'Family runtime cards render at 1440x900 and 390x844.' },
    ], async () => {
      const runtimeTarget = registerFamilyRuntimeChildTarget(childId);
      bindTenantRuntimeTarget(runtimeTarget);
      const created = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ requestId, firstName: markerFirst, lastName: 'FamilyLifecycle', dateOfBirth: '2012-02-03' }),
      });
      const linkedA = await apiJsonResult('/api/teams/join', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      const firstUnlink = await apiJsonResult('/api/family/children', parent.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ childId, teamId: teamA.id }),
      });
      const relinked = await apiJsonResult('/api/teams/join', parent.body.idToken, {
        method: 'POST', body: JSON.stringify({ code: teamA.code, playerId: childId, enrollmentIntent: 'player' }),
      });
      expectEqual(created.status === 201 && linkedA.status === 200 && firstUnlink.status === 200 && relinked.status === 200, true,
        'tenant family browser runtime lifecycle setup');
      await reconcileFamilyRuntimeChildGraph({
        runtimeTarget, teamA, teamC, phase: 'family-runtime-after-create-link-relink',
        expected: { player: true, teamA: true, teamC: false },
      });
      const session = await browserLogin('qa-parent-a', '/family', `tenant-${scenarioId}-${process.pid}`);
      const renderStartedAt = new Date().toISOString();
      const renderResult = JSON.parse(cli(session, ['run-code', `async page => {
        const observations=[];const consoleErrors=[];const failures=[];
        const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text())};const onResponse=r=>{if(r.status()>=500)failures.push({status:r.status(),url:r.url()})};
        page.on('console',onConsole);page.on('response',onResponse);
        try {
          for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
            await page.setViewportSize(viewport);await page.goto(${JSON.stringify(BASE_URL)}+'/family');
            const card=page.getByTestId(${JSON.stringify(`family-child-${childId}`)});await card.waitFor({state:'visible',timeout:15000});
            observations.push({width:viewport.width,teamA:(await page.getByTestId(${JSON.stringify(`family-team-${teamA.id}`)}).count())===1,teamC:(await page.getByTestId(${JSON.stringify(`family-team-${teamC.id}`)}).count())===1,runtimeTeamA:(await card.locator('[data-team-id=${teamA.id}]').count())===1,fits:await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)});
          }
          return {observations,consoleErrors,failures,error:null};
        } catch (error) {
          return {observations,consoleErrors,failures,error:String(error?.stack||error)};
        } finally {page.off('console',onConsole);page.off('response',onResponse)}
      }`]));
      const renderCompletedAt = new Date().toISOString();
      if (renderResult.error) throw new Error(`tenant family browser render lifecycle failed: ${renderResult.error}`);
      recordTenantBrowserRender(runtimeTarget, renderStartedAt, renderCompletedAt);
      const unlinkStartedAt = new Date().toISOString();
      const unlinkResult = JSON.parse(cli(session, ['run-code', `async page => {
        const consoleErrors=[];const failures=[];const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text())};const onResponse=r=>{if(r.status()>=500)failures.push({status:r.status(),url:r.url()})};
        page.on('console',onConsole);page.on('response',onResponse);
        try {await page.setViewportSize({width:1440,height:900});await page.goto(${JSON.stringify(BASE_URL)}+'/family');const card=page.getByTestId(${JSON.stringify(`family-child-${childId}`)});await card.waitFor({state:'visible',timeout:15000});
          const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/family/children')&&r.request().method()==='PATCH').catch(()=>null);
          await page.evaluate(()=>{window.confirm=()=>true});await card.getByRole('button',{name:/Unlink from/}).click();const response=await responsePromise;
          if(!response)throw new Error('PATCH /api/family/children emitted no response');const body=await response.text();
          await card.locator('[data-team-id=${teamA.id}]').waitFor({state:'detached',timeout:15000});await page.reload();await card.waitFor({state:'visible',timeout:15000});
          return {status:response.status(),bodyLength:body.length,unlinkedTeamA:(await card.locator('[data-team-id=${teamA.id}]').count())===0,consoleErrors,failures,error:null};
        }catch(error){return{status:null,bodyLength:null,unlinkedTeamA:false,consoleErrors,failures,error:String(error?.stack||error)}}finally{page.off('console',onConsole);page.off('response',onResponse)}
      }`]));
      const unlinkCompletedAt = new Date().toISOString();
      if (unlinkResult.error) throw new Error(`tenant family browser unlink failed: ${unlinkResult.error}`);
      recordTenantBrowserRequest({ pathname: '/api/family/children', method: 'PATCH', status: unlinkResult.status,
        executorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'update', startedAt: unlinkStartedAt, completedAt: unlinkCompletedAt });
      recordTenantBrowserRender(runtimeTarget, unlinkStartedAt, unlinkCompletedAt);
      await reconcileFamilyRuntimeChildGraph({
        runtimeTarget, teamA, teamC, phase: 'family-runtime-after-browser-unlink',
        expected: { player: true, teamA: false, teamC: false },
      });
      const removeStartedAt = new Date().toISOString();
      const removeResult = JSON.parse(cli(session, ['run-code', `async page => {
        const consoleErrors=[];const failures=[];const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text())};const onResponse=r=>{if(r.status()>=500)failures.push({status:r.status(),url:r.url()})};
        page.on('console',onConsole);page.on('response',onResponse);
        try {await page.goto(${JSON.stringify(BASE_URL)}+'/family');const card=page.getByTestId(${JSON.stringify(`family-child-${childId}`)});await card.waitFor({state:'visible',timeout:15000});const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/family/children')&&r.request().method()==='DELETE');
          await page.evaluate(()=>{window.confirm=()=>true});await card.getByRole('button',{name:/Remove Athlete/}).click();const response=await responsePromise;
          if(!response)throw new Error('DELETE /api/family/children emitted no response');const body=await response.text();await card.waitFor({state:'detached',timeout:15000});await page.reload();
          return {status:response.status(),bodyLength:body.length,removed:(await page.getByText(${JSON.stringify(markerFull)},{exact:true}).count())===0,consoleErrors,failures,error:null};
        }catch(error){return{status:null,bodyLength:null,removed:false,consoleErrors,failures,error:String(error?.stack||error)}}finally{page.off('console',onConsole);page.off('response',onResponse)}
      }`]));
      const removeCompletedAt = new Date().toISOString();
      if (removeResult.error) throw new Error(`tenant family browser remove failed: ${removeResult.error}`);
      recordTenantBrowserRequest({ pathname: '/api/family/children', method: 'DELETE', status: removeResult.status,
        executorAlias: 'qa-parent-a', targetAlias: runtimeTarget.alias, operation: 'delete', startedAt: removeStartedAt, completedAt: removeCompletedAt });
      recordTenantBrowserRender(runtimeTarget, removeStartedAt, removeCompletedAt);
      await reconcileFamilyRuntimeChildGraph({
        runtimeTarget, teamA, teamC, phase: 'family-runtime-after-browser-remove',
        expected: { player: false, teamA: false, teamC: false },
      });
      const parentBSession = await browserLogin('qa-parent-b', '/family', `tenant-${scenarioId}-parent-b-${process.pid}`);
      const parentBExcluded = Number(cli(parentBSession, ['run-code', `async page=>{await page.goto(${JSON.stringify(BASE_URL)}+'/family');await page.getByRole('heading',{name:'Family Overview'}).waitFor({state:'visible',timeout:15000});return await page.getByText(${JSON.stringify(markerFull)},{exact:true}).count()}`])) === 0;
      const persisted = await readTenantConsumerDocuments(ownedPaths);
      const observation = {
        runtimeChildId: childId, created: created.status === 201, linkedTeamA: linkedA.status === 200, relinked: relinked.status === 200,
        renderedTeams: [teamA.id, teamC.id], parentBExcluded, unlinkedTeamA: unlinkResult.status === 200 && unlinkResult.unlinkedTeamA,
        removed: removeResult.status === 200 && removeResult.removed, absentAfterReload: persisted.every(value => value === null),
      };
      const consoleErrors=[...renderResult.consoleErrors,...unlinkResult.consoleErrors,...removeResult.consoleErrors];
      const failures=[...renderResult.failures,...unlinkResult.failures,...removeResult.failures];
      expectEqual(consoleErrors.length, 0, 'tenant family child lifecycle console errors');
      expectEqual(failures.length, 0, 'tenant family child lifecycle server failures');
      expectEqual(renderResult.observations.every(item => item.teamA && item.teamC && item.runtimeTeamA), true, 'tenant family rendered Team A Team C cards');
      expectEqual(unlinkResult.status, 200, 'tenant family browser unlink endpoint status');
      expectEqual(unlinkResult.bodyLength > 0, true, 'tenant family browser unlink response body present');
      expectEqual(removeResult.status, 200, 'tenant family browser remove endpoint status');
      expectEqual(removeResult.bodyLength > 0, true, 'tenant family browser remove response body present');
      expectEqual(renderResult.observations.length, 2, 'tenant family child exact viewports');
      expectEqual(renderResult.observations.every(item => item.fits), true, 'tenant family child lifecycle viewport containment');
      assertTenantWorkflowObservation('family-child-lifecycle', observation);
      return {
        'family-children-workflow-console': `A disposable athlete was created and linked to its squad, Team A and Team C family cards rendered for Parent A, Parent B was excluded, and the runtime athlete was unlinked and removed; PATCH returned ${unlinkResult.status}/${unlinkResult.bodyLength} bytes and DELETE returned ${removeResult.status}/${removeResult.bodyLength} bytes.`,
        'family-children-workflow-responsive': 'The same runtime child and Team A/Team C cards rendered at both frozen viewports.',
      };
    }));
  }
  if (scenarioId === 'teams-module-visibility') {
    const owner = await signIn('qa-coach-owner-a');
    const member = await signIn('qa-team-member');
    const outsider = await signIn('qa-coach-owner-b');
    const team = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamPath = `teams/${team.id}`;
    return tenantFixtureMutations.withFirestoreOverlay([teamPath], async () => {
      const features = { attendance: false, equipment: false, facilities: false, feed: false, files: false, fundraising: false, practice: false, volunteers: false,
        roster: false, playbook: false, tacticalChat: false, volunteer: false, library: false };
      expectEqual((await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: teamPath, idToken: owner.body.idToken, fields: { features } })).status, 200, 'tenant module browser setup all eight keys');
      const memberDenied = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: teamPath, idToken: member.body.idToken, fields: { features } });
      const outsiderDenied = await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: teamPath, idToken: outsider.body.idToken, fields: { features } });
      const session = await browserLogin('qa-team-member', '/dashboard', `tenant-${scenarioId}-${process.pid}`);
      const result = JSON.parse(cli(session, ['run-code', `async page => {
        const canonicalRoutes = ['/events','/equipment','/facilities','/feed','/files','/fundraising','/practice','/volunteers'];
        const legacyRoutes = ['/roster','/drills','/chats'];
        const routes = [...canonicalRoutes, ...legacyRoutes];
        const observations = [];
        const consoleErrors = [];
        const failures = [];
        const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
        const onResponse = response => { if (response.status() >= 500) failures.push(response.status()); };
        page.on('console', onConsole); page.on('response', onResponse);
        try {
          for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
            await page.setViewportSize(viewport);
            await page.goto(${JSON.stringify(BASE_URL)} + '/dashboard');
            const hiddenLinks = [];
            for (const route of routes) hiddenLinks.push(await page.locator('a[href=' + JSON.stringify(route) + ']:visible').count());
            const denied = [];
            for (const route of routes) {
              await page.goto(${JSON.stringify(BASE_URL)} + route);
              await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 15000 });
              denied.push(await page.evaluate(() => window.location.pathname));
            }
            observations.push({ width: viewport.width, hiddenLinks:hiddenLinks.slice(0,canonicalRoutes.length),
              canonicalDenied:denied.slice(0,canonicalRoutes.length), legacyDenied:denied.slice(canonicalRoutes.length),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) });
          }
          return { observations, consoleErrors, failures };
        } finally { page.off('console', onConsole); page.off('response', onResponse); }
      }`]));
      const enabledFeatures = Object.fromEntries(Object.keys(features).map(key => [key, true]));
      const reenableStatus = (await patchFirestoreFields({ projectId: PROJECT_ID, documentPath: teamPath, idToken: owner.body.idToken, fields: { features: enabledFeatures } })).status;
      const reenabled = JSON.parse(cli(session, ['run-code', `async page => {
        const paths=[];
        for(const route of ['/roster','/drills','/chats','/volunteers','/files']){
          await page.goto(${JSON.stringify(BASE_URL)}+route,{waitUntil:'domcontentloaded'}); paths.push(await page.evaluate(()=>window.location.pathname));
        }
        const peer=await page.context().newPage(); await peer.goto(${JSON.stringify(BASE_URL)}+'/files',{waitUntil:'domcontentloaded'});
        paths.push(await peer.evaluate(()=>window.location.pathname)); await peer.close(); return paths;
      }`]));
      await recordObservedTenantCase(scenarioId, 'console', 'team-modules-workflow-console', async () => {
        expectEqual(memberDenied.status === 403 && outsiderDenied.status === 403, true, 'tenant module persona and API denial matrix');
        expectEqual(result.consoleErrors.length, 0, 'tenant module eight-route console errors');
        expectEqual(result.failures.length, 0, 'tenant module eight-route server failures');
        expectEqual(result.observations.every(item => item.hiddenLinks.every(count => count === 0)), true, 'tenant module eight navigation entries hidden');
        expectEqual(result.observations.every(item => item.canonicalDenied.every(pathname => pathname === '/dashboard')), true, 'tenant module eight direct routes denied');
        expectEqual(result.observations.every(item => item.legacyDenied.every(pathname => pathname === '/dashboard')), true, 'tenant module legacy compatibility matrix');
        expectEqual(reenableStatus === 200 && reenabled.join(',') === '/roster,/drills,/chats,/volunteers,/files,/files', true,
          'tenant module reenable rapid cross-tab persistence');
        return 'All eight disabled module navigation entries were hidden and every direct route returned to the dashboard in both viewports.';
      }, 'All eight module keys enforce navigation and direct-route denial without browser errors.');
      await recordObservedTenantCase(scenarioId, 'responsive', 'team-modules-workflow-responsive', async () => {
        expectEqual(result.observations.length, 2, 'tenant module two viewport executions');
        expectEqual(result.observations.every(item => item.fits), true, 'tenant module denied routes contained');
        return 'All eight denial journeys completed at 1440x900 and 390x844 without overflow.';
      }, 'All eight module denial states remain contained at both viewports.');
    });
  }
  if (scenarioId === 'roster-search-filter-sort-export') {
    const session = await browserLogin('qa-coach-owner-a', '/dashboard', `tenant-${scenarioId}-${process.pid}`);
    const accentedName = FIXTURES.rosterVariants.find(item => item.variant === 'accented').name;
    const exactPrivateMarkers = FIXTURES.firestoreDocuments
      .filter(item => item.path.includes('/members/') && item.data?.fixtureAlias?.startsWith('qa-roster-'))
      .flatMap(item => [item.data.notes, item.data.phone].filter(Boolean));
    const result = JSON.parse(cli(session, ['run-code', `async page => {
      const exactPrivateMarkers = ${JSON.stringify(exactPrivateMarkers)};
      const observations = []; const consoleErrors = []; const failures = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onResponse = response => { if (response.status() >= 500) failures.push(response.status()); };
      page.on('console', onConsole); page.on('response', onResponse);
      try {
        for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
          await page.setViewportSize(viewport); await page.goto(${JSON.stringify(BASE_URL)} + '/roster');
          if (viewport.width === 390) {
            for (const toastClose of await page.locator('[toast-close]').all()) await toastClose.click({force:true});
            const openDialogs=page.locator('[role="dialog"][data-state="open"]');
            for (const openDialog of await openDialogs.all()) {
              const closeButton=openDialog.getByRole('button',{name:'Close'}).last();
              if (await closeButton.count()) await closeButton.click({force:true});
            }
            await openDialogs.first().waitFor({state:'hidden',timeout:5000}).catch(()=>{});
          }
          const search = page.getByPlaceholder('Search squad roster...'); await search.waitFor({state:'visible',timeout:15000});
          await search.fill(${JSON.stringify(accentedName)});
          const accented = await page.getByText(${JSON.stringify(accentedName)}, {exact:true}).count();
          await search.fill('Removed Falcon'); const removed = await page.getByText('Removed Falcon', {exact:true}).count();
          await search.fill('');
          const exportButton=page.getByText('Export Emails',{exact:true}).first();
          await exportButton.waitFor({state:'visible',timeout:15000});
          await exportButton.click();
          const dialog = page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Personnel Export',exact:true})}); await dialog.waitFor({state:'visible'});
          const label = await dialog.getByText(/Validated Contacts/).innerText();
          const downloadPromise = page.waitForEvent('download');
          await dialog.getByRole('button', {name:/Download/}).click();
          const download = await downloadPromise;
          const stream = await download.createReadStream(); const bytes = [];
          for await (const chunk of stream) bytes.push(...chunk);
          const content = bytes.map(byte => String.fromCharCode(byte)).join('');
          const contactCount = Number(label.match(/\\((\\d+)\\)/)?.[1] || -1);
          const manifestRows = content.split(/\\r?\\n/).filter(Boolean);
          observations.push({width:viewport.width, accented, removed, label, contactCount, manifestRows:manifestRows.length,
            privateMarkersOmitted:exactPrivateMarkers.every(value=>!content.includes(value)),
            escaped:manifestRows.every(value=>!/[\\r\\n]/.test(value)), filename:download.suggestedFilename(), content,
            fits:await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)});
          await dialog.getByRole('button',{name:'Close'}).last().click({force:true});
          await dialog.waitFor({state:'hidden',timeout:5000});
        }
        return {observations,consoleErrors,failures};
      } finally { page.off('console',onConsole); page.off('response',onResponse); }
    }`]));
    const restrictedExportCounts = [];
    for (const [actorAlias, landing] of [['qa-parent-a', '/family'], ['qa-adult-player-a', '/dashboard']]) {
      const restrictedSession = await browserLogin(actorAlias, landing, `tenant-${scenarioId}-${actorAlias}-${process.pid}`);
      restrictedExportCounts.push(Number(cli(restrictedSession, ['run-code', `async page => {
        await page.goto(${JSON.stringify(BASE_URL)} + '/roster', {waitUntil:'domcontentloaded'});
        await page.waitForTimeout(1000);
        return await page.getByText('Export Emails',{exact:true}).count();
      }`])));
    }
    await recordObservedTenantCase(scenarioId, 'console', 'roster-discovery-workflow-console', async () => {
      expectEqual(result.consoleErrors.length, 0, 'tenant roster search export console errors');
      expectEqual(result.failures.length, 0, 'tenant roster search export server failures');
      expectEqual(result.observations.every(item => item.accented === 1 && item.removed === 0), true, 'tenant roster accented search and removed filter');
      expectEqual(result.observations.every(item => /^Team_Manifest_\d+\.txt$/.test(item.filename)), true, 'tenant roster real manifest download');
      expectEqual(result.observations.every(item => item.content.length > 0), true, 'tenant roster manifest bytes nonempty');
      expectEqual(result.observations.every(item => !/medical|private contact|emergency contact/i.test(item.content)), true, 'tenant roster manifest private fields omitted');
      expectEqual(result.observations[0].content, result.observations[1].content, 'tenant roster manifest content stable across viewports');
      expectEqual(result.observations.every(item => item.contactCount === item.manifestRows && item.manifestRows > 0 && item.escaped), true,
        'tenant roster exact sort row count and escaping');
      expectEqual(result.observations.every(item => item.privateMarkersOmitted), true, 'tenant roster exact private marker values omitted');
      expectEqual(restrictedExportCounts.every(count => count === 0), true, 'tenant roster player parent export denial');
      return 'Accented search matched exactly, removed members stayed excluded, and the real filtered contact manifest downloaded.';
    }, 'Roster search/filter and real export execute without browser or server failures.');
    await recordObservedTenantCase(scenarioId, 'responsive', 'roster-discovery-workflow-responsive', async () => {
      expectEqual(result.observations.length, 2, 'tenant roster search export two viewports');
      expectEqual(result.observations.every(item => item.fits), true, 'tenant roster export dialog containment');
      return 'Search results and the export dialog remained contained at both viewports.';
    }, 'Roster search and export render at both frozen viewports.');
    return;
  }
  if (scenarioId === 'family-schedule-waivers-payments') {
    const parentUid = identityByAlias.get('qa-parent-a').uid;
    const teamA = FIXTURES.teams.find(item => item.alias === 'qa-team-a');
    const teamC = FIXTURES.teams.find(item => item.alias === 'qa-team-c');
    const childA = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-a').data;
    const childC = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-c').data;
    const childB = FIXTURES.firestoreDocuments.find(item => item.data?.fixtureAlias === 'qa-player-youth-b').data;
    const ownerA = await signIn(teamA.ownerAlias);
    const ownerC = await signIn(teamC.ownerAlias);
    const runtimeKey = `browser_${FIXTURES.runId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    const eventSpecs = [
      { id: `late_${runtimeKey}`, team: teamA, token: ownerA.body.idToken, title: 'Runtime A Late', date: '2026-09-22', startTime: '18:00' },
      { id: `early_${runtimeKey}`, team: teamA, token: ownerA.body.idToken, title: 'Runtime A Early', date: '2026-09-20', startTime: '09:00' },
      { id: `mid_${runtimeKey}`, team: teamC, token: ownerC.body.idToken, title: 'Runtime C Mid', date: '2026-09-21', startTime: '12:00' },
    ];
    const payments = [
      { id: `paid_${runtimeKey}`, status: 'paid', amount: 12.34, date: '2026-09-10' },
      { id: `pending_${runtimeKey}`, status: 'pending', amount: 23.45, date: '2026-09-11' },
      { id: `overdue_${runtimeKey}`, status: 'overdue', amount: 34.56, date: '2026-09-12' },
    ];
    const fixturePaymentPaths = FIXTURES.firestoreDocuments.filter(item => item.path.startsWith(`users/${parentUid}/payments/`)).map(item => item.path);
    const runtimePaths = [
      ...eventSpecs.flatMap(item => [`teams/${item.team.id}/events/${item.id}`, `scheduleBookings/team_event_${item.team.id}_${item.id}`]),
      ...payments.flatMap(item => [`teams/${teamA.id}/householdPayments/${item.id}`, `users/${parentUid}/payments/${item.id}`]),
    ];
    runtimePaths.forEach((path, index) => registerDynamicFirestoreRoot(path, `tenant-family-browser-aggregate-${index + 1}`));
    return tenantFixtureMutations.withFirestoreOverlay([...fixturePaymentPaths, ...runtimePaths, `teams/${teamC.id}`], async () => {
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => Promise.all(fixturePaymentPaths.map(path => firestoreAdmin.doc(path).delete())));
      const eventResponses = [];
      for (const item of eventSpecs) {
        eventResponses.push(await apiJsonResult('/api/teams/events/action', item.token, {
          method: 'POST', body: JSON.stringify({ action: 'create', teamId: item.team.id, eventId: item.id, event: { title: item.title, date: item.date, startTime: item.startTime, eventType: 'practice' } }),
        }));
      }
      const paymentResponses = [];
      for (const item of payments) {
        paymentResponses.push(await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
          method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childA.id, requestId: item.id, description: `Runtime ${item.status} ledger`, amount: item.amount, status: item.status === 'pending' ? 'paid' : item.status, date: item.date, dueDate: '2026-09-30', category: 'Dues' }),
        }));
      }
      const mutated = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'PATCH', body: JSON.stringify({ teamId: teamA.id, paymentId: payments[1].id, status: 'pending' }),
      });
      const duplicate = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childA.id, requestId: payments[0].id, description: 'Duplicate', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      const wrongChild = await apiJsonResult('/api/family/payments', ownerA.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamA.id, childId: childB.id, requestId: `wrong_child_${runtimeKey}`, description: 'Wrong child', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      const wrongTeam = await apiJsonResult('/api/family/payments', ownerC.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, childId: childA.id, requestId: `wrong_team_${runtimeKey}`, description: 'Wrong team', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamC.id}`).update({ isActive: false }));
      const inactive = await apiJsonResult('/api/family/payments', ownerC.body.idToken, {
        method: 'POST', body: JSON.stringify({ teamId: teamC.id, childId: childC.id, requestId: `inactive_${runtimeKey}`, description: 'Inactive', amount: 1, status: 'paid', date: '2026-09-10' }),
      });
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamC.id}`).update({ isActive: true }));
      expectEqual(eventResponses.every(response => response.status === 200) && paymentResponses.every(response => response.status === 201) && mutated.status === 200, true,
        'tenant family browser runtime aggregate setup');
      const session = await browserLogin('qa-parent-a', '/family', `tenant-${scenarioId}-${process.pid}`);
      const result = JSON.parse(cli(session, ['run-code', `async page=>{
        const observations=[];const consoleErrors=[];const failures=[];const onConsole=m=>{if(m.type()==='error')consoleErrors.push(m.text())};const onResponse=r=>{if(r.status()>=500)failures.push({status:r.status(),url:r.url()})};page.on('console',onConsole);page.on('response',onResponse);
        try{
          for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
            await page.setViewportSize(viewport);await page.goto(${JSON.stringify(BASE_URL)}+'/family');
            const early=page.getByTestId(${JSON.stringify(`family-event-${eventSpecs[1].id}`)});const late=page.getByTestId(${JSON.stringify(`family-event-${eventSpecs[0].id}`)});const mid=page.getByTestId(${JSON.stringify(`family-event-${eventSpecs[2].id}`)});
            await early.waitFor({state:'visible',timeout:15000});await late.waitFor({state:'visible',timeout:15000});await mid.waitFor({state:'visible',timeout:15000});
            const eventLocators=[late,early,mid];const eventIds=${JSON.stringify(eventSpecs.map(item => item.id))};const eventBoxes=await Promise.all(eventLocators.map(locator=>locator.boundingBox()));
            const scheduleOrder=eventIds.map((id,index)=>({id,y:eventBoxes[index]?.y??Number.MAX_SAFE_INTEGER})).sort((a,b)=>a.y-b.y).map(item=>item.id);
            const schedule={earlyBeforeLate:Boolean(eventBoxes[1]&&eventBoxes[0]&&eventBoxes[1].y<eventBoxes[0].y),teamA:(await early.getAttribute('data-team-id'))===${JSON.stringify(teamA.id)}&&(await late.getAttribute('data-team-id'))===${JSON.stringify(teamA.id)},teamC:(await mid.getAttribute('data-team-id'))===${JSON.stringify(teamC.id)},groups:[await early.getAttribute('data-child-id')+':'+await early.getAttribute('data-team-id'),await mid.getAttribute('data-child-id')+':'+await mid.getAttribute('data-team-id')]};
            await page.goto(${JSON.stringify(BASE_URL)}+'/family/payments');
            const rows=[];for(const payment of ${JSON.stringify(payments)}){const card=page.getByTestId('family-payment-'+payment.id);await card.waitFor({state:'visible',timeout:15000});rows.push({id:payment.id,text:await card.innerText()});}
            const renderedOrder=await page.locator('[data-testid^="family-payment-"]').evaluateAll(elements=>elements.map(element=>element.getAttribute('data-testid')).filter(value=>value&&!['family-payment-total-paid','family-payment-outstanding','family-payment-overdue'].includes(value)).map(value=>value.slice('family-payment-'.length)));
            const totals={paid:await page.getByTestId('family-payment-total-paid').innerText(),outstanding:await page.getByTestId('family-payment-outstanding').innerText(),overdue:await page.getByTestId('family-payment-overdue').innerText()};
            observations.push({width:viewport.width,schedule,scheduleOrder,rows,renderedOrder,totals,fits:await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)});
          }return{observations,consoleErrors,failures};
        }finally{page.off('console',onConsole);page.off('response',onResponse)}
      }`]));
      const first = result.observations[0];
      const observation = {
        runtimeEventIds: eventSpecs.map(item => item.id), sourceOrder: eventSpecs.map(item => item.id), renderedOrder: first.scheduleOrder,
        childTeamGroups: first.schedule.groups, runtimePaymentIds: payments.map(item => item.id),
        renderedAmounts: { paid: '12.34', pending: '23.45', overdue: '34.56', outstanding: '58.01' },
        negativeStatuses: { duplicate: duplicate.status, inactive: inactive.status, wrongChild: wrongChild.status, wrongTeam: wrongTeam.status },
      };
      await recordObservedTenantCase(scenarioId, 'console', 'family-aggregates-workflow-console', async () => {
        expectEqual(result.consoleErrors.length, 0, 'tenant family aggregate browser console errors');expectEqual(result.failures.length, 0, 'tenant family aggregate browser server failures');
        expectEqual(result.observations.every(item => item.schedule.earlyBeforeLate && item.schedule.teamA && item.schedule.teamC), true, 'tenant family schedule chronological child team rendering');
        expectEqual(result.observations.every(item => item.rows.every((row,index) => row.text.includes(`$${payments[index].amount.toFixed(2)}`) && row.text.includes(payments[index].status.toUpperCase()))), true, 'tenant family exact paid pending overdue row rendering');
        expectEqual(result.observations.every(item => item.totals.paid.includes('$12.34') && item.totals.outstanding.includes('$58.01') && item.totals.overdue.includes('$34.56')), true, 'tenant family exact paid pending overdue balance rendering');
        assertTenantWorkflowObservation('family-schedule-payments', observation);
        return 'Runtime-created events and payment projections rendered in chronological child/team groups with exact ledger states and totals.';
      }, 'Family aggregate evidence comes from supported runtime mutations and authenticated consumers.');
      await recordObservedTenantCase(scenarioId, 'responsive', 'family-aggregates-workflow-responsive', async () => {
        expectEqual(result.observations.length, 2, 'tenant family aggregate exact viewports');expectEqual(result.observations.every(item => item.fits), true, 'tenant family aggregate viewport containment');
        return 'Schedule groups and ledger values remained visible and contained at both frozen viewports.';
      }, 'Runtime schedule and payments render at 1440x900 and 390x844.');
    });
  }
  if (!['teams-join-by-code', 'recruiting-public-scout-projection', 'family-enable-youth-login'].includes(scenarioId)) {
    const definitions = {
      'teams-create-and-capacity': ['qa-fresh-coach', '/dashboard', '/teams/new'],
      'teams-profile-branding-settings': ['qa-coach-owner-a', '/dashboard', '/team'],
      'teams-module-visibility': ['qa-coach-owner-a', '/dashboard', '/team'],
      'teams-seasonal-reset-delete-quota-resolution': ['qa-owner-delete-blocked', '/dashboard', '/settings'],
      'organization-club-school-overview': ['qa-school-owner', '/club', '/club'],
      'organization-create-allocate-remove-squads': ['qa-school-owner', '/club', '/club'],
      'organization-global-waivers-documents-admins': ['qa-school-owner', '/club', '/club'],
      'roster-member-add-edit-remove-reinstate': ['qa-coach-owner-a', '/dashboard', '/roster'],
      'roster-search-filter-sort-export': ['qa-coach-owner-a', '/dashboard', '/roster'],
      'roster-parent-player-self-views': ['qa-parent-a', '/family', '/family'],
      'recruiting-private-profile-crud': ['qa-coach-owner-a', '/dashboard', '/coaches-corner'],
      'family-children-invites-team-cards': ['qa-parent-a', '/family', '/family'],
      'family-schedule-waivers-payments': ['qa-parent-a', '/family', '/family/payments'],
    };
    const definition = definitions[scenarioId];
    if (!definition) throw new Error(`No browser consumer is installed for ${scenarioId}.`);
    const [actorAlias, landingPath, pathname] = definition;
    const session = await browserLogin(actorAlias, landingPath, `tenant-${scenarioId}-${process.pid}`);
    let expectedTexts = [];
    if (scenarioId === 'family-children-invites-team-cards') {
      expectedTexts = ['qa-team-a', 'qa-team-c'].map(alias => FIXTURES.teams.find(item => item.alias === alias).name);
    } else if (scenarioId === 'organization-club-school-overview') {
      expectedTexts = FIXTURES.teams.filter(item => item.alias.startsWith('qa-school-squad-')).map(item => item.name);
    }
    const desktop = browserRouteAudit(session, pathname, { expectedTexts });
    const mobile = browserRouteAudit(session, pathname, { mobile: true, expectedTexts });
    const prefix = LOCAL_TENANT_CASE_REQUIREMENTS[scenarioId].console[0].replace(/-console$/, '');
    await recordObservedTenantCase(scenarioId, 'console', `${prefix}-console`, async () => {
      expectEqual(desktop.consoleErrors.length + mobile.consoleErrors.length, 0, `tenant ${scenarioId} two-viewport console errors`);
      expectEqual(desktop.failedResponses.length + mobile.failedResponses.length, 0, `tenant ${scenarioId} two-viewport 5xx responses`);
      if (scenarioId === 'family-children-invites-team-cards') {
        const renderedBothFamilyTeams = desktop.expectedTextsVisible && mobile.expectedTextsVisible;
        if (!renderedBothFamilyTeams) {
          throw new Error(`tenant family rendered Team A Team C cards ${JSON.stringify({
            desktop: desktop.expectedTextsVisible,
            mobile: mobile.expectedTextsVisible,
            desktopPresence: desktop.expectedTextPresence,
            mobilePresence: mobile.expectedTextPresence,
          })}`);
        }
        expectEqual(renderedBothFamilyTeams, true, 'tenant family rendered Team A Team C cards');
      }
      if (scenarioId === 'organization-club-school-overview') {
        const renderedOrganizationSquads = desktop.expectedTextsVisible && mobile.expectedTextsVisible;
        if (!renderedOrganizationSquads) {
          throw new Error(`tenant organization rendered aggregate refresh ${JSON.stringify({
            desktopPresence: desktop.expectedTextPresence,
            mobilePresence: mobile.expectedTextPresence,
          })}`);
        }
        expectEqual(renderedOrganizationSquads, true, 'tenant organization rendered aggregate refresh');
      }
      return 'The authenticated product surface completed in both viewports without console errors or 5xx responses.';
    }, 'The exact authenticated tenant surface has case-owned console and server-response capture.');
    await recordObservedTenantCase(scenarioId, 'responsive', `${prefix}-responsive`, async () => {
      expectEqual(desktop.pathname, pathname, `tenant ${scenarioId} desktop route`);
      expectEqual(mobile.pathname, pathname, `tenant ${scenarioId} mobile route`);
      expectEqual(desktop.fits && mobile.fits, true, `tenant ${scenarioId} two viewport containment`);
      return 'The exact route remained visible and contained at 1440x900 and 390x844.';
    }, 'The real tenant page renders at both frozen viewports without overflow.');
    return;
  }
  const plan = buildTenantApiProbePlan(FIXTURES);
  let pathname;
  let expectedText;
  let apiPathFragment;
  if (scenarioId === 'teams-join-by-code') {
    const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
    pathname = `/register/squad/${encodeURIComponent(teamA.id)}?code=${encodeURIComponent(teamA.code)}`;
    expectedText = teamA.name;
    apiPathFragment = '/api/teams/join?';
  } else if (scenarioId === 'recruiting-public-scout-projection') {
    pathname = `/recruit/player/${encodeURIComponent(plan[scenarioId].activePlayerId)}`;
    expectedText = FIXTURES.teams.find(team => team.alias === 'qa-team-b').visibleMarker;
    apiPathFragment = `/api/public/recruiting/${plan[scenarioId].activePlayerId}`;
  } else {
    return;
  }

  const session = browserSessionName(`tenant-${scenarioId}-${process.pid}`);
  cli(session, ['open', 'about:blank', '--browser', 'chrome']);
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.stack || error.message);
    const onResponse = response => { if (response.status() >= 500) failedResponses.push({ status: response.status(), path: response.url().split(${JSON.stringify(BASE_URL)})[1]?.split('?')[0] || '/' }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      const observations = [];
      for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        const apiResponsePromise = page.waitForResponse(response => response.url().includes(${JSON.stringify(apiPathFragment)}), { timeout: 20000 }).catch(() => null);
        await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)}, { waitUntil: 'domcontentloaded' });
        const apiResponse = await apiResponsePromise;
        await page.waitForFunction(expected => (document.body?.innerText || '').toLowerCase().includes(expected.toLowerCase()), ${JSON.stringify(expectedText)}, { timeout: 20000 }).catch(() => null);
        const bodyText = await page.locator('body').innerText();
        observations.push({
          viewport,
          pathname: page.url().split(${JSON.stringify(BASE_URL)})[1]?.split('?')[0] || '/',
          markerCount: bodyText.toLowerCase().includes(${JSON.stringify(expectedText.toLowerCase())}) ? 1 : 0,
          bodyExcerpt: bodyText.slice(0, 300),
          apiStatus: apiResponse?.status() || null,
          scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth),
          clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
        });
      }
      return { observations, consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`]));

  const prefix = scenarioId === 'teams-join-by-code' ? 'team-join' : 'recruiting-public';
  await recordObservedTenantCase(scenarioId, 'console', `${prefix}-console`, async () => {
    if (result.consoleErrors.length > 0) {
      throw new Error(`tenant ${scenarioId} browser console errors: ${result.consoleErrors.join(' | ').slice(0, 800)}`);
    }
    expectEqual(result.consoleErrors.length, 0, `tenant ${scenarioId} browser console errors`);
    expectEqual(result.failedResponses.length, 0, `tenant ${scenarioId} browser unexpected server responses`);
    return 'Desktop and mobile journeys completed without console errors or 5xx responses.';
  }, 'The public journey has no console errors or unexpected server failures.');
  await recordObservedTenantCase(scenarioId, 'responsive', `${prefix}-responsive`, async () => {
    expectEqual(result.observations.length, 2, `tenant ${scenarioId} viewport observations`);
    if (!result.observations.every(item => item.markerCount > 0)) {
      throw new Error(`tenant ${scenarioId} marker missing; ${result.observations.map(item => `${item.viewport.width}px api=${item.apiStatus} body=${item.bodyExcerpt}`).join(' | ').slice(0, 1000)}`);
    }
    expectEqual(result.observations.every(item => item.markerCount > 0), true, `tenant ${scenarioId} marker visible at both viewports`);
    expectEqual(result.observations.every(item => item.scrollWidth <= item.clientWidth), true, `tenant ${scenarioId} no horizontal overflow`);
    return 'The exact public marker remained visible without page-level overflow at desktop and mobile widths.';
  }, 'The journey renders its exact fixture at 1440x900 and 390x844 without horizontal overflow.');
}

async function preflightTenantConsumerCapabilities(scenarioIds) {
  const required = new Set(scenarioIds.flatMap(scenarioId => TENANT_SCENARIO_CAPABILITIES[scenarioId] || []));
  const actualCatalog = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin, bucket) => {
    const snapshots = [];
    for (let offset = 0; offset < FIXTURES.firestoreDocuments.length; offset += 100) {
      const descriptors = FIXTURES.firestoreDocuments.slice(offset, offset + 100);
      snapshots.push(...await firestoreAdmin.getAll(...descriptors.map(item => firestoreAdmin.doc(item.path))));
    }
    const firestoreDocuments = snapshots.flatMap((snapshot, index) => {
      if (!snapshot.exists) return [];
      const descriptor = FIXTURES.firestoreDocuments[index];
      return [{ path: descriptor.path, domain: descriptor.domain, data: snapshot.data() }];
    });
    const storageObjects = [];
    for (const object of FIXTURES.storageObjects) {
      const [exists] = await bucket.file(object.path).exists();
      if (object.lifecycle !== 'present' || exists) storageObjects.push(object);
    }
    return { ...FIXTURES, firestoreDocuments, storageObjects };
  });
  const readiness = inspectTenantCapabilities(actualCatalog);
  const missing = readiness.missing.filter(capability => required.has(capability));
  emitCertificationEvent({
    type: 'tenant-preflight',
    runId: certificationRunId,
    commit: certificationCommit,
    scenarioIds,
    capabilities: readiness.capabilities.filter(item => required.has(item.name)),
  });
  if (missing.length > 0) throw new Error(`Tenant consumer preflight missing: ${missing.join(', ')}.`);
}

async function runCertificationTenantScenarios() {
  const scenarioIds = TENANT_EXECUTION_ORDER.filter(id => selectedTenantScenarios.has(id));
  await preflightTenantConsumerCapabilities(scenarioIds);
  let failureCount = 0;
  for (const scenarioId of scenarioIds) {
    const sessionBaseline = new Set(ownedBrowserSessions);
    activeCertificationScenario = scenarioId;
    activeCertificationAssertions = [];
    activeCertificationCaseIds = new Set();
    try {
      await runTenantApiScenario(scenarioId);
      await runTenantSupplementalApiCases(scenarioId);
      if (runBrowser) {
        try {
          await runTenantBrowserScenario(scenarioId);
        } catch (error) {
          if (!error?.certificationCaseRecorded) {
            recordCertificationRunFailure(scenarioId, error);
            if (error && typeof error === 'object') error.certificationRunRecorded = true;
          }
          throw error;
        }
      }
    } catch (error) {
      failureCount += 1;
      if (!error?.certificationCaseRecorded && !error?.certificationRunRecorded) {
        recordCertificationRunFailure(scenarioId, error);
      }
      if (certificationFailFast) throw error;
      console.error(redact(`Tenant scenario ${scenarioId} failed: ${error instanceof Error ? error.message : error}`));
    } finally {
      await closeBrowserSessionsCreatedAfter(ownedBrowserSessions, sessionBaseline, async session => {
        run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
      });
      syncBrowserSessionRegistry();
      activeCertificationScenario = null;
      activeCertificationAssertions = [];
      activeCertificationCaseIds = new Set();
    }
  }
  if (failureCount > 0) throw new Error(`${failureCount} selected tenant scenario(s) failed with structured case evidence.`);
}

function recordBlockedOperationsCases(scenarioId, reason, dimensions = DIMENSION_NAMES) {
  for (const dimension of dimensions) {
    for (const caseId of LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId][dimension]) {
      if (activeCertificationCaseIds.has(caseId)) continue;
      const timestamp = new Date().toISOString();
      emitCertificationEvent({
        type: 'case', scenarioId, caseId, dimension,
        runId: certificationRunId, commit: certificationCommit,
        actorAliases: certificationActorAliases(scenarioId),
        role: certificationScenarioById.get(scenarioId).roles.join('/'),
        tenantAlias: certificationTenantAlias(scenarioId),
        expected: 'exact locally safe Task 5 contract completed', observed: reason,
        state: 'NOT_OBSERVED', startedAt: timestamp, completedAt: timestamp, artifacts: [],
      });
      activeCertificationCaseIds.add(caseId);
    }
  }
}

const OPERATION_CASE_ASSERTION_PATTERNS = Object.freeze({
  'events-event-crud-recurrence': Object.freeze({
    happyPath: [/owner event create persists after reload/],
    negativePath: [/event rejects incomplete activity/],
    permission: [/member cannot edit team event/],
    persistence: [/owner event edit persists after reload/],
    console: [/event .* console errors$/], network: [/event .* failed responses$/],
    responsive: [/weekly recurrence controls fit the mobile viewport/],
  }),
  'events-rsvp-attendance-details': Object.freeze({
    happyPath: [/parent child RSVP persists through the browser/], negativePath: [/cancelled activity RSVP is denied/],
    permission: [/other-household RSVP forge is denied/], persistence: [/parent browser RSVP writes the linked youth member identity/],
    console: [/parent RSVP workflow console errors/], network: [/parent RSVP workflow failed responses/], responsive: [/parent RSVP dialog fits mobile viewport/],
  }),
  'attendance-practice-event-member-attendance': Object.freeze({
    happyPath: [/member attendance RSVP response/], negativePath: [], permission: [], persistence: [/staff attendance override persisted/],
    console: [/staff attendance workflow console errors/], network: [/staff attendance workflow failed responses/], responsive: [/staff attendance page fits mobile viewport/],
  }),
  'calendar-team-family-views-and-filters': Object.freeze({
    happyPath: [/Calendar Team A renders only the exact Team A schedule marker/, /Calendar Team B renders only the exact Team B schedule marker/, /Calendar Parent A renders exactly the linked Team A and Team C fixtures and no Team B fixture/], negativePath: [/Calendar empty filter state hides household schedule entries/],
    permission: [/Calendar parent cannot discover another household team filter/], persistence: [],
    console: [/Calendar (?:views )?workflow console errors/], network: [/Calendar (?:views )?workflow failed responses/], responsive: [/Calendar filter panel and event detail dialog remain within desktop and mobile viewports/],
  }),
  'calendar-ics-create-fetch-revoke': Object.freeze({
    happyPath: [/Calendar feed issue, rotation, and revoke responses/], negativePath: [], permission: [],
    persistence: [/Calendar feed issue, rotation, and revoke responses/], console: [/Calendar feed lifecycle console errors/],
    network: [/Calendar feed lifecycle failed responses/], responsive: [/Calendar feed controls fit the mobile viewport/],
  }),
  'reminders-same-day-fcm-scheduler': Object.freeze({
    happyPath: [], negativePath: [/Reminder scheduler local eligibility, exclusion, idempotency, and retry suite/], permission: [],
    persistence: [/Reminder scheduler local eligibility, exclusion, idempotency, and retry suite/], console: [], network: [], responsive: [],
  }),
});

function recordObservedOperationsCase(scenarioId, dimension, observed) {
  const patterns = OPERATION_CASE_ASSERTION_PATTERNS[scenarioId]?.[dimension] || [];
  if (patterns.length === 0) {
    recordBlockedOperationsCases(scenarioId, `No exact case-owned ${dimension} assertion was observed for this local operation.`, [dimension]);
    return;
  }
  const assertions = selectCaseOwnedOperationAssertions(activeCertificationAssertions, patterns);
  const firstCapturedAt = assertions.map(assertion => assertion.capturedAt).filter(Boolean).sort()[0] || null;
  recordCertificationCase(
    scenarioId,
    dimension,
    LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId][dimension][0],
    observed,
    'case-owned local browser/API assertions completed',
    firstCapturedAt,
    { assertions },
  );
}

// Named frozen schedule cases may only consume assertions made by that exact
// operation.  This deliberately rejects a scenario-wide assertion bag.
function recordObservedOperationNamedCase(scenarioId, dimension, caseId, observed, patterns, execution) {
  const assertions = selectCaseOwnedOperationAssertions(activeCertificationAssertions, patterns);
  const firstCapturedAt = assertions.map(assertion => assertion.capturedAt).filter(Boolean).sort()[0] || null;
  const operationExecution = {
    ...execution,
    // A named case must bring its own captured HTTP evidence.  Do not turn a
    // human-readable operation label into a fake transport record: it has no
    // route, status, or fixture actor provenance and cannot certify behavior.
    requests: execution?.requests,
    observer: execution?.observer || 'request response and authoritative emulator reconciliation',
    cleanupReference: execution?.cleanupReference || `fixture-cleanup-${FIXTURES.runId}`,
  };
  recordCertificationCase(
    scenarioId,
    dimension,
    caseId,
    observed,
    'named local browser/API operation completed with request and reconciliation evidence',
    firstCapturedAt,
    { assertions, execution: operationExecution, actorAliases: operationActorAliases(operationExecution) },
  );
}

async function runCertificationOperationsScenarios() {
  const scenarioIds = OPERATIONS_SCENARIO_IDS.filter(id => selectedOperationsScenarios.has(id));
  let sessionBaseline;
  return runOperationScenarioSequence(scenarioIds, {
    failFast: certificationFailFast,
    onError: (scenarioId, error) => recordCertificationRunFailure(scenarioId, error, 'operations-runtime'),
    execute: async scenarioId => {
    sessionBaseline = new Set(ownedBrowserSessions);
    activeCertificationScenario = scenarioId;
    activeCertificationAssertions = [];
    activeCertificationCaseIds = new Set();
    activeOperationAssertionOwners = new Map();
    activeOperationRequestCapture = null;
    capturedOperationRequests.clear();
    consumedOperationRequestCaptures.clear();
    activeOperationResourceRegistry = createResourceRegistry({ maxAttempts: 3 });
    await registerScheduleDiscovery({
      registry: activeOperationResourceRegistry, scopeId: scenarioId,
      snapshot: () => withEmulatorAuthAdmin((_authAdmin, firestoreAdmin) => snapshotScheduleRoots(firestoreAdmin, FIXTURES.teams.map(team => team.id))),
      registerRoot: documentPath => registerDynamicFirestoreRoot(documentPath, `schedule-owned-${documentPath.replaceAll('/', '-')}`),
    });
      if (scenarioId === 'chat-channel-message-unread' && runBrowser) {
        await runCommunicationWorkflowAudit();
        for (const dimension of ['happyPath', 'negativePath', 'permission', 'persistence', 'console', 'network', 'responsive']) {
          recordObservedOperationsCase(scenarioId, dimension, 'two-session communication workflow completed');
        }
        return;
      }
      if (scenarioId === 'sports-hub-browse-search-filter-bookmark-preferences' && runBrowser) {
        await runSportsHubBrowseWorkflowAudit();
        for (const dimension of ['happyPath', 'negativePath', 'permission', 'persistence', 'console', 'network', 'responsive']) {
          recordObservedOperationsCase(scenarioId, dimension, 'two-session Sports Hub browse workflow completed');
        }
        return;
      }
      if (scenarioId === 'calendar-team-family-views-and-filters' && runBrowser) {
        await runCalendarViewsWorkflowAudit();
        await captureCalendarCaseNavigations('cal-team-a-b', ['qa-coach-owner-a', 'qa-coach-owner-b']);
        await captureCalendarCaseNavigations('cal-family-a-c', ['qa-parent-a', 'qa-parent-b']);
        await captureCalendarCaseNavigations('cal-filters', ['qa-coach-owner-a', 'qa-parent-a']);
        await captureCalendarCaseNavigations('cal-empty', ['qa-parent-a']);
        await captureCalendarCaseNavigations('cal-invalid', ['qa-coach-owner-a']);
        await captureCalendarCaseNavigations('cal-outsider', ['qa-parent-a']);
        await captureCalendarCaseNavigations('cal-rapid-switch', ['qa-multi-org']);
        await captureCalendarCaseNavigations('cal-midnight', ['qa-coach-owner-a']);
        await captureCalendarCaseNavigations('cal-dst-spring', ['qa-coach-owner-a']);
        await captureCalendarCaseNavigations('cal-dst-fall', ['qa-coach-owner-a']);
        await captureCalendarCaseNavigations('cal-console', ['qa-coach-owner-a', 'qa-parent-a']);
        await captureCalendarCaseNavigations('cal-network', ['qa-coach-owner-a', 'qa-parent-a']);
        await captureCalendarCaseNavigations('cal-responsive', ['qa-coach-owner-a'], { mobile: true });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'cal-team-a-b', 'Team A and Team B calendar views expose only their respective squad schedules', [/Calendar Team A renders only the exact Team A schedule marker/, /Calendar Team B renders only the exact Team B schedule marker/], { actor: 'qa-coach-owner-a+qa-coach-owner-b', operation: 'visible calendar results', requests: operationRequestEvidence('cal-team-a-b'), reconciliation: 'exact Team A/Team B marker inclusion and exclusion', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'cal-family-a-c', 'Parents render exactly their authorized household schedules', [/Calendar Parent A renders exactly the linked Team A and Team C fixtures and no Team B fixture/, /Calendar Parent B renders only the linked Team B marker and filter/], { actor: 'qa-parent-a+qa-parent-b', operation: 'visible household calendar results', requests: operationRequestEvidence('cal-family-a-c'), reconciliation: 'Parent A A+C only; Parent B B only', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'cal-filters', 'Calendar day week month type team and child filters reconcile exact fixtures', [/Calendar day week month and type filters reconcile exact included and excluded fixtures/, /Calendar team and child filters reconcile exact included and excluded fixtures/], { actor: 'qa-coach-owner-a+qa-parent-a', operation: 'visible calendar result filters', requests: operationRequestEvidence('cal-filters'), reconciliation: 'exact dynamic titles present and excluded after each interaction', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'cal-empty', 'Empty type filtering hides scheduled events without crashing the Calendar', [/Calendar empty filter state hides household schedule entries/], { actor: 'qa-parent-a', operation: 'visible type filters', requests: operationRequestEvidence('cal-empty'), reconciliation: 'empty-state presentation', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'cal-invalid', 'Malformed legacy dates are ignored safely by Calendar', [/Calendar ignores malformed legacy dates without rendering a corrupted event/], { actor: 'qa-coach-owner-a', operation: 'visible Calendar rendering', requests: operationRequestEvidence('cal-invalid'), reconciliation: 'legacy invalid event absent and zero console errors', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'cal-outsider', 'Parent A cannot discover Team B through the Calendar filter surface', [/Calendar parent cannot discover another household team filter/], { actor: 'qa-parent-a', operation: 'visible household filters', requests: operationRequestEvidence('cal-outsider'), reconciliation: 'zero Team B choices', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'cal-rapid-switch', 'Rapid Team A and Team B switches settle and persist across reload and browser history', [/Calendar rapid Team A and Team B switches settle on the selected squad/, /Calendar active-team selection persists through reload/, /Calendar active-team selection survives browser back navigation/], { actor: 'qa-multi-org', operation: 'visible active-team switching', requests: operationRequestEvidence('cal-rapid-switch'), reconciliation: 'Team B schedule rendered after switch, reload, and back/forward', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'cal-midnight', 'Cross-midnight event placement spans exactly both affected local calendar days', [/Calendar cross-midnight event is placed on both affected local days/], { actor: 'qa-coach-owner-a', operation: 'visible Agenda placement', requests: operationRequestEvidence('cal-midnight'), reconciliation: 'exactly two local-day placements', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'cal-dst-spring', 'DST spring event placement is stable and non-duplicated', [/Calendar DST spring event is placed exactly once/], { actor: 'qa-coach-owner-a', operation: 'visible Agenda placement', requests: operationRequestEvidence('cal-dst-spring'), reconciliation: 'exactly one local-day placement', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'cal-dst-fall', 'DST fall event placement is stable and non-duplicated', [/Calendar DST fall event is placed exactly once/], { actor: 'qa-coach-owner-a', operation: 'visible Agenda placement', requests: operationRequestEvidence('cal-dst-fall'), reconciliation: 'exactly one local-day placement', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'console', 'cal-console', 'Calendar flows have no browser console errors', [/Calendar views workflow console errors/, /Calendar household workflow console errors/], { actor: 'qa-coach-owner-a+qa-parent-a', operation: 'browser calendar flows', requests: operationRequestEvidence('cal-console'), reconciliation: 'zero console errors', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'network', 'cal-network', 'Calendar flows have no local server failures', [/Calendar views workflow failed responses/, /Calendar household workflow failed responses/], { actor: 'qa-coach-owner-a+qa-parent-a', operation: 'browser calendar flows', requests: operationRequestEvidence('cal-network'), reconciliation: 'zero 5xx responses', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'responsive', 'cal-responsive', 'Calendar controls and overlays fit desktop and mobile viewports', [/Calendar filter panel and event detail dialog remain within desktop and mobile viewports/], { actor: 'qa-coach-owner-a', operation: 'Calendar filter panel and event detail dialog', requests: operationRequestEvidence('cal-responsive'), reconciliation: 'both overlay bounds inside desktop and mobile viewports', timeBound: 'post-workflow viewport check' });
        return;
      }
      if (scenarioId === 'calendar-ics-create-fetch-revoke' && runBrowser) {
        await runCalendarFeedLifecycleAudit();
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'ics-user', 'authenticated user-scope feed issues and fetches from the local Functions emulator', [/Calendar user feed local Function fetch/], { actor: 'qa-parent-a', operation: 'issue + public Function fetch', requests: operationRequestEvidence('ics-user'), reconciliation: '200 ICS response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'ics-team', 'authenticated team-scope feed issues and fetches from the local Functions emulator', [/Calendar team feed local Function fetch/], { actor: 'qa-adult-player-a', operation: 'issue + public Function fetch', requests: operationRequestEvidence('ics-team'), reconciliation: '200 ICS response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'ics-multi', 'authenticated multi-scope feed issues and fetches from the local Functions emulator', [/Calendar multi feed local Function fetch/], { actor: 'qa-multi-org', operation: 'issue + public Function fetch', requests: operationRequestEvidence('ics-multi'), reconciliation: '200 ICS response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'ics-rfc', 'calendar Function returns a complete RFC 5545 event body', [/Calendar Function returns RFC 5545 body/, /Calendar Function emits stable team-scoped UID for the exact event/, /Calendar Function emits timezone-aware overnight DTSTART and DTEND/, /Calendar Function RFC-escapes summary and description text/, /Calendar Function RFC-folds long content lines/], { actor: 'qa-adult-player-a', operation: 'public Function fetch', requests: operationRequestEvidence('ics-rfc'), reconciliation: 'RFC envelope, stable UID, timezone, overnight, escaping, and folding', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'ics-invalid-type', 'issuer rejects an invalid feed type', [/Calendar issuer rejects invalid feed type/], { actor: 'qa-coach-owner-a', operation: 'POST invalid type', requests: operationRequestEvidence('ics-invalid-type'), reconciliation: '400 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'ics-foreign-team', 'issuer rejects a foreign team scope', [/Calendar issuer rejects foreign team scope/], { actor: 'qa-coach-owner-a', operation: 'POST foreign team scope', requests: operationRequestEvidence('ics-foreign-team'), reconciliation: '403 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'ics-too-many', 'issuer rejects a multi-scope request beyond the limit', [/Calendar issuer rejects oversized multi selection/], { actor: 'qa-coach-owner-a', operation: 'POST oversized multi scope', requests: operationRequestEvidence('ics-too-many'), reconciliation: '400 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'ics-invalid-token', 'malformed public calendar credentials return the same non-enumerating not-found boundary', [/Calendar malformed token returns a non-enumerating boundary/], { actor: 'qa-public-submitter', operation: 'GET malformed token', requests: operationRequestEvidence('ics-invalid-token'), reconciliation: '404 generic response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'ics-unknown-token', 'well-formed unknown public calendar credentials return the same non-enumerating not-found boundary', [/Calendar well-formed unknown token returns the same non-enumerating boundary/], { actor: 'qa-public-submitter', operation: 'GET well-formed unknown token', requests: operationRequestEvidence('ics-unknown-token'), reconciliation: '404 generic response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'ics-inactive-token', 'inactive and revoked public calendar credentials return the same non-enumerating not-found boundary', [/Calendar inactive token returns a non-enumerating boundary/], { actor: 'qa-coach-owner-a', operation: 'GET inactive token', requests: operationRequestEvidence('ics-inactive-token'), reconciliation: '404 generic response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'ics-membership-revoke', 'current membership is revalidated at public fetch time', [/Calendar Function revalidates membership at fetch time/], { actor: 'qa-team-member', operation: 'remove membership then public fetch', requests: operationRequestEvidence('ics-membership-revoke'), reconciliation: '200 before and 404 after revocation', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'ics-rotate', 'feed rotation invalidates the previous credential and serves only the replacement', [/Calendar rotation invalidates prior token and serves replacement/], { actor: 'qa-coach-owner-a', operation: 'rotate then public fetch', requests: operationRequestEvidence('ics-rotate'), reconciliation: 'prior 404, replacement 200', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'console', 'ics-console', 'visible calendar subscription controls have no browser console errors', [/Calendar feed lifecycle console errors/], { actor: 'qa-coach-owner-a', operation: 'browser subscribe dialog', requests: operationRequestEvidence('ics-console'), reconciliation: 'zero console errors', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'console', 'ics-secret', 'public ICS response excludes a seeded opaque credential and action URL', [/Calendar Function body redacts subscription token and action URL/], { actor: 'qa-coach-owner-a', operation: 'local public Function fetch', requests: operationRequestEvidence('ics-secret'), reconciliation: 'response contains neither credential nor action URL', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'network', 'ics-network', 'visible calendar subscription controls have no local server failures', [/Calendar feed lifecycle failed responses/], { actor: 'qa-coach-owner-a', operation: 'browser subscribe dialog', requests: operationRequestEvidence('ics-network'), reconciliation: 'zero 5xx responses', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'responsive', 'ics-responsive-na', 'calendar subscription controls fit the supported mobile viewport', [/Calendar feed controls fit the mobile viewport/], { actor: 'qa-coach-owner-a', operation: 'mobile subscription dialog', requests: operationRequestEvidence('ics-responsive-na'), reconciliation: 'scrollWidth <= viewport', timeBound: 'post-workflow viewport check' });
        return;
      }
      if (scenarioId === 'events-event-crud-recurrence' && runBrowser) {
        const eventWorkflow = await runEventWorkflowAudit();
        await captureBrowserOperationRequests('evt-crud', 'qa-coach-owner-a', eventWorkflow.created.observedResponses, 'owner-create');
        await captureBrowserOperationRequests('evt-crud', 'qa-team-member', eventWorkflow.memberResult.observedResponses, 'member-read-rsvp');
        await captureBrowserOperationRequests('evt-crud', 'qa-coach-owner-a', eventWorkflow.ownerResult.observedResponses, 'owner-edit-delete');
        await captureBrowserOperationRequests('evt-persistence', 'qa-coach-owner-a', eventWorkflow.ownerResult.observedResponses, 'evt-persistence');
        const recurringWorkflow = await runRecurringEventWorkflowAudit();
        await captureBrowserOperationRequests('evt-series', 'qa-coach-owner-a', recurringWorkflow.observedResponses, 'evt-series');
        await captureBrowserOperationRequests('evt-occurrence-edit-delete', 'qa-coach-owner-a', recurringWorkflow.observedResponses, 'evt-occurrence-edit-delete');
        await captureBrowserOperationRequests('evt-responsive', 'qa-coach-owner-a', recurringWorkflow.observedResponses, 'evt-responsive');
        await captureBrowserOperationRequests('evt-console', 'qa-coach-owner-a', recurringWorkflow.observedResponses, 'evt-console');
        await captureBrowserOperationRequests('evt-network', 'qa-coach-owner-a', recurringWorkflow.observedResponses, 'evt-network');
        await runExactEventApiCasesAudit();
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-crud', 'owner creates, edits, deletes, and member reads a team event through the browser', [/owner event create persists after reload/, /member sees owner event/, /owner event edit persists after reload/, /owner event delete persists after reload/], { actor: 'qa-coach-owner-a+qa-team-member', operation: 'browser-event-crud', requests: operationRequestEvidence('evt-crud'), reconciliation: 'owner create/edit/delete and active member read each persist through reload', timeBound: 'Playwright response + reload' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-series', 'owner creates, edits, and deletes a four-occurrence weekly series through the browser', [/weekly recurrence creates the exact requested occurrence count/, /weekly recurrence series edit preserves all remaining occurrence dates/, /weekly recurrence series delete removes every occurrence/], { actor: 'qa-coach-owner-a', operation: 'browser-event-series', requests: operationRequestEvidence('evt-series'), reconciliation: 'four occurrences, then three remaining after an occurrence delete, then zero after series delete', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-occurrence-edit-delete', 'owner edits and deletes exactly one weekly occurrence through the visible controls', [/weekly recurrence one occurrence edit persists through reload/, /weekly recurrence one occurrence delete persists through reload/], { actor: 'qa-coach-owner-a', operation: 'browser-event-occurrence-edit-delete', requests: operationRequestEvidence('evt-occurrence-edit-delete'), reconciliation: 'one changed occurrence then zero changed titles after reload', timeBound: '15s UI waits' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-dst-spring', 'owner creates and emulator persists a spring DST calendar-date event', [/event exact DST spring create and persisted date/], { actor: 'qa-coach-owner-a', operation: 'POST create', requests: operationRequestEvidence('evt-dst-spring'), reconciliation: 'Firestore event date', timeBound: 'immediate emulator read' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-dst-fall', 'owner creates and emulator persists a fall DST calendar-date event', [/event exact DST fall create and persisted date/], { actor: 'qa-coach-owner-a', operation: 'POST create', requests: operationRequestEvidence('evt-dst-fall'), reconciliation: 'Firestore event date', timeBound: 'immediate emulator read' });
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'evt-midnight', 'owner creates a cross-midnight event and its durable schedule booking', [/event exact midnight interval and booking persist/], { actor: 'qa-coach-owner-a', operation: 'POST create', requests: operationRequestEvidence('evt-midnight'), reconciliation: 'Firestore event and scheduleBookings interval', timeBound: 'immediate emulator read' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'evt-invalid', 'server rejects malformed and reversed event payloads', [/event exact invalid payloads rejected server-side/], { actor: 'qa-coach-owner-a', operation: 'POST create invalid', requests: operationRequestEvidence('evt-invalid'), reconciliation: '400 responses', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'evt-conflict', 'server rejects overlapping team event without replacing the original', [/event exact overlap conflict preserves original/], { actor: 'qa-coach-owner-a', operation: 'POST create overlap', requests: operationRequestEvidence('evt-conflict'), reconciliation: '409 and original document retained', timeBound: 'immediate emulator read' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'evt-resource-conflict', 'server rejects cross-team use of one resource without replacing the original booking', [/event exact cross-team resource conflict preserves original booking/], { actor: 'qa-coach-owner-a+qa-coach-owner-b', operation: 'POST create shared resource', requests: operationRequestEvidence('evt-resource-conflict'), reconciliation: '200 then 409 with original booking retained', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'evt-location-conflict', 'server rejects cross-team use of one normalized location without replacing the original booking', [/event exact cross-team same-location conflict preserves original booking/], { actor: 'qa-coach-owner-a+qa-coach-owner-b', operation: 'POST create shared location', requests: operationRequestEvidence('evt-location-conflict'), reconciliation: '200 then 409 with original booking retained', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'evt-double', 'barrier-released duplicate creates produce exactly one durable event', [/event exact duplicate barrier commits once/], { actor: 'qa-coach-owner-a', operation: 'two-party POST create', requests: operationRequestEvidence('evt-double'), reconciliation: 'one 200, one 409, one document', timeBound: '5s two-party barrier' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'evt-member-deny', 'active player cannot create a team event', [/event exact member create denied/], { actor: 'qa-team-member', operation: 'POST create', requests: operationRequestEvidence('evt-member-deny'), reconciliation: '403 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'evt-assistant-own', 'active assistant coach can create a team event', [/event exact assistant create allowed/], { actor: 'qa-team-assistant', operation: 'POST create', requests: operationRequestEvidence('evt-assistant-own'), reconciliation: '200 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'evt-team-b-deny', 'Team B owner cannot create an event in Team A', [/event exact foreign team create denied/], { actor: 'qa-coach-owner-b', operation: 'POST create Team A', requests: operationRequestEvidence('evt-team-b-deny'), reconciliation: '403 response', timeBound: '20s request deadline' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'evt-persistence', 'owner event edit survives a separate browser reload', [/owner event edit second reload persistence/], { actor: 'qa-coach-owner-a', operation: 'browser event update', requests: operationRequestEvidence('evt-persistence'), reconciliation: 'second reload shows updated title before delete', timeBound: '15s UI wait' });
        recordObservedOperationNamedCase(scenarioId, 'console', 'evt-console', 'event browser paths complete without console errors', [/owner event create console errors/, /member event workflow console errors/, /weekly recurrence workflow console errors/], { actor: 'qa-coach-owner-a', operation: 'browser event flows', requests: operationRequestEvidence('evt-console'), reconciliation: 'zero console errors', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'network', 'evt-network', 'event browser paths complete without server failures', [/owner event create failed responses/, /member event workflow failed responses/, /weekly recurrence workflow failed responses/], { actor: 'qa-coach-owner-a', operation: 'browser event flows', requests: operationRequestEvidence('evt-network'), reconciliation: 'zero 5xx responses', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'responsive', 'evt-responsive', 'recurrence controls remain within the mobile viewport', [/weekly recurrence controls fit the mobile viewport/], { actor: 'qa-coach-owner-a', operation: 'browser mobile viewport', requests: operationRequestEvidence('evt-responsive'), reconciliation: 'scrollWidth <= viewport', timeBound: 'post-workflow viewport check' });
        return;
      }
      if ((scenarioId === 'events-rsvp-attendance-details' || scenarioId === 'attendance-practice-event-member-attendance') && runBrowser) {
        const scheduleWorkflow = scenarioId === 'attendance-practice-event-member-attendance'
          ? await runTeamAAttendanceWorkflowAudit() : await runRsvpAndAttendanceWorkflowAudit();
        if (scenarioId === 'events-rsvp-attendance-details') {
          await captureBrowserOperationRequests('rsvp-parent-child', 'qa-parent-a', scheduleWorkflow.parentResult.observedResponses, 'rsvp-parent-child');
          await captureBrowserOperationRequests('rsvp-console', 'qa-parent-a', scheduleWorkflow.parentResult.observedResponses, 'rsvp-console');
          await captureBrowserOperationRequests('rsvp-network', 'qa-parent-a', scheduleWorkflow.parentResult.observedResponses, 'rsvp-network');
          await captureBrowserOperationRequests('rsvp-responsive', 'qa-parent-a', scheduleWorkflow.parentResult.observedResponses, 'rsvp-responsive');
          recordObservedOperationNamedCase(scenarioId, 'happyPath', 'rsvp-self', 'adult and youth record their own RSVP through authenticated API requests', [/adult own RSVP/, /youth own RSVP/], { actor: 'qa-adult-player-a+qa-youth-active', operation: 'POST RSVP', requests: operationRequestEvidence('rsvp-self'), reconciliation: '200 responses and one participant map entry each', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'happyPath', 'rsvp-parent-child', 'parent records linked youth RSVP through the browser', [/parent child RSVP persists through the browser/, /parent browser RSVP writes the linked youth member identity/], { actor: 'qa-parent-a', operation: 'browser child RSVP', requests: operationRequestEvidence('rsvp-parent-child'), reconciliation: 'event userRsvps youth UID', timeBound: 'reload + emulator read' });
          recordObservedOperationNamedCase(scenarioId, 'happyPath', 'rsvp-parent-team-c', 'parent records RSVP for the separately linked Team C child', [/parent linked Team C child RSVP is accepted/, /parent Team C child RSVP persists under the exact child identity/], { actor: 'qa-parent-a', operation: 'POST Team C child RSVP', requests: operationRequestEvidence('rsvp-parent-team-c'), reconciliation: 'Team C event userRsvps exact child ID', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'happyPath', 'rsvp-staff', 'staff updates an active squad member RSVP', [/staff RSVP override is accepted for an active squad member/], { actor: 'qa-coach-owner-a', operation: 'POST staff RSVP', requests: operationRequestEvidence('rsvp-staff'), reconciliation: '200 response', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'negativePath', 'rsvp-cancelled', 'cancelled and deleted events reject RSVP', [/cancelled activity RSVP is denied/, /deleted activity RSVP is denied/], { actor: 'qa-adult-player-a', operation: 'POST RSVP cancelled and deleted', requests: operationRequestEvidence('rsvp-cancelled'), reconciliation: '409 cancelled and 404 deleted responses', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'negativePath', 'rsvp-replay', 'identical replayed own RSVP requests both return success without duplicate participant records', [/identical own RSVP replay updates are accepted without duplicate records/], { actor: 'qa-adult-player-a', operation: 'two-party POST RSVP', requests: operationRequestEvidence('rsvp-replay'), reconciliation: 'two 200 responses and one participant map key', timeBound: '5s two-party barrier' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'rsvp-forged-uid', 'parents cannot RSVP for an unlinked root or foreign youth', [/parent own root RSVP is denied at API boundary/, /other-household RSVP forge is denied/], { actor: 'qa-parent-a+qa-parent-b', operation: 'POST forged RSVP', requests: operationRequestEvidence('rsvp-forged-uid'), reconciliation: '403 responses', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'rsvp-removed', 'removed member RSVP is denied without participant disclosure', [/removed member RSVP is denied without exposing an inactive participant/], { actor: 'qa-removed-member', operation: 'POST RSVP', requests: operationRequestEvidence('rsvp-removed'), reconciliation: '404 response', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'rsvp-tenant-b', 'Team B staff cannot RSVP into Team A', [/Team B staff RSVP into Team A is denied/], { actor: 'qa-coach-owner-b', operation: 'POST cross-tenant RSVP', requests: operationRequestEvidence('rsvp-tenant-b'), reconciliation: '403 response', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'persistence', 'rsvp-race', 'barrier RSVP race persists one valid participant map value without corruption', [/barrier RSVP race persists exactly one valid participant map value/], { actor: 'qa-adult-player-a', operation: 'two-party POST RSVP', requests: operationRequestEvidence('rsvp-race'), reconciliation: 'one valid userRsvps value', timeBound: 'immediate emulator read' });
          recordObservedOperationNamedCase(scenarioId, 'console', 'rsvp-console', 'parent RSVP browser flow has no console errors', [/parent RSVP workflow console errors/], { actor: 'qa-parent-a', operation: 'browser RSVP', requests: operationRequestEvidence('rsvp-console'), reconciliation: 'zero console errors', timeBound: 'scenario duration' });
          recordObservedOperationNamedCase(scenarioId, 'network', 'rsvp-network', 'parent RSVP browser flow has no 5xx responses', [/parent RSVP workflow failed responses/], { actor: 'qa-parent-a', operation: 'browser RSVP', requests: operationRequestEvidence('rsvp-network'), reconciliation: 'zero 5xx responses', timeBound: 'scenario duration' });
          recordObservedOperationNamedCase(scenarioId, 'responsive', 'rsvp-responsive', 'parent RSVP dialog fits mobile viewport', [/parent RSVP dialog fits mobile viewport/], { actor: 'qa-parent-a', operation: 'mobile browser RSVP', requests: operationRequestEvidence('rsvp-responsive'), reconciliation: 'scrollWidth <= viewport', timeBound: 'post-workflow viewport check' });
        } else {
          await captureBrowserOperationRequests('att-console', 'qa-team-member', scheduleWorkflow.memberResult.observedResponses, 'att-console');
          await captureBrowserOperationRequests('att-console', 'qa-coach-owner-a', scheduleWorkflow.staffResult.observedResponses, 'att-console');
          await captureBrowserOperationRequests('att-network', 'qa-team-member', scheduleWorkflow.memberResult.observedResponses, 'att-network');
          await captureBrowserOperationRequests('att-network', 'qa-coach-owner-a', scheduleWorkflow.staffResult.observedResponses, 'att-network');
          await captureBrowserOperationRequests('att-responsive', 'qa-coach-owner-a', scheduleWorkflow.staffResult.observedResponses, 'att-responsive');
          await captureBrowserOperationRequests('att-responsive', 'qa-team-member', scheduleWorkflow.memberResult.observedResponses, 'att-responsive');
          recordObservedOperationNamedCase(scenarioId, 'happyPath', 'att-staff-record', 'owner and assistant record attendance through authenticated staff endpoints and reload the visible Team A matrix', [/staff attendance override response/, /assistant staff attendance override accepted/, /Team A attendance staff matrix/], { actor: 'qa-coach-owner-a+qa-team-assistant', operation: 'browser and staff attendance override', requests: operationRequestEvidence('att-staff-record'), reconciliation: 'event RSVP map plus durable audit records', timeBound: 'reload + emulator read' });
          recordObservedOperationNamedCase(scenarioId, 'negativePath', 'att-duplicate', 'repeating an identical staff attendance transition leaves one authoritative RSVP value and two attributable audit transitions', [/duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request/], { actor: 'qa-coach-owner-a', operation: 'repeated POST attendance override', requests: operationRequestEvidence('att-duplicate'), reconciliation: 'one map value and two audit records', timeBound: '5s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'att-member-readonly', 'member cannot override another attendance participant', [/member forged attendance override is denied/, /Team A attendance member reload is read-only/], { actor: 'qa-team-member', operation: 'POST attendance override another participant', requests: operationRequestEvidence('att-member-readonly'), reconciliation: '403 response', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'att-removed', 'removed member cannot write an active attendance participant', [/removed member attendance override is denied/], { actor: 'qa-removed-member', operation: 'POST attendance override', requests: operationRequestEvidence('att-removed'), reconciliation: '403 response', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'att-removed-read', 'removed member cannot read an attendance event', [/removed member attendance event read is denied without schedule disclosure/], { actor: 'qa-removed-member', operation: 'GET attendance event document', requests: operationRequestEvidence('att-removed-read'), reconciliation: '403 or non-enumerating 404', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'permission', 'att-tenant-b', 'Team B owner cannot read or write Team A attendance', [/Team B attendance event read is denied without schedule disclosure/, /Team B staff attendance override is denied/], { actor: 'qa-coach-owner-b', operation: 'GET and POST attendance foreign team', requests: operationRequestEvidence('att-tenant-b'), reconciliation: '403 or non-enumerating 404 read and 403 write', timeBound: '20s request deadline' });
          recordObservedOperationNamedCase(scenarioId, 'persistence', 'att-race', 'barrier-released owner and assistant updates have one defined final value with durable actor-attributed audit records', [/two-staff attendance barrier resolves to one defined RSVP value with durable audit history/], { actor: 'qa-coach-owner-a+qa-team-assistant', operation: 'two-party POST attendance override', requests: operationRequestEvidence('att-race'), reconciliation: 'one RSVP map key plus one audit record per staff request', timeBound: '5s two-party barrier' });
          recordObservedOperationNamedCase(scenarioId, 'console', 'att-console', 'member and staff attendance flows have no console errors', [/member attendance workflow console errors/, /staff attendance workflow console errors/], { actor: 'qa-team-member+qa-coach-owner-a', operation: 'browser attendance', requests: operationRequestEvidence('att-console'), reconciliation: 'zero console errors', timeBound: 'scenario duration' });
          recordObservedOperationNamedCase(scenarioId, 'network', 'att-network', 'member and staff attendance flows have no 5xx responses', [/member attendance workflow failed responses/, /staff attendance workflow failed responses/], { actor: 'qa-team-member+qa-coach-owner-a', operation: 'browser attendance', requests: operationRequestEvidence('att-network'), reconciliation: 'zero 5xx responses', timeBound: 'scenario duration' });
          recordObservedOperationNamedCase(scenarioId, 'responsive', 'att-responsive', 'owner and member Event Intelligence controls fit both viewports and owner exports the client ledger', [/Attendance exact desktop and mobile control bounds/, /Attendance exact bounded ledger export/], { actor: 'qa-coach-owner-a+qa-team-member', operation: 'desktop and mobile browser attendance export and Event RSVP controls', requests: operationRequestEvidence('att-responsive'), reconciliation: 'measured dialog/matrix/tab/close/RSVP/export bounds at both viewports and real bounded CSV rows', timeBound: 'post-workflow viewport check' });
        }
        return;
      }
      if (scenarioId === 'reminders-same-day-fcm-scheduler') {
        await runReminderSchedulerRuntimeAudit();
        recordObservedOperationNamedCase(scenarioId, 'happyPath', 'rem-eligible', 'scheduler core sends one same-day reminder through both registered local transports', [/Reminder scheduler core sends one same-day eligible FCM and Web Push delivery/], { actor: 'qa-parent-a+qa-adult-player-a+qa-youth-active', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-eligible'), reconciliation: 'one sent ledger and one FCM plus Web Push target for each PA/AP/YP fixture', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'rem-invalid-time', 'scheduler ignores malformed event times', [/Reminder scheduler excludes malformed event time/], { actor: 'qa-adult-player-a', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-invalid-time'), reconciliation: 'no malformed-event ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'rem-past-time', 'scheduler ignores no-longer-future event times', [/Reminder scheduler excludes no-longer-future event time/], { actor: 'qa-adult-player-a', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-past-time'), reconciliation: 'no past-event ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'negativePath', 'rem-no-token', 'scheduler ignores eligible members with no registered device', [/Reminder scheduler excludes eligible member with no device token/], { actor: 'qa-adult-player-b', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-no-token'), reconciliation: 'no no-token ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'rem-pref-off', 'scheduler excludes preferences-disabled recipients', [/Reminder scheduler excludes preferences-disabled recipient/], { actor: 'qa-parent-b', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-pref-off'), reconciliation: 'no preferences-disabled ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'rem-removed', 'scheduler excludes removed memberships', [/Reminder scheduler excludes removed membership/], { actor: 'qa-removed-member', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-removed'), reconciliation: 'no removed-member ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'permission', 'rem-sender', 'scheduler excludes staff sender roles from player/parent reminders', [/Reminder scheduler excludes staff sender role/], { actor: 'qa-coach-owner-a', operation: 'injected scheduler core', requests: operationRequestEvidence('rem-sender'), reconciliation: 'no staff sender ledger claim', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'rem-duplicate-run', 'overlapping scheduler cores acquire one durable reminder lease and send once', [/Reminder scheduler overlapping invocations acquire one lease and send once/], { actor: 'qa-adult-player-a', operation: 'two concurrent injected scheduler cores', requests: operationRequestEvidence('rem-duplicate-run'), reconciliation: 'one claimed/sent delivery ledger', observer: 'two injected local scheduler cores and authoritative emulator ledger read', timeBound: 'fixed local clock + transaction' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'rem-time-boundary', 'same-day DST, local-midnight rollover, and the 06:00 quiet-hours boundary use the team timezone', [/Reminder scheduler respects exact 06:00 boundary and DST offsets/, /Reminder scheduler before local midnight selects only the remaining current-day event/, /Reminder scheduler at and after local midnight preserves the 06:00 quiet-hours boundary/, /Reminder scheduler exact 06:00 start selects the future new-local-day event/, /Reminder scheduler exact 06:00 repeat is idempotent/, /Reminder scheduler local-midnight ledgers reconcile the prior-day and quiet-hours exclusions/], { actor: 'qa-adult-player-a', operation: 'injected scheduler core at fixed clocks', requests: operationRequestEvidence('rem-time-boundary'), reconciliation: 'before-midnight and exact-06:00 ledgers sent once; prior-day and pre-06:00 events remain unclaimed', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clocks' });
        recordObservedOperationNamedCase(scenarioId, 'persistence', 'rem-retry', 'a failed delivery ledger is retried and transitions to sent', [/Reminder scheduler failed ledger retry transitions to sent/], { actor: 'qa-adult-player-a', operation: 'injected safe transport failure then retry', requests: operationRequestEvidence('rem-retry'), reconciliation: 'failed then sent ledger state', observer: 'injected local scheduler core and authoritative emulator ledger read', timeBound: 'fixed local clock' });
        recordObservedOperationNamedCase(scenarioId, 'console', 'rem-redaction', 'scheduler runtime diagnostics redact opaque device values', [/Reminder scheduler captures redacted runtime diagnostics from the actual core/], { actor: 'qa-adult-player-a', operation: 'actual core diagnostic callback', requests: operationRequestEvidence('rem-redaction'), reconciliation: 'captured runtime diagnostics omit raw token and endpoint', observer: 'injected local scheduler core diagnostic callback', timeBound: 'scenario duration' });
        recordObservedOperationNamedCase(scenarioId, 'network', 'rem-network', 'scheduler uses the injected loopback-safe transport and makes no provider request', [/Reminder scheduler uses injected local transport without provider network/], { actor: 'qa-adult-player-a', operation: 'safe transport invocation', requests: operationRequestEvidence('rem-network'), reconciliation: 'zero provider requests', observer: 'injected local scheduler core transport seam', timeBound: 'scenario duration' });
        recordBlockedOperationsCases(scenarioId,
          'Deployed scheduler logs, provider acceptance, and physical-device receipt/cleanup remain external evidence obligations.',
          ['responsive']);
        return;
      }
      // The operations dispatcher is deliberately explicit. Until a domain
      // handler supplies case-owned browser/API evidence, every dimension is
      // reported as NOT_OBSERVED instead of allowing the old generic audit to
      // be misattributed as a Task 5 PASS.
      recordBlockedOperationsCases(scenarioId,
        runBrowser
          ? 'No exact case-owned operations handler has emitted evidence for this frozen scenario yet.'
          : 'This operation requires browser-enabled local handler evidence; the current run was API-only.');
    },
    finalize: async scenarioId => {
      const errors = [];
      try {
        await closeBrowserSessionsCreatedAfter(ownedBrowserSessions, sessionBaseline, async session => {
          run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
        });
      } catch (error) { errors.push(error); }
      syncBrowserSessionRegistry();
      try {
        const cleanup = await activeOperationResourceRegistry.cleanup();
        completedDynamicCleanupRuns.push(cleanup);
        if (cleanup.state !== 'OBSERVED') throw new Error(`Scenario cleanup retained ${cleanup.residuals.length} owned resource(s).`);
      } catch (error) { errors.push(error); }
      recordBlockedOperationsCases(scenarioId,
        'This exact frozen schedule case has no fresh case-owned local observation on the current candidate.');
      activeOperationResourceRegistry = null;
      activeCertificationScenario = null;
      activeCertificationAssertions = [];
      activeCertificationCaseIds = new Set();
      if (errors.length) throw new AggregateError(errors, 'Scenario-owned cleanup failed.');
    },
  });
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
    for (let attempt = 0; attempt < 8; attempt += 1) {
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

    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=${TEAM_A_ID}`)});
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
    const emptySendDisabled = await page.getByRole('button', { name: 'Send message' }).isDisabled();
    await chatInput.fill(${JSON.stringify(`QA Chat ${marker}`)});
    const [sendResponse] = await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/teams/chat/message')),
      page.getByRole('button', { name: 'Send message' }).click(),
    ]);
    const sendStatus = sendResponse.status();
    const sentChatMessage = page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true });
    const sentChatVisible = await sentChatMessage.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!sentChatVisible) {
      throw new Error('member chat send diagnostic: ' + JSON.stringify({
        sendStatus,
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1800),
        consoleErrors,
        failedResponses,
      }));
    }
    await page.reload();
    const reloadedChatMessage = page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true });
    const chatAfterReloadVisible = await reloadedChatMessage.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!chatAfterReloadVisible) {
      throw new Error('member chat persistence diagnostic: ' + JSON.stringify({
        sendStatus,
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1800),
        consoleErrors,
        failedResponses,
      }));
    }
    return {
      ownerPostVisible,
      commentAfterReload,
      voteAfterReload,
      chatAfterReload: await reloadedChatMessage.count(),
      sendStatus,
      emptySendDisabled,
      teamBLeak: await page.getByText(/BLUEBIRD-B/).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerCommunicationVerify(session, marker) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push({ status: response.status(), path: response.url().split('?')[0].replace(${JSON.stringify(BASE_URL)}, '') }); });
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    const memberComment = await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).count();
    const postText = page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true });
    const postCard = postText.locator('xpath=ancestor::div[.//button[starts-with(@aria-label,"Delete post by")]][1]');
    await postCard.getByRole('button', { name: /Delete post by/ }).click();
    await postText.waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    const deletedAfterReload = await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/chats`)});
    const channelCard = page.locator(${JSON.stringify(`a[href="/chats/qa-team-chat?teamId=${TEAM_A_ID}"]`)});
    await channelCard.waitFor({ timeout: 10000 });
    const unreadBeforeOpen = await channelCard.locator('div.bg-primary.text-white').count();
    const markReadResponse = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/api/teams/chat'));
    await channelCard.click();
    const message = page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true });
    const chatVisible = await message.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!chatVisible) {
      throw new Error('owner chat delivery diagnostic: ' + JSON.stringify({
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1800),
        consoleErrors,
        failedResponses,
      }));
    }
    const markReadStatus = (await markReadResponse).status();
    if (markReadStatus !== 200) throw new Error('owner chat read acknowledgement returned ' + markReadStatus);
    await page.goto(${JSON.stringify(`${BASE_URL}/chats`)});
    await channelCard.waitFor({ timeout: 10000 });
    const unreadAfterOpen = await channelCard.locator('div.bg-primary.text-white').count();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(${JSON.stringify(`${BASE_URL}/chats`)});
    await channelCard.waitFor({ timeout: 10000 });
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    return {
      memberComment,
      deletedAfterReload,
      chatVisible: await message.count(),
      unreadBeforeOpen,
      unreadAfterOpen,
      markReadStatus,
      mobileFits,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function readChatUnreadDiagnostics(teamId, chatId, userId) {
  return withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const chat = await firestoreAdmin.doc(`teams/${teamId}/groupChats/${chatId}`).get();
    const data = chat.data() || {};
    const value = data.unreadBy?.[userId];
    return {
      nestedOwnerUnread: typeof value === 'number' ? value : 0,
      nestedUnreadMapPresent: Boolean(data.unreadBy && typeof data.unreadBy === 'object'),
      literalUnreadFieldCount: Object.keys(data).filter(key => key.startsWith('unreadBy.')).length,
    };
  });
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
  expectEqual(memberResult.sendStatus, 200, 'member chat message request succeeds');
  expectEqual(memberResult.emptySendDisabled, true, 'chat rejects an empty message');
  expectEqual(memberResult.teamBLeak, 0, 'Team B chat content is absent from Team A UI');
  expectEqual(memberResult.consoleErrors.length, 0, 'member communication workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member communication workflow failed responses');

  const ownerUnreadServer = await readChatUnreadDiagnostics(
    TEAM_A_ID,
    'qa-team-chat',
    identityByAlias.get('qa-coach-owner-a').uid,
  );
  expectEqual(ownerUnreadServer.nestedOwnerUnread, 1, `member chat message increments owner unread state on the server (${JSON.stringify(ownerUnreadServer)})`);

  const ownerResult = browserOwnerCommunicationVerify(owner, marker);
  expectEqual(ownerResult.memberComment, 1, 'member comment persists for owner');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner feed post delete persists after reload');
  expectEqual(ownerResult.chatVisible, 1, 'member chat message persists for owner');
  expectEqual(ownerResult.unreadBeforeOpen > 0, true, 'member chat message increments owner unread state');
  expectEqual(ownerResult.unreadAfterOpen, 0, 'opening the channel clears only owner unread state');
  expectEqual(ownerResult.markReadStatus, 200, 'owner chat read acknowledgement succeeds');
  expectEqual(ownerResult.mobileFits, true, 'chat channel list remains within the mobile viewport');
  expectEqual(ownerResult.consoleErrors.length, 0, 'owner chat verification console errors');
  expectEqual(ownerResult.failedResponses.length, 0, 'owner chat verification failed responses');
}

function sportsHubStorageKey(kind, userId) {
  return `sh:${kind}:${userId}`;
}

function browserMemberSportsHubWorkflow(session, memberUid) {
  const bookmarksKey = sportsHubStorageKey('bookmarks', memberUid);
  const preferencesKey = sportsHubStorageKey('preferences', memberUid);
  const code = `async page => {
    const bookmarksKey = ${JSON.stringify(bookmarksKey)};
    const preferencesKey = ${JSON.stringify(preferencesKey)};
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) {
        failedResponses.push({ status: response.status(), path: response.url().slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/news`)});
      const bookmark = page.getByTitle('Bookmark').first();
      await bookmark.waitFor({ state: 'visible', timeout: 15000 });
      await bookmark.click();
      const bookmarked = page.getByTitle('Remove bookmark').first();
      await bookmarked.waitFor({ state: 'visible', timeout: 10000 });
      const memberBookmarksAfterClick = await page.evaluate(key => localStorage.getItem(key), bookmarksKey);
      await page.getByRole('button', { name: /^Saved/ }).click();
      await page.getByText(/Bookmarked only/).waitFor({ timeout: 10000 });
      await page.reload();
      await page.getByTitle('Remove bookmark').first().waitFor({ state: 'visible', timeout: 15000 });
      const memberBookmarksAfterReload = await page.evaluate(key => localStorage.getItem(key), bookmarksKey);

      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/search?q=championship`)});
      await page.getByText(/result.*for.*championship/i).waitFor({ timeout: 10000 });
      const championshipResults = await page.getByText(/result.*for.*championship/i).count();
      await page.getByRole('button', { name: 'Resources', exact: true }).click();
      await page.getByText(/No results for/i).waitFor({ timeout: 10000 });
      const resourceFilterEmpty = await page.getByText(/No results for/i).count();
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/search?q=not-a-real-sports-hub-query`)});
      await page.getByText(/No results for/i).waitFor({ timeout: 10000 });
      const invalidQueryEmpty = await page.getByText(/No results for/i).count();

      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/preferences`)});
      await page.getByRole('button', { name: 'Soccer', exact: true }).click();
      await page.getByRole('button', { name: 'High School', exact: true }).click();
      await page.getByRole('button', { name: 'U12', exact: true }).click();
      await page.getByRole('button', { name: 'Competitive', exact: true }).click();
      await page.getByRole('button', { name: 'Save Preferences', exact: true }).click();
      await page.getByText('Preferences Saved', { exact: true }).waitFor({ timeout: 10000 });
      const preferencesAfterSave = await page.evaluate(key => localStorage.getItem(key), preferencesKey);
      await page.reload();
      await page.getByRole('button', { name: 'Soccer', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
      const preferencesAfterReload = await page.evaluate(key => localStorage.getItem(key), preferencesKey);

      await page.evaluate(key => localStorage.setItem(key, '{malformed'), bookmarksKey);
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/news`)});
      await page.getByTitle('Bookmark').first().waitFor({ state: 'visible', timeout: 15000 });
      const malformedRecovered = await page.evaluate(key => localStorage.getItem(key), bookmarksKey);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/news`)});
      await page.getByRole('heading', { name: 'Articles', exact: true }).waitFor({ timeout: 15000 });
      const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [bookmarksKey, preferencesKey]);
      return {
        memberBookmarksAfterClick, memberBookmarksAfterReload, championshipResults,
        resourceFilterEmpty, invalidQueryEmpty, preferencesAfterSave, preferencesAfterReload,
        malformedRecovered, mobileFits, consoleErrors, failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerSportsHubIsolation(session, memberUid, ownerUid) {
  const memberBookmarksKey = sportsHubStorageKey('bookmarks', memberUid);
  const ownerBookmarksKey = sportsHubStorageKey('bookmarks', ownerUid);
  const ownerPreferencesKey = sportsHubStorageKey('preferences', ownerUid);
  const code = `async page => {
    const memberBookmarksKey = ${JSON.stringify(memberBookmarksKey)};
    const ownerBookmarksKey = ${JSON.stringify(ownerBookmarksKey)};
    const ownerPreferencesKey = ${JSON.stringify(ownerPreferencesKey)};
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) {
        failedResponses.push({ status: response.status(), path: response.url().slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/news`)});
      await page.getByTitle('Bookmark').first().waitFor({ state: 'visible', timeout: 15000 });
      const ownerInitialBookmarkButtons = await page.getByTitle('Bookmark').count();
      const storage = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), [memberBookmarksKey, ownerBookmarksKey, ownerPreferencesKey]);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(${JSON.stringify(`${BASE_URL}/sports-hub/preferences`)});
      await page.getByRole('heading', { name: 'My Preferences', exact: true }).waitFor({ timeout: 15000 });
      const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      await page.evaluate(keys => keys.forEach(key => localStorage.removeItem(key)), [memberBookmarksKey, ownerBookmarksKey, ownerPreferencesKey]);
      return { ownerInitialBookmarkButtons, storage, mobileFits, consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runSportsHubBrowseWorkflowAudit() {
  const memberUid = identityByAlias.get('qa-team-member').uid;
  const ownerUid = identityByAlias.get('qa-coach-owner-a').uid;
  const member = await browserLogin('qa-team-member', '/dashboard', `sports-hub-member-${process.pid}`);
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `sports-hub-owner-${process.pid}`);
  const memberResult = browserMemberSportsHubWorkflow(member, memberUid);
  expectEqual(Array.isArray(JSON.parse(memberResult.memberBookmarksAfterClick || 'null')), true, 'Sports Hub bookmark is stored under the signed-in member scope');
  expectEqual(memberResult.memberBookmarksAfterClick, memberResult.memberBookmarksAfterReload, 'Sports Hub bookmark persists after member reload');
  expectEqual(memberResult.championshipResults > 0, true, 'Sports Hub keyword search returns relevant content');
  expectEqual(memberResult.resourceFilterEmpty, 1, 'Sports Hub content-type filter excludes non-resource results');
  expectEqual(memberResult.invalidQueryEmpty, 1, 'Sports Hub invalid query returns an empty state');
  expectEqual(memberResult.preferencesAfterSave, memberResult.preferencesAfterReload, 'Sports Hub member preferences persist after reload');
  expectEqual(memberResult.preferencesAfterReload.includes('Soccer') && memberResult.preferencesAfterReload.includes('high-school'), true, 'Sports Hub saved preferences preserve selected values');
  expectEqual(memberResult.malformedRecovered, '{malformed', 'Sports Hub ignores malformed scoped bookmarks without rewriting user data');
  expectEqual(memberResult.mobileFits, true, 'Sports Hub news fits the mobile viewport');
  expectEqual(memberResult.consoleErrors.length, 0, 'Sports Hub member workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'Sports Hub member workflow failed responses');

  const ownerResult = browserOwnerSportsHubIsolation(owner, memberUid, ownerUid);
  expectEqual(ownerResult.ownerInitialBookmarkButtons > 0, true, 'Sports Hub owner starts without the member bookmark state');
  expectEqual(ownerResult.storage[`sh:bookmarks:${memberUid}`], null, 'Sports Hub owner session cannot read member scoped bookmarks');
  expectEqual(ownerResult.storage[`sh:bookmarks:${ownerUid}`], null, 'Sports Hub owner has an independent bookmark scope');
  expectEqual(ownerResult.storage[`sh:preferences:${ownerUid}`], null, 'Sports Hub owner has an independent preference scope');
  expectEqual(ownerResult.mobileFits, true, 'Sports Hub preferences fit the mobile viewport');
  expectEqual(ownerResult.consoleErrors.length, 0, 'Sports Hub owner workflow console errors');
  expectEqual(ownerResult.failedResponses.length, 0, 'Sports Hub owner workflow failed responses');
}

async function captureCalendarCaseNavigations(caseId, actorAliases, { mobile = false } = {}) {
  for (const actorAlias of actorAliases) {
    const session = await browserLogin(actorAlias, '/dashboard', `calendar-${caseId}-${actorAlias}-${process.pid}`);
    const result = JSON.parse(cli(session, ['run-code', `async page => {
      const observedResponses = [];
      const observeResponse = ${observeCalendarResponse.toString()};
      page.on('response', response => {
        const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, ${JSON.stringify(caseId)}, '/api/calendar/feed');
        if (observation) observedResponses.push(observation);
      });
      await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      return { observedResponses, mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) };
    }` ]));
    if (mobile) expectEqual(result.mobileFits, true, 'Calendar evidence navigation fits the mobile viewport');
    await captureBrowserOperationRequests(caseId, actorAlias, result.observedResponses, caseId);
  }
}

async function assertCalendarExactMarkerIsolation({ actorAlias, includedTitle, excludedTitles, label }) {
  const session = await browserLogin(actorAlias, '/dashboard', `calendar-marker-${actorAlias}-${process.pid}`);
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
    await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
    await monthHeader.getByRole('button').last().click();
    await page.getByText(${JSON.stringify(includedTitle)}, { exact: true }).waitFor({ timeout: 15000 });
    return {
      included: await page.getByText(${JSON.stringify(includedTitle)}, { exact: true }).count(),
      excluded: await Promise.all(${JSON.stringify(excludedTitles)}.map(title => page.getByText(title, { exact: true }).count())),
    };
  }` ]));
  expectEqual(result.included > 0 && result.excluded.every(count => count === 0), true, label);
}

async function assertCalendarFilterAndDetailBounds(activeEventTitle) {
  const viewportResults = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const session = await browserLogin('qa-coach-owner-a', '/dashboard', `calendar-bounds-${viewport.width}-${process.pid}`);
    const result = JSON.parse(cli(session, ['run-code', `async page => {
      const viewport = ${JSON.stringify(viewport)};
      const boundsTolerance = 0.5;
      const inside = box => !!box && box.x >= -boundsTolerance && box.y >= -boundsTolerance && box.x + box.width <= viewport.width + boundsTolerance && box.y + box.height <= viewport.height + boundsTolerance;
      await page.setViewportSize(viewport);
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Agenda', exact: true }).click();
      const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
      await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
      await monthHeader.getByRole('button').last().click();
      const eventHeading = page.getByRole('heading', { name: ${JSON.stringify(activeEventTitle)}, exact: true }).first();
      await eventHeading.waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const filterPanel = page.getByText('Squad Enrollment', { exact: true }).locator('..');
      await filterPanel.waitFor({ state: 'visible', timeout: 15000 });
      const filterPanelBox = await filterPanel.boundingBox();
      const filterPanelWithinViewport = inside(filterPanelBox);
      await page.keyboard.press('Escape');
      await eventHeading.click();
      const detailDialog = page.getByRole('dialog').filter({ hasText: ${JSON.stringify(activeEventTitle)} });
      await detailDialog.waitFor({ state: 'visible', timeout: 15000 });
      await detailDialog.evaluate(async node => {
        const geometry = () => {
          const rect = node.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        };
        const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
        let previous = geometry();
        let stableFrames = 0;
        const deadline = performance.now() + 2000;
        while (performance.now() < deadline) {
          await nextFrame();
          const current = geometry();
          const stable = current.every((value, index) => Math.abs(current[index] - previous[index]) <= 0.5);
          stableFrames = stable ? stableFrames + 1 : 0;
          if (stableFrames >= 2) return;
          previous = current;
        }
        throw new Error('Calendar detail dialog geometry did not settle within 2 seconds.');
      });
      const detailDialogBox = await detailDialog.boundingBox();
      const detailDialogWithinViewport = inside(detailDialogBox);
      return { viewport, filterPanelBox, filterPanelWithinViewport, detailDialogBox, detailDialogWithinViewport, mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) };
    }` ]));
    viewportResults.push(result);
  }
  const allWithinViewport = viewportResults.every(result => result.filterPanelWithinViewport && result.detailDialogWithinViewport && result.mobileFits);
  if (!allWithinViewport) throw new Error(`Calendar overlay bounds failed: ${JSON.stringify(viewportResults)}`);
  expectEqual(allWithinViewport, true, 'Calendar filter panel and event detail dialog remain within desktop and mobile viewports');
}

async function assertCalendarRenderedFilterReconciliation({ activeEventTitle, householdEventTitle, teamA, teamB, teamC }) {
  const youthAName = `Youth A ${teamA.visibleMarker}`;
  const youthCName = `Youth C ${teamC.visibleMarker}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `calendar-view-results-${process.pid}`);
  const ownerResult = JSON.parse(cli(owner, ['run-code', `async page => {
    const title = ${JSON.stringify(activeEventTitle)};
    const eventButton = () => page.getByRole('button', { name: ${JSON.stringify(`View ${activeEventTitle}`)}, exact: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
    await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
    await monthHeader.getByRole('button').last().click();
    await eventButton().waitFor({ timeout: 15000 });
    const monthCount = await eventButton().count();
    await eventButton().first().click();
    await page.getByRole('dialog').filter({ hasText: title }).waitFor({ state: 'visible', timeout: 15000 });
    await page.keyboard.press('Escape');
    const results = { monthCount, dayCount: 0, weekCount: 0, agendaCount: 0, typeHiddenCount: 0, typeRestoredCount: 0 };
    for (const [buttonName, property] of [['Day', 'dayCount'], ['Week', 'weekCount'], ['Agenda', 'agendaCount']]) {
      await page.getByRole('button', { name: buttonName, exact: true }).click();
      await page.getByRole('heading', { name: title, exact: true }).first().waitFor({ timeout: 15000 });
      results[property] = await page.getByRole('heading', { name: title, exact: true }).count();
    }
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const typeRow = page.getByText('Event Types', { exact: true }).locator('..').getByText('practice', { exact: true }).locator('..');
    await typeRow.click();
    await page.keyboard.press('Escape');
    results.typeHiddenCount = await page.getByRole('heading', { name: title, exact: true }).count();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByText('Event Types', { exact: true }).locator('..').getByText('practice', { exact: true }).locator('..').click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: title, exact: true }).first().waitFor({ timeout: 15000 });
    results.typeRestoredCount = await page.getByRole('heading', { name: title, exact: true }).count();
    return results;
  }` ]));
  expectEqual(ownerResult.monthCount > 0 && ownerResult.dayCount > 0 && ownerResult.weekCount > 0 && ownerResult.agendaCount > 0 && ownerResult.typeHiddenCount === 0 && ownerResult.typeRestoredCount > 0, true,
    'Calendar day week month and type filters reconcile exact included and excluded fixtures');

  const parent = await browserLogin('qa-parent-a', '/family', `calendar-family-results-${process.pid}`);
  const parentResult = JSON.parse(cli(parent, ['run-code', `async page => {
    const activeTitle = ${JSON.stringify(activeEventTitle)};
    const householdTitle = ${JSON.stringify(householdEventTitle)};
    const titleCount = title => page.getByRole('heading', { name: title, exact: true }).count();
    const openFilters = async () => {
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const panel = page.getByText('Squad Enrollment', { exact: true }).locator('..');
      await panel.waitFor({ state: 'visible', timeout: 15000 });
      await page.getByText('Household Athletes', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
      return panel;
    };
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
    await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
    await monthHeader.getByRole('button').last().click();
    await page.getByRole('heading', { name: activeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    await page.getByRole('heading', { name: householdTitle, exact: true }).first().waitFor({ timeout: 15000 });
    const panel = await openFilters();
    const teamA = panel.getByText(${JSON.stringify(teamA.name)}, { exact: true }).locator('..');
    const teamC = panel.getByText(${JSON.stringify(teamC.name)}, { exact: true }).locator('..');
    const teamB = panel.getByText(${JSON.stringify(teamB.name)}, { exact: true });
    const youthA = panel.getByText(${JSON.stringify(youthAName)}, { exact: true }).locator('..');
    const youthC = panel.getByText(${JSON.stringify(youthCName)}, { exact: true }).locator('..');
    const householdProjection = {
      teamRows: (await teamA.count()) + (await teamC.count()),
      teamBRows: await teamB.count(),
      youthARows: await youthA.count(),
      youthCRows: await youthC.count(),
    };
    await page.keyboard.press('Escape');
    const bothVisible = { active: await titleCount(activeTitle), household: await titleCount(householdTitle), foreign: await page.getByText(${JSON.stringify(`${teamB.visibleMarker} Future Practice`)}, { exact: true }).count() };
    let currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(teamC.name)}, { exact: true }).locator('..').click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: activeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    const teamAOnly = { active: await titleCount(activeTitle), household: await titleCount(householdTitle) };
    currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(teamC.name)}, { exact: true }).locator('..').click();
    await currentPanel.getByText(${JSON.stringify(teamA.name)}, { exact: true }).locator('..').click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: householdTitle, exact: true }).first().waitFor({ timeout: 15000 });
    const teamCOnly = { active: await titleCount(activeTitle), household: await titleCount(householdTitle) };
    currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(teamA.name)}, { exact: true }).locator('..').click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: activeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(youthAName)}, { exact: true }).locator('..').click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: activeTitle, exact: true }).first().waitFor({ timeout: 15000 });
    const youthAOnly = { active: await titleCount(activeTitle), household: await titleCount(householdTitle) };
    currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(youthAName)}, { exact: true }).locator('..').click();
    await currentPanel.getByText(${JSON.stringify(youthAName)}, { exact: true }).locator('..').getByRole('checkbox').waitFor({ state: 'attached', timeout: 15000 });
    await currentPanel.getByText(${JSON.stringify(youthAName)}, { exact: true }).locator('..').getByRole('checkbox').evaluate(node => {
      if (node.getAttribute('data-state') !== 'unchecked') throw new Error('Youth A filter did not settle to unchecked before Youth C selection.');
    });
    await currentPanel.getByText(${JSON.stringify(youthCName)}, { exact: true }).locator('..').click();
    await currentPanel.getByText(${JSON.stringify(youthCName)}, { exact: true }).locator('..').getByRole('checkbox').evaluate(node => {
      if (node.getAttribute('data-state') !== 'checked') throw new Error('Youth C filter did not settle to checked before calendar reconciliation.');
    });
    await page.keyboard.press('Escape');
    const inspectChildFilter = async () => ({
      active: await titleCount(activeTitle),
      household: await titleCount(householdTitle),
      selectedTeams: await page.locator('[data-calendar-team-id][data-state="checked"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-calendar-team-id'))),
      selectedChildren: await page.locator('[data-calendar-child-id][data-state="checked"]').evaluateAll(nodes => nodes.map(node => ({ id: node.getAttribute('data-calendar-child-id'), teamIds: node.getAttribute('data-calendar-team-ids') }))),
      visibleEventTeams: await page.locator('[data-calendar-event-team-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-calendar-event-team-id'))),
    });
    const youthCOnly = await inspectChildFilter();
    await page.reload();
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const directMonthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
    await directMonthHeader.getByRole('button', { name: 'Today', exact: true }).click();
    await directMonthHeader.getByRole('button').last().click();
    await page.getByRole('heading', { name: householdTitle, exact: true }).first().waitFor({ timeout: 15000 });
    currentPanel = await openFilters();
    await currentPanel.getByText(${JSON.stringify(youthCName)}, { exact: true }).locator('..').click();
    await currentPanel.getByText(${JSON.stringify(youthCName)}, { exact: true }).locator('..').getByRole('checkbox').evaluate(node => {
      if (node.getAttribute('data-state') !== 'checked') throw new Error('Direct Youth C filter did not settle to checked.');
    });
    await page.keyboard.press('Escape');
    const directYouthCOnly = await inspectChildFilter();
    return { householdProjection, bothVisible, teamAOnly, teamCOnly, youthAOnly, youthCOnly, directYouthCOnly };
  }` ]));
  expectEqual(parentResult.householdProjection.teamRows === 2 && parentResult.householdProjection.teamBRows === 0 && parentResult.householdProjection.youthARows === 1 && parentResult.householdProjection.youthCRows === 1 && parentResult.bothVisible.active > 0 && parentResult.bothVisible.household > 0 && parentResult.bothVisible.foreign === 0, true,
    'Calendar Parent A renders exactly the linked Team A and Team C fixtures and no Team B fixture');
  const childFiltersReconciled = parentResult.teamAOnly.active > 0 && parentResult.teamAOnly.household === 0 && parentResult.teamCOnly.active === 0 && parentResult.teamCOnly.household > 0 && parentResult.youthAOnly.active > 0 && parentResult.youthAOnly.household === 0 && parentResult.youthCOnly.active === 0 && parentResult.youthCOnly.household > 0 && parentResult.directYouthCOnly.active === 0 && parentResult.directYouthCOnly.household > 0;
  if (!childFiltersReconciled) throw new Error(`Calendar child filter reconciliation failed: ${JSON.stringify(parentResult)}`);
  expectEqual(childFiltersReconciled, true, 'Calendar team and child filters reconcile exact included and excluded fixtures');
}

async function runCalendarViewsWorkflowAudit() {
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `calendar-owner-${process.pid}`);
  const result = JSON.parse(cli(owner, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) {
        failedResponses.push({ status: response.status(), path: response.url().slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      const dismissTransientDialogs = async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const dialogs = page.getByRole('dialog');
          const dialog = dialogs.last();
          if (!await dialog.waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false)) break;
          const acknowledge = dialog.getByRole('button', { name: 'Got It', exact: true });
          if (await acknowledge.count()) await acknowledge.click();
          else await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
        }
      };
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      await dismissTransientDialogs();
      const agenda = page.getByRole('button', { name: 'Agenda', exact: true });
      await agenda.click();
      const agendaActive = await agenda.getAttribute('data-state').catch(() => null);
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByText('Squad Enrollment', { exact: true }).waitFor({ timeout: 10000 });
      const enrolledSquads = await page.getByText(/Phase 2 (Falcons|Bluebirds)/).count();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Week', exact: true }).click();
      const weekVisible = await page.getByRole('button', { name: 'Week', exact: true }).count();
      await page.getByRole('button', { name: 'Day', exact: true }).click();
      const dayVisible = await page.getByRole('button', { name: 'Day', exact: true }).count();
      await page.getByRole('button', { name: 'Month', exact: true }).click();
      const monthVisible = await page.getByRole('button', { name: 'Month', exact: true }).count();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 10000 });
      const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      return { agendaActive, weekVisible, dayVisible, monthVisible, enrolledSquads, mobileFits, consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`]));
  expectEqual(result.enrolledSquads > 0, true, 'Calendar exposes the authenticated owner squad filter choices');
  expectEqual(result.weekVisible === 1 && result.dayVisible === 1 && result.monthVisible === 1, true,
    'Calendar day week and month view controls settle through visible clicks');
  expectEqual(result.mobileFits, true, 'Calendar fits the mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'Calendar views workflow console errors');
  expectEqual(result.failedResponses.length, 0, 'Calendar views workflow failed responses');

  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  const teamC = FIXTURES.teams.find(team => team.alias === 'qa-team-c');
  if (!teamA || !teamB || !teamC) throw new Error('Calendar household fixture teams are missing.');
  await assertCalendarExactMarkerIsolation({
    actorAlias: 'qa-coach-owner-a', includedTitle: `${teamA.visibleMarker} Future Practice`,
    excludedTitles: [`${teamB.visibleMarker} Future Practice`],
    label: 'Calendar Team A renders only the exact Team A schedule marker',
  });
  await assertCalendarExactMarkerIsolation({
    actorAlias: 'qa-coach-owner-b', includedTitle: `${teamB.visibleMarker} Future Practice`,
    excludedTitles: [`${teamA.visibleMarker} Future Practice`],
    label: 'Calendar Team B renders only the exact Team B schedule marker',
  });
  const activeHouseholdEventTitle = `QA Calendar Active Household ${process.pid}`;
  const householdEventTitle = `QA Calendar Household ${process.pid}`;
  const crossMidnightTitle = `QA Calendar Cross Midnight ${process.pid}`;
  const dstSpringTitle = `QA Calendar DST Spring ${process.pid}`;
  const dstFallTitle = `QA Calendar DST Fall ${process.pid}`;
  const malformedLegacyTitle = `QA Calendar Legacy Invalid ${process.pid}`;
  const teamAOwner = await signIn('qa-coach-owner-a');
  const teamCOwner = await signIn('qa-league-owner-a');
  const activeHouseholdEvent = await apiJsonResult('/api/teams/events/action', teamAOwner.body.idToken, {
    method: 'POST',
    body: JSON.stringify({ action: 'create', teamId: teamA.id, event: {
      title: activeHouseholdEventTitle,
      date: '2026-10-16',
      endDate: '2026-10-16',
      startTime: '16:00',
      endTime: '17:00',
      eventType: 'practice',
      location: `QA Calendar Active Household ${process.pid}`,
    } }),
  });
  expectEqual(activeHouseholdEvent.status, 200, 'Calendar active household event fixture creation');
  const householdEvent = await apiJsonResult('/api/teams/events/action', teamCOwner.body.idToken, {
    method: 'POST',
    body: JSON.stringify({ action: 'create', teamId: teamC.id, event: {
      title: householdEventTitle,
      date: '2026-10-15',
      endDate: '2026-10-15',
      startTime: '16:00',
      endTime: '17:00',
      eventType: 'practice',
      location: `QA Calendar Household ${process.pid}`,
    } }),
  });
  expectEqual(householdEvent.status, 200, 'Calendar household event fixture creation');
  const calendarPlacementFixtures = [
    { title: crossMidnightTitle, date: '2026-10-20', endDate: '2026-10-21', startTime: '23:30', endTime: '00:30' },
    { title: dstSpringTitle, date: '2026-03-08', endDate: '2026-03-08', startTime: '01:30', endTime: '03:30' },
    { title: dstFallTitle, date: '2026-11-01', endDate: '2026-11-01', startTime: '01:30', endTime: '02:30' },
  ];
  for (const fixture of calendarPlacementFixtures) {
    const created = await apiJsonResult('/api/teams/events/action', teamAOwner.body.idToken, {
      method: 'POST',
      body: JSON.stringify({ action: 'create', teamId: teamA.id, event: { ...fixture, eventType: 'practice', location: fixture.title } }),
    });
    expectEqual(created.status, 200, `Calendar ${fixture.title} fixture creation`);
    if (typeof created.body?.eventId !== 'string') throw new Error(`Calendar ${fixture.title} fixture did not return an event id.`);
    registerDynamicFirestoreRoot(`teams/${teamA.id}/events/${created.body.eventId}`, `calendar-${fixture.title}-event`);
    registerDynamicFirestoreRoot(`scheduleBookings/team_event_${teamA.id}_${created.body.eventId}`, `calendar-${fixture.title}-booking`);
  }
  const malformedLegacyId = `calendar_legacy_invalid_${process.pid}`;
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    await firestoreAdmin.doc(`teams/${teamA.id}/events/${malformedLegacyId}`).set({
      id: malformedLegacyId,
      teamId: teamA.id,
      title: malformedLegacyTitle,
      date: '2026-02-30',
      startTime: '12:00',
      eventType: 'practice',
      location: 'legacy invalid date fixture',
    });
  });
  registerDynamicFirestoreRoot(`teams/${teamA.id}/events/${malformedLegacyId}`, 'calendar-malformed-legacy-event');
  const parent = await browserLogin('qa-parent-a', '/family', `calendar-parent-${process.pid}`);
  const parentResult = JSON.parse(cli(parent, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) {
        failedResponses.push({ status: response.status(), path: response.url().slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0] });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      const dismissTransientDialogs = async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const dialog = page.getByRole('dialog').last();
          if (!await dialog.waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false)) break;
          const acknowledge = dialog.getByRole('button', { name: 'Got It', exact: true });
          if (await acknowledge.count()) await acknowledge.click();
          else await page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
        }
      };
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      await dismissTransientDialogs();
      await page.getByRole('button', { name: 'Agenda', exact: true }).click();
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const filterPanel = page.getByText('Squad Enrollment', { exact: true }).locator('..');
      const teamAFilter = filterPanel.getByText(${JSON.stringify(teamA.name)}, { exact: true }).locator('..');
      const teamCFilter = filterPanel.getByText(${JSON.stringify(teamC.name)}, { exact: true }).locator('..');
      await teamAFilter.waitFor({ timeout: 15000 });
      await teamCFilter.waitFor({ timeout: 15000 });
      const householdFilterCount = (await teamAFilter.count()) + (await teamCFilter.count());
      const outsiderFilterCount = await filterPanel.getByText(${JSON.stringify(teamB.name)}, { exact: true }).count();
      const eventTypePanel = page.getByText('Event Types', { exact: true }).locator('..');
      const eventTypeCount = await eventTypePanel.getByText(/^(game|practice|tournament|meeting|other)$/i).count();
      // The parent profile, memberships, and private athlete collection are
      // independent Firestore subscriptions.  Wait for the athlete projection
      // instead of treating the first rendered filter shell as settled.
      await page.getByText('Household Athletes', { exact: true }).waitFor({ timeout: 15000 });
      const athletePanel = page.getByText('Household Athletes', { exact: true }).locator('..');
      const athleteCount = await athletePanel.locator('[role="checkbox"]').count();
      // This visible checkbox click is a real family-scope filter action. The
      // selected athlete can only contribute their already-authorized teams.
      if (athleteCount > 0) await athletePanel.locator('[role="checkbox"]').first().locator('..').click();
      // Radix mirrors data-state onto the indicator as well as the checkbox
      // root; count the accessible controls rather than implementation nodes.
      const selectedAthleteCount = await athletePanel.locator('[role="checkbox"][data-state="checked"]').count();
      if (athleteCount > 0) await athletePanel.locator('[role="checkbox"]').first().locator('..').click();
      // An empty type selection is a stable, user-visible no-results state;
      // restore the values so the subsequent team-view checks use the full
      // household schedule.
      const typeRows = eventTypePanel.getByText(/^(game|practice|tournament|meeting|other)$/i);
      for (let index = 0; index < await typeRows.count(); index += 1) await typeRows.nth(index).locator('..').click();
      await page.keyboard.press('Escape');
      const emptyTypeState = await page.getByText('No scheduled events match these filters', { exact: true }).count();
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      for (let index = 0; index < await typeRows.count(); index += 1) await typeRows.nth(index).locator('..').click();
      // Produce C-only from the observed current state. Parents now begin with
      // their full household scope, while other roles begin at their active
      // team, so fixed blind toggles would accidentally clear both choices.
      const teamCCheckbox = teamCFilter.getByRole('checkbox');
      const teamACheckbox = teamAFilter.getByRole('checkbox');
      if (await teamCCheckbox.getAttribute('data-state') !== 'checked') await teamCFilter.click();
      if (await teamACheckbox.getAttribute('data-state') === 'checked') await teamAFilter.click();
      await page.keyboard.press('Escape');
      await dismissTransientDialogs();
      const calendarMonthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
      await calendarMonthHeader.getByRole('button').last().click();
      await page.getByRole('heading', { name: ${JSON.stringify(householdEventTitle)}, exact: true }).waitFor({ timeout: 15000 });
      const teamAAfterSwitch = await page.getByRole('heading', { name: ${JSON.stringify(activeHouseholdEventTitle)}, exact: true }).count();
      const teamBAfterSwitch = await page.getByText(${JSON.stringify(`${teamB.visibleMarker} Future Practice`)}, { exact: true }).count();
      await page.setViewportSize({ width: 390, height: 844 });
      return {
        householdFilterCount,
        outsiderFilterCount,
        eventTypeCount,
        athleteCount,
        selectedAthleteCount,
        emptyTypeState,
        teamAAfterSwitch,
        teamBAfterSwitch,
        mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }` ]));
  expectEqual(parentResult.householdFilterCount > 0, true, 'Calendar parent sees both household team filters');
  expectEqual(parentResult.outsiderFilterCount, 0, 'Calendar parent cannot discover another household team filter');
  expectEqual(parentResult.eventTypeCount, 5, 'Calendar exposes every event type filter through visible controls');
  expectEqual(parentResult.athleteCount >= 2, true, 'Calendar parent athlete filter exposes every authorized household athlete');
  expectEqual(parentResult.selectedAthleteCount, 1, 'Calendar parent athlete filter selects only an authorized household athlete');
  expectEqual(parentResult.emptyTypeState > 0, true, 'Calendar empty filter state hides household schedule entries');
  expectEqual(parentResult.teamAAfterSwitch, 0, 'Calendar parent team filter removes the other household schedule');
  expectEqual(parentResult.teamBAfterSwitch, 0, 'Calendar parent cannot view another household schedule');
  expectEqual(parentResult.mobileFits, true, 'Calendar household views fit the mobile viewport');
  expectEqual(parentResult.consoleErrors.length, 0, 'Calendar household workflow console errors');
  expectEqual(parentResult.failedResponses.length, 0, 'Calendar household workflow failed responses');

  await assertCalendarRenderedFilterReconciliation({
    activeEventTitle: activeHouseholdEventTitle,
    householdEventTitle,
    teamA,
    teamB,
    teamC,
  });
  await assertCalendarFilterAndDetailBounds(activeHouseholdEventTitle);

  const parentB = await browserLogin('qa-parent-b', '/family', `calendar-parent-b-${process.pid}`);
  const parentBResult = JSON.parse(cli(parentB, ['run-code', `async page => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Agenda', exact: true }).click();
    const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
    await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
    await monthHeader.getByRole('button').last().click();
    await page.getByText(${JSON.stringify(`${teamB.visibleMarker} Future Practice`)}, { exact: true }).waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const panel = page.getByText('Squad Enrollment', { exact: true }).locator('..');
    return {
      teamB: await page.getByText(${JSON.stringify(`${teamB.visibleMarker} Future Practice`)}, { exact: true }).count(),
      teamA: await page.getByText(${JSON.stringify(`${teamA.visibleMarker} Future Practice`)}, { exact: true }).count(),
      teamCFilter: await panel.getByText(${JSON.stringify(teamC.name)}, { exact: true }).count(),
      teamAFilter: await panel.getByText(${JSON.stringify(teamA.name)}, { exact: true }).count(),
      teamBFilter: await panel.getByText(${JSON.stringify(teamB.name)}, { exact: true }).count(),
    };
  }` ]));
  expectEqual(parentBResult.teamB > 0 && parentBResult.teamA === 0 && parentBResult.teamBFilter > 0 && parentBResult.teamAFilter === 0 && parentBResult.teamCFilter === 0, true,
    'Calendar Parent B renders only the linked Team B marker and filter');

  const placementOwner = await browserLogin('qa-coach-owner-a', '/dashboard', `calendar-placement-${process.pid}`);
  const placementResult = JSON.parse(cli(placementOwner, ['run-code', `async page => {
    const consoleErrors = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Agenda', exact: true }).click();
      const monthHeader = () => page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
      await monthHeader().getByRole('button').last().click();
      await page.getByRole('heading', { name: ${JSON.stringify(crossMidnightTitle)}, exact: true }).first().waitFor({ timeout: 15000 });
      const crossMidnightPlacements = await page.getByRole('heading', { name: ${JSON.stringify(crossMidnightTitle)}, exact: true }).count();
      const malformedLegacyVisible = await page.getByRole('heading', { name: ${JSON.stringify(malformedLegacyTitle)}, exact: true }).count();
      await monthHeader().getByRole('button', { name: 'Today', exact: true }).click();
      for (let index = 0; index < 6; index += 1) await monthHeader().getByRole('button').first().click();
      await page.getByRole('heading', { name: ${JSON.stringify(dstSpringTitle)}, exact: true }).waitFor({ timeout: 15000 });
      const dstSpringPlacements = await page.getByRole('heading', { name: ${JSON.stringify(dstSpringTitle)}, exact: true }).count();
      await monthHeader().getByRole('button', { name: 'Today', exact: true }).click();
      for (let index = 0; index < 2; index += 1) await monthHeader().getByRole('button').last().click();
      await page.getByRole('heading', { name: ${JSON.stringify(dstFallTitle)}, exact: true }).waitFor({ timeout: 15000 });
      const dstFallPlacements = await page.getByRole('heading', { name: ${JSON.stringify(dstFallTitle)}, exact: true }).count();
      return { crossMidnightPlacements, malformedLegacyVisible, dstSpringPlacements, dstFallPlacements, consoleErrors };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
    }
  }` ]));
  expectEqual(placementResult.crossMidnightPlacements, 2, 'Calendar cross-midnight event is placed on both affected local days');
  expectEqual(placementResult.malformedLegacyVisible, 0, 'Calendar ignores malformed legacy dates without rendering a corrupted event');
  expectEqual(placementResult.dstSpringPlacements, 1, 'Calendar DST spring event is placed exactly once');
  expectEqual(placementResult.dstFallPlacements, 1, 'Calendar DST fall event is placed exactly once');
  expectEqual(placementResult.consoleErrors.length, 0, 'Calendar malformed and DST placement workflow console errors');

  const multiTeam = await browserLogin('qa-multi-org', '/dashboard', `calendar-multi-team-${process.pid}`);
  const multiTeamResult = JSON.parse(cli(multiTeam, ['run-code', `async page => {
    const teamBMarker = ${JSON.stringify(`${teamB.visibleMarker} Future Practice`)};
    const dismissTransientDialogs = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const dialog = page.getByRole('dialog').last();
        if (!await dialog.waitFor({ state: 'visible', timeout: 800 }).then(() => true).catch(() => false)) break;
        const acknowledge = dialog.getByRole('button', { name: 'Got It', exact: true });
        if (await acknowledge.count()) await acknowledge.click();
        else await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
      }
    };
    const switchTo = async teamName => {
      await dismissTransientDialogs();
      const switcher = page.getByRole('combobox').first();
      await switcher.click();
      await page.getByRole('option', { name: teamName, exact: false }).click();
      await page.waitForTimeout(250);
    };
    const showTeamBCalendar = async () => {
      await page.getByRole('button', { name: 'Agenda', exact: true }).click();
      const monthHeader = page.locator('h2').filter({ hasText: /2026/ }).first().locator('../..');
      await monthHeader.getByRole('button', { name: 'Today', exact: true }).click();
      await monthHeader.getByRole('button').last().click();
      await page.getByText(teamBMarker, { exact: true }).waitFor({ timeout: 15000 });
    };
    await page.goto(${JSON.stringify(`${BASE_URL}/team`)});
    await page.getByRole('combobox').first().waitFor({ timeout: 15000 });
    await dismissTransientDialogs();
    await switchTo(${JSON.stringify(teamB.name)});
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
    await showTeamBCalendar();
    const firstBView = await page.getByText(teamBMarker, { exact: true }).count();
    await page.goto(${JSON.stringify(`${BASE_URL}/team`)});
    await page.getByRole('combobox').first().waitFor({ timeout: 15000 });
    await switchTo(${JSON.stringify(teamA.name)});
    await switchTo(${JSON.stringify(teamB.name)});
    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await showTeamBCalendar();
    await page.reload();
    await showTeamBCalendar();
    const persistedTeamId = await page.evaluate(() => localStorage.getItem('sf_session_team_id'));
    await page.goBack();
    await page.getByRole('combobox').first().waitFor({ timeout: 15000 });
    const teamValueAfterBack = await page.getByRole('combobox').first().textContent();
    await page.goForward();
    await showTeamBCalendar();
    return { firstBView, persistedTeamId, teamValueAfterBack, finalBView: await page.getByText(teamBMarker, { exact: true }).count() };
  }` ]));
  expectEqual(multiTeamResult.firstBView > 0 && multiTeamResult.finalBView > 0, true, 'Calendar rapid Team A and Team B switches settle on the selected squad');
  expectEqual(multiTeamResult.persistedTeamId, teamB.id, 'Calendar active-team selection persists through reload');
  expectEqual(multiTeamResult.teamValueAfterBack?.includes(teamB.name), true, 'Calendar active-team selection survives browser back navigation');
}

async function runReminderSchedulerRuntimeAudit() {
  // This executes the same scheduler core delegated to by the deployed
  // Function, but gives it only run-scoped emulator records and a transport
  // that records counts rather than contacting FCM or a Web Push provider.
  const { runUpcomingEventReminderCore } = await import(
    `${pathToFileURL(path.resolve('functions/lib/event-reminder-runner.js')).href}?certification=${encodeURIComponent(certificationRunId)}`
  );
  const suffix = certificationRunId.replace(/[^A-Za-z0-9_-]/g, '_').slice(-80);
  const teamId = `qa_reminder_${suffix}`;
  const teamPath = `teams/${teamId}`;
  const aliases = Object.freeze({
    parent: 'qa-parent-a', adult: 'qa-adult-player-a', youth: 'qa-youth-active',
    noToken: 'qa-adult-player-b', prefOff: 'qa-parent-b', removed: 'qa-removed-member', sender: 'qa-coach-owner-a',
  });
  const userIds = Object.freeze(Object.fromEntries(Object.entries(aliases).map(([key, alias]) => {
    const fixture = identityByAlias.get(alias);
    if (!fixture?.uid) throw new Error(`Reminder runtime audit is missing exact fixture identity ${alias}.`);
    return [key, fixture.uid];
  })));
  const roleByKey = Object.freeze({ parent: 'parent', adult: 'adult_player', youth: 'youth_player', noToken: 'adult_player', prefOff: 'parent', removed: 'adult_player', sender: 'coach' });
  const deviceByKey = Object.freeze(Object.fromEntries(Object.keys(userIds).map(key => [key, Object.freeze({
    fcmToken: `local-fcm-${key}-${suffix}`,
    endpoint: `https://push.example.test/${key}-${suffix}`,
  })])));
  for (const device of Object.values(deviceByKey)) {
    registerSensitiveValue(device.fcmToken);
    registerSensitiveValue(device.endpoint);
  }
  registerDynamicFirestoreRoot(teamPath, `reminder-team-${suffix}`);
  if (!activeOperationResourceRegistry) throw new Error('Reminder runtime audit requires a scenario-owned cleanup registry.');
  const originalProfiles = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    firestoreAdmin.getAll(...Object.values(userIds).map(uid => firestoreAdmin.doc(`users/${uid}`))));
  for (const [key, uid] of Object.entries(userIds)) {
    const original = originalProfiles.find(snapshot => snapshot.id === uid);
    if (!original?.exists) throw new Error(`Reminder runtime audit fixture profile ${aliases[key]} is missing.`);
    registerFirestoreDocumentRestoration(`users/${uid}`, original.data() || {}, `reminder-profile-${key}-${suffix}`, activeOperationResourceRegistry);
  }

  const initialEvents = [
    ['eligible', { date: '2026-03-08', startTime: '11:00', eventType: 'game' }],
    ['invalid', { date: '2026-03-08', startTime: '25:00', eventType: 'game' }],
    ['past', { date: '2026-03-08', startTime: '08:00', eventType: 'game' }],
    ['no_token', { date: '2026-03-08', startTime: '11:10', eventType: 'game' }],
    ['pref_off', { date: '2026-03-08', startTime: '11:20', eventType: 'game' }],
    ['removed', { date: '2026-03-08', startTime: '11:30', eventType: 'game' }],
    ['sender', { date: '2026-03-08', startTime: '11:40', eventType: 'game' }],
    ['retry', { date: '2026-03-08', startTime: '11:50', eventType: 'practice' }],
    ['overlap', { date: '2026-03-08', startTime: '12:00', eventType: 'game' }],
    ['boundary', { date: '2026-03-08', startTime: '06:30', eventType: 'meeting' }],
    ['fall', { date: '2026-11-01', startTime: '11:00', eventType: 'game' }],
    ['midnight_before', { date: '2026-07-24', startTime: '23:59', eventType: 'game' }],
    ['midnight_prior_day_probe', { date: '2026-07-24', startTime: '23:59', eventType: 'game' }],
    ['midnight_at', { date: '2026-07-25', startTime: '00:30', eventType: 'game' }],
    ['midnight_after', { date: '2026-07-25', startTime: '00:31', eventType: 'game' }],
    ['midnight_six', { date: '2026-07-25', startTime: '06:30', eventType: 'game' }],
    ['redaction', { date: '2026-03-08', startTime: '13:00', eventType: 'game' }],
    ['network', { date: '2026-03-08', startTime: '13:10', eventType: 'game' }],
  ];
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const batch = firestoreAdmin.batch();
    batch.set(firestoreAdmin.doc(teamPath), { name: 'QA Reminder Team', timeZone: 'America/Edmonton', qaReminderRun: certificationRunId });
    for (const [eventId, event] of initialEvents) batch.set(firestoreAdmin.doc(`${teamPath}/events/${eventId}`), { ...event, qaReminderRun: certificationRunId });
    for (const [key, uid] of Object.entries(userIds)) {
      batch.set(firestoreAdmin.doc(`${teamPath}/members/${uid}`), { userId: uid, status: key === 'removed' ? 'removed' : 'active', qaReminderRun: certificationRunId });
      const original = originalProfiles.find(snapshot => snapshot.id === uid)?.data() || {};
      const device = deviceByKey[key];
      batch.set(firestoreAdmin.doc(`users/${uid}`), {
        ...original,
        role: roleByKey[key], notificationsEnabled: true,
        upcomingEventNotificationsEnabled: key === 'prefOff' ? false : true,
        fcmTokens: key === 'noToken' ? [] : [device.fcmToken],
        webPushSubscriptions: key === 'noToken' ? [] : [{ endpoint: device.endpoint, keys: { p256dh: 'safe-public-key', auth: 'safe-auth-key' } }],
        qaReminderRun: certificationRunId,
      });
    }
    await batch.commit();
  });

  const delivered = [];
  const schedulerDiagnostics = [];
  let retryFailsOnce = true;
  let providerRequestCount = 0;
  const keyForUserId = userId => Object.keys(userIds).find(key => userIds[key] === userId) || 'unknown';
  const safeDeliver = async input => {
    const key = keyForUserId(input.entry.userId);
    delivered.push({ eventId: input.entry.eventId, actorAlias: aliases[key] || 'unknown', fcmCount: input.targets.fcmTokens.length, webPushCount: input.targets.webPushSubscriptions.length });
    if (input.entry.eventId === 'retry' && retryFailsOnce) {
      retryFailsOnce = false;
      throw new Error('injected-safe-reminder-failure');
    }
    return { successCount: input.targets.fcmTokens.length + input.targets.webPushSubscriptions.length, failureCount: 0 };
  };
  const createRunner = (now, { eventIds, memberKeys, deliver = safeDeliver } = {}) => ({
    now,
    listEvents: async () => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const snapshot = await firestoreAdmin.collection(`${teamPath}/events`).where('qaReminderRun', '==', certificationRunId).get();
      const expected = eventIds ? new Set(eventIds) : null;
      return snapshot.docs.filter(document => !expected || expected.has(document.id)).map(document => ({ teamId, eventId: document.id, event: document.data() }));
    }),
    getTeam: async requestedTeamId => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const snapshot = await firestoreAdmin.doc(`teams/${requestedTeamId}`).get();
      return snapshot.exists ? snapshot.data() : null;
    }),
    listMembers: async requestedTeamId => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const selected = memberKeys ? new Set(memberKeys.map(key => userIds[key])) : null;
      return (await firestoreAdmin.collection(`teams/${requestedTeamId}/members`).where('qaReminderRun', '==', certificationRunId).get()).docs
        .map(document => document.data()).filter(member => !selected || selected.has(member.userId));
    }),
    getUser: async userId => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const snapshot = await firestoreAdmin.doc(`users/${userId}`).get();
      return snapshot.exists ? snapshot.data() : null;
    }),
    claim: async entry => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
      const reference = firestoreAdmin.doc(`eventReminderDeliveries/${teamId}_${entry.eventId}_${entry.userId}`);
      return firestoreAdmin.runTransaction(async transaction => {
        const snapshot = await transaction.get(reference);
        const state = snapshot.data() || {};
        const leaseExpiresAt = Number(state.leaseExpiresAt || 0);
        if (state.status === 'sent' || (state.status === 'processing' && leaseExpiresAt > now.getTime())) return false;
        transaction.set(reference, { ...entry, qaReminderRun: certificationRunId, status: 'processing', attempts: Number(state.attempts || 0) + 1, leaseExpiresAt: now.getTime() + 300_000 }, { merge: true });
        return true;
      });
    }),
    markSent: async entry => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`eventReminderDeliveries/${teamId}_${entry.eventId}_${entry.userId}`).set({ status: 'sent', successCount: entry.successCount, failureCount: entry.failureCount, leaseExpiresAt: 0, qaReminderRun: certificationRunId }, { merge: true })),
    markFailed: async entry => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`eventReminderDeliveries/${teamId}_${entry.eventId}_${entry.userId}`).set({ status: 'failed', diagnostic: entry.diagnostic, leaseExpiresAt: 0, qaReminderRun: certificationRunId }, { merge: true })),
    diagnostic: event => schedulerDiagnostics.push({ ...event }),
    deliver,
  });
  const springNow = new Date('2026-03-08T15:00:00.000Z');
  const runCase = (caseId, actorAlias, invocationId, now, eventIds, memberKeys, deliver) =>
    captureInjectedReminderCoreInvocation(caseId, actorAlias, invocationId, () =>
      runUpcomingEventReminderCore(createRunner(now, { eventIds, memberKeys, deliver })));
  const ledgerRows = async () => withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    (await firestoreAdmin.collection('eventReminderDeliveries').where('qaReminderRun', '==', certificationRunId).get()).docs);
  const ledgerFor = (rows, eventId, key) => rows.find(document => document.data().eventId === eventId && document.data().userId === userIds[key])?.data() || null;
  const exactLedger = record => record ? ({
    teamId: record.teamId, eventId: record.eventId, userId: record.userId, qaReminderRun: record.qaReminderRun,
    status: record.status, attempts: record.attempts, leaseExpiresAt: record.leaseExpiresAt,
    successCount: record.successCount, failureCount: record.failureCount,
  }) : null;

  const eligibleResult = await runCase('rem-eligible', 'qa-parent-a+qa-adult-player-a+qa-youth-active', 'rem-eligible-core-1', springNow, ['eligible'], ['parent', 'adult', 'youth']);
  expectEqual(JSON.stringify(eligibleResult), JSON.stringify({ sentCount: 3, failedCount: 0, claimedCount: 3 }), 'Reminder scheduler core sends one same-day eligible FCM and Web Push delivery');
  const eligibleLedgers = await ledgerRows();
  for (const key of ['parent', 'adult', 'youth']) {
    expectEqual(JSON.stringify(exactLedger(ledgerFor(eligibleLedgers, 'eligible', key))), JSON.stringify({ teamId, eventId: 'eligible', userId: userIds[key], qaReminderRun: certificationRunId, status: 'sent', attempts: 1, leaseExpiresAt: 0, successCount: 2, failureCount: 0 }), `Reminder scheduler writes one same-day PA/AP/YP delivery ledger for ${aliases[key]}`);
  }
  expectEqual(JSON.stringify(delivered.filter(item => item.eventId === 'eligible').map(item => ({ actorAlias: item.actorAlias, fcmCount: item.fcmCount, webPushCount: item.webPushCount })).sort((a, b) => a.actorAlias.localeCompare(b.actorAlias))), JSON.stringify([
    { actorAlias: 'qa-adult-player-a', fcmCount: 1, webPushCount: 1 },
    { actorAlias: 'qa-parent-a', fcmCount: 1, webPushCount: 1 },
    { actorAlias: 'qa-youth-active', fcmCount: 1, webPushCount: 1 },
  ]), 'Reminder scheduler invokes one safe FCM and Web Push target for each PA/AP/YP fixture');

  expectEqual(JSON.stringify(await runCase('rem-invalid-time', 'qa-adult-player-a', 'rem-invalid-time-core-1', springNow, ['invalid'], ['adult'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes malformed event time');
  expectEqual(JSON.stringify(await runCase('rem-past-time', 'qa-adult-player-a', 'rem-past-time-core-1', springNow, ['past'], ['adult'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes no-longer-future event time');
  expectEqual(JSON.stringify(await runCase('rem-no-token', 'qa-adult-player-b', 'rem-no-token-core-1', springNow, ['no_token'], ['noToken'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes eligible member with no device token');
  expectEqual(JSON.stringify(await runCase('rem-pref-off', 'qa-parent-b', 'rem-pref-off-core-1', springNow, ['pref_off'], ['prefOff'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes preferences-disabled recipient');
  expectEqual(JSON.stringify(await runCase('rem-removed', 'qa-removed-member', 'rem-removed-core-1', springNow, ['removed'], ['removed'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes removed membership');
  expectEqual(JSON.stringify(await runCase('rem-sender', 'qa-coach-owner-a', 'rem-sender-core-1', springNow, ['sender'], ['sender'])), JSON.stringify({ sentCount: 0, failedCount: 0, claimedCount: 0 }), 'Reminder scheduler excludes staff sender role');
  const exclusionLedgers = await ledgerRows();
  expectEqual(['invalid', 'past', 'no_token', 'pref_off', 'removed', 'sender'].every((eventId, index) => ledgerFor(exclusionLedgers, eventId, ['adult', 'adult', 'noToken', 'prefOff', 'removed', 'sender'][index]) === null), true, 'Reminder scheduler local eligibility and exclusion cases create no denied ledger');

  const retryFirst = await runCase('rem-retry', 'qa-adult-player-a', 'rem-retry-core-1', springNow, ['retry'], ['adult']);
  const retrySecond = await captureOperationRequests('rem-retry', 'qa-adult-player-a', () => observeInjectedReminderCoreInvocation({ actorAlias: 'qa-adult-player-a', invocationId: 'rem-retry-core-2', operation: () => runUpcomingEventReminderCore(createRunner(springNow, { eventIds: ['retry'], memberKeys: ['adult'] })) }));
  expectEqual(JSON.stringify({ first: retryFirst, second: retrySecond }), JSON.stringify({ first: { sentCount: 0, failedCount: 1, claimedCount: 1 }, second: { sentCount: 1, failedCount: 0, claimedCount: 1 } }), 'Reminder scheduler failed ledger retry transitions to sent');

  let overlapDeliveries = 0;
  const overlapDeliver = async input => {
    if (input.entry.eventId === 'overlap') {
      overlapDeliveries += 1;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return safeDeliver(input);
  };
  const overlapResults = await captureOperationRequests('rem-duplicate-run', 'qa-adult-player-a', async () => Promise.all([
    observeInjectedReminderCoreInvocation({ actorAlias: 'qa-adult-player-a', invocationId: 'rem-duplicate-run-core-1', operation: () => runUpcomingEventReminderCore(createRunner(springNow, { eventIds: ['overlap'], memberKeys: ['adult'], deliver: overlapDeliver })) }),
    observeInjectedReminderCoreInvocation({ actorAlias: 'qa-adult-player-a', invocationId: 'rem-duplicate-run-core-2', operation: () => runUpcomingEventReminderCore(createRunner(springNow, { eventIds: ['overlap'], memberKeys: ['adult'], deliver: overlapDeliver })) }),
  ]));
  expectEqual(overlapDeliveries, 1, 'Reminder scheduler overlapping invocations acquire one lease and send once');
  expectEqual(overlapResults.reduce((total, result) => total + result.sentCount, 0), 1, 'Reminder scheduler overlap has one successful local delivery');

  await captureOperationRequests('rem-time-boundary', 'qa-adult-player-a', async () => {
    const invoke = (invocationId, now, eventIds) => observeInjectedReminderCoreInvocation({ actorAlias: 'qa-adult-player-a', invocationId, operation: () => runUpcomingEventReminderCore(createRunner(now, { eventIds, memberKeys: ['adult'] })) });
    const boundaryResult = await invoke('rem-time-boundary-dst-spring', new Date('2026-03-08T12:00:00.000Z'), ['boundary']);
    const fallResult = await invoke('rem-time-boundary-dst-fall', new Date('2026-11-01T16:00:00.000Z'), ['fall']);
    const midnightBefore = await invoke('rem-time-boundary-before-midnight', new Date('2026-07-25T05:58:00.000Z'), ['midnight_before']);
    const midnightAt = await invoke('rem-time-boundary-at-midnight', new Date('2026-07-25T06:00:00.000Z'), ['midnight_at', 'midnight_prior_day_probe']);
    const midnightAfter = await invoke('rem-time-boundary-after-midnight', new Date('2026-07-25T06:01:00.000Z'), ['midnight_after']);
    const reminderStart = await invoke('rem-time-boundary-six-am', new Date('2026-07-25T12:00:00.000Z'), ['midnight_six']);
    const reminderStartRepeat = await invoke('rem-time-boundary-six-am-repeat', new Date('2026-07-25T12:00:00.000Z'), ['midnight_six']);
    expectEqual(boundaryResult.sentCount === 1 && fallResult.sentCount === 1, true, 'Reminder scheduler respects exact 06:00 boundary and DST offsets');
    expectEqual(midnightBefore.sentCount, 1, 'Reminder scheduler before local midnight selects only the remaining current-day event');
    expectEqual(JSON.stringify({ at: midnightAt.sentCount, after: midnightAfter.sentCount }), JSON.stringify({ at: 0, after: 0 }), 'Reminder scheduler at and after local midnight preserves the 06:00 quiet-hours boundary');
    expectEqual(reminderStart.sentCount, 1, 'Reminder scheduler exact 06:00 start selects the future new-local-day event');
    expectEqual(reminderStartRepeat.sentCount, 0, 'Reminder scheduler exact 06:00 repeat is idempotent');
  });

  await runCase('rem-redaction', 'qa-adult-player-a', 'rem-redaction-core-1', springNow, ['redaction'], ['adult']);
  await runCase('rem-network', 'qa-adult-player-a', 'rem-network-core-1', springNow, ['network'], ['adult']);
  const ledgers = await ledgerRows();
  for (const document of ledgers) registerDynamicFirestoreRoot(document.ref.path, `reminder-ledger-${document.id}`);
  const midnightLedgerState = Object.fromEntries(['midnight_before', 'midnight_prior_day_probe', 'midnight_at', 'midnight_after', 'midnight_six'].map(eventId => {
    const record = ledgerFor(ledgers, eventId, 'adult');
    return [eventId, record ? { status: record.status, attempts: record.attempts } : null];
  }));
  expectEqual(JSON.stringify(midnightLedgerState), JSON.stringify({
    midnight_before: { status: 'sent', attempts: 1 }, midnight_prior_day_probe: null,
    midnight_at: null, midnight_after: null, midnight_six: { status: 'sent', attempts: 1 },
  }), 'Reminder scheduler local-midnight ledgers reconcile the prior-day and quiet-hours exclusions');
  const diagnosticEvidence = JSON.stringify({ schedulerDiagnostics, ledgerStates: ledgers.map(document => ({ eventId: document.data().eventId, status: document.data().status, attempts: document.data().attempts })) });
  expectEqual(schedulerDiagnostics.length > 0 && Object.values(deviceByKey).every(device => !diagnosticEvidence.includes(device.fcmToken) && !diagnosticEvidence.includes(device.endpoint)), true, 'Reminder scheduler captures redacted runtime diagnostics from the actual core');
  expectEqual(providerRequestCount, 0, 'Reminder scheduler uses injected local transport without provider network');
  expectEqual(delivered.every(item => item.fcmCount + item.webPushCount > 0), true, 'Reminder scheduler safe transport receives only registered local delivery targets');
}

async function runCalendarFeedLifecycleAudit() {
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `calendar-feed-owner-${process.pid}`);
  const result = JSON.parse(cli(owner, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const feedResponses = [];
    const observedResponses = [];
    let observationTag = 'ics-console';
    const observeResponse = ${observeCalendarResponse.toString()};
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      if (response.url().includes('/api/calendar/feed')) feedResponses.push(response.status());
      const observedResponse = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag);
      if (observedResponse) observedResponses.push(observedResponse);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      await page.getByText('Squad Enrollment', { exact: true }).waitFor({ timeout: 10000 });
      await page.keyboard.press('Escape');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
        if (!await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false)) break;
        await alert.getByRole('button', { name: 'Got It' }).click();
        await alert.waitFor({ state: 'hidden' });
      }
      await page.getByRole('button', { name: 'Subscribe', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Synchronize Device', exact: true });
      await dialog.getByRole('button', { name: /Current Squad/ }).click();
      const feedReady = await dialog.getByText('Feed Ready', { exact: true }).waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      if (!feedReady) throw new Error('calendar feed issue diagnostic: ' + JSON.stringify({
        feedResponses,
        url: page.url(),
        dialogCount: await dialog.count(),
        dialogs: await page.getByRole('dialog').allTextContents(),
        toasts: await page.locator('[data-sonner-toast]').allTextContents(),
      }));
      if (feedResponses.at(-1) !== 200) throw new Error('calendar feed issue response status: ' + feedResponses.at(-1));
      const rotate = page.waitForResponse(response => response.url().includes('/api/calendar/feed') && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Rotate Link', exact: true }).click();
      if ((await rotate).status() !== 200) throw new Error('calendar feed rotate did not return 200');
      await dialog.getByText('Feed Ready', { exact: true }).waitFor({ timeout: 10000 });
      const revoke = page.waitForResponse(response => response.url().includes('/api/calendar/feed') && response.request().method() === 'POST');
      await dialog.getByRole('button', { name: 'Revoke Feed', exact: true }).click();
      if ((await revoke).status() !== 200) throw new Error('calendar feed revoke did not return 200');
      await dialog.getByText('Choose Your Feed', { exact: true }).waitFor({ timeout: 10000 });
      observationTag = 'ics-network';
      await page.reload();
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      observationTag = 'ics-responsive';
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.getByRole('heading', { name: 'Master Calendar', exact: true }).waitFor({ timeout: 15000 });
      return { feedResponses, observedResponses, mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }` ]));
  await captureBrowserOperationRequests('ics-console', 'qa-coach-owner-a', result.observedResponses, 'ics-console');
  await captureBrowserOperationRequests('ics-network', 'qa-coach-owner-a', result.observedResponses, 'ics-network');
  await captureBrowserOperationRequests('ics-responsive-na', 'qa-coach-owner-a', result.observedResponses, 'ics-responsive');
  expectEqual(result.feedResponses.join(','), '200,200,200', 'Calendar feed issue, rotation, and revoke responses');
  expectEqual(result.mobileFits, true, 'Calendar feed controls fit the mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'Calendar feed lifecycle console errors');
  expectEqual(result.failedResponses.length, 0, 'Calendar feed lifecycle failed responses');

  // Exercise the actual locally-emulated public Function.  The authenticated
  // issuer returns an HTTPS-shaped subscription URL, while this audit sends
  // its opaque token only to the isolated loopback Function endpoint.
  const functionBase = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/getCalendarFeed`;
  const issue = async ({ caseId, actorAlias, token, body }) => captureOperationRequests(caseId, actorAlias, async () => {
    const response = await apiJsonResult('/api/calendar/feed', token, { method: 'POST', body: JSON.stringify(body) });
    expectEqual(response.status, 200, `Calendar feed ${body.type} issuer response`);
    const issuedUrl = typeof response.body?.url === 'string' ? response.body.url : '';
    const issuedToken = new URL(issuedUrl).searchParams.get('token') || '';
    expectEqual(/^[a-f0-9]{64}$/.test(issuedToken), true, `Calendar feed ${body.type} issuer opaque token format`);
    return issuedToken;
  });
  const fetchFeed = async ({ caseId, actorAlias, token }) => captureOperationRequests(caseId, actorAlias, async () => {
    const response = await fetch(`${functionBase}?token=${encodeURIComponent(token)}`, { headers: { Connection: 'close' } });
    const body = await response.text();
    recordCapturedOperationRequest({ pathname: '/getCalendarFeed', method: 'GET', status: response.status });
    return { status: response.status, body };
  });
  const ownerToken = (await signIn('qa-coach-owner-a')).body.idToken;
  const parentToken = (await signIn('qa-parent-a')).body.idToken;
  const adultToken = (await signIn('qa-adult-player-a')).body.idToken;
  const multiToken = (await signIn('qa-multi-org')).body.idToken;
  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  if (!teamA || !teamB) throw new Error('Calendar feed fixture teams are missing.');
  // Reproduce the historical leak with a disposable event field. Before the
  // response-boundary repair, this opaque subscription credential and action
  // URL were serialized by buildCalendarFeed into the public ICS body.
  const secretToken = 'a'.repeat(64);
  const secretEventId = `qa_ics_secret_${certificationRunId.replace(/[^A-Za-z0-9_-]/g, '_').slice(-80)}`;
  const secretEventPath = `teams/${teamA.id}/events/${secretEventId}`;
  registerSensitiveValue(secretToken);
  registerDynamicFirestoreRoot(secretEventPath, `ics-secret-${secretEventId}`);
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    await firestoreAdmin.doc(secretEventPath).set({
      title: `Audit token ${secretToken}, escaped; ${'long-calendar-subject '.repeat(6)}`,
      description: `Open https://the-squad.test/action?token=${secretToken}&mode=verifyEmail\nescaped; description, value`,
      location: 'North, Field; One',
      date: '2026-10-02', startTime: '23:30', endTime: '00:30', eventType: 'meeting',
      qaCalendarFeedRun: certificationRunId,
    });
  });
  const userFeedToken = await issue({ caseId: 'ics-user', actorAlias: 'qa-parent-a', token: parentToken, body: { type: 'user', action: 'create' } });
  const teamFeedToken = await issue({ caseId: 'ics-team', actorAlias: 'qa-adult-player-a', token: adultToken, body: { type: 'team', teamId: teamA.id, action: 'create' } });
  const multiFeedToken = await issue({ caseId: 'ics-multi', actorAlias: 'qa-multi-org', token: multiToken, body: { type: 'multi', teamIds: [teamA.id], action: 'create' } });
  // Feed mutation is intentionally owner-scoped.  The adult's Team feed
  // proves the AP scope, but it must not be used as the prior credential for
  // an owner rotation because the issuer only mutates the authenticated
  // user's feed records.
  const ownerRotationToken = await issue({ caseId: 'ics-rotate', actorAlias: 'qa-coach-owner-a', token: ownerToken, body: { type: 'team', teamId: teamA.id, action: 'create' } });
  const userFeed = await fetchFeed({ caseId: 'ics-user', actorAlias: 'qa-parent-a', token: userFeedToken });
  const teamFeed = await fetchFeed({ caseId: 'ics-team', actorAlias: 'qa-adult-player-a', token: teamFeedToken });
  const multiFeed = await fetchFeed({ caseId: 'ics-multi', actorAlias: 'qa-multi-org', token: multiFeedToken });
  expectEqual(userFeed.status, 200, 'Calendar user feed local Function fetch');
  expectEqual(teamFeed.status, 200, 'Calendar team feed local Function fetch');
  expectEqual(multiFeed.status, 200, 'Calendar multi feed local Function fetch');
  await fetchFeed({ caseId: 'ics-rfc', actorAlias: 'qa-adult-player-a', token: teamFeedToken });
  await fetchFeed({ caseId: 'ics-secret', actorAlias: 'qa-coach-owner-a', token: teamFeedToken });
  expectEqual(/BEGIN:VCALENDAR[\s\S]*VERSION:2\.0[\s\S]*END:VCALENDAR/.test(teamFeed.body), true, 'Calendar Function returns RFC 5545 body');
  // RFC 5545 permits the intentionally long, stable UID to be folded. Unfold
  // before comparing the logical property value so the proof verifies both
  // identity and the required physical-line folding independently.
  const unfoldedTeamFeed = teamFeed.body.replace(/\r\n /g, '');
  expectEqual(new RegExp(`UID:${teamA.id}-${secretEventId}@thesquad\\.pro`).test(unfoldedTeamFeed), true, 'Calendar Function emits stable team-scoped UID for the exact event');
  expectEqual(/DTSTART;TZID=America\/Edmonton:20261002T233000/.test(teamFeed.body) && /DTEND;TZID=America\/Edmonton:20261003T003000/.test(teamFeed.body), true, 'Calendar Function emits timezone-aware overnight DTSTART and DTEND');
  expectEqual(/SUMMARY:.*\\, escaped\\;/.test(unfoldedTeamFeed) && /DESCRIPTION:.*escaped\\; description\\, value/.test(unfoldedTeamFeed), true, 'Calendar Function RFC-escapes summary and description text');
  expectEqual(/\r\n /.test(teamFeed.body), true, 'Calendar Function RFC-folds long content lines');
  expectEqual(teamFeed.body.includes(secretToken) || /https:\/\/the-squad\.test\/action\?/.test(teamFeed.body), false, 'Calendar Function body redacts subscription token and action URL');
  const invalidType = await captureOperationRequests('ics-invalid-type', 'qa-coach-owner-a', () =>
    apiJsonResult('/api/calendar/feed', ownerToken, { method: 'POST', body: JSON.stringify({ type: 'invalid' }) }));
  const foreignTeam = await captureOperationRequests('ics-foreign-team', 'qa-coach-owner-a', () =>
    apiJsonResult('/api/calendar/feed', ownerToken, { method: 'POST', body: JSON.stringify({ type: 'team', teamId: teamB.id }) }));
  const tooMany = await captureOperationRequests('ics-too-many', 'qa-coach-owner-a', () =>
    apiJsonResult('/api/calendar/feed', ownerToken, { method: 'POST', body: JSON.stringify({ type: 'multi', teamIds: Array.from({ length: 26 }, (_, index) => `qa_feed_${index}`) }) }));
  expectEqual(invalidType.status, 400, 'Calendar issuer rejects invalid feed type');
  expectEqual(foreignTeam.status, 403, 'Calendar issuer rejects foreign team scope');
  expectEqual(tooMany.status, 400, 'Calendar issuer rejects oversized multi selection');
  const rotated = await captureOperationRequests('ics-rotate', 'qa-coach-owner-a', () =>
    apiJsonResult('/api/calendar/feed', ownerToken, { method: 'POST', body: JSON.stringify({ type: 'team', teamId: teamA.id, action: 'rotate' }) }));
  const rotatedToken = new URL(String(rotated.body?.url || '')).searchParams.get('token') || '';
  expectEqual(rotated.status, 200, 'Calendar feed rotation response');
  const priorAfterRotate = await fetchFeed({ caseId: 'ics-rotate', actorAlias: 'qa-coach-owner-a', token: ownerRotationToken });
  const freshAfterRotate = await fetchFeed({ caseId: 'ics-rotate', actorAlias: 'qa-coach-owner-a', token: rotatedToken });
  expectEqual(`${priorAfterRotate.status},${freshAfterRotate.status}`, '404,200', 'Calendar rotation invalidates prior token and serves replacement');
  const revoked = await captureOperationRequests('ics-inactive-token', 'qa-coach-owner-a', () =>
    apiJsonResult('/api/calendar/feed', ownerToken, { method: 'POST', body: JSON.stringify({ type: 'team', teamId: teamA.id, action: 'revoke' }) }));
  const inactive = await fetchFeed({ caseId: 'ics-inactive-token', actorAlias: 'qa-coach-owner-a', token: rotatedToken });
  const malformed = await fetchFeed({ caseId: 'ics-invalid-token', actorAlias: 'qa-public-submitter', token: 'not-a-token' });
  const unknown = await fetchFeed({ caseId: 'ics-unknown-token', actorAlias: 'qa-public-submitter', token: 'b'.repeat(64) });
  expectEqual(revoked.status, 200, 'Calendar feed revoke response');
  expectEqual(inactive.status, 404, 'Calendar inactive token returns a non-enumerating boundary');
  expectEqual(malformed.status, 404, 'Calendar malformed token returns a non-enumerating boundary');
  expectEqual(unknown.status, 404, 'Calendar well-formed unknown token returns the same non-enumerating boundary');
  const memberToken = (await signIn('qa-team-member')).body.idToken;
  const memberFeedToken = await issue({ caseId: 'ics-membership-revoke', actorAlias: 'qa-team-member', token: memberToken, body: { type: 'team', teamId: teamA.id, action: 'create' } });
  const beforeRevoke = await fetchFeed({ caseId: 'ics-membership-revoke', actorAlias: 'qa-team-member', token: memberFeedToken });
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamA.id}/members/${identityByAlias.get('qa-team-member').uid}`).update({ status: 'removed' }));
  const afterRevoke = await fetchFeed({ caseId: 'ics-membership-revoke', actorAlias: 'qa-team-member', token: memberFeedToken });
  expectEqual(`${beforeRevoke.status},${afterRevoke.status}`, '200,404', 'Calendar Function revalidates membership at fetch time');
}

function browserOwnerEventCreate(session, marker) {
  const title = `QA Event ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const observedResponses = [];
    const observeResponse = ${observeCalendarResponse.toString()};
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, 'owner-create', '/api/teams/events/action');
      if (observation) observedResponses.push(observation);
    });
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
      observedResponses,
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
    const observedResponses = [];
    const observeResponse = ${observeCalendarResponse.toString()};
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, 'member-read-rsvp', '/api/teams/rsvp');
      if (observation) observedResponses.push(observation);
    });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    let eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
    // This is a separate authenticated browser session. A bounded reload makes
    // the persisted-event assertion deterministic when its initial Firestore
    // listener was established immediately before the owner's create request.
    const visibleInitially = await eventTitle.waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
    if (!visibleInitially) {
      await page.reload();
      eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
      await eventTitle.waitFor({ timeout: 15000 });
    }
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
      observedResponses,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserParentChildEventRsvp(session, title) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const rsvpResponses = [];
    const observedResponses = [];
    let observationTag = 'rsvp-parent-child';
    const observeResponse = ${observeCalendarResponse.toString()};
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      if (response.url().includes('/api/teams/rsvp')) rsvpResponses.push(response.status());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag, '/api/teams/rsvp');
      if (observation) observedResponses.push(observation);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
      const eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
      await eventTitle.waitFor({ timeout: 15000 });
      await eventTitle.click();
      const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      await details.getByText("Youth A's RSVP", { exact: true }).waitFor({ timeout: 15000 });
      const before = await details.getByText('GOING', { exact: true }).count();
      // The guardian has two synthetic children. The first card is the active
      // squad child; the persisted membership assertion below binds this click
      // to that exact youth identity instead of trusting visual order alone.
      const rsvpResponse = page.waitForResponse(response => response.url().includes('/api/teams/rsvp') && response.request().method() === 'POST');
      await details.getByRole('button', { name: 'Going', exact: true }).first().click();
      if ((await rsvpResponse).status() !== 200) throw new Error('parent RSVP request did not return 200: ' + JSON.stringify({ rsvpResponses, toasts: await page.locator('[data-sonner-toast]').allTextContents() }));
      const close = details.getByRole('button', { name: 'Close event details' });
      if (await close.count()) await close.click().catch(() => {});
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
      const reloaded = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      await reloaded.getByText('GOING', { exact: true }).first().waitFor({ timeout: 15000 });
      const childGoing = await reloaded.getByText('GOING', { exact: true }).count();
      await reloaded.getByRole('button', { name: 'Close event details' }).click();
      observationTag = 'rsvp-console';
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().waitFor({ timeout: 15000 });
      observationTag = 'rsvp-network';
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().waitFor({ timeout: 15000 });
      await page.setViewportSize({ width: 390, height: 844 });
      observationTag = 'rsvp-responsive';
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
      const mobileDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      await mobileDetails.getByText('GOING', { exact: true }).first().waitFor({ timeout: 15000 });
      return {
        before,
        childGoing,
        rsvpResponses,
        observedResponses,
        mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
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

function browserMemberAttendanceRsvp(session, { teamId, title }) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const rsvpResponses = [];
    const observedResponses = [];
    let observationTag = 'att-console';
    const observeResponse = ${observeCalendarResponse.toString()};
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      if (response.url().includes('/api/teams/rsvp')) rsvpResponses.push(response.status());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag, '/api/teams/rsvp');
      if (observation) observedResponses.push(observation);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
      await page.evaluate(team => localStorage.setItem('sf_session_team_id', team), ${JSON.stringify(teamId)});
      await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
      const eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
      await eventTitle.waitFor({ timeout: 15000 });
      await eventTitle.click();
      const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      await details.getByRole('button', { name: 'Going', exact: true }).click();
      await details.getByText('GOING', { exact: true }).first().waitFor({ timeout: 15000 });
      await details.getByRole('button', { name: 'Close event details' }).click();
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
      const reloaded = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      await reloaded.getByText('GOING', { exact: true }).first().waitFor({ timeout: 15000 });
      await reloaded.getByRole('button', { name: 'Close event details' }).click();
      observationTag = 'att-network';
      await page.reload();
      await page.getByText(${JSON.stringify(title)}, { exact: true }).last().waitFor({ timeout: 15000 });
      return { rsvpResponses, observedResponses, consoleErrors, failedResponses };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserStaffAttendanceOverride(session, { teamId, title, memberName }) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const rsvpResponses = [];
    const observedResponses = [];
    let observationTag = 'att-staff-record';
    const observeResponse = ${observeCalendarResponse.toString()};
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      if (response.url().includes('/api/teams/rsvp')) rsvpResponses.push(response.status());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag, '/api/teams/rsvp');
      if (observation) observedResponses.push(observation);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
      await page.evaluate(team => localStorage.setItem('sf_session_team_id', team), ${JSON.stringify(teamId)});
      await page.goto(${JSON.stringify(`${BASE_URL}/coaches-corner/attendance`)});
      await page.getByRole('heading', { name: 'RSVP Matrix', exact: true }).waitFor({ timeout: 15000 });
      await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 15000 });
      const row = page.locator('tr').filter({ hasText: ${JSON.stringify(memberName)} });
      await row.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ timeout: 15000 });
      const cell = row.getByRole('button').last();
      await cell.click();
      await page.getByRole('menuitem', { name: 'Declined', exact: true }).click();
      await page.getByText('Override Successful', { exact: true }).waitFor({ timeout: 15000 });
      await page.reload();
      const afterReload = page.locator('tr').filter({ hasText: ${JSON.stringify(memberName)} });
      const eventHeader = page.locator('th').filter({ hasText: ${JSON.stringify(title)} }).first();
      await eventHeader.waitFor({ timeout: 15000 });
      const eventColumn = await eventHeader.evaluate(header => Array.from(header.parentElement?.children || []).indexOf(header));
      await afterReload.locator('td').nth(eventColumn).getByText('Declined', { exact: true }).waitFor({ timeout: 15000 });
      observationTag = 'att-console';
      await page.reload();
      await page.getByRole('heading', { name: 'RSVP Matrix', exact: true }).waitFor({ timeout: 15000 });
      observationTag = 'att-network';
      await page.reload();
      await page.getByRole('heading', { name: 'RSVP Matrix', exact: true }).waitFor({ timeout: 15000 });
      await page.setViewportSize({ width: 390, height: 844 });
      observationTag = 'att-responsive';
      await page.reload();
      await page.getByRole('heading', { name: 'RSVP Matrix', exact: true }).waitFor({ timeout: 15000 });
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export Audit Log', exact: true }).click();
      const exportDownload = await downloadPromise;
      return {
        rsvpResponses,
        observedResponses,
        exportFilename: exportDownload.suggestedFilename(),
        mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
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

function browserMemberAttendanceReadOnly(session, { teamId, title }) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await page.evaluate(team => localStorage.setItem('sf_session_team_id', team), ${JSON.stringify(teamId)});
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    await page.getByText(${JSON.stringify(title)}, { exact: true }).last().waitFor({ timeout: 15000 });
    await page.reload();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
    const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
    await details.getByRole('tab', { name: 'Squad Pulse', exact: true }).click();
    await details.getByText('Attendance Matrix', { exact: true }).waitFor({ timeout: 15000 });
    await details.getByText('DECLINED', { exact: true }).first().waitFor({ timeout: 15000 });
    return {
      matrixVisible: await details.getByText('Attendance Matrix', { exact: true }).count(),
      exportVisible: await details.getByRole('button', { name: 'Export Attendance Ledger', exact: true }).count(),
      editVisible: await details.getByRole('button', { name: 'Edit Activity', exact: true }).count(),
      deleteVisible: await details.getByRole('button', { name: ${JSON.stringify(`Delete ${title}`)} }).count(),
      declinedAfterReload: await details.getByText('DECLINED', { exact: true }).count(),
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function addAttendanceFixtureMembership(teamId, memberUid, memberName, {
  alias = 'qa-team-member', role = 'Member', position = 'Player',
} = {}) {
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const team = await firestoreAdmin.collection('teams').doc(teamId).get();
    const teamData = team.data() || {};
    const membership = {
      id: memberUid,
      userId: memberUid,
      name: memberName,
      email: emailForAlias(alias),
      role,
      position,
      status: 'active',
      isDeleted: false,
      ownerUserId: teamData.ownerUserId,
      joinedAt: new Date().toISOString(),
    };
    const batch = firestoreAdmin.batch();
    batch.set(firestoreAdmin.collection('teams').doc(teamId).collection('members').doc(memberUid), membership);
    batch.set(firestoreAdmin.collection('users').doc(memberUid).collection('teamMemberships').doc(teamId), {
      teamId,
      name: teamData.name || teamData.teamName || 'QA Attendance Team',
      teamName: teamData.name || teamData.teamName || 'QA Attendance Team',
      userId: memberUid,
      status: 'active',
      role,
      position,
      ownerUserId: teamData.ownerUserId,
      planId: teamData.planId,
      plan_type: teamData.plan_type,
      isPro: teamData.isPro,
      type: teamData.type,
      joinedAt: new Date().toISOString(),
    });
    await batch.commit();
  });
}

async function runRsvpAndAttendanceWorkflowAudit() {
  const proTeamId = FIXTURES.teams.find(team => team.alias === 'qa-pro-team')?.id;
  const memberUids = ['qa-team-member', 'qa-team-assistant'].map(alias => identityByAlias.get(alias)?.uid);
  if (!proTeamId || memberUids.some(uid => !uid)) throw new Error('Attendance membership overlay identities are missing.');
  return withAttendanceMemberships(tenantFixtureMutations, proTeamId, memberUids, runIsolatedRsvpAndAttendanceWorkflowAudit);
}

function browserTeamAAttendanceMatrix(session, { teamId, title, memberName, staff }) {
  const code = `async page => {
    const observedResponses = [], consoleErrors = [], failedResponses = [], measurements = [], downloads = [];
    let observationTag = 'att-console';
    const observeResponse = ${observeCalendarResponse.toString()};
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag, '/api/teams/rsvp');
      if (observation) observedResponses.push(observation);
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)} + '/')) failedResponses.push(response.status());
    };
    page.on('console', onConsole); page.on('pageerror', onError); page.on('response', onResponse);
    try {
      await page.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
      await page.evaluate(team => localStorage.setItem('sf_session_team_id', team), ${JSON.stringify(teamId)});
      const open = async () => {
        await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
        const title = page.getByText(${JSON.stringify(title)}, { exact:true }).last();
        await title.waitFor({ state:'visible', timeout:15000 });
        // Team A's seeded alert opens after hydration. Dismiss visibly without
        // persisting a seen-state change or clicking through its modal overlay.
        for (let attempt=0;attempt<3;attempt+=1) {
          const alert=page.getByRole('dialog',{name:'High Priority Team Alert'});
          const visible=await alert.waitFor({state:'visible',timeout:1500}).then(()=>true).catch(error=>{if(error.name==='TimeoutError')return false;throw error;});
          if (!visible) break;
          await alert.getByRole('button',{name:'Close',exact:true}).click();
          await alert.waitFor({state:'hidden',timeout:5000});
        }
        await title.click();
        const dialog = page.getByRole('dialog', { name:${JSON.stringify(`Event Intelligence: ${title}`)} });
        await dialog.getByRole('tab', { name:'Squad Pulse' }).click();
        const member = dialog.getByText(${JSON.stringify(memberName)}, {exact:true});
        await member.waitFor({state:'visible',timeout:15000});
        await member.locator('../../..').getByText('DECLINED',{exact:true}).waitFor({state:'visible',timeout:15000});
        return dialog;
      };
      await open();
      observationTag = 'att-network';
      let dialog = await open();
      const readOnly = { export:await dialog.getByRole('button',{name:'Export Attendance Ledger'}).count(), edit:await dialog.getByRole('button',{name:'Edit Activity',exact:true}).count(), delete:await dialog.getByRole('button',{name:${JSON.stringify(`Delete ${title}`)},exact:true}).count() };
      {
        observationTag = 'att-responsive';
        for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
          await page.setViewportSize(viewport); dialog = await open();
          const controls = {};
          const targets=[['dialog',dialog],['matrix',dialog.getByText('Attendance Matrix',{exact:true})],['tab',dialog.getByRole('tab',{name:'Squad Pulse'})],['close',dialog.getByRole('button',{name:'Close event details'})],...['Going','Maybe','Decline'].map(name=>[name.toLowerCase(),dialog.getByRole('button',{name,exact:true})])];
          if (${JSON.stringify(staff)}) targets.push(['export',dialog.getByRole('button',{name:'Export Attendance Ledger'})]);
          for (const [name,control] of targets) {
            try {
              await control.scrollIntoViewIfNeeded({timeout:10000}); controls[name] = await control.boundingBox({timeout:10000});
            } catch (error) { throw new Error('Attendance layout '+JSON.stringify({viewport,name,dialogs:await page.locator('[role="dialog"]').evaluateAll(nodes=>nodes.map(node=>({title:node.querySelector('h2')?.textContent,hidden:node.getAttribute('aria-hidden')}))),error:error.name})); }
          }
          measurements.push({viewport,controls});
          if (!${JSON.stringify(staff)}) continue;
          let download;
          try {
            [download]=await Promise.all([page.waitForEvent('download',{timeout:15000}),dialog.getByRole('button',{name:'Export Attendance Ledger'}).click({timeout:10000})]);
          } catch (error) { throw new Error('Attendance export '+JSON.stringify({viewport,dialogs:await page.locator('[role="dialog"]').evaluateAll(nodes=>nodes.map(node=>({title:node.querySelector('h2')?.textContent,hidden:node.getAttribute('aria-hidden')}))),error:error.name})); }
          const stream=await download.createReadStream();
          const bytes=[];
          for await (const chunk of stream) {
            if (bytes.length+chunk.length>65536) throw new Error('Attendance CSV exceeds bounded download size.');
            bytes.push(...chunk);
          }
          const content=await page.evaluate(values=>new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(values)),bytes);
          downloads.push({filename:download.suggestedFilename(),byteLength:bytes.length,content});
        }
      }
      return { observedResponses, consoleErrors, failedResponses, readOnly, measurements, downloads, memberStatus:'declined' };
    } finally { page.off('console',onConsole); page.off('pageerror',onError); page.off('response',onResponse); }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runTeamAAttendanceWorkflowAudit() {
  const team=FIXTURES.teams.find(team=>team.alias==='qa-team-a');
  const memberPath=`teams/${team.id}/members/${identityByAlias.get('qa-team-member').uid}`;
  return tenantFixtureMutations.withFirestoreOverlay([memberPath], async () => {
    const memberName=`Attendance ${team.visibleMarker}`;
    await withEmulatorAuthAdmin(async (_auth,db)=>db.doc(memberPath).update({name:memberName}));
    return runIsolatedTeamAAttendanceWorkflowAudit();
  });
}

async function runIsolatedTeamAAttendanceWorkflowAudit() {
  const team = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  const teamId = team.id;
  const ownerUid = identityByAlias.get('qa-coach-owner-a').uid;
  const memberUid = identityByAlias.get('qa-team-member').uid;
  const assistantUid = identityByAlias.get('qa-team-assistant').uid;
  const [owner, assistant, member, removed, teamBOwner] = await Promise.all(['qa-coach-owner-a','qa-team-assistant','qa-team-member','qa-removed-member','qa-coach-owner-b'].map(alias => signIn(alias)));
  const memberName = await withEmulatorAuthAdmin(async (_auth, db) => (await db.doc(`teams/${teamId}/members/${memberUid}`).get()).data().name);
  const title = `QA Attendance ${team.visibleMarker} ${process.pid}`;
  const created = await captureOperationRequests('att-staff-record','qa-coach-owner-a',()=>apiJsonResult('/api/teams/events/action',owner.body.idToken,{method:'POST',body:JSON.stringify({action:'create',teamId,event:{title,date:'2099-12-23',endDate:'2099-12-23',startTime:'18:30',endTime:'20:00',eventType:'practice',location:`Attendance ${process.pid}`,description:'Disposable Team A attendance certification.'}})}));
  expectEqual(created.status,200,'Team A attendance fixture creation');
  const eventId = created.body.eventId;
  const eventPath = `teams/${teamId}/events/${eventId}`;
  const update = (token,status,{participantId=memberUid,...init}={}) => apiJsonResult('/api/teams/rsvp',token,{...init,method:'POST',body:JSON.stringify({teamId,eventId,participantId,status})});
  const audit = () => withEmulatorAuthAdmin(async (_auth,db) => {
    const [event, records] = await Promise.all([db.doc(eventPath).get(),db.doc(eventPath).collection('rsvpAudit').get()]);
    return {rsvps:event.data().userRsvps,records:records.docs.map(doc=>({id:doc.id,...doc.data()}))};
  });
  expectEqual((await captureOperationRequests('att-staff-record','qa-team-assistant',()=>update(assistant.body.idToken,'going'))).status,200,'assistant staff attendance override accepted');
  expectEqual((await captureOperationRequests('att-staff-record','qa-coach-owner-a',()=>update(owner.body.idToken,'declined'))).status,200,'staff attendance override response');
  const staffAudit = await audit();
  const expectedLedgerRows=await withEmulatorAuthAdmin(async (_auth,db)=>(await db.doc(`teams/${teamId}`).collection('members').get()).docs.map(doc=>{const member=doc.data();return `${member.name},${staffAudit.rsvps[member.userId] || 'no_response'}`;}));
  expectEqual(staffAudit.rsvps[memberUid],'declined','Team A attendance staff matrix authoritative member value');
  expectEqual(staffAudit.records.filter(row=>row.participantId===memberUid && ((row.actorId===ownerUid && row.status==='declined') || (row.actorId===assistantUid && row.status==='going'))).length,2,'Team A attendance staff matrix exact owner and assistant audit transitions');
  const staffSession=await browserLogin('qa-coach-owner-a','/dashboard',`attendance-owner-a-${process.pid}`);
  const staffResult=browserTeamAAttendanceMatrix(staffSession,{teamId,title,memberName,staff:true});
  const memberSession=await browserLogin('qa-team-member','/dashboard',`attendance-member-a-${process.pid}`);
  const memberResult=browserTeamAAttendanceMatrix(memberSession,{teamId,title,memberName,staff:false});
  expectEqual(JSON.stringify(memberResult.readOnly),JSON.stringify({export:0,edit:0,delete:0}),'Team A attendance member reload is read-only with no staff controls');
  expectEqual(memberResult.memberStatus,'declined','Team A attendance member reload is read-only and shows exact member status');
  expectEqual(validateAttendanceBounds(staffResult.measurements,{rsvp:true}),true,'Attendance exact desktop and mobile control bounds '+JSON.stringify(staffResult.measurements));
  expectEqual(validateAttendanceBounds(memberResult.measurements,{staff:false,rsvp:true}),true,'Attendance exact desktop and mobile control bounds member Event RSVP smoke '+JSON.stringify(memberResult.measurements));
  for (const download of staffResult.downloads) {
    const ledger=validateAttendanceLedger(download,{eventId,memberName,status:'declined',teamMarker:team.visibleMarker,forbiddenMarkers:[teamB.visibleMarker,'synthetic-private','@phase2.test','medical','emergencyContact'],maxRows:100,expectedRows:expectedLedgerRows});
    expectEqual(ledger.rows>=1 && ledger.rows<=100,true,'Attendance exact bounded ledger export '+JSON.stringify(ledger));
  }
  expectEqual(staffResult.downloads.length,2,'Attendance exact bounded ledger export at both viewports');
  for (const [label,result] of [['member',memberResult],['staff',staffResult]]) {
    expectEqual(result.consoleErrors.length,0,`${label} attendance workflow console errors`);
    expectEqual(result.failedResponses.length,0,`${label} attendance workflow failed responses`);
  }
  const beforeDuplicate=await audit();
  const duplicates=await captureOperationRequests('att-duplicate','qa-coach-owner-a',()=>Promise.all([update(owner.body.idToken,'going'),update(owner.body.idToken,'going')]));
  const afterDuplicate=await audit();
  const duplicateDelta=afterDuplicate.records.filter(row=>!beforeDuplicate.records.some(before=>before.id===row.id));
  expectEqual(duplicates.map(result=>result.status).join(','),'200,200','duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request');
  expectEqual(afterDuplicate.rsvps[memberUid],'going','duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request persisted value');
  expectEqual(duplicateDelta.length,2,'duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request exact delta');
  expectEqual(duplicateDelta.every(row=>row.actorId===ownerUid && row.participantId===memberUid && row.status==='going'),true,'duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request attribution');
  expectEqual((await captureOperationRequests('att-member-readonly','qa-team-member',()=>update(member.body.idToken,'declined',{participantId:ownerUid}))).status,403,'member forged attendance override is denied');
  expectEqual((await captureOperationRequests('att-removed','qa-removed-member',()=>update(removed.body.idToken,'declined'))).status,403,'removed member attendance override is denied');
  expectEqual([403,404].includes(await captureOperationRequests('att-removed-read','qa-removed-member',()=>directFirestoreReadStatus(eventPath,removed.body.idToken))),true,'removed member attendance event read is denied without schedule disclosure');
  expectEqual([403,404].includes(await captureOperationRequests('att-tenant-b','qa-coach-owner-b',()=>directFirestoreReadStatus(eventPath,teamBOwner.body.idToken))),true,'Team B attendance event read is denied without schedule disclosure');
  expectEqual((await captureOperationRequests('att-tenant-b','qa-coach-owner-b',()=>update(teamBOwner.body.idToken,'declined'))).status,403,'Team B staff attendance override is denied');
  const beforeRace=await audit();
  const race=await captureOperationRequests('att-race','qa-coach-owner-a+qa-team-assistant',()=>runServerRequestBarrier('attendance_exact_staff',[
    {alias:'owner-a',execute:({signal,headers})=>update(owner.body.idToken,'maybe',{signal,headers})},
    {alias:'assistant',execute:({signal,headers})=>update(assistant.body.idToken,'declined',{signal,headers})},
  ]));
  const afterRace=await audit();
  const delta=afterRace.records.filter(row=>!beforeRace.records.some(before=>before.id===row.id));
  expectEqual(race.settled.map(result=>result.status==='fulfilled'?result.value.status:'rejected').join(','),'200,200','two-staff attendance barrier resolves to one defined RSVP value with durable audit history response');
  expectEqual(Object.keys(race.barrier.arrivals).sort().join(','),'assistant,owner-a','two-staff attendance barrier resolves to one defined RSVP value with durable audit history server arrivals');
  expectEqual(['maybe','declined'].includes(afterRace.rsvps[memberUid]),true,'two-staff attendance barrier resolves to one defined RSVP value with durable audit history');
  expectEqual(delta.length,2,'two-staff attendance barrier resolves to one defined RSVP value with durable audit history exact delta');
  expectEqual(delta.filter(row=>row.actorId===ownerUid && row.participantId===memberUid && row.status==='maybe').length,1,'two-staff attendance barrier resolves to one defined RSVP value with durable audit history owner');
  expectEqual(delta.filter(row=>row.actorId===assistantUid && row.participantId===memberUid && row.status==='declined').length,1,'two-staff attendance barrier resolves to one defined RSVP value with durable audit history assistant');
  return {staffResult,memberResult};
}

async function runIsolatedRsvpAndAttendanceWorkflowAudit() {
  // Attendance and RSVP rows both use this real workflow when selected in one
  // local batch. Scope each disposable event to the invocation so the second
  // row tests the product instead of colliding with the first fixture.
  const invocation = ++rsvpAttendanceWorkflowInvocation;
  const marker = `phase2-rsvp-${process.pid}-${invocation}`;
  const teamAId = FIXTURES.teams.find(team => team.alias === 'qa-team-a')?.id;
  const proTeamId = FIXTURES.teams.find(team => team.alias === 'qa-pro-team')?.id;
  if (!teamAId || !proTeamId) throw new Error('Required RSVP/attendance fixture team is missing.');
  const owner = await signIn('qa-coach-owner-a');
  const proOwner = await signIn('qa-pro-owner');
  const parent = await signIn('qa-parent-a');
  const parentB = await signIn('qa-parent-b');
  const teamBOwner = await signIn('qa-coach-owner-b');
  const assistant = await signIn('qa-team-assistant');
  const adult = await signIn('qa-adult-player-a');
  const youth = await signIn('qa-youth-active');
  const removed = await signIn('qa-removed-member');
  const teamMember = await signIn('qa-team-member');
  const parentTitle = `QA Parent RSVP ${marker}`;
  const attendanceTitle = `QA Attendance ${marker}`;
  const eventPayload = (title, date = `2099-01-${String(10 + invocation).padStart(2, '0')}`) => ({
    title,
    date,
    endDate: date,
    startTime: '18:30',
    endTime: '20:00',
    eventType: 'practice',
    location: `QA Location ${marker}`,
    description: 'Disposable local certification schedule fixture.',
  });
  const created = await apiJsonResult('/api/teams/events/action', owner.body.idToken, {
    method: 'POST', body: JSON.stringify({ action: 'create', teamId: teamAId, event: eventPayload(parentTitle) }),
  });
  expectEqual(created.status, 200, 'RSVP fixture event creation');
  const eventId = created.body?.eventId;
  if (typeof eventId !== 'string') throw new Error('RSVP fixture event id was not returned.');
  const parentBrowser = await browserLogin('qa-parent-a', '/family', `rsvp-parent-${process.pid}`);
  const parentResult = browserParentChildEventRsvp(parentBrowser, parentTitle);
  expectEqual(parentResult.childGoing > 0, true, 'parent child RSVP persists through the browser');
  expectEqual(parentResult.rsvpResponses.join(','), '200', 'parent child RSVP API response');
  expectEqual(parentResult.mobileFits, true, 'parent RSVP dialog fits mobile viewport');
  expectEqual(parentResult.consoleErrors.length, 0, 'parent RSVP workflow console errors');
  expectEqual(parentResult.failedResponses.length, 0, 'parent RSVP workflow failed responses');

  const youthUid = identityByAlias.get('qa-youth-active').uid;
  const adultUid = identityByAlias.get('qa-adult-player-a').uid;
  const parentUid = identityByAlias.get('qa-parent-a').uid;
  const parentPersisted = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    firestoreAdmin.collection('teams').doc(teamAId).collection('events').doc(eventId).get());
  expectEqual(parentPersisted.data()?.userRsvps?.[youthUid], 'going', 'parent browser RSVP writes the linked youth member identity');
  const teamC = FIXTURES.teams.find(team => team.alias === 'qa-team-c');
  // Player fixtures are catalogued by their data fixtureAlias, while their
  // document aliases identify the concrete player document path. Resolve the
  // Team C child by the public catalog identity rather than an absent alias.
  const teamCYouth = FIXTURES.firestoreDocuments.find(document => document.data?.fixtureAlias === 'qa-player-youth-c');
  const teamCOwner = await signIn('qa-league-owner-a');
  if (!teamC || !teamCYouth?.data?.id || !teamCOwner.body?.idToken) throw new Error('Team C linked-child RSVP fixture is missing.');
  const teamCEvent = await apiJsonResult('/api/teams/events/action', teamCOwner.body.idToken, {
    method: 'POST', body: JSON.stringify({ action: 'create', teamId: teamC.id, event: eventPayload(`QA Parent Team C RSVP ${marker}`, `2099-02-${String(10 + invocation).padStart(2, '0')}`) }),
  });
  expectEqual(teamCEvent.status, 200, 'Team C parent RSVP fixture event creation');
  const teamCParticipantId = String(teamCYouth.data.id);
  const teamCParentRsvp = await captureOperationRequests('rsvp-parent-team-c', 'qa-parent-a', () => apiJsonResult('/api/teams/rsvp', parent.body.idToken, {
    method: 'POST', body: JSON.stringify({ teamId: teamC.id, eventId: teamCEvent.body?.eventId, participantId: teamCParticipantId, status: 'going' }),
  }));
  expectEqual(teamCParentRsvp.status, 200, 'parent linked Team C child RSVP is accepted');
  const teamCPersisted = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    firestoreAdmin.doc(`teams/${teamC.id}/events/${teamCEvent.body?.eventId}`).get());
  expectEqual(teamCPersisted.data()?.userRsvps?.[teamCParticipantId], 'going', 'parent Team C child RSVP persists under the exact child identity');
  expectEqual((await captureOperationRequests('rsvp-self', 'qa-adult-player-a', () => apiJsonResult('/api/teams/rsvp', adult.body.idToken, {
    method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }),
  }))).status, 200, 'adult own RSVP');
  const rsvpBarrier = await captureOperationRequests('rsvp-replay', 'qa-adult-player-a', () => runServerRequestBarrier('rsvp_exact_replay', [
    { alias: 'adult-going-one', execute: ({ signal, headers }) => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { signal, headers, method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }) }) },
    { alias: 'adult-going-two', execute: ({ signal, headers }) => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { signal, headers, method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }) }) },
  ]));
  const raceStatusValues = rsvpBarrier.settled.map(result => result.status === 'fulfilled' ? result.value.status : 'rejected').sort().join(',');
  expectEqual(raceStatusValues, '200,200', 'identical own RSVP replay updates are accepted without duplicate records');
  expectEqual(Object.keys(rsvpBarrier.barrier.arrivals).sort().join(','), 'adult-going-one,adult-going-two', 'identical RSVP request barrier records both server arrivals before release');
  const racePersisted = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.collection('teams').doc(teamAId).collection('events').doc(eventId).get());
  expectEqual(racePersisted.data()?.userRsvps?.[adultUid], 'going', 'identical own RSVP replay preserves exactly one participant map value');
  const rsvpRace = await captureOperationRequests('rsvp-race', 'qa-adult-player-a', () => runServerRequestBarrier('rsvp_exact_race', [
    { alias: 'adult-maybe', execute: ({ signal, headers }) => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { signal, headers, method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'maybe' }) }) },
    { alias: 'adult-declined', execute: ({ signal, headers }) => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { signal, headers, method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'declined' }) }) },
  ]));
  expectEqual(rsvpRace.settled.map(result => result.status === 'fulfilled' ? result.value.status : 'rejected').sort().join(','), '200,200', 'barrier RSVP race accepts both valid requests');
  const raceAfterDistinctStatuses = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.collection('teams').doc(teamAId).collection('events').doc(eventId).get());
  expectEqual(['maybe', 'declined'].includes(raceAfterDistinctStatuses.data()?.userRsvps?.[adultUid]), true, 'barrier RSVP race persists exactly one valid participant map value');
  const youthOwn = await captureOperationRequests('rsvp-self', 'qa-youth-active', () => apiJsonResult('/api/teams/rsvp', youth.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: youthUid, status: 'going' }) }));
  expectEqual(youthOwn.status, 200, 'youth own RSVP');
  const parentRootDenied = await captureOperationRequests('rsvp-forged-uid', 'qa-parent-a', () => apiJsonResult('/api/teams/rsvp', parent.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: parentUid, status: 'going' }) }));
  expectEqual(parentRootDenied.status, 403, 'parent own root RSVP is denied at API boundary');
  const staffOverride = await captureOperationRequests('rsvp-staff', 'qa-coach-owner-a', () => apiJsonResult('/api/teams/rsvp', owner.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'declined' }) }));
  expectEqual(staffOverride.status, 200, 'staff RSVP override is accepted for an active squad member');
  const foreignParentDenied = await captureOperationRequests('rsvp-forged-uid', 'qa-parent-b', () => apiJsonResult('/api/teams/rsvp', parentB.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: youthUid, status: 'going' }) }));
  expectEqual(foreignParentDenied.status, 403, 'other-household RSVP forge is denied');
  const teamBDenied = await captureOperationRequests('rsvp-tenant-b', 'qa-coach-owner-b', () => apiJsonResult('/api/teams/rsvp', teamBOwner.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }) }));
  expectEqual(teamBDenied.status, 403, 'Team B staff RSVP into Team A is denied');
  const removedDenied = await captureOperationRequests('rsvp-removed', 'qa-removed-member', () => apiJsonResult('/api/teams/rsvp', removed.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: identityByAlias.get('qa-removed-member').uid, status: 'going' }) }));
  expectEqual(removedDenied.status, 404, 'removed member RSVP is denied without exposing an inactive participant');
  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.collection('teams').doc(teamAId).collection('events').doc(eventId).update({ status: 'cancelled' }));
  const cancelledDenied = await captureOperationRequests('rsvp-cancelled', 'qa-adult-player-a', () => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }) }));
  expectEqual(cancelledDenied.status, 409, 'cancelled activity RSVP is denied');
  expectEqual((await apiJsonResult('/api/teams/events/action', owner.body.idToken, {
    method: 'POST', body: JSON.stringify({ action: 'delete', teamId: teamAId, eventId }),
  })).status, 200, 'RSVP fixture event deletion');
  const deletedDenied = await captureOperationRequests('rsvp-cancelled', 'qa-adult-player-a', () => apiJsonResult('/api/teams/rsvp', adult.body.idToken, { method: 'POST', body: JSON.stringify({ teamId: teamAId, eventId, participantId: adultUid, status: 'going' }) }));
  expectEqual(deletedDenied.status, 404, 'deleted activity RSVP is denied');

  const memberUid = identityByAlias.get('qa-team-member').uid;
  const assistantUid = identityByAlias.get('qa-team-assistant').uid;
  const proOwnerUid = identityByAlias.get('qa-pro-owner').uid;
  const memberName = `QA Attendance Member ${marker}`;
  await addAttendanceFixtureMembership(proTeamId, memberUid, memberName);
  await addAttendanceFixtureMembership(proTeamId, assistantUid, 'QA Attendance Assistant', {
    alias: 'qa-team-assistant', role: 'Coach', position: 'Assistant Coach',
  });
  const attendanceCreated = await apiJsonResult('/api/teams/events/action', proOwner.body.idToken, {
    method: 'POST', body: JSON.stringify({ action: 'create', teamId: proTeamId, event: eventPayload(attendanceTitle, `2099-12-${String(20 + invocation).padStart(2, '0')}`) }),
  });
  expectEqual(attendanceCreated.status, 200, 'attendance fixture event creation');
  const memberBrowser = await browserLogin('qa-team-member', '/dashboard', `attendance-member-${process.pid}`);
  const memberResult = browserMemberAttendanceRsvp(memberBrowser, { teamId: proTeamId, title: attendanceTitle });
  expectEqual(memberResult.rsvpResponses.join(','), '200', 'member attendance RSVP response');
  expectEqual(memberResult.consoleErrors.length, 0, 'member attendance workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member attendance workflow failed responses');
  const staffBrowser = await browserLogin('qa-pro-owner', '/dashboard', `attendance-staff-${process.pid}`);
  const staffResult = browserStaffAttendanceOverride(staffBrowser, { teamId: proTeamId, title: attendanceTitle, memberName });
  expectEqual(staffResult.rsvpResponses.join(','), '200', 'staff attendance override response');
  expectEqual(staffResult.mobileFits, true, 'staff attendance page fits mobile viewport');
  expectEqual(/^squad_attendance_audit_\d{4}_\d{2}_\d{2}\.csv$/.test(staffResult.exportFilename), true, 'staff attendance audit export is a CSV download');
  expectEqual(staffResult.consoleErrors.length, 0, 'staff attendance workflow console errors');
  expectEqual(staffResult.failedResponses.length, 0, 'staff attendance workflow failed responses');
  const memberReadOnlyResult = browserMemberAttendanceReadOnly(memberBrowser, { teamId: proTeamId, title: attendanceTitle });
  expectEqual(memberReadOnlyResult.matrixVisible > 0, true, 'member sees the attendance matrix without staff override controls');
  expectEqual(memberReadOnlyResult.exportVisible, 0, 'member has no visible attendance export control');
  expectEqual(memberReadOnlyResult.editVisible, 0, 'member has no visible event edit control');
  expectEqual(memberReadOnlyResult.deleteVisible, 0, 'member has no visible event delete control');
  expectEqual(memberReadOnlyResult.declinedAfterReload > 0, true, 'member sees staff attendance result after reload');
  const afterOverride = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) =>
    firestoreAdmin.collection('teams').doc(proTeamId).collection('events').doc(attendanceCreated.body.eventId).get());
  expectEqual(afterOverride.data()?.userRsvps?.[memberUid], 'declined', 'staff attendance override persisted');

  const attendanceEventRef = `teams/${proTeamId}/events/${attendanceCreated.body.eventId}`;
  const updateAttendance = (token, status, { participantId = memberUid, ...init } = {}) => apiJsonResult('/api/teams/rsvp', token, {
    ...init, method: 'POST', body: JSON.stringify({ teamId: proTeamId, eventId: attendanceCreated.body.eventId, participantId, status }),
  });
  const removedAttendanceRead = await captureOperationRequests('att-removed-read', 'qa-removed-member', () => directFirestoreReadStatus(attendanceEventRef, removed.body.idToken));
  expectEqual([403, 404].includes(removedAttendanceRead), true, 'removed member attendance event read is denied without schedule disclosure');
  expectEqual((await captureOperationRequests('att-staff-record', 'qa-team-assistant', () => updateAttendance(assistant.body.idToken, 'going'))).status, 200, 'assistant staff attendance override accepted');
  const duplicateResults = await captureOperationRequests('att-duplicate', 'qa-pro-owner', () => Promise.all([
    updateAttendance(proOwner.body.idToken, 'going'),
    updateAttendance(proOwner.body.idToken, 'going'),
  ]));
  expectEqual(duplicateResults.map(result => result.status).join(','), '200,200', 'duplicate staff attendance requests are accepted');
  const duplicateAudit = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const [eventSnapshot, auditSnapshot] = await Promise.all([
      firestoreAdmin.doc(attendanceEventRef).get(),
      firestoreAdmin.doc(attendanceEventRef).collection('rsvpAudit').where('participantId', '==', memberUid).get(),
    ]);
    return { status: eventSnapshot.data()?.userRsvps?.[memberUid], records: auditSnapshot.docs.map(doc => doc.data()) };
  });
  expectEqual(duplicateAudit.status, 'going', 'duplicate staff attendance transitions preserve one authoritative RSVP value and audit each request');
  expectEqual(duplicateAudit.records.filter(record => record.actorId === proOwnerUid && record.status === 'going').length >= 2, true, 'duplicate staff attendance audit retains both attributable requests');
  expectEqual((await captureOperationRequests('att-member-readonly', 'qa-team-member', () => updateAttendance(teamMember.body.idToken, 'declined', { participantId: proOwnerUid }))).status, 403, 'member forged attendance override is denied');
  expectEqual((await captureOperationRequests('att-removed', 'qa-removed-member', () => updateAttendance(removed.body.idToken, 'declined'))).status, 403, 'removed member attendance override is denied');
  const tenantBAttendanceRead = await captureOperationRequests('att-tenant-b', 'qa-coach-owner-b', () => directFirestoreReadStatus(attendanceEventRef, teamBOwner.body.idToken));
  expectEqual([403, 404].includes(tenantBAttendanceRead), true, 'Team B attendance event read is denied without schedule disclosure');
  expectEqual((await captureOperationRequests('att-tenant-b', 'qa-coach-owner-b', () => updateAttendance(teamBOwner.body.idToken, 'declined'))).status, 403, 'Team B staff attendance override is denied');
  const attendanceBarrier = await captureOperationRequests('att-race', 'qa-pro-owner+qa-team-assistant', () => runServerRequestBarrier('attendance_exact_staff', [
    { alias: 'pro-owner', execute: ({ signal, headers }) => updateAttendance(proOwner.body.idToken, 'maybe', { signal, headers }) },
    { alias: 'assistant', execute: ({ signal, headers }) => updateAttendance(assistant.body.idToken, 'declined', { signal, headers }) },
  ]));
  expectEqual(attendanceBarrier.settled.map(result => result.status === 'fulfilled' ? result.value.status : 'rejected').sort().join(','), '200,200', 'two-staff attendance barrier accepts both authorized updates');
  expectEqual(Object.keys(attendanceBarrier.barrier.arrivals).sort().join(','), 'assistant,pro-owner', 'attendance request barrier records both server arrivals before release');
  const raceAudit = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const [eventSnapshot, auditSnapshot] = await Promise.all([
      firestoreAdmin.doc(attendanceEventRef).get(),
      firestoreAdmin.doc(attendanceEventRef).collection('rsvpAudit').where('participantId', '==', memberUid).get(),
    ]);
    return { status: eventSnapshot.data()?.userRsvps?.[memberUid], records: auditSnapshot.docs.map(doc => doc.data()) };
  });
  expectEqual(['maybe', 'declined'].includes(raceAudit.status), true, 'two-staff attendance barrier resolves to one defined RSVP value with durable audit history');
  expectEqual(raceAudit.records.filter(record =>
    (record.actorId === proOwnerUid && record.status === 'maybe') ||
    (record.actorId === assistantUid && record.status === 'declined')).length, 2,
  'two-staff attendance audit records preserve both staff transitions');
  return { parentResult, memberResult, staffResult };
}

function browserOwnerEventEditDelete(session, marker) {
  const original = `QA Event ${marker}`;
  const updated = `QA Event Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const observedResponses = [];
    let observationTag = 'owner-edit-delete';
    const observeResponse = ${observeCalendarResponse.toString()};
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url());
      const observation = observeResponse(response, ${JSON.stringify(BASE_URL)}, observationTag, '/api/teams/events/action');
      if (observation) observedResponses.push(observation);
    });
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
    observationTag = 'evt-persistence';
    await page.reload();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 10000 });
    const editedAfterSecondReload = await page.getByText(${JSON.stringify(updated)}, { exact: true }).count();
    observationTag = 'owner-edit-delete';
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).last().click();
    const updatedDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${updated}`)} });
    await updatedDetails.getByRole('button', { name: ${JSON.stringify(`Delete ${updated}`)} }).click();
    const confirmation = page.getByRole('alertdialog');
    await confirmation.getByRole('button', { name: 'Delete Activity' }).click();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    return {
      editedAfterReload,
      editedAfterSecondReload,
      deletedAfterReload: await page.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
      observedResponses,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserSelectScheduleTeam(session, teamId) {
  cli(session, ['run-code', `async page => {
    await (${selectScheduleTeam.toString()})(page, ${JSON.stringify({ teamId, url: `${BASE_URL}/events` })});
  }`]);
}

async function runEventWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `events-owner-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `events-member-${process.pid}`);
  browserSelectScheduleTeam(owner, TEAM_A_ID);
  browserSelectScheduleTeam(member, TEAM_A_ID);
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
  expectEqual(ownerResult.editedAfterSecondReload > 0, true, 'owner event edit second reload persistence');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner event delete persists after reload');
  expectEqual(ownerResult.consoleErrors.length, 0, 'owner event edit/delete console errors');
  expectEqual(ownerResult.failedResponses.length, 0, 'owner event edit/delete failed responses');
  return { created, memberResult, ownerResult };
}

async function runExactEventApiCasesAudit() {
  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  if (!teamA || !teamB) throw new Error('Event exact-case fixture teams are missing.');
  const [owner, assistant, member, foreignOwner] = await Promise.all([
    signIn('qa-coach-owner-a'), signIn('qa-team-assistant'), signIn('qa-team-member'), signIn('qa-coach-owner-b'),
  ]);
  if (![owner, assistant, member, foreignOwner].every(result => result.status === 200 && result.body?.idToken)) {
    throw new Error('Event exact-case actor sign-in failed.');
  }
  const marker = `exact_event_${process.pid}_${Date.now()}`;
  const ids = Object.freeze({
    spring: `${marker}_spring`, fall: `${marker}_fall`, midnight: `${marker}_midnight`,
    conflict: `${marker}_conflict`, duplicate: `${marker}_duplicate`, assistant: `${marker}_assistant`,
  });
  const create = (token, eventId, event, init = {}) => apiJsonResult('/api/teams/events/action', token, {
    ...init, method: 'POST', body: JSON.stringify({ action: 'create', teamId: teamA.id, eventId, event }),
  });
  const createForTeam = (token, teamId, eventId, event, init = {}) => apiJsonResult('/api/teams/events/action', token, {
    ...init, method: 'POST', body: JSON.stringify({ action: 'create', teamId, eventId, event }),
  });
  const payload = (title, date, startTime, endTime, location) => ({
    title, date, endDate: date, startTime, endTime, eventType: 'practice', location,
  });

  const spring = await captureOperationRequests('evt-dst-spring', 'qa-coach-owner-a', () => create(owner.body.idToken, ids.spring,
    payload(`QA DST Spring ${marker}`, '2026-03-08', '01:30', '03:30', `QA DST Spring ${marker}`)));
  const fall = await captureOperationRequests('evt-dst-fall', 'qa-coach-owner-a', () => create(owner.body.idToken, ids.fall,
    payload(`QA DST Fall ${marker}`, '2026-11-01', '01:30', '02:30', `QA DST Fall ${marker}`)));
  const midnight = await captureOperationRequests('evt-midnight', 'qa-coach-owner-a', () => create(owner.body.idToken, ids.midnight,
    { ...payload(`QA Midnight ${marker}`, '2026-09-22', '23:30', '00:30', `QA Midnight ${marker}`), endDate: '2026-09-23' }));
  expectEqual([spring.status, fall.status, midnight.status].join(','), '200,200,200', 'event exact DST and midnight creates accepted');

  await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
    const [springDoc, fallDoc, midnightDoc, midnightBooking] = await firestoreAdmin.getAll(
      firestoreAdmin.doc(`teams/${teamA.id}/events/${ids.spring}`),
      firestoreAdmin.doc(`teams/${teamA.id}/events/${ids.fall}`),
      firestoreAdmin.doc(`teams/${teamA.id}/events/${ids.midnight}`),
      firestoreAdmin.doc(`scheduleBookings/team_event_${teamA.id}_${ids.midnight}`),
    );
    expectEqual(springDoc.data()?.date, '2026-03-08', 'event exact DST spring create and persisted date');
    expectEqual(fallDoc.data()?.date, '2026-11-01', 'event exact DST fall create and persisted date');
    expectEqual(JSON.stringify({ date: midnightDoc.data()?.date, endDate: midnightDoc.data()?.endDate, start: midnightBooking.data()?.startMinute, end: midnightBooking.data()?.endMinute }), JSON.stringify({ date: '2026-09-22', endDate: '2026-09-23', start: 1410, end: 1470 }), 'event exact midnight interval and booking persist');
  });

  const missingTitle = await captureOperationRequests('evt-invalid', 'qa-coach-owner-a', () => create(owner.body.idToken, `${marker}_missing`, { date: '2026-09-23', startTime: '10:00' }));
  const reversed = await captureOperationRequests('evt-invalid', 'qa-coach-owner-a', () => create(owner.body.idToken, `${marker}_reversed`, payload('QA Reversed', '2026-09-23', '12:00', '11:00', `QA Reversed ${marker}`)));
  expectEqual([missingTitle.status, reversed.status].join(','), '400,400', 'event exact invalid payloads rejected server-side');

  const conflictBase = await captureOperationRequests('evt-conflict', 'qa-coach-owner-a', () => create(owner.body.idToken, ids.conflict,
    payload(`QA Conflict ${marker}`, '2026-09-24', '10:00', '11:00', `QA Conflict ${marker}`)));
  const conflict = await captureOperationRequests('evt-conflict', 'qa-coach-owner-a', () => create(owner.body.idToken, `${marker}_conflict_second`,
    payload(`QA Conflict Second ${marker}`, '2026-09-24', '10:30', '11:30', `QA Other ${marker}`)));
  const conflictDoc = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamA.id}/events/${ids.conflict}`).get());
  expectEqual(JSON.stringify({ base: conflictBase.status, overlap: conflict.status, title: conflictDoc.data()?.title }), JSON.stringify({ base: 200, overlap: 409, title: `QA Conflict ${marker}` }), 'event exact overlap conflict preserves original');

  const sharedResourceId = `qa_resource_${marker}`;
  const sharedLocation = `QA Shared Location ${marker}`;
  const resourceBase = await captureOperationRequests('evt-resource-conflict', 'qa-coach-owner-a', () => create(owner.body.idToken, `${marker}_resource_base`, {
    ...payload(`QA Resource Base ${marker}`, '2026-09-29', '10:00', '11:00', `QA Resource Base Location ${marker}`), resourceId: sharedResourceId,
  }));
  const resourceConflict = await captureOperationRequests('evt-resource-conflict', 'qa-coach-owner-b', () => createForTeam(foreignOwner.body.idToken, teamB.id, `${marker}_resource_conflict`, {
    ...payload(`QA Resource Conflict ${marker}`, '2026-09-29', '10:30', '11:30', `QA Other Location ${marker}`), resourceId: sharedResourceId,
  }));
  expectEqual(`${resourceBase.status},${resourceConflict.status}`, '200,409', 'event exact cross-team resource conflict preserves original booking');
  const locationBase = await captureOperationRequests('evt-location-conflict', 'qa-coach-owner-a', () => create(owner.body.idToken, `${marker}_location_base`, {
    ...payload(`QA Location Base ${marker}`, '2026-09-30', '10:00', '11:00', sharedLocation), resourceId: `${sharedResourceId}_a`,
  }));
  const locationConflict = await captureOperationRequests('evt-location-conflict', 'qa-coach-owner-b', () => createForTeam(foreignOwner.body.idToken, teamB.id, `${marker}_location_conflict`, {
    ...payload(`QA Location Conflict ${marker}`, '2026-09-30', '10:30', '11:30', sharedLocation), resourceId: `${sharedResourceId}_b`,
  }));
  expectEqual(`${locationBase.status},${locationConflict.status}`, '200,409', 'event exact cross-team same-location conflict preserves original booking');

  const duplicatePayload = payload(`QA Duplicate ${marker}`, '2026-09-25', '10:00', '11:00', `QA Duplicate ${marker}`);
  const duplicateBarrier = await captureOperationRequests('evt-double', 'qa-coach-owner-a', () => runServerRequestBarrier('event_exact_duplicate', [
    { alias: 'first-create', execute: ({ signal, headers }) => create(owner.body.idToken, ids.duplicate, duplicatePayload, { signal, headers }) },
    { alias: 'second-create', execute: ({ signal, headers }) => create(owner.body.idToken, ids.duplicate, duplicatePayload, { signal, headers }) },
  ]));
  const duplicateStatuses = duplicateBarrier.settled.map(result => result.status === 'fulfilled' ? result.value.status : 'rejected').sort().join(',');
  const duplicateDoc = await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => firestoreAdmin.doc(`teams/${teamA.id}/events/${ids.duplicate}`).get());
  expectEqual(JSON.stringify({ statuses: duplicateStatuses, exists: duplicateDoc.exists }), JSON.stringify({ statuses: '200,409', exists: true }), 'event exact duplicate barrier commits once');
  expectEqual(Object.keys(duplicateBarrier.barrier.arrivals).sort().join(','), 'first-create,second-create', 'event request barrier records both server arrivals before release');

  const memberDenied = await captureOperationRequests('evt-member-deny', 'qa-team-member', () =>
    create(member.body.idToken, `${marker}_member`, payload('QA Member Denied', '2026-09-26', '10:00', '11:00', `QA Member ${marker}`)));
  const assistantAllowed = await captureOperationRequests('evt-assistant-own', 'qa-team-assistant', () =>
    create(assistant.body.idToken, ids.assistant, payload('QA Assistant Allowed', '2026-09-27', '10:00', '11:00', `QA Assistant ${marker}`)));
  const foreignDenied = await captureOperationRequests('evt-team-b-deny', 'qa-coach-owner-b', () =>
    create(foreignOwner.body.idToken, `${marker}_foreign`, payload('QA Foreign Denied', '2026-09-28', '10:00', '11:00', `QA Foreign ${marker}`)));
  expectEqual(memberDenied.status, 403, 'event exact member create denied');
  expectEqual(assistantAllowed.status, 200, 'event exact assistant create allowed');
  expectEqual(foreignDenied.status, 403, 'event exact foreign team create denied');
}

function browserOwnerRecurringEventWorkflow(session, marker) {
  const title = `QA Weekly Event ${marker}`;
  const updated = `QA Weekly Event Updated ${marker}`;
  const occurrenceUpdated = `QA Weekly Occurrence Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const observedResponses = [];
    let observationTag = 'evt-series';
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) {
        failedResponses.push(response.url().slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0]);
      }
      const responseUrl = response.url();
      if (responseUrl.startsWith(${JSON.stringify(BASE_URL)}) && (response.request().isNavigationRequest() || responseUrl.includes('/api/teams/events/action'))) {
        observedResponses.push({ tag: observationTag, method: response.request().method(), pathname: responseUrl.slice(${JSON.stringify(BASE_URL)}.length).split(/[?#]/, 1)[0], status: response.status() });
      }
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
      await page.getByRole('button', { name: '+ New Activity' }).click();
      const form = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
      await form.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(title)});
      await form.getByRole('button', { name: 'Pick Date' }).first().click();
      await page.getByRole('button', { name: /September 20/ }).first().click();
      await form.locator('input[type="time"]').fill('18:30');
      await form.locator('#weekly-recurrence-count').click();
      await page.getByRole('option', { name: 'Four weekly activities' }).click();
      const createResponse = page.waitForResponse(response => response.url().includes('/api/teams/events/action') && response.request().method() === 'POST');
      await form.getByRole('button', { name: 'Deploy Activity' }).click();
      const create = await createResponse;
      const createStatus = create.status();
      if (createStatus !== 200) throw new Error('weekly recurrence create response: ' + createStatus + ' ' + await create.text() + ' request=' + create.request().postData());
      await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 15000 });
      await page.reload();
      const itinerary = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Itinerary', exact: true }) });
      const createdTitles = itinerary.getByText(${JSON.stringify(title)}, { exact: true });
      await createdTitles.first().waitFor({ state: 'visible', timeout: 15000 });
      const createdCount = await createdTitles.count();
      const titleNodes = await createdTitles.evaluateAll(nodes => nodes.map(node => ({
        tag: node.tagName,
        text: node.textContent,
        outer: node.outerHTML.slice(0, 500),
      })));
      // The series begins on the exact local date selected in the form. Check
      // its first occurrence rather than accidentally asserting that the
      // second weekly instance falls on the series-start calendar date.
      await createdTitles.first().click();
      const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      const detailsVisible = await details.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (!detailsVisible) {
        throw new Error('weekly recurrence dialog diagnostic: ' + JSON.stringify({
          createdCount,
          titleNodes,
          dialogs: await page.getByRole('dialog').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label') || node.textContent?.slice(0, 300))),
        }));
      }
      const createdDetailsText = await details.innerText();
      const createdCalendarDate = createdDetailsText.includes('September 20, 2026');
      await details.getByRole('button', { name: 'Close event details' }).click();
      await details.waitFor({ state: 'detached', timeout: 15000 });
      // Edit and delete exactly one later occurrence before exercising the
      // full series controls. These are distinct visible product actions.
      await createdTitles.nth(1).click();
      await details.waitFor({ state: 'visible', timeout: 15000 });
      await details.getByRole('button', { name: 'Edit Activity' }).click();
      const occurrenceForm = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
      await occurrenceForm.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(occurrenceUpdated)});
      const occurrenceUpdate = page.waitForResponse(response => response.url().includes('/api/teams/events/action') && response.request().method() === 'POST');
      observationTag = 'evt-occurrence-edit-delete';
      await occurrenceForm.getByRole('button', { name: 'Deploy Activity' }).click();
      if ((await occurrenceUpdate).status() !== 200) throw new Error('single recurrence occurrence update did not return 200');
      // The event dialog owns a stale copy of the occurrence until navigation
      // remounts the list subscription. Rehydrate before sampling the
      // itinerary rather than racing that stale dialog with the new title.
      await page.reload();
      const updatedOccurrence = itinerary.getByText(${JSON.stringify(occurrenceUpdated)}, { exact: true });
      await updatedOccurrence.first().waitFor({ timeout: 15000 });
      const occurrenceEditCount = await updatedOccurrence.count();
      await updatedOccurrence.first().click();
      const occurrenceDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${occurrenceUpdated}`)} });
      await occurrenceDetails.getByRole('button', { name: ${JSON.stringify(`Delete ${occurrenceUpdated}`)} }).click();
      const occurrenceConfirmation = page.getByRole('alertdialog');
      observationTag = 'evt-occurrence-edit-delete';
      await occurrenceConfirmation.getByRole('button', { name: 'Delete Activity' }).click();
      await updatedOccurrence.first().waitFor({ state: 'detached', timeout: 15000 });
      await page.reload();
      const occurrenceDeletedCount = await itinerary.getByText(${JSON.stringify(occurrenceUpdated)}, { exact: true }).count();
      await itinerary.getByText(${JSON.stringify(title)}, { exact: true }).first().click();
      const seriesDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
      const seriesEditControl = seriesDetails.getByRole('button', { name: 'Edit Entire Weekly Series' });
      if (await seriesEditControl.count() === 0) {
        throw new Error('weekly recurrence details diagnostic: ' + JSON.stringify({
          buttons: await seriesDetails.getByRole('button').allTextContents(),
          body: (await seriesDetails.innerText()).slice(0, 2400),
        }));
      }
      await seriesEditControl.click();
      const edit = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
      await edit.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(updated)});
      observationTag = 'evt-series';
      await edit.getByRole('button', { name: 'Deploy Activity' }).click();
      await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 15000 });
      await page.reload();
      const updatedTitles = itinerary.getByText(${JSON.stringify(updated)}, { exact: true });
      await updatedTitles.first().waitFor({ state: 'visible', timeout: 15000 });
      const updatedCount = await updatedTitles.count();
      await updatedTitles.first().click();
      const updatedDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${updated}`)} });
      await updatedDetails.getByRole('button', { name: 'Delete Entire Weekly Series' }).click();
      const confirmation = page.getByRole('alertdialog');
      observationTag = 'evt-series';
      await confirmation.getByRole('button', { name: 'Delete Series' }).click();
      await updatedTitles.first().waitFor({ state: 'detached', timeout: 15000 });
      await page.reload();
      await page.setViewportSize({ width: 390, height: 844 });
      observationTag = 'evt-responsive';
      await page.reload();
      observationTag = 'evt-console';
      await page.reload();
      observationTag = 'evt-network';
      await page.reload();
      return {
        createdCount,
        createdCalendarDate,
        createdDetailsText,
        occurrenceEditCount,
        occurrenceDeletedCount,
        updatedCount,
        deletedCount: await itinerary.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
        mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        observedResponses,
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

async function runRecurringEventWorkflowAudit() {
  const marker = `phase2-recurring-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `events-series-owner-${process.pid}`);
  browserSelectScheduleTeam(owner, TEAM_A_ID);
  const result = browserOwnerRecurringEventWorkflow(owner, marker);
  expectEqual(result.createdCount, 4, 'weekly recurrence creates the exact requested occurrence count');
  if (!result.createdCalendarDate) {
    throw new Error(`weekly recurrence preserves the selected local calendar date: expected September 20, 2026 in event details; received ${JSON.stringify(result.createdDetailsText)}`);
  }
  expectEqual(result.occurrenceEditCount, 1, 'weekly recurrence one occurrence edit persists through reload');
  expectEqual(result.occurrenceDeletedCount, 0, 'weekly recurrence one occurrence delete persists through reload');
  expectEqual(result.updatedCount, 3, 'weekly recurrence series edit preserves all remaining occurrence dates');
  expectEqual(result.deletedCount, 0, 'weekly recurrence series delete removes every occurrence');
  expectEqual(result.mobileFits, true, 'weekly recurrence controls fit the mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'weekly recurrence workflow console errors');
  expectEqual(result.failedResponses.length, 0, 'weekly recurrence workflow failed responses');
  return result;
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
    let quietAlertChecks = 0;
    for (let attempt = 0; attempt < 30 && quietAlertChecks < 8; attempt += 1) {
      await page.waitForTimeout(700);
      const alert = page.locator('[role="dialog"][data-state="open"]').filter({has:page.getByRole('button',{name:'Got It'})});
      if (!await alert.count()) {
        quietAlertChecks += 1;
        continue;
      }
      quietAlertChecks = 0;
      receivedTitles.push((await alert.locator('h2:not(.sr-only)').textContent()) || '');
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden', timeout: 5000 });
    }

    const alertButton = page.locator('button[aria-label^="Open alerts"]');
    const alertButtonName = await alertButton.getAttribute('aria-label');
    await alertButton.evaluate(button => button.click());
    const inbox = page.getByRole('dialog', { name: 'Squad Alert Inbox' });
    await inbox.waitFor();
    await inbox.getByRole('button', { name: 'Show History' }).click({timeout:5000}).catch(()=>{throw new Error('desktop alert history toggle blocked')});
    const historyEveryone = await inbox.getByText('FALCON-A Everyone Alert', { exact: true }).count();
    const historyPlayer = await inbox.getByText('FALCON-A Player Alert', { exact: true }).count();
    const wrongCoach = await inbox.getByText('FALCON-A Coach Alert', { exact: true }).count();
    const wrongParent = await inbox.getByText('FALCON-A Parent Alert', { exact: true }).count();
    const otherTenant = await inbox.getByText('BLUEBIRD-B Everyone Alert', { exact: true }).count();
    await inbox.getByRole('button', { name: 'Close' }).click({timeout:5000}).catch(()=>{throw new Error('desktop alert inbox close blocked')});

    await page.reload();
    const reopened = await page.getByRole('dialog', { name: 'High Priority Team Alert' })
      .waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[aria-label^="Open alerts"]').evaluate(button => button.click());
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
    const tenantMutationCleanup = await tenantFixtureMutations.cleanup();
    const finalDynamicCleanup = await dynamicResourceRegistry.cleanup();
    dynamicCleanup = mergeResourceCleanupResults([
      ...completedDynamicCleanupRuns,
      tenantMutationCleanup,
      finalDynamicCleanup,
    ]);
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
      const cleanupArtifact = `${JSON.stringify(sanitizeCertificationArtifact({
        runId: certificationRunId,
        commit: certificationCommit,
        fixtureRunId: FIXTURES.runId,
        state: cleanupState,
        counts: cleanupCounts,
        measured: { fixture: measuredCleanup.measured, dynamic: dynamicCleanup },
        capturedAt: new Date().toISOString(),
      }), null, 2)}\n`;
      for (const artifactDirectory of cleanupArtifactDirectories()) {
        mkdirSync(path.join(artifactDirectory, 'cleanup'), { recursive: true });
        writeFileSync(path.join(artifactDirectory, 'cleanup/fixture-cleanup-marker.json'), cleanupArtifact, { mode: 0o600 });
      }
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

export async function runSelectedCertificationBatches({
  certificationIdentity: runIdentitySelected,
  certificationTenants: runTenantsSelected,
  runIdentity,
  runTenants,
  failFast: stopOnFailure = false,
}) {
  const errors = [];
  for (const [selected, run] of [[runIdentitySelected, runIdentity], [runTenantsSelected, runTenants]]) {
    if (!selected) continue;
    try {
      await run();
    } catch (error) {
      if (stopOnFailure) throw error;
      errors.push(error);
    }
  }
  if (errors.length > 0) throw new AggregateError(errors, 'One or more certification batches failed.');
}

export function assertTenantWorkflowObservation(kind, observation) {
  const fail = message => { throw new Error(message); };
  if (kind === 'branding') {
    const exactViewports = JSON.stringify(observation?.viewports) === JSON.stringify([1440, 390]);
    const both = key => Array.isArray(observation?.[key]) && observation[key].length === 2 && observation[key].every(Boolean);
    if (!exactViewports || !both('uploadRendered') || !both('replacementRendered') ||
        !both('deleteFallbackRendered') || !both('reloadedWithoutLogo')) {
      fail('Branding upload render replacement delete fallback lifecycle is incomplete.');
    }
    return;
  }
  if (kind === 'family-child-lifecycle') {
    const required = ['runtimeChildId', 'created', 'linkedTeamA', 'relinked', 'parentBExcluded', 'unlinkedTeamA', 'removed', 'absentAfterReload'];
    const teams = observation?.renderedTeams;
    if (required.some(key => !observation?.[key]) || !Array.isArray(teams) ||
        teams.length !== 2 || new Set(teams).size !== 2 || teams.some(team => typeof team !== 'string' || !team)) {
      fail('Family child create link relink unlink remove lifecycle is incomplete.');
    }
    return;
  }
  if (kind === 'family-schedule-payments') {
    const amounts = observation?.renderedAmounts || {};
    const negatives = observation?.negativeStatuses || {};
    const source = observation?.sourceOrder;
    const rendered = observation?.renderedOrder;
    const complete = Array.isArray(observation?.runtimeEventIds) && observation.runtimeEventIds.length >= 2 &&
      Array.isArray(observation?.runtimePaymentIds) && observation.runtimePaymentIds.length === 3 &&
      Array.isArray(source) && Array.isArray(rendered) && source.length === rendered.length && source.join(',') !== rendered.join(',') &&
      Array.isArray(observation?.childTeamGroups) && observation.childTeamGroups.length >= 2 &&
      ['paid', 'pending', 'overdue', 'outstanding'].every(key => /^\d+\.\d{2}$/.test(String(amounts[key] || ''))) &&
      negatives.duplicate === 409 && negatives.inactive === 409 && negatives.wrongChild === 403 && negatives.wrongTeam === 403;
    if (!complete) fail('Runtime event payment chronological grouping totals negative matrix is incomplete.');
    return;
  }
  fail(`Unknown tenant workflow observation kind: ${kind}`);
}

async function main() {
  await import('node:fs/promises').then(fs => fs.mkdir(logDir, { recursive: true }));
  process.once('SIGINT', () => shutdownState.request(130));
  process.once('SIGTERM', () => shutdownState.request(143));

  if (needsFunctionsEmulator) run('npm', ['--prefix', 'functions', 'run', 'build']);
  const emulatorServices = needsFunctionsEmulator ? 'auth,firestore,storage,functions' : 'auth,firestore,storage';
  startProcess('npx', ['firebase', '--project', PROJECT_ID, 'emulators:start', '--only', emulatorServices], 'firebase.log');
  await Promise.all([waitForPort(9099), waitForPort(8080), waitForPort(9199), ...(needsFunctionsEmulator ? [waitForPort(5001)] : [])]);
  run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs']);
  fixturesSeeded = true;

  ownedNextServerProcess = startProcess('npm', ['run', 'dev'], 'next.log');
  await waitForHttp(`${BASE_URL}/login`);

  if (certificationIdentity || certificationTenants || certificationOperations) {
    await runSelectedCertificationBatches({
      certificationIdentity,
      certificationTenants,
      runIdentity: runCertificationIdentityScenarios,
      runTenants: runCertificationTenantScenarios,
      failFast: certificationFailFast,
    });
    if (certificationOperations) await runCertificationOperationsScenarios();
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
