# Account release checklist

## Status

**READY WITH CONDITIONS — APP HOSTING AND VERCEL PREVIEWS VERIFIED**

All confirmed critical/high account-security, authorization, account-lifecycle, and Preview identity-configuration defects found in this audit are fixed and verified by automated or hosted tests. Core signup, session, onboarding, notification, access-gate, billing-failure, and responsive flows were exercised in isolated Firebase App Hosting and Git-associated Vercel Previews. Production approval remains conditional on provider-backed lifecycle testing, Stripe test-mode testing, and an explicit rollout decision for existing unverified accounts.

## Completed

- [x] Actual global roles, team positions, states, login methods, plans, and billing states inventoried.
- [x] New profile writes cannot set role/plan/Stripe/admin fields.
- [x] Email/password signup sends verification before tenant/join/checkout work.
- [x] Unverified, suspended, removed, and deletion-pending identities fail closed.
- [x] API tokens are signature-, expiry-, and revocation-verified.
- [x] Login errors do not intentionally enumerate email existence.
- [x] Email change uses verify-before-update.
- [x] Join payload cannot grant a staff position.
- [x] Youth linked membership and removed membership are handled.
- [x] Team chat request is target-team scoped.
- [x] Team alert badge/inbox use one audience predicate and rules enforce it.
- [x] Team, league, club, player, subscription, facility, admin, and storage isolation tests pass.
- [x] Team/league creation limits are enforced by trusted server state.
- [x] Legacy global league invitation PII is admin-only.
- [x] Account deletion immediately disables/revokes and has purge regression coverage.
- [x] Delegated staff can operate team workflows without promoting roles, changing billing, or modifying the owner.
- [x] Supported tournaments remain team-scoped; unsupported root tournament tenant writes are closed.
- [x] Protected direct URLs require revocation-checked HTTP-only server sessions.
- [x] Signup requires matching password confirmation and accurately describes verification-before-payment.
- [x] Local desktop/tablet/mobile landing checks have no horizontal overflow; mobile login/signup and direct-route behavior were browser-verified.
- [x] Hosted Preview session creation, protected-route admission, logout, and subsequent login work.
- [x] Hosted Preview signup failure removes the partial Authentication identity and profile.
- [x] Hosted Preview coach onboarding creates the supported squad type and enforces the Starter squad limit.
- [x] Hosted Preview notification badge, inbox, acknowledgement, and history remain consistent.
- [x] Hosted Preview without Stripe configuration fails checkout safely with a generic user-facing error.
- [x] Git-associated Vercel Preview reached `READY` from the QA branch and passed real server-session login/logout.
- [x] Vercel Preview Firebase client and Admin credentials now target the same isolated audit project.
- [x] Disposable Preview identities and squad data were deleted and verified absent after testing.
- [x] TypeScript, lint (warnings only), unit, emulator rules, Next production build, and Functions build pass.

## Deployment conditions

- [x] Authenticate Vercel and run the current QA branch in a Git-associated Vercel Preview.
- [ ] Configure isolated Stripe test-mode keys, prices, and webhook secret; execute checkout, upgrade, downgrade, failure, cancellation, and stale-session scenarios.
- [ ] Configure a safe test inbox/email provider and execute verification, password-reset, invitation, and resend/expiry/reuse scenarios.
- [ ] Execute Google OAuth, multi-device revocation, and push-notification lifecycle scenarios with disposable identities/devices.
- [ ] Define rollout behavior for pre-existing accounts whose Firebase email is currently unverified.

## Manual Preview scenarios (30)

- [ ] M-01 valid email/password registration and duplicate-submit/slow-network behavior.
- [ ] M-02 duplicate/case/space/Unicode/long-input registration.
- [ ] M-03 Google OAuth new/existing/cross-provider login.
- [ ] M-04 verification valid/expired/reused/modified/cross-browser links and resend throttling.
- [ ] M-05 password reset valid/expired/reused/modified/unknown-email lifecycle.
- [ ] M-06 logout, refresh, expired and revoked session.
- [ ] M-07 password/email change invalidates or refreshes other-device sessions as intended.
- [ ] M-08 suspended/disabled/deletion-pending active browser session.
- [ ] M-09 new/existing/wrong-account/forwarded team invitation.
- [ ] M-10 duplicate/expired/canceled/reused invitation and inviter permission loss.
- [ ] M-11 league invitation delivery, removal, resend, acceptance, and deep link.
- [ ] M-12 tournament and school invitation flows after their policy is defined.
- [ ] M-13 parent/guardian complete child and team workflow.
- [ ] M-14 adult player complete workflow.
- [ ] M-15 invited youth complete workflow.
- [ ] M-16 coach owner complete workflow.
- [ ] M-17 assistant coach/manager complete Preview workflow (automated authority matrix passes).
- [ ] M-18 school owner and delegated administrator complete workflow.
- [ ] M-19 league creator and tournament creator complete workflow.
- [ ] M-20 multi-organization/team switching, refresh, history, and simultaneous tabs.
- [ ] M-21 desktop, tablet, and mobile navigation/direct deep links for each role.
- [ ] M-22 upload/download/delete media across two tenants.
- [ ] M-23 notification/email recipient, preference, duplicate, history, and removed-user checks.
- [ ] M-24 billing owner vs non-owner direct URL/API controls.
- [ ] M-25 superadmin routes, APIs, audit logs, and destructive confirmations.
- [ ] M-26 Stripe test-mode checkout, monthly/annual upgrade and trial.
- [ ] M-27 Stripe test-mode downgrade, past-due, cancellation, payment failure, and stale session.
- [ ] M-28 owner, ordinary user, and child-linked account deletion/cancel deletion.
- [ ] M-29 seven-day purge dry run in disposable data and recreation using the same email.
- [ ] M-30 two anonymous demo sessions, no external messaging/billing, and reset behavior.

## Final metrics

| Metric | Result |
|---|---:|
| Account types found | 8 (7 role-backed types plus demo) |
| Global roles found | 7 |
| Subscription plans found | 5 |
| Account/billing states represented in automated policy tests | 14 |
| Focused account tests | 42 |
| Focused tests passed | 42 |
| Focused tests failed | 0 |
| Manual scenarios blocked/pending | 30 |
| Full unit + rules tests | 160 passed, 0 failed |
| Critical bugs found/fixed/unresolved | 2 / 2 / 0 |
| High bugs found/fixed/unresolved | 11 / 11 / 0 |
| Medium bugs found/fixed/unresolved | 3 / 2 / 1 blocked external verification |
| Low bugs | 0 |
| Total bugs fixed | 15 |
| Total bugs unresolved | 0 confirmed code defects |
| External verification conditions | 4 |
| Confirmed cross-account breaches remaining | 0 |
| Confirmed cross-organization breaches remaining | 0 |
| Automated subscription-policy failures remaining | 0 |
| Automated authentication failures remaining | 0 |
| Automated authorization security failures remaining | 0 |
| Functional authorization mismatches remaining | 0 confirmed |

## Required release decision

Do not promote to production until the existing-user verification rollout is decided and the remaining provider-, email-, device-, and Stripe-backed manual scenarios pass in an isolated environment. The available Stripe CLI test credential is expired, and the sensitive Vercel Preview Stripe value cannot be proven test-mode without invoking it, so no payment session was created. This audit does not claim the application has no other bugs or that security can be proven absolute.
