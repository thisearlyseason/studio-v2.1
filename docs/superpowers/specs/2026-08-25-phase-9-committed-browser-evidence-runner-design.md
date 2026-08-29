# Phase 9 Committed Browser Evidence Runner Design

## Status and authority

This design amends Phase 9 Task 7 after five incremental private-harness fix rounds failed independent review. The user authorized an architectural harness replacement on 2026-08-25. It does not authorize production access, a merge, or hosted execution before implementation and independent review pass.

The replacement is a committed, testable evidence subsystem. It replaces the ignored Task 7 browser runner and guarded shell. A later Task 3 amendment authorizes the dashboard settled-role effect to re-evaluate when `userProfile.role` hydrates, so a fresh League Creator deterministically reaches `/competition`. A later source-backed row-zero correction authorizes the login profile decision to send a known parent directly to `/family`, after mandatory session admission and any canonical same-origin return path, so the strict action-window recorder cannot observe an unintended protected `/dashboard` render. Return-path ingestion and consumption must reject network paths, backslashes, controls, encoded separator/scheme tricks, malformed URLs, and any origin or canonical-serialization change. No other product-runtime change is authorized by this design.

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
- owns Listen target lifecycle state privately per tab. An `addTarget` ID must be a bounded integer that is not already active; `removeTarget` must name a previously active target and deactivates it, after which the ID may be reused. Every complete parsed producer request applies additions/removals to a private draft and commits them atomically only when every message, target, and state transition is valid. Duplicate active IDs, unseen removals, unknown or malformed targets, conflicting messages, malformed control shapes, caller-supplied state, and partial mutation from an invalid request fail closed. Counts, offsets, body sizes, target IDs, expected counts, message entries, and active-target cardinality are bounded before every loop or allocation so enormous integers return `unscoped` rather than throwing or consuming unbounded resources;
- binds that private target state to a trusted monotonically increasing main-frame navigation generation recorded beside each raw request. Recorder installation resets the binding, and every actual main-frame navigation, click navigation, reload (including the same URL), or location change resets target state regardless of whether the caller used `goto`, `runCode`, or another public client entrypoint. DOM-only `runCode` without navigation retains state. Caller code is never parsed to infer navigation;
- never returns or logs credentials, cookies, bearer values, request headers/bodies, storage state, raw target URLs, raw run IDs, UIDs, team IDs, player IDs, navigation generations, or other raw fixture identifiers. Raw acquisition data is reduced inside the private local sample implementation to the fixed observation schema and immediately discarded; no raw field reaches the returned sample, `observeAction()`, scenarios, rows, or ledger. Public visible headings/statuses and render signals are closed source-backed enums; unknown provider text is rejected instead of copied or generically sanitized. Public page IDs are assigned locally from a closed format. Every public string is checked at every bounded decoding layer; malformed percent escapes and credential-shaped values fail closed independently of fixture-pattern matching. At the fixed decoding budget, any remaining valid percent-encoded material fails closed; only a literal percent followed by whitespace or end-of-string is treated as benign prose.

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
- Every one of the two same-origin API and four direct Firestore isolation action windows must independently retain the exact authenticated staging session; a later authenticated window cannot hide an earlier missing session.
- Public action windows expose only count-coherent `protectedRequestSignals` and `listenerSignals` entries in the closed resource-evidence schema. The legacy general `requestSignals` container and raw `url`, `rawUrl`, `path`, `query`, or arbitrary signal fields are rejected; opaque raw queries remain private acquisition material and are discarded before return.
- Fresh unauthenticated and pending-deletion checks use complete action windows and fail on any transient protected UI, request, listener, session, error, or overflow.
- Each scenario returns one complete sanitized ledger row. A failed or incomplete assertion aborts canonical progression and cannot be serialized as PASS.

### `lifecycle-guardian.mjs`

A Node parent process owns the exact private workspace, fixture manifest, credential path, child browser runner process, and cleanup state. It replaces behavioral shell logic. The runner is an OS-process trust boundary: scenario code is never imported, called, or injected into the guardian realm.

- It validates the exact deployed SHA/run, open-unmerged PR, staging project, canonical origin, and empty browser-session list before mutation.
- Its only scenario input is a closed inert `runnerCommand` descriptor containing one repository-confined absolute `.mjs` entrypoint, its SHA-256, and one to eight repository-confined absolute JSON config paths with their SHA-256 values. Descriptor objects and arrays are snapshotted from exact own data properties; Proxies, accessors, symbols, custom prototypes, unknown fields, duplicate configs, relative paths, symlinks, hash drift, oversized files, and group/world-writable files fail before fixture mutation. Verification captures the exact UTF-8 entrypoint and config bytes once. The child executes that source through the fixed Node executable's module `--eval` mode and receives the captured config bytes as bounded base64 arguments; no caller-controlled path is reopened at spawn. The real Task 5 entrypoint must therefore be a reviewed self-contained/bundled module whose only external imports are trusted Node built-ins.
- The guardian uses its fixed lexical `node:child_process` spawn import and the fixed Node executable. Callers cannot inject a spawn function, runner factory, callback, Promise, process handle, termination function, or join function. Each scenario phase registers a cancellable startup generation before any asynchronous process audit, rechecks cancellation immediately before the synchronous spawn call, and then starts a separate detached process group with `shell:false`. Signal recovery cancels and joins that generation before it may certify closure, so a verification continuation cannot spawn after recovery. The child inherits the module-initialization environment needed for ADC/runtime access except Node code-injection paths (`NODE_OPTIONS` and `NODE_PATH`), which are removed before spawn.
- Child stdout is a bounded ASCII NDJSON protocol, pinned as protocol version 4 before decoding and parsing, with bounded guardian acknowledgements on child stdin. Before any exact local `open about:blank`, the child synchronously emits a monotonic `ownership-intent` and cannot acquire until the guardian registers the exact session for browser-first recovery and replies with the matching `ownership-authorized`. Immediately after acquisition and launch-receipt capture, the child emits the matching `ownership-add` before recorder arming, viewport work, login, staging navigation, or scenario action. A retained post-transition session emits a monotonic `ownership-attach` confirmation bound to the guardian's frozen prior receipt before attachment action. After each passing row, the child closes every exact row session not required by the pending-deletion transition, requires exact remaining browser inventory and absence of the frozen daemon/main PIDs, and only then emits monotonic `ownership-release`; logout releases both primary and fresh sessions. The guardian keeps every released session and receipt provisionally recovery-owned until its independent inventory/process boundary proves absence. Exactly the two mobile/desktop pending-deletion active baselines may remain at the pre-transition boundary; stale attachment and fresh-login sessions are closed/released after their post-transition rows, leaving final inventory zero. A failed or uncertain close/release remains actively or provisionally recovery-owned and prevents certification. One exact `ownership-complete` freezes the accumulated acquisition, attachment, and release history before every phase-specific row in canonical order (40 before transition and 4 after transition), and one exact completion record repeats that canonically sorted bounded state and exact row count. Every row must use the closed version-2 row schema, name a nonempty exact canonical session set derived from its scenario contract, and refer to immutable acquisition/attachment history even after release; version 1, empty, extra, missing, alternate, or merely plausible session sets fail closed. Unknown fields, duplicates, mutation, gaps, out-of-order records, missing or reordered rows, cross-phase rows, malformed JSON, overflow, inconsistent counts, false final arithmetic, early/nonzero/signal exit, and any child-supplied `closed` claim fail closed. Thus a crash or audit failure during any first or late acquisition still leaves the reserved exact browser name available for browser-first closure. The guardian returns the frozen sanitized 44-row projection only after cleanup, independent absence proof, credential/workspace removal, and disarm.
- Closure is parent-derived only. Every phase receives a cryptographically random environment marker after an empty collision baseline. The process group remains the first termination boundary, then the guardian independently enumerates processes carrying that exact marker through a bounded captured OS process audit, sends bounded `SIGTERM`/`SIGKILL`, and proves the marked set empty before browser or fixture cleanup certification. This catches descendants that create a new process group or session. The reviewed hashed self-contained child is the trusted boundary and is contractually prohibited from removing the inherited marker; admission also rejects any direct source/config reference to the marker name. Deliberately generic environment rewriting cannot be proven by an external marker alone and therefore remains prohibited child-runner behavior subject to code review.
- On Darwin, the process audit uses a committed self-contained Python/`ctypes` inspector rather than `ps` or shell-text command parsing. The guardian captures and SHA-256 pins the inspector bytes before executing them through the exact pinned `/usr/bin/python3` runtime; hosted admission separately requires the same inspector bytes at the deployed Git blob. For each PID, the inspector reads `PROC_PIDTBSDINFO` before and after `KERN_PROCARGS2` plus `proc_pidpath`, accepts only an unchanged PID/start-second/start-microsecond/PPID/PGID window with the exact marker still represented, preserves raw NUL-delimited argv element boundaries, and returns only a bounded closed JSON projection with a marker-presence boolean. The guardian compares raw argv arrays directly, so embedded spaces and switch-looking text cannot be retokenized.
- Empty Darwin argv elements remain distinct legal elements. If raw args are malformed, non-UTF-8, oversized, or otherwise unparseable, the inspector searches the bounded raw NUL fields for the exact marker assignment and emits only a fixed marked-error identity record; a stable PID whose raw args cannot be read is an inspector-fatal result. Normal audit rejects both conditions, while owned-process recovery may use the fixed identity solely to terminate and re-inspect the PID. Inspector accumulation is capped by marked raw bytes, record count, and serialized bytes before the final JSON document is assembled. Returned argv values replace every marker-name or marker-value occurrence with fixed public placeholders.
- `KERN_PROCARGS2` parsing consumes only the exact target-pointer-width padding documented by XNU between the executable path and argv; the pointer width comes from `PROC_FLAG_LP64`. An empty `argv0` is retained as a fixed marked inspection error instead of being skipped into later argv or environment fields, while later legal empty arguments remain exact. Exact marker argv material is removed rather than normalized, a separate boolean records its presence, and an attacker-supplied literal `--guardian-marker-present` remains literal so the closed Chrome schema rejects it. Executable paths containing marker or credential/fixture-shaped material are returned only as fixed `unsafeExecutablePath` errors. Any parsed inspection error or inspector/audit/enrichment execution, schema, or identity rejection is sticky for the guardian run: termination may kill the PID and browser/fixture recovery may proceed, but a later empty scan cannot restore closure certification. Intentional cancellation of a startup audit by the guardian's own interruption signal is not an inspector-integrity failure.
- The guardian creates one exact mode-`0700` `playwright-tmp` child beneath its external mode-`0700` workspace and supplies it as `TMPDIR` to every runner, captured transport, Playwright daemon, Chrome main, and helper descendant. Chrome `--user-data-dir` values must be immediate `playwright_chromiumdev_profile-*` children of that root. After exact browsers and marked processes close, the guardian audits and removes only the confined profile root, proves it absent, and compares the global producer-prefix inventory with the pre-run baseline before workspace removal. Any global producer-inventory execution, parse, type, mode, or equality rejection is irreversible for the run; the profile-root recovery state is retained until both exact removal and a successful post-removal inventory complete, and later clean inventories cannot restore certification. A new global producer profile, unsafe confined entry, or uncertain removal prevents certification.
- Executable identity is hashed through a held `O_NOFOLLOW` descriptor only after a regular-file and maximum-size check. Each bounded stream read, including the final EOF read, the final descriptor metadata read, hash completion, captured-byte assembly, and successful descriptor close must finish within one shared deadline; abort or deadline expiry cancels/destroys the stream and fails closure certification.
- Executable identity is derived from a single `O_NOFOLLOW` read-only descriptor. The guardian requires a regular file, enforces an explicit `512 MiB` maximum before allocation/read, hashes in bounded `1 MiB` chunks with a finite `30s` deadline and cancellation checks, and requires exact descriptor device/inode/size/mtime/ctime/mode/owner/link-count equality afterward. Oversized, sparse, short-read, replaced, relinked, or concurrently changed executables fail closed.
- Scenario completion has a separate finite phase deadline: at most `45m` before transition and `15m` after transition. Expiry is a guardian failure and enters the same child termination/join, exact browser-first closure, marker retirement, fixture cleanup, and independent absence path as other recoverable failures. A child that emits no terminal record and ignores `SIGTERM` therefore cannot retain the lifecycle indefinitely.
- The production child constructs its Playwright client only through the production factory, which fixes every transport command timeout to `90,000ms`; generated child/config/transport bytes and their literal pins must be rebuilt deterministically after any source change.
- It creates one mode-0700 `/tmp/phase9-core-identities.*` workspace and registers `SIGINT`, `SIGTERM`, uncaught-exception, and unhandled-rejection handlers before seeding.
- Every fixture command must return exit zero and parse to its complete typed producer contract. Commands that emit `ok` must require `ok:true`; preflight and seed instead require every canonical field their current CLI producer emits. Exit status alone is never sufficient.
- It keeps the exact manifest until pre-clean inspect, cleanup, cleaned inspect, a separately initialized exact probe of all 20 UIDs, all 82 expected-present paths, and every expected-absence path, and a verified empty browser-session list all pass.
- Browser inventory execution/schema/type failure and every lifecycle-reached nonempty or ownership-mismatched inventory irreversibly mark browser/process inspection uncertain. Recovery may continue closing exact owned browsers, but a later empty inventory cannot restore safe-stop certification or authorize fixture cleanup; the workspace and manifest remain preserved.
- On certified closure, it removes the credential through `removeCredentialFile()`, removes the exact workspace, proves both absent, and disarms.
- On uncertain closure, it removes no unproven resource and retains only the mode-0700 exact recovery workspace. It emits a fixed sanitized recovery message without paths, IDs, credentials, or provider errors.

The unavoidable `SIGKILL`/machine-loss case is documented; no in-process guardian can execute after the process is forcibly terminated. Recovery remains exact because the external manifest is atomically persisted before resource creation.

### Durable terminal certificate amendment

Hosted execution requires an operator-supplied lexically absolute, normalized terminal-result path outside the repository, the disposable lifecycle workspace, and the approved evidence tree. The writer resolves the real parent plus repository, workspace, and evidence boundaries before comparing confinement, so `/tmp` and `/private/tmp` aliases cannot bypass it. Its existing parent must be a component-wise canonical real current-user mode-`0700` directory with an unchanged descriptor identity; the final path must be absent for a new attempt or contain only the exact resumable checkpoint accepted through a no-follow identity-bound read. No result path is inferred, generated, printed, or stored in committed evidence.

The terminal certificate is bounded canonical JSON containing only a fixed schema version, lifecycle outcome/category/state/history, deployed SHA and staging deployment run, fixed stage counts, and parent-derived browser/process/profile/credential/workspace closure booleans. It must never contain the fixture run ID, UIDs, Firestore paths, browser session names, credential/workspace/result paths, provider errors, raw command output, or secrets. Every fixture stage contributes only after its complete producer result passes the existing closed validator. A `closure-pending` or `complete` certificate additionally requires the literal `20` aliases/`3` teams, `20` Auth/`82` Firestore seed and present-inspection counts, exact `20`/`82` deletion with zero retention/failure, clean `0`/`0`, independent `20`/`82`/`1` checks with zero presence, all four browser/process/profile/fixture closure booleans true, and exact pre-removal or post-removal history and removal booleans respectively; null, partial, drifted, or merely plausible summaries cannot certify closure.

Before credential or workspace removal, the guardian atomically persists a `closure-pending` checkpoint after exact cleanup, clean inspection, independent absence, and browser/process/profile closure. A checkpoint failure returns the fixed `terminal-certificate-failed` category while preserving the exact manifest, credential, and workspace for recovery. After credential and workspace removal are independently proved, the writer conditionally promotes only the held exact checkpoint identity: it links the currently named entry to the one fixed recovery companion, proves that companion still matches the held checkpoint, identity-removes the original name, and publishes the terminal transaction with a no-clobber link into the now-absent result name. A swapped or newly occupied result name is never overwritten; foreign bytes remain untouched and the fixed checkpoint companion is recognized on a fresh writer open after the collision is resolved. The helper revalidates the companion's held inode and exact bytes immediately before both publication and any rollback, so a swapped recovery companion is never published. On helper success it returns a closed committed-file identity receipt. Node accepts both checkpoint and complete results only by opening the result with `O_NOFOLLOW`, matching the held regular-file descriptor to that receipt, reading bounded canonical bytes through the descriptor, rechecking descriptor metadata, revalidating the held parent, and matching the named entry plus held descriptor again immediately before acceptance; pathname reads and byte-identical symlink replacements cannot certify. Failure of final promotion can never create or preserve a false `complete` certificate. Post-lifecycle ledger or evidence failure records only a fixed failed terminal category while retaining the lifecycle closure facts.

The production terminal-certificate writer is Darwin-only and rejects any other platform with one fixed error before filesystem access or mutation; its exact `/usr/bin/python3` runtime and helper pins are not weakened for Linux CI. Portable tests exercise the same canonical certificate validator, raw result-path admission, canonical confinement predicate through a real temporary symlink alias, and guardian checkpoint/failure contracts. Only tests that actually execute the pinned Darwin helper/filesystem transaction are members of the explicit unique Darwin runtime skip inventory.

The writer holds the result parent through `O_DIRECTORY | O_NOFOLLOW`, rejects symlinks, unexpected owner/mode/link/type/size, canonical-boundary aliases, path swaps, unsupported checkpoint bytes, and existing terminal results, and revalidates parent and descriptor identity around every operation. It creates a bounded mode-`0600` same-directory transaction file exclusively, writes and syncs canonical bytes, uses no-clobber publication for both initial and checkpoint promotion paths, syncs the directory, and reopens/revalidates exact committed bytes. Tests must cover discarded console output, normal and recovery completion, crash after checkpoint, injected checkpoint and final-promotion failure, pre- and post-validation target swaps, canonical `/tmp` aliases, relative raw paths, strict closure facts, symlinks, permissions, resume rules, secret/identifier rejection, and repository hygiene.

### `evidence-writer.mjs`

Accepts only validated scenario results and lifecycle summaries. It writes the four approved Markdown evidence files through atomic replacement. It cannot read credential files, raw browser state, or arbitrary traces. It verifies context IDs are unique, every required column is present, group counts match the plan, both viewports are covered, and result arithmetic is exact.

## Data flow

1. The guardian validates local/GitHub/staging read-only prerequisites and an empty browser list.
2. The guardian creates the private workspace, seeds v3 fixtures, and validates a zero-drift 20/82 inspection.
3. The guardian verifies and captures the committed self-contained runner entrypoint/config bytes, registers a startup generation, establishes a collision-free random process marker, and executes those exact captured bytes in an owned OS child process. The child runner opens isolated system-Chrome sessions, reports ownership before use, receives the exact fixture run through guardian-owned files, and arms listeners plus exhaustive set-valued resource parsing on `about:blank` before login navigation.
4. Each action is executed only through `observeAction()`. Pure validators decide PASS/FAIL from the complete action window and scenario contract.
5. The pending-delete transition runs only after all pre-transition scenarios pass.
6. All sessions close; the guardian joins the process group, kills and joins every independently marked descendant, validates the complete 44-row handoff, and verifies the browser list is empty.
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
- Listen lifecycle tests cover unseen `removeTarget` 999, duplicate active target 1, removal followed by permitted reuse, atomic rollback after malformed/unknown/conflicting producer requests, persistence across action windows in one tab, caller-state forgery, recorder-install reset, generation-bound reset after `goto`, `runCode` navigation, click, same-URL reload, and location changes, DOM-only state retention, and huge counts/IDs/offsets/body sizes without throw or unbounded allocation;
- percent-decoding tests cover five and more nested layers, a very deep bounded input, mixed malformed layers, and the explicit benign literal-percent prose rule;
- raw provider samples plus nested client results, action summaries, serialized scenario rows, and validated ledger rows contain no raw run ID, UID, team ID, player ID, target URL, or fixture path in any free-text field, including `pageId`;
- a rendered product regression starts with an unresolved profile, hydrates `league_creator` without changing other redirect dependencies, and requires `/competition`; Parent and School redirects remain unchanged;
- isolation calls the real configured same-origin endpoint and fails if it is not parameter-consuming, if own is not 200, or opposite is not 403;
- direct Firestore probes require the full label/path set and exact 200/403 symmetry;
- fresh unauthenticated and pending-delete rows fail on transient protected activity;
- guardian rejects command nonzero, malformed JSON, `ok:false`, drift, retained/failure counts, incomplete expected-absence coverage, browser close failure, or nonempty post-close browser list;
- guardian preserves the manifest/workspace on uncertain closure and removes them only after certified closure;
- real child fixtures may mutate Promise/Object/Array/Reflect/timers and prototypes without changing the guardian realm; forged `ok`/`closed` output, bounded-output overflow, a hidden simulated browser, a surviving rogue descendant, and a SIGTERM-ignoring late writer all fail closed, with the exact process group joined before browser/fixture cleanup;
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

## Closed scenario-failure diagnostics

A protocol-v4 failure terminal carries one bounded diagnostic tuple in addition to its existing fixed category, stage, and exact ownership snapshot: the canonical plan ordinal, the exact canonical context ID at that ordinal, a closed checkpoint, and that checkpoint's single closed reason. Immediately before each row, the child emits a sanitized `context-start` record with only that next canonical ordinal/ID; the guardian requires exact `0, 1, ...` progression and rejects duplicates, skips, backward movement, or a future-row ownership event under the current context. The child advances the diagnostic tuple before runner initialization, context start, ownership authorization, acquisition, receipt capture, recorder arm, viewport verification, login submission, observation arm, scenario action, terminal wait, observation sampling, window validation, row validation, ownership release, row emission, and private finalization. It never emits raw errors, messages, stacks, URLs, fixture identifiers, browser session names, or provider-controlled text as diagnostic data.

Every row-bound ownership intent/add/attach/release, ownership completion, row, and completion requires an accepted current context; there is no legacy null-context path. The guardian accepts the next context only after every exact session required by the prior non-pending row was accepted and released. The exact pending-deletion active-baseline sessions are the sole transition exception and may remain guardian-owned until their canonical stale-session release after transition.

The guardian accepts a diagnostic only when its ordinal and context ID match the immutable plan for the active phase, its checkpoint/reason/stage combination is exact, and it equals the independently accepted current `context-start` record (apart from runner initialization before ordinal zero begins). Historical released-session membership cannot authorize a stale context. A context-start failure on row N is representable because the guardian accepts the exact next record before acquisition. A candidate remains untrusted until child close/join proves the full protocol stream valid. The terminal certificate persists only the validated tuple and applies the same closed plan and checkpoint validation. Forged, mismatched, extra, stale, out-of-order, or sensitive diagnostic content is `scenario-runner-invalid`, while exact cleanup ownership remains unchanged.

The action-window validator refines its scenario-action boundary without changing any validation predicate or order. Before the existing checks it advances only among fixed `window-schema`, `window-location`, `window-terminal`, `window-loading`, `window-page-error`, `window-console-error`, `window-request-failure`, `window-overflow`, `window-render-coherence`, `window-resource`, and `window-policy` checkpoints, each paired with its single corresponding `*-invalid` reason. The real exported validator accepts the diagnostic sink separately from its closed data options, snapshots the value and options before recording any checkpoint, completes the validation decision with an internal recorder, and only then replays fixed pairs through the external sink while containing reporter exceptions. Callback mutation, throws, or prototype tampering therefore cannot influence the decision, and neither callback state nor raw failure data enters the evidence snapshot. The guardian and terminal certificate accept exactly the same fixed pairs and never persist the rejected value, error, URL, identifier, or signal.

## Sticky process-identity outcome amendment

This amendment begins at exact reviewed HEAD `70398193fba552362c12ec61207e481ac4df2871`. Process-inspection uncertainty is a property of the complete guardian run, not only of helper execution. Every lifecycle-reached rejection of a marked process identity—receipt/session mismatch, missing or duplicate PID, topology, marker, argv, executable, codesign, birth identity, frozen-identity continuity, helper ancestry, or final resnapshot—must irreversibly set the guardian's inspection-uncertain state before the validator returns or throws. A later valid identity, empty scan, or successful kill cannot restore either browser-closure or fixture-closure certification.

Termination has the same monotonic contract. Discovery of any process carrying an owned phase marker, any unsuccessful signal, any wait timeout, any surviving process, any `cleared:false` result, and any retry failure irreversibly makes inspection uncertain. Browser-first recovery and bounded process termination still proceed to minimize live resources, but uncertain runs preserve the exact workspace and manifest and return `browserClosureCertified:false` and `closureCertified:false`; they cannot run fixture cleanup or remove private evidence. A child that remains wholly inside the guardian-owned process group and is joined without an inspector identity rejection retains the existing process-group closure behavior.
