# September 12 Playwright role review

## Hosted delegated-account acceptance — completed September 12

- **COMPLETED:** The remaining non-physical acceptance for the changed school-hub/role-policy rows passed on production revision `6dd40e8f93ae374cf11be0c4615a79328938fa9d`. A registered delegated-school QA account signed in through the actual Login form; this was not an owner demo or an impersonated browser session.
- **FIXED AND VERIFIED:** Owner and delegate both received all three allocated squads and correct 3/15/12 capacity totals. The delegate could read only its assigned squad's incident, participant signatures, coach signatures and fundraising records. Both unassigned sibling squads denied those reads; the unrelated owner was denied throughout. The authorized school owner retained access to all three squads. No permission rules or application code were changed for these checks.
- **COMPLETED:** Browser refresh, Back and new-tab behavior retained the correct delegated view. All six hub tabs passed at 1440px and 390px. The limited-scope explanation was visible, one authorized private incident rendered, sibling incidents were absent, and no sibling incident requests were issued. The instrumented run recorded zero console/page errors and zero failed application API responses. Registered logout removed the session cookie and subsequent Club navigation redirected to Login.
- **REMAINING / BLOCKED:** Only the existing physical-device portions of Push, Game-Day Reminders and PWA/offline certification. Browser emulation and provider acceptance cannot prove native installation, launcher badges, OS presentation or actual closed-phone reminder receipt. Unaffected previous targeting/privacy passes remain retained.
- **DEFER UNTIL AFTER LAUNCH:** Existing lint warnings and previously identified minor cosmetic copy.

Evidence: `output/playwright/sep12-hosted-delegate/results.json`, `run.mjs` and `delegate-mobile.png`. All 49 focused assertions passed, including the 12 browser tab/viewport observations. QA run `final-cert-live-mtypi4ib-e2b9` used three synthetic registered identities and five isolated teams. Notification preferences were disabled, push subscriptions empty and outbound providers disabled. No customer accounts, payment configuration, real notifications or existing teams were changed. Exact cleanup removed the disposable QA records and three Auth identities. A separate recheck at 18:20:57 UTC confirmed all nine owned roots/subcollections absent, all three identities absent, the private credential file removed and zero retained owned records. The owned browser was closed; unrelated sessions were preserved.

One retained harness attempt reported `URL is not defined` after Login had already reached Club: the CLI evaluation scope lacks the browser's global URL constructor. Reading the pathname inside `page.evaluate` corrected the evidence capture; the authenticated session was reused rather than repeating sign-in. This was not an application failure or a product repair.

**Matrix after this acceptance: 84 PASS, three BLOCKED, one NOT APPLICABLE.** No full physical-device or zero-error production certificate is claimed. The already deployed build and release gates remain applicable: only evidence/documentation changed during this continuation.

## Production release and focused smoke — September 12

- **COMPLETED:** Approved release merged through [PR77](https://github.com/thisearlyseason/studio-v2.1/pull/77) as `6dd40e8f93ae374cf11be0c4615a79328938fa9d`. Vercel deployment `dpl_2zYoHoeAzqgXrU7MjQU5oVBVcyJA` is Ready and serves both production domains. Fresh uncached health on both matched the exact revision. The merged tracked tree equals the tested candidate.
- **FIXED AND VERIFIED:** Hosted primary/secondary manifest IDs, start routes and scopes; Scheduler Apple title; signed-out task guard and Login return path; signed-in task create/reload/complete/reload/delete/reload; school-owner demo's six hub tabs at 1440px and 390px with no horizontal document overflow, console errors or failed same-origin requests in the instrumented hub run. Login/demo entry and Sign Out passed; exit returned 204, removed the session cookie and protected Dashboard redirected to Login.
- **REMAINING / BLOCKED:** A real delegated-school identity has local verified coverage but was not authenticated in this production smoke. The owner demo is not substitute proof of hosted delegate permissions. Physical install/update, OS notification presentation and badge subchecks remain separate. The master matrix retains 82 PASS, five BLOCKED and one NOT APPLICABLE; this scoped release is not a full production certificate.
- **DEFER UNTIL AFTER LAUNCH:** Existing lint warnings and minor cosmetic copy; the signed-out Scheduler empty-state helper still says “Add one above” below the working sign-in panel.

Fresh pre-commit tests: **1,501 PASS, zero FAIL, eight opt-in skips**. Candidate [release gate 34708818310](https://github.com/thisearlyseason/studio-v2.1/actions/runs/34708818310), PR gate 34708816293, and merged-head [gate 34709101470](https://github.com/thisearlyseason/studio-v2.1/actions/runs/34709101470) all passed App checks (typecheck, lint, tests, production build), Functions, Firebase rules and dependency audit. No production secrets, Functions source or server permission rules changed in this release.

Evidence: `output/playwright/sep12-release-smoke/results.json`, reusable CLI runner and screenshots in that directory. The initial hub attempt timed out because its seeded Venue Change alert intercepted clicks. The visible “Got It” action dismissed that expected demo alert; the successful rerun is retained alongside the failed setup attempt. An intermediate four-tab observation was superseded by an explicit canonical six-tab readiness assertion and successful 12-observation desktop/mobile run. No product change was needed for either harness precondition.

The browser used one newly owned anonymous school demo, not a customer account. Only its browser-local task and its own demo alert acknowledgement were changed; the normal demo logout initiated disposal. Independent cleanup at 17:50:40 UTC confirmed all 60 owned roots and subcollections absent, and the anonymous Auth identity absent. These were disposable demo fixtures; no customer records were removed. The owned browser was closed. Unrelated browser sessions and pre-existing untracked audit files were preserved.

## Before release — continuation checklist (historical)

- **COMPLETED:** The committed candidate and fetched production `origin/fix` (`25d85d9c`) have identical trees before these repairs. The remaining local role-policy checks completed across 24 active registered fixture identities, plus expected unverified/suspended/pending-deletion denials. Earlier unaffected feature/CRUD/provider evidence was retained, not represented as newly executed. Final automated run: 1,501 PASS, zero FAIL, eight opt-in skips. Production build, type checking, Functions build and dependency audit passed; dependencies reported zero vulnerabilities. Lint: zero errors, 1,901 warnings.
- **FIXED AND VERIFIED:** Delegated-school capacity requests now wait for canonical hub authority without blocking subscribed owners who lack membership projections. Private-record requests follow existing staff membership, and limited scope is visible; server permissions were not broadened. Delegate refresh/new-tab/Back and all six tabs passed at desktop/mobile widths with zero observed errors. Scheduler signed-out task creation now requires sign-in; return-to-Scheduler navigation works; Apple title is `The Squad Scheduler`. Authenticated Scheduler reload/offline/account-switch privacy passed. These repairs are LOCAL, not deployed.
- **REMAINING:** Deploy the repaired candidate, then perform exact-revision hosted acceptance of the school-hub and Scheduler changes. These are not closed by the unchanged live health endpoint.
- **BLOCKED:** Hosted acceptance of the new repairs and the remaining physical installation/OS notification subchecks. Master matrix now honestly records 82 retained PASS, five BLOCKED, one NOT APPLICABLE. No full production certificate issued.
- **DEFER UNTIL AFTER LAUNCH:** Existing non-blocking lint warnings and unrelated cosmetics.

The role runner now collects independent role failures rather than aborting at the
first role. Run `final-cert-t3-260912-165833-529e` encountered an audit-runner variable
scope error; it is invalid as complete role evidence and its cleanup removed 301
fixture records. That runner error was corrected before the next attempt. Raw
attempt evidence is retained; failures are not suppressed or relabelled PASS.

## Completed continuation evidence

| Evidence | Result and boundary |
| --- | --- |
| `final-cert-t3-260912-170116-6170` | Full-role attempt: 19 complete role sweeps, three blocked-account denials and remaining surface smoke; retained FAIL for school delegate, youth 404 and three stale fresh-account landing expectations |
| `final-cert-local-260912-171517-5321` | Repaired delegate, youth, fresh coach/admin sweeps completed; school overview owner/delegate/other-institution cases passed locally, including 12 delegate tab/viewport observations. Fresh League Creator needed a further correction to the audit's locked-page expectation |
| `final-cert-t3-260912-171936-d40f` | Fresh League Creator completed route/viewport checks; `/club` renders **Club Hub Locked** with no private Safety tab, rather than redirecting. Product access policy was unchanged |
| `/tmp/squad-sep12-scheduler-auth.log` | Existing authenticated companion harness passed account-scoped task reload, offline shell/tasks, current-team events, account-switch exclusion and zero unexpected online/offline console errors; exit 0 |
| `/tmp/squad-sep12-unit-complete.log` | 1,501 PASS, zero FAIL, eight existing opt-in skips |
| `/tmp/squad-sep12-production-build.log` | Production build exit 0 |
| `/tmp/squad-sep12-lint-release.log` | Lint exit 0; zero errors, 1,901 warnings |
| `/tmp/squad-sep12-typecheck-release.log`, `/tmp/squad-sep12-functions.log` | TypeScript and Functions build exit 0 |
| `/tmp/squad-sep12-dependency-audit.log` | Production dependencies: zero vulnerabilities |

The union of the three role runs contains all 24 complete role-policy sweeps:
coach owners A/B, Pro, Elite, school owner/delegate, league owners A/B, assistant,
member, parents A/B, adult players A/B, youth, referee, trusted superadmin,
fake-superadmin, removed member, deletion-protected owner, multi-organization,
fresh coach/admin/League Creator. This does not mean every widget was freshly
exercised for all 24 identities; unaffected functional cases retain prior evidence.

Fresh-account fixtures incorrectly used the team-creation page as the login
destination. Actual Login behavior, fresh snapshots, and visible New Team actions
proved Dashboard for coach/admin and Competition Hub for League Creator, with
the creation form still reachable. Only fixture expectations were corrected.
The earlier youth 404 did not recur in its clean focused rerun; no application
change was attributed to that transient observation.

Focused reruns explicitly identify their limited scope. Their recorder retains
full-matrix thresholds and exact-hosted preconditions; no partial package was
relabelled full certification. Two failed source-shape assertions were updated
only after checking their intended owner-capacity and staff-scope invariants.
A read-only code review identified a staff-position compatibility gap and an
audit cleanup aggregation gap; both were addressed and re-reviewed. A failing
Member+Coach regression now passes using the existing shared staff policy.

All four continuation emulator runs (including the companion run) reported exact
fixture cleanup: 301 deleted, zero retained audit records per run. Historical
September 4 summary files were restored after runner-generated overwrites.
Unrelated generated Functions build artifacts were removed/restored; no Functions
source was changed. No customer data or production secrets were modified.
Production health at 17:20:37 UTC still reported `25d85d9c`; new repairs remain
uncommitted local changes, not a deployment. Physical installation naming,
notification presentation and badges are not proven by these browser results.

## Initial result (before the continuation repairs)

Partial verification with three findings; **not full production certification**.
No application repairs or deployments were made. Existing unaffected PASS evidence
was retained, as requested, rather than repeating the entire historical audit.

Production health on September 12 returned revision
`25d85d9c3860e17103fd2a0e52a1e6f6ed30fb59` and `status: ok`.
Local browser tests used worktree commit `d503def576764d2ff109901653b349cc493de543`.
These are distinct evidence boundaries; this run did not compare their complete trees.
The main repository checkout has an older audit. The later matrix in this worktree
was the selection source; its physical-device statuses also lag owner reports in chat.

## Fresh live Playwright observations

| Role/surface | Verified scope | Result |
| --- | --- | --- |
| Visitor | Homepage rendering; Scheduler signed-out view and task flow | Rendered; task-persistence defect below |
| Starter coach demo | Mobile dashboard, active-team label, Settings, visible sign-out returning to Login | PASS for these observations |
| Squad Pro coach demo | Desktop navigation to Schedule, Roster, Chat, Practice, Scorekeeping, Coach Tools, Facilities, Equipment, Feed, Volunteer, Fundraising, Library, Join & Invite, Sports Hub | All 14 document requests returned 200; sampled views had no horizontal overflow or uncaught page errors |
| Adult-player demo | Member dashboard/navigation; direct admin, club, competition, and new-team denials; Settings logout | PASS for listed checks; a larger route-sampling loop was interrupted by an expected redirect and is not counted as a completed sweep |
| Parent demo | Family landing with two children, both teams/schedules and pending waivers; same four direct-route denials; Settings logout | PASS for listed checks |
| Elite organization demo | Club landing, six hub tabs (Squads, Coaches, Admins, Waivers, Finance, Safety), mobile containment, admin denial, logout | PASS for listed checks; six tabs had no document overflow and no uncaught page errors during the tab check |
| School owner demo | School landing and five squads; same six hub tabs, mobile containment, admin denial, logout | PASS for listed checks |
| FREE League Creator demo | Competition landing; Select Hub; Teams, Schedule, Players, Safety; Season Architect open/cancel; admin denial and logout | PASS for listed checks; four views had no document overflow at 390px |

Demo checks are not registered-account payment, email, youth, referee, or trusted
superadmin certification. Route rendering is not CRUD/permission completion.
The exact broad Playwright request therefore remains incomplete despite these passes.
Earlier hosted role, portal, mutation, provider and lifecycle evidence is retained
at its documented scope, not represented as fresh September 12 execution.

## Findings

### SEP12-1 — delegated school administrator: failed local role test

The dashboard role-policy scenario failed on `qa-school-delegate` after successful
owner/pro/elite/school-owner observations. During delegated-admin persistence checks,
`/api/organizations/squads` and `/api/teams/incidents` returned 403; Firestore list
errors were also recorded. The console assertion expected zero errors and received
eight. Full downstream role-policy observations did not complete.

Fixture validation requires the delegate in the school hub's `schoolAdminIds` and
three associated squads. The Club page resolves hub details asynchronously and
constructs capacity requests from the current hub; the server requires canonical
hub authority. This identifies the affected path, but does not yet prove whether
the failure is startup timing, fixture incompleteness, or a persistent authority
mismatch. Do not loosen permissions based on this test alone.

Evidence: local run `final-cert-local-260912-164523-4bcc`,
`output/playwright/2026-09-04-final-certification/task-3/final-cert-local-260912-164523-4bcc/results.json`;
console failure case in its `cases/` directory;
`/tmp/squad-sep12-focused-local.log`. Process exit: 1; scenario outcome: FAIL.

### SEP12-2 — live Scheduler accepts tasks it cannot save when signed out

Reproduction: open `/schedule-app` in a fresh signed-out session; open To-Do List;
Add Task; enter `QA temporary task Sep12`; Add; reload; reopen To-Do List.
The task count was one before reload and zero afterward. No guest-task persistence
warning appeared in the flow. Source: `addTodo` updates React state without requiring
a user, while the saving effect exits when `storageUserId` is empty. The temporary
task existed only in this browser and disappeared during reproduction.

Evidence: `output/playwright/sep12-scheduler-task-lost.png`, browser session
`scheduler-sep12`, and source `src/app/schedule-app/page.tsx`.
Result: FAIL for signed-out task retention/feedback; not evidence of signed-in data loss.

### SEP12-3 — Scheduler Apple install title is still the primary app name

Live DOM confirmed the Scheduler route references `/schedule-manifest.json` and
has document title `The Squad Scheduler | The Squad`, but its
`apple-mobile-web-app-title` is `The Squad`. The Scheduler layout explicitly sets
`appleWebApp.title: 'The Squad'`. This leaves conflicting naming metadata for the
secondary app. Physical iPhone installation naming was not retested.

Result: FAIL for distinct Apple naming metadata; physical install result unverified.

## Event and score rerun

The prior September 9 report had an event scenario timeout and incomplete score
console/layout observations. Those selected scenarios were rerun separately after
the role-policy package failed, so the failure did not prevent their execution.

Run `final-cert-t5-260912-164844-b729` exited 0. Event CRUD/recurrence and team-score
cases recorded all seven required local dimensions: happy path, negative path,
permission, persistence, console, network, responsive. The log contains 28 OBSERVED
case records, including cleanup records; these are not 28 complete features.
No event timeout recurred. The score browser saved/edited through the visible form;
negative score returned 400 and member mutation returned 403; desktop/mobile controls fit.

Both strict scenario outcomes remain BLOCKED_PRECONDITION solely for their named
exact-staging-revision boundary; neither was relabelled full hosted PASS.
Evidence: `output/playwright/2026-09-04-final-certification/task-5/final-cert-t5-260912-164844-b729/results.json`
and `/tmp/squad-sep12-operations.log`.

## Cleanup and remaining work

- Local role-run cleanup: 301 fixture records deleted, zero retained audit records.
- Local operation-run cleanup: 320 fixture/dynamic records deleted, zero retained audit records.
- All owned live demos used visible Settings sign-out and returned to Login.
  No independent production database residue scan was performed.
- Both new Playwright browser sessions were closed. Other existing sessions were preserved.
- The runner overwrote two historical summary files; their pre-run tracked contents
  were restored and the new immutable run evidence was retained separately.

Remaining: diagnose SEP12-1 and complete the interrupted registered-role matrix;
repair/retest the two Scheduler findings; obtain exact hosted evidence for any
remaining local-only cases; reconcile physical opt-out/install/update observations.
No fresh full build, lint, unit suite, payment, email, native push, or device install
was run in this testing-only phase. Previous build/provider evidence is historical.
