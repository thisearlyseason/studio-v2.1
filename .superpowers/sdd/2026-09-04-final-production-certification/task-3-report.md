# Task 3 Report: Identity Certification Batch

## Result

Task 3's shared local runner and exact eleven-scenario identity batch now execute
the local emulator/API/browser cases in catalog order. The final real-Chrome run
`final-cert-t3-260905-022702-06e8` exited zero, emitted seven locally observed
dimensions for each of the eleven selected rows, reported no shared run errors,
and reconciled exact shared fixture cleanup (`253` deleted, `0` restored, `0`
retained audit records).

This is not final certification. All eleven rows remain `BLOCKED_PRECONDITION`
because the current implementation commit is not deployed to staging and the
required exact-revision hosted sessions, approved mailbox/provider evidence,
authorized staging mutations, and real background Function/scheduler evidence
are unavailable. Production was not queried or changed. No matrix row was
promoted to PASS.

The machine result records starting HEAD
`b4cc09ee209cb50ef1cc4c7e200d99bd1a022e72`; this fix round was executed from
the working tree based on that commit and committed only after verification.
The handoff supplies the resulting fix commit SHA rather than pretending the
pre-commit machine field identifies the final tracked tree.

## Review Findings Addressed

- I1: every exact Task 3 scenario dispatches a locally executable API and real
  Playwright handler; no selected row is converted into a placeholder event.
- I2: one parsed loopback HTTP boundary protects the outer harness, shared
  browser, and legacy runner. Userinfo, suffix tricks, missing/invalid ports,
  paths, protocol-relative navigation, HTTPS, and foreign origins are rejected.
- I3: the outer and legacy runners keep exact owned-session registries, attempt
  all closures, retry failed entries, await owned process-group termination,
  preserve the first signal, and never call global `close-all`.
- I4: execution-point events contain scenario/case/dimension provenance, real
  timestamps, sanitized assertions, case artifacts, cleanup selectors, actual
  cleanup counts, and one shared cleanup reference. Background-owned lifecycle
  cleanup is not misrepresented as locally completed Function evidence.
- I5: evidence validation reconciles required case IDs, dimension states,
  missing dimensions, environment gaps, artifact metadata, nonnegative cleanup
  counts, and the prohibition on local final PASS. Adversarial inconsistent
  evidence is rejected.
- I6: a failing case remains attached to its actual scenario and sanitized
  diagnostic artifact. A shared child failure becomes a separate run error.
- I7: scenario selection reaches the legacy child and dispatches only the
  selected handlers plus shared seed/cleanup dependencies.
- I8: all twenty active catalog aliases now receive actual browser landing
  assertions. API sign-in/session evidence is labelled separately.
- M1: shared and emitted Playwright observers remove named listeners in
  `finally` and use bounded state/response waits rather than fixed settle sleeps.
- M2: BUG-023 now has both the helper regression and a request-plan integration
  regression over all five scoped tenant targets.

## Exact Scenario Outcomes

| Scenario | Local assertions | Local dimensions | Overall outcome | External requirement still open |
|---|---:|---:|---|---|
| `marketing-legal-contact-beta-coach-referral` | 28 | 7/7 | BLOCKED_PRECONDITION | Exact staging revision and approved mailbox/provider delivery-once evidence |
| `authentication-email-password-login` | 92 | 7/7 | BLOCKED_PRECONDITION | Durable hosted session on the exact staging revision |
| `dashboard-shell-role-landing-and-route-policy` | 172 | 7/7 | BLOCKED_PRECONDITION | Durable hosted role/plan/state sessions on the exact revision |
| `administration-access-and-user-directory` | 43 | 7/7 | BLOCKED_PRECONDITION | Authorized staging trusted-claim revoke/restore |
| `signup-onboarding-missing-profile-onboarding` | 16 | 7/7 | BLOCKED_PRECONDITION | Durable hosted missing/partial-profile sessions |
| `signup-onboarding-coach-admin-league-parent-adult-player-signup` | 57 | 7/7 | BLOCKED_PRECONDITION | Approved delivered verification for five staging roles and exact revision |
| `signup-onboarding-youth-invitation-signup` | 29 | 7/7 | BLOCKED_PRECONDITION | Approved staging invite mailbox delivery |
| `authentication-password-reset` | 20 | 7/7 | BLOCKED_PRECONDITION | Approved staging mailbox action and actual delivery |
| `authentication-logout-revocation-multi-tab` | 14 | 7/7 | BLOCKED_PRECONDITION | Hosted multi-tab logout and admin revocation |
| `demo-seed-use-exit-expiry-cleanup` | 24 | 7/7 | BLOCKED_PRECONDITION | Exact staging revision and actual scheduled cleanup/retry logs |
| `account-lifecycle-disable-delete-cancel-purge` | 31 | 7/7 | BLOCKED_PRECONDITION | Authorized staging records, real Function/scheduler invocation/logs, and bounded staging fault injection |

The sanitized summary is
`docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`.
The ignored machine result is
`output/playwright/2026-09-04-final-certification/task-3/final-cert-t3-260905-022702-06e8/results.json`.
Its eleven outcomes are all `BLOCKED_PRECONDITION`, not PASS, and `runErrors`
is empty.

## Browser and Local Boundary Evidence

The exact browser command was:

```text
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --batch identity --browser
```

Observed local behavior included:

- public marketing/legal routes at 1440x900 and 390x844, visible coach-referral
  validation/submission, malformed and oversized payloads, rate limiting,
  idempotency, privileged-field normalization, local sink persistence, and exact
  dynamic cleanup;
- API Auth/session checks for all active and blocked aliases, actual Chrome
  landings for all twenty active aliases, deep-link return, wrong/disabled/
  unverified/pending-deletion states, rapid double submit, refresh/new tab/Back,
  tenant isolation, and responsive/console/network checks;
- visible multi-tab logout, Back/reload/direct-route denial, session HTTP 401,
  emulator-admin token revocation, fresh-session recovery, and mobile fit;
- known/unknown neutral reset UI, recipient-bound emulator OOB handling,
  modified/reused denial, old/new password transition, exact restoration, and
  no outbound provider use;
- lifecycle owner/subscription/cross-user/malformed/invalid-transition guards,
  schedule/cancel/suspend/restore transitions, disabled-login observations,
  audit-log cleanup, and responsive admin/settings surfaces. Real scheduler
  invocation and failure injection remain external and are not inferred;
- five fresh UI-created role accounts, verification gates, in-memory emulator
  verification actions, role/profile/landing persistence, privileged-claim
  denial, two viewports, and exact Auth/profile/player cleanup;
- youth invite creation, PII allowlist, modified/expired/reused/wrong-account and
  cross-guardian denial, visible short/mismatch validation and rapid activation,
  one player link, consumed-link reload denial, and exact restoration;
- missing and partial profile fail-closed API behavior plus a fresh browser
  identity completing visible onboarding without protected listener startup;
- two isolated anonymous API contexts, duplicate/invalid seed and billing
  denial, peer isolation, visible UI exit with cleanup HTTP 204, post-exit route
  denial, responsive checks, and zero console errors. Actual scheduled cleanup
  logs remain external;
- all twenty role/plan/state landings, refresh/new-tab/Back persistence, and the
  member/parent/trusted-admin remainder route sweep, including the delegated
  school hub after BUG-027;
- trusted/fake/non-SA administration API checks, malformed target denial,
  claim revoke/refresh/restore, directory search/sort/isolation, and trusted/
  denied surfaces at both viewports.

The local child inherited no usable Stripe, Resend, push, internal-route, or
Firebase service credentials. Provider entry points fail closed under audit
mode, while accepted local mail uses an in-memory/local sink. Every browser
session was owned by the run prefix and closed in `finally`.

## Bugs Found and Fixed

- BUG-022: normalized live Firestore and serialized timestamps before rendering
  feed post/comment relative dates. The original crash and repaired browser
  journey are retained as local evidence only.
- BUG-023: replaced fixed historical Team A/B strings with run-scoped fixture
  targets and proved all five request-plan paths use them.
- BUG-024: added `/onboarding` to the TeamProvider auth-gate paths so a verified
  identity without a profile does not start protected listeners or crash.
- BUG-025: made known-account reset provider failures return the same neutral
  public response as unknown accounts while preserving generic server-side
  diagnostics, closing an enumeration seam.
- BUG-026: made visible demo sign-out require exact `/api/demo/exit` cleanup
  before browser-session clearing and Firebase sign-out.
- BUG-027: delayed organization-capacity loading until authoritative school hub
  data resolves, eliminating delegated-admin bootstrap 403 responses.

Each new application repair was reproduced by a failing focused regression,
fixed at the root seam, and rerun through its exact browser flow before the full
batch. The defect ledger contains the detailed evidence and scope limits.

## Verification

- Exact scenario-filtered browser run
  `final-cert-t3-260905-025138-5e05`: selected only
  `authentication-email-password-login`; exit 0; one result; 92 assertions;
  7/7 local dimensions; exact cleanup; no run errors.
- Exact full identity browser batch: exit 0; all 11 scenarios; 7/7 local
  dimensions each; 526 scenario assertions; no run errors; cleanup deleted 253.
- Focused Task 3/regression command: 151 passed, 0 failed.
- `npm test`: 542 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; optimized production build completed. Existing
  repository lint warnings were non-fatal.
- `git diff --check`: run after report reconciliation and before commit.

## Remaining Blockers

The exact implementation commit must be deployed and correlated to one staging
revision before hosted evidence can begin. An operator must then authorize
run-prefixed disposable staging mutations, approve the exact QA mailbox/domain,
provide secure durable role accounts, authorize disposable trusted-claim
revoke/restore, and provide an allowlisted Function/scheduler invocation plus
sanitized log correlation and bounded fault injection for lifecycle/demo
cleanup. The current staging revision predates this fix round, no approved
mailbox indicator exists, and no safe background fault-injection adapter exists.

No production mutation, staging mutation, mailbox send, provider send, or real
background invocation was performed. Task 3 does not claim final release
certification.
