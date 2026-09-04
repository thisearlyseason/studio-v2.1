# Defect Ledger

**Run:** `2026-08-21T232919Z`  
**Environment:** local development plus isolated Firebase preview  
**Status:** Phase 2 findings followed up through 2026-09-04; twenty defects are resolved and BUG-011 is retired by product decision. BUG-005 now has physical Android closed-app push, tap-through, launcher-dot, and adaptive-icon acceptance; its broader negative-case and iPhone/iPad certification requirements remain blocked in the coverage matrix rather than open as an implementation defect. Provider evidence and deterministic emulator evidence are recorded separately from the still-incomplete coverage matrix.

## BUG-021 — Hosted demo cleanup rejects its own public origin (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Anonymous live demo — immediate cleanup |
| Role | Anonymous demo visitor |
| Page or route | `/api/demo/exit` |
| Description | A same-site cleanup request from the hosted App Hosting domain returned HTTP 403 after a demo session. |
| Expected behavior | Same-origin anonymous demos can delete their disposable workspace immediately; foreign origins remain denied. |
| Actual behavior | The route compared the browser `Origin` header with `request.nextUrl.origin`, which reflects the internal proxy origin in App Hosting rather than the configured public origin. |
| Root cause | The CSRF boundary trusted proxy-derived URL state instead of the configured application origin already used by server request guards. |
| Fix | Demo cleanup now compares the request origin with `getTrustedAppOrigin(request)`, retaining production configured-origin and local-development loopback restrictions. |
| Verification | The regression was observed failing before the repair and passing after it. Hosted Playwright retest is recorded in `runs/2026-09-04T170500Z/04-hosted-live-demo.md`. |
| Status | RESOLVED |

## BUG-020 — Assigned equipment can be deleted (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Equipment — inventory integrity |
| Role | Team owner or authorized staff |
| Page or route | `/equipment` |
| Description | The delete action removed an equipment document even when active member assignments still existed. |
| Expected behavior | An assigned asset cannot be deleted until every assignment is returned. |
| Actual behavior | The provider called `deleteDoc` without reading assignment state. |
| Root cause | Equipment deletion had no transactional invariant and the UI had no failure handling. |
| Fix | Deletion now runs in a transaction, rejects any non-empty assignment map, and reports `Asset Still Assigned` in the UI. |
| Verification | The regression test fails without the transaction. Real Chrome created stock, rejected an over-assignment, persisted an assignment, blocked deletion, restored stock on return, and then deleted successfully after reload with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-019 — Facility edit control has no accessible name (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Facilities — venue editing |
| Role | Team owner or authorized staff |
| Page or route | `/facilities` |
| Description | The icon-only facility edit button exposed no stable accessible name. |
| Expected behavior | Assistive technology identifies the specific facility edit action. |
| Actual behavior | Only a pencil icon and hover tooltip described the action. |
| Root cause | The trigger omitted `aria-label`. |
| Fix | Added the facility-specific accessible name `Edit {facility name}`. |
| Verification | Source regression and the real Chrome edit/persistence workflow both passed. |
| Status | RESOLVED |

## BUG-018 — Incomplete facility form submits as a silent no-op (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Facilities — enrollment validation |
| Role | Team owner or authorized staff |
| Page or route | `/facilities` |
| Description | Entering only a venue name enabled the submit button, but clicking it returned silently because the address was absent. |
| Expected behavior | Both required fields are identified and incomplete enrollment cannot be submitted. |
| Actual behavior | An enabled action performed no work and displayed no validation state. |
| Root cause | The button checked only `newFac.name` while the handler required name and address. |
| Fix | Required markers and trimmed name/address checks now control both the handler and disabled state. |
| Verification | Source regression plus real Chrome proved disabled-empty, disabled-name-only, enabled-complete, and persisted creation. |
| Status | RESOLVED |

## BUG-017 — Legacy chat messages crash the conversation detail (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team Chat — message rendering |
| Role | Active team member |
| Page or route | `/chats/[chatId]` |
| Description | A valid legacy message using `senderId`, `text`, and a Firestore timestamp reached the renderer without the newer `author`, `content`, and ISO timestamp fields. |
| Expected behavior | Supported historical messages render safely while current messages retain their data. |
| Actual behavior | The detail page read `msg.author[0]` and crashed when `author` was absent. |
| Root cause | The Firestore boundary did not normalize legacy message shapes. |
| Fix | Added a bounded chat-message normalizer for identity, content, type, and timestamp fields before rendering. |
| Verification | Unit regressions cover legacy, current, and missing-field shapes. Real Chrome loaded the seeded legacy conversation and then completed cross-role message persistence with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-016 — Legacy events can crash Calendar (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Calendar — team event discovery |
| Role | Active team user |
| Page or route | `/calendar` |
| Description | Legacy team-subcollection events without an embedded `teamId` reached Calendar discovery, which called `.slice()` on the missing value. |
| Expected behavior | A team-subcollection event inherits its containing team and renders safely. |
| Actual behavior | Calendar entered its error boundary with `Cannot read properties of undefined`. |
| Root cause | Provider hydration trusted duplicated document fields instead of applying collection context. |
| Fix | Event hydration now normalizes the containing team ID, Calendar filters invalid identifiers, and context-free malformed events fail closed. |
| Verification | Unit regressions cover inheritance, explicit IDs, and fail-closed input. The exact owner surface sweep then rendered Calendar with zero console errors and zero 5xx responses. |
| Status | RESOLVED |

## BUG-015 — Pending-deletion login crashes behind the sign-in screen (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Authentication — blocked account admission |
| Role | Deletion-pending account |
| Page or route | `/login` |
| Description | Before the secure session API completed its denial, the root team provider started protected profile, membership, and school-invite Firestore work. Rules rejected those listeners and the login screen crashed. |
| Expected behavior | The account stays on `/login`, receives the generic session-setup failure, and starts no protected team work. |
| Actual behavior | Firestore permission errors reached the application error boundary. |
| Root cause | Root provider effects were not gated on authentication routes and the failed login left the Firebase client signed in. |
| Fix | Authentication-gate routes suppress protected provider effects; failed session establishment clears the browser session and signs out Firebase Auth. |
| Verification | Regression coverage plus the focused real Chrome pending-deletion login test passed without a crash. |
| Status | RESOLVED |

## BUG-014 — Broadcast inbox renders overlapping close controls (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Dashboard Shell — alert inbox and history |
| Role | Any alert recipient |
| Page or route | Shared authenticated Shell |
| Description | `Squad Alert Inbox` added a custom top-right close button even though the shared dialog component already renders one in the same position. The built-in control intercepted pointer input intended for the custom control. |
| Expected behavior | The inbox exposes one keyboard- and pointer-operable close action. |
| Actual behavior | Two overlapping controls competed for the same hit area. |
| Root cause | The feature duplicated behavior supplied by `DialogContent`. |
| Fix | Removed the redundant feature-level `DialogClose` and retained the standard dialog close control. |
| Verification | Source regression enforces a single close implementation. A real Chrome session acknowledged the two eligible Team A alerts, verified history and audience/tenant exclusions, reopened on mobile, and operated the standard close path with zero console errors or 5xx responses. |
| Status | RESOLVED |

## BUG-013 — Desktop squad switcher lacks an accessible name (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Dashboard Shell — active squad switching |
| Role | Multi-team user |
| Page or route | Shared authenticated Shell |
| Description | The mobile lightning control was named `Switch squad`, but the two desktop selector variants exposed only their changing visual contents. Assistive technology and stable UI automation had no consistent action name. |
| Expected behavior | Every responsive switcher trigger has the same stable, descriptive accessible name while preserving visible team context. |
| Actual behavior | Desktop triggers had no explicit accessible label. |
| Root cause | The desktop `DropdownMenuTrigger` buttons omitted the label already present on the mobile trigger. |
| Fix | Added `aria-label="Switch squad"` to both desktop variants and stable non-secret element identifiers for deterministic tenant-switch regression coverage. |
| Verification | A real Chrome session switched an identity belonging to two isolated teams in both desktop and 390×844 mobile layouts. It proved reciprocal event exclusion, three rapid switch round trips, final selection persistence across reload and Back navigation, mobile containment, zero console errors, and zero 5xx responses. |
| Status | RESOLVED |

## BUG-012 — Schedule companion leaks browser-local data across profiles and does not reliably reload offline (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Schedule companion sync, personal todos, and offline shell |
| Role | Any signed-in user sharing a browser or installed PWA |
| Page or route | `/schedule-app`, `/sw.js` |
| Description | Events and todos used global localStorage keys, so a different signed-in profile could inherit the prior profile's cached schedule or tasks. The worker cached only a generic offline page, leaving the client-rendered companion unable to reload reliably offline. The companion also registered a second plain worker despite the root configured registration. |
| Expected behavior | Cached schedules are scoped to user and team, personal todos are scoped to user, selected teams are revalidated against current memberships, malformed storage fails closed, and the public companion shell reloads offline without caching authenticated HTML or API data. |
| Actual behavior | Global cache keys crossed the profile boundary; stale selected-team state was trusted until Firestore denied it; and offline navigation lost the companion UI. |
| Root cause | Browser storage lacked identity namespaces and runtime validation. The service worker had no schedule-shell or static-client-bundle cache path, and duplicate registration could race the configured primary worker. |
| Fix | Added versioned user/team storage keys with runtime shape validation, membership-validated team selection, same-profile offline fallback only, live auth-driven todo swapping, one primary worker registration, a public schedule-shell cache, and same-origin `/_next/static/` caching. Authenticated pages and APIs remain network-only. |
| Verification | Five storage/worker regressions pass. A real Chrome emulator session proved both tenants' correct events, reciprocal event isolation, corrupt/legacy/other-profile todo rejection, CRUD persistence, 390×844 fit, cached-shell offline reload, same-browser Team A to Team B switching, and zero unexpected online or offline console errors. |
| Status | RESOLVED |

## BUG-011 — Time Out game is unreachable and corrupted preferences can crash it (retired)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Time Out local game |
| Role | Authenticated user |
| Page or route | Shared dashboard Shell |
| Description | The complete Time Out launcher/modal implementation was never rendered anywhere, so users could not open it. If exposed, arbitrary stored sport or difficulty strings were cast as valid enum values and could leave the modal without matching sport metadata. |
| Expected behavior | Authenticated users can open the game from the shared header; invalid local preferences fall back safely; documented keyboard/touch controls and persistence work at desktop and mobile sizes. |
| Actual behavior | `TimeOutLauncher` had no consumer, and corrupted local storage was accepted without validation. |
| Root cause | The launcher was orphaned during Shell integration and persisted enum values crossed the storage boundary without runtime normalization. |
| Fix | The product owner explicitly rejected the feature on 2026-09-04. The Shell launcher, production game components, active browser-audit path, and dedicated game tests were removed. |
| Verification | A source regression enforces that the authenticated Shell contains no Time Out launcher or action. |
| Status | RETIRED — NOT APPLICABLE |

## BUG-010 — Profile-only superadmin can receive private applicant notifications (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Public beta/newsletter submissions — admin notification targeting |
| Role | Public applicant and global administrator |
| Page or route | `/api/public/notify-admin` |
| Description | The notification route selected additional email and FCM recipients by querying user profiles whose Firestore `role` value was `superadmin`. A profile-only fake could therefore receive private applicant details despite being denied the admin route and API. |
| Expected behavior | Only identities carrying the verified Firebase custom claim contribute administrator email or push destinations. |
| Actual behavior | Recipient discovery trusted the profile string without checking the Auth claim. |
| Root cause | Notification delivery had an independent profile-based privilege path outside the central request authorization policy. |
| Fix | Candidate profiles are now batched through Firebase Auth and only UIDs with the trusted `superadmin` custom claim contribute normalized email or bounded FCM tokens. The fixed operational inbox remains the fallback. |
| Verification | The regression first failed because no trusted-target filter existed, then passed 2/2 with the fake profile's email/token excluded and malformed target values rejected. Typecheck passed and scoped lint reported zero errors. |
| Status | RESOLVED |

## BUG-009 — Local browser audit cannot connect to enabled Firebase emulators (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Audit infrastructure — Firebase emulator browser execution |
| Role | Synthetic Phase 2 identities |
| Page or route | `/login` and protected dashboard routes |
| Description | The application was explicitly configured for local Firebase emulators, but its Content Security Policy rejected the loopback Auth, Firestore, and Storage connections needed by a real browser. |
| Expected behavior | Development builds with emulator mode explicitly enabled can connect only to the known loopback emulator ports; production CSP remains unchanged. |
| Actual behavior | Browser login failed at the CSP boundary before the synthetic identity and route policy could be exercised. |
| Root cause | `connect-src` included hosted Firebase origins but did not conditionally include the loopback emulator origins. |
| Fix | Development CSP now adds the exact localhost and `127.0.0.1` Auth, Firestore, and Storage ports only when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. |
| Verification | `tests/emulator-csp.test.mjs` covers the environment boundary. The complete emulator audit then authenticated real Chrome sessions and exercised protected routes without relaxing production CSP. |
| Status | RESOLVED |

## BUG-008 — Suspended or deletion-pending accounts can reach Admin SDK APIs (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Account lifecycle — server authorization |
| Role | Suspended, disabled, and deletion-pending registered users |
| Page or route | Authenticated `/api/*` routes and protected dashboard rendering |
| Description | Firestore rules denied inactive account states, but server routes using the Admin SDK validated the token without consistently applying the same account-state restriction. |
| Expected behavior | A suspended, disabled, pending-deletion, or deleted account loses server API and dashboard access even while an otherwise valid credential exists. |
| Actual behavior | The client/rules boundary and Admin SDK boundary used different account-state policies. |
| Root cause | Admin SDK bypasses Firestore rules by design, and the shared server token verifier did not load and evaluate the user's lifecycle state. |
| Fix | Added one shared account-access policy to API authentication, session inspection, and server dashboard authorization. The coarse middleware remains free of a redundant profile read because the dashboard template and admin layout already enforce the server gate. |
| Verification | Policy regressions cover all blocked and allowed lifecycle values. The real emulator audit returned HTTP 403 for a deletion-pending identity, Auth returned `USER_DISABLED` for the disabled identity, and the focused suite passed 18/18. |
| Status | RESOLVED |

## BUG-007 — Profile-only `superadmin` value grants elevated application authority (resolved)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Administration — trusted role boundary |
| Role | Ordinary account with a forged or stale profile role |
| Page or route | `/admin`, shared dashboard navigation, and quota logic |
| Description | Some route and client policy paths treated a Firestore profile value of `superadmin` as equivalent to the trusted Firebase custom claim. |
| Expected behavior | Global administration and superadmin quota elevation depend only on the verified custom claim; profile data alone cannot confer that authority. |
| Actual behavior | The profile role could feed the route policy and client quota calculation as elevated authority. |
| Root cause | Trusted claim state and editable/stale profile state were combined into one normalized role input. |
| Fix | The dashboard policy recognizes superadmin only from the decoded claim. Navigation and quota elevation consume the trusted `isSuperAdmin` state rather than a profile string. |
| Verification | Regression tests cover forged-profile denial and trusted-claim allowance. In real local Chrome sessions, the claim-controlled identity landed on and retained `/admin`; the profile-only fake landed on `/dashboard` and a direct `/admin` request redirected to `/dashboard`. The admin API returned 200 for the trusted claim and 403 for the fake profile. |
| Status | RESOLVED |

## BUG-006 — Landing support widget emits repeat console errors in Chromium and WebKit (resolved)

| Field | Evidence |
|---|---|
| Severity | P2 MEDIUM |
| Feature | Marketing landing page — visitor support |
| Role | Visitor |
| Page or route | `/` |
| Description | A clean landing-page load emitted five styled-components error 17 messages from the Elfsight AI Chatbot bundle in both Chromium and WebKit. The widget still opened in Chromium, but the repeated errors violated the audit's console-clean requirement and the same vendor path was unreliable in Safari/WebKit. |
| Expected behavior | Every supported browser exposes a usable support path without application console errors. |
| Actual behavior | Lazy Elfsight initialization repeatedly lost an injected stylesheet in Chromium. Eager initialization removed that failure there, but the vendor Safari/WebKit path continued to emit the same errors. |
| Exact reproduction steps | 1. Open a clean visitor session. 2. Navigate to staging `/`. 3. Wait for the Elfsight launcher. 4. Inspect the console and open the support control. |
| Reproduction consistency | Five errors per clean Chromium and WebKit load before repair; zero errors in final hosted Chromium, Firefox, and WebKit checks. |
| Root cause | `data-elfsight-app-lazy` exposed a vendor stylesheet teardown race. Elfsight AI Chatbot v1.31.1 also retained an incompatible Safari/WebKit rendering path after eager initialization. |
| Fix | Chromium and Firefox now initialize the full Elfsight assistant eagerly. Safari and iOS WebKit receive an accessible native support mail link instead of loading the incompatible vendor bundle. |
| Automated verification | `tests/landing-chat-support.test.mjs` covers browser selection and `tests/preview-regressions.test.mjs` prevents restoration of lazy initialization. Staging workflow `33789859140` passed the authoritative 397 application tests, 38 rules tests, typechecks, lint with zero errors, production builds, deployment, and health checks for commit `febfbf2002b294d1edb4dbd40deaa44ae821cb00`. |
| Hosted verification | Clean staging sessions exposed the full `Squad Assistant` dialog and `Write your message...` textbox in Chrome and Firefox. WebKit exposed one `Contact The Squad support` mail link and loaded zero Elfsight scripts. All three reported zero console errors; desktop and 390x844 checks had no horizontal overflow. |
| Status | RESOLVED |

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

## BUG-005 — Chat messages do not notify Android and installed app shows Schedule identity (resolved on Android)

| Field | Evidence |
|---|---|
| Severity | P1 HIGH |
| Feature | Team Chat notifications and PWA installation |
| Role | Active team member on Android; cross-platform Home Screen user |
| Page or route | `/chats/[chatId]`, `/api/teams/chat/message`, `/settings`, `/manifest.json`, `/sw.js` |
| Description | A physical Android test initially received no notification after another member sent a live chat message. After the awaited-delivery repair, the device produced an audible notification and visible notification card while the PWA remained open, but not when it was closed. A later v3 worker/icon retest still produced no closed-app card or dot and still showed inset launcher artwork; the message continued to persist and sync into chat. |
| Expected behavior | Other active channel members receive one background notification; the sender does not. Android and iPhone/iPad install The Squad with the Squad icon and open the dashboard. |
| Actual behavior | Before repair, the original chat write completed without notification fan-out; the first repair could be terminated after its response. After awaited delivery, foreground/open-PWA notification worked but closed-app delivery did not. The earlier launcher declarations also allowed Android to select a legacy `any` icon and place it inside a white adaptive-icon container. After the final repair, a closed Android PWA received the real cross-account chat notification, displayed its launcher dot, and opened the correct chat when tapped; a clean reinstall displayed the full-size adaptive Squad icon. |
| Reproduction consistency | The user reproduced the missing closed-app notification and inset icon across multiple deployed candidates. On final staging, the same Android device received all three requested real-chat signals—notification card, launcher dot, and correct tap-through—and then confirmed the full-size launcher icon after clearing the staging site record and reinstalling through Chrome's app-install flow. |
| Root cause | Sanitized staging inspection found notifications enabled with three FCM records, two expired and one provider-valid, but zero standards Web Push registrations. Browser delivery remained coupled to Firebase even though a standards worker/server path existed, and default Web Push urgency did not reliably wake the closed Android browser. Separately, split `any` and `maskable` manifest entries let this Android/Chrome combination choose the legacy `any` launcher candidate, which Android wrapped in white. |
| Fix | Commits `514f8fa1` and `c7273ba1` make standards Web Push the sole browser/PWA transport, retry incomplete migrations, clear legacy FCM records, replace the prior PushSubscription, and retain one root worker. Commit `9ffefcd2` sends chat alerts with one-hour TTL and high urgency. Commits `0d8884a3` and `0603a110` route opaque full-bleed v5 art through every icon discovery path and expose only 192/512 launcher candidates whose purpose is `any maskable`; worker cache v9 forces refresh. Sender exclusion, active-membership resolution, click-through handling, and the monochrome notification badge remain. |
| Automated verification | Local authoritative `npm run verify` passed 421 application tests, 38 Firestore/Storage rules tests, typecheck, lint with zero errors, the app production build, and the Functions build. Protected staging workflows `33883494833`, `33886109438`, `33895799933`, and `33897636996` passed their exact verification/deployment chains. No-cache health reported final revision `studio-build-2026-09-04-010`; its manifest exposes only two opaque full-bleed `any maskable` icons and its v9 worker uses the v5 notification icon. |
| Remaining acceptance | The observed Android defect is resolved. Strict coverage still requires physical opt-out, denied-permission, stale-subscription cleanup, logout/user-switch privacy, sender-exclusion and broader targeting checks, plus install/update/push/tap acceptance on iPhone/iPad. These remain explicit matrix blockers and do not reopen the Android implementation defect. |
| Status | RESOLVED — PHYSICAL ANDROID CLOSED-APP PUSH, TAP, DOT, AND ADAPTIVE ICON ACCEPTED |

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
