# Risk Register

**Phase:** Discovery and planning only\\
**Status:** Risk classifications guide testing priority; they are not defect findings.

## Classification

- **CRITICAL:** plausible failure can expose protected data, grant authority/entitlement, corrupt financial/legal records, or make the core product unusable.
- **HIGH:** failure materially blocks an important workflow, corrupts tenant state, or creates significant operational/reputational impact.
- **MEDIUM:** bounded feature failure with a workaround or limited blast radius.
- **LOW:** cosmetic, informational, or low-impact isolated behavior.

## Register

| ID | Area | Risk | Why it deserves testing | Required evidence |
|---|---|---:|---|---|
| R-01 | Authentication and session lifecycle | CRITICAL | The app mixes Firebase ID tokens, server session cookies, email verification, revocation checks, anonymous demos, and sensitive-route policy. A stale/revoked/mismatched session can expose all private surfaces. | Signup/login/logout/deep-link/reset; revoked/expired/wrong-project tokens; unverified/disabled/pending-delete states; refresh/back/multi-tab |
| R-02 | Horizontal tenant isolation | CRITICAL | Team, league, tournament, club, player, facility, chat, file, payment, and registration IDs are client-visible. One missing ownership check can expose another organization. | Two-tenant ID substitution at UI/API/Firestore/Storage for every mutation family; no metadata disclosure |
| R-03 | Vertical role escalation | CRITICAL | Authority is derived from global role, custom claim, ownership, membership role, and free-text staff positions. Client manipulation must not create staff, owner, superadmin, or billing authority. | Role/position/owner/claim tampering; owner versus staff matrix; direct-write denials |
| R-04 | Athlete, guardian, medical, and recruiting privacy | CRITICAL | Minors and household data include DOB, contacts, guardianship, evaluations, incidents, videos, fees, and signatures. Public recruiting projections and sibling relationships increase disclosure risk. | Public DTO allowlists; guardian/sibling/coach/outsider cases; private subcollection and asset denials |
| R-05 | Subscription entitlements and team quotas | CRITICAL | Provider events control paid capabilities and squad capacity. Duplicate, delayed, failed, deleted-customer, or forged state can grant service without payment or lock paying customers out. | Complete Stripe test lifecycle; canonical price checks; webhook replay/out-of-order; seat concurrency; recovery |
| R-06 | Stripe Connect, payment items, and financial ledgers | CRITICAL | Connected-account ownership, payment links, offline verification, refunds/disputes, and household balances cross provider and Firestore state. Errors can misdirect or misstate money. | Test-mode onboarding and payment; wrong account/amount/team; idempotency; reconciliation; audit retention |
| R-07 | Waivers and legal signatures | CRITICAL | Signatures must bind the correct person, child, team/event, legal text, and date. Mutable or cross-tenant signatures undermine compliance records. | Exact-text/version binding; signer authority; replay/wrong-child/wrong-event/direct-write; immutability/audit |
| R-08 | Account deletion and ownership safety | CRITICAL | Scheduled purge touches Auth, profiles, players, memberships, storage, maps, arrays, and caches while retaining financial audit records. Partial deletion or owner purge can orphan tenants or leak identity. | Retention-state transitions; retry/idempotency; owner block; dependent child handling; retained/excluded records; other-tenant integrity |
| R-09 | File and media access | CRITICAL | Storage paths cover player recruiting assets, avatars, videos, branding, and team files. Download URLs, MIME spoofing, public toggles, and deletion can bypass document rules. | Storage emulator and hosted URL tests; MIME/size/path manipulation; public/private transitions; revoked/deleted access |
| R-10 | Public portals and DTOs | CRITICAL | Registration, donation, volunteer, recruiting, scoring, spectator, embed, and newsletter endpoints intentionally allow anonymous access. Validation or projection errors can leak or mutate private records. | Published/unpublished/invalid IDs; allowlists; body/rate limits; duplicate submissions; SSRF/safe URL; enumeration |
| R-11 | League/tournament scoring and bracket integrity | CRITICAL | Concurrent scoring, disputes, PIN/code access, bracket advancement, public standings, replication, archival, and scheduling are tightly coupled. Corruption materially invalidates competition. | Format matrix; score concurrency/replay; downstream completion guards; canonical standings; dispute/audit; public sync |
| R-12 | Team creation/join/membership caches | HIGH | Creation limits, join-derived positions, linked users/players, league member caches, and removal must update atomically enough to prevent ghost access or quota bypass. | Concurrent create/join; partial failure; cache update/removal; removed member direct access; owner invariants |
| R-13 | Events, time zones, recurrence, RSVP, and reminders | HIGH | Local dates, DST, recurrence, calendar feeds, and a 15-minute reminder scheduler can shift events, duplicate notifications, or notify removed users. | Time-zone/DST/boundary cases; recurrence edit/delete; RSVP race; reminder lease/retry; ICS revocation |
| R-14 | Communication audience and moderation | HIGH | Feed/chat/polls/alerts can expose private messages to parents, players, removed users, or wrong teams, and can duplicate/replay actions. | Audience matrix; module/parent controls; removed users; moderation/ownership; vote/comment replay; notification targeting |
| R-15 | Facilities and booking concurrency | HIGH | Leagues/tournaments/events share facilities/fields. Rename/delete and simultaneous booking can create dangling schedules or double booking. | Booking locks/races; rename propagation; conflict-delete; cross-organization denial; time overlap |
| R-16 | Demo isolation and cleanup | HIGH | Anonymous demos create rich data and scheduled cleanup. Seed retries, session expiry, and mock records must never cross sessions or touch live accounts. | Two concurrent demos; seed idempotency/partial failure; 15-minute cleanup; registered account exclusion |
| R-17 | Email, Resend webhooks, and unsubscribe | HIGH | Verification/reset/welcome/newsletters carry identity and action links. Enumeration, wrong origin, duplicate delivery, or forged callbacks can cause account takeover or spam. | Safe mailbox lifecycle; origin/link validation; signature/replay; recipient isolation; unsubscribe token behavior |
| R-18 | Push tokens and background reminders | HIGH | Browser permissions, service-worker races, token refresh/removal, multiple devices, and scheduler retries can miss or misdirect sensitive alerts. | First registration, denied permission, refresh/logout, multi-device, removed member, duplicate scheduler runs |
| R-19 | Safety incidents | HIGH | Incident data can be legally and medically sensitive and may need immutability. Cross-team read or participant alteration has serious impact. | Create/read/export authority; organization aggregate; immutable fields; deletion denial; audit timestamps |
| R-20 | Large client providers and page modules | HIGH | `team-provider.tsx`, Shell, dashboard layout, league/tournament pages, and Coaches Corner are large, stateful units. Cache bleed and partial loading can affect many workflows with limited isolation. | Navigation loops; team switching; slow/offline network; error boundaries; refresh/back; memory/duplicate listener checks |
| R-21 | Sports Hub RSS and external content | MEDIUM | External feeds and URLs can fail, inject unsafe content, or create duplicate/stale articles. | Controlled feed, malformed/slow/redirecting URL, sanitization, deduplication, admin authorization |
| R-22 | Responsive layout and accessibility | MEDIUM | Dense dialogs/tables and mobile navigation can make critical operations unreachable, especially at 320–390 px and keyboard-only use. | Width matrix, zoom, keyboard/focus, labels, contrast, screen-reader smoke, overflow |
| R-23 | PWA/offline companion | MEDIUM | Service-worker caching and local storage can serve stale sessions/data or lose local tasks/schedule updates. | Install/update/offline/online transitions, logout cache, storage corruption, sync conflict |
| R-24 | Retired/coming-soon/disabled behavior | MEDIUM | Google login, league payments, Division Architect, module flags, and retired volunteer rewards can advertise unsupported paths or expose direct routes. | Visible copy versus behavior; disabled direct access; HTTP 410 contract; no partial writes |
| R-25 | CI, deploy, environment, and rule drift | HIGH | Web, Functions, rules, indexes, secrets, and providers deploy through separate systems. A green app build can still ship mismatched rules or Functions. | Exact-commit CI; rules drift; Functions inventory; environment validation; staging health; rollback evidence |
| R-26 | Observability, webhooks, and retries | HIGH | Provider and scheduler failures require idempotent ledgers and actionable logs without secrets. Silent partial processing can corrupt state. | Invalid/duplicate/out-of-order callbacks; retry after partial failure; correlation IDs; secret redaction; alerting |

## Highest-priority test order

1. R-01 through R-04: identity, tenant isolation, privilege, and protected youth/family data.
2. R-05 through R-10: billing, payments, legal records, deletion, storage, and public boundaries.
3. R-11 through R-19: competition integrity, membership, scheduling, communications, providers, and safety.
4. R-20, R-25, and R-26: shared-state architecture and operational correctness.
5. Remaining MEDIUM/LOW usability and content risks after critical boundaries are stable.

## Release-blocking conditions for Phase 2

Any unauthorized read/write, role/entitlement escalation, wrong-recipient communication, cross-tenant asset access, incorrect financial state, mutable/misattributed signature, competition corruption, orphaning deletion, raw secret exposure, or unrecoverable critical-path loading failure is a release blocker. A blocker remains open until the fix has focused regression evidence plus a rerun of the affected journey and adjacent permission cases.
