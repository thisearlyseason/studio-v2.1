# Phase 7 Fixture Lifecycle Evidence

- Lifecycle result: `BLOCKED BEFORE SEED`
- Current guard result: Firebase Admin resolved a non-staging project identity
- Hosted writes across both attempts: `0`

## Lifecycle checkpoint record

| Checkpoint | Original attempt | Resumed attempt |
| --- | --- | --- |
| Private workspace | PASS — external `0700` workspace and raw directory | PASS — brand-new external `0700` workspace and raw directory |
| Exact caller confirmations | PASS | PASS |
| Admin adapter initialization | BLOCKED by unnormalized CommonJS namespace | PASS after `75be64e49930359b8c29ff988ab614f3c9f6b090` |
| Resolved-project guard | NOT REACHED | BLOCKED — resolved identity did not equal `the-squad-v2-staging` |
| Preflight planned aliases/teams | NOT PROVEN | NOT PROVEN — no safe result object emitted |
| Seed | NOT RUN | NOT RUN |
| Initial inspect | NOT RUN | NOT RUN |
| `qa-suspended` positive baseline | NOT RUN | NOT RUN |
| `qa-removed-member` positive baseline | NOT RUN | NOT RUN |
| Guarded negative transitions | NOT RUN | NOT RUN |
| Browser credentials | NOT CREATED | NOT CREATED |
| Hosted cleanup command | NOT APPLICABLE | NOT APPLICABLE |
| Final absence proof | PASS | PASS |

The lifecycle does not infer hosted fixture state from the deterministic local definition. A hosted fixture exists only after the exact project is resolved and a manifest records successful writes. Neither attempt reached that point.

## Trap/finally strategy

Before each hosted preflight, the private shell registered an EXIT/INT/TERM handler. Had a partial manifest appeared, the handler would have closed every Task 4 Playwright session, run guarded `inspect`, `cleanup`, and `inspect` against the exact external manifest, invoked the validated `removeCredentialFile` helper for the exact external credential path, and removed raw state only inside the validated temporary directory.

No manifest or credential file appeared in either attempt. The original workspace and the brand-new resumed workspace were both removed by their handlers. This proves the exact manifest-owned cleanup set was empty: zero Auth UIDs and zero Firestore document paths were created by Task 4.

## Historical BUG-005 draft — resolved QA-harness defect

The original evidence reserved `BUG-005` for the Firebase Admin namespace crash. That draft is now retired:

| Field | Reconciliation |
| --- | --- |
| Classification | Resolved QA-harness defect; not product runtime behavior |
| Repair | `75be64e49930359b8c29ff988ab614f3c9f6b090` normalizes the imported Admin SDK before application lookup |
| Fresh proof | The resumed executable preflight passed the prior crash site, initialized the adapter, and reached the later resolved-project safety guard |
| Ledger disposition | Do not add `BUG-005` to the product defect ledger |
| Remaining blocker | The available ADC-resolved identity is not `the-squad-v2-staging`; exact staging authorization is unavailable in this environment |

No source patch is included in Task 4.

## Cleanup and hygiene conclusion

- Auth users created: `0`.
- Firestore documents created: `0`.
- Teams created: `0`.
- Positive baselines recorded: `0`.
- Transitions invoked: `0`.
- Browser contexts opened: `0`.
- Manifest files remaining: `0`.
- Credential files remaining: `0`.
- Raw Playwright artifacts remaining: `0`.
- Unrelated sentinel mutation: none; no lifecycle write method was reached.
