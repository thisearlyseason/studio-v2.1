# Phase 4 Coverage Reconciliation

## Recount and decision

The current `05-coverage-matrix.md` contains exactly 88 data rows: 3 `PASS`, 0 `FAIL`, 85 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`. The historical Phase 2 total in `08-final-report.md` remains 3 `PASS`, 2 `FAIL`, and 83 `BLOCKED`. The difference is intentional: BUG-001 and BUG-002 were repaired and moved from `FAIL` to `BLOCKED`, while their complete row contracts still lack required fixtures.

Task 1 found no authorized durable identity, populated cross-tenant fixture, provider sandbox, FCM device, hosted staging environment, destructive-test authorization, or deployment/rollback artifact. Its local WebKit discovery and the system-Chrome local replays do not provide those dependencies. The development-only CSP correction permits exact local Firebase emulator origins only; it does not establish authenticated, provider, device, hosted, or operational coverage. Accordingly, no row is newly unblocked or promoted.

## Blocked-row dependency map

Each current `BLOCKED` matrix row appears exactly once below. Row numbers are the 1-based data-row positions in the 88-row matrix. Categories are restricted to the current unavailable dependency classes from the fixture assessment; reasons name the specific missing fixture or evidence.

| Row | Domain / scenario | Dependency category | Current unavailable dependency / reason |
|---:|---|---|---|
| 2 | Marketing/legal — Contact, beta, coach referral | Cross-tenant data / provider sandbox | No authorized `qa-public-submitter` synthetic dataset, approved safe recipient, or Resend delivery fixture. |
| 4 | Authentication — Email/password login | Identity | No authorized durable registered identities covering valid, unverified, suspended, and deleted states. |
| 5 | Authentication — Logout/revocation/multi-tab | Identity / device-browser | No authorized registered session fixture or separate browser contexts for revocation, cache, and stale-tab checks. |
| 6 | Authentication — Password reset | Identity / provider sandbox | No authorized registered QA mailbox or approved Auth/email delivery fixture for single-use links. |
| 7 | Account lifecycle — Disable/delete/cancel/purge | Destructive authorization | No isolated-project authorization or disposable owner/non-owner lifecycle fixtures for destructive cleanup. |
| 8 | Signup/onboarding — Coach/admin/league/parent/adult-player signup | Identity / provider sandbox | No approved durable mailboxes, isolated Auth project, or safe verification-delivery fixture for each role. |
| 9 | Signup/onboarding — Youth invitation/signup | Identity / provider sandbox | No authorized `qa-youth-invite`, linked guardian/player setup, durable mailbox, or invite delivery fixture. |
| 10 | Signup/onboarding — Missing profile/onboarding | Identity | No authorized partial-profile registered account for fail-closed onboarding and refresh checks. |
| 11 | Demo — Seed, use, exit, expiry cleanup | Identity / cross-tenant data | No authorized durable `qa-demo-a` and `qa-demo-b` concurrent-session references with isolated seed/expiry state. |
| 12 | Dashboard/shell — Role landing and route policy | Identity | No authorized complete role, subscription, and account-state identity matrix. |
| 13 | Dashboard/shell — Active team switch | Identity / cross-tenant data | No authorized `qa-multi-org` identity or distinct populated Team A and Team B fixtures. |
| 14 | Dashboard/shell — Alerts/history/acknowledge | Identity / cross-tenant data | No authorized active and removed-member identities with distinct tenant alert/history records. |
| 15 | Teams — Create and capacity | Identity / cross-tenant data | No authorized coach/admin/league-owner identities with free and entitled quota fixtures. |
| 16 | Teams — Join by code | Identity / cross-tenant data | No authorized parent/player/staff identities or isolated valid, invalid, reused, and concurrent join-code records. |
| 17 | Teams — Profile/branding/settings | Identity / cross-tenant data | No authorized owner/staff boundary identities or isolated tenant branding and safe/unsafe file fixtures. |
| 18 | Teams — Module visibility | Identity / cross-tenant data | No authorized owner/member identities and populated tenant records for all eight module keys. |
| 19 | Teams — Seasonal reset/delete/quota resolution | Destructive authorization | No authorized disposable team, cleanup owner, or isolated destructive reset/delete permission. |
| 20 | Organization — Club/school overview | Identity / cross-tenant data | No authorized organization owner/admin identities or distinct populated institution aggregates. |
| 21 | Organization — Create/allocate/remove squads | Identity / cross-tenant data | No authorized owner/delegate/outsider identities or quota, squad, and conflict fixtures. |
| 22 | Organization — Global waivers/documents/admins | Identity / cross-tenant data | No authorized organization authority matrix or isolated legal, document, admin, and cross-org records. |
| 23 | Roster — Member add/edit/remove/reinstate | Identity / cross-tenant data | No authorized owner/staff/member/removed identities or distinct Team A and Team B rosters. |
| 24 | Roster — Search/filter/sort/export | Identity / cross-tenant data | No authorized staff and parent/player identities or synthetic roster records with private medical/contact fields. |
| 25 | Roster — Parent/player self views | Identity / cross-tenant data | No authorized parent, adult/youth player, sibling, and other-household identities with linked records. |
| 26 | Attendance — Practice/event/member attendance | Identity / cross-tenant data | No authorized staff/member/removed identities or duplicate and concurrent attendance records. |
| 27 | Recruiting — Private profile CRUD | Identity / cross-tenant data | No authorized guardian/player/coach/outsider identities or safe/unsafe private media and evaluation fixtures. |
| 28 | Recruiting — Public scout projection | Cross-tenant data | No authorized published, disabled, missing, and cached recruiting-profile fixtures with private-field sentinels. |
| 29 | Events — Event CRUD/recurrence | Identity / cross-tenant data | BUG-001 passes independently, but no authorized staff/member/other-team identities or DST/conflict/recurrence records exist for the remaining contract. |
| 30 | Events — RSVP/attendance/details | Identity / cross-tenant data | No authorized parent/player/staff/removed/outsider identities or RSVP replay and cancelled-event records. |
| 31 | Calendar — Team/family views and filters | Identity / cross-tenant data | No authorized active multi-team/household identities or past, future, cross-midnight, and DST event records. |
| 32 | Calendar — ICS create/fetch/revoke | Identity / provider sandbox | No authorized member identities, calendar configuration, or disposable ICS client/raw-HTTP fixture. |
| 33 | Reminders — Same-day FCM scheduler | Provider sandbox / device-browser / hosted environment | No FCM configuration, approved desktop/mobile device, hosted scheduler, or eligible identity/timezone fixture. |
| 34 | Practice — Practice plans/templates | Identity / cross-tenant data | No authorized staff/member identities with paid-plan entitlement and assigned practice records. |
| 35 | Practice — Drill/playbook CRUD/search | Identity / cross-tenant data | No authorized staff/member/other-team identities or valid, invalid, duplicate, and ordered drill records. |
| 36 | Practice — Film/upload/coach marks/watch | Identity / cross-tenant data | No authorized staff/player identities or isolated safe, oversized, spoofed, timestamp, mark, and progress fixtures. |
| 37 | Feed — Post/media/comment/moderation | Identity / cross-tenant data | No authorized staff/member/moderator/other-tenant identities or safe/unsafe media and audience records. |
| 38 | Chat — Channel/message/unread | Identity / cross-tenant data | No authorized staff/member/removed identities or concurrent sessions with isolated channel/message history. |
| 39 | Polls — Create/vote/change/tally | Identity / cross-tenant data | No authorized staff/member/ineligible identities or separate concurrent-voter fixtures. |
| 40 | Email — Verification/reset/welcome/team email | Identity / provider sandbox | No approved target mailboxes, Resend safe sink, signed delivery fixture, or role-specific sender/recipient data. |
| 41 | Newsletter — Subscribe/unsubscribe/admin compose | Identity / provider sandbox | No authorized claim-controlled superadmin, approved recipients, or Resend/webhook fixtures for both lists. |
| 42 | Push — Device registration/preferences/target send | Provider sandbox / device-browser / hosted environment | No FCM configuration, approved desktop/mobile devices, hosted service-worker context, or target identities. |
| 43 | Files — Library CRUD/download | Identity / cross-tenant data | No authorized staff/member/other-team identities or allowed, oversized, MIME-spoofed, deleted, and stale-link files. |
| 44 | Files — Avatar/branding/player media paths | Identity / cross-tenant data | No authorized owner/guardian/player boundary identities or public/private path, type, and size fixtures. |
| 45 | Waivers — Team/global waiver lifecycle | Identity / cross-tenant data | No authorized team/institution owners or isolated versioned legal records across organizations. |
| 46 | Waivers — Parent/player/coach signature | Identity / cross-tenant data | No authorized signer/subject/guardian/other-team identities or replay, child, and event signature fixtures. |
| 47 | Forms — League/tournament registration builder | Identity / cross-tenant data | No authorized organizer/registrant identities or isolated published/unpublished form and public DTO fixtures. |
| 48 | Safety — Incident create/read/export | Identity / cross-tenant data | No authorized staff/institution/participant/outsider identities or synthetic sensitive incident and audit records. |
| 49 | Games — Team score create/edit/reset | Identity / cross-tenant data | No authorized staff/member/other-team identities or concurrent score, standings, and audit-history records. |
| 50 | Leagues — Create/edit/clone/delete | Identity / cross-tenant data | No authorized League A/League B creators, entitled quota state, or disposable league lifecycle records. |
| 51 | Leagues — Divisions/teams/filters/forms | Identity / cross-tenant data | No authorized league-owner/non-owner identities or populated division, team, filter, and form records. |
| 52 | Leagues — Schedule generation/deployment | Identity / cross-tenant data | No authorized league owner or blackout, conflict, fairness, rest, timezone, and race fixtures. |
| 53 | Leagues — Registration/assignment | Identity / cross-tenant data | No authorized public submitter/league owner or published team, player, waiver, and assignment records. |
| 54 | Leagues — Scorekeeper/spectator | Identity / cross-tenant data | No authorized organizer/scorekeeper scope or valid/wrong PIN, replay, downstream game, and standings fixtures. |
| 55 | Tournaments — Create/configure/replicate/archive | Identity / cross-tenant data | No authorized staff/other-team identities or disposable blueprint, replica, duplicate, and archive records. |
| 56 | Tournaments — Schedule/pools/brackets/referees | Identity / cross-tenant data | No authorized staff/referee/other-tournament identities or full-format conflict and assignment fixtures. |
| 57 | Tournaments — Registration/waiver | Identity / cross-tenant data | No authorized public submitter/organizer identities or published code, child, waiver, and private-ledger fixtures. |
| 58 | Tournaments — Scoring/dispute/public standings | Identity / cross-tenant data | No authorized scorekeeper/referee/organizer identities or PIN, replay, dispute, and downstream-bracket records. |
| 59 | Family — Children/invites/team cards | Identity / cross-tenant data | No authorized separate-household parents or linked children, sibling, invite, and stale-membership records. |
| 60 | Family — Schedule/waivers/payments | Identity / cross-tenant data / provider sandbox | No authorized two-child household, cross-team schedule/waiver records, or isolated payment-provider state. |
| 61 | Family — Enable youth login | Identity / provider sandbox | No authorized guardian/child identities, dedicated youth mailbox, or isolated Auth invite lifecycle. |
| 62 | Billing — Pricing/checkout/trial | Identity / provider sandbox | No authorized owner identities or Stripe test prices, customers, cards, clocks, and webhook configuration. |
| 63 | Billing — Upgrade/downgrade/add-on | Identity / provider sandbox | No authorized owner/staff boundary identities or Stripe proration, invoice-failure, and add-on fixtures. |
| 64 | Billing — Cancel/reactivate/portal/sync | Identity / provider sandbox / destructive authorization | No authorized owner identities, Stripe portal/webhook/test-clock state, or customer-deletion permission. |
| 65 | Stripe Connect — Onboarding/status | Identity / provider sandbox | No authorized owner/staff identities or disposable Stripe Connect test account and callback configuration. |
| 66 | Payments — Payment items/public/offline | Identity / cross-tenant data / provider sandbox | No authorized owner/payer identities, isolated team payment records, or Stripe/Connect test callbacks. |
| 67 | Fundraising — Campaign/link/ledger | Identity / cross-tenant data / provider sandbox | No authorized staff/other-team identities, campaign ledger, or disposable Connect test account. |
| 68 | Donations — Public projection/submission | Cross-tenant data / provider sandbox | No authorized published campaign/donor fixtures or Stripe/Connect test-mode payment objects. |
| 69 | Volunteers — Opportunity/public signup | Identity / cross-tenant data | No authorized staff/public-submitter fixtures or published, duplicate, invalid, and capacity-race records. |
| 70 | Facilities — Facility/field CRUD/rename | Identity / cross-tenant data | No authorized staff/institution/other-org identities or distinct facility, field, search, and address records. |
| 71 | Facilities — Availability/booking/delete | Identity / cross-tenant data / destructive authorization | No authorized staff/institution identities, overlapping booking race fixtures, or in-use deletion permission. |
| 72 | Equipment — Inventory/assignment/return | Identity / cross-tenant data | No authorized staff/member/assignee identities or stock, assignment, cleanup, and over-allocation records. |
| 73 | Sports Hub — Browse/search/filter/bookmark/preferences | Identity | BUG-002 visitor/responsive checks pass independently, but no authorized authenticated user exists for saved-preference persistence and self-only permission checks. |
| 74 | Sports Hub — RSS refresh/admin publish | Identity / provider sandbox | No authorized claim-controlled superadmin or controlled valid, malformed, slow, redirecting, duplicate, and unsafe-host RSS feeds. |
| 76 | Public portals — Squad/event registration | Identity / cross-tenant data | No authorized staff/public-submitter identities or published, unpublished, duplicate, and PII-sentinel registration records. |
| 77 | Public portals — Embed panels | Hosted environment / operational artifact | No authorized hosted origin, embed configuration, or CSP/frame-policy evidence for allowed and wrong origins. |
| 78 | Administration — Access and user directory | Identity | No authorized trusted-claim superadmin, fake-superadmin, revoked-claim, and non-admin identity matrix. |
| 79 | Administration — Entitlement/account control/plans | Identity / destructive authorization | No authorized superadmin/target identities or disposable accounts approved for audited entitlement and lifecycle changes. |
| 80 | Administration — Beta/bugs/embeds/newsletter/Sports Hub | Identity / provider sandbox | No authorized claim-controlled superadmin or approved newsletter, embed, and Sports Hub provider fixtures. |
| 81 | PWA/offline — Manifest/service worker/update/logout cache | Device-browser / hosted environment / identity | No authorized install-capable mobile browser, hosted service-worker origin, or registered user-switch/logout fixture. |
| 82 | Companion — Schedule todos/local sync | Identity / device-browser | No authorized registered profile pair or mobile/desktop contexts for corruption, conflict, offline, and profile-isolation checks. |
| 83 | Time Out — Local game lifecycle | Device-browser | No approved physical touch/mobile fixture or complete keyboard-and-touch browser matrix; Chromium and Firefox Playwright caches are unavailable. |
| 84 | Webhooks — Stripe standard/Connect | Provider sandbox / hosted environment | No Stripe/Connect test secrets, signed callback endpoint, test objects, or authoritative ledger/log fixture. |
| 85 | Webhooks — Resend delivery | Provider sandbox / hosted environment | No Resend test secret, signed callback endpoint, approved message fixture, or delivery ledger/log fixture. |
| 86 | Background — League projections/member cache | Hosted environment / cross-tenant data / operational artifact | No hosted Functions trigger context, populated league/member fixtures, or authorized function-log evidence. |
| 87 | Background — Demo cleanup/account purge/reminders | Hosted environment / destructive authorization / provider sandbox | No isolated scheduler, destructive lifecycle permission, FCM reminder fixture, or authorized function-log evidence. |
| 88 | Operations — Health/CI/deploy/rules drift/rollback | Operational artifact / hosted environment | No authorized staging deployment, health/deploy logs, rules-drift comparison, backup/restore record, or rollback drill. |

## BUG reconciliation

- BUG-001 independent result: `PASS` in `bug-001.md`; matrix row 29 remains `BLOCKED` for its unexecuted durable-role, cross-tenant, timezone/conflict, negative, and permission scenarios.
- BUG-002 independent result: `PASS` in `bug-002.md`; matrix row 73 remains `BLOCKED` for its unexecuted authenticated-preference persistence and self-only authorization scenarios.

No production/provider access, credential discovery, environment-value inspection, application/test change, or destructive operation was used for this reconciliation.
