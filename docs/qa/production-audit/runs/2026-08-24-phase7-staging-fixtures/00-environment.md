# Phase 7 Hosted Fixture Environment

- Status: `BLOCKED AT READ-ONLY PREFLIGHT`
- Operator alias: `phase7-task4-hosted`
- Attempt window (UTC): `2026-08-24T15:00:30Z`–`2026-08-24T15:02:16Z`
- Release status: `NOT READY`

## Immutable scope

| Check | Sanitized result |
| --- | --- |
| Task 4 starting SHA | `d84efc61dec9fd10d954b7c9376bdc2e2d65d55f` (`fix: defer fixture clients and verify cleanup ownership`) |
| Branch | `agent/phase7-staging-fixture-foundation` |
| Workspace | Clean linked worktree at `.worktrees/phase3-root-cause-repair` before Task 4 evidence files were created |
| Requested Firebase project | `the-squad-v2-staging` |
| Resolved Firebase Admin project | **UNRESOLVED** — the adapter crashed before project identity could be returned |
| App Hosting backend | `studio` |
| Canonical origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |
| Last independently proven deployed SHA | `658d3ca89f3cabf6c55800400aa17bc72229c1af`, carried from the Phase 5 protected deployment record; Task 4 did not freshly establish a deployed SHA |
| Fresh origin health | HTTP `200`, sanitized JSON fields `status=ok`, `service=the-squad-web` |
| Playwright prerequisite | `npx` available; bundled Playwright CLI `0.1.18`; system-Chrome option available |

No production project, production origin, deployment, provider, real user, or customer record was accessed. No environment value containing a credential or secret was inspected or printed.

## Local preflight prerequisite

The relevant local safety and authorization baseline passed with the repository-supported TypeScript loader:

```text
node --import tsx --test \
  tests/qa-fixture-safety.test.mjs \
  tests/account-authentication.test.mjs \
  tests/dashboard-route-policy.test.mjs \
  tests/team-access.test.mjs \
  tests/team-membership-security.test.mjs
```

Result: `66 passed, 0 failed`.

The implementation plan's literal bare `node --test` form first produced one module-resolution error for the repository alias `@/lib`. Investigation showed that `package.json` defines `test:node` with `node --import tsx --test`; rerunning the unchanged tests through that supported runner passed 66/66. No source change was made.

## Exact hosted read-only preflight

The approved command was executed unchanged:

```text
ALLOW_STAGING_QA_FIXTURES=true npm run qa:fixtures:preflight -- \
  --project the-squad-v2-staging \
  --confirm-project the-squad-v2-staging \
  --origin https://studio--the-squad-v2-staging.us-east4.hosted.app
```

Expected: exit `0`, resolved project `the-squad-v2-staging`, `safe=true`, nine aliases, two teams, and no writes.

Actual: exit nonzero before project resolution with the sanitized error:

```text
Cannot read properties of undefined (reading 'find')
```

The safety gate therefore did not pass. Task 4 stopped before fixture mutation, exactly as required.

## Read-only root-cause evidence

The installed `firebase-admin` CommonJS namespace exposes the application list at `default.apps`, while `scripts/qa-fixtures/firebase-adapter.mjs` checks `firebaseAdmin.getApps` and then dereferences `firebaseAdmin.apps.find(...)`. Sanitized module-shape evidence was:

```json
{"getApps":"undefined","apps":false,"defaultGetApps":"undefined","defaultApps":true}
```

The captured stack ends at `existingNamedApp` on `firebase-adapter.mjs:37`, before named-app initialization, Auth construction, Firestore construction, or `connect()`. This is recorded as draft `BUG-005` in `01-fixture-lifecycle.md`; Task 4 did not patch product or fixture source.

## Artifact boundary

A `mktemp -d` workspace was created outside the repository with mode `0700`, with a mode-`0700` raw-state subdirectory and an EXIT/INT/TERM cleanup handler registered before any seed could run. Only sanitized evidence was copied into this run directory. No credential value, manifest content, cookie, token, storage state, screenshot, video, trace, private key, service-account JSON, or response body was retained.
