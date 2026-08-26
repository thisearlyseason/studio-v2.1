# Phase 9 Committed Browser Evidence Runner Design

## Status and authority

This design amends Phase 9 Task 7 after five incremental private-harness fix rounds failed independent review. The user authorized an architectural harness replacement on 2026-08-25. It does not authorize production access, a merge, or hosted execution before implementation and independent review pass.

The replacement is a committed, testable evidence subsystem. It replaces the ignored Task 7 browser runner and guarded shell. A later Task 3 amendment also authorizes one bounded SaaS correction: the dashboard settled-role effect must re-evaluate when `userProfile.role` hydrates, so a fresh League Creator deterministically reaches `/competition`. No other product-runtime change is authorized by this design.

## Problem

The private harness combined scenario policy, Playwright transport, signal attribution, cleanup orchestration, and evidence formatting in large ignored scripts. Tests exercised extracted data validators but not the real action ordering. Independent review found false-PASS and cleanup-certification hazards:

- logout instrumentation began after the action;
- revocation rows omitted transient protected UI/request signals;
- route and isolation probes could pass without exercising a real protected consumer;
- emergency browser closure was not verified;
- shell exit codes could be green while lifecycle JSON contained `ok:false`.

Repeated local patches improved individual symptoms but did not make the end-to-end contract reviewable. Another incremental retry is prohibited by the five-round escalation rule.

## Considered approaches

### A. Committed Node runner with pure contracts and a thin Playwright CLI adapter — selected

Commit scenario definitions, action-window instrumentation, lifecycle closure validation, and offline tests. Keep the bundled Playwright CLI as the browser transport, so no browser package or binary is added. A small adapter is the only module allowed to execute CLI commands.

This is the smallest approach that makes real action ordering and cleanup behavior testable while retaining the approved CLI-first browser workflow.

### B. Add `@playwright/test`

This would provide fixtures and reporters, but adds a dependency and a second browser execution convention. It also diverges from the required bundled Playwright CLI workflow. The added surface is not justified for one audit subsystem.

### C. Continue with ignored private scripts

Rejected. Ignored files are not protected by repository gates, and five review rounds demonstrated that extracted unit tests can diverge from the actual runner.

## Architecture

The subsystem lives under `scripts/qa-evidence/phase9/` with tests in `tests/phase9-browser-evidence.test.mjs`.

### `scenario-contracts.mjs`

Pure definitions and validators:

- exact viewports, aliases, route matrix, and per-route visible readiness sentinels;
- exact isolation probes;
- required ledger columns and scenario-group arithmetic;
- action-stage audit rules for admission, denied routes, isolation, logout/back/reload, fresh unauthenticated access, and pending deletion;
- lifecycle result validation for preflight, seed, inspect, transition, cleanup, independent probe, credential removal, workspace removal, and zero browser sessions.

No validator may infer PASS from a final URL alone. Every allowed route requires its configured visible sentinel. Every revoked route requires zero protected render, zero protected requests, and zero protected listener starts over the complete action window. Denied active-account routes require zero denied-target protected activity; the No Team specialization additionally rejects every fixture-tenant or unscoped protected signal while permitting its exact account-scoped setup activity.

### `playwright-cli-client.mjs`

A thin dependency-injected adapter around the bundled `playwright_cli.sh`:

- opens system Chrome only;
- opens on `about:blank`, arms listeners, then permits navigation;
- provides typed operations for snapshot, navigation, interaction, tab selection, browser listing, and closure;
- compiles `run-code` payloads locally before transport;
- parses JSON and rejects CLI `isError`, malformed output, timeout, and nonzero exit;
- receives the exact fixture run ID and accepts only project-bound Firestore document GET, REST `runQuery`, or WebChannel Listen producer schemas. Every URL/body must bind the exact staging project and `(default)` database; document GET and runQuery URLs reject query/fragment/body material outside their exact shapes; Listen URLs require one of the installed SDK's exact initial-forward, forward, back-channel, or termination parameter records, including the bound database, WebChannel version, request identity, and cache buster, with no duplicate or unknown key. Document paths must be canonical document paths; runQuery bodies cannot be empty or contain unknown fields; Listen form bodies account for every `count`, `ofs`, contiguous `reqN___data__`, and optional closed producer-header field, and messages must be exact add-target, remove-target, or known transport-control shapes. Malformed, wrong-project, hidden/nested, extra, or unaccounted material adds only the fail-closed `unscoped` evidence for that malformed material and is never recursively harvested as a trusted target;
- parses every valid target in multiplexed Listen traffic into an exhaustive, canonically ordered set of closed evidence labels and derived resource scopes (`self-account`, join-admin lookup, Team A, Team B, league tenant, other tenant, foreign account, non-tenant, transport control, or unscoped). A malformed sibling cannot erase a valid sibling, and a valid sibling cannot erase `unscoped`;
- recognizes the join-page `players where parentId == current uid` listener as `self-account` only when the structured query has the exact root parent, one `players` collection selector with `allDescendants` absent or boolean `false`, one exact `parentId EQUAL` string filter for the current fixture identity, and either no order or the producer-required single `__name__ ASCENDING` order. Any other order, projection, limit, offset, cursor, descendant flag/type, extra filter, unknown field, different/multiple parent binding, or missing binding is foreign/unscoped;
- treats the installed recorder and CLI transport as raw acquisition only. They may carry bounded URL, method, resource type, request headers, body, initiating-frame URL, and response status to the private local sampling implementation, but they cannot assert target kinds, evidence labels, scope sets, or public page identity. `createPlaywrightCliClient()` independently parses and classifies every captured request from those raw facts; injected or synthetic transport labels are ignored, and missing material for a protected/Firestore candidate becomes protected `unscoped` evidence;
- inspects the URL before resource type, so a protected same-origin API or Firestore URL cannot be downgraded with `resourceType: document`. The exact join lookup is a bodyless same-origin `PATCH /api/schools/admins` fetch with no query, fragment, fixture identifier, or other material. Join and Firestore activity must originate from the exact canonical staging join frame, carry the expected exact staging `Origin` and source-backed `Referer`, and match the complete locally characterized browser/SDK header-name and header-value allowlist, including `Accept`; a foreign frame/origin/referrer, a missing required header, or any unknown header fails closed;
- owns Listen target lifecycle state privately per tab. An `addTarget` ID must be a bounded integer that is not already active; `removeTarget` must name a previously active target and deactivates it, after which the ID may be reused. Duplicate active IDs, unseen removals, conflicting messages, malformed control shapes, caller-supplied state, and state carried across recorder installation or navigation fail closed. Counts, offsets, body sizes, target IDs, expected counts, message entries, and active-target cardinality are bounded before every loop or allocation so enormous integers return `unscoped` rather than throwing or consuming unbounded resources;
- never returns or logs credentials, cookies, bearer values, request headers/bodies, storage state, raw target URLs, raw run IDs, UIDs, team IDs, player IDs, or other raw fixture identifiers. Raw acquisition data is reduced inside the private local sample implementation to the fixed observation schema and immediately discarded; no raw field reaches the returned sample, `observeAction()`, scenarios, rows, or ledger. Public visible headings/statuses and render signals are closed source-backed enums; unknown provider text is rejected instead of copied or generically sanitized. Public page IDs are assigned locally from a closed format. Every public string is checked at every bounded decoding layer; malformed percent escapes and credential-shaped values fail closed independently of fixture-pattern matching.

Tests use an injected fake transport. A separate offline smoke uses the real bundled CLI against `about:blank` only.

### `signal-window.mjs`

Owns browser observation windows. The only action API is:

```js
await observeAction(pageHandle, stageName, async () => action())
```

It records per-page counters before invoking the callback, executes the action, waits for the stage-specific terminal state, then returns only signals within that window. Callers cannot supply a post-action mark.

Each window records final URL, route-specific visible sentinel, protected render history, session-cookie presence, protected request count, protected listener starts attributed by initiating frame URL, fixed sanitized resource scopes, relevant HTTP results, page errors, application-console errors, unexpected request failures, and overflow.

Logout uses separate windows for the logout click, stale-tab reload, stale-tab back, and second reload. Each stage independently requires login UI, no session, no protected render, no protected requests, and no protected listeners.

### `scenarios.mjs`

Executes only declarative scenarios from `scenario-contracts.mjs`.

- Admission and denial terminals use the following settled role landings. These are the final product-layout destinations, not the transient `/dashboard` rendered before a client-side role redirect:

  | Alias | Exact settled path | Exact accessible heading |
  |---|---|---|
  | `qa-parent-a` | `/family` | `Family Overview` |
  | `qa-adult-player-a` | `/dashboard` | `Dashboard` |
  | `qa-youth-active` | `/dashboard` | `Dashboard` |
  | `qa-league-creator` | `/competition` | `Competition Hub` |
  | `qa-school-admin` | `/club` | `School Hub` |
  | `qa-superadmin` | `/admin` | `Account Lookup` |
  | `qa-fake-superadmin` | `/dashboard` | `Dashboard` |
  | `qa-missing-profile` | `/onboarding` | `Complete your profile` |
  | `qa-no-team` | `/teams/join` | `Join & Invite` |

- Every admission and route terminal receives the exact expected path and heading together. A heading-only observation cannot complete a window, and a transient `Dashboard` cannot satisfy Parent A, League Creator, or School Admin.
- Allowed routes require exact pathname plus route-specific visible content: Admin, Club/School Hub, Competition Hub, Billing, Coaches Corner, or Family Overview.
- Denied routes require the exact settled role landing and no denied-route protected render. Ordinary active roles also reject denied-target request/listener attribution during the complete window.
- `qa-missing-profile` retains the strict setup-isolation rule: zero protected requests and zero protected listener starts across login/admission and every denied-route window.
- `qa-no-team` instead enforces the original tenant-isolation intent. Its own `users/{uid}` profile and `users/{uid}/teamMemberships` activity, the exact self-bound `players where parentId == current uid` query, the exact `PATCH /api/schools/admins` join-page lookup, non-tenant reference data, and transport-control messages may proceed. Any Team A, Team B, league, other-tenant, foreign-account, or unscoped protected request/listener fails in the login window and after each of the six denied-route attempts. Every scope from a multiplexed signal survives aggregation so an allowed target cannot hide a forbidden sibling and later clean windows cannot hide earlier tenant activity.
- Horizontal isolation uses the real same-origin `GET /api/teams/chat?teamId=<id>` consumer: own team must return 200 and the opposite team must return 403. Direct Firestore REST GETs used by the client must return 200 for permitted team/player documents and 403 for opposite team/player documents. No `/team?teamId=` assertion is permitted because the page ignores that parameter.
- Fresh unauthenticated and pending-deletion checks use complete action windows and fail on any transient protected UI, request, listener, session, error, or overflow.
- Each scenario returns one complete sanitized ledger row. A failed or incomplete assertion aborts canonical progression and cannot be serialized as PASS.

### `lifecycle-guardian.mjs`

A Node parent process owns the exact private workspace, fixture manifest, credential path, child browser runner, and cleanup state. It replaces behavioral shell logic.

- It validates the exact deployed SHA/run, open-unmerged PR, staging project, canonical origin, and empty browser-session list before mutation.
- It creates one mode-0700 `/tmp/phase9-core-identities.*` workspace and registers `SIGINT`, `SIGTERM`, uncaught-exception, and unhandled-rejection handlers before seeding.
- Every fixture command must return exit zero and parse to its complete typed producer contract. Commands that emit `ok` must require `ok:true`; preflight and seed instead require every canonical field their current CLI producer emits. Exit status alone is never sufficient.
- It keeps the exact manifest until pre-clean inspect, cleanup, cleaned inspect, a separately initialized exact probe of all 20 UIDs, all 82 expected-present paths, and every expected-absence path, and a verified empty browser-session list all pass.
- Browser closure failure or a nonempty browser list blocks safe-stop certification.
- On certified closure, it removes the credential through `removeCredentialFile()`, removes the exact workspace, proves both absent, and disarms.
- On uncertain closure, it removes no unproven resource and retains only the mode-0700 exact recovery workspace. It emits a fixed sanitized recovery message without paths, IDs, credentials, or provider errors.

The unavoidable `SIGKILL`/machine-loss case is documented; no in-process guardian can execute after the process is forcibly terminated. Recovery remains exact because the external manifest is atomically persisted before resource creation.

### `evidence-writer.mjs`

Accepts only validated scenario results and lifecycle summaries. It writes the four approved Markdown evidence files through atomic replacement. It cannot read credential files, raw browser state, or arbitrary traces. It verifies context IDs are unique, every required column is present, group counts match the plan, both viewports are covered, and result arithmetic is exact.

## Data flow

1. The guardian validates local/GitHub/staging read-only prerequisites and an empty browser list.
2. The guardian creates the private workspace, seeds v3 fixtures, and validates a zero-drift 20/82 inspection.
3. The scenario runner opens isolated system-Chrome sessions. The client receives the exact fixture run ID and arms listeners plus exhaustive set-valued resource parsing on `about:blank` before login navigation.
4. Each action is executed only through `observeAction()`. Pure validators decide PASS/FAIL from the complete action window and scenario contract.
5. The pending-delete transition runs only after all pre-transition scenarios pass.
6. All sessions close and the guardian verifies the browser list is empty.
7. The guardian performs exact inspect-cleanup-inspect and the separate complete absence probe while retaining the manifest.
8. After closure is certified, the evidence writer creates sanitized Markdown, credentials/workspace are removed and proved absent, and the guardian disarms.
9. Evidence is committed after cleanup and is never claimed as deployed.

## Testing strategy

All implementation follows RED/GREEN TDD.

The committed Node test must exercise real exported entrypoints and cover at least:

- `observeAction()` samples before invoking the callback and includes activity emitted during logout;
- every logout/back/reload stage fails on transient protected render, request, listener, or session;
- allowed routes fail on loading, blank, wrong sentinel, swallowed timeout, wrong path, console/page error, request failure, or overflow;
- admission waits do not complete on an intermediate `Dashboard` and reject `Dashboard` as the final Parent A, League Creator, or School Admin landing;
- denied routes fail on any protected flash or denied-target tenant request/listener even if the final landing is correct;
- Missing Profile fails on every protected request/listener in every admission window;
- No Team permits exact self-account/membership, the exact same-identity parent-bound players query, and join-page admin lookup activity, but fails Team A, Team B, league, other-tenant, foreign-account, or unscoped requests/listeners in login and all six denied-route windows; aggregate validation must preserve every scope;
- project-mismatched or malformed document/runQuery/Listen bodies, invalid remove targets, hidden targets, unknown fields, and false transport-control shapes fail closed without arbitrary recursive target harvesting;
- multiplexed Firestore bodies retain every valid parsed scope plus `unscoped` for malformed siblings, while forged transport labels are ignored and missing/disconnected raw material fails closed at the local derivation boundary;
- the self-parent players query accepts only the exact real producer shape, including boolean/absent `allDescendants` and the optional exact `__name__ ASCENDING` order, while every expanding field/filter/order/cursor/limit variant fails;
- public render/headings/status observations reject every string outside their exact closed source-backed enums; malformed percent escapes, mixed/double encoded fixture identifiers, bearer/JWT/key/password-shaped text, and provider-controlled page identity fail before any sample or action window returns;
- join and Firestore evidence rejects a foreign initiating frame, `Origin`, `Referer`, missing characterized browser/SDK headers, unexpected header names, and invalid exact values;
- Listen lifecycle tests cover unseen `removeTarget` 999, duplicate active target 1, removal followed by permitted reuse, persistence across action windows in one tab, caller-state forgery, reset on navigation/recorder install, conflicting transport control, and huge counts/IDs/offsets/body sizes without throw or unbounded allocation;
- raw provider samples plus nested client results, action summaries, serialized scenario rows, and validated ledger rows contain no raw run ID, UID, team ID, player ID, target URL, or fixture path in any free-text field, including `pageId`;
- a rendered product regression starts with an unresolved profile, hydrates `league_creator` without changing other redirect dependencies, and requires `/competition`; Parent and School redirects remain unchanged;
- isolation calls the real configured same-origin endpoint and fails if it is not parameter-consuming, if own is not 200, or opposite is not 403;
- direct Firestore probes require the full label/path set and exact 200/403 symmetry;
- fresh unauthenticated and pending-delete rows fail on transient protected activity;
- guardian rejects command nonzero, malformed JSON, `ok:false`, drift, retained/failure counts, incomplete expected-absence coverage, browser close failure, or nonempty post-close browser list;
- guardian preserves the manifest/workspace on uncertain closure and removes them only after certified closure;
- evidence writer rejects missing columns, duplicate context IDs, wrong group counts, missing viewport, and inconsistent arithmetic;
- repository hygiene detects prohibited raw artifacts or session material in the committed evidence paths.

Offline system-Chrome smoke is limited to `about:blank` and proves listener arming, action-window ordering, tab-specific marks, CLI error handling, exact closure, and zero remaining sessions. It performs no hosted mutation.

Before hosted execution, focused tests, the full Node suite, `npm run verify`, diff checks, hygiene/secret scans, and an independent code review must pass. The reviewed tracked SHA is then pushed, CI must pass, and exactly one staging deployment may run. No production action and no merge are permitted.

## Evidence and status semantics

Historical aborted attempts remain documented as `INCONCLUSIVE-HARNESS`. The retry-4 20/82 cleanup and separate 0/0 probe remain valid cleanup evidence but do not close browser scenarios.

The final Task 7 report may claim completion only when:

- every planned canonical row is present and validated;
- there are no unexplained product or harness failures;
- exact cleanup, complete independent absence, credential removal, workspace removal, and zero browser sessions are all proved;
- the final evidence-only commit is clearly distinguished from the reviewed/deployed application SHA that includes the bounded hydration fix.

Until then, release status remains `NOT READY`.
