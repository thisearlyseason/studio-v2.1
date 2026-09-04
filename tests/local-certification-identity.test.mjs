import assert from 'node:assert/strict';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import {
  IDENTITY_EXECUTION_ORDER,
  parseLegacyPassLabels,
  runIdentityBatch,
} from '../scripts/qa/certification/local/batches/identity.mjs';
import { selectLocalScenarios } from '../scripts/qa/certification/local/selection.mjs';

const scenarios = selectLocalScenarios({ batches: ['identity'], catalog: CERTIFICATION_SCENARIOS });

const successfulOutput = [
  'PASS qa-coach-owner-a active session for /dashboard: 200',
  'PASS qa-unverified blocked session creation: 403',
  'PASS qa-suspended blocked Auth error: USER_DISABLED',
  'PASS pending-delete blocked session creation: 403',
  'PASS removed member denied former team context: 403',
  'PASS protected deep link resumes after login: /facilities',
  'PASS logout revokes the browser session: /login',
  'PASS second tab observes logout: /login',
  'PASS logged-out session endpoint denial: 401',
  'PASS profile-only fake superadmin denied admin API: 403',
  'PASS claim-controlled superadmin reaches admin API: 200',
  'PASS post-cleanup Storage object is absent: true',
].join('\n');

function context(overrides = {}) {
  return {
    runId: 'final-cert-t3-identity-a1',
    runSuffix: 't3-identity-a1',
    browserEnabled: true,
    commit: '0123456789abcdef0123456789abcdef01234567',
    runLegacyIdentityAudit: async () => ({ code: 0, stdout: successfulOutput, stderr: '' }),
    now: (() => {
      let second = 0;
      return () => `2026-09-04T18:00:${String(second++).padStart(2, '0')}.000Z`;
    })(),
    ...overrides,
  };
}

test('identity execution order keeps blocked-state checks before lifecycle mutations and purge last', () => {
  assert.ok(IDENTITY_EXECUTION_ORDER.indexOf('authentication-email-password-login') <
    IDENTITY_EXECUTION_ORDER.indexOf('account-lifecycle-disable-delete-cancel-purge'));
  assert.equal(IDENTITY_EXECUTION_ORDER.at(-1), 'account-lifecycle-disable-delete-cancel-purge');
  assert.deepEqual(new Set(IDENTITY_EXECUTION_ORDER), new Set(scenarios.map(scenario => scenario.id)));
  assert.ok(Object.isFrozen(IDENTITY_EXECUTION_ORDER));
});

test('legacy PASS parsing retains labels only and discards diagnostic payload text', () => {
  const labels = parseLegacyPassLabels(`${successfulOutput}\npassword=do-not-retain\ntoken=do-not-retain`);
  assert.equal(labels.has('logout revokes the browser session'), true);
  assert.equal(labels.has('password=do-not-retain'), false);
  assert.equal(labels.has('token=do-not-retain'), false);
});

test('identity batch returns each selected frozen ID exactly once in catalog order', async () => {
  const results = await runIdentityBatch(context(), scenarios);
  assert.deepEqual(results.map(result => result.scenarioId), scenarios.map(scenario => scenario.id));
  assert.equal(new Set(results.map(result => result.scenarioId)).size, 11);
  assert.equal(results.every(result => result.outcome !== 'PASS'), true);
  assert.equal(results.every(result => result.environment === 'local-emulator'), true);
});

test('successful compatibility assertions map only supported local dimensions', async () => {
  const results = await runIdentityBatch(context(), scenarios);
  const login = results.find(result => result.scenarioId === 'authentication-email-password-login');
  const logout = results.find(result => result.scenarioId === 'authentication-logout-revocation-multi-tab');
  const signup = results.find(result => result.scenarioId.startsWith('signup-onboarding-coach'));
  assert.equal(login.dimensions.permission.state, 'OBSERVED');
  assert.equal(login.dimensions.negativePath.state, 'NOT_OBSERVED');
  assert.equal(login.dimensions.responsive.state, 'NOT_OBSERVED');
  assert.equal(logout.dimensions.happyPath.state, 'OBSERVED');
  assert.equal(logout.dimensions.network.state, 'OBSERVED');
  assert.equal(logout.dimensions.negativePath.state, 'NOT_OBSERVED');
  assert.equal(signup.dimensions.happyPath.state, 'NOT_OBSERVED');
});

test('mailbox, hosted persistence, and background ownership remain explicit blockers', async () => {
  const results = await runIdentityBatch(context(), scenarios);
  const reset = results.find(result => result.scenarioId === 'authentication-password-reset');
  const lifecycle = results.find(result => result.scenarioId === 'account-lifecycle-disable-delete-cancel-purge');
  const demo = results.find(result => result.scenarioId === 'demo-seed-use-exit-expiry-cleanup');
  assert.match(reset.externalRequirements.join(' '), /approved QA mailbox/);
  assert.match(reset.externalRequirements.join(' '), /exact staging revision/);
  assert.equal(lifecycle.cleanup.owner, 'background-batch');
  assert.equal(lifecycle.cleanup.state, 'BLOCKED_PRECONDITION');
  assert.match(lifecycle.externalRequirements.join(' '), /Function\/scheduler/);
  assert.match(demo.externalRequirements.join(' '), /scheduled cleanup adapter/);
});

test('single-scenario selection returns only that row without manufacturing adjacent outcomes', async () => {
  const selected = selectLocalScenarios({ scenarioIds: ['authentication-password-reset'] });
  const results = await runIdentityBatch(context(), selected);
  assert.deepEqual(results.map(result => result.scenarioId), ['authentication-password-reset']);
  assert.equal(results[0].outcome, 'BLOCKED_PRECONDITION');
});

test('a compatibility-run failure records FAIL once and leaves later rows blocked', async () => {
  const failing = context({ runLegacyIdentityAudit: async () => { throw new Error('sanitized child failure'); } });
  const results = await runIdentityBatch(failing, scenarios);
  assert.equal(results[0].outcome, 'FAIL');
  assert.equal(results[0].dimensions.network.state, 'FAIL');
  assert.equal(results.slice(1).every(result => result.outcome === 'BLOCKED_PRECONDITION'), true);
  assert.equal(results.flatMap(result => result.cases).some(value => /password|token|cookie/i.test(JSON.stringify(value))), false);
});
