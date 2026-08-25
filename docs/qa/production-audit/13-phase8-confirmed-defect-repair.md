# Phase 8 Confirmed Defect Repair

**Status:** implementation and exact staging verification complete; release remains **NOT READY**.

Phase 8 repaired `BUG-006`, `BUG-007`, and `BUG-010`; 83 contracts remain outside Phase 8 and were not executed. The reviewed application revision was `b495b4eafe5fd9caf6e04c4cf5500a2b6d0baf97`; protected staging workflow `32806782497` deployed that exact SHA and passed every deployment and health gate.

## Verified outcomes

- Suspended accounts: both fresh mobile and desktop contexts visibly observed the generic unavailable message, received session POST `403`, retained no `__session`, remained on `/login`, and started zero protected requests/listeners.
- Removed members: both fresh contexts received the approved account-level session POST `200`, reached `/teams/join`, started zero former-team listeners, rendered no former-team UI, and received `403` for the former Team A document. Removed/deleted membership-cache projections are filtered before active-team selection.
- League assignments: Team A and Team B owners each received an own-team `200` with an array-shaped `assignments` field, changed-team API `403`, and direct cross-tenant Firestore GET/PATCH `403/403` at both viewports. The exact collection-group field override is deployed and authorization precedes the bounded query.
- Trusted compatibility: anonymous demo, onboarding, superadmin, league creator, primary club authority, multi-squad, and canonically corroborated school-admin paths remain covered locally. A profile-only `isSchoolAdmin` flag is not authority.

The canonical browser ledger is `12/12 PASS`; its closure supplement is `8/8 PASS`, with a focused `2/2 PASS` suspended visible-message resample. Fixture cleanup deleted `9 Auth / 39 remaining Firestore`, retained none, and both lifecycle and independent canonical probes returned `authPresent=0` and `firestorePresent=0`. Every supplemental lifecycle also returned to `0/0`. Credentials, raw browser state, and the private workspaces are absent.

## Audit posture

The three formerly failed matrix rows return to `BLOCKED`, not `PASS`, because their Phase 8 defect slices now pass while named wrong-password/deep-link/deleted-account, broader role/plan, and public registration/assignment variants remain unexecuted. Matrix arithmetic is therefore `2 PASS / 0 FAIL / 86 BLOCKED = 88`. Of those blocked rows, 83 are the contracts explicitly outside Phase 8; the other three are the repaired rows whose remaining variants are still visible.

No production environment, customer data, provider sandbox, production deployment, or pull-request merge was authorized or performed.
