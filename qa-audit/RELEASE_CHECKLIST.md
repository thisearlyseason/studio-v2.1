# Release Checklist

## 2026-08-18 staging release candidate

- Candidate commit: `39d316b0b216efe492f345f728ba211917b6d485`.
- GitHub release gate: [run 32210319748](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32210319748) — PASS for app checks, Firebase rules, Functions build, and dependency audit.
- Protected staging deployment: [run 32210534954](https://github.com/thisearlyseason/studio-v2.1/actions/runs/32210534954) — PASS for verification, configuration ownership, indexes, Functions, Firestore/Storage rules, App Hosting rollout, and health.
- Deployed health: HTTP 200, service `the-squad-web`, revision `studio-build-2026-08-19-001`.
- Anonymous `/dashboard` and `/admin`: HTTP 307 to login with the original `returnTo` path preserved.
- Authenticated Super Admin: PASS across Accounts, Users Directory, Beta Apps, Bug Reports, Newsletters, Sports Hub, and Links & Embeds at 390x844 and 1440x900. Both widths had `innerWidth === clientWidth === scrollWidth`.
- Mobile regressions: PASS. Bug Reports heading/status/Refresh and all three Newsletter mode controls are fully inside the 390 px viewport.
- Squad Pro demo billing: PASS. Current plan is Pro Team and the status is `Demo plan`, not `Free tier`.
- Invalid-signature callbacks: PASS. Standard Stripe, Stripe Connect, and Resend webhook routes each reject the request with HTTP 400.
- Provider configuration: PASS structurally. Staging Stripe uses test mode; all ten configured prices are active CAD recurring prices; Resend domain is verified; required staging secrets are present without exposing their values.
- Signed Stripe delivery: PASS. Test-mode event `evt_1U5uUSGu1UxxOYbPNwVyQjQX` (`customer.created`, `livemode=false`) was accepted by the newer standard staging endpoint and recorded once as `completed` on the first attempt.
- Resend delivery: PASS. Authorized email `9ca57dfb-7e92-45a2-8dd1-630e04e29526` reached provider state `delivered`; staging recorded `email.delivered` and completed signed webhook delivery `msg_3I6cDXPZ37cC1xxn3rz40EJN7wV` once on attempt 1.
- FCM delivery: PASS after repairing a first-registration service-worker activation race. The authorized Chrome device registered one token, persisted `notificationsEnabled=true`, and the single staging send returned `successCount=1`, `failureCount=0`.
- Stripe duplicate cleanup: PASS. Older test-mode standard endpoint `we_1U5OxvGu1UxxOYbP9UIjoxTD` and Connect endpoint `we_1U5Ox6Gu1UxxOYbPXh8krg8q` are disabled. Newer test-mode standard endpoint `we_1U5TsiGu1UxxOYbPa6U9d040` and Connect endpoint `we_1U5Tu6Gu1UxxOYbPKpVmDB47` remain enabled; live-mode production was outside the staging key's scope.
- Staging operations: PASS. Daily Firestore backups retain seven days; a 60-second `/api/health` check and enabled health/runtime-error policies notify the verified owner email channel. The probe reported 21/21 passing samples with zero failures, and the provider smoke emitted no application or Functions ERROR logs.
- Production decision: **CONDITIONAL STAGING PASS; PRODUCTION PROMOTION BLOCKED.** The exercised staging gates pass, but the exhaustive Stripe test-mode lifecycle matrix below is not signed off. Production infrastructure and providers remain untouched.

## Blocking before production

- [ ] Complete and sign off the Stripe test-mode checkout/update/add-on/cancel/failure/webhook matrix in isolated staging.
- [x] Remediate SEC-001 with a server-side field-whitelisted public recruiting payload and revised Firestore rules on the audit branch.
- [x] Add and pass anonymous/public recruiting privacy regression tests in the Firebase emulator.
- [x] Use JDK 21+ in the local release environment; `npm run test:rules` passes (Java 26.0.2). Ensure CI uses JDK 21+.
- [x] Populate every required production environment variable by name; provider-sensitive value verification remains part of promotion.
- [x] Browser/API certification used isolated Firebase project `the-squad-audit-preview`; payment completion was not attempted.
- [x] Remove the retired AI dependency chain; both production audits report 0 vulnerabilities.
- [x] Raise App Hosting staging capacity to 10 instances; production uses Vercel fluid compute.

## Required release evidence

- [x] Dependency installation state supports the full build and test gate.
- [x] Typecheck, lint, 367 app tests, 38 rules tests, Next build, and Functions build pass on the candidate commit.
- [x] Both production dependency audits report zero vulnerabilities.
- [ ] Stripe test-mode checkout/update/add-on/cancel/webhook matrix is signed off.
- [x] Resend and FCM test delivery are signed off; automated contracts cover suppression and notification opt-out handling.
- [x] All seven supported demo personas and protected/public API negative cases complete in the isolated audit environment.
- [x] Core role dashboards pass at 390x844 with no horizontal overflow; icon-control accessibility defects found during testing were fixed.
- [x] Protected staging deploy path, immutable SHA evidence, health verification, and environment ownership checks pass.
- [x] Staging backup/retention, incident response, alerting, ownership, rollback, and deploy runbook are configured and documented. Production equivalents remain a promotion-time gate.

## Final action-time provider confirmations

- [x] Authorize one Stripe test-mode provider event and retain signed webhook delivery evidence. Event `evt_1U5uUSGu1UxxOYbPNwVyQjQX` completed once on the newer standard endpoint.
- [x] Authorize one staging email to the approved audit mailbox and verify provider delivery plus the signed Resend callback. Opt-out behavior remains covered by the automated webhook contract.
- [x] Authorized browser notification permission and one staging FCM push to the audit browser/device. Registration persisted one token and the send succeeded 1/1 with zero failures.
- [x] Disabled only the two older duplicate test-mode staging webhook endpoints after signed traffic was proven. The newer standard and Connect endpoints remain enabled; production endpoints were not changed.

## Deploy/rollback

- [x] Run workflow `31265002674`; retired calendar functions are absent and the complete checked-in index contract is enabled.
- [x] Validate the complete checked-in rules/index/config contract before deploy.
- [x] Deploy staging first and run smoke tests with a claim-controlled test account.
- [x] Deploy immutable independently reviewed staging candidate `39d316b0b216efe492f345f728ba211917b6d485`.
- [x] Monitored staging application and Functions ERROR logs during and after the authorized provider smoke; none were emitted.
- [x] Documented rollback target, backend/rules alignment, incident response, backup/restore, and the no-migration state in `PRODUCTION_OPERATIONS_RUNBOOK.md`.
