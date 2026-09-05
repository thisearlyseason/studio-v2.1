# Task 3 Report: Identity Certification Batch

## Result

Task 3's shared local runner and exact eleven-scenario identity batch execute the
locally safe emulator, API, and real-Chrome contracts in frozen catalog order.
The final immutable run `final-cert-t3-260905-070745-f043` used commit
`f8fada52a23ad8afe36615b49fc809d7e05ca110`, exited zero, emitted all 77 exact
case records, recorded 518 case-owned assertions (1,174 passing observations in
the full child log), and had zero run errors. Every row has seven locally
observed case dimensions.

This is not final certification. All eleven rows remain
`BLOCKED_PRECONDITION`: the candidate is not deployed to staging, no approved
mailbox receipt indicator is available, and real hosted session/background
Function evidence is absent. Production was not queried or changed. No matrix
row was promoted to PASS.

## Fix-round Review Findings

- R1: case completion is derived from exact executed assertion contracts. A
  successful no-op or partial handler cannot manufacture evidence. Every
  locally safe omitted flow named by the review now executes.
- R2: scenario-scoped console and response observers cover the actual browser
  mutations, explicitly allow expected negative responses, remove listeners in
  `finally`, and wait on meaningful route/DOM/network conditions.
- R3: a dynamic resource/claim cleanup registry registers resources at
  creation, attempts every exact cleanup, retries boundedly, verifies deletion
  or restoration postconditions, and reports measured counts.
- R4: the identity orchestrator stops all later mutation after its first
  scenario failure while preserving cleanup/restoration and multiple sanitized
  diagnostics for the failing case.
- R5: evidence validation enforces the frozen case set, environment gaps,
  ordered parseable timestamps, cleanup consistency, artifact containment and
  existence, per-case provenance, and redacted artifacts before write.
- R6: owned child/process teardown preserves signal exit status, terminates an
  unresponsive child within bounds, retries exact session closures, and never
  uses global browser cleanup.

## Exact Scenario Outcomes

| Scenario | Case-owned assertions | Local cases | Overall outcome | External requirement still open |
|---|---:|---:|---|---|
| `marketing-legal-contact-beta-coach-referral` | 26 | 7/7 | BLOCKED_PRECONDITION | Exact staging revision and approved mailbox/provider delivery-once evidence |
| `authentication-email-password-login` | 80 | 7/7 | BLOCKED_PRECONDITION | Durable hosted session on the exact staging revision |
| `authentication-logout-revocation-multi-tab` | 17 | 7/7 | BLOCKED_PRECONDITION | Hosted multi-tab logout and authorized claim revocation on the exact revision |
| `authentication-password-reset` | 29 | 7/7 | BLOCKED_PRECONDITION | Approved QA mailbox action and actual delivery on the exact revision |
| `account-lifecycle-disable-delete-cancel-purge` | 18 | 7/7 | BLOCKED_PRECONDITION | Authorized staging records, real Function/scheduler invocation and logs, and bounded staging fault injection |
| `signup-onboarding-coach-admin-league-parent-adult-player-signup` | 41 | 7/7 | BLOCKED_PRECONDITION | Approved delivered verification for five staging roles on the exact revision |
| `signup-onboarding-youth-invitation-signup` | 19 | 7/7 | BLOCKED_PRECONDITION | Approved invite mailbox delivery on the exact revision |
| `signup-onboarding-missing-profile-onboarding` | 24 | 7/7 | BLOCKED_PRECONDITION | Durable hosted missing/partial-profile sessions on the exact revision |
| `demo-seed-use-exit-expiry-cleanup` | 21 | 7/7 | BLOCKED_PRECONDITION | Exact staging revision and actual scheduled cleanup/retry logs |
| `dashboard-shell-role-landing-and-route-policy` | 185 | 7/7 | BLOCKED_PRECONDITION | Durable hosted role/plan/state sessions on the exact revision |
| `administration-access-and-user-directory` | 58 | 7/7 | BLOCKED_PRECONDITION | Authorized staging trusted-claim revoke/restore on the exact revision |

The tracked sanitized summary is
`docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`.
The ignored machine result is
`output/playwright/2026-09-04-final-certification/task-3/final-cert-t3-260905-070745-f043/results.json`.
All eleven result outcomes are `BLOCKED_PRECONDITION`, `runErrors` is empty,
and every case artifact is contained beneath that run directory.

## Browser, Error, and Persistence Evidence

The exact final command was:

```text
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- identity --browser
```

The local run covered public contact/beta/referral forms and isolation; all 20
active identity landings plus blocked states; timeout, double-submit, keyboard,
password visibility, refresh/new-tab/Back, and deep-link login behavior; user
and administrator open-tab/fresh-tab revocation; expired/reused/modified and
wrong-account reset links; lifecycle schedule/cancel/suspend/restore plus local
purge clock/fault/retry/reconciliation; five fresh visible signup flows with
invalid, duplicate, aborted-delivery, provider-failure, and privileged-field
attacks; youth role/tenant/rules and relogin persistence; all missing-profile
role completions and transient read recovery; two demo browser contexts,
cross-ID denial, expiry, and cleanup retry; the complete route-policy/visible
navigation matrix; and all non-superadmin admin routes plus rules, directory
targeting, actual ascending/descending order, mobile fit, and live revocation.

Every supported workflow captured its own console/network evidence at both
required viewports. The local child inherited no usable Stripe, Resend, push,
internal-route, or Firebase service credentials. Accepted email actions used
only the in-memory local sink. Parsed loopback validation rejected foreign,
userinfo, suffix, protocol, path, and invalid-port bypasses at the outer,
browser, and legacy seams.

## Cleanup

Shared cleanup event
`fixture-cleanup-final-cert-t3-260905-070745-f043` is `OBSERVED`: 281 exact
deletions, two exact restorations, and zero retained audit records. Dynamic Auth,
Firestore, Storage, demo, signup, youth, missing-profile, lifecycle, and claim
resources passed absence/restoration postconditions. The browser registry was
empty after `finally`, and no owned emulator/Next/audit process remained.

Lifecycle's `background-batch` cleanup contribution remains
`BLOCKED_PRECONDITION`; local purge fault/retry evidence is not represented as a
real scheduler invocation or staging background cleanup.

## Bugs Found and Fixed

- BUG-028: youth invitation redemption linked Auth/profile/player data but did
  not create the user's team member and membership projections. The API now
  resolves the player's authoritative team in-transaction and creates both
  projections atomically; focused API/browser linkage, tenant-authority, and
  relogin tests passed before the final full run.
- BUG-029: the admin directory displayed `name` when `fullName` was absent but
  sorted only by `fullName`, so visible rows could fail both ascending and
  descending order. The comparator now uses the same
  `fullName || name || email` fallback as rendering; focused browser assertions
  verified both real orders before the full run.

Audit-only defects repaired in the same round include the dashboard hydration
navigation race, exact-expected redirect handling, stale emulator Admin SDK
HTTP keep-alive (`EPIPE`), login's frozen three-blocked-identity contract, and
the signup negative-case label attribution. Each received a regression and an
affected focused rerun. These are runner/evidence defects, not additional
product bug IDs.

Prior Task 3 fixes BUG-022 through BUG-027 remain covered. BUG-023 retains both
the helper test and the five-target request-plan integration regression; no
report language treats the helper alone as integration proof.

## Verification

- Focused real-browser signup rerun after the final evidence-attribution fix:
  7/7 exact cases, including invalid, duplicate, aborted-delivery, and provider
  failure; exact cleanup; no run errors.
- Final immutable browser batch: 11 scenarios, 77/77 cases, 518 case-owned
  assertions, 1,174 total passing observations, zero run errors, cleanup 281
  deleted / 2 restored / 0 retained.
- Focused behavioral regression for signup evidence attribution: 1 passed, 0
  failed.
- `npm test`: 579 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; optimized production build completed. Existing
  repository lint/Tailwind/workspace-root warnings were non-fatal.
- `git diff --check`: exit 0 after report/matrix/ledger reconciliation.

## Remaining Blockers

Deploy and correlate exact candidate commit `f8fada52` before hosted evidence.
Then provide explicit authorization for run-prefixed staging mutations and
trusted-claim restore, an approved disposable QA mailbox with a receipt
indicator, durable role/session fixtures, and an allowlisted real
Function/scheduler invocation with sanitized correlated logs and safe bounded
fault injection.

No production mutation, staging mutation, mailbox/provider send, or real
background invocation occurred. Task 3 does not claim final release
certification.
