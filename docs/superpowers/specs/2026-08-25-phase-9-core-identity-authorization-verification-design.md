# Phase 9 Core Identity and Authorization Verification Design

**Date:** 2026-08-25
**Status:** Approved
**Repository:** `studio-v2.1`
**Starting commit:** `64ffb8d58965ffbc8115d882e545a4798610fa88`
**Branch:** `agent/phase9-core-identity-verification`

## Purpose

Phase 9 executes a bounded, high-risk identity and authorization slice that remains blocked after Phase 8. It expands the guarded staging fixture foundation to cover the canonical family, player, institution, league, platform-admin, and incomplete-account identities. It then verifies session lifecycle, direct route policy, trusted-versus-untrusted authority, and cross-tenant listener isolation in fresh browser contexts.

This is an evidence phase, not a presumption that the product is correct. A mismatch becomes a stable defect only after reproducible evidence. Runtime behavior changes are permitted only after root-cause analysis and a focused failing regression test demonstrate the defect. Production remains untouched, and no existing pull request is merged.

## Decision and alternatives

Three continuations were considered:

1. **Core identity and authorization verification — selected.** This targets the audit's highest remaining risks: session admission, horizontal isolation, vertical escalation, and family/youth privacy. It reuses the exact-resource staging lifecycle already proven in Phases 7 and 8.
2. **Provider and billing verification.** This would exercise Stripe, email, push, and webhook contracts, but requires additional external provider fixtures and broader mutation authority.
3. **Feature-by-feature CRUD expansion.** This would add wider surface coverage but would dilute the identity boundary and make defect attribution less reliable.

The selected slice maximizes security evidence while keeping data synthetic, cleanup exact, and staging changes reversible.

## Branch and environment topology

- Phase 9 is stacked on the reviewed Phase 8 head `64ffb8d58965ffbc8115d882e545a4798610fa88`.
- Phase 7 PR `#39` and Phase 8 PR `#40` remain open and unmerged.
- Phase 9 receives its own stacked branch and, after review, a separate pull request.
- Hosted mutation is limited to the isolated Firebase staging project `the-squad-v2-staging` and the staging application origin accepted by the existing guard.
- Production data, production identities, production deployment, and production provider state are forbidden.

## Scope

### Included

- Extend the deterministic fixture graph with these synthetic identities:
  - `qa-parent-a` and `qa-parent-b`;
  - `qa-adult-player-a` and `qa-adult-player-b`;
  - `qa-youth-active`;
  - `qa-league-creator`;
  - `qa-school-admin`;
  - `qa-superadmin` with a trusted server-controlled custom claim;
  - `qa-pending-delete`, initially active and transitioned only after a positive baseline;
  - `qa-missing-profile`, with an owned Auth identity and intentionally absent user profile;
  - `qa-no-team`, with an active user profile and intentionally no squad authority.
- Add only the exact synthetic players, guardian links, institution record, league record, memberships, and ownership proofs required to make the named boundaries observable.
- Verify login admission, expected landing, direct protected deep links, logout/back behavior, multi-tab session invalidation, account-state denial, trusted-versus-fake platform authority, and cross-tenant listener isolation.
- Execute browser scenarios at `390x844` and `1440x900` using isolated system-Chrome contexts with diagnostics armed before the first staging navigation.
- Root-cause and repair only stable, reproduced defects within this slice, using RED/GREEN tests before runtime changes.
- Deploy only an exact reviewed Phase 9 commit to guarded staging, rerun the affected scenarios, and complete exact fixture cleanup with independent `0/0` absence proof.
- Reconcile only evidence rows actually completed by Phase 9.

### Excluded

- Public signup, password reset, email verification delivery, youth-invite delivery, and mailbox-provider behavior.
- Billing, Stripe, Stripe Connect, Resend, FCM, RSS, webhook, backup/restore, rollback-drill, and production operations.
- Broad family, roster, medical, payment, waiver, recruiting, league CRUD, institution CRUD, or admin mutation workflows.
- Deletion purge jobs or destructive account lifecycle beyond the reversible pending-deletion admission transition.
- Real customer data, real personal information, existing historical QA accounts, or unrestricted project enumeration.
- Matrix-wide closure, production-readiness approval, merge, or production release.

## Fixture data model

### Tenant graph

The existing visibly distinct Team A and Team B remain the primary tenant boundary. Phase 9 adds the minimum records below:

- Parent A is linked only to a synthetic youth player in Team A.
- Parent B is linked only to a different synthetic youth/player record in Team B.
- Adult Player A and Adult Player B each have a distinct self-linked player and active membership in their respective team.
- Youth Active is linked to Parent A and the Team A player/member record. It is an already-activated account; invitation delivery is out of scope.
- League Creator owns one synthetic league whose identifiers and sentinel values are confined to the run namespace. This phase tests route/session authority, not league mutation workflows.
- School Admin has `isSchoolAdmin: true` and the canonical `school` plan only in combination with an active synthetic institution team whose `schoolAdminIds` contains the identity UID. The profile flag alone is never sufficient authority.
- Trusted Superadmin receives the server-controlled `superadmin` custom claim and no customer records. The existing `qa-fake-superadmin` retains only an untrusted profile role and no trusted claim.
- Pending Delete starts as an active non-owner Team A member so the positive admission baseline is captured before the guarded state transition and session revocation.
- Missing Profile owns an Auth UID and ownership proof but has no `users/{uid}` document by definition.
- No Team has an active profile but no owner, member, or membership-cache relationship.

Player and guardian fixtures contain only synthetic names and bounded relationship fields. Medical, financial, free-text, and provider identifiers are not seeded. Team A and Team B records use distinct sentinels so any listener crossover is observable without reading sensitive content.

### Authority invariants

- A parent can reach parent-eligible surfaces only through the expected household/team relationship and cannot read the other household or team.
- Adult and youth players receive only self/member-visible access; they never receive staff, owner, institution, league-owner, or platform-admin authority.
- `isSchoolAdmin: true` is corroborated by an active institution team containing the UID in `schoolAdminIds`.
- League-creator authority follows the existing trusted profile role and does not imply platform-admin authority.
- Platform-admin access requires the verified server-controlled claim. A profile value alone remains denied.
- Missing profile resolves to `/onboarding`.
- Active profile without trusted squad or independent authority resolves to `/teams/join`.
- Pending-deletion state fails closed before session creation and starts no protected listener.
- Team B identifiers substituted into Team A parent/player reads remain denied at the rules, API, or trusted-query boundary.

## Manifest and lifecycle evolution

Phase 9 introduces manifest schema version 3 rather than changing the meaning of an existing version-2 journal. New seeds produce version 3. Version 3 records the complete exact Auth UID and Firestore path sets, the intentionally absent profile relationship for `qa-missing-profile`, and the added `qa-pending-delete` transition checkpoint.

Version-2 manifests remain accepted only for bounded recovery operations that already exist: validation, inspect, and cleanup of their exact recorded resources. They cannot be re-seeded, upgraded in place, or used for new transitions. A version-3 run cannot silently omit an identity, resource, expected-absence declaration, or transition alias.

The pending-deletion transition uses the same resumable journal discipline as suspension and removal:

1. persist `applying` before remote mutation;
2. update the trusted account state to the canonical pending-deletion fields;
3. revoke refresh tokens/sessions;
4. persist each completed checkpoint;
5. mark the transition final only after the exact remote state is verified.

Seed, inspect, transition, and cleanup validate the complete journal before constructing or connecting the hosted adapter. Cleanup remains limited to manifest-listed resources with exact run ownership proof. No list-and-delete or prefix-wide deletion is allowed.

Credential and workspace rules remain unchanged: a private workspace uses mode `0700`; credential output is external to the repository with mode `0600`; stdout and retained evidence contain aliases/counts only; raw cookies, tokens, passwords, storage state, traces, and service-account material are not retained.

## Browser and backend verification

Each canonical row uses a fresh browser context unless a row explicitly tests two tabs in the same authenticated browser state. Every row records alias, viewport, start URL, action, expected result, final URL, visible state, session presence, protected request/listener observations, relevant HTTP statuses, page errors, application-console errors, request failures, and horizontal overflow.

### Group 1: positive identity admission

At both viewports, Parent A, Adult Player A, Youth Active, League Creator, School Admin, and Trusted Superadmin establish a session and reach the landing permitted by the existing route policy. Institution authority is proven from the live synthetic institution record, and trusted platform authority is proven from verified claims rather than profile text.

### Group 2: incomplete and unavailable accounts

- Missing Profile establishes only the permitted onboarding session and reaches `/onboarding` without protected tenant listeners.
- No Team establishes a session and reaches `/teams/join` without selecting or listening to Team A or Team B.
- Pending Delete first passes its active baseline. After the guarded transition and revocation, the old session and a fresh login both fail closed with the generic unavailable-account UI, no protected route, and no protected requests/listeners.

### Group 3: direct route and vertical-authority policy

Use direct navigation, not hidden-menu observations. The role matrix supplies the expected result for representative route families:

- `/admin` is allowed for Trusted Superadmin and denied for Fake Superadmin and every newly added non-superadmin role;
- `/club` requires corroborated institution access;
- `/competition` follows existing league/staff policy;
- `/dashboard/billing` and `/coaches-corner` remain management/staff surfaces and are denied to parent/player roles;
- `/family` is parent-eligible and denied to unrelated roles except trusted superadmin compatibility;
- no redirect may briefly render protected content or initiate the denied route's protected data listeners.

The implementation plan must bind each route expectation to `dashboard-route-policy.ts` and the approved role matrix before execution; Phase 9 does not broaden permissions to make a scenario pass.

### Group 4: horizontal isolation and listeners

Parent A, Adult Player A, and Youth Active may observe only their own/linked Team A identities and permitted projections. Equivalent Team B identifiers are tested through direct Firestore reads and the narrow same-origin routes/APIs already used by the UI. Symmetric Parent B and Adult Player B checks prove the inverse direction.

Listeners are armed before navigation. A PASS requires no Team B protected listener for Team A identities, no Team A protected listener for Team B identities, no stale listener after logout or account-state revocation, and explicit denial for direct cross-tenant reads. UI absence alone is insufficient.

### Group 5: logout, back navigation, and multi-tab invalidation

For representative parent, player, institution/league authority, and trusted-superadmin identities:

- logout clears the server session and Firebase client state;
- browser back/reload does not restore protected content or cached tenant data;
- two tabs sharing one authenticated browser state both lose protected access after logout or the applicable revocation event;
- a new isolated context remains unauthenticated;
- post-logout protected requests/listeners are absent or denied.

## Defect protocol

Phase 9 does not patch speculative risks. When observed behavior differs from the approved expectation:

1. preserve a sanitized, stable reproduction in both viewports when responsive behavior applies;
2. assign the next stable defect ID in `07-defect-ledger.md`;
3. trace the request, resolver, route guard, provider, rules/API boundary, and cleanup effect to identify the first incorrect state transition;
4. write the smallest automated regression that fails for that exact root cause;
5. implement the minimum correction without broadening role authority or tenant access;
6. run focused and full local verification;
7. obtain scoped independent review before staging deployment;
8. deploy the exact reviewed head to staging and rerun the complete affected browser group, not only the originally failing click.

If evidence is incomplete, the result is `INCONCLUSIVE` or remains `BLOCKED`; it is not converted to PASS and it is not treated as a product defect.

## Staging execution and cleanup

The hosted lifecycle uses a brand-new `0700` workspace and an exit guardian before any credential or fixture write. Required order:

1. exact read-only preflight resolves only `the-squad-v2-staging` and the approved staging origin;
2. seed version-3 fixtures and inspect the exact expected present/absent graph;
3. record positive baselines before pending-deletion mutation;
4. run canonical browser/backend groups with all diagnostics armed before first navigation;
5. execute the guarded pending-deletion transition and affected revocation scenarios;
6. close all browser contexts;
7. run exact inspect-cleanup-inspect;
8. independently probe every manifest-listed Auth UID and Firestore path and require `authPresent=0`, `firestorePresent=0`;
9. remove the external credential file and private workspace and prove both paths absent.

Cleanup arithmetic is computed from the committed fixture definition and recorded before seed. The report must reconcile initially created resources, transition-deleted resources, cleanup-deleted resources, retained resources, and independent final absence. Any retained resource, identity ambiguity, cleanup uncertainty, credential-removal failure, or project mismatch blocks completion.

## Evidence and audit reconciliation

Retained evidence is sanitized Markdown and, only when necessary, screenshots containing synthetic aliases. Every browser row must include the closure-critical observation fields; summaries cannot substitute for the canonical row ledger. Raw Playwright traces, storage state, cookies, tokens, passwords, action links, and credential files are temporary and must be absent before completion.

Phase 9 updates:

- `05-coverage-matrix.md` only for contracts whose complete happy, negative, permission, responsive, console, network, and persistence dimensions were executed;
- `06-test-account-requirements.md` with the exact synthetic availability established by the phase;
- `07-defect-ledger.md` only for newly reproduced defects and their verified resolution state;
- a Phase 9 audit report and dated run package containing the per-context ledger, backend checks, deployment linkage, cleanup proof, and blocker reconciliation.

Unexecuted provider, mutation, youth-invite, family-aggregation, and feature-specific variants remain blocked. Phase 9 cannot change the overall release verdict from `NOT READY` unless every unrelated blocking contract is independently completed in later phases.

## Expected files

The planned fixture and evidence work may change:

- `scripts/qa-fixtures/definition.mjs`;
- `scripts/qa-fixtures/manifest.mjs`;
- `scripts/qa-fixtures/lifecycle.mjs`;
- `scripts/qa-fixtures/cli.mjs` only if version routing requires it;
- `tests/qa-fixture-safety.test.mjs`;
- new focused Phase 9 identity/session/route-policy tests;
- `docs/qa/production-audit/05-coverage-matrix.md`;
- `docs/qa/production-audit/06-test-account-requirements.md`;
- `docs/qa/production-audit/07-defect-ledger.md` only when a defect is reproduced;
- `docs/qa/production-audit/14-phase9-core-identity-verification.md`;
- `docs/qa/production-audit/runs/2026-08-25-phase9-core-identities/`.

Product source, Firestore or Storage rules, indexes, Functions, and deployment configuration are outside the expected diff unless a Phase 9 reproduction and RED test establish that one is the root-cause boundary.

## Verification and completion gates

1. Starting tree and Phase 8 baseline are clean and green.
2. Fixture changes have recorded RED/GREEN safety tests, including v2 recovery compatibility and v3 exact-journal rejection cases.
3. Focused identity, session, route-policy, tenant-isolation, fixture-safety, and repository-hygiene tests pass.
4. `npm run verify` passes on the exact final commit.
5. Full-range whitespace, secret/artifact, broad-delete, and scope scans are clean.
6. Independent implementation review has no unresolved Critical or Important finding.
7. Guarded CI deploys the exact reviewed commit only to staging and completes its health checks.
8. Every canonical browser row contains the required observations at both viewports.
9. Exact cleanup and an independent adapter probe prove manifest-listed Auth and Firestore presence `0/0`; credentials and private workspaces are absent.
10. Audit arithmetic and defect linkage reconcile mechanically without promoting partial rows.
11. The Phase 9 stacked PR is green and remains unmerged.

Release remains **`NOT READY`**. Completion of Phase 9 proves only the named core identity and authorization slice.
