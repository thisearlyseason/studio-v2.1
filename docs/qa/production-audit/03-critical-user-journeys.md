# Critical User Journeys

**Phase:** Discovery and planning only
**Count:** 24 critical journeys
**Status:** All journeys are `NOT RUN` for this audit.

A journey is critical when failure prevents account access, core team/competition operations, household participation, payment entitlement, compliance, public registration, or platform recovery.

## Journey register

| ID | Journey | Starting role | Preconditions | Start | Steps and expected result | Data changed | Permissions/APIs | Risk |
|---|---|---|---|---|---|---|---|---|
| CJ-01 | Register and verify coach | Visitor | Disposable unused mailbox; isolated project | `/signup` | Choose Coach and Free; submit valid profile/password; verification is sent; private routes remain blocked until valid single-use link; verification returns to intended route and creates an active profile | Auth user, `/users/{uid}`, email ledger/session | Signup client, email verify API, session API, user rules | CRITICAL |
| CJ-02 | Login, protected deep link, logout | Verified coach | Active profile/team | `/login?returnTo=/events` | Login; exchange server session; land on `/events`; refresh succeeds; logout clears client/server state; back/deep link returns to login | Session cookie/token state | `/api/auth/session`, dashboard server guard | CRITICAL |
| CJ-03 | Password reset and account recovery | Verified account | Approved QA mailbox | `/login` | Request reset with known and unknown email; responses do not enumerate; valid link changes password once; old password and reused/modified link fail; new login succeeds | Auth password/action code, email events | Reset API, Firebase Auth, Resend | HIGH |
| CJ-04 | Create first team | Verified coach/admin | Eligible free account with zero owned teams | `/teams/new` | Enter name/type/role/optional waiver; create; owner membership and active team appear; redirect to team workspace; second free team is rejected without partial records | Team root, owner member, user membership, optional waiver | `/api/teams/create`, rules, account capacity policy | CRITICAL |
| CJ-05 | Join team safely | Verified parent/player/ordinary user | Tenant A team with join code; separate outsider | `/teams/join` | Resolve code without leaking unrelated data; join; position is server-derived; active membership appears; staff-role payload tampering fails | Team member and user membership indexes | `/api/teams/join`, membership rules | CRITICAL |
| CJ-06 | Invite and activate youth player | Parent plus team staff | Existing linked child/team; disposable youth mailbox | Roster/Family Hub | Staff/parent issues invite; wrong/reused/expired token fails; youth creates credential; identity links to existing player/member; guardian retains relationship; youth sees only own scope | Invite, Auth user, youth profile, player/member links | Youth invite APIs, Auth, player/member rules | CRITICAL |
| CJ-07 | Switch teams without tenant bleed | Multi-team user | Team A and Team B with distinct records | `/dashboard` | Switch A→B→A; route, cache, counters, dialogs, chat, files, roster, events and back/refresh show only active tenant; copied A IDs fail while B active if authority absent | Active-team client state only | Queries, rules, team provider | CRITICAL |
| CJ-08 | Manage roster and delegated staff | Team owner and assistant | Team A roster with parent/player; Tenant B outsider | `/roster` | Add player/parent; edit safe fields; assign assistant staff; assistant performs allowed operation; assistant cannot promote roles/change owner/billing; remove/reinstate member updates access immediately | Members, players, notes, status, invitations | Rules, parent-access/youth APIs | CRITICAL |
| CJ-09 | Create event, RSVP, attendance, persistence | Team staff, parent, player | Active Team A | `/events` | Staff creates dated event; refresh preserves it; parent/player view and RSVP; staff sees response/attendance; other user cannot forge RSVP; edit/cancel updates calendars and reminders | Event, RSVP/attendance, reminder eligibility | Events action and RSVP APIs, rules | HIGH |
| CJ-10 | Subscribe to and revoke calendar feed | Parent/multi-team member | Active membership(s) and events | `/calendar` | Create team/user/multi-team feed; fetch valid ICS; verify tenant events and time zones; remove membership/deactivate token; same URL becomes denied/no stale cache | Calendar feed token/doc | Calendar API and Function, membership checks | HIGH |
| CJ-11 | Publish practice and video workflow | Team staff and player | Pro-entitled team, safe media fixture | `/practice` | Create practice; add drill/film; upload allowed media; add coach mark/watch requirement; player opens/records progress; refresh persists; non-staff mutation and unsafe upload fail | Practice/drill/video/comment/progress docs and storage | Rules, Storage policy, entitlement | HIGH |
| CJ-12 | Team communication and audience controls | Staff, parent, player | Pro team with chat/feed enabled | `/feed` | Publish post/alert/channel/poll; target appropriate audience; parent/player see only eligible content; vote/comment persists once; disable parent access/module and direct URL/API is denied; removed user loses access | Posts/comments/chats/messages/votes/alerts | Feed/chat/notify APIs, rules, flags | CRITICAL |
| CJ-13 | Upload, share, and delete team document | Staff and member | Safe/unsafe file fixtures | `/files` | Upload allowed file; authorized member reads/downloads; renamed MIME/oversize/other-team path fail; delete removes access; stale URL does not expose private object | Firestore document and Storage object | Storage rules/upload policy | CRITICAL |
| CJ-14 | Create and sign waiver | Team/organization staff, parent/player | Published waiver and linked child | `/files` or Family Hub | Staff deploys waiver; correct signer reviews exact text and signs for correct child; timestamp/date persist; duplicate/replay/wrong-child/other-team attempts fail; compliance view updates | Waiver, signature, compliance state | Waiver APIs and rules | CRITICAL |
| CJ-15 | Record and audit safety incident | Staff and institution admin | Team/event/member fixtures | Coaches Corner | Staff records incident with treatment/witness data; institution admin sees permitted aggregate/detail; participant/outsider cannot alter/delete/read sensitive record; audit/export is accurate | Incident/audit records | Firestore rules, club aggregation | CRITICAL |
| CJ-16 | Create and operate league season | League creator | Eligible account, teams/facilities | `/leagues` | Create league; configure divisions/settings/teams; generate/deploy schedule; refresh; edit; public spectator sees safe standings/schedule; unauthorized creator/tenant cannot mutate or enumerate | League, divisions, teams, schedule, public projection | League create/schedule/assignment APIs, Functions/rules | CRITICAL |
| CJ-17 | League registration and scoring | League creator, registrant, scorekeeper | Published form/portal/game and scoring PIN | Registration portal | Submit valid team/player registration; duplicate/invalid form fails; organizer reviews/assigns; scorekeeper wrong PIN fails and valid PIN records score; dispute/audit/standings update | Registration, assignments, score/audit, public view | Public portal, league APIs, Function projection | CRITICAL |
| CJ-18 | Create and operate tournament | Authorized team staff | Teams, facility, event blueprint | `/manage-tournaments` | Create format/pools/windows; generate/deploy; assign referee; replicate blueprint; archive; public bracket/standings update; invalid role/code/PIN and conflicting referee fail | Event/tournament, games/bracket/referee, replication/archive state | Tournament schedule/resolve/public APIs | CRITICAL |
| CJ-19 | Tournament registration, waiver, score dispute | Organizer, registrant, scorekeeper/referee | Published event/registration/waiver | Public tournament portal | Register team/player; sign required waiver; organizer reviews; scorekeeper submits score; losing team disputes; organizer resolves; downstream bracket invariants remain valid | Registration, signature, score/dispute/audit/bracket | Public portal, tournament APIs/rules | CRITICAL |
| CJ-20 | Parent household management | Parent | Two linked children in different teams with events/dues/waivers | `/family` | See only linked children; accept invite/sign waiver; combined schedule and balances reconcile by child/team; enable youth login; another parent/sibling records remain absent | Player/guardian links, invites, signatures, optional youth invite | Family queries, player/member rules | CRITICAL |
| CJ-21 | Subscribe, change plan, cancel, recover | Account owner | Stripe test customer; canonical test prices | `/pricing` | Checkout selected plan/cycle; signed webhook grants exact entitlement; add/remove team seat; portal/update/cancel/reactivate; failure/past-due/customer deletion removes entitlement; recovery creates valid customer without duplication | Stripe customer/subscription/events, user entitlement/seat data | Checkout/subscription/webhook APIs | CRITICAL |
| CJ-22 | Connect payments and household payment | Team owner and parent | Stripe test connected account/payment item | Finance surface | Complete test onboarding; create/deactivate payment item; parent opens correct payment/offline workflow; duplicate/wrong amount/team/customer fails; staff verifies offline payment; ledger and balance reconcile | Connect account refs, payment items/payments/audit | Connect/payment/offline APIs and webhook | CRITICAL |
| CJ-23 | Fundraising donation and volunteer signup | Staff and public participant | Published campaign/opportunity; capacity fixture | Public donation/volunteer URL | Staff publishes; public projection hides private fields; valid donation/signup persists once; invalid amount/contact/duplicate/capacity race fails safely; staff reconciles/completes | Campaign/donation or opportunity/signup | Public fundraising/volunteer APIs, Connect if used | HIGH |
| CJ-24 | Disable, delete, and purge account safely | User, team owner, superadmin | Disposable non-owner and owner identities; retention clock | `/settings` | Non-owner requests deletion; access stops immediately; cancel supported request restores state if allowed; scheduled purge removes targeted identity/data but retains required financial audit; owner deletion blocks until ownership resolved; other tenants remain intact | AccountDeletionRequest, Auth/profile/player/membership/storage cleanup | Deletion API, admin control, scheduled Function | CRITICAL |

## Cross-journey expectations

Every journey must also record:

- browser console errors and unhandled promise rejections;
- failed/duplicate/unexpected network requests and response codes;
- persistence after refresh and, where relevant, a second session;
- direct URL and identifier-tampering denial for restricted roles;
- mobile behavior at 390×844 plus a desktop width for user-facing critical paths;
- cleanup of disposable accounts, uploads, provider fixtures, and synthetic tenant data.

## Journey dependencies

| Dependency | Journeys |
|---|---|
| Disposable QA mailboxes | CJ-01, CJ-03, CJ-06 |
| Two isolated tenants | CJ-05, CJ-07, CJ-08, CJ-12–CJ-20 |
| Stripe test mode | CJ-21, CJ-22, optionally CJ-23 |
| Real browser/device notification permission | CJ-09, CJ-12 |
| Time control or scheduler invocation | CJ-10, CJ-21, CJ-24 |
| Safe file/media fixtures | CJ-11, CJ-13 |
| Claim-controlled superadmin | CJ-15, CJ-24 and administration verification |
