# Task 9 implementation report

Base: `cbbba158840a1f0be52bf81d0d43507dd4035ec4`
Commits: `9919b7d3`, `7a8d1e3e`, plus the focused round-3 evidence-hardening commit recorded in Git history

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

Round-3 RED/GREEN added exact semantic postcondition coverage, transport-derived request IDs and payload hashes, concurrent `-a`/`-b` request identity validation, browser session/control/viewport provenance, exact run-owned reference cleanup, and Tournament replay ordering. The REDs failed on the former subset-only postcondition validation, contract-derived request identity, missing browser provenance, unsuffixed atomic request validation, and assignment discovery without an exact run-owned reference.

Final GREEN (round 3):

`node --test tests/local-certification-competition.test.mjs tests/local-certification-evidence.test.mjs tests/local-certification-operations.test.mjs tests/local-certification-schedule-isolation.test.mjs tests/tournament-scoring-route.test.mjs`

Result: **83/83 passed**.

`npx tsx --test tests/final-certification-fixtures.test.mjs`

Result: **29/29 passed**.

Round-4 RED/GREEN addressed the three remaining Important review findings. The genuine RED run was **19/22** because browser evidence still used synthetic selector IDs, lifecycle reloads did not freeze every material retained field, and replay compared parsed-object serialization rather than original response bytes. The focused GREEN run is now **22/22**. Browser contracts freeze exact selector/role/name/action/result/control/count/viewport objects; the runtime records the exact matched contract and measured boxes. The assigned referee surface has no actionable control, so its contract is explicitly and truthfully `render-only` against the exact `Verified` assignment state. League and retained Tournament replica reloads now compare exact private/public material fields and reset state. League create replay, Tournament create replay, and Tournament archive replay compare SHA-256 hashes of the original raw HTTP response text while preserving canonical no-duplicate assertions.

Final GREEN (round 4):

`node --test tests/local-certification-competition.test.mjs tests/local-certification-evidence.test.mjs tests/local-certification-operations.test.mjs tests/local-certification-schedule-isolation.test.mjs tests/tournament-scoring-route.test.mjs`

Result: **86/86 passed**.

`npx tsx --test tests/final-certification-fixtures.test.mjs`

Result: **29/29 passed**.

Round-5 RED/GREEN closed the remaining prerequisite-selection evidence gap. The RED contract proved that copied selector strings and unverified `.first()` selection could not establish which fixture card was acted on. The GREEN contract requires a run-time locator chain with every prerequisite matching exactly once, plus authoritative fixture and active-team identity. It also rejects browser code that depends on the unavailable `URL` global inside the Playwright CLI evaluation context. The final focused contract run is **23/23**.

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

Fresh round-3 affected-row reruns:

- `tournaments-create-configure-replicate-archive`: `final-cert-t5-260907-142508-c747`, wrapper exit 0, 16/16 cases, zero run errors, create replay before archive with byte-identical event IDs/response, one root/receipt/audit/canonical mapping set, retained replica reload, idempotent archive replay, mapping/public revocation, and cleanup observed.
- `tournaments-schedule-pools-brackets-referees`: `final-cert-t5-260907-142633-2e90`, wrapper exit 0, 12/12 cases, zero run errors, isolated `qa-referee` authentication and visible referee route/control, exact browser provenance, assignment persistence, and cleanup observed.

Fresh round-4 affected-row reruns:

- `leagues-create-edit-clone-delete`: `final-cert-t5-260907-151536-a90b`, wrapper exit 0, 15/15 cases, raw-response replay identity, exact edited private/public retained fields, exact unique `Leagues`/`Create League` browser matches and viewport/count measurements, and cleanup observed (`deleted: 308`, `restored: 1`, zero residue).
- `tournaments-create-configure-replicate-archive`: `final-cert-t5-260907-151638-bcde`, wrapper exit 0, 16/16 cases, raw create/archive replay identity, exact retained replica private/public fields and reset state, exact unique `Modify Series`/`Elite Series Architect` browser matches and viewport/count measurements, and cleanup observed (`deleted: 319`, zero residue).
- `tournaments-schedule-pools-brackets-referees`: `final-cert-t5-260907-151802-7f97`, wrapper exit 0, 12/12 cases, exact `Launch Hub`/unique `Officials`/unique `Match Assignments` evidence, exact console/network counts and viewport objects, truthful `qa-referee` render-only unique `Verified` proof, and cleanup observed (`deleted: 324`, `restored: 1`, zero residue).

Fresh round-5 affected browser reruns:

- `leagues-schedule-generation-deployment`: `final-cert-t5-260907-153936-616a`, wrapper exit 0, 11/11 cases. The exact League tab, authoritative League title, uniquely scoped fixture card, and fixture hub were observed before the `Schedule` action; the real post-deployment `Match Command` result was unique. Cleanup deleted 306 and restored 1 with zero residue.
- `tournaments-create-configure-replicate-archive`: `final-cert-t5-260907-154315-df40`, wrapper exit 0, 16/16 cases. The exact authoritative Tournament title/card/hub and archive-cancel `Modify Series` prerequisite were each observed once. Cleanup deleted 319 with zero residue.
- `tournaments-schedule-pools-brackets-referees`: `final-cert-t5-260907-155602-4683`, wrapper exit 0, 12/12 cases. The authoritative run-mutated Tournament title, uniquely scoped fixture card, card-scoped `Launch Hub`, resulting hub, active Team A identity, desktop/mobile controls, and referee render-only route were all observed. Cleanup deleted 324 and restored 1 with zero residue.
- `tournaments-scoring-dispute-public-standings`: `final-cert-t5-260907-155713-55c3` wrote all 14 case artifacts, including fresh console/network/desktop/mobile browser cases with exact authoritative title/card/hub and Team A identity. The wrapper then truthfully remained nonzero on the pre-existing non-browser `tournament-score-replay` request-ID contract mismatch; no scoring product or replay-contract change was made in this prerequisite-evidence-only round. Cleanup deleted 310 and restored 3 with zero residue.

The result envelope remains `BLOCKED_PRECONDITION` because final external/staging adjudication is intentionally reserved for Task 10; both bounded Task 9 wrappers exited successfully with all local dimensions observed.

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
9. Postconditions are now attached semantically when assertions are created. Validation requires exact full frozen-postcondition coverage and rejects a transport assertion mislabeled as authoritative state.
10. League and Tournament reloads now target retained run-created entities. Create replay uses the exact captured request body identity/hash and proves byte-equivalent response/event IDs plus one mutation root, receipt, audit, and reservation/canonical mappings. Tournament create replay runs immediately after create; archive then proves its own identical replay, single receipt/audit, and expected mapping/public revocation.
11. Atomic clone/replica evidence now captures and validates the exact distinct `-a` and `-b` transport identities instead of comparing a real request to the unsuffixed contract template.
12. Added an isolated registered `qa-referee` fixture/session. Organizer assignment remains an organizer action, the referee-facing responsive case authenticates as the referee on the production referee route, and non-referee denial remains separate.
13. Browser evidence now binds the actual authenticated actor/session, runtime route, row-specific selector/control IDs, viewport measurements, console capture, and network capture to the frozen case. Missing or mismatched provenance is rejected.
14. Competition discovery now accepts only exact declared run-owned fixture references when a derived document (such as a referee assignment) cannot carry the run ID or operation ID itself; unrelated post-baseline state is still refused.
15. Synthetic browser selector/control placeholders were replaced with frozen, case-specific accessible selector/role/name/action/result contracts. Runtime evidence records the exact matched values, exact counts, and full `1440x900`/`390x844` measurement objects; validation rejects any mismatch.
16. The referee page exposes assignment state but no genuine actionable control. Its mobile row now freezes a truthful `render-only` interaction against exact `Verified` content instead of claiming an invented interaction.
17. Lifecycle replay proof now hashes the original raw HTTP response text, not a reserialized parsed object. League reload and retained Tournament replica reload assert exact material private/public identity, configuration, ownership, version, and reset fields.
18. Browser prerequisite actions no longer choose the first generic match. League selection is scoped through the exact authoritative title and unique card/hub; Tournament selection uses the exact authoritative event title, unique card, card-scoped `Launch Hub` when applicable, resulting hub, active team, and unique `Modify Series` prerequisite for archive cancel. Evidence records every observed locator string, count, and DOM identity in order; validation rejects missing, duplicate, reordered, copied, or mismatched evidence.
19. Tournament titles changed by schedule/scoring setup are read from the authoritative Firestore fixture immediately before browser navigation, preventing a stale catalog title from being mistaken for the rendered fixture. The referee mobile route extracts its observed fixture ID without relying on the Playwright CLI evaluation context's unavailable `URL` global.

## Final verification

- `command -v npx` — PASS.
- syntax checks for the runner, operations, evidence, and isolation modules — PASS.
- focused contract/regression tests — 87/87 PASS.
- final fixture/catalog tests — 29/29 PASS.
- `npm run typecheck` — PASS.
- scoped ESLint — PASS with zero errors and nine existing warnings in the legacy runner.
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
