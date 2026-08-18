# Master Application Audit - 2026-08-16

## Executive result

**CONDITIONAL PASS. The 2026-08-18 staging release candidate is code- and deployment-ready; production promotion is held only for action-time provider delivery confirmations.**

The repository and the exercised production demo paths are mechanically healthy. The application builds, type-checks, and passes the full unit/integration suite. The production Squad Pro demo loaded without console errors across the dashboard and the core coach modules tested. Continued workflow testing confirmed and fixed the navigation mismatch, an empty Parent Demo bootstrap failure, inconsistent public tournament standings, incomplete tournament replication, unreachable archival, discarded waiver dates, and registration return-path loss.

This audit accounts for every feature family in `FEATURES.md`, all 87 application pages, all 78 API route files (103 exported HTTP handlers), seven global roles, team-local positions, account states, and five commercial plans. The original 2026-08-16 provider and durable-identity limitations remain historical baseline evidence; the completion addendum below records the current release-candidate state.

### 2026-08-18 completion addendum

- Candidate commit `d1e4a11d0a242a7dda57c571500c59b110910a9a` passed the complete local gate and GitHub release gate [32179685043](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32179685043).
- Protected staging deploy [32180024465](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32180024465) deployed that exact SHA successfully, including indexes, Functions, Firestore/Storage rules, App Hosting rollout, and health verification.
- Staging health returned HTTP 200 for revision `studio-build-2026-08-18-003`. Anonymous `/dashboard` and `/admin` returned HTTP 307 to login with preserved return paths.
- A verified, claim-controlled staging Super Admin session persisted through refresh. Accounts, Users Directory, Beta Apps, Bug Reports, Newsletters, Sports Hub, and Links & Embeds all loaded at both 390x844 and 1440x900 with no horizontal document overflow.
- The two final mobile defects are closed: Bug Reports controls fit inside the 390 px viewport, and Newsletter Compose/New Subscriber/Subscribers controls render as three full-width stacked controls on mobile.
- Squad Pro demo billing now reports `Pro Team` with `Demo plan`; the incorrect `Free tier` fallback is fixed and regression-covered.
- Standard Stripe, Stripe Connect, and Resend callback routes reject invalid signatures with HTTP 400. Staging provider configuration is structurally valid: Stripe is test mode, ten configured prices are active CAD recurring prices, the Resend domain is verified, and required secret names exist without exposing values.
- Signed Stripe delivery passed: test-mode event `evt_1U5uUSGu1UxxOYbPNwVyQjQX` (`customer.created`, `livemode=false`) reached the newer standard staging endpoint and its post-signature Firestore ledger record completed once on attempt 1.
- Resend delivery passed: authorized staging email `9ca57dfb-7e92-45a2-8dd1-630e04e29526` reached provider state `delivered`; staging recorded `email.delivered` and completed signed delivery `msg_3I6cDXPZ37cC1xxn3rz40EJN7wV` once on attempt 1.
- Remaining production hold: obtain explicit action-time authorization for one FCM push/permission request and disabling the two older duplicate staging Stripe endpoints now that signed traffic is proven. No production provider endpoint is authorized for change.

## Scope and evidence

- Source and documentation: all repository Markdown inventories, manuals, QA plans, prior audit reports, environment notes, release runbooks, route trees, API handlers, Firebase rules, Storage rules, and automated tests.
- Automated baseline: 355 unit/integration tests passed; TypeScript passed; production build passed with 563 generated pages; lint exited zero with the existing warning backlog.
- Rules baseline: Firestore and Storage emulator suite rerun. The first attempt was blocked by transient port contention; the clean retry result is recorded below.
- Browser baseline: deployed production at `https://www.thesquad.pro`, using isolated anonymous demo data only.
- Browser roles exercised in this pass: unauthenticated visitor and Squad Pro coach demo. Prior dated evidence covers parent, player, school administrator, and league creator demos.
- No real customer data, charge, refund, email, push delivery, or destructive production operation was attempted.

## Roles and access models

| Role or access model | Status | Evidence |
|---|---|---|
| Unauthenticated visitor | PASS | `/admin` redirected to sign-in; login rendered without console errors or horizontal overflow. |
| Coach / team organizer | PASS WITH FIX | Squad Pro demo provisioned; dashboard and 13 team modules loaded; restricted Competition Hub navigation mismatch fixed locally. |
| Parent / guardian | PARTIAL WITH FIX | A fresh production Parent Demo reproduced an empty household. Root cause was fixed locally with regression coverage; production retest awaits deployment. Prior two-child waiver and schedule isolation passed. |
| Adult player | PARTIAL | Prior dashboard, responsive layout, and staff-route denial passed; full self-service lifecycle remains incomplete. |
| Youth player | BLOCKED | Invitation-only identity requires a durable mailbox and invite acceptance session. Policy and rules are automated. |
| School / club administrator | PARTIAL | Prior school demo and `/admin` denial passed; delegated-admin invitation and revocation need durable identities. |
| League organizer | PARTIAL | Prior free demo league create/edit/persistence/quota passed; full registration, forms, finance, scoring, and portal lifecycle remains incomplete. |
| Platform superadmin | PASS | A verified claim-controlled staging identity persisted through refresh and exercised all seven Super Admin sections at desktop and mobile widths without horizontal overflow. |
| Team-local owner/admin/staff | PARTIAL | Shared staff-authority and ownership policies pass automated tests; not every position was exercised as a separate browser identity. |
| Parent/guardian/player/member positions | PARTIAL | Role classification, removal denial, and audience filtering pass automated tests; full multi-user browser matrix remains incomplete. |
| Demo persona | PASS | Anonymous session-scoped Squad Pro demo seeded and loaded with no observed cross-session data. |

## Feature coverage inventory

| Feature family | Status | Audit result |
|---|---|---|
| Authentication, verification, sessions, password reset, account lifecycle | PARTIAL | Policy tests pass. Anonymous protected-route redirect passed. Real verification/reset email, disabled-user, recovery, and multi-tab logout remain blocked. |
| Dashboards, navigation, alerts, active squad switching | FIXED | Dashboard and priority alert passed. Competition Hub was visible to a Pro coach but route policy redirected it; navigation now uses the route policy. |
| Team and organization management | PARTIAL | Creation, capacity, join-role derivation, seat allocation, and organization policy are automated. Full invite/join/leave/decline and multi-team browser lifecycle remains open. |
| Roster, athletes, guardians, recruiting | PARTIAL | Coach roster loaded; player-link, guardian, recruiting projection, and private-data tests pass. Full create/edit/remove/upgrade/archive browser lifecycle remains open. |
| Scheduling, calendar, events, RSVP, availability | PASS WITH GAPS | Coach Schedule loaded on phone width; prior create/edit/refresh persistence passed. Recurrence, timezone permutations, cancellation, conflict, RSVP concurrency, and reminders are not fully UI-certified. |
| Practice, drills, playbooks, film, attendance | PARTIAL | Practice and Coaches Corner loaded. Algorithms and entitlements pass automated tests. Full content CRUD, upload, annotation, reorder, assignment, and watch compliance remain open. |
| Feed, chat, polls, broadcasts, notifications | PARTIAL | Feed and chat hubs loaded; Parent Feed Comments toggled, persisted after refresh, and was restored. A tactical message sent successfully, but refresh persistence was interrupted by demo expiry. Channel creation remains manual review because browser-control actions timed out before dispatch. |
| Files, waivers, forms, signatures, compliance, safety | PARTIAL | Library and Coaches Corner loaded; upload policy, waiver endpoint, public projection, and prior child-specific signing pass. General form builder, file lifecycle, and every compliance role remain open. |
| Games and team scorekeeping | PARTIAL | Scorekeeping loaded and bracket/standings logic passes. Full score create/edit/reset and cross-client propagation remain open. |
| League management and portals | PARTIAL | Scheduling, fairness, scoring, public DTO, enrollment, and authorization tests pass; prior league demo CRUD passed. Full UI lifecycle and multi-user portal certification remain open. |
| Tournament management and portals | PASS WITH GAPS | Public standings now share the canonical 3/1/0 calculator; replication preserves the full blueprint; archive is reachable; waiver dates persist; registration returns to its launching hub. Populated UI runs for every format remain open. |
| Family Hub | PARTIAL WITH FIX | Fresh production Parent Demo showed 0 players, teams, payments, waivers, and events. The protected demo league overwrite that aborted rich seeding is fixed locally. Direct coach access correctly redirected; deployed production retest remains open. |
| Billing, subscriptions, Stripe Connect, household payments | PARTIAL / PROVIDER HOLD | Policy, idempotency, entitlement, webhook, seat, offline-payment, test-mode configuration, price catalog, invalid-signature rejection, and demo plan display pass. Signed Stripe delivery and a controlled test transaction still require action-time authorization. |
| Fundraising and public donations | PARTIAL | Coach fundraising page loaded; validation and Stripe-link security are automated. Publish/donate/cancel/refund lifecycle remains blocked or incomplete. |
| Volunteers and public signup | PARTIAL | Coach volunteer page loaded; server validation is automated. Capacity, completion, public signup, notification, and concurrent claims need UI certification. |
| Facilities and equipment | PASS WITH GAPS | Both coach pages loaded without errors. Prior facility enroll/add/rename/conflict-delete smoke passed; availability, double booking, assignment, and full equipment CRUD remain open. |
| Sports Hub, articles, resources, templates, RSS | PASS WITH GAPS | Static generation and content completeness are automated; hundreds of pages built. Admin publishing, RSS refresh, and every download were not manually exercised. |
| Public registration, donation, volunteer, recruiting, scoring portals | PARTIAL | Projection whitelists, entitlement, noindex, request validation, and private-field exclusion pass automated tests. Valid end-to-end submissions for every portal remain open. |
| Marketing, audience, sport, embed, legal, safety, how-to pages | PASS WITH GAPS | Static generation, sitemap, metadata, embed framing, and content tests pass. Full browser/device/accessibility sweep remains open. |
| Demo environments and cleanup | PASS WITH GAPS | Squad Pro demo seeded and persisted. Parent Demo rich seeding failed because its browser batch overwrote protected server league fields; protected team/league roots now merge. Production Parent Demo retest awaits deployment; expiry cleanup can still produce a recoverable 403. |
| Platform administration | PASS | Anonymous access is denied; an authenticated Super Admin exercised all seven sections on desktop and 390 px mobile, including the repaired Bug Reports and Newsletter layouts. |
| Health, email/webhooks, scheduled operations | PARTIAL / PROVIDER HOLD | Staging health and deployment pass; Stripe/Connect/Resend endpoints reject invalid signatures; Resend domain and webhook configuration are valid. One real staging email and one FCM device delivery require action-time authorization. |
| Security, privacy, reliability, accessibility | PASS WITH GAPS | Auth, tenant, projection, input, SSRF, webhook, upload, and rule tests cover high-risk boundaries. Exhaustive browser ID manipulation and a complete accessibility/device matrix remain open. |
| Offline schedule companion and Time Out game | PARTIAL | Core storage/game behavior is automated. Full offline install/sync/recovery and device interaction were not manually certified. |

## Confirmed findings

### MEDIUM - Coach navigation exposed a route the route policy denied - FIXED

- Affected users: Pro Team coaches and team organizers without a league, school, or league-creator entitlement.
- Reproduction: launch Squad Pro demo; observe **Competition Hub** in navigation; open `/competition`.
- Expected: navigation contains only accessible destinations, or the destination provides an explanatory locked state.
- Observed: the shared shell advertised Competition Hub, but middleware redirected the coach to `/dashboard` without explanation.
- Root cause: `Shell.tsx` built navigation independently from `authorizeDashboardRoute`, while the route policy intentionally limits Competition Hub to superadmins, league creators, and eligible league/school management accounts.
- Fix: the shared navigation filter now invokes `authorizeDashboardRoute` with the current role, plan, and institution-authority context.
- Regression: `dashboard-route-policy.test.mjs` asserts that shared navigation uses the route policy; focused test and TypeScript check pass.

### HIGH - Parent Demo rich blueprint aborted after deleting memberships - FIXED LOCALLY

- Reproduction: launch a fresh production Parent Demo and open Family Hub.
- Observed: 0 players, 0 teams, $0 outstanding, 0 waivers, no events, and the empty-household onboarding state persisted after refresh.
- Root cause: the server created protected demo team and league roots, then client preflight deleted the shell memberships. The first rich-seed batch overwrote the league without merge, dropping protected `demoSessionOwnerId` and `demoSeeded`; Firestore rejected the atomic batch before replacement memberships or children were created.
- Fix: `BatchHelper` now merges both protected `teams/*` and `leagues/*` demo roots, preserving server authority markers.
- Regression: focused bootstrap/merge tests and TypeScript pass. Production UI retest is pending deployment.

### HIGH - Tournament replication discarded scheduling blueprint - FIXED

- Observed: **Replicate Series** omitted description, sport/division, game and break lengths, per-team limits, pools, daily windows, selected fields/manual venue, waiver configuration, and persisted state markers while claiming the blueprint was cloned.
- Fix: replication now carries the complete source blueprint and explicitly resets only identity, roster, games, schedule, completion, and archive state.
- Regression: `competition-workflows.test.mjs` asserts blueprint preservation and operational reset.

### HIGH - Tournament archival existed but had no reachable control - FIXED

- Root cause: `handleArchive` was implemented inside the edit dialog but never bound to the wizard or detail actions.
- Fix: active tournaments expose **Archive Series** in the edit workflow and retain the existing confirmation and server-mediated archive request.

### MEDIUM - Tournament public workflow inconsistencies - FIXED

- Both public tournament views now use the canonical 3/1/0 standings calculator and tie-break contract.
- Tournament waiver submission now validates and persists the signer-entered `signedDate` alongside authoritative server `signedAt`, limits signer length, and displays submission errors.
- Registration opened from Competition Hub now returns to Competition Hub; Manage Tournaments retains its own return path.

### MEDIUM - Provider delivery evidence requires action-time approval - OPEN / NARROWED

- Affected users: all paying accounts, finance staff, registrants, newsletter recipients, and push-enabled users.
- Expected: test-mode checkout, Connect, refunds, failures, receipts, webhook replay, email delivery, unsubscribe, and push delivery are proven in isolated staging.
- Observed: staging credentials and endpoints are configured; Stripe test prices, Resend domain/webhook, secret presence, invalid-signature rejection, one signed Stripe delivery, and one delivered email with signed callback are verified. One push and duplicate staging endpoint cleanup remain intentionally unexecuted pending action-time approval.
- Next action: execute the four explicitly listed confirmations in `RELEASE_CHECKLIST.md`; retain signed delivery evidence before disabling only the older duplicate staging endpoints.

### MEDIUM - Lint warning volume masks regressions - OPEN

- Affected users: engineering and indirectly all users through maintenance risk.
- Observed: lint exits zero with 1,869 warnings, including hook dependency, unused code, broad `any`, and image optimization warnings.
- Next action: establish a warning baseline and ratchet it downward; treat new hook and correctness warnings as CI failures.

### LOW - Demo exit cleanup can return 403 - OPEN

- Affected users: demo personas at expiry or manual exit.
- Observed in prior audit: `/api/demo/exit` may return 403 before local session deletion and redirect succeed.
- Next action: make cleanup tolerant of a just-expired/revoked anonymous token without weakening session ownership checks.

### LOW - Browser sign-out control could not be completed by automation - MANUAL REVIEW

- Affected path: Squad Pro demo Settings.
- Observed: the visible enabled **Sign Out** control did not complete within the browser automation action deadline; no console error was emitted.
- Interpretation: automation limitation or slow asynchronous cleanup is possible; this is not classified as a confirmed product bug without a manual reproduction.
- Next action: manually test sign-out, cleanup response, redirect, reload, and back-button behavior.

## Security and permission findings

- New security testing confirmed and locally fixed two high-severity authorization classes: mutable player/team fields allowed cross-tenant player takeover, and self-assigned profile linkage could inherit another tenant's staff authority. Removed staff records also retained staff writes because the shared staff predicate omitted active-membership checks.
- Anonymous access to `/admin` redirected to login with an expired-session reason and return path.
- The production coach demo could access staff modules and was denied the policy-restricted Competition Hub.
- Automated coverage passes for revoked tokens, missing profiles/memberships, join-role escalation, cross-tenant team access, removed members, private recruiting DTOs, public portal field whitelists, webhook signatures/idempotency, bounded JSON, SSRF protection, safe URLs, file MIME/size policy, finance authorization, and server-owned billing fields.
- Previously critical public recruiting disclosure and guardian update inconsistency remain recorded as fixed with emulator tests in `SECURITY_AUDIT.md`.
- Remaining security work: authenticated cross-tenant identifier manipulation against every mutation route, durable-role browser tests, private-file URL expiry/access checks, CSRF review for every cookie-authenticated mutation, and production rule/index drift verification.

### CRITICAL - Cross-tenant player takeover through mutable authority fields - FIXED LOCALLY

- Reproduced in the Firestore emulator: an owner of an unrelated team supplied `updatedByTeamId` and changed a victim player's `primaryTeamId`, family identifiers, private subcollections, and then deleted the player.
- Root cause: player write rules trusted client-supplied `updatedByTeamId`; profile creation also accepted `linkedPlayerId`.
- Fix: player/team authority now derives from the existing player linkage, client profiles cannot set linkage authority fields, and staff checks require active membership. Storage remains dependent on the immutable Firestore linkage invariant and is covered by a negative media test.
- Regression: unrelated-owner takeover, private subcollection write/delete, self-linked profile, and removed-staff tests pass in the emulator.

### HIGH - Public tournament waiver signer was not bound to a verified participant - FIXED LOCALLY

- The public waiver action now requires the organizer-issued tournament registration code, validates its server mapping to the exact event, and requires an authenticated active staff relationship to the selected team's linked squad.
- The waiver form sends both the code and Firebase authorization. Missing, cross-event, unlinked-team, and non-staff submissions receive 403. Production deployment and live organizer retest remain required.

### HIGH - League registration deletion left stale membership projections - FIXED LOCALLY

- Organizer deletion now calls an authenticated server action that atomically removes the response, archived waiver, team/individual projection maps, and membership arrays.
- Regression coverage verifies the server boundary and projection cleanup. Production deployment and a persisted delete/reload retest remain required.

### MEDIUM - League scorekeeper did not hydrate existing scores - FIXED LOCALLY

- Score fields were initialized before the async public league payload arrived, so corrections opened blank.
- The page now synchronizes score state whenever the loaded game changes.

### MEDIUM - Guardian waiver route omitted `guardianIds` - FIXED LOCALLY

- Secondary guardians recognized by rules and player data received 403 from the server waiver route.
- The route now accepts both member/player `guardianIds` in addition to legacy `parentId`, with source regression coverage.

## Browser, console, responsive, and persistence evidence

- Login: 1280x720, no horizontal overflow, no console warnings/errors.
- Squad Pro demo: seeded successfully and displayed deterministic team, schedule, roster, chat, practice, game, facility, equipment, volunteer, fundraising, file, alert, and Coaches Corner data.
- Phone check: Coaches Corner at 390x844 had document width equal to viewport width; visible controls remained inside the viewport.
- Core route sweep: Schedule, Roster, Chat, Practice, Scorekeeping, Coaches Corner, Facilities, Equipment, Feed, Volunteers, Fundraising, Files, and Settings loaded without a global error screen.
- Persistence: this pass verified demo data persisted across route navigation. Prior dated evidence verifies event and league edit persistence after refresh and child waiver state isolation.
- Coach communications: Parent Feed Comments persisted after refresh and was restored to its original disabled state. Tactical message dispatch succeeded; demo expiry prevented a persistence conclusion. Channel creation is manual review because browser-control actions timed out before dispatch could be confirmed.
- Parent Demo staging retest passed after deployment: Family Hub displayed 2 players, 2 active teams, $365 outstanding, 6 pending waivers, and populated schedules. Staging `/api/health` returned HTTP 200 with revision `studio-build-2026-08-17-001`.
- Anonymous staging HTTP smoke (2026-08-17): `/`, `/login`, and `/sports-hub` returned 200; `/api/health` returned 200 for revision `studio-build-2026-08-17-001`; `/tournaments`, `/leagues`, `/family`, `/dashboard`, and `/admin` returned 307 redirects to `/login` with preserved `returnTo` paths.
- 2026-08-17 historical result: an interactive multi-role browser loop timed out; Parent Demo was the only authenticated staging result recorded in that pass. This Super Admin limitation was closed by the 2026-08-18 certification below.
- Console: no warnings/errors on login, dashboard, or Coaches Corner checks. Network request bodies were not logged and secrets were not inspected.
- 2026-08-18 Super Admin staging certification: refresh persistence and all seven sections passed at 390x844 and 1440x900. Each section had document `scrollWidth` equal to viewport/client width. Bug Reports Refresh ended at x=311.92 within the 390 px viewport; Newsletter Compose, New Subscriber, and Subscribers each occupied x=30..360.
- 2026-08-18 demo billing certification: a fresh Squad Pro demo opened `/dashboard/billing` with Current Plan `Pro Team` and status `Demo plan`. Demo cancellation remained correctly unavailable.

## Automated verification

| Gate | Result |
|---|---|
| TypeScript | PASS |
| Unit/integration tests | PASS - 361/361 |
| Focused navigation regression | PASS - 8/8 |
| Firestore/Storage rules | PASS - 38/38 after security regressions; standalone mixed invocation is invalid because emulator host discovery is unavailable outside `firebase emulators:exec` |
| Production build | PASS |
| Functions TypeScript build | PASS |
| ESLint | PASS WITH 1,865 WARNINGS, 0 errors, 0 fixable warnings/errors |
| Production dependency audits | PASS - root and Functions report 0 vulnerabilities |
| GitHub release gate | PASS - run 32179685043 on exact candidate SHA |
| Protected staging deploy | PASS - run 32180024465; revision `studio-build-2026-08-18-003` healthy |
| Git diff check | PASS |

## Fixes and tests added

- Updated `src/components/layout/Shell.tsx` so navigation visibility follows server dashboard authorization.
- Updated `tests/dashboard-route-policy.test.mjs` with a regression check for shared policy use.
- Updated demo batch merging so protected server-created team and league roots survive rich blueprint enrichment.
- Unified public tournament standings on the canonical calculator.
- Preserved tournament replication blueprints while resetting operational state, exposed archival, retained registration launch context, and persisted validated waiver dates with visible errors.
- Added focused regression coverage in `tests/competition-workflows.test.mjs` and `tests/preview-regressions.test.mjs`.
- Added emulator regressions in `tests/rules/firestore-rules.test.mjs` and `tests/rules/storage-rules.test.mjs` for cross-tenant player takeover, profile self-linkage, removed staff, and player media authority.
- Added local fixes for active staff authorization, guardian ID waiver signing, asynchronous league score hydration, and mobile-visible registration actions.
- Added a centralized billing-plan-status resolver with cancellation, Stripe-linked, demo, and free precedence plus regression coverage.
- Made Bug Reports controls wrap responsively and Newsletter mode controls stack on mobile; preview regressions enforce both layouts.

## Release blockers and manual review

1. With action-time approval, record a signed Stripe test flow, one Resend staging delivery/unsubscribe result, and one FCM staging delivery.
2. After signed Stripe evidence, disable only the two older duplicate staging webhook endpoints; preserve the newer standard and Connect endpoints and every production endpoint.
3. Approve backup/retention, incident response, alerting, rollback ownership, and the production deploy runbook.
4. Continue post-launch hardening for durable multi-user breadth, full device/accessibility coverage, and lint warning reduction; these are tracked quality work, not newly discovered release-candidate regressions.

## Final assessment

The exact release candidate is deployed and health-verified in isolated staging. Repository gates, security rules, dependency audits, authenticated Super Admin, responsive layouts, demo billing, route protection, and unsigned callback rejection pass. The application is **ready for the final controlled provider smoke**, but unrestricted production promotion remains on hold until the explicitly authorized Stripe, email, push, endpoint-cleanup, and operational-runbook evidence is recorded.
