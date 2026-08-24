# Phase 5 Staging Coverage Reconciliation

## Recount and decision

The current `05-coverage-matrix.md` contains exactly 88 data rows: 1 `PASS`, 1 `FAIL`, 86 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`. Historical Phase 4 remains 2 `PASS`, 0 `FAIL`, and 86 `BLOCKED`; the Phase 5 difference is the reproduced `/how-to` media request failure, now stable `BUG-004`.

Release-gate run `32721982132` and protected staging run `32722312601` both passed for exact deployed SHA `658d3ca89f3cabf6c55800400aa17bc72229c1af`. Hosted staging, deployment identity, backend ownership, health, and anonymous protected-route boundaries are therefore available for their recorded scope. They do not provide any durable registered identity, populated cross-tenant fixture, provider sandbox, controlled unsafe/private asset pair, FCM-capable device, destructive authorization, rollback/backup/restore drill, independent rules-drift comparison, or complete least-privilege proof.

The homepage row remains the sole `PASS`. The Marketing/legal audience/sport/safety/how-to/legal row is `FAIL` because its explicit no-failed-assets contract is not met: both the full sweep and fresh isolated replay captured one same-origin media failure for `/faq/how-to-create-a-game.mp4`, type `media`, reason `net::ERR_ABORTED`. Page HTTP status, heading, layout, console/page errors, error responses, and video final readiness were otherwise healthy. The failed row is not a blocker-map key.

## Blocked-row dependency map

Each current `BLOCKED` matrix row appears exactly once below. Row numbers are the 1-based data-row positions in the 88-row matrix. The map contains exactly 86 unique keys; row 3 is the failed BUG-004 row and is intentionally absent. Reasons are narrowed where hosted staging evidence became available, while retaining every remaining unavailable dependency.

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
| 33 | Reminders — Same-day FCM scheduler | Provider sandbox / device-browser / identity | Hosted functions are deployed, but no authorized FCM configuration, approved desktop/mobile device, eligible identity/timezone record, or authorized scheduler/log evidence was supplied. |
| 34 | Practice — Practice plans/templates | Identity / cross-tenant data | No authorized staff/member identities with paid-plan entitlement and assigned practice records. |
| 35 | Practice — Drill/playbook CRUD/search | Identity / cross-tenant data | No authorized staff/member/other-team identities or valid, invalid, duplicate, and ordered drill records. |
| 36 | Practice — Film/upload/coach marks/watch | Identity / cross-tenant data | No authorized staff/player identities or isolated safe, oversized, spoofed, timestamp, mark, and progress fixtures. |
| 37 | Feed — Post/media/comment/moderation | Identity / cross-tenant data | No authorized staff/member/moderator/other-tenant identities or safe/unsafe media and audience records. |
| 38 | Chat — Channel/message/unread | Identity / cross-tenant data | No authorized staff/member/removed identities or concurrent sessions with isolated channel/message history. |
| 39 | Polls — Create/vote/change/tally | Identity / cross-tenant data | No authorized staff/member/ineligible identities or separate concurrent-voter fixtures. |
| 40 | Email — Verification/reset/welcome/team email | Identity / provider sandbox | No approved target mailboxes, Resend safe sink, signed delivery fixture, or role-specific sender/recipient data. |
| 41 | Newsletter — Subscribe/unsubscribe/admin compose | Identity / provider sandbox | No authorized claim-controlled superadmin, approved recipients, or Resend/webhook fixtures for both lists. |
| 42 | Push — Device registration/preferences/target send | Provider sandbox / device-browser / identity | Hosted staging is available, but no authorized FCM configuration, approved desktop/mobile devices, target identities, or cleanup-owned registration fixtures were supplied. |
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
| 75 | Sports Hub — Resource/PDF/video/download | Identity / cross-tenant data | No controlled unsafe-URL Sports Hub resource and no authorized public/private cross-tenant asset-and-identity pair. The forced PDF failure/retry case passes locally, but partial evidence cannot establish the remaining negative and permission cases. |
| 76 | Public portals — Squad/event registration | Identity / cross-tenant data | No authorized staff/public-submitter identities or published, unpublished, duplicate, and PII-sentinel registration records. |
| 77 | Public portals — Embed panels | Operational artifact / controlled origin fixture | The hosted staging origin is available, but no authorized allowed/wrong embedding origins, embed configuration, or complete CSP/frame-policy evidence was supplied. |
| 78 | Administration — Access and user directory | Identity | No authorized trusted-claim superadmin, fake-superadmin, revoked-claim, and non-admin identity matrix. |
| 79 | Administration — Entitlement/account control/plans | Identity / destructive authorization | No authorized superadmin/target identities or disposable accounts approved for audited entitlement and lifecycle changes. |
| 80 | Administration — Beta/bugs/embeds/newsletter/Sports Hub | Identity / provider sandbox | No authorized claim-controlled superadmin or approved newsletter, embed, and Sports Hub provider fixtures. |
| 81 | PWA/offline — Manifest/service worker/update/logout cache | Device-browser / identity | Hosted staging is available, but no authorized install-capable mobile browser or registered user-switch/logout fixture exists for install, update, offline, corrupt-cache, and private-cache checks. |
| 82 | Companion — Schedule todos/local sync | Identity / device-browser | No authorized registered profile pair or mobile/desktop contexts for corruption, conflict, offline, and profile-isolation checks. |
| 83 | Time Out — Local game lifecycle | Device-browser | No approved physical touch/mobile fixture or complete keyboard-and-touch browser matrix; Chromium and Firefox Playwright caches are unavailable. |
| 84 | Webhooks — Stripe standard/Connect | Provider sandbox / operational artifact | The staging deployment is available, but no authorized Stripe/Connect sandbox objects, signed-event action, replay/out-of-order fixture, or authoritative ledger/log evidence was supplied. |
| 85 | Webhooks — Resend delivery | Provider sandbox / operational artifact | The staging deployment is available, but no authorized Resend sandbox, signed-event action, approved synthetic message fixture, or delivery ledger/log evidence was supplied. |
| 86 | Background — League projections/member cache | Cross-tenant data / operational artifact | Hosted functions are deployed, but no populated league/member fixtures, authorized trigger execution, or authoritative function-log evidence was supplied. |
| 87 | Background — Demo cleanup/account purge/reminders | Destructive authorization / provider sandbox / operational artifact | Hosted functions are deployed, but no destructive lifecycle permission, cleanup-owned demo/account records, FCM reminder fixture, authorized scheduler execution, or function-log evidence was supplied. |
| 88 | Operations — Health/CI/deploy/rules drift/rollback | Operational artifact / destructive authorization | Exact-SHA release/deploy runs and staging health are available, but no independent rules-drift comparison, backup/restore record, approved rollback drill, or complete least-privilege proof was supplied. |

## Failed-row reconciliation

| Row | Domain / scenario | Result | Stable defect |
|---:|---|---|---|
| 3 | Marketing/legal — Audience/sport/safety/how-to/legal | `FAIL` — exact deployed staging page remained visually and functionally healthy in its final state, but a same-origin media request failed in both the complete sweep and clean focused replay, violating the explicit no-failed-assets contract. | `BUG-004`, P3 LOW, `CONFIRMED UNRESOLVED` |

## BUG reconciliation

- BUG-001 independent result remains `PASS`; matrix row 29 remains `BLOCKED` for its unexecuted durable-role, cross-tenant, timezone/conflict, negative, and permission scenarios.
- BUG-002 independent result remains `PASS`; matrix row 73 remains `BLOCKED` for its unexecuted authenticated-preference persistence and self-only authorization scenarios.
- BUG-003 remains `FIXED AND VERIFIED` local-QA/testability evidence and does not map to a functional matrix row.
- BUG-004 is `CONFIRMED UNRESOLVED`; matrix row 3 is `FAIL` and is not part of the 86-row blocker map.

No production/provider access, credential discovery, environment-value inspection, application/test change, or destructive operation was used for this reconciliation.
