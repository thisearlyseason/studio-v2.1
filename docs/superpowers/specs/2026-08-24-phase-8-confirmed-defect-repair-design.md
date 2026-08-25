# Phase 8 Confirmed Defect Repair Design

## Purpose

Repair and reverify the three confirmed Phase 7 defects without expanding into the 83 blocked production-readiness contracts:

- `BUG-006`: suspended credentials establish a fresh protected session;
- `BUG-007`: a removed member retains stale squad routing and reaches the dashboard;
- `BUG-010`: an authorized own-team assignments query returns `500`.

Phase 8 is stacked on the reviewed Phase 7 fixture foundation. It updates no production environment and does not merge either pull request.

## Branch and review topology

- Base commit: `4cbdde6f1130840648df5a36db1909eace26f3b9` on `agent/phase7-staging-fixture-foundation`.
- Phase 8 branch: `agent/phase8-confirmed-defect-repair`.
- Phase 7 PR `#39` remains unchanged and reviewable as the fixture-foundation boundary.
- Phase 8 receives a separate stacked PR whose base is `agent/phase7-staging-fixture-foundation`.
- Phase 8 may deploy only to guarded staging from an exact reviewed commit. Production deployment and merge remain forbidden.

## Product semantics

### Suspended accounts

A profile whose trusted server-owned state is `accountStatus: suspended`, `accountStatus: pending_deletion`, or `deletionStatus: pending` must fail closed before a browser session cookie is created. The response is sanitized and must not disclose whether a supplied email exists. The client clears any browser session, signs out Firebase client state, displays the generic unavailable-account login message, and performs no protected navigation or protected-data subscription.

This decision is enforced from trusted profile state, not client fields or user-writable membership projections.

### Removed squad members

Removal from a squad does not disable the underlying account. A removed member may authenticate and join or create another squad, but must not retain stale authority or navigation for the former squad.

The trusted server resolves the account destination after authentication:

- missing profile: `/onboarding`;
- active profile with verified active squad membership or ownership: normal role landing;
- active squad-scoped profile with no active squad authority: `/teams/join`;
- stale `activeTeamId` whose direct/linked membership is removed or deleted: ignore the stale squad and resolve using any other trusted active membership or ownership;
- no remaining trusted squad authority for a squad-scoped role: `/teams/join`.

Trusted superadmins and profiles with independent institution or league authority retain their existing role landing even when they have no squad. Anonymous demo admission also remains unchanged so the server can bootstrap its approved demo workspace before a squad exists.

Membership-cache documents are navigation projections and are not sufficient authority because users can write their own cache documents. Active authority is derived from team ownership and canonical team-member documents. A multi-squad user removed from one squad keeps access through another valid squad.

`BUG-007` is therefore repaired as a stale squad-context and routing defect. Its former expectation of total account-session denial is corrected in the audit documents.

### League assignments

An authenticated owner or authorized staff member querying their own squad receives `200` with `{ assignments: [] }` when no matching assigned registrations exist, or the bounded matching results when they do. The same caller querying another squad remains `403`.

The root-cause gate must capture the exact failure at the collection-group query boundary before implementation. The current leading hypothesis is the absent `COLLECTION_GROUP` index for `registrationEntries.assigned_team_id`. If the captured failure does not confirm an index/query-configuration defect, implementation stops and this design is revised rather than masking the error.

When confirmed, `firestore.indexes.json` gains the narrow ascending collection-group field override required by the existing equality query. Authorization remains before the query. Query errors return a sanitized service response; raw provider errors and index-creation URLs remain server-only.

## Components

### Trusted account-access resolver

A focused server module owns account admission and post-login destination resolution. It accepts the already verified Firebase identity and reads only trusted server data. It returns a discriminated result:

- `denied` with a stable internal reason for suspended/deletion-pending accounts;
- `allowed` with `/onboarding` for a missing profile;
- `allowed` with `/teams/join` when no active squad authority remains for a squad-scoped profile;
- `allowed` with the normal role destination when trusted authority exists.

The resolver uses existing team-access primitives where possible and adds only the bounded cross-team lookup needed to avoid locking out valid multi-squad users.

### Session route

`POST /api/auth/session` verifies the ID token, resolves account access, and creates the session cookie only for an allowed result. Its JSON response includes the trusted destination. A denied or failed resolver creates no cookie.

`GET /api/auth/session` reuses the resolver after session-cookie verification so status checks cannot report a suspended account as authenticated or restore stale squad routing.

### Dashboard server guard

The dashboard template already calls the server guard before rendering protected children. The guard reuses the trusted resolver so stale squad context redirects before client providers start protected listeners. Middleware remains the inexpensive cryptographic/revocation gate and does not add a Firestore read to every matched request.

### Login client

The login page consumes the destination returned by session establishment instead of independently guessing from client-readable profile state. Session denial clears server and Firebase client state before presenting the existing generic login failure. This prevents the BUG-006 listener/error-boundary sequence.

### Assignments API and index

The assignments route retains `getTeamAuthority()` before its collection-group query. The index artifact supplies the exact query capability. A narrow route error boundary distinguishes a provider/query availability failure from authorization denial without exposing provider diagnostics.

## Security and failure invariants

- No session cookie is emitted before trusted account-state resolution succeeds.
- Suspended and deletion-pending accounts never receive protected navigation.
- Removed membership never grants access through profile fields or membership-cache projections.
- Multi-squad access survives removal from only one squad.
- Missing profiles retain the existing onboarding path.
- Cross-tenant assignment queries remain `403` and execute no assignment collection query.
- Assignment results are capped at the existing limit of 200.
- Browser errors remain non-enumerating; provider diagnostics stay server-side.
- A transient account-state read failure fails closed and issues no cookie.
- No broad Auth, Firestore, or deployment operation is introduced.

## TDD and verification

Implementation follows separate RED/GREEN cycles:

1. Suspended ID token verifies successfully but session creation is rejected before cookie creation.
2. Missing profile resolves to onboarding.
3. Removed sole membership resolves to `/teams/join` while former-team data remains denied.
4. A multi-squad identity removed from one squad retains its other trusted squad access.
5. Active owner, active staff, verified ordinary member, anonymous demo, and trusted superadmin behavior remain compatible.
6. Login denial signs out client state and starts no protected routing/listeners.
7. Authorized own-team assignment query reaches the query boundary and returns an empty/result `200`; changed-team query remains `403` without querying.
8. Index configuration contains the exact `registrationEntries.assigned_team_id` collection-group field override after the root-cause gate confirms it.

Verification gates:

- focused account/session, dashboard-policy, assignments, index, and security tests;
- full `npm run verify` including typecheck, lint, Node/component tests, rules tests, Next production build, and Functions build;
- full-range diff, secret/artifact, broad-delete, and whitespace scans;
- independent task review and final scoped review;
- stacked PR CI to completion.

## Staging proof

After local review is clean, dispatch the guarded staging workflow for the exact Phase 8 commit. Confirm the workflow validates project ownership and deploys the index before the App Hosting rollout.

Use a fresh strict Phase 7 fixture lifecycle and isolated Chrome contexts at `390x844` and `1440x900`:

- `BUG-006`: active baseline, guarded suspension/revocation, then fresh login; expect no session cookie, no protected route, no protected listeners, and no page error.
- `BUG-007`: active baseline, guarded membership removal/revocation, then fresh login; expect an account session, `/teams/join`, and former-team direct read `403` with no protected former-team listener.
- `BUG-010`: symmetric Team A and Team B owners; expect own-team assignments `200`, changed-team `403`, and unchanged direct cross-tenant denials.

Listeners are armed before first staging navigation. Evidence records final URL, visible state, relevant HTTP statuses, session presence, page errors, application-console errors, request failures, and horizontal overflow.

The fixture lifecycle must finish with inspect-cleanup-inspect, independent Auth/Firestore manifest absence `0/0`, credential removal, all browser contexts closed, and private workspace removal. Any cleanup uncertainty blocks completion.

## Audit reconciliation

After fresh proof:

- close `BUG-006` only if both viewports fail closed before session creation;
- close `BUG-007` as repaired stale-context routing and document the approved account-level session semantics;
- close `BUG-010` only if both symmetric owners receive own-team `200` and changed-team `403`;
- update only affected defect-ledger, matrix, and evidence rows;
- retain the overall release as `NOT READY` because the remaining blocked contracts are outside Phase 8.

## Non-goals

- Executing or unblocking the other 83 audit contracts.
- Production deployment, production data access, or provider mutation.
- Merging Phase 7 or Phase 8 pull requests.
- Replacing Firebase Auth, middleware, the team-provider architecture, or general dashboard route policy.
- Broad membership-schema migration or retroactive repair of unrelated user profiles.
