# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 owns exactly the 16 frozen tenant/family scenarios. The immutable local
Chrome run `final-cert-t4-260905-175331-3198` executed implementation commit
`9214352c93d5cf59b56aca0b893ef07988dc48a5`: 16 scenarios, 176/176 required
case records observed, 112/112 local dimensions observed, zero failed cases,
and zero run errors. Cleanup was `OBSERVED` with 301 measured deletions, 32
verified restorations, zero residuals, and zero retained audit records.

Every row remains `BLOCKED`, not `PASS`, pending execution on the exact staging
revision. Youth activation additionally needs approved QA mailbox delivery and
receipt. The run used only loopback Firebase emulators and the local Next
server; production remained read-only and provider delivery was not invoked.

## Implemented and Executed Work

- The tenant runner requires scenario-specific assertion sets for all 16 rows;
  generic case counts or renamed lifecycle labels cannot satisfy a row.
- Team creation executes three creator roles and a concurrent one-seat race,
  with server-derived ownership and member/user projections. Join executes
  preview/session and POST flows, linked-child concurrency, inactive-current-
  state denial, and wrong-guardian denial.
- Settings performs an actual owner UI edit and verifies the saved value after
  desktop/mobile reloads. Branding executes owner upload/replacement/removal
  plus outsider and unsafe-type denials. Module visibility persists the frozen
  eight-key set and checks all eight navigation/direct-route denials in both
  viewports.
- Seasonal reset uses a fresh run-owned squad. It executes selected and repeated
  complete reset routes, while behavioral tests fault every durable obligation:
  Storage, player projection, user membership, recursive member descendants,
  and atomic primary-team reconciliation with a concurrent companion-team join.
- Organization flows execute school owner/delegate/outsider reads, constituent
  mutation, seat release/reallocation, global waiver copy reconciliation, and
  administrator add/remove projections. Guardian participant signing remains
  distinct from the exact staff-only coach-signature contract.
- Roster work executes remove/reinstate mutation and accented/removed filtering.
  The browser downloads the real TXT manifest at both viewports, reads its
  bytes, proves stable content, and rejects private fields.
- Recruiting executes authenticated private document mutations and canonical
  hidden-active-committed-hidden public transitions, with recursive public-media
  allowlisting and private/cross-tenant denials.
- Family work uses two linked children across Team A and Team C, exercises the
  schedule/waiver/payment consumer graph and guardian signature route, and
  activates a separate youth Auth identity. Youth reuse is denied and the
  activated child opens its own roster view in both viewports.

## Product Defects Repaired

- **BUG-032:** the compatibility youth-invite endpoint delegates to the
  canonical Family contract.
- **BUG-033:** recruiting status has one canonical writer and preserves
  `committed`.
- **BUG-034:** inactive code-only preview and POST paths recheck current squad
  state, including at the transaction boundary.
- **BUG-035:** reset categories are server-scoped and complete reset retains a
  durable exact obligation plan until every projection, descendant, and Storage
  postcondition is proven.
- **BUG-036:** guardian-managed enrollment preserves the child's separate
  identity until youth activation.
- **BUG-037:** public video segments use a recursive bounded allowlist.
- **BUG-038:** staff coach signatures and guardian participant signatures have
  separate exact schemas and authority paths.
- **BUG-039:** releasing a squad seat preserves the organization relationship
  needed for legitimate reallocation.

The round-three work also repaired audit defects in exact mandatory-operation
enforcement, runtime actor/target/request provenance, allowlisted sensitive-data
evidence, recursive missing-intermediate cleanup, pre-response join-session
ownership, bounded race termination, structured original/restoration failure
diagnostics, settings hydration waits, download-stream decoding, and owned
Radix overlay/toast settlement.

## Safety and Evidence

Preflight validates real consumer capabilities and referential fixtures before
mutation. Authority is derived only from verified server state; request identity
fields are rejected. Tenant evidence is allowlisted and records the runtime
executor, target, operation, sanitized request, separate Admin reconciliation,
artifact root, and cleanup reference. UID/token/private-contact field variants
and their normalized forms are rejected.

Server-created Auth, Firestore, Storage, preview, browser-session, process, and
artifact resources are registered before mutation or discovered with exact
run/time bounds through ambiguous responses. Cleanup recursively proves both
roots and missing-intermediate descendants absent. Race helpers require an owned
terminator before callbacks start and do not return while late mutation remains
possible.

## Verification

- Focused Task 4 and runner suite: 125 passed, 0 failed.
- Full application suite: 671 passed, 0 failed.
- Firestore/Storage rules suite: 42 passed, 0 failed.
- `npm run typecheck`: exit 0 (serial rerun after the build regenerated types).
- `npm run build`: exit 0.
- Task 3 team-switch browser regression: exit 0; cleanup 299/0/0.
- Task 3 Alerts browser regression: exit 0; exactly two eligible alerts,
  exclusions/persistence/mobile checks observed; cleanup 299/0/0.
- Focused roster browser run `final-cert-t4-260905-173946-f49e`: exit 0;
  cleanup 299 deleted / 1 restored / 0 retained.
- Immutable Chrome batch `final-cert-t4-260905-175331-3198` on
  `9214352c93d5cf59b56aca0b893ef07988dc48a5`: 16 scenarios, 176/176 cases,
  112/112 local dimensions, zero failures/run errors; cleanup 301 deleted / 32
  restored / 0 retained, with zero residuals.

## Remaining External Gates

1. Deploy exact implementation commit `9214352c93d5cf59b56aca0b893ef07988dc48a5`
   to the authorized staging companion and repeat the 16 rows with disposable
   run-prefixed data and exact cleanup.
2. Observe approved mailbox delivery and receipt for the youth invitation.
3. Keep production read-only. Stripe/provider and physical-device work belongs
   to later certification batches and is not inferred here.
