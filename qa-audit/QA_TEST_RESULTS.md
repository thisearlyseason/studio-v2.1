# QA Test Results

| Test / check | Area | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|
| `npm run typecheck` | Type safety | No TS errors | Passed | PASS | Local audit run |
| `npm test` | Unit/security/subscription regressions | All tests pass | 121/121 passed | PASS | Local audit run |
| `npm run lint` | Static analysis | No fatal lint issues | Exit 0; 1,943 warnings | PASS WITH DEBT | ESLint output |
| `npm run build` | Production build | Compile/type/prerender complete | Passed on Next 15.5.22 | PASS | Local audit run |
| `npm --prefix functions run build` | Cloud Functions | Compile | Passed after `functions/npm ci` | PASS | Local audit run |
| `npm run test:rules` | Firestore/Storage integration | Emulator rules tests | 18/18 passed with Java 26.0.2 | PASS | Firebase CLI output, 2026-07-26 |
| `npm run verify:env` | Production config | Required secrets present | Blocked locally; 24 variables absent | BLOCKED | Script output; do not add local secrets |
| `npm audit --omit=dev --package-lock-only` | Production dependency audit | No critical/high | 0 critical, 0 high, 3 moderate | PASS WITH CONDITIONS | Audit output |
| Manual Stripe flows | Billing | Test-mode end-to-end | Not run | BLOCKED | Requires Stripe test credentials |
| Manual Resend/FCM flows | Delivery | Real sandbox delivery | Not run | BLOCKED | Requires test recipients/devices |
| Browser/mobile matrix | UX/a11y | 320–1920 / browsers | Not run | BLOCKED | Requires Preview/browser devices |

Notable automated coverage already present includes account deletion, Stripe/webhook idempotency, subscription seats and downgrade behavior, server authorization, input bounds, secure rich text/RSS processing, public volunteer/fundraising, and access-control regressions. The emulator suite now explicitly denies anonymous access to an enabled player's private record and child contact document.
