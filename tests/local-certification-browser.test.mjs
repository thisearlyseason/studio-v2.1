import assert from 'node:assert/strict';
import test from 'node:test';

import { createBrowserClient } from '../scripts/qa/certification/local/browser.mjs';

function clientWithResult(result, overrides = {}) {
  const calls = [];
  let closeCalls = 0;
  const client = createBrowserClient({
    cliPath: '/tmp/playwright-cli',
    run: async input => {
      calls.push(input);
      if (input.args.includes('close')) closeCalls += 1;
      if (input.args.includes('close-all')) closeCalls += 1;
      return typeof result === 'function' ? result(input) : JSON.stringify(result);
    },
    baseUrl: 'http://127.0.0.1:9001',
    runId: 'final-cert-t3-browser-a1',
    batch: 'identity',
    artifactsDir: '/tmp/task3-browser-artifacts',
    emailForAlias: alias => `${alias}@phase2.test`,
    secretForAlias: () => 'runtime-secret-never-report',
    ...overrides,
  });
  return { client, calls, closeCalls: () => closeCalls };
}

const cleanObservation = {
  requestedPath: '/dashboard',
  actualPath: '/dashboard',
  status: 200,
  fitsViewport: true,
  applicationErrors: [],
  consoleErrors: [],
  failedResponses: [],
  redirects: [],
};

test('browser sessions use the exact run and identity prefix', () => {
  const { client } = clientWithResult(cleanObservation);
  assert.equal(client.sessionName('owner'), 'cert-final-cert-t3-browser-a1-identity-owner');
  assert.equal(client.sessionName('Owner unsafe/label'), 'cert-final-cert-t3-browser-a1-identity-owner-unsafe-label');
});

test('browser rejects parsed off-loopback bases and cross-origin navigation before invoking the CLI', async () => {
  for (const baseUrl of [
    'http://127.0.0.1:9001@example.invalid',
    'https://127.0.0.1:9001',
    'http://localhost',
    'http://[::1]:9001/path',
  ]) {
    assert.throws(() => clientWithResult(cleanObservation, { baseUrl }), /loopback/);
  }
  const { client, calls } = clientWithResult(cleanObservation);
  await assert.rejects(() => client.observe('session-a', { path: 'https://example.invalid/dashboard' }), /same loopback origin/);
  await assert.rejects(() => client.observe('session-a', { path: '//example.invalid/dashboard' }), /same loopback origin/);
  assert.equal(calls.length, 0);
});

test('observe uses exact desktop and mobile viewports and returns a redacted capture shape', async () => {
  const results = [
    { ...cleanObservation, failedResponses: [{ method: 'POST', url: 'http://127.0.0.1:9001/api/session?token=abc', status: 400 }] },
    { ...cleanObservation, requestedPath: '/login', actualPath: '/login' },
  ];
  const { client, calls } = clientWithResult(() => JSON.stringify(results.shift()));
  const desktop = await client.observe('session-a', { path: '/dashboard', viewport: 'desktop', allowStatuses: [400] });
  const mobile = await client.observe('session-a', { path: '/login', viewport: 'mobile' });
  assert.equal(calls[0].args.at(-1).includes('width: 1440, height: 900'), true);
  assert.equal(calls[1].args.at(-1).includes('width: 390, height: 844'), true);
  assert.deepEqual(desktop.failedResponses, [{ method: 'POST', path: '/api/session', status: 400 }]);
  assert.equal(mobile.fitsViewport, true);
});

test('observe fails on route mismatch, overflow, application errors, console errors, and unallowlisted responses', async () => {
  const failures = [
    [{ ...cleanObservation, actualPath: '/login' }, /expected path/],
    [{ ...cleanObservation, fitsViewport: false }, /horizontal overflow/],
    [{ ...cleanObservation, applicationErrors: ['Application error'] }, /application error/],
    [{ ...cleanObservation, consoleErrors: ['uncaught'] }, /console error/],
    [{ ...cleanObservation, failedResponses: [{ method: 'GET', url: 'http://127.0.0.1:9001/api/a', status: 401 }] }, /unallowlisted HTTP 401/],
    [{ ...cleanObservation, failedResponses: [{ method: 'GET', url: 'http://127.0.0.1:9001/api/a', status: 503 }] }, /unallowlisted HTTP 503/],
  ];
  for (const [result, expected] of failures) {
    const { client } = clientWithResult(result);
    await assert.rejects(() => client.observe('session-a', { path: '/dashboard' }), expected);
  }
});

test('login keeps runtime credentials out of failures and uses a visible sign-in control', async () => {
  const { client, calls } = clientWithResult({ actualPath: '/login', status: 200 });
  await assert.rejects(
    () => client.login('qa-coach-owner-a', '/dashboard'),
    error => {
      assert.doesNotMatch(error.message, /runtime-secret-never-report/);
      assert.doesNotMatch(error.message, /qa-coach-owner-a@phase2\.test/);
      return true;
    },
  );
  const code = calls.find(call => call.args.includes('run-code')).args.at(-1);
  assert.match(code, /getByRole\('button', \{ name: 'Sign In' \}\)\.click/);
  assert.doesNotMatch(code, /\.evaluate\([^)]*click/);
});

test('closeAll closes each owned session and is idempotent after failures', async () => {
  const { client, calls } = clientWithResult(input => (
    input.args.includes('run-code')
      ? JSON.stringify({ actualPath: '/dashboard', status: 200 })
      : ''
  ));
  await client.login('qa-coach-owner-a', '/dashboard', { label: 'owner' });
  await client.closeAll();
  await client.closeAll();
  const closeCommands = calls.filter(call => call.args.includes('close'));
  assert.equal(closeCommands.length, 1);
  assert.equal(closeCommands[0].session, 'cert-final-cert-t3-browser-a1-identity-owner');
});

test('closeAll attempts every owned session and retries only failed closures', async () => {
  const closeAttempts = new Map();
  const { client, calls } = clientWithResult(input => {
    if (input.args.includes('run-code')) return JSON.stringify({ actualPath: '/dashboard', status: 200 });
    if (input.args.includes('close')) {
      const attempts = (closeAttempts.get(input.session) || 0) + 1;
      closeAttempts.set(input.session, attempts);
      if (input.session.endsWith('-owner') && attempts === 1) throw new Error('first close failed');
    }
    return '';
  });
  await client.login('qa-coach-owner-a', '/dashboard', { label: 'owner' });
  await client.login('qa-team-member', '/dashboard', { label: 'member' });
  await assert.rejects(() => client.closeAll(), /failed to close 1 owned browser session/);
  await client.closeAll();
  const closes = calls.filter(call => call.args.includes('close')).map(call => call.session);
  assert.deepEqual(closes, [
    'cert-final-cert-t3-browser-a1-identity-member',
    'cert-final-cert-t3-browser-a1-identity-owner',
    'cert-final-cert-t3-browser-a1-identity-owner',
  ]);
});

test('observe removes listeners and waits for a stable expected path instead of fixed sleeps', async () => {
  const { client, calls } = clientWithResult(cleanObservation);
  await client.observe('session-a', { path: '/dashboard' });
  const code = calls[0].args.at(-1);
  assert.match(code, /waitForFunction/);
  assert.doesNotMatch(code, /waitForTimeout\(1200\)/);
  assert.match(code, /page\.off\('console'/);
  assert.match(code, /page\.off\('pageerror'/);
  assert.match(code, /page\.off\('response'/);
});

test('tenant sessions, exact response allowlists, per-session close, and download summaries stay owned and sanitized', async () => {
  const outputs = [
    JSON.stringify({ ...cleanObservation, failedResponses: [{ method: 'POST', url: 'http://127.0.0.1:9001/api/teams/join?code=secret', status: 403 }] }),
    JSON.stringify({ filename: 'roster.csv', sha256: 'a'.repeat(64), byteCount: 120, rowCount: 3, columnCount: 4, syntheticMarkers: ['FALCON-A'] }),
    '',
  ];
  const { client, calls } = clientWithResult(() => outputs.shift(), { batch: 'tenants' });
  assert.equal(client.sessionName('parent'), 'cert-final-cert-t3-browser-a1-tenants-parent');
  const observation = await client.openPath('cert-final-cert-t3-browser-a1-tenants-parent', '/dashboard', {
    allowResponses: [{ caseId: 'join-denial', method: 'POST', path: '/api/teams/join', status: 403 }],
    caseId: 'join-denial',
  });
  assert.deepEqual(observation.failedResponses[0], { method: 'POST', path: '/api/teams/join', status: 403 });
  const summary = await client.download('cert-final-cert-t3-browser-a1-tenants-parent', 'button[name="Export"]');
  assert.deepEqual(summary, { filename: 'roster.csv', sha256: 'a'.repeat(64), byteCount: 120, rowCount: 3, columnCount: 4, syntheticMarkers: ['FALCON-A'] });
  assert.equal('contents' in summary, false);
  await client.closeSession('cert-final-cert-t3-browser-a1-tenants-parent');
  assert.equal(calls.filter(call => call.args.includes('close')).length, 1);
});

test('an exact response allowlist cannot authorize the wrong method, path, status, or case', async () => {
  for (const allowed of [
    [{ caseId: 'case-a', method: 'GET', path: '/api/teams/join', status: 403 }],
    [{ caseId: 'case-a', method: 'POST', path: '/api/teams/create', status: 403 }],
    [{ caseId: 'case-a', method: 'POST', path: '/api/teams/join', status: 400 }],
    [{ caseId: 'case-b', method: 'POST', path: '/api/teams/join', status: 403 }],
  ]) {
    const { client } = clientWithResult({ ...cleanObservation, failedResponses: [{ method: 'POST', url: 'http://127.0.0.1:9001/api/teams/join', status: 403 }] }, { batch: 'tenants' });
    await assert.rejects(() => client.observe('session', { path: '/dashboard', caseId: 'case-a', allowResponses: allowed }), /unallowlisted HTTP 403/);
  }
});
