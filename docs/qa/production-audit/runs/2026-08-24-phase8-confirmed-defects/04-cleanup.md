# Phase 8 Fixture Cleanup

The canonical lifecycle independently resolved only `the-squad-v2-staging`, seeded `9` Auth identities and `40` exact Firestore paths, and inspected with drift `0`. Both guarded negative transitions completed. The removed-member transition deleted the one membership-cache path, so the pre-cleanup state was `9 Auth / 39 Firestore` with problems `0`.

Exact cleanup returned:

- Auth deleted: `9`
- Firestore deleted: `39`
- Retained aliases: `0`
- Auth failures: `0`
- Firestore failures: `0`

Post-cleanup lifecycle inspection was healthy with actual presence `0/0` and problems `0`. A separate adapter probe independently resolved `the-squad-v2-staging` and returned `authPresent=0`, `firestorePresent=0`. The credential helper removed the mode-`0600` credential file, all Chrome contexts were closed, and the mode-`0700` private workspace is absent.

Harness-calibration attempts were not treated as product evidence. Where a calibration stop left an exact fixture run, recovery first required all fixed fixture email aliases to carry the same valid QA run marker, exact alias, version, expiry, deterministic UID, and exact Firestore ownership marker. Only that derived UID/path set was deleted, and each recovery ended at `0/0`. No broad user listing, collection enumeration, recursive delete, production access, or retained raw artifact was used.

The closure-critical evidence supplement used fresh exact guarded lifecycles. Each successful lifecycle repeated `9/40 → 9/39 → 0/0`, with retained and failure counts zero, credentials removed, all named Chrome contexts closed, and its mode-`0700` private workspace absent. A stopped harness-only attempt also completed exact journal cleanup before any retry; it supplied no product evidence. These supplementary lifecycles did not alter the canonical cleanup arithmetic above.
