# Phase 9 Compressed Child Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve exact hosted join-admin rejection attribution while keeping the self-contained Phase 9 child below its unchanged 131,072-byte admission cap.

**Architecture:** The recorder derives one numeric internal rejection code from bounded raw join-admin facts; the scenario boundary maps it to a readable closed diagnostic reason that the guardian and terminal certificate already validate. The deterministic builder separately compiles and audits the recovered child module, replaces bundled `import.meta.url` with a generated-only entry-URL binding, then embeds a deterministic gzip member in a minimal `node:zlib` wrapper that imports the recovered module from memory.

**Tech Stack:** Node.js 24 ESM, esbuild, Acorn, built-in `node:zlib`, Node test runner, Playwright CLI/System Chrome.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-9-committed-browser-evidence-runner-design.md`

## Global Constraints

- Keep the final child entrypoint at or below exactly `131,072` bytes.
- The wrapper may statically import only `node:zlib`; the recovered module may statically import only `node:` built-ins.
- No generated or runtime pathname may be created, reopened, or executed.
- No raw URL, header, cookie, token, fixture identifier, provider value, or error text may enter the diagnostic or terminal certificate.
- The recovered module and wrapper must each be deterministic across two independent builds.
- Existing fixture, browser ownership, cleanup, terminal certificate, 44-row plan, and evidence acceptance behavior must remain unchanged.
- No hosted retry occurs before full verification, independent review, release gates, and a successful exact-SHA staging deployment.

---

### Task 1: Closed join-admin rejection attribution

**Files:**
- Modify: `scripts/qa-evidence/phase9/playwright-cli-client.mjs`
- Modify: `scripts/qa-evidence/phase9/scenario-contracts.mjs`
- Modify: `scripts/qa-evidence/phase9/lifecycle-guardian.mjs`
- Modify: `scripts/qa-evidence/phase9/terminal-certificate-writer.mjs`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: internal resource signal field `scopeRejection: 0|1|2|3|4|5|6|7|8|9` only for an unscoped `staging-join-admin-api` request.
- Produces: terminal diagnostic checkpoint `window-no-team-join-admin` with reason `url|method|resource-type|body|frame|header-schema|authorization|cookie|identifier|recorder`.

- [x] **Step 1: Write classifier and propagation RED tests**

Add literal cases that mutate exactly one raw request field and require codes `0..8`; add a null bounded-header capture requiring code `9`; add a No Team admission window requiring diagnostic `['window-no-team-join-admin', 'cookie']`; add all ten pairs to guardian/certificate symmetry fixtures.

- [x] **Step 2: Run the RED tests**

Run:

```bash
node --test --test-name-pattern='join-admin lookup reports a closed rejection cause|attributes incomplete join-admin capture|browser scenarios allow No Team|protocol-v4 failure terminal|terminal checkpoint validator' tests/phase9-browser-evidence.test.mjs
```

Expected: classifier lacks `scopeRejection`, action-window schema rejects the field, and guardian rejects the new checkpoint.

- [x] **Step 3: Implement minimal closed propagation**

In the client, derive only the numeric code after exact URL/method/resource/body/frame/header/auth/cookie/identifier checks; code `9` represents incomplete bounded recorder material. In scenario contracts, require the field if and only if target kind is join-admin and evidence is unscoped, validate integer range `0..9`, map through:

```js
'url|method|resource-type|body|frame|header-schema|authorization|cookie|identifier|recorder'.split('|')
```

Emit only the mapped reason at `window-no-team-join-admin`. Add the identical checkpoint/reason set and `scenario-action` stage to guardian and terminal certificate schemas.

- [x] **Step 4: Run focused GREEN plus real Chrome**

Run the Step 2 command, then:

```bash
node --test --test-name-pattern='join-admin lookup accepts the exact real Chrome PATCH producer' tests/phase9-browser-evidence.test.mjs
```

Expected: all focused cases pass; real Chrome distinguishes the exact valid PATCH from a PATCH carrying one unapproved header without exposing values.

### Task 2: Deterministic recovered-module compiler

**Files:**
- Modify: `scripts/qa-evidence/phase9/build-child-runner.mjs`
- Test: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: `compileRecoveredChild(): Promise<Buffer>`.
- Produces: `auditRecoveredChild(bytes: Buffer): { bytes: number, sha256: string }`.

- [x] **Step 1: Write the recovered-module RED**

Require two `compileRecoveredChild()` calls to be byte-identical, require no literal `import.meta.url`, require the generated-only `globalThis.__phase9EntryUrl` binding, parse the bytes as ESM, and require every static specifier to begin `node:`.

- [x] **Step 2: Run the RED**

Run:

```bash
node --test --test-name-pattern='recovered child module is deterministic and entry-url bound' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because `compileRecoveredChild` is absent.

- [x] **Step 3: Implement the recovered compiler**

Rename the current private compile function to exported `compileRecoveredChild`; retain the error-minimization transform and add the exact esbuild define:

```js
define: { 'import.meta.url': 'globalThis.__phase9EntryUrl' }
```

Implement `auditRecoveredChild` using `new TextDecoder('utf-8', { fatal: true })`, Acorn, and the existing static-specifier scan, rejecting non-Buffer, empty, over-`262,144` bytes, invalid UTF-8/ESM, a missing generated entry binding, any literal `import.meta.url`, or any non-`node:` static import.

- [x] **Step 4: Run GREEN**

Run the Step 2 command and the existing child error-transform test. Expected: both pass.

### Task 3: Deterministic in-memory gzip wrapper

**Files:**
- Modify: `scripts/qa-evidence/phase9/build-child-runner.mjs`
- Modify: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Produces: `packageRecoveredChild(bytes: Buffer): { wrapper: Buffer, gzip: Buffer, recoveredSha256: string, gzipSha256: string }`.
- Produces: `inspectPackagedChild(wrapper: Buffer): { recovered: Buffer, gzip: Buffer }` for build/test admission only.

- [x] **Step 1: Write packaging RED tests**

Require two packages of independent recovered builds to have identical gzip and wrapper bytes; require wrapper size `<= 131072`; require one static `node:zlib` import, one base64 payload, no path APIs, and no literal recovered source. `inspectPackagedChild` must recover bytes exactly equal to `compileRecoveredChild()`. Mutations to payload, length, import, duplicate payload, global binding, or wrapper structure must reject.

- [x] **Step 2: Run the RED**

Run:

```bash
node --test --test-name-pattern='compressed child wrapper is deterministic self-contained and exact' tests/phase9-browser-evidence.test.mjs
```

Expected: FAIL because packaging exports are absent.

- [x] **Step 3: Implement deterministic packaging**

Use `gzipSync(bytes, { level: 9, mtime: 0 })`. Generate one fixed wrapper that:

```js
import { gunzipSync as g } from 'node:zlib';
const k = '__phase9EntryUrl';
if (Object.hasOwn(globalThis, k)) throw new Error('phase9-entry-binding-present');
Object.defineProperty(globalThis, k, {
  value: import.meta.url, writable: false, enumerable: false, configurable: true,
});
try {
  const b = g(Buffer.from('<BASE64_GZIP>', 'base64'));
  if (b.length !== <RECOVERED_LENGTH>) throw new Error('phase9-child-length-invalid');
  await import(`data:text/javascript;base64,${b.toString('base64')}`);
} finally {
  delete globalThis[k];
}
```

Generate the string without interpolating any path or external value. `inspectPackagedChild` must parse and validate the exact fixed wrapper grammar before decoding/gunzipping; it must enforce one payload, exact length, valid gzip, recovered audit, and no trailing/alternate source.

- [x] **Step 4: Execute through the real eval boundary**

Run a test fixture using the exact pinned Node arguments `--input-type=module --eval <wrapper> -- ...`; assert the recovered module sees the wrapper eval URL through the generated binding, emits expected protocol, and removes the binding. Add corrupt/nonzero/trailing-output fixtures to existing guardian attribution tests.

- [x] **Step 5: Run packaging GREEN**

Run Task 2 and Task 3 focused patterns. Expected: all pass.

### Task 4: Write the packaged child and repin all inputs

**Files:**
- Modify: `scripts/qa-evidence/phase9/build-child-runner.mjs`
- Regenerate: `scripts/qa-evidence/phase9/child-runner.mjs`
- Modify: `scripts/qa-evidence/phase9/cli.mjs`
- Modify: `scripts/qa-evidence/phase9/runner-config.json`
- Modify: `tests/phase9-browser-evidence.test.mjs`

**Interfaces:**
- Builder stdout: exact JSON keys `bytes`, `sha256`, `recoveredBytes`, `recoveredSha256`, `gzipBytes`, `gzipSha256`.

- [x] **Step 1: Make builder output the wrapper only after dual equality**

Compile and package twice; require recovered, gzip, and wrapper equality; audit both; write only the wrapper mode `0444`. Emit the six fixed metadata fields.

- [x] **Step 2: Build twice and compare**

Run the builder twice, saving the first child bytes outside the repository with `mktemp`; compare exact bytes and all six metadata values. Expected: identical and under cap.

- [x] **Step 3: Update literal pins**

Update `PHASE9_ARTIFACT_PINS` and runner config literals for child, child source, builder, Playwright client, scenario contracts, and config hashes. Add exact tests that the wrapper inspection recovers the reported recovered SHA and that worktree/Git-blob inputs match literals.

- [x] **Step 4: Run focused child/guardian tests**

Run:

```bash
node --test --test-name-pattern='child runner|runner config|protocol-v4 failure terminal|terminal checkpoint validator|join-admin' tests/phase9-browser-evidence.test.mjs
```

Expected: all pass, including clean-close/nonzero/trailing-output attribution.

### Task 5: Complete verification and review

**Files:**
- Modify: `docs/superpowers/plans/2026-08-25-phase-9-committed-browser-evidence-runner.md` with exact RED/GREEN/build evidence.
- Modify ignored progress/report files only with sanitized counts and hashes.

- [x] **Step 1: Run complete local verification**

Run full Phase 9, fixture/identity/hygiene, `npm run verify`, dry-run `44=40+4`, stripped-env offline smoke, syntax/ESLint/diff/secret scans, and exact browser/process/profile/materialization inventories. Expected: zero failures and zero managed residue.

- [x] **Step 2: Request independent review**

Review cumulative diff from `a6d4d4308fb2292f02574f6aecec99a6cec95d35` through the final candidate, emphasizing wrapper grammar, recovered import audit, entry-URL binding, child protocol semantics, diagnostic non-disclosure, and fixed-cap admission. Resolve every Critical/Important finding with separate RED/GREEN cycles.

- [x] **Step 3: Commit exact reviewed bytes**

Commit only after fresh final gates and clean status. Record exact wrapper/recovered/gzip/input hashes.

### Task 6: Release, stage, and diagnose one guarded retry

**Files:**
- No source edits during release unless a gate fails.

- [ ] **Step 1: Push exact reviewed SHA and require both release gates**

Revalidate PR #41 remains open/unmerged with the exact head and base. Push only the reviewed SHA; require push and PR Release gate runs to succeed.

- [ ] **Step 2: Deploy exactly once to staging**

Recheck pinned Chrome identity/hash immediately before dispatch. Dispatch one staging workflow for the exact SHA and require every deployment/health step to succeed.

- [ ] **Step 3: Run one guarded hosted lifecycle**

Use fresh external private workspace/result paths and exact deployment linkage. Stop on protected approval. After approval, require durable certificate, exact browser/process/profile closure, fixture cleanup, and independent `20/82/1 -> 0/0/0` absence.

- [ ] **Step 4: Act on the exact closed result**

If PASS, verify 44 rows and promote only exact approved evidence. If failure, use the new `window-no-team-join-admin/<reason>` certificate to write one minimal TDD fix, repeat review/release/staging once, and rerun only after independent cleanup proof. Do not merge or deploy production.
