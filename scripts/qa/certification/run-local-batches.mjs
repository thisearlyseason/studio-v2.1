import { execFileSync } from 'node:child_process';
import { randomBytes as nodeRandomBytes } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createEvidenceRecorder as defaultCreateEvidenceRecorder } from './local/evidence.mjs';
import { startLocalHarness as defaultStartLocalHarness } from './local/harness.mjs';
import {
  LOCAL_IDENTITY_CASE_REQUIREMENTS,
  runIdentityBatch as defaultRunIdentityBatch,
} from './local/batches/identity.mjs';
import {
  SCENARIO_BATCH_ASSIGNMENTS,
  groupScenariosByBatch,
  parseLocalBatchArgs,
  selectLocalScenarios,
} from './local/selection.mjs';

const DEFAULT_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

function defaultGetCommit(rootDir) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
}

function createRunSuffix(now, randomBytes) {
  const iso = now.toISOString();
  const compact = `${iso.slice(2, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
  return `t3-${compact}-${randomBytes(2).toString('hex')}`;
}

export function installCleanupSignalHandlers(signalSource, getHarness) {
  let handling = false;
  let requestedExitCode = null;
  const listeners = new Map();
  const remove = () => {
    for (const [signal, listener] of listeners) signalSource.removeListener(signal, listener);
    listeners.clear();
  };
  for (const [signal, exitCode] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    const listener = async () => {
      if (handling) return;
      handling = true;
      requestedExitCode = exitCode;
      try {
        await getHarness()?.close();
      } finally {
        remove();
        signalSource.exitCode = exitCode;
      }
    };
    listeners.set(signal, listener);
    signalSource.on(signal, listener);
  }
  remove.getExitCode = () => requestedExitCode;
  return remove;
}

export async function main(argv, dependencies = {}) {
  const parsed = parseLocalBatchArgs(argv);
  const log = dependencies.console || console;
  if (parsed.list) {
    const list = Object.fromEntries(Object.entries(SCENARIO_BATCH_ASSIGNMENTS).map(([batch, ids]) => [batch, [...ids]]));
    for (const [batch, ids] of Object.entries(list)) {
      log.log(`${batch}:\n${ids.map(id => `  ${id}`).join('\n')}`);
    }
    return { exitCode: 0, list };
  }

  const environment = dependencies.environment || process.env;
  const playwrightCli = environment.PLAYWRIGHT_CLI || '';
  if (parsed.browser && !playwrightCli) throw new Error('PLAYWRIGHT_CLI is required with --browser.');

  const rootDir = dependencies.rootDir || DEFAULT_ROOT;
  const now = dependencies.now || (() => new Date());
  const randomBytes = dependencies.randomBytes || nodeRandomBytes;
  const getCommit = dependencies.getCommit || defaultGetCommit;
  const startHarness = dependencies.startHarness || defaultStartLocalHarness;
  const runIdentityBatch = dependencies.runIdentityBatch || defaultRunIdentityBatch;
  const evidenceFactory = dependencies.createEvidenceRecorder || defaultCreateEvidenceRecorder;
  const outputRoot = dependencies.outputRoot || path.join(rootDir, 'output/playwright/2026-09-04-final-certification');
  const markdownPath = dependencies.markdownPath || path.join(
    rootDir,
    'docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md',
  );
  const scenarios = selectLocalScenarios(parsed);
  const groups = groupScenariosByBatch(scenarios);
  const runSuffix = createRunSuffix(now(), randomBytes);
  const commit = getCommit(rootDir);
  let harness;
  let removeSignalHandlers = () => undefined;
  const signalSource = dependencies.signalSource || process;

  try {
    harness = await startHarness({
      rootDir,
      runSuffix,
      commit,
      playwrightCli,
      browser: parsed.browser,
      baseEnvironment: environment,
    });
    removeSignalHandlers = installCleanupSignalHandlers(signalSource, () => harness);
    const recorder = evidenceFactory({
      scenarios,
      runId: harness.runId,
      commit,
      outputDir: path.join(outputRoot, 'task-3', harness.runId),
      caseRequirements: LOCAL_IDENTITY_CASE_REQUIREMENTS,
    });
    const context = {
      ...harness,
      commit,
      now: () => now().toISOString(),
    };
    const results = [];
    for (const [batch, selected] of groups) {
      if (batch !== 'identity') throw new Error(`No local runner is installed for batch ${batch}.`);
      const batchOutput = await runIdentityBatch(context, selected);
      for (const runError of batchOutput.runErrors) recorder.recordRunError(runError);
      for (const result of batchOutput.results) {
        results.push(result);
        recorder.recordScenario(result);
      }
      if (parsed.failFast && (batchOutput.runErrors.length > 0 || batchOutput.results.some(result => result.outcome === 'FAIL'))) break;
    }
    const summary = await recorder.writeSummary({ markdownPath });
    const failed = (summary.runErrors || []).length > 0 || results.some(result => result.outcome === 'FAIL');
    log.log(`Task 3 local identity observations written for ${results.length} scenario(s); final matrix PASS was not inferred.`);
    return { exitCode: removeSignalHandlers.getExitCode?.() || (failed ? 1 : 0), summary };
  } finally {
    removeSignalHandlers();
    await harness?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
    .then(result => { process.exitCode = result.exitCode; })
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      if (![130, 143].includes(process.exitCode)) process.exitCode = 1;
    });
}
