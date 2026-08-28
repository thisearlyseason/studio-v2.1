# Phase 9 Terminal Recovery Finalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the original sanitized lifecycle failure when terminal-certificate handling also fails, and safely finalize one exact locally cleaned closure checkpoint without rerunning hosted browser or fixture mutations.

**Architecture:** Version the terminal certificate so its wrapper category is separate from immutable closed-enum primary failure attribution. Add a recovery-only module and CLI command that validates a held exact checkpoint plus a private cleaned manifest, zeroizes only the held credential inode, retains the exact workspace in place as the recovery quarantine, then promotes the result to terminal `failed`; it constructs no provider adapter and cannot seed, browse, transition, rename, or delete.

**Tech Stack:** Node.js ESM, descriptor-bound filesystem APIs, the existing Python dirfd certificate helper, Node test runner, Markdown audit records.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-9-core-identity-authorization-verification-design.md`

## Global Constraints

- Never inspect credential contents and never construct a hosted provider adapter during recovery finalization.
- Recovery accepts only lexically absolute normalized exact result/workspace/manifest/credential paths, with manifest and credential as the two exact workspace children.
- The result remains browser-inconclusive: terminal status is `failed`, evidence is `{ rows: 0, written: false }`, and it can never become evidence PASS.
- New hosted runs always capture a closed-enum `primaryCategory` and `primaryStage` before any certificate write.
- `legacy-primary-unavailable` is accepted only while migrating a valid version-1 closure checkpoint that has no primary attribution.
- Any identity, schema, zeroization, or publication uncertainty fails closed without renaming, unlinking, removing, or modifying a foreign path or falsely promoting the certificate.
- No hosted lifecycle, provider mutation, staging navigation, push, deployment, merge, or production operation is permitted.

---

### Task 1: Immutable primary failure attribution

**Files:**
- Modify: `scripts/qa-evidence/phase9/lifecycle-guardian.mjs`
- Modify: `scripts/qa-evidence/phase9/terminal-certificate-writer.mjs`
- Modify: `scripts/qa-evidence/phase9/cli.mjs`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Consumes: the guardian's existing closed failure-category set and ordered lifecycle states.
- Produces: failure summaries and certificate v2 documents with `primaryCategory` and `primaryStage`, distinct from the outer `category`.

- [x] **Step 1: Write RED tests** proving an injected primary `scenario-failed` followed by checkpoint failure returns outer `terminal-certificate-failed` while retaining `primaryCategory: scenario-failed`, `primaryStage: inspected`, and exact history. Prove arbitrary primary strings/stages and missing attribution in new v2 documents are rejected.
- [x] **Step 2: Run focused tests** with `node --import tsx --test --test-name-pattern="primary attribution|certificate checkpoint recovery history" tests/phase9-browser-evidence.test.mjs`; expect assertion/schema failures.
- [x] **Step 3: Implement minimal attribution** by capturing the original recovery category/stage before certificate handling, carrying it through failure summaries, and emitting only validated v2 fields. Permit `legacy-primary-unavailable` only in an explicit v1-to-v2 migration function.
- [x] **Step 4: Run focused GREEN** and confirm no raw error, run ID, UID, session, or path is serialized.

### Task 2: Exact local recovery finalizer

**Files:**
- Create: `scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs`
- Modify: `scripts/qa-evidence/phase9/terminal-certificate-writer.mjs`
- Modify: `scripts/qa-evidence/phase9/cli.mjs`
- Modify: `package.json`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Consumes: `createPhase9TerminalCertificateWriter`, exact manifest validation, and the pinned descriptor-bound zeroization helper.
- Produces: `finalizePhase9TerminalRecovery({ resultPath, workspacePath, manifestPath, credentialPath, repositoryRoot, evidenceDirectory, filesystem })` returning a sanitized `{ ok, command, status, category, primaryCategory, primaryStage, rows }`.

- [x] **Step 1: Write RED tests** for a valid cleaned 20/82/1 checkpoint, dirty/forged manifest rejection, wrong child paths, symlinks/modes/ownership, foreign child/workspace swaps, credential zeroization failure, final promotion failure, and idempotent identity-bound replay of a terminal failed result. Assert the adapter/provider construction sentinel remains zero in every case.
- [x] **Step 2: Run focused tests** with `node --import tsx --test --test-name-pattern="terminal recovery" tests/phase9-browser-evidence.test.mjs`; expect missing export/command failures.
- [x] **Step 3: Implement held-identity admission** for the result parent/checkpoint and workspace/manifest/credential. Parse the manifest through `validateManifest`, require v3, staging project, state `cleaned`, exact unique counts 20/82/1, and consistency with the certificate's exact closure facts.
- [x] **Step 4: Implement in-place zeroization and promotion**: publish a v3 closure-pending identity commitment first; use the pinned descriptor-bound helper to zeroize only the held exact credential inode with truncate/data-sync/full-sync; if a crash leaves size zero before that checkpoint, retry the helper's sync and same-inode verification instead of inferring durability from size. Retain the exact manifest and workspace in place. Before every checkpoint, perform two complete named+held identity, exact two-entry inventory, manifest-byte/hash, and zero-length credential passes, with the final pass after each held manifest read. Promote to terminal `failed` with rows zero and retained deployment/primary attribution. Removal flags and original-path absence remain false. Return one sanitized failure on uncertainty.
- [x] **Step 5: Wire CLI/help/package** as `recover-terminal` with exact flags `--result`, `--workspace`, `--manifest`, and `--credentials`; reject unsupported flags before filesystem mutation and do not import/construct the Firebase adapter.
- [x] **Step 6: Run focused GREEN**, including injected failures and idempotent replay.

### Task 3: Audit contract, verification, and bounded recovery

**Files:**
- Modify: `docs/superpowers/specs/2026-08-25-phase-9-core-identity-authorization-verification-design.md`
- Modify: `docs/superpowers/plans/2026-08-25-phase-9-core-identity-authorization-verification.md`
- Modify ignored: `.superpowers/sdd/2026-08-25-phase-9-core-identity-authorization-verification/task-7-report.md`
- Modify ignored: `.superpowers/sdd/2026-08-25-phase-9-core-identity-authorization-verification/progress.md`

**Interfaces:**
- Consumes: Tasks 1-2 and the preserved checkpoint/workspace pair.
- Produces: reviewed implementation commit and, only after independent review, an exact local recovery invocation record.

- [x] **Step 1: Update the spec and main Phase 9 plan** with the primary/outer category distinction, terminal-failed recovery semantics, pre-adapter rule, exact cleaned-manifest admission, and no-PASS invariant.
- [x] **Step 2: Run full verification**: focused recovery tests, full Phase 9, fixture/identity/hygiene, `npm run verify`, deterministic builds twice, dry-run `44 = 40 + 4`, stripped-environment offline smoke, exact zero browser/process/profile scans, and secret/path hygiene scans.
- [ ] **Step 3: Commit bounded changes** and request independent review of the exact commit; do not recover the preserved workspace yet.
- [ ] **Step 4: After review approval only**, invoke `recover-terminal` against `/private/tmp/phase9-terminal-result.HCvd7inM/result.json`, `/private/tmp/phase9-core-identities.wUGO9w7f`, and its exact two children. Verify the workspace and manifest remain exact, the held/named credential inode is zero length, and the certificate is terminal `failed`, rows-zero, identity-bound, and truthful about non-removal. Do not call the provider.
