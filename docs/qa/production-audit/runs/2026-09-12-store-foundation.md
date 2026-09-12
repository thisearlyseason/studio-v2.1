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

The dynamic policy is applied at the resource markdown renderer, resource download cards, RSS cards, and search results. It does not inspect DOM text or intercept all application requests.

## Automated evidence

- Policy RED: `node --import tsx --test tests/app-distribution.test.mjs` failed because `src/lib/app-distribution.ts` did not exist. GREEN after implementation; later expanded dynamic-link and help-content cases also failed before their policy changes and passed afterward.
- Purchase RED: handler probes reached existing authentication (401) before the guard existed; adding addon/update cases reproduced the same failure. GREEN: all eight creation handlers return the expected early 403 in Store mode.
- Signup RED: `tests/store-signup-flow.test.mjs` failed on the missing helper. GREEN: all five roles, skipped-plan navigation, join-code destinations, and missing-profile onboarding paths passed.
- Focused regression: 76 passed, 0 failed across Store policy/purchase/signup plus account authentication, pending enrollment, billing-plan status, Coaches Corner entitlements, public portals, and Stripe subscription tests.
- Full suite: `npm test` — 1516 passed, 8 skipped, 0 failed (1524 tests).
- TypeScript: `npm run typecheck` — passed.
- Lint: `npm run lint` — 0 errors, 1903 warnings. Compared with the controller's 1901-warning sports/navigation baseline, task production code adds no warnings: it removes two prior unused-import warnings in `StripePaywall`; the current worktree adds four `no-unused-expressions` warnings from controller-owned unstaged Store browser scripts, which this task did not edit.

## Controller-owned browser/emulator evidence

The independent controller supplied local isolated-emulator evidence in `output/playwright/sep12-store/`:

- `store-forms.log`: 48 Store form/direct-route/API assertions passed.
- `store-identity.log`: 40 assertions passed for five real Firebase-emulator signup, OOB verification, session and reload flows; created profiles had the expected roles and no paid/authority fields.
- `store-negative.log`: 13 assertions passed for duplicate/network rollback, valid athlete enrollment persistence, parent linking and invalid-code handling.
- `store-session.log`: 20 desktop/mobile assertions passed for hydrated school/league/existing-paid login, stale returns, reload, settings and logout. The existing active-paid fixture retained its entitlement display.
- `store-free-team.log` and `store-free-team-state.log`: a free coach reached `/teams/new?tier=pro`, created a team without checkout, and the canonical team remained `planId: free` and `isPro: false`.
- `store-settings-visual.log`: Store settings visual evidence.
- Store hockey/resources/footer check: two legitimate downloads remained and no pricing links rendered.

These browser results used local emulators and a memory mail sink. They are not hosted/provider proof.

## Open boundary

Sequential web/store production builds, release-target verification against their resulting servers, native shell/auth/push/moderation/deletion-review work, physical iPhone/Android acceptance, signing, submission, and store review are outside steps 1–6 and remain unverified here.
