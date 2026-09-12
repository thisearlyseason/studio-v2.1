# Store foundation — local implementation and QA record

Date: 2026-09-12

Starting revision: `93b3ad1c91e6bf7c5036b990fda83cd5dd5ab3d7`

Scope: approved native-companion web foundation, steps 1–6. This record is local/emulator evidence only; it is not hosted, native-shell, device, store-review, or deployment certification.

## Distribution and route boundary

| Reachable surface | Store treatment | Web treatment |
| --- | --- | --- |
| `/` | Rewritten to the existing login page, no-store/noindex | Existing marketing home unchanged |
| `/pricing`, `/checkout`, `/dashboard/billing` and nested paths | Neutral `/app-unavailable` response with status 403 | Existing routes unchanged |
| `/register/league`, `/register/tournament`, `/events/register`, `/public/donate` and nested paths | Neutral `/app-unavailable` response with status 403 | Existing routes unchanged |
| `/login`, `/signup`, `/verify-email`, `/onboarding` | Free signup and safe local returns; embedded Google CTA is unavailable pending native auth | Existing role/plan and Google paths unchanged |
| `/dashboard` after school/league/admin hydration | Neutral dashboard; does not manufacture organization authority or force a paid hub | Existing role routing unchanged |
| `/teams/new?tier=pro` | Pro query is ignored; existing free team creation is used unless a real paid entitlement already provides an included seat | Existing plan/quota behavior unchanged |
| `/family/payments`, finance history, invoices and receipts | Read-only records, invoice downloads and Stripe receipt URLs remain available | Unchanged |
| `/how-to` | Purchase-specific activation, Stripe setup, and subscription/billing guide sections omitted by explicit distribution metadata | Full guide unchanged |
| Help (`/how-to` and the existing Bug Reporter), `/privacy`, account deletion and settings | Remain reachable; neutral unavailable page also exposes `mailto:team@thesquad.pro` | Unchanged |

Return validation rejects non-local URLs, network-path/backslash/control-character forms, malformed or encoded path separators, and recursively nested purchase destinations. Valid athlete and parent join-code returns remain intact.

## Purchase-operation inventory

Store handlers return an empty, no-store 403 before request parsing, authentication, Firebase, or Stripe access:

- `/api/checkout`
- `/api/stripe/create-checkout`
- `/api/stripe/customer-portal`
- `/api/stripe/payment-items` `POST`
- `/api/stripe/fundraising-link` `POST`
- `/api/stripe/connect/onboard`
- `/api/subscription/addon`
- `/api/subscription/update`

Read/status operations, payment-link deactivation/deletion, subscription sync, and cancellation are intentionally retained for existing-account management. Store distribution is a product boundary, not an entitlement or authorization signal.

## Reachable control and dynamic-link inventory

| Control | Store treatment | Web treatment |
| --- | --- | --- |
| Shell trial/upgrade banners, restricted-feature paywall, Stripe paywall | Neutral feature/account alternatives; no upgrade launch | Existing upgrade behavior unchanged |
| Settings subscription/add-on actions | Status remains visible; purchase/manage-upgrade CTAs omitted | Existing controls unchanged |
| Team and hub Stripe setup | Connection status remains visible; connect/retry/platform-profile and routing-mode mutation controls omitted | Existing controls unchanged |
| Payment items | Existing items visible; create/copy/open-payment-link controls omitted; deactivation remains | Existing controls unchanged |
| Fundraising | Existing records and internal contribution history remain; creation/share/external donation/e-transfer configuration omitted | Existing controls unchanged |
| Sports Hub footer, audience pages, sport landing | Pricing CTAs omitted; app/help/legal navigation retained | Existing links unchanged |
| Sports resources/articles and user-configured URLs | Store uses a fail-closed navigation policy: local safe paths and reviewed read-only YouTube, storage, maps, the support email, and Stripe receipt destinations are allowed; unreviewed external destinations are not rendered | Existing external navigation unchanged |

The dynamic policy is applied at the resource markdown renderer, resource download cards, RSS cards, search results, and Library add/open controls. Existing unsafe Library links have a neutral non-clickable state. Authenticated Library downloads remain available. Absolute public website links are refused in Store mode; an absolute app URL must match the configured origin exactly. Local-looking backslash escapes are refused. The policy does not inspect DOM text or intercept all application requests.

## Automated evidence

- Policy RED: `node --import tsx --test tests/app-distribution.test.mjs` failed because `src/lib/app-distribution.ts` did not exist. GREEN after implementation; later expanded dynamic-link and help-content cases also failed before their policy changes and passed afterward.
- Purchase RED: handler probes reached existing authentication (401) before the guard existed; adding addon/update cases reproduced the same failure. GREEN: all eight creation handlers return the expected early 403 in Store mode.
- Signup RED: `tests/store-signup-flow.test.mjs` failed on the missing helper. GREEN: all five roles, skipped-plan navigation, join-code destinations, and missing-profile onboarding paths passed.
- Focused regression: 76 passed, 0 failed across Store policy/purchase/signup plus account authentication, pending enrollment, billing-plan status, Coaches Corner entitlements, public portals, and Stripe subscription tests.
- Final full suite after independent-review fixes: `npm test` — 1517 passed, 8 skipped, 0 failed (1525 tests); `output/playwright/sep12-store/tests-final.log`.
- TypeScript: `npm run typecheck` — passed.
- Final lint: `npm run lint` — 0 errors, 1899 existing warnings; `output/playwright/sep12-store/lint-final.log`. Production code removes two unused-import warnings compared with the 1901-warning sports/navigation baseline. Browser-script function expressions use the existing CLI-specific lint annotation.
- Independent review initially found three purchase-navigation gaps: persisted Library links, absolute links to public website signup/marketing, and slash-backslash origin confusion. Commit `22b424a2` fixed these with RED/GREEN executable tests; focused regression was 22 passed, 0 failed. Scoped independent re-review approved all three fixes, with no directly introduced regression found.

## Controller-owned browser/emulator evidence

The independent controller supplied local isolated-emulator evidence in `output/playwright/sep12-store/`:

- `store-forms.log`: 48 Store form/direct-route/API assertions passed.
- `store-identity.log`: 40 assertions passed for five real Firebase-emulator signup, OOB verification, session and reload flows; created profiles had the expected roles and no paid/authority fields.
- `store-negative.log`: 13 assertions passed for duplicate/network rollback, valid athlete enrollment persistence, parent linking and invalid-code handling.
- `store-session.log`: 20 desktop/mobile assertions passed for hydrated school/league/existing-paid login, stale returns, reload, settings and logout. The existing active-paid fixture retained its entitlement display.
- `store-free-team.log` and `store-free-team-state.log`: a free coach reached `/teams/new?tier=pro`, created a team without checkout, and the canonical team remained `planId: free` and `isPro: false`.
- `store-settings-visual.log`: Store settings visual evidence.
- Store hockey/resources/footer check: two legitimate downloads remained and no pricing links rendered.
- `web-forms.log`: 28 website role/form assertions passed before Store execution.
- `store-library-final.log`: 9 built-Store assertions passed: three persisted unsafe link types neutralized, new purchase link rejected without persistence, authenticated PDF downloaded successfully, mobile fit and no uncaught errors.
- `store-built-smoke-final.log`: 20 built-Store assertions passed for root identity, sport CTA/footer/PDF preservation at 1440 and 390 pixels, privacy/help, all eight early purchase API guards, and zero page/console errors in the tested context.
- `store-build-final.log`: production Store build passed. `store-target-final.log` accepted its target even with runtime distribution deliberately set to `web`, confirming build-time identity.
- `web-build-final.log`: production Web build passed. `web-identity-final.log` confirmed Web identity with runtime distribution deliberately set to `store`; the release verifier correctly refused this target.
- `web-built-smoke-final.log`: 20 compatibility assertions passed with zero page/console errors in the tested context: marketing root, desktop/mobile sport resources/footer/purchase CTA, privacy/help, and all eight purchase endpoints retaining their original unauthenticated 401 boundary.
- `web-library-final.log`: 7 assertions passed; existing website link actions remain available, authenticated PDF download completed, mobile fit and no uncaught errors.
- `web-plan-final.log`: the built website's coach signup retained plan selection and its free Starter option on mobile.

These browser results used local emulators and a memory mail sink. They are not hosted/provider proof.

Built-browser tests explicitly use a test-only `bypassCSP` context to reach the local Firebase emulators. Production CSP correctly excludes localhost emulator endpoints and was not relaxed. An earlier built smoke failed on this environment mismatch. Later harness-only attempts counted hidden Next streamed HTML twice; selectors now wait for visible user controls. These failed attempts are not app repairs or independent PASS evidence; the named final logs contain the successful fresh checks. The implementer also recorded one concurrent-build certification-harness shutdown timeout; its isolated check and subsequent full run passed. The controller's independent final full suite passed.

## Open boundary

The approved Store web foundation is implemented and locally verified. Native shell/auth/push/moderation/deletion-review work, physical iPhone/Android acceptance, signing, submission, hosted deployment, and store review remain later packages. No deployment or store-certification claim is made.

Review scope ruling: the single task review and final foundation integration review were combined because they inspect the same scoped change. The independent reviewer required the three fixes above and re-reviewed them. Prior sports/navigation reviews were not repeated; directly affected UI received the final built-mode checks.
