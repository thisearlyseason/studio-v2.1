# Phase 9 Fixture Lifecycle

## Result

`INCONCLUSIVE-HARNESS` — the v3 fixture seeded successfully, but its mandatory first inspection found one deterministic definition-versus-hosted-shape mismatch. Browser verification did not start.

## Guard and seed

| Gate | Sanitized result |
| --- | --- |
| Read-only preflight | PASS — exact staging project and canonical origin; `safe=true` |
| Planned graph | Manifest v3; `20` Auth identities; `81` Firestore documents; `1` expected-absent profile |
| Seed | `state=seeded`; created `20/81` |
| Credential confinement | PASS — external regular file, mode `0600` |
| Expected absence | No collision was reported for the intentionally absent missing-profile document |

## Mandatory inspection stop

The first inspection observed all expected-present resources (`20` Auth and `81` Firestore) but returned `ok=false`, manifest state `seeded`, and one drift item:

| Alias | Kind | Field | Result |
| --- | --- | --- | --- |
| `qa-league` | Firestore shape | `memberUserIds` | Unexpected relative to the committed v3 definition |

A guarded exact-document comparison, without retaining field values, confirmed `extraFields=[memberUserIds]` and `missingFields=[]`. The deployed trusted league synchronization trigger derives this cache from the league creator and writes it after league creation. The v3 fixture definition omits the same deterministic field, so strict inspection rejects the hosted result. This is a fixture-harness contract mismatch, not browser product evidence and not a product defect.

Canonical progression stopped immediately. No login, route, tenant, logout, multi-tab, or pending-deletion browser scenario ran, and the pending-deletion transition was not invoked.

## Local correction before retry

Fix round 1 added the deterministic creator-backed `memberUserIds` value to the v3 `qa-league` definition and a focused assertion in `tests/qa-fixture-safety.test.mjs`. `functions/src/index.ts` remains unchanged; it is the trusted producer that explains the observed field. The local regression and full verification gates pass, but this correction is not yet deployed and the blocked browser ledger is not promoted. Independent review, exact reviewed staging deployment, and a complete fresh Task 7 lifecycle remain required.
