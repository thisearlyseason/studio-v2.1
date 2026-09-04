import assert from 'node:assert/strict';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import {
  LOCAL_BATCH_ORDER,
  SCENARIO_BATCH_ASSIGNMENTS,
  groupScenariosByBatch,
  parseLocalBatchArgs,
  selectLocalScenarios,
} from '../scripts/qa/certification/local/selection.mjs';

const IDENTITY_IDS = [
  'marketing-legal-contact-beta-coach-referral',
  'authentication-email-password-login',
  'authentication-logout-revocation-multi-tab',
  'authentication-password-reset',
  'account-lifecycle-disable-delete-cancel-purge',
  'signup-onboarding-coach-admin-league-parent-adult-player-signup',
  'signup-onboarding-youth-invitation-signup',
  'signup-onboarding-missing-profile-onboarding',
  'demo-seed-use-exit-expiry-cleanup',
  'dashboard-shell-role-landing-and-route-policy',
  'administration-access-and-user-directory',
];

test('identity assignment owns the exact 11 Task 3 scenarios in catalog order', () => {
  assert.deepEqual(LOCAL_BATCH_ORDER, ['identity']);
  assert.deepEqual(SCENARIO_BATCH_ASSIGNMENTS.identity, IDENTITY_IDS);

  const selected = selectLocalScenarios({ batches: ['identity'], catalog: CERTIFICATION_SCENARIOS });
  assert.deepEqual(selected.map(scenario => scenario.id), IDENTITY_IDS);
  assert.equal(new Set(selected).size, 11);
  assert.ok(Object.isFrozen(SCENARIO_BATCH_ASSIGNMENTS));
  assert.ok(Object.isFrozen(SCENARIO_BATCH_ASSIGNMENTS.identity));
});

test('identity selection excludes adjacent administration and established dashboard rows', () => {
  const selected = new Set(selectLocalScenarios({ batches: ['identity'] }).map(scenario => scenario.id));
  assert.equal(selected.has('administration-entitlement-account-control-plans'), false);
  assert.equal(selected.has('administration-beta-bugs-embeds-newsletter-sports-hub'), false);
  assert.equal(selected.has('dashboard-shell-active-team-switch'), false);
  assert.equal(selected.has('dashboard-shell-alerts-history-acknowledge'), false);
});

test('account lifecycle remains assigned to identity while preserving background cleanup ownership', () => {
  const [scenario] = selectLocalScenarios({
    scenarioIds: ['account-lifecycle-disable-delete-cancel-purge'],
  });
  assert.equal(scenario.id, 'account-lifecycle-disable-delete-cancel-purge');
  assert.equal(scenario.cleanupOwner, 'background-batch');
  assert.ok(Object.isFrozen(scenario));
});

test('CLI parser requires a selector and supports the documented positional compatibility form', () => {
  assert.throws(() => parseLocalBatchArgs([]), /requires --batch, --scenario, --all-local, --list, or positional identity/);
  assert.deepEqual(parseLocalBatchArgs(['identity']), {
    batches: ['identity'], scenarioIds: [], browser: false, failFast: false, list: false,
  });
  assert.deepEqual(parseLocalBatchArgs(['--batch', 'identity', '--browser', '--fail-fast']), {
    batches: ['identity'], scenarioIds: [], browser: true, failFast: true, list: false,
  });
  assert.deepEqual(parseLocalBatchArgs(['--all-local']), {
    batches: ['identity'], scenarioIds: [], browser: false, failFast: false, list: false,
  });
  assert.deepEqual(parseLocalBatchArgs(['--list']), {
    batches: [], scenarioIds: [], browser: false, failFast: false, list: true,
  });
});

test('scenario selectors are additive and deduplicated without widening scope', () => {
  const parsed = parseLocalBatchArgs([
    '--scenario', 'authentication-email-password-login',
    '--scenario', 'authentication-email-password-login',
    '--scenario', 'authentication-password-reset',
  ]);
  assert.deepEqual(parsed.scenarioIds, [
    'authentication-email-password-login',
    'authentication-password-reset',
  ]);
  assert.deepEqual(
    selectLocalScenarios(parsed).map(scenario => scenario.id),
    parsed.scenarioIds,
  );
});

test('selection rejects unknown batches, flags, scenarios, and non-local Task 3 ownership', () => {
  assert.throws(() => parseLocalBatchArgs(['--batch', 'tenants']), /Unknown local batch tenants/);
  assert.throws(() => parseLocalBatchArgs(['--scenario']), /requires a scenario ID/);
  assert.throws(() => parseLocalBatchArgs(['--unknown']), /Unknown local certification argument/);
  assert.throws(() => selectLocalScenarios({ scenarioIds: ['not-a-scenario'] }), /Unknown certification scenario/);
  assert.throws(
    () => selectLocalScenarios({ scenarioIds: ['teams-create-and-capacity'] }),
    /not assigned to a local Task 3 batch/,
  );
});

test('grouping produces a catalog-ordered immutable identity group', () => {
  const selected = selectLocalScenarios({
    scenarioIds: [
      'authentication-password-reset',
      'marketing-legal-contact-beta-coach-referral',
    ],
  });
  const grouped = groupScenariosByBatch(selected);
  assert.deepEqual(grouped.get('identity').map(scenario => scenario.id), [
    'marketing-legal-contact-beta-coach-referral',
    'authentication-password-reset',
  ]);
  assert.ok(Object.isFrozen(grouped.get('identity')));
});
