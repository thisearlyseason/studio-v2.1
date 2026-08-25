import { assertRunId } from '../../qa-fixtures/manifest.mjs';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const STAGING_PROJECT_ID = 'the-squad-v2-staging';
export const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
export const SESSION_COOKIE_NAME = '__session';
export const FIXTURE_MANIFEST_VERSION = 3;
export const FIXTURE_RESOURCE_COUNTS = deepFreeze({ aliases: 20, teams: 3, auth: 20, firestore: 82, expectedAbsent: 1 });
export const PENDING_UNAVAILABLE_SENTINEL = 'The email or password is incorrect, or this account is unavailable.';
export const NO_TEAM_RESOURCE_POLICY = 'no-team-tenant-isolation';
export const RESOURCE_SCOPES = deepFreeze([
  'self-account',
  'join-admin-lookup',
  'tenant-team-a',
  'tenant-team-b',
  'tenant-other',
  'non-tenant',
  'transport-control',
  'unscoped',
]);

const FIXTURE_ALIASES = deepFreeze([
  'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member', 'qa-multi-org',
  'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member', 'qa-parent-a',
  'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b', 'qa-youth-active', 'qa-league-creator',
  'qa-school-admin', 'qa-superadmin', 'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
]);

const FIXTURE_UID_SUFFIXES = deepFreeze([
  'adult-player-a', 'adult-player-b', 'coach-owner-a', 'coach-owner-b', 'fake-superadmin',
  'league-creator', 'missing-profile', 'multi-org', 'no-team', 'parent-a', 'parent-b',
  'pending-delete', 'removed-member', 'school-admin', 'superadmin', 'suspended', 'team-assistant',
  'team-member', 'unverified', 'youth-active',
]);

const FIXTURE_SORTED_ALIASES = deepFreeze([...FIXTURE_ALIASES].sort());

export const LIFECYCLE_STAGES = deepFreeze({
  preflight: ['preflight'],
  seed: ['seeded'],
  inspect: ['seeded-present', 'cleaned-absent'],
  transition: ['pending-deletion'],
  cleanup: ['cleaned'],
  probe: ['independently-absent'],
  'browser-sessions': ['browsers-closed'],
  'credential-removal': ['credential-absent'],
  'workspace-removal': ['workspace-absent'],
});

export const VIEWPORTS = deepFreeze({
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
});

export const ROUTE_SCENARIOS = deepFreeze({
  '/admin': { visibleSentinels: ['Account Lookup'] },
  '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
  '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
  '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
  '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
  '/family': { visibleSentinels: ['Family Overview'] },
});

export const LANDING_SCENARIOS = deepFreeze({
  '/dashboard': ['Dashboard'],
  '/onboarding': ['Complete your profile'],
  '/teams/join': ['Join & Invite'],
  '/login': ['Sign In'],
});
export const LANDING_SENTINELS = deepFreeze([...new Set([
  ...Object.values(LANDING_SCENARIOS).flat(),
  ...Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels),
])]);
export const PROTECTED_PAGE_HEADINGS = deepFreeze([...new Set([
  'Dashboard',
  ...Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels),
])]);

export const ISOLATION_SCENARIOS = deepFreeze({
  team: {
    endpoint: '/api/teams/chat',
    parameter: 'teamId',
    ownStatus: 200,
    oppositeStatus: 403,
  },
  directFirestore: [
    { label: 'own-team', status: 200 },
    { label: 'opposite-team', status: 403 },
    { label: 'own-player', status: 200 },
    { label: 'opposite-player', status: 403 },
  ],
});

const ISOLATION_ALIAS_SHAPES = deepFreeze({
  'qa-parent-a': { side: 'a', ownPlayer: 'player-youth-active' },
  'qa-parent-b': { side: 'b', ownPlayer: 'youth-player-b' },
  'qa-adult-player-a': { side: 'a', ownPlayer: 'player-adult-a' },
  'qa-adult-player-b': { side: 'b', ownPlayer: 'player-adult-b' },
  'qa-youth-active': { side: 'a', ownPlayer: 'player-youth-active' },
});

export function buildIsolationExpectation({ runId, alias } = {}) {
  assertRunId(runId);
  const shape = ISOLATION_ALIAS_SHAPES[alias];
  if (!shape) throw new Error('Isolation expectation requires a supported isolation alias.');
  const oppositeSide = shape.side === 'a' ? 'b' : 'a';
  const oppositePlayer = shape.side === 'a' ? 'youth-player-b' : 'player-youth-active';
  const ownTeamId = `${runId}-team-${shape.side}`;
  const oppositeTeamId = `${runId}-team-${oppositeSide}`;
  const apiTarget = teamId => `${ISOLATION_SCENARIOS.team.endpoint}?${ISOLATION_SCENARIOS.team.parameter}=${encodeURIComponent(teamId)}`;
  return deepFreeze({
    runId,
    alias,
    endpoint: ISOLATION_SCENARIOS.team.endpoint,
    parameter: ISOLATION_SCENARIOS.team.parameter,
    ownTeamId,
    oppositeTeamId,
    sameOriginApi: [
      {
        label: 'own-team-api',
        endpoint: ISOLATION_SCENARIOS.team.endpoint,
        parameter: ISOLATION_SCENARIOS.team.parameter,
        teamId: ownTeamId,
        target: apiTarget(ownTeamId),
        status: 200,
      },
      {
        label: 'opposite-team-api',
        endpoint: ISOLATION_SCENARIOS.team.endpoint,
        parameter: ISOLATION_SCENARIOS.team.parameter,
        teamId: oppositeTeamId,
        target: apiTarget(oppositeTeamId),
        status: 403,
      },
    ],
    directFirestore: [
      { label: 'own-team', path: `teams/${ownTeamId}`, status: 200 },
      { label: 'opposite-team', path: `teams/${oppositeTeamId}`, status: 403 },
      { label: 'own-player', path: `players/${runId}-${shape.ownPlayer}`, status: 200 },
      { label: 'opposite-player', path: `players/${runId}-${oppositePlayer}`, status: 403 },
    ],
  });
}

export const REQUIRED_LOGOUT_STAGES = deepFreeze([
  'logout-tab',
  'stale-tab-reload',
  'stale-tab-back',
  'stale-tab-second-reload',
]);

export const SCENARIO_GROUP_COUNTS = deepFreeze({
  'admission-route': 18,
  isolation: 10,
  logout: 10,
  'pending-deletion': 6,
});

export const SCENARIO_TOTALS = deepFreeze({ total: 44, pass: 44, fail: 0, inconclusive: 0 });

export const REQUIRED_LEDGER_COLUMNS = deepFreeze([
  'contextId',
  'group',
  'alias',
  'viewport',
  'startState',
  'startUrl',
  'action',
  'expectedResult',
  'finalUrl',
  'visibleState',
  'sessionPresent',
  'protectedRequests',
  'protectedListenerStarts',
  'relevantHttpDataResult',
  'pageErrors',
  'appConsoleErrors',
  'unexpectedRequestFailures',
  'overflow',
  'result',
]);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

const requireRecord = (value, name) => {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
};

const requireBoolean = (value, name) => {
  if (typeof value !== 'boolean') throw new Error(`${name} must be an explicit boolean.`);
  return value;
};

const requireCount = (value, name) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
};

const requireString = (value, name) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
};

const requireExact = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`${name} must equal the exact expected value.`);
};

const requireExactArray = (value, expected, name) => {
  if (!Array.isArray(value) || value.length !== expected.length || value.some((item, index) => item !== expected[index])) {
    throw new Error(`${name} must match the complete canonical ordered values.`);
  }
};

const requireExactKeys = (value, expected, name) => {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error(`${name} must contain exactly its real producer fields.`);
  }
};

const requireLifecycleStage = (kind, stage) => {
  const supported = LIFECYCLE_STAGES[kind];
  if (!supported || !supported.includes(stage)) throw new Error(`Unsupported lifecycle stage for ${kind}.`);
};

const parseResult = value => {
  if (typeof value !== 'string') return requireRecord(value, 'Lifecycle result');
  try {
    return requireRecord(JSON.parse(value), 'Lifecycle result');
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Lifecycle result must be valid JSON.');
    throw error;
  }
};

const requireOk = value => {
  if (value.ok !== true) throw new Error('Lifecycle result must report ok=true.');
};

const requireZeroSummary = (value, name) => {
  requireRecord(value, name);
  requireCount(value.count, `${name}.count`);
  if (value.count !== 0) throw new Error(`${name} must report zero retained resources or failures.`);
  if (!Array.isArray(value.aliases) || value.aliases.length !== 0) {
    throw new Error(`${name} aliases must be empty.`);
  }
};

const requireCanonicalStagingLocation = (value, finalPath, name) => {
  requireString(value, `${name} finalUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must contain an absolute canonical finalUrl.`);
  }
  if (parsed.origin !== STAGING_ORIGIN || parsed.username || parsed.password) {
    throw new Error(`${name} finalUrl must use the canonical staging origin.`);
  }
  if (parsed.search || parsed.hash || value !== `${STAGING_ORIGIN}${parsed.pathname}`) {
    throw new Error(`${name} must contain a canonical finalUrl without query or hash.`);
  }
  if (parsed.pathname !== finalPath) {
    throw new Error(`${name} finalUrl must match finalPath.`);
  }
  return parsed.pathname;
};

const requireCanonicalStagingAttribution = (value, name) => {
  requireString(value, `${name} initiatingFrameUrl`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must have canonical staging attribution.`);
  }
  if (
    parsed.origin !== STAGING_ORIGIN
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || value !== `${STAGING_ORIGIN}${parsed.pathname}`
  ) throw new Error(`${name} must have canonical staging attribution.`);
  return parsed.pathname;
};

const isExactPathOrSubtree = (pathname, root) => pathname === root || pathname.startsWith(`${root}/`);

export function validateNoTeamResourceIsolation(value) {
  const window = requireRecord(value, 'No Team action window');
  if (window.protectedRender === true) throw new Error('No Team action window contains a protected render.');
  if (!Array.isArray(window.teamSelectionSignals) || window.teamSelectionSignals.some(scope => (
    !['tenant-team-a', 'tenant-team-b', 'tenant-other'].includes(scope)
  ))) throw new Error('No Team evidence requires complete typed team-selection scopes.');
  if (window.teamSelectionSignals.includes('tenant-team-a')) throw new Error('No Team selected Team A.');
  if (window.teamSelectionSignals.includes('tenant-team-b')) throw new Error('No Team selected Team B.');
  if (window.teamSelectionSignals.includes('tenant-other')) throw new Error('No Team selected another tenant.');
  const validateSignals = (signals, count, name) => {
    requireCount(count, `No Team ${name} count`);
    if (!Array.isArray(signals) || signals.length !== count || signals.some(signal => (
      !isRecord(signal)
      || typeof signal.url !== 'string'
      || typeof signal.method !== 'string'
      || typeof signal.resourceType !== 'string'
      || typeof signal.initiatingFrameUrl !== 'string'
    ))) throw new Error(`No Team evidence requires complete ${name} signals.`);
    for (const signal of signals) {
      if (!RESOURCE_SCOPES.includes(signal.resourceScope) || signal.resourceScope === 'unscoped') {
        throw new Error('No Team evidence requires a typed resource scope.');
      }
      if (signal.resourceScope === 'tenant-team-a') {
        throw new Error('No Team evidence contains Team A tenant resource activity.');
      }
      if (signal.resourceScope === 'tenant-team-b') {
        throw new Error('No Team evidence contains Team B tenant resource activity.');
      }
      if (signal.resourceScope === 'tenant-other') {
        throw new Error('No Team evidence contains other tenant resource activity.');
      }
      if (signal.resourceScope === 'join-admin-lookup') {
        let target;
        try {
          target = new URL(signal.url);
        } catch {
          throw new Error('No Team join-page admin lookup must use its exact canonical target.');
        }
        if (
          target.origin !== STAGING_ORIGIN
          || target.pathname !== '/api/schools/admins'
          || signal.method !== 'PATCH'
        ) {
          throw new Error('No Team join-page admin lookup must use its exact canonical target.');
        }
      }
    }
  };
  validateSignals(window.protectedRequestSignals, window.protectedRequests, 'protected request');
  validateSignals(window.listenerSignals, window.protectedListenerStarts, 'protected listener');
  return { pass: true };
}

export function validateActionWindow(value, options = {}) {
  const window = requireRecord(value, 'Action window');
  requireBoolean(window.terminalReached, 'terminalReached');
  requireBoolean(window.loadingVisible, 'loadingVisible');
  requireString(window.finalPath, 'finalPath');
  requireCanonicalStagingLocation(window.finalUrl, window.finalPath, 'Action window');
  if (!Array.isArray(window.visibleSentinels) || window.visibleSentinels.some(item => typeof item !== 'string')) {
    throw new Error('visibleSentinels must be an explicit string array.');
  }
  if (!Array.isArray(window.renderSignals) || window.renderSignals.some(signal => (
    !isRecord(signal)
    || !['heading', 'status'].includes(signal.kind)
    || typeof signal.pathname !== 'string'
    || typeof signal.sentinel !== 'string'
  ))) throw new Error('renderSignals must contain typed heading or status signals.');
  if (!['unavailable', 'none', 'other'].includes(window.redirectReason)) {
    throw new Error('redirectReason must use the fixed sanitized enum.');
  }
  requireBoolean(window.sessionPresent, 'sessionPresent');
  requireBoolean(window.protectedRender, 'protectedRender');
  requireCount(window.protectedRequests, 'protectedRequests');
  requireCount(window.protectedListenerStarts, 'protectedListenerStarts');
  requireCount(window.pageErrors, 'pageErrors');
  requireCount(window.appConsoleErrors, 'appConsoleErrors');
  requireCount(window.unexpectedRequestFailures, 'unexpectedRequestFailures');
  requireCount(window.overflow, 'overflow');

  if (!window.terminalReached) throw new Error('Action window did not reach its terminal state.');
  if (window.loadingVisible) throw new Error('Action window ended with swallowed loading state.');
  if (window.pageErrors !== 0) throw new Error('Action window contains page errors.');
  if (window.appConsoleErrors !== 0) throw new Error('Action window contains application console errors.');
  if (window.unexpectedRequestFailures !== 0) throw new Error('Action window contains an unexpected request failure.');
  if (window.overflow !== 0) throw new Error('Action window signal overflow is nonzero.');

  const protectedHistory = window.renderSignals.filter(signal => (
    signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)
  ));
  if (window.protectedRender !== (protectedHistory.length > 0)) {
    throw new Error('Protected render flag must match protected heading history.');
  }

  const pendingStale = options.kind === 'pending-deletion-stale';
  const pendingFresh = options.kind === 'pending-deletion-fresh';
  const revoked = options.kind === 'fresh-unauthenticated' || pendingStale || pendingFresh;
  const requireNoProtected = revoked || options.requireNoProtected === true;
  if (options.resourcePolicy !== undefined && options.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    throw new Error('Action window resource policy is unsupported.');
  }
  if (revoked && window.sessionPresent) throw new Error('Revoked action window retained a session.');
  if (revoked && window.finalPath !== '/login') throw new Error('Revoked action window must end at /login.');
  if (revoked && !window.visibleSentinels.includes('Sign In')) throw new Error('Revoked action window must reach the Sign In sentinel.');
  const unavailableStatusObserved = window.renderSignals.some(signal => (
    signal.kind === 'status' && signal.sentinel === PENDING_UNAVAILABLE_SENTINEL
  ));
  if (pendingStale && window.redirectReason !== 'unavailable') {
    throw new Error('Stale pending-deletion redirect reason must be unavailable.');
  }
  if (pendingFresh && window.redirectReason !== 'none') {
    throw new Error('Fresh pending-deletion redirect reason must be none.');
  }
  if (pendingStale && (window.visibleSentinels.includes(PENDING_UNAVAILABLE_SENTINEL) || unavailableStatusObserved)) {
    throw new Error(`Stale pending-deletion action window must not show unavailable toast or contain transient unavailable status: ${PENDING_UNAVAILABLE_SENTINEL}`);
  }
  if (pendingFresh && (!window.visibleSentinels.includes(PENDING_UNAVAILABLE_SENTINEL) || !unavailableStatusObserved)) {
    throw new Error(`Fresh pending-deletion action window must show unavailable status signal: ${PENDING_UNAVAILABLE_SENTINEL}`);
  }
  if (requireNoProtected) {
    if (window.protectedRender) throw new Error('Revoked action window contains a protected render.');
    if (window.protectedRequests !== 0) throw new Error('Revoked action window contains a protected request.');
    if (window.protectedListenerStarts !== 0) throw new Error('Revoked action window contains a protected listener start.');
  }
  if (options.resourcePolicy === NO_TEAM_RESOURCE_POLICY) validateNoTeamResourceIsolation(window);

  return { ...window, pass: true };
}

export function validateRouteResult(value) {
  const result = requireRecord(value, 'Route result');
  requireBoolean(result.allowed, 'allowed');
  if (Object.hasOwn(result, 'requireNoProtected')) {
    requireBoolean(result.requireNoProtected, 'requireNoProtected');
  }
  if (Object.hasOwn(result, 'resourcePolicy') && result.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    throw new Error('Route result resource policy is unsupported.');
  }
  const requestedPath = result.allowed
    ? result.requestedPath ?? result.expectedPath
    : requireString(result.requestedPath, 'requestedPath');
  const expectedPath = requireString(result.expectedPath, 'expectedPath');
  const expectedSentinel = requireString(result.expectedSentinel, 'expectedSentinel');
  if (!ROUTE_SCENARIOS[requestedPath]) throw new Error('Route result requestedPath must be a configured protected route.');
  if (result.allowed && !ROUTE_SCENARIOS[expectedPath]?.visibleSentinels.includes(expectedSentinel)) {
    throw new Error('Allowed route must use its configured route sentinel.');
  }
  const exactDeniedLanding = LANDING_SCENARIOS[expectedPath]?.includes(expectedSentinel)
    || ROUTE_SCENARIOS[expectedPath]?.visibleSentinels.includes(expectedSentinel);
  if (!result.allowed && !exactDeniedLanding) {
    throw new Error('Denied route must use an exact landing sentinel.');
  }
  if (!result.allowed && requestedPath === expectedPath) {
    throw new Error('Denied route requestedPath must differ from its authorized landing path.');
  }
  const window = validateActionWindow(result.window, {
    requireNoProtected: result.requireNoProtected === true,
    resourcePolicy: result.resourcePolicy,
  });

  if (!window.sessionPresent) throw new Error('Active-user route result must retain an authenticated session.');

  if (window.finalPath !== expectedPath) throw new Error('Route result pathname does not match the expected pathname.');
  if (!window.visibleSentinels.includes(expectedSentinel)) {
    throw new Error('Route result did not reach its configured visible sentinel.');
  }
  const finalProtectedHeadings = window.visibleSentinels.filter(sentinel => PROTECTED_PAGE_HEADINGS.includes(sentinel));
  const expectedFinalProtectedHeadings = PROTECTED_PAGE_HEADINGS.includes(expectedSentinel) ? [expectedSentinel] : [];
  if (
    finalProtectedHeadings.length !== expectedFinalProtectedHeadings.length
    || finalProtectedHeadings.some((sentinel, index) => sentinel !== expectedFinalProtectedHeadings[index])
  ) throw new Error('Route result final visible protected heading must exactly match the expected sentinel.');
  if (window.protectedRender) {
    const protectedSignals = window.renderSignals.filter(signal => (
      signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)
    ));
    if (protectedSignals.length === 0) {
      throw new Error('Allowed route protected-render history is incomplete.');
    }
    const unexpected = protectedSignals.some(signal => (
      signal.pathname !== expectedPath
      || signal.sentinel !== expectedSentinel
    ));
    if (unexpected) throw new Error('Allowed route contains an unexpected protected render.');
  }

  if (!result.allowed && result.resourcePolicy !== NO_TEAM_RESOURCE_POLICY) {
    const requireAttributedSignals = (signals, count, name) => {
      if (!Array.isArray(signals) || signals.length !== count || signals.some(signal => (
        !isRecord(signal)
        || typeof signal.url !== 'string'
        || typeof signal.method !== 'string'
        || typeof signal.resourceType !== 'string'
        || typeof signal.initiatingFrameUrl !== 'string'
      ))) throw new Error(`Denied route requires complete attributed ${name} evidence.`);
      return signals;
    };
    const requestSignals = requireAttributedSignals(
      window.protectedRequestSignals, window.protectedRequests, 'protected request',
    );
    const listenerSignals = requireAttributedSignals(
      window.listenerSignals, window.protectedListenerStarts, 'protected listener',
    );
    const validateAttribution = (signal, name) => {
      const pathname = requireCanonicalStagingAttribution(signal.initiatingFrameUrl, name);
      if (isExactPathOrSubtree(pathname, requestedPath)) {
        throw new Error(`Denied route contains a denied-target ${name}.`);
      }
      if (pathname !== expectedPath) {
        throw new Error(`Denied route ${name} must use the exact authorized landing attribution.`);
      }
    };
    for (const signal of requestSignals) validateAttribution(signal, 'protected request');
    for (const signal of listenerSignals) validateAttribution(signal, 'protected listener');
  }

  return { pass: true, allowed: result.allowed, window };
}

export function validateIsolationResult(value) {
  const result = requireRecord(value, 'Isolation result');
  const canonical = buildIsolationExpectation({ runId: result.runId, alias: result.alias });
  if (result.endpoint !== ISOLATION_SCENARIOS.team.endpoint || result.parameter !== ISOLATION_SCENARIOS.team.parameter) {
    throw new Error('Isolation must use the configured parameter-consuming same-origin endpoint.');
  }
  requireString(result.ownTeamId, 'Isolation ownTeamId');
  requireString(result.oppositeTeamId, 'Isolation oppositeTeamId');
  requireExact(result.ownTeamId, canonical.ownTeamId, 'Isolation ownTeamId');
  requireExact(result.oppositeTeamId, canonical.oppositeTeamId, 'Isolation oppositeTeamId');
  if (result.ownTeamId === result.oppositeTeamId) throw new Error('Isolation ownTeamId and oppositeTeamId must differ.');
  if (!Array.isArray(result.sameOriginApi) || result.sameOriginApi.length !== canonical.sameOriginApi.length) {
    throw new Error('Isolation must contain both exact same-origin API target pairs.');
  }
  for (const [index, expected] of canonical.sameOriginApi.entries()) {
    const actual = requireRecord(result.sameOriginApi[index], `${expected.label} same-origin API result`);
    for (const field of ['label', 'endpoint', 'parameter', 'teamId', 'target', 'status']) {
      if (actual[field] !== expected[field]) {
        throw new Error(`${expected.label} ${field} must equal the canonical ${expected.status} target pair.`);
      }
    }
  }
  if (!Array.isArray(result.directFirestore) || result.directFirestore.length !== ISOLATION_SCENARIOS.directFirestore.length) {
    throw new Error('Isolation Firestore probe must contain the complete exact label set.');
  }

  const probes = new Map();
  for (const probe of result.directFirestore) {
    requireRecord(probe, 'Firestore probe');
    requireString(probe.label, 'Firestore probe label');
    requireCount(probe.status, `${probe.label} status`);
    if (probes.has(probe.label)) throw new Error(`Firestore probe label ${probe.label} is duplicated.`);
    probes.set(probe.label, probe.status);
  }
  for (const expected of ISOLATION_SCENARIOS.directFirestore) {
    const canonicalProbe = canonical.directFirestore.find(probe => probe.label === expected.label);
    const actual = result.directFirestore.find(probe => probe.label === expected.label);
    if (actual?.path !== canonicalProbe.path) {
      throw new Error(`${expected.label} Firestore probe path must match the canonical isolation path.`);
    }
    if (probes.get(expected.label) !== canonicalProbe.status) {
      throw new Error(`${expected.label} Firestore probe must return ${canonicalProbe.status}.`);
    }
  }

  requireBoolean(result.oppositeProtectedRender, 'oppositeProtectedRender');
  requireCount(result.oppositeListenerStarts, 'oppositeListenerStarts');
  if (result.oppositeProtectedRender) throw new Error('Isolation observed an opposite protected render.');
  if (result.oppositeListenerStarts !== 0) throw new Error('Isolation observed an opposite listener start.');
  return { pass: true };
}

export function validateLogoutStages(value) {
  if (!Array.isArray(value) || value.length !== REQUIRED_LOGOUT_STAGES.length) {
    throw new Error('Logout validation requires every logout stage.');
  }
  const stages = value.map((stage, index) => {
    requireRecord(stage, `Logout stage ${index}`);
    if (stage.name !== REQUIRED_LOGOUT_STAGES[index]) throw new Error('Logout stages are missing or out of order.');
    const window = validateActionWindow(stage.window, { requireNoProtected: true });
    if (window.sessionPresent) throw new Error(`${stage.name} retained a session.`);
    if (window.finalPath !== '/login') throw new Error(`${stage.name} pathname must be /login.`);
    if (!window.visibleSentinels.includes('Sign In')) throw new Error(`${stage.name} must reach the login visible sentinel.`);
    return { name: stage.name, window };
  });
  return { pass: true, stages };
}

const validateInspect = (value, expected) => {
  const states = requireRecord(value.states, 'Inspect states');
  requireCount(states.problems, 'Inspect problems');
  if (states.problems !== 0) throw new Error('Inspect problems must be zero.');
  requireExact(states.manifest, expected.state, 'Inspect state');
  if (!Array.isArray(value.drift) || value.drift.length !== 0) throw new Error('Inspect drift must be empty.');
  const counts = requireRecord(value.counts, 'Inspect counts');
  const expectedCounts = requireRecord(counts.expected, 'Inspect expected counts');
  const actual = requireRecord(counts.actualPresent, 'Inspect actual-present counts');
  requireCount(expectedCounts.auth, 'Inspect expected Auth count');
  requireCount(expectedCounts.firestore, 'Inspect expected Firestore count');
  requireCount(actual.auth, 'Inspect present Auth count');
  requireCount(actual.firestore, 'Inspect present Firestore count');
  requireExact(expectedCounts.auth, expected.auth, 'Inspect expected Auth count');
  requireExact(expectedCounts.firestore, expected.firestore, 'Inspect expected Firestore count');
  requireExact(actual.auth, expected.actualAuth, 'Inspect present Auth count');
  requireExact(actual.firestore, expected.actualFirestore, 'Inspect present Firestore count');
};

const validateCleanup = (value, expected) => {
  if (!Array.isArray(value.retained) || value.retained.length !== 0) throw new Error('Cleanup retained list must be empty.');
  const deleted = requireRecord(value.deleted, 'Cleanup deleted counts');
  requireCount(deleted.auth, 'Cleanup deleted Auth count');
  requireCount(deleted.firestore, 'Cleanup deleted Firestore count');
  requireExact(deleted.auth, expected.auth, 'Cleanup deleted Auth count');
  requireExact(deleted.firestore, expected.firestore, 'Cleanup deleted Firestore count');
  const followUp = requireRecord(value.followUp, 'Cleanup follow-up');
  for (const category of ['retained', 'failures']) {
    const summary = requireRecord(followUp[category], `Cleanup ${category}`);
    requireZeroSummary(summary.auth, `Cleanup ${category} Auth`);
    requireZeroSummary(summary.firestore, `Cleanup ${category} Firestore`);
  }
};

const validateProbe = (value, expected) => {
  requireCount(value.checkedAuth, 'Probe checked Auth count');
  requireCount(value.checkedFirestore, 'Probe checked Firestore count');
  requireCount(value.checkedExpectedAbsent, 'Probe checked expected-absence count');
  requireCount(value.authPresent, 'Probe present Auth count');
  requireCount(value.firestorePresent, 'Probe present Firestore count');
  requireCount(value.expectedAbsentPresent, 'Probe present expected-absence count');
  requireExact(value.checkedAuth, expected.auth, 'Probe checked Auth count');
  requireExact(value.checkedFirestore, expected.firestore, 'Probe checked Firestore count');
  if (value.checkedExpectedAbsent !== expected.expectedAbsent) {
    throw new Error('Probe expected-absence coverage is incomplete.');
  }
  requireExact(value.authPresent, 0, 'Probe present Auth count');
  requireExact(value.firestorePresent, 0, 'Probe present Firestore count');
  requireExact(value.expectedAbsentPresent, 0, 'Probe present expected-absence count');
};

export function validateLifecycleResult(kind, input, stage) {
  const value = parseResult(input);
  requireLifecycleStage(kind, stage);
  switch (kind) {
    case 'preflight':
      requireExactKeys(value, ['command', 'projectId', 'origin', 'plannedAliases', 'plannedTeams', 'safe'], 'Preflight');
      requireExact(value.command, 'preflight', 'Preflight command');
      requireBoolean(value.safe, 'Preflight safe');
      requireString(value.projectId, 'Preflight projectId');
      requireString(value.origin, 'Preflight origin');
      requireCount(value.plannedAliases, 'Preflight plannedAliases');
      requireCount(value.plannedTeams, 'Preflight plannedTeams');
      if (!value.safe) throw new Error('Preflight must report safe=true.');
      requireExact(value.projectId, STAGING_PROJECT_ID, 'Preflight projectId');
      requireExact(value.origin, STAGING_ORIGIN, 'Preflight origin');
      requireExact(value.plannedAliases, FIXTURE_RESOURCE_COUNTS.aliases, 'Preflight plannedAliases');
      requireExact(value.plannedTeams, FIXTURE_RESOURCE_COUNTS.teams, 'Preflight plannedTeams');
      break;
    case 'seed': {
      requireExactKeys(value, ['command', 'state', 'aliases', 'counts', 'uidSuffixes'], 'Seed');
      requireExact(value.command, 'seed', 'Seed command');
      requireString(value.state, 'Seed state');
      const counts = requireRecord(value.counts, 'Seed counts');
      requireCount(counts.auth, 'Seed Auth count');
      requireCount(counts.firestore, 'Seed Firestore count');
      if (
        value.state !== 'seeded'
        || counts.auth !== FIXTURE_RESOURCE_COUNTS.auth
        || counts.firestore !== FIXTURE_RESOURCE_COUNTS.firestore
      ) throw new Error('Seed result does not match the canonical seed state and counts.');
      requireExactArray(value.aliases, FIXTURE_ALIASES, 'Seed aliases');
      requireExactArray(value.uidSuffixes, FIXTURE_UID_SUFFIXES, 'Seed UID suffixes');
      break;
    }
    case 'inspect': {
      requireOk(value);
      requireExactKeys(value, ['command', 'ok', 'aliases', 'counts', 'states', 'drift', 'uidSuffixes'], 'Inspect');
      requireExact(value.command, 'inspect', 'Inspect command');
      const canonical = stage === 'seeded-present'
        ? {
            state: 'seeded',
            auth: FIXTURE_RESOURCE_COUNTS.auth,
            firestore: FIXTURE_RESOURCE_COUNTS.firestore,
            actualAuth: FIXTURE_RESOURCE_COUNTS.auth,
            actualFirestore: FIXTURE_RESOURCE_COUNTS.firestore,
          }
        : {
            state: 'cleaned',
            auth: FIXTURE_RESOURCE_COUNTS.auth,
            firestore: FIXTURE_RESOURCE_COUNTS.firestore,
            actualAuth: 0,
            actualFirestore: 0,
          };
      validateInspect(value, canonical);
      requireExactArray(value.aliases, stage === 'seeded-present' ? FIXTURE_SORTED_ALIASES : [], 'Inspect aliases');
      requireExactArray(value.uidSuffixes, FIXTURE_UID_SUFFIXES, 'Inspect UID suffixes');
      break;
    }
    case 'transition': {
      requireExact(value.command, 'transition', 'Transition command');
      requireString(value.alias, 'Transition alias');
      requireString(value.state, 'Transition state');
      requireString(value.uidSuffix, 'Transition UID suffix');
      requireExact(value.alias, 'qa-pending-delete', 'Transition alias');
      requireExact(value.state, 'pending_deletion', 'Transition state');
      requireExact(value.uidSuffix, 'pending-delete', 'Transition UID suffix');
      if ('resumed' in value) requireBoolean(value.resumed, 'Transition resumed');
      break;
    }
    case 'cleanup':
      requireOk(value);
      requireExact(value.command, 'cleanup', 'Cleanup command');
      validateCleanup(value, { auth: FIXTURE_RESOURCE_COUNTS.auth, firestore: FIXTURE_RESOURCE_COUNTS.firestore });
      break;
    case 'probe':
      requireExact(value.projectId, STAGING_PROJECT_ID, 'Probe projectId');
      validateProbe(value, {
        auth: FIXTURE_RESOURCE_COUNTS.auth,
        firestore: FIXTURE_RESOURCE_COUNTS.firestore,
        expectedAbsent: FIXTURE_RESOURCE_COUNTS.expectedAbsent,
      });
      break;
    case 'browser-sessions':
      if (!Array.isArray(value.sessions) || value.sessions.length !== 0) throw new Error('Lifecycle closure requires zero browser sessions.');
      break;
    case 'credential-removal':
    case 'workspace-removal':
      if (value.absent !== true) throw new Error(`${kind} must prove absence.`);
      break;
  }
  return { pass: true, kind };
}

export function validateLedger(rows, expected) {
  if (!Array.isArray(rows)) throw new Error('Ledger rows must be an array.');
  const contract = requireRecord(expected, 'Ledger expectation');
  const groupCounts = requireRecord(contract.groupCounts, 'Ledger group counts');
  const totals = requireRecord(contract.totals, 'Ledger totals');
  if (
    Object.keys(groupCounts).length !== Object.keys(SCENARIO_GROUP_COUNTS).length
    || Object.entries(SCENARIO_GROUP_COUNTS).some(([group, count]) => groupCounts[group] !== count)
    || Object.keys(totals).length !== Object.keys(SCENARIO_TOTALS).length
    || Object.entries(SCENARIO_TOTALS).some(([key, count]) => totals[key] !== count)
  ) {
    throw new Error('Ledger expectation does not match canonical group arithmetic.');
  }
  const ids = new Set();
  const actualGroups = new Map();
  const actualTotals = { total: rows.length, pass: 0, fail: 0, inconclusive: 0 };
  const viewports = new Set();

  for (const [index, row] of rows.entries()) {
    requireRecord(row, `Ledger row ${index}`);
    for (const column of REQUIRED_LEDGER_COLUMNS) {
      if (!(column in row) || row[column] === undefined || row[column] === null || row[column] === '') {
        throw new Error(`Ledger row ${index} is missing ${column}.`);
      }
    }
    for (const column of ['contextId', 'alias', 'startState', 'startUrl', 'action', 'expectedResult', 'visibleState', 'relevantHttpDataResult']) {
      requireString(row[column], `Ledger row ${index} ${column}`);
    }
    if (!Object.hasOwn(SCENARIO_GROUP_COUNTS, row.group)) throw new Error(`Ledger row ${index} group is unsupported.`);
    if (!new Set(['390x844', '1440x900']).has(row.viewport)) throw new Error(`Ledger row ${index} viewport is not canonical.`);
    requireBoolean(row.sessionPresent, `Ledger row ${index} sessionPresent`);
    for (const column of ['protectedRequests', 'protectedListenerStarts', 'pageErrors', 'appConsoleErrors', 'unexpectedRequestFailures', 'overflow']) {
      requireCount(row[column], `Ledger row ${index} ${column}`);
    }
    requireString(row.finalUrl, `Ledger row ${index} finalUrl`);
    let finalUrl;
    try {
      finalUrl = new URL(row.finalUrl);
    } catch {
      throw new Error(`Ledger row ${index} must contain an absolute canonical finalUrl.`);
    }
    if (finalUrl.origin !== STAGING_ORIGIN || finalUrl.username || finalUrl.password || finalUrl.hash) {
      throw new Error(`Ledger row ${index} finalUrl must use the canonical staging origin.`);
    }
    if (!new Set(['PASS', 'FAIL', 'INCONCLUSIVE-HARNESS']).has(row.result)) {
      throw new Error(`Ledger row ${index} result is unsupported.`);
    }
    if (ids.has(row.contextId)) throw new Error(`Ledger contains duplicate context ID ${row.contextId}.`);
    ids.add(row.contextId);
    viewports.add(row.viewport);
    actualGroups.set(row.group, (actualGroups.get(row.group) ?? 0) + 1);
    if (row.result === 'PASS') actualTotals.pass += 1;
    else if (row.result === 'FAIL') actualTotals.fail += 1;
    else if (row.result === 'INCONCLUSIVE-HARNESS') actualTotals.inconclusive += 1;
  }

  for (const [group, count] of Object.entries(groupCounts)) {
    if ((actualGroups.get(group) ?? 0) !== count) throw new Error(`Ledger group count mismatch for ${group}.`);
  }
  if (actualGroups.size !== Object.keys(groupCounts).length) throw new Error('Ledger contains an unexpected scenario group.');
  if (!viewports.has('390x844') || !viewports.has('1440x900')) throw new Error('Ledger must cover both required viewports.');
  for (const key of Object.keys(actualTotals)) {
    if (actualTotals[key] !== totals[key]) throw new Error(`Ledger result arithmetic mismatch for ${key}.`);
  }
  if (actualTotals.pass + actualTotals.fail + actualTotals.inconclusive !== actualTotals.total) {
    throw new Error('Ledger result arithmetic does not sum to the total.');
  }
  return { pass: true, groupCounts: Object.fromEntries(actualGroups), totals: actualTotals };
}
