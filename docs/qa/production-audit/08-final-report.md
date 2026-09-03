# Phase 2 Functional Audit Report

**Run:** `2026-08-21T232919Z`  
**Commit:** `cc9a3c7ca91c3ee2c2e3f257d3c642ba6a950327`  
**Environment:** local development with isolated Firebase preview  
**Purpose:** defect discovery and coverage diagnosis, with 2026-09-02 and 2026-09-03 follow-ups that resolved the three recorded defects; this report does not declare the application production ready.

## Coverage totals

The matrix contains 88 rows.

| Status | Count |
|---|---:|
| PASS | 3 |
| FAIL | 0 |
| BLOCKED | 85 |
| NOT APPLICABLE | 0 |
| NOT RUN | 0 |

Completed functional-row coverage is `(PASS + FAIL) / all rows = 3 / 88 = 3.4%`. All remaining rows have been explicitly classified BLOCKED rather than left ambiguous. Many blocked rows received partial smoke or automated boundary evidence, but they were not promoted because their complete role, negative, permission, persistence, responsive, provider, or device requirements could not be executed.

## Tested features and roles

Browser testing covered marketing/legal/audience/sport pages, authentication and signup UI, visitor route denial, anonymous demos, Dashboard, Events CRUD, Roster, Chat, Practice, Games, Feed, Files, Facilities, Equipment, Sports Hub browse/search/resources/PDF, embeds, invalid public portal identifiers, responsive layouts, manifest/service worker, and Schedule App rendering.

Roles actually exercised were unauthenticated visitor, anonymous Squad Pro demo coach/staff, anonymous Player demo, and one verified synthetic Coach owner in isolated staging. All remaining registered role/account-state combinations—including parent, adult/youth player, delegated staff/admin, league creator, superadmin, removed, suspended, unverified, and pending deletion—remain blocked without the specified identities and tenant fixtures.

## Resolved audit defects

- BUG-001, P2: Event deletion now presents an event-specific confirmation; Cancel preserves the event.
- BUG-002, P2: At 768×1024, Sports Hub now presents a named compact search control instead of a clipped input.
- BUG-003, P1: A newly verified zero-team Coach now reaches `/teams/new` rather than being redirected to Join & Invite.
- BUG-004, P1: The staging Stripe Connect endpoint now receives signed connected-account test events; the superseded endpoint is disabled after verification.

Open severity totals: P0 0, P1 0, P2 0, P3 0. Historical resolved findings: P1 2, P2 2.

Post-recovery application console-error count: 0. Unexpected network-failure count: 0. One expected HTML time-format warning was generated deliberately during negative testing. Transient Next.js 500s caused by an identified test-harness build/dev collision were discarded and all affected checks rerun.

## Local follow-up confirmation — 2026-09-02

The Firebase Firestore and Storage emulator suite passed 38 of 38 authorization and tenant-boundary tests. Its expected `PERMISSION_DENIED` diagnostics are the negative assertions exercised by the suite, not test failures.

The local checkout has no configured Stripe or Resend QA flow variables: no Stripe test key, price identifiers, Stripe/Connect webhook secrets, Resend API/webhook credentials, or public HTTPS callback URL. Consequently, no real provider checkout, Connect, Resend delivery, or externally delivered webhook was attempted from this machine. This preserves the corresponding matrix rows as `BLOCKED`; configuring those values must use the isolated QA environment and test-mode provider fixtures named in `06-test-account-requirements.md`.

## Staging identity and email confirmation — 2026-09-03

In isolated staging, a synthetic Coach account received the branded verification email at the safe QA mailbox; its link was manually verified. The verified account then exposed a first-team admission defect (BUG-003): its stored profile role was `coach`, but direct `/teams/new` navigation redirected to `/teams/join`. Commit `141edfbd88c88dab9a605049c27a0932308de3ff` corrected the role-specific account-admission destination and deployed as App Hosting build `build-2026-09-03-001`. Rechecking the same verified Coach reached the Launch Squad form at `/teams/new`; no team, payment, or production data was created.

This is valid evidence for one verification-email delivery and Coach setup path only. It does not complete the broader Email, Signup/onboarding, Teams, Stripe, Connect, or webhook matrix rows, whose required negative, permission, persistence, cross-role, responsive, and provider cases remain blocked.

## Staging Stripe and tenant-boundary confirmation — 2026-09-03

All provider activity used `the-squad-v2-staging` and Stripe test mode. The standard and Connect handlers rejected malformed signatures with HTTP 400. A signed standard event completed once. The deployed Connect handler completed one signed event and acknowledged its replay as a duplicate. A real connected-account event then exposed that the existing Connect endpoint did not deliver to the staging ledger; BUG-004 was recorded and repaired by creating one supported current Connect endpoint, securely updating the staging signing secret, and deploying build `build-2026-09-03-002`. Real connected-account `payment_intent.created` and `payment_intent.payment_failed` events subsequently completed once in `stripeConnectWebhookEvents`; only the replacement Connect endpoint remains enabled. No live Stripe data, real payment, payout, or customer record was used.

Two verified synthetic Coach owners each created one Starter team. The protected team-chat context endpoint returned HTTP 200 for each owner's own team and HTTP 403 for the other owner's team in both directions. This is narrow, successful tenant-boundary evidence—not complete coverage of all tenant-scoped data or workflows. At 390×844 mobile emulation, the public staging surface had no horizontal overflow or browser console errors and exposed its manifest and service-worker support. A physical device remains required for FCM delivery and full device certification.

## Blocked and untested depth

Blocked areas include credential account lifecycle; full role and cross-tenant authorization; destructive account/team/institution lifecycle; household/guardian/youth privacy; complete roster and recruiting CRUD; RSVP/attendance/ICS/FCM; practice media; feed/chat/poll multi-session mutations; remaining Resend workflows; uploads/storage URLs; waivers/signatures/incidents; leagues/tournaments/scoring; billing/Stripe/Connect/payments/donations; superadmin management; Firefox/WebKit and physical-device checks; full PWA offline/update/logout behavior; Time Out UI; provider webhooks/background schedules; CI/deploy drift, backup, restore, and rollback.

Required next evidence is named in `06-test-account-requirements.md` and summarized by `B-FIXTURES` in the coverage matrix.

## Evidence paths

- Coverage: `docs/qa/production-audit/05-coverage-matrix.md`
- Defects: `docs/qa/production-audit/07-defect-ledger.md`
- Run records: `docs/qa/production-audit/runs/2026-08-21T232919Z/`
- Browser artifacts: `output/playwright/2026-08-21T232919Z/`
