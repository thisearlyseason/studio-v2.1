# Release runbook

## Release gates

Every pull request and protected release branch must pass the `Release gate`
workflow. It verifies the app, Cloud Functions, Firebase rules, production build,
and high-severity dependency audits. Do not bypass a failed or cancelled job.

The `Deploy staging` workflow is manual and uses the protected `staging` GitHub
environment. Configure required reviewers for that environment before its first
use.

## Staging configuration

Current isolated staging inventory:

- Firebase project and CLI alias: `the-squad-v2-staging` / `staging`
- App Hosting backend: `studio` in `us-east4`
- Canonical URL: `https://studio--the-squad-v2-staging.us-east4.hosted.app`
- GitHub environment: `staging`, protected by required reviewer approval
- GitHub deploy identity: `github-deployer@the-squad-v2-staging.iam.gserviceaccount.com`
- Firestore: Native mode in `us-east4`
- Storage: `the-squad-v2-staging.firebasestorage.app` in `US-EAST1`

The App Hosting repository connection must be authorized while signed in to the
GitHub account `thisearlyseason`. The `tylerans` account cannot grant access to
`thisearlyseason/studio-v2.1`; do not install the Firebase GitHub App for all
repositories on that account as a workaround.

Create a Firebase project that does not share Auth, Firestore, Storage, Stripe,
or Resend credentials with production. Configure these GitHub
environment values:

- Variable `STAGING_FIREBASE_PROJECT_ID`
- Variable `STAGING_APPHOSTING_BACKEND_ID`
- Variable `STAGING_APP_URL` containing the backend's canonical HTTPS URL
- Secret `GCP_WORKLOAD_IDENTITY_PROVIDER`
- Secret `GCP_SERVICE_ACCOUNT`

The service account must use workload identity federation and have only the
permissions needed to deploy Firestore indexes and rules, Storage rules, Cloud
Functions, and App Hosting rollouts. Do not create a long-lived Firebase token
or service-account key for GitHub Actions.

The App Hosting backend must be linked to this repository (`thisearlyseason/studio-v2.1`)
and the configured URL must exactly match the backend's canonical URI. The deploy
workflow checks both properties before it mutates Firebase resources. A backend
linked to another repository, such as the legacy `thisearlyseason/studio` project,
must not be used as staging for this branch.

Configure the application secrets in Firebase App Hosting and Functions, not in
the repository. Validate the complete production environment contract with:

```bash
npm run verify:env
```

Do not trigger the first rollout until all values required by
`scripts/check-production-env.mjs` exist as isolated staging values. In
particular, use Stripe test-mode products and webhooks and non-production email
credentials. The health endpoint alone does not
prove these integrations are configured.

## Staging release

1. Confirm the selected commit has passed `Release gate`.
2. Run `Deploy staging` for that exact commit.
3. Confirm required Firestore indexes report `Enabled` before testing queries.
4. Confirm all Functions are healthy and scheduled jobs have the expected region and cadence.
5. Confirm the App Hosting rollout serves the selected commit and `/api/health` returns HTTP 200.
6. Run the smoke-test matrix below.
7. Record the commit, tester, results, and unresolved issues in the release ticket.

## Smoke-test matrix

- Anonymous: landing, public portals, registration, fundraising, and volunteer links.
- Coach: signup verification, squad creation, roster, schedule, chat, files, and offline payment.
- Parent: squad join, child access, calendar feed, notifications, and own-payment visibility.
- Player: schedule, RSVP, chat, drills, and restricted finance access.
- Organizer: league and tournament registration, scoring, and spectator views.
- Superadmin: account controls, newsletter administration, and tenant isolation.
- Billing: test checkout, Connect checkout, duplicate webhook delivery, failed payment, cancellation, and seat allocation.
- Account lifecycle: deletion request, immediate access revocation, blocked organization owner, and scheduled purge fixture.
- Devices: current Chrome, Safari, iOS Safari, and Android Chrome at narrow and desktop widths.

## Production promotion

Production uses Firebase project `studio-6850142148-fe343` for Auth, Firestore,
Storage, and Functions. Web traffic is served by Vercel project `thesquadv2`
(`prj_UGwsgdfqkFaJPTuELNgDG0Extd3f`), linked to this repository with `fix` as
its production branch. `www.thesquad.pro` and `thesquad.pro` are its production
aliases. The legacy production App Hosting backend remains linked to
`thisearlyseason/studio` and must not be used for this release.

Production promotion requires the protected `production` GitHub environment,
variable `PRODUCTION_FIREBASE_PROJECT_ID=studio-6850142148-fe343`, and the same
workload-identity secrets used by the production deploy identity. Run `Deploy
production infrastructure` from the reviewed release candidate and type the
production project ID when prompted. That workflow deploys indexes, Functions,
then rules and verifies that the retired Google Calendar OAuth Functions are gone.

After infrastructure succeeds, merge the reviewed release into `fix`. Vercel
then builds and promotes that revision automatically. Confirm `/api/health`
reports the expected revision before repeating the smoke matrix with
non-destructive production fixtures. Confirm production secrets, Stripe and
Resend webhook endpoints, custom domains, Firebase authorized domains, calendar
feed subscriptions, alerting, backups, and rollback ownership before promotion.

## Rollback

- Vercel: promote the last known-good production deployment.
- Functions: redeploy Functions from the last known-good commit.
- Rules: redeploy the last known-good rules only after confirming they remain compatible with current stored data.
- Indexes: do not delete indexes during an incident unless their removal is independently reviewed.
- Payments: do not replay Stripe events manually until event-ledger state and payment records have been inspected.

Keep at least one known-good commit and its deployment record available. A
rollback is complete only after the smoke tests and monitoring recover.
