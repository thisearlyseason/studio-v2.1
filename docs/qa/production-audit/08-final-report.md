# Phase 2 Functional Audit Report

**Run:** `2026-08-21T232919Z`  
**Commit:** `cc9a3c7ca91c3ee2c2e3f257d3c642ba6a950327`  
**Environment:** local development with isolated Firebase preview  
**Purpose:** defect discovery and coverage diagnosis, with 2026-09-02 and 2026-09-03 follow-ups that resolved nine defects and deployed the BUG-005 PWA/push repair for device acceptance; this report does not declare the application production ready.

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

Roles exercised were unauthenticated visitor, anonymous Squad Pro demo coach/staff, anonymous Player demo, one verified synthetic Coach owner in isolated staging, and ephemeral local emulator identities for two Coach owners, team assistant/member, two parents, two adult players, a youth player, trusted and profile-only fake superadmins, unverified, disabled, removed-member, pending-deletion, and multi-team states. These local identities improve authorization evidence but do not replace durable hosted/provider/device journeys required by the strict matrix.

## Resolved audit defects

- BUG-001, P2: Event deletion now presents an event-specific confirmation; Cancel preserves the event.
- BUG-002, P2: At 768×1024, Sports Hub now presents a named compact search control instead of a clipped input.
- BUG-003, P1: A newly verified zero-team Coach now reaches `/teams/new` rather than being redirected to Join & Invite.
- BUG-004, P1: The staging Stripe Connect endpoint now receives signed connected-account test events; the superseded endpoint is disabled after verification.
- BUG-005, P1: Chat notification fan-out and primary PWA identity are repaired on staging; physical Android and iPhone/iPad acceptance remains mandatory before this defect is closed.
- BUG-006, P2: Landing support no longer produces repeat Elfsight stylesheet errors; Chrome/Firefox retain the full assistant and Safari/WebKit receives an accessible native support fallback.
- BUG-007, P1: Global superadmin authority now depends on the verified custom claim, not a profile role string.
- BUG-008, P1: Admin SDK APIs and protected server rendering now reject blocked account lifecycle states consistently with the rules boundary.
- BUG-009, P2: Explicit development emulator mode now receives the exact loopback CSP connections required for real-browser audit execution without changing production CSP.
- BUG-010, P1: Private beta/newsletter administrator notifications now exclude profile-only fake superadmins and accept targets only from verified custom-claim identities.

Open severity totals: P0 0, P1 1 pending device acceptance, P2 0, P3 0. Historical resolved findings: P1 5, P2 4.

## Deterministic local identity and tenant follow-up — 2026-09-03

A loopback-only Firebase fixture seeder now builds 16 synthetic identities and two isolated teams in a `demo-*` project. Its random credential exists only for the process lifetime, is never printed or persisted, and the seeder refuses non-loopback emulator hosts. No Stripe, Resend, Firebase production, or other paid provider call is involved.

The complete emulator audit exercised real Auth, Firestore, Storage, Next.js APIs, and Chrome routes. It proved own-team chat access and reciprocal cross-tenant denial, removed-member denial, deletion-pending API denial, disabled Auth denial, unverified browser-session denial, trusted custom-claim superadmin access, profile-only fake-superadmin denial, parent `/family` routing, and adult-player family denial. The focused regression suite passed 18 of 18 checks, typecheck completed successfully, and scoped lint reported zero errors. These results add partial evidence to strict rows; they do not turn any row PASS where lifecycle transitions, full feature behavior, responsive/device coverage, provider delivery, or hosted persistence remain unexecuted.

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

## PWA and cross-platform push repair — 2026-09-03

BUG-005 was traced to two independent defects: the team-chat message route stored messages without dispatching any push notification, and the primary application did not register the service worker. The repair adds FCM and standards Web Push device registration, authenticated bounded storage, server-side recipient fan-out after successful chat persistence, active-membership filtering, sender exclusion, provider-expiry cleanup, transport-neutral opt-in/out, and an iPhone/iPad-compatible Push API fallback. The root manifest now identifies The Squad, starts at `/dashboard`, and provides valid 192/512 PNG icons. The root worker precaches only public manifest/icon/offline assets and never caches personalized dashboard or API responses.

Separate staging Web Push VAPID credentials were generated directly into Secret Manager and granted only to the App Hosting backend; no key material was printed or committed. Local `npm run verify` passed 395 application tests, 38 rules tests, typecheck, lint with zero errors, the Next.js production build, and the Functions build. Protected GitHub staging workflow `33760676821` passed verification, infrastructure deployment, rollout, and health checks for application commit `90a600b1`. Hosted HTTP checks passed for health, manifest, worker, offline shell, and both icons. A clean Chromium session discovered `/manifest.json`, reported a root-scoped active controlling worker using the staging Firebase configuration, and produced zero console errors or warnings.

The release dependency gate also identified and updated vulnerable transitive Browserslist, PostCSS selector-parser, and Functions `qs` versions through the lockfiles. Both application and Functions production-dependency audits now report zero vulnerabilities.

This evidence verifies the implementation, deployment path, and hosted PWA resources. It does not substitute for physical Android and iPhone/iPad notification receipt, click-through, opt-out, update, and reinstall behavior. The Push and PWA rows therefore remain `BLOCKED`, and production promotion is not authorized by this report until those device checks pass on the combined release candidate.

## Cross-browser landing support follow-up — 2026-09-03

Installing the required Firefox and WebKit engines exposed BUG-006: the Elfsight AI Chatbot vendor bundle emitted five styled-components error 17 messages on clean Chromium and WebKit landing-page loads. Removing lazy initialization made the full assistant console-clean in Chromium and Firefox. Because the vendor's Safari/WebKit path remained faulty, Safari and iOS WebKit now receive a native, keyboard-accessible support mail link and do not load the Elfsight bundle.

Protected staging workflow `33789859140` deployed application commit `febfbf2002b294d1edb4dbd40deaa44ae821cb00` after passing 397 application tests, 38 rules tests, typechecks, lint with zero errors, production builds, infrastructure deployment, App Hosting rollout, and health checks. On that exact hosted revision, clean Chrome and Firefox sessions opened the `Squad Assistant` dialog and exposed its message textbox with zero console errors. A clean WebKit session exposed one `Contact The Squad support` link, loaded zero Elfsight scripts, and reported zero console errors. Desktop and 390x844 checks had no horizontal overflow. Firefox produced one browser-level OpaqueResponseBlocking warning for an external Unsplash image that nevertheless returned HTTP 200; it was not an application error or failed request.

## Blocked and untested depth

Blocked areas include credential account lifecycle; full role and cross-tenant authorization; destructive account/team/institution lifecycle; household/guardian/youth privacy; complete roster and recruiting CRUD; RSVP/attendance/ICS/FCM; practice media; feed/chat/poll multi-session mutations; remaining Resend workflows; uploads/storage URLs; waivers/signatures/incidents; leagues/tournaments/scoring; billing/Stripe/Connect/payments/donations; superadmin management; authenticated Firefox/WebKit journeys and physical-device checks; full PWA offline/update/logout behavior; Time Out UI; provider webhooks/background schedules; CI/deploy drift, backup, restore, and rollback.

Required next evidence is named in `06-test-account-requirements.md` and summarized by `B-FIXTURES` in the coverage matrix.

## Evidence paths

- Coverage: `docs/qa/production-audit/05-coverage-matrix.md`
- Defects: `docs/qa/production-audit/07-defect-ledger.md`
- Run records: `docs/qa/production-audit/runs/2026-08-21T232919Z/`
- Browser artifacts: `output/playwright/2026-08-21T232919Z/`
