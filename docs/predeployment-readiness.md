# Pre-deployment readiness

## Completed locally

- Seven-day live-account deletion request and scheduled purge source.
- Demo-account cleanup remains on its separate 15-minute schedule.
- Pro-seat allocation is transactional, preventing concurrent requests from oversubscribing a plan.
- Chat poll votes are validated and counted server-side.
- Existing payment, tenant isolation, notification, email, league-access, and public-spectator repairs remain local and un-deployed.

## Required before any production deployment

1. Build and deploy the Functions source so the seven-day purge and 15-minute demo cleanup source are active. Confirm the compiled `functions/lib` output matches `functions/src`.
2. Deploy the matching Firestore rules, then verify league registration, private league access, spectator views, and chat polling using non-admin accounts.
3. Deploy the frontend and run a Stripe test-mode checkout, webhook retry, payment record, Pro-seat allocation, and offline receipt approval test.
4. Run an authenticated mobile/desktop smoke test for coach, parent, player, scout, organizer, and superadmin accounts.
5. Confirm the account-deletion policy for users who own teams or leagues. The current safe behavior blocks deletion until their organizations are transferred or removed.

## Deliberately not deployed or changed

- No frontend, Functions, Firestore rules, Storage rules, or hosting deployment was made after the request to keep changes local.
- Top-level tournament hubs are not yet invite-code gated: their data model has no trusted invite redemption flow. Do not deploy a restrictive tournament rule until that flow and migration are implemented.
- Storage still needs a product-level path classification (public logos/scout media versus private team documents). Tightening the existing broad team-media read rule without moving public assets would break existing public pages.
- The repository does not provide a non-interactive lint configuration or automated test runner. `npm run lint` opens setup, and the existing generated browser tests target port 9002.
- A production build remains environment-dependent because email is initialized from Resend environment variables. Supply production-safe values before final build verification.
