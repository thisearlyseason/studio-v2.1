# Task 4 Report: Tenant and Family Certification Batch

## Result

Task 4 owns exactly the 16 frozen tenant/family scenarios. The final immutable
local Chrome run `final-cert-t4-260905-205845-c3ee` exercised committed
candidate `d89bcf833e6d0f32073925b585ba0a6b1d86f93f`: 16 scenarios,
177/177 required case records
observed, 112/112 local dimensions observed, zero failed cases, and zero run
errors. Cleanup was `OBSERVED` with 301 measured deletions, 72 verified
restorations, zero residuals, and zero retained audit records. The evidence
root, result, cleanup marker, emitted events, and all 177 case artifacts name
that exact implementation SHA. This report and the regenerated matrix are a
separate evidence-only commit and do not change the certified implementation.

Every row remains `BLOCKED`, not `PASS`, pending execution on the exact staging
revision. Youth activation additionally needs approved QA mailbox delivery and
receipt. The run used only loopback Firebase emulators and the local Next
server; production remained read-only and provider delivery was not invoked.

## Task 11 R16 browser-provenance addendum

The earlier browser artifacts registered the disposable Family child target but
opened their console/responsive case intervals only after the lifecycle had
finished. Candidate `f0c54b242645f76ca9320ed14b7f6aee6286dad9` repairs that
evidence boundary without altering the accepted activated-child deletion policy:
one case-owned execution now opens before target registration and every Family
create, link, relink, browser unlink, browser removal, Admin graph
reconciliation, and render observation. The console and responsive artifacts
share that bounded execution rather than attaching a post-hoc synthetic
`browser-work` record.

Red/green regressions reject a target-only synthetic browser observation,
missing dynamic reconciliation, a target mismatch, an out-of-interval request,
and misclassification of the Family create POST. The focused Family Chrome run
`final-cert-t4-260905-215231-26e9` passed all 11 case records with no run
errors and cleanup `299 deleted / 0 restored / 0 retained`. The fresh immutable
16-scenario Chrome run `final-cert-t4-260905-215356-8a35` used the exact
implementation SHA, recorded 177/177 cases and 112/112 local dimensions with
zero run errors, and reconciled cleanup at `301 deleted / 72 restored / 0
retained`. Each repaired browser artifact records the create, two joins, two
PATCHes, DELETE, three browser-render observations, and the exact
create/link/relink, unlink, and removal reconciliations for the same runtime
target and interval.

Fresh post-evidence verification on the repaired worktree passed `npm test`
(713/713), `npm run test:rules` (42/42), `npm run typecheck`, and `npm run
build`. The shared active-team Chrome regression passed its two-tenant rapid
switch, reload/Back, mobile containment, console, and response checks. The
shared Alerts Chrome regression passed its exact two eligible alerts, audience
exclusions, acknowledgement/history/reload, mobile, console, and response
checks; it exited successfully with cleanup `299 deleted / 0 restored / 0
retained`.

## Implemented and Executed Work

- The tenant runner requires scenario-specific assertion sets for all 16 rows;
  generic case counts or renamed lifecycle labels cannot satisfy a row.
- Team creation executes three creator roles and a concurrent one-seat race,
  with server-derived ownership and member/user projections. Join executes
  preview/session and POST flows, linked-child concurrency, inactive-current-
  state denial, and wrong-guardian denial.
- Settings performs an actual owner UI edit and verifies the saved value after
  desktop/mobile reloads. Branding drives a browser-native File through the
  real input, observes a rendered logo, a different replacement `src`, then
  delete/fallback/no-logo after reload at both viewports. Storage upload,
  outsider, unsafe-type, and cleanup assertions remain separate. Module
  visibility persists the frozen
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
- Family work creates a disposable accountless child through the server route,
  links, unlinks, and relinks it under the verified guardian, renders the
  runtime child plus the household's Team A and Team C cards, excludes Parent B,
  then removes the child and proves absence after reload. It also creates
  unsorted disposable events and three payment records through supported
  routes; the authenticated Family consumers provide the observed chronological
  order, child/team grouping, paid/pending/overdue rows, and exact balances.
  Duplicate, inactive, wrong-child, and wrong-team mutations fail against those
  runtime records. Guardian waiver signing and separate youth Auth activation
  remain exercised; youth reuse is denied and the activated child opens its own
  roster view in both viewports.
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
- **BUG-044:** Team branding lacked an authoritative delete/fallback lifecycle;
  owners can now remove the stored logo and the fallback remains after reload.
- **BUG-045:** Family child creation trusted a client Firestore write and offered
  no supported unlink/remove lifecycle; the new route derives guardian identity
  from the verified session and owns create, unlink, and recursive removal.
- **BUG-046:** guardian enrollment rejected valid server-created `child_*`
  identities. The join route now accepts the common validated identifier shape
  while preserving the server-side parent binding and accountless child identity.
- **BUG-047:** household payment projections had no supported staff mutation
  boundary. The new finance-authorized route derives guardian, child, team, and
  projection paths from server records, writes source/projection atomically, and
  rejects duplicate, inactive, wrong-child, and wrong-team requests.

The round-four work also repaired audit defects in exact mandatory-operation
enforcement, runtime actor/target/request provenance, allowlisted sensitive-data
evidence, recursive missing-intermediate cleanup, pre-response join-session
ownership, bounded race termination, structured original/restoration failure
diagnostics, settings/family/organization hydration waits, generated Playwright
regex escaping, roster download row-count validation, and owned Radix
overlay/toast settlement.

The round-five evidence repair replaced fixture-labelled branding, child, and
aggregate checks with actual UI/runtime operations. Adversarial tests now reject
Node-only upload globals, fixture-only child evidence, pre-sorted event
expectations, and hard-coded rendered grouping. Deterministic event creation now
returns a conflict instead of overwriting an existing runtime request.

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

- Focused Task 4 and runner suite: 128 passed, 0 failed.
- Full application suite: 707 passed, 0 failed.
- Firestore/Storage rules suite: 42 passed, 0 failed.
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0.
- Task 3 team-switch browser regression: exit 0; cleanup 299/0/0.
- Task 3 Alerts browser regression: exit 0; exactly two eligible alerts,
  exclusions/persistence/mobile checks observed; cleanup 299/0/0.
- Focused branding browser run `final-cert-t4-260905-205401-3fbd`: exit 0;
  cleanup 299 deleted / 1 restored / 0 retained.
- Focused child lifecycle browser run `final-cert-t4-260905-205043-e882`:
  exit 0; PATCH 200/113 bytes, DELETE 200/70 bytes; cleanup 299/0/0.
- Focused schedule/payment browser run `final-cert-t4-260905-205223-0a5a`:
  exit 0; cleanup 299 deleted / 35 restored / 0 retained.
- Immutable Chrome batch `final-cert-t4-260905-205845-c3ee`: 16 scenarios,
  177/177 cases, 112/112 local dimensions, zero failures/run errors; cleanup
  301 deleted / 72 restored / 0 retained, with zero residuals. Results,
  cleanup, emitted events, and 177/177 case files name candidate `d89bcf83`.

## Remaining External Gates

1. Deploy implementation candidate `d89bcf833e6d0f32073925b585ba0a6b1d86f93f`
   (plus this evidence-only report commit if desired) to the authorized staging
   companion and repeat the 16 rows with disposable run-prefixed data and exact
   cleanup.
2. Observe approved mailbox delivery and receipt for the youth invitation.
3. Keep production read-only. Stripe/provider and physical-device work belongs
   to later certification batches and is not inferred here.
