# Pre-deployment readiness

## Completed locally

- Seven-day live-account deletion request and scheduled purge source.
- Demo-account cleanup remains on its separate 15-minute schedule.
- Pro-seat allocation is transactional, preventing concurrent requests from oversubscribing a plan.
- Chat poll votes are validated and counted server-side.
- The checked-in release gate runs app checks, Functions compilation, emulator-backed rules tests, and dependency audits.
- The staging workflow verifies the full release and deploys through workload identity with a protected GitHub environment.
- Existing payment, tenant isolation, notification, email, league-access, and public-spectator repairs remain local and un-deployed.

## Required before any production deployment

1. Configure the protected `staging` GitHub environment and workload-identity values documented in `docs/release-runbook.md`.
2. Run the release gate, then deploy the exact passing commit to the isolated staging Firebase project.
3. Confirm the compiled `functions/lib` output matches `functions/src` and all scheduled jobs are active.
4. Confirm Firestore indexes are enabled, then verify private league access, spectator views, chat polling, calendar feeds, and payer-isolated finance queries using non-admin accounts.
5. Run Stripe test-mode checkout, webhook retry, payment record, Pro-seat allocation, and offline receipt approval tests.
6. Run the authenticated mobile/desktop smoke matrix in `docs/release-runbook.md`.
7. Confirm the account-deletion policy for users who own teams or leagues. The current safe behavior blocks deletion until their organizations are transferred or removed.

## Deliberately not deployed or changed

- No frontend, Functions, Firestore rules, Storage rules, or hosting deployment was made after the request to keep changes local.
- Top-level tournament hubs are not yet invite-code gated: their data model has no trusted invite redemption flow. Do not deploy a restrictive tournament rule until that flow and migration are implemented.
- Storage still needs a product-level path classification (public logos/scout media versus private team documents). Tightening the existing broad team-media read rule without moving public assets would break existing public pages.
- Browser-level end-to-end tests are not yet checked into the release gate; the staging smoke matrix remains manual.
- Production secrets, monitoring, backup/restore validation, and hosting capacity remain external release gates.
