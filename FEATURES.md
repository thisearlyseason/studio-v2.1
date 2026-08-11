# The Squad — Complete Feature Catalog

Last reconciled: 2026-08-09

This file is the canonical, product-level inventory of features currently represented in The Squad codebase. It combines the implemented application surfaces, public portals, account and subscription rules, operational documentation, and recently shipped updates that were previously spread across several files.

## How to maintain this catalog

- Add every newly shipped feature to the relevant section below.
- Add a dated entry to **Recent shipped updates** for meaningful releases, migrations, or user-visible fixes.
- Update plan limits, roles, public routes, and feature gates whenever their source configuration changes.
- Describe shipped behavior in the present tense. Put planned or incomplete work in **Planned or separately tracked work**, not in the current feature list.
- Keep technical implementation details brief; this is a product inventory, not an API reference.

## Product overview

The Squad is a responsive sports-operations platform for individual teams, multi-team clubs, schools, leagues, tournaments, athletes, and families. It combines organization oversight with day-to-day roster, schedule, communication, competition, compliance, finance, fundraising, facility, and player-development workflows.

## Supported account types and access models

- **Parent or guardian** — manages linked children, family schedules, waivers, payments, and team access.
- **Adult player** — manages their own athlete identity and participates in team operations.
- **Youth player** — joins through a controlled, single-use youth invitation linked to a guardian or team.
- **Coach or team organizer** — creates and runs squads, schedules, rosters, communications, and tactical content.
- **School or club administrator** — oversees an institution and its associated squads.
- **League organizer** — creates and operates leagues, registrations, schedules, standings, and public competition views.
- **Platform administrator** — claim-controlled global administration with no public signup path.
- **Demo persona** — anonymous, session-isolated coach, administrator, league, parent, or player workspace.

Team-local authority is separate from a user's global account type. Team owners, administrators, coaches, assistant coaches, managers, staff, athletic directors, parents, guardians, players, and ordinary members receive capabilities according to ownership, membership, position, verification, subscription, and tenant scope.

## Authentication, identity, and account lifecycle

- Email and password account creation and login.
- Google authentication.
- Email verification and verification-gated protected access.
- Password-reset requests and branded reset email delivery.
- Server-backed authenticated sessions.
- Role-aware signup and onboarding.
- Youth invitation signup and account linking.
- Profile management for name, email, phone, avatar, role, and organization context.
- Multi-team membership and active-squad switching.
- Missing-profile and missing-membership fail-closed behavior.
- Suspended, disabled, pending-deletion, and deleted account states.
- Account deletion requests with a delayed purge lifecycle.
- Administrative account controls, including privileged suspension or deletion handling.
- Anonymous demo authentication isolated from real customer workspaces.

## Dashboards and navigation

- Responsive desktop and phone layouts.
- Role-aware dashboards for coaches, administrators, players, parents, and league organizers.
- Active-squad switcher for users connected to multiple teams.
- Command Hub summaries for schedule, compliance, community activity, and available portals.
- Club and school overview surfaces for multi-squad leadership.
- Family Hub summaries for linked athletes.
- Guest Tactical Mode for temporary demo sessions.
- Sticky mobile navigation for Home, Schedule, Feed, Tactical Chat, Sports Hub, and additional modules.
- Global alerts and unread indicators.

## Team and organization management

- Create a squad with server-controlled ownership and entitlements.
- Generate and use team join codes.
- Join an existing squad with server-derived member position.
- Edit squad identity, description, sport, branding, logo, and hero imagery.
- View and manage team information from a dedicated team workspace.
- Multi-team club and school structures.
- Master club or school hub with connected squad oversight.
- Staff role assignment and team-local permission handling.
- Parent communication-access controls.
- Team capacity and paid-seat enforcement.
- Additional paid squad allocation for eligible subscriptions.
- Repair tools for player-to-user links.
- Safe quota resolution when subscriptions or team allocations change.
- Email/contact export for roster communications.
- Under-18 guardian-link guidance during roster operations.

## Roster, athlete, and recruiting management

- Team roster with member profiles, positions, jersey numbers, and membership status.
- Add current players, staff, and prospective recruits.
- Coach-controlled roster limits and full-roster blocking.
- Player profile editing within role and ownership boundaries.
- Minor athlete records linked to guardians.
- Athlete identity upgrade that gives an eligible linked player their own login.
- Academic and biographical athlete information.
- Sport-specific performance metrics and development notes.
- Recruiting pipeline states such as active prospect, committed, and private.
- Athlete film and highlight library.
- Public recruiting portfolio at a shareable athlete URL.
- Recruiting-ready player profile and performance presentation.
- Personnel and prospect pools for league workflows.
- Eligibility, waiver, and compliance visibility alongside roster data.

## Scheduling, calendars, events, and availability

- Create, view, update, and remove games, practices, meetings, tournaments, and other events.
- List and calendar schedule views.
- Team, participant, opponent, location, date, time, and description assignment.
- Multi-team and multi-child schedule aggregation.
- RSVP responses: Going, Not Going, or Maybe.
- Member unavailability tracking for planning.
- Team-member-aware event actions and server-side authorization.
- Timezone-aware date and time handling.
- Calendar subscription feed for external calendar applications.
- Event reminders and operational notifications.
- Weather context for applicable event views.
- Drill and tactical itinerary attachment to practices.
- Branded tactical-plan and event-briefing PDF exports.
- Dedicated schedule companion view at `/schedule-app`.

## Practices, drills, playbooks, film, and attendance

- Drill library with custom drill publishing.
- Drill titles, categories, descriptions, coaching cues, and diagrams.
- YouTube, Vimeo, image, and uploaded media support.
- Automatic image optimization for large tactical assets.
- Practice construction from selected playbook drills.
- Reusable tactical plans and drill groupings.
- Game tape, practice session, and highlight-film categories.
- Timestamped coaching annotations on video.
- Seek directly to a coaching marker in supported video players.
- Staff attribution on coaching feedback.
- Mandatory-watch assignments.
- 75% film-watch compliance tracking.
- Roster-level watch-completion visibility.
- Attendance management from Coaches Corner.
- Practice-focused schedule and workflow surface.
- Coach resources, analytics, and institutional tactical tools.

## Team feed, chat, broadcasts, polls, and notifications

- Team-specific activity feed.
- Member-created text and image posts.
- Event-linked and system-generated feed posts.
- Feed comments with author and administrator moderation.
- Real-time group channels for team coordination.
- Dedicated main-team and coaching-staff channels.
- Secure server-authorized message creation.
- Image attachments in chat.
- Chat polls with multiple options, one current vote per member, vote changes, and live counts.
- AI-assisted poll-question and option suggestions where enabled.
- Channel creation, renaming, membership views, and deletion controls.
- Parent-to-parent chat, parent live-feed, and parent-comment access settings.
- Team and organization broadcasts.
- High-priority squad alerts with acknowledgement.
- In-app notification center and unread counts.
- Device notification registration.
- Notifications for messages, posts, events, reminders, mentions, polls, and compliance actions.

## Files, waivers, compliance, and safety

- Shared team file library.
- PDF, JPG, and PNG file support with size and authorization controls.
- Team, athlete, and organization waiver management.
- Digital waiver signing through server-authorized endpoints.
- Guardian execution of minor-athlete documents.
- Required and optional document tracking.
- Organization-wide signature and compliance audits.
- Global mandate and protocol deployment across squads.
- High-priority compliance reminders.
- Incident and injury reporting.
- Incident severity, context, participants, treatment, evidence, and timestamps.
- Branded safety and incident PDF exports.
- Public safety-information page.
- Tenant-scoped Firestore and Storage access controls.

## Games and competition operations

- Game ledger and match records.
- Team and opponent assignment.
- Match result and score management.
- Competition overview surface.
- Game-specific statistics and operational context.
- Match calendar integration.
- Public and staff competition views where enabled.

## League management

- Server-authorized league creation.
- League settings, rules, teams, seasons, and organizer controls.
- Private league registration and enrollment workflows.
- Registration entries and waiver-verification status.
- Season start and end dates.
- Configurable active play days and daily match windows.
- Round-robin scheduling.
- Double-elimination scheduling support.
- Match duration, break duration, and games-per-team configuration.
- Double-header options.
- Blackout dates.
- Venue, field, and court allocation.
- Match ledger and interactive calendar views.
- Live standings, wins, losses, and points.
- Mobile scorekeeper portal.
- Public spectator portal.
- Public standings and schedule projections that avoid exposing tenant-only data.
- League recruiting/personnel pool.

## Tournament management

- Create and manage single-day or multi-day tournaments.
- Configure tournament name, date range, format, rules, and participating teams.
- Registration links and public tournament registration.
- Registration fees and required forms.
- Tournament-specific waiver execution.
- Generated brackets and tournament-series views.
- Round-robin, elimination, and multi-stage competition support represented in tournament operations.
- Match scheduling and venue assignment.
- Scorekeeper portal for tournament games.
- Referee portal.
- Spectator portal with public schedules, brackets, and results.
- Live bracket and standings updates.
- Tournament registration and operational status controls.
- Printable or archived bracket output.

## Family and guardian features

- Add and manage multiple linked children.
- Child profile, team, eligibility, and urgent-action summaries.
- Select a primary family or team context.
- Consolidated multi-child itinerary.
- Combined league and tournament visibility.
- Family-level waiver and compliance tasks.
- Parent access to permitted team feeds and chat channels.
- Guardian-controlled youth invitations and login enablement.
- Unified household payment history and outstanding balances.
- Downloadable offline-payment records.
- Family-specific demo environment.

## Billing, subscriptions, and payments

- Stripe-hosted subscription checkout.
- Monthly and annual billing cycles.
- Stripe customer billing portal.
- Subscription upgrades, downgrades, cancellation, synchronization, and webhook reconciliation.
- Entitlement enforcement based on authoritative subscription status.
- Paid-seat assignment to eligible squads.
- Extra-team subscription add-ons.
- Stripe Connect onboarding for team and organization payment collection.
- Stripe Connect account-status monitoring.
- Shared organization account or per-squad account configuration where authorized.
- Payment-item creation for league fees, tournament fees, equipment, and other charges.
- Shareable payment links.
- Team dues and household payment tracking.
- Offline payment recording.
- Downloadable payment-record PDFs.
- Payment and finance administrator roles.
- Demo workspaces blocked from live external billing.

### Current plans and base squad capacity

| Plan | Base capacity | Primary use |
|---|---:|---|
| Free | 1 squad | Starter team workspace |
| Pro Team | 1 Pro squad | A single competitive team |
| Elite Teams | 8 Pro squads | A growing multi-team club |
| Elite League | 18 Pro squads | League and series operations |
| Schools | 15 Pro squads | K–12 athletic-department management |

Eligible paid accounts can add extra squads. Active and trialing subscriptions are entitled; unresolved, unpaid, paused, incomplete, or canceled subscriptions do not grant trusted paid access.

## Fundraising and donations

- Create and manage team fundraising campaigns.
- Campaign goals, descriptions, status, and progress tracking.
- Donation audit ledger.
- Manual, e-transfer, bank-transfer, cash, and external donation records.
- Stripe-generated fundraising links.
- Public donation portal.
- Public donation submission endpoint with server validation.
- Campaign revenue and contribution summaries.
- Family and athlete access to share or support campaigns.

## Volunteers

- Create team or event volunteer opportunities.
- Configure dates, locations, shifts, capacity, hours, and points.
- Member signup and assignment tracking.
- Shareable public volunteer portal.
- Server-side volunteer verification.
- Volunteer status and operational summaries.

## Facilities and equipment

- Venue enrollment and management.
- Fields, courts, rooms, and other nested facility resources.
- Availability and booking workflows.
- Assign a purpose, time, and attendees to a booking.
- Server-authorized facility updates and deletion.
- Facility use in league and tournament scheduling.
- Equipment inventory by category and quantity.
- Equipment assignment and deployment tracking.
- Team and organization equipment-management views.

## Sports Hub and educational content

- Public Sports Hub landing page.
- Featured, coaching, parent, youth, tournament, team-management, playbook, and news sections.
- Search across Sports Hub content.
- Content preferences.
- Individual article pages with metadata and sharing support.
- Resource library with plans, drills, checklists, guides, and operational templates.
- Downloadable and interactive templates, including season planning, practice planning, game-day checklists, roster contacts, parent communication, incident reporting, tournament run sheets, and athlete performance tracking.
- Curated external RSS sources for coaching, sports medicine, youth sports, performance, and administration.
- Server-managed Sports Hub articles and newsletter content.
- Sports Hub newsletter signup and unsubscribe flows.
- Expanded in-repository article and resource libraries.

## Public portals and registration

- Public squad registration page.
- Public league registration page.
- Public tournament registration page.
- Public event registration page.
- Public tournament waiver page.
- Public donation page.
- Public volunteer page.
- Public recruiting profile.
- League scorekeeper and spectator portals.
- Tournament scorekeeper, referee, spectator, and public-information portals.
- Server-produced public portal projections that separate public data from tenant-private records.
- Configurable public forms and submissions.
- Public portal actions with server validation.

## Marketing, discovery, and embedded experiences

- Product landing page with feature, audience, comparison, pricing, demo, contact, and newsletter sections.
- Audience-specific landing pages for parents, coaches, leagues, tournaments, schools, and municipalities.
- Sport directory and sport-specific landing pages for:
  - Soccer
  - Basketball
  - Baseball
  - Rugby
  - Football
  - Cornhole
  - Gymnastics
  - Pickleball
  - Tennis
  - Golf
  - Swimming
  - Esports
  - Ultimate Frisbee
  - Disc Golf
- Sport-specific imagery, copy, registration positioning, and pricing links.
- Refer-a-coach flow.
- Contact and newsletter forms.
- All-in-one public link hub.
- Embeddable newsletter, signup, Sports Hub, and Squad Hub cards.
- Privacy, terms, safety, and how-to pages.
- Search-engine metadata, sitemaps, structured coverage, and social-sharing metadata.
- Meta Pixel integration.

## Demo environments

- Starter Squad demo.
- Pro Team demo.
- Elite multi-team organization demo.
- School/athletic-department demo.
- Parent/family demo.
- Player demo.
- League-organizer demo.
- Anonymous guest authentication.
- Deterministic teams, members, leagues, schedules, practices, tournaments, standings, chats, messages, waivers, payments, fundraising, volunteers, and alerts.
- Trusted server creation for protected demo records.
- Session-owned data isolation between demo users.
- Automatic demo cleanup and retry handling.
- Temporary Guest Tactical Mode with visible session expiration.

## Administration and platform operations

- Claim-protected platform administration.
- User and account lifecycle controls.
- Subscription and plan administration surfaces.
- Newsletter management and broadcast delivery.
- Sports Hub content administration.
- Public embed and campaign-link management.
- Health endpoint exposing service status and deployed revision.
- Email delivery and webhook handling.
- Stripe and Resend webhook processing.
- Scheduled notification and operational jobs.
- Environment-specific production, preview, and isolated staging configuration.

## Security, privacy, reliability, and accessibility

- Firebase Authentication with verified-token server checks.
- Role-, ownership-, membership-, tenant-, and plan-aware Firestore rules.
- Storage rules for authorized file and media access.
- Server-only boundaries for privileged creation and financial actions.
- Cross-tenant and cross-demo isolation.
- Server-derived team roles on join flows.
- Revoked-token checks for sensitive operations.
- Public/private data projection boundaries.
- Idempotent subscription and webhook handling.
- Production health and revision monitoring.
- Automated application, dependency, Firebase rule, and function-build release checks.
- Responsive phone and desktop interfaces.
- Keyboard, dialog, form-label, focus, and screen-reader accessibility improvements.
- Error boundaries and user-facing recovery states.
- Login timeout and stalled-auth recovery.
- Production and staging deployment safeguards.

## Recent shipped updates

### 2026-08-09 — Demo reliability and protected seeding

- Fixed demo environment synchronization under production Firestore rules.
- Preserved server-created demo league shells during client-side cleanup.
- Server-created protected league records for every applicable demo persona, including parent scenarios.
- Moved deterministic demo chat-message creation behind the trusted seed API.
- Removed protected direct browser writes for demo messages.
- Standardized server-seeded chat timestamps to the ISO format consumed by the chat UI.
- Verified the Elite organization demo and Tactical Chat at a 390 × 844 phone viewport with zero browser errors or warnings.

### 2026-08-08 — Sports discovery and content expansion

- Added sport-specific promotional landing pages and navigation links.
- Added dedicated imagery and copy for each supported sport landing page.
- Corrected public sport-page pricing links.
- Expanded Sports Hub article and resource libraries.
- Added broader Sports Hub resource categories, templates, and discovery surfaces.
- Completed additional production-readiness and SEO coverage.
- Recorded post-deployment certification.

### 2026-08-07 — Release, authentication, and environment hardening

- Fixed login flows that could remain indefinitely on a loading spinner.
- Added stalled-auth timeout and recovery behavior.
- Hardened public flows, client writes, and protected portal access.
- Improved dashboard accessibility and modal behavior.
- Added isolated staging runtime configuration.
- Made staging function deployment idempotent.
- Reconciled scheduled function triggers.
- Updated GitHub Actions runtimes and production release safeguards.

## Related documentation

- `Tactical_User_Manual.md` — role-based usage instructions.
- `docs/operational_manual.md` — institutional operating procedures.
- `docs/prd.md` — product requirements and original feature definitions.
- `docs/AI_KNOWLEDGE_BASE.md` — technical architecture and module knowledge.
- `qa-audit/ROLE_PERMISSION_MATRIX.md` — role and authorization audit.
- `qa-audit/accounts/ACCOUNT_TYPE_INVENTORY.md` — account types, states, and subscription inventory.
- `qa-audit/API_ENDPOINT_INVENTORY.md` — server endpoint inventory.

## Planned or separately tracked work

Items that exist only as ideas, incomplete designs, audit findings, or future requirements should remain in the PRD, issue tracker, or QA reports until shipped. They should be added to the current sections of this file only after implementation and verification.
