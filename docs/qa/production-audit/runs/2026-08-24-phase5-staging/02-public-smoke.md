# Phase 5 Isolated Staging Public Smoke

**Tester alias:** `phase5-task2-deploy-smoke`

**Browser window (UTC):** `2026-08-24T11:47:36Z`–`2026-08-24T12:00:14Z`

**Exact deployed SHA:** `658d3ca89f3cabf6c55800400aa17bc72229c1af`

**Origin:** `https://studio--the-squad-v2-staging.us-east4.hosted.app`

**Smoke status:** `DONE_WITH_CONCERNS` — the strict zero-failed-same-origin-request criterion is not met on `/how-to`.

## Browser and method

The bundled Playwright CLI wrapper was used with the already-installed system Chrome channel and fresh named sessions. Browser user agent reported `HeadlessChrome/151.0.0.0`. The required viewports were `390×844` and `1440×900`. A fresh snapshot was taken after every navigation and before using element references.

Representative command shape:

```bash
PWCLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh
"$PWCLI" -s=phase5smoke open \
  https://studio--the-squad-v2-staging.us-east4.hosted.app --browser chrome
"$PWCLI" -s=phase5smoke resize 390 844
"$PWCLI" -s=phase5smoke snapshot
"$PWCLI" -s=phase5smoke resize 1440 900
"$PWCLI" -s=phase5smoke snapshot
```

For each route, a page-scoped listener counted application-origin console errors, page errors, same-origin request failures, and same-origin HTTP responses of 400 or higher. Only the route path, status, heading, overflow delta, and counts were observed; no response body, header, credential, token, cookie, action link, personal data, or full provider payload was retained.

## Two-viewport route sweep

Every route below was checked at both required viewports. All positive public routes returned 200, rendered a primary heading, and had a document overflow delta of zero.

| Group | Routes | Result at 390×844 and 1440×900 |
| --- | --- | --- |
| Marketing | `/`, `/beta`, `/refer-a-coach` | PASS |
| Audiences | `/for/parents`, `/for/coaches`, `/for/leagues`, `/for/tournaments`, `/for/schools`, `/for/municipalities` | PASS |
| Sports | `/sports/soccer`, `/sports/basketball`, `/sports/baseball`, `/sports/rugby`, `/sports/football`, `/sports/cornhole`, `/sports/gymnastics`, `/sports/pickleball`, `/sports/tennis`, `/sports/golf`, `/sports/swimming`, `/sports/esports`, `/sports/ultimate-frisbee`, `/sports/disc-golf` | PASS |
| Safety/legal | `/safety`, `/privacy`, `/terms` | PASS |
| How-to | `/how-to` | DONE_WITH_CONCERNS — HTTP 200, expected heading, zero overflow, but one same-origin media request ended `net::ERR_ABORTED` |
| Sports Hub | `/sports-hub`, `/sports-hub/resources`, `/sports-hub/search?q=practice`, `/sports-hub/templates`, `/sports-hub/templates/practice-plan-builder`, `/sports-hub/resources/expanded-season-kickoff-plan`, `/sports-hub/resources/vid-1` | PASS |
| Expected negatives | invalid audience, sport, generic, article, resource, and template paths | PASS — 404 heading and HTTP 404 |
| Anonymous protection | `/dashboard`, `/admin` | PASS — final path `/login`, `Sign In`, no protected shell |

The successful-route observations contained zero application console errors and zero page errors. The expected negative routes emitted only their scoped browser-level 404 load entry; no application exception was observed. Request-health status is reported separately because `/how-to` did not satisfy the strict zero-failure criterion.

### Request investigation

- The first sequential 390px pass observed one aborted `/pricing` prefetch while leaving an audience page. A new system-Chrome session opened `/for/tournaments` directly at 390×844 and waited 2.5 seconds; it returned 200 with zero same-origin failures, zero error responses, and zero overflow. The transient prefetch abort was not reproducible.
- A focused clean replay ran from `2026-08-24T12:08:35Z` through `2026-08-24T12:08:44Z` in a fresh system-Chrome session at 1440×900. The session opened `about:blank`, installed page-scoped request/response/console/page-error listeners, navigated to `/how-to` with `waitUntil=load`, waited for the video to become visible and reach `readyState>=3` with `networkState!=2`, waited another 2.5 seconds, and then took a fresh snapshot.
- The focused replay returned HTTP 200, heading `Operational Manual.`, overflow delta 0, zero application-origin console errors, zero page errors, and zero same-origin HTTP responses of 400 or higher. The video reached `readyState=4`, `networkState=1`, with `errorCode=0`.
- The same focused replay still captured one same-origin request failure: media path `/faq/how-to-create-a-game.mp4`, reason `net::ERR_ABORTED`. The strict zero-failed-same-origin-request criterion is therefore **not met**. This result is `DONE_WITH_CONCERNS`; Task 3 must create or reconcile the defect. No claim that the request-health check passed is made.

## Public interactions

### Homepage navigation, pricing, and demo entry

- At both viewports, the Pricing navigation reached `/#pricing`, the pricing section was visible, and overflow remained zero.
- At both viewports, `Experience Demo` opened the public `Choose a Demo Role` dialog with seven labelled options.
- No demo option was invoked, so no anonymous Auth session or staging demo data was created.

### Sports Hub browse and search

- At 390×844, the snapshotted `Resources` link navigated from `/sports-hub` to `/sports-hub/resources` and rendered the expected `Resources` heading.
- The compact `Search Sports Hub` link reached `/sports-hub/search`. Filling the snapshotted searchbox with the synthetic public query `practice` and pressing Enter reached `/sports-hub/search?q=practice` and rendered two representative result cards.

### Resource PDF failure and retry

At 390×844, `/sports-hub/resources/expanded-season-kickoff-plan` rendered the `View Resource` action. A reversible page-only fault made `HTMLCanvasElement.prototype.toDataURL` throw `synthetic-pdf-export-failure`:

- the handled error branch produced no download;
- the action returned to enabled `View Resource` state;
- restoring the original primitive and retrying downloaded `TheSquad-Season-Kickoff-Operations-Plan.pdf`;
- the action again returned to enabled idle state.

The expected synthetic console error and downloaded PDF were deleted after the retry check.

### Templates and provider frame

- The templates listing was opened at 1440×900 and its snapshotted `Practice Plan Builder` link navigated successfully. The page exposed `Copy Text`, `Print`, `Practice Info`, `90-Min Run Sheet`, and `Post-Practice Notes`, with zero overflow.
- `/sports-hub/resources/vid-1` exposed a labelled iframe titled `Midfielder Training Session: Scanning, First Touch & Decision Making`. It measured 832×468 CSS pixels and used an HTTPS `www.youtube.com` document. Application-origin console errors, page errors, same-origin failures, and overflow were zero.
- The frame check establishes only label, dimensions, protocol, host, and document presence. **It is not provider-playback evidence.**
- No provider-rendered screenshot is retained. The original provider-frame PNG was removed during review because it contained recognizable people, a channel/avatar image, and provider-rendered thumbnail content outside the stated sanitized boundary.

## Retained sanitized evidence

- `output/playwright/2026-08-24-phase5-staging/home-demo-selector-390.png`
- `output/playwright/2026-08-24-phase5-staging/sports-hub-search-390.png`
- `output/playwright/2026-08-24-phase5-staging/template-practice-builder-1440.png`
- `output/playwright/2026-08-24-phase5-staging/anonymous-dashboard-boundary-390.png`

All four retained PNGs were visually reviewed. They contain only first-party public UI or placeholder form text and no recognizable people, personal data, credentials, tokens, cookies, action links, or provider-rendered content.

## Cleanup and status

The named browser sessions were closed. Raw Playwright snapshots, console files, the generated PDF, session data, and the `.playwright-cli` directory were removed. No trace, video, network export, response body, persistent profile, or temporary configuration was retained. The artifact allowlist scan prints nothing because the retained directory contains four PNG files only.

**Release status remains: NOT READY.** This smoke run does not promote blocked identity, provider, cross-tenant, destructive, or production-only contracts, and it makes no provider-playback claim.
