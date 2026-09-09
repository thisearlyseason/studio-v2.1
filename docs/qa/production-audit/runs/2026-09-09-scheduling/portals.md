# Competition portal verification — 2026-09-09 UTC

## Scope and retained evidence

Follow-up to the scheduling audit, not a restart of the SaaS audit. Retain the coverage matrix's verified hosted league, tournament, registration/waiver, public squad/event, and embed evidence. This phase refreshes the changed competition paths and checks the real portal entry points. Physical push/PWA acceptance is outside this scope.

## COMPLETED

- Focused automated portal/security checks: 92 passed, zero failures/skips.
- Fresh local emulator/Playwright run `final-cert-t5-260909-030204-0361`: 61 observed cases, no run errors. League scorekeeper/spectator 12; tournament registration/waiver 19; tournament scoring/dispute/public standings 14; public squad/event registration 16. Includes wrong credentials, replay/conflict, permission separation, persistence, desktop/mobile, and expected error responses. These are local observations, not replacements for hosted evidence.
- Live `www.thesquad.pro` on `c4f28a7`: tournament scorekeeper rejected an incorrect code (403), accepted its configured code, opened the match entry page, and committed 3–1 (200). The public spectator itinerary and standings reflected the exact result; five other preliminary matches remained unchanged. Mobile spectator at 390×844 had no horizontal overflow. Organizer Spectator shortcut opened the correct public URL.
- Live registered referee: signed-out sign-in gate; unassigned account denied assignment data; organizer added the QA official and assigned one match (200); registered account saw only that match at mobile width without horizontal overflow; removing the assignment removed it from the portal; removing the official restored the no-assignment-access view. The initial fixture login failure was a QA project mismatch, corrected without product changes.
- First live fixture cleanup: temporary referee Auth/profile removed; owned anonymous demo/team tree deleted; no matching private referee records remained. No customer records were edited.

## FIXED AND VERIFIED

- Publishing a tournament registration form displayed Live but public registration still returned inactive. Root cause: form `is_active` changed without synchronizing the required event `registrationOpen` gate. Reproduced through the live builder and public page.
- Fix: commit the event gate and form together; preserve other active forms when one is disabled; close when the final form is disabled; reject cancelled/archived publication and unauthorized actors.
- Regression tests failed before the fix (missing open gate and cancelled publication accepted), then passed. 27 related route/DTO tests passed. Focused independent review found no critical or important issues.
- Local type checking, lint (zero errors; existing warnings), and production build passed.
- PR #67 release checks all passed: application checks including full automated tests/build, Firebase rules (66 passed), functions build, and dependency audit. Merge revision `d60035bcddf1176b3a1d866f1d9434dee78769eb`.
- Live retest of that release found a second defect: reloaded form snapshots included server `updatedAt`/`updatedBy`; subsequent saves failed with 400 Unsupported registration configuration field. The server now ignores only these echoed audit fields and always writes authenticated attribution and current time. Regression checks cover both league and tournament edits and attempted attribution spoofing.
- A related default-waiver test exposed unsigned acceptance when the default text existed only as a public UI fallback. Shared constants retain the existing public wording unchanged, enforce a server-side signature, and archive that exact text. Both league and tournament receipt branches are tested. No new legal wording was introduced.
- Those regressions failed before their fixes; 32 focused checks passed afterward. Independent review found no critical/important issues. Fresh type checking, lint (zero errors; existing warnings), and production build passed.
- Fresh affected Playwright/emulator run `final-cert-t5-260909-032809-22b8`: all 19 registration/waiver cases observed, no run errors, cleanup deleted 306 records with zero retained audit records. Historical reports were preserved instead of replacing their hosted evidence with these local runs.
- PR #68 release gate runs `34307218460` and `34307220951` passed all checks; merge `c20edbbd31c14c70184cd21a17b65936ef8c45ed`.
- Second live demo fixture cleanup verified zero owned teams and no user profile; its tournament/form was removed with that demo tree.
- Production alias verified on `c20edbbd31c14c70184cd21a17b65936ef8c45ed`. Live repeated configuration saves succeeded (versions 2–5); draft public access returned 404 and publication made the form available. The mobile registration wizard displayed the full default waiver without horizontal overflow.
- Live consent interaction exposed a fourth defect: the checkbox and its containing row both toggled the same state; a propagated form-input click caused a React maximum-update-depth crash. Removing only the redundant parent click handler preserves the checkbox and its associated label as the consent controls. No dependency upgrade or unrelated form redesign.
- `scripts/qa/verify-registration-feedback-browser.mjs` bundles the actual production consent-row JSX with the real Checkbox, Label, ScrollArea, and Toaster. The original row reproduced the crash; the corrected row passed checkbox and label toggles plus six error/success feedback updates at desktop and mobile widths. This isolated harness proves interaction stability, not full hosted submission or visual styling.
- Fresh fourth-fix type checking, lint (0 errors, 1,898 pre-existing warnings), and production build passed. Independent review found no blocking issue. PR #69 carries this focused repair.
- Third live fixture was cleaned after reproducing the crash: no owned teams or user profile remained; no registration was submitted from that fixture.
- PR #69 release gate runs `34308354806` and `34308357796` passed application checks, rules, functions build, and dependency audit. Production merge revision: `d4b7d542408c681259837c283fe22fce3f34ec33`.
- Fourth owned QA fixture: `demo_squad_pro_e0302408b6e06925611c24a2_main`, tournament `trn_aaa86429eb5b6b783881017ce9cb1bd88cdf7827_0`. An overlapping/stale form save was rejected with 409; reloading authoritative state and publishing succeeded with 200/version 2. No stale overwrite occurred.
- Final live acceptance on `d4b7d542408c681259837c283fe22fce3f34ec33`: public tournament page 200; complete three-step team registration at 390×844; checkbox and associated-label toggles changed consent exactly once with no page error; signed submit 200 and visible “Registration Submitted” confirmation; no horizontal overflow.
- Organizer Responses displayed one enrolled team and one pending response. Reloading the page and opening Response Details retained the exact QA team/contact fields. A read-only database check confirmed one entry, its immutable archive, exact public default-waiver wording, signer, form version, and configuration hash.
- Deactivating the form saved successfully (200/version 3). Replaying the captured submission after closure was rejected with 409 “Registration portal is inactive”; reloading the public link returned 404. The registration count remained one. These denial responses are expected negative-case results, not unexpected API errors.
- Production deployment `dpl_7AxjrLk3QPc1eGZX2AVikUYGt17x` is Ready. Both `www.thesquad.pro` and `thesquad.pro` are assigned to it; health returns `d4b7d542408c681259837c283fe22fce3f34ec33` (fresh verification 03:55 UTC).
- Final fixture cleanup verified: team/event/profile absent; zero registration entries, archived waivers, and owned teams remain. Only test-owned anonymous demo records were permanently removed; no customer data was touched. Named browser sessions were closed.

## REMAINING

- None for this scoped competition-portal verification.

## BLOCKED

- None for the remaining browser-verifiable competition checks.

## DEFER UNTIL AFTER LAUNCH

- Referee header says zero officials because the privacy-safe response omits the full official pool, even while the verified assigned official and exact match are displayed correctly. Cosmetic count only; assignment access itself was verified.

## Evidence

- `output/playwright/2026-09-04-final-certification/task-5/final-cert-t5-260909-030204-0361/results.json` and per-case artifacts.
- Live Playwright session snapshots and console records in `.playwright-cli/` (03:02–03:14 UTC); test-owned temporary account was removed.
- Local focused logs: `/tmp/squad-portals-focused-tests.log`, `/tmp/squad-portals-focused-browser.log`, `/tmp/squad-portal-red.log`, `/tmp/squad-portal-green.log`, `/tmp/squad-portal-typecheck.log`, `/tmp/squad-portal-lint.log`, `/tmp/squad-portal-build.log`.
- Release gate runs `34306349100` and `34306352675`; PR https://github.com/thisearlyseason/studio-v2.1/pull/67.
- Follow-up releases: https://github.com/thisearlyseason/studio-v2.1/pull/68 and https://github.com/thisearlyseason/studio-v2.1/pull/69.
- Fourth-fix logs: `/tmp/squad-waiver-row-red.log`, `/tmp/squad-waiver-row-green.log`, `/tmp/squad-consent-typecheck.log`, `/tmp/squad-consent-lint.log`, `/tmp/squad-consent-build.log`, `/tmp/squad-portal-consent-ci.log`.
- Final live browser artifact: `output/playwright/portal-registration-live-success.png`; console/session records in `.playwright-cli/` from 03:46–03:55 UTC. QA-only IDs above make the tested records traceable even after cleanup.

## Result boundary

The scoped competition portal functional checks pass. League and public squad/event registration retain their verified hosted baseline and gained fresh local targeted coverage; tournament scorekeeper, spectator, registered officials, and changed public-registration behavior have the fresh live checks listed above. This is not a new full-SaaS certificate, payment-provider certification, or physical-device acceptance. The non-blocking referee count label and existing lint warnings remain explicitly deferred.
