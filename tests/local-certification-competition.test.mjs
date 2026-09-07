import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  COMPETITION_SCENARIO_IDS,
  selectLocalScenarios,
} from '../scripts/qa/certification/local/selection.mjs';
import {
  COMPETITION_SCENARIO_CASES,
  COMPETITION_CASE_EXECUTION_CONTRACTS,
  LOCAL_OPERATIONS_CASE_REQUIREMENTS,
  assertAuthoritativeCompetitionEvents,
  assertCompetitionCaseContracts,
  competitionScenarioExecutionOrder,
  selectFrozenCompetitionRequests,
  handlers,
} from '../scripts/qa/certification/local/batches/operations.mjs';
import {
  registerCompetitionDiscovery,
  runOperationScenarioSequence,
  snapshotCompetitionRoots,
} from '../scripts/qa/certification/local/schedule-isolation.mjs';

const frozenCaseIds = Object.freeze({
  'leagues-create-edit-clone-delete': {
    happyPath: ['league-create', 'league-edit', 'league-clone', 'league-delete'],
    negativePath: ['league-duplicate', 'league-quota', 'league-partial-clone'],
    permission: ['league-foreign-owner', 'league-anonymous-write'],
    persistence: ['league-reload', 'league-replay'],
    console: ['league-lifecycle-console'], network: ['league-lifecycle-network'],
    responsive: ['league-lifecycle-desktop', 'league-lifecycle-mobile'],
  },
  'leagues-schedule-generation-deployment': {
    happyPath: ['league-schedule-generate', 'league-schedule-deploy'],
    negativePath: ['league-schedule-impossible', 'league-schedule-blackout', 'league-schedule-race'],
    permission: ['league-schedule-foreign-owner', 'league-schedule-direct-write'],
    persistence: ['league-schedule-reload'], console: ['league-schedule-console'],
    network: ['league-schedule-network'], responsive: ['league-schedule-desktop'],
  },
  'leagues-registration-assignment': {
    happyPath: ['league-register', 'league-review', 'league-assign'],
    negativePath: ['league-register-duplicate', 'league-register-invalid', 'league-register-unpublished'],
    permission: ['league-ledger-private', 'league-registrant-assign-deny', 'league-assignment-foreign-owner'],
    persistence: ['league-assignment-reload'], console: ['league-assignment-console'],
    network: ['league-assignment-network'],
    responsive: ['league-assignment-desktop', 'league-assignment-mobile'],
  },
  'leagues-scorekeeper-spectator': {
    happyPath: ['league-score-submit', 'league-public-score'],
    negativePath: ['league-score-wrong-pin', 'league-score-replay', 'league-score-downstream-conflict'],
    permission: ['league-score-narrow-scope', 'league-score-outsider-deny'],
    persistence: ['league-score-reload'], console: ['league-score-console'], network: ['league-score-network'],
    responsive: ['league-score-desktop', 'league-score-mobile'],
  },
  'tournaments-create-configure-replicate-archive': {
    happyPath: ['tournament-create', 'tournament-configure', 'tournament-replicate', 'tournament-archive'],
    negativePath: ['tournament-invalid-format', 'tournament-partial-replica', 'tournament-duplicate', 'tournament-archive-cancel'],
    permission: ['tournament-foreign-staff', 'tournament-foreign-team'],
    persistence: ['tournament-lifecycle-reload', 'tournament-lifecycle-replay'],
    console: ['tournament-lifecycle-console'], network: ['tournament-lifecycle-network'],
    responsive: ['tournament-lifecycle-desktop', 'tournament-lifecycle-mobile'],
  },
  'tournaments-schedule-pools-brackets-referees': {
    happyPath: ['tournament-schedule-generate', 'tournament-pools-bracket', 'tournament-referee-assign'],
    negativePath: ['tournament-schedule-impossible', 'tournament-referee-conflict'],
    permission: ['tournament-referee-role-deny', 'tournament-schedule-foreign-deny'],
    persistence: ['tournament-schedule-reload'], console: ['tournament-schedule-console'],
    network: ['tournament-schedule-network'],
    responsive: ['tournament-schedule-desktop', 'tournament-schedule-mobile'],
  },
  'tournaments-scoring-dispute-public-standings': {
    happyPath: ['tournament-score-submit', 'tournament-dispute-open', 'tournament-dispute-resolve', 'tournament-public-standings'],
    negativePath: ['tournament-score-wrong-pin', 'tournament-score-replay', 'tournament-score-downstream-conflict'],
    permission: ['tournament-score-narrow-scope', 'tournament-score-outsider-deny'],
    persistence: ['tournament-scoring-reload'], console: ['tournament-scoring-console'],
    network: ['tournament-scoring-network'],
    responsive: ['tournament-scoring-desktop', 'tournament-scoring-mobile'],
  },
});

function strictCompetitionEvent(scenarioId, caseId, assertionId = `assertion-${caseId}-1`) {
  const contract = COMPETITION_CASE_EXECUTION_CONTRACTS[scenarioId][caseId];
  const runId = 'strict-contract-run';
  const atomicRace = ['league-partial-clone', 'tournament-partial-replica'].includes(caseId);
  const frozenRequestId = contract.requestId.replace('{runId}', runId);
  return {
    type: 'case', scenarioId, caseId, dimension: contract.dimension, runId, state: 'OBSERVED',
    assertions: [
      { id: assertionId, kind: 'transport', postconditionId: contract.postconditions[0] },
      { id: `assertion-${caseId}-2`, kind: 'state', postconditionId: contract.postconditions[1] },
    ],
    execution: {
      actor: contract.actor, runId, requestId: atomicRace ? `${frozenRequestId}-a` : frozenRequestId,
      ...(contract.replayOf ? { replayOf: contract.replayOf } : {}),
      ...(contract.browser ? { browser: {
        actor: contract.actor, route: contract.route,
        selector: contract.browser.selector, role: contract.browser.role, name: contract.browser.name,
        matchedSelector: contract.browser.selector, matchedRole: contract.browser.role, matchedName: contract.browser.name, matchCount: 1,
        action: contract.browser.action, actionResult: contract.browser.actionResult,
        controlSelector: contract.browser.controlSelector, controlRole: contract.browser.controlRole, controlName: contract.browser.controlName,
        matchedControlSelector: contract.browser.controlSelector, matchedControlRole: contract.browser.controlRole, matchedControlName: contract.browser.controlName, controlMatchCount: 1,
        expectedViewports: contract.browser.expectedViewports, session: `session-${caseId}`,
        viewports: contract.browser.expectedViewports.map(viewport => ({ viewport, mainBox: {}, controlBox: {}, mainFits: true, controlFits: true, scrollWidth: viewport.width })),
        consoleCount: contract.browser.expectedConsoleCount, networkCount: contract.browser.expectedNetworkCount,
      } } : {}),
      method: contract.method, route: contract.route, expectedStatuses: [...contract.expectedStatuses],
      cleanupReference: 'fixture-cleanup-strict-contract-run',
      cleanupSelectors: contract.cleanupSelectors.map(value => value.replace('{runId}', runId)),
      postconditionIds: [...contract.postconditions],
      requests: contract.expectedStatuses.map((status, index) => ({ evidenceId: `request-${caseId}-${index + 1}`, actorAlias: contract.actor, method: contract.method, pathname: contract.route, status,
        requestId: contract.method === 'GET' || !contract.route.startsWith('/api/') ? null : atomicRace ? `${frozenRequestId}-${index ? 'b' : 'a'}` : frozenRequestId, payloadHash: contract.method === 'GET' || !contract.route.startsWith('/api/') ? null : `sha256:${'a'.repeat(43)}` })),
    },
  };
}

test('the exact seven frozen competition rows are assigned to local operations', () => {
  assert.deepEqual(COMPETITION_SCENARIO_IDS, Object.keys(frozenCaseIds));
  const selected = selectLocalScenarios({ scenarioIds: COMPETITION_SCENARIO_IDS });
  assert.deepEqual(selected.map(item => item.id), COMPETITION_SCENARIO_IDS);
  for (const id of COMPETITION_SCENARIO_IDS) assert.equal(typeof handlers[id], 'function', id);
});

test('every competition row has the exact frozen case map and executable provenance', () => {
  assert.deepEqual(COMPETITION_SCENARIO_CASES, frozenCaseIds);
  assert.deepEqual(
    Object.fromEntries(COMPETITION_SCENARIO_IDS.map(id => [id, LOCAL_OPERATIONS_CASE_REQUIREMENTS[id]])),
    frozenCaseIds,
  );
  assert.doesNotThrow(() => assertCompetitionCaseContracts(COMPETITION_SCENARIO_CASES));
  for (const [scenarioId, dimensions] of Object.entries(frozenCaseIds)) {
    for (const [dimension, caseIds] of Object.entries(dimensions)) for (const caseId of caseIds) {
      const execution = COMPETITION_CASE_EXECUTION_CONTRACTS[scenarioId][caseId];
      assert.equal(execution.caseId, caseId);
      assert.equal(execution.dimension, dimension);
      assert.match(execution.actor, /^qa-/);
      if (caseId === 'league-schedule-direct-write') {
        assert.equal(execution.route, '/v1/projects/{projectId}/databases/(default)/documents/leagues/{leagueId}');
        assert.equal(execution.method, 'PATCH');
      } else if (caseId === 'league-score-narrow-scope') {
        assert.equal(execution.route, '/v1/projects/{projectId}/databases/(default)/documents/leagues/{leagueId}/private/lifecycle');
        assert.equal(execution.method, 'GET');
      } else if (caseId === 'tournament-schedule-mobile') assert.equal(execution.route, '/tournaments/referee/{teamId}/{eventId}');
      else if (['console', 'responsive'].includes(dimension) || caseId === 'tournament-archive-cancel') assert.match(execution.route, /^\/(competition|manage-tournaments)$/);
      else assert.match(execution.route, /^\/api\//);
      assert.match(execution.requestId, /\{runId\}/);
      assert.match(execution.assertionId, /\{sequence\}/);
      assert.equal(execution.networkCapture, true);
      assert.equal(execution.cleanupOwner, 'scenario-resource-registry');
      assert.equal(typeof execution.handlerId, 'string');
      assert.equal(typeof execution.method, 'string');
      assert.ok(Array.isArray(execution.expectedStatuses) && execution.expectedStatuses.length > 0);
      const concurrentAtomicCase = ['league-partial-clone', 'tournament-partial-replica'].includes(caseId);
      assert.equal(execution.expectedStatuses.length, concurrentAtomicCase ? 2 : 1, `${caseId} must freeze its exact response status set`);
      assert.ok(Array.isArray(execution.postconditions) && execution.postconditions.length > 0);
      assert.ok(Array.isArray(execution.cleanupSelectors) && execution.cleanupSelectors.length > 0);
      if (dimension === 'responsive') assert.deepEqual(execution.responsiveBounds[0], caseId.endsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    }
  }
  assert.deepEqual(
    { actor: COMPETITION_CASE_EXECUTION_CONTRACTS['leagues-registration-assignment']['league-register'].actor,
      method: COMPETITION_CASE_EXECUTION_CONTRACTS['leagues-registration-assignment']['league-register'].method,
      route: COMPETITION_CASE_EXECUTION_CONTRACTS['leagues-registration-assignment']['league-register'].route },
    { actor: 'qa-public-submitter', method: 'POST', route: '/api/public/portals/action' },
  );
});

test('competition contracts reject missing and duplicate assertion or request ownership', () => {
  const valid = COMPETITION_SCENARIO_CASES['leagues-create-edit-clone-delete'].happyPath[0];
  assert.throws(() => assertCompetitionCaseContracts({}), /missing competition scenario/i);
  assert.throws(() => assertAuthoritativeCompetitionEvents([
    strictCompetitionEvent('leagues-create-edit-clone-delete', valid, 'assertion-league-create-1'),
    strictCompetitionEvent('leagues-create-edit-clone-delete', 'league-edit', 'assertion-league-create-1'),
  ], ['leagues-create-edit-clone-delete']), /duplicate assertion/i);
  assert.throws(() => assertAuthoritativeCompetitionEvents([
    { ...strictCompetitionEvent('leagues-create-edit-clone-delete', valid), assertions: [] },
  ], ['leagues-create-edit-clone-delete']), /missing assertion/i);
});

test('competition evidence requires complete semantic postcondition coverage and matching assertion kinds', () => {
  const id = 'leagues-create-edit-clone-delete';
  const cases = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const cleanup = { type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors: [`competition-discovery:${id}:strict-contract-run`] };
  const missingState = structuredClone(cases);
  missingState[0].assertions = missingState[0].assertions.slice(0, 1);
  assert.throws(() => assertAuthoritativeCompetitionEvents([...missingState, cleanup], [id]), /postcondition coverage/i);
  const mislabeled = structuredClone(cases);
  mislabeled[0].assertions[0].kind = 'state';
  assert.throws(() => assertAuthoritativeCompetitionEvents([...mislabeled, cleanup], [id]), /assertion kind/i);
});

test('competition browser cases reject missing or mismatched session and selector provenance', () => {
  const id = 'leagues-create-edit-clone-delete';
  const cases = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const cleanup = { type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors: [`competition-discovery:${id}:strict-contract-run`] };
  const browserCase = cases.find(item => item.caseId === 'league-lifecycle-desktop');
  delete browserCase.execution.browser;
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /browser provenance/i);
});

test('competition browser contracts freeze concrete controls, action results, counts, and exact viewport objects', () => {
  for (const [scenarioId, contracts] of Object.entries(COMPETITION_CASE_EXECUTION_CONTRACTS)) {
    for (const [caseId, contract] of Object.entries(contracts)) {
      if (!contract.browser) continue;
      assert.equal(typeof contract.browser.selector, 'string', `${scenarioId}/${caseId} selector`);
      assert.ok(['button', 'tab', 'render'].includes(contract.browser.role), `${scenarioId}/${caseId} role`);
      assert.equal(typeof contract.browser.name, 'string', `${scenarioId}/${caseId} name`);
      assert.ok(['click', 'render-only', 'dismiss-confirm'].includes(contract.browser.action), `${scenarioId}/${caseId} action`);
      assert.equal(typeof contract.browser.actionResult, 'string', `${scenarioId}/${caseId} action result`);
      assert.equal(typeof contract.browser.controlSelector, 'string', `${scenarioId}/${caseId} control selector`);
      assert.equal(typeof contract.browser.controlRole, 'string', `${scenarioId}/${caseId} control role`);
      assert.equal(typeof contract.browser.controlName, 'string', `${scenarioId}/${caseId} control name`);
      assert.deepEqual(contract.browser.expectedViewports, [{ width: 1440, height: 900 }, { width: 390, height: 844 }]);
      assert.equal(contract.browser.expectedConsoleCount, contract.dimension === 'network' ? 1 : 0);
      assert.equal(contract.browser.expectedNetworkCount, contract.dimension === 'network' ? 1 : 0);
      assert.notEqual(contract.browser.selector, `${caseId}-interaction`);
      assert.notEqual(contract.browser.controlSelector, `${caseId}-result`);
    }
  }
  const referee = COMPETITION_CASE_EXECUTION_CONTRACTS['tournaments-schedule-pools-brackets-referees']['tournament-schedule-mobile'].browser;
  assert.deepEqual(
    { role: referee.role, name: referee.name, action: referee.action, result: referee.actionResult },
    { role: 'render', name: 'Verified', action: 'render-only', result: 'assigned-referee-portal-rendered' },
  );
});

test('competition browser evidence rejects invented selector results, loose viewports, and wrong exact counts', () => {
  const id = 'tournaments-schedule-pools-brackets-referees';
  const cases = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const cleanup = { type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors: [`competition-discovery:${id}:strict-contract-run`] };
  const browserCase = cases.find(item => item.caseId === 'tournament-schedule-mobile');
  browserCase.execution.browser.matchedSelector = 'tournament-schedule-mobile-interaction';
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /browser provenance/i);
  Object.assign(browserCase.execution.browser, {
    matchedSelector: browserCase.execution.browser.selector,
    viewports: [{ viewport: { width: 390, height: 844 }, controlFits: true }],
  });
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /browser provenance/i);
  browserCase.execution.browser.viewports = browserCase.execution.browser.expectedViewports.map(viewport => ({ viewport, mainBox: {}, controlBox: {}, mainFits: true, controlFits: true, scrollWidth: viewport.width }));
  browserCase.execution.browser.consoleCount = 1;
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /browser provenance/i);
});

test('competition evidence keeps only requests inside the exact frozen transport contract', () => {
  const contract = {
    actor: 'qa-league-owner-a', method: 'PATCH', route: '/v1/projects/demo/databases/(default)/documents/leagues/league-a', expectedStatuses: [403],
  };
  const requests = [
    { evidenceId: 'helper-alias', actorAlias: contract.actor, method: 'PATCH', pathname: '/firestore/document', status: 403 },
    { evidenceId: 'exact-route', actorAlias: contract.actor, method: 'PATCH', pathname: contract.route, status: 403 },
  ];
  assert.deepEqual(selectFrozenCompetitionRequests(requests, contract), [requests[1]]);
  assert.throws(() => selectFrozenCompetitionRequests(requests.slice(0, 1), contract), /missing exact frozen request evidence/i);
});

test('competition mutation evidence requires captured request identity and payload hash', () => {
  const id = 'leagues-create-edit-clone-delete';
  const cases = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const cleanup = { type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors: [`competition-discovery:${id}:strict-contract-run`] };
  cases.find(item => item.caseId === 'league-create').execution.requests[0].payloadHash = null;
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /request identity|payload hash/i);
});

test('atomic competition races require the exact captured a and b request identities', () => {
  const id = 'tournaments-create-configure-replicate-archive';
  const cases = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const cleanup = { type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors: [`competition-discovery:${id}:strict-contract-run`] };
  assert.doesNotThrow(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]));
  cases.find(item => item.caseId === 'tournament-partial-replica').execution.requests[1].requestId = 'qa-unrelated-request';
  assert.throws(() => assertAuthoritativeCompetitionEvents([...cases, cleanup], [id]), /atomic request identities/i);
});

test('Tournament create replay is executed before archive while archive remains later', () => {
  const order = competitionScenarioExecutionOrder('tournaments-create-configure-replicate-archive');
  assert.ok(order.indexOf('tournament-create') < order.indexOf('tournament-lifecycle-replay'));
  assert.ok(order.indexOf('tournament-lifecycle-replay') < order.indexOf('tournament-archive'));
  assert.equal(new Set(order).size, order.length);
  assert.deepEqual(new Set(order), new Set(Object.values(frozenCaseIds['tournaments-create-configure-replicate-archive']).flat()));
});

test('authoritative competition validation fails child, timeout, omission, unobserved, and cleanup residue', () => {
  const id = 'leagues-create-edit-clone-delete';
  assert.throws(() => assertAuthoritativeCompetitionEvents([], [id]), /missing competition case/i);
  assert.throws(() => assertAuthoritativeCompetitionEvents([{ type: 'scenario-error', scenarioId: id, stage: 'timeout' }], [id]), /timeout|scenario/i);
  const events = Object.values(frozenCaseIds[id]).flat().map((caseId, index) => ({
    ...strictCompetitionEvent(id, caseId), state: index ? 'OBSERVED' : 'NOT_OBSERVED',
  }));
  assert.throws(() => assertAuthoritativeCompetitionEvents(events, [id]), /not observed/i);
  events[0].state = 'OBSERVED';
  assert.throws(() => assertAuthoritativeCompetitionEvents(events, [id]), /cleanup evidence/i);
  events.push({ type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'FAIL', residuals: ['leagues/run-owned'], selectors: [] });
  assert.throws(() => assertAuthoritativeCompetitionEvents(events, [id]), /cleanup residue/i);
  assert.throws(() => assertAuthoritativeCompetitionEvents(events, [id], { childCode: 1 }), /child/i);
});

test('authoritative competition validation rejects a later unrelated cleanup artifact', () => {
  const id = 'leagues-create-edit-clone-delete';
  const events = Object.values(frozenCaseIds[id]).flat().map(caseId => strictCompetitionEvent(id, caseId));
  const selectors = [`competition-discovery:${id}:strict-contract-run`];
  events.push({ type: 'cleanup', runId: 'strict-contract-run', cleanupId: 'fixture-cleanup-strict-contract-run', state: 'OBSERVED', residuals: [], selectors });
  events.push({ type: 'cleanup', runId: 'another-run', cleanupId: 'shared-cleanup', state: 'OBSERVED', residuals: [], selectors: [] });
  assert.throws(() => assertAuthoritativeCompetitionEvents(events, [id]), /unrelated run|cleanup reference/i);
});

test('runner uses dedicated competition workflows, isolated sessions and numeric responsive bounds', async () => {
  const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  for (const id of COMPETITION_SCENARIO_IDS) {
    assert.match(source, new RegExp(`scenarioId === '${id}'`));
  }
  assert.match(source, /runCompetitionLifecycleWorkflowAudit/);
  assert.match(source, /runCompetitionScheduleWorkflowAudit/);
  assert.match(source, /runCompetitionAssignmentWorkflowAudit/);
  assert.match(source, /runCompetitionScoringWorkflowAudit/);
  assert.match(source, /width: 1440, height: 900/);
  assert.match(source, /width: 390, height: 844/);
  assert.match(source, /consoleErrors/);
  assert.match(source, /failedResponses/);
  assert.match(source, /operationSessionName/);
  assert.match(source, /COMPETITION_CASE_HANDLER_REGISTRY/);
  assert.match(source, /COMPETITION_CREDENTIAL_HMAC_SECRET:/);
  assert.match(source, /withFirestoreOverlay/);
  const competitionBlock = source.slice(
    source.indexOf('const COMPETITION_BROWSER_CONTRACTS'),
    source.indexOf('async function runCertificationOperationsScenarios'),
  );
  assert.doesNotMatch(competitionBlock, /__certification_probe__/);
  assert.doesNotMatch(competitionBlock, /response\.status < 500/);
  assert.doesNotMatch(competitionBlock, /return runCompetitionCaseMatrix/);
  assert.doesNotMatch(competitionBlock, /return \{ pathname: route/);
  assert.doesNotMatch(competitionBlock, /recordObservedOperationsCase\(/);
  assert.doesNotMatch(competitionBlock, /makeCompetitionCaseHandler/);
  assert.match(competitionBlock, /contract\.path === '\/manage-tournaments'.*page\.evaluate\(team=>localStorage\.setItem\('sf_session_team_id'/s);
  assert.match(competitionBlock, /QA Scoring Tournament.*date: '2029-11-05'.*endDate: '2029-11-05'/s);
  assert.match(competitionBlock, /const frozen=\$\{JSON\.stringify\(frozenBrowser\)\}/);
  assert.match(competitionBlock, /exactLocator\(frozen\.role,frozen\.name\)/);
  assert.match(competitionBlock, /frozen\.action==='render-only'/);
  assert.doesNotMatch(competitionBlock, /\$\{caseId\}-interaction|\$\{caseId\}-result/);
});

test('runner preserves raw lifecycle response identity and deeply verifies retained lifecycle fields', async () => {
  const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  const lifecycleAssertions = source.slice(source.indexOf("if (caseId === 'league-reload'"), source.indexOf('const after = await readTenantConsumerDocuments', source.indexOf("if (caseId === 'league-reload'")));
  assert.match(source, /rawText\s*=\s*await response\.text\(\)/);
  assert.match(source, /rawBodySha256:\s*createHash\('sha256'\)\.update\(rawText\)\.digest\('hex'\)/);
  assert.match(source, /leagueCreateResponseRawSha256/);
  assert.match(source, /tournamentCreateResponseRawSha256/);
  assert.match(source, /tournamentArchiveResponseRawSha256/);
  assert.match(lifecycleAssertions, /exact retained private lifecycle fields/);
  assert.match(lifecycleAssertions, /name: retained\.data\(\)\?\.name.*sport: retained\.data\(\)\?\.sport.*description: retained\.data\(\)\?\.description.*version: retained\.data\(\)\?\.lifecycleVersion/s);
  assert.match(lifecycleAssertions, /exact retained public lifecycle fields/);
  assert.match(lifecycleAssertions, /exact retained private replica fields and reset state/);
  assert.match(lifecycleAssertions, /title: retained\.data\(\)\?\.title.*type: retained\.data\(\)\?\.tournamentType.*teams: retained\.data\(\)\?\.tournamentTeamsData.*games: retained\.data\(\)\?\.tournamentGames.*scheduleVersion/s);
  assert.match(lifecycleAssertions, /exact retained public replica fields and reset state/);
});

test('competition timeout still finalizes and fails the wrapper truthfully', async () => {
  let finalized = 0;
  let aborted = 0;
  const reported = [];
  await assert.rejects(() => runOperationScenarioSequence(['competition-timeout'], {
    timeoutMs: 5,
    execute: (_id, { signal }) => new Promise(resolve => signal.addEventListener('abort', () => {
      aborted += 1;
      resolve();
    }, { once: true })),
    finalize: async () => { finalized += 1; },
    onError: (_id, error) => reported.push(error.message),
    failFast: true,
  }), /selected operation scenario.*failed/i);
  assert.equal(finalized, 1);
  assert.equal(aborted, 1, 'timeout must propagate cancellation to a hung child');
  assert.match(reported[0], /timed out/i);
});

test('competition timeout terminates a real hung child before finalization and returns failure', async () => {
  let child;
  let finalizedAfterExit = false;
  let childExited = false;
  await assert.rejects(() => runOperationScenarioSequence(['competition-hung-child'], {
    timeoutMs: 75,
    execute: (_id, { signal }) => new Promise((resolve, reject) => {
      child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      child.once('error', reject);
      signal.addEventListener('abort', () => {
        child.once('exit', () => { childExited = true; resolve(); });
        child.kill('SIGKILL');
      }, { once: true });
    }),
    finalize: async () => { finalizedAfterExit = childExited; },
    onError: () => {},
    failFast: true,
  }), /selected operation scenario.*failed/i);
  assert.equal(childExited, true, 'hung subprocess must be terminated');
  assert.equal(finalizedAfterExit, true, 'cleanup finalization must follow subprocess termination');
});

test('competition contracts freeze literal specialized actors and semantic postconditions', () => {
  const all = Object.values(COMPETITION_CASE_EXECUTION_CONTRACTS).flatMap(value => Object.values(value));
  assert.equal(COMPETITION_CASE_EXECUTION_CONTRACTS['tournaments-schedule-pools-brackets-referees']['tournament-referee-role-deny'].actor, 'qa-adult-player-a');
  assert.equal(COMPETITION_CASE_EXECUTION_CONTRACTS['tournaments-create-configure-replicate-archive']['tournament-foreign-staff'].actor, 'qa-school-delegate');
  assert.equal(COMPETITION_CASE_EXECUTION_CONTRACTS['tournaments-create-configure-replicate-archive']['tournament-foreign-team'].actor, 'qa-coach-owner-b');
  assert.equal(COMPETITION_CASE_EXECUTION_CONTRACTS['leagues-scorekeeper-spectator']['league-score-outsider-deny'].actor, 'qa-removed-member');
  for (const contract of all) {
    assert.ok(contract.postconditions.every(value => /^[a-z0-9][a-z0-9-]+$/.test(value)), `${contract.caseId} has semantic postcondition IDs`);
    assert.ok(contract.cleanupSelectors.some(value => value.startsWith('competition-discovery:') && value.endsWith(':{runId}')));
  }
  assert.deepEqual(COMPETITION_CASE_EXECUTION_CONTRACTS['leagues-create-edit-clone-delete']['league-partial-clone'].expectedStatuses, [201, 409]);
  assert.deepEqual(COMPETITION_CASE_EXECUTION_CONTRACTS['tournaments-create-configure-replicate-archive']['tournament-partial-replica'].expectedStatuses, [200, 409]);
});

test('competition discovery removes only run-owned post-baseline residue', async () => {
  const runId = 'final-cert-task9';
  let paths = ['leagues/ambient'];
  const registrations = [];
  const obligations = [];
  const registry = { register(value) { obligations.push(value); } };
  await registerCompetitionDiscovery({
    registry, scopeId: 'league-lifecycle', runId,
    snapshot: async () => [...paths],
    inspect: async documentPath => ({ documentPath, fixtureRunId: documentPath.includes('not-owned') ? 'ambient' : runId }),
    registerRoot(documentPath) { registrations.push(documentPath); paths = paths.filter(path => path !== documentPath); },
  });
  paths.push('competitionOperations/run-owned');
  await obligations[0].cleanup();
  assert.deepEqual(registrations, ['competitionOperations/run-owned']);
  assert.equal(await obligations[0].verify(), true);
  paths.push('leagues/not-owned');
  await assert.rejects(() => obligations[0].cleanup(), /refused non-run-owned residue/i);
});

test('competition discovery accepts an exact run-owned fixture reference without a copied runId field', async () => {
  const runId = 'final-cert-task9';
  const eventId = 'qa-tournament-a-task9';
  let paths = [];
  const registrations = [];
  const obligations = [];
  await registerCompetitionDiscovery({
    registry: { register(value) { obligations.push(value); } }, scopeId: 'referees', runId,
    runOwnedReferences: [eventId],
    snapshot: async () => [...paths],
    inspect: async () => ({ eventId, refereeId: 'qa-referee-task9' }),
    registerRoot(documentPath) { registrations.push(documentPath); paths = paths.filter(path => path !== documentPath); },
  });
  paths.push('tournamentRefereeAssignments/tr_exact');
  await obligations[0].cleanup();
  assert.deepEqual(registrations, ['tournamentRefereeAssignments/tr_exact']);
  assert.equal(await obligations[0].verify(), true);
});

test('competition discovery covers profile state and all team-owned subcollections', async () => {
  const collectionReads = [];
  const documentCollectionReads = [];
  const emptyCollection = path => ({
    async listDocuments() { collectionReads.push(path); return []; },
  });
  const firestore = {
    collection: name => emptyCollection(name),
    doc(documentPath) {
      return {
        collection: name => emptyCollection(`${documentPath}/${name}`),
        async listCollections() { documentCollectionReads.push(documentPath); return []; },
      };
    },
  };
  await snapshotCompetitionRoots(firestore, { leagueIds: ['league-a'], teamIds: ['team-a'] });
  assert.ok(collectionReads.includes('users'), 'profile roots must be in the competition residue baseline');
  assert.ok(documentCollectionReads.includes('teams/team-a'), 'team alerts and other team-owned state must be discovered');
});

test('competition discovery traces outbox and team-alert residue to run-owned operation receipts', async () => {
  const runId = 'final-cert-task9';
  let paths = [];
  const registrations = [];
  const obligations = [];
  await registerCompetitionDiscovery({
    registry: { register(value) { obligations.push(value); } }, scopeId: 'scoring', runId,
    snapshot: async () => [...paths],
    inspect: async documentPath => documentPath.startsWith('competitionOperationOutbox/')
      ? { operationId: 'competition_receipt' }
      : documentPath === 'competitionOperations/competition_receipt' ? { requestId: `qa-score-${runId}` } : {},
    registerRoot(documentPath) { registrations.push(documentPath); paths = paths.filter(path => path !== documentPath); },
  });
  paths.push('competitionOperationOutbox/effect');
  await obligations[0].cleanup();
  paths.push('teams/team-a/alerts/competition_receipt');
  await obligations[0].cleanup();
  assert.deepEqual(registrations, ['competitionOperationOutbox/effect', 'teams/team-a/alerts/competition_receipt']);
});
