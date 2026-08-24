# Defect Ledger

**Run:** `2026-08-21T232919Z`\
**Environment:** local development plus isolated Firebase preview\
**Status:** Phase 2 diagnosis evidence is retained; Phase 3/4 verification, Phase 5 staging, and Phase 6 root-cause supplements are recorded below. This ledger does not declare the application production ready.

## BUG-001 — Event deletion has no confirmation

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
| Likely code area | `src/app/(dashboard)/events/EventDetailDialog.tsx:306` directly called `onDelete(event.id)` from the button |
| Related features | Schedule, attendance, RSVP, reminders, calendar views |
| Artifacts | `output/playwright/2026-08-21T232919Z/root-demo/event-before-delete.yml`, `event-after-delete.yml` |
| Phase 3 confirmed root cause | The first-click destructive icon directly invoked the existing authorized `onDelete(event.id)` mutation; the server boundary was functioning, but the UI had no confirmation boundary. |
| Phase 3 implementation | `92845ab2` (`fix: confirm event deletion`) adds controlled confirmation; `4391b0a6` extracts `src/components/events/EventDeleteConfirmation.tsx` and adds rendered coverage; `40baede7` covers duplicate-confirm protection. Files: `src/app/(dashboard)/events/EventDetailDialog.tsx`, `src/components/events/EventDeleteConfirmation.tsx`, `tests/preview-regressions.test.mjs`, and `tests/components/phase-3-repairs.test.tsx`. |
| Regressions | Node: `event deletion requires an explicit event-named confirmation before mutation` passed 1/1. Rendered: event confirmation behavior passed 1/1; final suite passed 387/387 Node tests and 2/2 rendered tests. |
| Task review and resolution | No Critical or Minor findings. One Important evidence gap required a fresh browser retest; the browser evidence below resolved it. |
| Phase 3 browser retest | In Chromium, opening delete for `Conditioning Lab` showed a named confirmation and caused 0 event-action requests; Cancel preserved the event after reload; Confirm Deletion caused exactly 1 event-action request, closed the alert dialog, and removed the event after reload. |
| Console and network | 0 application errors and 0 warnings; no event-action deletion request before confirmation and exactly one successful request after confirmation. |
| Related-area retest | Event view/edit behavior remained usable; the existing Schedule, attendance, RSVP, reminders, and calendar areas were not reclassified by this focused repair. |
| Phase 3 artifacts | Sanitized verification: `docs/qa/production-audit/runs/2026-08-21T232919Z/phase3-fix-verification.md`; screenshot: `output/playwright/phase3-post-fix/bug-001/bug-001-post-fix.png`. Raw network traces were removed after final review. |
| Phase 4 independent-verification base | `34c5aa2c24ebb6e70e52b4aaeb4b1ac69c1244db`; the Phase 3 event-deletion implementation and focused regressions were independently reviewed from this exact Task 2 base. |
| Phase 4 tested application revision | `597b6aac`; the BUG-001 repair was unchanged, and this later code revision enforces the strict development-only CSP invariant needed for the isolated emulator replay. |
| Phase 4 fresh evidence | `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md` and `output/playwright/2026-08-23-phase4-c3177f29/bug-001/event-delete-confirmation.png`; the final-review 390×844 replay was executed by tester alias `phase4-final-verifier` at `2026-08-24T03:49:25Z`. |
| Phase 4 independent result | PASS — the focused source and rendered regressions passed; the final clean 390×844 Chrome replay proved 0 pre-confirm mutations through Escape and Cancel, Cancel persistence after reload, exactly 1 successful mutation after a double-confirm attempt, deletion persistence after reload, focus entry/return, 0 application console errors, 0 request failures, and no horizontal overflow. |
| Phase 4 limitation | The focused repair is independently verified, but coverage-matrix row 29 remains `BLOCKED` because durable registered-role, negative, cross-tenant, recurrence, timezone/conflict, and permission fixtures were unavailable. No production SaaS or external provider was accessed. |
| Status | FIXED AND VERIFIED |

## BUG-002 — Sports Hub header search collapses at tablet width

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
| Artifacts | `output/playwright/2026-08-21T232919Z/public-content/sports-hub-tablet-768x1024.png` |
| Phase 3 confirmed root cause | At the `md` breakpoint, the 144 px brand, Sports Hub identity, full search, Back to App, and Get Started appeared together; flex shrink reduced the search to 93.27 px at 768×1024. |
| Phase 3 implementation | `135cd808` (`fix: preserve Sports Hub tablet search`) moves full search to `lg` and compact search below `lg`; `ee601ad3` repairs the initial control nesting; `4391b0a6` repairs the remaining Back to App and Get Started header compositions and adds rendered coverage. Files: `src/components/sports-hub/SportsHubClientLayout.tsx`, `tests/public-production-readiness.test.mjs`, and `tests/components/phase-3-repairs.test.tsx`. |
| Regressions | Node: `Sports Hub keeps compact search through tablet widths` passed 1/1. Rendered header coverage passed 1/1; final suite passed 387/387 Node tests and 2/2 rendered tests. |
| Task review and resolution | Initial review found one Important accessibility defect: nested `Link` and native `Button` controls in the compact-search path, plus a browser-evidence gap. `ee601ad3` resolved the control nesting; scoped re-review found no Critical, Important, or Minor code findings, and the browser evidence below resolved the remaining condition. |
| Phase 3 browser retest | Chromium at 390×844 and 768×1024 rendered one labelled compact anchor with the full input hidden, 0 nested header buttons, and 0 overflow; keyboard Enter reached `/sports-hub/search`. At 1024×768 and 1440×900, compact search was hidden and full input measured 349.27 px and 384 px, with 0 nested header buttons and 0 overflow. Full search submitted successfully. |
| Console and network | 0 failed HTTP requests and 0 application console errors. One unrelated Next.js development-only LCP warning appeared once at 768×1024. |
| Related-area retest | Sports Hub search navigation and submission passed; article/resource discovery and authenticated preferences were not reclassified by this focused responsive repair. |
| Phase 3 artifacts | Sanitized verification: `docs/qa/production-audit/runs/2026-08-21T232919Z/phase3-fix-verification.md`; follow-up screenshots: `output/playwright/phase3-post-fix/follow-up/sports-hub-390.png`, `sports-hub-768.png`, `sports-hub-1024.png`, and `sports-hub-1440.png`. Raw network traces were removed after final review. |
| Phase 4 independent-verification base | `e52db744b3aac59cf8c7e2c13397014e7b85ad0c`; the Phase 3 responsive-search implementation and focused regressions were independently reviewed from this exact Task 3 base. |
| Phase 4 Sports-Hub-specific application revision | `40e82381cee987e63ccafa4ae581d527b2f6b079`; no later Sports Hub application code changed before the prior final verification. |
| Phase 4 fresh evidence | `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-002.md` plus four screenshots under `output/playwright/2026-08-23-phase4-c3177f29/bug-002/`; tester alias `phase4-independent-verifier`, evidence recorded `2026-08-24T02:46:45Z`; initial evidence commit `df5b088c9a41662625203c023748fbf033c348d0`, precision amendment `66d657f1945dcf614b2533c7b8b6f3241e8a1249`, and later tested checkout revision `597b6aac` for the prior final verification. |
| Phase 4 independent result | PASS — the focused source and rendered regressions passed; the clean Chrome replay passed at 390×844, 768×1024, 1024×768, and 1440×900 with one labelled header search affordance per layout, correct keyboard navigation/submission, 0 nested interactive header controls, 0 failed HTTP requests, 0 application console errors, and no horizontal overflow. |
| Phase 4 limitation | The focused responsive repair is independently verified, but coverage-matrix row 73 remains `BLOCKED` because no authorized authenticated identity was available for preference persistence and self-only permission checks. No production SaaS or external provider was accessed. |
| Status | FIXED AND VERIFIED |

## BUG-003 — Development CSP blocks isolated Firebase emulator browser QA

| Field | Evidence |
|---|---|
| Severity | P3 LOW |
| Feature | Local Firebase emulator support / browser QA harness |
| Role | QA verifier using an isolated local anonymous demo |
| Page or route | Local development application; emulator-backed browser flows configured by `src/firebase/core.ts` |
| Description | `src/firebase/core.ts` connected the client to isolated Auth, Firestore, and Storage emulators, but the document CSP emitted by `next.config.ts` did not permit their exact loopback HTTP/WebSocket transports. |
| Impact | Blocked safe isolated browser QA and local testability. This was not reproduced production SaaS behavior and did not establish a customer-facing production defect. |
| Root cause proof | A clean extension-disabled Chrome profile reached the synthetic Auth emulator directly, while the application document reported CSP refusals for the local Firebase emulator connections. The browser replay remained blocked until the CSP was corrected. |
| TDD RED | Against the prior `environment !== "production"` condition, the expanded pure-builder and actual-config tests failed because `test`, `staging`, and undefined environments leaked loopback emulator sources. The RED run contained 1 pass and 2 failures. |
| Implementation | `40e82381cee987e63ccafa4ae581d527b2f6b079` extracted the pure CSP builder; final-review commit `597b6aac` restricts the exact `localhost`/`127.0.0.1` Auth, Firestore, Storage, and Firestore WebSocket sources to `NODE_ENV === "development"` with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"`. |
| TDD GREEN | Three focused CSP tests passed: the pure builder rejects emulator sources in `production`, `test`, `staging`, and undefined environments; an isolated subprocess proves the actual `next.config.ts` header output does the same; and exact `development` plus the flag permits only the expected transports. The relevant regression suite, typecheck, and synthetic-config production build also passed. |
| Fresh browser proof | After `597b6aac`, the same clean local Chrome path completed the full 390×844 isolated BUG-001 emulator replay; sanitized evidence and screenshot are recorded in `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md`. |
| Scope limitation | The correction improves local QA/testability only. It does not add authenticated fixtures, provider sandboxes, hosted staging, device coverage, or production evidence, and it does not change the 88-row functional coverage matrix. |
| Status | FIXED AND VERIFIED |

## BUG-004 — How-to video request aborts on hosted staging

| Field | Evidence |
|---|---|
| Severity | P3 LOW |
| Feature | Marketing/legal — Audience/sport/safety/how-to/legal |
| Role | Visitor |
| Page or route | Hosted staging `/how-to` |
| Description | The page's same-origin media request for `/faq/how-to-create-a-game.mp4` reports `net::ERR_ABORTED` in Chrome even though the page and video reach a healthy final rendered state. |
| Expected behavior | The row's explicit network contract requires no failed assets; the how-to media request must complete without a browser request-failure event. |
| Actual behavior | The page returned HTTP 200 with heading `Operational Manual.`, zero horizontal overflow, zero application-origin console errors, zero page errors, and zero same-origin HTTP responses of 400 or higher. The video reached `readyState=4`, `networkState=1`, and `errorCode=0`, but Chrome still reported one same-origin media request failure for `/faq/how-to-create-a-game.mp4`, type `media`, reason `net::ERR_ABORTED`. |
| Reproduction consistency | Observed in the complete two-viewport staging sweep and reproduced in a fresh isolated focused replay. |
| Browser | System Chrome via the bundled Playwright CLI; focused replay at 1440×900 |
| Exact deployed SHA | `658d3ca89f3cabf6c55800400aa17bc72229c1af` |
| Deployment evidence | Release gate run `32721982132` and protected staging run `32722312601` both passed for the exact deployed SHA. |
| Fresh evidence | `docs/qa/production-audit/runs/2026-08-24-phase5-staging/02-public-smoke.md`; focused replay window `2026-08-24T12:08:35Z`–`2026-08-24T12:08:44Z`. |
| Impact | The route remains usable in the observed final state, but the deterministic request-failure signal violates the row's strict asset-health contract and prevents a supported `PASS`. |
| Scope limitation | No response body, header, credential, token, cookie, action link, personal data, raw browser trace, or provider payload was retained. No root cause or fix is claimed by this evidence-only reconciliation. |
| Phase 6 root cause | Chrome was honoring the page's `preload="metadata"`. The MP4 is fast-start capable (`ftyp` at byte 4, `moov` at byte 36, `mdat` at byte 40,924), and staging supports byte ranges. A controlled same-page experiment isolated preload behavior: `metadata` received HTTP 206, buffered a playable prefix, reached `readyState=4` / `networkState=1` with no `MediaError`, and then reported `net::ERR_ABORTED`; `auto` received HTTP 206, buffered the full 133.84-second asset, and reported no failure; `none` issued no request. The abort was the browser ending a successful range stream once its metadata/preload goal was met. |
| Phase 6 fresh verification | At 390×844 and 1440×900, staging `/how-to` returned HTTP 200 with the expected heading, zero overflow, zero application console errors, zero page errors, successful HTTP 206 media delivery, `readyState=4`, `networkState=1`, no media error, finite duration 133.84 seconds, and playback advancing beyond one second. Evidence: `docs/qa/production-audit/runs/2026-08-24-phase6-bug004/root-cause.md`. |
| Resolution | The Phase 5 listener treated any `requestfailed` event as a failed asset. Phase 6 narrows that methodology: this exact media abort is benign only when the successful response, healthy final media state, finite duration, and playback checks all pass. No SaaS runtime change is required, avoiding a forced 1.4 MB `preload="auto"` download on every visit. |
| Status | CLOSED — FALSE POSITIVE |
