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

const TENANT_IDS = [
  'teams-create-and-capacity',
  'teams-join-by-code',
  'teams-profile-branding-settings',
  'teams-module-visibility',
  'teams-seasonal-reset-delete-quota-resolution',
  'organization-club-school-overview',
  'organization-create-allocate-remove-squads',
  'organization-global-waivers-documents-admins',
  'roster-member-add-edit-remove-reinstate',
  'roster-search-filter-sort-export',
  'roster-parent-player-self-views',
  'recruiting-private-profile-crud',
  'recruiting-public-scout-projection',
  'family-children-invites-team-cards',
  'family-schedule-waivers-payments',
  'family-enable-youth-login',
];

const OPERATIONS_IDS = [
  'attendance-practice-event-member-attendance',
  'events-event-crud-recurrence',
  'events-rsvp-attendance-details',
  'calendar-team-family-views-and-filters',
  'calendar-ics-create-fetch-revoke',
  'reminders-same-day-fcm-scheduler',
  'practice-practice-plans-templates',
  'practice-drill-playbook-crud-search',
  'practice-film-upload-coach-marks-watch',
  'feed-post-media-comment-moderation',
  'chat-channel-message-unread',
  'polls-create-vote-change-tally',
  'email-verification-reset-welcome-team-email',
  'newsletter-subscribe-unsubscribe-admin-compose',
  'push-device-registration-preferences-target-send',
  'files-library-crud-download',
  'files-avatar-branding-player-media-paths',
  'waivers-team-global-waiver-lifecycle',
  'waivers-parent-player-coach-signature',
  'forms-league-tournament-registration-builder',
  'safety-incident-create-read-export',
  'facilities-facility-field-crud-rename',
  'facilities-availability-booking-delete',
  'equipment-inventory-assignment-return',
  'sports-hub-browse-search-filter-bookmark-preferences',
];

test('identity assignment owns the exact 11 Task 3 scenarios in catalog order', () => {
  assert.deepEqual(LOCAL_BATCH_ORDER, ['identity', 'tenants', 'operations']);
  assert.deepEqual(SCENARIO_BATCH_ASSIGNMENTS.identity, IDENTITY_IDS);

  const selected = selectLocalScenarios({ batches: ['identity'], catalog: CERTIFICATION_SCENARIOS });
  assert.deepEqual(selected.map(scenario => scenario.id), IDENTITY_IDS);
  assert.equal(new Set(selected).size, 11);
  assert.ok(Object.isFrozen(SCENARIO_BATCH_ASSIGNMENTS));
  assert.ok(Object.isFrozen(SCENARIO_BATCH_ASSIGNMENTS.identity));
});

test('tenant assignment owns exactly the 16 Task 4 scenarios in frozen catalog order', () => {
  assert.deepEqual(SCENARIO_BATCH_ASSIGNMENTS.tenants, TENANT_IDS);
  const selected = selectLocalScenarios({ batches: ['tenants'], catalog: CERTIFICATION_SCENARIOS });
  assert.deepEqual(selected.map(scenario => scenario.id), TENANT_IDS);
  assert.equal(new Set(selected.map(scenario => scenario.id)).size, 16);
  assert.ok(Object.isFrozen(SCENARIO_BATCH_ASSIGNMENTS.tenants));
});

test('operations assignment owns exactly the 25 Task 5 scenarios in frozen catalog order', () => {
  assert.deepEqual(LOCAL_BATCH_ORDER, ['identity', 'tenants', 'operations']);
  assert.deepEqual(SCENARIO_BATCH_ASSIGNMENTS.operations, OPERATIONS_IDS);
  const selected = selectLocalScenarios({ batches: ['operations'], catalog: CERTIFICATION_SCENARIOS });
  assert.deepEqual(selected.map(scenario => scenario.id), OPERATIONS_IDS);
  assert.equal(new Set(selected.map(scenario => scenario.id)).size, 25);
  assert.equal(selected.some(scenario => scenario.id === 'sports-hub-rss-refresh-admin-publish'), false);
});

test('tenant selection excludes adjacent and established scenarios', () => {
  const selected = new Set(selectLocalScenarios({ batches: ['tenants'] }).map(scenario => scenario.id));
  for (const id of [
    'signup-onboarding-youth-invitation-signup',
    'attendance-practice-event-member-attendance',
    'games-team-score-create-edit-reset',
    'billing-pricing-checkout-trial',
    'dashboard-shell-active-team-switch',
    'dashboard-shell-alerts-history-acknowledge',
  ]) assert.equal(selected.has(id), false, id);
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
    batches: ['identity', 'tenants', 'operations'], scenarioIds: [], browser: false, failFast: false, list: false,
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

test('selection rejects unknown batches, flags, scenarios, and non-local ownership', () => {
  assert.deepEqual(parseLocalBatchArgs(['--batch', 'tenants']).batches, ['tenants']);
  assert.throws(() => parseLocalBatchArgs(['--scenario']), /requires a scenario ID/);
  assert.throws(() => parseLocalBatchArgs(['--unknown']), /Unknown local certification argument/);
  assert.throws(() => selectLocalScenarios({ scenarioIds: ['not-a-scenario'] }), /Unknown certification scenario/);
  assert.throws(
    () => selectLocalScenarios({ scenarioIds: ['games-team-score-create-edit-reset'] }),
    /not assigned to a local batch/,
  );
});

test('grouping preserves batch order and catalog order across additive selection', () => {
  const selected = selectLocalScenarios({
    batches: ['tenants'],
    scenarioIds: ['authentication-password-reset', 'teams-create-and-capacity'],
  });
  const grouped = groupScenariosByBatch(selected);
  assert.deepEqual([...grouped.keys()], ['identity', 'tenants']);
  assert.deepEqual(grouped.get('identity').map(scenario => scenario.id), ['authentication-password-reset']);
  assert.deepEqual(grouped.get('tenants').map(scenario => scenario.id), TENANT_IDS);
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
