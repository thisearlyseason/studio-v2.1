# Defect Ledger

**Run:** `2026-08-21T232919Z`  
**Environment:** local development plus isolated Firebase preview  
**Status:** Phase 2 findings followed up through 2026-09-03; four defects are resolved and BUG-005 is fixed on staging pending physical-device acceptance. Provider evidence is recorded separately from the still-incomplete coverage matrix.

## BUG-001 — Event deletion has no confirmation (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Events — Event CRUD |
| Role | Anonymous Squad Pro demo coach/staff |
| Page or route | `/events` |
| Description | The destructive event delete control executes immediately and offers no confirmation or cancel opportunity. |
| Expected behavior | Clicking delete opens a confirmation dialog that identifies the event; only explicit confirmation deletes it. Cancel leaves it unchanged. |
| Actual behavior | One click on `Delete QA Audit Practice` removed the event immediately. |
| Exact reproduction steps | 1. Launch Squad Pro demo. 2. Open `/events`. 3. Create `QA Audit Practice` with a valid future date/time. 4. Reload and open the event. 5. Click `Delete QA Audit Practice` once. |
| Reproduction consistency | 1/1; deterministic code path confirmed |
| Browser | Chromium, desktop |
| Console evidence | No application error; deletion silently succeeds |
| Network evidence | Create action returned HTTP 200; delete completed without an intervening confirmation state |
| Likely code area | `src/app/(dashboard)/events/EventDetailDialog.tsx:306` directly calls `onDelete(event.id)` from the button |
| Related features | Schedule, attendance, RSVP, reminders, calendar views |
| Artifacts | `output/playwright/2026-08-21T232919Z/root-demo/event-before-delete.yml`, `event-after-delete.yml`, `pro-demo.trace` |
| Fix | The delete control now opens an `AlertDialog`; only its explicit `Delete Activity` action invokes deletion. |
| Verification | 2026-09-02 Chromium demo: opening Delete displayed the event-specific confirmation; Cancel left the event detail and event record visible. `tests/audit-regressions.test.mjs` covers the confirmation boundary. |
| Status | RESOLVED |

## BUG-003 — Verified zero-team Coach is redirected away from first-team creation (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Signup/onboarding — Coach first-team creation |
| Role | Verified synthetic Coach owner in isolated staging |
| Page or route | `/verify-email`, `/teams/new`, `/teams/join` |
| Description | The server account-admission policy treated every non-independent account with no team as a join-only user. It therefore overrode the Coach signup destination and redirected an already-verified Coach from `/teams/new` to `/teams/join`. |
| Expected behavior | A verified Coach with no squad reaches the first-team creation form; ordinary no-team member accounts continue to land at `/teams/join`. |
| Actual behavior | The stored staging profile had role `coach`, but direct `/teams/new` navigation consistently ended at `/teams/join`. |
| Exact reproduction steps | 1. Create a synthetic Coach account in staging. 2. Complete the branded verification email. 3. Navigate to `/teams/new`. 4. Observe the Join & Invite page instead of the Launch Squad form. |
| Reproduction consistency | 2/2 direct navigations before the fix; fixed route verified after deployment. |
| Browser | Chromium staging session |
| Console evidence | No application errors or warnings. |
| Network/state evidence | Server-side staging profile lookup confirmed role `coach`; the admission policy returned `/teams/join` solely because no active squad existed. |
| Root cause | `src/lib/account-session-policy.ts` only exempted independent authorities before applying the no-squad `/teams/join` fallback; `coach` was omitted. |
| Fix | Coach profiles now receive the trusted `/teams/new` admission destination before the no-squad fallback. The validated browser-session destination allowlist accepts that internal route. |
| Verification | Regression tests first failed with `/teams/join`, then passed with `/teams/new`; targeted policy suite passed 52/52, TypeScript check passed, and lint completed with 0 errors (existing warnings only). Staging build `build-2026-09-03-001` deployed commit `141edfbd88c88dab9a605049c27a0932308de3ff`; the same verified Coach reached the Launch Squad form at `/teams/new` without creating a team. |
| Status | RESOLVED |

## BUG-004 — Staging Connect webhook endpoint cannot deliver required event coverage (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Stripe Connect — payment webhook processing |
| Role | Provider / isolated Stripe test account |
| Page or route | `/api/stripe/connect/webhook` |
| Description | The enabled staging Connect endpoint did not produce a receipt for a real connected-account event and its selected event list omitted the payment-failure case handled by the application. |
| Expected behavior | Stripe test-mode connected-account events reach the staging handler with a valid signature, complete once, and are safe to replay. |
| Actual behavior | The previous endpoint never created a `stripeConnectWebhookEvents` ledger record for a real connected-account `payment_intent.created` event, even though the deployed handler accepted a correctly signed event directly. |
| Exact reproduction steps | 1. Create an isolated Stripe test connected account. 2. Create an unconfirmed CAD PaymentIntent on that account. 3. Wait for delivery. 4. Query the staging Connect ledger using the event ID. 5. Observe no receipt from the prior endpoint. |
| Reproduction consistency | 1/1 connected-account delivery before repair; post-repair `payment_intent.created` and `payment_intent.payment_failed` each completed once. |
| Browser | Stripe test API and staging service verification; no production account, payout, or card used. |
| Console evidence | No application error required to reproduce; invalid-signature negative checks returned the expected HTTP 400. |
| Network/state evidence | Standard and Connect invalid signatures returned HTTP 400. A direct valid signed Connect event completed once and replay returned the duplicate acknowledgment. The replacement endpoint recorded actual connected-account created and failed events as `completed` with one attempt. |
| Root cause | The existing endpoint configuration was not a valid current Connect event destination and did not cover the handler's payment-failure path. Its signing configuration could not be certified from provider delivery evidence. |
| Fix | Created one new Stripe test-mode Connect endpoint subscribed to the supported Connect event set, securely updated `STRIPE_CONNECT_WEBHOOK_SECRET` in staging, deployed App Hosting build `build-2026-09-03-002`, verified signed delivery, then disabled only the superseded Connect endpoint. |
| Verification | Staging revision `studio-build-2026-09-03-002` is ready and returns HTTP 200. Standard endpoint remains enabled. The replacement Connect endpoint is enabled; the old Connect endpoint is disabled. |
| Status | RESOLVED |

## BUG-005 — Chat messages do not notify Android and installed app shows Schedule identity (device verification pending)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team Chat notifications and PWA installation |
| Role | Active team member on Android; cross-platform Home Screen user |
| Page or route | `/chats/[chatId]`, `/api/teams/chat/message`, `/settings`, `/manifest.json`, `/sw.js` |
| Description | A physical Android test received no notification after another member sent a live chat message. The installed shortcut identified itself as Schedule and did not show the expected Squad icon. |
| Expected behavior | Other active channel members receive one background notification; the sender does not. Android and iPhone/iPad install The Squad with the Squad icon and open the dashboard. |
| Actual behavior | The chat write completed without any notification fan-out. Only `/schedule-app` registered the worker globally, and the companion layout carried Schedule-specific Apple metadata. |
| Reproduction consistency | User-observed on one Android device before repair; code paths deterministically confirmed the missing server send and root worker registration. |
| Root cause | The chat message route persisted messages but never called notification delivery. The main app did not register `/sw.js`; the worker cached the Schedule companion route and the manifest started at `/`. Firebase JavaScript Messaging also cannot be the sole iPhone/iPad Home Screen transport. |
| Fix | Added authenticated standards Web Push subscriptions alongside FCM; shared server fan-out; active channel-member resolution with sender exclusion; chat post-write delivery; root worker registration; The Squad manifest identity and icons; a public-only offline shell; and Push API fallback for browsers without Firebase Messaging support. Separate VAPID configuration is mandatory. |
| Automated verification | Local authoritative `npm run verify` passed: 395 application tests, 38 Firestore/Storage rules tests, app and Functions typechecks, lint with zero errors, and production builds. Protected staging workflow `33760676821` passed verification, infrastructure deployment, App Hosting rollout, and health for application commit `90a600b1`. Hosted manifest, worker, offline page, and both PNG icons returned HTTP 200; a real Chromium session reported a root-scoped active controlling worker and zero console errors/warnings. |
| Remaining acceptance | Remove the old Schedule shortcut; install The Squad on physical Android and iPhone/iPad Home Screen; enable Tactical Alerts; confirm receipt and click-through from another current channel member; confirm sender exclusion and opt-out. |
| Status | FIX DEPLOYED TO STAGING; PHYSICAL DEVICE VERIFICATION REQUIRED |

## BUG-002 — Sports Hub header search collapses at tablet width (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Sports Hub — browse/search |
| Role | Visitor |
| Page or route | `/sports-hub` |
| Description | At 768×1024, the global Sports Hub header search shrinks to roughly 94 px and clips its placeholder to a single `S`. |
| Expected behavior | The primary search control remains visibly identifiable and usable at the representative tablet viewport. |
| Actual behavior | Fixed adjacent header actions compress the search until its text affordance is materially clipped. |
| Exact reproduction steps | 1. Open a fresh visitor session. 2. Resize to 768×1024. 3. Navigate to `/sports-hub`. 4. Inspect the header search control. |
| Reproduction consistency | 1/1 at 768×1024; wider desktop and mobile layouts did not show the same symptom |
| Browser | Chromium |
| Console evidence | 0 errors, 0 warnings |
| Network evidence | 0 unexpected failures; page and assets loaded successfully |
| Likely code area | `src/components/sports-hub/SportsHubClientLayout.tsx` search container and `SearchBar.tsx` |
| Related features | Sports Hub navigation, article/resource discovery, responsive header |
| Artifacts | `output/playwright/2026-08-21T232919Z/public-content/sports-hub-tablet-768x1024.png` and public-content trace |
| Fix | The persistent input is deferred from `md` to `lg`; a named compact search button is visible from mobile through tablet widths. |
| Verification | 2026-09-02 Chromium at 768×1024: `Search Sports Hub` is a visible named control in the header and no clipped header field is present. `tests/audit-regressions.test.mjs` covers the breakpoint contract. |
| Status | RESOLVED |
