# Task 3 Report: Identity Certification Batch

## Result

The shared local certification runner and the exact 11-scenario identity batch
are implemented at commit `a6b8a410100a956333df8c50e9f4ccac54a2e9b9`
(`qa: complete identity certification batch`). The fresh real-browser run
`final-cert-t3-260904-233419-8ece` exited 0 against that immutable commit.

This is not final certification. Every Task 3 scenario remains
`BLOCKED_PRECONDITION` because its complete seven-dimension contract requires
local work and/or exact-revision staging, approved mailbox/provider, or real
background-job evidence that was not available to this local batch. No coverage
matrix row was changed.

## Implemented Slice

- Added strict batch/scenario selection for exactly the 11 frozen Task 3 IDs;
  adjacent local scenarios are rejected rather than widened into scope.
- Added a loopback-only local harness with a required `demo-*` Firebase project,
  unique run suffix, runtime-only credentials, stripped provider credentials,
  enforced outbound-provider block mode, one child execution, and idempotent
  child/browser cleanup in `finally`.
- Added redacted JSON/Markdown evidence validation. Final `PASS`, missing
  provenance, missing cleanup metadata, credentials, session material, OOB
  links, query-string URLs, and provider payloads are rejected.
- Added a Playwright CLI adapter contract with exact run/session ownership,
  real pointer interaction, desktop/mobile viewport checks, route and overflow
  checks, application/console error checks, response allowlisting, redacted
  capture shapes, and idempotent close-all behavior.
- Added the identity batch adapter and preserved catalog execution order so
  blocked-state checks precede mutations and purge remains last.
- Added `npm run qa:certify-local -- --batch identity --browser` and a
  `--certification-identity` compatibility mode in the proven Phase 2 emulator
  audit so the exact local API, Auth, tenant, route-policy, session, browser,
  console, network, responsive, and cleanup probes execute within one isolated
  emulator lifecycle.

## Scenario Outcomes

| Scenario | Outcome | Fresh local dimensions observed | Still missing |
|---|---|---|---|
| `marketing-legal-contact-beta-coach-referral` | BLOCKED_PRECONDITION | none | all seven dimensions; approved mailbox/provider and staging |
| `authentication-email-password-login` | BLOCKED_PRECONDITION | permission, network | happy, negative, persistence, console, responsive; hosted session |
| `authentication-logout-revocation-multi-tab` | BLOCKED_PRECONDITION | happy path, network | negative, permission, persistence, console, responsive; hosted revocation |
| `authentication-password-reset` | BLOCKED_PRECONDITION | none | all seven dimensions; approved mailbox/provider and staging |
| `account-lifecycle-disable-delete-cancel-purge` | BLOCKED_PRECONDITION | none | all seven dimensions; staging lifecycle and Function/scheduler/fault evidence |
| `signup-onboarding-coach-admin-league-parent-adult-player-signup` | BLOCKED_PRECONDITION | none | all seven dimensions; five-role mailbox verification and staging |
| `signup-onboarding-youth-invitation-signup` | BLOCKED_PRECONDITION | none | all seven dimensions; invite mailbox delivery and staging |
| `signup-onboarding-missing-profile-onboarding` | BLOCKED_PRECONDITION | none | all seven dimensions; durable hosted missing/partial-profile sessions |
| `demo-seed-use-exit-expiry-cleanup` | BLOCKED_PRECONDITION | none | all seven dimensions; staging isolation and scheduled retry/failure evidence |
| `dashboard-shell-role-landing-and-route-policy` | BLOCKED_PRECONDITION | none | all seven dimensions; durable role/plan/state sessions and complete matrix |
| `administration-access-and-user-directory` | BLOCKED_PRECONDITION | none | all seven dimensions; authorized trusted claim and safe revoke/restore |

The dashboard and administration runs contain useful partial permission cases,
but the corresponding dimensions intentionally remain `NOT_OBSERVED` because
their required decision matrices are incomplete.

## Exact Browser Evidence

Command:

```text
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --batch identity --browser
```

Fresh final result: exit 0.

- All 20 active aliases reached their cataloged destinations.
- Unverified, suspended, pending-delete, and removed-member boundaries matched
  their Auth/session/tenant expectations.
- Team A/B tenant probes used the exact run-scoped seeded fixture IDs.
- Profile-only fake administration was denied; the trusted claim was accepted.
- Protected deep-link resumption, visible logout, peer-tab logout, post-logout
  session 401, wrong-password, disabled, unverified, and pending-delete paths
  all passed.
- Member, parent, and trusted-admin remainder sweeps reported zero route or
  application errors, zero mobile-fit failures, zero console errors, and zero
  failed responses.
- Exact post-cleanup Storage absence passed. The harness closed all owned
  Playwright sessions in `finally`.

Tracked summary:
`docs/qa/production-audit/runs/2026-09-04-final-certification/02-identity.md`.
The sanitized machine result is under ignored output at
`output/playwright/2026-09-04-final-certification/task-3/final-cert-t3-260904-233419-8ece/results.json`.

## Bugs and Root Fixes

### BUG-022: Firestore timestamp crashes the member feed

The first exact browser flow reached the `/feed` error boundary with
`RangeError: Invalid time value`. The fixture was correct: live Firestore reads
return `Timestamp`. The feed incorrectly passed that object to `new Date(...)`.

The fix adds one feed timestamp normalizer for live Firestore timestamps,
serialized timestamp shapes, ISO/epoch values, and malformed fallbacks. Both
post and comment labels use it. Three focused regressions passed, and the exact
member surface sweep passed after the repair with no route, console, response,
or mobile-fit failure.

### BUG-023: identity API probes used historical fixed team IDs

The audit seeded unique run-scoped Team A/B IDs but the legacy target strings
still contained `qa-team-a` and `qa-team-b`. A pure target builder now derives
every scoped route from the returned fixture catalog. The regression proves
non-default IDs are used and the exact local batch then passed every tenant API
probe.

Both defects are recorded in
`docs/qa/production-audit/07-defect-ledger.md`. BUG-022 local evidence does not
close the separately owned feed coverage row.

## TDD Evidence

- Each new shared runner module first failed with `ERR_MODULE_NOT_FOUND`, then
  passed after the smallest implementation slice was added.
- The unique-fixture API target regression failed against the fixed historical
  Team A/B routes before the target builder was implemented.
- The feed regression reproduced invalid live Firestore timestamp conversion
  before the normalizer existed, then passed for live, serialized, ISO, and
  malformed inputs after the repair.
- Focused final command covered the runner, browser, evidence, harness,
  identity, selection, legacy integration, and feed regression suites: 51
  passed, 0 failed.

## Verification

- Focused Task 3 tests: exit 0; 51 passed, 0 failed.
- `npm test`: exit 0; 512 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0; optimized production build completed. Existing
  repository lint warnings remained non-fatal.
- Exact local identity browser batch: exit 0 on commit
  `a6b8a410100a956333df8c50e9f4ccac54a2e9b9`.
- `git diff --check`: exit 0 before the implementation commit.

## Safety and Cleanup

- The harness rejects non-loopback emulator/app authorities and non-`demo-*`
  projects before execution.
- Every known Stripe, Resend, push, internal-route, and Firebase service
  credential is blanked in the audit child, including keys that Next could
  otherwise reload from an environment file. Server provider entry points also
  fail closed under audit mode.
- Runtime credentials are never persisted in evidence and are redacted from
  child failures. Evidence validation also rejects session/OOB/provider data.
- The local run used the frozen Task 2 fixture catalog and exact cleanup
  selectors. It did not redefine fixtures, create production/provider objects,
  or mutate production.
- The account-lifecycle row keeps `background-batch` ownership and
  `BLOCKED_PRECONDITION`; direct local Firestore deletion was not represented as
  Function or scheduler evidence.

## Remaining Work

The exact local and external gaps are listed per scenario in `02-identity.md`.
The principal blockers are approved QA mailbox/provider delivery-once proof,
durable sessions on one exact staging revision, authorized disposable lifecycle
and trusted-claim mutations, real Function/scheduler logs, and bounded cleanup
failure/retry evidence. The local negative, persistence, full responsive, and
complete decision-matrix gaps must also be implemented before any row can be
considered complete.

Task 3 does not claim final release certification.
