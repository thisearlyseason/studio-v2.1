# Phase 9 Committed Browser Evidence Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the failed ignored Task 7 harness with a committed, testable Playwright CLI evidence subsystem, independently review it, and use it to complete one exact staging lifecycle with certified cleanup.

**Architecture:** Pure scenario/lifecycle contracts define every PASS condition. A thin dependency-injected Playwright CLI client and action-window layer execute browser work, declarative scenarios consume those interfaces, and a Node guardian owns exact hosted lifecycle cleanup. Sanitized evidence is written only from validated results after complete closure.

**Tech Stack:** Node.js 24 ESM, built-in `node:test`, bundled `playwright-cli` wrapper with system Chrome, existing Firebase fixture CLI, GitHub CLI, Markdown evidence.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-9-committed-browser-evidence-runner-design.md`

## Global Constraints

- No new browser dependency or installed browser; use `/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh` and system Chrome.
- No SaaS runtime change except the independently reviewed Task 3 hydration defect: add the missing `userProfile.role` dependency to the existing dashboard settled-role effect. The bounded product regression, evidence subsystem, tests/package entrypoint, approved Phase 9 evidence, and planning/report files are the only permitted scope.
- No production access, no merge, and no broad Firebase deletion.
- No hosted mutation until Tasks 1-5 pass independent review and the exact tracked SHA passes full verification, PR CI, and one staging deployment.
- Every implementation change uses RED/GREEN TDD. Tests must invoke real exported entrypoints; source-regex-only assertions are insufficient.
- Credentials, cookies, bearer values, request bodies, storage state, raw traces, raw target URLs/paths, run IDs, UIDs, team IDs, player IDs, and private workspace paths must never enter client results, action summaries, ledger rows, committed evidence, or test output.
- The exact manifest remains available until cleanup, cleaned inspection, complete independent absence proof, and zero-browser proof all pass.
- Historical aborted attempts remain `INCONCLUSIVE-HARNESS`; retry-4 cleanup remains exact 20/82 → 0/0 closure, not browser evidence.

---

### Task 1: Pure scenario and lifecycle contracts

**Files:**
- Create: `scripts/qa-evidence/phase9/scenario-contracts.mjs`
- Create: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: `VIEWPORTS`, `ROUTE_SCENARIOS`, `ISOLATION_SCENARIOS`, `REQUIRED_LOGOUT_STAGES`, `validateActionWindow()`, `validateRouteResult()`, `validateIsolationResult()`, `validateLogoutStages()`, `validateLifecycleResult()`, `validateLedger()`.
- Consumes later: Tasks 2-5 import only these public contracts; no duplicate PASS logic is permitted elsewhere.

- [ ] **Step 1: Write failing tests for exact definitions and anti-vacuity rules**

Add tests which import the planned exports and require:

```js
assert.deepEqual(VIEWPORTS, {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
});
assert.equal(ROUTE_SCENARIOS['/family'].visibleSentinel, 'Family Overview');
assert.equal(ISOLATION_SCENARIOS.team.endpoint, '/api/teams/chat');
assert.throws(() => validateRouteResult({
  allowed: true,
  expectedPath: '/family',
  expectedSentinel: 'Family Overview',
  window: safeWindow({ finalPath: '/family', visibleSentinels: [] }),
}), /visible sentinel/i);
```

Cover all six route sentinels, final-URL-only rejection, swallowed-loading rejection, denied transient render/request/listener rejection, own/opposite isolation symmetry, all four logout stages, fresh/pending revocation signals, lifecycle `ok:false`, retention/failures, incomplete expected-absence proof, duplicate/missing ledger rows, and wrong arithmetic.

- [ ] **Step 2: Run Task 1 RED**

Run:

```bash
node --test --test-name-pattern='phase 9 evidence contracts' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because `scenario-contracts.mjs` or its exports do not exist.

- [ ] **Step 3: Implement the pure contracts**

Use immutable data definitions. `validateActionWindow()` must require explicit booleans/counts and reject missing fields. `validateRouteResult()` must use both pathname and route sentinel. `validateIsolationResult()` must require own same-origin API 200, opposite API 403, own direct Firestore 200, opposite direct Firestore 403, and zero opposite listener/render. `validateLogoutStages()` must validate every ordered stage independently.

`validateLifecycleResult(kind, value, stage)` must parse command JSON against internally defined canonical stage contracts rather than caller-supplied counts. Preflight and seed require every typed field their current CLI producer emits; inspect and cleanup require `ok:true`; all stages require exact state/counts, zero drift/problems, zero retained/failures, full UID/path/expected-absence probe counts, and zero sessions.

- [ ] **Step 4: Run Task 1 GREEN and fixture regressions**

```bash
node --test --test-name-pattern='phase 9 evidence contracts' tests/phase9-browser-evidence.test.mjs
node --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/qa-evidence/phase9/scenario-contracts.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "test: define phase 9 evidence contracts"
```

---

### Task 2: Playwright CLI client and action windows

**Files:**
- Create: `scripts/qa-evidence/phase9/playwright-cli-client.mjs`
- Create: `scripts/qa-evidence/phase9/signal-window.mjs`
- Modify: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: `createPlaywrightCliClient({ execute, wrapperPath, cwd, env })`, `installSignalRecorder(client, session)`, `observeAction({ client, session, stage, terminal, action })`, `closeAndVerifyBrowsers(client)`.
- Consumes: Task 1 window validators.

- [ ] **Step 1: Write failing real-entrypoint tests**

Use an injected fake `execute(argv)` transport that records order. Require:

```js
const promise = observeAction({
  client,
  session: 'logout',
  stage: 'logout-tab',
  terminal: loginTerminal,
  action: async () => fakePage.emitProtectedRequestThenLogout(),
});
assert.deepEqual(fakeTransport.calls.slice(0, 2), ['mark:logout', 'action:logout']);
assert.equal((await promise).protectedRequests, 1);
```

Also require listeners installed on `about:blank` before the first `goto`, marks isolated by page/tab, local `run-code` compilation, malformed JSON/nonzero/`isError` rejection, no sensitive request bodies in returned data, close-all failure rejection, and nonempty list rejection.

- [ ] **Step 2: Run Task 2 RED**

```bash
node --test --test-name-pattern='phase 9 playwright client|phase 9 action window' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because the client/window modules do not exist.

- [ ] **Step 3: Implement client and action-window layer**

The client is the only module that invokes the wrapper. It must use `execFile`, an argument array, bounded output, timeout, exact JSON parsing, and dependency injection. The signal recorder keeps only fixed target kinds, method, resource type, canonical initiating-frame route, response status, fixed error signature, render path/sentinel, and exhaustive closed parsed-evidence labels with their canonically derived scope set. Raw resource URLs/paths and fixture identifiers are discarded before the public client result. It must not retain headers, request bodies, cookies, tokens, or storage state.

`observeAction()` takes the page-specific mark before calling `action`, awaits the required terminal without swallowing timeout, then samples the same page. There is no public API accepting a caller-created mark.

- [ ] **Step 4: Run Task 2 GREEN and offline Chrome smoke**

```bash
node --test --test-name-pattern='phase 9 playwright client|phase 9 action window' tests/phase9-browser-evidence.test.mjs
node scripts/qa-evidence/phase9/playwright-cli-client.mjs smoke --origin about:blank
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh list --json
```

Expected: tests pass; smoke proves `about:blank` arming and tab-specific action order; final browser list is empty. No network navigation other than `about:blank`.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/qa-evidence/phase9/playwright-cli-client.mjs scripts/qa-evidence/phase9/signal-window.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "feat: add testable browser observation windows"
```

---

### Task 3: Declarative browser scenarios

**Files:**
- Create: `scripts/qa-evidence/phase9/scenarios.mjs`
- Modify: `scripts/qa-evidence/phase9/scenario-contracts.mjs`
- Modify: `scripts/qa-evidence/phase9/playwright-cli-client.mjs`
- Modify: `tests/phase9-browser-evidence.test.mjs`
- Modify: `src/app/(dashboard)/layout.tsx`
- Create: `tests/components/dashboard-layout-routing.test.tsx`

**Interfaces:**
- Produces: `runAdmissionScenario()`, `runRouteScenario()`, `runIsolationScenario()`, `runLogoutScenario()`, `runFreshUnauthenticatedScenario()`, `runPendingDeletionScenario()`, `buildCanonicalScenarioPlan()`.
- Consumes: Tasks 1-2 contracts and `observeAction()` only.

- [ ] **Step 1: Write failing scenario tests against a scripted fake client**

Require the real scenario functions to fail when:

- an allowed route ends at the right path but remains blank/loading or lacks its sentinel;
- a denied route ends correctly after any protected flash/request/listener;
- own/opposite `/api/teams/chat?teamId=` results are not exactly 200/403;
- a scenario attempts `/team?teamId=` as isolation evidence;
- direct Firestore team/player results are incomplete or not exactly 200/403;
- any of the two API or four Firestore isolation windows reports `sessionPresent:false` even when all statuses and the final aggregate otherwise pass;
- a protected request/listener count differs from its complete closed-signal array, a signal uses a legacy raw URL/path/query or arbitrary field, or a public action window exposes the legacy general request-signal container;
- logout activity occurs during the click, reload, back, or second reload;
- a fresh or pending-deletion route transiently restores protected UI/data;
- a context omits required ledger fields or uses a duplicate ID.
- a Parent A, League Creator, or School Admin admission stops at transient or final `Dashboard` instead of its exact settled role landing;
- an exact heading appears on the wrong pathname and a heading-only terminal would complete early;
- Missing Profile observes any protected request or protected listener during login/admission or any denied-route action.
- No Team selects or accesses Team A/Team B/league/foreign resources, or starts a tenant-scoped request/listener for them, during login/admission or any denied-route action; exact self-account/membership, exact same-identity `players where parentId == uid`, and join-page admin lookup activity must pass.
- No Team aggregation omits an earlier typed resource scope, collapses a multiplexed signal to one scalar, accepts an unscoped protected signal, or accepts a caller-supplied scope disconnected from closed parsed evidence.
- nested client results, action summaries, serialized scenario rows, and ledger rows contain none of the literal run ID, UID, team IDs, or player IDs used by the fixture expectation.
- a dashboard first evaluates with an unresolved profile and then hydrates `league_creator`, with every other redirect dependency stable, without redirecting to `/competition`.

Also require the canonical plan to include both viewports and exact aliases/groups from Task 7.

- [ ] **Step 2: Run Task 3 RED**

```bash
node --test --test-name-pattern='phase 9 browser scenarios' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because `scenarios.mjs` does not exist.

- [ ] **Step 3: Implement minimal declarative scenarios**

Every browser action must be wrapped by `observeAction()`. The same-origin isolation request must call the existing parameter-consuming `GET /api/teams/chat?teamId=<encoded-id>` with the authenticated session and record status only. Direct Firestore checks receive exact `{label,path,expectedStatus}` entries from the fixture-derived ID map. Allowed routes wait for the configured exact pathname plus accessible sentinel and reject loading/error boundaries. Denied/revoked routes validate the entire action window.

Each of the six isolation action windows must independently require `sessionPresent:true` before its status can be accepted. Every public action-window validator must require exact scalar/array count coherence and the closed `requireClosedResourceSignal` schema for protected requests and listeners; remove the legacy raw-signal fallback and do not return the general `requestSignals` container or opaque request queries.

Admission and denial waits must use the complete settled `{path, accessible heading}` pair below. A transient `/dashboard` is not a terminal for a role that the product layout routes onward:

| Alias | Settled path | Accessible heading |
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

For `qa-missing-profile`, validate every login/admission and denied-route window with `requireNoProtected`: protected request count and protected listener-start count must both remain zero regardless of attribution.

For `qa-no-team`, configure the Playwright client with the exact fixture run ID and accept only exact staging-project/default-database Firestore document GET, REST runQuery, and WebChannel Listen producer schemas. Require canonical exact-depth document paths, no unaccounted document/runQuery query, fragment, or body material, nonempty exact runQuery bodies, exact project/default-database request headers, and exact producer content-type values. Bind the join lookup and all Firestore activity to the exact canonical staging join frame, staging `Origin`, source-backed `Referer`, and the complete locally characterized browser/SDK header name/value set (including `Accept`); reject foreign provenance, missing required headers, unknown headers, and impossible values. Require an exact installed-SDK WebChannel URL variant (initial forward, established forward, back channel, or termination) with unique known parameters, bound database, version, request identity, and cache buster. Require exact add/remove/control Listen shapes, complete accounting for `count`, `ofs`, contiguous message entries and the closed producer-header block, `resumeToken` xor `readTime`, and `expectedCount` only with either resume form. Keep the active Listen target-ID set private to the client tab/session: add IDs must be unique while active, remove IDs must already be active, and removal permits later reuse. Apply every complete producer request to a draft set and commit additions/removals atomically only when every message, target, and transition is valid; malformed, unknown, duplicate, unseen, or conflicting material must not partially mutate state. Bind state to the trusted recorder's monotonic main-frame navigation generation, reset on recorder installation and every actual navigation/reload/location change through any client entrypoint (including `runCode`, click, and same-URL reload), retain it for DOM-only `runCode`, and never infer navigation by parsing caller code. Bound body length, message count, active targets, target IDs, offsets, and expected counts before allocation or iteration. Emit fail-closed `unscoped` evidence for malformed, hidden, extra, wrong-project, unknown, missing, duplicate/unseen target state, oversized integer/body, or resource-type-downgraded material without recursively trusting nested strings. Parse every valid multiplexed target into closed fixed evidence labels and a canonical set of all derived scopes; malformed evidence cannot erase a valid sibling and a valid sibling cannot erase `unscoped`. Permit only the exact self profile/membership documents, the same-identity `players` query with root parent, one `parentId EQUAL` filter, boolean-false/absent `allDescendants`, and only absent or exact `__name__ ASCENDING` order, the exact bodyless authenticated same-origin `PATCH /api/schools/admins` fetch with no query/fragment/fixture material, non-tenant reference data, and proven transport-control messages. Reject every other filter/order/projection/limit/offset/cursor/descendant shape, a different/multiple parent binding, Team A, Team B, league, other-tenant, foreign-account, or unscoped activity in login and all six denied-route windows. The installed recorder and CLI transport carry only bounded raw URL/method/resource-type/header/body/frame/navigation-generation facts into the private local sample implementation. `createPlaywrightCliClient()` independently derives every target kind/evidence/scope, ignores provider-claimed labels, assigns a closed local page ID, and discards all raw material before returning the closed sanitized action window. Public headings, statuses, and render signals must be exact source-backed enums; unknown text is rejected before return. No raw field may reach `observeAction()`, scenarios, rows, or ledger. Flatten every scope into aggregate validation so an allowed sibling or later clean window cannot hide tenant activity. Exact probe targets remain private in-memory expectations; every public string, action summary, and row must be rejected on a malformed percent escape or credential shape and pass bounded every-layer iterative percent-decoding fixture-identifier leak tests before return. Reaching the fixed decode budget with valid encoded material remaining fails closed; only a literal percent followed by whitespace or end-of-string is benign prose. Tests must cover five-plus and very deep layers, mixed malformed input, transactional request rollback, every navigation entrypoint, same-URL reload, and the DOM-only state-retention control.

Add the exact missing `userProfile?.role` dependency to the existing dashboard settled-role effect. The rendered regression must begin with `userProfile === null`, hydrate `league_creator` while router/path/team/parent/school inputs remain referentially stable, and prove `/competition` is requested. Re-run Parent and School redirect cases to show their existing destinations are unchanged.

Return a row only after the Task 1 validator passes. Never catch a readiness timeout and continue as PASS.

- [ ] **Step 4: Run Task 3 GREEN**

```bash
node --test --test-name-pattern='phase 9 browser scenarios|phase 9 evidence contracts|phase 9 action window' tests/phase9-browser-evidence.test.mjs
node --test tests/phase9-identity-authorization.test.mjs tests/phase8-account-session.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/qa-evidence/phase9/scenarios.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "feat: add phase 9 browser evidence scenarios"
```

---

### Task 4: Exact lifecycle guardian

**Files:**
- Create: `scripts/qa-evidence/phase9/lifecycle-guardian.mjs`
- Modify: `tests/phase9-browser-evidence.test.mjs`
- Create: `tests/fixtures/phase9-lifecycle-child.mjs`
- Create: `tests/fixtures/phase9-lifecycle-child-*.json`

**Interfaces:**
- Produces: `createLifecycleGuardian({ fixtureCommand, browserClient, adapterFactory, filesystem, processHooks, runnerCommand })`, `runGuardedLifecycle(options)`.
- Consumes: Task 1 lifecycle contracts, Task 2 browser closure, existing fixture CLI/lifecycle helpers.
- `runnerCommand` is exact inert data only: a repository-owned absolute entrypoint plus pinned repository-owned config files. No runner callback/factory/handle, injected spawn, or same-process scenario code is accepted.

- [ ] **Step 1: Write failing guardian state-machine tests**

Use real exported guardian entrypoints with injected fixture/browser/filesystem seams. Require exact ordered states:

```text
uninitialized → guarded → preflighted → seeded → inspected → browsers-closed →
preclean-inspected → cleaned → clean-inspected → independently-absent →
credential-removed → workspace-removed → disarmed
```

Test success and failure injection at every boundary. In particular, reject malformed JSON, command nonzero, `ok:false`, drift, retention/failure, incomplete expected-absence proof, browser close failure, nonempty browser list, and credential/workspace removal uncertainty. Require the manifest/workspace to remain available whenever closure is uncertain.

Use actual repository test child entrypoints for the runner boundary. Require bounded closed NDJSON ownership, phase-ordered ledger rows, and completion; exact exit and process-group absence; a collision-free cryptographic child marker; soft termination plus hard-kill escalation; marked-descendant absence; and independent browser inventory. Prove child mutations of Promise/Object/Array/Reflect/timers/prototypes cannot change the guardian; forged closure, hidden browser state, a descendant that starts a new process group/session, interruption during asynchronous startup admission, hang/resume/late-write, malformed/duplicate/reordered/cross-phase rows, malformed messages, and stdio overflow must fail closed. Launch a fresh guardian-import process with `NODE_OPTIONS` and `NODE_PATH` already present and prove both are absent from the runner child.

- [ ] **Step 2: Run Task 4 RED**

```bash
node --test --test-name-pattern='phase 9 lifecycle guardian' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because the guardian does not exist.

- [ ] **Step 3: Implement the guardian state machine**

Register process handlers before mutation. Execute fixture commands through an argument-array adapter and parse their JSON with Task 1 validators. Snapshot and verify the inert runner descriptor into exact immutable UTF-8 source/config bytes, then use only the guardian's fixed internal Node spawn to execute those bytes rather than reopening a verified caller path. The child artifact is self-contained/bundled and may import only trusted Node built-ins. Preserve the module-initialization ADC/runtime environment but strip `NODE_OPTIONS` and `NODE_PATH` so unpinned preload/search paths cannot add child code. Before each asynchronous startup audit, register a cancellable generation and a cryptographically random inherited marker with an empty collision baseline; recheck cancellation immediately before spawn. Bound and validate child stdio, accept exactly the canonical 40/4 row split and 44-row ledger arithmetic, derive closure from exact child exit plus group absence, then independently audit/terminate/join every process carrying the marker before browser or fixture cleanup. Keep cleanup idempotent and exact-manifest-only. Close only reported owned browser sessions and prove an independently returned browser list is empty before cleanup certification. Initialize a separate Firebase adapter for the complete 20 UID/82 path/expected-absence probe. Only certified closure may call credential and workspace removal, prove absence, disarm, and return the frozen sanitized rows.

Errors must be fixed, sanitized categories. Do not include paths, IDs, provider error strings, or credentials.

- [ ] **Step 4: Run Task 4 GREEN and lifecycle safety gates**

```bash
node --test --test-name-pattern='phase 9 lifecycle guardian' tests/phase9-browser-evidence.test.mjs
node --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add scripts/qa-evidence/phase9/lifecycle-guardian.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "feat: add fail-closed phase 9 lifecycle guardian"
```

---

### Task 5: Evidence writer and executable assembly

**Files:**
- Create: `scripts/qa-evidence/phase9/evidence-writer.mjs`
- Create: `scripts/qa-evidence/phase9/child-runner.mjs`
- Create: `scripts/qa-evidence/phase9/cli.mjs`
- Modify: `package.json`
- Modify: `tests/phase9-browser-evidence.test.mjs`
- Modify: `.superpowers/sdd/2026-08-25-phase-9-core-identity-authorization-verification/task-7-report.md`

**Interfaces:**
- Produces: `writePhase9Evidence({ lifecycle, rows, deployment, outputDirectory })`; committed real child-process scenario entrypoint; command `npm run qa:evidence:phase9 -- ...`.
- Consumes: Tasks 1-4 only; CLI contains wiring, not duplicate policy.
- The CLI pins and supplies the real child entrypoint/config descriptor required by Task 4; it cannot restore the removed callback/factory/spawn seam.

- [ ] **Step 1: Write failing evidence and CLI tests**

Require atomic writes of exactly the four approved Markdown files from validated sanitized input. Reject duplicate IDs, incomplete fields/groups/viewports, inconsistent PASS arithmetic, raw cookie/token/password/credential/path material, unsupported origin/project/SHA, and output outside the exact Phase 9 directory.

Require CLI `dry-run` to build and validate the complete scenario plan and guardian configuration without network or mutation. Require hosted mode to demand the explicit staging flag, exact project/confirm-project/origin/deployed SHA/run, external manifest/credential paths, and system-Chrome wrapper.

- [ ] **Step 2: Run Task 5 RED**

```bash
node --test --test-name-pattern='phase 9 evidence writer|phase 9 evidence CLI' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because writer/CLI do not exist.

- [ ] **Step 3: Implement writer and CLI wiring**

Writer uses same-directory temporary files, mode 0600 while private, atomic rename, then approved repository file modes. It consumes sanitized validated values only. The CLI wires dependencies and exposes `dry-run`, `offline-smoke`, and `hosted` commands. `dry-run` and `offline-smoke` must never construct the Firebase adapter or navigate to staging.

Update the ignored Task 7 report to name the committed replacement and preserve historical attempt semantics.

- [ ] **Step 4: Run Task 5 GREEN and full local verification**

```bash
node --test tests/phase9-browser-evidence.test.mjs
npm run qa:evidence:phase9 -- dry-run
npm run qa:evidence:phase9 -- offline-smoke
/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh list --json
npm run verify
git diff --check
```

Expected: all tests/builds pass and browser list is empty.

- [ ] **Step 5: Run hygiene and scope scans**

Run repository hygiene tests plus added-line scans for cookies, bearer values, passwords, credential artifacts, storage state, broad Firebase deletion, production identifiers, and unexpected files. Require zero matches outside explicit harmless source/test literals.

- [ ] **Step 6: Commit Task 5**

```bash
git add package.json scripts/qa-evidence/phase9 tests/phase9-browser-evidence.test.mjs
git commit -m "feat: add committed phase 9 evidence runner"
```

- [x] **Final Darwin process-audit/runtime amendment**

Write strict RED coverage for raw Darwin argv boundaries, two process births within one second, exited/unmarked/replacement rejection, oversized and concurrently changed executables, explicit hash cancellation, a child that hangs without a terminal signal, and the generated production client's `90,000ms` command timeout. Replace `ps`/`lsof` command-text identity with a captured and pinned self-contained `ctypes` inspector using `KERN_PROCARGS2`, `proc_pidinfo`, and `proc_pidpath`; require an unchanged before/after precise BSD identity and exact marker membership, return bounded closed JSON, and validate the raw argv array without tokenization. Admit the inspector through both a literal source SHA/runtime SHA and the exact deployed Git blob.

Hash executables only through one held `O_NOFOLLOW` descriptor with pre-read maximum-size enforcement, bounded streaming chunks, finite deadline/cancellation, and exact post-read metadata equality. Set separate phase-completion maxima of `45m` before transition and `15m` after transition, with deadline expiry entering owned-child termination/join and browser-first recovery. Route production child construction through the fixed `90,000ms` client factory, rebuild the transport/child/config deterministically twice, update every literal pin, then run focused Darwin/runtime tests, real retained-browser attribution, the complete Phase 9 suite, fixture/hygiene suites, `npm run verify`, dry-run, stripped-PATH offline smoke, syntax/diff/secret scans, and zero browser/process/workspace/materialization audits. Do not navigate or mutate hosted/staging/product state during this amendment.

Follow-up review hardening keeps legal empty argv fields, converts exact-marker parse failures into fixed termination-only records, fails the audit on inspector-fatal status, and caps marked raw bytes, record count, and serialized output before aggregate assembly. It removes every marker-name/value occurrence from public argv data. The held-descriptor hashing deadline now races each stream read including EOF, the final `fstat`/hash result, and close; a delayed final read is cancelled and cannot be accepted. Strict RED/GREEN coverage includes explicit/all-PID empty argv inspection, malformed marked-child termination without certification, cheap aggregate-limit rejection, public marker non-disclosure, and delayed EOF rejection.

The final inspector/profile amendment parses only the XNU pointer-width alignment padding identified by `PROC_FLAG_LP64`, treats a real empty `argv0` as a termination-only marked error, preserves later empty arguments, removes the exact true marker argument without mapping attacker literals to trusted syntax, and fails closed with a fixed error for unsafe executable paths. Inspection uncertainty remains sticky through termination and later empty scans. Every runner/transport/Chrome descendant receives the exact mode-`0700` workspace-local `playwright-tmp` as `TMPDIR`; Chrome profile paths must be immediate children, browsers/processes close before profile audit/removal, and a before/after global producer-prefix inventory must remain identical. Test the real empty-`argv0` kill path, injective marker representation, unsafe path non-disclosure, sticky termination uncertainty, exact offline disposable-root cleanup, and rejection of any new global producer profile; rebuild and repin helper/client/child bytes and move only the three exact reviewed stale profiles to Trash after exact ownership/type/mode/inactivity checks.

The reviewed stale-profile remediation validated each source as an inactive, non-symlink directory owned by the current user with mode `0700`, then moved it recoverably (without broad deletion): `playwright_chromiumdev_profile-W5fasd` to `~/.Trash/phase9-review-playwright_chromiumdev_profile-W5fasd-20260827`, `playwright_chromiumdev_profile-fvFCIg` to `~/.Trash/phase9-review-playwright_chromiumdev_profile-fvFCIg-20260827`, and `playwright_chromiumdev_profile-tgVgm5` to `~/.Trash/phase9-review-playwright_chromiumdev_profile-tgVgm5-20260827`. All three original paths were beneath `/var/folders/7n/gzq9wl6n4m963yjtw8gxx9xh0000gq/T/`; the post-move audit verified the original paths absent and the destination inode/type/mode unchanged.

The final sticky-state closure amendment routes every producer-profile inventory and every inspector/audit/enrichment/termination validation through one guardian-owned irreversible uncertainty boundary. A transient failure followed by a clean retry remains uncertified, keeps browser and lifecycle closure flags false, and preserves the exact workspace/manifest state; profile-root state is cleared only after both exact removal and a successful post-removal global inventory. Intentional guardian cancellation remains separately classified as interruption.

The final sticky identity-outcome amendment at exact parent `70398193fba552362c12ec61207e481ac4df2871` adds strict REDs for retained-browser receipt/topology/executable rejection and for bounded Darwin termination returning `cleared:false` before a clean retry. Route every lifecycle-reached false/null/mismatch identity result through a centralized irreversible inspection boundary, including browser-session/receipt equality, missing or duplicate PIDs, topology, argv, marker, executable/codesign, helper ancestry, birth identity, frozen continuity, and final resnapshot. Discovery of a marked process, an unsuccessful signal, a wait timeout, a survivor, `cleared:false`, or retry failure must set the same sticky state. Recovery remains browser-first and bounded but must return both closure flags false, preserve the exact workspace/manifest, and skip fixture cleanup. Run focused RED/GREEN, lifecycle and real-browser attribution groups, the complete Phase 9 suite, repository verification, deterministic dry-run, offline smoke, pin checks, and final zero-resource audits; then update the ignored progress ledger and Task 5 report with the complete commit chain and fresh counts. Do not navigate or mutate hosted state, push, deploy, or merge.

The definitive ownership amendment at exact parent `191ff1cc623581d3c415c3158898cecf871e5704` makes browser-inventory execution, parsing, schema, and type rejection enter the same irreversible inspection-uncertain state before recovery can retry. The follow-up at exact parent `76661a8554a30345134b7facd7414c6bf9b10f1a` closes the remaining acquisition gap with pinned protocol version 4: every new browser emits `ownership-intent`, waits for the guardian's exact `ownership-authorized` acknowledgement, and only then performs local `open about:blank`; the matching receipt-bearing `ownership-add` still precedes recorder, viewport, login, navigation, and scenario work. The guardian therefore owns the exact session before real acquisition can create a browser. Retained attachment emits `ownership-attach` before attachment action and binds the frozen receipt; bounded provisional release remains recoverable until exact inventory/process absence. Require version-2 rows only, with a nonempty session list exactly derived from each canonical row contract and present in acquisition/attachment history; reject v1, empty, alternate, duplicate, mutated, gapped, or out-of-order ownership and row records. Any reached nonempty or mismatched browser inventory is irreversible uncertainty, even if recovery later observes empty, and therefore preserves the workspace/manifest without fixture cleanup. Add real acquisition/audit-window crash recovery, first/late reservation crashes, transient nonempty-then-clean inventory, malformed ownership, exact row-session derivation, and exact `/tmp/phase9-core-identities.test` final removal regressions. Test cleanup may remove that one literal root only after browsers and marked processes close and exact non-symlink directory, mode `0700`, current ownership, and confinement checks succeed. Rebuild and repin deterministic child/config artifacts, run all local gates, update the ignored report/progress chain, and do not perform hosted navigation or mutation, push, deploy, or merge.

The lifecycle-scale amendment at exact parent `d15af346e8cb1fceb7f967e88ae4ae7e743135fa` uses protocol-v4 `ownership-release` after every passing row. The child must close the row's exact browser session set, prove exact remaining inventory and the frozen daemon/main PIDs absent, and emit release before starting the next row. Logout releases both sessions. Only the two pending-deletion active-baseline sessions survive the pre-transition boundary; post-transition stale attachments and fresh-login sessions close/release after use, producing exact final zero. Released sessions remain immutable acquisition/attachment history for row ownership while the guardian keeps them provisionally recovery-owned until its independent boundary succeeds. Any failed or uncertain release blocks certification and remains recoverable. Add an assembled canonical-plan bound, real retained attachment/release, released-but-live recovery, exact row-history, and final-zero regressions; rebuild and repin deterministic artifacts and run all local gates. No hosted navigation or mutation, push, deploy, or merge is allowed during this fix round.

The durable terminal-certificate amendment at exact parent `b2bd7ff809d715d615373198108b976f3d76a127` adds a mandatory operator-supplied `--result` path whose private mode-`0700` parent is external to the repository, lifecycle workspace, and evidence tree. Add strict RED tests that discard stdout/stderr after a complete synthetic lifecycle yet retain a bounded sanitized terminal certificate; inject checkpoint failure before removal and require the manifest/credential/workspace remain recovery-owned; inject final promotion failure and require the exact prior `closure-pending` checkpoint remain without any false terminal certification. Add crash-after-checkpoint resume, existing-result rejection, symlink, parent/path swap, permission, oversize, noncanonical, identifier/secret, and repository-hygiene cases.

Create a focused descriptor-bound terminal certificate writer. It accepts only closed sanitized guardian stage summaries and deployment linkage, holds and revalidates the result parent descriptor, exclusively creates a same-directory mode-`0600` transaction file, writes bounded canonical JSON, syncs, atomically promotes, syncs the parent, and verifies the final bytes. The guardian must persist `closure-pending` only after exact cleanup, clean inspect, independent absence, and browser/process/profile closure but before credential/workspace removal; it cannot remove recovery state if that checkpoint fails. After proving credential/workspace absence it promotes the exact terminal outcome. The outer CLI captures ledger/evidence failures as fixed terminal categories and treats console output as secondary. Update hosted help/operator invocation with the exact external result path, rebuild and repin every affected deterministic artifact twice, then run focused certificate/guardian/CLI RED-GREEN, full Phase 9, fixture/hygiene, `npm run verify`, dry-run, stripped offline smoke, syntax/diff/secret scans, and zero managed resources. Do not make any staging/provider call, hosted navigation, push, deployment, or merge during this amendment.

The terminal-certificate review correction at exact parent `4ec77234f5d81c0fd1eaff74aefe492f92673bea` adds strict REDs for `/tmp` versus `/private/tmp` workspace confinement, relative raw `--result`, forged/null closure summaries, a checkpoint target swapped only after validation, and a fixed recovery companion swapped before promotion/rollback. Compare only canonical real repository/workspace/evidence/result-parent paths while retaining component/no-follow and descriptor identity checks. Require every literal `20/3`, `20/82`, cleanup-zero, independent `20/82/1`, closure, history, and removal fact before either checkpoint or completion can certify. Replace existing-checkpoint `replace` with held-identity conditional promotion: detach to the one recognized recovery companion, validate immediately before publication and rollback, publish only through a no-clobber link, preserve foreign bytes and a fresh-writer-resumable checkpoint on collision, and never emit false completion or attacker bytes. Re-pin the helper and rerun focused RED/GREEN, full Phase 9, fixture/identity/hygiene, repository verification, deterministic builds, dry/offline gates, and exact resource scans without any hosted/provider call, push, deploy, or merge.

The final terminal-certificate acceptance correction at exact parent `3f8222edc5a887e44cf2a50f8c385321d8e6dfc9` adds a deterministic byte-identical symlink swap at the post-helper result-read boundary. Extend the helper's closed success response with the committed device/inode/owner/mode/link/size/hash receipt. For both `closure-pending` and `complete`, open the result with `O_NOFOLLOW` through the captured filesystem seam, require exact receipt metadata on the held regular-file descriptor, read at most the receipted size plus one byte through that descriptor, re-fstat after reading, validate exact canonical content, revalidate the held parent, and re-lstat the named entry plus final held descriptor immediately before accepting. Exercise pre-open, during-read, and post-read swaps for both states and reject every error with the fixed terminal-certificate failure surface. Re-pin the helper and rerun all local gates without hosted/provider calls, push, deployment, or merge.

The terminal-certificate CI portability correction at exact parent `580aea5e4706a161ef0145b1611177cff637db31` preserves the exact Darwin helper/runtime pins and adds an early fixed non-Darwin rejection before filesystem access. Move only genuine pinned-helper/filesystem transaction tests into the explicit Darwin-only inventory. Keep certificate schema and exact closure-fact rejection, raw relative-path admission, canonical result confinement, non-Darwin fail-closed behavior, guardian checkpoint/failure behavior, and inventory anti-vacuity portable. Derive the Darwin `/tmp` alias from `realpath('/tmp')` only inside the Darwin integration and add a portable real-symlink confinement test using the production-shared predicate. Run simulated-Linux `npm test` with exact skip accounting and zero descendants, then native focused/full Phase 9, full repository verification, fixture/hygiene, deterministic builds, dry/offline smoke, and final resource scans without hosted/provider calls, push, deployment, or merge.

The closed failure-diagnostic amendment at exact parent `546ab74075c814a993896fc0148ba1d6207e5e91` follows a hosted `scenario-failed` / `scenario-action` terminal at row count zero whose old attribution could identify only the first canonical pre-transition row, not the failing action boundary. Extend protocol-v4 failure terminals with the canonical context ordinal/ID and a fixed checkpoint/reason pair. Emit one sanitized `context-start` before each row and require exact canonical ordinal/ID progression from zero; bind all later ownership and failure attribution to that current record so duplicates, skips, backward movement, future-row ownership, and historical released ownership fail closed. Advance the checkpoint before every initialization, ownership, acquisition, receipt, recorder, viewport, login, observation, action, wait, sample, validation, release, row-emission, and finalization boundary. Persist only a guardian-validated tuple in the terminal certificate, retain candidate semantics until protocol-close validation, and keep cleanup ownership exact. Add strict RED/GREEN for every closed checkpoint, terminal-certificate propagation, a later-row pre-ownership context-start failure, valid-but-stale/prior/future diagnostics, duplicate/skip/backward progress, malformed tuples, post-terminal protocol invalidation, and zero sensitive output; rebuild and re-pin deterministic artifacts and run local gates only. Do not call providers, navigate hosted state, push, deploy, merge, or touch retained recovery artifacts during this amendment.

The strict context-lifecycle correction makes `context-start` mandatory before every row-bound ownership intent/add/attach/release, ownership completion, row, and completion path. A next context is accepted only after the prior non-pending row's exact sessions were accepted and released; only the reviewed pending-deletion active-baseline sessions may remain active across their transition boundary. Omitted starts, premature advancement, and a nominal complete 44-row stream without canonical starts fail closed.

---

### Task 6: Independent review, exact staging execution, and Task 7 evidence closure

**Files:**
- Modify: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/00-environment.md`
- Modify: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/01-fixture-lifecycle.md`
- Modify: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/03-browser-ledger.md`
- Modify: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/04-cleanup.md`
- Modify: `.superpowers/sdd/2026-08-25-phase-9-core-identity-authorization-verification/task-7-report.md`

**Interfaces:**
- Consumes: independently reviewed exact Tasks 1-5 head and committed hosted CLI.
- Produces: complete sanitized Task 7 browser ledger and exact cleanup proof; returns control to the original Phase 9 plan at Task 8.

- [ ] **Step 1: Run final pre-hosted review package and independent review**

Create a review package from `57d9e128` through the exact Task 5 head. Reviewer must inspect contracts, real action ordering, route sentinels, actual isolation consumer, guardian state machine, cleanup/absence/browser closure, secret handling, evidence writer, offline smoke, and full verification. Any Critical/Important/Minor finding blocks hosted execution and follows the SDD fix-round process.

- [ ] **Step 2: Push the exact reviewed head and wait for PR CI**

Update existing PR #41 only. Require exact base `agent/phase8-confirmed-defect-repair`, exact Phase 9 head, OPEN/unmerged state, and all checks green. Do not merge.

- [ ] **Step 3: Deploy exactly once to staging**

Dispatch one staging workflow for the exact reviewed application SHA. Require workflow success, exact SHA, and every staging deploy/health step green. Stop for protected-environment approval if required. Do not dispatch production.

- [ ] **Step 4: Execute one guarded hosted lifecycle**

Run the committed CLI in hosted mode with the exact staging project, confirmation, canonical origin, deployed SHA/run, and one fresh external mode-0700 workspace. Require preflight, v3 seed/inspect 20/82 zero drift, every canonical browser row at both viewports, pending-delete transition/denial, zero unexplained errors, verified zero browser sessions, exact inspect-cleanup-inspect, complete independent 0/0 including expected absence, credential removal, workspace removal, and guardian disarm.

On a stable product mismatch, stop at the safe boundary and follow the original defect gate. On a harness failure, do not patch privately; the committed runner and test must receive RED/GREEN review before another hosted attempt.

- [ ] **Step 5: Sanitize, verify, and commit evidence only**

Run the committed writer and repository hygiene scans. Retain only approved Markdown. Commit:

```bash
git add docs/qa/production-audit/runs/2026-08-25-phase9-core-identities
git commit -m "docs: complete phase 9 identity evidence"
```

Do not deploy this evidence-only commit.

- [ ] **Step 6: Independent Task 7 evidence review**

Require exact deployment linkage, complete row schema/arithmetic, all closure-critical observations, cleanup 20/82 → 0/0, separate complete absence proof, zero credentials/workspaces/sessions, no secret artifacts, no production, and no merge. Only a clean review marks original Phase 9 Task 7 complete and advances to Task 8.
