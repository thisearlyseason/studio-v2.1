# Native Companion Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a separately testable store web distribution with free signup and no purchasing, preserving normal website behavior.

**Architecture:** One build-time distribution policy governs signup, navigation, middleware, and purchase endpoint guards. Existing Firebase authorization and billing entitlement logic stays authoritative. Store-only presentation replaces purchase controls with neutral account/team actions; this is not yet a native package.

**Tech Stack:** Next.js 15, React, TypeScript, Firebase, Node test runner, Playwright CLI.

**Spec:** `docs/superpowers/specs/2026-09-12-native-companion-foundation-design.md` (approved by user “proceed”).

## Global Constraints

- The Apple and Android apps will allow free-account creation and existing-account login.
- Signup must never start a paid trial, request a card, or direct a new user to checkout.
- Existing users retain their legitimate server-verified subscription and team access.
- The website keeps its current plans and Stripe flows.
- The Squad remains the primary app. Scheduler remains a secondary PWA, not a second store submission in this phase.
- Newsletter enrollment and notification permission remain optional and separate from account creation.
- Neither a query parameter, user-agent string, nor local storage is sufficient to identify a store distribution.
- No Stripe subscription is canceled, migrated, granted, or downgraded by this work package.
- No SDK dependency or DNS/provider change is needed merely to test the store web foundation locally.
- Do not ship the foundation as a supposedly store-ready wrapper.

## Execution boundaries

Preserve existing uncommitted sports/navigation work. Do not stage unrelated edits or pre-existing September 9 QA documents. No deployment, live account creation, provider changes, purchase, or store submission in this implementation. Local emulators may be used for isolated identity tests; provider-bound tests must be reported separately. No full audit rerun. The controller performs browser checks while the implementer handles code/test gates. Implementation and review run sequentially to avoid shared-file conflicts.

### Task 1: Store distribution policy, free signup, and purchase isolation

**Files:**
- Create `src/lib/app-distribution.ts`: universal pure distribution/route policy, no Node-only imports.
- Create `src/lib/store-request-guard.ts`: server request guard returning a neutral 403 for purchase operations.
- Create `src/app/app-unavailable/page.tsx`: neutral account/team/support destination without purchase links.
- Create `src/app/api/app-distribution/route.ts`: no-store build identity response for future native release verification.
- Create `scripts/verify-store-target.mjs`: reject web/unknown/missing target identity; no deployment side effects.
- Create `tests/app-distribution.test.mjs` and `tests/store-purchase-boundary.test.mjs`: executable policy/handler/target tests.
- Modify `next.config.ts`: validate and bake `NEXT_PUBLIC_APP_DISTRIBUTION` (`web` by default, `store` explicitly); server/client use the same compiled value. No new dependencies.
- Modify `src/middleware.ts`: store route boundary before authentication/projection checks. Preserve website logic and API matcher exclusions; API handlers require their own guard.
- Modify `src/app/signup/page.tsx`, `src/app/login/page.tsx`, `src/app/verify-email/page.tsx`: free-only flow and validated return paths; preserve profile/verification/rollback/join logic.
- Modify purchase handlers `src/app/api/checkout/route.ts`, `src/app/api/stripe/{create-checkout,customer-portal,payment-items,fundraising-link,connect/onboard}/route.ts`; inspect payment/subscription mutation routes for additional purchase creation operations before concluding coverage.
- Modify shared entry points `src/components/layout/{Shell,AccessRestricted}.tsx`, `src/components/StripePaywall.tsx`, `src/app/(dashboard)/{settings,teams/new}/page.tsx`, and directly affected purchase controls discovered in the bounded inventory. Do not redesign components or change authorization.
- Add a small store navigation boundary only if needed for dynamic user-content links; do not hide arbitrary DOM text or intercept every application request.
- Record the reachable-route/control inventory and actual verification evidence in `docs/qa/production-audit/runs/2026-09-12-store-foundation.md`.

**Interfaces:**
- Consumes existing Firebase signup/session/enrollment helpers and backend entitlement checks without changing their contracts.
- Produces `type AppDistribution = 'web' | 'store'`, `APP_DISTRIBUTION`, `isStoreDistribution`, `isStoreBlockedPath(pathname: string): boolean`, and `safeReturnPath(candidate: string | null | undefined, distribution?: AppDistribution): string`.
- Produces `storePurchaseResponse(): Response | null` for route handlers; return it before parsing requests or touching Stripe/Firebase in store mode.
- Later release tooling consumes `GET /api/app-distribution` JSON `{ distribution: 'web' | 'store' }`; script requires HTTPS except explicit local test mode and refuses redirects to unverified targets.

- [x] **Step 1: Write failing executable policy tests before implementation.** Catch removal of the store branch, unsafe URL normalization, nested purchase returns, and incorrect default mode. Begin with independently derived cases:

```js
assert.equal(safeReturnPath('/pricing', 'web'), '/pricing');
assert.equal(safeReturnPath('/pricing', 'store'), '/dashboard');
assert.equal(safeReturnPath('/dashboard/billing', 'store'), '/dashboard');
assert.equal(safeReturnPath('//evil.example', 'store'), '/dashboard');
assert.equal(safeReturnPath('/\\evil.example', 'store'), '/dashboard');
assert.equal(safeReturnPath('/family?addChild=1&returnTo=%2Fpricing', 'store'), '/dashboard');
assert.equal(safeReturnPath('/teams/join?code=DEMO_C', 'store'), '/teams/join?code=DEMO_C');
assert.equal(safeReturnPath('/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C', 'store'), '/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C');
```

- [x] **Step 2: Run RED, then implement the minimal pure policy.** Run `node --import tsx --test tests/app-distribution.test.mjs`. Confirm expected missing-policy behavior, not a harness syntax error. Normalize a URL only after rejecting non-local input, backslashes, control characters, encoded separators and malformed input. Bound recursive return validation. Block pricing/billing/checkout and purchase-capable public registration/donation pages in store; neutral routes remain usable. Default web preserves existing legitimate relative returns.

```ts
export type AppDistribution = 'web' | 'store';
export const APP_DISTRIBUTION = process.env.NEXT_PUBLIC_APP_DISTRIBUTION === 'store' ? 'store' : 'web';
export const isStoreDistribution = APP_DISTRIBUTION === 'store';
// next.config.ts rejects any explicitly configured value other than web/store.
```

- [x] **Step 3: Write failing purchase/identity tests, implement server enforcement, run GREEN.** Each purchase creation handler begins with:

```ts
const blocked = storePurchaseResponse();
if (blocked) return blocked;
```

Test actual handler/guard outputs in store mode with invalid/absent auth, proving early 403 rather than reaching a provider. Preserve web authentication checks. Test identity script against local controlled web/store/invalid/unreachable/redirect responses. Use Node subprocesses or module isolation for build-mode tests; never mutate production secrets. Public web pricing stays accessible; direct store URLs render a neutral destination without an upgrade redirect.

- [x] **Step 4: Write failing signup-flow tests, then implement store-only branching.** All supported roles choose the existing free path. Coach/school/league skip plan step; parent/athlete retain optional join step. The store account form says free account/no payment details; no paid plan/trial summary. Back/progress navigation must agree with the skipped plan step. School/league neutral explanation must not imply role selection grants paid organizational privileges. Store redirects parent with join to family linking, athlete with join to team enrollment, coach to existing free-team onboarding, and organization roles to safe existing-team/account actions. Do not add subscription/plan/seat fields to a free profile. Apply `safeReturnPath` in login and verify-email consumers, including stale stored values.

```ts
if (isStoreDistribution) {
  setPlanChoice('starter');
  setStep(regTarget === 'self' || regTarget === 'child' ? 'join_team' : 'account');
  return;
}
```

- [x] **Step 5: Inventory and isolate reachable purchasing controls.** Use targeted searches for pricing, checkout, billing, upgrade, trial, `window.open`, payment URLs and resource/footer links. Inventory each affected shared control with store treatment and web treatment in the QA record. Remove store upgrade banners, billing/checkout links, paid registration/donation entry points and external purchasing CTAs. Keep read-only finances/receipts and legitimate paid features where they do not launch purchase flows. Provide account/team/support alternatives, not misleading disabled upgrade controls. Store root must not display public marketing pricing. Dynamic user-content links need explicit safe treatment so Stripe/external purchase links cannot open from the companion. Native auth SDK is later: do not present embedded Google OAuth as native-compliant.

- [x] **Step 6: Run focused automated checks and report for independent review.** Run new tests and existing signup/session/billing/entitlement tests affected by this change. Run `npm test`, `npm run typecheck`, `npm run lint` once at the task gate, logging existing warnings separately. Do not run build during a controller-owned browser server. Commit only this task's new files and dedicated hunks; mixed dirty files require partial staging or leave those files unstaged with exact diff evidence in the report. Self-review must name unresolved acceptance gaps without marking them PASS.

- [x] **Step 7: Controller verifies rendered web/store modes, then release gates.** With a fresh browser session, check each role's forward/back/signup validation on desktop/mobile, direct purchase routes, unauthorized purchase API responses, privacy/support/deletion discovery and safe returns. Use existing QA emulator helpers for new/no-entitlement and existing-paid access where feasible. Record provider-emulated assertions separately from hosted proof; no real emails/accounts needed for local checks. Close owned dev server before sequential production builds for web and store. Identity release verifier must accept store and reject web. Review fixes require focused retesting, not an audit restart.

- [x] **Step 8: Report exact completion boundary.** Native shell/auth/push/moderation/deletion review/signing/store submission remain later packages per approved spec. Never call this deployed, store certified, or full production certified from local foundation checks.
