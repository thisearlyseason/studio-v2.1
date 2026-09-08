# Tiered Playoffs Design

**Date:** 2026-09-08  
**Status:** Approved; initial implementation complete; phased-workflow amendment approved
**Scope:** Additive Tournament format for The Squad

## Objective

Add `Tiered Playoffs` as a new Tournament format. Teams play a configurable preliminary round, receive an overall seed from configurable standings rules, are allocated into independent playoff divisions, and complete a separate single-elimination bracket within each division.

The organizer workflow is deliberately phased. A tournament may be created as a draft with no teams and no playoff divisions. Teams are enrolled before the preliminary schedule is generated. Playoff divisions are configured only after every preliminary game has a final, undisputed result; they are not a creation-time or preliminary-scheduling prerequisite.

The feature must remain sport-agnostic and must not alter the stored meaning or behavior of Round Robin, Pool Play & Playoffs, Single Elimination, or Double Elimination tournaments.

## Non-negotiable compatibility boundary

- Existing tournaments remain valid without migration or backfill.
- Existing tournament format identifiers and behavior remain unchanged.
- Existing schedules, scores, standings, brackets, registrations, URLs, permissions, and history remain intact.
- `tiered_playoffs` is opt-in and never inferred for an existing event.
- New fields are nullable or absent for all existing formats.
- Shared code may only receive backwards-compatible branches or reusable primitives whose existing-format results are frozen by regression tests.
- No destructive data migration, production-data rewrite, or database reset is permitted.
- Unpublished playoff placement and brackets are not exposed publicly.

## Existing architecture and extension points

Tournament records are Firestore documents under `teams/{teamId}/events/{eventId}`. Configuration and the canonical `tournamentGames` array live on the event. The organizer wizard is implemented in `manage-tournaments-page-content.tsx`. Protected lifecycle, scheduling, scoring, and public projection behavior is handled by server routes and server modules.

The existing scheduler already provides deterministic matchup generation, field and time allocation, daily windows, blackout dates, rest validation, daily game caps, resource-conflict validation, bracket dependency validation, and fairness reporting. The score engine already supports versioned writes, disputes, idempotent operations, and winner advancement through `winnerTo` links. Existing competition authority resolves organizer permissions server-side. Existing lifecycle and scoring audit infrastructure records protected mutations.

Tiered Playoffs will extend these seams without converting Pool Play & Playoffs into a new behavior and without introducing a parallel tournament storage system.

## Chosen architecture

### Format identity

Add the literal `tiered_playoffs` to Tournament format unions and allowlists. The organizer-facing label is `Tiered Playoffs` with this description:

> Teams play preliminary games and are ranked using tournament standings and tiebreakers. Final standings place teams into separate playoff divisions, with each division receiving its own playoff bracket.

Only Pro-entitled squads may use this advanced format, matching current advanced-format policy.

### Event configuration

Add an optional versioned object to the existing event document:

```ts
type TieredPlayoffsConfig = {
  schemaVersion: 1;
  preliminary: {
    gamesPerTeam: number;
    gameDurationMinutes: number;
    transitionMinutes: number;
    minimumRestMinutes: number;
    maximumGamesPerTeamPerDay: number;
    schedulingMethod: 'automatic' | 'manual';
  };
  standings: {
    pointsEnabled: boolean;
    points: { win: number; tie: number; loss: number };
    rankingRules: TieredRankingRule[];
    finalResolution: 'manual' | 'random_draw';
    maximumDifferentialPerGame: number | null;
  };
  divisions: {
    sizing: 'automatic' | 'custom';
    definitions: Array<{ id: string; name: string; size: number }>;
    avoidPreliminaryRematches: boolean;
  };
  seeding: {
    status: 'pending' | 'review' | 'locked' | 'stale';
    calculated: TieredSeedPlacement[];
    approved: TieredSeedPlacement[];
    standingsFingerprint: string | null;
    lockedAt: string | null;
    lockedBy: string | null;
  };
  playoffs: {
    bracketFormat: 'single_elimination';
    status: 'pending' | 'ready' | 'published' | 'in_progress' | 'complete';
    publishedAt: string | null;
    publishedBy: string | null;
  };
};
```

During the draft and preliminary phases, `divisions.definitions` is an empty array. The selected sizing method is only a harmless default until playoff setup. Division definitions become required when the organizer begins the playoff-scheduling workflow after preliminary completion. Validation is therefore operation-specific:

- draft creation validates identity and a structurally safe Tiered configuration, while permitting zero teams, absent logistics, and no division definitions;
- preliminary scheduling validates the enrolled teams, fields, windows, preliminary rules, and capacity, while still permitting no division definitions;
- seeding preview and playoff scheduling require completed preliminary results plus valid division definitions covering every participating team exactly once.

Existing Tiered records that already contain valid division definitions remain valid and are not rewritten.

`rankingRules` may contain `tournament_points`, `wins`, `win_percentage`, `losses`, `head_to_head`, `differential`, `points_for`, and `points_against`. Duplicate rules are invalid. `manual` is the default final resolution so unresolved statistical ties cannot silently depend on document order. A random draw uses a persisted controlled seed and is audited.

### Additive game metadata

Extend `TournamentGame` with optional Tiered Playoffs metadata:

```ts
type TieredGameMetadata = {
  phase?: 'preliminary' | 'playoff';
  playoffDivisionId?: string;
  overallSeed1?: number;
  overallSeed2?: number;
  divisionSeed1?: number;
  divisionSeed2?: number;
  isBye?: boolean;
  possibleTeamIds?: string[];
};
```

Existing games omit these fields. Preliminary games affect Tiered standings. Playoff games do not. A bye is a bracket condition, not a played game, score, win, or standings entry.

### State and versioning

Use existing event lifecycle, schedule, credential, and per-game versions. Tiered phase state lives only inside `tieredPlayoffs`, avoiding a competing global tournament state machine.

Valid phase progression is:

1. draft created, with enrollment open
2. teams and preliminary logistics configured
3. preliminary schedule ready
4. preliminary published/in progress
5. preliminary complete
6. playoff divisions configured and seeding review
7. seeding locked
8. playoff brackets scheduled and ready
9. playoffs published/in progress
10. tournament complete

Commands reject invalid transitions. Changes to a preliminary result while seeding is unlocked recalculate standings. A result change after locking marks placement `stale`; it never silently changes approved seeds or destroys brackets. Structural changes after playoff results exist require an explicit, authorized recovery action and cannot erase completed results.

## Preliminary scheduling

Create a Tiered-specific orchestration service that generates preliminary matchup candidates, then delegates slot allocation and validation to existing scheduling primitives. Existing format branches remain unchanged.

### Feasibility

Before generation, calculate required preliminary appearances and games. For equal games per team, `teamCount * gamesPerTeam` must be even. Capacity is the sum of usable field slots across configured daily windows after game duration and transition time. Generation is rejected when required games exceed capacity or constraints make an equal schedule impossible.

The response states required games, supported games, and actionable remedies such as adding a field/day, extending hours, or reducing games or duration. Games are never silently dropped.

### Matchups

Matchup generation is deterministic for identical configuration. It prioritizes unique opponents and balanced home/away designation, then allows repeats only after unique possibilities are exhausted. A team never plays itself. Odd team counts and odd requested game counts are accepted only when the appearance total can be balanced exactly.

### Hard constraints

- valid participating teams and resources
- no self-match
- no team overlap
- no resource overlap
- game within an enabled date and daily window
- game duration fits its slot
- configured minimum rest
- configured daily game maximum
- valid resource identity and event relationship
- complete required game counts

Failure of any hard constraint prevents publication.

### Soft constraints

- unique opponents before repeats
- balanced rest
- avoidance of back-to-back games where possible
- balanced early/late starts
- balanced field allocation
- balanced home/away designation

Soft constraints produce transparent fairness metrics and warnings; they never override a hard constraint.

Manual editing revalidates the affected schedule before persistence. Published preliminary schedules must be cleared through existing protected schedule recovery before structural configuration can change.

## Standings and tiebreakers

Create a pure Tiered standings module. It returns games played, wins, losses, ties, win percentage, optional tournament points, points for, points against, raw differential, capped standings differential, and per-rule comparison values.

The displayed game score always remains the recorded score. A maximum differential affects only the differential credited to standings for that game.

Ranking applies configured rules sequentially. Head-to-head uses mini-standings among all currently tied teams rather than a two-team shortcut. If every configured statistical rule remains equal, the result is unresolved until the configured final method is applied. Manual resolution blocks seed locking until the organizer supplies an explicit order. Random draw is reproducible, persisted, and audited.

Sport terminology is derived from existing tournament/team sport data through one display-only mapping:

- baseball and softball: Runs For, Runs Against, Run Differential
- basketball: Points For, Points Against, Point Differential
- hockey and soccer: Goals For, Goals Against, Goal Differential
- other sports: Points For, Points Against, Differential

The stored statistical names remain generic.

Missing, unplayed, suspended, disputed, or under-review preliminary games prevent automatic completion and list the exact blocking games. The system never guesses a result.

## Division allocation and seeding

Division allocation is a post-preliminary operation. The organizer cannot configure playoff divisions until every preliminary game is complete and undisputed. At that point the Tournament page exposes one prominent `Schedule Playoffs` action. It opens a focused workflow for division names, automatic or custom sizes, standings-based placement preview, seeding review, bracket generation, and schedule validation. No playoff game is published merely by opening or saving this workflow.

Automatic allocation distributes overall seeds contiguously across divisions. When sizes are uneven, earlier/higher divisions receive one additional team until the remainder is exhausted. The exact result is previewed before confirmation.

Custom sizes must be positive integers, have unique division IDs and names, and sum exactly to the participating playoff-team count. Each team must receive one overall seed, one division, and one division seed.

The preview shows division name, overall seed, division seed, team, record, differential, and relevant tiebreaker values. Organizers may recalculate, reset to automatic, or manually reorder placement before locking.

Manual changes retain calculated and approved placements separately, including actor and timestamp in existing audit records. They do not rewrite preliminary standings.

Locking stores the approved placement and a fingerprint of the preliminary scores and ranking configuration. Repeated lock requests with the same request identity return the original result and do not duplicate seeds or audits.

## Brackets and byes

Each division generates an independent single-elimination bracket using its approved division seeds. Capacity is the next power of two. Standard seed placement gives byes to the highest seeds.

For six teams, Seeds 1 and 2 advance without a fake opponent or fake score; Seeds 3–6 and 4–5 play the opening round. A bye creates no played game and changes no standings statistic.

Bracket validation requires:

- every approved team exactly once
- no cross-division duplication
- unique valid seeds
- correct bracket capacity and bye recipients
- valid, acyclic winner dependencies
- no orphan nodes
- one championship path per division
- no self-match
- no field or timing conflict

First-round preliminary-rematch avoidance is a soft, seed-compatible swap between equivalent bracket positions. It must not reduce higher-seed advantage. If no safe swap exists, normal seeding is retained with a warning.

### Dependency-aware scheduling

For every downstream game, the earliest start equals the latest possible feeder completion plus minimum rest and transition time. Validation considers every possible winner from each feeder using `possibleTeamIds`; a future matchup cannot be placed where any possible participant would violate rest or overlap constraints.

## Protected commands

Add `/api/tournaments/tiered-playoffs` as a focused server route rather than expanding legacy format semantics. Supported commands are:

- `configure-divisions`
- `preview-seeding`
- `apply-seed-override`
- `reset-seeding`
- `lock-seeding`
- `generate-brackets`
- `publish-playoffs`
- `handle-withdrawal`
- `handle-disqualification`
- safe unpublished-bracket regeneration

The existing schedule route continues to own preliminary schedule deployment and game/resource bookings. Existing scoring continues to own score and dispute writes and winner advancement, with a Tiered-specific invariant hook for phase and division boundaries.

Every command requires current organizer authority, team/event ownership, lifecycle and schedule versions, a request ID, and valid phase state. Multi-record changes use the existing competition-operation transaction/receipt framework. Duplicate or concurrent requests cannot create duplicate divisions, seeds, brackets, games, or advancement. Version conflicts return HTTP 409 with a reload instruction.

Withdrawals and disqualifications preserve historical games. Before seeding, authorized recalculation is allowed. After bracket generation, the organizer chooses a forfeit, bye advancement, or an explicitly reviewed structural adjustment. Started or completed playoff results are never silently rebuilt.

Major actions write through existing Tournament audit infrastructure with tournament ID, phase, division where relevant, actor, request identity, previous/next version, and timestamp.

## Organizer experience

Add `Tiered Playoffs` to the existing selector without removing or renaming any option. Only Tiered Playoffs reveals its progressive setup:

1. create the Tournament draft from identity, dates, sport, and preliminary standings rules; teams and playoff divisions are optional and may be absent
2. add teams through the existing manual, import, and registration paths
3. configure preliminary fields, windows, and constraints, then generate the preliminary schedule
4. score every preliminary game; show an explicit progress count and list any incomplete or disputed games
5. when the preliminary round is complete, show a visually prominent `Preliminary Round Complete` panel with a `Schedule Playoffs` action
6. configure playoff division names and sizes, review standings and seeds, lock placement, generate the division brackets, validate their times/resources, and publish the playoffs

Focused components will be extracted for Tiered setup, standings configuration, division configuration, seeding review, and playoff operations. Existing tournament screens retain their current presentation.

The organizer summary always includes team count, preliminary games per team, required total games, ranking order, differential cap, feasibility, conflicts, and fairness metrics. Division seed ranges, bracket type, and bye policy appear only after playoff setup begins.

Actions are available only when valid for the current phase. Destructive or stale operations provide explicit consequences and require existing confirmation patterns.

The System Architect uses the application's light, high-contrast visual language instead of an almost-black workspace: white and soft-gray primary surfaces, black headings, red accents, clear section borders, and readable secondary text. Dark brand sections may remain as accents, but form labels, inputs, validation, navigation state, and primary actions must meet normal contrast expectations. The mobile dialog keeps a single internal scroll region and must not introduce page-level horizontal overflow.

## Public and mobile experience

The public Tournament DTO includes additive Tiered information only when appropriate:

- preliminary schedule, results, and standings after preliminary publication
- playoff divisions, approved seeds, brackets, games, and champions only after playoff publication
- no calculated seeds, unpublished placement, override audit, lock identity, private configuration, or internal errors

The Tournament bracket component receives an optional division grouping. Existing callers retain their current single-bracket behavior. Tiered public pages render one clearly labelled section per division.

Organizer and public views must work at desktop, tablet, and mobile widths. Brackets may scroll horizontally inside their own container but must not create page-level overflow. Critical controls, validation errors, and active division context remain visible on mobile.

## Error handling and recovery

Organizer errors identify the exact conflict and remediation without exposing internal stack traces or private identifiers. Server logs include tournament ID, operation, phase, affected division/game, and request identity.

Safe recovery includes retrying deterministic generation, recalculating unlocked standings, resetting unlocked automatic seeding, and regenerating unpublished/unstarted brackets. Failed transactional operations leave no partial placement or bracket.

## Testing strategy

All new behavior follows test-driven development. Tests must fail for the intended missing behavior before production code is added.

### Pure and integration coverage

- zero-team Tiered draft creation with no playoff divisions
- adding, importing, and registering teams after draft creation
- preliminary schedule generation without division definitions
- operation-specific rejection when preliminary scheduling lacks teams or logistics
- playoff setup hidden and rejected until every preliminary game is complete and undisputed
- post-preliminary division configuration, seeding, bracket scheduling, and publication
- backwards compatibility for already-configured Tiered records
- preliminary scheduling for 4, 6, 8, 10, 12, 16, 20, 22, 24, and 32 teams
- 2, 3, 4, and 5 games per team where mathematically feasible
- exact totals, per-team counts, no self-match, opponent variety, rest, resource and daily limits
- infeasible capacity and mathematically impossible balance
- single and multiple fields, mixed daily windows, blackout periods, and manual edits
- standings points, configurable rule ordering, multi-team head-to-head, unresolved ties, and reproducible draw
- differential cap preserving the actual 20–2 score while crediting +7/−7
- automatic and custom division sizing, including 22 teams split 6/6/6/4
- calculated versus approved seeds, overrides, locking, replay, concurrency, and stale detection
- bracket sizes 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, and 16
- correct capacity, high-seed byes, dependency paths, advancement, and champions
- withdrawal, disqualification, missing scores, score correction, late results, started brackets, and partial failure
- organizer permission, removed-member denial, cross-tenant substitution denial, and public projection privacy

### Required integrated scenarios

1. 20 teams, four preliminary games, four divisions of five, complete scoring through four champions.
2. 24 teams and four divisions of six, with Seeds 1 and 2 receiving byes in every division.
3. 22 teams with custom division sizes 6/6/6/4 and exactly-once placement.
4. Record tie resolved by configured differential.
5. Record and differential tie resolved by the next configured rule.
6. 20–2 actual score with a differential cap of seven.
7. Manual override preserves calculated placement and audit evidence.
8. Unpublished playoff placement remains private.
9. Locked placement remains stable after background recalculation and becomes visibly stale after a relevant score correction.
10. A tournament created before this feature can still be opened, edited within existing rules, scored, viewed, and completed unchanged.

### Playwright

The complete browser scenario creates a zero-team Tiered Playoffs draft without divisions, adds 24 teams, configures four preliminary games, multiple fields, standings rules, and a differential cap, then generates and publishes the preliminary schedule without playoff definitions. It enters all preliminary scores, verifies that playoff setup remains unavailable until the last valid score, observes the prominent completion state, configures four six-team divisions through `Schedule Playoffs`, previews and locks seeds, generates brackets and byes, schedules and publishes playoffs, enters all playoff scores, verifies advancement and four champions, and verifies final state.

Repeat the critical organizer and public paths at a mobile viewport. Capture console errors, failed API requests, page overflow, permission failures, persistence after refresh, and public unpublished-data exclusion.

### Existing-format regression

Run the current Tournament lifecycle, schedule/referee, scoring/dispute, registration/waiver, public DTO, bracket progression, and standings suites. Add frozen representative cases for each existing format touched by a shared union, validator, DTO, or component. Expected schedule, standings, bracket, publication, permission, and completion behavior must remain unchanged.

## Verification and release gates

Before completion:

- focused Tiered tests pass
- existing Tournament regression tests pass
- Firestore and Storage rules pass
- Playwright desktop and mobile scenarios pass
- no unexpected console errors or 5xx responses occur
- lint and TypeScript pass without suppressions
- application and Functions production builds pass
- full `npm run verify` passes
- a final diff review finds no unrelated runtime changes
- production data is not mutated during automated validation

Deployment is a separate explicit step. The feature is not production-certified merely because local tests or builds pass. Certification requires an exact-revision hosted verification of the new organizer and public workflows. Physical-device testing is required only for behavior that genuinely depends on a physical device; Tiered Playoffs itself should be fully browser-verifiable.

## Planned file boundaries

New focused modules will own Tiered behavior:

- Tiered types and validation
- preliminary matchup generation and feasibility
- Tiered standings and ranking
- division allocation and seed state
- single-elimination division brackets and bye handling
- protected Tiered lifecycle commands
- organizer Tiered setup/operations UI
- public Tiered division presentation

Existing shared files receive only the minimum format union, dispatch, optional metadata, DTO, and rendering integration needed to connect those modules. Exact paths and interfaces will be fixed in the implementation plan after repository mapping.

## Definition of done

Tiered Playoffs is complete only when its full preliminary-to-champions workflow, edge cases, permissions, privacy, concurrency, persistence, responsive behavior, and production builds have fresh evidence; every existing format retains its prior behavior; no tournament-blocking or data-corruption defect remains; and no existing tournament data has been converted or deleted.
