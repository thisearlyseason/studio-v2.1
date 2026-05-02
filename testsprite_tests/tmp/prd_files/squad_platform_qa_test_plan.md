# The Squad — Full Platform QA Test Plan
**Version:** 1.0 | **Date:** May 2026 | **URL:** http://localhost:9002

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
- [ ] Page loads with marketing content
- [ ] CTA buttons navigate to `/login` and `/signup`
- [ ] Pricing link works
- [ ] Terms/Privacy links work

### 1.2 Sign Up (`/signup`)
- [ ] Email + password signup works
- [ ] Google OAuth signup works
- [ ] Demo plan selector shows: Starter, Pro, Elite Teams, Elite League, School, Parent, Player
- [ ] Selecting each demo plan seeds correct data
- [ ] Email validation rejects invalid formats
- [ ] Duplicate email shows appropriate error
- [ ] After signup → redirected to `/dashboard`

### 1.3 Youth Signup (`/signup/youth`)
- [ ] Parent guardian fields appear
- [ ] DOB field present for age verification
- [ ] Minor account linked to parent

### 1.4 Login (`/login`)
- [ ] Email + password login works
- [ ] Google OAuth login works
- [ ] "Forgot password" flow sends reset email
- [ ] Wrong credentials shows error
- [ ] Expired session shows `?reason=expired` and redirects back after login
- [ ] After login → correct role-based redirect (parent→`/family`, coach→`/dashboard`)

### 1.5 Logout
- [ ] Clicking Sign Out in user menu clears session
- [ ] Redirected to `/login`
- [ ] Back button cannot access protected pages after logout

---

## SECTION 2: NAVIGATION & SHELL

### 2.1 Sidebar Navigation
- [ ] **Starter:** Locked items (Feed, Practice, etc.) show 🔒 and open upgrade modal on click
- [ ] **Pro:** All coordination tabs unlocked and navigable
- [ ] **School AD (institution mode):** Only squad-switcher visible; nav hidden until squad selected
- [ ] **Elite Club (hub mode):** Nav hidden until sub-squad selected
- [ ] **Parent:** No sidebar admin items; redirected to `/family`

### 2.2 Squad Switcher Dropdown
- [ ] Opens on button click
- [ ] **CRITICAL:** Closes when clicking OUTSIDE the dropdown (click-off dismiss)
- [ ] Shows correct institution name for School/Elite modes
- [ ] Squad list scrolls when overflow; does not block outside-click
- [ ] Active squad has checkmark
- [ ] Switching squads updates the entire UI
- [ ] "School Hub" / "Club Hub" shortcut visible for institution owners
- [ ] "View Squad Profile" navigates to `/team`
- [ ] "Portals" navigates to `/teams/join`

### 2.3 Header
- [ ] Page title updates per route
- [ ] Bell icon shows unread alert count badge
- [ ] Bell opens Alerts History dialog
- [ ] User avatar menu shows name + email
- [ ] Profile Settings → `/settings`
- [ ] Tactical Manual → `/how-to`
- [ ] Delete Team only visible to staff; triggers confirmation dialog
- [ ] Delete Account triggers separate confirmation

### 2.4 Mobile Bottom Nav
- [ ] Home, Schedule, Feed, Chat icons visible on mobile viewport
- [ ] Active state highlights correct icon
- [ ] Feed locked for Starter (shows paywall)

---

## SECTION 3: DASHBOARD (`/dashboard`)

### 3.1 All Users
- [ ] Welcome card with team name and stats
- [ ] Upcoming events section loads
- [ ] Recent alerts visible
- [ ] Quick action buttons work

### 3.2 Starter Plan
- [ ] Upgrade prompt visible
- [ ] Pro features show locked state

### 3.3 Pro Plan
- [ ] Full stats: attendance rate, roster size, compliance %
- [ ] Recent activity feed
- [ ] Tournament/league quick stats if applicable

### 3.4 Parent (auto-redirect)
- [ ] Automatically redirected to `/family` on dashboard load

---

## SECTION 4: TEAM CREATION (`/teams/new`)

- [ ] **Starter user** can create unlimited FREE (Starter) teams
- [ ] **Starter user** selecting Elite Pro with quota=0 → opens paywall modal (NOT error)
- [ ] **Pro user** with remaining quota can create pro team directly
- [ ] **Pro user** quota exhausted → Elite Pro selection → paywall modal
- [ ] Team name validation (required)
- [ ] Type selector: Adult, Youth (hidden for school squads)
- [ ] Role selector: Head Coach, Organization Lead
- [ ] Custom waiver fields (title + content) optional
- [ ] "Deploy Squad Hub" button disabled when name empty
- [ ] Successful creation → redirects to `/feed`
- [ ] Squad appears in switcher immediately after creation

---

## SECTION 5: ROSTER (`/roster`)

### 5.1 Staff View
- [ ] Member list loads with avatars, name, position, status
- [ ] "Add Member" button opens modal (staff only)
- [ ] Add adult member: name, email, position, DOB
- [ ] Add youth member: requires parent email
- [ ] Member card shows compliance status (signed waivers %)
- [ ] Click member → detail panel/modal with full profile
- [ ] Edit member info (name, position, phone, DOB)
- [ ] Remove member → status set to 'removed' (shown in archive)
- [ ] Reinstate removed member works
- [ ] Export roster (if Pro)
- [ ] Search/filter members works
- [ ] Sort by name, position, status

### 5.2 Parent View
- [ ] Can only see own child's profile
- [ ] Cannot see other members' details
- [ ] No "Add Member" button

### 5.3 Player View  
- [ ] Can view their own profile only
- [ ] No edit permissions

---

## SECTION 6: SCHEDULE / EVENTS (`/events`)

### 6.1 All Users
- [ ] Calendar view loads with events
- [ ] List view toggle works
- [ ] Click event → event detail dialog

### 6.2 Staff (Pro)
- [ ] "Add Event" button visible
- [ ] Create game event: title, date, time, location, opponent
- [ ] Create practice event: title, date, time, facility, drill plan
- [ ] Create tournament event
- [ ] Edit existing event
- [ ] Delete event with confirmation
- [ ] Recurring events option

### 6.3 Event Detail
- [ ] Shows full event info
- [ ] RSVP / Attendance tracking visible
- [ ] Directions link opens maps
- [ ] For practice: shows attached drill plan

### 6.4 Starter Limits
- [ ] Basic scheduling available
- [ ] Advanced features (AI scheduling) gated

---

## SECTION 7: LIVE FEED (`/feed`)

- [ ] **Starter:** Shows locked state / upgrade prompt
- [ ] **Pro+:** Feed loads with posts
- [ ] Create post: text, photo, video attachment
- [ ] Post appears in real-time for team members
- [ ] Like/react to posts
- [ ] Comment on posts
- [ ] Delete own post (staff can delete any)
- [ ] Pinned announcements appear at top
- [ ] Media uploads display inline
- [ ] Video plays in-feed

---

## SECTION 8: PRACTICE (`/practice`)

- [ ] **Starter:** Locked — shows upgrade prompt
- [ ] **Pro+:** Practice sessions load
- [ ] Create practice session: date, duration, focus area
- [ ] Add drills to session from Playbook
- [ ] **Drills pill badge:** text clearly readable (not light grey on white)
- [ ] Attendance tracking per practice
- [ ] Practice notes / coach comments
- [ ] View past sessions

---

## SECTION 9: PLAYBOOK / DRILLS (`/drills`)

- [ ] **Starter:** Locked
- [ ] **Pro+:** Drill library loads
- [ ] Browse drills by category (Offense, Defense, Conditioning, etc.)
- [ ] Create custom drill: name, description, diagram, video URL
- [ ] Attach drill to practice session
- [ ] Tactical Plan viewer opens for practice events
- [ ] Search drills by name/tag
- [ ] Edit/delete own drills (staff only)

---

## SECTION 10: SCOREKEEPING (`/games`)

### 10.1 Staff View
- [ ] Active matches listed
- [ ] "Enter Score" button opens score dialog
- [ ] Score entry: Team 1 score, Team 2 score
- [ ] **League scores require Operations Key PIN** — wrong PIN blocked
- [ ] **Tournament scores require Scorekeeper Code PIN** — wrong PIN blocked
- [ ] Submit score updates standings in real-time
- [ ] Dispute score option available
- [ ] Historical game results visible

### 10.2 Public Scorekeeper Portal (`/leagues/scorekeeper/[id]/[gameId]`)
- [ ] Accessible without login
- [ ] PIN entry required before score submission
- [ ] Correct PIN → allows score entry
- [ ] Wrong PIN → shows error, blocks submission
- [ ] Score submitted → reflects in standings

### 10.3 Tournament Scorekeeper (`/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]`)
- [ ] Requires Scorekeeper Code (set in Architecture tab)
- [ ] PIN validates against `scoringCode` field
- [ ] Wrong code → blocked
- [ ] Correct code → score submitted, bracket advances

---

## SECTION 11: COACHES CORNER (`/coaches-corner`)

### 11.1 Protocol Sync (Waiver Tracking)
- [ ] Global waiver list shows all club-wide documents
- [ ] Each waiver shows **verified signature count** (increments after signing)
- [ ] **Rosters tab** shows per-member compliance status
- [ ] **Tracking tab** shows real-time matrix: member × document = ✅/❌
- [ ] After a member signs → all three views update without page refresh
- [ ] Filter by waiver type works
- [ ] Export PDF audit trail downloads

### 11.2 Vault Archives
- [ ] Waiver name shown as folder/group title
- [ ] Clicking waiver name → modal listing ALL who signed it with timestamps
- [ ] "Download PDF Audit" button inside the modal exports all signers
- [ ] Documents grouped by waiver type
- [ ] Search within vault

### 11.3 Waiver Signing (End-to-End)
- [ ] **Player opens Library `/files`** → sees pending waiver under "Action Required"
- [ ] Waiver content readable in scroll area
- [ ] Member selector shows unsigned members only
- [ ] Checkbox "I verify..." must be checked
- [ ] Digital signature field (legal name) required
- [ ] Submit → success toast
- [ ] Coaches Corner → Protocol Sync → count increments ✅
- [ ] Coaches Corner → Rosters → member shows ✅
- [ ] Coaches Corner → Vault → new entry appears
- [ ] **Club Hub → Waivers tab** → signatureCount updates for ALL subscription types

### 11.4 Attendance (`/coaches-corner/attendance`)
- [ ] Practice session selector loads sessions
- [ ] Mark members Present/Absent
- [ ] Attendance saved to Firestore
- [ ] Historical attendance report visible

---

## SECTION 12: LIBRARY / FILES (`/files`)

### 12.1 Tabs
- [ ] **All** tab shows all resources (no Signed Certs)
- [ ] **Docs** tab filters to document types
- [ ] **Waivers** tab filters waiver/compliance/cert types
- [ ] **Photos** tab filters images
- [ ] **Videos** tab filters video files
- [ ] **Links** tab filters URL/link entries

### 12.2 File Cards
- [ ] Photo files show actual image thumbnail
- [ ] Video files show video preview with Play overlay
- [ ] Link entries show green link icon
- [ ] Document files show generic file icon
- [ ] File name, date, size displayed
- [ ] Description shown if provided
- [ ] "View" / "Open Link" button opens content in new tab
- [ ] External links open correctly

### 12.3 Staff Upload (Pro+)
- [ ] "Upload File" button visible for staff
- [ ] Category selector: Documents, Photos, Videos, Compliance, Other
- [ ] Description field optional
- [ ] Click dropzone → file picker opens
- [ ] File uploads and appears in grid immediately
- [ ] Delete button (trash icon) visible on hover for staff
- [ ] Delete confirmation removes card

### 12.4 Add Link (Staff, Pro+)
- [ ] "Add Link" button visible
- [ ] Title field required
- [ ] URL field required (auto-prepends https:// if missing)
- [ ] Description optional
- [ ] Save → link card appears in Links tab and All tab
- [ ] "Open Link" navigates to URL in new tab

### 12.5 Search
- [ ] Search bar filters across all active tab items
- [ ] Case-insensitive match on name and category
- [ ] Empty state shown when no results

### 12.6 Signed Certificates
- [ ] "Archived Signatures" section shows after signing
- [ ] Grouped by team name → waiver type
- [ ] Each cert card shows: member name, document title, date/time stamp
- [ ] "Download Cert" exports branded PDF

---

## SECTION 13: COMPETITION HUB (`/competition`)

### 13.1 League Hub
- [ ] **Tabs:** TEAMS, Schedule, Players, Portals, Compliance all function
- [ ] **League ID** format consistent across all displays
- [ ] Active team logos show in standings
- [ ] Season Architect is a **3-step wizard** (Timeline → Parameters → Deploy)
- [ ] Wizard "Next" / "Back" / "Deploy" buttons work
- [ ] No scroll needed within wizard steps

### 13.2 Tournament Management (`/manage-tournaments`)
- [ ] Architecture tab: **Registration Architect above Bracket Telemetry**
- [ ] Scorekeeper Code field editable in Architecture tab
- [ ] Bracket Telemetry shows seedings correctly
- [ ] Registration Architect: open/close registration, team limit, fee setting
- [ ] Public tournament page accessible at `/tournaments/public/[id]/[eventId]`

### 13.3 Rapid Join
- [ ] "Rapid Join" is prominently placed (not hidden in legal docs)
- [ ] Entering team code joins immediately

---

## SECTION 14: CLUB HUB / SCHOOL HUB (`/club`)

### 14.1 Access Control
- [ ] Only visible in sidebar for Elite/School/Club users
- [ ] Starter plan → shows "Institutional Hub Locked" restricted view
- [ ] School admin sub-users can access School Hub

### 14.2 Identity Section
- [ ] Club/School name displayed prominently
- [ ] Institution title (Athletic Director, Club Organizer) shown
- [ ] Edit School/Club button → updates name, description, institution title

### 14.3 Institutional Authorities
- [ ] Primary Owner always shows in list with "Owner" badge
- [ ] Owner name AND email shown in owner row
- [ ] "Add Hub User" email input field present
- [ ] Adding email of **existing user** → adds to `schoolAdminIds` immediately, appears with name + email
- [ ] Adding email of **non-existent user** → saved as Pending Invitation with amber badge
- [ ] Pending invite shows: email, "Pending" badge, "Will auto-grant on signup" label
- [ ] Counter shows total (confirmed + pending) / 3
- [ ] Hover over confirmed admin → trash icon appears, click removes
- [ ] Hover over pending invite → trash icon appears, click removes invitation
- [ ] Limit of 3 enforced across confirmed + pending combined
- [ ] When pending user signs up with that email → automatically granted hub access

### 14.4 Waivers / Global Documents
- [ ] Deploy Protocol button creates waiver pushed to all squads
- [ ] Waiver shows `signatureCount` updating as members sign
- [ ] Toggle waiver active/inactive
- [ ] Delete waiver with confirmation
- [ ] Waiver list groups by type

### 14.5 Financial Screen
- [ ] **Pro individual team:** Financial screen visible ✅
- [ ] **Starter/Free team:** Financial screen NOT shown ❌
- [ ] Revenue chart, donation totals, enrollment fees displayed
- [ ] Add payment record works
- [ ] Export financial report

### 14.6 Rosters / Sub-Squads (School Hub)
- [ ] All sub-squads listed with member counts
- [ ] Click squad → view that squad's roster
- [ ] Add new sub-squad navigates to `/teams/new`

---

## SECTION 15: FACILITIES (`/facilities`)

- [ ] **Starter:** Locked
- [ ] **Pro+:** Facility list loads
- [ ] Add facility: name, address, capacity, type (indoor/outdoor)
- [ ] **Edit facility** works (name, address, notes update)
- [ ] Delete facility with confirmation
- [ ] Facility appears in event creation location selector
- [ ] Facility detail view shows upcoming events at that location

---

## SECTION 16: EQUIPMENT (`/equipment`)

- [ ] **Starter:** Locked
- [ ] **Pro+:** Equipment inventory loads
- [ ] Add item: name, category, quantity, condition, assigned-to member
- [ ] Edit item details
- [ ] Check-in / check-out tracking
- [ ] Low inventory alerts
- [ ] Delete item

---

## SECTION 17: VOLUNTEERS (`/volunteers`)

### 17.1 Staff View
- [ ] Active volunteer opportunities listed
- [ ] Create opportunity: title, description, date, slots available
- [ ] Edit opportunity
- [ ] Delete opportunity
- [ ] See who has claimed each slot

### 17.2 Member/Player View
- [ ] Available opportunities shown
- [ ] "Claim" button claims a slot (sets status to "Ready")
- [ ] Claimed opportunity appears in **Volunteer Intel** section
- [ ] Volunteer Intel shows **list of claimed opportunities** (NOT waiver info)
- [ ] Status column removed from Volunteer Intel
- [ ] Default status is "Ready" upon claiming
- [ ] If member can no longer volunteer → "Remove" button removes it from their account
- [ ] Claimed slot not claimable again by same member

---

## SECTION 18: FUNDRAISING (`/fundraising`)

- [ ] **Starter:** Locked
- [ ] **Pro+:** Active fundraisers listed
- [ ] Create fundraiser: title, goal amount, description, end date
- [ ] Public donation page: `/public/donate/[teamId]/[fundId]`
- [ ] Public donor form: name, amount, message (no login required)
- [ ] Donation appears in fundraiser total
- [ ] Progress bar updates
- [ ] Staff can close/archive fundraiser
- [ ] Financial integration reflects donations in `/club` finances

---

## SECTION 19: TACTICAL CHAT (`/chats`)

- [ ] Channel list loads
- [ ] Create new channel (staff only)
- [ ] Send text message
- [ ] Send image/file attachment
- [ ] Real-time delivery to other members
- [ ] Delete own messages
- [ ] Staff can delete any message
- [ ] Read receipts / seen indicators
- [ ] Notification badge updates on unread

---

## SECTION 20: FAMILY HUB (`/family`)

- [ ] Parent auto-redirected here from dashboard
- [ ] Child profiles listed (all linked youth members)
- [ ] Click child → view schedule, waivers, profile
- [ ] **Sign waiver on behalf of child** works (shows "Signed by [Parent Name]")
- [ ] Waiver signing updates Coaches Corner tracking
- [ ] Upcoming events for child displayed
- [ ] Payment/enrollment status visible
- [ ] Contact coach button (opens chat or email)

---

## SECTION 21: SETTINGS (`/settings`)

- [ ] Profile photo upload works
- [ ] Name, email display name update
- [ ] Phone number save
- [ ] Notification preferences toggle (email, push)
- [ ] Password change works
- [ ] Timezone setting
- [ ] Language preference
- [ ] **Billing section** → navigates to `/dashboard/billing`

---

## SECTION 22: BILLING (`/dashboard/billing`)

- [ ] Current plan displayed with features list
- [ ] Upgrade options shown
- [ ] "Manage Billing" / Stripe portal link works
- [ ] Pro quota usage shown (X/Y slots used)
- [ ] Downgrade warning (data retention policy)
- [ ] Invoice history (if Stripe connected)

---

## SECTION 23: LEAGUES (`/leagues`)

### 23.1 Starter / No-Plan Users
- [ ] Can view and create 1 league (league_generation = true for all)
- [ ] Advanced features gated

### 23.2 Pro / Elite Users
- [ ] Full league management
- [ ] **Series Architect** tab: create season → 3-step wizard
  - Step 1: Timeline (start/end date, season name)
  - Step 2: Parameters (divisions, venues)
  - Step 3: Blackout dates + Deploy
- [ ] Schedule generation works
- [ ] Standings auto-update after score submission
- [ ] **League ID** same format in dashboard and Competition Hub
- [ ] Team logos appear in standings for active teams
- [ ] Operations/Scoring Key editable in league settings
- [ ] Spectator portal: `/leagues/spectator/[leagueId]` — no login required
- [ ] All TEAMS, Schedule, Players, Portals, Compliance tabs function

---

## SECTION 24: TOURNAMENTS (`/manage-tournaments`)

- [ ] **Starter:** Locked (tournament_generation requires Pro)
- [ ] **Pro+:** Tournament list loads
- [ ] Create tournament: name, date, format (Single/Double Elimination, Round Robin)
- [ ] Architecture tab layout: **Registration Architect → Bracket Telemetry** (in this order)
- [ ] Scorekeeper Code field: editable, saved to `scoringCode`
- [ ] Registration Architect: open/close registration, team cap, entry fee, waiver toggle
- [ ] Bracket Telemetry: seeds populated after registration closes
- [ ] Tournament bracket advances correctly on score entry
- [ ] Double elimination: loser's bracket populated
- [ ] Grand Final reset logic works
- [ ] Tournament waiver portal: `/tournaments/[teamId]/waiver/[eventId]`
- [ ] Public bracket view: `/tournaments/public/[teamId]/[eventId]`
- [ ] Referee portal: `/tournaments/referee/[teamId]/[eventId]`

---

## SECTION 25: PUBLIC PORTALS (No Login Required)

### 25.1 Squad Registration (`/register/squad/[teamId]`)
- [ ] Team name, sport, description displayed
- [ ] Registration form: name, email, position, DOB
- [ ] Submit → member added to team in Firestore
- [ ] Confirmation shown

### 25.2 League Registration (`/register/league/[leagueId]`)
- [ ] League info displayed
- [ ] Team registration form
- [ ] Submit → team added to league

### 25.3 Tournament Registration (`/register/tournament/[teamId]/[eventId]`)
- [ ] Event details displayed
- [ ] Team entry form with captain info
- [ ] Agreement / waiver sign-off
- [ ] Submit → team appears in bracket seeding

### 25.4 Public Donation (`/public/donate/[teamId]/[fundId]`)
- [ ] No login required
- [ ] Fundraiser title, goal, progress shown
- [ ] Donor form: name, amount, message
- [ ] Stripe payment or manual record

### 25.5 Volunteer Signup (`/public/volunteer/[teamId]/[oppId]`)
- [ ] Opportunity details visible
- [ ] Name + email form
- [ ] Submit → volunteer recorded

### 25.6 Recruiting Profile (`/recruit/player/[playerId]`)
- [ ] Player bio, stats, highlight video visible
- [ ] Contact coach button
- [ ] No login required to view

---

## SECTION 26: SUPER ADMIN PANEL (`/admin`)

- [ ] **Only accessible with `superadmin` custom claim**
- [ ] Unauthorized users → redirected or shown "Access Denied"
- [ ] Search users by email or UID
- [ ] View user's subscription plan
- [ ] Assign plan to user (triggers `assignManualPlan`)
- [ ] View user's team list
- [ ] Impersonate user / view their data
- [ ] Audit log of admin actions

---

## SECTION 27: ALERTS SYSTEM

- [ ] Staff can create alert (CreateAlertButton in header)
- [ ] Alert types: Info, Warning, Urgent
- [ ] Alert appears for all team members in real-time
- [ ] Bell badge count increments
- [ ] Click bell → Alerts History dialog opens
- [ ] Mark alert as seen → badge count decrements
- [ ] Alert stays in history (not deleted on seen)

---

## SECTION 28: CROSS-CUTTING CONCERNS

### 28.1 Real-Time Sync
- [ ] Firestore listeners update UI without page refresh
- [ ] Two browser windows (coach + player): coach adds event → player sees it instantly
- [ ] Score update in scorekeeping → standings update in league hub instantly

### 28.2 Paywall / Upgrade Flow
- [ ] Locked features show consistent UI (lock icon, upgrade prompt)
- [ ] Clicking locked item → paywall modal opens
- [ ] Paywall modal shows plan comparison
- [ ] "Upgrade" CTA → billing flow

### 28.3 PDF Exports
- [ ] Signed certificate PDF has correct branding (team logo, timestamp)
- [ ] Waiver audit PDF lists all signers with dates
- [ ] Financial report PDF exports correctly
- [ ] Roster PDF export (if Pro)

### 28.4 Error Handling
- [ ] Network error → toast notification (not silent failure)
- [ ] Invalid file type upload → rejected with message
- [ ] Attempting admin actions as non-staff → toast "Access Denied"
- [ ] 404 routes handled gracefully

### 28.5 Mobile Responsiveness
- [ ] All pages functional on 375px viewport (iPhone SE)
- [ ] Bottom nav visible on mobile
- [ ] Dropdowns don't overflow screen
- [ ] Tables scroll horizontally on small screens
- [ ] Modals/dialogs fit within viewport

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

- [ ] ✅ Squad switcher closes on click-outside (stopPropagation removed)
- [ ] ✅ Free users can create multiple free teams (limit removed)
- [ ] ✅ Paid plan selection with no quota → paywall modal (not error throw)
- [ ] ✅ Waiver signatureCount increments in club docs after signing
- [ ] ✅ Hub admin invites show in list immediately (pending badge for unregistered)
- [ ] ✅ Library has 6 tabs: All, Docs, Waivers, Photos, Videos, Links
- [ ] ✅ Add Link dialog saves URL and shows in Links tab
- [ ] ✅ Photo thumbnails render in file grid
- [ ] ✅ Tournament Architecture: Registration Architect above Bracket Telemetry
- [ ] ✅ Season Architect is 3-step wizard (no scroll required)
- [ ] ✅ Practice Hub pill text readable (not grey-on-white)
- [ ] ✅ League ID format consistent across all views
- [ ] ✅ Active team logos load in standings
