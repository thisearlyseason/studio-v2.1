# Identity and Demo Browser Evidence

Browsers/viewports: Chromium desktop and 390×844 mobile.

PASS evidence:

- Home, login, and signup render without post-restart console errors.
- Signup role selection gates progression.
- Malformed email, short password, and mismatch are stopped without an Auth request.
- Visitor direct access to `/events` and `/admin` redirects to `/login?reason=expired&returnTo=...`.
- Two anonymous demo sessions seeded distinct coach and player workspaces.
- Demo access to `/admin` redirects to `/dashboard` and does not expose administration.
- Closing the demo sessions invoked the page-exit lifecycle.

BLOCKED evidence:

- Credential login/logout, signup and email verification, password reset, unverified/missing-profile onboarding, suspended/pending-delete states, and full cross-demo identifier substitution require the unavailable durable accounts/mailboxes.

Console errors: 0. Unexpected network failures: 0. Expected network included Firebase Identity/Firestore requests against the preview project plus `/api/demo/seed` and `/api/auth/session`.

Artifacts: `output/playwright/2026-08-21T232919Z/identity-demo/`.
