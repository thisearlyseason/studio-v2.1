# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 owns exactly the 16 frozen tenant/family scenarios. The final immutable
local Chrome run `final-cert-t4-260905-195812-03c6` exercised the complete
round-four candidate tree: 16 scenarios, 177/177 required case records
observed, 112/112 local dimensions observed, zero failed cases, and zero run
errors. Cleanup was `OBSERVED` with 301 measured deletions, 46 verified
restorations, zero residuals, and zero retained audit records. The evidence
recorder names baseline commit `58a207fb` because the reviewed round-four diff
and this report are committed together after immutable execution.

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
- Canonical and legacy module flags now share one route policy. Mixed records
  give canonical values precedence, and settings writes migrate the
  `volunteer`/`library` aliases without reopening legacy `roster`, `playbook`,
  or `tacticalChat` routes.
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
- Family squad metadata is now derived by a verified guardian endpoint instead
  of direct guardian memberships, so the exact Team A and Team C names render
  in cards and aggregate consumers. The organization overview similarly merges
  the server-scoped squad aggregate and cannot substitute a member's name for a
  squad's `teamName`.

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
- **BUG-040:** family cards resolve safe metadata for child-only squads through
  a server-derived guardian scope.
- **BUG-041:** organization aggregates include every authorized constituent
  squad and preserve the squad name projection.
- **BUG-042:** adult self-enrollment reuses the single server-bound player
  identity instead of inventing `p_<uid>` or trusting client hints.
- **BUG-043:** canonical and legacy module flags enforce one migration-safe
  route and persistence policy.

The round-four work also repaired audit defects in exact mandatory-operation
enforcement, runtime actor/target/request provenance, allowlisted sensitive-data
evidence, recursive missing-intermediate cleanup, pre-response join-session
ownership, bounded race termination, structured original/restoration failure
diagnostics, settings/family/organization hydration waits, generated Playwright
regex escaping, roster download row-count validation, and owned Radix
overlay/toast settlement.

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

- Focused Task 4 and runner suite: 163 passed, 0 failed.
- Full application suite: 697 passed, 0 failed.
- Firestore/Storage rules suite: 42 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- Task 3 team-switch browser regression: exit 0; cleanup 299/0/0.
- Task 3 Alerts browser regression: exit 0; exactly two eligible alerts,
  exclusions/persistence/mobile checks observed; cleanup 299/0/0.
- Focused roster browser run `final-cert-t4-260905-194710-cfa9`: exit 0;
  cleanup 299 deleted / 1 restored / 0 retained.
- Final non-browser batch `final-cert-t4-260905-195740-66ec`: exit 0; 16
  scenarios; cleanup 301 deleted / 44 restored / 0 retained.
- Immutable Chrome batch `final-cert-t4-260905-195812-03c6`: 16 scenarios,
  177/177 cases, 112/112 local dimensions, zero failures/run errors; cleanup
  301 deleted / 46 restored / 0 retained, with zero residuals.

## Remaining External Gates

1. Deploy the Task 4 completion commit containing this report to the authorized
   staging companion and repeat the 16 rows with disposable run-prefixed data
   and exact cleanup.
2. Observe approved mailbox delivery and receipt for the youth invitation.
3. Keep production read-only. Stripe/provider and physical-device work belongs
   to later certification batches and is not inferred here.
