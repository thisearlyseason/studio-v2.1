import { CERTIFICATION_SCENARIOS } from '../scenario-catalog.mjs';

export const LOCAL_BATCH_ORDER = Object.freeze(['identity', 'tenants', 'operations']);

export const OPERATIONS_SCENARIO_IDS = Object.freeze([
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
  'tournaments-registration-waiver',
  'public-portals-squad-event-registration',
  'safety-incident-create-read-export',
  'facilities-facility-field-crud-rename',
  'facilities-availability-booking-delete',
  'equipment-inventory-assignment-return',
  'sports-hub-browse-search-filter-bookmark-preferences',
]);

export const SCENARIO_BATCH_ASSIGNMENTS = Object.freeze({
  identity: Object.freeze([
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
  ]),
  tenants: Object.freeze([
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
  ]),
  operations: OPERATIONS_SCENARIO_IDS,
});

const assignmentEntries = Object.entries(SCENARIO_BATCH_ASSIGNMENTS).flatMap(([batch, ids]) => (
  ids.map(id => [id, batch])
));
const assignmentByScenarioId = new Map(assignmentEntries);
if (assignmentByScenarioId.size !== assignmentEntries.length) {
  throw new Error('A certification scenario cannot be assigned to more than one local batch.');
}
const frozenScenarioIds = new Set(CERTIFICATION_SCENARIOS.map(scenario => scenario.id));
for (const [id] of assignmentEntries) {
  if (!frozenScenarioIds.has(id)) throw new Error(`Assigned certification scenario ${id} is absent from the frozen catalog.`);
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a ${flag === '--batch' ? 'batch name' : 'scenario ID'}.`);
  return value;
}

export function parseLocalBatchArgs(argv) {
  if (!Array.isArray(argv)) throw new TypeError('Local certification arguments must be an array.');
  const batches = [];
  const scenarioIds = [];
  let browser = false;
  let failFast = false;
  let list = false;
  let allLocal = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === 'identity') {
      batches.push('identity');
      continue;
    }
    if (argument === '--batch') {
      const batch = readValue(argv, index, argument);
      if (!LOCAL_BATCH_ORDER.includes(batch)) throw new Error(`Unknown local batch ${batch}.`);
      batches.push(batch);
      index += 1;
      continue;
    }
    if (argument === '--scenario') {
      scenarioIds.push(readValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === '--browser') browser = true;
    else if (argument === '--fail-fast') failFast = true;
    else if (argument === '--list') list = true;
    else if (argument === '--all-local') allLocal = true;
    else throw new Error(`Unknown local certification argument ${argument}.`);
  }

  if (!list && !allLocal && batches.length === 0 && scenarioIds.length === 0) {
    throw new Error('Local certification requires --batch, --scenario, --all-local, --list, or positional identity.');
  }

  return {
    batches: allLocal ? [...LOCAL_BATCH_ORDER] : [...new Set(batches)],
    scenarioIds: [...new Set(scenarioIds)],
    browser,
    failFast,
    list,
  };
}

export function selectLocalScenarios({
  batches = [],
  scenarioIds = [],
  catalog = CERTIFICATION_SCENARIOS,
} = {}) {
  const byId = new Map(catalog.map(scenario => [scenario.id, scenario]));
  const requestedIds = new Set();

  for (const batch of batches) {
    const assigned = SCENARIO_BATCH_ASSIGNMENTS[batch];
    if (!assigned) throw new Error(`Unknown local batch ${batch}.`);
    assigned.forEach(id => requestedIds.add(id));
  }
  for (const id of scenarioIds) {
    if (!byId.has(id)) throw new Error(`Unknown certification scenario ${id}.`);
    if (!assignmentByScenarioId.has(id)) {
      throw new Error(`Certification scenario ${id} is not assigned to a local batch.`);
    }
    requestedIds.add(id);
  }

  for (const id of requestedIds) {
    if (!byId.has(id)) throw new Error(`Assigned certification scenario ${id} is absent from the frozen catalog.`);
  }

  return Object.freeze(catalog.filter(scenario => requestedIds.has(scenario.id)));
}

export function groupScenariosByBatch(scenarios) {
  const grouped = new Map();
  for (const batch of LOCAL_BATCH_ORDER) {
    const values = scenarios.filter(scenario => assignmentByScenarioId.get(scenario.id) === batch);
    if (values.length > 0) grouped.set(batch, Object.freeze(values));
  }
  return grouped;
}
