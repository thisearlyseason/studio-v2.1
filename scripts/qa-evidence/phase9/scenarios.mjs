import {
  PENDING_UNAVAILABLE_SENTINEL,
  REQUIRED_LEDGER_COLUMNS,
  REQUIRED_LOGOUT_STAGES,
  ROUTE_SCENARIOS,
  SCENARIO_GROUP_COUNTS,
  VIEWPORTS,
  buildIsolationExpectation,
  validateActionWindow,
  validateIsolationResult,
  validateLogoutStages,
  validateRouteResult,
} from './scenario-contracts.mjs';
import { observeAction } from './signal-window.mjs';

const VIEWPORT_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(VIEWPORTS).map(([name, value]) => [name, `${value.width}x${value.height}`]),
));

const requireText = (value, name) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} is required.`);
  return value;
};

const requireFunction = (value, name) => {
  if (typeof value !== 'function') throw new Error(`${name} action is required.`);
  return value;
};

const validateContext = (context, group) => {
  if (!context || typeof context !== 'object' || Array.isArray(context)) throw new Error('Scenario context is required.');
  const validated = {
    contextId: requireText(context.contextId, 'contextId'),
    alias: requireText(context.alias, 'alias'),
    viewport: requireText(context.viewport, 'viewport'),
    startState: requireText(context.startState, 'startState'),
    startUrl: requireText(context.startUrl, 'startUrl'),
  };
  if (!Object.values(VIEWPORT_LABELS).includes(validated.viewport)) throw new Error('viewport must be canonical.');
  if (!Object.hasOwn(SCENARIO_GROUP_COUNTS, group)) throw new Error('Scenario group is unsupported.');
  return validated;
};

const summarizeHttp = results => {
  if (!Array.isArray(results) || results.length === 0) return 'none';
  return results.map(result => `${result.status}`).join(',');
};

const rowFromWindow = ({ context, group, action, expectedResult, window, visibleState, httpSummary }) => {
  const row = {
    ...context,
    group,
    action,
    expectedResult,
    finalUrl: requireText(window.finalUrl, 'finalUrl'),
    visibleState: requireText(visibleState, 'visibleState'),
    sessionPresent: window.sessionPresent,
    protectedRequests: window.protectedRequests,
    protectedListenerStarts: window.protectedListenerStarts,
    relevantHttpDataResult: httpSummary ?? summarizeHttp(window.relevantHttpResults),
    pageErrors: window.pageErrors,
    appConsoleErrors: window.appConsoleErrors,
    unexpectedRequestFailures: window.unexpectedRequestFailures,
    overflow: window.overflow,
    result: 'PASS',
  };
  for (const column of REQUIRED_LEDGER_COLUMNS) {
    if (!(column in row) || row[column] === undefined || row[column] === null || row[column] === '') {
      throw new Error(`Scenario row is missing ${column}.`);
    }
  }
  return Object.freeze(row);
};

const observe = ({ client, session, stage, action, terminal }) => observeAction({
  client,
  session,
  stage,
  action,
  terminal,
});

export async function runRouteScenario({
  client,
  session,
  context: inputContext,
  path,
  allowed,
  landing,
  actions,
  group = 'admission-route',
  stage = 'admission-route',
} = {}) {
  const context = validateContext(inputContext, group);
  const requestedPath = requireText(path, 'route path');
  if (typeof allowed !== 'boolean') throw new Error('Route allowed must be an explicit boolean.');
  const navigate = requireFunction(actions?.navigate, 'navigate');
  const expected = allowed
    ? { path: requestedPath, sentinel: ROUTE_SCENARIOS[requestedPath]?.visibleSentinel }
    : { path: requireText(landing?.path, 'landing path'), sentinel: requireText(landing?.sentinel, 'landing sentinel') };
  if (allowed && !expected.sentinel) throw new Error('Allowed route requires its configured accessible sentinel.');
  const waitForSentinel = requireFunction(actions?.waitForSentinel, 'waitForSentinel');
  const window = await observe({
    client,
    session: requireText(session, 'session'),
    stage,
    action: () => navigate(requestedPath),
    terminal: () => waitForSentinel(expected.sentinel),
  });
  validateRouteResult({
    allowed,
    expectedPath: expected.path,
    expectedSentinel: expected.sentinel,
    window,
  });
  return rowFromWindow({
    context,
    group,
    action: `navigate ${requestedPath}`,
    expectedResult: allowed ? `allow ${expected.path}` : `deny to ${expected.path}`,
    window,
    visibleState: expected.sentinel,
  });
}

export function runAdmissionScenario(options = {}) {
  return runRouteScenario({ ...options, group: 'admission-route', stage: 'admission-route' });
}

export async function runIsolationScenario({ client, session, context: inputContext, runId, actions } = {}) {
  const context = validateContext(inputContext, 'isolation');
  const expected = buildIsolationExpectation({ runId, alias: context.alias });
  const sameOriginGet = requireFunction(actions?.sameOriginGet, 'sameOriginGet');
  const firestoreGet = requireFunction(actions?.firestoreGet, 'firestoreGet');
  const waitForSettled = requireFunction(actions?.waitForSettled, 'waitForSettled');
  const authenticatedSession = requireText(session, 'session');
  const api = [];
  const firestore = [];
  const windows = [];

  for (const probe of expected.sameOriginApi) {
    let status;
    const window = await observe({
      client,
      session: authenticatedSession,
      stage: `isolation-${probe.label}`,
      action: async () => {
        status = await sameOriginGet(probe.target, {
          session: authenticatedSession,
          method: 'GET',
          credentials: 'same-origin',
        });
        if (!Number.isInteger(status)) throw new Error('Isolation API result must include the complete exact status set.');
      },
      terminal: () => waitForSettled(probe.label),
    });
    validateActionWindow(window);
    api.push({ ...probe, status });
    windows.push(window);
  }

  for (const probe of expected.directFirestore) {
    let status;
    const request = { label: probe.label, path: probe.path, expectedStatus: probe.status };
    const window = await observe({
      client,
      session: authenticatedSession,
      stage: `isolation-${probe.label}`,
      action: async () => {
        status = await firestoreGet(request, { session: authenticatedSession });
        if (!Number.isInteger(status)) throw new Error('Isolation must include the complete Firestore probe result set.');
      },
      terminal: () => waitForSettled(probe.label),
    });
    validateActionWindow(window);
    firestore.push({ label: probe.label, path: probe.path, status });
    windows.push(window);
  }

  const oppositeWindows = [windows[1], windows[3], windows[5]];
  validateIsolationResult({
    ...expected,
    sameOriginApi: api,
    directFirestore: firestore,
    oppositeProtectedRender: oppositeWindows.some(window => window.protectedRender),
    oppositeListenerStarts: oppositeWindows.reduce((sum, window) => sum + window.protectedListenerStarts, 0),
  });
  const last = windows.at(-1);
  return rowFromWindow({
    context,
    group: 'isolation',
    action: 'probe own/opposite team and player boundaries',
    expectedResult: 'own 200; opposite 403',
    window: last,
    visibleState: last.visibleSentinels[0] || 'Isolation settled',
    httpSummary: 'api 200/403; firestore 200/403/200/403',
  });
}

export async function runLogoutScenario({ client, session, context: inputContext, actions } = {}) {
  const context = validateContext(inputContext, 'logout');
  const stages = [];
  for (const name of REQUIRED_LOGOUT_STAGES) {
    const action = requireFunction(actions?.[name], name);
    const waitForLogin = requireFunction(actions?.waitForLogin, 'waitForLogin');
    stages.push({
      name,
      window: await observe({
        client,
        session: requireText(session, 'session'),
        stage: name,
        action,
        terminal: () => waitForLogin(name),
      }),
    });
  }
  validateLogoutStages(stages);
  const last = stages.at(-1).window;
  return rowFromWindow({
    context,
    group: 'logout',
    action: 'logout, stale-tab reload, back, second reload',
    expectedResult: 'login UI and no protected activity in every stage',
    window: last,
    visibleState: 'Sign In',
  });
}

const runRevokedScenario = async ({ client, session, context: inputContext, actions, kind, stage, actionLabel }) => {
  const context = validateContext(inputContext, kind === 'pending-deletion' ? 'pending-deletion' : 'logout');
  const navigate = requireFunction(actions?.navigate, 'navigate');
  const waitForLogin = requireFunction(actions?.waitForLogin, 'waitForLogin');
  const window = await observe({
    client,
    session: requireText(session, 'session'),
    stage,
    action: () => navigate('/dashboard'),
    terminal: waitForLogin,
  });
  validateActionWindow(window, { kind });
  return rowFromWindow({
    context,
    group: kind === 'pending-deletion' ? 'pending-deletion' : 'logout',
    action: actionLabel,
    expectedResult: 'login UI with no protected activity',
    window,
    visibleState: kind === 'pending-deletion' ? PENDING_UNAVAILABLE_SENTINEL : 'Sign In',
  });
};

export function runFreshUnauthenticatedScenario(options = {}) {
  return runRevokedScenario({
    ...options,
    kind: 'fresh-unauthenticated',
    stage: 'fresh-unauthenticated',
    actionLabel: 'fresh unauthenticated protected-route navigation',
  });
}

export async function runPendingDeletionScenario(options = {}) {
  const scenario = options.scenario ?? 'fresh-login';
  if (!PENDING_CASES.includes(scenario)) throw new Error('Unsupported pending-deletion scenario.');
  if (options.context?.alias !== 'qa-pending-delete') throw new Error('Pending-deletion scenario requires qa-pending-delete.');
  if (scenario === 'active-baseline') {
    const context = validateContext(options.context, 'pending-deletion');
    const navigate = requireFunction(options.actions?.navigate, 'navigate');
    const waitForDashboard = requireFunction(options.actions?.waitForDashboard, 'waitForDashboard');
    const window = await observe({
      client: options.client,
      session: requireText(options.session, 'session'),
      stage: 'pending-deletion-active-baseline',
      action: () => navigate('/dashboard'),
      terminal: waitForDashboard,
    });
    validateActionWindow(window);
    if (window.finalPath !== '/dashboard' || !window.visibleSentinels.includes('Dashboard') || !window.sessionPresent) {
      throw new Error('Active pending-deletion baseline must reach Dashboard with an active session.');
    }
    return rowFromWindow({
      context,
      group: 'pending-deletion',
      action: 'record active pending-delete baseline',
      expectedResult: 'Dashboard with active session before transition',
      window,
      visibleState: 'Dashboard',
    });
  }
  return runRevokedScenario({
    ...options,
    kind: 'pending-deletion',
    stage: `pending-deletion-${scenario}`,
    actionLabel: scenario === 'stale-session'
      ? 'reload pre-transition session after pending deletion'
      : 'fresh pending-deletion login',
  });
}

const ADMISSION_ROUTE_CASES = Object.freeze([
  { alias: 'qa-parent-a', path: '/family', allowed: true },
  { alias: 'qa-adult-player-a', path: '/coaches-corner', allowed: false, landing: { path: '/dashboard', sentinel: 'Dashboard' } },
  { alias: 'qa-youth-active', path: '/coaches-corner', allowed: false, landing: { path: '/dashboard', sentinel: 'Dashboard' } },
  { alias: 'qa-league-creator', path: '/competition', allowed: true },
  { alias: 'qa-school-admin', path: '/club', allowed: true },
  { alias: 'qa-superadmin', path: '/admin', allowed: true },
  { alias: 'qa-fake-superadmin', path: '/admin', allowed: false, landing: { path: '/dashboard', sentinel: 'Dashboard' } },
  { alias: 'qa-missing-profile', path: '/family', allowed: false, landing: { path: '/login', sentinel: 'Sign In' } },
  { alias: 'qa-no-team', path: '/coaches-corner', allowed: false, landing: { path: '/dashboard', sentinel: 'Dashboard' } },
]);

const ISOLATION_ALIASES = Object.freeze([
  'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b',
]);
const LOGOUT_ALIASES = Object.freeze([
  'qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
]);
const PENDING_CASES = Object.freeze(['active-baseline', 'stale-session', 'fresh-login']);

export function buildCanonicalScenarioPlan(options = {}) {
  if (options.contextIds !== undefined) {
    if (!Array.isArray(options.contextIds)) throw new Error('contextIds must be an array.');
    const ids = new Set();
    for (const id of options.contextIds) {
      requireText(id, 'contextId');
      if (ids.has(id)) throw new Error(`Duplicate context ID ${id}.`);
      ids.add(id);
    }
  }
  const rows = [];
  for (const [viewportName, viewport] of Object.entries(VIEWPORT_LABELS)) {
    for (const entry of ADMISSION_ROUTE_CASES) rows.push({
      contextId: `admission-route-${entry.alias}-${viewportName}`,
      group: 'admission-route',
      viewport,
      viewportName,
      startState: 'fresh-context',
      startUrl: 'about:blank',
      ...entry,
    });
    for (const alias of ISOLATION_ALIASES) rows.push({
      contextId: `isolation-${alias}-${viewportName}`,
      group: 'isolation', alias, viewport, viewportName, startState: 'authenticated', startUrl: 'about:blank',
    });
    for (const alias of LOGOUT_ALIASES) rows.push({
      contextId: `logout-${alias}-${viewportName}`,
      group: 'logout', alias, viewport, viewportName, startState: 'authenticated-two-tab', startUrl: 'about:blank',
    });
    for (const scenario of PENDING_CASES) rows.push({
      contextId: `pending-deletion-${scenario}-${viewportName}`,
      group: 'pending-deletion', alias: 'qa-pending-delete', viewport, viewportName,
      startState: scenario === 'active-baseline' ? 'active' : 'pending_deletion',
      startUrl: 'about:blank', scenario,
    });
  }
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.contextId)) throw new Error(`Duplicate context ID ${row.contextId}.`);
    ids.add(row.contextId);
  }
  if (rows.length !== Object.values(SCENARIO_GROUP_COUNTS).reduce((sum, count) => sum + count, 0)) {
    throw new Error('Canonical scenario plan arithmetic is incomplete.');
  }
  return Object.freeze(rows.map(row => Object.freeze(row)));
}
