# Phase 4 Asset Boundary Closure Implementation Plan

> **Required subskill:** Use `superpowers:subagent-driven-development` to execute this plan task-by-task with independent review.

**Goal:** Resolve the final Important Phase 4 review finding without overstating production readiness: either produce safe, fresh evidence for every Sports Hub resource/PDF/video/download boundary case, or demote the row and reconcile every dependent audit total and blocker mapping.

**Architecture:** This is an audit-evidence and documentation closure task. It must not change production behavior unless a newly reproduced product defect requires a separately authorized fix. Browser work uses the existing local synthetic/emulator harness and sanitized artifacts only.

**Tech Stack:** Next.js, Firebase emulators, Playwright CLI/System Chrome, Markdown audit records, Node verification suites.

**Spec:** The binding sources are the Phase 3 prompt, the current Phase 4 audit documents, matrix row `Sports Hub | Resource/PDF/video/download`, and the final scoped review of commit `777bb0b2`.

## Global Constraints

- Preserve the SaaS: no production deployment, production data mutation, external writes, merge, push, or destructive repository operation.
- Use only local synthetic fixtures and emulators for browser execution.
- Never retain credentials, raw traces, raw network captures, cookies, authorization headers, tokens, or private user data. Retained browser artifacts belong under `output/playwright/` and must be sanitized PNGs or text audit summaries.
- A matrix row may remain `PASS` only if every contract named in that row has fresh, reproducible evidence. If a required case depends on an unavailable controlled fixture, mark the row `BLOCKED`, name the exact fixture/account dependency, and reconcile all totals and mappings.
- Do not convert an evidence gap into a product defect without a reproducible product failure.
- Keep the overall release posture `NOT READY` while blocked contracts remain.
- Correct review-history prose and revision labels factually; preserve historical audit evidence.

### Task 1: Close the Sports Hub asset-boundary evidence gap and reconcile the audit

**Files:**

- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md`
- Modify: `docs/qa/production-audit/09-phase4-independent-verification.md`
- Modify: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/public-pass-refresh.md`
- Modify as required for exact reconciliation: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/01-blocker-assessment.md`
- Modify as required for exact reconciliation: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/coverage-reconciliation.md`
- Retain only if useful and sanitized: `output/playwright/phase4-c3177f29/public-pass-refresh/*.png`

**Requirements:**

1. Trace the row contract and existing fixture inventory before browser execution. Explicitly assess the three missing cases: unsafe URL rejection, forced download failure/recovery, and private-asset crossover denial.
2. Execute only cases that can be tested safely with local synthetic data and reversible browser interception. Record tester, UTC timestamp, exact tested revision, viewport/browser, commands or reproducible procedure, observed UI/DOM/network result, and artifact path where applicable.
3. If all three cases are safely executable and pass, retain `PASS` with direct evidence for each. If any required case needs an unavailable controlled unsafe/private asset fixture or identity, demote the row to `BLOCKED`; name the exact dependency and map it once in the blocker assessment. Partial happy-path evidence cannot support `PASS`.
4. Reconcile the 88-row matrix arithmetic, blocker-map cardinality, coverage reconciliation, Phase 4 report, and any other directly dependent totals. Verify the row keys are unique and exactly match their mapped statuses.
5. Explain the retained video-provider screenshot's black surface/red issue indicator using observed provider/DOM/network state, or replace it with a clearer sanitized screenshot if safely available. Do not claim playback usability from a screenshot alone.
6. Correct the Phase 4 report's broad-review history: the prior broad review produced two Important and two Minor findings, and the first scoped re-review left one Important open. Record the outcome of this closure cycle separately.
7. Correct BUG-002 revision wording: `40e82381` is the Sports-Hub-specific application revision; `597b6aac` is the later tested checkout revision for the prior final verification.
8. Run focused document arithmetic/key checks, credential/artifact hygiene checks, `git diff --check`, and the full `npm run verify`. Commit the closure as one coherent commit and leave the worktree clean.

**Expected outcome:** An evidence-honest matrix and Phase 4 report with no unsupported `PASS`. Release posture remains `NOT READY` unless all independently blocked contracts are later executed in an authorized environment.
