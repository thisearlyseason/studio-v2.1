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
    values.set(name, value);
  }
  const required = ['--phase', '--workspace', '--manifest', '--credentials', '--config'];
  if (values.size !== required.length || required.some(name => !values.has(name))) process.exit(64);
  return values;
}

function writeMessage(value, callback) {
  nativeWrite(`${nativeJsonStringify(value)}\n`, callback);
}

function finish(phase, ok, browserSessions = []) {
  writeMessage({ version: 1, type: 'ownership', phase, browserSessions });
  writeMessage({ version: 1, type: 'completion', phase, ok, browserSessions }, () => nativeExit(0));
}

const args = parseArguments(process.argv.slice(2));
const phase = args.get('--phase');
const config = JSON.parse(readFileSync(args.get('--config'), 'utf8'));
const mode = config.mode;

if (mode === 'success') {
  finish(phase, true);
} else if (mode === 'own-before') {
  finish(phase, true, phase === 'before-transition' ? ['phase9-guardian-owned'] : []);
} else if (mode === 'fail-before' || mode === 'fail-after') {
  finish(phase, !mode.endsWith(phase === 'before-transition' ? 'before' : 'after'));
} else if (mode === 'mutate-globals') {
  writeMessage({ version: 1, type: 'ownership', phase, browserSessions: [] });
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
  writeMessage({ version: 1, type: 'completion', phase, ok: true, browserSessions: [] }, () => nativeExit(0));
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
  finish(phase, true);
} else if (mode === 'hidden-browser') {
  writeFileSync(`/tmp/phase9-guardian-child-browser-${process.ppid}`, 'open', { mode: 0o600 });
  finish(phase, true);
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
