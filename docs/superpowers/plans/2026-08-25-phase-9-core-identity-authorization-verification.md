# Phase 9 Core Identity and Authorization Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely expand the exact staging fixture lifecycle and execute the approved core identity, session, vertical-authority, and cross-tenant isolation slice without touching production or claiming broad release readiness.

**Architecture:** Add a versioned Phase 9 fixture definition and manifest-v3 contract while preserving manifest-v2 inspect/cleanup recovery. Validate identity and route semantics locally, deploy only an independently reviewed exact commit to guarded staging, run fresh system-Chrome contexts, and finish with exact manifest cleanup plus an independent `0/0` probe.

**Tech Stack:** Node.js ESM, TypeScript, Next.js, Firebase Admin/Auth/Firestore, Firebase Rules emulator, Node test runner, Vitest, bundled Playwright CLI with system Chrome, GitHub Actions, Markdown audit evidence.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-9-core-identity-authorization-verification-design.md`

## Global Constraints

- Work only on `agent/phase9-core-identity-verification`, starting from `64ffb8d58965ffbc8115d882e545a4798610fa88`.
- Production data, identities, deployment, and provider state are forbidden.
- Phase 7 PR `#39` and Phase 8 PR `#40` remain open and unmerged; Phase 9 is a separate stacked PR.
- Hosted mutation is limited to Firebase project `the-squad-v2-staging` and the guard-approved staging origin.
- Use only run-owned synthetic UIDs and exact manifest-listed Firestore paths; no list-and-delete, recursive delete, or prefix-wide delete.
- Use a private `0700` workspace and an external `0600` credential file. Never retain passwords, tokens, cookies, storage state, traces, service-account material, or action links.
- Browser verification uses isolated system-Chrome contexts at `390x844` and `1440x900`, with diagnostics armed on `about:blank` before first staging navigation.
- Do not change product behavior unless a stable mismatch has a root-cause trace and an automated RED test.
- Do not promote a coverage row from partial evidence. Release remains `NOT READY`.
- Do not merge any pull request or deploy to production.

## File and interface map

- `scripts/qa-fixtures/definition.mjs`: owns versioned deterministic identity/resource graphs. It will export `buildFixtureDefinition({ runId, expiresAt, manifestVersion = 3 })` and `fixturePlanSummary({ manifestVersion = 3 })`.
- `scripts/qa-fixtures/manifest.mjs`: owns schema validation and exact-journal comparison. It will validate v2 recovery journals and v3 Phase 9 journals without changing v2 semantics.
- `scripts/qa-fixtures/lifecycle.mjs`: owns seed, inspect, transition, credentials, and exact cleanup. It will add the resumable pending-deletion transition and expected-absence checks.
- `scripts/qa-fixtures/cli.mjs`: owns pre-adapter validation, version routing, sanitized output, and current plan counts.
- `tests/qa-fixture-safety.test.mjs`: exercises definition, schema, lifecycle interruption/recovery, CLI ordering, credentials, and cleanup.
- `tests/phase9-identity-authorization.test.mjs`: new functional tests for account-session and dashboard route decisions.
- `tests/phase9-audit-reconciliation.test.mjs`: new mechanical checks for Phase 9 evidence fields, totals, SHA/run linkage, and cleanup arithmetic.
- Product modules under `src/lib/` change only if Task 4 records a failing authority regression and confirms the root cause.
- `docs/qa/production-audit/14-phase9-core-identity-verification.md` and `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/`: sanitized retained report and run evidence.

---

### Task 1: Versioned deterministic Phase 9 fixture graph

**Files:**
- Modify: `scripts/qa-fixtures/definition.mjs:3-185`
- Modify: `tests/qa-fixture-safety.test.mjs:230-350`
- Modify: `tests/qa-fixture-safety.test.mjs:1125-1255`

**Interfaces:**
- Consumes: `assertManagedUid(uid, runId)` from `manifest.mjs` and the existing run marker shape.
- Produces: `buildFixtureDefinition({ runId, expiresAt, manifestVersion = 3 })` returning `{ manifestVersion, runId, expiresAt, identities, teams, members, documents, expectedAbsentDocuments }` and `fixturePlanSummary({ manifestVersion = 3 })` returning non-secret alias/team/resource counts.

- [ ] **Step 1: Add failing definition-contract tests**

Add a named test that asserts exact v2 compatibility and exact v3 aliases:

```js
test('phase 9 fixture definition preserves v2 recovery and creates the exact v3 identity graph', () => {
  const legacy = buildFixtureDefinition({ runId: RUN_ID, expiresAt: EXPIRES_AT, manifestVersion: 2 });
  assert.deepEqual(legacy.identities.map(item => item.alias), [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member',
    'qa-multi-org', 'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member',
  ]);

  const phase9 = buildFixtureDefinition({ runId: RUN_ID, expiresAt: EXPIRES_AT, manifestVersion: 3 });
  assert.deepEqual(phase9.identities.map(item => item.alias), [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member',
    'qa-multi-org', 'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member',
    'qa-parent-a', 'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b',
    'qa-youth-active', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
    'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
  ]);
  assert.equal(phase9.expectedAbsentDocuments.length, 1);
  assert.equal(phase9.expectedAbsentDocuments[0].alias, 'qa-missing-profile');
  assert.equal(phase9.documents.some(item => item.path === phase9.expectedAbsentDocuments[0].path), false);
});
```

Add assertions that:

```js
const byAlias = (items, alias) => items.find(item => item.alias === alias);
const trusted = byAlias(phase9.identities, 'qa-superadmin');
const fake = byAlias(phase9.identities, 'qa-fake-superadmin');
assert.equal(trusted.customClaims.role, 'superadmin');
assert.equal(fake.customClaims.role, undefined);
assert.equal(byAlias(phase9.identities, 'qa-school-admin').customClaims.role, 'admin');

const school = phase9.teams.find(team => team.alias === 'qa-school');
assert.equal(school.type, 'school');
assert.deepEqual(school.schoolAdminIds, [byAlias(phase9.identities, 'qa-school-admin').uid]);
assert.equal(school.planType, 'school');
```

Assert parent/player symmetry, exact guardian links, distinct tenant sentinels, no medical/payment/provider fields, unique Auth UIDs, unique Firestore paths, and managed IDs on every document.

Use an explicit forbidden-field assertion rather than a visual review:

```js
const forbiddenFields = new Set([
  'medical', 'medicalInfo', 'stripeCustomerId', 'stripe_customer_id',
  'paymentMethod', 'accessToken', 'refreshToken', 'providerAccountId',
]);
for (const document of phase9.documents) {
  assert.deepEqual(Object.keys(document.data).filter(key => forbiddenFields.has(key)), []);
}
```

- [ ] **Step 2: Run the focused test and capture RED**

Run:

```bash
node --import tsx --test --test-name-pattern="phase 9 fixture definition" tests/qa-fixture-safety.test.mjs
```

Expected: FAIL because `manifestVersion: 3`, the Phase 9 aliases, institution/league/player records, and `expectedAbsentDocuments` do not exist.

- [ ] **Step 3: Implement the versioned definition**

Retain the current nine-alias graph as `V2_IDENTITY_SPECS`. Define the v3 additions explicitly:

```js
const V3_IDENTITY_SPECS = [
  ...V2_IDENTITY_SPECS,
  ['qa-parent-a', 'Parent A', 'parent', 'active', true],
  ['qa-parent-b', 'Parent B', 'parent', 'active', true],
  ['qa-adult-player-a', 'Adult Player A', 'adult_player', 'active', true],
  ['qa-adult-player-b', 'Adult Player B', 'adult_player', 'active', true],
  ['qa-youth-active', 'Youth Player A', 'youth_player', 'active', true],
  ['qa-league-creator', 'League Creator', 'league_creator', 'active', true],
  ['qa-school-admin', 'School Administrator', 'admin', 'active', true],
  ['qa-superadmin', 'Trusted Superadmin', 'superadmin', 'active', true],
  ['qa-pending-delete', 'Pending Delete Baseline', 'Member', 'active', true],
  ['qa-missing-profile', 'Missing Profile', 'Member', 'active', true],
  ['qa-no-team', 'No Team Member', 'Member', 'active', true],
];
```

Implement exact role/claim behavior:

```js
if (alias !== 'qa-fake-superadmin') claims.role = role;
```

Create Team A, Team B, and v3-only school institution records with run-owned IDs. Add one run-owned league, the minimum run-owned player/guardian records, and memberships for the parent/player/pending-delete aliases. Exclude `qa-missing-profile` from `userDocuments`; exclude missing-profile, no-team, league-creator, school-admin, and trusted-superadmin from squad memberships unless the approved definition specifically requires one.

Set the school-admin user profile fields exactly:

```js
{
  role: 'admin',
  isSchoolAdmin: true,
  planId: 'school',
  plan_type: 'school',
  activePlanId: 'school',
}
```

Return the intentional absence separately:

```js
expectedAbsentDocuments: manifestVersion === 3 ? [{
  alias: 'qa-missing-profile',
  kind: 'user',
  path: `users/${byAlias.get('qa-missing-profile').uid}`,
}] : [],
```

- [ ] **Step 4: Run the definition tests and make them GREEN**

Run:

```bash
node --import tsx --test --test-name-pattern="fixture definition|deterministic fixture" tests/qa-fixture-safety.test.mjs
```

Expected: PASS. Confirm the failure disappeared because the exact v3 graph exists, not because assertions were relaxed.

- [ ] **Step 5: Commit the fixture-definition unit**

```bash
git add scripts/qa-fixtures/definition.mjs tests/qa-fixture-safety.test.mjs
git commit -m "test: define phase 9 identity fixtures"
```

---

### Task 2: Manifest-v3 journal with v2 recovery compatibility

**Files:**
- Modify: `scripts/qa-fixtures/manifest.mjs:5-260`
- Modify: `scripts/qa-fixtures/cli.mjs:6-215`
- Modify: `tests/qa-fixture-safety.test.mjs:602-905`
- Modify: `tests/qa-fixture-safety.test.mjs:1125-1320`

**Interfaces:**
- Consumes: versioned `buildFixtureDefinition()` and `fixturePlanSummary()` from Task 1.
- Produces: `validateManifest(manifest)` for versions 2 and 3, and `assertExactFixtureJournal(manifest, definition)` comparing present and expected-absent sets.

- [ ] **Step 1: Add failing schema and pre-adapter tests**

Create helpers with exact transition maps:

```js
function activeTransitions(version) {
  const transitions = {
    'qa-suspended': { version: 1, state: 'active' },
    'qa-removed-member': { version: 1, state: 'active' },
  };
  if (version === 3) transitions['qa-pending-delete'] = { version: 1, state: 'active' };
  return transitions;
}
```

Add tests proving:

```js
const v3 = completeManifest(phase9Definition, {
  version: 3,
  expectedAbsentFirestorePaths: phase9Definition.expectedAbsentDocuments.map(item => item.path),
  transitions: activeTransitions(3),
});
assert.equal(validateManifest(v3).version, 3);
```

Reject v3 journals that omit/add an Auth UID, present path, expected-absence path, or transition alias. Reject overlap between `firestorePaths` and `expectedAbsentFirestorePaths`. Reject `expectedAbsentFirestorePaths` on v2. Confirm an exact v2 journal still validates.

For CLI commands, inject `adapterFactory` counters and assert:

```js
const seedArgsForExistingV2 = [
  'seed', '--project', STAGING, '--confirm-project', STAGING,
  '--manifest', v2ManifestPath, '--credentials', credentialPath,
];
const transitionArgsForExistingV2 = [
  'transition', '--project', STAGING, '--confirm-project', STAGING,
  '--manifest', v2ManifestPath, '--alias', 'qa-suspended',
];
await assert.rejects(() => runCli({ argv: seedArgsForExistingV2, adapterFactory }), /version 2.*recovery|new version 3 run/i);
assert.equal(factoryCalls, 0);
await assert.rejects(() => runCli({ argv: transitionArgsForExistingV2, adapterFactory }), /version 2.*recovery/i);
assert.equal(factoryCalls, 0);
```

Inspect and cleanup must accept the same exact v2 manifest and may construct the adapter only after pure local validation.

- [ ] **Step 2: Run the schema tests and capture RED**

```bash
node --import tsx --test --test-name-pattern="manifest v3|version 2 recovery|expected absence" tests/qa-fixture-safety.test.mjs
```

Expected: FAIL because only version 2 and two transitions are supported.

- [ ] **Step 3: Implement explicit version schemas**

Use version-specific constants, never a permissive union:

```js
const VERSION_SCHEMAS = Object.freeze({
  2: Object.freeze({
    transitionAliases: ['qa-suspended', 'qa-removed-member'],
    expectedAbsence: false,
  }),
  3: Object.freeze({
    transitionAliases: ['qa-suspended', 'qa-removed-member', 'qa-pending-delete'],
    expectedAbsence: true,
  }),
});
```

Normalize transitions using the selected schema. Treat `qa-pending-delete` like `qa-suspended`: checkpoint order is `startedAt`, `firestoreUpdatedAt`, `revokedAt`, `completedAt`, and `cacheDeletedAt` is forbidden. Its final state is `pending_deletion`.

For v3, validate and freeze `expectedAbsentFirestorePaths`, assert every path is managed, unique, absent from `firestorePaths`, and exact against `definition.expectedAbsentDocuments`. Preserve the current v2 normalized shape byte-for-byte except for deep copies/freezing.

- [ ] **Step 4: Route definitions by manifest version before adapter construction**

In `cli.mjs`, use:

```js
definition = buildFixtureDefinition({
  runId: manifest.runId,
  expiresAt: manifest.expiresAt,
  manifestVersion: manifest.version,
});
```

For a missing seed manifest, create version 3 explicitly. Before `adapterFactory()`:

```js
if (manifest?.version === 2 && !new Set(['inspect', 'cleanup']).has(command)) {
  throw new Error('Manifest version 2 is recovery-only; seed a new version 3 run.');
}
```

Replace hard-coded preflight counts with `fixturePlanSummary({ manifestVersion: 3 })` and retain aliases/counts only.

- [ ] **Step 5: Run focused and compatibility tests**

```bash
node --import tsx --test --test-name-pattern="manifest|journal|CLI|cli|preflight" tests/qa-fixture-safety.test.mjs
```

Expected: PASS for new v3 tests and all existing v2 validation/recovery tests.

- [ ] **Step 6: Commit the manifest/CLI unit**

```bash
git add scripts/qa-fixtures/manifest.mjs scripts/qa-fixtures/cli.mjs tests/qa-fixture-safety.test.mjs
git commit -m "feat: add phase 9 fixture journal"
```

---

### Task 3: Expected-absence inspection and pending-deletion lifecycle

**Files:**
- Modify: `scripts/qa-fixtures/lifecycle.mjs:1-870`
- Modify: `tests/qa-fixture-safety.test.mjs:1440-2440`

**Interfaces:**
- Consumes: v3 manifest fields and `definition.expectedAbsentDocuments` from Tasks 1-2.
- Produces: `applyNegativeState('qa-pending-delete') -> { alias, state: 'pending_deletion', resumed, uidSuffix }`; `inspect()` reports expected-absence drift without exposing paths; `cleanup()` remains exact and idempotent.

- [ ] **Step 1: Add failing expected-absence and transition tests**

Add a seed test proving the missing profile remains absent and a collision aborts before mutation:

```js
const missing = fixture.definition.expectedAbsentDocuments[0];
await fixture.lifecycle.seed(fixture.inputs);
assert.equal(await fixture.firestore.get(missing.path), null);
await fixture.firestore.set(missing.path, { foreign: true });
const inspection = await fixture.lifecycle.inspect({ manifestPath: fixture.inputs.manifestPath });
assert.equal(inspection.ok, false);
assert.equal(inspection.drift.some(item =>
  item.alias === 'qa-missing-profile' && item.reason === 'unexpected-presence'
), true);
```

Add a fresh fixture collision case that asserts Auth/Firestore mutation counters stay zero when the expected-absent path exists before seed.

Add pending-deletion transition tests:

```js
await fixture.lifecycle.seed(fixture.inputs);
const result = await fixture.lifecycle.applyNegativeState('qa-pending-delete');
assert.equal(result.state, 'pending_deletion');
const identity = fixture.definition.identities.find(item => item.alias === 'qa-pending-delete');
const persisted = await fixture.firestore.get(`users/${identity.uid}`);
assert.deepEqual({
  accountStatus: persisted.accountStatus,
  deletionStatus: persisted.deletionStatus,
}, { accountStatus: 'pending_deletion', deletionStatus: 'pending' });
assert.equal(fixture.auth.revoked.includes(identity.uid), true);
```

Inject faults after the Firestore write and after revocation. Assert the manifest remains `applying`, retry resumes, timestamps remain ordered, and a completed transition refuses remote drift.

- [ ] **Step 2: Run lifecycle tests and capture RED**

```bash
node --import tsx --test --test-name-pattern="expected absence|pending-delete|pending deletion" tests/qa-fixture-safety.test.mjs
```

Expected: FAIL because lifecycle code knows only suspended and removed-member transitions and ignores intentional absence.

- [ ] **Step 3: Implement expected-absence safety**

Extend `assertDefinition()` to validate unique expected-absence paths, no overlap with created documents, and managed run ownership. Before seed's first remote write, query each expected-absence path and fail with a sanitized alias-only collision if any exists.

During inspect, add sanitized drift records:

```js
for (const expected of definition.expectedAbsentDocuments) {
  if (snapshotData(await firestore.get(expected.path))) {
    recordDrift('firestore', expected.alias, 'presence', 'unexpected-presence');
  }
}
```

Do not silently delete an unmarked unexpected document. Cleanup reports that alias as retained/follow-up and leaves the manifest uncleaned until the exact conflict is resolved.

- [ ] **Step 4: Implement resumable pending deletion**

Add `qa-pending-delete` to the allowed v3 negative aliases. Share the suspension-style transition branch but write the exact pending state:

```js
const targetUser = alias === 'qa-pending-delete'
  ? { ...userDocument, accountStatus: 'pending_deletion', deletionStatus: 'pending' }
  : { ...userDocument, accountStatus: 'suspended' };
```

Persist `applying` before the write, checkpoint `firestoreUpdatedAt`, call `auth.revokeRefreshTokens(uid)`, checkpoint `revokedAt`, verify the exact remote fields, then write the final state and `completedAt`. Use distinct fault stages:

```js
transition.qa-pending-delete.afterFirestore
transition.qa-pending-delete.afterRevoke
```

Update inspect's allowed persisted negative shapes so active, applying, and final pending-deletion states are exact and no extra fields are tolerated.

- [ ] **Step 5: Verify lifecycle, credential, and cleanup regressions**

```bash
node --import tsx --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs
```

Expected: PASS. Confirm cleanup arithmetic is derived from `definition`, not hard-coded to Phase 7's `9/40` counts.

- [ ] **Step 6: Commit the lifecycle unit**

```bash
git add scripts/qa-fixtures/lifecycle.mjs tests/qa-fixture-safety.test.mjs
git commit -m "feat: verify phase 9 account states"
```

---

### Task 4: Local account-session and route-authority TDD

**Files:**
- Create: `tests/phase9-identity-authorization.test.mjs`
- Modify only if RED confirms the root cause: `src/lib/account-session-policy.ts:43-86`
- Modify only if RED confirms the root cause: `src/lib/dashboard-route-policy.ts:24-103`
- Modify only if required by a confirmed server boundary: `src/lib/server-account-session.ts:20-83`

**Interfaces:**
- Consumes: `createAccountSessionResolver(reader)` and `authorizeDashboardRoute(pathname, profile, claimsRole)`.
- Produces: executable role/session contract for missing profile, no team, pending deletion, school authority, league creator, trusted superadmin, fake superadmin, parent, adult player, and youth player.

- [ ] **Step 1: Write functional policy tests without source regexes**

Create table-driven resolver tests:

```js
const cases = [
  { name: 'missing profile', profile: null, expected: { allowed: true, redirectTo: '/onboarding' } },
  { name: 'no team', profile: { role: 'Member', accountStatus: 'active' }, squad: false, expected: { allowed: true, redirectTo: '/teams/join' } },
  { name: 'pending deletion', profile: { role: 'Member', accountStatus: 'pending_deletion' }, expected: { allowed: false, code: 'auth/account-unavailable' } },
  { name: 'school flag alone', profile: { role: 'admin', isSchoolAdmin: true, plan_type: 'school' }, institution: false, squad: false, expected: { allowed: true, redirectTo: '/teams/join' } },
  { name: 'corroborated school', profile: { role: 'admin', isSchoolAdmin: true, plan_type: 'school' }, institution: true, expected: { allowed: true, redirectTo: null } },
  { name: 'league creator', profile: { role: 'league_creator' }, expected: { allowed: true, redirectTo: null } },
  { name: 'trusted superadmin', identity: { role: 'superadmin' }, profile: { role: 'Member' }, expected: { allowed: true, redirectTo: null } },
];
```

Create route tests:

```js
assert.deepEqual(authorizeDashboardRoute('/admin', { role: 'superadmin' }, undefined), {
  allowed: false, redirectTo: '/dashboard',
});
assert.deepEqual(authorizeDashboardRoute('/admin', { role: 'Member' }, 'superadmin'), { allowed: true });
assert.deepEqual(authorizeDashboardRoute('/family', { role: 'parent' }), { allowed: true });
assert.equal(authorizeDashboardRoute('/coaches-corner', { role: 'adult_player' }).allowed, false);
assert.equal(authorizeDashboardRoute('/competition', { role: 'league_creator' }).allowed, true);
assert.equal(authorizeDashboardRoute('/club', { role: 'admin', plan_type: 'school' }).allowed, true);
```

Also assert pending deletion short-circuits before `hasTrustedInstitutionAuthority` and `hasActiveSquadAuthority` are called.

- [ ] **Step 2: Run the policy tests and record exact RED or GREEN**

```bash
node --import tsx --test tests/phase9-identity-authorization.test.mjs
```

Expected: all established semantics pass except any real trusted-versus-profile authority mismatch. Preserve the exact failing case and source trace; do not weaken it to match current behavior.

- [ ] **Step 3: If RED, register the defect and implement the minimal authority correction**

If profile-only `superadmin` reaches an admin or independent-authority path, add the next stable defect ID to `docs/qa/production-audit/07-defect-ledger.md` with the local reproduction. Separate the verified claim from the profile role:

```ts
function normalizedClaimRole(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const isTrustedSuperAdmin = normalizedClaimRole(claimsRole) === 'superadmin';
```

Use `isTrustedSuperAdmin` for `/admin` and platform-wide bypasses. Treat a profile-only `superadmin` value as untrusted rather than falling back to it for platform authority. Preserve ordinary `league_creator`, corroborated institution, owner, staff, and parent/player behavior.

If all tests are already GREEN, make no product-source edit and record that this task was a characterization gate, not a repair.

- [ ] **Step 4: Run focused security regressions**

```bash
node --import tsx --test tests/phase9-identity-authorization.test.mjs tests/phase8-account-session.test.mjs tests/security-regressions.test.mjs
```

Expected: PASS for the new functional contract, Phase 8 account/session regressions, and existing security regressions.

- [ ] **Step 5: Commit the policy unit**

If product code changed:

```bash
git add tests/phase9-identity-authorization.test.mjs src/lib/account-session-policy.ts src/lib/dashboard-route-policy.ts src/lib/server-account-session.ts docs/qa/production-audit/07-defect-ledger.md
git commit -m "fix: require trusted platform authority"
```

If no product code changed:

```bash
git add tests/phase9-identity-authorization.test.mjs
git commit -m "test: cover phase 9 identity policy"
```

---

### Task 5: Local foundation verification and implementation review

**Files:**
- Modify if needed after review: only files changed in Tasks 1-4
- Create: `.superpowers/sdd/2026-08-25-phase-9-core-identity-verification/implementation-review.md` (ignored review working note)

**Interfaces:**
- Consumes: completed Tasks 1-4.
- Produces: one reviewed commit eligible for staging deployment.

- [ ] **Step 1: Run focused tests**

```bash
node --import tsx --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs tests/phase9-identity-authorization.test.mjs
```

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run the full verification gate**

```bash
npm run verify
```

Expected: typecheck PASS; ESLint zero errors; Node/component/rules tests PASS; Next production build PASS; Functions build PASS.

- [ ] **Step 3: Run static safety and scope checks**

```bash
git diff --check 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD
git diff --name-only 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD
if git diff -U0 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD -- scripts/qa-fixtures tests src/lib docs/qa \
  | rg -n "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AIza[0-9A-Za-z_-]{20,}|password\s*[:=]\s*['\"][^'\"]+|deleteUsers\(|recursiveDelete\(|listUsers\("; then
  exit 1
fi
git status --short
```

Expected: whitespace clean; only planned files; no credential or broad-delete matches; tracked worktree clean after commits.

- [ ] **Step 4: Request scoped implementation review**

Use `superpowers:requesting-code-review`. Give the reviewer the Phase 9 spec, this plan, base SHA, current head, and exact focus areas:

```text
Review manifest-v2 recovery versus manifest-v3 new runs; complete-journal validation before adapter construction; expected-absence collision/cleanup semantics; resumable pending-deletion checkpoints; claim-only superadmin authority; no broad deletion or credential leakage. Return Critical/Important/Minor findings and a PASS/FAIL verdict.
```

- [ ] **Step 5: Resolve findings with separate RED/GREEN cycles**

For each code finding, reproduce it in the narrowest existing test file, capture RED, implement the minimal fix, rerun focused tests, and commit with `fix: ...`. Evidence-only gaps do not trigger product changes.

- [ ] **Step 6: Re-run focused and full gates at the reviewed head**

```bash
node --import tsx --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs tests/phase9-identity-authorization.test.mjs
npm run verify
git diff --check 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD
git status --short
```

Expected: all PASS and clean. Record `git rev-parse HEAD` as `PHASE9_REVIEWED_SHA` in the private operator note, not as a secret environment value committed to the repository.

---

### Task 6: Stacked PR, CI, and exact staging deployment

**Files:**
- Create after the run: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/02-staging-deployment.md`

**Interfaces:**
- Consumes: independently reviewed exact Phase 9 head from Task 5.
- Produces: successful CI/deployment run URL whose head SHA equals the reviewed commit.

- [ ] **Step 1: Push the Phase 9 branch and create a stacked PR**

```bash
git push -u origin agent/phase9-core-identity-verification
gh pr create \
  --base agent/phase8-confirmed-defect-repair \
  --head agent/phase9-core-identity-verification \
  --title "Phase 9: verify core identity authorization" \
  --body-file .superpowers/sdd/2026-08-25-phase-9-core-identity-verification/pr-body.md
```

The PR body names the spec, local verification, staging-only scope, no-production/no-merge rule, and release `NOT READY` status. It contains no credentials or raw evidence.

- [ ] **Step 2: Wait for stacked PR checks**

```bash
gh pr checks --watch
```

Expected: every required check succeeds. Do not merge.

- [ ] **Step 3: Dispatch the guarded staging workflow for the exact reviewed SHA**

```bash
gh workflow run deploy-staging.yml --ref agent/phase9-core-identity-verification
```

Resolve the new run ID without selecting an older run:

```bash
PHASE9_DEPLOYED_SHA="$(git rev-parse HEAD)"
PHASE9_RUN_ID="$(gh run list \
  --workflow deploy-staging.yml \
  --branch agent/phase9-core-identity-verification \
  --event workflow_dispatch \
  --limit 5 \
  --json databaseId,headSha,createdAt \
  --jq ".[] | select(.headSha == \"$PHASE9_DEPLOYED_SHA\") | .databaseId" \
  | head -n 1)"
test -n "$PHASE9_RUN_ID"
```

Choose only the run whose `headSha` equals `git rev-parse HEAD`, then:

```bash
gh run watch "$PHASE9_RUN_ID" --exit-status
gh run view "$PHASE9_RUN_ID" --json databaseId,headSha,status,conclusion,url,jobs
```

Expected: exact SHA match; staging environment; configuration/project/App Hosting ownership checks PASS; indexes, Functions, rules/storage, App Hosting rollout, and health checks PASS.

- [ ] **Step 4: Write the sanitized deployment record**

Record only staging project ID, canonical origin, exact application SHA, GitHub Actions run link, result, and named successful gates. State explicitly that production was not accessed.

- [ ] **Step 5: Commit the deployment linkage**

```bash
git add docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/02-staging-deployment.md
git commit -m "docs: record phase 9 staging deployment"
```

Do not redeploy this documentation-only commit. The evidence must link the deployed application SHA, not claim the docs commit was deployed.

---

### Task 7: Guarded hosted fixture lifecycle and browser evidence

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/00-environment.md`
- Create: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/01-fixture-lifecycle.md`
- Create: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/03-browser-ledger.md`
- Create: `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/04-cleanup.md`

**Interfaces:**
- Consumes: deployed application SHA, version-3 lifecycle CLI, external ADC/staging credentials, and bundled Playwright CLI.
- Produces: complete sanitized per-context ledger and exact cleanup proof.

- [ ] **Step 1: Load the Playwright execution instructions**

Read `/Users/tylerans/.codex/skills/playwright/SKILL.md` completely. Use its bundled wrapper and system Chrome. Do not install browsers or retain raw session state.

- [ ] **Step 2: Create the guarded external workspace**

```bash
PHASE9_PRIVATE_DIR="$(mktemp -d /tmp/phase9-core-identities.XXXXXX)"
chmod 700 "$PHASE9_PRIVATE_DIR"
PHASE9_MANIFEST="$PHASE9_PRIVATE_DIR/manifest.json"
PHASE9_CREDENTIALS="$PHASE9_PRIVATE_DIR/credentials.json"
test "$(stat -f '%Lp' "$PHASE9_PRIVATE_DIR")" = "700"
```

Arm an EXIT guardian that calls only the exact manifest cleanup command when the manifest exists, removes the validated credential through the lifecycle helper, closes named browser sessions, and removes only `PHASE9_PRIVATE_DIR`. Never use `$HOME`, `~`, a repository root, an unresolved glob, or recursive Firebase deletion.

- [ ] **Step 3: Run exact read-only preflight**

```bash
ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs preflight \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --origin https://studio--the-squad-v2-staging.us-east4.hosted.app
```

Expected sanitized result: exact staging project, exact origin, manifest version 3 plan counts, `safe:true`. Stop before mutation on any mismatch.

- [ ] **Step 4: Seed and inspect the exact v3 graph**

```bash
ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs seed \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST" \
  --credentials "$PHASE9_CREDENTIALS"

ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs inspect \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST"
```

Require `state=seeded`, drift `0`, expected-present counts equal the committed definition, and the missing-profile expected-absence check healthy. Require the credential file mode to be `0600`. Do not print its contents.

- [ ] **Step 5: Capture positive admission and route-policy contexts**

For both viewports, use fresh contexts for Parent A, Adult Player A, Youth Active, League Creator, School Admin, Trusted Superadmin, Fake Superadmin, Missing Profile, and No Team. Arm `pageerror`, application-console, request-failure, request, and response listeners on `about:blank` before login navigation.

Each ledger row must contain:

```text
context ID | alias | viewport | start state | start URL | action |
expected result | final URL | visible state | session presence |
protected request count | protected listener count | relevant HTTP/data result |
page errors | app-console errors | unexpected request failures | overflow | result
```

Directly test `/admin`, `/club`, `/competition`, `/dashboard/billing`, `/coaches-corner`, and `/family` according to Task 4's executable policy. A redirect PASS requires zero protected content flash and zero denied-route protected listeners.

- [ ] **Step 6: Capture symmetric horizontal-isolation contexts**

At both viewports:

- Parent A, Adult Player A, and Youth Active may observe only permitted Team A/linked-player projections.
- Parent B and Adult Player B prove the inverse Team B boundary.
- Substitute the opposite team/player/household IDs in the same-origin UI/API route and direct Firestore GET used by the application.
- Record explicit denial status and verify no opposite-tenant listener starts.
- Do not infer isolation from hidden UI.

- [ ] **Step 7: Capture logout/back and multi-tab invalidation**

Use representative Parent A, Adult Player A, League Creator, School Admin, and Trusted Superadmin contexts. In a shared browser state, open two tabs, log out in one, then focus/reload/back-navigate the second. Require no protected UI restoration, no active session, and no protected request/listener after logout. Open a fresh isolated context and require unauthenticated state.

- [ ] **Step 8: Record pending-delete baseline, transition, and denial**

First record mobile and desktop active baselines for `qa-pending-delete`. Then execute:

```bash
ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs transition \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST" \
  --alias qa-pending-delete
```

Inspect and require final `pending_deletion` state with zero drift. In both viewports, prove the pre-transition session is revoked and a fresh login receives the generic unavailable UI, no session cookie, no protected route, zero protected requests/listeners, zero page/application errors, and no overflow.

- [ ] **Step 9: Apply the defect decision gate**

For a stable product mismatch, stop canonical progression at a safe boundary, retain sanitized evidence, assign the next defect ID, and return to Task 4's root-cause/RED/GREEN discipline. Add a defect-specific amendment to this plan naming the exact source files and test before modifying runtime code. Obtain review, deploy the new exact head, and rerun the complete affected scenario group. Harness timing/reference errors are marked `INCONCLUSIVE-HARNESS`, corrected, and rerun; they are not product defects.

- [ ] **Step 10: Close contexts and perform exact cleanup immediately**

After all canonical contexts are closed:

```bash
ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs inspect \
  --project the-squad-v2-staging --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST"

ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs cleanup \
  --project the-squad-v2-staging --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST"

ALLOW_STAGING_QA_FIXTURES=true node scripts/qa-fixtures/cli.mjs inspect \
  --project the-squad-v2-staging --confirm-project the-squad-v2-staging \
  --manifest "$PHASE9_MANIFEST"
```

Require cleanup retained/failure counts zero. Use a separately initialized adapter, guarded to the exact staging project, to query every manifest-listed UID/path and require `authPresent=0`, `firestorePresent=0`. Remove credentials through `removeCredentialFile()`, prove the path absent, remove the exact private workspace, and prove it absent. Only then disarm the EXIT guardian.

- [ ] **Step 11: Write and sanitize retained evidence**

Write environment, lifecycle, canonical browser ledger, and cleanup Markdown. Retain only aliases, synthetic names, counts, statuses, final URLs, error counts/signatures, exact SHA/run linkage, and cleanup arithmetic. Scan the evidence directory and repository for raw traces, storage state, cookies, passwords, tokens, credential filenames, and non-approved artifacts; delete any temporary raw artifact before commit.

- [ ] **Step 12: Commit hosted evidence**

```bash
git add docs/qa/production-audit/runs/2026-08-25-phase9-core-identities
git commit -m "docs: record phase 9 identity evidence"
```

---

### Task 8: Audit reconciliation and mechanical evidence tests

**Files:**
- Create: `tests/phase9-audit-reconciliation.test.mjs`
- Create: `docs/qa/production-audit/14-phase9-core-identity-verification.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/06-test-account-requirements.md`
- Modify only for reproduced defects: `docs/qa/production-audit/07-defect-ledger.md`

**Interfaces:**
- Consumes: canonical evidence and cleanup package from Task 7.
- Produces: mechanically consistent audit totals and Phase 9 report without overclaiming release readiness.

- [ ] **Step 1: Write failing reconciliation tests before editing audit status**

The new test reads the Phase 9 report and evidence files and asserts:

```js
const exactDeployedSha = deployment.match(/Application revision:\s*`([0-9a-f]{40})`/)?.[1];
assert.ok(exactDeployedSha, 'deployment evidence must contain one exact application SHA');
const runPackage = [environment, lifecycle, deployment, browserLedger, cleanup, report].join('\n');
assert.match(environment, /the-squad-v2-staging/);
assert.match(deployment, new RegExp(exactDeployedSha));
assert.match(cleanup, /authPresent=0/);
assert.match(cleanup, /firestorePresent=0/);
assert.doesNotMatch(runPackage, /__session\s*[=:]\s*[^|\s]+|BEGIN PRIVATE KEY|"password"\s*:/i);
```

Parse every browser ledger row and require all columns named in Task 7. Recompute context IDs for uniqueness, both viewport coverage, group totals, PASS/FAIL/INCONCLUSIVE totals, and closure-critical fields. Parse the matrix and assert `PASS + FAIL + BLOCKED = 88`. Assert every non-empty bug reference exists in the defect ledger and every fixed/verified defect links a RED regression plus hosted retest.

- [ ] **Step 2: Run the reconciliation test and capture RED**

```bash
node --import tsx --test tests/phase9-audit-reconciliation.test.mjs
```

Expected: FAIL until the Phase 9 report and audit updates exist.

- [ ] **Step 3: Reconcile only completed contracts**

Update `06-test-account-requirements.md` to mark only the exact synthetic identities/data made available. In `05-coverage-matrix.md`, preserve `BLOCKED` wherever any required negative, mutation, provider, device, persistence, or role variant remains unexecuted. Move a row to PASS only if every named dimension is present in the canonical ledger. Keep or add `FAIL` only for a reproduced unresolved product defect.

Write `14-phase9-core-identity-verification.md` with:

```text
status and release posture
exact branch/application SHA/workflow linkage
fixture version and exact resource arithmetic
scenario-group totals
verified identity/authority outcomes
defects found/fixed or none reproduced
remaining blocked dimensions
cleanup and credential/workspace absence
no-production/no-merge statement
```

- [ ] **Step 4: Run reconciliation GREEN**

```bash
node --import tsx --test tests/phase9-audit-reconciliation.test.mjs
```

Expected: PASS with exact `88`-row arithmetic, unique browser contexts, complete evidence fields, valid bug linkage, and cleanup `0/0`.

- [ ] **Step 5: Commit audit reconciliation**

```bash
git add tests/phase9-audit-reconciliation.test.mjs \
  docs/qa/production-audit/05-coverage-matrix.md \
  docs/qa/production-audit/06-test-account-requirements.md \
  docs/qa/production-audit/07-defect-ledger.md \
  docs/qa/production-audit/14-phase9-core-identity-verification.md
git commit -m "docs: reconcile phase 9 identity audit"
```

If `07-defect-ledger.md` did not change, omit it from `git add`.

---

### Task 9: Final verification, final review, and unmerged PR handoff

**Files:**
- Modify only for verified review findings: files already in Phase 9 scope
- Create: `.superpowers/sdd/2026-08-25-phase-9-core-identity-verification/final-report.md` (ignored local report)

**Interfaces:**
- Consumes: all Phase 9 implementation, hosted evidence, and audit reconciliation.
- Produces: green unmerged stacked PR and a precise next-step recommendation.

- [ ] **Step 1: Run exact-head focused verification**

```bash
node --import tsx --test tests/qa-fixture-safety.test.mjs tests/repository-hygiene.test.mjs tests/phase9-identity-authorization.test.mjs tests/phase9-audit-reconciliation.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run exact-head full verification**

```bash
npm run verify
```

Expected: all gates PASS; ESLint zero errors; both builds PASS.

- [ ] **Step 3: Run final hygiene and scope checks**

```bash
git diff --check 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD
git diff --name-only 64ffb8d58965ffbc8115d882e545a4798610fa88..HEAD
git status --short
find docs/qa/production-audit/runs/2026-08-25-phase9-core-identities -type f -print | sort
```

Run the repository hygiene test as the authoritative tracked/unignored content scanner. Also confirm no Phase 9 private workspace or credential path remains and no browser session is open.

- [ ] **Step 4: Request final scoped review**

Use `superpowers:requesting-code-review` against the full range `64ffb8d5..HEAD`. Require review of spec/plan compliance, all fixture lifecycle safety, source changes, exact browser evidence, audit arithmetic, credential/artifact hygiene, no-production/no-merge scope, and cleanup proof. Any Critical or Important result blocks completion.

- [ ] **Step 5: Resolve review findings with evidence-first RED/GREEN**

For code findings, add a deterministic failing regression, capture RED, implement the smallest fix, rerun focused/full verification, and obtain a scoped re-review. For evidence findings, rerun the exact browser/backend context only if fixtures can be safely reseeded through a complete fresh lifecycle; never infer missing evidence from adjacent rows.

- [ ] **Step 6: Push final commits and wait for PR checks**

```bash
git push origin agent/phase9-core-identity-verification
gh pr checks --watch
gh pr view --json number,url,headRefName,baseRefName,mergeStateStatus,statusCheckRollup
```

Expected: Phase 9 PR targets `agent/phase8-confirmed-defect-repair`, all checks green, merge state clean or reviewable, and PR remains open/unmerged.

- [ ] **Step 7: Write the final local report and hand off**

Record exact commits, test counts, workflow run, scenario arithmetic, defect outcomes, cleanup `0/0`, credential/workspace absence, PR URL/status, remaining blockers, and release `NOT READY`. Do not claim production readiness and do not merge.
