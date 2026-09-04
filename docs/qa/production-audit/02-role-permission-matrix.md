# Role and Permission Matrix

**Phase:** Discovery and planning only  
**Rule:** Hidden navigation is not authorization. Every restricted operation requires direct backend testing.

## Role model

Seven global roles are accepted by the current user-profile model:

| Global role | Creation | Primary scope |
|---|---|---|
| `parent` | Public signup or linked guardian flow | Own household, linked children, active team memberships |
| `adult_player` | Public signup | Own player identity and active team memberships |
| `youth_player` | Invitation only | Linked player identity and active team memberships |
| `coach` | Public signup | Owned teams or ordinary memberships; staff authority depends on local relationship |
| `admin` | Public signup/institution flow | Owned or delegated school/club scope; not platform administration |
| `league_creator` | Public signup | Created/member leagues and associated competition workflows |
| `superadmin` | Server-controlled custom claim only | Platform administration and emergency global authority |

Additional access models are unauthenticated/public visitor and anonymous demo persona. Compatibility strings such as `guardian` and `player` appear in older data but are not new canonical global roles.

## Team-local authority

| Local relationship | Recognition | Intended authority |
|---|---|---|
| Primary owner | `teams.ownerUserId` | Team root, billing/Connect, destructive and staff-governance authority |
| Team `Admin` | Membership `role=Admin` | Operational staff authority; owner-only fields remain protected |
| Staff member | `role=staff` or recognized staff position | Ordinary team operations only |
| Recognized staff positions | Coach, Head Coach, Assistant Coach, Team Representative, Athletic Director, Director of Athletics, Staff, Manager, Squad Leader, Coach Guest, Team Lead, Platform Admin | Operational staff checks; no automatic subscription/ownership authority |
| Parent/guardian | Position Parent/Guardian or linked child relationship | Own child/household and parent-enabled team surfaces |
| Player/member | Player/Member position and linked `userId`/`playerId` | Own/member-visible surfaces only |
| Removed member | `status=removed` or `isDeleted=true` | No active team access |

Join codes derive Parent, Player, or Member on the server. A join payload must never self-assign staff or owner authority.

## Global role versus feature matrix

Legend: **M** manage, **R** read/use, **O** own/linked records only, **C** conditional on team position/plan/feature flag, **—** no intended access, **P** public surface only.

| Feature | Visitor | Demo | Parent | Adult player | Youth player | Coach | Admin | League creator | Superadmin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Marketing/legal/Sports Hub public content | P | R | R | R | R | R | R | R | R |
| Login/signup/reset/verification | R | C | R | R | invite | R | R | R | M |
| Dashboard/shell | — | R | C | R | R | R | R | R | M |
| Family Hub | — | demo | M/O | O | O | — | — | — | M |
| Team create | — | demo | C | C | — | C | C | C | M |
| Team join | — | demo | R | R | invite | R | R | R | M |
| Team root/settings/module flags | — | demo-owner | — | — | — | C | C | C | M |
| Roster private data | — | C | O | O | O | C | C | C | M |
| Events/calendar | public portal | C | R/O | R/O | R/O | C | C | C | M |
| Practice/drills/video | — | C | C/R | C/R | C/R | C/M | C/M | C | M |
| Feed/chat/polls | — | C | C/R | C/R | C/R | C/M | C/M | C | M |
| Files/waivers | public form | C | O | O | O | C/M | C/M | C | M |
| Safety/incidents | public education | C | O/read as exposed | O/read as exposed | O/read as exposed | C/M | C/M | C | M |
| Games/team scorekeeping | spectator | C | R | R | R | C/M | C/M | C/M | M |
| League management | public portal | C | C/R | C/R | C/R | C | C | M/O | M |
| Tournament management | public portal | C | C/R | C/R | C/R | C | C | M/O | M |
| Recruiting private portfolio | public projection | C | O | O | O | C/M | C/M | C | M |
| Subscription/Customer Portal | pricing | no live billing | — | — | — | O/owner | O/owner | O/owner | M |
| Stripe Connect/payment items | public pay link | disabled | O/payer | O/payer | — | O/owner | O/owner | O/owner | M |
| Fundraising/volunteer | public participate | C | C/R | C/R | C/R | C/M | C/M | C | M |
| Facilities/equipment | — | C | C/R | C/R | C/R | C/M | C/M | C | M |
| Club/school hub | — | C | — | — | — | C | M/O | C | M |
| Platform `/admin` | — | — | — | — | — | — | — | — | M |

The matrix describes intended access classes, not test results. Plan and team feature flags may further restrict otherwise eligible users.

## Record-level CRUD matrix

| Record/domain | Create | Read | Update | Delete | Cross-user/team restrictions requiring proof |
|---|---|---|---|---|---|
| User profile | Self during approved onboarding; server for privileged fields | Self; superadmin | Self-safe fields; admin APIs for account/entitlement | Scheduled account lifecycle | User cannot set role, plan, Stripe IDs, staff/beta/admin flags, linked-player authority, or another UID |
| Team root | Entitled verified non-anonymous account via server | Owner/active member; public DTO where defined | Owner; limited server-mediated operations | Owner/server, conflict checks | Staff cannot transfer owner, change billing state, or delete another team |
| Team member | Owner/staff through allowed flow; join server derives position | Active team scope; parents/players must receive minimized records | Owner/staff ordinary fields; owner-only authority fields | Owner/staff subject to owner protection | No self-promotion; removed member loses all access; other-team IDs denied |
| Player | Self/guardian/authorized team flow | Self, guardian, authorized coach; public allowlist only when enabled | Self/guardian/authorized coach bounded fields | Self/guardian policy; server cleanup | Siblings/other guardians/other teams denied; private DOB/contact/evaluation never public |
| Event/RSVP | Staff creates event; eligible member records own response via API | Active membership/public projection if published | Staff event changes; member own RSVP only | Staff | Direct Firestore RSVP forgery, other-user RSVP, disabled module, archived/cancelled event |
| Feed/chat/message/poll | Eligible active member subject to feature/audience rules | Active audience only | Own content or moderator actions as defined | Own/moderator as defined | Parent controls, removed member, wrong channel, other tenant, vote replay |
| File/upload | Authorized owner/guardian/team flow; safe MIME/size | Storage-path policy and public profile setting | Same manager | Same manager | Renamed MIME, oversize, arbitrary path, other team/player, deleted asset |
| Waiver/signature | Staff/organization creates; signer creates own signature | Signer/guardian/staff audit scope | Waiver manager; signatures generally immutable | Manager/archive rules | Other signer, wrong child/team/event, replay, altered legal text/date, direct write |
| Incident | Staff creates | Staff/institution aggregation; subject visibility must be verified | Policy-dependent; audit integrity required | Restricted/immutable expectation | Participant cannot alter/delete audit record; other tenant cannot read sensitive details |
| League | Verified creator via server, bounded by entitlement | Creator/member cache/public projection | Creator/authorized staff APIs | Creator/server | Invite does not expose collection; member cache sync; wrong league/creator denied |
| Tournament | Team-scoped authorized staff | Staff/member/public projection | Authorized staff; scorekeeper/referee actions separately scoped | Authorized owner/staff policy | Unsupported root tournament hubs denied; registration codes/PINs do not broaden unrelated access |
| Facility/field | Authorized owner/staff/institution | Owning scope | Authorized scope | Authorized with conflict checks | Cross-club/team denial; booked field/facility deletion conflict |
| Equipment | Staff | Active membership subject to policy | Staff/assigned return path | Staff | Assignee cannot change quantity or another assignment; delete reconciles state |
| Fundraiser/donation | Staff campaign; public validated donation | Public projection or staff ledger | Staff; public donation append only | Staff campaign subject to financial audit policy | No private donor leakage; amount/link tampering; other-team campaign mutation denied |
| Volunteer opportunity/signup | Staff opportunity; public validated signup | Public projection or staff ledger | Staff; attendee confirmation | Staff | Capacity races, duplicate email/identity, other-team manipulation |
| Payment item/payment | Owner/staff as explicitly authorized; payer via public link | Owner/staff ledger; payer own receipt | Owner/staff status; server/provider settlement | Deactivate, not erase financial audit | Amount/price/team/customer tampering; parent cannot alter another household payment |
| Subscription | Server/provider only | Account owner/admin | Server/provider API only | Cancel/reactivate, not client delete | Body price/UID/customer/seat changes ignored or denied; webhook authoritative |
| Admin/beta/newsletter | Superadmin or public submission endpoint | Superadmin; subscriber own unsubscribe token | Superadmin/system | Superadmin/system retention rules | Non-superadmin direct route/API/rules denial; token replay and enumeration controls |

## Account-state restrictions

| State | Required behavior |
|---|---|
| Unverified | No private tenant data or privileged API access; verification-only path available |
| Anonymous demo | Session-owned demo data only; no live billing/provider action; cross-demo denial |
| Removed membership | No team reads/writes, chat, files, notifications, calendar feeds, or cached league access |
| Suspended/disabled | Tokens/sessions rejected; no private data access |
| Pending deletion | Immediate private-data denial; cancel only through privileged supported path |
| Deleted | Auth/profile and purge-target data absent after retention job; retained financial audit data follows policy |
| Missing profile/membership | Fail closed; onboarding or no-access state, never broad fallback |
| Past-due/unpaid/canceled subscription | Free entitlement/capacity unless provider-authoritative recovery restores eligibility |

## Backend authorization test register

Each item below requires Phase 2 evidence at route/API/rules level:

1. Direct request to every protected dashboard prefix for all seven roles, unverified, removed, suspended, pending-delete, and anonymous identities.
2. Every authenticated API with missing, malformed, expired, revoked, anonymous, unverified, wrong-project, wrong-tenant, and wrong-role tokens.
3. UID/team/player/league/tournament/club/facility/event/chat/message/payment identifiers replaced with Tenant B values.
4. Direct Firestore creates/updates that attempt role, staff position, owner, plan, subscription, Stripe, public-profile, audience, score, RSVP, financial, and signature escalation.
5. Storage reads/writes for other users/players/teams, public/private recruiting state, MIME spoofing, oversize payloads, and deleted assets.
6. Team owner versus delegated staff boundaries for root settings, billing, ownership, staff promotion, deletion, Stripe Connect, and organization changes.
7. Parent/guardian boundaries across children, siblings, other households, medical/contact data, payments, waivers, and calendar feeds.
8. League creator ownership, invite redemption, member-cache updates/removal, public projection whitelists, and direct league enumeration.
9. Tournament staff, referee, scorekeeper-code, registration-code, waiver, public projection, archive, and delete boundaries.
10. Superadmin claim persistence/revocation and denial for a profile merely containing `role=superadmin` without the trusted claim.
11. Public portal enumeration, disabled/unpublished resource behavior, rate limits, body limits, SSRF/URL controls, duplicate submissions, and private-field exclusion.
12. Webhook invalid signatures, replay, out-of-order events, duplicate delivery, wrong mode/account, partial processing, and retry recovery.
