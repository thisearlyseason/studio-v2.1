# Final Production Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete every production-readiness test that can be proved safely with the current emulator, staging, provider, and physical-device evidence; fix reproduced defects test-first; and leave every irreducible external dependency explicitly BLOCKED.

**Architecture:** Treat `docs/qa/production-audit/05-coverage-matrix.md` as the test-selection authority. Preserve the six established PASS rows unless a shared change requires focused regression, use the loopback Firebase fixture pack for destructive/role/tenant browser work, use staging only for non-destructive hosted checks, and record evidence without secrets.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Auth/Firestore/Storage emulators, Firebase App Hosting staging, Playwright CLI, Node test runner, Stripe test mode, Resend QA delivery, standards Web Push.

**Spec:** `docs/superpowers/specs/2026-08-21-production-readiness-audit-design.md`; current execution authority is `docs/qa/production-audit/05-coverage-matrix.md` plus the user's 2026-09-04 remaining-only Playwright request.

## Global Constraints

- Do not retest an established PASS unless a later change affects it or final critical regression requires it.
- The current six PASS rows are homepage navigation/pricing/demos; audience/sport/safety/how-to/legal; active-team switching; alerts/history; public resource/download; and schedule companion.
- Retest only the schedule companion from that set because the shared root service worker changed after its PASS.
- Use only loopback emulators for destructive, concurrency, role-state, and cross-tenant mutations.
- Keep production read-only and do not deploy production.
- Do not print or persist passwords, cookies, tokens, provider keys, action links, or private payloads.
- Do not send external email, provider transactions, or push messages to new recipients without an already approved safe fixture.
- Use Playwright CLI snapshots before ref-based interaction and resnapshot after navigation or major UI changes.
- Every row must finish as PASS, FAIL, BLOCKED, or NOT APPLICABLE; partial evidence remains BLOCKED.
- A defect fix requires systematic root-cause investigation, a failing regression test, the minimal fix, focused Playwright retest, and related regression.

---

### Task 1: Freeze the remaining-only baseline

**Files:**
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/00-environment.md`
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/01-selection.md`

**Interfaces:**
- Consumes: current branch, coverage matrix, defect ledger, prior run evidence, CI and staging health.
- Produces: exact SHA, environment/tool state, six excluded PASS rows, 81 incomplete rows grouped by executable versus external blocker.

- [ ] **Step 1: Record the exact branch and tool baseline**

Run `git status --short --branch`, `git rev-parse HEAD`, `node --version`, `npm --version`, and `command -v npx`.

- [ ] **Step 2: Verify the existing automated baseline**

Run `npm test`. Expected: all application tests pass before browser expansion; any failure is investigated before continuing.

- [ ] **Step 3: Probe configuration by presence only**

Run `npm run verify:env` and inspect staging `/api/health`, `/manifest.json`, and `/sw.js` without printing secret values. Missing production-only variables are recorded as blockers, not repaired with production credentials.

- [ ] **Step 4: Write the selection record**

List the six excluded PASS rows, the one retired row, the service-worker-dependent companion regression, and each remaining test batch selected from the 81 BLOCKED rows.

### Task 2: Expand and execute remaining identity and permission browser coverage

**Files:**
- Modify when required: `scripts/qa/seed-phase2-emulator-fixtures.mjs`
- Modify when required: `scripts/qa/run-phase2-emulator-audit.mjs`
- Test: `tests/phase2-emulator-fixtures.test.mjs`
- Test: `tests/phase2-emulator-audit.test.mjs`
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/identity-permissions.md`

**Interfaces:**
- Consumes: sixteen existing loopback identities, two isolated teams, Auth/Firestore/Storage emulators.
- Produces: browser evidence for valid/invalid login, protected return paths, logout/multi-tab, account-state denial, every available global role landing, direct restricted routes, and owner/staff/member/parent/player/superadmin boundaries.

- [ ] **Step 1: Add only missing fixture/audit behavior test-first**

Before changing the harness, name the browser behavior a production regression would break, add a focused assertion to the relevant Node test, and run it to observe the expected failure.

- [ ] **Step 2: Implement the minimal harness/fixture support**

Add only the identities or deterministic records required by the selected matrix rows; keep the demo-project and loopback refusal guards intact.

- [ ] **Step 3: Run focused harness tests**

Run `node --import tsx --test tests/phase2-emulator-fixtures.test.mjs tests/phase2-emulator-audit.test.mjs`.

- [ ] **Step 4: Drive the role and permission journeys with Playwright CLI**

Run `PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:audit-emulator -- --browser` after extending its remaining-only mode. Capture desktop and 390x844 results, console errors, page errors, and unexpected 4xx/5xx responses.

### Task 3: Execute remaining team, family, content, and communication workflows

**Files:**
- Modify when required: the same loopback seeder and browser harness
- Test: the matching focused Node regression file before each production fix
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/application-workflows.md`

**Interfaces:**
- Consumes: owner, assistant, member, parent, adult/youth player, outsider, and two-tenant fixtures.
- Produces: real-browser results for remaining navigation, forms, validation, CRUD, persistence, search/filter, dialogs, messaging, uploads/downloads where safe, and direct permission denials.

- [ ] **Step 1: Test team and roster surfaces**

Exercise first-team/quota-safe behavior, join-role derivation, profile/settings, module visibility, roster lifecycle/search/export, facilities, and equipment with the correct owner/staff/member roles. Destructive operations stay emulator-only.

- [ ] **Step 2: Test family and compliance surfaces**

Exercise parent/player/youth views, recruiting public/private projections, files, waivers, and incident access using synthetic records and identifier substitution.

- [ ] **Step 3: Test schedules and communication**

Exercise event validation/CRUD/RSVP, calendar filtering, practice/drill views, feed/chat/poll persistence and audience denial, plus the service-worker-dependent schedule companion regression.

- [ ] **Step 4: Record exact partial boundaries**

Rows lacking a complete provider, device, role, persistence, or negative dimension remain BLOCKED with the newly completed evidence appended.

### Task 4: Execute remaining competition, commerce, public, and administration coverage

**Files:**
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/competition-commerce-admin.md`
- Modify: coverage and defect documents only after evidence is captured

**Interfaces:**
- Consumes: currently available emulator roles/data, staging public routes, existing Stripe/Resend evidence, and exact deployed staging revision.
- Produces: safe browser/API evidence and explicit provider/fixture blockers.

- [ ] **Step 1: Exercise league/tournament UI and safe validation**

Use emulator fixtures for creator/staff/registrant/scorekeeper/referee routes where supported; test empty/invalid inputs, direct unauthorized routes, persistence, and public projections. Missing full format/bracket fixtures stay BLOCKED.

- [ ] **Step 2: Exercise commerce and public participation without live money**

Test pricing/checkout validation, owner versus non-owner routes, fundraising/volunteer/public portal validation, and private-field exclusion. Do not create real payments or use live provider mode.

- [ ] **Step 3: Exercise administration with trusted and fake claims**

Test all admin sections at 1440x900 and 390x844, direct API denial for ordinary roles, form validation, and absence of horizontal overflow or console/5xx failures.

- [ ] **Step 4: Reconcile provider evidence**

Retain previously proven Stripe Connect and one Resend verification delivery; test only still-available safe cases. Missing full checkout, subscription, signed Resend callback, and durable mailbox/device cases remain BLOCKED.

### Task 5: Cross-browser and hosted regression for affected critical paths

**Files:**
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/experience-hosted.md`
- Store artifacts: `output/playwright/2026-09-04T170500Z/`

**Interfaces:**
- Consumes: browser journeys completed in Tasks 2-4 and final staging revision.
- Produces: Chromium, Firefox, and WebKit evidence where engines support the path, plus hosted health/manifest/worker confirmation.

- [ ] **Step 1: Run critical remaining journeys in Chromium**

Cover authentication/permission-critical routes, changed workflows, previous P1 fixes, and newly discovered defects only.

- [ ] **Step 2: Run focused Firefox and WebKit smoke**

Repeat only critical public/authentication paths and fixes likely to vary by engine. Record unsupported authenticated/device behavior as BLOCKED.

- [ ] **Step 3: Verify responsive and console/network results**

Use desktop and mobile viewports for every newly completed user-facing row; record console errors, page errors, failed requests, and unexpected statuses.

### Task 6: Fix reproduced defects and rerun affected coverage

**Files:**
- Modify: only the exact source files implicated by root-cause evidence
- Test: a focused behavioral regression selected for each defect
- Modify: `docs/qa/production-audit/07-defect-ledger.md`

**Interfaces:**
- Consumes: reproducible FAIL evidence.
- Produces: stable bug ID, red-green test, minimal repair, exact Playwright retest, and adjacent permission/shared-component regression.

- [ ] **Step 1: Reproduce and locate the failing boundary**

Trace UI, API, authorization, database, and provider boundaries before proposing a code change.

- [ ] **Step 2: Complete the TDD cycle**

Write and run the failing test, implement the minimal root-cause repair, rerun focused tests, and then rerun the exact browser journey and affected neighbors.

- [ ] **Step 3: Commit code and evidence separately where practical**

Do not bundle unrelated repairs.

### Task 7: Final verification and production-readiness decision

**Files:**
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md`
- Modify: `docs/qa/production-audit/08-final-report.md`
- Create: `docs/qa/production-audit/runs/2026-09-04T170500Z/09-final-results.md`

**Interfaces:**
- Consumes: all fresh browser, API, automated, provider, device, and blocker evidence.
- Produces: one terminal status per row, exact totals, unresolved risks, and a release recommendation.

- [ ] **Step 1: Reconcile all 88 rows and 24 critical journeys**

Keep PASS only where happy, negative, permission, persistence, console/network, and applicable responsive evidence is complete.

- [ ] **Step 2: Run the final regression gate**

Run focused Playwright checks for critical journeys, changed features, shared components, previous P0/P1 defects, authentication, and permission boundaries. Then run `npm run verify`, `npm audit --omit=dev --audit-level=high`, and `npm --prefix functions audit --omit=dev --audit-level=high`.

- [ ] **Step 3: Verify repository and hosted evidence**

Run `git diff --check`, inspect `git status --short --branch`, verify the exact GitHub release gate, and confirm staging health/manifest/worker. Production remains unchanged.

- [ ] **Step 4: Publish the final evidence**

Report what was previously complete, what was newly tested, roles completed, pass/fail/block totals, defects found/fixed, production build result, unresolved requirements, and whether the app is production ready.

## Plan self-review

- Spec coverage: all 88 matrix rows remain represented; six established PASS rows are excluded except the service-worker-dependent companion regression, and the retired Time Out row stays NOT APPLICABLE.
- Placeholder scan: every task uses the fixed run ID `2026-09-04T170500Z`; no unfinished implementation placeholders are present.
- Type consistency: role abbreviations, status values, audit paths, and existing harness/script names match the current repository.
