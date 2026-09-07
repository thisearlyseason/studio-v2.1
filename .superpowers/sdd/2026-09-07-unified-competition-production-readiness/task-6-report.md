# Task 6 Report — Tournament Scheduling, Pools, Brackets, and Referees

## Outcome

Tournament schedule, pool-seeding, clearing, referee-pool, and referee-assignment mutations now cross one authenticated server boundary. Every command carries a bounded stable request identity plus lifecycle and schedule versions, revalidates authority and current event state in the committing transaction, shares the existing competition schedule lock, records an immutable receipt/audit, and fails atomically on stale, conflicting, or ineligible work.

Referee contact details are stored in the server-only `tournamentReferees` collection. The team-readable event keeps only the safe referee projection (ID, name, certification, status). Authoritative `tournamentRefereeAssignments` records provide exact-interval, cross-event conflict detection; client event arrays are projections only. Archive/delete cleanup removes only the current tenant's bookings, assignments, and private profiles.

## Genuine RED evidence

- `node --import tsx --test tests/tournament-referee-route.test.mjs` initially produced **1 pass / 5 failures**: add returned 400, stale versions mutated successfully, exact back-to-back assignments conflicted, cross-event overlap was accepted, and removed/foreign referees were accepted.
- The corrected transaction-demotion fixture then proved demoted staff could still reach a mutation before the server-owned implementation.
- `npm run test:rules` produced **64 pass / 1 fail** because a direct client tournament schedule/referee/status update was still allowed.
- `node --import tsx --test --test-name-pattern='archive atomically' tests/tournament-lifecycle-route.test.mjs` produced **0 pass / 1 fail** when an authoritative referee assignment survived archive.
- A focused source-boundary test failed before the clear-schedule UI used the server action.
- The referee privacy regression failed because the team-readable root still contained `riley@example.test`; a subsequent lifecycle RED proved the new private profile survived archive.

## Implementation and files changed

- `src/lib/server-tournament-schedule-deployment.ts`
  - Added the transaction-owned command executor for deploy, clear, pool seed, referee add/remove, and referee assignment.
  - Reused Task 1 request identity/receipt semantics and the shared schedule mutation lock.
  - Added lifecycle/schedule optimistic concurrency, topology/resource/daily validation, downstream-result locks, atomic booking publication, and exact referee interval conflicts.
  - Added server-only referee profiles and safe public projections.
- `src/app/api/tournaments/schedule/route.ts`
  - Routed Task 6 actions through the new command boundary while preserving the Task 7 scoring/dispute seam.
- `src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx`
  - Replaced direct client writes with stable, version-bound server requests and added the existing-flow clear action without redesigning the UI.
- `src/app/api/tournaments/lifecycle/route.ts`
  - Required seam: archive/delete atomically cleans up tenant-owned authoritative referee assignments and private referee profiles.
- `src/components/providers/team-provider.tsx`
  - Required type seam: exposed `scheduleVersion` on `TeamEvent`.
- `firestore.rules`
  - Made tournament schedule/referee/scoring projections and nested bracket writes server-only; denied all client access to authoritative assignments and private referee profiles.
- `tests/tournament-referee-route.test.mjs`
  - Added replay, version, concurrency, interval-boundary, cross-event/tenant, demotion, pool-lock, clear, and privacy coverage.
- `tests/server-tournament-schedule-deployment.test.mjs`
  - Updated server-boundary/source checks and covered every supported topology.
- `tests/tournament-lifecycle-route.test.mjs`
  - Covered assignment/private-profile archive cleanup.
- `tests/rules/firestore-rules.test.mjs`
  - Covered the new direct-client denial boundaries.

`src/lib/tournament-standings.ts` now excludes disputed completed results from overall and head-to-head calculations; unresolved pool disputes also block knockout seeding.

## Fresh GREEN verification

- Affected functional suite:
  - `node --import tsx --test tests/server-tournament-schedule-deployment.test.mjs tests/tournament-bracket-progression.test.mjs tests/tournament-referee-route.test.mjs tests/tournament-lifecycle-route.test.mjs tests/tournament-replication.test.mjs tests/tournament-scoring-route.test.mjs tests/tournament-standings.test.mjs tests/public-portals.test.mjs`
  - **89 tests passed, 0 failed**.
- Firestore/Storage rules:
  - `npm run test:rules`
  - **65 tests passed, 0 failed**; Firebase emulator command exited 0.
- Static gates:
  - `npm run typecheck` — exit 0.
  - `npx eslint 'src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx' 'src/app/api/tournaments/lifecycle/route.ts' 'src/app/api/tournaments/schedule/route.ts' 'src/components/providers/team-provider.tsx' 'src/lib/server-tournament-schedule-deployment.ts' --quiet` — exit 0.
  - `git diff --check` — exit 0.
  - `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8'))"` — exit 0; the new reads use existing single-field indexes.

## Self-review and concerns

- Tenant ownership is filtered after same-event-ID collection queries, so cleanup cannot delete another team's colliding event records.
- Exact boundaries use half-open time intervals; back-to-back assignments are permitted while any actual overlap is rejected across events.
- Replay uses canonical payload hashes; changed payloads under one request ID collide rather than silently replaying.
- Existing legacy referee contact data is transactionally migrated before projection scrubbing when a Task 6 command or an authenticated legacy referee portal access touches the Tournament.
- Task 7 score/dispute mutations intentionally remain on their existing seam for Task 7 rather than being redesigned here.

## External evidence limits

This report is local code, emulator, and automated-test evidence for the exact working revision. It does not claim staging deployment, provider delivery, worker execution, production data migration, or physical-device evidence. Those remain separate release gates where applicable.

## Review round 1 corrections

Seven review findings were reproduced with focused failing tests and corrected:

1. The authenticated referee portal now resolves the server-only profile and returns only ID, name, and certification. Untouched legacy contacts are migrated transactionally on verified access.
2. Every Task 6 command migrates bounded legacy contact fields to `tournamentReferees` before publishing the safe root projection, preserving referee assignment/authentication.
3. Redeploy checks authoritative assignment documents and refuses to orphan or reinterpret assignments hidden by a stale event projection.
4. Clear is now recoverable and bounded: a durable request-bound marker prevents collisions, bookings and assignments are removed in batches of at most 400 deletes plus one progress write, and the final schedule/version/receipt is committed only after authoritative queries are empty. A 600-document fixture and stable resume/replay are covered.
5. Advanced Tournament mutations revalidate the current squad Pro allocation in the committing transaction; downgraded squads retain safe clear/archive cleanup.
6. Both scorekeeper editors now use server-owned private HMAC credentials. Registration config plus credential commit atomically, the standalone editor uses an authenticated server route, public verification/scoring reads the private hash, and correct legacy credentials migrate atomically without retaining the root secret.
7. Disputed completed pool games do not count in standings and block knockout seeding until resolved.

Additional required seam files are `src/app/api/tournaments/credential/route.ts`, `src/app/api/public/portals/{route,action/route}.ts`, `src/app/api/registrations/config/route.ts`, `src/lib/{server-competition-credential,public-portal-data}.ts`, the Tournament Registration builder, `firestore.indexes.json`, and their focused tests. Two compound equality indexes support bounded tenant/event referee queries.

Final review verification:

- Affected Task 5/6/7, public portal, Registration, standings, and source-boundary suite: **123 passed, 0 failed** with shell `pipefail` enabled.
- Firestore/Storage rules: **65 passed, 0 failed**.
- `npm run typecheck`, scoped ESLint `--quiet`, `git diff --check`, and index JSON/content validation: exit 0.
