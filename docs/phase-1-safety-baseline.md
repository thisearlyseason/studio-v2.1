# Phase 1 — Safety Baseline

**Scope:** Establish a reproducible local baseline before authorization, data, billing, or feature repairs begin. This record intentionally does not alter application behavior, Firestore rules, production data, pricing, or role permissions.

## Branch and rollback point

- Branch: `codex/audit`
- Baseline commit: `30024ae9` (`feat: add real YouTube coaching videos to Sports Hub Video Library`)
- Rollback method: keep all repair work as small, reviewable commits on this branch. A future repair can be reverted with `git revert <repair-commit>` without rewriting history. Do not use destructive resets against shared work.

## Working-tree boundary before Phase 1

The following changes existed before this Phase 1 documentation was added and are not part of this phase:

- `package.json` — requested development port change from 9002 to 9001.
- `package-lock.json` — dependency-lock refresh required to install the clone locally.
- `functions/lib/index.js` and `functions/lib/index.js.map` — generated output refreshed by a local Functions compilation attempt.

## Baseline checks

| Check | Result | Notes |
| --- | --- | --- |
| Root TypeScript | Pass | `npm run typecheck` completed successfully. |
| Root lint | Blocked | `npm run lint` invokes deprecated interactive `next lint`; no ESLint configuration is present. Configure a CI-safe linter in a later tooling-focused change. |
| Root production build | Fail | Build stops because Resend is constructed at module load without `RESEND_API_KEY` in the local environment. This is an email-route repair and remains out of scope for Phase 1. |
| Functions compilation | Blocked | The clone has no installed `functions/node_modules`, so TypeScript cannot resolve Firebase Functions packages. Install and verify Functions dependencies in a dedicated deployment/tooling step. |
| Automated test runner | Missing | Root `package.json` has no `test` script. Existing TestSprite files are not wired into a reproducible local runner. |

## Regression safeguards for later phases

1. Run `npm run typecheck` after each change.
2. Preserve the existing port-9001 preview configuration unless a user explicitly changes it.
3. Do not deploy Firestore rules, Firebase Functions, or App Hosting as part of a local repair without explicit approval.
4. Before any schema- or rule-changing phase, create and verify a production export/backup and record its location outside this repository.
5. Keep generated output changes separate from source changes and verify whether Functions deployment compiles from `functions/src`.

## Deferred issues

The audit findings on tenant isolation, permissions, payments, account deletion, APIs, and timezones are intentionally deferred to their approved repair phases. This document is a safety record, not a substitute for those fixes.

## Production backup confirmation

On 2026-07-14, the business owner confirmed that a full Firestore database export was completed before Phase 2 work. The export location and access details are deliberately not stored in this repository.
