# Account bug report

## AQ-001 — Join-code staff privilege escalation

- Severity: Critical
- Affected: every ordinary account joining by code.
- Reproduce: call `/api/teams/join` with a valid code and `position: "Head Coach"`.
- Expected: server assigns only the role permitted by account/player relationship.
- Actual: client position was trusted; staff checks later treated it as authority.
- Impact: team-local vertical privilege escalation.
- Root cause: authorization attribute accepted from request body.
- Fix: server derives Parent, Player, or Member; request position is ignored.
- Regression: `tests/account-membership-policy.test.mjs`.
- Status: Fixed.

## AQ-002 — Removed and youth-linked membership resolution

- Severity: High
- Affected: removed members and invited youth players.
- Actual: removed direct documents could retain access; youth documents keyed by player ID could lose access.
- Root cause: membership helper checked only document existence at UID.
- Fix: active-state checks plus linked-player resolution in rules and server team access.
- Regression: linked youth/removed emulator test.
- Status: Fixed.

## AQ-003 — Cross-team chat membership lookup

- Severity: High
- Affected: users with membership in any team.
- Actual: message API accepted an active membership found by collection-group query without proving it belonged to the requested team.
- Impact: cross-team message attempt.
- Fix: lookup is scoped to requested team; chat rules explicitly exclude compatibility fallback.
- Regression: chat impersonation and removed-member tests.
- Status: Fixed.

## AQ-004 — Email verification absent from tenant/API boundary

- Severity: High
- Affected: new email/password accounts.
- Actual: signup entered tenant/checkout flows without verified email; APIs and rules did not reject unverified tokens.
- Fix: verification page/resend/check flow; API token check; Firestore and Storage verified/active gates; verified-email-change flow.
- Regression: account authentication plus emulator tests.
- Status: Fixed; provider link expiry/reuse remains manual.

## AQ-005 — Alert badge/inbox audience mismatch

- Severity: High
- Affected: all roles receiving team alerts.
- Actual: the badge could count alerts that the inbox filtered out, producing a count with empty history.
- Root cause: different audience/target logic between count and inbox, compounded by a broad team rules fallback.
- Fix: shared recipient predicate and explicit alert audience/target rules; fallback cannot broaden alerts.
- Regression: `tests/alert-audience.test.mjs` and team alert emulator test.
- Status: Fixed.

## AQ-006 — Team and league plan limits were client-only

- Severity: Critical
- Affected: free, expired, past-due, canceled, and paid owners.
- Reproduce: create `/teams` or `/leagues` directly after the UI cap is reached.
- Actual: Firestore accepted browser creates.
- Impact: subscription bypass and unbounded tenant creation.
- Fix: authenticated server creation endpoints atomically read trusted profile capacity and current count; direct browser creation denied. Only active/trialing paid state receives paid capacity.
- Regression: account creation policy tests and direct Firestore creation denials.
- Status: Fixed.

## AQ-007 — Global league invite email leakage and broken writer

- Severity: High
- Affected: signed-in users and league organizers.
- Actual: legacy global invite records containing recipient emails were readable by any signed-in user, while ordinary organizer writes were denied.
- Fix: legacy path is superadmin-only; new organizer invite writes use the creator-scoped league subcollection.
- Regression: legacy invite PII emulator test.
- Status: Fixed; end-to-end email delivery/acceptance is manual.

## AQ-008 — Club owner field mismatch

- Severity: Medium
- Affected: club/school owners using records with `ownerUserId`.
- Actual: rules recognized only legacy `ownerId`.
- Fix: owner-scoped rules accept either stored schema while retaining exact-UID isolation.
- Regression: club owner/outsider emulator assertions.
- Status: Fixed.

## AQ-009 — Non-owner staff UI/backend permission mismatch

- Severity: High (functional)
- Affected: assistant coach, manager, team staff, delegated school administrator.
- Reproduce: sign in as an active staff member who is not the team owner and use member, schedule, score, drill, document, alert, or chat administration UI.
- Expected: supported staff duties work according to product UI.
- Actual: many Firestore writes require primary team ownership.
- Security impact: fail-closed; no unauthorized access was observed.
- User impact: supported staff workflows can fail with permission denied.
- Root cause: UI `isStaff` model is broader than backend owner-only model.
- Fix: operational team writes now accept verified active staff. Non-owner staff cannot modify the owner, create/promote staff authority, transfer ownership, or change billing/plan fields. Notification and email APIs use the same server staff authority check.
- Regression: delegated staff emulator test plus server notification authority test.
- Status: Fixed.

## AQ-010 — Tournament plan limit policy not authoritative

- Severity: High (subscription policy)
- Affected: tournament organizers/all authenticated roles.
- Actual: the audit initially treated an unused legacy root collection as the supported tournament product.
- Impact: direct root writes could create an independent tenant outside the supported team workflow.
- Fix: supported tournaments remain team-scoped events and inherit team authorization/entitlement behavior; legacy root writes are superadmin-only.
- Regression: root tournament denial and team-event implementation tests.
- Status: Fixed.

## AQ-011 — Protected page routing is client-gated

- Severity: Medium
- Affected: protected and admin pages.
- Actual: direct navigation previously received the application shell; data and mutations still failed at rules/APIs.
- Fix: login now exchanges a Firebase ID token for an HTTP-only, secure-in-production Firebase session cookie. Middleware calls the server verifier with revocation checking before protected pages render, preserves a safe return path, and clears invalid sessions. Logout clears both browser and server sessions.
- Regression: account session test and local direct-URL browser redirect.
- Status: Fixed.

## AQ-012 — Full identity-provider lifecycle not executable locally

- Severity: Medium/verification condition
- Affected: OAuth, reset links, verification links, multi-device revocation.
- Actual: provider-backed expiry/reuse/rate-limit behavior cannot be proven by static review or rules emulator.
- Fix: execute Preview matrix using isolated Firebase identities.
- Status: Blocked manual verification.

## AQ-013 — Session middleware depended on a same-origin HTTP subrequest

- Severity: High (authentication availability)
- Affected: authenticated users on Firebase App Hosting.
- Reproduce: create a valid server session and navigate to a protected route in the audit Preview.
- Expected: middleware verifies the session and serves the protected route.
- Actual: the same-origin `/api/auth/session` middleware subrequest did not preserve the App Hosting session reliably, so valid sessions were rejected.
- Root cause: the authorization boundary depended on a deployment-specific loopback HTTP request.
- Fix: Node middleware verifies the Firebase session cookie directly with revocation checking and preserves the verified-email gate and safe return path.
- Regression: `tests/account-session.test.mjs`; live Preview login and protected-route navigation.
- Status: Fixed.

## AQ-014 — Failed verification delivery retained a partial account

- Severity: High (account lifecycle)
- Affected: new email/password registrations when verification delivery fails.
- Reproduce: submit signup while the verification continue URL is unauthorized.
- Expected: signup fails without retaining an unusable identity or profile.
- Actual: Firebase Authentication and profile data could be created before verification delivery failed.
- Root cause: identity creation, verification delivery, and profile persistence were not ordered as a compensating transaction.
- Fix: verification is sent before batched profile writes; any post-create failure clears session state and deletes the new Authentication identity.
- Regression: `tests/account-authentication.test.mjs`; live Preview rollback test with the audit hostname temporarily removed and restored.
- Status: Fixed.

## AQ-015 — Coach onboarding sent unsupported squad types

- Severity: High (functional)
- Affected: coaches creating adult or youth squads.
- Reproduce: complete coach onboarding and create an adult or youth squad.
- Expected: the server accepts the UI's supported squad type.
- Actual: the UI sent `adult` or `youth`, while the creation API rejected both with HTTP 400.
- Root cause: client and server team-type allowlists diverged.
- Fix: the API accepts the two onboarding types and the UI reports server failures in a visible destructive notification.
- Regression: `tests/account-creation-policy.test.mjs`; live Preview creation and Starter-plan second-squad limit.
- Status: Fixed.

## AQ-016 — Vercel Preview Firebase client/server project mismatch

- Severity: High (authentication availability)
- Affected: Git-associated Vercel Preview deployments.
- Reproduce: sign in through the QA branch Preview and exchange the Firebase ID token for a server session.
- Expected: the public Firebase client and Firebase Admin session verifier use the same isolated audit project.
- Actual: the public client used `the-squad-audit-preview`, while the inherited branch-scoped Admin credential used `studio-6850142148-fe343`; the API correctly rejected the project mismatch and displayed `Session Setup Failed`.
- Root cause: the Preview Admin credential remained scoped to a superseded branch and referenced a different Firebase project.
- Fix: the Vercel Git Preview credential is now scoped to `codex/qa-production-audit` and uses a dedicated `vercel-qa-preview` service account in `the-squad-audit-preview`. Its IAM roles are limited to Firebase Authentication administration and Firestore data access. Production variables were not changed.
- Regression: Git-associated Vercel deployment `dpl_Gg618MNr6D8QRXQ8da2hNhp8wNyd`; live email/password login, session exchange, dashboard access, logout, and post-logout protected-route rejection.
- Status: Fixed.

## Changed implementation areas

Authentication and verification, server sessions, signup rollback, API token checks, Firestore/Storage account gates, membership policy, team join/chat, youth/league invitations, server-mediated team/league creation, settings email verification, alert authorization, onboarding error handling, Vercel Preview identity configuration, and regression tests.
