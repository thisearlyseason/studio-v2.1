# Unified Competition Production-Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the seven unresolved League and Tournament rows locally certifiable through server-owned, replay-safe, tenant-safe lifecycle, scheduling, assignment, officiating, scoring, dispute, and public-projection workflows.

**Architecture:** Add a small shared competition authority/operation layer, then route existing League and Tournament mutations through their domain services and existing schedule locks. Keep the current UI, use purpose-specific public DTOs, preserve accepted Registration identities, and add explicit Playwright evidence only for the seven frozen rows and directly affected seams.

**Tech Stack:** Next.js App Router, React, TypeScript, Firebase Admin/Firestore transactions and rules, Firebase Functions, Stripe-independent offline registration state, Node test runner, Playwright CLI, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-07-unified-competition-production-readiness-design.md`

## Global Constraints

- Do not redesign working UI or introduce new dependencies.
- Use stable bounded `requestId` values and canonical payload hashes for every externally retryable mutation.
- Revalidate actor membership, staff role, tenant, entitlement, lifecycle state, and version inside the committing transaction.
- Preserve accepted Registration record, fee, form, and waiver identities.
- Never expose scoring credentials, applicant responses, contacts, private audit data, or internal authority maps in public/member DTOs.
- Use existing schedule locks and recoverable-operation patterns; do not create a second locking system.
- Do not promote local evidence over exact-revision staging, worker, provider, or physical-device gates.
- Preserve unrelated generated/documentation dirt already present in the worktree.

---

### Task 1: Shared Competition Authority and Operation Identity

**Files:**
- Create: `src/lib/server-competition-authority.ts`
- Create: `src/lib/server-competition-operation.ts`
- Test: `tests/competition-authority.test.mjs`
- Test: `tests/competition-operation.test.mjs`

**Interfaces:**
- Consumes: Firebase Admin `db`, authenticated actor UID, competition tenant IDs, current team/league membership records, current plan fields.
- Produces: `resolveCompetitionAuthority(input): Promise<CompetitionAuthority>`, `assertCompetitionMutationAuthority(input): Promise<void>`, `canonicalCompetitionRequest(input): CompetitionOperationIdentity`, and `runCompetitionOperation<T>(input, mutate): Promise<T>`.

- [ ] **Step 1: Write failing authority and identity tests**

```ts
assert.deepEqual(await resolveCompetitionAuthority({ actorUid, teamId, leagueId }), {
  actorUid,
  tenantId: teamId,
  memberRefPath,
  role: 'owner',
  planId: 'elite_league',
});
await assert.rejects(() => demotedActorMutation(), /Forbidden/);
assert.equal(first.operationId, replay.operationId);
assert.throws(() => collision(), /Request collision/);
```

Cover owner/organizer/staff, ordinary member, removed member, Team B, missing/unknown plan, non-UID membership documents, transaction-time demotion, exact replay, and changed-payload collision.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/competition-authority.test.mjs tests/competition-operation.test.mjs`  
Expected: FAIL because the shared authority and operation modules do not exist.

- [ ] **Step 3: Implement the minimal shared interfaces**

```ts
export type CompetitionAuthority = {
  actorUid: string;
  tenantId: string;
  memberRefPath: string;
  role: 'owner' | 'superadmin' | 'league_creator' | 'coach' | 'staff';
  planId: string;
};

export type CompetitionOperationIdentity = {
  requestId: string;
  payloadHash: string;
  operationId: string;
};
```

Use existing authentication, team authority, entitlement, stable-hash, and Firestore transaction conventions. Keep role/plan policy explicit and fail closed for missing values.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --import tsx --test tests/competition-authority.test.mjs tests/competition-operation.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server-competition-authority.ts src/lib/server-competition-operation.ts tests/competition-authority.test.mjs tests/competition-operation.test.mjs
git commit -m "feat: add competition mutation authority"
```

### Task 2: Server-Owned League Lifecycle and Sensitive Fields

**Files:**
- Create: `src/app/api/leagues/lifecycle/route.ts`
- Modify: `src/app/api/leagues/create/route.ts`
- Modify: `src/app/api/leagues/clone/route.ts`
- Modify: `src/lib/server-league-cloning.ts`
- Modify: `src/components/providers/team-provider.tsx`
- Modify: `src/app/(dashboard)/leagues/leagues-page-content.tsx`
- Modify: `firestore.rules`
- Test: `tests/league-lifecycle-route.test.mjs`
- Test: `tests/league-cloning.test.mjs`
- Test: `tests/rules/firestore-rules.test.mjs`

**Interfaces:**
- Consumes: Task 1 authority/operation identity, current League documents, dependent bookings/events/registrations/audits.
- Produces: authenticated `POST/PATCH/DELETE /api/leagues/lifecycle`, canonical `LeagueLifecycleResult`, and member-safe League root documents without readable scoring secrets.

- [ ] **Step 1: Write failing lifecycle behavior and rules tests**

```ts
assert.equal((await createAsOrdinaryMember()).status, 403);
assert.deepEqual(await Promise.all([clone(req), clone(req)]), [created, replayed]);
assert.equal((await editDuringDemotion()).status, 403);
assert.equal((await deleteWithDependencies()).status, 409);
await assertFails(memberDb.doc(`leagues/${leagueId}`).delete());
```

Also cover duplicate names/quota races, invalid topology/date fields, edit without schedule loss, archive versus delete, free delete cleanup, Team B, anonymous, direct sensitive-field write, and retained immutable audit receipt.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/league-lifecycle-route.test.mjs tests/league-cloning.test.mjs` and `npm run test:rules`  
Expected: FAIL on current client/direct lifecycle behavior.

- [ ] **Step 3: Implement lifecycle routes and migrate callers**

```ts
type LeagueLifecycleRequest =
  | { action: 'create'; requestId: string; name: string; sport: string; divisionTitle?: string }
  | { action: 'edit'; requestId: string; leagueId: string; expectedVersion: number; updates: LeagueEditableFields }
  | { action: 'clone'; requestId: string; leagueId: string; destination: 'division' | 'league'; name: string }
  | { action: 'archive' | 'delete'; requestId: string; leagueId: string; expectedVersion: number };
```

Move UI/provider mutations to the route, reserve name/quota inside the transaction, distinguish archive/delete, keep dependency/audit retention explicit, and deny direct client lifecycle/sensitive writes in rules.

- [ ] **Step 4: Run focused tests, rules, and typecheck**

Run: `node --import tsx --test tests/league-lifecycle-route.test.mjs tests/league-cloning.test.mjs && npm run test:rules && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leagues/lifecycle/route.ts src/app/api/leagues/create/route.ts src/app/api/leagues/clone/route.ts src/lib/server-league-cloning.ts src/components/providers/team-provider.tsx 'src/app/(dashboard)/leagues/leagues-page-content.tsx' firestore.rules tests/league-lifecycle-route.test.mjs tests/league-cloning.test.mjs tests/rules/firestore-rules.test.mjs
git commit -m "fix: make league lifecycle transactional"
```

### Task 3: League Schedule and Assignment Atomicity

**Files:**
- Modify: `src/app/api/leagues/schedule/route.ts`
- Modify: `src/app/api/leagues/assignments/route.ts`
- Modify: `src/lib/server-schedule-deployment.ts`
- Modify: `src/components/providers/team-provider.tsx`
- Test: `tests/server-schedule-deployment.test.mjs`
- Create: `tests/league-assignment-route.test.mjs`

**Interfaces:**
- Consumes: Task 1 operation identity, Task 2 League lifecycle version, existing `withScheduleMutationLock` and projection helpers.
- Produces: replay-safe configure/generate/deploy/append/clear operations and transactional assign/accept/revoke results with a minimum applicant DTO.

- [ ] **Step 1: Write failing schedule and assignment tests**

```ts
assert.equal((await deploySameRequestTwice()).createdGames, expectedGames);
assert.equal((await staleDeploy()).status, 409);
assert.equal((await editInvalidatesScheduleAtomically()).status, 200);
assert.equal((await acceptThenClearFailure()).status, 503);
assert.deepEqual(await readAssignmentAsSquadStaff(), minimumAssignmentDto);
```

Cover round robin/elimination, blackout/rest/doubleheader/timezone, impossible configuration, append replay, deploy race, Owner B/direct writes, clear/archive/purge, assignment replay/stale/conflicting acceptance, and no partial team/event projection.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/server-schedule-deployment.test.mjs tests/league-assignment-route.test.mjs`  
Expected: FAIL on split edit/clear and nontransactional assignment paths.

- [ ] **Step 3: Route every mutation through the existing lock**

```ts
return withScheduleMutationLock(async () => {
  const authority = await revalidateCompetitionAuthorityInTransaction(tx, input);
  const league = await readExpectedLeagueVersion(tx, input.leagueId, input.expectedVersion);
  return commitAssignmentAndScheduleProjection(tx, authority, league, input);
});
```

Do not clear a schedule before edit/assignment is guaranteed. Return only the applicant fields required by assigned staff.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --import tsx --test tests/server-schedule-deployment.test.mjs tests/league-assignment-route.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/leagues/schedule/route.ts src/app/api/leagues/assignments/route.ts src/lib/server-schedule-deployment.ts src/components/providers/team-provider.tsx tests/server-schedule-deployment.test.mjs tests/league-assignment-route.test.mjs
git commit -m "fix: make league scheduling and assignment atomic"
```

### Task 4: League Scorekeeper, Disputes, and Spectator Projection

**Files:**
- Create: `src/lib/server-competition-scoring.ts`
- Create: `src/app/api/leagues/scoring/route.ts`
- Modify: `src/app/api/public/portals/action/route.ts`
- Modify: `src/lib/public-league-scoring.ts`
- Modify: `src/lib/public-portal-data.ts`
- Modify: `src/components/providers/team-provider.tsx`
- Modify: `src/app/leagues/scorekeeper/[leagueId]/[gameId]/page.tsx`
- Modify: `src/app/leagues/spectator/[leagueId]/page.tsx`
- Modify: `firestore.rules`
- Test: `tests/league-scoring-route.test.mjs`
- Test: `tests/competition-workflows.test.mjs`
- Test: `tests/rules/firestore-rules.test.mjs`

**Interfaces:**
- Consumes: Task 1 identity, Task 3 schedule lock, current credential record and game version.
- Produces: `submitCompetitionScore`, `openCompetitionDispute`, `resolveCompetitionDispute`, minimum scorekeeper DTO, and spectator DTO.

- [ ] **Step 1: Write failing score/privacy tests**

```ts
assert.equal((await scoreWithWrongPin()).status, 403);
assert.equal((await replayScore()).auditCount, 1);
assert.equal((await scoreAfterDownstreamGame()).status, 409);
assert.equal((await resolveWithoutReason()).status, 400);
assert.equal(memberLeagueDto.scorekeeperPin, undefined);
assert.deepEqual(Object.keys(spectatorDto).sort(), publicSpectatorKeys);
```

Cover correction, dispute, wrong/rotated code, invalid/missing game, score/dispute races, downstream lock, revoked member, canonical actor, public privacy, projection handoff, and archived/missing creator fail-closed behavior.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/league-scoring-route.test.mjs tests/competition-workflows.test.mjs` and `npm run test:rules`  
Expected: FAIL on public-route divergence, replay, PIN exposure, and broad DTO fields.

- [ ] **Step 3: Implement unified League scoring**

```ts
type CompetitionScoreCommand = {
  requestId: string;
  competitionKind: 'league';
  competitionId: string;
  gameId: string;
  expectedGameVersion: number;
  credential: string;
  score: { home: number; away: number };
};
```

Store credential material outside member-readable roots, route authenticated and public code paths through the same service/lock, and make dispute resolution explicit and audited.

- [ ] **Step 4: Run focused tests, rules, and typecheck**

Run: `node --import tsx --test tests/league-scoring-route.test.mjs tests/competition-workflows.test.mjs tests/public-portals.test.mjs && npm run test:rules && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server-competition-scoring.ts src/app/api/leagues/scoring/route.ts src/app/api/public/portals/action/route.ts src/lib/public-league-scoring.ts src/lib/public-portal-data.ts src/components/providers/team-provider.tsx 'src/app/leagues/scorekeeper/[leagueId]/[gameId]/page.tsx' 'src/app/leagues/spectator/[leagueId]/page.tsx' firestore.rules tests/league-scoring-route.test.mjs tests/competition-workflows.test.mjs tests/public-portals.test.mjs tests/rules/firestore-rules.test.mjs
git commit -m "fix: secure league scoring and spectator data"
```

### Task 5: Server-Owned Tournament Lifecycle and Replication

**Files:**
- Create: `src/app/api/tournaments/lifecycle/route.ts`
- Modify: `src/app/api/teams/events/action/route.ts`
- Modify: `src/lib/server-tournament-replication.ts`
- Modify: `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
- Modify: `firestore.rules`
- Test: `tests/tournament-lifecycle-route.test.mjs`
- Test: `tests/tournament-replication.test.mjs`
- Test: `tests/rules/firestore-rules.test.mjs`

**Interfaces:**
- Consumes: Task 1 authority/operation identity and accepted Registration event/config identities.
- Produces: transactional create/configure/replicate/archive/delete operations and recoverable multi-division operation status.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
assert.equal((await starterCreateAdvancedFormat()).status, 403);
assert.equal((await replayCreate()).eventCount, expectedDivisionCount);
assert.equal((await partialDivisionFailure()).operationState, 'recovery_required');
assert.equal((await demotedOrganizerArchive()).status, 403);
```

Cover invalid topology, duplicate name/request collision, edit without schedule loss, replica reset, other staff/Team B, archive cancellation, dependency-safe delete, and exact Registration record preservation.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/tournament-lifecycle-route.test.mjs tests/tournament-replication.test.mjs`  
Expected: FAIL on UI-only entitlement, random identities, and sequential partial creation.

- [ ] **Step 3: Implement lifecycle route and migrate UI**

```ts
type TournamentLifecycleRequest = {
  action: 'create' | 'configure' | 'replicate' | 'archive' | 'delete';
  requestId: string;
  teamId: string;
  eventId?: string;
  expectedVersion?: number;
  payload: Record<string, unknown>;
};
```

Use deterministic run identities, current entitlement/role inside transactions, recoverable multi-division operations, and server-owned archive/delete reconciliation. Do not change accepted form/waiver IDs.

- [ ] **Step 4: Run focused tests, Registration seam tests, rules, and typecheck**

Run: `node --import tsx --test tests/tournament-lifecycle-route.test.mjs tests/tournament-replication.test.mjs tests/public-portals.test.mjs && npm run test:rules && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tournaments/lifecycle/route.ts src/app/api/teams/events/action/route.ts src/lib/server-tournament-replication.ts 'src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx' firestore.rules tests/tournament-lifecycle-route.test.mjs tests/tournament-replication.test.mjs tests/public-portals.test.mjs tests/rules/firestore-rules.test.mjs
git commit -m "fix: make tournament lifecycle recoverable"
```

### Task 6: Tournament Scheduling, Pools, Brackets, and Referees

**Files:**
- Modify: `src/app/api/tournaments/schedule/route.ts`
- Modify: `src/lib/server-tournament-schedule-deployment.ts`
- Modify: `src/lib/tournament-standings.ts`
- Modify: `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
- Test: `tests/server-tournament-schedule-deployment.test.mjs`
- Test: `tests/tournament-bracket-progression.test.mjs`
- Create: `tests/tournament-referee-route.test.mjs`

**Interfaces:**
- Consumes: Task 1 operation identity, Task 5 lifecycle version, existing `withTournamentScheduleMutationLock`.
- Produces: idempotent schedule/pool/bracket mutations and server-owned referee CRUD/assignment with interval conflict results.

- [ ] **Step 1: Write failing topology/referee tests**

```ts
assert.equal((await deployImpossibleBracket()).status, 400);
assert.equal((await concurrentDeploy()).winningScheduleVersion, 2);
assert.equal((await assignOverlappingReferee()).status, 409);
assert.equal((await assignCrossEventConflict()).status, 409);
assert.equal((await mutatePoolAfterSeed()).status, 409);
```

Cover supported topology deployment, resource/daily conflict, seed/reseed, stale pool, referee add/remove replay, same-event and cross-event actual interval overlaps, removed referee, other tournament, and transaction-time organizer demotion.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/server-tournament-schedule-deployment.test.mjs tests/tournament-bracket-progression.test.mjs tests/tournament-referee-route.test.mjs`  
Expected: FAIL on stale client referee arrays and incomplete conflict checks.

- [ ] **Step 3: Implement server-owned schedule/referee mutations**

```ts
return withTournamentScheduleMutationLock(async () => {
  const event = await readExpectedTournamentInTransaction(tx, input);
  validateTournamentTopology(event, input);
  validateRefereeIntervals(event, await readRelevantAssignments(tx, input));
  return writeScheduleAndAssignments(tx, input);
});
```

Use actual game start/end intervals and relevant cross-event assignments. Keep client arrays as projections only.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `node --import tsx --test tests/server-tournament-schedule-deployment.test.mjs tests/tournament-bracket-progression.test.mjs tests/tournament-referee-route.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tournaments/schedule/route.ts src/lib/server-tournament-schedule-deployment.ts src/lib/tournament-standings.ts 'src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx' tests/server-tournament-schedule-deployment.test.mjs tests/tournament-bracket-progression.test.mjs tests/tournament-referee-route.test.mjs
git commit -m "fix: secure tournament schedules and referees"
```

### Task 7: Tournament Scoring, Disputes, and Public Standings

**Files:**
- Create: `src/app/api/tournaments/scoring/route.ts`
- Modify: `src/lib/server-competition-scoring.ts`
- Modify: `src/app/api/public/tournaments/[teamId]/[eventId]/route.ts`
- Modify: `src/app/api/public/portals/action/route.ts`
- Modify: `src/app/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]/page.tsx`
- Modify: `src/app/tournaments/spectator/[teamId]/[eventId]/page.tsx`
- Modify: `src/lib/public-portal-data.ts`
- Test: `tests/tournament-scoring-route.test.mjs`
- Test: `tests/tournament-standings.test.mjs`
- Test: `tests/public-portals.test.mjs`

**Interfaces:**
- Consumes: Task 4 shared scoring command shape and Task 6 schedule lock/version.
- Produces: tournament score/correction/dispute/resolution commands and safe public scorekeeper/spectator DTOs.

- [ ] **Step 1: Write failing score/dispute/public tests**

```ts
assert.equal((await replayTournamentScore()).auditCount, 1);
assert.equal((await scoreDuringCodeRotation()).status, 409);
assert.equal((await disputeUncompletedGame()).status, 409);
assert.equal((await resolveDisputeAsNonOrganizer()).status, 403);
assert.equal(publicDto.scoringCode, undefined);
assert.equal(publicDto.refereeEmail, undefined);
```

Cover wrong code, invalid/missing score/game, stale archive/plan, simultaneous score, score-versus-dispute, completed downstream bracket lock, explicit resolution reason/audit, outsider/Team B/referee boundaries, and standings refresh.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/tournament-scoring-route.test.mjs tests/tournament-standings.test.mjs tests/public-portals.test.mjs`  
Expected: FAIL on replay, stale code/plan checks, generic dispute clearing, and DTO overexposure.

- [ ] **Step 3: Implement scoring and explicit resolution**

```ts
type TournamentDisputeResolution = {
  requestId: string;
  teamId: string;
  eventId: string;
  gameId: string;
  expectedGameVersion: number;
  resolution: 'uphold' | 'correct' | 'void';
  reason: string;
  correctedScore?: { home: number; away: number };
};
```

Recheck plan/event/archive/code/version inside the locked transaction, preserve immutable score/dispute history, and recompute bracket/standings exactly once.

- [ ] **Step 4: Run focused tests and affected Registration tests**

Run: `node --import tsx --test tests/tournament-scoring-route.test.mjs tests/tournament-standings.test.mjs tests/public-portals.test.mjs tests/tournament-bracket-progression.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tournaments/scoring/route.ts src/lib/server-competition-scoring.ts 'src/app/api/public/tournaments/[teamId]/[eventId]/route.ts' src/app/api/public/portals/action/route.ts 'src/app/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]/page.tsx' 'src/app/tournaments/spectator/[teamId]/[eventId]/page.tsx' src/lib/public-portal-data.ts tests/tournament-scoring-route.test.mjs tests/tournament-standings.test.mjs tests/public-portals.test.mjs tests/tournament-bracket-progression.test.mjs
git commit -m "fix: make tournament scoring replay safe"
```

### Task 8: Public League Projection Worker and Revocation

**Files:**
- Modify: `functions/src/index.ts`
- Create: `functions/src/league-public-projection.ts`
- Modify: `src/lib/public-portal-data.ts`
- Test: `tests/league-public-projection.test.mjs`
- Test: `tests/background-job-projection.test.mjs`

**Interfaces:**
- Consumes: versioned League lifecycle/schedule/scoring events from Tasks 2–4.
- Produces: `syncPublicLeagueView(leagueId, expectedVersion)` with idempotent create/update/delete/retry semantics and minimum spectator DTO.

- [ ] **Step 1: Write failing worker tests**

```ts
await syncPublicLeagueView(leagueId, version);
assert.deepEqual(await readProjection(), expectedSpectatorDto);
await archiveLeague();
assert.equal(await projectionExists(), false);
await Promise.all([retry(version), retry(version)]);
assert.equal(await projectionWriteCount(), 1);
```

Cover create/update/delete, archived/inactive revocation, stale event ordering, retry, partial failure recovery, missing creator/entitlement, and private-field exclusion.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --import tsx --test tests/league-public-projection.test.mjs tests/background-job-projection.test.mjs`  
Expected: FAIL because current projection publishes every existing League and lacks version/retry guards.

- [ ] **Step 3: Extract and implement the worker boundary**

```ts
export async function syncPublicLeagueView(leagueId: string, expectedVersion?: number) {
  const source = await readLeagueSource(leagueId);
  if (!isPubliclyActiveAndEntitled(source)) return deleteProjection(leagueId);
  return writeProjectionIfNewer(leagueId, buildLeagueSpectatorDto(source), expectedVersion);
}
```

Keep deployed worker execution a separate staging obligation; local tests prove deterministic logic and emulator convergence only.

- [ ] **Step 4: Run Functions and projection tests**

Run: `node --import tsx --test tests/league-public-projection.test.mjs tests/background-job-projection.test.mjs && npm --prefix functions run build`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/index.ts functions/src/league-public-projection.ts src/lib/public-portal-data.ts tests/league-public-projection.test.mjs tests/background-job-projection.test.mjs
git commit -m "fix: version league public projections"
```

### Task 9: Explicit Seven-Row Playwright Certification

**Files:**
- Modify: `scripts/qa/certification/local/selection.mjs`
- Modify: `scripts/qa/certification/local/batches/operations.mjs`
- Modify: `scripts/qa/run-phase2-emulator-audit.mjs`
- Create: `tests/local-certification-competition.test.mjs`

**Interfaces:**
- Consumes: Tasks 2–8 production routes and the frozen scenario catalog.
- Produces: explicit case maps and dedicated browser/API evidence handlers for all seven Competition rows.

- [ ] **Step 1: Write failing exact-contract tests**

```js
for (const scenario of competitionScenarios) {
  assert.deepEqual(getCaseIds(scenario.id), frozenCaseIds[scenario.id]);
  assert.equal(hasDedicatedHandler(scenario.id), true);
}
assert.equal(usesGenericDimensionFallback(competitionScenarios), false);
```

Require stable case IDs, exact actors, case-owned request/assertion IDs, separate desktop/mobile bounds, console/network capture, and selector-level cleanup.

- [ ] **Step 2: Run contract tests and verify RED**

Run: `node --test tests/local-certification-competition.test.mjs tests/local-certification-operations.test.mjs`  
Expected: FAIL because the seven rows are absent from local selection/handlers.

- [ ] **Step 3: Implement dedicated handlers in dependency order**

```js
export const COMPETITION_SCENARIO_CASES = Object.freeze({
  'leagues-create-edit-clone-delete': Object.freeze([...]),
  'leagues-schedule-generation-deployment': Object.freeze([...]),
  'leagues-registration-assignment': Object.freeze([...]),
  'leagues-scorekeeper-spectator': Object.freeze([...]),
  'tournaments-create-configure-replicate-archive': Object.freeze([...]),
  'tournaments-schedule-pools-brackets-referees': Object.freeze([...]),
  'tournaments-scoring-dispute-public-standings': Object.freeze([...]),
});
```

Use one run-owned League A/B and Tournament A/B fixture family, staff/member/removed/public/referee/scorekeeper sessions, exact APIs, real visible controls, numeric bounds at 1440×900 and 390×844, and zero-residue discovery cleanup.

- [ ] **Step 4: Run contract, syntax, and type gates**

Run: `node --check scripts/qa/run-phase2-emulator-audit.mjs && node --test tests/local-certification-competition.test.mjs tests/local-certification-operations.test.mjs && npm run typecheck`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/qa/certification/local/selection.mjs scripts/qa/certification/local/batches/operations.mjs scripts/qa/run-phase2-emulator-audit.mjs tests/local-certification-competition.test.mjs
git commit -m "test: add exact competition certification"
```

### Task 10: Isolated, Combined, and Affected Regression Evidence

**Files:**
- Modify: `.superpowers/sdd/2026-09-04-final-production-certification/progress.md`
- Create: `.superpowers/sdd/2026-09-04-final-production-certification/task-competition-handoff.md`

**Interfaces:**
- Consumes: immutable candidate SHA from Task 9 and all seven explicit handlers.
- Produces: isolated row artifacts, one combined seven-row artifact, affected Registration/Facilities/public projection regressions, and review-ready handoff.

- [ ] **Step 1: Run each row once in dependency order**

```bash
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --scenario leagues-create-edit-clone-delete --browser --fail-fast
```

Repeat with each remaining exact scenario ID. Stop at the first exact failure, diagnose systematically, fix under TDD, and rerun only the affected row.

- [ ] **Step 2: Run the exact combined certificate**

```bash
PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- \
  --scenario leagues-create-edit-clone-delete \
  --scenario leagues-schedule-generation-deployment \
  --scenario leagues-registration-assignment \
  --scenario leagues-scorekeeper-spectator \
  --scenario tournaments-create-configure-replicate-archive \
  --scenario tournaments-schedule-pools-brackets-referees \
  --scenario tournaments-scoring-dispute-public-standings \
  --browser
```

Expected: every frozen case and applicable dimension OBSERVED, child/wrapper exit 0, no run errors, exact SHA/actor ownership, console/network clean, and zero cleanup residuals.

- [ ] **Step 3: Run only affected accepted-row regressions**

Run Registration waiver/public-projection cases if Task 5 or 7 touched those seams; run Facilities booking if schedule resource writes changed; run Chat/Push only if notification targets changed.  
Expected: all selected affected rows retain their accepted local evidence.

- [ ] **Step 4: Run final focused engineering gates**

Run:

```bash
npm run test:rules
npm run typecheck
npx eslint src/app/api/leagues src/app/api/tournaments src/lib/server-competition-authority.ts src/lib/server-competition-operation.ts src/lib/server-competition-scoring.ts
npm --prefix functions run build
git diff --check
```

Expected: zero failures and zero lint errors in changed scope.

- [ ] **Step 5: Record evidence and commit the handoff**

```bash
git add .superpowers/sdd/2026-09-04-final-production-certification/progress.md .superpowers/sdd/2026-09-04-final-production-certification/task-competition-handoff.md
git commit -m "docs: record competition certification evidence"
```

Record exact run IDs, SHA, case/dimension totals, request/assertion ownership, cleanup totals, affected regressions, and the truthful exact-revision staging/worker blockers. Do not declare production readiness from local evidence alone.

