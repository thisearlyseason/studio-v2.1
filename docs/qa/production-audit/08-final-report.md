# Phase 2 Functional Audit Report

**Run:** `2026-08-21T232919Z`\
**Commit:** `cc9a3c7ca91c3ee2c2e3f257d3c642ba6a950327`\
**Environment:** local development with isolated Firebase preview\
**Purpose:** defect discovery and coverage diagnosis; this report does not declare the application production ready.

## Coverage totals

The matrix contains 88 rows.

| Status | Count |
|---|---:|
| PASS | 3 |
| FAIL | 2 |
| BLOCKED | 83 |
| NOT APPLICABLE | 0 |
| NOT RUN | 0 |

Completed functional-row coverage is `(PASS + FAIL) / all rows = 5 / 88 = 5.7%`. All remaining rows have been explicitly classified BLOCKED rather than left ambiguous. Many blocked rows received partial smoke or automated boundary evidence, but they were not promoted because their complete role, negative, permission, persistence, responsive, provider, or device requirements could not be executed.

## Tested features and roles

Browser testing covered marketing/legal/audience/sport pages, authentication and signup UI, visitor route denial, anonymous demos, Dashboard, Events CRUD, Roster, Chat, Practice, Games, Feed, Files, Facilities, Equipment, Sports Hub browse/search/resources/PDF, embeds, invalid public portal identifiers, responsive layouts, manifest/service worker, and Schedule App rendering.

Roles actually exercised were unauthenticated visitor, anonymous Squad Pro demo coach/staff, and anonymous Player demo. All registered role/account-state combinations—including parent, adult/youth player, coach owner, delegated staff/admin, league creator, superadmin, removed, suspended, unverified, and pending deletion—remain blocked without the specified identities and tenant fixtures.

## Defects

- BUG-001, P2: event deletion executes without confirmation.
- BUG-002, P2: Sports Hub header search is unusably clipped at 768×1024.

Severity totals: P0 0, P1 0, P2 2, P3 0.

Post-recovery application console-error count: 0. Unexpected network-failure count: 0. One expected HTML time-format warning was generated deliberately during negative testing. Transient Next.js 500s caused by an identified test-harness build/dev collision were discarded and all affected checks rerun.

## Blocked and untested depth

Blocked areas include credential account lifecycle; full role and cross-tenant authorization; destructive account/team/institution lifecycle; household/guardian/youth privacy; complete roster and recruiting CRUD; RSVP/attendance/ICS/FCM; practice media; feed/chat/poll multi-session mutations; Resend; uploads/storage URLs; waivers/signatures/incidents; leagues/tournaments/scoring; billing/Stripe/Connect/payments/donations; superadmin management; Firefox/WebKit and physical-device checks; full PWA offline/update/logout behavior; Time Out UI; provider webhooks/background schedules; CI/deploy drift, backup, restore, and rollback.

Required next evidence is named in `06-test-account-requirements.md` and summarized by `B-FIXTURES` in the coverage matrix.

## Evidence paths

- Coverage: `docs/qa/production-audit/05-coverage-matrix.md`
- Defects: `docs/qa/production-audit/07-defect-ledger.md`
- Run records: `docs/qa/production-audit/runs/2026-08-21T232919Z/`
- Browser artifacts: `output/playwright/2026-08-21T232919Z/`
