# Phase 4 Independent Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently verify the finished Phase 3 state at commit `c3177f29188191e642a172e4928cc2391991e80b`, reassess every remaining blocked dependency, and publish an evidence-backed Phase 4 verdict without changing production or overstating coverage.

**Architecture:** Preserve the Phase 3 commit as an immutable baseline and collect Phase 4 evidence in a new run record. A controller owns environment checks, evidence hygiene, status reconciliation, and the final report; an independent verifier owns focused source/test/browser replay for BUG-001 and BUG-002 plus the blocker assessment. Any newly reproduced defect stops reconciliation and enters the existing diagnosis/TDD workflow before application code changes.

**Tech Stack:** Git, Node.js 24, Next.js 15, TypeScript, Vitest, Node test runner, Firebase emulators, Playwright CLI with Chromium, Markdown audit records.

**Spec:** `docs/superpowers/specs/2026-08-21-production-readiness-audit-design.md`

## Global Constraints

- Do not merge, push, deploy, or mutate production/provider data.
- Use only local emulators, anonymous demo data, or confirmed isolated non-production fixtures for writes.
- Never record passwords, tokens, cookies, API keys, webhook secrets, service-account JSON, action links, or real personal information.
- Do not retain raw network traces; retain sanitized summaries and screenshots only after a credential-keyword review.
- Keep all coverage rows `BLOCKED` unless every required happy, negative, permission, persistence, console, network, and responsive check has fresh Phase 4 evidence.
- Do not claim the SaaS or release is Production Ready.
- If a new defect is reproduced, use `superpowers:systematic-debugging` and `superpowers:test-driven-development` before any authorized application change.

---

### Task 1: Establish the immutable Phase 4 baseline

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/00-environment.md`
- Create: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/01-blocker-assessment.md`

**Interfaces:**
- Consumes: Phase 3 HEAD `c3177f29188191e642a172e4928cc2391991e80b`, `package.json`, `scripts/check-production-env.mjs`, and `06-test-account-requirements.md`.
- Produces: exact commit, clean-state evidence, gate results, available browser engines, and a value-free fixture availability table for later tasks.

- [ ] **Step 1: Record repository isolation and baseline**

Run:

```bash
git rev-parse HEAD
git branch --show-current
git status --porcelain=v1 --untracked-files=all
git diff --check cc9a3c7c..HEAD
```

Expected: HEAD begins at `c3177f29`, the branch is `agent/phase4-independent-verification`, tracked state is clean except the Phase 4 plan/run documents being authored, and the complete audit range has no whitespace errors.

- [ ] **Step 2: Run the exact-commit release gates**

Run:

```bash
npm run verify
```

Expected: typecheck, lint, 387 Node tests, 2 rendered component tests, 38 rules tests, the Next.js build, and the Functions build pass. Existing lint warnings are counted but are not silently reclassified as new errors.

- [ ] **Step 3: Assess environment configuration without reading values**

Run:

```bash
npm run verify:env
```

Expected: either PASS or a list of missing/invalid variable names only. Never print or inspect the values. Record each missing category—hosted Firebase, Stripe/Connect, Resend, FCM, calendar, internal API, notification owner—as unavailable when its required names fail.

- [ ] **Step 4: Inventory browser and fixture availability**

Use `playwright-cli` discovery to record Chromium, Firefox, and WebKit availability. Confirm only whether the named identity, tenant, provider, device, and destructive fixtures in `06-test-account-requirements.md` have an authorized opaque reference; do not search for credentials or reconstruct historical accounts.

Expected: every fixture has `AVAILABLE`, `UNAVAILABLE`, or `NOT AUTHORIZED` plus a non-secret reason and owner. Unknown historical labels remain unavailable.

- [ ] **Step 5: Commit baseline records**

```bash
git add docs/superpowers/plans/2026-08-23-phase-4-independent-verification.md docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/00-environment.md docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/01-blocker-assessment.md
git commit -m "qa: establish Phase 4 verification baseline"
```

### Task 2: Independently reverify BUG-001

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md`
- Create: `output/playwright/2026-08-23-phase4-c3177f29/bug-001/event-delete-confirmation.png`
- Test: `tests/preview-regressions.test.mjs`
- Test: `tests/components/phase-3-repairs.test.tsx`

**Interfaces:**
- Consumes: the event deletion implementation, local anonymous Squad Pro demo, and Phase 3 regressions.
- Produces: independent source, automated, rendered, browser, persistence, console, and request-count evidence for BUG-001.

- [ ] **Step 1: Review the implementation independently**

Inspect `EventDetailDialog.tsx`, `EventDeleteConfirmation.tsx`, and the two regression files. Confirm the initial delete action cannot invoke the mutation, the dialog names the event, Cancel does not invoke deletion, Confirm invokes once per open cycle, and reopening permits one new confirmation.

- [ ] **Step 2: Run focused regressions**

```bash
node --import tsx --test --test-name-pattern="event deletion requires" tests/preview-regressions.test.mjs
npx vitest run tests/components/phase-3-repairs.test.tsx -t "requires explicit confirmation"
```

Expected: both focused checks pass from a fresh process.

- [ ] **Step 3: Replay the browser flow in a fresh demo session**

At 390×844 and 1440×900, create a uniquely named future event, open delete, verify zero event-action requests before confirmation, Cancel and reload to prove persistence, reopen, Confirm once, and reload to prove deletion. Verify keyboard focus enters the alert dialog, Escape/Cancel returns focus, and the destructive control is labelled.

Expected: no pre-confirm mutation, one successful confirm mutation, correct persistence after reload, no duplicate request, no horizontal overflow, and no application console error.

- [ ] **Step 4: Sanitize and record evidence**

Retain only the named screenshot and a Markdown summary containing status codes/counts rather than URLs, headers, cookies, bodies, IDs, or raw trace data. Remove the synthetic demo event if the flow did not delete it.

- [ ] **Step 5: Commit BUG-001 evidence**

```bash
git add docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md output/playwright/2026-08-23-phase4-c3177f29/bug-001/event-delete-confirmation.png
git commit -m "qa: independently verify BUG-001"
```

### Task 3: Independently reverify BUG-002

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-002.md`
- Create: `output/playwright/2026-08-23-phase4-c3177f29/bug-002/sports-hub-390.png`
- Create: `output/playwright/2026-08-23-phase4-c3177f29/bug-002/sports-hub-768.png`
- Create: `output/playwright/2026-08-23-phase4-c3177f29/bug-002/sports-hub-1024.png`
- Create: `output/playwright/2026-08-23-phase4-c3177f29/bug-002/sports-hub-1440.png`
- Test: `tests/public-production-readiness.test.mjs`
- Test: `tests/components/phase-3-repairs.test.tsx`

**Interfaces:**
- Consumes: the Sports Hub header implementation and visitor browser route.
- Produces: independent semantic, responsive, keyboard, navigation, console, and network evidence for BUG-002.

- [ ] **Step 1: Review the implementation independently**

Confirm the full search uses `hidden lg:flex`, the compact search uses one labelled `Button asChild > Link` below `lg`, the surrounding header actions also render as single interactive elements, and no nested interactive control is emitted.

- [ ] **Step 2: Run focused regressions**

```bash
node --import tsx --test --test-name-pattern="Sports Hub keeps compact search" tests/public-production-readiness.test.mjs
npx vitest run tests/components/phase-3-repairs.test.tsx -t "renders accessible responsive header controls"
```

Expected: both focused checks pass from a fresh process.

- [ ] **Step 3: Run the responsive browser matrix**

Open `/sports-hub` at 390×844, 768×1024, 1024×768, and 1440×900. At the first two widths require compact visible/full hidden; at the last two require compact hidden/full visible and full-input width at least 300 px. At every width require `scrollWidth <= clientWidth`, no nested interactive header controls, and a labelled search affordance.

- [ ] **Step 4: Verify keyboard and navigation behavior**

Activate compact search with keyboard Enter and require navigation to `/sports-hub/search`. Submit a full-search query at desktop width and require the expected search route/query. Record application console errors, failed HTTP requests, and any development-only warning separately.

- [ ] **Step 5: Sanitize and commit BUG-002 evidence**

Keep four screenshots and a value-free Markdown summary. Do not retain raw traces, cookies, headers, full request URLs, or response bodies.

```bash
git add docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-002.md output/playwright/2026-08-23-phase4-c3177f29/bug-002
git commit -m "qa: independently verify BUG-002"
```

### Task 4: Reassess all remaining blocked coverage

**Files:**
- Modify: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/01-blocker-assessment.md`
- Create: `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/coverage-reconciliation.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md` only when fresh evidence supports a status change.

**Interfaces:**
- Consumes: all 88 coverage rows, the Phase 4 fixture inventory, automated gate output, and focused BUG verification.
- Produces: exact PASS/FAIL/BLOCKED counts and a one-to-one dependency reason for every row that remains blocked.

- [ ] **Step 1: Recount the matrix mechanically**

Parse only table rows in `05-coverage-matrix.md` and count `PASS`, `FAIL`, `BLOCKED`, `NOT RUN`, and `NOT APPLICABLE` statuses.

Expected starting count: 3 PASS, 2 FAIL, 83 BLOCKED, 0 NOT RUN, and 0 NOT APPLICABLE. Phase 3 bug status does not automatically promote the two matrix rows.

- [ ] **Step 2: Map every blocker to a current missing dependency**

For each blocked row, name the unavailable identity, cross-tenant data, provider sandbox, device/browser, hosted environment, destructive authorization, or operational artifact. Automated/unit/rules evidence may narrow a blocker but cannot replace required role/browser/provider evidence.

- [ ] **Step 3: Execute newly unblocked safe checks**

Run a row only when all named prerequisites are confirmed isolated and authorized. Record the full evidence contract from the design spec. Never use production, real personal data, live Stripe mode, customer recipients, or guessed credentials.

Expected: rows lacking any prerequisite remain `BLOCKED`; fully executed rows become `PASS` or `FAIL`, never inferred PASS.

- [ ] **Step 4: Reconcile BUG-001 and BUG-002 carefully**

Record Phase 4 repair verification in their Notes/evidence, but keep Events and Sports Hub rows blocked if role, permission, timezone/conflict, or authenticated-preference checks remain unavailable.

- [ ] **Step 5: Commit the blocker assessment**

```bash
git add docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/01-blocker-assessment.md docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/coverage-reconciliation.md docs/qa/production-audit/05-coverage-matrix.md
git commit -m "qa: reconcile Phase 4 blocked coverage"
```

### Task 5: Issue the independent Phase 4 verdict

**Files:**
- Create: `docs/qa/production-audit/09-phase4-independent-verification.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md`

**Interfaces:**
- Consumes: Tasks 1–4, independent reviewer findings, cleanup status, and final gates.
- Produces: the Phase 4 verification verdict, exact defect severity counts, remaining blocker counts, evidence links, and next safe release step.

- [ ] **Step 1: Obtain independent review**

Have a verifier who did not implement the repairs review the Phase 3 diff `cc9a3c7c..c3177f29`, the focused tests, fresh browser evidence, blocker mapping, and evidence hygiene. Classify findings as Critical, Important, or Minor and resolve Critical/Important findings before a pass.

- [ ] **Step 2: Update the defect ledger**

Add a Phase 4 independent-verification field to BUG-001 and BUG-002 with the exact tested commit, fresh evidence link, result, and any limitation. Preserve Phase 2 history and Phase 3 status.

- [ ] **Step 3: Write the Phase 4 report**

Include exact commit and environment, gates, both bug verdicts, P0/P1/P2/P3 counts, matrix totals, independent-review findings, fixture/provider/device limitations, cleanup, and one explicit release posture. Unless every critical journey and risk is supported, the posture must remain `NOT READY`.

- [ ] **Step 4: Run evidence-hygiene and consistency checks**

```bash
git diff --check c3177f29..HEAD
rg -n "T[B]D|T[O]DO|implement la[t]er|fill in deta[i]ls" docs/qa/production-audit/09-phase4-independent-verification.md docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29
find output/playwright/2026-08-23-phase4-c3177f29 -type f \( -name '*.trace' -o -name '*.network' -o -name '*.stacks' \)
```

Expected: no whitespace errors, no placeholders, and no raw trace/network/stack files.

- [ ] **Step 5: Run final verification**

```bash
npm run verify
git status --short
```

Expected: all gates pass and only intended Phase 4 evidence/report files are pending.

- [ ] **Step 6: Commit the verdict**

```bash
git add docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/09-phase4-independent-verification.md docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29 output/playwright/2026-08-23-phase4-c3177f29
git commit -m "qa: publish Phase 4 independent verification"
```

## Plan self-review

- Spec coverage: the plan preserves the evidence contract, testing boundaries, status model, independent-domain ownership, cleanup obligations, and exact-commit verification from the approved audit design.
- Placeholder scan: runtime values are fixed to the Phase 4 run ID and baseline commit; no implementation placeholder remains.
- Type/name consistency: BUG IDs, status names, run paths, viewport dimensions, test commands, and evidence file names are consistent across tasks.
