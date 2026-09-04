# Final Production Certification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all 81 current `BLOCKED` coverage results with fresh, supported terminal results and reach full production certification without retesting unrelated established passes.

**Architecture:** Extend the loopback Phase 2 fixture/browser harness into a deterministic scenario catalog, run shared authorization and feature batches locally first, then use exact-commit staging only for durable identity, provider, worker, scheduler, and device evidence. Each batch owns named coverage rows and evidence files; defects follow a red-green repair cycle before their rows are rerun.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Auth/Firestore/Storage/Functions and emulators, Node test runner, Playwright CLI, Stripe and Connect test mode, Resend QA delivery/webhooks, standards Web Push, GitHub Actions, Firebase App Hosting staging.

**Spec:** `docs/superpowers/specs/2026-09-04-final-production-certification-design.md`

## Global Constraints

- Source of truth is `docs/qa/production-audit/05-coverage-matrix.md` at commit `77da392b`.
- Scope only its 81 `BLOCKED` rows; preserve six established PASS rows and one N/A row unless a repair affects them.
- Production remains read-only until separately authorized.
- Use disposable emulator or `the-squad-v2-staging` Firebase data only.
- Require `livemode=false` for every Stripe object/event; never perform a live charge, payout, transfer, refund, or dispute.
- Never retain secrets, action links, session material, raw provider payloads, or real personal data.
- Browser artifacts go under `output/playwright/2026-09-04-final-certification/`.
- Evidence goes under `docs/qa/production-audit/runs/2026-09-04-final-certification/`.
- PASS requires happy, negative, permission, persistence, console/network, and applicable responsive/device proof.
- Physical Android and iPhone/iPad evidence cannot be replaced by emulation.
- Every defect repair uses systematic debugging and test-driven development.

## File Structure

- `scripts/qa/certification/scenario-catalog.mjs`: canonical row IDs, roles, assertions, environments, and cleanup owners.
- `scripts/qa/certification/fixture-catalog.mjs`: safe identities and data shared by seeders.
- `scripts/qa/certification/run-local-batches.mjs`: local emulator/API/Playwright batch orchestration.
- `scripts/qa/certification/run-provider-batches.mjs`: staging Stripe/Connect/Resend orchestration with safety refusal.
- `scripts/qa/certification/run-background-batches.mjs`: isolated Function/scheduler/operations orchestration.
- `scripts/qa/certification/verify-evidence.mjs`: status/evidence/secret/staleness validation.
- `scripts/qa/seed-phase2-emulator-fixtures.mjs`: expanded isolated fixture creation.
- `scripts/qa/run-phase2-emulator-audit.mjs`: role authentication and browser setup.
- `tests/final-certification-*.test.mjs`: catalog, fixture, runner, and evidence contracts.
- `docs/qa/production-audit/runs/2026-09-04-final-certification/*.md`: sanitized batch evidence.

### Task 1: Freeze the 81-row scenario catalog

**Files:** Create `scenario-catalog.mjs`, `tests/final-certification-catalog.test.mjs`, and `00-selection.md`.

**Interfaces:** Produce `CERTIFICATION_SCENARIOS`, an array of `{ id, feature, subFeature, roles, environments, assertions, cleanupOwner }`; every later runner selects by `id`.

- [ ] Write a test asserting exactly 81 unique currently blocked feature/sub-feature pairs, zero established PASS/N/A rows, nonempty environments/assertions, and one cleanup owner each.
- [ ] Run `node --import tsx --test tests/final-certification-catalog.test.mjs`; expect failure because the catalog is absent.
- [ ] Encode all rows in matrix order with stable IDs and verbatim happy/negative/permission/console/network/responsive requirements.
- [ ] Rerun the focused test; expect 81 selected and zero missing or extra rows.
- [ ] Write `00-selection.md` with HEAD, staging revision, exclusions, ownership, and partial-evidence rule.
- [ ] Commit as `test: catalog remaining certification rows`.

### Task 2: Build complete isolated fixtures

**Files:** Create `fixture-catalog.mjs`, `tests/final-certification-fixtures.test.mjs`, and `01-fixtures.md`; modify both existing Phase 2 fixture/audit scripts.

**Interfaces:** Produce `buildFixtureCatalog(runSuffix)` with every alias in `06-test-account-requirements.md`, Team A/B/C, club/school, leagues/tournaments, household, subscriptions, files/time/races, and precise cleanup selectors.

- [ ] Write tests for all aliases, visibly distinct tenants, Parent A Team A/C linkage only, test-mode providers, bounded cleanup, and refusal of production/non-loopback targets.
- [ ] Run `node --import tsx --test tests/final-certification-fixtures.test.mjs`; expect missing-catalog failure.
- [ ] Implement deterministic organization, roster, recruiting, family, schedule, practice, chat, file, compliance, competition, facility, equipment, public, and billing fixtures.
- [ ] Run the new test plus `tests/phase2-emulator-fixtures.test.mjs` and `tests/phase2-emulator-audit.test.mjs`; expect PASS.
- [ ] Run `npm run qa:audit-emulator`; every active alias must land correctly and blocked identities must fail closed.
- [ ] Record sanitized alias/state/tenant/opaque suffix/cleanup ownership and commit as `test: expand isolated certification fixtures`.

### Task 3: Complete identity, account, demo, and route-policy rows

**Files:** Create/modify `run-local-batches.mjs`, `02-identity.md`, the matrix, and defect ledger.

**Interfaces:** Consume Marketing submission, Authentication, Account lifecycle, Signup/onboarding, Demo, Dashboard policy, and Administration-access IDs; produce results keyed by scenario ID.

- [ ] Test valid/unknown/wrong/slow/double login, protected deep links, refresh, second-tab logout/revocation/back cache, and full mobile/desktop auth layout.
- [ ] Test missing/partial profiles, unverified/suspended/disabled/removed/pending-delete states, owner delete block, cancel/purge/retry/partial failure, and cross-user control.
- [ ] Test coach/admin/league/parent/adult signups and youth invitation using valid, duplicate, invalid, aborted, expired, reused, modified, and wrong-recipient cases.
- [ ] Test two anonymous sessions for mutation isolation, identifier tampering, billing denial, expiry boundary, cleanup retry/partial failure, and registered-account exclusion.
- [ ] Run `node scripts/qa/certification/run-local-batches.mjs identity`, then durable mailbox cases on staging.
- [ ] Update only selected rows and commit as `qa: complete identity certification batch`.

### Task 4: Complete teams, organizations, roster, recruiting, and family

**Files:** Modify local runner, matrix, ledger; create `03-tenants.md`.

**Interfaces:** Consume Team A/B/C, owner/staff/member, club/school, parent/player, and lifecycle fixtures; produce selected tenant-domain results.

- [ ] Test free/paid team capacity, concurrent final seat, join code invalid/reuse/race/escalation, settings validation, eight module toggles plus direct denial, and seasonal reset/delete safety.
- [ ] Test institution empty/partial/stale aggregates, squad allocation/removal, quotas/concurrency/conflicts, delegated-admin boundaries, and global document deployment/revocation.
- [ ] Test roster adult/youth/guardian lifecycle, owner invariants, position authority, search/filter/sort/export privacy, notes/evaluations/fees, and removal/reinstatement.
- [ ] Test recruiting metrics/media/evaluations/contact, private/public allowlist transitions, video/coach marks, and cross-player/tenant denial.
- [ ] Test household Team A/C aggregation, Parent B isolation, invite/relink/remove, schedule/balance/waiver aggregation, and wrong-child/team substitutions.
- [ ] Run the tenants batch, `npm run test:rules`, and focused team/recruiting tests; reconcile and commit as `qa: complete tenant and family certification batch`.

### Task 5: Complete schedules, communications, files, and compliance

**Files:** Modify local runner, matrix, ledger; create `04-operations.md`.

**Interfaces:** Consume DST/recurrence/booking/media/two-session/mailbox/push/waiver/form/incident fixtures; produce Events through Equipment plus authenticated Sports Hub results.

- [ ] Test event CRUD/recurrence/DST/local-midnight/timezone/conflicts; compare Calendar, Family, and ICS; race RSVP/attendance and forge another UID.
- [ ] Test feeds, revocation, overlapping reminders, preference/removal boundaries, and one eligible notification.
- [ ] Test practice/drill/playbook/video/mark/comment/watch lifecycle plus staff/member/outsider authority.
- [ ] Test two-session feed/chat/poll create/update/delete, concurrent comments/votes, moderation, audience controls, removed member, and disabled modules.
- [ ] Test allowed/oversized/MIME-spoof/wrong-path/private/public/deleted files; immutable signatures; form ledgers; incidents; booking conflicts; inventory races and cleanup.
- [ ] Test Resend messages/unsubscribe/failures and push permission denial/opt-out/stale cleanup/logout/user-switch/sender/removed-member/multi-device targeting.
- [ ] Run the operations batch and focused calendar/reminder/email/push/storage/waiver suites; reconcile and commit as `qa: complete operational feature certification batch`.

### Task 6: Complete games, competition, and public portals

**Files:** Modify local runner, matrix, ledger; create `05-competition.md`.

**Interfaces:** Consume organizer/registrant/scorekeeper/referee/facility/public fixtures; produce Games, five League, four Tournament, Public portal, Embed, Volunteer, Fundraising, and Donation results.

- [ ] Test games CRUD, score/stat validation, concurrent edits, finalization/dependency guards, standings/exports, and role denial.
- [ ] Test league creation/quota/divisions/teams/clone/delete and round-robin/elimination schedules with blackouts/rest/double-headers/impossible windows/concurrent deployment.
- [ ] Test league forms/waivers/registration, PIN scoring/disputes, membership revocation, and public projections.
- [ ] Test round robin, single/double elimination, and pools across schedule, score, dispute, referee conflict, replication, archive/delete, and downstream bracket guards.
- [ ] Test public/embedded valid/invalid/duplicate/unpublished/origin/config/PII-ledger boundaries, volunteer capacity races, fundraising visibility, and donation idempotency.
- [ ] Run competition browser and focused suites; reconcile and commit as `qa: complete competition and public portal batch`.

### Task 7: Complete billing and provider rows

**Files:** Create `run-provider-batches.mjs`, provider safety tests, `06-commerce.md`; modify matrix and ledger.

**Interfaces:** Consume staging secrets without printing them, canonical test prices, test clocks/cards/customers, one Connect test account, and webhook ledgers; produce commerce results.

- [ ] Write/run failing safety tests requiring staging project/origin, approved QA recipient, and `livemode=false` before mutation.
- [ ] Implement refusal guards and rerun safety tests to PASS.
- [ ] Execute team/elite/league/school monthly/annual checkout, abandon/retry, trial, body tampering, upgrade/downgrade, interval/add-on changes, past-due/recovery, cancel/reactivate, portal, and customer deletion/recovery.
- [ ] Execute Connect success/abandon/retry/wrong-team, payment items, public/offline payment, wrong amount/team/customer, fundraiser reconciliation, and no-payout cleanup.
- [ ] Deliver valid/forged/replay/duplicate/delayed/out-of-order/wrong-mode/unknown/partial-failure events to standard Stripe, Connect, and Resend; verify one authoritative state and redacted logs.
- [ ] Reconcile/delete disposable provider objects, run focused Stripe/Connect/Resend/security suites, and commit as `qa: complete commerce provider certification batch`.

### Task 8: Complete content, RSS, and administration

**Files:** Modify local runner, matrix, ledger; create `07-content-admin.md`.

**Interfaces:** Consume visitor/user/trusted-admin/fake-admin/revoked-claim/RSS/public-submission fixtures; produce remaining Marketing, Sports Hub, and Administration results.

- [ ] Test contact/beta/referral valid/invalid/oversize/duplicate/rate-limit and authenticated search/filter/bookmark preferences with self-only persistence.
- [ ] Test valid/malformed/duplicate/slow/redirecting/unsafe/oversized RSS for authorization, sanitization, SSRF denial, deduplication, and actionable errors.
- [ ] Test directory, entitlement/account/plan control, beta, bugs, embeds, newsletter, and Sports Hub CRUD/compose/provider failure/target tampering.
- [ ] Revoke trusted claim, retry with fake profile role and every non-admin role, and verify 390x844 plus 1440x900 containment.
- [ ] Run content-admin batch and focused admin/newsletter/network tests; reconcile and commit as `qa: complete content and administration batch`.

### Task 9: Complete background and operations rows

**Files:** Create `run-background-batches.mjs`, `08-infrastructure.md`; modify matrix and ledger.

**Interfaces:** Consume isolated scheduler fixtures, deployed inventories, backup/restore target, and exact SHA; produce both Background and Operations results.

- [ ] Test league/event/member projection create/update/delete, retries, partial failure, public allowlist, revoked access, and eventual consistency.
- [ ] Invoke overlapping demo cleanup, account purge, and reminder runs at clock boundaries with retry failures and live/other-tenant exclusions.
- [ ] Compare deployed rules, indexes, Functions, secret-name requirements, and App Hosting SHA/revision; inspect correlated success/failure logs for secret safety.
- [ ] Create scoped synthetic backup, roll staging to previous known-good revision, smoke public/protected health, restore exact candidate, verify fixtures, and clean backup.
- [ ] Run background runner plus scheduler/environment/operations suites; reconcile and commit as `qa: complete infrastructure and rollback certification`.

### Task 10: Complete physical Android and iPhone/iPad PWA rows

**Files:** Create `09-physical-devices.md`; modify Push/PWA rows and ledger.

**Interfaces:** Consume exact staging revision, synthetic sender/recipients, one Android, and one iPhone/iPad; produce observed device results.

- [ ] Confirm staging-only accounts and clean-install state on each device.
- [ ] On Android test denial then enablement, opt-out, stale cleanup, foreground/background/closed receipt, sender/removed-member exclusion, logout/user switch, two-device targeting, dot/card/tap, update, offline shell, corrupt cache, and token cleanup.
- [ ] On iPhone/iPad install from Safari and test identity/icon/start route, denial/enablement, foreground/background/closed receipt, tap, opt-out, sender/removed-member exclusion, logout/user switch, update, offline shell, and cleanup.
- [ ] Record device/OS/browser, revision, alias, expected/observed signal, and cleanup without private message contents/device IDs.
- [ ] Promote rows only after all observations and commit as `qa: complete physical device certification`.

### Task 11: Repair each discovered defect

**Files:** Modify only affected source/tests plus ledger, batch report, and matrix row.

**Interfaces:** Consume one reproducible FAIL; produce root cause, red-green regression, minimal repair, exact retest, related boundary regression, and resolved entry.

- [ ] Invoke systematic debugging and identify the first incorrect state transition, excluding fixture/harness error.
- [ ] Invoke TDD; write failing regression, observe red, implement minimal fix, observe green, reverse fix to prove red, restore and prove green.
- [ ] Retest the exact role/tenant/route/provider/device scenario and only affected shared/permission/critical journeys.
- [ ] Run focused tests, typecheck, scoped lint, and affected Playwright batch before one commit per root cause.
- [ ] Keep the row FAIL until fresh exact-journey evidence exists.

### Task 12: Validate evidence and issue the exact candidate

**Files:** Create `verify-evidence.mjs` and `tests/final-certification-evidence.test.mjs`; modify matrix, final report, and matching release checklists.

**Interfaces:** Consume every result/artifact/defect/cleanup record; produce a machine-checked 88-row terminal ledger and production decision.

- [ ] Write tests rejecting missing scenarios, unsupported PASS, unresolved P0/P1, absent cleanup, secret-shaped evidence, stale SHA/revision, and non-terminal status.
- [ ] Implement validator; run its tests and `node scripts/qa/certification/verify-evidence.mjs` to PASS.
- [ ] Rerun only authentication/session/permission critical paths, changed surfaces/shared components, prior P0/P1, billing reconciliation, device critical path, and rollback-restoration smoke.
- [ ] Run `npm run verify`, both production dependency audits, and `git diff --check`; require zero failures/vulnerabilities/errors.
- [ ] Commit/push exact candidate and require all Release gate jobs for that SHA to pass.
- [ ] Deploy that SHA through protected staging; verify health revision, manifest/worker, Functions/rules/indexes, provider callbacks, and critical public/authenticated routes.
- [ ] Reconcile all documents and declare ready only if the validator reports zero BLOCKED/FAIL rows and every design acceptance criterion has evidence.

## Plan Self-Review

- All 81 blocked rows are assigned across Tasks 3-10; Tasks 1-2, 11-12 provide catalog, fixtures, repairs, and final proof.
- Established passes/N/A are excluded by catalog test and rerun only after an affecting change or for critical regression.
- Provider and physical-device evidence remain separate and cannot substitute for each other.
- `CERTIFICATION_SCENARIOS` and `buildFixtureCatalog(runSuffix)` are the only shared interfaces introduced by the plan.
- No deferred implementation markers remain; generated element/provider/device values are runtime evidence, not plan gaps.
