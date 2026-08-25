const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};

export const VIEWPORTS = deepFreeze({
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
});

export const ROUTE_SCENARIOS = deepFreeze({
  '/admin': { visibleSentinel: 'Admin' },
  '/club': { visibleSentinel: 'Club/School Hub' },
  '/competition': { visibleSentinel: 'Competition Hub' },
  '/dashboard/billing': { visibleSentinel: 'Billing' },
  '/coaches-corner': { visibleSentinel: 'Coaches Corner' },
  '/family': { visibleSentinel: 'Family Overview' },
});

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
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string.`);
  return value;
};

const requireExact = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`${name} must equal the exact expected value.`);
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

export function validateActionWindow(value, options = {}) {
  const window = requireRecord(value, 'Action window');
  requireBoolean(window.terminalReached, 'terminalReached');
  requireBoolean(window.loadingVisible, 'loadingVisible');
  requireString(window.finalPath, 'finalPath');
  if (!Array.isArray(window.visibleSentinels) || window.visibleSentinels.some(item => typeof item !== 'string')) {
    throw new Error('visibleSentinels must be an explicit string array.');
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

  const revoked = options.kind === 'fresh-unauthenticated' || options.kind === 'pending-deletion';
  const requireNoProtected = revoked || options.requireNoProtected === true;
  if (revoked && window.sessionPresent) throw new Error('Revoked action window retained a session.');
  if (requireNoProtected) {
    if (window.protectedRender) throw new Error('Revoked action window contains a protected render.');
    if (window.protectedRequests !== 0) throw new Error('Revoked action window contains a protected request.');
    if (window.protectedListenerStarts !== 0) throw new Error('Revoked action window contains a protected listener start.');
  }

  return { ...window, pass: true };
}

export function validateRouteResult(value) {
  const result = requireRecord(value, 'Route result');
  requireBoolean(result.allowed, 'allowed');
  const expectedPath = requireString(result.expectedPath, 'expectedPath');
  const expectedSentinel = requireString(result.expectedSentinel, 'expectedSentinel');
  if (result.allowed && ROUTE_SCENARIOS[expectedPath]?.visibleSentinel !== expectedSentinel) {
    throw new Error('Allowed route must use its configured route sentinel.');
  }
  const window = validateActionWindow(result.window, { requireNoProtected: !result.allowed });

  if (window.finalPath !== expectedPath) throw new Error('Route result pathname does not match the expected pathname.');
  if (!window.visibleSentinels.includes(expectedSentinel)) {
    throw new Error('Route result did not reach its configured visible sentinel.');
  }

  return { pass: true, allowed: result.allowed, window };
}

export function validateIsolationResult(value) {
  const result = requireRecord(value, 'Isolation result');
  if (result.endpoint !== ISOLATION_SCENARIOS.team.endpoint || result.parameter !== ISOLATION_SCENARIOS.team.parameter) {
    throw new Error('Isolation must use the configured parameter-consuming same-origin endpoint.');
  }
  if (result.ownApiStatus !== 200) throw new Error('Isolation own API status must be 200.');
  if (result.oppositeApiStatus !== 403) throw new Error('Isolation opposite API status must be 403.');
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
    if (probes.get(expected.label) !== expected.status) {
      throw new Error(`${expected.label} Firestore probe must return ${expected.status}.`);
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
  requireExact(expectedCounts.auth, expected.auth, 'Inspect expected Auth count');
  requireExact(expectedCounts.firestore, expected.firestore, 'Inspect expected Firestore count');
  requireExact(actual.auth, expected.actualAuth, 'Inspect present Auth count');
  requireExact(actual.firestore, expected.actualFirestore, 'Inspect present Firestore count');
};

const validateCleanup = (value, expected) => {
  if (!Array.isArray(value.retained) || value.retained.length !== 0) throw new Error('Cleanup retained list must be empty.');
  const deleted = requireRecord(value.deleted, 'Cleanup deleted counts');
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
  requireExact(value.checkedAuth, expected.auth, 'Probe checked Auth count');
  requireExact(value.checkedFirestore, expected.firestore, 'Probe checked Firestore count');
  if (value.checkedExpectedAbsent !== expected.expectedAbsent) {
    throw new Error('Probe expected-absence coverage is incomplete.');
  }
  requireExact(value.authPresent, 0, 'Probe present Auth count');
  requireExact(value.firestorePresent, 0, 'Probe present Firestore count');
  requireExact(value.expectedAbsentPresent, 0, 'Probe present expected-absence count');
};

export function validateLifecycleResult(kind, input, expected = {}) {
  const value = parseResult(input);
  if ('ok' in value && value.ok !== true) requireOk(value);
  switch (kind) {
    case 'preflight':
      if (value.safe !== true) throw new Error('Preflight must report safe=true.');
      for (const key of ['projectId', 'origin', 'plannedAliases', 'plannedTeams']) requireExact(value[key], expected[key], `Preflight ${key}`);
      break;
    case 'seed':
      requireExact(value.state, expected.state, 'Seed state');
      if (expected.auth !== undefined) requireExact(value.counts?.auth, expected.auth, 'Seed Auth count');
      if (expected.firestore !== undefined) requireExact(value.counts?.firestore, expected.firestore, 'Seed Firestore count');
      break;
    case 'inspect':
      requireOk(value);
      validateInspect(value, expected);
      break;
    case 'transition':
      requireExact(value.alias, expected.alias, 'Transition alias');
      requireExact(value.state, expected.state, 'Transition state');
      break;
    case 'cleanup':
      requireOk(value);
      validateCleanup(value, expected);
      break;
    case 'probe':
      validateProbe(value, expected);
      break;
    case 'browser-sessions':
      if (!Array.isArray(value.sessions) || value.sessions.length !== 0) throw new Error('Lifecycle closure requires zero browser sessions.');
      break;
    case 'credential-removal':
    case 'workspace-removal':
      if (value.absent !== true) throw new Error(`${kind} must prove absence.`);
      break;
    default:
      throw new Error(`Unsupported lifecycle result kind: ${kind}.`);
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
    if (ids.has(row.contextId)) throw new Error(`Ledger contains duplicate context ID ${row.contextId}.`);
    ids.add(row.contextId);
    viewports.add(row.viewport);
    actualGroups.set(row.group, (actualGroups.get(row.group) ?? 0) + 1);
    if (row.result === 'PASS') actualTotals.pass += 1;
    else if (row.result === 'FAIL') actualTotals.fail += 1;
    else if (row.result === 'INCONCLUSIVE-HARNESS') actualTotals.inconclusive += 1;
    else throw new Error(`Ledger row ${index} has an unsupported result.`);
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
