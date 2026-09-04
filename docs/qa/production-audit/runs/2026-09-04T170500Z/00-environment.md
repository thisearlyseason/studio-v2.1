# Final Production Testing — Environment Baseline

Recorded: 2026-09-04 (America/Edmonton)

## Checkout

- Repository: `studio-v2.1`
- Branch: `agent/record-production-release`
- Baseline commit: `fcb6e91dca6565d1e5236b204664a9c36199f75f`
- Application commit deployed to staging: `0603a110` (document-only commits follow it)
- Worktree state at start: clean except for the new final-testing plan
- Node: `v24.12.0`
- npm: `11.6.2`
- `npx`: available

## Fresh automated baseline

Command: `npm test`

Result: **PASS** — 421 tests passed, 0 failed, 0 skipped, 0 todo in 16.1 seconds.

This is the pre-browser baseline. It proves the repository-level behavioral tests are green; it does not replace real-browser, provider, or physical-device evidence.

## Configuration boundary

Command: `npm run verify:env`

Result: **EXPECTED BLOCKED LOCALLY** — the untracked production/provider environment is not present in this checkout. The checker reported missing public application URL, Web Push keys, Stripe price/provider keys, Resend webhook key, newsletter signing secret, calendar/internal secrets, owner notification address, and Firebase Admin identity.

No secret values were printed or copied. Destructive and identity testing will use the loopback Firebase emulator configuration. Provider-backed and hosted checks will use only existing staging evidence or safe read-only requests.

## Hosted staging baseline

Target: `https://studio--the-squad-v2-staging.us-east4.hosted.app`

All requests used `Cache-Control: no-cache`.

| Path | HTTP | Content type | Bytes | SHA-256 / reported revision |
|---|---:|---|---:|---|
| `/api/health` | 200 | `application/json` | 121 | `studio-build-2026-09-04-010`; status `ok` |
| `/manifest.json` | 200 | `application/json; charset=UTF-8` | 667 | `e0ad72cab42256f647a9486c6424262d70ad1badbf619362e45c71817b8954df` |
| `/sw.js` | 200 | `application/javascript; charset=UTF-8` | 3,875 | `0f8d37e1e675349b008cda5f7a652482eda2a3938fbb5b434a4586de2768cb3f` |

Production remains read-only and unchanged.
