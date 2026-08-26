import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, lstat, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runGuardedLifecycle } from './lifecycle-guardian.mjs';
import {
  closeAndVerifyBrowsers, createPlaywrightCliClient, phase9CapturedPlaywrightTransport,
  executeCapturedPlaywrightTransportCommand,
} from './playwright-cli-client.mjs';
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
const evidenceHelper = join(moduleDirectory, 'evidence-dirfd-helper.py');
const fixtureCli = join(repositoryRoot, 'scripts', 'qa-fixtures', 'cli.mjs');
const evidenceDirectory = join(repositoryRoot, 'docs', 'qa', 'production-audit', 'runs', '2026-08-25-phase9-core-identities');
const playwrightArtifact = join(moduleDirectory, 'playwright-transport.bundle.json.gz');
const playwrightManifest = join(moduleDirectory, 'playwright-transport-manifest.json');
const playwrightEntrySource = join(moduleDirectory, 'playwright-transport-entry.cjs');
const playwrightModuleGuard = join(moduleDirectory, 'playwright-transport-module-guard.cjs');
const playwrightBuilder = join(moduleDirectory, 'build-playwright-transport.mjs');
const playwrightClient = join(moduleDirectory, 'playwright-cli-client.mjs');
const PLAYWRIGHT_VERSION = '0.1.18';
const PLAYWRIGHT_CORE_VERSION = '1.63.0-alpha-2026-08-05';
const PLAYWRIGHT_ARTIFACT_SHA256 = 'e596203d478f04d3af855f8a27fb0e6500bc168ecbda67de544a49542616dc61';
export const PHASE9_ARTIFACT_PINS = Object.freeze({
  child: 'cd87026b0e50248e5cd21901374ff141afb83bae3878d585eeabc42574a27369',
  config: 'a6b6b6737a1d75d100c8a73534c89b63cd50f0f89c8cdcda7f060f20ed786377',
  transport: PLAYWRIGHT_ARTIFACT_SHA256,
  transportManifest: '7cda2ed7a3a470cc5fb43cddb845ff69e32cb7d60f14bd09d7801a592773e8ac',
  transportEntry: '706f882c8f0ea4fdf44552debde828db1aff7fcc4f8531b3df9a4528ab194a0d',
  transportGuard: 'e9edd042a13eb09816a6c314e7a858bd8eca2dec7730cb77bee342fcc63ff1b6',
  transportBuilder: '6b7eab9f10e4e6191348928256daf784a3eae8755689f0b774f2914daf5fae37',
  transportClient: 'd5bbe7663a210a3e524cf9d8c61046562e719b88dce1a80f79e50619900b1b58',
  helper: '217af8dc511e7d1d2098fbea8f2040517f4264e36b2bc4ca80e4bb548a44bfc1',
});
export const phase9PlaywrightTransport = Object.freeze({
  version: PLAYWRIGHT_VERSION, coreVersion: PLAYWRIGHT_CORE_VERSION,
  artifactPath: playwrightArtifact, manifestPath: playwrightManifest,
});
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
  const [artifactMetadata, manifestMetadata, artifactHash, manifest] = await Promise.all([
    lstat(playwrightArtifact), lstat(playwrightManifest), sha256(playwrightArtifact),
    readFile(playwrightManifest, 'utf8').then(JSON.parse),
  ]);
  if (artifactMetadata.isSymbolicLink() || !artifactMetadata.isFile() || manifestMetadata.isSymbolicLink()
    || !manifestMetadata.isFile() || artifactHash !== PLAYWRIGHT_ARTIFACT_SHA256
    || manifest.artifactSha256 !== PLAYWRIGHT_ARTIFACT_SHA256 || manifest.playwrightCliVersion !== PLAYWRIGHT_VERSION
    || manifest.playwrightCoreVersion !== PLAYWRIGHT_CORE_VERSION || manifest.format !== 'phase9-playwright-transport-v1'
    || !Array.isArray(manifest.files) || manifest.files.length < 10) {
    throw new Error('Pinned self-contained Playwright CLI transport is invalid.');
  }
}

async function validatePinnedConfig({ verifyTransport = false } = {}) {
  const config = JSON.parse(await readFile(childConfig, 'utf8'));
  if (
    Object.keys(config).sort().join(',') !== 'origin,playwrightArtifact,playwrightArtifactSha256,playwrightCoreVersion,playwrightVersion,projectId'
    || config.projectId !== STAGING_PROJECT_ID || config.origin !== STAGING_ORIGIN
    || config.playwrightArtifact !== playwrightArtifact || config.playwrightVersion !== PLAYWRIGHT_VERSION
    || config.playwrightCoreVersion !== PLAYWRIGHT_CORE_VERSION
    || config.playwrightArtifactSha256 !== PLAYWRIGHT_ARTIFACT_SHA256
  ) throw new Error('Pinned child configuration is invalid.');
  if (verifyTransport) await validatePinnedTransport();
  return config;
}

async function buildRunnerCommand() {
  await validatePinnedConfig();
  if (await sha256(childEntrypoint) !== PHASE9_ARTIFACT_PINS.child || await sha256(childConfig) !== PHASE9_ARTIFACT_PINS.config) {
    throw new Error('Committed runner bytes do not match the literal reviewed pins.');
  }
  if (await sha256(evidenceHelper) !== PHASE9_ARTIFACT_PINS.helper) throw new Error('Committed evidence helper does not match its literal reviewed pin.');
  for (const [path, pin] of [
    [playwrightArtifact, PHASE9_ARTIFACT_PINS.transport],
    [playwrightManifest, PHASE9_ARTIFACT_PINS.transportManifest],
    [playwrightEntrySource, PHASE9_ARTIFACT_PINS.transportEntry],
    [playwrightModuleGuard, PHASE9_ARTIFACT_PINS.transportGuard],
    [playwrightBuilder, PHASE9_ARTIFACT_PINS.transportBuilder],
    [playwrightClient, PHASE9_ARTIFACT_PINS.transportClient],
  ]) if (await sha256(path) !== pin) throw new Error('Committed Playwright transport closure does not match its literal reviewed pins.');
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
  return executeCapturedPlaywrightTransportCommand(args, {
    transport: phase9CapturedPlaywrightTransport, cwd: repositoryRoot, timeoutMs: 90_000,
  });
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
  const client = createPlaywrightCliClient({ transport: phase9CapturedPlaywrightTransport });
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
    ['scripts/qa-evidence/phase9/evidence-dirfd-helper.py', evidenceHelper, PHASE9_ARTIFACT_PINS.helper],
    ['scripts/qa-evidence/phase9/playwright-transport.bundle.json.gz', playwrightArtifact, PHASE9_ARTIFACT_PINS.transport],
    ['scripts/qa-evidence/phase9/playwright-transport-manifest.json', playwrightManifest, PHASE9_ARTIFACT_PINS.transportManifest],
    ['scripts/qa-evidence/phase9/playwright-transport-entry.cjs', playwrightEntrySource, PHASE9_ARTIFACT_PINS.transportEntry],
    ['scripts/qa-evidence/phase9/playwright-transport-module-guard.cjs', playwrightModuleGuard, PHASE9_ARTIFACT_PINS.transportGuard],
    ['scripts/qa-evidence/phase9/build-playwright-transport.mjs', playwrightBuilder, PHASE9_ARTIFACT_PINS.transportBuilder],
    ['scripts/qa-evidence/phase9/playwright-cli-client.mjs', playwrightClient, PHASE9_ARTIFACT_PINS.transportClient],
  ]) {
    const [{ stdout: blob }, worktree] = await Promise.all([
      execFileAsync('git', ['cat-file', 'blob', `${deployedSha}:${relativePath}`], { cwd: repositoryRoot, encoding: 'buffer', timeout: 10_000, maxBuffer: 4_194_304 }),
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
    || values['--origin'] !== STAGING_ORIGIN || values['--transport'] !== playwrightArtifact
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
