# The Squad Pro account inventory

Audit date: 2026-07-26
Branch: `codex/qa-production-audit`
Environment: local Next.js build, Firebase Firestore/Storage emulators, Firebase demo project. No production data, live payments, or real email delivery were used.

## Global account types and roles

The application has seven global roles. Team duties such as assistant coach and manager are membership positions, not global roles.

| Account type | Stored global role | Direct registration | Default relationship | Login |
|---|---|---:|---|---|
| Parent/guardian | `parent` | Yes | Own child/player profile; may join teams | Email/password, Google |
| Adult player | `adult_player` | Yes | Own player profile; may join teams | Email/password, Google |
| Youth player | `youth_player` | Invitation only | Linked player and team membership | Single-use youth invitation |
| Coach/team organizer | `coach` | Yes | Team owner/admin or team member | Email/password, Google |
| School/club administrator | `admin` | Yes | School hub owner or delegated school administrator | Email/password, Google |
| League organizer | `league_creator` | Yes | League creator; team optional | Email/password, Google |
| Platform administrator | `superadmin` custom claim | No public signup | Global administrative authority | Firebase account with server claim |
| Demo persona | one of the roles above | Seeded only | Anonymous, session-owned demo data | Anonymous Firebase session |

Legacy strings `guardian` and `player` appear as compatibility aliases; they are not accepted as new global profile roles.

## Team-local authority

Membership `role` is `Admin` or `Member`. Operational authority is also inferred from `position`.

- Staff positions: Coach, Head Coach, Assistant Coach, Team Representative, Athletic Director, Staff, Manager, Squad Leader, Coach Guest, Team Lead, Platform Admin.
- Family positions: Parent, Guardian.
- Player/default positions: Player or Member.
- Join-code position is now server-derived: parents become Parent, player accounts and linked children become Player, and other ordinary accounts become Member. A join payload cannot self-assign a staff position.
- The primary team owner remains the billing and destructive-action authority.

## Account states found

| State | Representation | Automated evidence |
|---|---|---|
| New/partially created | Auth record before completed profile/verification | Verification gate and missing-profile handling |
| Unverified | Firebase `email_verified=false` | API, Firestore, Storage denial |
| Verified/active | verified token and active/default user status | Authorized paths pass |
| Invited/pending | invitation record/status | Youth and league invite policy tests |
| Removed membership | member `status=removed` or `isDeleted=true` | Team and chat denial |
| Suspended | user `accountStatus=suspended` | Firestore/Storage denial |
| Pending deletion | `accountStatus=pending_deletion` or `deletionStatus=pending` | Immediate data denial and purge tests |
| Disabled | Firebase Auth disabled/revoked | Server token revocation check; live lifecycle requires Preview |
| Deleted | Auth disabled then scheduled purge after seven days | Purge coverage tests; destructive execution not run |
| Missing profile | Auth record without `/users/{uid}` | Data rules fail closed |
| Missing membership | active profile without team membership | Tenant reads fail |
| Multiple teams/organizations | multiple membership documents | Rules are target-team scoped; UI switching remains manual |
| Demo | anonymous token plus session-owned `isDemo` records | Cross-demo isolation test |
| Trial/paid/non-entitled | subscription state on user | Capacity policy tests |

Soft restoration exists only as cancellation of a pending deletion through privileged account control; recreation after final purge was not exercised.

## Subscription inventory

| Plan ID | Product meaning | Base team capacity |
|---|---|---:|
| `free` | Starter | 1 |
| `team` | Pro Team | 1 |
| `elite` | Elite Teams | 8 |
| `league` | League | 18 |
| `school` | School | 15 |

Paid access is granted only when `subscription_status` is `active` or `trialing`. Known non-entitled states include `past_due`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, `canceled`/`cancelled`, and inactive/missing. Paid plans support monthly and annual billing. `extra_teams` is added to server-managed capacity, capped defensively at 100 creation slots.

Demo identifiers include `starter_squad`, `squad_pro`, `elite_teams`, `league`, `school_demo`, `parent_demo`, `player_demo`, and `league_demo`; they map back to the real plan/role model and do not create additional production roles.

## Proposed safe test identities

Use synthetic `@example.test` identities in a Vercel Preview connected only to Firebase emulators or an isolated non-production Firebase project and Stripe test mode:

- one verified and one unverified identity for each registrable global role;
- one invited youth identity linked to a synthetic parent;
- two coaches owning separate organizations, plus an assistant coach in only one;
- one parent and player in each of two teams;
- one school owner and one delegated school administrator;
- two league creators and two tournament creators;
- one claim-controlled superadmin;
- separate active, trialing, past-due, canceled, and free subscription owners;
- two anonymous demo sessions.

No identity should be reused when the test depends on tenant isolation.
