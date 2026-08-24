# Phase 7 Staging Fixture Foundation Design

**Date:** 2026-08-24  
**Status:** Approved in chat; awaiting written-spec review  
**Repository:** `studio-v2.1`  
**Starting commit:** `3aae3288c459670a4f35993762069d22f81b307f`  
**Branch:** `agent/phase7-staging-fixture-foundation`

## Purpose

Create the smallest safe hosted-staging fixture foundation needed to execute the first high-risk registered-user, role, and cross-tenant production-readiness contracts. Phase 7 must improve evidence coverage without touching production, real users, real customer data, live provider objects, or application runtime behavior.

The phase is successful when a guarded, idempotent lifecycle tool can preflight, seed, inspect, and clean a synthetic Firebase Auth and Firestore fixture set in `the-squad-v2-staging`; the selected authorization scenarios have fresh browser and backend evidence; and the audit matrix reflects only fully completed contracts.

## Decision and alternatives

Three approaches were considered:

1. **Staging fixture foundation first — selected.** Build a reusable safety boundary and execute a narrow authentication/authorization slice. This addresses the most consequential blockers and creates infrastructure later phases can reuse.
2. **Operations-first closure.** Attempt rules drift, backup/restore, rollback, and least-privilege proof before identity testing. This remains important but requires broader cloud authorization and carries greater operational risk.
3. **Continue anonymous/public testing.** This has the lowest mutation risk but would add little confidence because the two fully executable public rows already pass and most remaining blockers require identities or tenant state.

## Scope

### Included

- A repository-local QA fixture lifecycle tool with `preflight`, `seed`, `inspect`, and `cleanup` commands.
- Exact project and environment guards for `the-squad-v2-staging`.
- Synthetic Firebase Auth users and minimal Firestore records for:
  - `qa-coach-owner-a`;
  - `qa-coach-owner-b`;
  - `qa-team-assistant`;
  - `qa-team-member`;
  - `qa-multi-org`;
  - `qa-fake-superadmin`;
  - `qa-unverified`;
  - `qa-suspended`;
  - `qa-removed-member`.
- Two clearly distinct synthetic tenants, Team A and Team B, with the minimum records needed to make ownership, staff, member, removed-member, and cross-tenant leakage observable.
- Fresh staging verification of the selected authentication, session, dashboard-route, team-switching, and cross-tenant authorization contracts at 390×844 and 1440×900 where responsive behavior applies.
- Audit evidence, blocker reconciliation, and stable defect IDs for any observed mismatch.

### Excluded

- Production access or deployment.
- Stripe, Stripe Connect, Resend, FCM, RSS, calendar-provider, physical-device, backup/restore, or rollback actions.
- Password reset, verification-email delivery, youth invitation, deletion/purge, billing-state, or provider-webhook scenarios.
- Real or historical QA accounts, mailboxes, tenant records, or customer data.
- Product-code fixes. A newly confirmed defect is recorded with evidence and receives a separate root-cause/TDD repair phase before runtime code changes.
- Promotion of a matrix row based on partial coverage.

## Safety boundary

The fixture tool must fail closed unless all of these conditions are true:

1. The caller passes both `--project the-squad-v2-staging` and `--confirm-project the-squad-v2-staging`.
2. `ALLOW_STAGING_QA_FIXTURES` equals the exact string `true`.
3. Resolved Firebase Admin project identity equals `the-squad-v2-staging` before any read or write.
4. Production project aliases and the default project ID from `.firebaserc` are rejected.
5. No Firebase emulator host variables are set for a hosted-staging command.
6. The fixture namespace and every managed Auth UID begin with the fixed prefix `qa-phase7-`.
7. Every destructive operation is limited to resources recorded in the exact run manifest and independently revalidates the prefix before deletion.

The tool must never print or persist passwords, tokens, cookies, action links, private keys, or service-account JSON in repository files, manifests, logs, or evidence. Firebase credentials remain external. Generated browser credentials are written only to a caller-selected temporary file outside the repository with mode `0600`; stdout receives aliases and opaque suffixes only. The browser runner removes that temporary file after the final context closes, and the completion gate verifies that it is absent. The repository hygiene test must reject tracked credential files and fixture-secret patterns.

## Architecture

### Fixture lifecycle modules

The implementation will add focused modules under `scripts/qa-fixtures/`:

- `guard.mjs` parses the two explicit project confirmations, validates environment state, initializes Firebase Admin, resolves the actual project ID, and exposes no mutation method until the guard passes.
- `definition.mjs` contains only deterministic synthetic aliases, fixed UID/document prefixes, expected roles, tenant relationships, and non-sensitive seed values.
- `manifest.mjs` creates and validates a versioned run manifest. It records the run ID, created Auth UIDs, Firestore document paths, creation timestamps, and lifecycle state, but no credentials.
- `seed.mjs` creates or reconciles the Auth users and Firestore documents idempotently. Existing resources are accepted only when they carry the exact Phase 7 namespace marker and expected alias; collisions fail closed.
- `inspect.mjs` reads only manifest-listed resources and reports missing, unexpected, or drifted state using aliases and counts.
- `cleanup.mjs` deletes only manifest-listed Phase 7 resources after prefix, marker, project, and run-ID validation. It is idempotent and reports retained resources when validation fails instead of broadening deletion.
- `cli.mjs` exposes `preflight`, `seed`, `inspect`, and `cleanup` without embedding credentials in command arguments.

The root `package.json` will expose explicit `qa:fixtures:*` scripts. No fixture module is imported by the Next.js application or Functions bundle.

### Data model

Each run uses a unique non-secret identifier in the form `qa-phase7-<UTC timestamp>-<random suffix>`. Managed Auth UIDs and Firestore IDs use that namespace. Every Firestore document created by the tool contains:

- `qaFixture: true`;
- `qaFixtureVersion: 1`;
- `qaFixtureRunId` matching the run manifest;
- `qaFixtureAlias` matching the fixture definition;
- `qaFixtureExpiresAt` for later cleanup auditing.

The seed follows the application’s existing canonical user, team, membership, role, and active-team fields as established by current server guards and successful tests. It does not invent a parallel authorization model. Team A and Team B use visibly distinct names and sentinel data. The multi-organization identity is authorized in Team A and denied or separately scoped in Team B according to the matrix scenario. The fake-superadmin identity may contain an untrusted profile-role value but never receives a trusted custom claim.

The suspended and removed-member states are created only after their positive baseline is recorded. Their final state and session-revocation timestamp are captured in the non-secret manifest so denial tests have an explicit starting condition.

## Verification flow

### Stage 1: local safety tests

Automated tests must prove, before any hosted write:

- wrong, missing, production, default, or mismatched project identifiers are rejected;
- emulator variables and hosted-staging mode cannot be mixed;
- mutation is unreachable until resolved project identity is verified;
- manifests reject paths or UIDs outside `qa-phase7-`;
- cleanup never expands beyond exact manifest resources;
- rerunning seed or cleanup is idempotent;
- collisions with unmarked or differently marked resources stop execution;
- logs and manifests exclude credential material.

Implementation follows TDD: record the focused test failing for the intended missing behavior, implement the smallest lifecycle behavior, and record the focused test passing.

### Stage 2: hosted-staging preflight and seed

Run the read-only preflight first and retain a sanitized result showing the resolved project, application origin, operator timestamp, and intended resource counts. Only after preflight passes may seed run. Immediately inspect the seeded set and compare exact aliases, roles, tenant links, and document counts to the definition.

If project identity is ambiguous, credentials are unavailable, permissions are broader or narrower than expected, an existing resource collision occurs, or staging contains non-synthetic data at a target path, stop without mutation or cleanup and record the blocker.

### Stage 3: browser and backend scenarios

Use system Chrome through Playwright against the hosted staging origin. Each scenario starts in a new browser context and records the alias, viewport, route, expected result, actual result, relevant HTTP status, final URL, visible state, application-console errors, page errors, same-origin request failures, and resulting Firestore state where applicable.

The first slice covers:

1. Verified owner login creates a revocation-checked session and reaches the permitted landing route.
2. Unverified and suspended identities fail closed without protected data.
3. Logout clears protected access; stale or revoked session reuse is denied.
4. Owner, assistant, and ordinary member receive the dashboard routes and controls allowed by the existing route policy.
5. Direct navigation to disallowed staff, institution, finance, and admin routes is denied server-side, not merely hidden in navigation.
6. The fake-superadmin profile value cannot access `/admin` or admin APIs.
7. Team A and Team B identities cannot read or mutate each other’s records by changed route, query, or API identifier.
8. The multi-organization identity can switch only among explicitly authorized teams, and listeners/navigation no longer expose the prior tenant after the switch.
9. The removed-member identity loses both UI and direct API/data access after removal and session refresh/revocation.

Mutation scenarios use reversible synthetic records and verify unrelated fixture records remain unchanged. Browser evidence must be sanitized; screenshots may contain aliases and synthetic names but no credentials or tokens. Traces and raw storage state are temporary and deleted after extracting sanitized summaries.

### Stage 4: cleanup and reconciliation

After evidence capture, run `inspect`, then `cleanup`, then a second `inspect`. Completion requires zero remaining manifest-listed Auth users and Firestore documents, or an explicit retained-fixture decision documented with owner and expiry. Cleanup must not delete audit evidence or unrelated resources.

Update `05-coverage-matrix.md` only when every named check in a row is complete. Partial passing scenarios stay `BLOCKED` with narrowed reasons. Any observed product mismatch becomes `FAIL` with a new stable bug ID in `07-defect-ledger.md`. Publish a Phase 7 report and a sanitized run record under `docs/qa/production-audit/runs/`.

## Error handling

- Safety-guard failures exit before Firebase mutation and identify only the failed invariant.
- Seed writes use bounded batches and stop on the first unexpected collision or permission error.
- Partial seed failures leave the manifest in `partial` state; cleanup uses only successfully recorded resources.
- Cleanup failures retain the manifest and list aliases/counts requiring follow-up without printing record contents.
- Browser failures do not trigger retries that could duplicate mutations; mutation requests use unique scenario IDs and resulting-state assertions.
- Newly observed application failures are preserved as evidence rather than suppressed or immediately patched.

## Files expected to change

- `package.json`
- `scripts/qa-fixtures/guard.mjs`
- `scripts/qa-fixtures/definition.mjs`
- `scripts/qa-fixtures/manifest.mjs`
- `scripts/qa-fixtures/seed.mjs`
- `scripts/qa-fixtures/inspect.mjs`
- `scripts/qa-fixtures/cleanup.mjs`
- `scripts/qa-fixtures/cli.mjs`
- `tests/qa-fixture-safety.test.mjs`
- `docs/qa/production-audit/05-coverage-matrix.md`
- `docs/qa/production-audit/07-defect-ledger.md` only if a new defect is observed
- `docs/qa/production-audit/12-phase7-staging-fixture-foundation.md`
- `docs/qa/production-audit/runs/2026-08-24-phase7-staging-fixtures/`

Product source, Firebase rules, Functions, deployment configuration, and provider integration code are outside the expected diff.

## Review and completion gates

1. Baseline tests pass before changes.
2. Every lifecycle behavior has focused automated safety coverage with recorded red/green evidence.
3. Hosted preflight proves the exact staging project before writes.
4. Seed and inspect reconcile exactly to the versioned fixture definition.
5. Fresh browser and backend evidence exists for every executed scenario.
6. Cleanup is verified against the exact run manifest.
7. Matrix totals, row keys, blocker mappings, and defect totals reconcile mechanically.
8. Credential and artifact hygiene scans retain zero secret values and no raw traces.
9. `npm run verify` passes on the final commit.
10. Independent review finds no unresolved Critical or Important issue in the complete Phase 7 diff.
11. A PR targets `agent/phase3-root-cause-repair`; CI is green; the PR is not merged automatically.

Release remains **`NOT READY`** unless every remaining production-readiness contract is independently completed. Phase 7 fixture success does not imply production readiness and does not authorize production access.
