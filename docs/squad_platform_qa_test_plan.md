# The Squad — Full Platform QA Test Plan
**Version:** 1.1 | **Date:** May 2026 | **Audit Completed:** May 3, 2026 | **URL:** http://localhost:9002

> ✅ **PRODUCTION READY** — All 30 sections verified. Clean production build confirmed (`npm run build` ✓).

---

## USER TYPES & SUBSCRIPTIONS

| Role | Plan | Key Traits |
|------|------|------------|
| **Starter Coach** | `free` / `starter_squad` | 1 free team, basic scheduling, no Pro features |
| **Pro Coach** | `squad_pro` / `team` | Full team features, AI, practice, playbook |
| **Elite Club Organizer** | `elite_teams` / `elite` | Multi-squad hub, club management |
| **Elite League Organizer** | `elite_league` / `league` | League + tournament creation |
| **School Athletic Director** | `school_demo` / `school` | School hub, multi-squad, compliance |
| **Parent** | (member role) | Family Hub only, sign waivers, view schedule |
| **Player** | (member role) | Family Hub, profile, limited access |
| **Super Admin** | `superadmin` claim | All access, admin panel `/admin` |

---

## SECTION 1: AUTHENTICATION & ONBOARDING

### 1.1 Public Landing Page (`/`)
- [x] Page loads with marketing content
- [x] CTA buttons navigate to `/login` and `/signup`
- [x] Pricing link works
- [x] Terms/Privacy links work

### 1.2 Sign Up (`/signup`)
- [x] Email + password signup works
- [x] Google OAuth signup works
- [x] Demo plan selector shows: Starter, Pro, Elite Teams, Elite League, School, Parent, Player
- [x] Selecting each demo plan seeds correct data
- [x] Email validation rejects invalid formats
- [x] Duplicate email shows appropriate error
- [x] After signup → redirected to `/dashboard`

### 1.3 Youth Signup (`/signup/youth`)
- [x] Parent guardian fields appear
- [x] DOB field present for age verification
- [x] Minor account linked to parent

### 1.4 Login (`/login`)
- [x] Email + password login works
- [x] Google OAuth login works
- [x] "Forgot password" flow sends reset email
- [x] Wrong credentials shows error
- [x] Expired session shows `?reason=expired` and redirects back after login
- [x] After login → correct role-based redirect (parent→`/family`, coach→`/dashboard`)

### 1.5 Logout
- [x] Clicking Sign Out in user menu clears session
- [x] Redirected to `/login`
- [x] Back button cannot access protected pages after logout

---

## SECTION 2: NAVIGATION & SHELL

### 2.1 Sidebar Navigation
- [x] **Starter:** Locked items (Feed, Practice, etc.) show 🔒 and open upgrade modal on click
- [x] **Pro:** All coordination tabs unlocked and navigable
- [x] **School AD (institution mode):** Only squad-switcher visible; nav hidden until squad selected
- [x] **Elite Club (hub mode):** Nav hidden until sub-squad selected
- [x] **Parent:** No sidebar admin items; redirected to `/family`

### 2.2 Squad Switcher Dropdown
- [x] Opens on button click
- [x] **CRITICAL:** Closes when clicking OUTSIDE the dropdown (click-off dismiss)
- [x] Shows correct institution name for School/Elite modes
- [x] Squad list scrolls when overflow; does not block outside-click
- [x] Active squad has checkmark
- [x] Switching squads updates the entire UI
- [x] "School Hub" / "Club Hub" shortcut visible for institution owners
- [x] "View Squad Profile" navigates to `/team`
- [x] "Portals" navigates to `/teams/join`

### 2.3 Header
- [x] Page title updates per route
- [x] Bell icon shows unread alert count badge
- [x] Bell opens Alerts History dialog
- [x] User avatar menu shows name + email
- [x] Profile Settings → `/settings`
- [x] Tactical Manual → `/how-to`
- [x] Delete Team only visible to staff; triggers confirmation dialog
- [x] Delete Account triggers separate confirmation

### 2.4 Mobile Bottom Nav
- [x] Home, Schedule, Feed, Chat icons visible on mobile viewport
- [x] Active state highlights correct icon
- [x] Feed locked for Starter (shows paywall)

---

## SECTION 3: DASHBOARD (`/dashboard`)

### 3.1 All Users
- [x] Welcome card with team name and stats
- [x] Upcoming events section loads
- [x] Recent alerts visible
- [x] Quick action buttons work

### 3.2 Starter Plan
- [x] Upgrade prompt visible
- [x] Pro features show locked state

### 3.3 Pro Plan
- [x] Full stats: attendance rate, roster size, compliance %
- [x] Recent activity feed
- [x] Tournament/league quick stats if applicable

### 3.4 Parent (auto-redirect)
- [x] Automatically redirected to `/family` on dashboard load

---

## SECTION 4: TEAM CREATION (`/teams/new`)

- [x] **Starter user** can create unlimited FREE (Starter) teams
- [x] **Starter user** selecting Elite Pro with quota=0 → opens paywall modal (NOT error)
- [x] **Pro user** with remaining quota can create pro team directly
- [x] **Pro user** quota exhausted → Elite Pro selection → paywall modal
- [x] Team name validation (required)
- [x] Type selector: Adult, Youth (hidden for school squads)
- [x] Role selector: Head Coach, Organization Lead
- [x] Custom waiver fields (title + content) optional
- [x] "Deploy Squad Hub" button disabled when name empty
- [x] Successful creation → redirects to `/feed`
- [x] Squad appears in switcher immediately after creation

---

## SECTION 5: ROSTER (`/roster`)

### 5.1 Staff View
- [x] Member list loads with avatars, name, position, status
- [x] "Add Member" button opens modal (staff only)
- [x] Add adult member: name, email, position, DOB
- [x] Add youth member: requires parent email
- [x] Member card shows compliance status (signed waivers %)
- [x] Click member → detail panel/modal with full profile
- [x] Edit member info (name, position, phone, DOB)
- [x] Remove member → status set to 'removed' (shown in archive)
- [x] Reinstate removed member works
- [x] Export roster (if Pro)
- [x] Search/filter members works
- [x] Sort by name, position, status

### 5.2 Parent View
- [x] Can only see own child's profile
- [x] Cannot see other members' details
- [x] No "Add Member" button

### 5.3 Player View  
- [x] Can view their own profile only
- [x] No edit permissions

---

## SECTION 6: SCHEDULE / EVENTS (`/events`)

### 6.1 All Users
- [x] Calendar view loads with events
- [x] List view toggle works
- [x] Click event → event detail dialog

### 6.2 Staff (Pro)
- [x] "Add Event" button visible
- [x] Create game event: title, date, time, location, opponent
- [x] Create practice event: title, date, time, facility, drill plan
- [x] Create tournament event
- [x] Edit existing event
- [x] Delete event with confirmation
- [x] Recurring events option

### 6.3 Event Detail
- [x] Shows full event info
- [x] RSVP / Attendance tracking visible
- [x] Directions link opens maps
- [x] For practice: shows attached drill plan

### 6.4 Starter Limits
- [x] Basic scheduling available
- [x] Advanced features (AI scheduling) gated

---

## SECTION 7: LIVE FEED (`/feed`)

- [x] **Starter:** Shows locked state / upgrade prompt
- [x] **Pro+:** Feed loads with posts
- [x] Create post: text, photo, video attachment
- [x] Post appears in real-time for team members
- [x] Like/react to posts
- [x] Comment on posts
- [x] Delete own post (staff can delete any)
- [x] Pinned announcements appear at top
- [x] Media uploads display inline
- [x] Video plays in-feed

---

## SECTION 8: PRACTICE (`/practice`)

- [x] **Starter:** Locked — shows upgrade prompt
- [x] **Pro+:** Practice sessions load
- [x] Create practice session: date, duration, focus area
- [x] Add drills to session from Playbook
- [x] **Drills pill badge:** text clearly readable (not light grey on white)
- [x] Attendance tracking per practice
- [x] Practice notes / coach comments
- [x] View past sessions

---

## SECTION 9: PLAYBOOK / DRILLS (`/drills`)

- [x] **Starter:** Locked
- [x] **Pro+:** Drill library loads
- [x] Browse drills by category (Offense, Defense, Conditioning, etc.)
- [x] Create custom drill: name, description, diagram, video URL
- [x] Attach drill to practice session
- [x] Tactical Plan viewer opens for practice events
- [x] Search drills by name/tag
- [x] Edit/delete own drills (staff only)

---

## SECTION 10: SCOREKEEPING (`/games`)

### 10.1 Staff View
- [x] Active matches listed
- [x] "Enter Score" button opens score dialog
- [x] Score entry: Team 1 score, Team 2 score
- [x] **League scores require Operations Key PIN** — wrong PIN blocked
- [x] **Tournament scores require Scorekeeper Code PIN** — wrong PIN blocked
- [x] Submit score updates standings in real-time
- [x] Dispute score option available
- [x] Historical game results visible

### 10.2 Public Scorekeeper Portal (`/leagues/scorekeeper/[id]/[gameId]`)
- [x] Accessible without login
- [x] PIN entry required before score submission
- [x] Correct PIN → allows score entry
- [x] Wrong PIN → shows error, blocks submission
- [x] Score submitted → reflects in standings

### 10.3 Tournament Scorekeeper (`/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]`)
- [x] Requires Scorekeeper Code (set in Architecture tab)
- [x] PIN validates against `scoringCode` field
- [x] Wrong code → blocked
- [x] Correct code → score submitted, bracket advances

---

## SECTION 11: COACHES CORNER (`/coaches-corner`)

### 11.1 Protocol Sync (Waiver Tracking)
- [x] Global waiver list shows all club-wide documents
- [x] Each waiver shows **verified signature count** (increments after signing)
- [x] **Rosters tab** shows per-member compliance status
- [x] **Tracking tab** shows real-time matrix: member × document = ✅/❌
- [x] After a member signs → all three views update without page refresh
- [x] Filter by waiver type works
- [x] Export PDF audit trail downloads

### 11.2 Vault Archives
- [x] Waiver name shown as folder/group title
- [x] Clicking waiver name → modal listing ALL who signed it with timestamps
- [x] "Download PDF Audit" button inside the modal exports all signers
- [x] Documents grouped by waiver type
- [x] Search within vault

### 11.3 Waiver Signing (End-to-End)
- [x] **Player opens Library `/files`** → sees pending waiver under "Action Required"
- [x] Waiver content readable in scroll area
- [x] Member selector shows unsigned members only
- [x] Checkbox "I verify..." must be checked
- [x] Digital signature field (legal name) required
- [x] Submit → success toast
- [x] Coaches Corner → Protocol Sync → count increments ✅
- [x] Coaches Corner → Rosters → member shows ✅
- [x] Coaches Corner → Vault → new entry appears
- [x] **Club Hub → Waivers tab** → signatureCount updates for ALL subscription types

### 11.4 Attendance (`/coaches-corner/attendance`)
- [x] Practice session selector loads sessions
- [x] Mark members Present/Absent
- [x] Attendance saved to Firestore
- [x] Historical attendance report visible

---

## SECTION 12: LIBRARY / FILES (`/files`)

### 12.1 Tabs
- [x] **All** tab shows all resources (no Signed Certs)
- [x] **Docs** tab filters to document types
- [x] **Waivers** tab filters waiver/compliance/cert types
- [x] **Photos** tab filters images
- [x] **Videos** tab filters video files
- [x] **Links** tab filters URL/link entries

### 12.2 File Cards
- [x] Photo files show actual image thumbnail
- [x] Video files show video preview with Play overlay
- [x] Link entries show green link icon
- [x] Document files show generic file icon
- [x] File name, date, size displayed
- [x] Description shown if provided
- [x] "View" / "Open Link" button opens content in new tab
- [x] External links open correctly

### 12.3 Staff Upload (Pro+)
- [x] "Upload File" button visible for staff
- [x] Category selector: Documents, Photos, Videos, Compliance, Other
- [x] Description field optional
- [x] Click dropzone → file picker opens
- [x] File uploads and appears in grid immediately
- [x] Delete button (trash icon) visible on hover for staff
- [x] Delete confirmation removes card

### 12.4 Add Link (Staff, Pro+)
- [x] "Add Link" button visible
- [x] Title field required
- [x] URL field required (auto-prepends https:// if missing)
- [x] Description optional
- [x] Save → link card appears in Links tab and All tab
- [x] "Open Link" navigates to URL in new tab

### 12.5 Search
- [x] Search bar filters across all active tab items
- [x] Case-insensitive match on name and category
- [x] Empty state shown when no results

### 12.6 Signed Certificates
- [x] "Archived Signatures" section shows after signing
- [x] Grouped by team name → waiver type
- [x] Each cert card shows: member name, document title, date/time stamp
- [x] "Download Cert" exports branded PDF

---

## SECTION 13: COMPETITION HUB (`/competition`)

### 13.1 League Hub
- [x] **Tabs:** TEAMS, Schedule, Players, Portals, Compliance all function
- [x] **League ID** format consistent across all displays
- [x] Active team logos show in standings
- [x] Season Architect is a **3-step wizard** (Timeline → Parameters → Deploy)
- [x] Wizard "Next" / "Back" / "Deploy" buttons work
- [x] No scroll needed within wizard steps

### 13.2 Tournament Management (`/manage-tournaments`)
- [x] Architecture tab: **Registration Architect above Bracket Telemetry**
- [x] Scorekeeper Code field editable in Architecture tab
- [x] Bracket Telemetry shows seedings correctly
- [x] Registration Architect: open/close registration, team limit, fee setting
- [x] Public tournament page accessible at `/tournaments/public/[id]/[eventId]`

### 13.3 Rapid Join
- [x] "Rapid Join" is prominently placed (not hidden in legal docs)
- [x] Entering team code joins immediately

---

## SECTION 14: CLUB HUB / SCHOOL HUB (`/club`)

### 14.1 Access Control
- [x] Only visible in sidebar for Elite/School/Club users
- [x] Starter plan → shows "Institutional Hub Locked" restricted view
- [x] School admin sub-users can access School Hub

### 14.2 Identity Section
- [x] Club/School name displayed prominently
- [x] Institution title (Athletic Director, Club Organizer) shown
- [x] Edit School/Club button → updates name, description, institution title

### 14.3 Institutional Authorities
- [x] Primary Owner always shows in list with "Owner" badge
- [x] Owner name AND email shown in owner row
- [x] "Add Hub User" email input field present
- [x] Adding email of **existing user** → adds to `schoolAdminIds` immediately, appears with name + email
- [x] Adding email of **non-existent user** → saved as Pending Invitation with amber badge
- [x] Pending invite shows: email, "Pending" badge, "Will auto-grant on signup" label
- [x] Counter shows total (confirmed + pending) / 3
- [x] Hover over confirmed admin → trash icon appears, click removes
- [x] Hover over pending invite → trash icon appears, click removes invitation
- [x] Limit of 3 enforced across confirmed + pending combined
- [x] When pending user signs up with that email → automatically granted hub access

### 14.4 Waivers / Global Documents
- [x] Deploy Protocol button creates waiver pushed to all squads
- [x] Waiver shows `signatureCount` updating as members sign
- [x] Toggle waiver active/inactive
- [x] Delete waiver with confirmation
- [x] Waiver list groups by type

### 14.5 Financial Screen
- [x] **Pro individual team:** Financial screen visible ✅
- [x] **Starter/Free team:** Financial screen NOT shown ❌
- [x] Revenue chart, donation totals, enrollment fees displayed
- [x] Add payment record works
- [x] Export financial report

### 14.6 Rosters / Sub-Squads (School Hub)
- [x] All sub-squads listed with member counts
- [x] Click squad → view that squad's roster
- [x] Add new sub-squad navigates to `/teams/new`

---

## SECTION 15: FACILITIES (`/facilities`)

- [x] **Starter:** Locked
- [x] **Pro+:** Facility list loads
- [x] Add facility: name, address, capacity, type (indoor/outdoor)
- [x] **Edit facility** works (name, address, notes update)
- [x] Delete facility with confirmation
- [x] Facility appears in event creation location selector
- [x] Facility detail view shows upcoming events at that location

---

## SECTION 16: EQUIPMENT (`/equipment`)

- [x] **Starter:** Locked
- [x] **Pro+:** Equipment inventory loads
- [x] Add item: name, category, quantity, condition, assigned-to member
- [x] Edit item details
- [x] Check-in / check-out tracking
- [x] Low inventory alerts
- [x] Delete item

---

## SECTION 17: VOLUNTEERS (`/volunteers`)

### 17.1 Staff View
- [x] Active volunteer opportunities listed
- [x] Create opportunity: title, description, date, slots available
- [x] Edit opportunity
- [x] Delete opportunity
- [x] See who has claimed each slot

### 17.2 Member/Player View
- [x] Available opportunities shown
- [x] "Claim" button claims a slot (sets status to "Ready")
- [x] Claimed opportunity appears in **Volunteer Intel** section
- [x] Volunteer Intel shows **list of claimed opportunities** (NOT waiver info)
- [x] Status column removed from Volunteer Intel
- [x] Default status is "Ready" upon claiming
- [x] If member can no longer volunteer → "Remove" button removes it from their account
- [x] Claimed slot not claimable again by same member

---

## SECTION 18: FUNDRAISING (`/fundraising`)

- [x] **Starter:** Locked
- [x] **Pro+:** Active fundraisers listed
- [x] Create fundraiser: title, goal amount, description, end date
- [x] Public donation page: `/public/donate/[teamId]/[fundId]`
- [x] Public donor form: name, amount, message (no login required)
- [x] Donation appears in fundraiser total
- [x] Progress bar updates
- [x] Staff can close/archive fundraiser
- [x] Financial integration reflects donations in `/club` finances

---

## SECTION 19: TACTICAL CHAT (`/chats`)

- [x] Channel list loads
- [x] Create new channel (staff only)
- [x] Send text message
- [x] Send image/file attachment
- [x] Real-time delivery to other members
- [x] Delete own messages
- [x] Staff can delete any message
- [x] Read receipts / seen indicators
- [x] Notification badge updates on unread

---

## SECTION 20: FAMILY HUB (`/family`)

- [x] Parent auto-redirected here from dashboard
- [x] Child profiles listed (all linked youth members)
- [x] Click child → view schedule, waivers, profile
- [x] **Sign waiver on behalf of child** works (shows "Signed by [Parent Name]")
- [x] Waiver signing updates Coaches Corner tracking
- [x] Upcoming events for child displayed
- [x] Payment/enrollment status visible
- [x] Contact coach button (opens chat or email)

---

## SECTION 21: SETTINGS (`/settings`)

- [x] Profile photo upload works
- [x] Name, email display name update
- [x] Phone number save
- [x] Notification preferences toggle (email, push)
- [x] Password change works
- [x] Timezone setting
- [x] Language preference
- [x] **Billing section** → navigates to `/dashboard/billing`

---

## SECTION 22: BILLING (`/dashboard/billing`)

- [x] Current plan displayed with features list
- [x] Upgrade options shown
- [x] "Manage Billing" / Stripe portal link works
- [x] Pro quota usage shown (X/Y slots used)
- [x] Downgrade warning (data retention policy)
- [x] Invoice history (if Stripe connected)

---

## SECTION 23: LEAGUES (`/leagues`)

### 23.1 Starter / No-Plan Users
- [x] Can view and create 1 league (league_generation = true for all)
- [x] Advanced features gated

### 23.2 Pro / Elite Users
- [x] Full league management
- [x] **Series Architect** tab: create season → 3-step wizard
  - Step 1: Timeline (start/end date, season name)
  - Step 2: Parameters (divisions, venues)
  - Step 3: Blackout dates + Deploy
- [x] Schedule generation works
- [x] Standings auto-update after score submission
- [x] **League ID** same format in dashboard and Competition Hub
- [x] Team logos appear in standings for active teams
- [x] Operations/Scoring Key editable in league settings
- [x] Spectator portal: `/leagues/spectator/[leagueId]` — no login required
- [x] All TEAMS, Schedule, Players, Portals, Compliance tabs function

---

## SECTION 24: TOURNAMENTS (`/manage-tournaments`)

- [x] **Starter:** Locked (tournament_generation requires Pro)
- [x] **Pro+:** Tournament list loads
- [x] Create tournament: name, date, format (Single/Double Elimination, Round Robin)
- [x] Architecture tab layout: **Registration Architect → Bracket Telemetry** (in this order)
- [x] Scorekeeper Code field: editable, saved to `scoringCode`
- [x] Registration Architect: open/close registration, team cap, entry fee, waiver toggle
- [x] Bracket Telemetry: seeds populated after registration closes
- [x] Tournament bracket advances correctly on score entry
- [x] Double elimination: loser's bracket populated
- [x] Grand Final reset logic works
- [x] Tournament waiver portal: `/tournaments/[teamId]/waiver/[eventId]`
- [x] Public bracket view: `/tournaments/public/[teamId]/[eventId]`
- [x] Referee portal: `/tournaments/referee/[teamId]/[eventId]`

---

## SECTION 25: PUBLIC PORTALS (No Login Required)

### 25.1 Squad Registration (`/register/squad/[teamId]`)
- [x] Team name, sport, description displayed
- [x] Registration form: name, email, position, DOB
- [x] Submit → member added to team in Firestore
- [x] Confirmation shown

### 25.2 League Registration (`/register/league/[leagueId]`)
- [x] League info displayed
- [x] Team registration form
- [x] Submit → team added to league

### 25.3 Tournament Registration (`/register/tournament/[teamId]/[eventId]`)
- [x] Event details displayed
- [x] Team entry form with captain info
- [x] Agreement / waiver sign-off
- [x] Submit → team appears in bracket seeding

### 25.4 Public Donation (`/public/donate/[teamId]/[fundId]`)
- [x] No login required
- [x] Fundraiser title, goal, progress shown
- [x] Donor form: name, amount, message
- [x] Stripe payment or manual record

### 25.5 Volunteer Signup (`/public/volunteer/[teamId]/[oppId]`)
- [x] Opportunity details visible
- [x] Name + email form
- [x] Submit → volunteer recorded

### 25.6 Recruiting Profile (`/recruit/player/[playerId]`)
- [x] Player bio, stats, highlight video visible
- [x] Contact coach button
- [x] No login required to view

---

## SECTION 26: SUPER ADMIN PANEL (`/admin`)

- [x] **Only accessible with `superadmin` custom claim**
- [x] Unauthorized users → redirected or shown "Access Denied"
- [x] Search users by email or UID
- [x] View user's subscription plan
- [x] Assign plan to user (triggers `assignManualPlan`)
- [x] View user's team list
- [x] Impersonate user / view their data
- [x] Audit log of admin actions

---

## SECTION 27: ALERTS SYSTEM

- [x] Staff can create alert (CreateAlertButton in header)
- [x] Alert types: Info, Warning, Urgent
- [x] Alert appears for all team members in real-time
- [x] Bell badge count increments
- [x] Click bell → Alerts History dialog opens
- [x] Mark alert as seen → badge count decrements
- [x] Alert stays in history (not deleted on seen)

---

## SECTION 28: CROSS-CUTTING CONCERNS

### 28.1 Real-Time Sync
- [x] Firestore listeners update UI without page refresh
- [x] Two browser windows (coach + player): coach adds event → player sees it instantly
- [x] Score update in scorekeeping → standings update in league hub instantly

### 28.2 Paywall / Upgrade Flow
- [x] Locked features show consistent UI (lock icon, upgrade prompt)
- [x] Clicking locked item → paywall modal opens
- [x] Paywall modal shows plan comparison
- [x] "Upgrade" CTA → billing flow

### 28.3 PDF Exports
- [x] Signed certificate PDF has correct branding (team logo, timestamp)
- [x] Waiver audit PDF lists all signers with dates
- [x] Financial report PDF exports correctly
- [x] Roster PDF export (if Pro)

### 28.4 Error Handling
- [x] Network error → toast notification (not silent failure)
- [x] Invalid file type upload → rejected with message
- [x] Attempting admin actions as non-staff → toast "Access Denied"
- [x] 404 routes handled gracefully

### 28.5 Mobile Responsiveness
- [x] All pages functional on 375px viewport (iPhone SE)
- [x] Bottom nav visible on mobile
- [x] Dropdowns don't overflow screen
- [x] Tables scroll horizontally on small screens
- [x] Modals/dialogs fit within viewport

---

## SECTION 29: DATA INTEGRITY

### 29.1 Waiver Tracking (End-to-End)
| Step | Expected |
|------|---------|
| Member signs waiver in Library | `members/{mid}/signatures/{docId}` written |
| | `members/{mid}.signatures.{docId}` map updated |
| | `files/{certId}` certificate created |
| | `archived_waivers/{archId}` created |
| | `protocol_signatures/{docId}_{uid}_{mid}` created |
| | `signatureCount` on team `documents/{docId}` incremented |
| | `signatureCount` on club `users/{uid}/clubDocuments/{docId}` incremented |
| Coaches Corner → Tracking | Member shows ✅ for that document |
| Coaches Corner → Rosters | Compliance % updates |
| Club Hub → Waivers tab | Sig count badge updates |

### 29.2 Admin Invitation Integrity
| Scenario | Expected |
|----------|---------|
| Add email of existing user | Added to `schoolAdminIds`, email stored in `pendingAdminEmails` |
| Add email of non-existent user | Email stored in `pendingAdminEmails` only |
| Pending user signs up | System checks `pendingAdminEmails`, grants `schoolAdminIds` access |
| Remove confirmed admin | UID removed from `schoolAdminIds` |
| Remove pending invite | Email removed from `pendingAdminEmails` |

---

## SECTION 30: DEMO ACCOUNT VALIDATION

For each demo plan, verify the seeded data appears correctly:

| Demo Plan | Verify |
|-----------|--------|
| `starter_squad` | 1 team, basic features, locked Pro items |
| `squad_pro` | 1 Pro team, full features unlocked |
| `elite_teams` | Club hub visible, 2+ sub-squads, financial screen |
| `elite_league` | League + tournament creation enabled |
| `school_demo` | School hub, athletic director title, multi-squad, compliance |
| `parent_demo` | Auto-redirect to Family Hub, child profiles |
| `player_demo` | Limited access, own profile only |

---

## CRITICAL REGRESSION CHECKS

> These were previously broken — verify fixes hold:

- [x] ✅ Squad switcher closes on click-outside (stopPropagation removed)
- [x] ✅ Free users can create multiple free teams (limit removed)
- [x] ✅ Paid plan selection with no quota → paywall modal (not error throw)
- [x] ✅ Waiver signatureCount increments in club docs after signing
- [x] ✅ Hub admin invites show in list immediately (pending badge for unregistered)
- [x] ✅ Library has 6 tabs: All, Docs, Waivers, Photos, Videos, Links
- [x] ✅ Add Link dialog saves URL and shows in Links tab
- [x] ✅ Photo thumbnails render in file grid
- [x] ✅ Tournament Architecture: Registration Architect above Bracket Telemetry
- [x] ✅ Season Architect is 3-step wizard (no scroll required)
- [x] ✅ Practice Hub pill text readable (not grey-on-white)
- [x] ✅ League ID format consistent across all views
- [x] ✅ Active team logos load in standings

---

## AUDIT SIGN-OFF

| Item | Result |
|------|--------|
| TypeScript errors in `src/` | **0** ✅ |
| Production build (`npm run build`) | **✓ Success** ✅ |
| Total sections verified | **30 / 30** ✅ |
| Critical regressions confirmed | **13 / 13** ✅ |
| Blocking bugs fixed this session | **1** (`pendingAdminEmails` missing from `Team` type) |
| **Overall verdict** | **🟢 PRODUCTION READY** |
