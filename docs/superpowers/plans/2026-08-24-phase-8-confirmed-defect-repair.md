# Phase 8 Confirmed Defect Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair BUG-006, BUG-007, and BUG-010 without expanding Phase 8 into the remaining blocked production-readiness contracts.

**Architecture:** A pure account-session resolver classifies trusted profile and squad authority state; a server adapter supplies canonical Firestore reads; the session route, dashboard guard, and login client consume one decision contract. The assignments repair first confirms the staging query/index failure, then adds the narrow collection-group index while retaining authorization before query execution. Exact-commit staging evidence uses the existing guarded Phase 7 fixture lifecycle and finishes with independent zero-residue proof.

**Tech Stack:** Next.js 15 App Router, TypeScript, Firebase Admin/Auth/Firestore, Node test runner with `tsx`, Firebase CLI, GitHub Actions, Playwright CLI with system Chrome.

**Spec:** `docs/superpowers/specs/2026-08-24-phase-8-confirmed-defect-repair-design.md`

## Global Constraints

- Work only on `agent/phase8-confirmed-defect-repair`, stacked from `4cbdde6f1130840648df5a36db1909eace26f3b9`.
- Keep Phase 7 PR `#39` unchanged; Phase 8 receives a separate PR based on `agent/phase7-staging-fixture-foundation`.
- Do not deploy to or read from production.
- Do not merge either PR.
- Do not trust user-writable `users/{uid}/teamMemberships/*` documents for authority.
- Suspended/deletion-pending accounts receive no new session cookie.
- Removed members keep account access but receive no stale former-squad authority.
- Multi-squad users retain access through another canonical active membership or ownership.
- Cross-tenant assignments remain `403`, and authorization executes before the collection-group query.
- Use strict RED/GREEN TDD for every product or configuration change.
- Staging fixture/browser work requires exact project guards, a private `0700` workspace, external `0600` credentials, an armed cleanup trap, and final independent Auth/Firestore `0/0` proof.
- Retain only sanitized Markdown and PNG evidence. Retain no cookie, token, password, credential, manifest, raw trace, HAR, provider payload, or private workspace.

---

### Task 1: Trusted account-session decision contract

**Files:**
- Create: `src/lib/account-session-policy.ts`
- Create: `src/lib/server-account-session.ts`
- Test: `tests/phase8-account-session.test.mjs`

**Interfaces:**
- Produces `SessionIdentity`, `AccountSessionProfile`, `AccountAccessReader`, and `AccountSessionDecision`.
- Produces `createAccountSessionResolver(reader)` for deterministic tests.
- Produces `resolveServerAccountSession(identity)` for session and dashboard callers.
- Consumes existing `adminDb` and `getTeamAuthority()`.

- [ ] **Step 1: Write the pure resolver RED tests**

Create table-driven tests that import `createAccountSessionResolver()` and exercise literal expected decisions:

```js
test('session policy denies suspended and deletion-pending profiles', async () => {
  for (const profile of [
    { role: 'Member', accountStatus: 'suspended' },
    { role: 'Member', accountStatus: 'pending_deletion' },
    { role: 'Member', accountStatus: 'active', deletionStatus: 'pending' },
  ]) {
    const resolve = createAccountSessionResolver({
      getProfile: async () => profile,
      hasActiveSquadAuthority: async () => true,
    });
    assert.deepEqual(await resolve({ uid: 'user-1' }), {
      allowed: false,
      code: 'auth/account-unavailable',
    });
  }
});

test('session policy sends a removed sole member to squad join', async () => {
  const profile = { role: 'Member', accountStatus: 'active', activeTeamId: 'team-a' };
  const resolve = createAccountSessionResolver({
    getProfile: async () => profile,
    hasActiveSquadAuthority: async () => false,
  });
  assert.deepEqual(await resolve({ uid: 'user-1' }), {
    allowed: true,
    redirectTo: '/teams/join',
    profile,
  });
});
```

Also cover missing profile → `/onboarding`, active ordinary member → `null`, multi-squad alternate authority → `null`, trusted superadmin/institution/league authority → `null`, and anonymous demo → `null` without reader access.

- [ ] **Step 2: Run the focused tests and capture RED**

Run:

```bash
node --import tsx --test tests/phase8-account-session.test.mjs
```

Expected: failure because `src/lib/account-session-policy.ts` does not exist.

- [ ] **Step 3: Implement the pure resolver**

Create the following public contract:

```ts
export type SessionIdentity = {
  uid: string;
  role?: string;
  signInProvider?: string;
};

export type AccountSessionProfile = {
  role?: string | null;
  accountStatus?: string | null;
  deletionStatus?: string | null;
  activeTeamId?: string | null;
  isSchoolAdmin?: boolean;
  isPrimaryClubAuthority?: boolean;
};

export type AccountAccessReader = {
  getProfile(uid: string): Promise<AccountSessionProfile | null>;
  hasActiveSquadAuthority(uid: string, activeTeamId?: string | null): Promise<boolean>;
};

export type AccountSessionDecision =
  | { allowed: false; code: 'auth/account-unavailable' }
  | {
      allowed: true;
      redirectTo: '/onboarding' | '/teams/join' | null;
      profile: AccountSessionProfile | null;
    };
```

`createAccountSessionResolver(reader)` must:

1. immediately allow anonymous identities without calling the reader;
2. return `/onboarding` for a missing profile;
3. deny the three inactive account states before squad lookup;
4. bypass squad lookup only for trusted claim role `superadmin` or profile roles/flags with independent institution or league authority;
5. call `hasActiveSquadAuthority(uid, profile.activeTeamId)` for squad-scoped profiles;
6. return normal access on true and `/teams/join` on false.

- [ ] **Step 4: Run the resolver tests and capture GREEN**

Run the Step 2 command. Expected: all tests pass and reader call-count assertions prove denied/anonymous/independent-authority branches do not query squad authority.

- [ ] **Step 5: Add the Firestore-backed server adapter under a second RED**

Extend the test file with an injected-reader characterization proving that:

- an active `activeTeamId` direct member or owner is accepted;
- if the selected squad is stale, a different active canonical member or owned squad is accepted;
- removed/deleted member rows are ignored;
- membership-cache documents are never consulted.

The production adapter in `server-account-session.ts` must:

```ts
export async function resolveServerAccountSession(
  identity: SessionIdentity,
): Promise<AccountSessionDecision>;
```

Its reader fetches `users/{uid}`, checks `getTeamAuthority()` for the selected squad, then uses bounded canonical queries only when needed:

```ts
adminDb.collectionGroup('members').where('userId', '==', uid).limit(20)
adminDb.collection('teams').where('ownerUserId', '==', uid).limit(1)
```

Filter member rows with `status !== 'removed'` and `isDeleted !== true`. Do not read `teamMemberships`.

- [ ] **Step 6: Run Task 1 tests and commit**

Run:

```bash
node --import tsx --test tests/phase8-account-session.test.mjs
npm run typecheck
git diff --check
```

Commit:

```bash
git add src/lib/account-session-policy.ts src/lib/server-account-session.ts tests/phase8-account-session.test.mjs
git commit -m "feat: enforce trusted account session state"
```

---

### Task 2: Wire session, dashboard, and login boundaries

**Files:**
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/lib/server-dashboard-auth.ts`
- Modify: `src/lib/client-auth.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `tests/account-authentication.test.mjs`
- Test: `tests/phase8-account-session.test.mjs`

**Interfaces:**
- Consumes `resolveServerAccountSession(identity)` from Task 1.
- Changes `establishBrowserSession(user)` to return `{ redirectTo: '/onboarding' | '/teams/join' | null }`.
- Preserves the existing Firebase ID-token verification, session-cookie options, and normal role landing logic.

- [ ] **Step 1: Write session-boundary RED assertions**

Extend `tests/account-authentication.test.mjs` to require:

```js
assert.match(sessionRoute, /resolveServerAccountSession/);
assert.ok(
  sessionRoute.indexOf('resolveServerAccountSession') <
    sessionRoute.indexOf('createSessionCookie'),
  'trusted account state must resolve before cookie creation',
);
assert.match(sessionRoute, /auth\/account-unavailable/);
assert.match(sessionRoute, /redirectTo/);
assert.match(dashboardGuard, /resolveServerAccountSession/);
assert.match(clientAuth, /redirectTo/);
assert.match(login, /await signOut\(auth\)/);
assert.match(login, /session\.redirectTo/);
```

Add a behavioral test to the Phase 8 file that feeds denied and neutral decisions through extracted response helpers if route composition introduces them. Assert denied responses have no `set-cookie` value containing `__session=`.

- [ ] **Step 2: Run the RED tests**

Run:

```bash
node --import tsx --test tests/account-authentication.test.mjs tests/phase8-account-session.test.mjs
```

Expected: the new wiring assertions fail against the current route/client.

- [ ] **Step 3: Gate POST and GET session handling**

In `POST`, after `verifyFirebaseToken()` and before `createSessionCookie()`:

```ts
const access = await resolveServerAccountSession({
  uid: auth.uid,
  role: auth.role,
  signInProvider: auth.signInProvider,
});
if (!access.allowed) {
  return NextResponse.json(
    { error: 'This account is unavailable.', code: access.code },
    { status: 403 },
  );
}
```

Create the cookie only after the decision and return:

```ts
NextResponse.json({ ok: true, redirectTo: access.redirectTo })
```

In `GET`, resolve the same identity after cookie verification. A denied result returns `403`, reports `authenticated: false`, and clears `__session`. An allowed result reports the trusted `redirectTo`. Resolver/service failure returns sanitized `503` and never creates a cookie.

- [ ] **Step 4: Reuse the resolver in the dashboard server guard**

Replace the independent profile fetch with the resolver result. Apply decisions in this order:

1. invalid/revoked cookie → existing invalid-session redirect;
2. denied account → `/login?reason=unavailable`;
3. `/onboarding` decision → `/onboarding`;
4. `/teams/join` decision → redirect there unless the current pathname is already `/teams/join`;
5. normal decision → call `authorizeDashboardRoute()` with `access.profile`.

- [ ] **Step 5: Consume the trusted redirect and clear denied client state**

Change `establishBrowserSession()` to parse and validate the JSON destination:

```ts
export type BrowserSessionResult = {
  redirectTo: '/onboarding' | '/teams/join' | null;
};
```

On non-OK responses, throw the existing generic session setup error with a non-enumerating internal `code` only. In the login effect:

```ts
try {
  const session = await establishBrowserSession(user);
  if (session.redirectTo) {
    router.replace(session.redirectTo);
    setIsLoading(false);
    return;
  }
} catch {
  await clearBrowserSession();
  await signOut(auth);
  setIsLoading(false);
  toast({
    title: 'Login Failed',
    description: 'The email or password is incorrect, or this account is unavailable.',
    variant: 'destructive',
  });
  return;
}
```

Preserve the existing profile email synchronization and role landing for normal access.

- [ ] **Step 6: Run Task 2 GREEN and compatibility tests**

Run:

```bash
node --import tsx --test tests/account-authentication.test.mjs tests/dashboard-route-policy.test.mjs tests/phase8-account-session.test.mjs
npm run typecheck
git diff --check
```

Expected: all pass; existing unverified, anonymous-demo, trusted-superadmin, sensitive-route revocation, and role landing assertions remain green.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/app/api/auth/session/route.ts src/lib/server-dashboard-auth.ts src/lib/client-auth.ts src/app/login/page.tsx tests/account-authentication.test.mjs tests/phase8-account-session.test.mjs
git commit -m "fix: enforce session and squad admission"
```

---

### Task 3: Confirm and repair the assignments query boundary

**Files:**
- Modify: `firestore.indexes.json`
- Modify: `src/app/api/leagues/assignments/route.ts`
- Create: `tests/phase8-league-assignments.test.mjs`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/01-root-cause.md`

**Interfaces:**
- Preserves `GET /api/leagues/assignments?teamId=<id>`.
- Authorized response remains `{ assignments: RegistrationEntry[] }` with limit 200.
- Produces one ascending `COLLECTION_GROUP` field override for `registrationEntries.assigned_team_id` only if the exact staging read-only probe confirms the index failure.

- [ ] **Step 1: Run the guarded read-only staging root-cause probe**

Use the fixture preflight command with the exact staging project confirmations and canonical origin. After it resolves only `the-squad-v2-staging`, execute a read-only Admin query using the same ADC context:

```ts
adminDb.collectionGroup('registrationEntries')
  .where('assigned_team_id', '==', 'qa-phase8-index-probe-no-document')
  .limit(1)
  .get()
```

Retain only project ID, operation name, sanitized Firebase error code, and pass/fail. Do not retain an index-creation URL, credential metadata, token, or raw provider payload. Expected pre-fix result: `FAILED_PRECONDITION`/missing collection-group index. If the code differs, stop Task 3 and revise the design.

- [ ] **Step 2: Write the index and route RED tests**

Create tests that parse `firestore.indexes.json` and assert exactly one matching field override:

```js
assert.deepEqual(
  indexes.fieldOverrides.filter(item =>
    item.collectionGroup === 'registrationEntries' &&
    item.fieldPath === 'assigned_team_id'
  ),
  [{
    collectionGroup: 'registrationEntries',
    fieldPath: 'assigned_team_id',
    indexes: [{ order: 'ASCENDING', queryScope: 'COLLECTION_GROUP' }],
  }],
);
```

Require source ordering that `getTeamAuthority()` and the `403` branch precede `collectionGroup('registrationEntries')`. Require a bounded `.limit(200)`, a successful empty-array response, and a sanitized query-unavailable response.

- [ ] **Step 3: Run RED**

Run:

```bash
node --import tsx --test tests/phase8-league-assignments.test.mjs
```

Expected: fail because the field override and query error boundary are absent.

- [ ] **Step 4: Add the narrow index and GET error boundary**

Append this exact field override without changing unrelated indexes:

```json
{
  "collectionGroup": "registrationEntries",
  "fieldPath": "assigned_team_id",
  "indexes": [
    { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" }
  ]
}
```

Keep authorization outside the query `try`. Wrap only the collection-group read/mapping; log a stable server label plus provider code, and return:

```ts
NextResponse.json(
  { error: 'League assignments are temporarily unavailable.' },
  { status: 503 },
)
```

Do not include the provider message or index URL in the response.

- [ ] **Step 5: Run GREEN and configuration validation**

Run:

```bash
node --import tsx --test tests/phase8-league-assignments.test.mjs tests/preview-regressions.test.mjs
node -e "JSON.parse(require('node:fs').readFileSync('firestore.indexes.json', 'utf8'))"
npm run typecheck
git diff --check
```

Expected: tests pass and `firestore.indexes.json` remains valid JSON.

- [ ] **Step 6: Record sanitized root cause and commit**

Document that the authorized route reached the collection-group query and the guarded read-only staging probe confirmed the missing index. Record no raw URL or credentials.

```bash
git add firestore.indexes.json src/app/api/leagues/assignments/route.ts tests/phase8-league-assignments.test.mjs docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/01-root-cause.md
git commit -m "fix: restore authorized league assignment reads"
```

---

### Task 4: Local integration verification and review

**Files:**
- Modify only if required by a verified Task 1–3 defect.

**Interfaces:**
- Consumes all Task 1–3 commits.
- Produces one exact commit eligible for staging deployment.

- [ ] **Step 1: Run focused integration tests**

```bash
node --import tsx --test tests/phase8-account-session.test.mjs tests/phase8-league-assignments.test.mjs tests/account-authentication.test.mjs tests/dashboard-route-policy.test.mjs tests/preview-regressions.test.mjs tests/security-regressions.test.mjs
```

- [ ] **Step 2: Run the full local gate**

```bash
npm run verify
git diff --check 4cbdde6f1130840648df5a36db1909eace26f3b9..HEAD
git status --short
```

Expected: typecheck, ESLint with zero errors, Node/component tests, rules tests, Next production build, and Functions build pass; status is clean.

- [ ] **Step 3: Run security and scope scans**

Scan the full Phase 8 range for credential material, fixture artifacts, broad-delete APIs, production identifiers, and unintended files. Expected: zero actionable matches; canonical public `public/manifest.json` is not a fixture artifact.

- [ ] **Step 4: Request independent code review**

Review each task commit against the spec, with particular attention to:

- no cookie before account resolution;
- anonymous, onboarding, independent-authority, and multi-squad compatibility;
- no membership-cache trust;
- no redirect loop at `/teams/join`;
- authorization-before-query ordering;
- exact index scope and sanitized failures.

Fix Critical and Important findings under separate RED/GREEN cycles. Repeat focused/full verification after fixes. Commit only verified changes.

---

### Task 5: Exact-commit staging deployment and browser proof

**Files:**
- Create: `docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/02-staging-deployment.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/03-browser-ledger.md`
- Create: `docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/04-cleanup.md`
- Create: sanitized PNGs only under `docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects/screenshots/` when they materially prove the final state.

**Interfaces:**
- Consumes the guarded `deploy-staging.yml` workflow and Phase 7 fixture CLI.
- Produces exact-commit deployment proof, a canonical browser ledger, and exact cleanup proof.

- [ ] **Step 1: Push the reviewed Phase 8 branch and dispatch staging deployment**

```bash
git push -u origin agent/phase8-confirmed-defect-repair
gh workflow run deploy-staging.yml --ref agent/phase8-confirmed-defect-repair
```

Monitor the exact run until verification, project/backend ownership validation, index deployment, Functions/rules deployment, App Hosting rollout, and health check all pass. Record exact commit and run URL. Stop on any non-green job.

- [ ] **Step 2: Create a guarded private fixture workspace**

Create a fresh `mktemp -d` directory, set mode `0700`, arm an EXIT cleanup guardian before seed, and write credentials only through the lifecycle CLI to an external `0600` path. Run exact staging preflight, seed, and inspect. Confirm 9 Auth identities, 40 Firestore paths, two teams, zero manifest problems, and exact staging project resolution.

- [ ] **Step 3: Capture positive baselines before transitions**

With Playwright CLI using system Chrome and listeners armed before first staging navigation:

- verify `qa-suspended` active baseline at 390x844 and 1440x900;
- verify `qa-removed-member` active baseline at both viewports;
- verify Team A owner and Team B owner normal session/team access.

Use a new isolated context for every row. Retain no storage state.

- [ ] **Step 4: Apply guarded negative transitions and verify BUG-006/007**

Run the exact CLI transitions for `qa-suspended` and `qa-removed-member`, then inspect their final states and revocation checkpoints.

Fresh contexts at both viewports must prove:

- suspended login: session POST `403`, no `__session`, final `/login`, generic unavailable message, zero protected requests/listeners, page errors 0;
- removed-member login: session POST `200`, `__session` present, final `/teams/join`, former Team A direct read `403`, no former-team listener, page errors 0.

- [ ] **Step 5: Verify BUG-010 symmetrically**

In separate fresh owner contexts:

- Team A owner + Team A query → `200` and array response;
- Team A owner + Team B query → `403`;
- Team B owner + Team B query → `200` and array response;
- Team B owner + Team A query → `403`;
- direct cross-tenant Firestore GET/PATCH remain denied;
- page errors and horizontal overflow remain zero.

- [ ] **Step 6: Execute exact cleanup before documentation**

Close every browser context. Run inspect-cleanup-inspect. Require cleanup retained count zero, then independently prove exact manifest Auth present `0` and Firestore present `0`. Remove the external credential through the validated helper, terminate the guardian, remove the private workspace, and prove both paths absent. If any invariant fails, stop and repair cleanup before proceeding.

- [ ] **Step 7: Write sanitized evidence and commit**

Record one row per context with stable ID, alias, viewport, start state, action, expected result, final URL, visible state, relevant HTTP statuses, session presence, page-error state/count, application-console count, request failures, overflow, and verdict. Record exact deployment and cleanup proof.

```bash
git add docs/qa/production-audit/runs/2026-08-24-phase8-confirmed-defects
git commit -m "test: verify phase 8 repairs on staging"
```

---

### Task 6: Audit reconciliation, final review, and stacked PR

**Files:**
- Modify: `docs/qa/production-audit/07-defect-ledger.md`
- Modify: `docs/qa/production-audit/05-coverage-matrix.md`
- Modify: `docs/qa/production-audit/12-phase7-staging-fixture-foundation.md`
- Create: `docs/qa/production-audit/13-phase8-confirmed-defect-repair.md`

**Interfaces:**
- Consumes Task 5 canonical staging evidence.
- Produces the final Phase 8 audit state and stacked PR.

- [ ] **Step 1: Update only evidence-supported audit rows**

- Close BUG-006 only after both suspended contexts meet every fail-closed invariant.
- Close BUG-007 as stale squad-context routing; explicitly record the approved account-session semantics and former-team `403`.
- Close BUG-010 only after both own-team `200` and both changed-team `403` checks pass.
- Change matrix rows 4, 12, and 53 only to the state justified by fresh evidence; keep unexecuted variants visible.
- Keep the overall release `NOT READY` because 83 contracts remain outside Phase 8.

- [ ] **Step 2: Run documentation arithmetic and linkage tests**

Update or add Node tests that assert defect IDs, matrix statuses, evidence links, and PASS/FAIL/BLOCKED arithmetic agree. Run them RED before doc changes and GREEN after reconciliation.

- [ ] **Step 3: Run final exact-head verification**

```bash
npm run verify
git diff --check 4cbdde6f1130840648df5a36db1909eace26f3b9..HEAD
git status --short
```

Repeat full-range secret/artifact/broad-delete scans and confirm the private fixture workspace, manifest, credential, and raw browser material are absent.

- [ ] **Step 4: Request final scoped review**

Review the complete Phase 8 range against the approved spec and Tasks 1–6. No Critical or Important finding may remain. Any code correction requires a new RED/GREEN cycle and exact-head verification.

- [ ] **Step 5: Commit reconciliation and push**

```bash
git add docs/qa/production-audit tests
git commit -m "docs: reconcile phase 8 production audit"
git push
```

- [ ] **Step 6: Open the stacked PR and monitor CI**

Create the PR with:

- base `agent/phase7-staging-fixture-foundation`;
- head `agent/phase8-confirmed-defect-repair`;
- exact defect summary and test counts;
- staging deployment/cleanup evidence;
- explicit `NOT READY` release posture;
- explicit no-merge instruction.

Monitor every required check to completion. Leave both PRs open and unmerged. Preserve the worktree for review feedback.
