# Task 3 identity local certification observations

- Run: `final-cert-t3-260904-233419-8ece`
- Commit: `a6b8a410100a956333df8c50e9f4ccac54a2e9b9`
- Environment: loopback Firebase emulators and local Next server only
- Result boundary: local observations do not constitute final coverage-matrix PASS

| Scenario | Outcome | Observed dimensions | Missing dimensions |
|---|---|---|---|
| `marketing-legal-contact-beta-coach-referral` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `authentication-email-password-login` | BLOCKED_PRECONDITION | permission, network | happyPath, negativePath, persistence, console, responsive |
| `authentication-logout-revocation-multi-tab` | BLOCKED_PRECONDITION | happyPath, network | negativePath, permission, persistence, console, responsive |
| `authentication-password-reset` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `account-lifecycle-disable-delete-cancel-purge` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `signup-onboarding-coach-admin-league-parent-adult-player-signup` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `signup-onboarding-youth-invitation-signup` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `signup-onboarding-missing-profile-onboarding` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `demo-seed-use-exit-expiry-cleanup` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `dashboard-shell-role-landing-and-route-policy` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |
| `administration-access-and-user-directory` | BLOCKED_PRECONDITION | none | happyPath, negativePath, permission, persistence, console, network, responsive |

## Remaining external requirements

- `marketing-legal-contact-beta-coach-referral`: approved QA mailbox/provider delivery-once evidence; exact staging revision
- `authentication-email-password-login`: durable hosted session on the exact staging revision
- `authentication-logout-revocation-multi-tab`: hosted multi-tab logout and admin revocation on the exact staging revision
- `authentication-password-reset`: approved QA mailbox action completed in memory only; exact staging revision
- `account-lifecycle-disable-delete-cancel-purge`: authorized disposable staging lifecycle records; Function/scheduler invocation with sanitized correlated logs; safe bounded purge fault injection
- `signup-onboarding-coach-admin-league-parent-adult-player-signup`: approved QA mailbox verification for five disposable roles; exact staging revision
- `signup-onboarding-youth-invitation-signup`: approved QA mailbox invite delivery; exact staging revision
- `signup-onboarding-missing-profile-onboarding`: durable hosted missing-profile and partial-profile sessions on the exact staging revision
- `demo-seed-use-exit-expiry-cleanup`: exact staging revision for durable demo isolation; scheduled cleanup adapter with retry and partial-failure evidence
- `dashboard-shell-role-landing-and-route-policy`: durable role/plan/state sessions on the exact staging revision
- `administration-access-and-user-directory`: authorized disposable trusted claim on the exact staging revision; safe claim revocation and restoration authority

## Cleanup

- `marketing-legal-contact-beta-coach-referral` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `authentication-email-password-login` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `authentication-logout-revocation-multi-tab` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `authentication-password-reset` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `account-lifecycle-disable-delete-cancel-purge` (background-batch): BLOCKED_PRECONDITION; deleted 0, restored 0, retained audit records 0.
- `signup-onboarding-coach-admin-league-parent-adult-player-signup` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `signup-onboarding-youth-invitation-signup` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `signup-onboarding-missing-profile-onboarding` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `demo-seed-use-exit-expiry-cleanup` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `dashboard-shell-role-landing-and-route-policy` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.
- `administration-access-and-user-directory` (local-batch): OBSERVED; deleted 0, restored 0, retained audit records 0.

## Exact local browser observations

- Command: `PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --batch identity --browser`
- All 20 active catalog aliases established their expected local session. Unverified, suspended, pending-delete, and removed-member boundaries matched their expected Auth, session, or tenant denial.
- Team A/Team B isolation, trusted-claim versus profile-only administration, public/private data, entitlements, and Storage access/lifecycle probes all passed against the run-scoped fixture IDs.
- A visible protected deep link resumed after sign-in. A visible logout revoked the initiating tab, the peer tab observed logout, and the logged-out session endpoint returned 401.
- Visible wrong-password and disabled-account submissions used the generic failure path; unverified reached the verification gate; pending-delete remained denied.
- Member, parent, and trusted-admin remainder sweeps each ended with zero route/application/mobile-fit failures, zero console errors, and zero failed responses.
- The final exact cleanup marker passed, and the outer runner closed its owned Playwright sessions in `finally`.

## Remaining local contract gaps

- Marketing/contact/referral still lacks visible form submission, malformed/oversize/duplicate/rate-limit, trusted-admin-record, persistence, and responsive coverage.
- Login still lacks unknown-user comparison, delayed-response and rapid-double-submit behavior, a complete active-role browser matrix, persistence, and complete auth-form responsive checks.
- Logout/revocation still lacks Back/cache/direct-route denial, admin-side token revocation, persistence, and mobile logout.
- Password reset still lacks emulator OOB valid/reused/modified/expired/wrong-recipient transitions, provider-failure handling, persistence, and responsive reset UI.
- Account lifecycle still lacks schedule/cancel/suspend/restore, cross-user/owner/subscription guards, real background invocation, bounded failure injection, retry, and purge reconciliation.
- Five-role signup still lacks five UI-created accounts, invalid/duplicate/aborted/provider-failure cases, privileged-field denials, persistence, and responsive flows.
- Youth invitation still lacks fresh invite creation/redemption, modified/expired/reused/wrong-recipient cases, cross-guardian denial, a PII allowlist, persistence, and responsive flows.
- Missing-profile onboarding still lacks dynamic missing/partial profiles, fail-closed route/API checks, all role completions, privileged-field denial, persistence, and responsive flows.
- Demo lifecycle still lacks two fresh anonymous contexts, cross-ID tampering, duplicate launch, billing denial, expiry boundary, scheduled cleanup retry, and partial-failure evidence.
- Dashboard route policy still lacks the complete role/plan/state direct-route and navigation decision table, refresh/new-tab/Back persistence, and both required viewports.
- Administration still lacks directory query/search/sort/target isolation, every non-SA role, claim revocation/restoration, malformed target and rules denial, persistence, and both required viewports.

## Defects found during the exact flow

- `BUG-022` was reproduced when a live Firestore `Timestamp` crashed `/feed` with `RangeError: Invalid time value`. The root fix normalizes live, serialized, ISO, and malformed feed timestamps. Focused regressions and the exact browser flow passed after the repair.
- `BUG-023` was reproduced at the audit integration boundary: fixed historical Team A/B IDs missed run-scoped fixtures. API targets now derive from the seeded catalog IDs, with a focused regression and passing exact rerun.

No coverage-matrix row was promoted by this local run. Staging, mailbox/provider, and background-job evidence remain separate required dimensions.
