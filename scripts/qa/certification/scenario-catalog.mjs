/**
 * Frozen selection of the 81 rows that were BLOCKED in the 77da392b coverage matrix.
 * Later certification runners select scenarios exclusively by id.
 */
export const CERTIFICATION_SCENARIOS = Object.freeze(
[
  {
    "feature": "Marketing/legal",
    "subFeature": "Contact, beta, coach referral",
    "roles": [
      "V"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid submission stored/sent once",
      "negativePath": "Invalid/oversize/duplicate/rate limit",
      "permission": "Public endpoint only; no admin fields",
      "console": "Required",
      "network": "Request/response",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "marketing-legal-contact-beta-coach-referral"
  },
  {
    "feature": "Authentication",
    "subFeature": "Email/password login",
    "roles": [
      "all registered"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid login/session/deep link",
      "negativePath": "Wrong password, unknown, slow/duplicate",
      "permission": "Unverified/suspended/deleted denied",
      "console": "Required",
      "network": "Auth+session",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "authentication-email-password-login"
  },
  {
    "feature": "Authentication",
    "subFeature": "Logout/revocation/multi-tab",
    "roles": [
      "all registered"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "All protected state cleared",
      "negativePath": "Back/cache/stale tab",
      "permission": "Revoked cookie/token denied",
      "console": "Required",
      "network": "Session DELETE/redirect",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "authentication-logout-revocation-multi-tab"
  },
  {
    "feature": "Authentication",
    "subFeature": "Password reset",
    "roles": [
      "all registered"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid single-use link changes password",
      "negativePath": "Unknown/expired/reused/modified",
      "permission": "No enumeration or cross-account reset",
      "console": "Required",
      "network": "Email/Auth",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "authentication-password-reset"
  },
  {
    "feature": "Account lifecycle",
    "subFeature": "Disable/delete/cancel/purge",
    "roles": [
      "user, SA"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Supported state transition and cleanup",
      "negativePath": "Owner block, retry/partial failure",
      "permission": "Other user cannot control account",
      "console": "Required",
      "network": "API+Function logs",
      "responsive": "Desktop"
    },
    "cleanupOwner": "background-batch",
    "id": "account-lifecycle-disable-delete-cancel-purge"
  },
  {
    "feature": "Signup/onboarding",
    "subFeature": "Coach/admin/league/parent/adult-player signup",
    "roles": [
      "V"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Profile and verification created",
      "negativePath": "Duplicate/invalid/aborted delivery",
      "permission": "Client cannot set privileged fields",
      "console": "Required",
      "network": "Auth/email/profile",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "signup-onboarding-coach-admin-league-parent-adult-player-signup"
  },
  {
    "feature": "Signup/onboarding",
    "subFeature": "Youth invitation/signup",
    "roles": [
      "PA, YP, ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Invite links existing player identity",
      "negativePath": "Expired/reused/wrong invite",
      "permission": "Other guardian/player/team denied",
      "console": "Required",
      "network": "Invite/Auth",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "signup-onboarding-youth-invitation-signup"
  },
  {
    "feature": "Signup/onboarding",
    "subFeature": "Missing profile/onboarding",
    "roles": [
      "registered"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Complete profile then enter app",
      "negativePath": "Partial profile/refresh",
      "permission": "No broad default authority",
      "console": "Required",
      "network": "Profile writes",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "signup-onboarding-missing-profile-onboarding"
  },
  {
    "feature": "Demo",
    "subFeature": "Seed, use, exit, expiry cleanup",
    "roles": [
      "D"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Persona workspace isolated",
      "negativePath": "Seed retry/expiry/partial cleanup",
      "permission": "Demo A cannot access Demo B/live billing",
      "console": "Required",
      "network": "Seed/exit/cleanup",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "demo-seed-use-exit-expiry-cleanup"
  },
  {
    "feature": "Dashboard/shell",
    "subFeature": "Role landing and route policy",
    "roles": [
      "all"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Correct landing/navigation",
      "negativePath": "Direct disallowed route",
      "permission": "Every role/plan/state matrix",
      "console": "Required",
      "network": "Redirect/session",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "dashboard-shell-role-landing-and-route-policy"
  },
  {
    "feature": "Teams",
    "subFeature": "Create and capacity",
    "roles": [
      "coach/admin/LC"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "First/entitled team created",
      "negativePath": "Quota, duplicate, concurrent create",
      "permission": "UID/plan/owner tampering denied",
      "console": "Required",
      "network": "Teams create",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "teams-create-and-capacity"
  },
  {
    "feature": "Teams",
    "subFeature": "Join by code",
    "roles": [
      "PA/AP/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Membership and derived position",
      "negativePath": "Invalid/reused/concurrent request",
      "permission": "Staff/owner escalation and other code denial",
      "console": "Required",
      "network": "Resolve/join",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "teams-join-by-code"
  },
  {
    "feature": "Teams",
    "subFeature": "Profile/branding/settings",
    "roles": [
      "owner, staff"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Safe edits persist",
      "negativePath": "Invalid URL/file/oversize",
      "permission": "Staff cannot change owner/billing",
      "console": "Required",
      "network": "Firestore/Storage",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "teams-profile-branding-settings"
  },
  {
    "feature": "Teams",
    "subFeature": "Module visibility",
    "roles": [
      "owner, all members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Toggle hides and blocks module",
      "negativePath": "Direct URL/API after disable",
      "permission": "Non-staff cannot toggle",
      "console": "Required",
      "network": "Redirect/query",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "teams-module-visibility"
  },
  {
    "feature": "Teams",
    "subFeature": "Seasonal reset/delete/quota resolution",
    "roles": [
      "owner"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Confirmed action affects selected data only",
      "negativePath": "Cancel/double submit/conflicts",
      "permission": "Staff/other team denied",
      "console": "Required",
      "network": "Mutation/API",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "teams-seasonal-reset-delete-quota-resolution"
  },
  {
    "feature": "Organization",
    "subFeature": "Club/school overview",
    "roles": [
      "OA, owner"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Own institution aggregates render",
      "negativePath": "Empty/partial/stale counts",
      "permission": "Other institution denied",
      "console": "Required",
      "network": "Collection queries",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "organization-club-school-overview"
  },
  {
    "feature": "Organization",
    "subFeature": "Create/allocate/remove squads",
    "roles": [
      "OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Seat count and squad ownership correct",
      "negativePath": "Quota/concurrent/delete conflict",
      "permission": "Delegated admin/outsider boundaries",
      "console": "Required",
      "network": "Organization APIs",
      "responsive": "Desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "organization-create-allocate-remove-squads"
  },
  {
    "feature": "Organization",
    "subFeature": "Global waivers/documents/admins",
    "roles": [
      "OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Deploy/read/revoke within institution",
      "negativePath": "Partial deployment/duplicate",
      "permission": "Other org/team and non-authority denied",
      "console": "Required",
      "network": "APIs/rules",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "organization-global-waivers-documents-admins"
  },
  {
    "feature": "Roster",
    "subFeature": "Member add/edit/remove/reinstate",
    "roles": [
      "owner, staff"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Member lifecycle persists",
      "negativePath": "Duplicate/invalid/owner removal",
      "permission": "Staff promotion and Tenant B denied",
      "console": "Required",
      "network": "Rules/APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "roster-member-add-edit-remove-reinstate"
  },
  {
    "feature": "Roster",
    "subFeature": "Search/filter/sort/export",
    "roles": [
      "ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Results and export match records",
      "negativePath": "Empty/long/special characters",
      "permission": "Parent/player cannot export private roster",
      "console": "Required",
      "network": "Query/download",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "roster-search-filter-sort-export"
  },
  {
    "feature": "Roster",
    "subFeature": "Parent/player self views",
    "roles": [
      "PA/AP/YP"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Only own/linked records",
      "negativePath": "Missing link/sibling/other child",
      "permission": "Identifier tampering denied",
      "console": "Required",
      "network": "Queries",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "roster-parent-player-self-views"
  },
  {
    "feature": "Attendance",
    "subFeature": "Practice/event/member attendance",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Staff records; member view correct",
      "negativePath": "Duplicate/concurrent/removed member",
      "permission": "Member cannot alter others",
      "console": "Required",
      "network": "Writes",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "attendance-practice-event-member-attendance"
  },
  {
    "feature": "Recruiting",
    "subFeature": "Private profile CRUD",
    "roles": [
      "PA/AP/YP/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Authorized edits persist",
      "negativePath": "Invalid metric/video/file",
      "permission": "Guardian/coach/self boundary; outsider denied",
      "console": "Required",
      "network": "Firestore/Storage",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "recruiting-private-profile-crud"
  },
  {
    "feature": "Recruiting",
    "subFeature": "Public scout projection",
    "roles": [
      "V"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Enabled profile exposes allowlist",
      "negativePath": "Disabled/missing/invalid ID",
      "permission": "No DOB/contacts/IDs/private children",
      "console": "Required",
      "network": "Public API/assets",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "recruiting-public-scout-projection"
  },
  {
    "feature": "Events",
    "subFeature": "Event CRUD/recurrence",
    "roles": [
      "ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Create/edit/series/delete persists",
      "negativePath": "Invalid dates/DST/conflict/double submit",
      "permission": "Members/other team cannot mutate",
      "console": "Required",
      "network": "Event API/rules",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "events-event-crud-recurrence"
  },
  {
    "feature": "Events",
    "subFeature": "RSVP/attendance/details",
    "roles": [
      "PA/AP/YP/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Own response and staff view persist",
      "negativePath": "Forge other user/replay/cancelled event",
      "permission": "Removed/outsider denied",
      "console": "Required",
      "network": "RSVP API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "events-rsvp-attendance-details"
  },
  {
    "feature": "Calendar",
    "subFeature": "Team/family views and filters",
    "roles": [
      "all active"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Correct events by team/child",
      "negativePath": "Empty/invalid date/rapid switch",
      "permission": "Other household/team absent",
      "console": "Required",
      "network": "Queries",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "calendar-team-family-views-and-filters"
  },
  {
    "feature": "Calendar",
    "subFeature": "ICS create/fetch/revoke",
    "roles": [
      "PA/AP/ST"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Token returns valid scoped ICS",
      "negativePath": "Invalid/deactivated/stale token",
      "permission": "Membership removal revokes",
      "console": "Required",
      "network": "API+Function",
      "responsive": "N/A"
    },
    "cleanupOwner": "background-batch",
    "id": "calendar-ics-create-fetch-revoke"
  },
  {
    "feature": "Reminders",
    "subFeature": "Same-day FCM scheduler",
    "roles": [
      "PA/AP/YP"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "physical-device",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "One eligible reminder/device",
      "negativePath": "Duplicate run/invalid time/no token",
      "permission": "Removed/preferences-off excluded",
      "console": "Required",
      "network": "Function/FCM",
      "responsive": "Real device"
    },
    "cleanupOwner": "background-batch",
    "id": "reminders-same-day-fcm-scheduler"
  },
  {
    "feature": "Practice",
    "subFeature": "Practice plans/templates",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Create/assign/view/persist",
      "negativePath": "Empty/invalid/delete in use",
      "permission": "Non-staff edit denied",
      "console": "Required",
      "network": "Firestore",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "practice-practice-plans-templates"
  },
  {
    "feature": "Practice",
    "subFeature": "Drill/playbook CRUD/search",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Create/edit/reorder/search/view",
      "negativePath": "Invalid URL/duplicate/empty",
      "permission": "Member mutation and other team denied",
      "console": "Required",
      "network": "Writes",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "practice-drill-playbook-crud-search"
  },
  {
    "feature": "Practice",
    "subFeature": "Film/upload/coach marks/watch",
    "roles": [
      "ST, player"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Upload, mark, seek, progress",
      "negativePath": "Unsafe/oversize/invalid timestamp",
      "permission": "Player cannot forge other progress/marks",
      "console": "Required",
      "network": "Storage/writes",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "practice-film-upload-coach-marks-watch"
  },
  {
    "feature": "Feed",
    "subFeature": "Post/media/comment/moderation",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Eligible post and comment persist",
      "negativePath": "Invalid media/delete/replay",
      "permission": "Audience/owner/moderator/Tenant B",
      "console": "Required",
      "network": "Writes/Storage",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "feed-post-media-comment-moderation"
  },
  {
    "feature": "Chat",
    "subFeature": "Channel/message/unread",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Channel and message sync",
      "negativePath": "Duplicate/offline/deleted channel",
      "permission": "Membership/audience/removed user",
      "console": "Required",
      "network": "Chat APIs/listeners",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "chat-channel-message-unread"
  },
  {
    "feature": "Polls",
    "subFeature": "Create/vote/change/tally",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "One vote reflected consistently",
      "negativePath": "Replay/invalid option/race",
      "permission": "Ineligible user/channel denied",
      "console": "Required",
      "network": "Vote API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "polls-create-vote-change-tally"
  },
  {
    "feature": "Email",
    "subFeature": "Verification/reset/welcome/team email",
    "roles": [
      "target account"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Correct recipient/content/link",
      "negativePath": "Provider failure/duplicate/bad origin",
      "permission": "No recipient enumeration/other-team send",
      "console": "Required",
      "network": "API+Resend",
      "responsive": "N/A"
    },
    "cleanupOwner": "provider-batch",
    "id": "email-verification-reset-welcome-team-email"
  },
  {
    "feature": "Newsletter",
    "subFeature": "Subscribe/unsubscribe/admin compose",
    "roles": [
      "V, SA"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Subscribe, welcome, send, unsubscribe",
      "negativePath": "Duplicate/bad token/replay/empty audience",
      "permission": "Only SA reads/sends/deletes",
      "console": "Required",
      "network": "API/webhook",
      "responsive": "Mobile admin"
    },
    "cleanupOwner": "provider-batch",
    "id": "newsletter-subscribe-unsubscribe-admin-compose"
  },
  {
    "feature": "Push",
    "subFeature": "Device registration/preferences/target send",
    "roles": [
      "all, SA"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "physical-device"
    ],
    "assertions": {
      "happyPath": "Permission/token/send/disable",
      "negativePath": "Denied permission/stale token/logout",
      "permission": "Wrong user/team targeting denied",
      "console": "Required",
      "network": "Device/notify API",
      "responsive": "Real device"
    },
    "cleanupOwner": "physical-device-batch",
    "id": "push-device-registration-preferences-target-send"
  },
  {
    "feature": "Files",
    "subFeature": "Library CRUD/download",
    "roles": [
      "ST, members"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Upload/read/download/delete allowed",
      "negativePath": "MIME spoof/oversize/stale link",
      "permission": "Other team/member role denied",
      "console": "Required",
      "network": "Storage+doc",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "files-library-crud-download"
  },
  {
    "feature": "Files",
    "subFeature": "Avatar/branding/player media paths",
    "roles": [
      "owner/PA/player"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Authorized image/video lifecycle",
      "negativePath": "Wrong path/type/size",
      "permission": "Public/private and manager matrix",
      "console": "Required",
      "network": "Storage",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "files-avatar-branding-player-media-paths"
  },
  {
    "feature": "Waivers",
    "subFeature": "Team/global waiver lifecycle",
    "roles": [
      "owner/OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Create/deploy/archive/version",
      "negativePath": "Empty/partial/duplicate",
      "permission": "Other org/staff constraints",
      "console": "Required",
      "network": "APIs/rules",
      "responsive": "Desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "waivers-team-global-waiver-lifecycle"
  },
  {
    "feature": "Waivers",
    "subFeature": "Parent/player/coach signature",
    "roles": [
      "PA/AP/YP/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Correct signer/subject/status",
      "negativePath": "Replay/wrong date/child/event",
      "permission": "Other signer/team denied",
      "console": "Required",
      "network": "Sign API/rules",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "waivers-parent-player-coach-signature"
  },
  {
    "feature": "Forms",
    "subFeature": "League/tournament registration builder",
    "roles": [
      "LC/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Create fields/publish/edit",
      "negativePath": "Duplicate field/invalid config",
      "permission": "Other organizer/registrant mutation denied",
      "console": "Required",
      "network": "Writes/public DTO",
      "responsive": "Desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "forms-league-tournament-registration-builder"
  },
  {
    "feature": "Safety",
    "subFeature": "Incident create/read/export",
    "roles": [
      "ST/OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Accurate immutable audit record",
      "negativePath": "Missing required data/edit/delete attempt",
      "permission": "Participant/outsider/Tenant B denied",
      "console": "Required",
      "network": "Rules/queries",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "safety-incident-create-read-export"
  },
  {
    "feature": "Games",
    "subFeature": "Team score create/edit/reset",
    "roles": [
      "ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Score and standings persist",
      "negativePath": "Invalid/negative/concurrent/reset",
      "permission": "Member/other team denied",
      "console": "Required",
      "network": "Games API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "games-team-score-create-edit-reset"
  },
  {
    "feature": "Leagues",
    "subFeature": "Create/edit/clone/delete",
    "roles": [
      "LC"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Own league lifecycle persists",
      "negativePath": "Quota/duplicate/partial clone",
      "permission": "Other creator/anonymous direct write denied",
      "console": "Required",
      "network": "League APIs",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "leagues-create-edit-clone-delete"
  },
  {
    "feature": "Leagues",
    "subFeature": "Divisions/teams/filters/forms",
    "roles": [
      "LC"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Configure and retain across views",
      "negativePath": "Duplicate/empty/unassigned",
      "permission": "Non-owner mutation denied",
      "console": "Required",
      "network": "APIs/writes",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "leagues-divisions-teams-filters-forms"
  },
  {
    "feature": "Leagues",
    "subFeature": "Schedule generation/deployment",
    "roles": [
      "LC"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Conflict-free full schedule",
      "negativePath": "Impossible config/blackout/race",
      "permission": "Non-owner and direct write denied",
      "console": "Required",
      "network": "Schedule API",
      "responsive": "Desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "leagues-schedule-generation-deployment"
  },
  {
    "feature": "Leagues",
    "subFeature": "Registration/assignment",
    "roles": [
      "V, LC"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid submission/review/assignment",
      "negativePath": "Duplicate/invalid/unpublished",
      "permission": "Registrant cannot read ledger or assign",
      "console": "Required",
      "network": "Public+assignment APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "leagues-registration-assignment"
  },
  {
    "feature": "Leagues",
    "subFeature": "Scorekeeper/spectator",
    "roles": [
      "V/scorekeeper/LC"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Valid PIN score updates public view",
      "negativePath": "Wrong PIN/replay/downstream conflict",
      "permission": "Code grants only score scope",
      "console": "Required",
      "network": "API+Function",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "background-batch",
    "id": "leagues-scorekeeper-spectator"
  },
  {
    "feature": "Tournaments",
    "subFeature": "Create/configure/replicate/archive",
    "roles": [
      "ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Blueprint persists and replica resets state",
      "negativePath": "Invalid format/partial/duplicate/archive cancel",
      "permission": "Other staff/team denied",
      "console": "Required",
      "network": "Tournament API",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "tournaments-create-configure-replicate-archive"
  },
  {
    "feature": "Tournaments",
    "subFeature": "Schedule/pools/brackets/referees",
    "roles": [
      "ST/referee"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid schedule and assignments",
      "negativePath": "Impossible config/referee conflict",
      "permission": "Role/code and other tournament denial",
      "console": "Required",
      "network": "Schedule API",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "tournaments-schedule-pools-brackets-referees"
  },
  {
    "feature": "Tournaments",
    "subFeature": "Registration/waiver",
    "roles": [
      "V, ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid form/signature reviewed",
      "negativePath": "Invalid code/duplicate/wrong child",
      "permission": "Private ledger organizer-only",
      "console": "Required",
      "network": "Public APIs/rules",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "tournaments-registration-waiver"
  },
  {
    "feature": "Tournaments",
    "subFeature": "Scoring/dispute/public standings",
    "roles": [
      "scorekeeper/referee/V/ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Score/dispute/resolve updates bracket",
      "negativePath": "Wrong PIN/replay/completed downstream",
      "permission": "Narrow code role; outsider no mutation",
      "console": "Required",
      "network": "Resolve/public APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "tournaments-scoring-dispute-public-standings"
  },
  {
    "feature": "Family",
    "subFeature": "Children/invites/team cards",
    "roles": [
      "PA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Linked children and invites accurate",
      "negativePath": "Empty/duplicate/stale link",
      "permission": "Other household/sibling denied",
      "console": "Required",
      "network": "Queries/invite API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "family-children-invites-team-cards"
  },
  {
    "feature": "Family",
    "subFeature": "Schedule/waivers/payments",
    "roles": [
      "PA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Aggregates reconcile per child/team",
      "negativePath": "Missing/removed/duplicate records",
      "permission": "Other parent/team denied",
      "console": "Required",
      "network": "Queries/payment APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "family-schedule-waivers-payments"
  },
  {
    "feature": "Family",
    "subFeature": "Enable youth login",
    "roles": [
      "PA, YP"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Invite activates existing child",
      "negativePath": "Reuse/wrong parent/duplicate Auth",
      "permission": "Other guardian cannot activate",
      "console": "Required",
      "network": "Youth API/Auth",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "family-enable-youth-login"
  },
  {
    "feature": "Billing",
    "subFeature": "Pricing/checkout/trial",
    "roles": [
      "owner"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Canonical test checkout and entitlement",
      "negativePath": "Invalid price/body/retry/abandon",
      "permission": "Other UID/customer and anonymous denied",
      "console": "Required",
      "network": "Stripe/API/webhook",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "provider-batch",
    "id": "billing-pricing-checkout-trial"
  },
  {
    "feature": "Billing",
    "subFeature": "Upgrade/downgrade/add-on",
    "roles": [
      "owner"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Correct proration/status/capacity",
      "negativePath": "Concurrent/past-due/failed invoice",
      "permission": "Staff/non-owner denied",
      "console": "Required",
      "network": "Stripe/API",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "provider-batch",
    "id": "billing-upgrade-downgrade-add-on"
  },
  {
    "feature": "Billing",
    "subFeature": "Cancel/reactivate/portal/sync",
    "roles": [
      "owner"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "State reconciles to provider",
      "negativePath": "Replay/out-of-order/customer deletion",
      "permission": "Other customer/subscription denied",
      "console": "Required",
      "network": "Stripe/webhook",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "provider-batch",
    "id": "billing-cancel-reactivate-portal-sync"
  },
  {
    "feature": "Stripe Connect",
    "subFeature": "Onboarding/status",
    "roles": [
      "owner"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Test account reaches expected status",
      "negativePath": "Abandon/retry/wrong account",
      "permission": "Staff/other team denied",
      "console": "Required",
      "network": "Connect APIs",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "provider-batch",
    "id": "stripe-connect-onboarding-status"
  },
  {
    "feature": "Payments",
    "subFeature": "Payment items/public/offline",
    "roles": [
      "owner, PA"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Item/payment/verification reconciles",
      "negativePath": "Duplicate/wrong amount/team/deactivated",
      "permission": "Payer and staff boundaries",
      "console": "Required",
      "network": "APIs/webhook",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "provider-batch",
    "id": "payments-payment-items-public-offline"
  },
  {
    "feature": "Fundraising",
    "subFeature": "Campaign/link/ledger",
    "roles": [
      "ST"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Publish/update/reconcile",
      "negativePath": "Invalid goal/link/delete with payments",
      "permission": "Other team/non-staff denied",
      "console": "Required",
      "network": "Connect/public API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "provider-batch",
    "id": "fundraising-campaign-link-ledger"
  },
  {
    "feature": "Donations",
    "subFeature": "Public projection/submission",
    "roles": [
      "V"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Valid test donation once",
      "negativePath": "Bad amount/duplicate/unpublished",
      "permission": "No private donor/Connect data",
      "console": "Required",
      "network": "Public API/Stripe",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "provider-batch",
    "id": "donations-public-projection-submission"
  },
  {
    "feature": "Volunteers",
    "subFeature": "Opportunity/public signup",
    "roles": [
      "ST, V"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Publish and fill capacity",
      "negativePath": "Duplicate/invalid/concurrent full",
      "permission": "Public cannot read ledger/edit",
      "console": "Required",
      "network": "Public API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "volunteers-opportunity-public-signup"
  },
  {
    "feature": "Facilities",
    "subFeature": "Facility/field CRUD/rename",
    "roles": [
      "ST/OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Changes propagate",
      "negativePath": "Invalid/duplicate/concurrent edit",
      "permission": "Other organization denied",
      "console": "Required",
      "network": "Facility API/rules",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "facilities-facility-field-crud-rename"
  },
  {
    "feature": "Facilities",
    "subFeature": "Availability/booking/delete",
    "roles": [
      "ST/OA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid booking and safe deletion",
      "negativePath": "Overlap/conflict/in-use delete",
      "permission": "Other team/org denied",
      "console": "Required",
      "network": "Booking locks/API",
      "responsive": "Desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "facilities-availability-booking-delete"
  },
  {
    "feature": "Equipment",
    "subFeature": "Inventory/assignment/return",
    "roles": [
      "ST/member"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Quantity and assignment reconcile",
      "negativePath": "Over-assign/duplicate/delete assigned",
      "permission": "Assignee cannot edit stock/others",
      "console": "Required",
      "network": "Firestore/email",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "equipment-inventory-assignment-return"
  },
  {
    "feature": "Sports Hub",
    "subFeature": "Browse/search/filter/bookmark/preferences",
    "roles": [
      "V/user"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Correct content and saved preferences",
      "negativePath": "Empty/invalid query/missing item",
      "permission": "Private preferences self-only",
      "console": "Required",
      "network": "Content APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "sports-hub-browse-search-filter-bookmark-preferences"
  },
  {
    "feature": "Sports Hub",
    "subFeature": "RSS refresh/admin publish",
    "roles": [
      "SA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Controlled feed/article appears once",
      "negativePath": "Malformed/slow/redirect/duplicate",
      "permission": "Non-SA refresh/publish denied",
      "console": "Required",
      "network": "External/admin APIs",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "sports-hub-rss-refresh-admin-publish"
  },
  {
    "feature": "Public portals",
    "subFeature": "Squad/event registration",
    "roles": [
      "V, ST"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Valid submission reviewed",
      "negativePath": "Invalid/duplicate/unpublished",
      "permission": "Public projection and ledger separation",
      "console": "Required",
      "network": "Public API",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "public-portals-squad-event-registration"
  },
  {
    "feature": "Public portals",
    "subFeature": "Embed panels",
    "roles": [
      "V"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Each embed loads/submits",
      "negativePath": "Wrong origin/missing config",
      "permission": "No dashboard/private data",
      "console": "Required",
      "network": "Frame/API",
      "responsive": "Responsive embed"
    },
    "cleanupOwner": "local-batch",
    "id": "public-portals-embed-panels"
  },
  {
    "feature": "Administration",
    "subFeature": "Access and user directory",
    "roles": [
      "SA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Claim-controlled session persists",
      "negativePath": "Profile-only fake role/revoked claim",
      "permission": "Every non-SA role denied route/API/rules",
      "console": "Required",
      "network": "Admin APIs",
      "responsive": "Mobile+desktop"
    },
    "cleanupOwner": "local-batch",
    "id": "administration-access-and-user-directory"
  },
  {
    "feature": "Administration",
    "subFeature": "Entitlement/account control/plans",
    "roles": [
      "SA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "Audited bounded change succeeds",
      "negativePath": "Invalid transition/double submit",
      "permission": "Non-SA and target tampering denied",
      "console": "Required",
      "network": "Admin API/audit",
      "responsive": "Desktop+mobile"
    },
    "cleanupOwner": "local-batch",
    "id": "administration-entitlement-account-control-plans"
  },
  {
    "feature": "Administration",
    "subFeature": "Beta/bugs/embeds/newsletter/Sports Hub",
    "roles": [
      "SA"
    ],
    "environments": [
      "local-emulator",
      "staging"
    ],
    "assertions": {
      "happyPath": "CRUD/compose layouts work",
      "negativePath": "Empty/invalid/provider failure",
      "permission": "Non-SA denied",
      "console": "Required",
      "network": "Admin APIs",
      "responsive": "390+1440"
    },
    "cleanupOwner": "local-batch",
    "id": "administration-beta-bugs-embeds-newsletter-sports-hub"
  },
  {
    "feature": "PWA/offline",
    "subFeature": "Manifest/service worker/update/logout cache",
    "roles": [
      "user"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "physical-device"
    ],
    "assertions": {
      "happyPath": "Install/update/offline shell",
      "negativePath": "Corrupt cache/offline mutation/session logout",
      "permission": "No private data after logout/user switch",
      "console": "Required",
      "network": "SW/cache",
      "responsive": "Mobile device"
    },
    "cleanupOwner": "physical-device-batch",
    "id": "pwa-offline-manifest-service-worker-update-logout-cache"
  },
  {
    "feature": "Webhooks",
    "subFeature": "Stripe standard/Connect",
    "roles": [
      "provider"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Signed event once, authoritative state",
      "negativePath": "Invalid/replay/out-of-order/partial failure",
      "permission": "Wrong mode/account/tenant denied",
      "console": "Required",
      "network": "Ledger/logs",
      "responsive": "N/A"
    },
    "cleanupOwner": "provider-batch",
    "id": "webhooks-stripe-standard-connect"
  },
  {
    "feature": "Webhooks",
    "subFeature": "Resend delivery",
    "roles": [
      "provider"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "provider-test-mode"
    ],
    "assertions": {
      "happyPath": "Signed event updates ledger once",
      "negativePath": "Invalid/replay/unknown message",
      "permission": "No unrelated subscriber mutation",
      "console": "Required",
      "network": "Ledger/logs",
      "responsive": "N/A"
    },
    "cleanupOwner": "provider-batch",
    "id": "webhooks-resend-delivery"
  },
  {
    "feature": "Background",
    "subFeature": "League projections/member cache",
    "roles": [
      "system"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Create/update/delete stays synchronized",
      "negativePath": "Trigger retry/partial/membership removal",
      "permission": "Public allowlist and revoked access",
      "console": "Required",
      "network": "Function logs",
      "responsive": "N/A"
    },
    "cleanupOwner": "background-batch",
    "id": "background-league-projections-member-cache"
  },
  {
    "feature": "Background",
    "subFeature": "Demo cleanup/account purge/reminders",
    "roles": [
      "system"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Correct eligible records processed once",
      "negativePath": "Retry/race/partial/clock boundary",
      "permission": "Live/other tenant excluded",
      "console": "Required",
      "network": "Function logs",
      "responsive": "N/A"
    },
    "cleanupOwner": "background-batch",
    "id": "background-demo-cleanup-account-purge-reminders"
  },
  {
    "feature": "Operations",
    "subFeature": "Health/CI/deploy/rules drift/rollback",
    "roles": [
      "operator"
    ],
    "environments": [
      "local-emulator",
      "staging",
      "background-jobs"
    ],
    "assertions": {
      "happyPath": "Exact commit passes and staging healthy",
      "negativePath": "Failed check/mismatch/rollback drill",
      "permission": "Least privilege; no secret output",
      "console": "Required",
      "network": "CI/deploy logs",
      "responsive": "N/A"
    },
    "cleanupOwner": "background-batch",
    "id": "operations-health-ci-deploy-rules-drift-rollback"
  }
]
);

