import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const PROJECT_ID = 'demo-the-squad-audit';
const BASE_URL = 'http://127.0.0.1:9001';
const runBrowser = process.argv.includes('--browser');
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
const children = [];
const logDir = path.join(os.tmpdir(), `the-squad-phase2-${process.pid}`);

const firebaseConfig = JSON.stringify({
  projectId: PROJECT_ID,
  apiKey: 'phase2-emulator-api-key',
  appId: '1:123456789:web:phase2audit',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: '123456789',
});

const env = {
  ...process.env,
  AUDIT_FIXTURE_PASSWORD: password,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: firebaseConfig,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
};

function redact(value) {
  return String(value || '').replaceAll(password, '[redacted]');
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
  const child = spawn(command, args, { cwd: process.cwd(), env, stdio: ['ignore', output, output] });
  children.push(child);
  return child;
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
    throw new Error(redact(`${command} ${args.join(' ')} failed.\n${result.stdout}\n${result.stderr}`));
  }
  return result.stdout.trim();
}

async function signIn(alias) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=phase2',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${alias}@phase2.test`, password, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  return { status: response.status, body };
}

async function apiStatus(pathname, token, init = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    redirect: 'manual',
  });
  return response.status;
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  console.log(`PASS ${label}: ${actual}`);
}

function cli(session, args, { sensitive = false } = {}) {
  const output = run(playwrightCli, [`-s=${session}`, '--raw', ...args], sensitive ? { stdio: 'pipe' } : {});
  return output;
}

async function browserLogin(alias, expectedPath, sessionLabel = alias) {
  const session = `phase2-${sessionLabel}`;
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.stack || error.message));
    page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); });
    await page.getByLabel('Email Address').fill(${JSON.stringify(`${alias}@phase2.test`)});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(5000);
    return {
      url: page.url(),
      loginFailed: await page.getByText('Login Failed', { exact: true }).count(),
      sessionFailed: await page.getByText('Session Setup Failed', { exact: true }).count(),
    };
  }`;
  const result = JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
  result.pathname = new URL(result.url).pathname;
  if (result.pathname !== expectedPath) {
    const consoleErrors = cli(session, ['console', 'error']);
    const requests = cli(session, ['requests']);
    throw new Error(
      `${alias} remained at ${result.pathname}; loginFailed=${result.loginFailed}, ` +
      `sessionFailed=${result.sessionFailed}.\n${consoleErrors}\n${requests}`,
    );
  }
  expectEqual(result.pathname, expectedPath, `${alias} login destination`);
  return session;
}

function browserPath(session, pathname) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
    await page.waitForTimeout(1200);
    return { url: page.url() };
  }`;
  return new URL(JSON.parse(cli(session, ['run-code', code])).url).pathname;
}

function browserRouteAudit(session, pathname, { mobile = false } = {}) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });
    await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
    await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
    await page.waitForTimeout(1800);
    return {
      pathname: await page.evaluate(() => window.location.pathname),
      fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserLoginFailureAudit(alias, suppliedPassword, expectedPath, expectedTitle, sessionLabel) {
  const session = `phase2-${sessionLabel}-${process.pid}`;
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.stack || error.message));
    page.on('response', response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); });
    await page.getByLabel('Email Address').fill(${JSON.stringify(`${alias}@phase2.test`)});
    await page.locator('#password').fill(${JSON.stringify(suppliedPassword)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(2500);
    return {
      pathname: await page.evaluate(() => window.location.pathname),
      expectedTitle: await page.getByText(${JSON.stringify(expectedTitle)}, { exact: true }).count(),
      body: (await page.locator('body').innerText()).slice(0, 500),
      consoleErrors,
      failedResponses,
    };
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

function browserProtectedReturnAudit() {
  const session = `phase2-protected-return-${process.pid}`;
  cli(session, ['open', `${BASE_URL}/facilities`, '--browser', 'chrome']);
  const code = `async page => {
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.getByLabel('Email Address').fill('qa-coach-owner-a@phase2.test');
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(() => window.location.pathname === '/facilities', null, { timeout: 15000 });
    return await page.evaluate(() => window.location.pathname);
  }`;
  return JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
}

function browserLogoutAudit(session) {
  const code = `async page => {
    const peer = await page.context().newPage();
    await peer.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await peer.waitForTimeout(1200);
    await page.goto(${JSON.stringify(`${BASE_URL}/settings`)});
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await peer.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
    return {
      primaryPath: await page.evaluate(() => window.location.pathname),
      peerPath: await peer.evaluate(() => window.location.pathname),
      sessionStatus: sessionResponse.status(),
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runIdentityBrowserAudit() {
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `identity-owner-${process.pid}`);
  const assistant = await browserLogin('qa-team-assistant', '/dashboard', `identity-assistant-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `identity-member-${process.pid}`);
  const parent = await browserLogin('qa-parent-a', '/family', `identity-parent-${process.pid}`);
  const player = await browserLogin('qa-adult-player-a', '/dashboard', `identity-player-${process.pid}`);
  await browserLogin('qa-youth-active', '/dashboard', `identity-youth-${process.pid}`);
  await browserLogin('qa-multi-team', '/dashboard', `identity-multi-${process.pid}`);

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

function browserSurfaceSweep(session, cases, { mobile = false } = {}) {
  const code = `async page => {
    const cases = ${JSON.stringify(cases)};
    const results = [];
    let activePath = '';
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push({ path: activePath, message: message.text() });
    });
    page.on('pageerror', error => consoleErrors.push({ path: activePath, message: error.message }));
    page.on('response', response => {
      if (response.status() >= 500) failedResponses.push({ path: activePath, status: response.status(), url: response.url() });
    });
    await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
    for (const item of cases) {
      activePath = item.path;
      await page.goto(${JSON.stringify(BASE_URL)} + item.path);
      await page.waitForTimeout(1400);
      if (item.waitForPathChange && await page.evaluate(requested => window.location.pathname === requested, item.path)) {
        await page.waitForFunction(requested => window.location.pathname !== requested, item.path, { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(800);
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
    await page.getByLabel('Email Address').fill('qa-adult-player-b@phase2.test');
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
  const aliases = [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-superadmin', 'qa-fake-superadmin',
    'qa-unverified', 'qa-removed-member', 'qa-pending-delete',
  ];
  const tokens = new Map();
  for (const alias of aliases) {
    const result = await signIn(alias);
    expectEqual(result.status, 200, `${alias} emulator sign-in`);
    tokens.set(alias, result.body.idToken);
  }

  const disabled = await signIn('qa-suspended');
  expectEqual(disabled.status, 400, 'disabled account sign-in denial');
  expectEqual(disabled.body?.error?.message, 'USER_DISABLED', 'disabled account error code');

  expectEqual(
    await apiStatus('/api/teams/chat?teamId=qa-team-a', tokens.get('qa-coach-owner-a')),
    200,
    'Team A owner reads Team A chat context',
  );
  expectEqual(
    await apiStatus('/api/teams/chat?teamId=qa-team-b', tokens.get('qa-coach-owner-a')),
    403,
    'Team A owner denied Team B chat context',
  );
  expectEqual(
    await apiStatus('/api/teams/chat?teamId=qa-team-a', tokens.get('qa-coach-owner-b')),
    403,
    'Team B owner denied Team A chat context',
  );
  expectEqual(
    await apiStatus('/api/teams/chat?teamId=qa-team-a', tokens.get('qa-removed-member')),
    403,
    'removed member denied former team context',
  );
  expectEqual(
    await apiStatus('/api/teams/chat?teamId=qa-team-a', tokens.get('qa-pending-delete')),
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
  expectEqual(
    await apiStatus('/api/auth/session', tokens.get('qa-unverified'), { method: 'POST' }),
    403,
    'unverified account denied browser session',
  );
}

async function runBrowserAudit() {
  if (!playwrightCli) throw new Error('PLAYWRIGHT_CLI is required with --browser.');
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
    const multiTeam = await browserLogin('qa-multi-team', '/dashboard', `team-switch-${process.pid}`);
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

}

async function cleanup() {
  if (runBrowser && playwrightCli) {
    spawnSync(playwrightCli, ['close-all'], { cwd: process.cwd(), env, stdio: 'ignore' });
  }
  for (const child of children.reverse()) {
    if (!child.killed) child.kill('SIGTERM');
  }
}

async function main() {
  await import('node:fs/promises').then(fs => fs.mkdir(logDir, { recursive: true }));
  process.once('SIGINT', () => cleanup().finally(() => process.exit(130)));
  process.once('SIGTERM', () => cleanup().finally(() => process.exit(143)));

  startProcess('npx', ['firebase', '--project', PROJECT_ID, 'emulators:start', '--only', 'auth,firestore,storage'], 'firebase.log');
  await Promise.all([waitForPort(9099), waitForPort(8080), waitForPort(9199)]);
  run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs']);

  startProcess('npm', ['run', 'dev'], 'next.log');
  await waitForHttp(`${BASE_URL}/login`);

  if (!scheduleAppOnly && !teamSwitchOnly && !alertsOnly && !identityOnly && !identityStateOnly && !deletionLoginOnly && !surfaceSmokeOnly && !surfaceRemainderOnly && !tournamentDenialOnly && !parentAdminSurfaceOnly && !workflowCommunicationOnly && !workflowChatProbeOnly && !workflowEventsOnly && !workflowFacilitiesOnly && !workflowEquipmentOnly) await runApiAudit();
  if (runBrowser) await runBrowserAudit();
  console.log(`Phase 2 emulator audit completed${runBrowser ? ' with browser routes' : ''}.`);
}

main()
  .catch(error => {
    console.error(redact(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  })
  .finally(cleanup);
