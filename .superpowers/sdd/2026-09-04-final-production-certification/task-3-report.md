# Task 3 Report: Identity Certification Batch

## Result

Task 3's shared local runner and exact eleven-scenario identity batch execute the
locally safe emulator, API, and real-Chrome contracts in frozen catalog order.
The final immutable run `final-cert-t3-260905-100743-7ed8` used candidate commit
`320d7f9f004b848da2a6c86103e1a266fdb871a7`, exited zero, emitted all 77 exact
case records, recorded 743 case-owned assertions, and had zero run errors. Of
the 77 cases, 73 are `OBSERVED`, four are explicitly `NOT_OBSERVED`, and none
failed.

This is not final certification. Every row remains `BLOCKED_PRECONDITION`: the
candidate is not deployed to staging, no approved mailbox receipt indicator is
available, and real hosted session/background Function evidence is absent.
Production was neither queried nor changed. No matrix row was promoted to PASS.

## Round 3 Findings

- Youth invitation authority now binds only to an active, server-authorized
  child roster membership captured by the invitation and revalidated during
  redemption. Parent-editable `primaryTeamId` and `joinedTeamIds` never mint
  authority. Legitimate teamless/legacy activation remains teamless.
- Dashboard evidence executes the actual route/navigation decision table for
  all 20 active identities over seven sensitive routes at desktop and mobile
  widths, plus the three blocked identities, visible-navigation consistency,
  refresh/new-tab/Back persistence, and remaining surface sweeps.
- Reset executes valid, modified, reused, old/new, wrong-account, restoration,
  non-enumeration, form-state, console, network, and responsive paths. A true
  unused-code expiry and recipient-tampered action remain `NOT_OBSERVED` because
  the Auth emulator provides neither supported OOB clock control nor a
  caller-selected recipient action.
- Lifecycle and demo evidence no longer substitutes audit cleanup for an
  application scheduler. Direct state transitions, boundaries, browser flows,
  isolation, and measured cleanup execute; unavailable application-worker
  paths remain `NOT_OBSERVED`.
- Dynamic Auth, Firestore, Storage, claim, and restoration resources register
  at mutation time. Cleanup attempts every registered target, retries boundedly,
  verifies postconditions, and records actual delete/restore counts.
- Case evidence validates environment, candidate, run, ordered timestamps,
  artifact containment/existence/content, provenance, cleanup consistency, and
  sanitized identities before write. The outer supervisor owns a process group,
  preserves signal status, and bounds escalation even if its child is killed.

## Exact Scenario Outcomes

| Scenario | Case-owned assertions | Local case state | Overall outcome | External requirement still open |
|---|---:|---:|---|---|
| `marketing-legal-contact-beta-coach-referral` | 26 | 7 observed | BLOCKED_PRECONDITION | Exact staging revision and approved mailbox/provider delivery-once evidence |
| `authentication-email-password-login` | 80 | 7 observed | BLOCKED_PRECONDITION | Durable hosted session on the exact staging revision |
| `authentication-logout-revocation-multi-tab` | 17 | 7 observed | BLOCKED_PRECONDITION | Hosted multi-tab logout and authorized claim revocation on the exact revision |
| `authentication-password-reset` | 18 | 6 observed, 1 not observed | BLOCKED_PRECONDITION | True expiry/recipient-tamper seam plus approved mailbox delivery on the exact revision |
| `account-lifecycle-disable-delete-cancel-purge` | 14 | 6 observed, 1 not observed | BLOCKED_PRECONDITION | Real Function/scheduler invocation, correlated logs, and bounded staging fault injection |
| `signup-onboarding-coach-admin-league-parent-adult-player-signup` | 41 | 7 observed | BLOCKED_PRECONDITION | Approved delivered verification for five staging roles on the exact revision |
| `signup-onboarding-youth-invitation-signup` | 23 | 7 observed | BLOCKED_PRECONDITION | Approved invite mailbox delivery on the exact revision |
| `signup-onboarding-missing-profile-onboarding` | 54 | 7 observed | BLOCKED_PRECONDITION | Durable hosted missing/partial-profile sessions on the exact revision |
| `demo-seed-use-exit-expiry-cleanup` | 10 | 5 observed, 2 not observed | BLOCKED_PRECONDITION | Actual scheduled expiry/pending-recovery worker and retry logs on the exact revision |
| `dashboard-shell-role-landing-and-route-policy` | 384 | 7 observed | BLOCKED_PRECONDITION | Durable hosted role/plan/state sessions on the exact revision |
| `administration-access-and-user-directory` | 76 | 7 observed | BLOCKED_PRECONDITION | Authorized staging trusted-claim revoke/restore on the exact revision |

The tracked sanitized summary is
`docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`.
The ignored machine result is
`output/playwright/2026-09-04-final-certification/task-3/final-cert-t3-260905-100743-7ed8/results.json`.
All eleven result outcomes are `BLOCKED_PRECONDITION`; `runErrors` is empty and
every declared artifact is contained beneath that run directory.

## Browser, Error, and Persistence Evidence

The exact final command was:

```text
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- identity --browser
```

The final browser run covered public form validation/persistence/isolation; 20
active login landings and three blocked accounts; login timeout/recovery,
double-submit, keyboard, visibility, deep-link and navigation persistence;
logout and administrator open/fresh-tab revocation; complete visible signup and
missing-profile role flows; adversarial and authorized youth activation; two
isolated demo browser contexts; the complete dashboard route policy; and all
non-superadmin administration denials, directory sort/target, responsive, and
revocation paths. Scenario-scoped observers surrounded the actual mutations and
were removed in `finally`.

The local child inherited no usable Stripe, Resend, push, internal-route, or
Firebase service credentials. Accepted email actions used only the in-memory
local sink. Parsed loopback validation rejected foreign, userinfo, suffix,
protocol, path, and invalid-port bypasses at the outer, browser, and legacy
seams.

## Cleanup

Shared cleanup event `fixture-cleanup-final-cert-t3-260905-100743-7ed8` is
`OBSERVED`: 290 measured deletions, five measured restorations, and zero retained
audit records. Dynamic Auth, Firestore, Storage, demo, signup, youth,
missing-profile, lifecycle, and claim resources passed absence/restoration
postconditions. All owned browser sessions and local services closed in
`finally`.

Lifecycle's `background-batch` contribution remains `BLOCKED_PRECONDITION`.
The demo scheduler expiry/pending-recovery cases likewise remain
`NOT_OBSERVED`; local registry cleanup is not represented as worker evidence.

## Bugs Found and Fixed

- **BUG-028:** youth activation could mint tenant authority from
  parent-editable player team fields. Redemption now stores and revalidates the
  exact active child roster binding. Regressions cover forged primary and joined
  fields, removed child, post-invite team change with Auth rollback, teamless
  legacy activation, authorized membership, tenant authority, and relogin.
- **BUG-029:** admin directory sorting used a different name fallback than its
  visible rows. The comparator now uses `fullName || name || email`; actual
  ascending and descending browser orders pass.
- **BUG-030:** elite-plan club owners saw a mobile `/competition` link even
  though the authoritative route policy denied it. The shared mobile bottom nav
  now filters through `authorizeDashboardRoute`; the 20-role visible-navigation
  and direct-route matrix passes at both viewports.

Audit-only repairs include strict evidence validation/sanitization, exact
resource cleanup, process-group supervision, scenario filtering, mutation-time
observers, correct fail-stop behavior, and a bounded redirect transition wait
with requested/expected/actual diagnostics. The latter reproduced only under
the accumulated full-batch load, passed its focused rerun, and then passed the
final full run. These are runner/evidence defects, not product bug IDs.

BUG-023 retains both the pure target-builder regression and the separate
five-request integration-plan regression; the helper alone is not described as
integration proof.

## Verification

- Focused dashboard browser rerun on final candidate: run
  `final-cert-t3-260905-095628-6857`, 7/7 observed, zero failures; cleanup 249
  deleted / 0 restored / 0 retained.
- Final immutable browser batch: run `final-cert-t3-260905-100743-7ed8`, 11
  scenarios, 77 cases, 73 observed / 4 not observed / 0 failed, 743 case-owned
  assertions, zero run errors; cleanup 290 deleted / 5 restored / 0 retained.
- `node --test tests/phase2-emulator-audit.test.mjs`: 60 passed, 0 failed.
- `npm test`: 586 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; optimized production build completed. Existing
  repository lint, Tailwind, and workspace-root warnings were non-fatal.
- `git diff --check`: run after final report/matrix/ledger reconciliation.

## Remaining Blockers

Deploy and correlate exact candidate commit `320d7f9f` before hosted evidence.
Then provide explicit authorization for run-prefixed staging mutations and
trusted-claim restoration, an approved disposable QA mailbox with a receipt
indicator, durable role/session fixtures, and an allowlisted real
Function/scheduler invocation with sanitized correlated logs and safe bounded
fault injection.

No production mutation, staging mutation, mailbox/provider send, or real
background invocation occurred. Task 3 does not claim final release
certification.
