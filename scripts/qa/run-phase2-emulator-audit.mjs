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

  if (!scheduleAppOnly && !teamSwitchOnly && !alertsOnly) await runApiAudit();
  if (runBrowser) await runBrowserAudit();
  console.log(`Phase 2 emulator audit completed${runBrowser ? ' with browser routes' : ''}.`);
}

main()
  .catch(error => {
    console.error(redact(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  })
  .finally(cleanup);
