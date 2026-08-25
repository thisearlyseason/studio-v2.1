import {
  PENDING_UNAVAILABLE_SENTINEL, REQUIRED_LEDGER_COLUMNS, REQUIRED_LOGOUT_STAGES,
  PROTECTED_PAGE_HEADINGS, ROUTE_SCENARIOS, SCENARIO_GROUP_COUNTS, VIEWPORTS, buildIsolationExpectation,
  validateActionWindow, validateIsolationResult, validateLogoutStages, validateRouteResult,
} from './scenario-contracts.mjs';
import { observeAction } from './signal-window.mjs';

const VIEWPORT_LABELS = Object.freeze(Object.fromEntries(Object.entries(VIEWPORTS)
  .map(([name, value]) => [name, `${value.width}x${value.height}`])));
const ROUTE_PATHS = Object.freeze(Object.keys(ROUTE_SCENARIOS));
const exact = (path, sentinel) => Object.freeze({ path, sentinel });
const DASHBOARD = exact('/dashboard', 'Dashboard');
const ONBOARDING = exact('/onboarding', 'Complete your profile');
const JOIN = exact('/teams/join', 'Join & Invite');
const allowed = sentinel => Object.freeze({ allowed: true, sentinel });

const ALIAS_CONTRACTS = Object.freeze({
  'qa-parent-a': { landing: DASHBOARD, routes: { '/family': allowed('Family Overview') } },
  'qa-adult-player-a': { landing: DASHBOARD, routes: {} },
  'qa-youth-active': { landing: DASHBOARD, routes: {} },
  'qa-league-creator': {
    landing: DASHBOARD,
    routes: {
      '/competition': allowed('Competition Hub'), '/dashboard/billing': allowed('Manage Your Plan'),
      '/coaches-corner': allowed('Coaches Corner'),
    },
  },
  'qa-school-admin': {
    landing: exact('/club', 'School Hub'),
    routes: {
      '/club': allowed('School Hub'), '/competition': allowed('Program League Hub'),
      '/dashboard/billing': allowed('Manage Your Plan'), '/coaches-corner': allowed('Coaches Corner'),
    },
  },
  'qa-superadmin': {
    landing: exact('/admin', 'Account Lookup'),
    routes: {
      '/admin': allowed('Account Lookup'), '/club': allowed('Club Hub'),
      '/competition': allowed('Competition Hub'), '/dashboard/billing': allowed('Manage Your Plan'),
      '/coaches-corner': allowed('Coaches Corner'), '/family': allowed('Family Overview'),
    },
  },
  'qa-fake-superadmin': { landing: DASHBOARD, routes: {} },
  'qa-missing-profile': { landing: ONBOARDING, deniedLanding: ONBOARDING, routes: {} },
  'qa-no-team': { landing: JOIN, deniedLanding: JOIN, routes: {} },
});

const ISOLATION_ALIASES = Object.freeze(['qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b']);
const LOGOUT_ALIASES = Object.freeze(['qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin']);
const PENDING_CASES = Object.freeze(['active-baseline', 'stale-session', 'fresh-login']);

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
    contextId: requireText(context.contextId, 'contextId'), alias: requireText(context.alias, 'alias'),
    viewport: requireText(context.viewport, 'viewport'), startState: requireText(context.startState, 'startState'),
    startUrl: requireText(context.startUrl, 'startUrl'),
  };
  if (!Object.values(VIEWPORT_LABELS).includes(validated.viewport)) throw new Error('viewport must be canonical.');
  if (!Object.hasOwn(SCENARIO_GROUP_COUNTS, group)) throw new Error('Scenario group is unsupported.');
  return validated;
};
const observe = values => observeAction(values);
const summarizeHttp = results => !Array.isArray(results) || results.length === 0
  ? 'none' : results.map(result => `${result.status}`).join(',');
const aggregateWindows = windows => {
  if (!Array.isArray(windows) || windows.length === 0) throw new Error('Scenario requires complete action windows.');
  const last = windows.at(-1);
  return {
    ...last,
    protectedRender: windows.some(window => window.protectedRender),
    protectedRequests: windows.reduce((sum, window) => sum + window.protectedRequests, 0),
    protectedListenerStarts: windows.reduce((sum, window) => sum + window.protectedListenerStarts, 0),
    relevantHttpResults: windows.flatMap(window => window.relevantHttpResults ?? []),
    pageErrors: windows.reduce((sum, window) => sum + window.pageErrors, 0),
    appConsoleErrors: windows.reduce((sum, window) => sum + window.appConsoleErrors, 0),
    unexpectedRequestFailures: windows.reduce((sum, window) => sum + window.unexpectedRequestFailures, 0),
    overflow: windows.reduce((sum, window) => sum + window.overflow, 0),
    renderSignals: windows.flatMap(window => window.renderSignals ?? []),
  };
};
const rowFromWindow = ({ context, group, action, expectedResult, window, visibleState, httpSummary, actionSummaries }) => {
  const row = {
    ...context, group, action, expectedResult, finalUrl: requireText(window.finalUrl, 'finalUrl'),
    visibleState: requireText(visibleState, 'visibleState'), sessionPresent: window.sessionPresent,
    protectedRequests: window.protectedRequests, protectedListenerStarts: window.protectedListenerStarts,
    relevantHttpDataResult: httpSummary ?? summarizeHttp(window.relevantHttpResults),
    pageErrors: window.pageErrors, appConsoleErrors: window.appConsoleErrors,
    unexpectedRequestFailures: window.unexpectedRequestFailures, overflow: window.overflow, result: 'PASS',
    ...(actionSummaries ? { actionSummaries: Object.freeze(actionSummaries.map(value => Object.freeze(value))) } : {}),
  };
  for (const column of REQUIRED_LEDGER_COLUMNS) {
    if (!(column in row) || row[column] === undefined || row[column] === null || row[column] === '') {
      throw new Error(`Scenario row is missing ${column}.`);
    }
  }
  return Object.freeze(row);
};

const validateLandingWindow = (window, landing) => {
  validateActionWindow(window);
  if (window.finalPath !== landing.path || !window.visibleSentinels.includes(landing.sentinel)) {
    throw new Error('Admission did not reach its exact landing path and heading.');
  }
  const finalProtectedHeadings = window.visibleSentinels.filter(sentinel => PROTECTED_PAGE_HEADINGS.includes(sentinel));
  const expectedFinalProtectedHeadings = PROTECTED_PAGE_HEADINGS.includes(landing.sentinel) ? [landing.sentinel] : [];
  if (
    finalProtectedHeadings.length !== expectedFinalProtectedHeadings.length
    || finalProtectedHeadings.some((sentinel, index) => sentinel !== expectedFinalProtectedHeadings[index])
  ) throw new Error('Admission final visible protected heading must exactly match the expected sentinel.');
  if (!window.sessionPresent) throw new Error('Admission landing requires an authenticated session.');
  if (window.protectedRender) {
    const signals = (window.renderSignals ?? []).filter(signal => (
      signal.kind === 'heading' && PROTECTED_PAGE_HEADINGS.includes(signal.sentinel)
    ));
    if (signals.length === 0 || signals.some(signal => signal.pathname !== landing.path || signal.sentinel !== landing.sentinel)) {
      throw new Error('Admission contains an unexpected protected render.');
    }
  }
};

const executeRoute = async ({ client, session, path, isAllowed, landing, sentinel, actions, stage }) => {
  const expected = isAllowed ? exact(path, sentinel) : landing;
  const window = await observe({
    client, session, stage,
    action: () => requireFunction(actions?.navigate, 'navigate')(path),
    terminal: () => requireFunction(actions?.waitForSentinel, 'waitForSentinel')(expected.sentinel),
  });
  validateRouteResult({
    allowed: isAllowed, requestedPath: path,
    expectedPath: expected.path, expectedSentinel: expected.sentinel, window,
  });
  return {
    window,
    summary: {
      stage, requestedPath: path, allowed: isAllowed, finalPath: window.finalPath,
      visibleSentinel: expected.sentinel, protectedRequests: window.protectedRequests,
      protectedListenerStarts: window.protectedListenerStarts,
    },
  };
};

export async function runRouteScenario({
  client, session, context: inputContext, path, allowed: isAllowed, landing, actions,
  group = 'admission-route', stage = 'admission-route', expectedSentinel,
} = {}) {
  const context = validateContext(inputContext, group);
  const requestedPath = requireText(path, 'route path');
  if (typeof isAllowed !== 'boolean') throw new Error('Route allowed must be an explicit boolean.');
  const result = await executeRoute({
    client, session: requireText(session, 'session'), path: requestedPath, isAllowed,
    landing: isAllowed ? undefined : exact(requireText(landing?.path, 'landing path'), requireText(landing?.sentinel, 'landing sentinel')),
    sentinel: isAllowed ? expectedSentinel ?? ROUTE_SCENARIOS[requestedPath]?.visibleSentinels[0] : undefined,
    actions, stage,
  });
  return rowFromWindow({
    context, group, action: `navigate ${requestedPath}`,
    expectedResult: isAllowed ? `allow ${requestedPath}` : `deny to ${landing.path}`,
    window: result.window, visibleState: result.summary.visibleSentinel, actionSummaries: [result.summary],
  });
}

export async function runAdmissionScenario({ client, session, context: inputContext, actions } = {}) {
  const context = validateContext(inputContext, 'admission-route');
  const contract = ALIAS_CONTRACTS[context.alias];
  if (!contract) throw new Error('Admission alias is not in the canonical Task 7 matrix.');
  const authenticatedSession = requireText(session, 'session');
  const loginWindow = await observe({
    client, session: authenticatedSession, stage: 'admission-login',
    action: () => requireFunction(actions?.loginAndLand, 'loginAndLand')(context.alias),
    terminal: () => requireFunction(actions?.waitForSentinel, 'waitForSentinel')(contract.landing.sentinel),
  });
  validateLandingWindow(loginWindow, contract.landing);
  const windows = [loginWindow];
  const summaries = [{
    stage: 'admission-login', requestedPath: '/login', allowed: true, finalPath: loginWindow.finalPath,
    visibleSentinel: contract.landing.sentinel, protectedRequests: loginWindow.protectedRequests,
    protectedListenerStarts: loginWindow.protectedListenerStarts,
  }];
  for (const path of ROUTE_PATHS) {
    const route = contract.routes[path];
    const result = await executeRoute({
      client, session: authenticatedSession, path, isAllowed: route?.allowed === true,
      landing: contract.deniedLanding ?? DASHBOARD, sentinel: route?.sentinel,
      actions, stage: `admission-route:${path}`,
    });
    windows.push(result.window);
    summaries.push(result.summary);
  }
  return rowFromWindow({
    context, group: 'admission-route', action: 'login and land, then validate 6 direct routes',
    expectedResult: 'exact admission landing and complete six-route policy', window: aggregateWindows(windows),
    visibleState: summaries.map(value => value.visibleSentinel).join('; '), actionSummaries: summaries,
  });
}

export async function runIsolationScenario({ client, session, context: inputContext, runId, actions } = {}) {
  const context = validateContext(inputContext, 'isolation');
  const expected = buildIsolationExpectation({ runId, alias: context.alias });
  const sameOriginGet = requireFunction(actions?.sameOriginGet, 'sameOriginGet');
  const firestoreGet = requireFunction(actions?.firestoreGet, 'firestoreGet');
  const waitForSettled = requireFunction(actions?.waitForSettled, 'waitForSettled');
  const authenticatedSession = requireText(session, 'session');
  const api = [], firestore = [], windows = [], summaries = [];
  for (const probe of expected.sameOriginApi) {
    let status;
    const window = await observe({
      client, session: authenticatedSession, stage: `isolation-${probe.label}`,
      action: async () => {
        status = await sameOriginGet(probe.target, { session: authenticatedSession, method: 'GET', credentials: 'same-origin' });
        if (!Number.isInteger(status)) throw new Error('Isolation API result must include the complete exact status set.');
      }, terminal: () => waitForSettled(probe.label),
    });
    validateActionWindow(window);
    api.push({ ...probe, status }); windows.push(window); summaries.push({ stage: probe.label, target: probe.target, status });
  }
  for (const probe of expected.directFirestore) {
    let status;
    const request = { label: probe.label, path: probe.path, expectedStatus: probe.status };
    const window = await observe({
      client, session: authenticatedSession, stage: `isolation-${probe.label}`,
      action: async () => {
        status = await firestoreGet(request, { session: authenticatedSession });
        if (!Number.isInteger(status)) throw new Error('Isolation must include the complete Firestore probe result set.');
      }, terminal: () => waitForSettled(probe.label),
    });
    validateActionWindow(window);
    firestore.push({ label: probe.label, path: probe.path, status }); windows.push(window);
    summaries.push({ stage: probe.label, path: probe.path, status });
  }
  const oppositeWindows = [windows[1], windows[3], windows[5]];
  validateIsolationResult({
    ...expected, sameOriginApi: api, directFirestore: firestore,
    oppositeProtectedRender: oppositeWindows.some(window => window.protectedRender),
    oppositeListenerStarts: oppositeWindows.reduce((sum, window) => sum + window.protectedListenerStarts, 0),
  });
  return rowFromWindow({
    context, group: 'isolation', action: 'probe own/opposite team and player boundaries',
    expectedResult: 'own 200; opposite 403', window: aggregateWindows(windows), visibleState: 'Isolation settled',
    httpSummary: summaries.map(value => value.status).join(','), actionSummaries: summaries,
  });
}

export async function runLogoutScenario({ client, session, freshSession, context: inputContext, actions } = {}) {
  const context = validateContext(inputContext, 'logout');
  const sharedSession = requireText(session, 'session');
  const isolatedSession = requireText(freshSession, 'freshSession');
  if (isolatedSession === sharedSession) throw new Error('freshSession must be distinct from the shared logout session.');
  const stages = [];
  for (const name of REQUIRED_LOGOUT_STAGES) {
    stages.push({
      name,
      window: await observe({
        client, session: sharedSession, stage: name, action: requireFunction(actions?.[name], name),
        terminal: () => requireFunction(actions?.waitForLogin, 'waitForLogin')(name),
      }),
    });
  }
  validateLogoutStages(stages);
  const freshWindow = await observe({
    client, session: isolatedSession, stage: 'fresh-isolated-unauthenticated',
    action: () => requireFunction(actions?.freshUnauthenticated, 'freshUnauthenticated')('/dashboard'),
    terminal: requireFunction(actions?.waitForFreshLogin, 'waitForFreshLogin'),
  });
  validateActionWindow(freshWindow, { kind: 'fresh-unauthenticated' });
  const summaries = [
    ...stages.map(value => ({ stage: value.name, finalPath: value.window.finalPath })),
    { stage: 'fresh-isolated-unauthenticated', finalPath: freshWindow.finalPath },
  ];
  return rowFromWindow({
    context, group: 'logout',
    action: 'logout, stale-tab reload, back, second reload, and fresh isolated unauthenticated check',
    expectedResult: 'login UI and no protected activity in all five actions',
    window: aggregateWindows([...stages.map(value => value.window), freshWindow]),
    visibleState: 'Sign In', actionSummaries: summaries,
  });
}

export async function runFreshUnauthenticatedScenario({ client, session, context: inputContext, actions } = {}) {
  const context = validateContext(inputContext, 'logout');
  const window = await observe({
    client, session: requireText(session, 'session'), stage: 'fresh-unauthenticated',
    action: () => requireFunction(actions?.navigate, 'navigate')('/dashboard'),
    terminal: requireFunction(actions?.waitForLogin, 'waitForLogin'),
  });
  validateActionWindow(window, { kind: 'fresh-unauthenticated' });
  return rowFromWindow({
    context, group: 'logout', action: 'fresh unauthenticated protected-route navigation',
    expectedResult: 'login UI with no protected activity', window, visibleState: 'Sign In',
    actionSummaries: [{ stage: 'fresh-unauthenticated', finalPath: window.finalPath }],
  });
}

const runPendingRevocation = async ({ client, session, context: inputContext, action, actions, stage, actionLabel, fresh }) => {
  const context = validateContext(inputContext, 'pending-deletion');
  const window = await observe({
    client, session: requireText(session, 'session'), stage, action: requireFunction(action, stage),
    terminal: async () => {
      await requireFunction(actions?.waitForLogin, 'waitForLogin')(stage, 'Sign In');
      if (fresh) await requireFunction(actions?.waitForUnavailable, 'waitForUnavailable')(stage, PENDING_UNAVAILABLE_SENTINEL);
    },
  });
  validateActionWindow(window, { kind: fresh ? 'pending-deletion-fresh' : 'pending-deletion-stale' });
  return rowFromWindow({
    context, group: 'pending-deletion', action: actionLabel,
    expectedResult: fresh
      ? 'login UI with generic unavailable message and no protected activity'
      : 'login UI with no session or protected activity after revocation',
    window, visibleState: fresh ? PENDING_UNAVAILABLE_SENTINEL : 'Sign In',
    actionSummaries: [{ stage, finalPath: window.finalPath }],
  });
};

export async function runPendingDeletionScenario(options = {}) {
  const scenario = options.scenario ?? 'fresh-login';
  if (!PENDING_CASES.includes(scenario)) throw new Error('Unsupported pending-deletion scenario.');
  if (options.context?.alias !== 'qa-pending-delete') throw new Error('Pending-deletion scenario requires qa-pending-delete.');
  if (scenario === 'active-baseline') {
    const context = validateContext(options.context, 'pending-deletion');
    const window = await observe({
      client: options.client, session: requireText(options.session, 'session'), stage: 'pending-deletion-active-baseline',
      action: () => requireFunction(options.actions?.navigate, 'navigate')('/dashboard'),
      terminal: requireFunction(options.actions?.waitForDashboard, 'waitForDashboard'),
    });
    validateLandingWindow(window, DASHBOARD);
    return rowFromWindow({
      context, group: 'pending-deletion', action: 'record active pending-delete baseline',
      expectedResult: 'Dashboard with active session before transition', window, visibleState: 'Dashboard',
      actionSummaries: [{ stage: 'pending-deletion-active-baseline', finalPath: window.finalPath }],
    });
  }
  return runPendingRevocation({
    ...options, stage: `pending-deletion-${scenario}`,
    fresh: scenario === 'fresh-login',
    action: scenario === 'stale-session' ? options.actions?.reloadRevokedSession : options.actions?.freshLogin,
    actionLabel: scenario === 'stale-session'
      ? 'reload pre-transition session after pending deletion' : 'fresh pending-deletion login',
  });
}

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
    for (const [alias, contract] of Object.entries(ALIAS_CONTRACTS)) rows.push({
      contextId: `admission-route-${alias}-${viewportName}`, group: 'admission-route', alias, viewport, viewportName,
      startState: 'fresh-context', startUrl: 'about:blank', landing: contract.landing,
      routeExpectations: ROUTE_PATHS.map(requestedPath => {
        const route = contract.routes[requestedPath];
        const outcome = route?.allowed === true
          ? exact(requestedPath, route.sentinel)
          : contract.deniedLanding ?? DASHBOARD;
        return Object.freeze({ requestedPath, allowed: route?.allowed === true, ...outcome });
      }),
    });
    for (const alias of ISOLATION_ALIASES) rows.push({
      contextId: `isolation-${alias}-${viewportName}`, group: 'isolation', alias, viewport, viewportName,
      startState: 'authenticated', startUrl: 'about:blank',
    });
    for (const alias of LOGOUT_ALIASES) rows.push({
      contextId: `logout-${alias}-${viewportName}`, group: 'logout', alias, viewport, viewportName,
      startState: 'authenticated-two-tab', startUrl: 'about:blank',
    });
    for (const scenario of PENDING_CASES) rows.push({
      contextId: `pending-deletion-${scenario}-${viewportName}`, group: 'pending-deletion', alias: 'qa-pending-delete',
      viewport, viewportName, startState: scenario === 'active-baseline' ? 'active' : 'pending_deletion',
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
