# Phase 9 Request-Failure Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve a closed, sanitized cause summary for every unexpected browser request failure so a fail-closed hosted row can be diagnosed without retaining URLs, identifiers, or raw errors.

**Architecture:** Classification happens once at the Playwright `requestfailed` boundary, before raw browser values can enter public evidence. The action-window contract validates exact count/signal coherence and still rejects every nonzero failure count. Only the first closed summary plus single/multiple multiplicity crosses the child/guardian/certificate failure protocol.

**Tech Stack:** Node.js ESM, `@playwright/cli` captured transport, `node:test`, deterministic esbuild child generation, GitHub Actions release gates.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-9-committed-browser-evidence-runner-design.md` (`Closed request-failure attribution`)

## Global Constraints

- Every unexpected request failure remains a failing action-window condition; this work adds attribution only.
- Never persist a URL, origin, query, request body/header, fixture ID, browser/session name, raw failure code/text, stack, or provider-controlled value.
- Public failure classes are exactly `aborted`, `timeout`, `name-resolution`, `connection`, `tls`, `policy-blocked`, and `other`.
- Public target classes are exactly `document`, `public-api`, `protected-api`, `firestore`, `identity`, `static`, and `other`.
- Public navigation relationships are exactly `current-document`, `prior-document`, `subresource`, and `unknown`; multiplicity is exactly `single` or `multiple`.
- Child, guardian, and terminal-certificate schemas must remain exact and symmetric.
- No hosted/provider call, staging navigation, push, deployment, merge, or production action is allowed during implementation.
- Preserve the failed certificate and all retained recovery artifacts unchanged.

---

### Task 1: Classify request failures at the recorder boundary

**Files:**
- Modify: `scripts/qa-evidence/phase9/playwright-cli-client.mjs`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: `classifyRequestFailureSignal(input)` returning `{ failureClass, targetClass, resourceType, navigationRelationship }` with closed enum values only.
- Produces: sanitized action-window field `unexpectedRequestFailureSignals`, a dense array whose length equals `unexpectedRequestFailures`; each returned element also has derived `multiplicity`.
- Consumes: existing staging-origin, resource-target, generation, bounded-history, and fixture-leak helpers in `playwright-cli-client.mjs`.

- [ ] **Step 1: Add the real-collision failing regression**

Add a real system-Chrome test that arms the production recorder on `about:blank`, intercepts one request as `aborted`, repeats with a timeout-class failure, and asserts that the current count-only output cannot distinguish them. Then strengthen the expected API so the test requires distinct closed summaries:

```js
assert.deepEqual(aborted.unexpectedRequestFailureSignals, [{
  failureClass: 'aborted', targetClass: 'other', resourceType: 'fetch',
  navigationRelationship: 'subresource', multiplicity: 'single',
}]);
assert.deepEqual(timedOut.unexpectedRequestFailureSignals, [{
  failureClass: 'timeout', targetClass: 'other', resourceType: 'fetch',
  navigationRelationship: 'subresource', multiplicity: 'single',
}]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern='classifies real request failures' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because `unexpectedRequestFailureSignals` is absent and both causes expose only `unexpectedRequestFailures: 1`.

- [ ] **Step 3: Add closed classifier unit cases before implementation**

Add table-driven assertions for all public enums, exact target classification, main-navigation generation relationships, unknown values mapping to `other`/`unknown`, and two failures deriving `multiplicity: 'multiple'`. Add negative assertions that serialized results contain none of the supplied URL, query, fixture ID, raw Chromium error string, or browser-session label.

- [ ] **Step 4: Implement minimal boundary classification**

Capture request metadata in a recorder-private `WeakMap` at the `request` event. At `requestfailed`, immediately classify and store only the closed record:

```js
page.on('requestfailed', request => {
  boundedPush(state, 'requestFailureSignals', classifyRequestFailureSignal({
    failureText: request.failure()?.errorText,
    url: request.url(),
    resourceType: request.resourceType(),
    isNavigationRequest: request.isNavigationRequest(),
    isMainFrame: request.frame() === page.mainFrame(),
    startGeneration: requestMetadata.get(request)?.navigationGeneration,
    currentGeneration: state.navigationGeneration,
  }));
});
```

The classifier may inspect raw input synchronously but returns only closed values. `sanitizeWindow` must validate that recorder entries already use the closed schema, derive one multiplicity value from exact array length, and output both exact count and copied dense signals. Clear the private signal array at every mark.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='request failure|signal recorder|signal window' tests/phase9-browser-evidence.test.mjs
```

Expected: PASS with the real Chrome collision now producing two distinct closed summaries and final browser inventory empty.

- [ ] **Step 6: Commit Task 1**

```bash
git add scripts/qa-evidence/phase9/playwright-cli-client.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "feat: classify phase 9 request failures"
```

---

### Task 2: Bind failure summaries to action-window validation

**Files:**
- Modify: `scripts/qa-evidence/phase9/scenario-contracts.mjs`
- Modify: `scripts/qa-evidence/phase9/scenarios.mjs`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Consumes: Task 1 field `unexpectedRequestFailureSignals` and its closed record schema.
- Produces: `validateActionWindow(..., diagnostic)` calls `diagnostic('window-request-failure', 'request-failure-invalid', requestFailure)` only for an authenticated nonzero failure summary.
- Produces: aggregated multi-window signals with multiplicity recalculated from the complete aggregate count.

- [ ] **Step 1: Write count/schema/coherence RED tests**

Extend the canonical safe window with `unexpectedRequestFailureSignals: []`. Add strict failures for a count/length mismatch, wrong multiplicity, extra/missing keys, out-of-enum values, sparse arrays, accessors, proxies, raw URLs/error text, and more than the existing bounded signal limit. Assert that malformed inputs never reach the external diagnostic callback.

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```bash
node --test --test-name-pattern='request failure contract|request failure diagnostic' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because `ACTION_WINDOW_KEYS` and the validator do not know the new field or diagnostic detail.

- [ ] **Step 3: Implement exact action-window validation**

Add `unexpectedRequestFailureSignals` to `ACTION_WINDOW_KEYS` and validate each element with an exact own-data schema:

```js
{
  failureClass, targetClass, resourceType,
  navigationRelationship, multiplicity,
}
```

Require dense-array length to equal `unexpectedRequestFailures`; require `[]` exactly when the count is zero; require every element's multiplicity to equal `single` for count one and `multiple` otherwise. Snapshot caller data before any external callback, record the validated first summary internally, and replay it only after the validation decision is fixed. Reporter mutation, throws, or intrinsic tampering must not affect the result.

- [ ] **Step 4: Implement aggregation coherence**

In `aggregateWindows`, concatenate copied failure signals, compute the total, and rewrite each copied signal's multiplicity from that total. Preserve only closed fields:

```js
const failureSignals = windows.flatMap(window =>
  window.unexpectedRequestFailureSignals.map(({ multiplicity: _ignored, ...signal }) => signal));
const multiplicity = failureSignals.length === 1 ? 'single' : 'multiple';
```

Include the dense rebuilt array in scenario rows only through the validated action window; do not add raw values to the ledger.

- [ ] **Step 5: Run focused and scenario tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='request failure|action window|admission|isolation|logout|pending-deletion' tests/phase9-browser-evidence.test.mjs
```

Expected: PASS, including callback noninterference, multi-window aggregation, and unchanged zero-failure scenario behavior.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/qa-evidence/phase9/scenario-contracts.mjs scripts/qa-evidence/phase9/scenarios.mjs tests/phase9-browser-evidence.test.mjs
git commit -m "fix: bind request failures to action windows"
```

---

### Task 3: Propagate the closed summary through guardian and certificate

**Files:**
- Modify: `scripts/qa-evidence/phase9/child-runner-source.mjs`
- Modify: `scripts/qa-evidence/phase9/lifecycle-guardian.mjs`
- Modify: `scripts/qa-evidence/phase9/terminal-certificate-writer.mjs`
- Modify: `scripts/qa-evidence/phase9/runner-config.mjs`
- Regenerate: `scripts/qa-evidence/phase9/child-runner.mjs`
- Modify: `docs/superpowers/plans/2026-08-25-phase-9-committed-browser-evidence-runner.md`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Consumes: Task 2 diagnostic callback third argument `requestFailure`.
- Produces: optional terminal `requestFailure` exact object, permitted only with `checkpoint: 'window-request-failure'`, `reason: 'request-failure-invalid'`, and `stage: 'scenario-action'`.
- Produces: terminal certificate diagnostic with the identical optional object and no other new fields.

- [ ] **Step 1: Write protocol and certificate RED tests**

Add a canonical request-failure terminal and assert exact child → guardian → certificate preservation. Add rejection cases for detail on another checkpoint, missing detail on a classified request failure, extra keys, every invalid enum, wrong multiplicity, raw URL/error/fixture/session strings, graph anomalies, stale diagnostics, and child output following the terminal. Assert the existing zero-failure and non-request failure terminals contain no `requestFailure` key.

- [ ] **Step 2: Run focused protocol tests and verify RED**

Run:

```bash
node --test --test-name-pattern='request failure protocol|request failure certificate|diagnostic forgery' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because the protocol and certificate currently permit only `{ checkpoint, contextId, contextOrdinal, reason }`.

- [ ] **Step 3: Implement child terminal propagation**

Extend `setDiagnostic(checkpoint, reason, requestFailure)` to copy a previously validated closed record, clear it whenever the checkpoint changes, and include `requestFailure` only on the exact request-failure terminal. Do not inspect or serialize rejected/raw values in the child failure handler.

- [ ] **Step 4: Implement guardian validation**

At the full `acceptLine` boundary, validate the optional object with exact own enumerable data keys and closed enums before accepting failure attribution. Bind its presence to the request-failure checkpoint/reason/stage and include it in the frozen candidate diagnostic only after the full child stream closes cleanly. Any malformed, stale, extra, or sensitive value remains `scenario-runner-invalid` and cannot replace cleanup ownership.

- [ ] **Step 5: Implement terminal-certificate validation**

Allow the same optional object only inside `diagnostic`, validate exact keys/enums/multiplicity, include it in canonical JSON, and preserve it across `closure-pending`, failed promotion, replay, and failed-status certificates. Keep all size, identifier, credential, and percent-decoding scans active.

- [ ] **Step 6: Rebuild deterministic artifacts twice and update literal pins**

Run `node scripts/qa-evidence/phase9/build-child-runner.mjs` from the exact Task 2 commit, save the generated child bytes and SHA-256, restore that exact Task 2 commit, run the same builder again, and compare both byte streams. Update `child-runner.mjs` and the exact `child`, `childSource`, `playwrightClient`, `scenarioContracts`, and `scenarios` literals in `runner-config.mjs` only after the two builds are byte-identical. Expected: identical child bytes, size below the committed maximum, and all source/config/pin assertions passing.

- [ ] **Step 7: Run focused protocol tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern='request failure|failure terminal|terminal certificate|diagnostic forgery|child runner' tests/phase9-browser-evidence.test.mjs
```

Expected: PASS with exact schema symmetry and no sensitive strings in emitted protocol or certificate JSON.

- [ ] **Step 8: Run all completion gates**

Run, from a clean resource boundary:

```bash
node --test tests/phase9-browser-evidence.test.mjs
node --test tests/qa-fixture-safety.test.mjs tests/phase9-identity-authorization.test.mjs tests/repository-hygiene.test.mjs
npm run verify
npm run qa:evidence:phase9 -- dry-run
env -i HOME="$HOME" PATH="/usr/bin:/bin:/usr/sbin:/sbin" \
  npm_config_offline=true NO_UPDATE_NOTIFIER=1 \
  /usr/local/bin/node scripts/qa-evidence/phase9/cli.mjs offline-smoke
git diff --check
git status --short
```

Run the existing deterministic build/pin assertions within the Phase 9 suite, then use the committed CLI browser-list operation and exact Phase 9 pathname/marker scans to prove no owned browser, marked child, profile, or transport materialization remains. Expected: all tests/builds pass; dry-run remains exactly `44 = 40 + 4`; offline smoke reports zero browser/network/provider activity; managed resource inventory is zero apart from explicitly retained historical recovery artifacts.

- [ ] **Step 9: Record evidence and commit Task 3**

Append the exact RED/GREEN commands, counts, artifact hashes, resource inventory, and the failed hosted certificate reference to the existing Phase 9 progress plan without copying private paths or sensitive data.

```bash
git add scripts/qa-evidence/phase9/child-runner-source.mjs \
  scripts/qa-evidence/phase9/child-runner.mjs \
  scripts/qa-evidence/phase9/lifecycle-guardian.mjs \
  scripts/qa-evidence/phase9/terminal-certificate-writer.mjs \
  scripts/qa-evidence/phase9/runner-config.mjs \
  tests/phase9-browser-evidence.test.mjs \
  docs/superpowers/plans/2026-08-25-phase-9-committed-browser-evidence-runner.md
git commit -m "fix: preserve closed request failure attribution"
```

- [ ] **Step 10: Independent review boundary**

Request an exact-commit review covering classifier semantics, browser-event timing, raw-data non-disclosure, action-window coherence, protocol/certificate symmetry, deterministic pins, and all completion gates. Do not push or authorize another hosted attempt until the review reports zero Critical and zero Important findings.
