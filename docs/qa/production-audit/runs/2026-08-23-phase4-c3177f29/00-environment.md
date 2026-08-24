# Phase 4 Baseline Environment Record

## Scope and repository isolation

| Check | Result |
| --- | --- |
| Baseline commit | `c3177f29188191e642a172e4928cc2391991e80b` |
| Branch | `agent/phase4-independent-verification` |
| Checkout | Linked worktree: `.worktrees/phase3-root-cause-repair` |
| Initial tracked working state | Clean; the only initial untracked file was `docs/superpowers/plans/2026-08-23-phase-4-independent-verification.md`. |
| Audit-range whitespace check | `git diff --check cc9a3c7c..HEAD` exited successfully with no output. |

The Phase 3 commit above is the immutable application baseline. This record and the companion blocker assessment are Phase 4 evidence only; no application code was changed.

## Exact-commit release gates

`npm run verify` completed successfully at the baseline commit. Its `&&` pipeline therefore completed all listed gates.

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript typecheck | PASS | `tsc --noEmit` exited successfully. |
| ESLint | PASS with existing warnings | Fresh JSON output counted 1,865 warnings and 0 errors. Warnings were retained as warnings, not reclassified as errors. |
| Node tests | PASS | 387 tests passed; 0 failed, cancelled, skipped, or todo. |
| Rendered component tests | PASS | 2 tests in 1 test file passed. |
| Firestore/Storage rules tests | PASS | 38 tests passed; 0 failed, cancelled, skipped, or todo. Expected denied-operation messages were emitted by negative rules tests. |
| Next.js build | PASS | Completed as part of `npm run verify`. |
| Functions build | PASS | Completed as `npm --prefix functions run build` in the same successful pipeline. |

## Value-free environment assessment

`npm run verify:env` exited nonzero and printed only the missing variable names below. No environment-variable values were printed, inspected, or stored.

| Category | Status | Missing required names | Owner |
| --- | --- | --- | --- |
| Hosted Firebase / deployment | UNAVAILABLE | `NEXT_PUBLIC_APP_URL`; `FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT` | Authorized environment/secrets owner |
| Stripe pricing | UNAVAILABLE | `NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY`; `NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL`; `NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY`; `NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL`; `NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY`; `NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL`; `NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY`; `NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL`; `STRIPE_PRICE_EXTRA_TEAM_MONTHLY`; `STRIPE_PRICE_EXTRA_TEAM_ANNUAL` | Authorized Stripe test-config owner |
| Stripe / Connect secrets | UNAVAILABLE | `STRIPE_SECRET_KEY`; `STRIPE_WEBHOOK_SECRET`; `STRIPE_CONNECT_WEBHOOK_SECRET` | Authorized Stripe/Connect test-config owner |
| Resend / newsletter | UNAVAILABLE | `RESEND_API_KEY`; `RESEND_WEBHOOK_SECRET`; `NEWSLETTER_UNSUBSCRIBE_SECRET` | Authorized Resend test-config owner |
| FCM | UNAVAILABLE | `NEXT_PUBLIC_FCM_VAPID_KEY` | Authorized FCM/device owner |
| Calendar | UNAVAILABLE | `CALENDAR_FEED_BASE_URL` | Authorized calendar fixture owner |
| Internal API | UNAVAILABLE | `INTERNAL_API_SECRET` | Authorized internal-API owner |
| Notification owner | UNAVAILABLE | `OWNER_NOTIFICATION_EMAIL` | Authorized notification owner |

This result does not distinguish an unset value from one intentionally withheld from this checkout. It establishes only that the required production-readiness configuration is unavailable to this local evidence run.

## Local browser-engine discovery

Discovery used `playwright-cli` 0.1.18 with installation disabled, followed by local executable discovery in the standard Playwright cache paths. No browser-install command was invoked and no browser session was opened.

| Engine | Status | Non-secret reason | Owner |
| --- | --- | --- | --- |
| Chromium | UNAVAILABLE | No executable found in the local Playwright cache paths. | Local toolchain maintainer |
| Firefox | UNAVAILABLE | No executable found in the local Playwright cache paths. | Local toolchain maintainer |
| WebKit | UNAVAILABLE | A cached `webkit-2336/pw_run.sh` executable was discovered, but the bundled CLI requires build `webkit-2342`; the cached build is therefore unusable by this toolchain. No browser was downloaded. | Local toolchain maintainer |

Browser-engine availability is not authorization to use an authenticated fixture or provider account.
