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
  LOCAL_TENANT_CASE_REQUIREMENTS,
  LOCAL_TENANT_OPERATION_CONTRACTS,
  tenantCaseAssociationFor,
  runTenantsBatch as defaultRunTenantsBatch,
} from './local/batches/tenants.mjs';
import { runOperationsBatch as defaultRunOperationsBatch } from './local/batches/operations.mjs';
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

function createRunSuffix(now, randomBytes, batches) {
  const iso = now.toISOString();
  const compact = `${iso.slice(2, 10).replaceAll('-', '')}-${iso.slice(11, 19).replaceAll(':', '')}`;
  const prefix = batches.length === 1 ? (batches[0] === 'identity' ? 't3' : batches[0] === 'tenants' ? 't4' : 't5') : 'local';
  return `${prefix}-${compact}-${randomBytes(2).toString('hex')}`;
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
  const runTenantsBatch = dependencies.runTenantsBatch || defaultRunTenantsBatch;
  const runOperationsBatch = dependencies.runOperationsBatch || defaultRunOperationsBatch;
  const evidenceFactory = dependencies.createEvidenceRecorder || defaultCreateEvidenceRecorder;
  const outputRoot = dependencies.outputRoot || path.join(rootDir, 'output/playwright/2026-09-04-final-certification');
  const scenarios = selectLocalScenarios(parsed);
  const groups = groupScenariosByBatch(scenarios);
  const selectedBatches = [...groups.keys()];
  const runSuffix = createRunSuffix(now(), randomBytes, selectedBatches);
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
      failFast: parsed.failFast,
      baseEnvironment: environment,
      batches: selectedBatches,
    });
    removeSignalHandlers = installCleanupSignalHandlers(signalSource, () => harness);
    const certificationObservation = await harness.runLegacyCertificationAudit({
      batches: selectedBatches,
      selectedScenarioIds: scenarios.map(scenario => scenario.id),
    });
    const context = {
      ...harness,
      commit,
      now: () => now().toISOString(),
      certificationObservation,
      operations: Object.freeze({
        execute: ({ handler, ...input }) => handler({ ...input, context }),
      }),
    };
    const results = [];
    const summaries = [];
    const batchDefinitions = {
      identity: { run: runIdentityBatch, task: 'task-3', markdown: '02-identity.md', title: 'Task 3 identity', caseRequirements: LOCAL_IDENTITY_CASE_REQUIREMENTS },
      tenants: { run: runTenantsBatch, task: 'task-4', markdown: '03-tenants.md', title: 'Task 4 tenant and family', caseRequirements: LOCAL_TENANT_CASE_REQUIREMENTS, caseAssociationResolver: tenantCaseAssociationFor, operationContracts: LOCAL_TENANT_OPERATION_CONTRACTS },
      operations: { run: runOperationsBatch, task: 'task-5', markdown: '04-operations.md', title: 'Task 5 operations' },
    };
    for (const [batch, selected] of groups) {
      const definition = batchDefinitions[batch];
      if (!definition) throw new Error(`No local runner is installed for batch ${batch}.`);
      const batchOutputDir = path.join(outputRoot, definition.task, harness.runId);
      const markdownPath = dependencies.markdownPath && groups.size === 1
        ? dependencies.markdownPath
        : path.join(rootDir, 'docs/qa/production-audit/runs/2026-09-04-final-certification', definition.markdown);
      const recorder = evidenceFactory({
        scenarios: selected,
        runId: harness.runId,
        commit,
        outputDir: batchOutputDir,
        markdownPath,
        title: definition.title,
        batch,
        caseRequirements: definition.caseRequirements,
        caseAssociationResolver: definition.caseAssociationResolver,
        operationContracts: definition.operationContracts,
      });
      const batchOutput = await definition.run(context, selected);
      for (const runError of batchOutput.runErrors) recorder.recordRunError(runError);
      for (const result of batchOutput.results) {
        results.push(result);
        recorder.recordScenario(result);
      }
      summaries.push(await recorder.writeSummary({ markdownPath }));
      if (parsed.failFast && (batchOutput.runErrors.length > 0 || batchOutput.results.some(result => result.outcome === 'FAIL'))) break;
    }
    const summary = { runId: harness.runId, commit, results, runErrors: summaries.flatMap(item => item.runErrors || []), batches: summaries };
    const failed = summary.runErrors.length > 0 || results.some(result => result.outcome === 'FAIL');
    log.log(`Local certification observations written for ${results.length} scenario(s); final matrix PASS was not inferred.`);
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
