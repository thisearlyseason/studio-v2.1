import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runGuardedLifecycle } from './lifecycle-guardian.mjs';
import { closeAndVerifyBrowsers, createPlaywrightCliClient } from './playwright-cli-client.mjs';
import {
  SCENARIO_GROUP_COUNTS,
  SCENARIO_TOTALS,
  STAGING_ORIGIN,
  STAGING_PROJECT_ID,
  validateLedger,
} from './scenario-contracts.mjs';
import { buildCanonicalScenarioPlan } from './scenarios.mjs';
import { writePhase9Evidence } from './evidence-writer.mjs';

const execFileAsync = promisify(execFile);
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');
const childEntrypoint = join(moduleDirectory, 'child-runner.mjs');
const childConfig = join(moduleDirectory, 'runner-config.json');
const fixtureCli = join(repositoryRoot, 'scripts', 'qa-fixtures', 'cli.mjs');
const evidenceDirectory = join(repositoryRoot, 'docs', 'qa', 'production-audit', 'runs', '2026-08-25-phase9-core-identities');
const playwrightModule = join(repositoryRoot, 'node_modules', '@playwright', 'cli', 'playwright-cli.js');
const playwrightPackage = join(repositoryRoot, 'node_modules', '@playwright', 'cli', 'package.json');
const packageLock = join(repositoryRoot, 'package-lock.json');
const PLAYWRIGHT_VERSION = '0.1.18';
const PLAYWRIGHT_MODULE_SHA256 = '66ea6722d77e57ce1bc7e850cb990d14895d17d8584405ed54a8c72fab38eb75';
const PLAYWRIGHT_PACKAGE_SHA256 = '184ed53662eadeeb6923f2890a87b3699ed5b09fc11ed5297ca7abd5356f3c09';
const PLAYWRIGHT_LOCK_INTEGRITY = 'sha512-ggNfYYH+GsZTGUiBEL8f6N5j0seYEUE52v+fIWqK/A36QG36cL0EJ79qWTXYO2uZMUU7vm+jk3x0fKCPL6UuIw==';
export const PHASE9_ARTIFACT_PINS = Object.freeze({
  child: 'bf03fdae3850554db5f8d286b40b156fc338c53a21c1fa3eb71dd1307eb9b3b6',
  config: '60956e4ac3b3341e55f4829fe520abe74130b8c6766854a8598075920562b268',
  transport: PLAYWRIGHT_MODULE_SHA256,
});
export const phase9PlaywrightTransport = Object.freeze({ version: PLAYWRIGHT_VERSION, modulePath: playwrightModule });
const githubRepository = 'thisearlyseason/studio-v2.1';

function exactArgs(argv, flags) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) throw new Error('CLI arguments are invalid.');
  const result = {};
  const consumed = new Set();
  for (const flag of flags) {
    const positions = argv.flatMap((value, index) => value === flag ? [index] : []);
    if (positions.length !== 1 || !argv[positions[0] + 1] || argv[positions[0] + 1].startsWith('--')) {
      throw new Error(`${flag} must appear exactly once with a value.`);
    }
    result[flag] = argv[positions[0] + 1];
    consumed.add(positions[0]);
    consumed.add(positions[0] + 1);
  }
  if (consumed.size !== argv.length || argv.some((_, index) => !consumed.has(index))) {
    throw new Error('CLI contains an unsupported argument.');
  }
  return result;
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function validatePinnedTransport() {
  const [moduleMetadata, packageMetadata, moduleHash, packageHash, packageJson, lock] = await Promise.all([
    lstat(playwrightModule), lstat(playwrightPackage), sha256(playwrightModule), sha256(playwrightPackage),
    readFile(playwrightPackage, 'utf8').then(JSON.parse), readFile(packageLock, 'utf8').then(JSON.parse),
  ]);
  const locked = lock?.packages?.['node_modules/@playwright/cli'];
  if (moduleMetadata.isSymbolicLink() || !moduleMetadata.isFile() || packageMetadata.isSymbolicLink() || !packageMetadata.isFile()
    || moduleHash !== PLAYWRIGHT_MODULE_SHA256 || packageHash !== PLAYWRIGHT_PACKAGE_SHA256
    || packageJson.version !== PLAYWRIGHT_VERSION || packageJson.bin?.['playwright-cli'] !== 'playwright-cli.js'
    || locked?.version !== PLAYWRIGHT_VERSION || locked?.integrity !== PLAYWRIGHT_LOCK_INTEGRITY) {
    throw new Error('Pinned local Playwright CLI transport is invalid.');
  }
}

async function validatePinnedConfig({ verifyTransport = false } = {}) {
  const config = JSON.parse(await readFile(childConfig, 'utf8'));
  if (
    Object.keys(config).sort().join(',') !== 'origin,playwrightModule,playwrightModuleSha256,playwrightVersion,projectId'
    || config.projectId !== STAGING_PROJECT_ID || config.origin !== STAGING_ORIGIN
    || config.playwrightModule !== playwrightModule || config.playwrightVersion !== PLAYWRIGHT_VERSION
    || config.playwrightModuleSha256 !== PLAYWRIGHT_MODULE_SHA256
  ) throw new Error('Pinned child configuration is invalid.');
  if (verifyTransport) await validatePinnedTransport();
  return config;
}

async function buildRunnerCommand() {
  await validatePinnedConfig();
  if (await sha256(childEntrypoint) !== PHASE9_ARTIFACT_PINS.child || await sha256(childConfig) !== PHASE9_ARTIFACT_PINS.config) {
    throw new Error('Committed runner bytes do not match the literal reviewed pins.');
  }
  return Object.freeze({
    entrypoint: childEntrypoint,
    entrypointSha256: PHASE9_ARTIFACT_PINS.child,
    configFiles: Object.freeze([Object.freeze({ path: childConfig, sha256: PHASE9_ARTIFACT_PINS.config })]),
  });
}

function validatePlan() {
  const plan = buildCanonicalScenarioPlan();
  const before = plan.filter(row => row.startState !== 'pending_deletion');
  const after = plan.filter(row => row.startState === 'pending_deletion');
  if (plan.length !== 44 || before.length !== 40 || after.length !== 4) throw new Error('Canonical scenario plan is incomplete.');
  return { plan, before, after };
}

async function dryRun(stdout) {
  const { plan, before, after } = validatePlan();
  const runnerCommand = await buildRunnerCommand();
  const result = {
    ok: true, command: 'dry-run', network: false, firebase: false, browserNavigation: false,
    projectId: STAGING_PROJECT_ID, origin: STAGING_ORIGIN, rows: plan.length,
    beforeTransition: before.length, afterTransition: after.length,
    childSha256: runnerCommand.entrypointSha256,
  };
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

async function runWrapper(args) {
  const { stdout } = await execFileAsync(process.execPath, [playwrightModule, ...args, '--json'], {
    cwd: repositoryRoot, env: { ...process.env, npm_config_offline: 'true' }, timeout: 90_000, maxBuffer: 1_048_576,
  });
  const result = JSON.parse(stdout);
  if (result?.isError === true) throw new Error('Playwright CLI reported an error.');
  return Object.hasOwn(result, 'result') ? result.result : result;
}

function guardianBrowserClient() {
  return Object.freeze({
    closeBrowser: session => runWrapper([`-s=${session}`, 'close']),
    listBrowsers: async () => {
      const result = await runWrapper(['list']);
      if (result && Array.isArray(result.browsers)) return result;
      throw new Error('Browser inventory is incomplete.');
    },
  });
}

async function offlineSmoke(stdout) {
  validatePlan();
  await validatePinnedConfig({ verifyTransport: true });
  await buildRunnerCommand();
  const initial = await runWrapper(['list']);
  if (!initial || !Array.isArray(initial.browsers) || initial.browsers.length !== 0) {
    throw new Error('Offline smoke requires an empty initial browser inventory.');
  }
  const client = createPlaywrightCliClient({ transportModule: playwrightModule, env: { ...process.env, npm_config_offline: 'true' } });
  try {
    const { stdout: smokeOutput } = await execFileAsync(process.execPath, [
      join(moduleDirectory, 'playwright-cli-client.mjs'), 'smoke', '--origin', 'about:blank',
    ], { cwd: repositoryRoot, timeout: 120_000, maxBuffer: 1_048_576 });
    const smoke = JSON.parse(smokeOutput);
    if (smoke.ok !== true || smoke.origin !== 'about:blank' || smoke.browsers !== 0) throw new Error('Offline smoke failed.');
    await closeAndVerifyBrowsers(client);
    const result = { ok: true, command: 'offline-smoke', origin: 'about:blank', browsers: 0, network: false, firebase: false };
    stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } finally {
    await closeAndVerifyBrowsers(client).catch(() => {});
  }
}

async function requireWorkspace(path, manifestPath, credentialPath) {
  if (!/^\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/.test(path)) throw new Error('Workspace must be an exact external Phase 9 path.');
  if (manifestPath !== join(path, 'manifest.json') || credentialPath !== join(path, 'credentials.json')) {
    throw new Error('Manifest and credential paths must be exact children of the workspace.');
  }
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o700) {
    throw new Error('Workspace must be a real mode-0700 directory.');
  }
  for (const candidate of [manifestPath, credentialPath]) {
    try { await lstat(candidate); throw new Error('Workspace must be fresh.'); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function githubPreconditionVerifier({ deployedSha, stagingRunId, pullRequestNumber }) {
  const command = async args => {
    const { stdout } = await execFileAsync('gh', args, { cwd: repositoryRoot, timeout: 30_000, maxBuffer: 262_144 });
    return JSON.parse(stdout);
  };
  const run = await command([
    'run', 'view', stagingRunId, '--repo', githubRepository, '--json',
    'databaseId,event,workflowName,status,conclusion,headSha,jobs',
  ]);
  const pullRequest = await command([
    'pr', 'view', String(pullRequestNumber), '--repo', githubRepository, '--json',
    'state,mergedAt,headRefOid,baseRefName,isDraft',
  ]);
  const requiredSteps = new Set([
    'Validate staging configuration', 'Verify App Hosting target ownership', 'Deploy Firestore indexes',
    'Deploy Functions', 'Deploy Firestore and Storage rules', 'Roll out App Hosting commit', 'Verify staging health',
  ]);
  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  const steps = jobs.flatMap(job => Array.isArray(job.steps) ? job.steps : []);
  if (
    String(run.databaseId) !== stagingRunId
    || run.workflowName !== 'Deploy staging'
    || run.event !== 'workflow_dispatch'
    || jobs.length !== 1
    || jobs[0]?.name !== 'Verify and deploy staging'
    || jobs[0]?.status !== 'completed'
    || jobs[0]?.conclusion !== 'success'
    || [...requiredSteps].some(name => !steps.some(step => (
      step?.name === name && step?.status === 'completed' && step?.conclusion === 'success'
    )))
    || pullRequest.baseRefName !== 'agent/phase8-confirmed-defect-repair'
    || pullRequest.isDraft !== false
  ) throw new Error('Authoritative staging deployment or pull-request admission failed.');
  return {
    deployedSha, stagingRunId, runStatus: run.status, runConclusion: run.conclusion, runSha: run.headSha,
    pullRequestNumber, pullRequestState: pullRequest.state,
    pullRequestMerged: pullRequest.mergedAt !== null, pullRequestHeadSha: pullRequest.headRefOid,
  };
}

async function requireCleanExactSha(deployedSha) {
  const [{ stdout: head }, { stdout: statusOutput }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, timeout: 10_000, maxBuffer: 65_536 }),
    execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repositoryRoot, timeout: 10_000, maxBuffer: 262_144 }),
  ]);
  if (head.trim() !== deployedSha || statusOutput.trim() !== '') throw new Error('Hosted execution requires the exact clean deployed repository SHA.');
}

async function verifyAdmittedRunnerBlobs(deployedSha) {
  for (const [relativePath, path, pin] of [
    ['scripts/qa-evidence/phase9/child-runner.mjs', childEntrypoint, PHASE9_ARTIFACT_PINS.child],
    ['scripts/qa-evidence/phase9/runner-config.json', childConfig, PHASE9_ARTIFACT_PINS.config],
  ]) {
    const [{ stdout: blob }, worktree] = await Promise.all([
      execFileAsync('git', ['cat-file', 'blob', `${deployedSha}:${relativePath}`], { cwd: repositoryRoot, encoding: 'buffer', timeout: 10_000, maxBuffer: 1_048_576 }),
      readFile(path),
    ]);
    if (!Buffer.from(blob).equals(worktree) || createHash('sha256').update(blob).digest('hex') !== pin) {
      throw new Error('Admitted runner bytes do not match the deployed Git blob and literal reviewed pin.');
    }
  }
}

async function hosted(argv, env, stdout) {
  if (argv[0] !== '--staging') throw new Error('Hosted execution requires the explicit staging flag --staging.');
  const values = exactArgs(argv.slice(1), [
    '--project', '--confirm-project', '--origin', '--deployed-sha', '--staging-run', '--pull-request',
    '--workspace', '--manifest', '--credentials', '--expires-at', '--transport',
  ]);
  if (
    values['--project'] !== STAGING_PROJECT_ID || values['--confirm-project'] !== STAGING_PROJECT_ID
    || values['--origin'] !== STAGING_ORIGIN || values['--transport'] !== playwrightModule
    || env.ALLOW_STAGING_QA_FIXTURES !== 'true'
  ) throw new Error('Hosted execution requires exact staging confirmation and pinned local Chrome transport.');
  await validatePinnedConfig({ verifyTransport: true });
  if (!/^[0-9a-f]{40}$/.test(values['--deployed-sha']) || !/^[1-9][0-9]{5,20}$/.test(values['--staging-run'])) {
    throw new Error('Hosted deployment linkage is invalid.');
  }
  const pullRequestNumber = Number(values['--pull-request']);
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) throw new Error('Pull request number is invalid.');
  if (Number.isNaN(Date.parse(values['--expires-at']))) throw new Error('Fixture expiry is invalid.');
  const workspace = resolve(values['--workspace']);
  const manifest = resolve(values['--manifest']);
  const credentials = resolve(values['--credentials']);
  await requireWorkspace(workspace, manifest, credentials);
  await requireCleanExactSha(values['--deployed-sha']);
  await verifyAdmittedRunnerBlobs(values['--deployed-sha']);
  await requireCleanExactSha(values['--deployed-sha']);
  validatePlan();
  const runnerCommand = await buildRunnerCommand();
  const [{ createFirebaseAdapter }, { removeCredentialFile }] = await Promise.all([
    import('../../qa-fixtures/firebase-adapter.mjs'), import('../../qa-fixtures/lifecycle.mjs'),
  ]);
  const fixtureEnvironment = { ...env, ALLOW_STAGING_QA_FIXTURES: 'true', GOOGLE_CLOUD_PROJECT: STAGING_PROJECT_ID };
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) delete fixtureEnvironment[name];
  const fixtureCommand = async commandArgs => {
    try {
      const { stdout: commandOutput } = await execFileAsync(process.execPath, [fixtureCli, ...commandArgs], {
        cwd: repositoryRoot, env: fixtureEnvironment, timeout: 180_000, maxBuffer: 262_144,
      });
      return { exitCode: 0, stdout: commandOutput };
    } catch (error) {
      return { exitCode: Number.isInteger(error?.code) ? error.code : 1, stdout: typeof error?.stdout === 'string' ? error.stdout : '' };
    }
  };
  const filesystem = {
    mkdtemp: async prefix => {
      if (prefix !== '/tmp/phase9-core-identities.') throw new Error('Workspace prefix is invalid.');
      await requireWorkspace(workspace, manifest, credentials);
      return workspace;
    },
    chmod, stat, lstat, readFile,
    removeCredentialFile: path => removeCredentialFile(path, repositoryRoot),
    rm: (path, options) => rm(path, options),
  };
  await requireCleanExactSha(values['--deployed-sha']);
  const lifecycle = await runGuardedLifecycle({
    fixtureCommand,
    browserClient: guardianBrowserClient(),
    adapterFactory: options => createFirebaseAdapter({ ...options, env: fixtureEnvironment }),
    preconditionVerifier: githubPreconditionVerifier,
    runnerCommand,
    filesystem,
    repositoryRoot,
    scenarioJoinTimeoutMs: 60_000,
    options: {
      projectId: STAGING_PROJECT_ID, origin: STAGING_ORIGIN, expiresAt: values['--expires-at'],
      deployedSha: values['--deployed-sha'], stagingRunId: values['--staging-run'], pullRequestNumber,
    },
  });
  if (lifecycle.ok !== true) throw new Error(`Guarded lifecycle failed safely: ${lifecycle.category}.`);
  validateLedger(lifecycle.rows, { groupCounts: SCENARIO_GROUP_COUNTS, totals: SCENARIO_TOTALS });
  await writePhase9Evidence({
    lifecycle, rows: lifecycle.rows,
    deployment: {
      projectId: STAGING_PROJECT_ID, origin: STAGING_ORIGIN, deployedSha: values['--deployed-sha'],
      stagingRunId: values['--staging-run'], pullRequestNumber,
    },
    outputDirectory: evidenceDirectory,
  });
  const result = { ok: true, command: 'hosted', rows: 44, closureCertified: true, browsers: 0 };
  stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

export async function runPhase9Cli({ argv = process.argv.slice(2), env = process.env, stdout = process.stdout } = {}) {
  const command = argv[0];
  if (command === 'dry-run' && argv.length === 1) return dryRun(stdout);
  if (command === 'offline-smoke' && argv.length === 1) return offlineSmoke(stdout);
  if (command === 'hosted') return hosted(argv.slice(1), env, stdout);
  throw new Error('Command must be dry-run, offline-smoke, or hosted.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runPhase9Cli().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { buildRunnerCommand };
