# Complete Application Audit Continuation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk remaining audit evidence gaps, repair reproducible repository defects, and update the master report without claiming blocked provider or durable-identity workflows passed.

**Architecture:** Treat `qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md` as the coverage ledger. Browser work uses isolated demo or existing QA identities, source reviews trace frontend actions through API authorization and persistence, and every safe repair follows a focused red-green regression cycle.

**Tech Stack:** Next.js 15, React, TypeScript, Firebase Auth/Firestore/Storage, Node test runner, Firebase emulators, in-app Browser.

## Global Constraints

- Preserve existing dirty-worktree changes and never mutate real customer data.
- Do not send live email, push notifications, payments, refunds, or destructive production operations.
- Record unavailable credentials, devices, identities, or undeployed fixes as `BLOCKED`, not `PASS`.
- Use browser evidence for user-visible workflows and automated tests for deterministic policy, validation, and data-isolation contracts.

---

### Task 1: Remaining Coverage Inventory

**Files:**
- Modify: `qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md`
- Reference: `FEATURES.md`, `qa-audit/QA_CHECKLIST_2026-08-10.md`, `qa-audit/MANUAL_TEST_PLAN.md`

- [ ] Map every partial, open, manual-review, and blocked item to a browser, source, automated, or provider-dependent verification path.
- [ ] Separate executable work from credentials/device/deployment blockers.
- [ ] Record agent ownership so independent reviews do not overlap.

### Task 2: Authenticated Administration and Role Workflows

**Files:**
- Test: `tests/dashboard-route-policy.test.mjs`
- Test: `tests/account-*.test.mjs`
- Modify only when a reproduced defect identifies a specific source file.

- [ ] Inspect the existing signed-in browser tabs and verify whether a Super Admin session is available.
- [ ] Exercise admin navigation, user/account controls, plan management, validation, cancellation, refresh, and direct-route permission behavior with safe QA data.
- [ ] Exercise available demo roles against restricted direct URLs and responsive layouts.
- [ ] For each defect, reproduce, trace the policy/data path, add a failing test, implement the minimal fix, and rerun related policy tests.

### Task 3: Public Portals and Cross-Surface Workflows

**Files:**
- Test: `tests/public-portals.test.mjs`
- Test: `tests/public-production-readiness.test.mjs`
- Test: `tests/competition-workflows.test.mjs`

- [ ] Open every public portal family with valid demo fixtures where available.
- [ ] Check empty, invalid, inactive, and malformed-link states without submitting real payments or notifications.
- [ ] Verify responsive containment, visible error feedback, navigation, refresh behavior, and console/network failures.
- [ ] Trace any discrepancy through public DTO projection, action route validation, and persisted source records before fixing.

### Task 4: Independent Domain Reviews

**Files:**
- Read-only by default; agents must report exact file/line evidence.
- Tests and production files may be changed only after a confirmed reproducible defect and a focused failing test.

- [ ] League/tournament specialist reviews remaining lifecycle, registration, forms, scoring, and public workflow gaps.
- [ ] Role/permission specialist reviews UI-policy-server consistency for every account and team-local role.
- [ ] Defensive API specialist reviews authentication, authorization, input bounds, projections, uploads, sessions, webhooks, and tenant isolation.
- [ ] Primary agent independently reviews every proposed change and reruns its verification.

### Task 5: Master Report and Regression Gate

**Files:**
- Modify: `qa-audit/MASTER_APPLICATION_AUDIT_2026-08-16.md`
- Modify: relevant focused test files for repaired defects.

- [ ] Add tested workflows, roles, browser evidence, findings, root causes, fixes, blocked reasons, and remaining manual review.
- [ ] Run focused regressions for every repaired defect.
- [ ] Run `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint -- --quiet`, `npm run build`, `npm --prefix functions run build`, and `git diff --check`.
- [ ] Confirm all agent changes are reviewed and no required process remains running.
