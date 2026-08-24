# Phase 7 Fixture Lifecycle Evidence

- Lifecycle result: `BLOCKED BEFORE SEED`
- Guard result: read-only preflight exited nonzero before Firebase Admin project resolution
- Hosted writes: `0`

## Lifecycle checkpoint record

| Checkpoint | Result | Evidence boundary |
| --- | --- | --- |
| Private workspace | PASS | External `mktemp -d`; directory mode `0700`; raw-state directory mode `0700` |
| Exact caller confirmations | PASS | Both project flags named `the-squad-v2-staging`; opt-in was exact string `true`; only the approved staging origin was passed |
| Resolved-project guard | BLOCKED | Adapter threw before it could return a resolved project ID |
| Preflight planned aliases/teams | NOT PROVEN | Expected nine aliases and two teams, but the preflight emitted no result object |
| Seed | NOT RUN | Guard did not pass |
| Initial inspect | NOT RUN | No manifest existed |
| `qa-suspended` positive baseline | NOT RUN | No Auth user or Firestore baseline was created |
| `qa-removed-member` positive baseline | NOT RUN | No Auth user or Firestore baseline was created |
| Guarded negative transitions | NOT RUN | Positive baselines were not available and no transition was invoked |
| Browser credentials | NOT CREATED | Exact external credential path remained absent |
| Cleanup command | NOT APPLICABLE | No manifest existed and no resource was listed for cleanup |
| Final absence proof | PASS | Manifest absent; credential file absent; raw-state file count `0`; adapter failed before Auth/Firestore client construction |

The lifecycle deliberately did not infer fixture state from the deterministic local definition. A hosted fixture exists only after the guarded command resolves the exact project and records it in the external manifest; neither condition occurred.

## Trap/finally strategy

Before the hosted preflight, the private shell registered an EXIT/INT/TERM handler. Had a partial manifest appeared, that handler would have run the exact guarded `inspect`, `cleanup`, `inspect` sequence against the same external manifest, closed every Task 4 Playwright session, invoked the validated `removeCredentialFile` helper for the exact external credential path, removed raw state within the validated temporary directory, and then removed the temporary workspace.

Because the preflight failed before seed and no manifest or credential file was created, the exact cleanup set was empty. This proves zero manifest-listed Auth users and zero manifest-listed Firestore documents were created by this run. No claim is made about unrelated staging resources because Task 4 never received authorization to read or mutate them through the failed guard.

## Draft BUG-005 — Fixture Admin adapter crashes before staging project resolution

| Field | Evidence |
| --- | --- |
| Stable ID | `BUG-005` (draft for Task 5 ledger reconciliation) |
| Severity | `P1 HIGH` — blocks every hosted fixture lifecycle and all selected critical authorization scenarios, while causing no observed production or staging data mutation |
| Feature | Phase 7 QA fixture foundation — Firebase Admin adapter/preflight |
| Affected coverage rows | Authentication email/password login; Dashboard/shell role landing and route policy; Dashboard/shell active team switch; Administration access and user directory remain `BLOCKED` |
| Expected | Read-only preflight resolves `the-squad-v2-staging` and emits `safe=true`, nine planned aliases, and two planned teams without writes |
| Actual | Nonzero exit with `Cannot read properties of undefined (reading 'find')` before resolved-project confirmation |
| Reproduction | Run the exact approved preflight command recorded in `00-environment.md` from the Task 4 worktree |
| Consistency | Reproduced by directly constructing the adapter without printing environment values; the same stack terminates at `existingNamedApp` in `firebase-adapter.mjs:37` |
| Root-cause evidence | Installed module namespace has neither named `getApps` nor named `apps`; its default export has an `apps` array. The adapter fallback dereferences the absent named `apps` export |
| Mutation impact | None observed; execution stopped before named-app initialization, Auth/Firestore client construction, seed, inspect, transition, or cleanup |
| Required next action | Separate root-cause/TDD repair of the Task 3 adapter, then a new Task 4 run from the read-only preflight gate |

No source patch is included in this evidence task.

## Cleanup and hygiene conclusion

- Auth users created: `0`.
- Firestore documents created: `0`.
- Teams created: `0`.
- Transitions invoked: `0`.
- Manifest files remaining: `0` after the external finally handler.
- Credential files remaining: `0` after the external finally handler.
- Raw Playwright artifacts remaining: `0`.
- Unrelated sentinel mutation: none; no fixture write method was reached.
