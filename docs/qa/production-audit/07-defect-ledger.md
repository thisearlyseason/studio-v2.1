# Defect Ledger

**Run:** `2026-08-21T232919Z`\
**Environment:** local development plus isolated Firebase preview\
**Status:** Phase 2 diagnosis evidence retained; Phase 3 verification supplement recorded below. This ledger does not declare the application production ready.

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
| Phase 4 tested application revision | `40e82381cee987e63ccafa4ae581d527b2f6b079`; the BUG-001 repair was unchanged, and this later code revision contained only the bounded development-CSP correction needed for the isolated emulator replay. |
| Phase 4 fresh evidence | `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md` and `output/playwright/2026-08-23-phase4-c3177f29/bug-001/event-delete-confirmation.png`, committed by `e52db744b3aac59cf8c7e2c13397014e7b85ad0c`. |
| Phase 4 independent result | PASS — the focused source and rendered regressions passed; the clean Chrome replay proved 0 pre-confirm mutations, Cancel persistence after reload, exactly 1 successful mutation after a double-confirm attempt, deletion persistence after reload, focus entry/return, 0 application console errors, and no horizontal overflow. |
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
| Phase 4 tested application revision | `40e82381cee987e63ccafa4ae581d527b2f6b079`, the latest code-changing commit in the reviewed checkout; no Sports Hub application code changed during Phase 4. |
| Phase 4 fresh evidence | `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-002.md` plus four screenshots under `output/playwright/2026-08-23-phase4-c3177f29/bug-002/`; initial evidence commit `df5b088c9a41662625203c023748fbf033c348d0`, precision amendment `66d657f1945dcf614b2533c7b8b6f3241e8a1249`. |
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
| TDD RED | Before the implementation, the new focused CSP contract failed because the generated development policy did not contain the exact loopback emulator sources while preserving production isolation. |
| Implementation | `40e82381cee987e63ccafa4ae581d527b2f6b079` extracted a pure CSP builder and adds only exact `localhost`/`127.0.0.1` Auth, Firestore, Storage, and Firestore WebSocket sources when `NODE_ENV` is non-production and `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` is exactly `true`. |
| TDD GREEN | Both focused CSP behavior tests passed: development permits only the exact emulator transports, and production rejects the mutation that would leak any loopback host, local WebSocket source, or emulator port even when the emulator flag is true. The relevant regression suite, typecheck, and synthetic-config production build also passed. |
| Fresh browser proof | After `40e82381`, the same clean local Chrome path completed the isolated BUG-001 emulator replay; sanitized evidence and screenshot were committed in `e52db744b3aac59cf8c7e2c13397014e7b85ad0c` and recorded in `docs/qa/production-audit/runs/2026-08-23-phase4-c3177f29/bug-001.md`. |
| Scope limitation | The correction improves local QA/testability only. It does not add authenticated fixtures, provider sandboxes, hosted staging, device coverage, or production evidence, and it does not change the 88-row functional coverage matrix. |
| Status | FIXED AND VERIFIED |
