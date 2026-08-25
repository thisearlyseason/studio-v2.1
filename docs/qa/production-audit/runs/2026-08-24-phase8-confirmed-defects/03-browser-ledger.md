# Phase 8 Canonical Browser Ledger

- Browser: system Chrome through the bundled Playwright CLI
- Viewports: `390×844`, `1440×900`
- Canonical contexts: `12/12 PASS`
- Closure supplement: `8/8 PASS`, plus a focused `2/2 PASS` visible-message resample
- Listener timing: page, console, request-failure, request, and response listeners were armed on `about:blank` before the first staging navigation
- Raw retained artifacts: `0`

## Canonical end-to-end contexts

| Context | Alias | Starting state | Route/action | Expected result | Visible state | Relevant status/data | Page/app errors | Request failures | Overflow | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| `p8-suspended-active-m` | `qa-suspended` | Active canonical Team A member | Fresh login at 390×844 | Account session and dashboard baseline | Team A dashboard | Session POST `200`; cookie present | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-suspended-active-d` | `qa-suspended` | Active canonical Team A member | Fresh login at 1440×900 | Account session and dashboard baseline | Team A dashboard | Session POST `200`; cookie present | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-removed-active-m` | `qa-removed-member` | Active canonical Team A member | Fresh login at 390×844 | Account session and dashboard baseline | Team A dashboard | Session POST `200`; cookie present | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-removed-active-d` | `qa-removed-member` | Active canonical Team A member | Fresh login at 1440×900 | Account session and dashboard baseline | Team A dashboard | Session POST `200`; cookie present | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-suspended-final-m` | `qa-suspended` | Suspended; tokens revoked | Fresh login at 390×844 | Generic denial, no account session or protected flow | `/login`; generic unavailable message | Session POST `403`; cookie absent | `0 / 0` | `0` unexpected | no | PASS |
| `p8-suspended-final-d` | `qa-suspended` | Suspended; tokens revoked | Fresh login at 1440×900 | Generic denial, no account session or protected flow | `/login`; generic unavailable message | Session POST `403`; cookie absent | `0 / 0` | `0` unexpected | no | PASS |
| `p8-removed-final-m` | `qa-removed-member` | Direct membership removed; cache absent; tokens revoked | Fresh login at 390×844, then former-team read | Account session to neutral squad admission; former team denied | `/teams/join`; no Team A UI | Session POST `200`; cookie present; Team A GET `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-removed-final-d` | `qa-removed-member` | Direct membership removed; cache absent; tokens revoked | Fresh login at 1440×900, then former-team read | Account session to neutral squad admission; former team denied | `/teams/join`; no Team A UI | Session POST `200`; cookie present; Team A GET `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-owner-a-m` | `qa-coach-owner-a` | Active Team A owner | Login at 390×844; query Team A then Team B | Own assignments allowed; changed team denied | Team A dashboard | Team A `200`; Team B `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-owner-a-d` | `qa-coach-owner-a` | Active Team A owner | Login at 1440×900; query Team A then Team B | Own assignments allowed; changed team denied | Team A dashboard | Team A `200`; Team B `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-owner-b-m` | `qa-coach-owner-b` | Active Team B owner | Login at 390×844; query Team B then Team A | Own assignments allowed; changed team denied | Team B dashboard | Team B `200`; Team A `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |
| `p8-owner-b-d` | `qa-coach-owner-b` | Active Team B owner | Login at 1440×900; query Team B then Team A | Own assignments allowed; changed team denied | Team B dashboard | Team B `200`; Team A `403` | `0 / 0` | `0` unexpected; classified abort noise only | no | PASS |

## Closure-critical hosted supplement

The supplement repeated the final states in fresh contexts and captured the invariants that the canonical summary had not retained. Intentional denied HTTP probes were classified separately from application-console errors. Aborted Next-prefetch and Firebase-provider requests had no HTTP, page, console, UI, or final-state mismatch; every context recorded `0` unexpected request failures.

| Context | Alias | Starting state | Route/action | Expected result | Visible state | Closure-critical observation | Page/app errors | Request failures | Overflow | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| `p8-closure-suspended-m` | `qa-suspended` | Suspended; tokens revoked | Fresh login at 390×844 | Generic unavailable denial; no cookie or protected data flow | Generic unavailable message visibly observed on `/login` | POST `403`; cookie absent; protected requests `0`; protected Firestore listeners `0` | `0 / 0` | `0` unexpected; `0` same-origin + `0` provider aborts | no | PASS |
| `p8-closure-suspended-d` | `qa-suspended` | Suspended; tokens revoked | Fresh login at 1440×900 | Generic unavailable denial; no cookie or protected data flow | Generic unavailable message visibly observed on `/login` | POST `403`; cookie absent; protected requests `0`; protected Firestore listeners `0` | `0 / 0` | `0` unexpected; `0` same-origin + `1` provider abort | no | PASS |
| `p8-closure-removed-m` | `qa-removed-member` | Membership removed; cache absent; tokens revoked | Fresh login at 390×844; direct former-Team A GET | Neutral admission; former team never listened to or rendered | `/teams/join`; neutral admission visible; Team A absent | POST `200`; cookie present; former-team listeners `0`; Team A GET `403` | `0 / 0` | `0` unexpected; `2` same-origin + `1` provider aborts | no | PASS |
| `p8-closure-removed-d` | `qa-removed-member` | Membership removed; cache absent; tokens revoked | Fresh login at 1440×900; direct former-Team A GET | Neutral admission; former team never listened to or rendered | `/teams/join`; neutral admission visible; Team A absent | POST `200`; cookie present; former-team listeners `0`; Team A GET `403` | `0 / 0` | `0` unexpected; `1` same-origin + `0` provider aborts | no | PASS |
| `p8-closure-owner-a-m` | `qa-coach-owner-a` | Active Team A owner | Login at 390×844; assignment API and direct cross-tenant GET/PATCH | Own array response `200`; all Team B operations denied | Authenticated Team A dashboard | Own `200`, `assignments` array; changed API `403`; Team B GET/PATCH `403/403` | `0 / 0` | `0` unexpected; `3` same-origin + `0` provider aborts | no | PASS |
| `p8-closure-owner-a-d` | `qa-coach-owner-a` | Active Team A owner | Login at 1440×900; assignment API and direct cross-tenant GET/PATCH | Own array response `200`; all Team B operations denied | Authenticated Team A dashboard | Own `200`, `assignments` array; changed API `403`; Team B GET/PATCH `403/403` | `0 / 0` | `0` unexpected; `2` same-origin + `0` provider aborts | no | PASS |
| `p8-closure-owner-b-m` | `qa-coach-owner-b` | Active Team B owner | Login at 390×844; assignment API and direct cross-tenant GET/PATCH | Own array response `200`; all Team A operations denied | Authenticated Team B dashboard | Own `200`, `assignments` array; changed API `403`; Team A GET/PATCH `403/403` | `0 / 0` | `0` unexpected; `4` same-origin + `4` provider aborts | no | PASS |
| `p8-closure-owner-b-d` | `qa-coach-owner-b` | Active Team B owner | Login at 1440×900; assignment API and direct cross-tenant GET/PATCH | Own array response `200`; all Team A operations denied | Authenticated Team B dashboard | Own `200`, `assignments` array; changed API `403`; Team A GET/PATCH `403/403` | `0 / 0` | `0` unexpected; `3` same-origin + `4` provider aborts | no | PASS |

The suspended visible-message sampler was repeated after correcting a non-waiting harness check; both fresh contexts visibly observed the exact generic copy, `The email or password is incorrect, or this account is unavailable.`, while preserving POST `403`, no cookie, zero protected requests/listeners, zero page/application errors, and no overflow. The prior non-waiting samples were discarded rather than inferred.

The login/setup provider gate and removed/deleted membership-cache filter are also covered by rendered/source regressions and independent code review. No former squad UI or listener was observed in the hosted removed-member contexts. All browser sessions were closed, and no raw trace, request body, token, cookie, credential, screenshot, storage state, or provider payload was retained.
