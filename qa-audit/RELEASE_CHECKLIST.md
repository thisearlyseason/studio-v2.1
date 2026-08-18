# Release Checklist

## 2026-08-18 staging release candidate

- Candidate commit: `d1e4a11d0a242a7dda57c571500c59b110910a9a`.
- GitHub release gate: [run 32179685043](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32179685043) — PASS for app checks, Firebase rules, Functions build, and dependency audit.
- Protected staging deployment: [run 32180024465](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32180024465) — PASS for verification, configuration ownership, indexes, Functions, Firestore/Storage rules, App Hosting rollout, and health.
- Deployed health: HTTP 200, service `the-squad-web`, revision `studio-build-2026-08-18-003`.
- Anonymous `/dashboard` and `/admin`: HTTP 307 to login with the original `returnTo` path preserved.
- Authenticated Super Admin: PASS across Accounts, Users Directory, Beta Apps, Bug Reports, Newsletters, Sports Hub, and Links & Embeds at 390x844 and 1440x900. Both widths had `innerWidth === clientWidth === scrollWidth`.
- Mobile regressions: PASS. Bug Reports heading/status/Refresh and all three Newsletter mode controls are fully inside the 390 px viewport.
- Squad Pro demo billing: PASS. Current plan is Pro Team and the status is `Demo plan`, not `Free tier`.
- Invalid-signature callbacks: PASS. Standard Stripe, Stripe Connect, and Resend webhook routes each reject the request with HTTP 400.
- Provider configuration: PASS structurally. Staging Stripe uses test mode; all ten configured prices are active CAD recurring prices; Resend domain is verified; required staging secrets are present without exposing their values.
- Signed Stripe delivery: PASS. Test-mode event `evt_1U5uUSGu1UxxOYbPNwVyQjQX` (`customer.created`, `livemode=false`) was accepted by the newer standard staging endpoint and recorded once as `completed` on the first attempt.
- Resend delivery: PASS. Authorized email `9ca57dfb-7e92-45a2-8dd1-630e04e29526` reached provider state `delivered`; staging recorded `email.delivered` and completed signed webhook delivery `msg_3I6cDXPZ37cC1xxn3rz40EJN7wV` once on attempt 1.
- Production decision: **HOLD for the two remaining action-time provider confirmations below and explicit operational sign-off.** No code, CI, deploy, authentication, responsive, health, Stripe-signature, or Resend-delivery blocker remains.

## Blocking before production

- [x] Remediate SEC-001 with a server-side field-whitelisted public recruiting payload and revised Firestore rules on the audit branch.
- [x] Add and pass anonymous/public recruiting privacy regression tests in the Firebase emulator.
- [x] Use JDK 21+ in the local release environment; `npm run test:rules` passes (Java 26.0.2). Ensure CI uses JDK 21+.
- [x] Populate every required production environment variable by name; provider-sensitive value verification remains part of promotion.
- [x] Browser/API certification used isolated Firebase project `the-squad-audit-preview`; payment completion was not attempted.
- [x] Remove the retired AI dependency chain; both production audits report 0 vulnerabilities.
- [x] Raise App Hosting staging capacity to 10 instances; production uses Vercel fluid compute.

## Required release evidence

- [x] Dependency installation state supports the full build and test gate.
- [x] Typecheck, lint, 361 app tests, 38 rules tests, Next build, and Functions build pass on the candidate commit.
- [x] Both production dependency audits report zero vulnerabilities.
- [ ] Stripe test-mode checkout/update/add-on/cancel/webhook matrix is signed off.
- [ ] Resend and FCM test delivery and opt-out handling are signed off.
- [x] All seven supported demo personas and protected/public API negative cases complete in the isolated audit environment.
- [x] Core role dashboards pass at 390x844 with no horizontal overflow; icon-control accessibility defects found during testing were fixed.
- [x] Protected staging deploy path, immutable SHA evidence, health verification, and environment ownership checks pass.
- [ ] Backup/retention, incident response, alerting, ownership, rollback, and deploy runbook are approved.

## Final action-time provider confirmations

- [x] Authorize one Stripe test-mode provider event and retain signed webhook delivery evidence. Event `evt_1U5uUSGu1UxxOYbPNwVyQjQX` completed once on the newer standard endpoint.
- [x] Authorize one staging email to the approved audit mailbox and verify provider delivery plus the signed Resend callback. Opt-out behavior remains covered by the automated webhook contract.
- [ ] Authorize browser notification permission and one staging FCM push to the audit browser/device.
- [ ] After signed Stripe traffic is proven, authorize disabling only the two older duplicate staging webhook endpoints. Keep the newer standard endpoint created `2026-08-17T16:59:28Z` and newer Connect endpoint created `2026-08-17T17:00:54Z`. Do not change production endpoints.

## Deploy/rollback

- [x] Run workflow `31265002674`; retired calendar functions are absent and the complete checked-in index contract is enabled.
- [x] Validate the complete checked-in rules/index/config contract before deploy.
- [x] Deploy staging first and run smoke tests with a claim-controlled test account.
- [x] Deploy immutable reviewed staging candidate `d1e4a11d0a242a7dda57c571500c59b110910a9a`.
- [ ] Monitor Stripe/Resend/webhook/API error logs during and after the authorized provider smoke.
- [ ] Keep a documented rollback version and data-migration reversal plan.
