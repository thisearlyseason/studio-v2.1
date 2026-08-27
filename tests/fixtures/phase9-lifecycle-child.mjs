import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const nativeJsonStringify = JSON.stringify;
const nativeSetInterval = globalThis.setInterval;
const nativeSetTimeout = globalThis.setTimeout;
const nativeWrite = process.stdout.write.bind(process.stdout);
const nativeExit = process.exit.bind(process);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || typeof value !== 'string') process.exit(64);
    if (name === '--config-base64') {
      const configs = values.get(name) ?? [];
      configs.push(value);
      values.set(name, configs);
    } else {
      if (values.has(name)) process.exit(64);
      values.set(name, value);
    }
  }
  const required = ['--phase', '--workspace', '--manifest', '--credentials', '--guardian-marker-env'];
  const hasPathConfig = values.has('--config');
  const hasInlineConfig = values.has('--config-base64');
  if (
    required.some(name => !values.has(name))
    || hasPathConfig === hasInlineConfig
    || values.size !== required.length + 1
  ) process.exit(64);
  return values;
}

function writeMessage(value, callback) {
  nativeWrite(`${nativeJsonStringify(value)}\n`, callback);
}

const admissionAliases = [
  'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-league-creator', 'qa-school-admin',
  'qa-superadmin', 'qa-fake-superadmin', 'qa-missing-profile', 'qa-no-team',
];
const isolationAliases = [
  'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b',
];
const logoutAliases = [
  'qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
];
const viewports = [['mobile', '390x844'], ['desktop', '1440x900']];

function phaseRows(phase) {
  const rows = [];
  for (const [viewportName, viewport] of viewports) {
    if (phase === 'before-transition') {
      for (const alias of admissionAliases) rows.push({
        contextId: `admission-route-${alias}-${viewportName}`, group: 'admission-route', alias,
        viewport, startState: 'fresh-context',
      });
      for (const alias of isolationAliases) rows.push({
        contextId: `isolation-${alias}-${viewportName}`, group: 'isolation', alias,
        viewport, startState: 'authenticated',
      });
      for (const alias of logoutAliases) rows.push({
        contextId: `logout-${alias}-${viewportName}`, group: 'logout', alias,
        viewport, startState: 'authenticated-two-tab',
      });
      rows.push({
        contextId: `pending-deletion-active-baseline-${viewportName}`, group: 'pending-deletion',
        alias: 'qa-pending-delete', viewport, startState: 'active',
      });
    } else {
      for (const scenario of ['stale-session', 'fresh-login']) rows.push({
        contextId: `pending-deletion-${scenario}-${viewportName}`, group: 'pending-deletion',
        alias: 'qa-pending-delete', viewport, startState: 'pending_deletion',
      });
    }
  }
  return rows.map(row => ({
    ...row,
    startUrl: 'about:blank',
    action: 'execute committed scenario',
    expectedResult: 'policy enforced',
    finalUrl: 'https://studio--the-squad-v2-staging.us-east4.hosted.app/dashboard',
    visibleState: 'Dashboard',
    sessionPresent: true,
    protectedRequests: 0,
    protectedListenerStarts: 0,
    relevantHttpDataResult: 'none',
    pageErrors: 0,
    appConsoleErrors: 0,
    unexpectedRequestFailures: 0,
    overflow: 0,
    result: 'PASS',
  }));
}

const fakeLaunchReceipts = browserSessions => browserSessions.map((session, index) => ({
  session, daemonPid: 900_001 + (index * 2), chromeMainPid: 900_002 + (index * 2),
}));

function finishWithRows(phase, mode, browserSessions = [], ok = true) {
  let rows = phaseRows(phase);
  if (mode === 'row-extra-field') rows[0] = { ...rows[0], raw: 'forbidden' };
  if (mode === 'row-duplicate') rows[1] = { ...rows[1], contextId: rows[0].contextId };
  if (mode === 'row-out-of-order') [rows[0], rows[1]] = [rows[1], rows[0]];
  if (mode === 'row-wrong-phase') rows = phaseRows(phase === 'before-transition' ? 'after-transition' : 'before-transition');
  const launchReceipts = fakeLaunchReceipts(browserSessions);
  writeMessage({
    version: 2, type: 'ownership', phase, browserSessions,
    attachedBrowserSessions: [], launchReceipts,
  });
  finishRowsAfterOwnership(phase, mode, browserSessions, ok, rows, launchReceipts);
}

function finishRowsAfterOwnership(
  phase, mode, browserSessions = [], ok = true, suppliedRows,
  launchReceipts = fakeLaunchReceipts(browserSessions), attachedBrowserSessions = [],
) {
  const rows = suppliedRows ?? phaseRows(phase);
  const emitted = mode === 'row-early-completion' ? rows.slice(0, 1) : rows;
  emitted.forEach((row, index) => writeMessage({ version: 1, type: 'row', phase, index, row }));
  writeMessage({
    version: 2,
    type: 'completion',
    phase,
    ok,
    browserSessions,
    attachedBrowserSessions,
    launchReceipts,
    rowCount: rows.length,
  }, () => nativeExit(0));
}

function realLaunchReceipt(session, guardianMarkerName, marker) {
  const output = execFileSync('/bin/ps', ['eww', '-axo', 'pid=,ppid=,command='], {
    encoding: 'utf8', env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, maxBuffer: 16_777_216,
    timeout: 30_000,
  });
  const token = `${guardianMarkerName}=${marker}`;
  const records = output.split('\n').flatMap(line => {
    const words = line.split(/\s+/);
    if (!words.includes(token) && !words.includes(`--${token}`)) return [];
    const match = /^\s*([1-9][0-9]*)\s+([0-9]+)\s+/.exec(line);
    if (!match) return [];
    const pid = Number(match[1]);
    const command = execFileSync('/bin/ps', ['-p', String(pid), '-o', 'command='], {
      encoding: 'utf8', env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, timeout: 30_000,
    }).trim();
    return [{ pid, ppid: Number(match[2]), command }];
  });
  const daemonPattern = new RegExp(
    `^${process.execPath.replaceAll('.', '\\.')} /private/tmp/phase9-playwright-transport\\.[0-9a-f]{48}`
      + `/node_modules/playwright-core/lib/entry/cliDaemon\\.js ${session} --browser=chrome$`,
  );
  const daemons = records.filter(record => daemonPattern.test(record.command));
  if (daemons.length !== 1) throw new Error('fixture-launch-receipt-invalid');
  const mains = records.filter(record => record.ppid === daemons[0].pid
    && record.command.startsWith('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome ')
    && !record.command.includes(' --type=')
    && record.command.includes(` --${token}`));
  if (mains.length !== 1) throw new Error('fixture-launch-receipt-invalid');
  return { session, daemonPid: daemons[0].pid, chromeMainPid: mains[0].pid };
}

async function runRealRetainedBrowser(mode, phase, args) {
  const clientModule = await import(pathToFileURL(join(
    process.cwd(), 'scripts', 'qa-evidence', 'phase9', 'playwright-cli-client.mjs',
  )).href);
  const sessions = mode.includes('two-sessions')
    ? ['phase9-real-guardian-retained-a', 'phase9-real-guardian-retained-b']
    : ['phase9-real-guardian-retained'];
  const viewports = Object.fromEntries(sessions.map((session, index) => [
    session, index === 0 ? { width: 390, height: 844 } : { width: 1440, height: 900 },
  ]));
  const guardianMarkerName = args.get('--guardian-marker-env');
  const marker = process.env[guardianMarkerName];
  if (!/^[0-9a-f]{64}$/.test(marker ?? '')) nativeExit(66);
  const transport = clientModule.capturePlaywrightTransport();
  const client = clientModule.createPlaywrightCliClient({
    transport,
    guardianMarkerName,
    sourceEnvironment: process.env,
    cwd: process.cwd(),
    timeoutMs: 90_000,
  });
  const browserSessions = phase === 'before-transition' ? sessions : [];
  const attachedBrowserSessions = phase === 'after-transition' ? sessions : [];
  const launchReceipts = [];
  const infoPath = `/tmp/phase9-guardian-real-retained-${process.ppid}-${phase}.json`;
  if (phase === 'before-transition') {
    if (mode !== 'real-retained-browser-missing-session') {
      for (const session of sessions) {
        await clientModule.installSignalRecorder(client, session);
        launchReceipts.push(realLaunchReceipt(session, guardianMarkerName, marker));
        await clientModule.setAndVerifyViewport(client, session, viewports[session]);
        await client.runCode(session, `async (page) => {
          page.__phase9RetainedSessionMarker = ${nativeJsonStringify(session)};
          return true;
        }`);
      }
      if (mode === 'real-retained-browser-two-sessions-missing-second-chrome') {
        process.kill(launchReceipts[1].chromeMainPid, 'SIGKILL');
      }
    }
    if (launchReceipts.length === 0) launchReceipts.push(...fakeLaunchReceipts(browserSessions));
    let roguePid = null;
    if (mode === 'real-retained-browser-rogue') {
      const rogue = spawn(process.execPath, [
        '-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", 'phase9-real-retained-rogue',
      ], { detached: true, env: process.env, stdio: 'ignore' });
      rogue.unref();
      roguePid = rogue.pid;
    }
    if (mode === 'real-retained-browser-two-sessions-extra-direct-chrome') {
      const extra = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
        '--headless', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0',
        `--user-data-dir=/tmp/phase9-extra-chrome-${process.ppid}`,
        `--${guardianMarkerName}=${marker}`, 'about:blank',
      ], { detached: true, env: process.env, stdio: 'ignore' });
      extra.unref();
      roguePid = extra.pid;
    }
    let lookalikePath = null;
    let lookalikeRoot = null;
    if (mode === 'real-retained-browser-two-sessions-lookalike-daemon') {
      lookalikePath = `/tmp/phase9-lookalike-node-${process.ppid}`;
      lookalikeRoot = `/private/tmp/phase9-playwright-transport.${marker.slice(0, 48)}`;
      const fakeEntrypoint = `${lookalikeRoot}`
        + '/node_modules/playwright-core/lib/entry/cliDaemon.js';
      copyFileSync(process.execPath, lookalikePath);
      chmodSync(lookalikePath, 0o700);
      mkdirSync(join(fakeEntrypoint, '..'), { recursive: true, mode: 0o700 });
      writeFileSync(fakeEntrypoint, 'setInterval(() => {}, 1000);\n', { mode: 0o600 });
      const lookalike = spawn(lookalikePath, [
        fakeEntrypoint, sessions[0], '--browser=chrome',
      ], { argv0: process.execPath, detached: true, env: process.env, stdio: 'ignore' });
      lookalike.unref();
      roguePid = lookalike.pid;
    }
    writeMessage({
      version: 2, type: 'ownership', phase, browserSessions,
      attachedBrowserSessions, launchReceipts,
    });
    writeFileSync(infoPath, nativeJsonStringify({
      marker, roguePid, sessions, launchReceipts,
      lookalikePath, lookalikeRoot, viewports,
    }), { mode: 0o600 });
  } else {
    for (const session of sessions) await clientModule.attachExistingSignalRecorder(client, session, {
      ...viewports[session], marker: session,
    });
    writeMessage({
      version: 2, type: 'ownership', phase, browserSessions,
      attachedBrowserSessions, launchReceipts,
    });
    writeFileSync(infoPath, nativeJsonStringify({
      attached: true, marker, sessions, viewports,
    }), { mode: 0o600 });
  }
  finishRowsAfterOwnership(
    phase, mode, browserSessions, true, undefined, launchReceipts, attachedBrowserSessions,
  );
}

const args = parseArguments(process.argv.slice(process.argv[1]?.startsWith('--') ? 1 : 2));
const phase = args.get('--phase');
const configText = args.has('--config')
  ? readFileSync(args.get('--config'), 'utf8')
  : Buffer.from(args.get('--config-base64')[0], 'base64').toString('utf8');
const config = JSON.parse(configText);
const mode = config.mode;

if (process.env.NODE_OPTIONS !== undefined || process.env.NODE_PATH !== undefined) {
  writeFileSync(`/tmp/phase9-guardian-preload-env-${process.ppid}`, 'leaked', { mode: 0o600 });
}

if (mode === 'success') {
  finishWithRows(phase, mode);
} else if (new Set([
  'row-protocol-success', 'row-extra-field', 'row-duplicate', 'row-out-of-order',
  'row-wrong-phase', 'row-early-completion',
]).has(mode)) {
  finishWithRows(phase, mode);
} else if (mode === 'own-before') {
  finishWithRows(phase, mode, phase === 'before-transition' ? ['phase9-guardian-owned'] : []);
} else if (mode === 'fail-before' || mode === 'fail-after') {
  finishWithRows(phase, mode, [], !mode.endsWith(phase === 'before-transition' ? 'before' : 'after'));
} else if (mode === 'mutate-globals') {
  const rows = phaseRows(phase);
  writeMessage({
    version: 2, type: 'ownership', phase, browserSessions: [],
    attachedBrowserSessions: [], launchReceipts: [],
  });
  rows.forEach((row, index) => {
    writeMessage({ version: 1, type: 'row', phase, index, row });
  });
  Promise.prototype.then = () => ({ forged: true });
  globalThis.Promise = function ForgedPromise() {};
  Object.keys = () => [];
  Object.prototype.phase9ChildMutation = true;
  Array.isArray = () => false;
  Array.prototype.push = () => 99;
  Reflect.ownKeys = () => [];
  Reflect.apply = () => ({ forged: true });
  globalThis.setTimeout = () => 99;
  globalThis.clearTimeout = () => {};
  writeMessage({
    version: 2, type: 'completion', phase, ok: true, browserSessions: [],
    attachedBrowserSessions: [], launchReceipts: [], rowCount: rows.length,
  }, () => nativeExit(0));
} else if (mode === 'forged-claims') {
  writeMessage({ version: 1, type: 'ownership', phase, browserSessions: [] });
  writeMessage({
    version: 1, type: 'completion', phase, ok: true, closed: true, browserSessions: [],
  });
  process.on('SIGTERM', () => {});
  nativeSetInterval(() => {}, 1_000);
} else if (mode === 'rogue-process') {
  const grandchild = spawn(process.execPath, [
    '-e',
    "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
    `phase9-rogue-${process.ppid}`,
  ], { stdio: 'ignore' });
  writeFileSync(
    `/tmp/phase9-guardian-child-rogue-${process.ppid}.json`,
    nativeJsonStringify({ pid: grandchild.pid }),
    { mode: 0o600 },
  );
  finishWithRows(phase, mode);
} else if (mode === 'detached-rogue-process') {
  const grandchild = spawn(process.execPath, [
    '-e',
    "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
    `phase9-detached-rogue-${process.ppid}`,
  ], { detached: true, env: process.env, stdio: 'ignore' });
  grandchild.unref();
  writeFileSync(
    `/tmp/phase9-guardian-child-detached-${process.ppid}.json`,
    nativeJsonStringify({ pid: grandchild.pid }),
    { mode: 0o600 },
  );
  finishWithRows(phase, mode);
} else if (mode === 'detached-malformed-argv-rogue') {
  const grandchild = spawn(process.execPath, [
    '-e',
    "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)",
    'x'.repeat(20_000),
  ], { detached: true, env: process.env, stdio: 'ignore' });
  grandchild.unref();
  writeFileSync(
    `/tmp/phase9-guardian-child-malformed-${process.ppid}.json`,
    nativeJsonStringify({ pid: grandchild.pid }),
    { mode: 0o600 },
  );
  finishWithRows(phase, mode);
} else if (mode === 'start-marker-success') {
  writeFileSync(`/tmp/phase9-guardian-child-start-${process.ppid}`, 'started', { mode: 0o600 });
  finishWithRows(phase, mode);
} else if (mode === 'hidden-browser') {
  writeFileSync(`/tmp/phase9-guardian-child-browser-${process.ppid}`, 'open', { mode: 0o600 });
  finishWithRows(phase, mode);
} else if (mode === 'stdio-overflow') {
  nativeWrite('x'.repeat(70_000));
  process.on('SIGTERM', () => {});
  nativeSetInterval(() => {}, 1_000);
} else if (mode === 'hang-without-signal') {
  process.on('SIGTERM', () => {});
  nativeSetInterval(() => {}, 1_000);
} else if (mode === 'hang-resume-late-write') {
  const latePath = `/tmp/phase9-guardian-child-late-${process.ppid}`;
  writeFileSync(`/tmp/phase9-guardian-child-hang-${process.ppid}`, 'started', { mode: 0o600 });
  writeMessage({
    version: 1, type: 'ownership', phase, browserSessions: ['phase9-hang-owned'],
  });
  process.on('SIGTERM', () => {
    nativeSetTimeout(() => {
      writeFileSync(latePath, 'late child mutation', { mode: 0o600 });
    }, 150);
  });
  nativeSetInterval(() => {}, 1_000);
} else if (new Set([
  'real-retained-browser', 'real-retained-browser-rogue',
  'real-retained-browser-missing-session',
  'real-retained-browser-two-sessions',
  'real-retained-browser-two-sessions-missing-second-chrome',
  'real-retained-browser-two-sessions-extra-direct-chrome',
  'real-retained-browser-two-sessions-lookalike-daemon',
]).has(mode)) {
  await runRealRetainedBrowser(mode, phase, args);
} else {
  nativeExit(65);
}
