import assert from 'node:assert/strict';
import test from 'node:test';
import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';

const EXPECTED_BLOCKED_PAIRS = [
  [
    "Marketing/legal",
    "Contact, beta, coach referral"
  ],
  [
    "Authentication",
    "Email/password login"
  ],
  [
    "Authentication",
    "Logout/revocation/multi-tab"
  ],
  [
    "Authentication",
    "Password reset"
  ],
  [
    "Account lifecycle",
    "Disable/delete/cancel/purge"
  ],
  [
    "Signup/onboarding",
    "Coach/admin/league/parent/adult-player signup"
  ],
  [
    "Signup/onboarding",
    "Youth invitation/signup"
  ],
  [
    "Signup/onboarding",
    "Missing profile/onboarding"
  ],
  [
    "Demo",
    "Seed, use, exit, expiry cleanup"
  ],
  [
    "Dashboard/shell",
    "Role landing and route policy"
  ],
  [
    "Teams",
    "Create and capacity"
  ],
  [
    "Teams",
    "Join by code"
  ],
  [
    "Teams",
    "Profile/branding/settings"
  ],
  [
    "Teams",
    "Module visibility"
  ],
  [
    "Teams",
    "Seasonal reset/delete/quota resolution"
  ],
  [
    "Organization",
    "Club/school overview"
  ],
  [
    "Organization",
    "Create/allocate/remove squads"
  ],
  [
    "Organization",
    "Global waivers/documents/admins"
  ],
  [
    "Roster",
    "Member add/edit/remove/reinstate"
  ],
  [
    "Roster",
    "Search/filter/sort/export"
  ],
  [
    "Roster",
    "Parent/player self views"
  ],
  [
    "Attendance",
    "Practice/event/member attendance"
  ],
  [
    "Recruiting",
    "Private profile CRUD"
  ],
  [
    "Recruiting",
    "Public scout projection"
  ],
  [
    "Events",
    "Event CRUD/recurrence"
  ],
  [
    "Events",
    "RSVP/attendance/details"
  ],
  [
    "Calendar",
    "Team/family views and filters"
  ],
  [
    "Calendar",
    "ICS create/fetch/revoke"
  ],
  [
    "Reminders",
    "Same-day FCM scheduler"
  ],
  [
    "Practice",
    "Practice plans/templates"
  ],
  [
    "Practice",
    "Drill/playbook CRUD/search"
  ],
  [
    "Practice",
    "Film/upload/coach marks/watch"
  ],
  [
    "Feed",
    "Post/media/comment/moderation"
  ],
  [
    "Chat",
    "Channel/message/unread"
  ],
  [
    "Polls",
    "Create/vote/change/tally"
  ],
  [
    "Email",
    "Verification/reset/welcome/team email"
  ],
  [
    "Newsletter",
    "Subscribe/unsubscribe/admin compose"
  ],
  [
    "Push",
    "Device registration/preferences/target send"
  ],
  [
    "Files",
    "Library CRUD/download"
  ],
  [
    "Files",
    "Avatar/branding/player media paths"
  ],
  [
    "Waivers",
    "Team/global waiver lifecycle"
  ],
  [
    "Waivers",
    "Parent/player/coach signature"
  ],
  [
    "Forms",
    "League/tournament registration builder"
  ],
  [
    "Safety",
    "Incident create/read/export"
  ],
  [
    "Games",
    "Team score create/edit/reset"
  ],
  [
    "Leagues",
    "Create/edit/clone/delete"
  ],
  [
    "Leagues",
    "Divisions/teams/filters/forms"
  ],
  [
    "Leagues",
    "Schedule generation/deployment"
  ],
  [
    "Leagues",
    "Registration/assignment"
  ],
  [
    "Leagues",
    "Scorekeeper/spectator"
  ],
  [
    "Tournaments",
    "Create/configure/replicate/archive"
  ],
  [
    "Tournaments",
    "Schedule/pools/brackets/referees"
  ],
  [
    "Tournaments",
    "Registration/waiver"
  ],
  [
    "Tournaments",
    "Scoring/dispute/public standings"
  ],
  [
    "Family",
    "Children/invites/team cards"
  ],
  [
    "Family",
    "Schedule/waivers/payments"
  ],
  [
    "Family",
    "Enable youth login"
  ],
  [
    "Billing",
    "Pricing/checkout/trial"
  ],
  [
    "Billing",
    "Upgrade/downgrade/add-on"
  ],
  [
    "Billing",
    "Cancel/reactivate/portal/sync"
  ],
  [
    "Stripe Connect",
    "Onboarding/status"
  ],
  [
    "Payments",
    "Payment items/public/offline"
  ],
  [
    "Fundraising",
    "Campaign/link/ledger"
  ],
  [
    "Donations",
    "Public projection/submission"
  ],
  [
    "Volunteers",
    "Opportunity/public signup"
  ],
  [
    "Facilities",
    "Facility/field CRUD/rename"
  ],
  [
    "Facilities",
    "Availability/booking/delete"
  ],
  [
    "Equipment",
    "Inventory/assignment/return"
  ],
  [
    "Sports Hub",
    "Browse/search/filter/bookmark/preferences"
  ],
  [
    "Sports Hub",
    "RSS refresh/admin publish"
  ],
  [
    "Public portals",
    "Squad/event registration"
  ],
  [
    "Public portals",
    "Embed panels"
  ],
  [
    "Administration",
    "Access and user directory"
  ],
  [
    "Administration",
    "Entitlement/account control/plans"
  ],
  [
    "Administration",
    "Beta/bugs/embeds/newsletter/Sports Hub"
  ],
  [
    "PWA/offline",
    "Manifest/service worker/update/logout cache"
  ],
  [
    "Webhooks",
    "Stripe standard/Connect"
  ],
  [
    "Webhooks",
    "Resend delivery"
  ],
  [
    "Background",
    "League projections/member cache"
  ],
  [
    "Background",
    "Demo cleanup/account purge/reminders"
  ],
  [
    "Operations",
    "Health/CI/deploy/rules drift/rollback"
  ]
];

test('freezes all and only the 81 blocked certification rows', () => {
  assert.equal(CERTIFICATION_SCENARIOS.length, 81);

  const scenarioPairs = CERTIFICATION_SCENARIOS.map(({ feature, subFeature }) => [feature, subFeature]);
  assert.deepEqual(scenarioPairs, EXPECTED_BLOCKED_PAIRS);
  assert.equal(new Set(CERTIFICATION_SCENARIOS.map(({ id }) => id)).size, 81);
  assert.equal(new Set(scenarioPairs.map(([feature, subFeature]) => `${feature}\\u0000${subFeature}`)).size, 81);
});

test('gives every selected row a runnable assertion contract and cleanup owner', () => {
  for (const scenario of CERTIFICATION_SCENARIOS) {
    assert.match(scenario.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(Array.isArray(scenario.roles) && scenario.roles.length > 0, `${scenario.id} roles`);
    assert.ok(Array.isArray(scenario.environments) && scenario.environments.length > 0, `${scenario.id} environments`);
    assert.equal(typeof scenario.cleanupOwner, 'string');
    assert.notEqual(scenario.cleanupOwner, '');

    assert.deepEqual(Object.keys(scenario.assertions), [
      'happyPath',
      'negativePath',
      'permission',
      'console',
      'network',
      'responsive',
    ]);
    for (const value of Object.values(scenario.assertions)) {
      assert.equal(typeof value, 'string');
      assert.notEqual(value, '');
    }
  }
});

test('prevents callers from mutating a scenario contract', () => {
  const scenario = CERTIFICATION_SCENARIOS[0];

  assert.ok(Object.isFrozen(CERTIFICATION_SCENARIOS));
  assert.ok(Object.isFrozen(scenario));
  assert.ok(Object.isFrozen(scenario.roles));
  assert.ok(Object.isFrozen(scenario.environments));
  assert.ok(Object.isFrozen(scenario.assertions));

  assert.throws(() => {
    scenario.feature = 'Changed feature';
  }, TypeError);
  assert.throws(() => {
    scenario.roles.push('Changed role');
  }, TypeError);
  assert.throws(() => {
    scenario.environments.push('Changed environment');
  }, TypeError);
  assert.throws(() => {
    scenario.assertions.happyPath = 'Changed assertion';
  }, TypeError);
});

test('assigns physical reminder cleanup to the physical-device batch', () => {
  const reminder = CERTIFICATION_SCENARIOS.find(({ id }) => id === 'reminders-same-day-fcm-scheduler');
  const accountLifecycle = CERTIFICATION_SCENARIOS.find(({ id }) => id === 'account-lifecycle-disable-delete-cancel-purge');

  assert.ok(reminder);
  assert.ok(reminder.environments.includes('physical-device'));
  assert.equal(reminder.cleanupOwner, 'physical-device-batch');
  assert.equal(accountLifecycle.cleanupOwner, 'background-batch');
});
