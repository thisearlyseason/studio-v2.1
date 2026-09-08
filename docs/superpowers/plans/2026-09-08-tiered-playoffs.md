# Tiered Playoffs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete, additive Tiered Playoffs tournament format without changing existing tournament behavior or data.

**Architecture:** New pure Tiered modules own configuration, standings, preliminary pairing, division allocation, seeding, and bracket construction. Existing lifecycle, scheduling, scoring, authorization, audit, DTO, and UI systems receive narrow dispatch and optional-metadata integrations. Firestore event documents gain an optional versioned `tieredPlayoffs` object; no migration or backfill is required.

**Tech Stack:** Next.js 15, React 19, TypeScript, Firebase Admin/Firestore transactions, Node test runner with `tsx`, Playwright CLI, ESLint.

**Spec:** `docs/superpowers/specs/2026-09-08-tiered-playoffs-design.md`

## Global Constraints

- `tiered_playoffs` is additive; existing tournament format behavior and identifiers are frozen.
- Existing Tournament records receive no conversion, migration, or write.
- No production code is written before a relevant test fails for the intended missing behavior.
- Existing competition authority, idempotency, versioning, and audit infrastructure remain authoritative.
- Unpublished playoff placement and brackets must never enter public projections.
- No unrelated refactor, dependency, or UI change is permitted.
- Full completion requires focused tests, Tournament regressions, rules, lint, typecheck, Playwright, application build, Functions build, and `npm run verify`.

---

### Task 1: Freeze legacy behavior and add Tiered contracts

**Files:**
- Create: `src/lib/tiered-playoffs/types.ts`
- Modify: `src/components/providers/team-provider.tsx`
- Modify: `src/lib/scheduler-utils.ts`
- Modify: `src/lib/modular-scheduler.ts`
- Test: `tests/tiered-playoffs-types.test.mjs`
- Test: existing `tests/scheduler-integrity.test.mjs`

**Interfaces:**
- Produces `TieredPlayoffsConfig`, `TieredRankingRule`, `TieredSeedPlacement`, `TieredDivisionDefinition`, and `TieredPlayoffsState`.
- Adds `tiered_playoffs` to Tournament format unions and optional phase/division/seed/bye metadata to `TournamentGame`.

- [ ] Write a failing contract test that imports the new types module through a runtime validator and proves a complete valid configuration is accepted while duplicate ranking rules, invalid division sizes, negative differential caps, and non-version-1 objects are rejected.
- [ ] Run `node --import tsx --test tests/tiered-playoffs-types.test.mjs` and confirm failure because the module is absent.
- [ ] Implement the types and `validateTieredPlayoffsConfig(value, teamCount)` with structured `{ valid, errors }` output and no mutation.
- [ ] Extend shared unions and game metadata without modifying existing dispatch branches.
- [ ] Run the focused contract and existing scheduler-integrity suite; confirm both pass.
- [ ] Commit only Task 1 files with `feat: add tiered playoffs contracts`.

### Task 2: Tiered standings, sport labels, and tiebreakers

**Files:**
- Create: `src/lib/tiered-playoffs/standings.ts`
- Create: `src/lib/tiered-playoffs/sport-labels.ts`
- Test: `tests/tiered-playoffs-standings.test.mjs`

**Interfaces:**
- `calculateTieredStandings(teams, games, config): TieredStanding[]`
- `resolveTieredRanking(standings, games, config): TieredRankingResult`
- `tieredScoreLabels(sport): { forLabel; againstLabel; differentialLabel }`

- [ ] Write failing literal-fixture tests for configurable 2/1/0 points, points disabled, win percentage, points for/against, raw and capped differential, and score preservation.
- [ ] Add failing tests for sequential rule ordering, two-team head-to-head, three-team mini-standings, a next-rule tie resolution, manual unresolved tie, and reproducible seeded random draw.
- [ ] Add failing display-label tests for baseball/softball, basketball, hockey/soccer, and an unknown sport.
- [ ] Run the focused suite and confirm each group fails because the behavior is absent.
- [ ] Implement pure standings and comparison functions. Exclude incomplete, disputed, bye, and playoff-phase games.
- [ ] Implement display-only sport terminology without changing stored generic fields.
- [ ] Run the focused suite and `tests/tournament-standings.test.mjs`; confirm both pass.
- [ ] Commit Task 2 with `feat: calculate tiered playoff standings`.

### Task 3: Preliminary feasibility and deterministic matchup generation

**Files:**
- Create: `src/lib/tiered-playoffs/preliminary-scheduler.ts`
- Test: `tests/tiered-playoffs-preliminary-scheduler.test.mjs`

**Interfaces:**
- `analyzeTieredFeasibility(input): TieredFeasibilityReport`
- `generateTieredPreliminaryMatchups(input): TieredPreliminaryMatchup[]`
- Consumes existing schedule field/window types and emits matchups for existing slot allocation.

- [ ] Write failing table tests for 4, 6, 8, 10, 12, 16, 20, 22, 24, and 32 teams with hand-derived expected totals for 2–5 games per team where mathematically feasible.
- [ ] Add failing tests for odd appearance totals, games exceeding available unique opponents, insufficient slot capacity, no fields, invalid duration, and missing windows. Assert required/supported game counts and actionable messages.
- [ ] Add failing deterministic matchup tests proving exact per-team counts, no self-match, unique opponents before repeats, stable output, and home/away spread no greater than one where feasible.
- [ ] Run the focused suite and confirm failure because the module is absent.
- [ ] Implement capacity analysis and deterministic regular-graph/round-robin edge selection. Reject impossible equal schedules rather than dropping appearances.
- [ ] Run the focused suite and confirm pass across the required matrix.
- [ ] Commit Task 3 with `feat: generate tiered preliminary matchups`.

### Task 4: Slot allocation, hard validation, and fairness health

**Files:**
- Create: `src/lib/tiered-playoffs/schedule.ts`
- Modify: `src/lib/intelligent-scheduler.ts`
- Modify: `src/lib/server-tournament-schedule-deployment.ts`
- Test: `tests/tiered-playoffs-schedule.test.mjs`
- Test: `tests/tournament-lifecycle-route.test.mjs`

**Interfaces:**
- `generateTieredPreliminarySchedule(input): { games; feasibility; health; validation }`
- `validateTieredSchedule(games, input): TieredScheduleValidation`
- Existing deployment preparer dispatches to Tiered validation only for `tiered_playoffs`.

- [ ] Write failing tests covering one/multiple fields, unequal daily windows, blackouts, game duration, transition time, minimum rest, maximum daily games, resource overlap, team overlap, out-of-window games, missing teams/resources, and orphan games.
- [ ] Add failing health-summary tests for game count, opponent variety, rest spread, start-time spread, field spread, and hard violation count.
- [ ] Add failing manual-edit validation tests for opponent, date, time, and resource conflicts.
- [ ] Run the focused suite and confirm the Tiered dispatch is absent.
- [ ] Implement Tiered orchestration around existing slot and validation primitives, preserving all legacy branches.
- [ ] Add lifecycle/deployment allowlist and validation support for Tiered configuration fields.
- [ ] Run focused Tiered schedule, lifecycle, schedule-deployment, and scheduler-integrity suites.
- [ ] Commit Task 4 with `feat: validate tiered preliminary schedules`.

### Task 5: Division allocation and seed state

**Files:**
- Create: `src/lib/tiered-playoffs/seeding.ts`
- Test: `tests/tiered-playoffs-seeding.test.mjs`

**Interfaces:**
- `allocateTieredDivisions(rankedTeams, definitions, mode): TieredSeedPlacement[]`
- `applyTieredSeedOverride(calculated, approved, move): TieredSeedPlacement[]`
- `tieredStandingsFingerprint(games, rankingConfig): string`

- [ ] Write failing tests for automatic equal and remainder sizing, including 20/4 and 22/4, plus custom 6/6/6/4 allocation.
- [ ] Add failing tests rejecting missing teams, duplicate teams, duplicate seeds/divisions, zero sizes, and custom totals that do not equal team count.
- [ ] Add failing override tests proving calculated placement remains unchanged, approved placement reorders correctly, and reset restores calculated order.
- [ ] Add failing fingerprint tests proving relevant preliminary score/ranking changes alter the fingerprint while playoff score changes do not.
- [ ] Run the focused suite and confirm failure because the module is absent.
- [ ] Implement allocation, override, reset, and stable fingerprint behavior.
- [ ] Run the focused suite and confirm all literal placements pass.
- [ ] Commit Task 5 with `feat: allocate tiered playoff divisions`.

### Task 6: Uneven division brackets, byes, and dependency scheduling

**Files:**
- Create: `src/lib/tiered-playoffs/brackets.ts`
- Test: `tests/tiered-playoffs-brackets.test.mjs`
- Test: existing `tests/tournament-bracket-progression.test.mjs`

**Interfaces:**
- `generateTieredDivisionBracket(division, placements): TournamentGame[]`
- `scheduleTieredPlayoffBrackets(brackets, availability): TournamentGame[]`
- `validateTieredBrackets(brackets, placements, availability): TieredBracketValidation`

- [ ] Write failing bye-matrix tests for 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, and 16 teams using hand-derived capacity and bye counts.
- [ ] Add the required six-team literal test: Seeds 1 and 2 advance by bye; Seed 3 plays 6; Seed 4 plays 5; no fake score, win, or played game exists.
- [ ] Add failing tests for exactly-once placement, independent division IDs, unique node IDs, acyclic feeders, high-seed advantage, champion path, and winner advancement.
- [ ] Add failing dependency-time tests proving downstream starts consider the latest feeder completion plus rest/transition and every `possibleTeamIds` participant.
- [ ] Add failing preliminary-rematch tests proving only seed-compatible opening positions swap and normal seeding is retained when no safe alternative exists.
- [ ] Run the focused suite and confirm failure because the module is absent.
- [ ] Implement standard seeded bracket construction, structural byes, optional rematch optimization, dependency scheduling, and validation.
- [ ] Run the Tiered bracket and existing bracket-progression suites.
- [ ] Commit Task 6 with `feat: generate tiered division brackets`.

### Task 7: Transactional Tiered lifecycle API

**Files:**
- Create: `src/lib/server-tiered-playoffs.ts`
- Create: `src/app/api/tournaments/tiered-playoffs/route.ts`
- Modify: `src/app/api/tournaments/lifecycle/route.ts`
- Modify: `src/lib/server-competition-scoring.ts`
- Modify: `src/lib/server-tournament-replication.ts`
- Test: `tests/tiered-playoffs-route.test.mjs`
- Test: `tests/tournament-scoring-route.test.mjs`
- Test: `tests/tournament-replication.test.mjs`

**Interfaces:**
- `executeTieredPlayoffsCommand(input): Promise<TieredPlayoffsCommandResult>`
- Commands: preview, override, reset, lock, generate brackets, publish playoffs, withdrawal, disqualification, safe regeneration.

- [ ] Write failing route tests for malformed input, unsupported fields/commands, wrong format, invalid state, stale versions, missing results, unresolved manual ties, invalid divisions, and unpublished bracket regeneration after results.
- [ ] Add failing permission tests for unauthenticated, athlete, parent, removed staff, cross-team organizer, and mismatched tournament IDs; prove current authorized organizer success.
- [ ] Add failing idempotency/concurrency tests for repeated preview, lock, generation, publication, score, and advancement requests; assert no duplicate games/seeds/audits.
- [ ] Add failing stale-seeding tests: an unlocked score correction recalculates, a locked correction marks stale, and a started bracket is not rebuilt.
- [ ] Add failing withdrawal/disqualification tests preserving historical scores and requiring controlled post-bracket handling.
- [ ] Run focused route tests and confirm expected RED failures.
- [ ] Implement schema-limited route parsing and transaction-bound command handling through existing authority, operation receipt, version, and audit infrastructure.
- [ ] Add the narrow scoring invariant hook for Tiered phase/division advancement without modifying legacy advancement.
- [ ] Ensure replication copies configuration but resets schedules, placements, locks, brackets, results, publication, and audit identity.
- [ ] Run Tiered route plus existing lifecycle, scoring, replication, and authorization suites.
- [ ] Commit Task 7 with `feat: protect tiered playoff lifecycle`.

### Task 8: Public projection and privacy boundary

**Files:**
- Create: `src/lib/tiered-playoffs/public-projection.ts`
- Modify: `src/lib/public-portal-data.ts`
- Modify: `src/app/api/public/tournaments/[teamId]/[eventId]/route.ts`
- Test: `tests/tiered-playoffs-public-dto.test.mjs`
- Test: `tests/tournament-public-dto.test.mjs`

**Interfaces:**
- `tieredPlayoffsPublicProjection(event): PublicTieredPlayoffs | undefined`

- [ ] Write failing DTO tests proving published preliminary schedule/results/standings are visible and private configuration, calculated seeds, override metadata, actors, fingerprints, and audit data are absent.
- [ ] Add failing tests proving seeding previews and brackets are absent before playoff publication and division brackets/champions appear after publication.
- [ ] Add failing inactive, archived, wrong-team, non-entitled, and malformed-event cases without metadata enumeration.
- [ ] Run focused DTO tests and confirm the Tiered projection is absent.
- [ ] Implement a minimum public projection and integrate it only for Tiered events.
- [ ] Run Tiered and existing public DTO/portal route suites.
- [ ] Commit Task 8 with `feat: publish tiered playoff projections`.

### Task 9: Organizer setup and operations UI

**Files:**
- Create: `src/components/tournaments/TieredPlayoffsSetup.tsx`
- Create: `src/components/tournaments/TieredPlayoffsOperations.tsx`
- Create: `src/components/tournaments/TieredStandingsTable.tsx`
- Modify: `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
- Test: `tests/tiered-playoffs-ui-contract.test.mjs`

**Interfaces:**
- Setup emits validated `TieredPlayoffsConfig` through `onChange`.
- Operations consumes current event, standings, validation, versions, and command callback.

- [ ] Write failing rendered-behavior tests for selector availability, progressive disclosure, field validation, ranking reordering, automatic/custom divisions, feasibility summary, conflict messages, and organizer summary.
- [ ] Add failing operations tests for phase-specific controls, missing-score list, preview, override, reset, lock, stale warning, generation, publication, and disabled invalid transitions.
- [ ] Add failing permission tests proving non-organizers cannot render mutation controls.
- [ ] Run focused UI contracts and confirm RED.
- [ ] Implement focused components using existing design primitives and integrate the new selector option without changing legacy option rendering.
- [ ] Remove unsafe `any` casts only where the new typed format requires it; do not refactor unrelated wizard state.
- [ ] Run focused UI, lifecycle, and type checking.
- [ ] Commit Task 9 with `feat: configure tiered playoffs`.

### Task 10: Division bracket and standings presentation

**Files:**
- Create: `src/components/tournaments/TieredPlayoffsView.tsx`
- Modify: `src/components/TournamentBracket.tsx`
- Modify: `src/app/tournaments/public/[teamId]/[eventId]/page.tsx`
- Modify: `src/app/tournaments/spectator/[teamId]/[eventId]/page.tsx`
- Modify: organizer Tournament display in `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
- Test: `tests/tiered-playoffs-view-contract.test.mjs`

**Interfaces:**
- `TieredPlayoffsView` renders preliminary standings and one independent bracket section per published division.
- Existing `TournamentBracket` behavior remains its default when no division grouping is supplied.

- [ ] Write failing behavior tests for sport labels, division headers, overall/division seeds, upcoming/completed games, four champions, and unpublished privacy.
- [ ] Add failing mobile layout tests for contained horizontal bracket scrolling, no page-level overflow, visible active division, and accessible actions.
- [ ] Add a frozen legacy rendering test proving existing single-bracket callers retain their output.
- [ ] Run focused view tests and confirm RED.
- [ ] Implement the Tiered view and minimal optional bracket integration.
- [ ] Run view contracts, existing public Tournament tests, typecheck, and scoped lint.
- [ ] Commit Task 10 with `feat: display tiered playoff divisions`.

### Task 11: Integrated scenarios and edge cases

**Files:**
- Create: `tests/tiered-playoffs-scenarios.test.mjs`
- Extend only if required: Tiered modules from Tasks 2–7

**Interfaces:**
- Exercises pure and command orchestration with deterministic fixtures; no provider or production writes.

- [ ] Write and run a failing 20-team/four-game/four-five-team-division scenario through preliminary schedule, scores, standings, seeding, brackets, progression, and four champions.
- [ ] Write and run a failing 24-team/four-six-team-division scenario asserting two correct byes per division and complete progression.
- [ ] Write and run the remaining required 22-team custom, tiebreaker, differential cap, override, privacy, locking, withdrawal, disqualification, late-result, duplicate-request, concurrent-admin, refresh/retry, and halfway-failure scenarios.
- [ ] Implement only gaps exposed by these scenario tests in the owning Tiered module.
- [ ] Rerun all `tests/tiered-playoffs-*.test.mjs` and confirm zero failures.
- [ ] Run the existing Tournament lifecycle, schedule, scoring, standings, bracket, public DTO, registration, and replication tests.
- [ ] Commit Task 11 with `test: verify tiered playoff scenarios`.

### Task 12: Playwright, final regression, and release evidence

**Files:**
- Create: `scripts/qa/tiered-playoffs-e2e.mjs`
- Create: `docs/qa/production-audit/runs/2026-09-08-tiered-playoffs/verification.md`
- Modify only for discovered defects: owning Tiered or narrowly affected shared files

**Interfaces:**
- Playwright flow uses an isolated test organizer/team/tournament and records cleanup ownership.

- [ ] Start the verified local/emulator environment and create isolated organizer fixtures without touching production data.
- [ ] Use Playwright to create a 24-team Tiered tournament, configure four preliminary games, multiple fields, standings rules, differential cap, and four divisions of six.
- [ ] Generate, validate, review, and publish the preliminary schedule; enter every score; verify standings and missing-result gating at intermediate stages.
- [ ] Preview, override/reset one seed, lock, generate brackets, verify byes and dependency-safe times, publish, enter playoff results, and verify four champions and final state.
- [ ] Repeat critical organizer and public paths at 390x844; assert no page overflow, blank screen, console error, or unexpected failed API response.
- [ ] Verify athlete/parent/removed-member/cross-tenant mutation denial and unpublished public-data exclusion.
- [ ] Run representative creation, schedule, scoring, bracket, publishing, and completion regression for every existing format touched by shared code.
- [ ] Run `npm run typecheck`, scoped lint, Tiered tests, existing Tournament tests, `npm run test:rules`, `npm run build`, and `npm --prefix functions run build`.
- [ ] Run full `npm run verify` and retain exact command output and revision.
- [ ] Review the final diff for unrelated changes and verify the pre-existing generated Functions artifacts were neither staged nor overwritten.
- [ ] Record exact PASS/FAIL/BLOCKED evidence, limitations, cleanup, and commit SHA in the verification document.
- [ ] Commit Task 12 with `test: certify tiered playoffs locally`.

## Execution choice

The user explicitly requested completion in full without additional routine approvals. Execute this plan inline because the current instruction does not request subagent delegation. Stop only for a genuine external blocker or a decision that would expand or contradict the approved specification.
