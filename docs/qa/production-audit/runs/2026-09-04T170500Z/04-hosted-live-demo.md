# Hosted Live-Demo Evidence

## Deployed candidate

- Commit: `ffcf5c9b20f13c95d081cf1b1d6a763c0c72cbfe`
- Release gate: `33909495858` — PASS
- Staging workflow: `33909834915` — PASS
- App Hosting revision: `studio-build-2026-09-04-011`
- Health, manifest, and service worker: PASS

## Provider configuration probes

- Stripe account request: HTTP 200, test mode
- Ten required Stripe prices: HTTP 200, active, test mode
- Resend credential: HTTP 200; configured domain verified
- Stripe standard invalid signature: HTTP 400
- Stripe Connect invalid signature: HTTP 400
- Resend invalid signature: HTTP 400

No secret values, provider identifiers, customer data, or message contents were retained.

## Playwright evidence

Two fresh, isolated browser sessions launched simultaneously from the public `Experience Demo` selector:

1. Squad Pro coach: seeded `Apex Demo Squad`, rendered Dashboard, Chat list, and `Squad Main Channel` with zero application console errors.
2. Adult player: seeded `Strikers`, rendered the role-specific Dashboard with zero application console errors.

The coach chat detail rendered its seeded historical messages on desktop and at 390×844. The root and body scroll widths both remained 390 CSS pixels. Evidence screenshots are under `output/playwright/2026-09-04-live-demo/`.

## Defect discovered

Both valid same-origin `POST /api/demo/exit` requests returned HTTP 403 with `Cross-origin demo cleanup is not allowed.` App Hosting's reverse proxy made `request.nextUrl.origin` differ from the browser's public origin. BUG-021 changes this comparison to the configured trusted public origin. The regression failed before the code repair and passed after it.

## Remaining acceptance action

Deploy the BUG-021 successor candidate, rerun one anonymous demo, verify `POST /api/demo/exit` returns HTTP 204, and confirm the disposable Auth and Firestore roots are removed. The broader production matrix remains blocked by the independent provider, device, and specialized-fixture cases named in `05-coverage-matrix.md`.
