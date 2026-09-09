# Focused league and tournament scheduling verification

Date: September 8, 2026 (America/Edmonton; artifacts dated September 9 UTC).

## Scope and baseline

Baseline production commit: `81d71b302886b82a6df01dc69d6d3b8f51810010`.
Repair commits: `001984ba` / PR #65 and `f65a97e4` / PR #66.

Existing league and tournament PASS rows in `05-coverage-matrix.md` were retained. This run focused on scheduling conflicts, the recently changed phased Tiered Playoffs workflow, and settings persistence. It does not recertify unrelated features or physical-device behavior.

## Completed

- Baseline scheduling unit/route regressions: **141 passed**, zero failures/skips.
- Focused emulator/API/Playwright run `final-cert-t5-260909-022027-5968`: **23 cases OBSERVED**, 11 league and 12 tournament. Generation, deployment, impossible availability, blackout and race conflicts, foreign-owner/direct-write denial, referee conflicts, reload, public DTOs, desktop/mobile, console and network checks were exercised. The runner retains its staging boundary; local observations are not relabeled hosted proof.
- Fixture cleanup: **329 deleted, 2 restored, 0 retained**. Evidence: `output/playwright/2026-09-04-final-certification/task-5/final-cert-t5-260909-022027-5968/results.json`.
- Baseline hosted Playwright, owned anonymous Pro demo: create a zero-team Tiered draft, reload, reject scheduling with fewer than two teams, add four teams and generate six preliminary games. All six results were entered through the UI. Playoffs remained unavailable at five of six final results and became available at six of six. Configure divisions, review and lock seeds, generate two division brackets, publish, reload at 390px width, and view the public spectator page all succeeded. No real customer competition was modified; notification fanout was suppressed for demo data. Demo exit returned HTTP 204.

## Fixed and verified in tests

The tournament architect retained the entire existing `tieredPlayoffs` object when editing an event. A hosted reproduction changed duration from 60 to 30 and win points from 3 to 5, but submitted nested duration 60 and win points 3; reopening retained the old scoring value. This could leave preliminary and playoff timing inconsistent.

The repair merges editable timing/scoring values while preserving division definitions, custom ranking rules, seeding and bracket state. Linked minimum rest follows turnaround edits; independently configured rest remains unchanged. The deployed-schedule mutation guard remains intact. Regression assertions failed before each repair and passed afterward. Independent code review found no remaining actionable issues.

- Final repair focused tests: **108 passed**, zero failures/skips.
- Final-commit full tests: **1,421 passed**, zero failures, **8 existing skips** (fresh `npm test`, 26.97s). PR release gate and branch release gate both passed: application lint/type checking/tests/build, Functions build, dependency audit, and **66 Firebase rules tests**. Existing non-blocking lint warnings remain; this is not a claim of warning-free repository code.
- Local production-build browser retest: edited duration and nested duration both submitted as 30, win points as 5, HTTP 200; reopening after a full reload retained 30/5. This browser build predates only the final linked-rest refinement.
- That local browser generated six games, each `durationMinutes: 30`, with conflict-free 08:00/08:45/09:30 slots across two fields. Localhost demo exit was rejected by the production-origin guard (403); the existing server cleanup helper was therefore run against the verified task-owned anonymous demo only. Its team/profile and Auth account were confirmed absent afterward. The test server and browser were closed.

## Hosted repair and final release verification

- PR #65 deployed as `f4f484e5a54ca8ac06840056ee10fcd0459876e9`; production aliases and `/api/health` verified. Hosted edit/reload retained duration 30, turnaround/rest 0, daily maximum 4 and win points 5. The request contained the same values in the nested playoff configuration.
- This live edge-case test uncovered a second bug: `handleGenerateSchedule` used `event.breakLength || 15`, replacing valid zero with 15. Actual preliminary slots were 08:00/08:45/09:30 rather than 08:00/08:30/09:00. PR #66 changes only that fallback to `?? 15` and adds a regression using the actual UI config expression and real scheduler in a 90-minute window. Red before repair (`15 !== 0`), green afterward; **39 focused tests passed**, independent review passed.
- PR #66 final local full suite: **1,422 passed**, zero failures, 8 existing skips. Fresh type checking and lint-with-errors-only checks passed. Both PR and branch release gates passed, including production builds. Merged as `c4f28a7efa22a4dd8512c03ae00fe577c444862a`.
- The first hosted repaired demo schedule was cleared through the UI and its demo exit returned 204.
- **Final release PASS:** Vercel deployment `dpl_3cJXFSb9CGFZg5BrB2iA8ei3g42D` is Ready. Both `thesquad.pro` and `www.thesquad.pro` point to it; `/api/health` returned `c4f28a7efa22a4dd8512c03ae00fe577c444862a` before the final browser test.
- **Zero-turnaround hosted regression PASS:** after a full reload on that revision, the UI generated six 30-minute games at **08:00, 08:30 and 09:00** across two fields, HTTP 200. Four teams each played three games in the configured October 10 window.
- **Preliminary-to-playoff transition PASS:** six UI score submissions returned 200. The organizer view reported `6 of 6 final`. Division configuration, seed review, seed lock, bracket generation and publication all returned 200. Championship and Consolation finals were both scheduled at **09:30**, on separate fields, within the **10:00** cutoff. This exercised the final timing path, including zero rest/turnaround.
- **Persistence/mobile PASS:** full reload at 390×844 retained `Status: locked · Playoffs: published`; document width remained 390px. Evidence screenshot: `output/playwright/scheduling-final-2026-09-09/mobile-published.png`.
- **Deployed-schedule protection PASS:** a UI attempt to change the published tournament duration from 30 to 35 was rejected with HTTP 409. Reopening after reload still showed 30 minutes and published playoffs. The rejection produced expected error logging; no unexpected console/network failures occurred in the successful scheduling flow.
- Final disposable demo cleanup returned **204**, and the browser was closed. No customer tournament, league, roster or schedule was altered by this verification.

## Remaining

None identified in the exercised scheduling scope. The two discovered defects are fixed, deployed and retested. Existing known-good league scheduling code was not changed.

## Blocked / deferred

None specific to the exercised scheduling scope. Previously documented physical-device items remain outside this check. These results are evidence of tested behavior, not a guarantee that every possible configuration is defect-free.
