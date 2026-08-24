# Phase 4 Initial Blocker Assessment

## Assessment rule

This is a value-free inventory derived from `06-test-account-requirements.md` and the baseline environment check. An item is `AVAILABLE` only when its authorized opaque reference is available to this task without credential discovery. No secure external test-account ledger, provider account, device registration, or destructive-test authorization was supplied for this run. Consequently, the listed test fixtures are not authorized for use even where local code or a browser executable is available.

## Required identities

| Fixture | Status | Non-secret reason | Owner |
| --- | --- | --- | --- |
| `qa-coach-owner-a` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-coach-owner-b` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-pro-owner` | NOT AUTHORIZED | No authorized opaque reference and no approved Stripe test fixture were supplied. | Authorized QA/Stripe fixture owner |
| `qa-elite-owner` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-school-owner` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-school-delegate` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-league-owner-a` | NOT AUTHORIZED | No authorized opaque reference and no approved Stripe test fixture were supplied. | Authorized QA/Stripe fixture owner |
| `qa-league-owner-b` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-team-assistant` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-team-member` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-parent-a` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-parent-b` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-adult-player-a` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-adult-player-b` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-youth-invite` | NOT AUTHORIZED | No authorized opaque reference or approved durable mailbox was supplied. | Authorized QA/mailbox owner |
| `qa-youth-active` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-superadmin` | NOT AUTHORIZED | No authorized opaque reference or disposable trusted-claim authorization was supplied. | Authorized platform-admin fixture owner |
| `qa-fake-superadmin` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-unverified` | NOT AUTHORIZED | No authorized opaque reference or approved mailbox was supplied. | Authorized QA/mailbox owner |
| `qa-suspended` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-removed-member` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-pending-delete` | NOT AUTHORIZED | No authorized opaque reference or destructive-test authorization was supplied. | Authorized destructive-test owner |
| `qa-owner-delete-blocked` | NOT AUTHORIZED | No authorized opaque reference or destructive-test authorization was supplied. | Authorized destructive-test owner |
| `qa-multi-org` | NOT AUTHORIZED | No authorized opaque reference from the secure test-account ledger was supplied. | Authorized QA fixture owner |
| `qa-public-submitter` | NOT AUTHORIZED | No authorized opaque reference or approved safe recipient was supplied. | Authorized public-fixture owner |
| `qa-demo-a` | NOT AUTHORIZED | No authorized opaque demo-session reference was supplied. | Authorized demo-fixture owner |
| `qa-demo-b` | NOT AUTHORIZED | No authorized opaque demo-session reference was supplied. | Authorized demo-fixture owner |

## Subscription and tenant fixtures

| Fixture | Status | Non-secret reason | Owner |
| --- | --- | --- | --- |
| `billing-free` | NOT AUTHORIZED | No authorized opaque test owner or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-trialing` | NOT AUTHORIZED | No authorized opaque test owner, Stripe test clock, or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-active-monthly` | NOT AUTHORIZED | No authorized opaque test owner or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-active-annual` | NOT AUTHORIZED | No authorized opaque test owner or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-past-due` | NOT AUTHORIZED | No authorized opaque test owner, Stripe test clock, or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-canceled` | NOT AUTHORIZED | No authorized opaque test owner or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-addon` | NOT AUTHORIZED | No authorized opaque test owner or Stripe configuration was supplied. | Authorized Stripe fixture owner |
| `billing-customer-deleted` | NOT AUTHORIZED | No authorized opaque test owner or destructive-test authorization was supplied. | Authorized destructive-test owner |
| Team A | NOT AUTHORIZED | No authorized opaque tenant reference or confirmed synthetic records were supplied. | Authorized tenant-fixture owner |
| Team B | NOT AUTHORIZED | No authorized opaque tenant reference or confirmed synthetic records were supplied. | Authorized tenant-fixture owner |
| Team C (linked to `qa-parent-a`) | NOT AUTHORIZED | No authorized opaque tenant reference or confirmed synthetic records were supplied. | Authorized tenant-fixture owner |

## Provider and device fixtures

| Fixture | Status | Non-secret reason | Owner |
| --- | --- | --- | --- |
| Firebase Auth isolated project | NOT AUTHORIZED | Hosted Firebase configuration is unavailable in this checkout. | Authorized environment/secrets owner |
| Stripe test products, customers, cards, and clocks | NOT AUTHORIZED | Required Stripe configuration names are unavailable and no approved opaque test reference was supplied. | Authorized Stripe test-config owner |
| Stripe Connect disposable account | NOT AUTHORIZED | Required Connect configuration names are unavailable and no approved opaque test reference was supplied. | Authorized Stripe/Connect test-config owner |
| Resend QA recipients and webhook | NOT AUTHORIZED | Required Resend configuration names are unavailable and no approved safe recipient reference was supplied. | Authorized Resend test-config owner |
| FCM desktop Chrome profile | NOT AUTHORIZED | FCM configuration is unavailable; no approved device-profile reference was supplied; local Playwright Chromium is unavailable. | Authorized FCM/device owner |
| FCM mobile-capable browser/device | NOT AUTHORIZED | FCM configuration is unavailable and no approved device reference was supplied. | Authorized FCM/device owner |
| RSS controlled feed set | NOT AUTHORIZED | No authorized opaque controlled-fixture reference was supplied. | Authorized RSS fixture owner |
| Calendar disposable client or raw HTTP fixture | NOT AUTHORIZED | Calendar configuration is unavailable and no approved opaque fixture reference was supplied. | Authorized calendar fixture owner |
| Playwright Chromium engine | UNAVAILABLE | No local Chromium executable was found in the standard Playwright cache paths. | Local toolchain maintainer |
| Playwright Firefox engine | UNAVAILABLE | No local Firefox executable was found in the standard Playwright cache paths. | Local toolchain maintainer |
| Playwright WebKit engine | AVAILABLE | A local WebKit executable is present; no authenticated fixture use is authorized. | Local toolchain maintainer |

## Destructive and historical fixtures

| Fixture | Status | Non-secret reason | Owner |
| --- | --- | --- | --- |
| Isolated destructive-test authorization | NOT AUTHORIZED | No authorization for destructive Auth, Firestore, Storage, Stripe test, Connect test, or email cleanup operations was supplied. | Authorized destructive-test owner |
| `qa-pending-delete` destructive lifecycle | NOT AUTHORIZED | Depends on the missing destructive-test authorization. | Authorized destructive-test owner |
| `qa-owner-delete-blocked` orphan-prevention lifecycle | NOT AUTHORIZED | Depends on the missing destructive-test authorization. | Authorized destructive-test owner |
| `billing-customer-deleted` lifecycle | NOT AUTHORIZED | Depends on the missing destructive-test authorization and Stripe configuration. | Authorized destructive-test owner |
| Historical label `parent-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `adult-player-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `coach-owner-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `assistant-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `school-owner-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `league-owner-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical label `superadmin-a` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized platform-admin fixture owner |
| Historical label `outsider-b` | UNAVAILABLE | Documentation identifies it as a historical label, not a guaranteed live account. | Authorized QA fixture owner |
| Historical anonymous demos | UNAVAILABLE | Documentation does not confirm that those labels map to live isolated fixtures. | Authorized demo-fixture owner |

## Consequence for later tasks

Local automated evidence may be collected where it does not depend on these fixtures. All coverage requiring a named role, cross-tenant state, provider callback, hosted browser session, FCM-capable device, or destructive lifecycle remains blocked until the corresponding owner supplies an authorized isolated opaque reference and any required configuration.

## Current Phase 4 reassessment

The availability result is unchanged after the focused BUG-001 and BUG-002 replays. Those replays used safe local anonymous/visitor flows and established that the two scoped repairs independently pass, but they did not supply durable registered-role identities, populated cross-tenant records, provider sandboxes, a hosted staging environment, an FCM-capable device, destructive authorization, or operational evidence.

The current matrix therefore contains 88 rows: 3 `PASS`, 0 `FAIL`, 85 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`. No blocked row was promoted. The historical Phase 2 report remains 3 `PASS`, 2 `FAIL`, and 83 `BLOCKED`; BUG-001 and BUG-002 later moved from `FAIL` to `BLOCKED` because their focused repairs pass while their full matrix evidence contracts remain fixture-blocked.

The one-to-one current dependency reason for each of the 85 blocked rows is recorded in `coverage-reconciliation.md`.
