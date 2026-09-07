import { DIMENSION_NAMES, makeDimension } from '../evidence.mjs';
import { COMPETITION_SCENARIO_IDS, OPERATIONS_SCENARIO_IDS } from '../selection.mjs';

const caseId = (scenarioId, dimension) => `operations-${scenarioId}-${dimension}`;

// The schedule slice is deliberately expanded from the former one-case-per-
// dimension placeholder. Every frozen Task 5 case is represented exactly once;
// console/network/persistence envelopes remain separate evidence observations.
export const SCHEDULE_CASE_REQUIREMENTS = Object.freeze({
  'leagues-create-edit-clone-delete': Object.freeze({
    happyPath: ['league-create', 'league-edit', 'league-clone', 'league-delete'],
    negativePath: ['league-duplicate', 'league-quota', 'league-partial-clone'],
    permission: ['league-foreign-owner', 'league-anonymous-write'],
    persistence: ['league-reload', 'league-replay'],
    console: ['league-lifecycle-console'], network: ['league-lifecycle-network'],
    responsive: ['league-lifecycle-desktop', 'league-lifecycle-mobile'],
  }),
  'leagues-schedule-generation-deployment': Object.freeze({
    happyPath: ['league-schedule-generate', 'league-schedule-deploy'],
    negativePath: ['league-schedule-impossible', 'league-schedule-blackout', 'league-schedule-race'],
    permission: ['league-schedule-foreign-owner', 'league-schedule-direct-write'],
    persistence: ['league-schedule-reload'], console: ['league-schedule-console'],
    network: ['league-schedule-network'], responsive: ['league-schedule-desktop'],
  }),
  'leagues-registration-assignment': Object.freeze({
    happyPath: ['league-register', 'league-review', 'league-assign'],
    negativePath: ['league-register-duplicate', 'league-register-invalid', 'league-register-unpublished'],
    permission: ['league-ledger-private', 'league-registrant-assign-deny', 'league-assignment-foreign-owner'],
    persistence: ['league-assignment-reload'], console: ['league-assignment-console'],
    network: ['league-assignment-network'], responsive: ['league-assignment-desktop', 'league-assignment-mobile'],
  }),
  'leagues-scorekeeper-spectator': Object.freeze({
    happyPath: ['league-score-submit', 'league-public-score'],
    negativePath: ['league-score-wrong-pin', 'league-score-replay', 'league-score-downstream-conflict'],
    permission: ['league-score-narrow-scope', 'league-score-outsider-deny'],
    persistence: ['league-score-reload'], console: ['league-score-console'], network: ['league-score-network'],
    responsive: ['league-score-desktop', 'league-score-mobile'],
  }),
  'tournaments-create-configure-replicate-archive': Object.freeze({
    happyPath: ['tournament-create', 'tournament-configure', 'tournament-replicate', 'tournament-archive'],
    negativePath: ['tournament-invalid-format', 'tournament-partial-replica', 'tournament-duplicate', 'tournament-archive-cancel'],
    permission: ['tournament-foreign-staff', 'tournament-foreign-team'],
    persistence: ['tournament-lifecycle-reload', 'tournament-lifecycle-replay'],
    console: ['tournament-lifecycle-console'], network: ['tournament-lifecycle-network'],
    responsive: ['tournament-lifecycle-desktop', 'tournament-lifecycle-mobile'],
  }),
  'tournaments-schedule-pools-brackets-referees': Object.freeze({
    happyPath: ['tournament-schedule-generate', 'tournament-pools-bracket', 'tournament-referee-assign'],
    negativePath: ['tournament-schedule-impossible', 'tournament-referee-conflict'],
    permission: ['tournament-referee-role-deny', 'tournament-schedule-foreign-deny'],
    persistence: ['tournament-schedule-reload'], console: ['tournament-schedule-console'], network: ['tournament-schedule-network'],
    responsive: ['tournament-schedule-desktop', 'tournament-schedule-mobile'],
  }),
  'tournaments-scoring-dispute-public-standings': Object.freeze({
    happyPath: ['tournament-score-submit', 'tournament-dispute-open', 'tournament-dispute-resolve', 'tournament-public-standings'],
    negativePath: ['tournament-score-wrong-pin', 'tournament-score-replay', 'tournament-score-downstream-conflict'],
    permission: ['tournament-score-narrow-scope', 'tournament-score-outsider-deny'],
    persistence: ['tournament-scoring-reload'], console: ['tournament-scoring-console'], network: ['tournament-scoring-network'],
    responsive: ['tournament-scoring-desktop', 'tournament-scoring-mobile'],
  }),
  'forms-league-tournament-registration-builder':Object.freeze({
    happyPath:['form-create','form-edit'],negativePath:['form-duplicate-field','form-invalid-type','form-empty-options','form-overlimit','form-unpublished'],
    permission:['form-owner-b','form-registrant','form-division-architect'],persistence:['form-persistence'],console:['form-console'],network:['form-network'],responsive:['form-responsive'],
  }),
  'tournaments-registration-waiver':Object.freeze({
    happyPath:['tourn-public-register','tourn-linked-team','tourn-waiver'],negativePath:['tourn-invalid-code','tourn-wrong-team','tourn-invalid-form','tourn-duplicate','tourn-unpublished','tourn-bracket-locked','tourn-waiver-replay','tourn-waiver-wrong-child','tourn-waiver-wrong-date'],
    permission:['tourn-ledger-private','tourn-owner-b-ledger-deny','tourn-anonymous-direct-write'],persistence:['tourn-persistence'],console:['tourn-console'],network:['tourn-network'],responsive:['tourn-responsive'],
  }),
  'public-portals-squad-event-registration':Object.freeze({
    happyPath:['portal-squad-view','portal-event-read','portal-event-submit'],negativePath:['portal-squad-invalid','portal-squad-code','portal-squad-tenant','portal-event-duplicate','portal-event-race','portal-event-invalid','portal-event-unpublished'],
    permission:['portal-ledger-private','portal-pii'],persistence:['portal-event-review'],console:['portal-console'],network:['portal-network'],responsive:['portal-responsive'],
  }),
  'safety-incident-create-read-export':Object.freeze({
    happyPath:['incident-create','incident-export','incident-attachment'],negativePath:['incident-required','incident-edit-delete'],
    permission:['incident-participant','incident-outsider','incident-team-b'],persistence:['incident-read'],
    console:['incident-console'],network:['incident-network'],responsive:['incident-responsive'],
  }),
  'files-avatar-branding-player-media-paths':Object.freeze({
    happyPath:['media-user-avatar','media-player-self','media-parent','media-team-owner','media-branding'],
    negativePath:['media-type','media-image-boundary','media-video-boundary'],
    permission:['media-private-public','media-wrong-player','media-wrong-team','media-outsider','media-unverified','media-suspended'],
    persistence:['media-delete'],console:['media-console'],network:['media-network'],responsive:['media-responsive'],
  }),
  'files-library-crud-download':Object.freeze({
    happyPath:['lib-upload','lib-download'],negativePath:['lib-mime-spoof','lib-oversize','lib-wrong-path'],
    permission:['lib-member-read','lib-private-public','lib-team-b'],persistence:['lib-delete','lib-stale'],
    console:['lib-console'],network:['lib-network'],responsive:['lib-responsive'],
  }),
  'polls-create-vote-change-tally': Object.freeze({
    happyPath:['poll-create','poll-vote','poll-change'], negativePath:['poll-invalid','poll-replay','poll-invalid-option'],
    permission:['poll-ineligible','poll-removed','poll-team-b','poll-module-off'], persistence:['poll-race'],
    console:['poll-console'],network:['poll-network'],responsive:['poll-responsive'],
  }),
  'feed-post-media-comment-moderation': Object.freeze({
    happyPath: ['feed-post-comment','feed-media','feed-author-delete','feed-moderator-delete'],
    negativePath: ['feed-media-invalid','feed-replay'],
    permission: ['feed-audience','feed-parent','feed-removed','feed-team-b','feed-module-off'],
    persistence: ['feed-persistence'], console: ['feed-console'], network: ['feed-network'], responsive: ['feed-responsive'],
  }),
  'chat-channel-message-unread': Object.freeze({
    happyPath: ['chat-create', 'chat-sync'],
    negativePath: ['chat-duplicate', 'chat-offline', 'chat-deleted'],
    permission: ['chat-audience', 'chat-sender', 'chat-removed', 'chat-team-b', 'chat-module-off'],
    persistence: ['chat-unread'], console: ['chat-console'], network: ['chat-network'], responsive: ['chat-responsive'],
  }),
  'attendance-practice-event-member-attendance': Object.freeze({
    happyPath: ['att-staff-record'], negativePath: ['att-duplicate'],
    permission: ['att-member-readonly', 'att-removed', 'att-removed-read', 'att-tenant-b'], persistence: ['att-race'],
    console: ['att-console'], network: ['att-network'], responsive: ['att-responsive'],
  }),
  'events-event-crud-recurrence': Object.freeze({
    happyPath: ['evt-crud', 'evt-series', 'evt-occurrence-edit-delete', 'evt-dst-spring', 'evt-dst-fall', 'evt-midnight'],
    negativePath: ['evt-invalid', 'evt-conflict', 'evt-resource-conflict', 'evt-location-conflict', 'evt-double'], permission: ['evt-member-deny', 'evt-assistant-own', 'evt-team-b-deny'],
    persistence: ['evt-persistence'], console: ['evt-console'], network: ['evt-network'], responsive: ['evt-responsive'],
  }),
  'events-rsvp-attendance-details': Object.freeze({
    happyPath: ['rsvp-self', 'rsvp-parent-child', 'rsvp-parent-team-c', 'rsvp-staff'], negativePath: ['rsvp-cancelled', 'rsvp-replay'],
    permission: ['rsvp-forged-uid', 'rsvp-removed', 'rsvp-tenant-b'], persistence: ['rsvp-race'],
    console: ['rsvp-console'], network: ['rsvp-network'], responsive: ['rsvp-responsive'],
  }),
  'calendar-team-family-views-and-filters': Object.freeze({
    happyPath: ['cal-team-a-b', 'cal-family-a-c', 'cal-filters'], negativePath: ['cal-empty', 'cal-invalid'],
    permission: ['cal-outsider'], persistence: ['cal-rapid-switch', 'cal-midnight', 'cal-dst-spring', 'cal-dst-fall'],
    console: ['cal-console'], network: ['cal-network'], responsive: ['cal-responsive'],
  }),
  'calendar-ics-create-fetch-revoke': Object.freeze({
    happyPath: ['ics-user', 'ics-team', 'ics-multi', 'ics-rfc'], negativePath: ['ics-invalid-type', 'ics-foreign-team', 'ics-too-many'],
    permission: ['ics-invalid-token', 'ics-unknown-token', 'ics-inactive-token', 'ics-membership-revoke'], persistence: ['ics-rotate'],
    console: ['ics-console', 'ics-secret'], network: ['ics-network'], responsive: ['ics-responsive-na'],
  }),
  'reminders-same-day-fcm-scheduler': Object.freeze({
    happyPath: ['rem-eligible'], negativePath: ['rem-invalid-time', 'rem-past-time', 'rem-no-token'],
    permission: ['rem-pref-off', 'rem-removed', 'rem-sender'], persistence: ['rem-duplicate-run', 'rem-time-boundary', 'rem-retry'],
    console: ['rem-redaction'], network: ['rem-network'], responsive: ['rem-responsive-na'],
  }),
  'practice-practice-plans-templates': Object.freeze({
    happyPath: ['plan-create-edit', 'plan-assign'], negativePath: ['plan-empty-invalid', 'plan-delete-free', 'plan-delete-in-use'],
    permission: ['plan-member-deny', 'plan-team-b-deny', 'plan-entitlement'], persistence: ['plan-persistence'],
    console: ['plan-console'], network: ['plan-network'], responsive: ['plan-responsive'],
  }),
  'practice-drill-playbook-crud-search': Object.freeze({
    happyPath: ['drill-crud', 'drill-reorder', 'drill-search', 'drill-link-valid'], negativePath: ['drill-link-invalid', 'drill-duplicate-empty'],
    permission: ['drill-member-deny', 'drill-team-b-deny'], persistence: ['drill-persistence'],
    console: ['drill-console'], network: ['drill-network'], responsive: ['drill-responsive'],
  }),
  'practice-film-upload-coach-marks-watch': Object.freeze({
    happyPath: ['film-upload', 'film-photo', 'film-mark'], negativePath: ['film-type', 'film-size', 'film-url', 'film-time-invalid'],
    permission: ['film-progress-forge', 'film-mark-player', 'film-team-b'], persistence: ['film-progress-own', 'film-delete'],
    console: ['film-console'], network: ['film-network'], responsive: ['film-responsive'],
  }),
  'waivers-team-global-waiver-lifecycle': Object.freeze({
    happyPath: ['waiver-team-crud', 'waiver-global-deploy', 'waiver-version'],
    negativePath: ['waiver-partial', 'waiver-duplicate', 'waiver-empty'],
    permission: ['waiver-staff', 'waiver-delegate', 'waiver-team-b'],
    persistence: ['waiver-archive'], console: ['waiver-console'], network: ['waiver-network'],
    responsive: ['waiver-responsive'],
  }),
  'waivers-parent-player-coach-signature': Object.freeze({
    happyPath: ['sign-parent-child', 'sign-adult', 'sign-youth', 'sign-coach'],
    negativePath: ['sign-replay', 'sign-new-version', 'sign-wrong-date', 'sign-wrong-child', 'sign-wrong-event'],
    permission: ['sign-parent-b', 'sign-team-b', 'sign-removed'],
    persistence: ['sign-text-immutable'], console: ['sign-console'], network: ['sign-network'],
    responsive: ['sign-responsive'],
  }),
});

export const COMPETITION_SCENARIO_CASES = Object.freeze(Object.fromEntries(
  COMPETITION_SCENARIO_IDS.map(id => [id, SCHEDULE_CASE_REQUIREMENTS[id]]),
));

const COMPETITION_EXECUTION_BASE = Object.freeze({
  'leagues-create-edit-clone-delete': { actor: 'qa-league-owner-a', foreignActor: 'qa-league-owner-b', route: '/api/leagues/lifecycle', fixtureFamily: 'qa-league-a+qa-league-b', handler: 'runCompetitionLifecycleWorkflowAudit' },
  'leagues-schedule-generation-deployment': { actor: 'qa-league-owner-a', foreignActor: 'qa-league-owner-b', route: '/api/leagues/schedule', fixtureFamily: 'qa-league-a+qa-league-b', handler: 'runCompetitionScheduleWorkflowAudit' },
  'leagues-registration-assignment': { actor: 'qa-league-owner-a', foreignActor: 'qa-league-owner-b', route: '/api/leagues/assignments', fixtureFamily: 'qa-league-a+qa-league-b', handler: 'runCompetitionAssignmentWorkflowAudit' },
  'leagues-scorekeeper-spectator': { actor: 'qa-league-owner-a', foreignActor: 'qa-league-owner-b', route: '/api/leagues/scoring', fixtureFamily: 'qa-league-a+qa-league-b', handler: 'runCompetitionScoringWorkflowAudit' },
  'tournaments-create-configure-replicate-archive': { actor: 'qa-coach-owner-a', foreignActor: 'qa-coach-owner-b', route: '/api/tournaments/lifecycle', fixtureFamily: 'qa-tournament-a+qa-tournament-b', handler: 'runCompetitionLifecycleWorkflowAudit' },
  'tournaments-schedule-pools-brackets-referees': { actor: 'qa-coach-owner-a', foreignActor: 'qa-coach-owner-b', route: '/api/tournaments/schedule', fixtureFamily: 'qa-tournament-a+qa-tournament-b', handler: 'runCompetitionScheduleWorkflowAudit' },
  'tournaments-scoring-dispute-public-standings': { actor: 'qa-coach-owner-a', foreignActor: 'qa-coach-owner-b', route: '/api/tournaments/scoring', fixtureFamily: 'qa-tournament-a+qa-tournament-b', handler: 'runCompetitionScoringWorkflowAudit' },
});

const PUBLIC_COMPETITION_CASES = new Set([
  'league-anonymous-write', 'league-register', 'league-register-duplicate', 'league-register-invalid',
  'league-register-unpublished', 'league-public-score', 'league-score-narrow-scope', 'tournament-schedule-reload',
  'tournament-public-standings', 'tournament-scoring-reload',
]);
const MEMBER_COMPETITION_CASES = new Set([
  'league-registrant-assign-deny', 'league-ledger-private', 'league-score-outsider-deny',
  'tournament-referee-role-deny', 'tournament-score-narrow-scope', 'tournament-score-outsider-deny',
]);
const FOREIGN_COMPETITION_CASES = new Set([
  'league-foreign-owner', 'league-schedule-foreign-owner', 'league-assignment-foreign-owner',
  'tournament-foreign-staff', 'tournament-foreign-team', 'tournament-schedule-foreign-deny',
]);
const SECONDARY_OWNER_COMPETITION_CASES = new Set(['league-quota']);
const PUBLIC_SCOREKEEPER_CASES = new Set([
  'league-score-submit', 'league-score-wrong-pin', 'league-score-replay', 'league-score-downstream-conflict',
  'tournament-score-submit', 'tournament-score-wrong-pin', 'tournament-score-replay', 'tournament-score-downstream-conflict', 'tournament-score-narrow-scope',
]);
const EXACT_COMPETITION_ACTORS = Object.freeze({
  'league-score-outsider-deny': 'qa-removed-member',
  'tournament-referee-role-deny': 'qa-adult-player-a',
  'tournament-foreign-staff': 'qa-school-delegate',
  'tournament-foreign-team': 'qa-coach-owner-b',
  'tournament-schedule-foreign-deny': 'qa-coach-owner-b',
  'tournament-score-outsider-deny': 'qa-removed-member',
});
function actorForCompetitionCase(base, caseId) {
  if (EXACT_COMPETITION_ACTORS[caseId]) return EXACT_COMPETITION_ACTORS[caseId];
  if (PUBLIC_SCOREKEEPER_CASES.has(caseId)) return 'qa-public-submitter';
  if (PUBLIC_COMPETITION_CASES.has(caseId)) return 'qa-public-submitter';
  if (MEMBER_COMPETITION_CASES.has(caseId)) return 'qa-team-member';
  if (FOREIGN_COMPETITION_CASES.has(caseId)) return base.foreignActor;
  if (SECONDARY_OWNER_COMPETITION_CASES.has(caseId)) return base.foreignActor;
  return base.actor;
}

const PATCH_COMPETITION_CASES = new Set([
  'league-edit', 'league-foreign-owner', 'league-anonymous-write', 'league-review', 'league-assign',
  'league-registrant-assign-deny', 'league-assignment-foreign-owner',
]);
const DELETE_COMPETITION_CASES = new Set(['league-delete']);
const PUBLIC_ACTION_CASES = new Set([
  'league-register', 'league-register-duplicate', 'league-register-invalid', 'league-register-unpublished',
  ...PUBLIC_SCOREKEEPER_CASES,
]);
const PUBLIC_READ_CASES = new Set(['league-reload', 'league-schedule-reload', 'league-public-score', 'league-score-reload', 'tournament-lifecycle-reload', 'tournament-schedule-reload', 'tournament-public-standings', 'tournament-scoring-reload']);
const ASSIGNMENT_CASES = new Set([
  'league-review', 'league-assign', 'league-ledger-private', 'league-registrant-assign-deny',
  'league-assignment-foreign-owner', 'league-assignment-reload', 'league-assignment-console',
  'league-assignment-network', 'league-assignment-desktop', 'league-assignment-mobile',
]);
const BROWSER_COMPETITION_DIMENSIONS = new Set(['console', 'network', 'responsive']);
const browserPathForCompetitionScenario = scenarioId => scenarioId.startsWith('tournaments-') ? '/manage-tournaments' : '/competition';
const routeForCompetitionCase = (base, caseId, scenarioId, dimension) => caseId === 'tournament-archive-cancel' || (BROWSER_COMPETITION_DIMENSIONS.has(dimension) && dimension !== 'network')
  ? browserPathForCompetitionScenario(scenarioId)
  : PUBLIC_ACTION_CASES.has(caseId)
  ? '/api/public/portals/action'
  : caseId === 'league-schedule-direct-write'
    ? '/v1/projects/{projectId}/databases/(default)/documents/leagues/{leagueId}'
  : caseId === 'league-score-narrow-scope'
    ? '/v1/projects/{projectId}/databases/(default)/documents/leagues/{leagueId}/private/lifecycle'
  : PUBLIC_READ_CASES.has(caseId)
    ? '/api/public/portals'
    : ASSIGNMENT_CASES.has(caseId)
      ? '/api/leagues/assignments'
      : base.route;
const methodForCompetitionCase = (caseId, dimension) => caseId === 'tournament-archive-cancel' || (BROWSER_COMPETITION_DIMENSIONS.has(dimension) && dimension !== 'network')
  ? 'GET'
  : DELETE_COMPETITION_CASES.has(caseId)
  ? 'DELETE'
  : caseId === 'league-schedule-direct-write'
    ? 'PATCH'
  : caseId === 'league-score-narrow-scope'
    ? 'GET'
  : PATCH_COMPETITION_CASES.has(caseId)
    ? 'PATCH'
    : PUBLIC_READ_CASES.has(caseId) || caseId === 'league-ledger-private' || caseId === 'league-assignment-reload'
      ? 'GET'
      : 'POST';

const COMPETITION_EXACT_STATUS = Object.freeze({
  'league-create': [201], 'league-clone': [201], 'league-replay': [201],
  'league-duplicate': [409], 'league-quota': [409], 'league-partial-clone': [201, 409],
  'league-foreign-owner': [403], 'league-anonymous-write': [401],
  'league-schedule-impossible': [400], 'league-schedule-blackout': [400], 'league-schedule-race': [409],
  'league-schedule-foreign-owner': [403], 'league-schedule-direct-write': [403],
  'league-register-duplicate': [409], 'league-register-invalid': [400], 'league-register-unpublished': [409],
  'league-ledger-private': [403], 'league-registrant-assign-deny': [403], 'league-assignment-foreign-owner': [403],
  'league-score-wrong-pin': [403], 'league-score-replay': [200], 'league-score-downstream-conflict': [409],
  'league-score-narrow-scope': [403], 'league-score-outsider-deny': [403],
  'tournament-invalid-format': [400], 'tournament-partial-replica': [200, 409], 'tournament-duplicate': [409], 'tournament-archive-cancel': [200],
  'tournament-foreign-staff': [403], 'tournament-foreign-team': [403],
  'tournament-schedule-impossible': [409], 'tournament-referee-conflict': [409],
  'tournament-referee-role-deny': [403], 'tournament-schedule-foreign-deny': [403],
  'tournament-score-wrong-pin': [403], 'tournament-score-replay': [200], 'tournament-score-downstream-conflict': [409],
  'tournament-score-narrow-scope': [403], 'tournament-score-outsider-deny': [403],
});

export const COMPETITION_CASE_EXECUTION_CONTRACTS = Object.freeze(Object.fromEntries(
  COMPETITION_SCENARIO_IDS.map(scenarioId => {
    const base = COMPETITION_EXECUTION_BASE[scenarioId];
    return [scenarioId, Object.freeze(Object.fromEntries(Object.entries(COMPETITION_SCENARIO_CASES[scenarioId]).flatMap(([dimension, ids]) =>
      ids.map(id => [id, Object.freeze({
        caseId: id, dimension, actor: actorForCompetitionCase(base, id), route: routeForCompetitionCase(base, id, scenarioId, dimension),
        handlerId: `competition-case:${id}`,
        method: methodForCompetitionCase(id, dimension),
        expectedStatuses: Object.freeze(dimension === 'network' ? [base.route === '/api/leagues/assignments' ? 405 : 400] : COMPETITION_EXACT_STATUS[id] || [200]),
        postconditions: Object.freeze([
          `${id}-exact-response-status`,
          dimension === 'negativePath' || dimension === 'permission' ? `${id}-zero-mutation` : `${id}-authoritative-state`,
        ]),
        cleanupSelectors: Object.freeze([
          `competition-discovery:${scenarioId}:{runId}`,
        ]),
        requestId: `qa-${id}-{runId}`, assertionId: `assertion-${id}-{sequence}`,
        expectedResult: 'exact case postcondition and explicit HTTP status',
        fixtureFamily: base.fixtureFamily, handler: base.handler,
        cleanupOwner: 'scenario-resource-registry',
        consoleCapture: dimension === 'console' || dimension === 'responsive',
        networkCapture: true,
        responsiveBounds: dimension === 'responsive'
          ? Object.freeze(id.endsWith('mobile') ? [{ width: 390, height: 844 }] : [{ width: 1440, height: 900 }])
          : Object.freeze([]),
      })]),
    )))];
  }),
));

export function assertCompetitionCaseContracts(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Competition case registry must be an object.');
  }
  const globalIds = new Set();
  for (const scenarioId of COMPETITION_SCENARIO_IDS) {
    const cases = registry[scenarioId];
    if (!cases) throw new Error(`Missing competition scenario ${scenarioId}.`);
    for (const dimension of DIMENSION_NAMES) {
      if (!Array.isArray(cases[dimension]) || cases[dimension].length === 0) {
        throw new Error(`Competition scenario ${scenarioId} is missing ${dimension} cases.`);
      }
      for (const id of cases[dimension]) {
        if (typeof id !== 'string' || !id) throw new Error(`${scenarioId}/${dimension} has an invalid case ID.`);
        if (globalIds.has(id)) throw new Error(`Duplicate competition case ID ${id}.`);
        globalIds.add(id);
        const execution = COMPETITION_CASE_EXECUTION_CONTRACTS[scenarioId]?.[id];
        for (const field of ['actor', 'route', 'requestId', 'assertionId', 'expectedResult', 'fixtureFamily', 'handler', 'handlerId', 'method', 'cleanupOwner']) {
          if (typeof execution?.[field] !== 'string' || !execution[field]) throw new Error(`Competition case ${id} is missing ${field}.`);
        }
        if (execution.dimension !== dimension || execution.networkCapture !== true || !Array.isArray(execution.responsiveBounds) ||
            !Array.isArray(execution.expectedStatuses) || !execution.expectedStatuses.length || !Array.isArray(execution.postconditions) || !execution.postconditions.length ||
            !Array.isArray(execution.cleanupSelectors) || !execution.cleanupSelectors.length) {
          throw new Error(`Competition case ${id} has incomplete execution provenance.`);
        }
      }
    }
  }
  const extras = Object.keys(registry).filter(id => !COMPETITION_SCENARIO_IDS.includes(id));
  if (extras.length) throw new Error(`Unexpected competition scenario(s): ${extras.join(', ')}.`);
  return Object.freeze([...globalIds]);
}

assertCompetitionCaseContracts(COMPETITION_SCENARIO_CASES);

export function assertAuthoritativeCompetitionEvents(events, scenarioIds = COMPETITION_SCENARIO_IDS, { childCode = 0 } = {}) {
  if (childCode !== 0) throw new Error(`Competition child failed with code ${childCode}.`);
  const assertionOwners = new Map();
  const requestOwners = new Map();
  for (const scenarioId of scenarioIds) {
    const scenarioErrors = events.filter(item => item?.type === 'scenario-error' && item.scenarioId === scenarioId);
    if (scenarioErrors.length) throw new Error(`Competition scenario ${scenarioId} failed at ${scenarioErrors[0].stage || 'runtime'}.`);
    const cases = events.filter(item => item?.type === 'case' && item.scenarioId === scenarioId);
    for (const required of Object.values(COMPETITION_SCENARIO_CASES[scenarioId]).flat()) {
      const matching = cases.filter(item => item.caseId === required);
      if (matching.length !== 1) throw new Error(`Missing competition case ${scenarioId}/${required}.`);
      const item = matching[0];
      const contract = COMPETITION_CASE_EXECUTION_CONTRACTS[scenarioId][required];
      if (item.state !== 'OBSERVED') throw new Error(`Competition case ${required} was not observed.`);
      if (!Array.isArray(item.assertions) || item.assertions.length === 0) throw new Error(`Competition case ${required} is missing assertion evidence.`);
      if (!Array.isArray(item.execution?.requests) || item.execution.requests.length === 0) throw new Error(`Competition case ${required} is missing request evidence.`);
      if (item.dimension !== contract.dimension || item.execution.actor !== contract.actor) throw new Error(`Competition case ${required} actor or dimension does not match its frozen contract.`);
      if (typeof item.execution.runId !== 'string' || item.execution.runId !== item.runId) throw new Error(`Competition case ${required} has mismatched run ownership.`);
      const expectedRequestId = contract.requestId.replace('{runId}', item.runId);
      if (item.execution.requestId !== expectedRequestId) throw new Error(`Competition case ${required} has mismatched request ID.`);
      const expectedSelectors = contract.cleanupSelectors.map(selector => selector.replace('{runId}', item.runId));
      if (JSON.stringify(item.execution.cleanupSelectors) !== JSON.stringify(expectedSelectors)) throw new Error(`Competition case ${required} has mismatched cleanup selectors.`);
      if (JSON.stringify(item.execution.postconditionIds) !== JSON.stringify(contract.postconditions)) throw new Error(`Competition case ${required} has mismatched postcondition IDs.`);
      for (const assertion of item.assertions) {
        if (!assertion?.id) throw new Error(`Competition case ${required} is missing assertion ID.`);
        if (assertionOwners.has(assertion.id)) throw new Error(`Duplicate assertion ID ${assertion.id}.`);
        assertionOwners.set(assertion.id, required);
        if (!new RegExp(`^assertion-${required}-\\d+$`).test(assertion.id) || !contract.postconditions.includes(assertion.postconditionId)) {
          throw new Error(`Competition case ${required} has an assertion outside its frozen contract.`);
        }
      }
      for (const request of item.execution.requests) {
        if (!request?.evidenceId) throw new Error(`Competition case ${required} is missing request evidence ID.`);
        if (requestOwners.has(request.evidenceId)) throw new Error(`Duplicate request evidence ID ${request.evidenceId}.`);
        requestOwners.set(request.evidenceId, required);
        const frozenRuntimeRoute = item.execution.route || contract.route;
        if (item.execution.method !== contract.method || JSON.stringify(item.execution.expectedStatuses) !== JSON.stringify(contract.expectedStatuses) ||
            request.actorAlias !== contract.actor || request.method !== contract.method || request.pathname !== frozenRuntimeRoute || !contract.expectedStatuses.includes(request.status)) {
          throw new Error(`Competition case ${required} has request evidence outside its frozen method, route, actor, or status contract.`);
        }
      }
    }
  }
  const runIds = new Set(events.filter(item => item?.type === 'case' && scenarioIds.includes(item.scenarioId)).map(item => item.runId));
  if (runIds.size !== 1) throw new Error('Competition evidence must have one exact run ID.');
  const runId = [...runIds][0];
  const cleanupReferences = new Set(events.filter(item => item?.type === 'case' && scenarioIds.includes(item.scenarioId)).map(item => item.execution?.cleanupReference));
  if (cleanupReferences.size !== 1) throw new Error('Competition evidence must have one exact cleanup reference.');
  const cleanupId = [...cleanupReferences][0];
  const cleanupEvents = events.filter(item => item?.type === 'cleanup');
  const finalCleanup = cleanupEvents.at(-1);
  if (!finalCleanup || finalCleanup.runId !== runId || finalCleanup.cleanupId !== cleanupId) {
    throw new Error('Competition final cleanup evidence belongs to an unrelated run or cleanup reference.');
  }
  const matchingCleanup = cleanupEvents.filter(item => item.runId === runId && item.cleanupId === cleanupId);
  if (matchingCleanup.length !== 1) throw new Error('Competition cleanup evidence does not match the exact run and cleanup reference.');
  const cleanup = matchingCleanup[0];
  if (!cleanup || cleanup.state !== 'OBSERVED') {
    if (cleanup?.state === 'FAIL' || (Array.isArray(cleanup?.residuals) && cleanup.residuals.length)) {
      throw new Error(`Competition cleanup residue remains: ${(cleanup.residuals || []).join(', ')}.`);
    }
    throw new Error('Competition cleanup evidence is missing or unobserved.');
  }
  if (cleanup?.state === 'FAIL' || (Array.isArray(cleanup?.residuals) && cleanup.residuals.length)) {
    throw new Error(`Competition cleanup residue remains: ${(cleanup.residuals || []).join(', ')}.`);
  }
  const requiredSelectors = new Set(scenarioIds.flatMap(scenarioId =>
    COMPETITION_CASE_EXECUTION_CONTRACTS[scenarioId][Object.values(COMPETITION_SCENARIO_CASES[scenarioId]).flat()[0]].cleanupSelectors
      .map(selector => selector.replace('{runId}', runId))));
  for (const selector of requiredSelectors) if (!cleanup.selectors?.includes(selector)) throw new Error(`Competition cleanup is missing declared selector ${selector}.`);
  return true;
}

export function selectFrozenCompetitionRequests(requests, contract) {
  const selected = (requests || []).filter(request =>
    request?.actorAlias === contract.actor &&
    request?.method === contract.method &&
    request?.pathname === contract.route &&
    contract.expectedStatuses.includes(request?.status));
  if (selected.length === 0) throw new Error('Competition case is missing exact frozen request evidence.');
  return selected;
}

// This registry is intentionally separate from cleanup ownership. Several
// operations rows have provider/background/device cleanup owners, but they
// still require a local operations contribution. Case IDs are explicit so a
// legacy-child event cannot accidentally satisfy a neighboring scenario.
export const LOCAL_OPERATIONS_CASE_REQUIREMENTS = Object.freeze(Object.fromEntries(
  OPERATIONS_SCENARIO_IDS.map(scenarioId => [scenarioId, Object.freeze(Object.fromEntries(
    DIMENSION_NAMES.map(dimension => [dimension, Object.freeze(
      SCHEDULE_CASE_REQUIREMENTS[scenarioId]?.[dimension] || [caseId(scenarioId, dimension)],
    )]),
  ))]),
));

function parseCertificationEvents(output) {
  return String(output || '').split(/\r?\n/).flatMap(line => {
    if (!line.startsWith('CERTIFICATION_EVENT ')) return [];
    try { return [JSON.parse(line.slice('CERTIFICATION_EVENT '.length))]; } catch { return []; }
  });
}

// Operations must never inherit the whole scenario assertion bag.  A case
// artifact may contain only assertions that its declared contract selected.
export function selectCaseOwnedOperationAssertions(assertions, requiredPatterns) {
  const selected = [];
  for (const pattern of requiredPatterns) {
    const matches = assertions.filter(assertion => pattern.test(assertion.label));
    if (matches.length === 0) throw new Error(`Missing required operation assertion: ${pattern}.`);
    for (const assertion of matches) if (!selected.includes(assertion)) selected.push(assertion);
  }
  return Object.freeze(selected);
}

// Named operation cases are evidence records, not labels applied after a
// scenario-wide workflow.  Keep this validation in the batch module so both
// the legacy audit bridge and result-manifest writer use the same contract.
export function assertCaseOwnedOperationArtifacts(cases) {
  if (!Array.isArray(cases)) throw new TypeError('Operation case artifacts must be an array.');
  const assertionOwners = new Map();
  const requestEvidenceOwners = new Map();
  for (const item of cases) {
    if (!item || typeof item.caseId !== 'string' || !Array.isArray(item.assertions) || item.assertions.length === 0) {
      throw new Error('Each operation case requires a case ID and at least one exact assertion.');
    }
    const execution = item.execution;
    for (const field of ['actor', 'operation', 'reconciliation', 'observer', 'timeBound', 'cleanupReference']) {
      if (typeof execution?.[field] !== 'string' || execution[field].trim() === '') {
        throw new Error(`Operation case ${item.caseId} is missing ${field}.`);
      }
    }
    if (!Array.isArray(execution.requests) || execution.requests.length === 0) {
      throw new Error(`Operation case ${item.caseId} is missing requests.`);
    }
    for (const request of execution.requests) {
      const method = request?.method;
      const pathname = request?.pathname;
      const status = request?.status;
      const actorAlias = request?.actorAlias;
      const isHttp = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
        && typeof pathname === 'string' && pathname.startsWith('/') && !pathname.includes('?')
        && Number.isInteger(status) && request?.invocationType === undefined && request?.invocationId === undefined;
      const isInjectedReminderCore = method === 'INVOKE' && pathname === '/__local/reminder-core'
        && Number.isInteger(status) && request?.invocationType === 'injected-reminder-core'
        && typeof request?.invocationId === 'string' && request.invocationId.length > 0;
      if (!isHttp && !isInjectedReminderCore) {
        throw new Error(`Operation case ${item.caseId} requires actual same-origin HTTP request evidence or actual injected reminder-core invocation evidence.`);
      }
      if (typeof request?.evidenceId !== 'string' || request.evidenceId.length === 0) {
        throw new Error(`Operation case ${item.caseId} requires a stable request evidence ID.`);
      }
      const requestOwner = requestEvidenceOwners.get(request.evidenceId);
      if (requestOwner && requestOwner !== item.caseId) {
        throw new Error(`Operation case ${item.caseId} reuses request evidence ID ${request.evidenceId} from ${requestOwner}.`);
      }
      requestEvidenceOwners.set(request.evidenceId, item.caseId);
      if (typeof actorAlias !== 'string' || !actorAlias.startsWith('qa-') || actorAlias === 'catalog-scenario-actor') {
        throw new Error(`Operation case ${item.caseId} requires an exact actor alias on every request.`);
      }
      const caseActors = execution.actor.split('+').map(actor => actor.trim()).filter(Boolean);
      if (!caseActors.includes(actorAlias)) {
        throw new Error(`Operation request actor ${actorAlias} does not match the case actor for ${item.caseId}.`);
      }
    }
    for (const assertion of item.assertions) {
      if (!assertion || typeof assertion.id !== 'string' || assertion.id.length === 0) {
        throw new Error(`Operation case ${item.caseId} has an assertion without a stable ID.`);
      }
      const owner = assertionOwners.get(assertion.id);
      if (owner && owner !== item.caseId) {
        throw new Error(`Operation case ${item.caseId} reuses shared assertion ID ${assertion.id} from ${owner}.`);
      }
      assertionOwners.set(assertion.id, item.caseId);
    }
  }
  return Object.freeze([...cases]);
}

function externalRequirementsFor(scenario) {
  return scenario.environments.filter(environment => environment !== 'local-emulator').map(environment => {
    if (environment === 'staging') return 'exact staging revision';
    if (environment === 'provider-test-mode') return 'approved QA provider test-mode delivery evidence';
    if (environment === 'physical-device') return 'physical-device receipt and cleanup evidence';
    if (environment === 'background-jobs') return 'deployed scheduler invocation with correlated logs';
    return `${environment} evidence`;
  });
}

function resultForScenario({ scenario, context, events, cleanup, execution }) {
  const requirements = LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenario.id];
  const cases = events.filter(event => event.type === 'case' && event.scenarioId === scenario.id &&
    DIMENSION_NAMES.includes(event.dimension) && requirements[event.dimension].includes(event.caseId));
  const dimensions = Object.fromEntries(DIMENSION_NAMES.map(dimension => {
    const expected = requirements[dimension];
    const matching = cases.filter(item => item.dimension === dimension);
    const matchingIds = new Set(matching.map(item => item.caseId));
    const failed = matching.some(item => item.state === 'FAIL');
    const observed = expected.every(id => matchingIds.has(id)) && matching.every(item => item.state === 'OBSERVED');
    const notObserved = matching.some(item => item.state === 'NOT_OBSERVED');
    return [dimension, makeDimension(
      failed ? 'FAIL' : observed ? 'OBSERVED' : notObserved ? 'NOT_OBSERVED' : 'BLOCKED_PRECONDITION',
      matching.map(item => item.caseId),
      failed ? 'A case-owned operational assertion failed.'
        : observed ? 'All exact operational cases observed locally.'
          : notObserved ? matching.map(item => item.observed).join(' ')
          : !context.browserEnabled && ['console', 'responsive'].includes(dimension)
            ? 'Browser mode was not enabled for this local operation run.'
            : `Missing exact operational case: ${expected.filter(id => !matchingIds.has(id)).join(', ')}.`,
    )];
  }));
  const missingDimensions = DIMENSION_NAMES.filter(dimension => dimensions[dimension].state !== 'OBSERVED');
  const sharedCleanup = cleanup || {
    cleanupId: 'shared-fixture-cleanup-not-observed', selectors: ['fixture-catalog-exact-selectors'],
    counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, state: 'BLOCKED_PRECONDITION', proof: [],
  };
  const localCleanup = scenario.cleanupOwner === 'local-batch' && sharedCleanup.state === 'OBSERVED';
  return {
    scenarioId: scenario.id,
    environment: 'local-emulator',
    environmentGaps: scenario.environments.filter(environment => environment !== 'local-emulator'),
    commit: context.commit,
    revision: 'local',
    startedAt: cases.map(item => item.startedAt).sort()[0] || execution.startedAt,
    completedAt: cases.map(item => item.completedAt).sort().at(-1) || execution.completedAt,
    role: scenario.roles.join('/'),
    tenantAlias: 'catalog-scoped',
    dimensions,
    cases,
    cleanup: {
      owner: scenario.cleanupOwner,
      reference: sharedCleanup.cleanupId,
      selectors: [...sharedCleanup.selectors],
      counts: { ...sharedCleanup.counts },
      state: localCleanup ? 'OBSERVED' : 'BLOCKED_PRECONDITION',
      proof: [...sharedCleanup.proof],
    },
    artifacts: [...new Set(cases.flatMap(item => item.artifacts || []))],
    missingDimensions,
    externalRequirements: externalRequirementsFor(scenario),
    outcome: cases.some(item => item.state === 'FAIL') ? 'FAIL' : 'BLOCKED_PRECONDITION',
  };
}

const operationHandler = async ({ scenario, context, events, cleanup, execution }) =>
  resultForScenario({ scenario, context, events, cleanup, execution });

export const handlers = Object.freeze(Object.fromEntries(
  OPERATIONS_SCENARIO_IDS.map(id => [id, operationHandler]),
));

export function assertOperationsHandlerExactness(registry) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new TypeError('Operations handlers must be an object keyed by frozen scenario ID.');
  }
  const expected = new Set(OPERATIONS_SCENARIO_IDS);
  const actual = Object.keys(registry);
  const missing = OPERATIONS_SCENARIO_IDS.filter(id => !Object.prototype.hasOwnProperty.call(registry, id));
  const extra = actual.filter(id => !expected.has(id));
  if (missing.length > 0) throw new Error(`Operations handler registry is missing handler(s): ${missing.join(', ')}.`);
  if (extra.length > 0) throw new Error(`Operations handler registry has unexpected handler(s): ${extra.join(', ')}.`);
  for (const id of OPERATIONS_SCENARIO_IDS) {
    if (typeof registry[id] !== 'function') throw new Error(`Operations handler for ${id} must be a function.`);
  }
  return Object.freeze([...OPERATIONS_SCENARIO_IDS]);
}

assertOperationsHandlerExactness(handlers);

export async function runOperationsBatch(context, scenarios) {
  assertOperationsHandlerExactness(handlers);
  if (!context?.operations || typeof context.operations.execute !== 'function') {
    throw new Error('Operations batch requires the managed local lifecycle executor.');
  }
  const events = parseCertificationEvents(context.certificationObservation?.stdout || '');
  const cleanup = events.find(event => event.type === 'cleanup');
  const execution = {
    startedAt: context.certificationObservation?.startedAt || context.now(),
    completedAt: context.certificationObservation?.completedAt || context.now(),
  };
  const results = [];
  const selectedIds = new Set(scenarios.map(scenario => scenario.id));
  const sanitize = value => String(context.redact ? context.redact(String(value || '')) : value || '').trim().slice(0, 500);
  const runErrors = events.filter(event => event.type === 'scenario-error' && selectedIds.has(event.scenarioId)).map(event => ({
    scenarioId: event.scenarioId,
    stage: event.stage || 'operations-runtime',
    diagnostic: sanitize(event.diagnostic) || 'Selected operations scenario failed outside a case boundary.',
    ...(event.originalDiagnostic ? { originalDiagnostic: sanitize(event.originalDiagnostic) } : {}),
    ...(Array.isArray(event.restorationDiagnostics) ? { restorationDiagnostics: event.restorationDiagnostics.map(sanitize) } : {}),
  }));
  const observation = context.certificationObservation;
  if (!observation || observation.code !== 0 || observation.signal) {
    runErrors.push({
      stage: 'operations-child',
      diagnostic: sanitize(observation?.stderr) || (!observation
        ? 'Shared certification child observation was unavailable.'
        : `Operations child exited with code ${observation.code}${observation.signal ? ` and signal ${observation.signal}` : ''}.`),
    });
  }
  const selectedCompetitionIds = [...selectedIds].filter(id => COMPETITION_SCENARIO_IDS.includes(id));
  if (selectedCompetitionIds.length > 0) {
    try {
      assertAuthoritativeCompetitionEvents(events, selectedCompetitionIds, { childCode: observation?.code ?? 1 });
    } catch (error) {
      runErrors.push({
        stage: 'competition-authoritative-evidence',
        diagnostic: sanitize(error instanceof Error ? error.message : error),
      });
    }
  }
  for (const scenario of scenarios) {
    try {
      results.push(await context.operations.execute({ scenario, handler: handlers[scenario.id], context, events, cleanup, execution }));
    } catch (error) {
      runErrors.push({
        scenarioId: scenario.id,
        stage: 'operations-dispatch',
        diagnostic: String(error instanceof Error ? error.message : error).slice(0, 500),
      });
    }
  }
  return { results, runErrors };
}
