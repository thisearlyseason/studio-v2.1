# Application Inventory

**Phase:** Discovery and planning only  
**Evidence date:** 2026-08-21  
**Audit status:** No feature has been certified by this document.

## Repository baseline

| Area | Current source evidence |
|---|---|
| Web application | Next.js 15.5 App Router, React 19, TypeScript, Tailwind/Radix UI |
| Page surface | 87 `page.tsx` files, 31 layouts |
| API surface | 79 `route.ts` files; handlers include GET, POST, PUT, PATCH, and DELETE |
| Data/auth | Firebase Auth, Firestore, Storage, Admin SDK |
| Background work | Firebase Functions triggers plus three 15-minute schedules |
| Billing | Stripe subscriptions, add-on seats, Customer Portal, Stripe Connect, payment items |
| Messaging | Resend email and webhook processing, FCM device tokens and pushes |
| Testing | 59 Node test files, Firestore/Storage emulator suites, generated TestSprite references |
| Delivery | GitHub Actions release gate; Firebase App Hosting staging; Vercel production |
| Local runtime | Root Node 24; Functions Node 22; app development port 9001 |

No repository-level `AGENTS.md` was found. `README.md` remains starter-level and does not describe the current product. `docs/prd.md`, operational manuals, historical `qa-audit/` material, Firebase rules, and current code were compared; code and rules are authoritative where they differ.

## Major feature inventory

| # | Feature family | Sub-features and user workflows | Primary surfaces |
|---:|---|---|---|
| 1 | Marketing, legal, audience, sport landing | Homepage pricing/demo/contact/newsletter; audience campaigns; sports index/detail; beta/referral; terms/privacy/safety/how-to | `/`, `/for/[audience]`, `/sports`, `/sports/[sport]`, `/beta`, `/refer-a-coach`, `/terms`, `/privacy`, `/safety`, `/how-to` |
| 2 | Authentication, sessions, account lifecycle | Email/password login; forgot/reset; session cookie exchange/revocation; logout; protected deep links; account disable, pending deletion, seven-day purge | `/login`, `/api/auth/session`, `/api/email/reset-password`, `/api/account/deletion-request` |
| 3 | Signup, onboarding, verification, demos | Role/plan signup; email verification; youth invite signup; profile onboarding; anonymous role demos; demo exit/cleanup | `/signup`, `/signup/youth`, `/verify-email`, `/onboarding`, `/api/demo/seed`, `/api/demo/exit` |
| 4 | Dashboard, navigation, alerts, team context | Role/plan route policy; desktop/mobile nav; active-team switcher; no-team/quota/restricted states; alerts history; billing entry | `/dashboard`, `/dashboard/billing`, shared dashboard layout and Shell |
| 5 | Teams and settings | Create team; join code; active-team switching; plan-seat allocation; module flags; branding/profile; notification settings; seasonal reset; team deletion | `/teams/new`, `/teams/join`, `/team`, `/settings`, team APIs |
| 6 | Club, school, organization | Institution overview; squad allocation/deallocation; global waivers; club documents; school admins; hub communications | `/club`, `/api/organizations/*`, `/api/schools/admins` |
| 7 | Roster, membership, guardians, attendance | Member CRUD/archive/reinstate; role/position; child/player links; parent access; invites; notes; fees; exports; attendance | `/roster`, `/coaches-corner/attendance`, youth/team membership APIs |
| 8 | Recruiting | Recruiting profile/metrics/stats/evaluations/contact/videos; enable public profile; public DTO; PDF/video downloads | Coaches Corner recruiting tabs, `/recruit/player/[playerId]`, public recruiting API |
| 9 | Events, schedules, calendar, RSVP, reminders, ICS | Event CRUD; recurrence; details; RSVP/attendance; team/family calendar; schedule generation/deployment; ICS feed; FCM reminders | `/events`, `/calendar`, `/schedule-app`, schedule/event/calendar APIs |
| 10 | Practice, drills, playbooks, video | Practice plans/templates; drill CRUD; film archive/upload; watch requirements; comments; coach marks; attendance | `/practice`, `/drills`, Coaches Corner, PlaybookPanel |
| 11 | Feed, chat, comments, polls | Posts, media, comments, parent controls, group channels, messages, polls/votes, moderation, unread state | `/feed`, `/chats`, `/chats/[chatId]`, team feed/chat APIs |
| 12 | Email, newsletters, push | Transactional email; admin newsletter; Sports Hub newsletter; unsubscribe; Resend delivery ledger; device registration; targeted push; reminder preferences | Email/newsletter/notify APIs; admin managers; Settings |
| 13 | Files and uploads | Team library; upload/download/delete; private/public access; avatar/player/video/branding storage paths; email export | `/files`, Storage rules, EmailExportDialog |
| 14 | Waivers, forms, signatures, compliance | Team/global/tournament waivers; coach/player/guardian signatures; registration form builders; archived waivers; compliance reports | `/files`, Coaches Corner, league/tournament registration and waiver portals |
| 15 | Safety and incidents | Event safety panel; incident create/read/aggregate; emergency/treatment/witness data; organization oversight | Coaches Corner incident UI, `/safety`, club incident surfaces |
| 16 | Games and scorekeeping | Team games; standings/brackets; score entry, disputes, audit; PIN-protected public scoring | `/games`, league/tournament scorekeeper routes and APIs |
| 17 | Leagues | Create/clone/edit/delete; divisions; team assignment; schedule generation/deployment; forms; public spectator; player/team registration | `/leagues`, `/competition`, league APIs and public portals |
| 18 | Tournaments | Series wizard; formats/pools/brackets; venue/time windows; schedule deployment; referee assignment; archive/delete/replicate; registration/waiver/spectator | `/manage-tournaments`, `/tournaments`, tournament APIs and portals |
| 19 | Family Hub | Household children; team invites; combined calendar; payments/balances; pending waivers; child login upgrade | `/family`, `/family/payments` |
| 20 | Plans and subscriptions | Pricing; checkout; monthly/annual plans; trials; upgrades/downgrades; extra squads; cancellation/reactivation/sync; portal; entitlement/quota | `/pricing`, `/dashboard/billing`, checkout/subscription APIs |
| 21 | Stripe Connect and payments | Connect onboarding/status; payment items; public payment links; offline payment verification; household payment history | Finance components; Stripe Connect/payment APIs |
| 22 | Fundraising and donations | Campaign CRUD; Connect link; public campaign projection; donation intent/submission; offline reconciliation | `/fundraising`, public donation route, fundraising APIs |
| 23 | Volunteers | Opportunity CRUD; public signup; capacity; completion/attendance confirmation; notification | `/volunteers`, `/public/volunteer/[teamId]/[oppId]`, volunteer APIs |
| 24 | Facilities and fields | Facility/field CRUD; enrollment; availability; venue selection; rename; conflict-aware deletion | `/facilities`, facility APIs |
| 25 | Equipment | Inventory CRUD; quantity; assignment/return; accountability emails; deletion | `/equipment` |
| 26 | Sports Hub | Articles/categories/search/bookmarks/preferences; RSS feeds/refresh; resources/templates; PDFs; videos; newsletter | `/sports-hub/**`, admin Sports Hub APIs |
| 27 | Public and embedded portals | Squad/event/league/tournament registration; spectator; volunteer; donation; recruiting; newsletter/signup/sports/squad embeds | `/register/**`, `/events/register/**`, `/embed/**`, public APIs |
| 28 | Platform administration | User directory; claims/entitlements/account control; plans/features; beta applications/notifications; bug reports; newsletters; embeds; Sports Hub admin | `/admin`, `/admin/plans`, admin APIs |
| 29 | PWA, offline companion, Time Out | Manifest/service worker; notification worker registration; local schedule/todo companion; offline sync; local Time Out game | `public/manifest.json`, `public/sw.js`, `/schedule-app`, TimeOut components |
| 30 | Webhooks, background processing, health, operations | Stripe/Connect/Resend webhooks; idempotency ledgers; public league projection triggers; deletion purge; demo cleanup; reminders; health; CI/deploy/backup/alerts | Webhook APIs, `functions/src`, `/api/health`, workflows/runbooks |

## Page and route inventory

### Authenticated dashboard routes

| Domain | Routes |
|---|---|
| Core | `/dashboard`, `/dashboard/billing`, `/pricing`, `/settings`, `/team` |
| Team operations | `/feed`, `/events`, `/calendar`, `/roster`, `/practice`, `/drills`, `/games`, `/files`, `/chats`, `/chats/[chatId]` |
| Extended team operations | `/coaches-corner`, `/coaches-corner/attendance`, `/fundraising`, `/volunteers`, `/facilities`, `/equipment` |
| Institution/competition | `/club`, `/competition`, `/leagues`, `/leagues/registration/[leagueId]`, `/manage-tournaments`, `/manage-tournaments/registration/[teamId]/[eventId]`, `/tournaments` |
| Membership | `/teams/new`, `/teams/join`, `/family`, `/family/payments` |
| Platform administration | `/admin`, `/admin/plans` |

`dashboard-route-policy.ts` protects exact and prefix routes. Sensitive paths additionally trigger revoked-session checks. Client-side hidden navigation is not considered authorization; Phase 2 must directly request restricted URLs and APIs.

### Public/account routes

| Domain | Routes |
|---|---|
| Marketing/legal | `/`, `/beta`, `/for/[audience]`, `/sports`, `/sports/[sport]`, `/refer-a-coach`, `/how-to`, `/safety`, `/terms`, `/privacy` |
| Identity | `/login`, `/signup`, `/signup/youth`, `/verify-email`, `/onboarding` |
| Sports Hub | `/sports-hub`, `/sports-hub/news`, `/sports-hub/coaching`, `/sports-hub/team-management`, `/sports-hub/tournaments`, `/sports-hub/resources`, `/sports-hub/resources/[id]`, `/sports-hub/playbook`, `/sports-hub/featured`, `/sports-hub/search`, `/sports-hub/preferences`, `/sports-hub/articles/[slug]`, `/sports-hub/templates`, `/sports-hub/templates/[slug]`, `/sports-hub/parents`, `/sports-hub/youth` |
| League public | `/register/league/[leagueId]`, `/leagues/spectator/[leagueId]`, `/leagues/scorekeeper/[leagueId]`, `/leagues/scorekeeper/[leagueId]/[gameId]` |
| Tournament public | `/register/tournament/[teamId]/[eventId]`, `/tournaments/public/[teamId]/[eventId]`, `/tournaments/spectator/[teamId]/[eventId]`, `/tournaments/referee/[teamId]/[eventId]`, `/tournaments/scorekeeper/[teamId]/[eventId]`, `/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]`, `/tournaments/[teamId]/waiver/[eventId]` |
| Other portals | `/register/squad/[teamId]`, `/events/register/[teamId]`, `/public/donate/[teamId]/[fundId]`, `/public/volunteer/[teamId]/[oppId]`, `/recruit/player/[playerId]` |
| Embeds/companion | `/embed/links`, `/embed/newsletter`, `/embed/signup`, `/embed/sports-hub`, `/embed/squad-hub`, `/schedule-app` |

## API inventory

| Domain | Endpoints |
|---|---|
| Session/account | `/api/auth/session`, `/api/account/deletion-request`, `/api/admin/users/[uid]/account-control`, `/api/admin/users/[uid]/entitlement` |
| Signup/invites/teams | `/api/invites/youth`, `/api/youth-invites`, `/api/teams/create`, `/api/teams/join`, `/api/teams/allocate-pro`, `/api/teams/resolve-quota`, `/api/teams/parent-access`, `/api/teams/repair-player-links` |
| Team activity | `/api/teams/events/action`, `/api/teams/games`, `/api/teams/rsvp`, `/api/teams/feed/action`, `/api/teams/chat`, `/api/teams/chat/message`, `/api/teams/chat/vote`, `/api/teams/waivers/sign`, `/api/teams/volunteers/verify` |
| Organization | `/api/organizations/squads`, `/api/organizations/waivers`, `/api/schools/admins`, `/api/facilities/update`, `/api/facilities/delete` |
| League/tournament | `/api/leagues/create`, `/api/leagues/clone`, `/api/leagues/schedule`, `/api/leagues/assignments`, `/api/tournaments/schedule`, `/api/tournaments/resolve` |
| Billing | `/api/checkout`, `/api/stripe/create-checkout`, `/api/stripe/customer-portal`, `/api/subscription/addon`, `/api/subscription/update`, `/api/subscription/cancel`, `/api/subscription/sync` |
| Connect/payment | `/api/stripe/connect/onboard`, `/api/stripe/connect/status`, `/api/stripe/connect/webhook`, `/api/stripe/payment-items`, `/api/stripe/fundraising-link`, `/api/payments/offline` |
| Public portals | `/api/public/portals`, `/api/public/portals/action`, `/api/public/submissions`, `/api/public/event-registration`, `/api/public/fundraising`, `/api/public/donations`, `/api/public/volunteer`, `/api/public/recruiting/[playerId]`, `/api/public/tournaments/[teamId]/[eventId]`, `/api/public/notify-admin` |
| Email/notifications | `/api/email/send`, `/api/email/welcome`, `/api/email/verify-email`, `/api/email/reset-password`, `/api/notify`, `/api/notifications/device`, `/api/referrals/coach` |
| Newsletters/content | `/api/newsletter/subscribe`, `/api/newsletter/unsubscribe`, `/api/admin/newsletter`, `/api/admin/newsletter/send`, `/api/admin/newsletter/welcome`, `/api/sports-hub/articles`, `/api/sports-hub/newsletter`, `/api/sports-hub/rss`, `/api/sports-hub/rss-refresh`, `/api/admin/sports-hub` |
| Webhooks/operations | `/api/webhook`, `/api/webhooks/resend`, `/api/calendar/feed`, `/api/health`, `/api/demo/seed`, `/api/demo/exit` |

The legacy `/api/teams/volunteers/verify` handler intentionally returns HTTP 410 because reward points were retired; volunteer attendance confirmation is the replacement workflow.

## Data and authorization inventory

Primary roots include `users`, `teams`, `players`, `leagues`, `tournaments`, `clubs`, `facilities`, `plans`, `subscriptions`, `calendarFeeds`, public projections, notification/email ledgers, webhook ledgers, and administrative collections. Team-scoped subcollections include members, events, games, feed posts, chats/messages, files/documents, drills/videos, incidents, fundraising/donations, volunteers, payments/payment items, registrations, waivers/signatures, and score audit data.

Authorization is distributed across:

- Firebase custom claims and verified ID tokens.
- Revocation-checked `__session` cookies on sensitive dashboard paths.
- global user profile role and account/subscription state.
- team ownership, direct or linked membership, position-derived staff authority, and parent/player linkage.
- server-side ownership checks in API handlers.
- Firestore and Storage rules for direct client access.
- public DTO/projection allowlists.

Phase 2 must test all layers because UI visibility does not prove backend denial.

## Forms, dialogs, tables, search, filter, and exports

The code contains forms for signup/login/onboarding; team/league/tournament creation; team/league/tournament/event registration; event and RSVP management; roster/member/parent access; facilities/fields; fundraising/donation; volunteer signup; beta/contact/referral/newsletter; waiver signing; incident reporting; recruiting profiles; admin composition; and embedded signup/newsletter panels.

High-density dialog/modal surfaces exist in dashboard, event, league, tournament, roster, practice, files, feed/chat, club, family, finance, fundraising, volunteer, facility, equipment, settings, recruiting, and administration pages. Search/filter/sort controls exist in roster, league/tournament ledgers, schedules/calendars, Sports Hub content, recruiting, newsletters/users, chats, facilities/equipment, and public content. Download/export workflows include roster/email/PDF, schedules/standings, Sports Hub resources, recruiting assets, ICS feeds, and public/media files.

## Integrations and background processes

| Integration/process | Purpose | Phase 2 dependency |
|---|---|---|
| Firebase Auth | registered, invited, claim-controlled, and anonymous identities | Isolated project and disposable accounts |
| Firestore/Storage | tenant data and uploads | Emulators plus isolated hosted environment |
| Stripe | checkout/subscriptions/add-ons/portal/webhook | Test-mode prices, customers, clocks/cards |
| Stripe Connect | connected account onboarding/payment links/webhook | Test Express account; no real payout |
| Resend | transactional/admin/newsletter email and delivery webhooks | Approved QA domain/mailboxes or safe sink |
| FCM | device notifications and reminders | Real browser/device permission in staging |
| RSS | Sports Hub feed refresh and external fetch | Controlled feeds and network inspection |
| ICS | tokenized live calendar subscriptions | Synthetic member and revoked-access fixtures |
| Cloud Functions | projections, invite redemption, cleanup, deletion, reminders | Emulator/isolated project plus scheduler evidence |
| GitHub/Vercel/Firebase | CI, release gate, staging/production deploy | Read-only evidence unless separately authorized |

## Feature flags, retired, incomplete, and special behavior

- Team module flags can disable feed, roster, practice, playbook, volunteers, fundraising, tactical chat, and library; routes must redirect when disabled.
- Google sign-in is visibly marked temporarily disabled on the login page even though historical documentation describes OAuth support.
- Homepage signup CTAs include “Signup Coming Soon” states that must be reconciled with the active signup route.
- League online registration payments are labeled coming soon; payment instructions currently support offline directions.
- League Division Architect contains an explicit Coming Soon overlay.
- Volunteer reward-point verification is retired and returns HTTP 410.
- Demo data intentionally includes mock opponents and placeholder identities; these must never be mistaken for production records.
- Source-root maintenance scripts (`transform_admin.js`, `transform_beta.js`, `rewrite_modal.js`, `test_link.js`) and generated Functions output require repository-hygiene review but are not user-facing features.
- Generated TestSprite scripts use brittle recorded selectors and are not part of CI.
- `.env.local` exists; its values were not printed or copied into audit documentation.

## Existing automated coverage

Current tests cover significant policy, scheduler, public DTO, webhook, subscription, rules, upload, and regression behavior. They do not replace real-browser validation of role journeys, responsive behavior, console/network failures, provider delivery, cross-device state, or exhaustive identifier tampering. Phase 2 begins with a fresh baseline run and records current totals rather than relying on historical counts.
