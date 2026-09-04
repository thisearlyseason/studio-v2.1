# Task 3 Identity Certification Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the shared loopback-only local certification runner, execute the exact 11 Task 3 scenarios through its identity slice, and record only fresh observations while preserving explicit staging, mailbox, and background blockers.

**Architecture:** Pure selection and evidence modules validate frozen scenario ownership and result completeness. A lifecycle harness delegates one uniquely scoped execution to the existing Phase 2 emulator/browser runner so Firebase, Next, credentials, provider shields, and cleanup remain single-owned rather than copied. The identity batch translates only exact successful legacy assertions into local observations and leaves every omitted or external dimension blocked.

**Tech Stack:** Node.js ESM and `node:test`, Firebase Auth/Firestore/Storage emulators, Next.js 15, Playwright CLI, Markdown/JSON evidence.

**Spec:** `docs/superpowers/specs/2026-09-04-final-production-certification-design.md`

## Global Constraints

- Source of truth is `docs/qa/production-audit/05-coverage-matrix.md` at commit `77da392b`.
- Own exactly the 11 Task 3 scenario IDs in frozen coverage-matrix order.
- Production remains read-only; local destructive work uses loopback-only `demo-*` Firebase projects.
- Every inherited outbound credential is cleared and `AUDIT_OUTBOUND_PROVIDER_MODE=block` remains enforced.
- The local runner never emits final `PASS`; valid states are `OBSERVED`, `NOT_OBSERVED`, `BLOCKED_PRECONDITION`, and `FAIL`.
- Browser sessions and child processes close in `finally`; cleanup is exact and idempotent.
- Evidence contains aliases and redacted paths only, never passwords, tokens, cookies, action URLs, raw provider payloads, or personal data.

---

### Task 1: Freeze Task 3 selection and CLI behavior

**Files:**
- Create: `tests/local-certification-selection.test.mjs`
- Create: `scripts/qa/certification/local/selection.mjs`

**Interfaces:**
- Consumes: `CERTIFICATION_SCENARIOS` from `scenario-catalog.mjs`.
- Produces: `SCENARIO_BATCH_ASSIGNMENTS`, `parseLocalBatchArgs(argv)`, `selectLocalScenarios(options)`, and `groupScenariosByBatch(scenarios)`.

- [ ] Write failing tests for the exact 11 IDs, catalog order, lifecycle cleanup-owner preservation, exclusion of adjacent Administration and established Dashboard rows, positional `identity`, explicit selectors, deduplication, and selector errors.
- [ ] Run `node --import tsx --test tests/local-certification-selection.test.mjs` and confirm the missing-module failure.
- [ ] Implement the immutable assignment map and pure parser/selector.
- [ ] Rerun the focused test and confirm zero failures.

### Task 2: Enforce redacted evidence contracts

**Files:**
- Create: `tests/local-certification-evidence.test.mjs`
- Create: `scripts/qa/certification/local/evidence.mjs`

**Interfaces:**
- Consumes: selected frozen scenarios and per-case observations.
- Produces: `createEvidenceRecorder(options)`, validated `ScenarioResult` objects, `results.json`, and a sanitized Markdown summary.

- [ ] Write failing tests proving one result per selected ID, all seven dimensions, no final `PASS`, explicit omitted browser/mailbox/staging/background blockers, required cleanup metadata, and secret/query/action-link rejection.
- [ ] Run `node --import tsx --test tests/local-certification-evidence.test.mjs` and confirm the missing-module failure.
- [ ] Implement recursive secret-shape validation, observation-state validation, result reconciliation, atomic artifact writing, and Markdown rendering.
- [ ] Rerun the focused test and confirm zero failures.

### Task 3: Add the single-owned local lifecycle seam

**Files:**
- Create: `tests/local-certification-harness.test.mjs`
- Create: `scripts/qa/certification/local/harness.mjs`
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`

**Interfaces:**
- Consumes: root directory, unique lowercase run suffix, optional Playwright wrapper, and injected process runner.
- Produces: `startLocalHarness(options)` with `runLegacyIdentityAudit()` and idempotent `close()`.

- [ ] Write failing tests for `demo-*` and loopback enforcement, unique run/session prefixes, credential stripping, redaction, one execution, failure-safe cleanup, and browser-wrapper refusal.
- [ ] Run `node --import tsx --test tests/local-certification-harness.test.mjs` and confirm the missing-module failure.
- [ ] Implement the guarded harness and parameterize the compatibility runner through sanitized environment variables without changing its default Phase 2 behavior.
- [ ] Add a `--certification-identity` compatibility mode that runs API identity checks plus the existing login, blocked-state, logout, protected-return, role-landing, responsive, console, and network checks in one emulator lifecycle.
- [ ] Rerun harness plus existing Phase 2 audit tests and confirm zero failures.

### Task 4: Add the Playwright adapter contract

**Files:**
- Create: `tests/local-certification-browser.test.mjs`
- Create: `scripts/qa/certification/local/browser.mjs`

**Interfaces:**
- Consumes: injected command runner, loopback base URL, run ID, alias resolvers, and artifact directory.
- Produces: `createBrowserClient(options)` with named sessions, viewport-aware observations, redacted network records, and idempotent `closeAll()`.

- [ ] Write failing tests for `cert-<run>-identity-` naming, exact `1440x900` and `390x844` viewports, query/header/credential redaction, route mismatch, explicit expected-4xx allowlists, unexpected 5xx/application errors, and close-all in failure paths.
- [ ] Run `node --import tsx --test tests/local-certification-browser.test.mjs` and confirm the missing-module failure.
- [ ] Implement the adapter without using DOM-triggered clicks for clickability evidence.
- [ ] Rerun the focused test and confirm zero failures.

### Task 5: Implement conservative identity scenario reconciliation

**Files:**
- Create: `tests/local-certification-identity.test.mjs`
- Create: `scripts/qa/certification/local/batches/identity.mjs`

**Interfaces:**
- Consumes: the selected 11 scenarios, legacy assertion labels, browser capability, and evidence recorder.
- Produces: exactly one `ScenarioResult` per selected ID in catalog order.

- [ ] Write failing tests proving all 11 IDs return once, blocked-state evidence precedes lifecycle mutation, lifecycle retains `background-batch`, successful legacy labels map only to their supported local dimensions, missing local cases remain `NOT_OBSERVED`, external environments remain `BLOCKED_PRECONDITION`, failures stop further mutation, and cleanup still runs.
- [ ] Run `node --import tsx --test tests/local-certification-identity.test.mjs` and confirm the missing-module failure.
- [ ] Implement literal case requirements for each owned scenario without cloning or modifying the frozen fixture catalog.
- [ ] Rerun the focused test and confirm zero failures.

### Task 6: Wire the command and generate strict evidence

**Files:**
- Create: `scripts/qa/certification/run-local-batches.mjs`
- Modify: `package.json`
- Create: `docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`
- Modify only if fully supported: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify only if a defect is reproduced: `docs/qa/production-audit/07-defect-ledger.md`

**Interfaces:**
- Consumes: parser, selector, harness, identity batch, and evidence recorder.
- Produces: `npm run qa:certify-local -- --batch identity --browser`, JSON artifacts, sanitized Markdown, and a nonzero exit only for runner/FAIL conditions.

- [ ] Write entrypoint tests through the pure `main(argv, dependencies)` boundary for list, no-selector, browser precondition, `finally`, summary write, and scenario-filter execution.
- [ ] Run the entrypoint-focused tests and confirm the expected failures.
- [ ] Implement the entrypoint and package script.
- [ ] Run `PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --batch identity --browser` and retain the fresh sanitized summary.
- [ ] Update only rows whose complete frozen local, staging, mailbox, background, persistence, responsive, console/network, and cleanup contract is supported; otherwise leave `BLOCKED` and record the precise remaining dimensions in `02-identity.md`.

### Task 7: Verify and commit

**Files:**
- Create: `.superpowers/sdd/2026-09-04-final-production-certification/task-3-report.md`

**Interfaces:**
- Consumes: fresh command outputs, evidence summary, matrix/ledger diff, and cleanup result.
- Produces: Task 3 report and commit `qa: complete identity certification batch`.

- [ ] Run the five focused local-certification test files plus retained account/auth/policy/invite/public/email/Phase 2/catalog/fixture regressions.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, the exact browser identity batch, and `git diff --check`.
- [ ] Scan tracked Task 3 outputs for secret-shaped values and off-loopback targets; verify no browser sessions or managed child processes remain.
- [ ] Write the report with red/green evidence, scenario outcomes, bugs/fixes, blockers, cleanup, commands, files, and the pending commit SHA marker.
- [ ] Commit all tracked Task 3 changes with the exact required message, then replace the report marker with the resulting SHA only if doing so does not require amending the evidence commit; otherwise report the SHA externally.
