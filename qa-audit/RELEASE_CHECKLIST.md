# Release Checklist

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
- [x] Typecheck, lint, 233 app tests, 29 rules tests, Next build, and Functions build pass.
- [x] Both production dependency audits report zero vulnerabilities.
- [ ] Stripe test-mode checkout/update/add-on/cancel/webhook matrix is signed off.
- [ ] Resend and FCM test delivery and opt-out handling are signed off.
- [x] All seven supported demo personas and protected/public API negative cases complete in the isolated audit environment.
- [x] Core role dashboards pass at 390x844 with no horizontal overflow; icon-control accessibility defects found during testing were fixed.
- [ ] Backup/retention, incident response, alerting, ownership, rollback, and deploy runbook are approved.

## Deploy/rollback

- [ ] Run the guarded production infrastructure workflow; remove retired calendar functions and deploy the complete checked-in index contract.
- [ ] Snapshot rules/indexes/config before deploy.
- [ ] Deploy Preview first; run smoke tests with test accounts.
- [ ] Promote only an immutable, reviewed commit.
- [ ] Monitor Stripe/Resend/webhook/API error logs after release.
- [ ] Keep a documented rollback version and data-migration reversal plan.
