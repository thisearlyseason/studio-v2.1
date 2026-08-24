# Phase 7 Staging Fixture Foundation

**Phase 7 base:** `3aae3288c459670a4f35993762069d22f81b307f`\
**Task 5 reconciliation input HEAD:** `72e8ebab1a26e2a73f43d6478129d31a293cccf2`\
**Final-review-2 input HEAD:** `1b298acc333f5d41160e23ae4b974935bbec0b51`\
**Last independently proven deployed SHA:** `658d3ca89f3cabf6c55800400aa17bc72229c1af`\
**Environment:** isolated Firebase project `the-squad-v2-staging`, App Hosting backend `studio`, canonical hosted staging origin\
**Release decision:** `NOT READY`

## Outcome

Phase 7 established a guarded, idempotent synthetic fixture lifecycle and used it to collect fresh hosted-staging authentication, role, session, and tenant-isolation evidence. The final canonical browser ledger contains 32 unique contexts: 26 `PASS`, two `FAIL-BUG-006`, two `FAIL-BUG-007`, and two `FAIL-BUG-010`.

The coverage matrix now contains 2 `PASS`, 3 `FAIL`, and 83 `BLOCKED` rows. The three failed rows link to three confirmed unresolved product defects: two P1 and one P2. No passing partial scenario promoted an incomplete matrix row. Release remains **`NOT READY`** because confirmed product mismatches and 83 incomplete production-readiness contracts remain.

Phase 7 does not claim a repair root cause for the three product findings. Its evidence confirms symptoms and relevant session/API/data-flow outcomes; code-level root-cause analysis and TDD repairs belong to the next authorized phase.

## Revision and evidence chain

| Item | Revision or evidence |
|---|---|
| Approved phase starting revision | `3aae3288c459670a4f35993762069d22f81b307f` |
| Fixture implementation and safety-repair chain | `063fb33` through the final committed revision; this report intentionally does not self-embed its own hash |
| Final sanitized hosted evidence commit / Task 5 input HEAD | `72e8ebab1a26e2a73f43d6478129d31a293cccf2` |
| Final-review-2 input HEAD | `1b298acc333f5d41160e23ae4b974935bbec0b51` |
| Last independently proven deployed application revision | `658d3ca89f3cabf6c55800400aa17bc72229c1af` |
| Authoritative hosted evidence | `runs/2026-08-24-phase7-staging-fixtures/00-environment.md` through `04-roster-console-diagnostic.md` |

Task 4 did not infer a newer deployed revision from application behavior. The reconciliation commit is the commit containing this report and is intentionally not self-embedded as a hash.

## Fixture safety design

Every hosted command required two exact caller confirmations, `ALLOW_STAGING_QA_FIXTURES=true`, independent Firebase Admin resolution to `the-squad-v2-staging`, rejection of production/default aliases and emulator variables, fixed `qa-phase7-` identifiers, and exact external-manifest ownership. Mutation clients remained unreachable until all preflight guards passed.

Credentials and raw browser state stayed in external private workspaces: directory/raw modes were `0700`, credential files were `0600`, and no password, token, cookie, private key, action link, service-account JSON, or secret environment value was printed or retained. Cleanup revalidated every manifest-listed UID/path before deletion and exposed no broad or recursive delete primitive.

Final review strengthened this boundary further. Canonical run IDs now require a valid compact UTC timestamp plus a 12–32 character lowercase random suffix. Manifest schema version 2 pre-journals the complete intended resource set before the first mutation, persists through atomic temporary-file rename, and stores versioned resumable negative-transition checkpoints with mutation, cache-deletion, revocation, and completion timestamps. Fault-injection tests cover ambiguous Auth creation, ambiguous Firestore writes, interrupted manifest replacement, suspended-state interruption, and removed-member cache-deletion interruption. Exhaustive inspection compares every deterministic Auth and Firestore field, permits only manifest-proven transition state, and treats exact cleaned absence as healthy with explicit actual-present counts.

Final review 2 closed the remaining lifecycle and repository-hygiene gaps without another hosted mutation. Seed run IDs are generated internally and cannot be supplied by CLI callers. Re-seeding is rejected before credentials or adapters can mutate whenever a negative transition has started or cleanup has completed. Inspection treats missing expected resources in planned, partial, or transition states as sanitized drift and rejects unexpected top-level Firestore fields. Credential publication now writes a complete same-directory private temporary file and atomically creates the final path without replacement; interruption cannot expose an empty final credential, and an existing destination is preserved. Cleanup continues across individual adapter failures while reporting only counts and deterministic fixture aliases for retained resources and failures.

Task 7 made every manifest-v2 transition journal structurally complete: both `qa-suspended` and `qa-removed-member` records are mandatory and retain the existing active, applying, and alias-specific final-state checkpoint rules. Omitted or one-alias journals now fail validation before credential or adapter access, so they cannot bypass terminal re-seed protection or strand a run that cannot transition. Existing seed journals are read and validated as pure local input after the caller-intent guard but before adapter factory or connection access; a nonexistent manifest remains the valid fresh-seed path.

Repository hygiene reads tracked regular-file bytes from the Git index object database, separately size-preflights and reads one current regular worktree copy for every cached tracked path, and reads deduplicated unignored worktree paths while failing closed on enumeration, metadata, blob, or read errors. It does not trust Git modified-state reporting, so `assume-unchanged` cannot hide current bytes; an actually deleted cached path continues to rely on its index blob. All sources are size-preflighted before content reads, with an 8 MiB per-source cap and a 64 MiB aggregate scanned-source cap; Git content uses a size-validated bounded batch and worktree content uses bounded exact-size reads. Every parent component is checked and rejected if symbolic, the final open requires `O_NOFOLLOW`, and platforms without that flag fail closed before opening content. The scanner recognizes complete, wrapped, serialized, encoded, and NUL-containing fixture manifests and credential payloads with bounded iterative decoding, including credential-shaped HAR header records and raw `Cookie:` lines for the managed session cookie. Harmless placeholders, ordinary cookies, and non-credential token/session configuration remain accepted. No source-file allowlist is used.

Atomic credential publication retains the same-directory `0600` temporary file plus no-replace hard-link primitive and never falls back to overwrite rename. The temporary and destination names therefore require hard-link support on the same filesystem; same-directory creation supplies the same-filesystem placement, while filesystems or mounts that reject hard links require operator recovery. Unsupported hard-link capability and exact-temporary-file unlink failures are reported only as sanitized recovery-required errors, without raw operating-system messages or filesystem paths.

The suspended and removed-member identities were seeded active. Both reached `/dashboard` with a session at mobile and desktop before the guarded transitions changed their state and revoked tokens. This sequencing prevents a malformed negative fixture from being mistaken for a product denial.

## Exact lifecycle reconciliation

| Lifecycle | Seeded Auth / Firestore | Cleanup action | Independent final presence |
|---|---:|---:|---:|
| Original adapter-shape preflight stop | `0 / 0` | Not applicable; no manifest | `0 / 0` |
| Resolved-project guard stop | `0 / 0` | Not applicable; no manifest | `0 / 0` |
| Authorized initial hosted classification run | `9 / 40` | Deleted `9 / 39`; the removed-member transition had already deleted the fortieth cache path | `0 / 0` |
| Corrected-fixture harness-stop lifecycle | `9 / 40` | Deleted `9 / 40`; retained `0` | `0 / 0` |
| Complete corrected-fixture canonical retry | `9 / 40` | Deleted `9 / 39`; the guarded removed-member transition had deleted one cache path | `0 / 0` |
| Final manifest-v2 safety revalidation | `9 / 40` | Both versioned transitions completed and repeated idempotently; deleted `9 / 39`; retained `0` | Cleaned inspect `0 / 0`; independent adapter `0 / 0` |
| Targeted desktop team-switch replacement | `9 / 40` | Deleted `9 / 40`; retained `0` | `0 / 0` |
| Roster console diagnostic | `9 / 40` | Deleted `9 / 40`; retained `0` | `0 / 0` |
| Final corrected-avatar roster replacement | `9 / 40` | Deleted `9 / 40`; retained `0` | `0 / 0` |

Every manifest-bearing lifecycle completed exact inspect-cleanup-inspect, independently re-resolved staging, and ended with `authPresent=0` and `firestorePresent=0`. All temporary credential files, private workspaces, and raw browser artifacts were removed; retained raw artifacts total `0`.

## Canonical scenario results

| Group | Result | Reconciled evidence |
|---:|---|---|
| 1. Owner login/landing | `PASS` | Owner reached `/dashboard` with a session at both viewports; no console/page error or overflow. |
| 2. Unverified/suspended denial | `FAIL — BUG-006` | Unverified denial and stale suspended-session revocation passed; fresh suspended sign-in returned session `200`, left a session present, and entered an erroring protected flow. |
| 3. Logout/stale reuse | `PASS` for the executed slice | Session DELETE `200`, cookie clearing, direct protected reuse, and saved revoked-session denial passed at both viewports. Explicit Back/cache and simultaneous multi-tab coverage remain outside the executed slice. |
| 4. Permitted role routes | `PASS` for the executed slice | Owner and corrected Assistant Coach reached `/coaches-corner`; corrected ordinary member reached `/roster` cleanly. `BUG-008` and `BUG-009` are retired fixture observations, not product defects. |
| 5. Direct disallowed routes/APIs | `PASS` | Ordinary-member staff/club/billing/admin attempts stayed on the permitted dashboard boundary; admin API returned `403`. |
| 6. Fake superadmin | `PASS` for the executed slice | Profile-only fake authority rendered `Access Denied`; admin API returned `403`; trusted claim absent. Trusted-superadmin happy/revoked-claim coverage remains blocked. |
| 7. Changed tenant identifiers | `FAIL — BUG-010` | Team A and Team B coach-owners—the tested owner subtype of matrix role `ST`—received own-team reads `200`; other-team GET/PATCH/query returned `403`; UI stayed on the authorized tenant; authorized own-team assignments returned `500` symmetrically. |
| 8. Multi-organization switching | `PASS` for the executed slice | Team A→B switch and real reload persistence passed at both viewports; both authorized reads returned `200`; prior team was absent. Back/rapid-switch listener churn remains blocked. |
| 9. Removed-member denial | `FAIL — BUG-007` | Saved session revocation and direct Team A read `403` passed; fresh sign-in still returned session `200` and reached `/dashboard` at both viewports. |

## Coverage reconciliation

| Status | Phase 7 current | Phase 6 historical | Change |
|---|---:|---:|---|
| PASS | 2 | 2 | No incomplete row was promoted. |
| FAIL | 3 | 0 | Authentication login, dashboard role policy, and league registration/assignment contain reproduced mismatches. |
| BLOCKED | 83 | 86 | Three formerly blocked rows became failed rows; four other exercised rows remain blocked with narrowed dependencies. |
| NOT RUN | 0 | 0 | Unchanged. |
| NOT APPLICABLE | 0 | 0 | Unchanged. |
| Total | 88 | 88 | Exact one-to-one row reconciliation. |

The seven rows directly exercised by Task 4 reconcile as follows:

| Matrix row | Phase 7 status | Stable defect or exact remaining dependency |
|---:|---|---|
| 4 — Authentication / Email-password login | `FAIL` | `BUG-006`, `BUG-007`; additional unexecuted variants do not erase either mismatch. |
| 5 — Authentication / Logout-revocation-multi-tab | `BLOCKED` | Explicit Back/cache replay and simultaneous multi-tab propagation across the registered-role matrix. |
| 12 — Dashboard / Role landing and route policy | `FAIL` | `BUG-007`; additional role/plan/state combinations remain unexecuted. |
| 13 — Dashboard / Active team switch | `BLOCKED` | Back navigation, rapid switching/listener churn, and authorization change during switching. |
| 23 — Roster / Member lifecycle | `BLOCKED` | Add/edit/remove/reinstate persistence and the named negative/permission matrix; clean roster rendering alone is partial evidence. |
| 53 — Leagues / Registration-assignment (`V, LC, ST`) | `FAIL` | `BUG-010`; the reproduced actors are coach-owners, an authorized `ST` subtype for the squad-staff assignments API. Broader visitor/league-creator registration and assignment protocol cases remain unexecuted. |
| 78 — Administration / Access and user directory | `BLOCKED` | Trusted-claim happy path, revoked claim, full non-SA role/rules matrix, persistence, and user-directory behavior. |

The other 81 rows retain their prior status and evidence. Each of the 83 blocked rows has a current dependency in its matrix Notes. The remaining categories are complete role/account-state identity sets, provider sandboxes and safe recipients, controlled cross-tenant/provider data, physical-device/browser coverage, destructive-test authorization, and operational rules-drift, backup/restore, rollback, scheduler/log, and least-privilege proof.

## Defect reconciliation

| Severity | Fixed and verified | Closed false positive | Confirmed unresolved |
|---|---:|---:|---:|
| P0 CRITICAL | 0 | 0 | 0 |
| P1 HIGH | 0 | 0 | 2 |
| P2 MEDIUM | 2 | 0 | 1 |
| P3 LOW | 1 | 1 | 0 |
| Total | 3 | 1 | 3 |

`BUG-006` and `BUG-007` are the two unresolved P1 findings; `BUG-010` is the unresolved P2 finding. `BUG-001`, `BUG-002`, and `BUG-003` remain fixed and verified, and `BUG-004` remains closed as a false-positive audit classification.

Historical `BUG-005` is a resolved QA-harness integration issue and was never product runtime behavior. `BUG-008` and `BUG-009` were caused by corrected QA fixture shapes/resources and are retired. None of those three IDs appears as a product-ledger entry.

The failed-row linkage is exact: row 4 links `BUG-006` and `BUG-007`; row 12 links `BUG-007`; row 53 (`V, LC, ST`) links `BUG-010`, whose canonical coach-owner actors are the tested `ST` subtype. Every current failed row has at least one confirmed unresolved ledger entry, and every confirmed unresolved ledger ID appears in an affected failed row.

## Completion gates

| Gate | Fresh final-head result |
|---|---|
| Matrix structure | PASS — 88 rows, 88 unique feature/sub-feature keys, 13 columns per row, and only valid statuses. |
| Matrix arithmetic | PASS — 2 `PASS`, 3 `FAIL`, 83 `BLOCKED`, 0 `NOT RUN`, and 0 `NOT APPLICABLE`; total 88. |
| Blocker mapping | PASS — all 83 blocked rows retain a non-empty current dependency in Notes. |
| Defect linkage | PASS — seven unique ledger entries; unresolved set exactly `BUG-006`, `BUG-007`, `BUG-010`; failed rows exactly 4, 12, and 53 with the linkage recorded above. |
| Credential-value scan | PASS — eight Phase 7 reconciliation/evidence Markdown files scanned; credential-like retained values `0`. |
| Artifact/output absence | PASS — no Phase 7 raw trace, network, stack, HAR, log, JSON, image, video, or archive artifact; no repository-local fixture credential, storage-state, or run-manifest output. |
| Fixture artifact/secret regression | PASS — scans tracked Git blobs and unignored confined worktree files without a source-file allowlist; rejects complete, wrapped, serialized, encoded, and binary fixture or credential material. |
| Focused safety/hygiene tests | PASS — Task 7 fix-round-1 correction set 110 passed, 0 failed. |
| Diff hygiene | PASS — `git diff --check` exited `0`. |
| TypeScript typecheck | PASS — `tsc --noEmit` exited `0`. |
| ESLint | PASS — zero errors; existing warnings remain. |
| Node tests | PASS — Task 7 fix-round-1 exact-head run 499 passed, 0 failed/cancelled/skipped/todo. |
| Rendered component tests | PASS — 2 passed in 1 test file. |
| Firestore/Storage rules tests | PASS — 38 passed, 0 failed/cancelled/skipped/todo. |
| Next.js production build | PASS — optimized production build completed. |
| Functions build | PASS — Functions TypeScript build exited `0`. |
| Complete command | PASS — `npm run verify` exited `0`. |

The final safety revalidation used a strict canonical run ID. Initial exhaustive inspect was healthy at actual-present `9/40` with drift `0`; post-transition inspect was healthy at `9/39`; cleaned inspect was healthy with problems `0` and actual-present `0/0`; and an independent guarded adapter probe also returned `0/0`. Credential and exact private-workspace paths are absent. Final-review-2 tests add crash-safe credential publication, pre-mutation terminal re-seed rejection, non-seeded absence drift, exact Firestore shapes, bounded repository decoding, and sanitized best-effort cleanup coverage. Task 7 adds credential-shaped HAR/raw-cookie coverage, every-cached-path worktree scanning, pre-read source and aggregate caps, exact transition-map invariants enforced before adapter initialization, component-safe worktree acquisition, and sanitized hard-link capability/temp-cleanup failures.

## Review, cleanup, and release posture

Task 4's first independent evidence review found zero Critical and four Important issues involving two fixture shapes, the per-context ledger, and listener timing. The fixture corrections and fresh complete reruns resolved those findings. Subsequent roster-resource diagnosis and corrected-avatar rerun retired the remaining fixture-only observation. The authoritative Task 4 evidence is review-clean, with no unresolved Critical or Important finding.

Independent final review of this Task 5 reconciliation is controller-owned and is not claimed here. No product source, rules, Functions, provider, deployment, production resource, real user, or real customer data was changed by this reconciliation.

The second final-review repair wave changed only the local fixture CLI/lifecycle, repository-hygiene and safety tests, and this audit report. It did not rerun or mutate hosted staging; the sanitized hosted evidence and exact-cleaned lifecycle records above remain authoritative.

Release remains **`NOT READY`**. The next authorized phase should root-cause and repair `BUG-006`, `BUG-007`, and `BUG-010` under TDD, then rerun their affected journeys. The remaining 83 blocked contracts still require their named fixtures, provider/device authorization, destructive boundaries, or operational proof before production readiness can be reconsidered.
