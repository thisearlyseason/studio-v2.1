import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, readFile, realpath, rm, stat } from 'node:fs/promises';
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
const wrapperPath = '/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh';
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

async function validatePinnedConfig({ verifyWrapper = false } = {}) {
  const config = JSON.parse(await readFile(childConfig, 'utf8'));
  if (
    Object.keys(config).sort().join(',') !== 'origin,projectId,wrapperPath,wrapperSha256'
    || config.projectId !== STAGING_PROJECT_ID || config.origin !== STAGING_ORIGIN
    || config.wrapperPath !== wrapperPath || !/^[0-9a-f]{64}$/.test(config.wrapperSha256)
  ) throw new Error('Pinned child configuration is invalid.');
  if (verifyWrapper) {
    const wrapperMetadata = await lstat(wrapperPath);
    if (
      !wrapperMetadata.isFile() || wrapperMetadata.isSymbolicLink()
      || (wrapperMetadata.mode & 0o111) === 0 || (wrapperMetadata.mode & 0o022) !== 0
      || await realpath(wrapperPath) !== wrapperPath
      || await sha256(wrapperPath) !== config.wrapperSha256
    ) throw new Error('Pinned system Chrome wrapper is invalid.');
  }
  return config;
}

async function buildRunnerCommand() {
  await validatePinnedConfig();
  return Object.freeze({
    entrypoint: childEntrypoint,
    entrypointSha256: await sha256(childEntrypoint),
    configFiles: Object.freeze([Object.freeze({ path: childConfig, sha256: await sha256(childConfig) })]),
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
  const { stdout } = await execFileAsync(wrapperPath, [...args, '--json'], {
    cwd: repositoryRoot, env: process.env, timeout: 90_000, maxBuffer: 1_048_576,
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
  await validatePinnedConfig({ verifyWrapper: true });
  await buildRunnerCommand();
  const initial = await runWrapper(['list']);
  if (!initial || !Array.isArray(initial.browsers) || initial.browsers.length !== 0) {
    throw new Error('Offline smoke requires an empty initial browser inventory.');
  }
  const client = createPlaywrightCliClient({ wrapperPath });
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

async function hosted(argv, env, stdout) {
  if (argv[0] !== '--staging') throw new Error('Hosted execution requires the explicit staging flag --staging.');
  const values = exactArgs(argv.slice(1), [
    '--project', '--confirm-project', '--origin', '--deployed-sha', '--staging-run', '--pull-request',
    '--workspace', '--manifest', '--credentials', '--expires-at', '--wrapper',
  ]);
  if (
    values['--project'] !== STAGING_PROJECT_ID || values['--confirm-project'] !== STAGING_PROJECT_ID
    || values['--origin'] !== STAGING_ORIGIN || values['--wrapper'] !== wrapperPath
    || env.ALLOW_STAGING_QA_FIXTURES !== 'true'
  ) throw new Error('Hosted execution requires exact staging confirmation and system Chrome wrapper.');
  await validatePinnedConfig({ verifyWrapper: true });
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
  const [{ stdout: localHead }, { stdout: localStatus }] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, timeout: 10_000, maxBuffer: 65_536 }),
    execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repositoryRoot, timeout: 10_000, maxBuffer: 262_144 }),
  ]);
  if (localHead.trim() !== values['--deployed-sha'] || localStatus.trim() !== '') {
    throw new Error('Hosted execution requires the exact clean deployed repository SHA.');
  }
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
