# Release Checklist

## Blocking before production

- [x] Remediate SEC-001 with a server-side field-whitelisted public recruiting payload and revised Firestore rules on the audit branch.
- [x] Add and pass anonymous/public recruiting privacy regression tests in the Firebase emulator.
- [x] Use JDK 21+ in the local release environment; `npm run test:rules` passes (Java 26.0.2). Ensure CI uses JDK 21+.
- [ ] Populate and validate every production environment variable using `npm run verify:env`.
- [ ] Verify Preview uses isolated Firebase, Stripe test mode, Resend sandbox, non-production OAuth callback, and non-production FCM tokens.
- [ ] Review the remaining three moderate dependency advisories and accept/update with an owner.
- [ ] Set appropriate App Hosting capacity/autoscaling; `maxInstances: 1` must be an intentional capacity decision.

## Required release evidence

- [ ] Clean checkout / `npm ci` succeeds.
- [ ] Re-run and record a clean-checkout pass of `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:rules`, `npm run build`, and `npm --prefix functions run build`.
- [ ] Production dependency audit has no critical/high findings.
- [ ] Stripe test-mode checkout/update/add-on/cancel/webhook matrix is signed off.
- [ ] Resend and FCM test delivery and opt-out handling are signed off.
- [ ] All role/tenant negative cases complete in Preview.
- [ ] Mobile/browser/accessibility test plan complete.
- [ ] Backup/retention, incident response, alerting, ownership, rollback, and deploy runbook are approved.

## Deploy/rollback

- [ ] Snapshot rules/indexes/config before deploy.
- [ ] Deploy Preview first; run smoke tests with test accounts.
- [ ] Promote only an immutable, reviewed commit.
- [ ] Monitor Stripe/Resend/webhook/API error logs after release.
- [ ] Keep a documented rollback version and data-migration reversal plan.
