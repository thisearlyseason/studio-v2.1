# Phase 9 Committed Browser Evidence Runner Design

## Status and authority

This design amends Phase 9 Task 7 after five incremental private-harness fix rounds failed independent review. The user authorized an architectural harness replacement on 2026-08-25. It does not authorize production access, a merge, or hosted execution before implementation and independent review pass.

The replacement is a committed, testable evidence subsystem. It replaces the ignored Task 7 browser runner and guarded shell; it does not change SaaS runtime behavior.

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

No validator may infer PASS from a final URL alone. Every allowed route requires its configured visible sentinel. Every denied or revoked route requires zero protected render, zero protected requests, and zero protected listener starts over the complete action window.

### `playwright-cli-client.mjs`

A thin dependency-injected adapter around the bundled `playwright_cli.sh`:

- opens system Chrome only;
- opens on `about:blank`, arms listeners, then permits navigation;
- provides typed operations for snapshot, navigation, interaction, tab selection, browser listing, and closure;
- compiles `run-code` payloads locally before transport;
- parses JSON and rejects CLI `isError`, malformed output, timeout, and nonzero exit;
- never logs credentials, cookies, bearer values, request bodies, or storage state.

Tests use an injected fake transport. A separate offline smoke uses the real bundled CLI against `about:blank` only.

### `signal-window.mjs`

Owns browser observation windows. The only action API is:

```js
await observeAction(pageHandle, stageName, async () => action())
```

It records per-page counters before invoking the callback, executes the action, waits for the stage-specific terminal state, then returns only signals within that window. Callers cannot supply a post-action mark.

Each window records final URL, route-specific visible sentinel, protected render history, session-cookie presence, protected request count, protected listener starts attributed by initiating frame URL, relevant HTTP results, page errors, application-console errors, unexpected request failures, and overflow.

Logout uses separate windows for the logout click, stale-tab reload, stale-tab back, and second reload. Each stage independently requires login UI, no session, no protected render, no protected requests, and no protected listeners.

### `scenarios.mjs`

Executes only declarative scenarios from `scenario-contracts.mjs`.

- Allowed routes require exact pathname plus route-specific visible content: Admin, Club/School Hub, Competition Hub, Billing, Coaches Corner, or Family Overview.
- Denied routes require the expected landing sentinel and no denied-route render/request/listener during the complete window.
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
3. The scenario runner opens isolated system-Chrome sessions. The client arms listeners on `about:blank` before login navigation.
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
- denied routes fail on any protected flash/request/listener even if the final landing is correct;
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
- the evidence-only commit is clearly distinguished from the deployed application SHA.

Until then, release status remains `NOT READY`.
