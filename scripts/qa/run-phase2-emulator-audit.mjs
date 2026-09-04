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
const timeOutOnly = process.argv.includes('--time-out-only');
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

function browserTimeOutAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => {
      localStorage.setItem('the-squad:time-out:sport', 'curling');
      localStorage.setItem('the-squad:time-out:difficulty', 'impossible');
    });
    await page.reload();
    const priorityAlert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
    const alertOpened = await priorityAlert.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
    if (alertOpened) {
      await priorityAlert.getByRole('button', { name: 'Got It' }).click();
      await priorityAlert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Open Time Out game' }).click();
    const dialog = page.getByRole('dialog', { name: 'TIME OUT' });
    await dialog.waitFor();
    await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))));
    const desktopBox = await dialog.boundingBox();
    const initial = {
      title: await dialog.getByText('TIME OUT', { exact: true }).count(),
      soccerSelected: (await dialog.getByRole('button', { name: 'Soccer' }).getAttribute('class'))?.includes('border-primary'),
      easySelected: (await dialog.getByRole('button', { name: 'Easy' }).getAttribute('class'))?.includes('border-primary'),
      desktopBox,
      desktopFits: Boolean(desktopBox && desktopBox.x >= -0.5 && desktopBox.y >= -0.5 && desktopBox.x + desktopBox.width <= 1440.5 && desktopBox.y + desktopBox.height <= 900.5),
    };

    const closeButton = dialog.getByRole('button', { name: 'Close Time Out' });
    const closeBox = await closeButton.boundingBox();
    const closeHitTarget = closeBox
      ? await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('aria-label') || '', {
          x: closeBox.x + closeBox.width / 2,
          y: closeBox.y + closeBox.height / 2,
        })
      : '';
    await dialog.getByRole('button', { name: 'Baseball' }).evaluate(element => element.click());
    await dialog.getByRole('button', { name: 'Hard' }).evaluate(element => element.click());
    await dialog.getByRole('button', { name: 'Enable sound' }).evaluate(element => element.click());
    await dialog.getByLabel(/baseball game canvas/i).focus();
    await page.keyboard.press('Space');
    const actionStatus = await dialog.getByText(/MISS|CONTACT/).count();
    await page.keyboard.press('r');
    const resetScore = await dialog.getByText(/YOU 0 — 0 CPU/).count();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobileBox = await dialog.boundingBox();
    const touchControls = await dialog.getByLabel('Touch controls').count();
    await dialog.getByRole('button', { name: 'Game action' }).evaluate(element => {
      for (let attempt = 0; attempt < 10; attempt += 1) element.click();
    });
    await dialog.getByRole('button', { name: 'Restart game' }).evaluate(element => element.click());
    const rapidResetScore = await dialog.getByText(/YOU 0 — 0 CPU/).count();
    await dialog.getByRole('button', { name: 'Close Time Out' }).evaluate(element => element.click());
    await dialog.waitFor({ state: 'hidden' });

    await page.reload();
    await page.getByRole('button', { name: 'Open Time Out game' }).click();
    const reopened = page.getByRole('dialog', { name: 'TIME OUT' });
    await reopened.waitFor();
    await reopened.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined))));
    const persisted = {
      baseballSelected: (await reopened.getByRole('button', { name: 'Baseball' }).getAttribute('class'))?.includes('border-primary'),
      hardSelected: (await reopened.getByRole('button', { name: 'Hard' }).getAttribute('class'))?.includes('border-primary'),
      muteControl: await reopened.getByRole('button', { name: 'Mute sound' }).count(),
    };
    return {
      ...initial,
      ...persisted,
      actionStatus,
      resetScore,
      rapidResetScore,
      closeHitTarget,
      touchControls,
      mobileBox,
      mobileFits: Boolean(mobileBox && mobileBox.x >= -0.5 && mobileBox.y >= -0.5 && mobileBox.x + mobileBox.width <= 390.5 && mobileBox.y + mobileBox.height <= 844.5),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertTimeOutAudit(timeOut) {
  if (!timeOut.desktopFits || !timeOut.mobileFits) {
    console.log(`Time Out bounds: ${JSON.stringify({ desktop: timeOut.desktopBox, mobile: timeOut.mobileBox })}`);
  }
  expectEqual(timeOut.title, 1, 'Time Out opens after corrupted local state');
  expectEqual(timeOut.soccerSelected, true, 'Time Out normalizes invalid stored sport');
  expectEqual(timeOut.easySelected, true, 'Time Out normalizes invalid stored difficulty');
  expectEqual(timeOut.desktopFits, true, 'Time Out desktop dialog fits viewport');
  expectEqual(timeOut.actionStatus, 1, 'Time Out action changes game status');
  expectEqual(timeOut.resetScore, 1, 'Time Out keyboard reset restores score');
  expectEqual(timeOut.closeHitTarget, 'Close Time Out', 'Time Out close button receives pointer input');
  expectEqual(timeOut.baseballSelected, true, 'Time Out sport preference persists');
  expectEqual(timeOut.hardSelected, true, 'Time Out difficulty preference persists');
  expectEqual(timeOut.muteControl, 1, 'Time Out sound preference persists');
  expectEqual(timeOut.touchControls, 1, 'Time Out exposes mobile touch controls');
  expectEqual(timeOut.rapidResetScore, 1, 'Time Out recovers from rapid mobile actions');
  expectEqual(timeOut.mobileFits, true, 'Time Out mobile dialog fits viewport');
  expectEqual(timeOut.consoleErrors.length, 0, 'Time Out browser console errors');
  expectEqual(timeOut.failedResponses.length, 0, 'Time Out failed network responses');
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
  if (timeOutOnly) {
    const player = await browserLogin('qa-adult-player-a', '/dashboard');
    assertTimeOutAudit(browserTimeOutAudit(player));
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

  const timeOutPlayer = await browserLogin('qa-adult-player-a', '/dashboard', 'time-out-player');
  assertTimeOutAudit(browserTimeOutAudit(timeOutPlayer));
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

  if (!timeOutOnly) await runApiAudit();
  if (runBrowser) await runBrowserAudit();
  console.log(`Phase 2 emulator audit completed${runBrowser ? ' with browser routes' : ''}.`);
}

main()
  .catch(error => {
    console.error(redact(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  })
  .finally(cleanup);
