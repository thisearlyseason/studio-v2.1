# Phase 7 Hosted Fixture Environment

- Current status: `BLOCKED AT RESOLVED-PROJECT GUARD`
- Operator alias: `phase7-task4-hosted`
- Original attempt window (UTC): `2026-08-24T15:00:30Z`–`2026-08-24T15:02:16Z`
- Resumed attempt window (UTC): `2026-08-24T15:11:54Z`–`2026-08-24T15:13:20Z`
- Release status: `NOT READY`

## Immutable scope

| Check | Sanitized result |
| --- | --- |
| Original Task 4 starting SHA | `d84efc61dec9fd10d954b7c9376bdc2e2d65d55f` |
| Resumed Task 4 starting SHA | `75be64e49930359b8c29ff988ab614f3c9f6b090` (`fix: normalize fixture admin namespace`) |
| Historical evidence commit | `7f7335ddb1bff01082772bd86872b72368f8b390` |
| Branch | `agent/phase7-staging-fixture-foundation` |
| Workspace | Clean linked worktree at `.worktrees/phase3-root-cause-repair` before each attempt |
| Requested Firebase project | `the-squad-v2-staging` |
| Resumed Firebase Admin result | **MISMATCH** — sanitized guard output did not disclose the resolved non-staging ID |
| App Hosting backend | `studio` |
| Canonical origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |
| Last independently proven deployed SHA | `658d3ca89f3cabf6c55800400aa17bc72229c1af`, carried from the Phase 5 protected deployment record; Task 4 did not freshly establish a deployed SHA |
| Fresh origin health from original attempt | HTTP `200`, sanitized JSON fields `status=ok`, `service=the-squad-web` |
| Playwright prerequisite | `npx` available; bundled Playwright CLI `0.1.18`; system-Chrome option available |

No production project, production origin, deployment, provider, real user, or customer record was accessed. No credential or secret environment value was inspected or printed.

## Local prerequisite evidence

The original relevant safety and authorization baseline passed with the repository-supported TypeScript loader: `66 passed, 0 failed`. The adapter repair at `75be64e49930359b8c29ff988ab614f3c9f6b090` was independently reviewed before this resumed attempt. Task 4 freshly re-ran the fixture-safety, production-environment, and repository-hygiene set: `52 passed, 0 failed`.

The implementation plan's literal bare `node --test` form initially produced one module-resolution error for the repository alias `@/lib`. `package.json` defines `test:node` with `node --import tsx --test`; rerunning through that supported runner passed. No Task 4 source change was made.

## Exact hosted read-only preflight

Both attempts executed the approved command unchanged:

```text
ALLOW_STAGING_QA_FIXTURES=true npm run qa:fixtures:preflight -- \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --origin https://studio--the-squad-v2-staging.us-east4.hosted.app
```

Expected: exit `0`, resolved project `the-squad-v2-staging`, `safe=true`, nine aliases, two teams, and no writes.

### Original attempt — historical QA-harness failure

At `d84efc61dec9fd10d954b7c9376bdc2e2d65d55f`, the command exited nonzero before project resolution:

```text
Cannot read properties of undefined (reading 'find')
```

The installed `firebase-admin` package exposed its CommonJS API through the default export, while the adapter dereferenced the unnormalized module namespace. Commit `75be64e49930359b8c29ff988ab614f3c9f6b090` normalizes that namespace. The original `BUG-005` draft is retired as a resolved QA-harness defect, not a product defect and not a Task 5 ledger candidate.

### Resumed attempt — project identity guard

With the adapter repair present, the command progressed through Admin initialization and reached the exact resolved-project guard. It then exited nonzero with:

```text
Firebase Admin resolved project does not match staging.
```

Only credential-source names and presence were checked. `FIREBASE_SERVICE_ACCOUNT_JSON`, `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_CLOUD_PROJECT`, and `GCLOUD_PROJECT` were all absent, so the adapter used Application Default Credentials discovery. The discovered identity was not staging. Its value was not printed, stored, or overridden.

The safety invariant therefore did not pass. Task 4 stopped before fixture mutation and authenticated browser work exactly as required. This is an environment/authorization blocker rather than a product mismatch; no new `BUG-###` is assigned.

## Artifact boundary

Each attempt used a new `mktemp -d` workspace outside the repository with mode `0700`, a mode-`0700` raw-state directory, and an EXIT/INT/TERM cleanup handler registered before any seed could run. Both temporary workspaces were removed. No credential value, manifest content, cookie, token, storage state, screenshot, video, trace, private key, service-account JSON, or raw response was retained.
