# Phase 7 Auth and Tenant Browser Evidence

- Browser result: `5 PASS / 4 FAIL ACROSS 9 APPROVED GROUPS`
- Evidence-bearing scenario contexts: `32`
- Named system-Chrome contexts opened/closed: `38 / 38`
- Viewports: `390×844`, `1440×900`
- Raw browser artifacts retained after cleanup: `0`

The exact staging preflight, seed, inspect, and required active-state baselines all passed before the negative-state transitions. Every scenario used a fresh named Chrome context, current snapshots before element references, event-based waits, and a unique `P7-S##-*` identifier. Captured fields include final path, visible state, applicable API status, same-origin request failures, application-console errors, page errors, horizontal overflow, session-cookie presence, and post-action Firestore state.

## Approved scenario disposition

| # | Approved scenario | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Verified owner login, revocation-checked session, permitted landing | Owner reached `/dashboard` with `__session` at both viewports; zero overflow, same-origin failures, app-console errors, or page errors | `PASS` |
| 2 | Unverified and suspended identities deny protected data | Unverified routed to `/verify-email` with no session at both sizes. Suspended active baseline passed, and its saved pre-transition session was later denied at `/login`; a fresh post-suspension login nevertheless created a session and entered an erroring protected flow | `FAIL — BUG-006` |
| 3 | Logout and stale/revoked session reuse | Desktop/mobile sign-out called `DELETE /api/auth/session` with `200`, cleared `__session`, and direct `/dashboard` reuse stayed at `/login`; suspended and removed saved sessions were also denied after revocation | `PASS` |
| 4 | Owner, assistant, and ordinary-member permitted routes/controls | Owner reached `/coaches-corner`. Assistant Coach was redirected to `/dashboard`; ordinary member reached `/roster` but the error boundary rendered `Something went wrong` | `FAIL — BUG-008, BUG-009` |
| 5 | Direct disallowed staff, institution, finance, and admin routes/APIs | Ordinary member direct `/coaches-corner`, `/club`, `/dashboard/billing`, and `/admin` attempts all ended on `/dashboard`; admin API returned `403` at both sizes | `PASS` |
| 6 | Fake-superadmin profile-only role | `/admin` visibly rendered `Access Denied` and the admin API returned `403` at both sizes; trusted claim remained absent | `PASS` |
| 7 | Changed Team A/Team B route, query, and API identifiers | Each owner read its own team (`200`); cross-team Firestore GET/PATCH and app query returned `403`; forcing the other team ID into `/team?teamId=` still rendered only the authorized team. The own-team assignments query returned `500` for both owners | `FAIL — BUG-010` |
| 8 | Multi-organization authorized switching | Both authorized team reads returned `200`; snapshots proved Team A initially, Team B immediately after ref-driven selection, and Team B after actual reload, with Team A absent post-switch; zero overflow/error | `PASS` |
| 9 | Removed-member post-removal access | Active browser baseline passed, saved session was revoked, and direct Team A Firestore GET returned `403`; a fresh login still created a session and reached `/dashboard` at both sizes | `FAIL — BUG-007` |

## Sanitized signal summary

| Signal | Observed result |
| --- | --- |
| Horizontal overflow | `0` in every evidence collection |
| Logout API | `DELETE /api/auth/session` → `200` |
| Ordinary/fake-admin API denial | `/api/admin/sports-hub` → `403` |
| Cross-tenant Firestore | Own team GET `200`; other team GET/PATCH `403`, symmetric A↔B |
| Removed member Firestore | Team A GET `403` after transition |
| Multi-org Firestore | Team A GET `200`; Team B GET `200` |
| Assignments query | Own team `500`; changed other team `403`, symmetric A↔B |
| Application-console errors | None on passing final states; expected failed-resource messages accompanied explicit `403`s; BUG-006 produced two rules-denial errors; BUG-009 produced a `toLowerCase` TypeError; BUG-010 produced failed-resource `500` errors |
| Page errors | `0` captured; BUG-006's visible client-exception boundary occurred during login navigation before the post-login listener installed and is preserved by the final DOM plus CLI console transcript |
| Same-origin request failures | Intermittent `net::ERR_ABORTED` on navigation-prefetch requests such as `/events`, `/chats`, `/dashboard`, `/games`, `/teams/join`, `/leagues`, `/facilities`, and `/equipment`; no corresponding final-state failure except the separately status-proven assignments `500` |
| Post-action Firestore | Suspended/removed states intact; removed membership cache absent; multi-org memberships `2`; sentinels exact/distinct; fake trusted claim absent |

The dashboard also issued `PATCH /api/schools/admins` with `200` during several ordinary route loads. It was captured as network evidence, not invoked directly by Task 4 and not classified as a failure because no school/admin state drift appeared in the exact manifest probes.

## Draft product findings

### BUG-006 — Suspended credentials can establish a new protected session

- Severity: `P1 HIGH`
- Affected row: `Authentication — Email/password login`
- Reproduction: record active `/dashboard` baseline; run guarded `qa-suspended` transition; prove profile `suspended` and revoked saved session; sign in again in a fresh context.
- Actual: a new `__session` is issued. Mobile routed to `/onboarding`; desktop ended at `/login`; both rendered a client-side application exception. CLI console evidence recorded rules-denied reads of the suspended user profile and membership list.
- Expected: fail closed before creating a protected session or rendering a protected flow.

### BUG-007 — Removed member can establish a new dashboard session

- Severity: `P1 HIGH`
- Affected rows: `Authentication — Email/password login`; `Dashboard/shell — Role landing and route policy`
- Reproduction: record active `/dashboard` baseline; run guarded `qa-removed-member` transition; prove direct member status `removed`, cache missing, and saved session revoked; sign in again.
- Actual: fresh contexts at both sizes received `__session` and `/dashboard`. Direct Team A Firestore GET still returned `403`.
- Expected: removed users fail closed at UI/session and data boundaries.

### BUG-008 — Team-local Assistant Coach is denied the staff route

- Severity: `P2 MEDIUM`
- Affected row: `Dashboard/shell — Role landing and route policy`
- Reproduction: sign in as `qa-team-assistant`, whose active Team A membership position is Assistant Coach, then navigate directly to `/coaches-corner`.
- Actual: both viewports redirected to `/dashboard`; owner comparison reached `Coach Tools` on `/coaches-corner`.
- Expected: approved active staff membership reaches permitted staff tools.

### BUG-009 — Ordinary-member roster route crashes in the error boundary

- Severity: `P2 MEDIUM`
- Affected row: `Roster — Member add/edit/remove/reinstate`
- Reproduction: sign in as active `qa-team-member` and navigate directly to `/roster`.
- Actual: both viewports remained on `/roster` but rendered `Something went wrong`; the application console recorded `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` from the roster chunk.
- Expected: the permitted roster view renders the member-safe state without an application exception.

### BUG-010 — Authorized own-team assignments query returns 500

- Severity: `P2 MEDIUM`
- Affected row: `Leagues — Registration/assignment`
- Reproduction: sign in separately as Team A and Team B owners, then GET `/api/leagues/assignments?teamId=<own-team>` with the current Firebase token.
- Actual: both authorized own-team requests returned `500`; the same endpoint with the changed other-team ID correctly returned `403`.
- Expected: authorized own-team query returns a successful empty/result response while cross-tenant query remains denied.

These are stable Task 4 drafts only. Task 4 did not patch product source or edit the product defect ledger.

## Coverage conclusion

Groups 1, 3, 5, 6, and 8 supply complete passing fixture evidence. Groups 2, 4, 7, and 9 are failed by the linked drafts and cannot be promoted wholesale. The results narrow the exact affected rows but do not establish production readiness; providers, destructive account deletion, real devices, and the rest of the broader matrix remain outside this fixture run.
