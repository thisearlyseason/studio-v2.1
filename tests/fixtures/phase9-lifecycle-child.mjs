import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

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

function finishWithRows(phase, mode, browserSessions = [], ok = true) {
  let rows = phaseRows(phase);
  if (mode === 'row-extra-field') rows[0] = { ...rows[0], raw: 'forbidden' };
  if (mode === 'row-duplicate') rows[1] = { ...rows[1], contextId: rows[0].contextId };
  if (mode === 'row-out-of-order') [rows[0], rows[1]] = [rows[1], rows[0]];
  if (mode === 'row-wrong-phase') rows = phaseRows(phase === 'before-transition' ? 'after-transition' : 'before-transition');
  writeMessage({ version: 1, type: 'ownership', phase, browserSessions });
  const emitted = mode === 'row-early-completion' ? rows.slice(0, 1) : rows;
  emitted.forEach((row, index) => writeMessage({ version: 1, type: 'row', phase, index, row }));
  writeMessage({
    version: 1,
    type: 'completion',
    phase,
    ok,
    browserSessions,
    rowCount: rows.length,
  }, () => nativeExit(0));
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
  writeMessage({ version: 1, type: 'ownership', phase, browserSessions: [] });
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
    version: 1, type: 'completion', phase, ok: true, browserSessions: [], rowCount: rows.length,
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
} else {
  nativeExit(65);
}
