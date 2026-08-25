import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ISOLATION_SCENARIOS,
  REQUIRED_LOGOUT_STAGES,
  ROUTE_SCENARIOS,
  VIEWPORTS,
  validateActionWindow,
  validateIsolationResult,
  validateLedger,
  validateLifecycleResult,
  validateLogoutStages,
  validateRouteResult,
} from '../scripts/qa-evidence/phase9/scenario-contracts.mjs';

const safeWindow = overrides => ({
  terminalReached: true,
  loadingVisible: false,
  finalPath: '/family',
  visibleSentinels: ['Family Overview'],
  sessionPresent: true,
  protectedRender: false,
  protectedRequests: 0,
  protectedListenerStarts: 0,
  pageErrors: 0,
  appConsoleErrors: 0,
  unexpectedRequestFailures: 0,
  overflow: 0,
  ...overrides,
});

const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';

const ledgerRow = (contextId, group, viewport = '390x844') => ({
  contextId,
  group,
  alias: 'qa-parent-a',
  viewport,
  startState: 'active',
  startUrl: 'about:blank',
  action: 'navigate',
  expectedResult: 'allowed',
  finalUrl: `${STAGING_ORIGIN}/family`,
  visibleState: 'Family Overview',
  sessionPresent: true,
  protectedRequests: 0,
  protectedListenerStarts: 0,
  relevantHttpDataResult: 'none',
  pageErrors: 0,
  appConsoleErrors: 0,
  unexpectedRequestFailures: 0,
  overflow: 0,
  result: 'PASS',
});

test('phase 9 evidence contracts expose exact immutable scenario definitions', () => {
  assert.deepEqual(VIEWPORTS, {
    mobile: { width: 390, height: 844 },
    desktop: { width: 1440, height: 900 },
  });
  assert.deepEqual(Object.fromEntries(Object.entries(ROUTE_SCENARIOS).map(([path, value]) => [path, value.visibleSentinel])), {
    '/admin': 'Admin',
    '/club': 'Club/School Hub',
    '/competition': 'Competition Hub',
    '/dashboard/billing': 'Billing',
    '/coaches-corner': 'Coaches Corner',
    '/family': 'Family Overview',
  });
  assert.equal(ISOLATION_SCENARIOS.team.endpoint, '/api/teams/chat');
  assert.equal(ISOLATION_SCENARIOS.team.parameter, 'teamId');
  assert.deepEqual(REQUIRED_LOGOUT_STAGES, [
    'logout-tab',
    'stale-tab-reload',
    'stale-tab-back',
    'stale-tab-second-reload',
  ]);
  assert.equal(Object.isFrozen(VIEWPORTS), true);
  assert.equal(Object.isFrozen(VIEWPORTS.mobile), true);
});

test('phase 9 evidence contracts reject incomplete and vacuous action windows', () => {
  assert.throws(() => validateActionWindow({}), /terminalReached/i);
  assert.throws(() => validateActionWindow(safeWindow({ terminalReached: false })), /terminal/i);
  assert.throws(() => validateActionWindow(safeWindow({ loadingVisible: true })), /loading/i);
  assert.throws(() => validateActionWindow(safeWindow({ protectedRequests: undefined })), /protectedRequests/i);
  assert.throws(() => validateActionWindow(safeWindow({ pageErrors: -1 })), /pageErrors/i);
  assert.throws(() => validateActionWindow(safeWindow({ appConsoleErrors: 1 })), /application console/i);
  assert.throws(() => validateActionWindow(safeWindow({ unexpectedRequestFailures: 1 })), /request failure/i);
  assert.throws(() => validateActionWindow(safeWindow({ overflow: 1 })), /overflow/i);
  assert.equal(validateActionWindow(safeWindow()).finalPath, '/family');
});

test('phase 9 evidence contracts require path and visible readiness for allowed routes', () => {
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/family', visibleSentinels: [] }),
  }), /visible sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/dashboard' }),
  }), /pathname/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Unrelated heading',
    window: safeWindow({ visibleSentinels: ['Unrelated heading'] }),
  }), /configured route sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ loadingVisible: true }),
  }), /loading/i);
  assert.equal(validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow(),
  }).pass, true);
});

test('phase 9 evidence contracts reject every denied-route transient signal', () => {
  const input = overrides => ({
    allowed: false,
    expectedPath: '/dashboard',
    expectedSentinel: 'Dashboard',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Dashboard'], sessionPresent: true, ...overrides }),
  });
  assert.throws(() => validateRouteResult(input({ protectedRender: true })), /protected render/i);
  assert.throws(() => validateRouteResult(input({ protectedRequests: 1 })), /protected request/i);
  assert.throws(() => validateRouteResult(input({ protectedListenerStarts: 1 })), /protected listener/i);
  assert.equal(validateRouteResult(input({})).pass, true);
});

test('phase 9 evidence contracts require symmetric real-consumer isolation', () => {
  const safe = overrides => ({
    endpoint: '/api/teams/chat',
    parameter: 'teamId',
    ownApiStatus: 200,
    oppositeApiStatus: 403,
    directFirestore: [
      { label: 'own-team', status: 200 },
      { label: 'opposite-team', status: 403 },
      { label: 'own-player', status: 200 },
      { label: 'opposite-player', status: 403 },
    ],
    oppositeProtectedRender: false,
    oppositeListenerStarts: 0,
    ...overrides,
  });
  assert.equal(validateIsolationResult(safe()).pass, true);
  assert.throws(() => validateIsolationResult(safe({ endpoint: '/team' })), /same-origin endpoint/i);
  assert.throws(() => validateIsolationResult(safe({ ownApiStatus: 403 })), /own API.*200/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeApiStatus: 200 })), /opposite API.*403/i);
  assert.throws(() => validateIsolationResult(safe({ directFirestore: safe().directFirestore.slice(0, 3) })), /Firestore probe/i);
  assert.throws(() => validateIsolationResult(safe({
    directFirestore: safe().directFirestore.map(item => item.label === 'opposite-player' ? { ...item, status: 200 } : item),
  })), /opposite-player.*403/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeProtectedRender: true })), /opposite protected render/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeListenerStarts: 1 })), /opposite listener/i);
});

test('phase 9 evidence contracts validate all ordered logout stages independently', () => {
  const safeStage = name => ({
    name,
    window: safeWindow({
      finalPath: '/login',
      visibleSentinels: ['Sign In'],
      sessionPresent: false,
    }),
  });
  const stages = REQUIRED_LOGOUT_STAGES.map(safeStage);
  assert.equal(validateLogoutStages(stages).pass, true);
  assert.throws(() => validateLogoutStages(stages.slice(1)), /every logout stage/i);
  assert.throws(() => validateLogoutStages(stages.map((stage, index) => index === 1
    ? { ...stage, name: 'stale-tab-back' }
    : stage)), /out of order/i);
  for (const [field, value, message] of [
    ['protectedRender', true, /protected render/i],
    ['protectedRequests', 1, /protected request/i],
    ['protectedListenerStarts', 1, /protected listener/i],
    ['sessionPresent', true, /session/i],
  ]) {
    assert.throws(() => validateLogoutStages(stages.map((stage, index) => index === 2
      ? { ...stage, window: { ...stage.window, [field]: value } }
      : stage)), message);
  }
});

test('phase 9 evidence contracts reject transient signals for fresh and pending revocation windows', () => {
  for (const kind of ['fresh-unauthenticated', 'pending-deletion']) {
    const visibleSentinels = kind === 'pending-deletion'
      ? ['Sign In', 'The email or password is incorrect, or this account is unavailable.']
      : ['Sign In'];
    const base = safeWindow({ finalPath: '/login', visibleSentinels, sessionPresent: false });
    assert.equal(validateActionWindow(base, { kind }).pass, true);
    assert.throws(() => validateActionWindow({ ...base, finalPath: '/dashboard' }, { kind }), /\/login/i);
    assert.throws(() => validateActionWindow({ ...base, visibleSentinels: [] }, { kind }), /Sign In/i);
    if (kind === 'pending-deletion') {
      assert.throws(() => validateActionWindow({ ...base, visibleSentinels: ['Sign In'] }, { kind }), /account is unavailable/i);
    }
    assert.throws(() => validateActionWindow({ ...base, protectedRender: true }, { kind }), /protected render/i);
    assert.throws(() => validateActionWindow({ ...base, protectedRequests: 1 }, { kind }), /protected request/i);
    assert.throws(() => validateActionWindow({ ...base, protectedListenerStarts: 1 }, { kind }), /protected listener/i);
    assert.throws(() => validateActionWindow({ ...base, sessionPresent: true }, { kind }), /session/i);
  }
});

test('phase 9 evidence contracts validate lifecycle JSON and fail closed', () => {
  assert.equal(validateLifecycleResult('preflight', JSON.stringify({
    safe: true,
    projectId: 'the-squad-v2-staging',
    origin: STAGING_ORIGIN,
    manifestVersion: 3,
    plannedAliases: 20,
    plannedTeams: 3,
  }), {
    projectId: 'the-squad-v2-staging',
    origin: STAGING_ORIGIN,
    manifestVersion: 3,
    plannedAliases: 20,
    plannedTeams: 3,
  }).pass, true);
  assert.throws(() => validateLifecycleResult('preflight', {
    safe: true, projectId: undefined, origin: undefined, manifestVersion: undefined, plannedAliases: undefined, plannedTeams: undefined,
  }, {}), /expected.*projectId/i);
  assert.throws(() => validateLifecycleResult('preflight', {
    safe: true, projectId: 'wrong', origin: 'https://wrong.invalid', manifestVersion: 2, plannedAliases: 1, plannedTeams: 1,
  }, {
    projectId: 'wrong', origin: 'https://wrong.invalid', manifestVersion: 2, plannedAliases: 1, plannedTeams: 1,
  }), /canonical preflight/i);
  assert.throws(() => validateLifecycleResult('preflight', {
    safe: true, projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN, plannedAliases: 20, plannedTeams: 3,
  }, {
    projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN, manifestVersion: 3, plannedAliases: 20, plannedTeams: 3,
  }), /manifestVersion/i);
  assert.throws(() => validateLifecycleResult('seed', '{'), /valid JSON/i);
  assert.throws(() => validateLifecycleResult('inspect', { ok: false }), /ok=true/i);
  assert.equal(validateLifecycleResult('seed', {
    state: 'seeded', counts: { auth: 20, firestore: 82 },
  }, { state: 'seeded', auth: 20, firestore: 82 }).pass, true);
  assert.throws(() => validateLifecycleResult('seed', {
    state: 'seeded', counts: { auth: 20 },
  }, { state: 'seeded', auth: 20, firestore: 82 }), /Firestore count/i);
  assert.throws(() => validateLifecycleResult('transition', {
    state: 'pending_deletion',
  }, { alias: 'qa-pending-delete', state: 'pending_deletion' }), /alias/i);
  assert.throws(() => validateLifecycleResult('transition', {
    alias: 'qa-pending-delete', state: 'pending_deletion',
  }, {}), /expected.*alias/i);
  assert.throws(() => validateLifecycleResult('transition', {
    alias: 'qa-suspended', state: 'suspended',
  }, { alias: 'qa-suspended', state: 'suspended' }), /canonical pending-deletion transition/i);

  const inspect = {
    ok: true,
    states: { manifest: 'seeded', problems: 0 },
    drift: [],
    counts: {
      expected: { auth: 20, firestore: 82 },
      actualPresent: { auth: 20, firestore: 82 },
    },
  };
  assert.equal(validateLifecycleResult('inspect', inspect, {
    state: 'seeded', auth: 20, firestore: 82, actualAuth: 20, actualFirestore: 82,
  }).pass, true);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, drift: ['one'] }, {
    state: 'seeded', auth: 20, firestore: 82, actualAuth: 20, actualFirestore: 82,
  }), /drift/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, states: { manifest: 'seeded', problems: 1 } }, {
    state: 'seeded', auth: 20, firestore: 82, actualAuth: 20, actualFirestore: 82,
  }), /problems/i);

  const cleanup = {
    ok: true,
    retained: [],
    deleted: { auth: 20, firestore: 82 },
    followUp: {
      retained: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
      failures: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
    },
  };
  assert.equal(validateLifecycleResult('cleanup', cleanup, { auth: 20, firestore: 82 }).pass, true);
  assert.throws(() => validateLifecycleResult('cleanup', { ...cleanup, retained: ['one'] }, { auth: 20, firestore: 82 }), /retained/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup,
    followUp: { ...cleanup.followUp, failures: { ...cleanup.followUp.failures, auth: { count: 1, aliases: ['one'] } } },
  }, { auth: 20, firestore: 82 }), /failures/i);

  const probe = {
    checkedAuth: 20,
    checkedFirestore: 82,
    checkedExpectedAbsent: 1,
    authPresent: 0,
    firestorePresent: 0,
    expectedAbsentPresent: 0,
  };
  assert.equal(validateLifecycleResult('probe', probe, { auth: 20, firestore: 82, expectedAbsent: 1 }).pass, true);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedExpectedAbsent: 0 }, {
    auth: 20, firestore: 82, expectedAbsent: 1,
  }), /expected-absence/i);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedAuth: undefined }, {
    auth: 20, firestore: 82, expectedAbsent: 1,
  }), /checked Auth/i);
  assert.throws(() => validateLifecycleResult('probe', probe, {}), /expected.*Auth/i);
  assert.throws(() => validateLifecycleResult('probe', {
    ...probe, checkedAuth: 1, checkedFirestore: 1, checkedExpectedAbsent: 0,
  }, { auth: 1, firestore: 1, expectedAbsent: 0 }), /canonical fixture graph/i);
  assert.equal(validateLifecycleResult('browser-sessions', { sessions: [] }, {}).pass, true);
  assert.throws(() => validateLifecycleResult('browser-sessions', { sessions: ['open'] }, {}), /zero browser sessions/i);
});

test('phase 9 evidence contracts reject missing duplicate and arithmetically false ledger rows', () => {
  const groupCounts = {
    'admission-route': 18,
    isolation: 10,
    logout: 10,
    'pending-deletion': 6,
  };
  const rows = Object.entries(groupCounts).flatMap(([group, count], groupIndex) => Array.from({ length: count }, (_, index) =>
    ledgerRow(`${group}-${index}`, group, (groupIndex + index) % 2 === 0 ? '390x844' : '1440x900')));
  const expected = { groupCounts, totals: { total: 44, pass: 44, fail: 0, inconclusive: 0 } };
  assert.equal(validateLedger(rows, expected).pass, true);
  assert.throws(() => validateLedger(rows.map((row, index) => index === 1 ? { ...row, contextId: rows[0].contextId } : row), expected), /duplicate context/i);
  const missing = { ...rows[0] };
  delete missing.visibleState;
  assert.throws(() => validateLedger([missing, ...rows.slice(1)], expected), /visibleState/i);
  assert.throws(() => validateLedger(rows.slice(1), expected), /group count|total/i);
  assert.throws(() => validateLedger(rows, { ...expected, totals: { ...expected.totals, pass: 43 } }), /arithmetic/i);
  for (const [field, value, message] of [
    ['contextId', 7, /contextId/i],
    ['alias', 7, /alias/i],
    ['viewport', '800x600', /viewport/i],
    ['startState', false, /startState/i],
    ['startUrl', 7, /startUrl/i],
    ['action', [], /action/i],
    ['expectedResult', null, /expectedResult/i],
    ['finalUrl', '/family', /absolute canonical finalUrl/i],
    ['finalUrl', 'https://example.com/family', /canonical staging origin/i],
    ['visibleState', {}, /visibleState/i],
    ['sessionPresent', 'present', /sessionPresent/i],
    ['protectedRequests', -1, /protectedRequests/i],
    ['protectedListenerStarts', 0.5, /protectedListenerStarts/i],
    ['relevantHttpDataResult', false, /relevantHttpDataResult/i],
    ['pageErrors', '0', /pageErrors/i],
    ['appConsoleErrors', -1, /appConsoleErrors/i],
    ['unexpectedRequestFailures', null, /unexpectedRequestFailures/i],
    ['overflow', -1, /overflow/i],
    ['result', 'BLOCKED', /result/i],
  ]) {
    assert.throws(() => validateLedger(rows.map((row, index) => index === 0 ? { ...row, [field]: value } : row), expected), message);
  }
  assert.throws(() => validateLedger(rows.slice(0, 18), {
    groupCounts: { 'admission-route': 18 },
    totals: { total: 18, pass: 18, fail: 0, inconclusive: 0 },
  }), /canonical group arithmetic/i);
});
