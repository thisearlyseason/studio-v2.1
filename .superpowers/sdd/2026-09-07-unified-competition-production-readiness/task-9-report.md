# Task 9 implementation report

Base: `cbbba158840a1f0be52bf81d0d43507dd4035ec4`
Commits: `9919b7d3` plus the focused round-2 evidence-hardening commit recorded in Git history

## Frozen map and implementation

- Assigned only the seven frozen League/Tournament rows to the existing `operations` batch.
- Preserved the catalog's exact 94 case IDs (15 + 11 + 14 + 12 + 16 + 12 + 14); no adjacent accepted row was added or rerun.
- Added a literal, immutable case-ID-to-handler registry. Every ID has its own executable function and frozen method, production route, actor, expected status, postcondition, viewport when applicable, and cleanup selectors. Generic probes, status-less-than-500 acceptance, aliases, and dimension fallbacks are rejected by contract tests.
- Actors are exact catalog aliases: League owner, Team A owner/staff/member, Team B foreign owner, public scorekeeper/registrant, referee, and denied actors as applicable. API authentication and Playwright sessions are isolated by scenario/actor.
- Browser cases load the real `/competition` or `/manage-tournaments` surface, perform a real visible tab or `Launch Hub` interaction, dismiss the run-owned priority-alert overlay when present, assert rendered controls and numeric bounds at `1440x900` and `390x844`, and fail unexpected console or local 4xx/5xx responses.
- Negative and permission cases assert exact statuses, authoritative before/after equality, and zero new root/subcollection/operation/projection/booking/assignment/credential/audit state.
- Scenario and CLI execution are bounded; failures still run restoration/cleanup and produce a nonzero wrapper result.
- Competition cleanup snapshots League roots/subcollections, Team roots/events/subcollections (including assignment alerts), users/profile subcollections, operation receipts/outboxes/progress, public projections, bookings, referee assignments/credentials, registration codes, and lifecycle/score audits. New state is deleted only when its exact run marker is present or its immutable operation receipt proves ownership.

## RED / GREEN evidence

Initial RED:

`node --test tests/local-certification-competition.test.mjs tests/local-certification-operations.test.mjs`

The new contract failed because the frozen competition map/handlers did not exist. Subsequent genuine RED checks covered generic/shared handler rejection, timeout finalization, profile/team-subcollection discovery, outbox ownership, alert ownership, visible interaction roles, complete scoring fixture dates, and both Firestore undefined-value boundaries.

Final GREEN (round 2):

`node --test tests/local-certification-competition.test.mjs tests/local-certification-evidence.test.mjs tests/local-certification-operations.test.mjs tests/local-certification-schedule-isolation.test.mjs tests/tournament-scoring-route.test.mjs`

Result: **77/77 passed**.

## Bounded launch smoke

Command shape:

`PLAYWRIGHT_CLI=/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh npm run qa:certify-local -- --scenario <frozen-row> --browser --fail-fast`

Fresh bounded round-2 executions completed every dedicated handler with the strengthened state, actor, browser, network, and cleanup contracts:

- `leagues-create-edit-clone-delete`: `final-cert-t5-260907-131625-48ec`, 15/15 cases, concurrent same-destination clone atomicity and cleanup observed.
- `leagues-schedule-generation-deployment`: `final-cert-t5-260907-132525-ce2d`, 11/11 cases, exact scheduler config/game/resource persistence and cleanup observed.
- `leagues-registration-assignment`: `final-cert-t5-260907-133427-1d88`, 14/14 cases, exact run-owned League selection plus visible `Portals`/`Team Registration` interaction and cleanup observed.
- `leagues-scorekeeper-spectator`: `final-cert-t5-260907-133532-23fb`, 12/12 cases, exact public score/reload DTO plus visible `Portals`/`Scorekeeper Hub` interaction and cleanup observed.
- `tournaments-create-configure-replicate-archive`: `final-cert-t5-260907-132000-05ac`, 16/16 cases, blueprint/replica/archive persistence, real cancel-before-request, idempotent replay, responsive proof, and cleanup observed.
- `tournaments-schedule-pools-brackets-referees`: `final-cert-t5-260907-131416-02d0`, 12/12 cases, real schedule/referee actor/state/public DTO proof and cleanup observed.
- `tournaments-scoring-dispute-public-standings`: `final-cert-t5-260907-131520-ecef`, 14/14 cases, score/dispute/standings authoritative DTO proof and cleanup observed.

These are bounded Task 9 launch proofs, not the authoritative combined adjudication owned by Task 10. The runner deliberately states that final matrix PASS is not inferred.

## Bugs found and fixed under TDD

1. Public Tournament score submission returned 500 because a Firestore event update contained optional `undefined` game fields. Tournament scoring now removes undefined top-level game fields before the update. The focused scoring regression was RED at 13/14 and GREEN at 14/14.
2. After that fix, the operation receipt still returned 500 because `scorekeeperTournament` produced nested optional `undefined` fields inside the persisted idempotency result. The persisted DTO boundary is now JSON-safe. A second receipt-level regression was RED at 13/14 and GREEN at 14/14.
3. The scoring audit fixture replaced its event without required dates, so the real Tournament page entered its error boundary after scoring. The fixture now contains the required visible-page fields; the exact post-mutation Playwright rerun passed.
4. Cleanup originally could not prove ownership of outboxes and assignment alerts that only referenced an operation ID. Discovery now follows that immutable ID to the run-owned operation receipt and refuses deletion otherwise. Focused registration and scoring reruns both ended with observed cleanup and zero residuals.
5. Direct Firestore denial instrumentation emitted both a helper alias and the exact REST route. A RED contract now proves that only the request matching the frozen method, route, actor, and exact status can enter case evidence; missing exact evidence fails immediately.
6. League registration/scoring browser evidence originally stopped at the outer `Leagues` tab. The runner now selects the exact run-owned League and clicks the real in-hub `Portals` button before asserting the row-specific `Team Registration` or `Scorekeeper Hub` control.
7. Partial clone/replica cases now use two distinct request IDs concurrently against one destination and assert the exact success/conflict split plus one canonical root, receipt, reservation/mapping, and audit with no loser residue. Tournament archive cancel is a real confirm dismissal with zero lifecycle requests and unchanged private/public state.
8. Every emitted case is validated against its exact frozen runtime route, method, actor, request ID, status set, postcondition IDs, and scenario/run-owned cleanup selector. The validator rejects shared/later cleanup events, residue, child failure, and timeout artifacts mislabeled as observed.

## Final verification

- `command -v npx` — PASS.
- syntax checks for the runner, operations, evidence, and isolation modules — PASS.
- focused contract/regression tests — 77/77 PASS.
- `npm run typecheck` — PASS.
- scoped ESLint — PASS with zero errors; nine existing warnings (eight in the legacy runner and the existing scoring `Data = Record<string, any>` warning).
- `git diff --check` — PASS.

## Scoped files

- `scripts/qa/certification/local/selection.mjs`
- `scripts/qa/certification/local/batches/operations.mjs`
- `scripts/qa/certification/local/evidence.mjs`
- `scripts/qa/certification/local/schedule-isolation.mjs`
- `scripts/qa/run-phase2-emulator-audit.mjs`
- `src/lib/server-competition-scoring.ts`
- `tests/local-certification-competition.test.mjs`
- `tests/tournament-scoring-route.test.mjs`
- this report

The frozen ledger was not edited. Unrelated audit documentation and generated Functions build dirt were preserved and excluded from the commit.

## Task 10 handoff

Task 10 must run the seven rows in its authoritative isolated/combined candidate execution and adjudicate the frozen matrix from those fresh artifacts. Exact-revision staging/provider/worker/device proof remains external and must not be inferred from this local emulator harness.
