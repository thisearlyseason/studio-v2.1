# Final Production Certification Design

**Date:** 2026-09-04
**Status:** Approved for implementation planning
**Source of truth:** `docs/qa/production-audit/05-coverage-matrix.md`

## Objective

Resolve only the 81 rows currently marked `BLOCKED`, preserve the six established `PASS` rows and the one retired `NOT APPLICABLE` row, repair every newly reproduced defect, and produce an evidence-backed production decision for the exact release candidate.

## Certification Boundary

- Production remains read-only until a separately authorized promotion.
- Destructive lifecycle work uses disposable Firebase Auth, Firestore, and Storage records in emulators or `the-squad-v2-staging`.
- Billing uses Stripe test mode, test clocks, test cards, and a disposable test connected account. No payout or live-mode object is permitted.
- Email uses synthetic recipients at the approved QA mailbox/domain. Secrets, action links, cookies, and raw provider payloads are not retained in artifacts.
- Browser automation uses the repository Playwright CLI wrapper. Physical-device results must come from the named real Android or iPhone/iPad device and cannot be replaced by browser emulation.
- A row becomes `PASS` only after its happy path, negative path, permission boundary, persistence, console/network, and applicable responsive checks have fresh evidence.
- A discovered failure immediately receives a defect ID and remains `FAIL` until a red-green regression and exact browser/provider/device retest pass.

## Execution Architecture

### Workstream 1: Deterministic fixture platform

Extend the existing Phase 2 emulator fixtures from two basic tenants into the full synthetic identity, role, subscription, organization, league, tournament, household, media, and lifecycle data set described by `06-test-account-requirements.md`. Fixture creation and cleanup remain idempotent, reject non-isolated projects, and emit opaque aliases rather than credentials. The same scenario catalog drives local Playwright setup and safe staging fixture provisioning so evidence is comparable across environments.

### Workstream 2: Identity, tenant, and core team operations

Complete Authentication, Account lifecycle, Signup/onboarding, Dashboard policy, Teams, Organization, Roster, Recruiting, Family, and Administration rows. Tests cover active and blocked identities, every remaining role, direct-route/API denial, two-way tenant isolation, destructive owner invariants, session revocation, mobile/desktop layouts, and durable staging persistence where required.

### Workstream 3: Scheduling, communication, files, and compliance

Complete Events, Calendar, Attendance, Reminders, Practice, Feed, Chat, Polls, Email, Newsletter, Push, Files, Forms, Waivers, Safety, Facilities, Equipment, Sports Hub, and PWA rows. Concurrency and retry cases use deterministic barriers or function invocation controls. Upload checks include size, MIME spoofing, visibility changes, deletion, and revoked access. Notification evidence distinguishes application state, provider acceptance, and physical-device delivery.

### Workstream 4: Competition and public surfaces

Complete Games, Leagues, Tournaments, Public portals, Embeds, Volunteers, Fundraising, and Donations. Fully populated synthetic competitions cover draft/published states, schedule conflicts, score transitions, downstream bracket dependencies, public projection allowlists, registration duplication, origin policy, private-ledger separation, and mobile/desktop or embed containment.

### Workstream 5: Billing and provider lifecycle

Complete Billing, Stripe Connect, Payments, Donations, and Stripe/Resend webhook rows with existing staging secrets accessed only inside authorized processes. Stripe test clocks cover trial, monthly, annual, past-due, cancellation, reactivation, add-on quantity, customer deletion, replay, out-of-order delivery, and failed processing recovery. Connect covers onboarding abandonment/retry and team ownership. Resend covers accepted, delivered, failed, replayed, forged, and unrelated-message callbacks with recipient isolation.

### Workstream 6: Background jobs, devices, and operations

Complete projection, membership-cache, demo expiry, deletion purge, reminder, CI/deployment, drift, backup, restore, and rollback evidence. Android covers permission denial, opt-out, stale subscription, logout/user-switch privacy, sender exclusion, removed member, multi-device targeting, update, offline, and corrupt cache. iPhone/iPad covers install identity, update, foreground/background/closed delivery, tap-through, permission denial, opt-out, logout/user-switch privacy, and offline shell behavior.

## Defect Workflow

For every observed defect:

1. Preserve a minimal reproduction with role, tenant, route, response, and artifact.
2. Use systematic debugging to identify the first incorrect state transition or boundary.
3. Add a regression that fails against the defective implementation.
4. Implement the smallest root-cause repair.
5. Prove the regression passes and would fail again without the repair.
6. Retest the original journey through Playwright, provider callback, scheduler, or physical device.
7. Rerun only related shared-component and critical permission journeys.
8. Record the defect and evidence without exposing protected data.

## Evidence Layout

Each certification batch writes a run record under `docs/qa/production-audit/runs/2026-09-04-final-certification/` and browser artifacts under `output/playwright/2026-09-04-final-certification/`. The coverage matrix remains the authoritative status ledger. Each row note identifies the exact run record, environment, role, tenant alias, commit/revision, and cleanup result.

## Release Gate

After all executable rows have evidence and all discovered defects are repaired:

1. Run focused regressions for changed behavior.
2. Run the full Playwright critical and changed-surface regression set.
3. Run `npm run verify`.
4. Run root and Functions production dependency audits.
5. Run `git diff --check` and confirm a clean tracked state after commits.
6. Push the exact candidate and require every protected release job to pass.
7. Deploy that exact candidate through the protected staging workflow.
8. Verify health revision, rules/Functions inventory, manifest/worker, provider callbacks, and critical authenticated/public journeys.
9. Perform and document a staging rollback and restoration drill.
10. Reconcile the coverage matrix, defect ledger, final report, and release checklist.

## Acceptance Criteria

- All 88 coverage rows have supported final classifications.
- No important row remains `BLOCKED`, `FAIL`, or unclassified.
- Every applicable role and plan has happy, negative, permission, persistence, network/console, and responsive evidence.
- Stripe, Connect, Resend, Web Push, background functions, and scheduled jobs have isolated provider evidence.
- Android and iPhone/iPad have the required physical-device acceptance.
- All P0/P1 defects are resolved with regressions and exact-journey retests.
- The full local gate, protected release gate, production builds, dependency audits, exact staging deployment, and rollback/restoration drill pass.
- Audit documents agree on the exact commit, staging revision, remaining issues, and production decision.
- Production certification is granted only when every preceding criterion is supported by fresh evidence.
