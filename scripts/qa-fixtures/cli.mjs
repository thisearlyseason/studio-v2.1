import { randomBytes } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildFixtureDefinition } from './definition.mjs';
import { createFirebaseAdapter } from './firebase-adapter.mjs';
import { assertHostedStagingIntent, assertRequestedHostedStagingIntent } from './guard.mjs';
import { createLifecycle } from './lifecycle.mjs';
import { createRunId, validateManifest } from './manifest.mjs';

const COMMANDS = new Set(['preflight', 'seed', 'inspect', 'cleanup', 'transition']);
const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const MODULE_REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));

function argumentValue(argv, flag) {
  const positions = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (positions.length !== 1) throw new Error(`${flag} must appear exactly once with a value.`);
  const value = argv[positions[0] + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} must appear exactly once with a value.`);
  return value;
}

async function resolvedExternalPath(value, cwd, repositoryRoot, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} path is required.`);
  const resolvedRepositoryRoot = await realpath(resolve(repositoryRoot));
  const target = isAbsolute(value) ? resolve(value) : resolve(cwd, value);
  let physicalTarget;
  try {
    physicalTarget = await realpath(target);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    let parent = dirname(target);
    let suffix = target.slice(parent.length + 1);
    while (true) {
      try {
        physicalTarget = join(await realpath(parent), suffix);
        break;
      } catch (parentError) {
        if (parentError?.code !== 'ENOENT') throw parentError;
        const next = dirname(parent);
        if (next === parent) throw new Error(`${label} path parent must exist.`);
        suffix = join(parent.slice(next.length + 1), suffix);
        parent = next;
      }
    }
  }
  const fromRepository = relative(resolvedRepositoryRoot, physicalTarget);
  if (fromRepository === '' || (!fromRepository.startsWith('..') && !isAbsolute(fromRepository))) {
    throw new Error(`${label} path must resolve outside the repository.`);
  }
  return target;
}

async function readExternalManifest(manifestPath) {
  let file;
  try {
    file = await lstat(manifestPath);
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('Fixture manifest does not exist.');
    throw error;
  }
  if (!file.isFile() || file.isSymbolicLink()) throw new Error('Fixture manifest must be a regular file.');
  try {
    return validateManifest(JSON.parse(await readFile(manifestPath, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Fixture manifest must contain valid JSON.');
    throw error;
  }
}

function output(writer, value) {
  const line = `${JSON.stringify(value)}\n`;
  if (typeof writer === 'function') writer(line);
  else writer.write(line);
}

function defaultRunId() {
  return createRunId({ randomSuffix: randomBytes(6).toString('hex') });
}

function defaultExpiry() {
  return new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
}

function makeLifecycle({ adapter, definition, cwd, manifestPath }) {
  if (!adapter?.auth || !adapter?.firestore) throw new Error('Firebase adapter must expose exact Auth and Firestore operations.');
  return createLifecycle({
    auth: adapter.auth,
    firestore: adapter.firestore,
    definition,
    randomBytes,
    repositoryRoot: cwd,
    manifestPath,
  });
}

/**
 * Execute one guarded hosted-staging fixture command. The injectable surface
 * keeps import and tests inert; no Admin operation is reachable before guard.
 */
export async function runCli({
  argv = [],
  env = process.env,
  cwd = process.cwd(),
  repositoryRoot = MODULE_REPOSITORY_ROOT,
  adapterFactory = createFirebaseAdapter,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  void stderr;
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) throw new Error('argv must be an array of strings.');
  const command = argv[0];
  if (!COMMANDS.has(command)) throw new Error(`Unsupported fixture command: ${command || '(missing)'}.`);

  const credentialPath = command === 'seed'
    ? await resolvedExternalPath(argumentValue(argv, '--credentials'), cwd, repositoryRoot, 'Credential')
    : null;
  const manifestPath = command === 'preflight' ? null : await resolvedExternalPath(argumentValue(argv, '--manifest'), cwd, repositoryRoot, 'Manifest');
  const alias = command === 'transition' ? argumentValue(argv, '--alias') : null;

  // Reject malformed caller intent before creating even a read-only Admin client.
  assertRequestedHostedStagingIntent({ argv, env });

  // Resolving the Admin project is read-only. The second guard verifies it
  // agrees with the prechecked caller intent before lifecycle operations.
  const adapter = await adapterFactory({ env });
  const { projectId } = assertHostedStagingIntent({ argv, env, resolvedProjectId: adapter?.projectId });

  if (command === 'preflight') {
    output(stdout, {
      command,
      projectId,
      origin: STAGING_ORIGIN,
      plannedAliases: 9,
      plannedTeams: 2,
      safe: true,
    });
    return { command, projectId, safe: true };
  }

  let definition;
  if (command === 'seed') {
    const runId = argv.includes('--run-id') ? argumentValue(argv, '--run-id') : defaultRunId();
    const expiresAt = argv.includes('--expires-at') ? argumentValue(argv, '--expires-at') : defaultExpiry();
    definition = buildFixtureDefinition({ runId, expiresAt });
  } else {
    const manifest = await readExternalManifest(manifestPath);
    definition = buildFixtureDefinition({ runId: manifest.runId, expiresAt: manifest.expiresAt });
  }

  const connectedAdapter = typeof adapter.connect === 'function' ? adapter.connect() : adapter;
  const lifecycle = makeLifecycle({ adapter: connectedAdapter, definition, cwd: repositoryRoot, manifestPath });
  let result;
  if (command === 'seed') result = await lifecycle.seed({ manifestPath, credentialPath });
  if (command === 'inspect') result = await lifecycle.inspect({ manifestPath });
  if (command === 'cleanup') result = await lifecycle.cleanup({ manifestPath });
  if (command === 'transition') result = await lifecycle.applyNegativeState(alias);

  output(stdout, { command, ...result });
  return result;
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  runCli({ argv: process.argv.slice(2) }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
