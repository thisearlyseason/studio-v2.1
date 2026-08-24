# Phase 5 Staging Baseline

**Tester alias:** `phase5-task1-baseline`
**Recorded (UTC):** `2026-08-24T11:23:14Z`

## Scope and immutable starting point

| Check | Result |
| --- | --- |
| Phase 3/4 merged application baseline | `0b92545f76b5482b4a37aa36dfbd2c95876770a5` |
| Phase 5 task-execution base | `99801735c24c83cf0ad4074d7ce998642d442f06` |
| Branch | `agent/phase5-staging-readiness` |
| Initial worktree state | Clean linked worktree: `.worktrees/phase3-root-cause-repair` |

The Phase 5 task base intentionally includes the documentation-only Phase 5 plan on top of the merged Phase 3/4 application baseline. Neither commit was discarded. This baseline record is documentation-only and does not change application behavior.

## Staging identity and deployment preconditions

| Check | Result |
| --- | --- |
| Firebase project | `the-squad-v2-staging` only |
| App Hosting backend | `studio` only |
| Canonical staging origin | `https://studio--the-squad-v2-staging.us-east4.hosted.app` |
| App Hosting repository link | PASS — link ends in `thisearlyseason-studio-v2-1` |
| `.firebaserc` staging alias | PASS — `staging` maps to `the-squad-v2-staging` |
| Staging secret-name availability | PASS — `GCP_SERVICE_ACCOUNT`; `GCP_WORKLOAD_IDENTITY_PROVIDER` |
| Staging variable-name availability | PASS — `STAGING_FIREBASE_PROJECT_ID`; `STAGING_APPHOSTING_BACKEND_ID`; `STAGING_APP_URL` |

Only names and availability were inspected and retained; no secret, variable, credential, token, cookie, action link, or payload value was printed or stored.

## Recent staging deployment workflow history

The ten most recent completed `deploy-staging.yml` runs were observed: **7 successful, 1 failed, and 2 cancelled**. The most recent run completed successfully at `2026-08-21T06:03:32Z` for commit `862d250a513689b80d17fb5317d7bc5b152d1f09`.

| Created (UTC) | Conclusion | Commit |
| --- | --- | --- |
| `2026-08-21T06:03:32Z` | success | `862d250a513689b80d17fb5317d7bc5b152d1f09` |
| `2026-08-19T16:34:38Z` | success | `92444e28d9590177adb4587749a36a0b6aa27bb7` |
| `2026-08-19T03:38:19Z` | success | `217b68fd26b961b173861b21baa10ae836e28d68` |
| `2026-08-19T02:59:48Z` | success | `39d316b0b216efe492f345f728ba211917b6d485` |
| `2026-08-19T02:52:38Z` | cancelled | `ea78a43815abb6de9861f674dfd524e625a75a25` |
| `2026-08-18T21:41:33Z` | success | `6150481e8f3200e782f940cfc67e4c469ace4284` |
| `2026-08-18T20:02:34Z` | success | `d1e4a11d0a242a7dda57c571500c59b110910a9a` |
| `2026-08-18T01:50:30Z` | success | `48cfbe2317f4bd98ca1b9145c6422c5922fe1dcd` |
| `2026-08-18T01:40:58Z` | failure | `a5758a88f816da5f9c904a4a84a8c5b08a1fa74a` |
| `2026-08-18T01:26:49Z` | cancelled | `4b6daef133064c1fed81a64496f541cca53f0ae6` |

## Fresh complete local gate

`npm run verify` completed successfully at the Phase 5 task-execution base. The `&&` pipeline completed all gates below.

| Gate | Result |
| --- | --- |
| TypeScript typecheck | PASS — `tsc --noEmit` exited 0. |
| ESLint | PASS with existing warning backlog — 1,865 warnings and 0 errors. The warning backlog is not cleared. |
| Node tests | PASS — 390 passed; 0 failed, cancelled, skipped, or todo. |
| Rendered component tests | PASS — 2 tests in 1 test file passed. |
| Firestore/Storage rules tests | PASS — 38 passed; 0 failed, cancelled, skipped, or todo. Expected denied-operation messages were emitted by negative rules tests. |
| Test total | PASS — 430 passed; 0 failed, cancelled, skipped, or todo. |
| Next.js build | PASS — completed in the successful verification pipeline. |
| Functions build | PASS — `npm --prefix functions run build` completed in the successful verification pipeline. |

## Safety boundary and release status

This task used only the staging project and `studio` backend, with anonymous/visitor and synthetic-public scope. It performed no production access, mutation, or deployment; no Stripe, Resend, FCM, or other provider actions; and no destructive actions.

**Release status: NOT READY.** This baseline validates only preconditions and the local gate. A later exact, passing Phase 5 commit must be the one deployed; this record does not authorize release or deployment.
