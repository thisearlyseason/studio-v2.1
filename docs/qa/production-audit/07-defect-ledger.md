# Defect Ledger

**Run:** `2026-08-21T232919Z`  
**Environment:** local development plus isolated Firebase preview  
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
| Artifacts | `output/playwright/2026-08-21T232919Z/root-demo/event-before-delete.yml`, `event-after-delete.yml`, `pro-demo.trace` |
| Phase 3 confirmed root cause | The first-click destructive icon directly invoked the existing authorized `onDelete(event.id)` mutation; the server boundary was functioning, but the UI had no confirmation boundary. |
| Phase 3 implementation | `92845ab2` (`fix: confirm event deletion`): `src/app/(dashboard)/events/EventDetailDialog.tsx` adds controlled `AlertDialog` confirmation; `tests/preview-regressions.test.mjs` adds the regression. |
| Focused regression | `event deletion requires an explicit event-named confirmation before mutation`; `node --import tsx --test --test-name-pattern="event deletion requires" tests/preview-regressions.test.mjs` passed 1/1. Task verification also recorded `npm run typecheck` exit 0 and `npm test` 386/386 passing. |
| Task review and resolution | No Critical or Minor findings. One Important evidence gap required a fresh browser retest; the browser evidence below resolved it. |
| Phase 3 browser retest | In Chromium, opening delete for `Conditioning Lab` showed a named confirmation; opening caused 0 event-action requests; Cancel preserved the event after reload; Confirm Deletion caused exactly 1 event-action request; the event was absent after reload. |
| Console and network | 0 application errors and 0 warnings; no event-action deletion request before confirmation and exactly one successful request after confirmation. |
| Related-area retest | Event view/edit behavior remained usable; the existing Schedule, attendance, RSVP, reminders, and calendar areas were not reclassified by this focused repair. |
| Phase 3 artifacts | `output/playwright/phase3-post-fix/bug-001/bug-001-post-fix.png`, associated screenshot/page/console artifacts, and trace evidence under `output/playwright/phase3-post-fix/bug-001/`. |
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
| Artifacts | `output/playwright/2026-08-21T232919Z/public-content/sports-hub-tablet-768x1024.png` and public-content trace |
| Phase 3 confirmed root cause | At the `md` breakpoint, the 144 px brand, Sports Hub identity, full search, Back to App, and Get Started appeared together; flex shrink reduced the search to 93.27 px at 768×1024. |
| Phase 3 implementation | `135cd808` (`fix: preserve Sports Hub tablet search`) moves full search to `lg` and compact search below `lg`; `ee601ad3` (`fix: avoid nested Sports Hub search controls`) replaces nested link/button controls with `Button asChild > Link`. Files: `src/components/sports-hub/SportsHubClientLayout.tsx`, `tests/public-production-readiness.test.mjs`. |
| Focused regression | `Sports Hub keeps compact search through tablet widths`; `node --import tsx --test --test-name-pattern="Sports Hub keeps compact search" tests/public-production-readiness.test.mjs` passed 1/1. Task verification recorded `npm run typecheck` exit 0 and `npm test` 387/387 passing. |
| Task review and resolution | Initial review found one Important accessibility defect: nested `Link` and native `Button` controls in the compact-search path, plus a browser-evidence gap. `ee601ad3` resolved the control nesting; scoped re-review found no Critical, Important, or Minor code findings, and the browser evidence below resolved the remaining condition. |
| Phase 3 browser retest | Chromium at 390×844 and 768×1024 rendered one labelled compact anchor with the full input hidden; keyboard Enter reached `/sports-hub/search`. At 1024×768 and 1440×900, compact search was hidden and full input measured 349.27 px and 384 px. Full search submitted to `/sports-hub/search?q=practice%20plan`; document overflow was 0 at all four widths. |
| Console and network | 0 failed HTTP requests and 0 application console errors. One unrelated Next.js development-only LCP warning appeared once at 768×1024. |
| Related-area retest | Sports Hub search navigation and submission passed; article/resource discovery and authenticated preferences were not reclassified by this focused responsive repair. |
| Phase 3 artifacts | Screenshots: `output/playwright/phase3-post-fix/bug-002/`; trace and network logs: `.playwright-cli/traces/`. |
| Status | FIXED AND VERIFIED |
