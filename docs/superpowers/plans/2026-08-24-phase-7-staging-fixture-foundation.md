# Phase 7 Staging Fixture Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely create, exercise, and remove a minimal synthetic Firebase Auth and Firestore fixture set in hosted staging so the first critical registered-user and cross-tenant authorization contracts can receive fresh evidence.

**Architecture:** A repository-local, QA-only CLI separates pure safety validation and fixture definitions from an injected Firebase Admin adapter. Every hosted command requires two exact project confirmations, a staging-only environment flag, resolved Admin project identity, and a versioned namespace manifest. Browser verification consumes a temporary `0600` credential file, produces sanitized evidence, and cleanup deletes only manifest-listed resources.

**Tech Stack:** Node.js ESM, Firebase Admin SDK, Node test runner, Playwright system Chrome, Markdown audit evidence.

**Spec:** `docs/superpowers/specs/2026-08-24-phase-7-staging-fixture-foundation-design.md`

## Global Constraints

- The only permitted hosted Firebase target is `the-squad-v2-staging`; production and `.firebaserc` default project IDs are forbidden.
- Do not deploy application code, Functions, rules, indexes, or App Hosting during this phase.
- Do not access Stripe, Stripe Connect, Resend, FCM, RSS, calendar providers, backups, or rollback controls.
- Do not print or commit passwords, tokens, cookies, action links, private keys, or service-account JSON.
- All managed UIDs, document IDs, paths, and manifests must be bound to the exact `qa-phase7-` run namespace.
- Product runtime code is out of scope. Record any product mismatch as a new defect for a later root-cause/TDD phase.
- A matrix row remains `BLOCKED` unless every named happy, negative, permission, console, network, responsive, and persistence check is complete.
- Production readiness must remain `NOT READY` while required contracts remain blocked.

---

### Task 1: Fail-closed project guard and manifest validation

**Files:**
- Create: `scripts/qa-fixtures/guard.mjs`
- Create: `scripts/qa-fixtures/manifest.mjs`
- Create: `tests/qa-fixture-safety.test.mjs`

**Interfaces:**
- Produces: `assertHostedStagingIntent({ argv, env, resolvedProjectId }): { projectId: string }`
- Produces: `createRunId({ now, randomSuffix }): string`
- Produces: `validateManifest(manifest): FixtureManifest`
- Produces: `assertManagedUid(uid, runId): void`
- Produces: `assertManagedPath(path, runId): void`

- [ ] **Step 1: Write failing guard and manifest tests**

Add focused Node tests that import the missing modules and exercise exact observable behavior:

```js
test('hosted fixture intent requires both exact staging confirmations', () => {
  assert.throws(() => assertHostedStagingIntent({
    argv: ['--project', STAGING],
    env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
    resolvedProjectId: STAGING,
  }), /confirm-project/);
});

test('hosted fixture intent rejects production, default, and emulator targets', () => {
  for (const resolvedProjectId of ['studio-6850142148-fe343', 'production-project']) {
    assert.throws(() => assertHostedStagingIntent({
      argv: ['--project', STAGING, '--confirm-project', STAGING],
      env: { ALLOW_STAGING_QA_FIXTURES: 'true' },
      resolvedProjectId,
    }), /resolved project/i);
  }
  assert.throws(() => assertHostedStagingIntent({
    argv: ['--project', STAGING, '--confirm-project', STAGING],
    env: { ALLOW_STAGING_QA_FIXTURES: 'true', FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' },
    resolvedProjectId: STAGING,
  }), /emulator/i);
});

test('manifest validation rejects resources outside its exact run namespace', () => {
  const runId = 'qa-phase7-20260824T140000Z-ab12';
  assert.throws(() => validateManifest({
    version: 1,
    runId,
    projectId: STAGING,
    authUids: ['unrelated-user'],
    firestorePaths: [`qaAuditRuns/${runId}`],
  }), /managed uid/i);
});
```

- [ ] **Step 2: Run the focused test and record RED**

Run:

```bash
node --test tests/qa-fixture-safety.test.mjs
```

Expected: FAIL because `scripts/qa-fixtures/guard.mjs` and `manifest.mjs` do not exist.

- [ ] **Step 3: Implement the minimal pure safety modules**

Use fixed constants and reject ambiguous arguments:

```js
export const STAGING_PROJECT_ID = 'the-squad-v2-staging';
export const MANAGED_PREFIX = 'qa-phase7-';

export function assertHostedStagingIntent({ argv, env, resolvedProjectId }) {
  const valueFor = flag => {
    const positions = argv.flatMap((value, index) => value === flag ? [index] : []);
    if (positions.length !== 1 || positions[0] === argv.length - 1) {
      throw new Error(`${flag} must appear exactly once with a value.`);
    }
    return argv[positions[0] + 1];
  };
  const project = valueFor('--project');
  const confirmation = valueFor('--confirm-project');
  if (project !== STAGING_PROJECT_ID || confirmation !== STAGING_PROJECT_ID) {
    throw new Error('Both project confirmations must name the isolated staging project.');
  }
  if (env.ALLOW_STAGING_QA_FIXTURES !== 'true') {
    throw new Error('ALLOW_STAGING_QA_FIXTURES must equal true.');
  }
  if (env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST || env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('Hosted staging fixture commands reject emulator configuration.');
  }
  if (resolvedProjectId !== STAGING_PROJECT_ID) {
    throw new Error('Firebase Admin resolved project does not match staging.');
  }
  return { projectId: STAGING_PROJECT_ID };
}
```

`validateManifest` must require version `1`, the exact staging project, a `qa-phase7-` run ID, arrays of unique managed UIDs and normalized managed Firestore paths, and lifecycle state `planned`, `partial`, `seeded`, or `cleaned`. It returns a deeply frozen normalized copy and never accepts `..`, empty path segments, or a resource from another run.

- [ ] **Step 4: Run focused tests and record GREEN**

Run:

```bash
node --test tests/qa-fixture-safety.test.mjs
git diff --check
```

Expected: all focused tests pass and the diff is whitespace-clean.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/qa-fixtures/guard.mjs scripts/qa-fixtures/manifest.mjs tests/qa-fixture-safety.test.mjs
git commit -m "test: enforce hosted fixture safety boundary"
```

---

### Task 2: Deterministic definition and idempotent lifecycle engine

**Files:**
- Create: `scripts/qa-fixtures/definition.mjs`
- Create: `scripts/qa-fixtures/lifecycle.mjs`
- Modify: `tests/qa-fixture-safety.test.mjs`

**Interfaces:**
- Consumes: Task 1 guard and manifest validators.
- Produces: `buildFixtureDefinition({ runId, expiresAt }): FixtureDefinition`
- Produces: `createLifecycle({ auth, firestore, clock, randomBytes }): FixtureLifecycle`
- Produces: `FixtureLifecycle.seed({ manifestPath, credentialPath }): Promise<FixtureManifest>`
- Produces: `FixtureLifecycle.inspect({ manifestPath }): Promise<InspectionResult>`
- Produces: `FixtureLifecycle.cleanup({ manifestPath }): Promise<CleanupResult>`

- [ ] **Step 1: Add failing definition and lifecycle tests**

Use in-memory fake Auth and Firestore adapters. Tests must prove:

```js
test('definition contains the approved identities and two distinct tenants', () => {
  const definition = buildFixtureDefinition({ runId, expiresAt });
  assert.deepEqual(definition.identities.map(item => item.alias), [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant',
    'qa-team-member', 'qa-multi-org', 'qa-fake-superadmin',
    'qa-unverified', 'qa-suspended', 'qa-removed-member',
  ]);
  assert.notEqual(definition.teams[0].sentinel, definition.teams[1].sentinel);
  assert.equal(definition.identities.find(item => item.alias === 'qa-fake-superadmin').customClaims.role, undefined);
});

test('seed is idempotent only for matching marked resources', async () => {
  const first = await lifecycle.seed(inputs);
  const second = await lifecycle.seed(inputs);
  assert.deepEqual(second.authUids, first.authUids);
  fakeFirestore.inject('users/collision', { qaFixture: false });
  await assert.rejects(() => lifecycle.seed(collisionInputs), /collision/i);
});

test('cleanup deletes only exact manifest resources and is idempotent', async () => {
  await lifecycle.cleanup({ manifestPath });
  await lifecycle.cleanup({ manifestPath });
  assert.deepEqual(fakeAuth.deleted.sort(), manifest.authUids.sort());
  assert.equal(fakeFirestore.has('users/unrelated'), true);
});
```

Also test partial-seed manifests, duplicate paths, mismatched markers, `0600` credential output, credential-file removal, and redacted logs.

- [ ] **Step 2: Run the focused test and record RED**

Run:

```bash
node --test tests/qa-fixture-safety.test.mjs
```

Expected: FAIL because the definition and lifecycle modules are missing.

- [ ] **Step 3: Implement the deterministic fixture definition**

Create fixed synthetic emails under `example.test`, stable role and membership mappings, and canonical app fields:

```js
const marker = (runId, alias, expiresAt) => ({
  qaFixture: true,
  qaFixtureVersion: 1,
  qaFixtureRunId: runId,
  qaFixtureAlias: alias,
  qaFixtureExpiresAt: expiresAt,
});

// Team documents include id, name/teamName, ownerUserId, createdBy,
// planId: 'free', planType: 'free', isPro: false, and the marker.
// Member documents include id, userId, ownerUserId, teamId, role,
// position, status, and the marker.
// User documents include id, uid, email, name/displayName, role,
// accountStatus, activePlanId: 'free', proTeamLimit: 1, and the marker.
```

The fake-superadmin profile has `role: 'superadmin'` only in the untrusted Firestore profile and has no Auth custom claim. The suspended profile has `accountStatus: 'suspended'`. The removed-member document has `status: 'removed'` and is excluded from the team’s active membership cache. The multi-org identity has active memberships in both teams; the fixture definition states which team is initially active.

- [ ] **Step 4: Implement the injected lifecycle engine**

The engine must:

- generate random 24-byte passwords without logging them;
- create/update only matching marked Auth users and Firestore documents;
- write credentials atomically to a caller-selected path with `{ mode: 0o600, flag: 'wx' }`;
- update the manifest after each successful creation so partial cleanup is possible;
- inspect exact resources and compare marker, alias, run ID, role, account state, and tenant relations;
- revoke refresh tokens when entering suspended/removed states;
- delete Firestore documents in reverse-depth order, then delete Auth users;
- remove the credential file in a `finally` path owned by the browser runner, not during seed;
- return sanitized aliases, counts, states, and opaque UID suffixes only.

- [ ] **Step 5: Run focused and related tests**

Run:

```bash
node --test tests/qa-fixture-safety.test.mjs tests/account-authentication.test.mjs tests/dashboard-route-policy.test.mjs tests/team-access.test.mjs tests/team-membership-security.test.mjs
npm run test:rules
git diff --check
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add scripts/qa-fixtures/definition.mjs scripts/qa-fixtures/lifecycle.mjs tests/qa-fixture-safety.test.mjs
git commit -m "feat: add isolated staging fixture lifecycle"
```

---

### Task 3: Firebase Admin CLI and package commands

**Files:**
- Create: `scripts/qa-fixtures/firebase-adapter.mjs`
- Create: `scripts/qa-fixtures/cli.mjs`
- Modify: `package.json`
- Modify: `tests/qa-fixture-safety.test.mjs`

**Interfaces:**
- Consumes: Task 1 guard and Task 2 lifecycle.
- Produces: CLI commands `preflight`, `seed`, `inspect`, and `cleanup`.
- Produces: package scripts `qa:fixtures:preflight`, `qa:fixtures:seed`, `qa:fixtures:inspect`, `qa:fixtures:cleanup`.

- [ ] **Step 1: Add failing CLI structure tests**

Assert that importing the CLI does not initialize Firebase or execute a command, every command calls the guard before its adapter mutation method, unsupported commands exit nonzero, and credential/manifest paths cannot resolve inside the repository.

```js
test('cli rejects repository-local credential output before adapter mutation', async () => {
  const calls = [];
  await assert.rejects(() => runCli({
    argv: hostedArgs('seed', '--credentials', 'tmp/creds.json'),
    cwd: repositoryRoot,
    adapterFactory: () => ({ mutate: () => calls.push('mutate') }),
  }), /outside the repository/i);
  assert.deepEqual(calls, []);
});
```

- [ ] **Step 2: Run the focused test and record RED**

Run `node --test tests/qa-fixture-safety.test.mjs`.

Expected: FAIL because the CLI and adapter do not exist.

- [ ] **Step 3: Implement the Firebase Admin adapter**

Initialize one named Admin app using Application Default Credentials or the repository’s existing external `FIREBASE_SERVICE_ACCOUNT_JSON` convention without reading or printing credential content. Resolve `app.options.projectId` and, when needed, the credential project ID before returning Auth/Firestore wrappers. Wrapper methods expose only exact user/document operations required by the lifecycle; no collection-wide delete or recursive delete method is available.

- [ ] **Step 4: Implement the CLI and package scripts**

`runCli({ argv, env, cwd, adapterFactory, stdout, stderr })` must be injectable for tests. The executable path calls it only under the standard ESM main-module guard. Preflight performs no Auth/Firestore mutation and reports:

```json
{"command":"preflight","projectId":"the-squad-v2-staging","origin":"https://studio--the-squad-v2-staging.us-east4.hosted.app","plannedAliases":9,"plannedTeams":2,"safe":true}
```

The package scripts invoke the same CLI and require callers to supply explicit project confirmations and external file paths.

- [ ] **Step 5: Run focused and full local safety tests**

Run:

```bash
node --test tests/qa-fixture-safety.test.mjs tests/production-environment.test.mjs tests/repository-hygiene.test.mjs
npm run typecheck
git diff --check
```

Expected: all tests pass and no credential artifacts exist in the worktree.

- [ ] **Step 6: Commit Task 3**

```bash
git add package.json scripts/qa-fixtures/firebase-adapter.mjs scripts/qa-fixtures/cli.mjs tests/qa-fixture-safety.test.mjs
git commit -m "feat: add guarded staging fixture commands"
```

---

### Task 4: Hosted preflight, seed, browser verification, and cleanup

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-24-phase7-staging-fixtures/00-environment.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase7-staging-fixtures/01-fixture-lifecycle.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase7-staging-fixtures/02-auth-tenant-browser.md`
- Create temporary files outside the repository for the manifest, credentials, and raw Playwright state; remove them after sanitized evidence is written.

**Interfaces:**
- Consumes: Task 3 CLI and the existing hosted staging origin.
- Produces: sanitized lifecycle and scenario evidence with no secret material.

- [ ] **Step 1: Create a private temporary workspace and run read-only preflight**

Use `mktemp -d`, set directory mode `0700`, and pass exact confirmations:

```bash
ALLOW_STAGING_QA_FIXTURES=true npm run qa:fixtures:preflight -- \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --origin https://studio--the-squad-v2-staging.us-east4.hosted.app
```

Expected: exit 0, resolved project `the-squad-v2-staging`, safe true, nine aliases, two teams, and no writes. Stop if any invariant differs.

- [ ] **Step 2: Seed, inspect, and verify exact fixture state**

Run seed with manifest and credential paths inside the private temporary workspace, then inspect the exact manifest. Expected: nine Auth users, two teams, canonical user/member documents, no collision, no drift, and no credential value in output or repository files.

- [ ] **Step 3: Execute fresh browser scenarios**

Use the installed Playwright workflow with system Chrome. At 390×844 and 1440×900 where applicable, run new browser contexts for the nine scenarios in the approved design. For every scenario capture final URL, visible outcome, applicable API status, same-origin request failures, application-console errors, page errors, horizontal overflow, and post-action Firestore state. Use event-based waits and unique scenario IDs; do not use arbitrary sleeps for correctness.

Expected positive outcomes include owner login/landing, permitted owner/staff/member routes, authorized team switching, and continued access to the new tenant only. Expected denials include unverified, suspended, removed-member, fake-superadmin, disallowed direct routes/APIs, and changed Team A/Team B identifiers.

- [ ] **Step 4: Classify observations without patching product code**

For each mismatch, preserve request/console/data evidence, assign the next stable `BUG-###`, severity, affected row, and reproduction. Do not change product source in this task. Passing partial scenarios narrow blocker notes but do not promote incomplete rows.

- [ ] **Step 5: Inspect, clean, and prove absence**

Run `inspect`, `cleanup`, and `inspect` again using the same manifest. Expected: zero manifest-listed Auth users and Firestore documents after cleanup, unrelated sentinel records unchanged, temporary credential file absent, and no raw trace retained.

- [ ] **Step 6: Write sanitized run evidence and commit**

Record timestamps, starting/deployed SHA, project/backend/origin, aliases only, counts, scenario outcomes, cleanup result, artifact policy, and limitations. Then run credential-pattern and diff checks before committing:

```bash
git add docs/qa/production-audit/runs/2026-08-24-phase7-staging-fixtures
git commit -m "qa: verify staging auth and tenant fixtures"
```

---

### Task 5: Audit reconciliation, full verification, and review handoff

**Files:**
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/07-defect-ledger.md` only if Task 4 observed a defect
- Create: `docs/qa/production-audit/12-phase7-staging-fixture-foundation.md`

**Interfaces:**
- Consumes: Task 4 sanitized evidence.
- Produces: mechanically reconciled Phase 7 totals, blocker map, defect ledger, and release decision.

- [ ] **Step 1: Reconcile all affected rows conservatively**

Update only rows exercised by Task 4. A row becomes `PASS` only if its entire existing matrix contract completed. Otherwise retain `BLOCKED` and replace the broad fixture reason with the exact remaining dependency. A reproduced mismatch becomes `FAIL` and links its stable ledger entry.

- [ ] **Step 2: Publish the Phase 7 report**

Include starting/head/deployed revisions, fixture safety design, exact lifecycle counts, scenario results, matrix totals, defect totals by severity, cleanup, independent review findings, remaining blockers, and `NOT READY` unless no required contract remains blocked.

- [ ] **Step 3: Run structural and hygiene gates**

Mechanically verify 88 unique matrix rows, valid statuses, exact PASS/FAIL/BLOCKED arithmetic, one-to-one bug linkage, zero credential values, no raw traces, no repository-local credential/manifest file, and `git diff --check`.

- [ ] **Step 4: Run the complete verification gate**

Run:

```bash
npm run verify
```

Expected: typecheck pass; ESLint zero errors; 390 existing Node tests plus new fixture-safety tests pass; rendered tests pass; 38 rules tests pass; Next build passes; Functions build passes.

- [ ] **Step 5: Commit the reconciled Phase 7 result**

```bash
git add docs/qa/production-audit/05-coverage-matrix.md docs/qa/production-audit/07-defect-ledger.md docs/qa/production-audit/12-phase7-staging-fixture-foundation.md
git commit -m "qa: publish Phase 7 staging authorization results"
```

Stage `07-defect-ledger.md` only if it changed.

- [ ] **Step 6: Request independent review and resolve findings**

Give the reviewer the approved design, this plan, base SHA `3aae3288c459670a4f35993762069d22f81b307f`, final head SHA, lifecycle/browser evidence, cleanup proof, matrix/ledger totals, and verification output. Fix every Critical and Important finding, rerun affected checks, and obtain a clean scoped re-review.

- [ ] **Step 7: Push, open the Phase 7 PR, and monitor CI**

Push `agent/phase7-staging-fixture-foundation`, open a PR to `agent/phase3-root-cause-repair`, and monitor every required check to completion. Do not merge the PR automatically. Preserve the worktree for review feedback.
