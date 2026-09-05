# Task 3 Review Round 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Task 3 local identity certificate report only exact executed cases, safely reconcile all dynamic resources, and exercise every locally safe identity case named by the second review.

**Architecture:** Keep one loopback-only emulator child, but replace scenario-wide inferred evidence with case-scoped assertion records and scenario-scoped browser observations. Add a standalone cleanup registry that registers dynamic resources at creation time and returns measured, postcondition-verified cleanup evidence. Tighten the outer recorder and signal lifecycle so invalid provenance or interruption cannot become a successful certificate.

**Tech Stack:** Node.js ESM, `node:test`, Firebase Auth/Firestore/Storage emulators, Next.js 15, Playwright CLI, TypeScript.

**Spec:** `.superpowers/sdd/2026-09-04-final-production-certification/task-3-review.md`

## Global Constraints

- Production is read-only and local certification must remain loopback-only.
- No Stripe, Resend, push, internal-route, or live Firebase credential may reach the child.
- Frozen scenario and fixture catalogs remain unchanged.
- Staging revision, approved mailbox delivery, and real Function/scheduler proof stay blocked.
- Stop mutations after the first case failure; restoration and exact cleanup still run.
- Evidence contains aliases and sanitized diagnostics, never credentials, tokens, action links, or raw provider payloads.

---

### Task 1: Case-scoped evidence and strict validation

**Files:**
- Modify: `scripts/qa/certification/local/batches/identity.mjs`
- Modify: `scripts/qa/certification/local/evidence.mjs`
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`
- Test: `tests/local-certification-identity.test.mjs`
- Test: `tests/local-certification-evidence.test.mjs`

**Interfaces:**
- Consumes: frozen `scenario.assertions`, `scenario.environments`, and `LOCAL_IDENTITY_CASE_REQUIREMENTS`.
- Produces: case events with unique IDs, exact case-owned assertions, actor aliases, ordered ISO timestamps, and contained artifact paths.

- [ ] **Step 1: Write failing tests** proving successful no-op handlers emit no observed cases, duplicate diagnostics remain representable, case artifacts contain only their case assertions, unsafe artifact values are redacted, and environment/required-case/timestamp/artifact/cleanup inconsistencies reject.
- [ ] **Step 2: Run the two focused test files and verify the new assertions fail for the reviewed reasons.**
- [ ] **Step 3: Add an explicit case recorder.** Its contract is:

```js
await observeCertificationCase({ scenarioId, dimension, caseId, role, tenantAlias }, async () => {
  expectEqual(actual, expected, 'specific assertion');
});
```

The recorder owns a fresh assertion array, refuses zero-assertion success, sanitizes before writing, and emits one event only after the body succeeds.
- [ ] **Step 4: Extend `validateScenarioResults(scenarios, results, { artifactRoot })`** to enforce frozen environment/case contracts, actor provenance, parseable ordered timestamps, observed cleanup for locally observed outcomes, artifact containment, existence, case identity, and proof reconciliation.
- [ ] **Step 5: Run the focused tests until green, then run the evidence mutation checks.**

### Task 2: Dynamic cleanup and interruption safety

**Files:**
- Create: `scripts/qa/certification/local/resource-registry.mjs`
- Modify: `scripts/qa/certification/local/harness.mjs`
- Modify: `scripts/qa/certification/run-local-batches.mjs`
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`
- Test: `tests/local-certification-resource-registry.test.mjs`
- Test: `tests/local-certification-harness.test.mjs`
- Test: `tests/local-certification-runner.test.mjs`

**Interfaces:**
- Produces: `createResourceRegistry({ maxAttempts })` with immediate `register`, all-attempt `cleanup`, bounded retry, postcondition checks, measured counts, residual diagnostics, and claim restoration.
- Produces: harness close timeout/kill escalation and `main` result preserving the first signal code.

- [ ] **Step 1: Write failing tests** for Auth/invite/demo deletion retry, residual reporting, exact claim restoration, measured counters, SIGTERM integration result 143, and an unresponsive child escalated after a bounded timeout.
- [ ] **Step 2: Run the three focused files and verify each failure.**
- [ ] **Step 3: Implement the registry** with resource records shaped as:

```js
registry.register({ id: 'auth:alias', kind: 'deleted', remove, verify });
registry.register({ id: 'claim:alias', kind: 'restored', restore, verify });
const evidence = await registry.cleanup();
```

- [ ] **Step 4: Register every dynamic identity, document/root, invite, player snapshot, claim snapshot, and demo graph immediately after creation; remove every swallowed cleanup failure.**
- [ ] **Step 5: Return measured cleanup evidence once per run, fail on residuals, and preserve cleanup diagnostics alongside the original failure.**
- [ ] **Step 6: Run the focused tests until green.**

### Task 3: Failure sequencing and workflow observers

**Files:**
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`
- Modify: `scripts/qa/certification/local/batches/identity.mjs`
- Test: `tests/phase2-emulator-audit.test.mjs`
- Test: `tests/local-certification-identity.test.mjs`

**Interfaces:**
- Produces: first-failure mutation stop with explicit skipped results and multiple unique diagnostics.
- Produces: named workflow observers that collect console/page errors and unexpected responses across owned tabs, allowlist expected negative statuses, and always detach in `finally`.

- [ ] **Step 1: Write failing tests** for API failure stopping its browser/later scenarios, two diagnostics surviving summary validation, listener removal in the used surface sweep, and injected console/unexpected-response failures during signup, youth activation, and onboarding.
- [ ] **Step 2: Run focused tests and verify RED.**
- [ ] **Step 3: Remove `recordScenarioDimensions`; dispatch case bodies directly and stop normal scenario mutation after the first failure.**
- [ ] **Step 4: Replace `browserSurfaceSweep` sleeps with path/heading/loading-state waits, named listeners, 4xx allowlists, and `finally` listener removal.**
- [ ] **Step 5: Wrap mutation workflows in scenario-scoped observers and attach sanitized observations to their owning cases.**
- [ ] **Step 6: Run focused tests until green.**

### Task 4: Complete the eleven local scenario contracts

**Files:**
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`
- Test: `tests/phase2-emulator-audit.test.mjs`
- Test: `tests/local-certification-identity.test.mjs`

**Interfaces:**
- Consumes: exact case recorder, workflow observer, cleanup registry.
- Produces: one independently supported local observation per required Task 3 case.

- [ ] **Step 1: Add failing contract tests** listing the exact omitted R1 assertions for marketing, login, logout, reset, lifecycle, five-role signup, youth, missing-profile, demo, dashboard, and administration.
- [ ] **Step 2: Run focused tests and verify the omission failures.**
- [ ] **Step 3: Implement public-form visibility/validation/read-boundary checks; login timeout recovery and full form states; open-tab logout/admin revocation/cache denial; expired/wrong-account reset and action UI states.**
- [ ] **Step 4: Implement local lifecycle self-delete, confirmation, clock/purge/fault/retry/reconciliation; signup invalid/abort/provider/privilege attacks; youth cross-role/tenant/relogin coverage.**
- [ ] **Step 5: Implement all missing-profile roles and form/read-failure/privilege cases; two-context demo cross-ID/expiry/retry/reconciliation; full role-plan-state route-policy table; full admin route/rules/revocation/sort/target/mobile checks.**
- [ ] **Step 6: Run each affected scenario with real Playwright, fix only reproduced root causes with a failing regression, and confirm exact dynamic cleanup.**

### Task 5: Immutable-candidate verification and reporting

**Files:**
- Modify: `.superpowers/sdd/2026-09-04-final-production-certification/task-3-report.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md`
- Modify: `docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`

**Interfaces:**
- Produces: an immutable implementation commit followed by exact focused/full browser evidence naming that commit, plus an evidence-only reconciliation commit if required.

- [ ] **Step 1: Run focused unit/regression tests, `npm test`, `npm run typecheck`, and `npm run build`.**
- [ ] **Step 2: Commit the implementation candidate, record its SHA, and do not amend it.**
- [ ] **Step 3: Run affected focused browser scenarios and the exact full 11-scenario browser batch against that SHA.**
- [ ] **Step 4: Validate artifact containment/sanitation, measured cleanup, empty owned-session/process state, scenario outcomes, and exact commit provenance.**
- [ ] **Step 5: Reconcile only the 11 owned matrix rows, report, ledger, and summary. Keep external dimensions blocked and explicitly avoid final certification.**
- [ ] **Step 6: Run documentation/diff checks and commit the evidence reconciliation.**
