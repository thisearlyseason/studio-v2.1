# Phase 7 Fixture Lifecycle Evidence

- Lifecycle result: `SEEDED, TRANSITIONED, BROWSER-VERIFIED, AND CLEANED`
- Exact project: `the-squad-v2-staging`
- Hosted fixture ownership: exact external manifest only
- Product or fixture source changes: none

## Historical guard attempts

| Checkpoint | Original attempt | First resumed attempt |
| --- | --- | --- |
| Private workspace | PASS — external `0700` workspace/raw directory | PASS — brand-new external `0700` workspace/raw directory |
| Exact caller confirmations | PASS | PASS |
| Admin adapter initialization | Stopped by unnormalized CommonJS namespace | PASS after `75be64e49930359b8c29ff988ab614f3c9f6b090` |
| Resolved-project guard | Not reached | Stopped — resolved identity was not `the-squad-v2-staging` |
| Clients or hosted writes | `0` | `0` |
| Final external-workspace absence | PASS | PASS |

The original `BUG-005` draft is retired as a resolved QA-harness defect. Fresh executable proof is that the repaired adapter passed that crash site, first reached the later mismatch guard, and in the authorized attempt independently resolved the exact staging project. `BUG-005` must not enter the product defect ledger.

## Authorized lifecycle checkpoints

| Checkpoint | Sanitized result |
| --- | --- |
| Private workspace/raw directory | PASS — brand-new external paths, both mode `0700` |
| Exact caller/project/origin confirmations | PASS |
| Independent Firebase Admin project resolution | PASS — exactly `the-squad-v2-staging` |
| Read-only preflight | PASS — `safe=true`, nine aliases, two teams |
| Seed | PASS — state `seeded`, nine Auth users, 40 manifest-owned Firestore documents, two teams |
| Credential file | PASS — external path, mode `0600`, values never emitted |
| Initial inspect | PASS — nine Auth, 40 Firestore, zero problems |
| Team sentinels | PASS — exact and distinct before and after browser work |
| Browser contexts before transition | PASS — `qa-suspended` and `qa-removed-member` each reached `/dashboard` at both viewports |
| Guarded `qa-suspended` transition | PASS — exit `0`, resulting state `suspended`, refresh tokens revoked |
| Guarded `qa-removed-member` transition | PASS — exit `0`, resulting state `removed`, membership cache deleted, refresh tokens revoked |
| Post-transition state probe | PASS — exact negative states and expected membership-cache absence |
| Post-browser state probe | PASS — negative states intact; two multi-org memberships intact; sentinels exact/distinct |
| Final inspect → cleanup → inspect | PASS — pre-clean `9/40/0 problems`; cleanup deleted `9/39`, retained `0`; post-inspect state `cleaned` |
| Independent exact-manifest absence | PASS — `authPresent=0`, `firestorePresent=0` |
| Validated credential removal | PASS — helper returned `removed=true`; exact path absent |
| External workspace/raw absence | PASS — finally handler completed; exact private path absent |

## Required positive baselines and transitions

Before either transition, the Admin state probe recorded:

```text
suspendedProfile=active; suspendedVerified=true
removedDirectMembership=active; removedMembershipCache=active; removedVerified=true
```

Fresh system-Chrome contexts then proved each identity could authenticate and reach `/dashboard` at `390×844` and `1440×900`, with a session cookie, zero horizontal overflow, and no application-console or page error. Only after those positive baselines were recorded did the guarded transition commands run.

After both transitions, the exact manifest probe recorded:

```text
suspendedProfile=suspended; suspendedVerified=true
removedDirectMembership=removed; removedMembershipCache=missing; removedVerified=true
multiActiveMemberships=2; fakeSuperadminTrustedClaim=absent
teamSentinelsExact=true; teamSentinelsDistinct=true
```

The post-browser probe returned the same values. The browser's authorized Team A→Team B choice persists in client storage by design; the fixture's Firestore `activeTeamId` therefore remained `qa-team-a`, while both membership documents stayed active.

## Trap/finally strategy

Before preflight, the private shell registered an EXIT/INT/TERM handler. For any manifest state, it closes all Task 4 Playwright sessions, runs guarded `inspect`, `cleanup`, and `inspect` against only that exact external manifest, invokes the validated `removeCredentialFile` helper for only the external credential path, and removes the temporary workspace only when cleanup succeeds. No broad path, unresolved variable, production target, or provider target is eligible.

## Final cleanup and hygiene conclusion

Immediately before cleanup, exact inspect was healthy: nine Auth users, 40 manifest paths, state `seeded`, zero problems. Guarded cleanup exited `0`, deleted all nine Auth users and the 39 Firestore documents still present, and retained no resource. The fortieth manifest path was the membership-cache document already deleted by the approved removed-member transition.

Post-cleanup inspect recorded manifest state `cleaned` and zero surviving aliases; its 49 expected-resource problems are the intentional nine-plus-40 missing-resource observations. A separate adapter-based absence probe independently re-resolved exactly `the-squad-v2-staging`, queried every manifest UID/path, and returned:

```json
{"projectId":"the-squad-v2-staging","manifestState":"cleaned","authPresent":0,"firestorePresent":0}
```

The validated credential-removal helper returned `removed=true`, and the exact credential path was absent. The finally handler then repeated inspect/cleanup/inspect idempotently, invoked credential removal again, and deleted only the external private workspace. A check after the guardian exited proved the exact workspace path absent, so manifest files remaining, credential files remaining, and raw Playwright artifacts remaining are all `0`.
