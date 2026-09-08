# Hosted non-physical completion

Date: 2026-09-08

Candidate: `3bd23a5511595bae6a1531440cfd0d608fff3e00`

This is the remaining-only hosted supplement. It does not repeat immutable local,
provider, background, or previously accepted production work. It adds the hosted
role, authorization, account-destruction, and League lifecycle boundaries that
were still missing. Physical-device acceptance remains separately listed in
`09-physical-device-checklist.md`.

## Multi-role and route-policy observations

Fresh isolated Playwright contexts exercised Starter, Squad Pro, Elite Org,
School, Player, Parent, and FREE League Creator demos. The role landings were
Dashboard for team roles, Family for Parent, and Competition for League Creator.
Every role rendered at 1280x900 and 390x844 without horizontal overflow or an
application HTTP 5xx response.

Direct `/admin` navigation was denied for every non-superadmin and returned each
role to its permitted Dashboard, Club, Family, or Competition landing. Player and
Parent were also denied `/club`, `/competition`, and `/teams/new`. Institution and
competition routes remained available only to their eligible management plans.
Each isolated demo identity was removed through `POST /api/demo/exit` with HTTP
204. Player and Parent recorded zero console errors before cleanup; intentionally
calling cleanup without the normal UI redirect reproduced listener teardown noise,
so final proof used the product's visible exit ordering rather than treating that
harness artifact as an application defect.

## Hosted administration and destructive account lifecycle

A disposable custom-claim superadmin and a separate disposable target account
were created in staging. Playwright proved trusted access to `/admin`, account
search, Users Directory data, and 390x844 containment with zero console errors.
The non-superadmin role sweep supplied the reciprocal route denial.

On the disposable target only:

- cancelling the Suspend dialog retained the active account;
- confirmed Suspend returned HTTP 200, set the profile to suspended, and disabled
  the Firebase Auth identity;
- confirmed Restore returned HTTP 200 and restored both Auth and profile state;
- cancelling the Delete Account dialog retained the active account;
- confirmed deletion scheduling returned HTTP 200, disabled Auth, set
  `accountStatus=pending_deletion` and `deletionStatus=pending`, and wrote the
  bounded deletion purge timestamp;
- confirmed cancellation returned HTTP 200, re-enabled Auth, restored the active
  profile, and removed deletion/purge state.

This complements the immutable local claim-revocation, fake-superadmin,
double-submit, owner-protection, scheduler purge/retry, and zero-residue evidence.

## Missing-profile admission

A verified Auth identity with no Firestore profile signed in on staging and was
sent to `/onboarding`. The page displayed **Complete your profile**, exposed the
role choices, rendered without horizontal overflow at desktop and 390x844, and
logged zero console errors. The temporary identity was removed during cleanup.

## League lifecycle and authorization

Registered staging League Creator testing used disposable profile-scoped tenants:

- blank create submission remained disabled;
- create returned HTTP 201 and persisted after reload;
- edit returned HTTP 200, advanced the lifecycle version, and persisted;
- clone returned HTTP 201 with its own versioned root;
- blank manual-squad fields produced local validation;
- another registered tenant received HTTP 403 for a target-league edit;
- an unauthenticated edit received HTTP 401.

That run exposed two client/server mismatches. Anonymous demos were shown
create/clone/archive/delete actions that the server intentionally rejects, and
Season Architect submitted organizer-entered squads through the public published
registration boundary. `a54c7159` aligned the anonymous controls with server
policy and routed manual squad staging through the authenticated lifecycle edit.

Exact production `3bd23a55` then verified the FREE League Creator demo with Create,
Clone, Archive, and Delete absent, Edit present, mobile containment, zero console
errors, zero application 5xx responses, and cleanup HTTP 204. It also closes a
follow-up console defect: the demo no longer attempts to read the organizer-private
`private/lifecycle` document.

Exact staging build `studio-build-2026-09-08-017` then completed the registered
lifecycle. Season Architect retained Alpha FC and Beta FC after reload and showed
two participating squads. Cancelling archive preserved the active league;
confirming archive persisted `isArchived=true` at lifecycle version 4. A direct
authenticated deletion attempt against that populated archived league returned
the intended HTTP 409 `LEAGUE_HAS_DEPENDENCIES`. Cancelling deletion of the
dependency-free U18 league preserved it, while confirmed deletion returned HTTP
200, removed the hub after reload, and reported the exact deleted league ID.
The final 390x844 view had no horizontal overflow. The only new console error was
the browser's expected failed-resource entry for the deliberately asserted 409.
All disposable League identities, league roots, projections, lifecycle records,
and temporary credential files were removed; the Admin SDK residue check returned
zero.

## Automated and deployment evidence

- Pull request 57 checks: application, Functions, Firebase rules, and both
  production dependency audits passed before merge `a54c7159`.
- Pull request 58 checks: the same complete gate passed before merge `3bd23a55`.
- Merge release gates `34227935796` and `34231147826`: PASS.
- Focused League and security regressions: 63/63 PASS.
- TypeScript: PASS.
- Diff validation: PASS.
- Production no-cache health: `3bd23a5511595bae6a1531440cfd0d608fff3e00`.
- Protected staging workflow `34231671983`: PASS, including `npm run verify`,
  Functions, Firestore indexes/rules, Storage rules, App Hosting rollout, and
  staging health for `studio-build-2026-09-08-017`.

## Remaining boundary

Only the checks in `09-physical-device-checklist.md` require physical hardware.
They must not be inferred from this hosted supplement.
