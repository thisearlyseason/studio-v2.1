# SquadForge Product Requirements Document (PRD)

## 1. Executive Summary
SquadForge is a comprehensive institutional athletic management platform designed to unify club-level oversight with squad-level tactical execution. It serves four distinct personas: Institutional Stakeholders (Club Admins), Squad Coordinators (Coaches), Athletes (Players), and Guardians (Parents). The platform bridges the gap between high-level policy/finance and on-field performance through real-time communication, automated logistics, and professional recruiting tools.

---

## 2. Institutional Architecture & Governance
### 2.1 Management & Club Oversight
- **Institutional Hub**: Dedicated landing for club leadership to manage global mandates across all associated squads.
- **Global Mandate Vault**: Centralized repository for institutional protocols, safety manuals, and compliance documents.
- **Protocol Deployment**: High-level tracking of which squad-level protocols (Medical, Travel, Liability) are active and executed.
- **Institutional Dashboard**: Aggregated view of club activities, member counts, and safety statuses.
- **RBAC (Role-Based Access Control)**: Tiered permissions for Platform Admins, Club Admins, Coaches, Parents, and Athletes.

### 2.2 Safety & Incident Management
- **Audit-Ready Incident Reports**: Detailed, time-stamped logging of safety incidents.
- **Environmental & Tactical Context**: Log weather conditions, equipment status, and specific drill/game context during incidents.
- **Treatment Ledger**: Dedicated section to record immediate medical protocols and treatments provided.
- **Institutional PDF Exports**: Generate branded, professional safety reports using the `generateBrandedPDF` utility for legal and insurance audits.
- **Severity Classification**: Audit-ready labels ("Critical Alert" vs "Routine Log") to prioritize institutional response.

---

## 3. Platform Economy & Subscriptions
### 3.1 Monetization & Licensing
- **Economy Engine**: Platform-wide management of "Elite Seats" (subscriptions) and feature gating.
- **Subscription Tiers**: Managed via Stripe, including automated provisioning and seat management.
- **Manual Seat Provisioning**: Admin capability to grant manual access or override subscription states for specific users.
- **Institutional Billing**: Consolidated household dues tracking and unified pricing models.

### 3.2 Registration & Financial Auditing
- **Centralized Registration Entries**: Institutional tracking of all league and squad enrollment applications.
- **Fundraising Command**: 
  - **Campaign Management**: Create and track branded fundraising campaigns.
  - **Donation Audit Ledger**: Verify and reconcile external, manual, or e-transfer donations.
  - **Revenue Analytics**: Real-time monitoring of campaign performance and net revenue.

---

## 4. League Operations & Season Orchestration
### 4.1 League Architect (Deployment Engine)
- **Multi-Format Scheduling**: Engine supporting Round Robin and Double Elimination formats.
- **Season Timeline & Parameters**: Define start/end dates, active play days, and daily match slots (Start/End times).
- **Logistics Configuration**: Precisely define match length, break length, and games per team.
- **Double Header Logic**: Specialized options for "None", "Same Team (Swap)", or "Different Teams".
- **Blackout Calendar**: Institutional ability to exclude specific dates from the automated scheduling engine.
- **Venue & Field Allocation**: Recursive field/court loader to select specific resources from managed facilities.

### 4.2 League Command Center
- **Live Standings Hub**: Real-time points, wins, and losses tracking across participating squads.
- **Match Ledger & Calendar**: Dual-view system (List vs. Interactive Calendar) for managing and viewing season fixtures.
- **Scorekeeper Portal**: Mobile-responsive interface for verified staff to enter real-time match results.
- **Spectator Portal**: Public-facing hub for live standings and bracket visualizations.
- **Personnel Pool (Recruiting Center)**:
    - **Individual Prospect Pipeline**: Track athletes looking for squads within the league.
    - **Waiver Verification**: Audit-ready tracking of signature status for all personnel hub applicants.

---

## 5. Squad Operations & Tactical Hub
### 5.1 Playbook Hub (Execution Architecture)
- **Institutional Drill Vault**:
    - **Instructional Protocol Publishing**: Create drills with titles, categorical descriptions, and strategic coaching cues.
    - **Multi-Media Instruction**: Support for primary YouTube/Vimeo links plus additional image/video attachments per drill.
    - **Instructional Minimize/Expand**: Toggle-able view for dense tactical manuals.
- **Tactical Video Intelligence (Coach Marks)**:
    - **Timestamped Annotations**: Create interactive markers at specific seconds with coaching notes.
    - **Automated Seek-to-Point**: Clicking a mark instantly jumps the player (YouTube/Vimeo) to that tactical moment.
    - **Staff Attribution**: Visual tagging indicating which coach provided specific feedback.
- **Game Tape & Film Archive**: Categorized vault for "Game Tape", "Practice Sessions", or "Highlights" with local MP4 upload support.

- **Real-Time Presence**: Unread counts and active timestamps per channel.

### 5.3 Personnel Governance & Roster Limits
- **Coach-Controlled Seat Limits**: Coordinators have the authority to set a hard `rosterLimit` for their squad.
- **Invite Blocking**: When the member count reaches the limit, recruiting links and the "Invite Athlete" dialog are automatically deactivated.
- **Compliance Badge**: A `FULL` status indicator is rendered in the hub, signaling an active hiring freeze.

---

## 6. Coaches’ Strategic Corner & Recruiting Hub
### 6.1 Athlete Recruiting Portfolio (Athlete Pack)
- **Pipeline Status Tracking**: Dynamic categorization (Active Prospect, Committed, Private).
- **Specialized Athletic Metrics (Pulse)**: High-fidelity sport-specific data tracking (e.g., Exit Velo for Baseball, VO2 Max for Soccer, 40yd Dash for Football).
- **Scout Portal Integration**: Public-facing athlete profiles accessible to verified recruiters via `/recruit/player/[id]`.
- **Academic Hub**: Integrated tracking for GPA and athletic narrative logs.

---

## 7. Household & Guardian Command
### 7.1 Guardianship Hub
- **Minor Player Management**: Centralized hub for registering and overseeing under-18 athletes.
- **Consolidated Household Itinerary**: Unified calendar aggregating events (games, travel, drills) for all athletes in the household.
- **Unified Household Balance**: Single-point tracking of aggregated dues across all family members.
- **Athlete Identity Upgrade**: Guardian-controlled "Enable Login" to grant minor athletes their own app access while maintaining oversight.

### 7.2 Institutional Compliance (Household Vault)
- **Signature Audit**: Real-time tracking of executed vs. pending waivers across the entire organization.
- **Digital Execution Hub**: Direct portal for guardians to sign necessary legal and safety documents.

---

## 8. Facilities & Resource Management
- **Venue Enrollment**: Coordinate and manage physical locations (Venues).
- **Sub-Resource Mapping**: Recursive management of fields, courts, and specific zones within a venue.
- **Equipment Inventory**:
    - **Asset Calibration**: Categorize and track inventory levels for institutional equipment.
    - **Deployment Tracking**: Monitor assignment of assets to specific squads or members.

---

## 9. Global Utilities & Governance
- **Global Search**: Deep-linking system for finding members, squads, or institutional records.
- **Season Reset Protocol**: Irreversible data purge mechanism for squad admins to clear match ledgers and itineraries for new seasons.
- **Branded PDF Utility**: Standardized exporter for schedules, standings, safety reports, and financial logs.
- **Operational Manuals**: Institutional "How-To" manuals integrated into the UI for Pro-tier users.
- **Identity Architect**: Extensive profile management including tactical bios and real-time avatar syncing.

---

## 10. Technology Stack
- **Framework**: Next.js (App Router)
- **Database**: Firebase Firestore (utilizing `collectionGroup` for cross-squad compliance auditing)
- **Authentication**: Firebase Auth with RBAC-enhanced metadata.
- **Payments**: Stripe (Connect/Subscriptions)
- **AI Integration**: Straico API for tactical generation and institutional logic assistance.
