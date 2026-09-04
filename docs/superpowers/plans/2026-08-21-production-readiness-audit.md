# Production-Readiness Audit Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute a complete, evidence-backed production-readiness audit of every The Squad feature, role, critical journey, provider boundary, and operational process without using real customer data or unsafe production mutations.

**Architecture:** Establish one controlled baseline and shared synthetic fixture set, then test independent domains against the master coverage matrix. Browser evidence uses Playwright CLI snapshots, screenshots, traces, console output, and network observations; backend boundaries use unit tests, Firebase emulators, direct API requests, and provider sandbox events. Findings enter one bug ledger and are retested through focused regression plus the affected critical journey.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Auth/Firestore/Storage/Functions, Node test runner, Firebase emulators, Playwright CLI, Stripe test mode, Stripe Connect test mode, Resend sandbox/QA mailboxes, FCM, GitHub Actions, Firebase App Hosting staging, Vercel production.

**Spec:** `docs/superpowers/specs/2026-08-21-production-readiness-audit-design.md`

## Global Constraints

- Planning baseline date: 2026-08-21.
- Root runtime: Node `24.x`; Firebase Functions runtime: Node `22`.
- Local application port: `9001`.
- Coverage statuses: `NOT RUN`, `PASS`, `FAIL`, `BLOCKED`, `NOT APPLICABLE`.
- Never mark PASS without current run evidence for every applicable check in the coverage row.
- Use local emulators or an isolated non-production Firebase project for all writes.
- Use Stripe test mode only; require `livemode=false` for every provider event.
- Never create a real charge, refund, dispute, transfer, or payout.
- Never print or commit passwords, tokens, cookies, API keys, webhook secrets, service-account material, or action links.
- Never use real customer, athlete, guardian, medical, financial, or payment data.
- Production is read-only unless a later authorization names the exact action.
- Playwright artifacts belong under `output/playwright/`.
- Application bug fixes are separate tasks: diagnose first, obtain authorization, use systematic debugging and test-driven development, then rerun affected audit rows.

---

## File and evidence structure

Phase 2 creates or updates these focused artifacts:

- `docs/qa/production-audit/runs/<run-id>/00-environment.md` — commit, environment, tools, provider modes, baseline command results.
- `docs/qa/production-audit/runs/<run-id>/01-fixtures.md` — aliases, roles, tenant relationships, opaque account references, and cleanup ownership; no secrets.
- `docs/qa/production-audit/runs/<run-id>/<domain>.md` — expected versus actual results and artifact links for one domain.
- `docs/qa/production-audit/07-bug-ledger.md` — stable bug IDs, severity, reproduction, evidence, owner, and state.
- `docs/qa/production-audit/08-final-report.md` — final coverage totals, unresolved failures/blockers, and release recommendation.
- `output/playwright/<run-id>/<domain>/` — snapshots, screenshots, and traces.

The executor selects a run ID in UTC format such as `2026-08-22T153000Z`. Shell snippets below use `QA_RUN_ID`, `QA_BASE_URL`, and account aliases whose secret values come from an approved untracked source.

## Parallel testing domains

Once Tasks 1–2 finish, these domains are independent enough for `superpowers:dispatching-parallel-agents`:

| Domain | Roles | Features | Boundary | Required output |
|---|---|---|---|---|
| Identity/accounts | all global roles, unverified, suspended, pending-delete | Auth, sessions, onboarding, account lifecycle, demos | Does not modify billing/provider state | `identity-accounts.md`, auth traces, account-state API evidence |
| Team/organization | owners, staff, admin, member | Teams, club/school, roster, facilities, equipment | Team/organization mutations only | `team-organization.md`, Tenant A/B denial evidence |
| Family/compliance | parent, adult/youth player, staff | Family, recruiting, files, waivers, incidents | Player/guardian/legal records only | `family-compliance.md`, public/private DTO and Storage evidence |
| Schedule/communications | staff, parent, player | Events, calendar, practice, feed, chat, notifications | No competition or billing state | `schedule-communications.md`, multi-session traces |
| Competition | league creator, tournament staff, registrant, scorekeeper/referee | Leagues, tournaments, registration, scoring, public views | Competition tenants only | `competition.md`, format/standings/audit evidence |
| Commerce | account owner, parent/payer, public participant | Plans, Stripe, Connect, payments, fundraising, donations, volunteers | Stripe test mode only | `commerce.md`, test event IDs redacted to opaque suffixes |
| Content/admin | visitor, registered user, superadmin | Marketing, Sports Hub, embeds, newsletters, beta, bugs, admin | No customer records | `content-admin.md`, responsive/admin permission evidence |
| Infrastructure/security | operator plus synthetic identities | Rules, Storage, Functions, webhooks, health, CI/deploy drift | Read-only infrastructure except isolated project | `infrastructure-security.md`, command/provider logs |

Each agent updates only its domain evidence. The controller owns fixtures, the coverage matrix, bug IDs, and final status reconciliation. Agents must not duplicate another domain's happy paths; cross-domain checks are assigned to the journey owner named above.

### Task 1: Freeze the audit baseline

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/00-environment.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`

**Interfaces:**
- Consumes: repository HEAD, package scripts, environment validation, audit spec.
- Produces: `QA_RUN_ID`, exact commit, environment URL, tool versions, baseline results, and confirmed provider modes used by every later task.

- [ ] **Step 1: Resolve repository and tool versions**

Run:

```bash
git status --short
git rev-parse HEAD
git branch --show-current
node --version
npm --version
command -v npx
```

Expected: repository path resolves; Node major version is 24 for root checks; `npx` is available; any pre-existing working-tree changes are recorded and preserved.

- [ ] **Step 2: Validate configuration without printing values**

Run:

```bash
npm run verify:env
```

Expected: PASS with required variable names confirmed, or a nonzero exit recorded as a blocker. Do not run commands that print `.env.local`.

- [ ] **Step 3: Run the complete local verification gate**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run test:rules
npm run build
npm --prefix functions run build
```

Expected: record exit code and current test totals for every command. A failure becomes a bug/blocker; it does not authorize a code change.

- [ ] **Step 4: Create the environment record**

Write exact command results, commit, branch, local/staging URL, Firebase project alias, Stripe mode, Resend mode, and FCM availability to `00-environment.md`. Record secret presence only as `configured` or `missing`.

- [ ] **Step 5: Commit the baseline evidence**

```bash
git add docs/qa/production-audit/runs/<run-id>/00-environment.md docs/qa/production-audit/05-coverage-matrix.md
git commit -m "qa: record production audit baseline"
```

Expected: one documentation-only commit.

### Task 2: Build and verify synthetic fixtures

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/01-fixtures.md`
- Reference: `docs/qa/production-audit/06-test-account-requirements.md`

**Interfaces:**
- Consumes: isolated Firebase/Stripe/Resend environment and alias specification.
- Produces: verified aliases, Team A/B/C, organization/league/tournament fixtures, provider fixture states, and cleanup owners for all later tasks.

- [ ] **Step 1: Confirm environment isolation**

Verify the deployed web Firebase project ID matches the isolated Admin project and that Stripe events report `livemode=false`. Expected: no production project, customer, or provider endpoint is selected.

- [ ] **Step 2: Create identity matrix**

Create the aliases in `06-test-account-requirements.md` through supported signup/invite/admin flows. Record only alias, role, state, tenant, opaque UID suffix, and owner in `01-fixtures.md`.

- [ ] **Step 3: Create distinct tenant data**

Populate Team A and Team B with distinct roster, events, chats, files, waivers, incidents, payments, facilities, fundraisers, volunteers, leagues, and tournaments. Create Team C as the second legitimate child team for `qa-parent-a`.

Expected: a tester can identify a leak from visible fixture names without inspecting private identifiers.

- [ ] **Step 4: Create negative file/time/concurrency fixtures**

Prepare allowed, oversized, MIME-spoofed, private, public, and deleted media; DST/cross-midnight events; booked facilities; duplicate registration payloads; completed bracket dependencies; and two sessions capable of simultaneous submission.

- [ ] **Step 5: Smoke every alias**

For each alias, login once, capture the landing route, verify expected tenant membership, then log out. Expected: no alias unexpectedly lands in `/admin` or another tenant.

- [ ] **Step 6: Commit fixture metadata**

```bash
git add docs/qa/production-audit/runs/<run-id>/01-fixtures.md
git commit -m "qa: document isolated audit fixtures"
```

### Task 3: Audit authentication, sessions, onboarding, demos, and account states

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/identity-accounts.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-bug-ledger.md` when a mismatch is observed

**Interfaces:**
- Consumes: verified/unverified/youth/suspended/removed/pending-delete/demo aliases.
- Produces: CJ-01, CJ-02, CJ-03, CJ-06, CJ-24 evidence and identity/account coverage statuses.

- [ ] **Step 1: Start a traced Playwright session**

Run:

```bash
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh open "$QA_BASE_URL/login" --headed
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh tracing-start
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh snapshot
```

Expected: login snapshot with no uncaught console error. Element references are intentionally resolved from each live snapshot because they change after navigation.

- [ ] **Step 2: Execute signup and verification variants**

For coach, parent, adult player, admin, and league creator: submit one valid signup; submit invalid email, weak/mismatched password, duplicate email, double-click, and slow-network variants; confirm unverified private-route denial; consume the approved verification link once; reject reuse and modification.

Expected: one valid identity/profile per valid submission, no privileged client fields, and no orphan after a failed required delivery.

- [ ] **Step 3: Execute session lifecycle**

Open `/events` as a protected deep link, login, refresh, open a second tab, revoke/log out, then request `/events`, `/admin`, `/family`, and `/dashboard/billing` directly.

Expected: valid session returns to `/events`; logout/revocation rejects every stale tab and protected request; role-specific routes redirect safely.

- [ ] **Step 4: Execute reset, youth invite, and state denial**

Run password reset known/unknown/expired/reused/modified cases; youth invite valid/expired/reused/wrong-parent cases; then test unverified, suspended, removed, pending-delete, disabled, missing-profile, and missing-membership identities.

Expected: generic public responses, single-use actions, linked youth identity, and fail-closed private access.

- [ ] **Step 5: Execute two-session demo isolation and cleanup**

Seed the same demo persona in two browser contexts, mutate Demo A, attempt Demo A identifiers from Demo B, exit A, and invoke/observe isolated cleanup at the supported test clock.

Expected: no cross-session read/write; Demo B survives A cleanup; registered accounts remain untouched.

- [ ] **Step 6: Stop trace and record evidence**

```bash
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh tracing-stop
```

Save artifacts under `output/playwright/<run-id>/identity-accounts/`; update only identity rows with PASS/FAIL/BLOCKED and evidence links.

- [ ] **Step 7: Commit domain evidence**

```bash
git add docs/qa/production-audit/runs/<run-id>/identity-accounts.md docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-bug-ledger.md
git commit -m "qa: audit identity and account journeys"
```

### Task 4: Audit authorization and cross-tenant isolation

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/authorization-isolation.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: Team A/B accounts, global/local role matrix, current APIs/rules/storage paths.
- Produces: direct evidence for R-02, R-03, and every backend test item in `02-role-permission-matrix.md`.

- [ ] **Step 1: Build the direct-request ledger**

Enumerate all 79 API route files and classify each handler public, authenticated-self, team-member, staff, owner, organization authority, league/tournament authority, provider, internal, or superadmin.

Expected: every handler has required token, role, tenant identifier, and negative cases documented.

- [ ] **Step 2: Test token failures**

For every authenticated class, send missing, malformed, expired, revoked, anonymous, unverified, wrong-project, and valid wrong-role tokens.

Expected: 401/403 without resource existence, raw stack, token, or private metadata disclosure.

- [ ] **Step 3: Substitute Tenant B identifiers**

Replace Team A requests with Team B user/team/player/event/chat/message/file/facility/payment/league/tournament/club identifiers at UI, API, direct Firestore, and Storage layers.

Expected: every unauthorized read/write fails; no cached Tenant A/B content appears after switch.

- [ ] **Step 4: Attempt vertical escalation**

Attempt profile role/plan/Stripe/admin fields, membership role/staff position, owner transfer, staff promotion, superadmin profile string, score/RSVP/signature/financial changes, and direct root creation.

Expected: server/rules ignore or deny every escalation; valid bounded user fields still work.

- [ ] **Step 5: Run rules suites after hosted checks**

```bash
npm run test:rules
npm test -- tests/api-auth-security.test.mjs tests/security-regressions.test.mjs tests/team-access.test.mjs tests/team-membership-security.test.mjs
```

Expected: PASS; record hosted discrepancies even if emulator tests pass.

- [ ] **Step 6: Commit domain evidence**

Commit authorization evidence, updated rows, and any bug entries as `qa: audit authorization and tenant isolation`.

### Task 5: Audit teams, organizations, roster, facilities, and equipment

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/team-organization.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: Team A/B, club/school, owner/staff/member aliases, facility/equipment fixtures.
- Produces: CJ-04, CJ-05, CJ-07, CJ-08 evidence.

- [ ] **Step 1: Test team creation, quota, join, switch, and module flags**

Create first free team; reject second; create within paid capacity; race two final-seat creates; join Parent/Player/Member; attempt staff payload; switch tenants rapidly; toggle all eight module keys and directly request each disabled route.

Expected: exact capacity, server-derived positions, no partial team, no tenant bleed, disabled route/API denial.

- [ ] **Step 2: Test owner versus staff settings**

Owner and assistant edit ordinary team data; assistant attempts owner, billing, module, staff-promotion, reset, delete, Stripe Connect, and organization changes.

Expected: ordinary authorized work succeeds; owner-only operations fail for assistant.

- [ ] **Step 3: Test club/school squad lifecycle**

Open hub without active team; create/allocate/deallocate squad; invite/revoke delegated admin; deploy global waiver/document; attempt same operations from Team B and a non-authority admin.

Expected: institution scope and seats remain consistent; cross-organization actions fail.

- [ ] **Step 4: Test roster lifecycle and exports**

Add adult/youth/parent, edit, note, fee, staff position, remove/reinstate, search/filter/sort, export, and repeat private-view checks as parent/player/outsider.

Expected: owner protected; removed access revoked; export contains only authorized fields.

- [ ] **Step 5: Test facility/equipment races and cleanup**

Create/rename fields, double-book concurrent slots, delete booked facility, assign more equipment than available, return/delete assignment, and attempt Tenant B operations.

Expected: booking/quantity invariants and cross-organization denial.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit team and organization workflows`.

### Task 6: Audit family, recruiting, files, waivers, forms, and safety

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/family-compliance.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: parent/player/staff/outsider, two-child household, file fixtures, waivers, incident fixtures.
- Produces: CJ-13, CJ-14, CJ-15, CJ-20 evidence.

- [ ] **Step 1: Test household aggregation and isolation**

Verify two linked children across Team A/C, invites, schedules, balances, payments, and pending waivers; replace player/parent/team IDs with Parent B fixtures.

Expected: legitimate cross-team household aggregation only; no sibling/other-household leak.

- [ ] **Step 2: Test recruiting private/public transitions**

Create/edit metrics, stats, evaluations, contact, videos, and coach marks; enable/disable public profile; inspect anonymous JSON and assets before/after toggle.

Expected: public allowlist only; no DOB, contacts, guardian/player IDs, invites, evaluations, or arbitrary subcollections.

- [ ] **Step 3: Test file and media policy**

Upload allowed file; attempt oversized, MIME-spoofed, wrong extension/path, other-team/player, and unauthorized public reads; delete and retry stale URLs.

Expected: only authorized safe lifecycle works; private content is inaccessible after revocation/deletion.

- [ ] **Step 4: Test waiver/form/signature integrity**

Deploy exact legal text; sign as correct parent/player/coach; retry, alter signer/date/text/child/team/event, and submit directly; create/publish/disable forms and attempt ledger access as registrant.

Expected: immutable, correctly attributed signatures and organizer-only private submissions.

- [ ] **Step 5: Test safety incident authority**

Create complete incident, read institution aggregate/detail, export, attempt participant edit/delete, and query from Tenant B.

Expected: sensitive detail stays scoped and audit integrity is preserved.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit family privacy and compliance`.

### Task 7: Audit schedules, practice, communications, email, and push

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/schedule-communications.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: Team A staff/parent/player/removed user, time/media fixtures, two browser sessions, QA mailboxes/device.
- Produces: CJ-09, CJ-10, CJ-11, CJ-12 evidence.

- [ ] **Step 1: Test event/calendar time matrix**

Create/edit/delete single and recurring events across local midnight, DST start/end, multiple time zones, blackout/conflict states, and cancelled/archived states. Refresh and compare Events, Calendar, Family, and ICS.

Expected: consistent local dates/times and no duplicate/missing records.

- [ ] **Step 2: Test RSVP, attendance, ICS, and reminders**

Submit concurrent responses; forge another UID; create team/user/multi feeds; remove membership/deactivate token; invoke overlapping reminder runs with preferences on/off and removed user.

Expected: own responses only, feed revocation, one eligible notification, no stale recipient.

- [ ] **Step 3: Test practice/drill/video lifecycle**

Create practice and drill, add/reorder film, upload media, add mark/comment/watch requirement, record player progress, refresh, and attempt member/outsider mutations.

Expected: persistent ordered content and bounded role authority.

- [ ] **Step 4: Test feed/chat/poll audiences in two sessions**

Create posts/channels/messages/polls, comment/vote concurrently, moderate, toggle parent/module controls, remove user, and retry direct APIs.

Expected: real-time sync, one vote/action, correct audience, and immediate revocation.

- [ ] **Step 5: Test email/push lifecycle**

Send verification/reset/welcome/team/admin/newsletter messages to approved recipients; validate links/origin/recipient; unsubscribe; register/refresh/remove FCM tokens; test denied permission and logout.

Expected: correct recipient and single delivery/event; no secret in browser/log/evidence; stale tokens removed.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit scheduling and communications`.

### Task 8: Audit leagues and tournaments

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/competition.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: league/tournament organizers, registrants, scorekeeper/referee roles, facilities, all competition formats.
- Produces: CJ-16 through CJ-19 evidence.

- [ ] **Step 1: Execute league create/configure/clone/delete matrix**

Create league; test duplicate/empty names, quota, divisions, filters, team assignments, forms, edit persistence, clone blueprint, and conflict-aware delete. Verify the Coming Soon Division Architect cannot be reached through a direct mutation.

- [ ] **Step 2: Execute league schedule matrix**

Generate/deploy round-robin and double-elimination configurations with blackouts, fields, rest windows, double headers, odd/even teams, impossible windows, and concurrent deploy.

Expected: deterministic conflict-free schedule or actionable validation with no partial deployment.

- [ ] **Step 3: Execute league registration/scoring/public matrix**

Publish team/player/waiver forms; submit valid/invalid/duplicate registrations; assign; score with wrong/valid PIN; dispute; refresh public standings; remove member access.

Expected: private ledger scope, 3/1/0 standings, narrow PIN authority, synchronized public DTO.

- [ ] **Step 4: Execute tournament format matrix**

For round robin, single elimination, double elimination, and pool play: create, schedule, score, dispute, resolve, assign conflicting/non-conflicting referee, replicate, archive, and delete.

Expected: bracket advancement and reset invariants, no scheduling conflict, complete blueprint replication, and safe archival.

- [ ] **Step 5: Execute tournament public workflow**

Submit team/player registration and waiver; test invalid code/PIN, wrong child/team, duplicate submission, public standings, spectator, referee, scorekeeper, and downstream-completed score edits.

Expected: public projections contain safe fields, codes grant narrow actions, and completed downstream games prevent corrupt edits.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit league and tournament workflows`.

### Task 9: Audit billing, Connect, payments, fundraising, donations, and volunteers

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/commerce.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: Stripe test fixtures, Connect test account, owner/payer/public aliases.
- Produces: CJ-21 through CJ-23 evidence.

- [ ] **Step 1: Verify provider safety**

Before every run, record that keys/prices/customers/events are test mode and callback URLs point to isolated staging. Abort if any object reports live mode.

- [ ] **Step 2: Execute all plan/cycle checkouts**

Test `team`, `elite`, `league`, and `school` monthly and annual checkout; abandoned/retried sessions; one-use promotion; exact five-day trial; canonical-price/body/UID tampering.

Expected: one customer/subscription, exact entitlement, no client-selected arbitrary price or user.

- [ ] **Step 3: Execute subscription transitions**

Upgrade/downgrade, interval switch, add/remove extra teams, zero/credit/positive invoices, failed payment/recovery, cancel/reactivate, portal payment-method change, customer deletion, and checkout recovery.

Expected: provider-authoritative state, exact quota, no duplicate customer/seat allocation, free fallback when non-entitled.

- [ ] **Step 4: Execute webhook adversarial matrix**

Send signed valid, invalid signature, replay, duplicate, delayed, out-of-order, wrong-mode, partial-failure/retry, refund, and dispute fixtures for standard and Connect webhooks.

Expected: invalid 400, idempotent ledger, correct authoritative reconciliation, secret-redacted logs.

- [ ] **Step 5: Execute Connect/payment/fundraising/volunteer workflows**

Onboard test account; create/deactivate payment item; pay/record offline; publish fundraiser/opportunity; submit valid/invalid/duplicate/concurrent donation/signup; fill volunteer capacity; verify attendance replacement and retired reward endpoint HTTP 410.

Expected: correct tenant/amount/status, no private public fields, and no over-capacity or duplicate financial record.

- [ ] **Step 6: Reconcile and clean provider fixtures**

Compare Stripe/Connect objects, webhook ledgers, user entitlements, payment items/payments, balances, donations, and volunteer records. Cancel/delete disposable test objects and record cleanup.

- [ ] **Step 7: Commit domain evidence**

Commit as `qa: audit commerce and public participation`.

### Task 10: Audit public content, Sports Hub, embeds, and administration

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/content-admin.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: visitor/user/superadmin/fake-superadmin aliases and controlled RSS fixtures.
- Produces: marketing/content/public/embed/admin evidence.

- [ ] **Step 1: Crawl every public page route**

Open all marketing, audience, sport, legal, safety, how-to, Sports Hub, resource, template, public portal, and embed routes at valid and invalid dynamic parameters.

Expected: intended 2xx/404 behavior, valid metadata/canonical/noindex, no console error, no horizontal overflow, no private data.

- [ ] **Step 2: Test search/filter/bookmark/preference/download behavior**

Use empty, special-character, long, and no-result queries; persist user preferences; download resources/PDF/media; retry missing assets.

Expected: stable results, self-only preferences, usable downloads, and safe error states.

- [ ] **Step 3: Test RSS/admin publishing safety**

Refresh controlled valid, malformed, duplicate, slow, redirecting, and unsafe-host feeds; publish/edit/delete custom content as superadmin; retry as non-admin.

Expected: authorization, sanitization, deduplication, safe URL/SSRF controls, actionable failure.

- [ ] **Step 4: Test superadmin claim and every admin section**

Open Accounts, Users Directory, Beta Apps, Bug Reports, Newsletters, Sports Hub, Links & Embeds, and plans at 390×844 and 1440×900. Revoke claim and retry; set only profile role on fake account and retry.

Expected: trusted claim only; immediate denial after revocation; all controls reachable without overflow.

- [ ] **Step 5: Test public/admin submissions and newsletters**

Submit contact/beta/referral/newsletter valid and invalid payloads; read/compose/send/delete as superadmin; unsubscribe; attempt list/send/delete as ordinary user.

Expected: validated public append-only behavior and superadmin-only private management.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit public content and administration`.

### Task 11: Audit responsive, accessibility, PWA, offline, and cross-browser behavior

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/experience-platform.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: completed critical journeys and stable fixtures.
- Produces: responsive/accessibility/browser/PWA evidence across high-value routes.

- [ ] **Step 1: Run width matrix**

Repeat role landing, navigation, primary forms, dense tables/dialogs, Family, league/tournament management, billing, and admin at 320, 375, 390, 768, 1024, 1440, and 1920 px.

Expected: no horizontal document overflow, clipped required action, unreachable dialog footer, or obscured mobile navigation.

- [ ] **Step 2: Run keyboard and focus matrix**

Keyboard-only login/signup, navigation, switcher, dialogs, tabs, menus, forms, date/select controls, and destructive confirmations. Check visible focus, logical order, focus trap/return, Escape, labels, status announcements, and icon accessible names.

- [ ] **Step 3: Run browser/device smoke**

Repeat CJ-02, CJ-07, CJ-09, CJ-12, CJ-20, and public registration in current Chrome, Safari, Firefox, Edge, mobile Safari, and Android Chrome where available.

Expected: same data/result and no browser-specific critical failure. Missing devices are BLOCKED, not PASS.

- [ ] **Step 4: Run slow/offline/recovery matrix**

Throttle requests; disconnect during form submission, upload, team switch, chat send, and schedule sync; refresh/back/reconnect; corrupt local schedule todo storage in an isolated profile.

Expected: no duplicate mutation, permanent spinner, stale tenant, or unrecoverable local UI.

- [ ] **Step 5: Test PWA/service-worker lifecycle**

Install, update, offline-open supported shell, reauthenticate, logout, and switch users. Inspect caches and notification registration.

Expected: no private content available after logout/user switch; update and token registration recover cleanly.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit responsive and offline experience`.

### Task 12: Audit infrastructure, background processes, CI, and operations

**Files:**
- Create: `docs/qa/production-audit/runs/<run-id>/infrastructure-security.md`
- Modify: coverage matrix and bug ledger

**Interfaces:**
- Consumes: exact commit, isolated project, provider ledgers, deployment/runbook configuration.
- Produces: Functions, webhook, health, CI, rule/index drift, observability, backup, and rollback evidence.

- [ ] **Step 1: Verify exact-commit release gate**

Confirm CI results correspond to the audited commit and include typecheck, lint, unit tests, rules tests, build, Functions build, and production dependency audits.

Expected: every required job is present; cancelled/skipped/other-commit jobs do not count.

- [ ] **Step 2: Verify rules/index/Function deployment parity**

Use documented read-only drift checks and deployed inventory. Compare Firestore rules, Storage rules, indexes, and Functions against repository artifacts.

Expected: exact parity or recorded release blocker.

- [ ] **Step 3: Test background-process idempotency**

In the isolated project, invoke/retry league projection/member cache, account purge, demo cleanup, and reminders with partial-failure and overlapping-run fixtures.

Expected: one correct terminal state, retryable failure, no unrelated/live data mutation.

- [ ] **Step 4: Verify health, monitoring, backup, and restore/rollback evidence**

Confirm health response, revision/commit correlation, uptime/error alerts, backup schedule/retention, owner notification channel, rollback owner, and a non-production restore/rollback drill record.

Expected: documented owner and tested procedure; missing restore proof remains BLOCKED/HIGH.

- [ ] **Step 5: Inspect logs for observability and secret safety**

Correlate one valid and one failed request/event per provider/background process. Search captured logs for raw Authorization, cookies, secret values, service-account material, and private payloads.

Expected: actionable correlation without secret/private-data exposure.

- [ ] **Step 6: Commit domain evidence**

Commit as `qa: audit infrastructure and operations`.

### Task 13: Triage failures and verify authorized fixes

**Files:**
- Modify: `docs/qa/production-audit/07-bug-ledger.md`
- Modify: affected domain evidence and coverage rows
- Modify application/test files only after separate user authorization

**Interfaces:**
- Consumes: FAIL rows and artifacts from Tasks 3–12.
- Produces: stable bugs, root-cause evidence, authorized fixes, focused regressions, journey retests, and updated statuses.

- [ ] **Step 1: Create one bug per distinct root symptom**

Record ID `QA-YYYYMMDD-NNN`, severity, feature, roles, tenant, environment/commit, preconditions, exact steps, expected, actual, data impact, console/network evidence, artifacts, and cleanup state.

- [ ] **Step 2: Reproduce in the smallest safe scope**

Repeat once with a fresh fixture/session, then isolate UI, API, rules, provider, or background boundary. Expected: reproducible evidence or bug marked intermittent with attempt count and traces.

- [ ] **Step 3: Stop for authorization before application changes**

Present diagnosis, impact, proposed change, affected files, regression test, and adjacent risks. Do not modify application code until authorized.

- [ ] **Step 4: Implement an authorized fix with required skills**

Use `superpowers:systematic-debugging`, then `superpowers:test-driven-development`; add a failing focused test, verify failure, implement minimal fix, verify focused and full gates.

- [ ] **Step 5: Rerun the affected coverage row and critical journey**

Expected: regression passes, original browser/API reproduction passes, adjacent negative/permission cases pass, and no new console/network issue.

- [ ] **Step 6: Commit each fix and evidence separately**

Use one application commit per approved fix and a subsequent QA evidence commit where practical. Never combine unrelated repairs.

### Task 14: Reconcile coverage and issue the final production-readiness report

**Files:**
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-bug-ledger.md`
- Create: `docs/qa/production-audit/08-final-report.md`

**Interfaces:**
- Consumes: every domain report, artifact, bug, blocker, cleanup record, and exact-commit verification.
- Produces: auditable totals and a release recommendation that does not overstate coverage.

- [ ] **Step 1: Validate every coverage row**

For each row, confirm evidence for happy, negative, permission, console, network, persistence, and applicable responsive checks. Downgrade unsupported PASS rows to NOT RUN or BLOCKED.

- [ ] **Step 2: Reconcile critical journeys and risks**

Confirm all 24 journeys have one terminal status and every CRITICAL/HIGH risk has direct evidence or a named blocker. Any open unauthorized access, financial mismatch, legal-record issue, deletion corruption, or competition corruption prevents a release-ready recommendation.

- [ ] **Step 3: Verify cleanup**

Confirm disposable Auth, Firestore, Storage, Stripe/Connect, email, FCM, RSS, and calendar fixtures are removed or retained only under the documented synthetic audit policy.

- [ ] **Step 4: Run documentation consistency checks**

```bash
rg -n "T[B]D|T[O]DO|implement la[t]er|fill in deta[i]ls|add appropriate error handl[i]ng|handle edge cas[e]s|write tests for the abo[v]e|Similar to Tas[k]" docs/qa/production-audit docs/superpowers/plans/2026-08-21-production-readiness-audit.md
rg -n "\| PASS \|" docs/qa/production-audit/05-coverage-matrix.md
```

Expected: first command returns no unresolved planning placeholders. The second returns only rows backed by current run evidence and linked artifacts.

- [ ] **Step 5: Write the final report**

Include environment/commit, roles/features/journeys totals, PASS/FAIL/BLOCKED/N/A counts, unresolved critical/high bugs, provider/device coverage, cleanup, limitations, and one of: `READY`, `READY WITH ACCEPTED RISKS`, or `NOT READY`.

- [ ] **Step 6: Run final verification and commit**

```bash
npm run verify
git add docs/qa/production-audit
git commit -m "qa: publish production readiness audit"
```

Expected: current verification output attached to the final report; commit contains evidence documentation and separately authorized test changes only.

## Plan self-review

- Spec coverage: all 30 feature families, seven global roles, team-local authority, 24 critical journeys, six account/provider fixture groups, Playwright checks, parallel domains, risk classifications, and status columns are assigned to tasks.
- Placeholder scan: no unresolved planning placeholders are present; dynamic run IDs and Playwright element references are runtime values explicitly resolved by the executor.
- Type/name consistency: role names, plan IDs, feature families, journey IDs, risk IDs, status names, paths, and evidence files match the Phase 1 documents.
