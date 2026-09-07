# Competition certification handoff

Date: 2026-09-07

Certified local candidate: `ef6ece2560bdaf7bac91627cb46d5b7fba88fb26`

Scope: the seven frozen League and Tournament rows only.

## Result

The local emulator/browser portion is complete. The immutable-candidate combined run `final-cert-t5-260907-165345-7ee2` completed with wrapper exit 0: 94/94 exact cases were `OBSERVED`, all declared dimensions were present, `runErrors` was empty, and cleanup deleted 372 records, restored 13 baseline records, and left zero retained audit/residual records. Every browser row captured its exact actor/session, accessible selector and control, `1440x900` and `390x844` bounds, expected console/network observations, request identity where applicable, authoritative state, and case-owned cleanup.

The runner correctly leaves all seven matrix outcomes `BLOCKED_PRECONDITION`, not `PASS`, because exact-revision staging execution has not been observed. League scoring additionally requires deployed background projection-trigger convergence. This local result does not prove deployed Functions delivery, an outbound provider, or physical-device push.

Authoritative artifact:

`output/playwright/2026-09-04-final-certification/task-5/final-cert-t5-260907-165345-7ee2/results.json`

## Isolated row evidence

The dependency-ordered isolated executions used the working tree based on Task 9 candidate `b805319baf17c85e44a4f91ccb255288324ef92c`, plus the scoped Task 10 fix later committed as `ef6ece25`. These runs are diagnostic row proof; the immutable-candidate authority is the combined run above.

| Row | Run ID | Exact cases | Cleanup deleted/restored/residue |
|---|---|---:|---:|
| League lifecycle | `final-cert-t5-260907-160756-1738` | 15/15 | 308/1/0 |
| League schedule | `final-cert-t5-260907-162012-762e` | 11/11 | 306/1/0 |
| League registration/assignment | `final-cert-t5-260907-162137-ce12` | 14/14 | 305/5/0 |
| League scoring/spectator | `final-cert-t5-260907-162736-114e` | 12/12 | 306/2/0 |
| Tournament lifecycle | `final-cert-t5-260907-162840-4f8c` | 16/16 | 319/0/0 |
| Tournament schedule/referees | `final-cert-t5-260907-162959-da98` | 12/12 | 324/1/0 |
| Tournament scoring/disputes | `final-cert-t5-260907-163102-980d` | 14/14 | 310/3/0 |

The earlier combined diagnostic `final-cert-t5-260907-163213-8a31` also observed 94/94 cases with no run errors and cleanup 372/13/0, but its artifact identifies the pre-fix base commit. It was therefore superseded by the exact immutable-candidate run.

## Defects fixed and contained

1. The League browser prerequisite contract expected `League` while the accessible tab is `Leagues`. A genuine RED contract and browser diagnostics exposed an embedded-regex escaping defect that normalized away `s`. The harness now freezes `Leagues`, obtains the accessible name from the ARIA snapshot, and preserves mismatch diagnostics.
2. `tournament-score-replay` lacked its mapping to `tournament-score-submit`; the replay now reuses the exact original request ID/body.
3. Exact evidence validation exposed missing schedule/scoring state and zero-mutation postconditions, plus the League score replay mapping. The dedicated handlers now prove those frozen postconditions rather than weakening the validator.
4. Desktop competition content overflowed the viewport because the shared Shell flex child could not shrink. `min-w-0` is now present. The focused validator regression rejects `mainFits=false`; League lifecycle/schedule/scoring and Tournament lifecycle/schedule/scoring then proved desktop and mobile numeric bounds.
5. Chat completed all 14 assertions but exceeded the generic 60-second scenario cap. The real browser flow remained bounded by its 15-second UI and 20-second HTTP limits; only the overall browser scenario cap was raised to 90 seconds. Isolated rerun `final-cert-t5-260907-164348-4013` passed 14/14 with cleanup 302/1/0.
6. Three pre-existing broad checks asserted obsolete source strings. They now assert the current stricter seams: shared Practice validation, create-only immutable waiver receipt writes, and non-enumerating calendar revocation.

Material nonzero diagnostics were retained: `160859-c92f`, `161037-ac53`, and `161143-2a37` exposed the League name normalization; `161304-c432`, `161533-e990`, `161655-ebc8`, and `161745-0210` exposed schedule proof/browser gaps; `162244-1449`, `162411-c4d8`, and `162546-3ef4` exposed scoring proof/replay gaps; `163833-9aad` and `164144-9d22` exposed the Chat scenario timeout. An affected-row selector attempt also exited 1 before execution because `background-league-projections-member-cache` has no assigned local operations handler; its projection seam was covered by focused automated tests instead.

## Affected regressions and engineering gates

- Affected Registration, Facilities, public projection, Push, Practice, waiver, and calendar seams: 142/142 PASS.
- Chat isolated browser regression: 14/14 PASS.
- Competition/evidence/operations/schedule/scoring contracts: 91/91 PASS.
- Certification fixture contracts: 29/29 PASS.
- Firestore and Storage rules: 65/65 PASS.
- TypeScript typecheck: exit 0.
- Scoped ESLint: exit 0, zero errors (existing warnings remain).
- Functions TypeScript build: exit 0.
- Runner syntax check: exit 0.
- Next.js production build: exit 0; 580 static pages generated (existing warnings remain).
- Scoped and final diff whitespace checks: PASS.

Facilities and Push are not assigned executable local browser handlers in the frozen operations batch; no browser PASS is inferred for those accepted rows. Their directly affected code seams passed the focused automated regression set. No unrelated accepted row was rerun.

## External completion gates

Before any final production-ready declaration, deploy the exact candidate revision and observe the seven staging workflows against that revision. Also observe the deployed League public-projection trigger converging after create/update/delete and entitlement changes. Provider delivery and physical-device notification evidence remain separate only where the authoritative audit matrix requires them; this handoff makes no such claim.
