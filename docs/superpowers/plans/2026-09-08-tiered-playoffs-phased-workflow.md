# Tiered Playoffs Phased Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers create a zero-team Tiered Playoffs draft, enroll teams and schedule preliminaries without playoff divisions, then configure and schedule divisions only after every preliminary result is complete and undisputed.

**Architecture:** Keep the existing event document and Tiered modules, but make validation explicitly stage-aware. The lifecycle route owns draft creation and roster/logistics edits, the schedule route owns preliminary deployment, and the Tiered command route owns the post-preliminary division/seeding/bracket transition. A pure organizer-state helper drives phase-specific UI so server and browser behavior share observable lifecycle rules without changing legacy formats.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin/Firestore transactions, Node test runner with `tsx`, Playwright CLI, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-tiered-playoffs-design.md`

## Global Constraints

- `tiered_playoffs` remains additive; Round Robin, Pool Play & Playoffs, Single Elimination, and Double Elimination behavior stays frozen.
- Existing Tournament records are not migrated, converted, deleted, or rewritten.
- Existing Tiered records with division definitions remain compatible.
- Division definitions are absent during draft and preliminary phases and required only for playoff setup.
- No production code is written before the relevant regression test fails for the intended missing behavior.
- Existing authority, entitlement, idempotency, versioning, audit, schedule-lock, and public-projection boundaries remain authoritative.
- Unpublished playoff placement and brackets remain private.
- The System Architect becomes lighter and higher contrast without redesigning unrelated Tournament pages.
- Existing generated files under `functions/lib` remain unstaged and untouched.

---

### Task 1: Make Tiered configuration validation phase-aware

**Files:**
- Modify: `src/lib/tiered-playoffs/types.ts`
- Modify: `src/lib/tiered-playoffs/config.ts`
- Test: `tests/tiered-playoffs-types.test.mjs`

**Interfaces:**
- Produces: `type TieredValidationStage = 'draft' | 'preliminary' | 'playoffs'`.
- Produces: `validateTieredPlayoffsConfig(value, teamCount, stage?: TieredValidationStage)`; omitted stage remains strict playoff validation for backwards compatibility.
- Produces: `buildTieredPlayoffsDraftConfig(input)` with valid preliminary/standings settings, empty `divisions.definitions`, pending seeding, and pending playoffs.
- Preserves: `buildTieredPlayoffsConfig(input)` as the strict fully configured builder used by existing tests and records.

- [ ] **Step 1: Add failing phase-validation tests**

```js
test('a Tiered draft permits zero teams and no playoff divisions', () => {
  const draft = structuredClone(validConfig);
  draft.divisions.definitions = [];
  assert.deepEqual(validateTieredPlayoffsConfig(draft, 0, 'draft'), { valid: true, errors: [] });
  assert.equal(validateTieredPlayoffsConfig(draft, 0, 'playoffs').valid, false);
});

test('preliminary validation permits empty divisions but requires two teams', () => {
  const draft = structuredClone(validConfig);
  draft.divisions.definitions = [];
  assert.equal(validateTieredPlayoffsConfig(draft, 2, 'preliminary').valid, true);
  assert.equal(validateTieredPlayoffsConfig(draft, 1, 'preliminary').valid, false);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --import tsx --test tests/tiered-playoffs-types.test.mjs`

Expected: FAIL because the validator ignores the stage and rejects empty divisions.

- [ ] **Step 3: Implement stage-aware validation and the draft builder**

```ts
export type TieredValidationStage = 'draft' | 'preliminary' | 'playoffs';

export function validateTieredPlayoffsConfig(
  value: unknown,
  teamCount: number,
  stage: TieredValidationStage = 'playoffs',
): TieredPlayoffsValidation {
  // Always validate schema, preliminary rules, standings, and state shape.
  // Require teamCount >= 2 for preliminary/playoffs.
  // Require definitions and exact team coverage only for playoffs.
}
```

`buildTieredPlayoffsDraftConfig` must reuse the same normalization as the strict builder and emit `definitions: []`; it must not invent names, sizes, seeds, or playoff games.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --import tsx --test tests/tiered-playoffs-types.test.mjs`

Expected: all Tiered type tests PASS.

- [ ] **Step 5: Commit the contract change**

```bash
git add src/lib/tiered-playoffs/types.ts src/lib/tiered-playoffs/config.ts tests/tiered-playoffs-types.test.mjs
git commit -m "fix: separate tiered draft and playoff validation"
```

### Task 2: Allow zero-team Tiered draft creation and later enrollment

**Files:**
- Modify: `src/app/api/tournaments/lifecycle/route.ts`
- Test: `tests/tournament-lifecycle-route.test.mjs`

**Interfaces:**
- Consumes: `validateTieredPlayoffsConfig(value, teamCount, 'draft' | 'preliminary' | 'playoffs')`.
- Produces: lifecycle `create` support for a single Tiered draft with `tournamentTeamsData: []`, `tournamentTeams: []`, `selectedFields: []`, `dailyWindows: []`, and empty division definitions.
- Preserves: strict creation validation for every non-Tiered format.

- [ ] **Step 1: Add a failing lifecycle test for a zero-team Tiered draft**

```js
test('Tiered creation stores a zero-team draft without fields or playoff divisions', async () => {
  const draft = {
    ...blueprint,
    tournamentType: 'tiered_playoffs',
    tournamentTeamsData: [],
    tournamentTeams: [],
    selectedFields: [],
    dailyWindows: [],
    tieredPlayoffs: tieredDraftConfig,
  };
  const response = await call(db, {
    action: 'create',
    requestId: 'tiered-draft-create-0001',
    teamId: 'team-a',
    payload: { divisions: [draft] },
  });
  assert.equal(response.status, 200);
  const stored = [...records.entries()].find(([path]) => path.startsWith('teams/team-a/events/trn_'))[1];
  assert.deepEqual(stored.tournamentTeamsData, []);
  assert.deepEqual(stored.tieredPlayoffs.divisions.definitions, []);
});
```

- [ ] **Step 2: Run the lifecycle test and verify RED**

Run: `node --import tsx --test --test-name-pattern='zero-team Tiered draft' tests/tournament-lifecycle-route.test.mjs`

Expected: HTTP 400 from field/window or strict Tiered division validation.

- [ ] **Step 3: Implement operation-specific lifecycle validation**

Refactor the local validator to accept a lifecycle context, not a blanket `allowEmptyRoster` boolean:

```ts
type ValidationContext = 'create' | 'configure' | 'replicate';

function validate(data: DocumentData, context: ValidationContext): void {
  const tieredDraft = data.tournamentType === 'tiered_playoffs' &&
    context === 'create' && !hasSchedule(data);
  // Always validate identity/date/format and safe scalar bounds.
  // Skip roster, field, and daily-window minimums only for tieredDraft.
  // Validate Tiered configuration at 'draft' for tieredDraft and at
  // 'preliminary' or 'playoffs' according to persisted phase otherwise.
}
```

Roster and logistics edits before schedule deployment remain allowed through `configure`; after a schedule exists, the existing schedule-field lock remains unchanged.

- [ ] **Step 4: Add negative and compatibility cases**

Assert that an empty Round Robin creation still returns 400, duplicate team identities still return 400, a non-Pro team still receives 403, and an existing fully configured Tiered event still configures successfully.

- [ ] **Step 5: Run focused lifecycle and replication regression**

Run: `node --import tsx --test tests/tournament-lifecycle-route.test.mjs tests/tournament-replication.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the draft lifecycle**

```bash
git add src/app/api/tournaments/lifecycle/route.ts tests/tournament-lifecycle-route.test.mjs
git commit -m "feat: create tiered tournaments as enrollment drafts"
```

### Task 3: Deploy preliminary schedules without playoff divisions

**Files:**
- Modify: `src/lib/server-tournament-schedule-deployment.ts`
- Modify only if required by the failing test: `src/lib/intelligent-scheduler.ts`
- Test: `tests/tournament-schedule-route.test.mjs`
- Test: `tests/tiered-playoffs-schedule.test.mjs`

**Interfaces:**
- Consumes: stage-aware Tiered validation.
- Produces: preliminary schedule deployment for a Tiered event whose `divisions.definitions` is empty.
- Rejects: fewer than two eligible teams, missing fields/windows, infeasible capacity, malformed games, or any playoff-phase game in the preliminary deployment request.

- [ ] **Step 1: Add a failing route test for preliminary-only deployment**

Create a real Tiered event fixture with four teams, valid fields/windows, valid preliminary games, and empty division definitions. Call the existing schedule deployment boundary and assert HTTP 200, persisted `phase: 'preliminary'` games, and still-empty division definitions.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test --test-name-pattern='without playoff divisions' tests/tournament-schedule-route.test.mjs`

Expected: FAIL with `At least one playoff division is required.`

- [ ] **Step 3: Validate deployment at the preliminary stage**

In the Tiered branch, call:

```ts
validateTieredPlayoffsConfig(event.tieredPlayoffs, teamCount, 'preliminary');
```

Continue to use the existing Tiered schedule validator for games, resources, windows, rest, and capacity. Explicitly reject `game.phase === 'playoff'` at this boundary.

- [ ] **Step 4: Add negative scheduling cases**

Assert exact failures for zero/one team, empty fields, empty windows, and a submitted playoff-phase game. Assert that representative Round Robin and Pool Play scheduling results are unchanged.

- [ ] **Step 5: Run focused schedule regression**

Run: `node --import tsx --test tests/tiered-playoffs-schedule.test.mjs tests/tournament-schedule-route.test.mjs tests/scheduler-integrity.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit preliminary deployment support**

```bash
git add src/lib/server-tournament-schedule-deployment.ts src/lib/intelligent-scheduler.ts tests/tournament-schedule-route.test.mjs tests/tiered-playoffs-schedule.test.mjs
git commit -m "fix: deploy tiered preliminaries before playoff setup"
```

### Task 4: Configure divisions only after preliminary completion

**Files:**
- Modify: `src/lib/server-tiered-playoffs.ts`
- Modify: `src/app/api/tournaments/tiered-playoffs/route.ts` only if its payload allowlist requires the new command
- Test: `tests/tiered-playoffs-route.test.mjs`

**Interfaces:**
- Produces command: `configure-divisions`.
- Payload: `{ sizing: 'automatic' | 'custom'; divisionNames: string[]; divisionSizes?: number[]; avoidPreliminaryRematches: boolean }`.
- Returns: `{ success: true; lifecycleVersion; scheduleVersion; divisions }`.
- Requires: all eligible preliminary games completed and undisputed, at least two eligible teams, exact current versions, current Pro entitlement, and current organizer authority.

- [ ] **Step 1: Add failing command tests**

```js
test('division configuration is blocked until every preliminary result is final', async () => {
  const response = await call(db, command('configure-divisions', 1, {
    sizing: 'automatic', divisionNames: ['Gold', 'Silver'], avoidPreliminaryRematches: true,
  }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'PRELIMINARY_RESULTS_INCOMPLETE');
});

test('completed preliminaries accept exact division coverage once', async () => {
  const first = await call(completedDb, command('configure-divisions', 1, {
    sizing: 'custom', divisionNames: ['Gold', 'Silver'], divisionSizes: [2, 2], avoidPreliminaryRematches: true,
  }));
  assert.equal(first.status, 200);
  assert.deepEqual(stored.tieredPlayoffs.divisions.definitions.map(row => row.size), [2, 2]);
});
```

- [ ] **Step 2: Run focused command tests and verify RED**

Run: `node --import tsx --test --test-name-pattern='division configuration' tests/tiered-playoffs-route.test.mjs`

Expected: FAIL with `INVALID_COMMAND` because `configure-divisions` is absent.

- [ ] **Step 3: Implement the transactional command**

The command must call `requirePreliminaryResults(source)` before building definitions, normalize names case-insensitively, allocate automatic sizes or validate exact custom totals, then validate the next configuration with stage `playoffs`. It resets only unlocked seeding state and cannot overwrite generated/published/started playoffs.

- [ ] **Step 4: Add authorization, replay, and state negatives**

Assert denial for athlete, removed staff, foreign tenant, stale versions, duplicate names, one-team divisions, wrong total, changed replay payload, generated bracket, and published playoff states. Assert exact replay returns one receipt and creates one audit record.

- [ ] **Step 5: Run route, scoring, and public privacy regression**

Run: `node --import tsx --test tests/tiered-playoffs-route.test.mjs tests/tournament-scoring-route.test.mjs tests/tiered-playoffs-public-dto.test.mjs`

Expected: all tests PASS and unpublished definitions/seeds remain absent from public DTOs.

- [ ] **Step 6: Commit post-preliminary configuration**

```bash
git add src/lib/server-tiered-playoffs.ts src/app/api/tournaments/tiered-playoffs/route.ts tests/tiered-playoffs-route.test.mjs
git commit -m "feat: configure playoff divisions after preliminaries"
```

### Task 5: Present the phased organizer workflow in a lighter System Architect

**Files:**
- Create: `src/lib/tiered-playoffs/organizer-state.ts`
- Create: `src/components/tournaments/TieredPlayoffSetupDialog.tsx`
- Modify: `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
- Test: `tests/tiered-playoffs-organizer-state.test.mjs`
- Test: `tests/tiered-playoffs-ui-contract.test.mjs`

**Interfaces:**
- Produces: `tieredOrganizerState(event): { stage; completed; total; blockingGameIds; primaryAction }`.
- `stage`: `'enrollment' | 'preliminary_setup' | 'preliminary_in_progress' | 'playoff_setup' | 'seeding_review' | 'playoffs_ready' | 'playoffs_in_progress' | 'complete'`.
- `primaryAction`: `null | 'generate_preliminaries' | 'schedule_playoffs' | 'review_seeding' | 'publish_playoffs'`.
- Produces: `TieredPlayoffSetupDialog` that submits only the `configure-divisions` payload.

- [ ] **Step 1: Add failing pure state tests**

Use literal events to assert:

```js
assert.deepEqual(tieredOrganizerState(zeroTeamDraft), {
  stage: 'enrollment', completed: 0, total: 0,
  blockingGameIds: [], primaryAction: null,
});
assert.equal(tieredOrganizerState(oneIncompleteGame).primaryAction, null);
assert.equal(tieredOrganizerState(allFinalPreliminaries).primaryAction, 'schedule_playoffs');
assert.equal(tieredOrganizerState(oneDisputedGame).primaryAction, null);
```

- [ ] **Step 2: Run the state tests and verify RED**

Run: `node --import tsx --test tests/tiered-playoffs-organizer-state.test.mjs`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the pure organizer state**

Count only non-playoff games between eligible teams. A game is complete only when `isCompleted === true` and `isDisputed !== true`. Never infer completion from a displayed score alone.

- [ ] **Step 4: Change draft creation UI**

For `tiered_playoffs`, replace the creation-time division inputs with explanatory copy and a `Create Tournament Draft` action. That action uses `buildTieredPlayoffsDraftConfig`, permits an empty roster/logistics, and does not invoke roster validation. The saved Tournament detail retains existing add/import/registration controls and exposes `Generate Preliminary Schedule` only after prerequisites are present.

- [ ] **Step 5: Add the obvious preliminary completion transition**

Render progress as `Preliminary results: {completed} of {total} final`. When blocked, list incomplete/disputed fixtures. When complete, render a high-contrast panel headed `Preliminary Round Complete` with one primary `Schedule Playoffs` button. The button opens `TieredPlayoffSetupDialog`; successful configuration refreshes the event and exposes the existing seeding review/lock/generate/publish controls with user-facing playoff terminology.

- [ ] **Step 6: Apply the light high-contrast System Architect palette**

Change only the creation dialog shell and its internal navigation/cards/inputs from near-black surfaces to white/soft-gray surfaces, black primary text, muted-gray secondary text, red active accents, and visible borders. Preserve existing responsive grid structure, Radix scroll containment, control names, and focus behavior.

- [ ] **Step 7: Run focused UI and type checks**

Run:

```bash
node --import tsx --test tests/tiered-playoffs-organizer-state.test.mjs tests/tiered-playoffs-ui-contract.test.mjs
npm run typecheck
npm run lint -- --quiet
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit the organizer workflow**

```bash
git add src/lib/tiered-playoffs/organizer-state.ts src/components/tournaments/TieredPlayoffSetupDialog.tsx 'src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx' tests/tiered-playoffs-organizer-state.test.mjs tests/tiered-playoffs-ui-contract.test.mjs
git commit -m "feat: guide organizers through tiered tournament phases"
```

### Task 6: Verify, release, and prove the production repair

**Files:**
- Modify: `docs/qa/production-audit/runs/2026-09-08-tiered-playoffs/verification.md`
- Test: existing Tiered, Tournament, rules, and browser suites

**Interfaces:**
- Proves the exact candidate revision through local, CI, deployment, and live-browser boundaries.
- Does not require physical-device evidence because this workflow is browser-verifiable.

- [ ] **Step 1: Run the complete Tiered and Tournament regression set**

```bash
node --import tsx --test tests/tiered-playoffs-*.test.mjs tests/tournament-*.test.mjs
npm run test:rules
npm run typecheck
npm run lint -- --quiet
npm run build
npm --prefix functions run build
npm test
```

Expected: zero failures and zero lint errors.

- [ ] **Step 2: Run Playwright desktop workflow**

Using isolated local/emulator data, create a zero-team Tiered draft, reload it, add teams, configure preliminary logistics, generate the preliminary schedule without divisions, enter all but one result, verify `Schedule Playoffs` is unavailable, enter the last result, configure divisions, review/lock seeds, generate and publish playoff brackets, then reload and verify persistence. Capture console errors and unexpected 4xx/5xx responses; expected negative-case 409 responses must be asserted explicitly.

- [ ] **Step 3: Run Playwright mobile workflow**

Repeat the draft, enrollment state, result-progress panel, and post-preliminary setup transition at 390×844. Assert `document.documentElement.scrollWidth === document.documentElement.clientWidth`, every primary action is visible and tappable, and the light System Architect contains no clipped text or controls.

- [ ] **Step 4: Run permission and legacy regressions**

Verify athlete, parent, removed member, and cross-tenant users cannot create/configure/schedule. Verify one representative tournament for every existing format can still be created, scheduled, scored, and viewed without changed output.

- [ ] **Step 5: Record exact evidence and review the diff**

Record commands, counts, candidate SHA, browser viewport results, console/network results, cleanup, and any remaining boundary in `verification.md`. Run `git diff --check`, `git status --short`, and confirm no pre-existing `functions/lib` artifact is staged.

- [ ] **Step 6: Commit verification and open the production PR**

```bash
git add docs/qa/production-audit/runs/2026-09-08-tiered-playoffs/verification.md
git commit -m "test: verify phased tiered playoff workflow"
git push -u origin agent/tiered-playoffs-phased-workflow
gh pr create --base fix --head agent/tiered-playoffs-phased-workflow
```

- [ ] **Step 7: Merge only after every required PR check passes**

Confirm App checks, Functions build, Firebase rules, and Dependency audit are all green. Merge through the repository's normal merge strategy into `fix`.

- [ ] **Step 8: Deploy and verify production**

Dispatch `Deploy production infrastructure` for the exact merge SHA with confirmation `studio-6850142148-fe343`. Wait for Vercel production promotion, then require `https://www.thesquad.pro/api/health` to report that exact SHA. Re-run the shortest live organizer smoke and public privacy check against the deployed revision before reporting completion.
