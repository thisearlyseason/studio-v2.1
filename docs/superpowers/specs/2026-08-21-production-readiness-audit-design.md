# Production-Readiness Audit Design

**Date:** 2026-08-21
**Status:** Approved for Phase 1 documentation
**Repository:** `studio-v2.1`

## Purpose

Create an evidence-backed, execution-ready QA model for The Squad without changing application code, running the full browser audit, fixing defects, deploying, or mutating production/provider data.

## Source-of-truth order

1. Current application source, Firebase rules, server guards, API handlers, and deployment configuration.
2. Current automated tests and CI workflows.
3. Current operational and product documentation.
4. Historical QA reports and browser artifacts, used only to identify likely workflows and known gaps.

Documentation does not override contradictory code. Prior PASS, FIXED, or release-signoff labels do not transfer into this audit's coverage matrix.

## Repository baseline

- Next.js 15 App Router application with 87 `page.tsx` files, 79 API `route.ts` files, and 31 layouts.
- Firebase Authentication, Firestore, Storage, Cloud Functions, App Hosting staging, and Vercel production deployment.
- Stripe subscriptions, Stripe Connect, Resend email/webhooks, FCM browser notifications, RSS ingestion, and ICS calendar delivery.
- Seven stored global roles plus unauthenticated/public and anonymous demo access models.
- Team-local owner, `Admin`, `Member`, staff-position, parent/guardian, and player authority.
- Five canonical commercial plans: `free`, `team`, `elite`, `league`, and `school`.
- 59 Node test files plus Firebase emulator rules tests and generated TestSprite browser references.
- Three scheduled functions: expired-deletion purge, anonymous-demo cleanup, and upcoming-event reminders.

## Deliverables

The audit model is split into six documents under `docs/qa/production-audit/`:

1. `01-application-inventory.md` — repository baseline, routes, feature families, user surfaces, APIs, integrations, and unfinished/disabled behavior.
2. `02-role-permission-matrix.md` — global and local roles, records, CRUD authority, forbidden access, and backend enforcement targets.
3. `03-critical-user-journeys.md` — material end-to-end workflows with preconditions, steps, mutations, dependencies, and risk.
4. `04-risk-register.md` — architecture/business risks classified CRITICAL/HIGH/MEDIUM/LOW with required evidence.
5. `05-coverage-matrix.md` — master feature-role ledger with happy, negative, permission, console, network, responsive, status, bug, and notes columns.
6. `06-test-account-requirements.md` — synthetic identities, tenant fixtures, provider fixtures, states, and secret-handling constraints.

The execution plan is saved to `docs/superpowers/plans/2026-08-21-production-readiness-audit.md`.

## Feature taxonomy

The coverage model uses 30 major feature families:

1. Marketing, legal, audience, and sport landing pages
2. Authentication, sessions, and account lifecycle
3. Signup, onboarding, verification, and demos
4. Dashboard, navigation, alerts, and team context
5. Team creation, joining, switching, and settings
6. Club, school, and organization management
7. Roster, membership, guardians, and attendance
8. Athlete recruiting and public scout profiles
9. Events, schedules, calendars, RSVP, reminders, and ICS
10. Practice, drills, playbooks, video, and coach marks
11. Feed, chat, comments, polls, and broadcasts
12. Email, newsletters, push notifications, and preferences
13. Files, uploads, downloads, and document library
14. Waivers, registration forms, signatures, and compliance
15. Safety and incident management
16. Games, standings, and team scorekeeping
17. League creation, scheduling, registration, and portals
18. Tournament creation, scheduling, registration, and portals
19. Family Hub, children, household schedule, and balances
20. Plans, checkout, subscriptions, add-ons, and customer portal
21. Stripe Connect, payment items, and offline household payments
22. Fundraising and donations
23. Volunteer opportunities and public signup
24. Facilities, fields, availability, and deletion
25. Equipment inventory and assignments
26. Sports Hub articles, resources, templates, search, RSS, and PDFs
27. Public and embedded portals
28. Platform administration, beta, newsletters, and bug reports
29. PWA/service worker, offline schedule companion, and Time Out game
30. Webhooks, background processing, health, deployment, and operations

## Status model

- `NOT RUN` — default Phase 1 status; no current audit execution evidence.
- `BLOCKED` — execution requires a missing safe account, fixture, provider sandbox, device, environment, or authorization.
- `NOT APPLICABLE` — a dimension does not apply, with a reason in Notes.
- `PASS` and `FAIL` are reserved for Phase 2 execution and require recorded evidence.

No Phase 1 row may be marked PASS.

## Evidence contract for Phase 2

Every executed scenario records environment, build/commit, role, tenant, starting state, exact route, actions, expected result, actual result, resulting data, console errors, relevant requests/responses, screenshot or trace path, tester, and timestamp. Destructive and provider scenarios additionally record cleanup or rollback.

## Testing boundaries

- Use local emulators or an isolated non-production Firebase project for writes.
- Use Stripe test mode only; never create a live charge, refund, dispute, or payout.
- Use approved QA mailboxes and Resend test/sandbox delivery only.
- Never print passwords, tokens, API keys, webhook secrets, cookies, or raw service-account material.
- Do not use real customer, athlete, guardian, medical, financial, or payment data.
- Production is read-only unless a later phase grants explicit, scenario-specific authority.
- Identifier-tampering tests must use two synthetic tenants and must never target production records.
- Full browser testing begins only in Phase 2.

## Parallel-domain design

Independent agents may cover authentication/accounts; team/organization/roster; schedules/practice/communications; leagues/tournaments/public portals; billing/payments/fundraising; family/recruiting/compliance; content/admin/notifications; and infrastructure/security/operations. Each agent owns its routes, roles, test data, and evidence bundle. Shared bootstrap, account fixtures, and bug IDs are centrally coordinated to prevent duplicate execution.

## Completion criteria

Phase 1 is complete when all six audit documents and the execution plan exist; every feature family has coverage rows; each CRITICAL/HIGH risk maps to explicit tests; each critical journey names accounts, data, routes, APIs, and expected mutations; the plan has small verifiable tasks; and placeholder/consistency scans pass. Application correctness is not asserted by Phase 1 completion.
