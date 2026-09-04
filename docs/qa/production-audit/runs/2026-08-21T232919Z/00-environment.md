# Phase 2 Environment Record

- Run ID: `2026-08-21T232919Z`
- Evidence date: 2026-08-21
- Repository commit: `cc9a3c7ca91c3ee2c2e3f257d3c642ba6a950327`
- Branch: `agent/record-production-release`
- Web environment: local development, `http://localhost:9001`
- Data environment observed through browser requests: isolated Firebase preview project `the-squad-audit-preview`
- Production mutations: none
- Node: `v24.12.0`
- npm: `11.6.2`
- Playwright CLI prerequisite: available through `npx`
- Primary browser: bundled Chromium
- Firefox/WebKit: BLOCKED because the Playwright executables are not installed

## Startup and baseline

| Check | Result |
|---|---|
| Application starts on port 9001 | PASS |
| Playwright reaches application | PASS |
| Firebase anonymous demo Auth/Firestore | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS with 1,865 warnings and 0 errors |
| `npm test` | PASS: 385/385 |
| `npm run test:rules` | PASS: 38/38 using Firestore and Storage emulators |
| `npm --prefix functions run build` | PASS |
| `npm run build` | PASS when run independently |
| `npm run verify:env` | BLOCKED: required production/provider variables are missing |

The first build attempt overlapped `next dev` and caused transient `.next` manifest failures. Systematic triage reproduced the shared-output-directory race. The dev server was stopped, the build passed independently, the server was restarted, and all affected browser checks were rerun. The harness-induced 500 responses are excluded from application defect and console/network totals.

## Missing safe dependencies

Missing configuration includes the canonical Stripe prices and secrets, Stripe Connect webhook secret, Resend and unsubscribe secrets, FCM VAPID key, calendar feed base URL, Internal API secret, owner notification address, and Firebase Admin credential. The required durable role accounts, QA mailboxes, two populated tenants, claim-controlled superadmin, provider test objects, real FCM device, and destructive-test authorization were not supplied. Affected rows are BLOCKED rather than inferred.

