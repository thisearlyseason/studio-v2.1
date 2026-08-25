import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ISOLATION_SCENARIOS,
  REQUIRED_LOGOUT_STAGES,
  ROUTE_SCENARIOS,
  VIEWPORTS,
  buildIsolationExpectation,
  validateActionWindow,
  validateIsolationResult,
  validateLedger,
  validateLifecycleResult,
  validateLogoutStages,
  validateRouteResult,
} from '../scripts/qa-evidence/phase9/scenario-contracts.mjs';
import {
  closeAndVerifyBrowsers,
  createPlaywrightCliClient,
  installSignalRecorder,
  isProtectedResource,
} from '../scripts/qa-evidence/phase9/playwright-cli-client.mjs';
import { observeAction } from '../scripts/qa-evidence/phase9/signal-window.mjs';
import {
  buildCanonicalScenarioPlan,
  runAdmissionScenario,
  runFreshUnauthenticatedScenario,
  runIsolationScenario,
  runLogoutScenario,
  runPendingDeletionScenario,
  runRouteScenario,
} from '../scripts/qa-evidence/phase9/scenarios.mjs';

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

const cliResult = result => ({
  stdout: JSON.stringify({ isError: false, result }),
  stderr: '',
  exitCode: 0,
  timedOut: false,
});

const createCliTransport = handler => {
  const calls = [];
  const execute = async argv => {
    calls.push([...argv]);
    return handler(argv, calls.length - 1);
  };
  return { calls, execute };
};

const blankAwareCliResult = (argv, fallback = { ok: true }) => {
  const code = argv[argv.indexOf('run-code') + 1] ?? '';
  return cliResult(code.includes('phase9:verify-about-blank') ? { url: 'about:blank' } : fallback);
};

test('phase 9 playwright client arms about:blank before navigation and compiles run-code without evaluation', async () => {
  const transport = createCliTransport(argv => blankAwareCliResult(argv));
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    cwd: '/safe/cwd',
    env: { SAFE_FLAG: '1' },
  });
  assert.equal('sampleSignalWindow' in client, false, 'callers must not be able to supply their own mark');
  assert.equal('installRecorder' in client, false, 'raw recorder installation must remain private');
  assert.equal('openBlank' in client, false, 'raw browser opening must remain private');

  await installSignalRecorder(client, 'page-a');
  await client.goto('page-a', 'about:blank');

  assert.deepEqual(transport.calls[0].slice(0, 6), [
    '/safe/playwright_cli.sh', '-s=page-a', 'open', 'about:blank', '--browser', 'chrome',
  ]);
  assert.equal((transport.calls[1][transport.calls[1].indexOf('run-code') + 1] ?? '').includes('phase9:verify-about-blank'), true);
  assert.equal((transport.calls[2][transport.calls[2].indexOf('run-code') + 1] ?? '').includes('phase9:install'), true);
  assert.equal(transport.calls[3].includes('goto'), true);
  await assert.rejects(
    client.runCode('page-a', 'async (page) => {'),
    /compile/i,
  );
  const callsAfterInvalidCode = transport.calls.length;

  globalThis.__phase9CompileSideEffect = false;
  await assert.rejects(
    client.runCode('page-a', '(globalThis.__phase9CompileSideEffect = true, async (page) => page.url())'),
    /async.*page function/i,
  );
  assert.equal(globalThis.__phase9CompileSideEffect, false);
  delete globalThis.__phase9CompileSideEffect;
  assert.equal(transport.calls.length, callsAfterInvalidCode, 'invalid code must fail before transport or evaluation');

  const unarmed = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await assert.rejects(unarmed.goto('page-b', 'about:blank'), /recorder.*armed/i);
  await assert.rejects(unarmed.runCode('page-b', 'async (page) => page.goto("https://example.invalid")'), /recorder.*armed/i);

  await client.tabNew('page-a', 'about:blank');
  await assert.rejects(client.goto('page-a', 'about:blank'), /recorder.*armed/i);
  await installSignalRecorder(client, 'page-a');
  await client.goto('page-a', 'about:blank');
  await assert.rejects(client.tabNew('page-a', 'https://example.invalid'), /about:blank/i);
});

test('phase 9 playwright client refuses to arm an existing nonblank tab', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    return cliResult(code.includes('phase9:verify-about-blank') ? { url: 'https://example.invalid/login' } : { ok: true });
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await assert.rejects(installSignalRecorder(client, 'nonblank'), /exact current tab.*about:blank/i);
  assert.equal(transport.calls.filter(argv => (argv[argv.indexOf('run-code') + 1] ?? '').includes('phase9:install')).length, 0);
});

test('phase 9 playwright client classifies only protected data resources', () => {
  const origin = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
  const signal = (url, resourceType = 'fetch', method = 'GET') => ({
    url,
    method,
    resourceType,
    initiatingFrameUrl: `${origin}/dashboard`,
  });
  for (const value of [
    signal(`${origin}/family`, 'document'),
    signal(`${origin}/_next/static/chunks/app.js`, 'script'),
    signal(`${origin}/api/auth/session`, 'fetch', 'POST'),
    signal(`${origin}/api/auth/session`, 'fetch', 'DELETE'),
    signal(`${origin}/api/contact`, 'fetch', 'POST'),
    signal(`${origin}/api/health`),
    signal(`${origin}/api/newsletter/subscribe`, 'fetch', 'POST'),
    signal(`${origin}/api/newsletter/unsubscribe`, 'fetch', 'POST'),
    signal(`${origin}/api/email/reset-password`, 'fetch', 'POST'),
    signal('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', 'fetch'),
  ]) assert.equal(isProtectedResource(value), false);
  for (const value of [
    signal(`${origin}/api/teams/chat`),
    signal(`${origin}/api/admin/users/example`),
    signal(`${origin}/api/checkout`, 'fetch', 'POST'),
    signal(`${origin}/api/email/send`, 'fetch', 'POST'),
    signal(`${origin}/api/demo/seed`, 'fetch', 'POST'),
    signal(`${origin}/api/sports-hub/rss-refresh`, 'fetch', 'POST'),
    signal(`${origin}/api/public/not-allowlisted`),
    signal('https://firestore.googleapis.com/v1/projects/staging/databases/(default)/documents/teams/example'),
    signal('https://firestore.googleapis.com/v1/projects/staging/databases/(default)/documents:runQuery', 'fetch', 'POST'),
    signal('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel'),
    signal('https://firestore.googleapis.com/google.firestore.v1.Firestore/RunQuery/channel'),
  ]) assert.equal(isProtectedResource(value), true);
});

test('phase 9 action window treats login terminal sentinels as nonprotected renders', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: 'https://example.invalid/login',
      finalPath: '/login',
      visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
      sessionPresent: false,
      protectedRender: true,
      protectedRequests: [],
      protectedListenerStarts: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: '/login',
      renderSentinel: 'Sign In',
      renderSignals: [
        { path: '/login', sentinel: 'Sign In' },
        { path: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' },
      ],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'terminal-render');
  const result = await observeAction({
    client,
    session: 'terminal-render',
    stage: 'login-terminal',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(result.protectedRender, false);
});

test('phase 9 action window caps sanitized render history', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: 'https://example.invalid/family',
      finalPath: '/family',
      visibleSentinels: ['Family Overview'],
      sessionPresent: true,
      protectedRender: true,
      protectedRequests: [],
      protectedListenerStarts: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 1,
      renderPath: '/family',
      renderSentinel: 'Family Overview',
      renderSignals: Array.from({ length: 1001 }, () => ({ path: '/family', sentinel: 'Family Overview' })),
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'bounded-renders');
  const result = await observeAction({
    client,
    session: 'bounded-renders',
    stage: 'bounded-renders',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(result.renderSignals.length, 1000);
  assert.equal(result.overflow, 1);
});

test('phase 9 action window marks the same page before action and returns sanitized complete signals', async () => {
  const order = [];
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) {
      order.push('mark:logout');
      return cliResult({ pageId: 'page-a', sequence: 4 });
    }
    if (code.includes('phase9:sample')) {
      order.push('sample:logout');
      return cliResult({
        pageId: 'page-a',
        terminalReached: true,
        loadingVisible: false,
        finalUrl: 'https://example.invalid/login',
        finalPath: '/login',
        visibleSentinels: ['Sign In'],
        sessionPresent: false,
        protectedRender: true,
        protectedRequests: [{
          url: 'https://example.invalid/api/teams/chat?allowed=1',
          method: 'POST',
          resourceType: 'fetch',
          initiatingFrameUrl: 'https://example.invalid/dashboard',
          status: 401,
          body: 'password=must-not-return',
          headers: { authorization: 'Bearer must-not-return' },
        }, ...[
          'data:text/plain,token=must-not-return',
          'blob:https://example.invalid/token-must-not-return',
          'javascript:alert("token-must-not-return")',
          'file:///tmp/token-must-not-return',
        ].map(url => ({ url, method: 'GET', resourceType: 'fetch', initiatingFrameUrl: url }))],
        protectedListenerStarts: [{
          url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?token=must-not-return',
          method: 'POST',
          resourceType: 'fetch',
          initiatingFrameUrl: 'https://example.invalid/dashboard?token=must-not-return',
          body: 'must-not-return',
        }, {
          url: 'https://arbitrary.invalid/google.firestore.v1.Firestore/Listen/channel?token=must-not-return',
          method: 'POST',
          resourceType: 'fetch',
          initiatingFrameUrl: 'https://example.invalid/dashboard?token=must-not-return',
        }, {
          url: 'https://example.invalid/api/teams/chat?teamId=example',
          method: 'GET',
          resourceType: 'fetch',
          initiatingFrameUrl: 'https://example.invalid/dashboard',
        }],
        relevantHttpResults: [{ url: 'https://example.invalid/api/protected', status: 401 }],
        pageErrors: [],
        appConsoleErrors: [],
        unexpectedRequestFailures: [],
        overflow: 0,
        renderPath: '/login',
        renderSentinel: 'Sign In',
        renderSignals: [{ path: '/dashboard', sentinel: 'Family Overview', text: 'must-not-return' }],
      });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'logout');
  order.length = 0;

  const result = await observeAction({
    client,
    session: 'logout',
    stage: 'logout-tab',
    terminal: async () => order.push('terminal:logout'),
    action: async () => order.push('action:logout'),
  });

  assert.deepEqual(order, ['mark:logout', 'action:logout', 'terminal:logout', 'sample:logout']);
  assert.equal(result.protectedRequests, 1);
  assert.equal(result.protectedRender, true);
  assert.deepEqual(result.requestSignals, [{
    url: 'https://example.invalid/api/teams/chat',
    method: 'POST',
    resourceType: 'fetch',
    initiatingFrameUrl: 'https://example.invalid/dashboard',
    status: 401,
  },
  { url: 'data:', method: 'GET', resourceType: 'fetch', initiatingFrameUrl: 'data:' },
  { url: 'blob:', method: 'GET', resourceType: 'fetch', initiatingFrameUrl: 'blob:' },
  { url: 'javascript:', method: 'GET', resourceType: 'fetch', initiatingFrameUrl: 'javascript:' },
  { url: 'file:', method: 'GET', resourceType: 'fetch', initiatingFrameUrl: 'file:' }]);
  assert.deepEqual(result.listenerSignals, [{
    url: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel',
    method: 'POST',
    resourceType: 'fetch',
    initiatingFrameUrl: 'https://example.invalid/dashboard',
  }, {
    url: 'https://example.invalid/api/teams/chat',
    method: 'GET',
    resourceType: 'fetch',
    initiatingFrameUrl: 'https://example.invalid/dashboard',
  }]);
  assert.equal(result.protectedListenerStarts, 2);
  assert.deepEqual(result.renderSignals, [{ path: '/dashboard', sentinel: 'Family Overview' }]);
  assert.equal(JSON.stringify(result).includes('must-not-return'), false);
  assert.equal(result.finalPath, '/login');
  assert.equal(result.visibleSentinels[0], 'Sign In');
});

test('phase 9 action window rejects cross-page samples and terminal failures without sampling', async () => {
  let sampled = false;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) {
      sampled = true;
      return cliResult({ pageId: 'page-b' });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'one');
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => {},
    action: async () => {},
  }), /same page/i);
  assert.equal(sampled, true);

  sampled = false;
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => { throw new Error('terminal timeout'); },
    action: async () => {},
  }), /terminal timeout/);
  assert.equal(sampled, false, 'a terminal failure must not be swallowed or converted into a sample');
});

test('phase 9 action window rejects incomplete recorder samples instead of defaulting missing signals to zero', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({ pageId: 'page-a', terminalReached: true });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'one');
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => {},
    action: async () => {},
  }), /complete signal sample/i);
});

test('phase 9 playwright client rejects malformed, failed, timed-out, and isError responses', async () => {
  for (const [response, message] of [
    [{ stdout: '{', stderr: '', exitCode: 0, timedOut: false }, /valid JSON/i],
    [{ stdout: JSON.stringify({ isError: false, result: null }), stderr: '', exitCode: 2, timedOut: false }, /nonzero/i],
    [{ stdout: '', stderr: '', exitCode: null, timedOut: true }, /timed out/i],
    [{ stdout: JSON.stringify({ isError: true, result: 'provider secret' }), stderr: '', exitCode: 0, timedOut: false }, /reported an error/i],
  ]) {
    const client = createPlaywrightCliClient({ execute: async () => response, wrapperPath: '/safe/playwright_cli.sh' });
    await assert.rejects(client.listBrowsers(), message);
  }
});

test('phase 9 playwright client accepts real wrapper top-level and nested JSON results', async () => {
  const listClient = createPlaywrightCliClient({
    execute: async () => ({ stdout: JSON.stringify({ browsers: [] }), stderr: '', exitCode: 0, timedOut: false }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  assert.deepEqual(await listClient.listBrowsers(), { browsers: [] });
  const responses = [
    { stdout: JSON.stringify({ session: 'page-a', result: { snapshot: {} } }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ url: 'about:blank' }) }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ pageId: 'page-a' }) }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ pageId: 'page-a' }) }), stderr: '', exitCode: 0, timedOut: false },
  ];
  const client = createPlaywrightCliClient({ execute: async () => responses.shift(), wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'page-a');
  assert.deepEqual(await client.runCode('page-a', 'async (page) => ({ pageId: "page-a" })'), { pageId: 'page-a' });
});

test('phase 9 action window real Chrome captures each independent transient visibility mechanism', { timeout: 90_000 }, async t => {
  const client = createPlaywrightCliClient({});
  try {
    for (const mechanism of ['style', 'class', 'hidden', 'aria-hidden']) await t.test(mechanism, async () => {
      const session = `phase9-visibility-${mechanism}`;
      await installSignalRecorder(client, session);
      const hidden = await observeAction({
        client,
        session,
        stage: `${mechanism}-hidden-only`,
        terminal: async () => {},
        action: async () => client.runCode(session, `async (page) => {
          await page.evaluate(mechanism => {
            document.head.innerHTML = '';
            document.body.innerHTML = '<h1>Family Overview</h1>';
            const element = document.querySelector('h1');
            if (mechanism === 'style') element.style.display = 'none';
            if (mechanism === 'class') {
              document.head.innerHTML = '<style>.concealed{display:none}</style>';
              element.classList.add('concealed');
            }
            if (mechanism === 'hidden') element.hidden = true;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'true');
          }, ${JSON.stringify(mechanism)});
          await page.waitForTimeout(50);
          return { ok: true };
        }`),
      });
      assert.equal(hidden.protectedRender, false);

      const transient = await observeAction({
        client,
        session,
        stage: `${mechanism}-transient-visible`,
        terminal: async () => {},
        action: async () => client.runCode(session, `async (page) => {
          const heading = page.locator('h1');
          await heading.evaluate((element, mechanism) => {
            if (mechanism === 'style') element.style.display = 'block';
            if (mechanism === 'class') element.classList.remove('concealed');
            if (mechanism === 'hidden') element.hidden = false;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'false');
          }, ${JSON.stringify(mechanism)});
          await page.waitForTimeout(250);
          await heading.evaluate((element, mechanism) => {
            if (mechanism === 'style') element.style.display = 'none';
            if (mechanism === 'class') element.classList.add('concealed');
            if (mechanism === 'hidden') element.hidden = true;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'true');
          }, ${JSON.stringify(mechanism)});
          return { ok: true };
        }`),
      });
      assert.equal(transient.protectedRender, true, JSON.stringify(transient));
      assert.equal(transient.renderSignals.some(signal => signal.sentinel === 'Family Overview'), true);
    });
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 action window real Chrome captures distinct CSS-animation-only protected flashes', { timeout: 30_000 }, async () => {
  const client = createPlaywrightCliClient({});
  try {
    await installSignalRecorder(client, 'phase9-animation-regression');
    await client.goto('phase9-animation-regression', 'about:blank');
    const hidden = await observeAction({
      client,
      session: 'phase9-animation-regression',
      stage: 'animation-hidden-baseline',
      terminal: async () => {},
      action: async () => client.runCode('phase9-animation-regression', `async (page) => {
        await page.evaluate(() => {
          document.head.innerHTML = '<style>#protected-flash{opacity:0}</style>';
          document.body.innerHTML = '<h1 id="protected-flash">Family Overview</h1>';
        });
        await page.waitForTimeout(50);
        return { ok: true };
      }`),
    });
    assert.equal(hidden.protectedRender, false);

    const flashes = await observeAction({
      client,
      session: 'phase9-animation-regression',
      stage: 'animation-only-flashes',
      terminal: async () => {},
      action: async () => client.runCode('phase9-animation-regression', `async (page) => {
        await page.evaluate(async () => {
          const heading = document.querySelector('#protected-flash');
          for (let flash = 0; flash < 2; flash += 1) {
            const animation = heading.animate([
              { opacity: 0 },
              { opacity: 1, offset: 0.25 },
              { opacity: 1, offset: 0.75 },
              { opacity: 0 },
            ], { duration: 220, fill: 'forwards' });
            await animation.finished;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }
        });
        return { ok: true };
      }`),
    });
    assert.equal(flashes.protectedRender, true, JSON.stringify(flashes));
    assert.equal(flashes.renderSignals.filter(signal => signal.sentinel === 'Family Overview').length, 2);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 action window real Chrome refuses recorder installation on a nonblank tab', { timeout: 30_000 }, async () => {
  const client = createPlaywrightCliClient({});
  try {
    await installSignalRecorder(client, 'phase9-nonblank-regression');
    await client.goto('phase9-nonblank-regression', 'data:text/html,nonblank');
    await assert.rejects(installSignalRecorder(client, 'phase9-nonblank-regression'), /exact current tab.*about:blank/i);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 playwright client fails closed unless close-all yields an empty browser list', async () => {
  const responses = [cliResult({ closed: true }), cliResult({ browsers: [] })];
  const client = createPlaywrightCliClient({ execute: async () => responses.shift(), wrapperPath: '/safe/playwright_cli.sh' });
  assert.deepEqual(await closeAndVerifyBrowsers(client), { browsers: [] });

  const closeFailure = createPlaywrightCliClient({
    execute: async argv => argv.includes('close-all')
      ? { stdout: '', stderr: '', exitCode: 1, timedOut: false }
      : cliResult({ browsers: [] }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  await assert.rejects(closeAndVerifyBrowsers(closeFailure), /close-all|nonzero/i);

  const nonempty = createPlaywrightCliClient({
    execute: async argv => argv.includes('close-all')
      ? cliResult({ closed: true })
      : cliResult({ browsers: [{ session: 'still-open' }] }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  await assert.rejects(closeAndVerifyBrowsers(nonempty), /browser sessions remain/i);
});

test('phase 9 evidence contracts expose exact immutable scenario definitions', () => {
  assert.deepEqual(VIEWPORTS, {
    mobile: { width: 390, height: 844 },
    desktop: { width: 1440, height: 900 },
  });
  assert.deepEqual(ROUTE_SCENARIOS, {
    '/admin': { visibleSentinels: ['Account Lookup'] },
    '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
    '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
    '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
    '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
    '/family': { visibleSentinels: ['Family Overview'] },
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
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  assert.equal(expectation.ownTeamId, `${runId}-team-a`);
  assert.equal(expectation.oppositeTeamId, `${runId}-team-b`);
  assert.deepEqual(expectation.sameOriginApi, [
    {
      label: 'own-team-api',
      endpoint: '/api/teams/chat',
      parameter: 'teamId',
      teamId: `${runId}-team-a`,
      target: `/api/teams/chat?teamId=${runId}-team-a`,
      status: 200,
    },
    {
      label: 'opposite-team-api',
      endpoint: '/api/teams/chat',
      parameter: 'teamId',
      teamId: `${runId}-team-b`,
      target: `/api/teams/chat?teamId=${runId}-team-b`,
      status: 403,
    },
  ]);
  assert.deepEqual(expectation.directFirestore, [
    { label: 'own-team', path: `teams/${runId}-team-a`, status: 200 },
    { label: 'opposite-team', path: `teams/${runId}-team-b`, status: 403 },
    { label: 'own-player', path: `players/${runId}-player-youth-active`, status: 200 },
    { label: 'opposite-player', path: `players/${runId}-youth-player-b`, status: 403 },
  ]);
  const supportedPaths = {
    'qa-parent-a': ['team-a', 'team-b', 'player-youth-active', 'youth-player-b'],
    'qa-parent-b': ['team-b', 'team-a', 'youth-player-b', 'player-youth-active'],
    'qa-adult-player-a': ['team-a', 'team-b', 'player-adult-a', 'youth-player-b'],
    'qa-adult-player-b': ['team-b', 'team-a', 'player-adult-b', 'player-youth-active'],
    'qa-youth-active': ['team-a', 'team-b', 'player-youth-active', 'youth-player-b'],
  };
  for (const [alias, suffixes] of Object.entries(supportedPaths)) {
    const aliasExpectation = buildIsolationExpectation({ runId, alias });
    assert.deepEqual(
      aliasExpectation.directFirestore.map(item => item.path),
      [
        `teams/${runId}-${suffixes[0]}`,
        `teams/${runId}-${suffixes[1]}`,
        `players/${runId}-${suffixes[2]}`,
        `players/${runId}-${suffixes[3]}`,
      ],
    );
    assert.deepEqual(
      [aliasExpectation.ownTeamId, aliasExpectation.oppositeTeamId],
      [`${runId}-${suffixes[0]}`, `${runId}-${suffixes[1]}`],
    );
  }
  assert.throws(() => buildIsolationExpectation({ runId: 'arbitrary', alias: 'qa-parent-a' }), /run ID/i);
  assert.throws(() => buildIsolationExpectation({ runId, alias: 'qa-school-admin' }), /supported isolation alias/i);
  const safe = overrides => ({
    ...expectation,
    oppositeProtectedRender: false,
    oppositeListenerStarts: 0,
    ...overrides,
  });
  assert.equal(validateIsolationResult(safe()).pass, true);
  assert.throws(() => validateIsolationResult(safe({ endpoint: '/team' })), /same-origin endpoint/i);
  assert.throws(() => validateIsolationResult(safe({ sameOriginApi: expectation.sameOriginApi.slice(0, 1) })), /same-origin API target pairs/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeTeamId: expectation.ownTeamId })), /oppositeTeamId/i);
  assert.throws(() => validateIsolationResult(safe({ sameOriginApi: [...expectation.sameOriginApi].reverse() })), /own-team-api/i);
  assert.throws(() => validateIsolationResult(safe({
    sameOriginApi: expectation.sameOriginApi.map(item => item.label === 'own-team-api' ? { ...item, target: '/api/teams/chat?teamId=arbitrary' } : item),
  })), /own-team-api.*target/i);
  assert.throws(() => validateIsolationResult(safe({
    sameOriginApi: expectation.sameOriginApi.map(item => item.label === 'opposite-team-api' ? { ...item, status: 200 } : item),
  })), /opposite-team-api.*403/i);
  assert.throws(() => validateIsolationResult(safe({ directFirestore: safe().directFirestore.slice(0, 3) })), /Firestore probe/i);
  assert.throws(() => validateIsolationResult(safe({
    directFirestore: safe().directFirestore.map(item => item.label === 'own-team' ? { ...item, path: 'teams/arbitrary' } : item),
  })), /own-team.*path/i);
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
  const aliases = [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member', 'qa-multi-org',
    'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member', 'qa-parent-a',
    'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b', 'qa-youth-active', 'qa-league-creator',
    'qa-school-admin', 'qa-superadmin', 'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
  ];
  const sortedAliases = [
    'qa-adult-player-a', 'qa-adult-player-b', 'qa-coach-owner-a', 'qa-coach-owner-b',
    'qa-fake-superadmin', 'qa-league-creator', 'qa-missing-profile', 'qa-multi-org', 'qa-no-team',
    'qa-parent-a', 'qa-parent-b', 'qa-pending-delete', 'qa-removed-member', 'qa-school-admin',
    'qa-superadmin', 'qa-suspended', 'qa-team-assistant', 'qa-team-member', 'qa-unverified',
    'qa-youth-active',
  ];
  const uidSuffixes = [
    'adult-player-a', 'adult-player-b', 'coach-owner-a', 'coach-owner-b', 'fake-superadmin',
    'league-creator', 'missing-profile', 'multi-org', 'no-team', 'parent-a', 'parent-b',
    'pending-delete', 'removed-member', 'school-admin', 'superadmin', 'suspended', 'team-assistant',
    'team-member', 'unverified', 'youth-active',
  ];
  const preflight = {
    command: 'preflight',
    safe: true,
    projectId: 'the-squad-v2-staging',
    origin: STAGING_ORIGIN,
    plannedAliases: 20,
    plannedTeams: 3,
  };
  assert.equal(validateLifecycleResult('preflight', JSON.stringify(preflight), 'preflight').pass, true);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, command: undefined }, 'preflight'), /command/i);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, plannedTeams: 1 }, 'preflight'), /plannedTeams/i);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, ok: true }, 'preflight'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('preflight', preflight, 'arbitrary'), /lifecycle stage/i);
  assert.throws(() => validateLifecycleResult('seed', '{', 'seeded'), /valid JSON/i);
  assert.throws(() => validateLifecycleResult('inspect', { ok: false }, 'seeded-present'), /ok=true/i);
  const seed = {
    command: 'seed',
    state: 'seeded',
    aliases,
    counts: { auth: 20, firestore: 82 },
    uidSuffixes,
  };
  assert.equal(validateLifecycleResult('seed', seed, 'seeded').pass, true);
  assert.throws(() => validateLifecycleResult('seed', { ...seed, aliases: aliases.slice(1) }, 'seeded'), /aliases/i);
  assert.throws(() => validateLifecycleResult('seed', { ...seed, ok: true }, 'seeded'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('seed', {
    ...seed, counts: { auth: 1, firestore: 1 }, aliases: ['qa-parent-a'], uidSuffixes: ['parent-a'],
  }, 'seeded'), /canonical seed/i);
  assert.throws(() => validateLifecycleResult('transition', {
    command: 'transition', state: 'pending_deletion', uidSuffix: 'pending-delete',
  }, 'pending-deletion'), /alias/i);
  assert.equal(validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete',
  }, 'pending-deletion').pass, true);

  const inspect = {
    command: 'inspect',
    ok: true,
    aliases: sortedAliases,
    states: { manifest: 'seeded', problems: 0 },
    drift: [],
    counts: {
      expected: { auth: 20, firestore: 82 },
      actualPresent: { auth: 20, firestore: 82 },
    },
    uidSuffixes,
  };
  assert.equal(validateLifecycleResult('inspect', inspect, 'seeded-present').pass, true);
  assert.equal(validateLifecycleResult('inspect', {
    ...inspect,
    aliases: [],
    states: { manifest: 'cleaned', problems: 0 },
    counts: { ...inspect.counts, actualPresent: { auth: 0, firestore: 0 } },
  }, 'cleaned-absent').pass, true);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, aliases: undefined }, 'seeded-present'), /aliases/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, aliases: [...sortedAliases].reverse() }, 'seeded-present'), /aliases/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, uidSuffixes: uidSuffixes.slice(1) }, 'seeded-present'), /UID suffixes/i);
  assert.throws(() => validateLifecycleResult('inspect', {
    ...inspect,
    aliases: [],
    uidSuffixes: [...uidSuffixes].reverse(),
    states: { manifest: 'cleaned', problems: 0 },
    counts: { ...inspect.counts, actualPresent: { auth: 0, firestore: 0 } },
  }, 'cleaned-absent'), /UID suffixes/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, drift: ['one'] }, 'seeded-present'), /drift/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, states: { manifest: 'seeded', problems: 1 } }, 'seeded-present'), /problems/i);
  assert.throws(() => validateLifecycleResult('inspect', {
    ...inspect,
    states: { manifest: 'arbitrary', problems: 0 },
    counts: { expected: { auth: 1, firestore: 1 }, actualPresent: { auth: 1, firestore: 1 } },
  }, 'seeded-present'), /expected Auth count|state/i);

  const cleanup = {
    command: 'cleanup',
    ok: true,
    retained: [],
    deleted: { auth: 20, firestore: 82 },
    followUp: {
      retained: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
      failures: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
    },
  };
  assert.equal(validateLifecycleResult('cleanup', cleanup, 'cleaned').pass, true);
  assert.throws(() => validateLifecycleResult('cleanup', { ...cleanup, retained: ['one'] }, 'cleaned'), /retained/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup,
    followUp: { ...cleanup.followUp, failures: { ...cleanup.followUp.failures, auth: { count: 1, aliases: ['one'] } } },
  }, 'cleaned'), /failures/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup, deleted: { auth: 1, firestore: 1 },
  }, 'cleaned'), /deleted Auth count/i);

  const probe = {
    projectId: 'the-squad-v2-staging',
    checkedAuth: 20,
    checkedFirestore: 82,
    checkedExpectedAbsent: 1,
    authPresent: 0,
    firestorePresent: 0,
    expectedAbsentPresent: 0,
  };
  assert.equal(validateLifecycleResult('probe', probe, 'independently-absent').pass, true);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedExpectedAbsent: 0 }, 'independently-absent'), /expected-absence/i);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedAuth: undefined }, 'independently-absent'), /checked Auth/i);
  assert.throws(() => validateLifecycleResult('probe', probe, 'arbitrary'), /lifecycle stage/i);
  assert.equal(validateLifecycleResult('browser-sessions', { sessions: [] }, 'browsers-closed').pass, true);
  assert.throws(() => validateLifecycleResult('browser-sessions', { sessions: ['open'] }, 'browsers-closed'), /zero browser sessions/i);
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

const scenarioWindow = overrides => ({
  ...safeWindow(),
  finalUrl: `${STAGING_ORIGIN}/family`,
  relevantHttpResults: [],
  ...overrides,
});

const scenarioContext = overrides => ({
  contextId: 'admission-route-qa-parent-a-mobile',
  alias: 'qa-parent-a',
  viewport: '390x844',
  startState: 'active',
  startUrl: 'about:blank',
  ...overrides,
});

const createScriptedScenarioClient = windows => {
  const calls = [];
  const queue = [...windows];
  return {
    calls,
    async captureSignalWindow({ stage, action, terminal }) {
      calls.push(`mark:${stage}`);
      const actionResult = await action();
      calls.push(`terminal:${stage}`);
      await terminal();
      const window = queue.shift();
      if (!window) throw new Error(`No scripted window for ${stage}`);
      return { ...window, actionResult };
    },
  };
};

test('phase 9 browser scenarios require visible readiness and complete denied-route windows', async () => {
  const context = scenarioContext();
  const actions = {
    navigate: async target => target,
    waitForSentinel: async sentinel => sentinel,
  };
  for (const [overrides, message] of [
    [{ visibleSentinels: [] }, /visible sentinel/i],
    [{ loadingVisible: true }, /loading/i],
  ]) {
    const client = createScriptedScenarioClient([scenarioWindow(overrides)]);
    await assert.rejects(runRouteScenario({
      client, session: 'admission', context, path: '/family', allowed: true, actions,
    }), message);
  }
  const timeoutClient = createScriptedScenarioClient([scenarioWindow()]);
  await assert.rejects(runRouteScenario({
    client: timeoutClient,
    session: 'timeout',
    context,
    path: '/family',
    allowed: true,
    actions: { ...actions, waitForSentinel: async () => { throw new Error('readiness timeout'); } },
  }), /readiness timeout/);

  for (const [field, value, message] of [
    ['protectedRender', true, /protected render/i],
    ['protectedRequests', 1, /protected request/i],
    ['protectedListenerStarts', 1, /protected listener/i],
  ]) {
    const client = createScriptedScenarioClient([scenarioWindow({
      finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'], [field]: value,
    })]);
    await assert.rejects(runRouteScenario({
      client,
      session: 'denied',
      context,
      path: '/admin',
      allowed: false,
      landing: { path: '/dashboard', sentinel: 'Dashboard' },
      actions,
    }), message);
  }

  const passingClient = createScriptedScenarioClient([scenarioWindow()]);
  const row = await runRouteScenario({
    client: passingClient, session: 'allowed', context, path: '/family', allowed: true, actions,
  });
  assert.equal(row.result, 'PASS');
  assert.equal(row.finalUrl, `${STAGING_ORIGIN}/family`);
  assert.deepEqual(passingClient.calls, ['mark:admission-route', 'terminal:admission-route']);
});

test('phase 9 browser scenarios use exact symmetric API and Firestore isolation probes', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  const windows = [
    scenarioWindow({ relevantHttpResults: [{ url: `${STAGING_ORIGIN}${expectation.sameOriginApi[0].target}`, status: 200 }] }),
    scenarioWindow({ relevantHttpResults: [{ url: `${STAGING_ORIGIN}${expectation.sameOriginApi[1].target}`, status: 403 }] }),
    ...expectation.directFirestore.map(probe => scenarioWindow({ relevantHttpResults: [{ url: `https://firestore.googleapis.com/v1/${probe.path}`, status: probe.status }] })),
  ];
  const client = createScriptedScenarioClient(windows);
  const apiCalls = [];
  const firestoreCalls = [];
  const row = await runIsolationScenario({
    client,
    session: 'isolation',
    context: scenarioContext({ contextId: 'isolation-qa-parent-a-mobile' }),
    runId,
    actions: {
      sameOriginGet: async (target, authentication) => {
        apiCalls.push({ target, authentication });
        return target.includes('team-a') ? 200 : 403;
      },
      firestoreGet: async (probe, authentication) => {
        firestoreCalls.push({ probe, authentication });
        return probe.expectedStatus;
      },
      waitForSettled: async () => {},
    },
  });
  assert.deepEqual(apiCalls, expectation.sameOriginApi.map(item => ({
    target: item.target,
    authentication: { session: 'isolation', method: 'GET', credentials: 'same-origin' },
  })));
  assert.equal(apiCalls.some(({ target }) => target.startsWith('/team?teamId=')), false);
  assert.deepEqual(firestoreCalls, expectation.directFirestore.map(({ label, path, status }) => ({
    probe: { label, path, expectedStatus: status },
    authentication: { session: 'isolation' },
  })));
  assert.equal(row.result, 'PASS');

  for (const [mutate, message] of [
    [statuses => { statuses.api[0] = 403; }, /own-team-api.*200/i],
    [statuses => { statuses.api[1] = 200; }, /opposite-team-api.*403/i],
    [statuses => { statuses.firestore.pop(); }, /complete.*Firestore|Firestore.*complete/i],
    [statuses => { statuses.firestore[3] = 200; }, /opposite-player.*403/i],
  ]) {
    const statuses = { api: [200, 403], firestore: [200, 403, 200, 403] };
    mutate(statuses);
    const failingClient = createScriptedScenarioClient([
      ...statuses.api.map(status => scenarioWindow({ relevantHttpResults: [{ url: STAGING_ORIGIN, status }] })),
      ...statuses.firestore.map(status => scenarioWindow({ relevantHttpResults: [{ url: 'https://firestore.googleapis.com', status }] })),
    ]);
    let firestoreIndex = 0;
    let apiIndex = 0;
    await assert.rejects(runIsolationScenario({
      client: failingClient,
      session: 'isolation-fail',
      context: scenarioContext({ contextId: 'isolation-fail-mobile' }),
      runId,
      actions: {
        sameOriginGet: async () => statuses.api[apiIndex++],
        firestoreGet: async () => statuses.firestore[firestoreIndex++],
        waitForSettled: async () => {},
      },
    }), message);
  }
});

test('phase 9 browser scenarios mark before every logout stage and reject transient activity', async () => {
  const clean = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const actionOrder = [];
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => actionOrder.push(`action:${name}`)]));
  actions.waitForLogin = async stage => actionOrder.push(`wait:${stage}`);
  const client = createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => clean), clean]);
  actions.freshUnauthenticated = async () => actionOrder.push('action:fresh-isolated-unauthenticated');
  actions.waitForFreshLogin = async () => actionOrder.push('wait:fresh-isolated-unauthenticated');
  const row = await runLogoutScenario({
    client,
    session: 'logout',
    freshSession: 'logout-fresh',
    context: scenarioContext({ contextId: 'logout-qa-parent-a-mobile' }),
    actions,
  });
  assert.equal(row.result, 'PASS');
  assert.deepEqual(client.calls.filter(call => call.startsWith('mark:')), [
    ...REQUIRED_LOGOUT_STAGES.map(name => `mark:${name}`),
    'mark:fresh-isolated-unauthenticated',
  ]);
  assert.deepEqual(actionOrder, [
    ...REQUIRED_LOGOUT_STAGES.flatMap(name => [`action:${name}`, `wait:${name}`]),
    'action:fresh-isolated-unauthenticated', 'wait:fresh-isolated-unauthenticated',
  ]);

  for (const stageIndex of [0, 1, 2, 3]) {
    for (const [field, value, message] of [
      ['protectedRender', true, /protected render/i],
      ['protectedRequests', 1, /protected request/i],
      ['protectedListenerStarts', 1, /protected listener/i],
      ['sessionPresent', true, /session/i],
    ]) {
      const windows = [...REQUIRED_LOGOUT_STAGES.map((_, index) => index === stageIndex ? { ...clean, [field]: value } : clean), clean];
      await assert.rejects(runLogoutScenario({
        client: createScriptedScenarioClient(windows),
        session: 'logout-fail',
        freshSession: 'logout-fresh-fail',
        context: scenarioContext({ contextId: `logout-fail-${stageIndex}-${field}` }),
        actions,
      }), message);
    }
  }
});

test('phase 9 browser scenarios reject transient protected activity for fresh and pending deletion', async () => {
  const fresh = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const pending = { ...fresh, visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'] };
  const actions = { navigate: async () => {}, waitForLogin: async () => {}, freshLogin: async () => {} };
  for (const runner of [runFreshUnauthenticatedScenario, runPendingDeletionScenario]) {
    for (const [field, value, message] of [
      ['protectedRender', true, /protected render/i],
      ['protectedRequests', 1, /protected request/i],
      ['protectedListenerStarts', 1, /protected listener/i],
    ]) {
      const base = runner === runPendingDeletionScenario ? pending : fresh;
      await assert.rejects(runner({
        client: createScriptedScenarioClient([{ ...base, [field]: value }]),
        session: 'revoked',
        context: scenarioContext({
          contextId: `revoked-${field}`,
          alias: runner === runPendingDeletionScenario ? 'qa-pending-delete' : 'qa-parent-a',
        }),
        actions,
      }), message);
    }
  }
  assert.equal((await runFreshUnauthenticatedScenario({
    client: createScriptedScenarioClient([fresh]), session: 'fresh', context: scenarioContext({ contextId: 'fresh' }), actions,
  })).result, 'PASS');
  assert.equal((await runPendingDeletionScenario({
    client: createScriptedScenarioClient([pending]), session: 'pending',
    context: scenarioContext({ contextId: 'pending', alias: 'qa-pending-delete' }), actions,
  })).result, 'PASS');
});

test('phase 9 browser scenarios distinguish active pending baseline, stale revocation, and fresh denial', async () => {
  const active = scenarioWindow({
    finalPath: '/dashboard',
    finalUrl: `${STAGING_ORIGIN}/dashboard`,
    visibleSentinels: ['Dashboard'],
    sessionPresent: true,
  });
  const actions = {
    navigate: async () => {},
    waitForDashboard: async () => {},
  };
  const row = await runPendingDeletionScenario({
    client: createScriptedScenarioClient([active]),
    session: 'pending-active',
    context: scenarioContext({ contextId: 'pending-active', alias: 'qa-pending-delete' }),
    scenario: 'active-baseline',
    actions,
  });
  assert.equal(row.group, 'pending-deletion');
  assert.equal(row.visibleState, 'Dashboard');
  assert.equal(row.sessionPresent, true);
  await assert.rejects(runPendingDeletionScenario({
    client: createScriptedScenarioClient([active]),
    session: 'pending-invalid',
    context: scenarioContext({ contextId: 'pending-invalid', alias: 'qa-pending-delete' }),
    scenario: 'unsupported',
    actions,
  }), /pending-deletion scenario/i);
});

test('phase 9 browser scenarios build the exact canonical two-viewport plan and reject invalid contexts', async () => {
  const plan = buildCanonicalScenarioPlan();
  assert.equal(plan.length, 44);
  assert.deepEqual(Object.fromEntries(Object.entries(VIEWPORTS).map(([name, size]) => [name, `${size.width}x${size.height}`])), {
    mobile: '390x844', desktop: '1440x900',
  });
  assert.deepEqual(plan.reduce((counts, entry) => ({ ...counts, [entry.group]: (counts[entry.group] ?? 0) + 1 }), {}), {
    'admission-route': 18,
    isolation: 10,
    logout: 10,
    'pending-deletion': 6,
  });
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'admission-route').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-league-creator', 'qa-school-admin',
    'qa-superadmin', 'qa-fake-superadmin', 'qa-missing-profile', 'qa-no-team',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'isolation').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'logout').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'pending-deletion').map(item => item.alias))], ['qa-pending-delete']);
  assert.equal(new Set(plan.map(item => item.contextId)).size, 44);
  assert.deepEqual([...new Set(plan.map(item => item.viewport))], ['390x844', '1440x900']);
  const expectedLandings = {
    'qa-parent-a': ['/dashboard', 'Dashboard'],
    'qa-adult-player-a': ['/dashboard', 'Dashboard'],
    'qa-youth-active': ['/dashboard', 'Dashboard'],
    'qa-league-creator': ['/dashboard', 'Dashboard'],
    'qa-school-admin': ['/club', 'School Hub'],
    'qa-superadmin': ['/admin', 'Account Lookup'],
    'qa-fake-superadmin': ['/dashboard', 'Dashboard'],
    'qa-missing-profile': ['/onboarding', 'Complete your profile'],
    'qa-no-team': ['/teams/join', 'Join & Invite'],
  };
  for (const entry of plan.filter(item => item.group === 'admission-route')) {
    assert.deepEqual([entry.landing.path, entry.landing.sentinel], expectedLandings[entry.alias]);
    assert.deepEqual(entry.routeExpectations.map(route => route.requestedPath), [
      '/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family',
    ]);
    assert.equal(entry.routeExpectations.length, 6);
  }

  const client = createScriptedScenarioClient([scenarioWindow()]);
  await assert.rejects(runAdmissionScenario({
    client,
    session: 'invalid',
    context: { ...scenarioContext(), startUrl: undefined },
    path: '/family',
    allowed: true,
    actions: { navigate: async () => {}, waitForSentinel: async () => {} },
  }), /startUrl/i);
  assert.throws(() => buildCanonicalScenarioPlan({ contextIds: ['duplicate', 'duplicate'] }), /duplicate context ID/i);
});

test('phase 9 browser scenarios admission row owns login landing and all six direct routes', async () => {
  const windows = [
    scenarioWindow({ finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'], protectedRequests: 1 }),
    ...['/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner'].map(() => scenarioWindow({
      finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'], protectedRender: false,
    })),
    scenarioWindow({ finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'], protectedRequests: 2 }),
  ];
  const actionCalls = [];
  const client = createScriptedScenarioClient(windows);
  const row = await runAdmissionScenario({
    client,
    session: 'admission-complete',
    context: scenarioContext(),
    actions: {
      loginAndLand: async alias => actionCalls.push(`login:${alias}`),
      navigate: async path => actionCalls.push(`navigate:${path}`),
      waitForSentinel: async sentinel => actionCalls.push(`wait:${sentinel}`),
    },
  });
  assert.deepEqual(actionCalls.filter(item => item.startsWith('login:') || item.startsWith('navigate:')), [
    'login:qa-parent-a',
    'navigate:/admin',
    'navigate:/club',
    'navigate:/competition',
    'navigate:/dashboard/billing',
    'navigate:/coaches-corner',
    'navigate:/family',
  ]);
  assert.equal(client.calls.filter(item => item.startsWith('mark:')).length, 7);
  assert.equal(row.actionSummaries.length, 7);
  assert.equal(row.protectedRequests, 3);
  assert.match(row.action, /login.*6 direct routes/i);
});

test('phase 9 browser scenarios expose exact route-specific accessible heading contracts', () => {
  assert.deepEqual(ROUTE_SCENARIOS, {
    '/admin': { visibleSentinels: ['Account Lookup'] },
    '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
    '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
    '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
    '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
    '/family': { visibleSentinels: ['Family Overview'] },
  });
  assert.equal(Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels).includes('Admin'), false);
});

test('phase 9 browser scenarios route validation distinguishes expected current heading from transient wrong-route renders', () => {
  assert.equal(validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      protectedRender: true,
      renderSignals: [{ path: '/family', sentinel: 'Family Overview' }],
    }),
  }).pass, true);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      protectedRender: true,
      renderSignals: [
        { path: '/admin', sentinel: 'Account Lookup' },
        { path: '/family', sentinel: 'Family Overview' },
      ],
    }),
  }), /unexpected protected render/i);
  assert.throws(() => validateRouteResult({
    allowed: false,
    expectedPath: '/dashboard',
    expectedSentinel: 'Access Denied',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Access Denied'] }),
  }), /landing sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: false,
    expectedPath: '/dashboard',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Family Overview'] }),
  }), /landing sentinel/i);
});

test('phase 9 browser scenarios heading contracts are backed by the real page h1 sources', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(source('../src/app/admin/page.tsx'), /<h1[^>]*>Account Lookup<\/h1>/);
  assert.match(source('../src/app/(dashboard)/club/page.tsx'), /<h1[^>]*>[\s\S]*isSchoolMode \? 'School Hub' : 'Club Hub'[\s\S]*<\/h1>/);
  assert.match(source('../src/app/(dashboard)/competition/page.tsx'), /const pageTitle = isSchoolMode \? 'Program League Hub' : 'Competition Hub'/);
  assert.match(source('../src/app/(dashboard)/dashboard/billing/page.tsx'), /<h1[^>]*>[\s\S]*Manage[\s\S]*Your Plan[\s\S]*<\/h1>/);
  assert.match(source('../src/app/(dashboard)/coaches-corner/page.tsx'), /<h1[^>]*>Coaches Corner<\/h1>/);
  assert.match(source('../src/app/(dashboard)/family/page.tsx'), /<h1[^>]*>Family Overview<\/h1>/);
  assert.match(source('../src/app/(dashboard)/dashboard/page.tsx'), /<h1[^>]*>Dashboard<\/h1>/);
  assert.match(source('../src/app/onboarding/page.tsx'), /<h1[^>]*>Complete your profile<\/h1>/);
  assert.match(source('../src/app/(dashboard)/teams/join/page.tsx'), /<h1[^>]*>Join & Invite<\/h1>/);
  const login = source('../src/app/login/page.tsx');
  assert.match(login, /tokenResult\.claims\.role === 'superadmin'[\s\S]*router\.push\('\/admin'\)/);
  assert.match(login, /data\.role === 'admin' \|\| data\.isSchoolAdmin[\s\S]*router\.push\('\/club'\)/);
  assert.match(login, /else \{[\s\S]*router\.push\('\/dashboard'\)/);
});

test('phase 9 browser scenarios recorder requires an exact visible h1 instead of substring body text', { timeout: 30_000 }, async () => {
  const client = createPlaywrightCliClient({});
  try {
    await installSignalRecorder(client, 'phase9-exact-heading');
    const nonHeading = await observeAction({
      client,
      session: 'phase9-exact-heading',
      stage: 'non-heading-substring',
      terminal: async () => {},
      action: () => client.runCode('phase9-exact-heading', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<h1>Admin</h1><div>Account Lookup and Admin</div>';
      })`),
    });
    assert.deepEqual(nonHeading.visibleSentinels, []);
    const exactHeading = await observeAction({
      client,
      session: 'phase9-exact-heading',
      stage: 'exact-heading',
      terminal: async () => {},
      action: () => client.runCode('phase9-exact-heading', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<h1>Account Lookup</h1>';
      })`),
    });
    assert.deepEqual(exactHeading.visibleSentinels, ['Account Lookup']);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 browser scenarios logout row includes a fifth fresh isolated unauthenticated action', async () => {
  const login = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => {}]));
  actions.waitForLogin = async () => {};
  actions.freshUnauthenticated = async () => {};
  actions.waitForFreshLogin = async () => {};
  const client = createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => login), login]);
  const row = await runLogoutScenario({
    client,
    session: 'logout-shared',
    freshSession: 'logout-fresh',
    context: scenarioContext({ contextId: 'logout-complete' }),
    actions,
  });
  assert.equal(client.calls.filter(item => item.startsWith('mark:')).length, 5);
  assert.equal(row.actionSummaries.length, 5);
  assert.match(row.action, /fresh isolated/i);
});

test('phase 9 browser scenarios aggregate every isolation action window from actual observations', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  const statuses = [200, 403, 200, 403, 200, 403];
  const windows = statuses.map((status, index) => scenarioWindow({
    protectedRequests: index + 1,
    relevantHttpResults: [{ url: `${STAGING_ORIGIN}/probe-${index}`, status }],
  }));
  let apiIndex = 0;
  let firestoreIndex = 0;
  const row = await runIsolationScenario({
    client: createScriptedScenarioClient(windows),
    session: 'isolation-aggregate',
    context: scenarioContext({ contextId: 'isolation-aggregate' }),
    runId,
    actions: {
      sameOriginGet: async () => statuses[apiIndex++],
      firestoreGet: async () => statuses[2 + firestoreIndex++],
      waitForSettled: async () => {},
    },
  });
  assert.equal(row.protectedRequests, 21);
  assert.equal(row.actionSummaries.length, 6);
  assert.deepEqual(row.actionSummaries.map(item => item.status), statuses);
  assert.equal(row.relevantHttpDataResult, statuses.join(','));
  assert.equal(expectation.directFirestore.length, 4);
});

test('phase 9 browser scenarios pending rows use distinct baseline reload and fresh-login actions', async () => {
  const denied = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`,
    visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
    sessionPresent: false,
  });
  const calls = [];
  const shared = {
    waitForLogin: async () => {},
    reloadRevokedSession: async () => calls.push('reload'),
    freshLogin: async () => calls.push('fresh-login'),
  };
  await runPendingDeletionScenario({
    client: createScriptedScenarioClient([denied]), session: 'pending-stale',
    context: scenarioContext({ contextId: 'pending-stale', alias: 'qa-pending-delete' }),
    scenario: 'stale-session', actions: shared,
  });
  await runPendingDeletionScenario({
    client: createScriptedScenarioClient([denied]), session: 'pending-fresh',
    context: scenarioContext({ contextId: 'pending-fresh', alias: 'qa-pending-delete' }),
    scenario: 'fresh-login', actions: shared,
  });
  assert.deepEqual(calls, ['reload', 'fresh-login']);
});
