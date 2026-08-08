# Pre-deployment readiness

## Completed locally

- Seven-day live-account deletion request and scheduled purge source.
- Demo-account cleanup remains on its separate 15-minute schedule.
- Pro-seat allocation is transactional, preventing concurrent requests from oversubscribing a plan.
- Chat poll votes are validated and counted server-side.
- The checked-in release gate runs app checks, Functions compilation, emulator-backed rules tests, and dependency audits.
- The staging workflow verifies the full release and deploys through workload identity with a protected GitHub environment.
- The production infrastructure workflow verifies the release, requires explicit project confirmation, and deploys indexes, Functions, then rules.
- Legacy root tournament creation is closed to ordinary accounts; supported tournaments remain team-scoped events.
- Storage is default-deny with explicit public branding and opted-in recruiting media paths.
- Existing payment, tenant isolation, notification, email, league-access, and public-spectator repairs remain local and un-deployed.

## Required before any production deployment

1. Run `npm run verify:env` inside the protected production environment; local processes cannot retrieve Vercel Sensitive values.
2. Run the guarded production infrastructure workflow with the exact production Firebase project confirmation. It must deploy indexes and Functions, remove the retired Google Calendar functions, deploy rules, and verify the ICS endpoint.
3. Compare the live inventory to `firestore.indexes.json` and wait for the complete contract to become enabled before the web promotion. Current drift includes payer, member, signature, and event-date definitions.
4. Promote the exact immutable commit that passed `npm run verify`, then repeat the production health, auth, public-route, and calendar-feed smoke tests.
5. Complete Stripe signed-webhook, Resend delivery, and FCM device checks with provider-controlled test credentials. Do not finalize payment as part of this audit.

## Deployment state and external gates

- No frontend, Functions, Firestore rules, Storage rules, or hosting deployment was made by this local readiness pass.
- Production Vercel environment metadata was cleaned of retired provider variables and now includes the production calendar feed endpoint.
- Isolated browser coverage now includes all seven demo personas, authenticated feature modules, 35 public routes, protected/public API negatives, and 390x844 role dashboards.
- Production metadata confirms retired calendar functions and index-contract drift; the new infrastructure workflow is required before web promotion.
- Sensitive production values, signed provider callbacks, real email/push delivery, monitoring, and backup/restore validation remain external promotion gates.
