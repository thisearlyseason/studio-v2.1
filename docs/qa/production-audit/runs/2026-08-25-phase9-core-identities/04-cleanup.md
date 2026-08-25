# Phase 9 Fixture Cleanup

Cleanup began immediately after the mandatory inspection stop. It was limited to the exact manifest-listed resources in `the-squad-v2-staging`.

| Proof | Result |
| --- | --- |
| Pre-cleanup actual presence | `20` Auth / `81` Firestore |
| Guarded exact cleanup | PASS — deleted `20` Auth / `81` Firestore |
| Retained aliases | `0` Auth / `0` Firestore |
| Cleanup failures | `0` Auth / `0` Firestore |
| Post-cleanup lifecycle inspect | PASS — manifest `cleaned`; problems `0`; actual presence `0/0` |
| Independent separately initialized adapter | PASS for the original manifest — exact project; checked `20/81`; `authPresent=0`; `firestorePresent=0` |
| Credential helper | PASS — exact external credential removed; path absent |
| Browser sessions | `0` opened; close-all guard completed |
| Private workspace | Exact mode-`0700` workspace removed and proved absent |
| Guardian | Disarmed only after all absence proofs passed |

No broad user listing, collection enumeration, recursive deletion, unresolved path, production operation, or retained raw artifact was used.

## Review correction

The original manifest did not include the trusted league-create trigger's derived `publicLeagueViews/{leagueId}` document. Deleting the source league invokes `onLeagueDeleted`, which deletes that projection, but the original independent adapter probe checked only the 81 journaled paths and did not retain an exact query for the derived path. Accordingly, the table proves manifest-scoped cleanup, not complete trigger-footprint cleanup; overall closure is `INCONCLUSIVE` and must not be promoted.

Fix round 2 expands new v3 runs to `82` exact Firestore paths. The derived projection is not written by the fixture client. It is accepted only with the exact producer projection and server timestamp, and cleanup orders it before its source league and requires the persisted run-owned source plus Auth ownership proof before deletion. A fresh corrected lifecycle must prove `20/82 → 0/0` independently.

Fix round 3 closes a fail-open ownership initialization found during review: a trigger-derived document now starts unowned regardless of marker-like fields and becomes deletable only after both its complete exact projection and its source/proof ownership chain validate. A malformed marker-shaped projection retains the projection, league, ownership proof, and creator Auth identity for exact follow-up. This remains a local correction and does not change the original run's `INCONCLUSIVE` status.
