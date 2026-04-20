# THE SQUAD: COMPREHENSIVE AI KNOWLEDGE BASE & TECHNICAL SCHEMA

This document is the definitive source of truth for "The Squad" (Studio v2.1). It provides granular detail on every architectural layer, feature set, user workflow, and technical constraint within the platform.

---

## 1. STRATEGIC ARCHITECTURE & TECH STACK

### A. Core Framework
- **Next.js 15.5+**: React-based framework utilizing App Router for institutional-grade routing.
- **Tailwind CSS**: Utility-first styling with a custom design system centered on "Championship Red" and "Midnight Black" tokens.
- **Lucide React**: Vector-based iconography for consistent visual language.

### B. Persistence Layer (Firebase)
- **Cloud Firestore**: Real-time NoSQL database.
- **Firebase Authentication**: Secure user identity management.
- **Firebase Storage**: Object storage for large tactical assets (video/high-res images).
- **Client-Side Initialization**: Managed via `@/firebase/config.ts` and `@/firebase/client-provider.tsx`.

---

## 2. DETAILED USER ROLES & PERMISSION MATRIX

The system operates on an hierarchical permission model managed via the `isStaff` and `isPro` flags in the `TeamProvider`.

### I. Institutional Staff (Coaches/Directors)
- **Drill Management**: Create, edit, and delete tactical protocols. Enable compression for large assets.
- **Compliance Enforcement**: Toggle "Mandatory 75% Watch" on any video.
- **Financial Oversight**: Access to `Institutional Hub` and `Fiscal Pulse`.
- **Roster Controls**: Edit player profiles, assign roles, and manage attendance in the matrix.
- **Event Orchestration**: Create tournaments, generate brackets, and export branded PDF itineraries.

### II. Athletes (Players)
- **Tactical Access**: Restricted to authorized drills and film.
- **Progress Tracking**: Personal dashboard showing "Verified" vs "Pending" tactical assignments.
- **Recruiting Portfolio**: Access to their own performance logs and evaluation memos for college export.

### III. Guardians (Parents)
- **Unified Household Hub**: Managing 1-N children from a single login.
- **Administrative Compliance**: Signing medical waivers and providing insurance documentation.
- **Fiscal Responsibility**: Handling dues, tournament fees, and equipment deposits.

---

## 4. MODULE DEEP-DIVE

### MODULE A: TACTICAL PLAYBOOK HUB
- **Drill Cards**: Responsive units using `rounded-[2.5rem]`. Contains metadata (category, duration, difficulty).
- **Tactical Viewer**: A specialized dual-pane environment.
    - **Video Pane**: Supports YouTube embed and raw HTML5 MP4/MOV playback. Includes `startWatchTracking` logic.
    - **Command Center Sidebar**: Tracks "Tactical Marks" (timestamped comments) and roster-wide watch compliance.
- **Mandatory 75% Watch Engine**:
    - **Logic**: Uses `onTimeUpdate` for raw video and post-message timers for YouTube.
    - **Verification**: Once 75% of the duration is reached, the system writes to the `watchedBy` map within the Firestore document.

### MODULE B: COACHES CORNER & AI SCOUTING
- **AI Scouting Reports**: Utilizes the `analyze` route. Converts raw unstructured text into structured JSON.
- **HD Tactical Capture (FFmpeg)**: 
    - **Engine**: `ffmpeg-processor.ts`.
    - **Action**: Extracts frames at high bitrate from raw source files to capture specific plays or defensive positioning.
- **Personnel Evaluation Ledger**: A private "Staff Only" section for writing long-form performance reviews. Each review can be tagged as "Recruiting Ready" to appear in the player's external portfolio.

### MODULE C: ELITE TOURNAMENT ENGINE
- **Tournament Architect**: Create multi-round elimination brackets.
- **Match Result Logic**: Propagates winners to the next tier in real-time.
- **Spectator Hub**: A public-facing route (e.g., `/tournament/[id]`) where fans can see live brackets and standings.
- **Scorekeeper Portal**: A simplified mobile interface for venue staff to input final scores directly from the court/field.

### MODULE D: INSTITUTIONAL HUB & ROSTER MATRIX
- **Squad Pulse Matrix**: A large grid combining attendance, payment status, and mandatory watch compliance.
- **Form Architect**: Custom registration forms with support for "Digital Signature" fields (React Signature Canvas).
- **Insurance Vault**: Secure storage for athlete medical cards and waiver PDFs.

---

## 5. REPETITIVE WORKFLOWS (HOW-TO)

### How to Manage Timezone Consistency
- **Rule**: Never use `new Date()` for event selection.
- **Step**: Use `parseISO` from `date-fns` to ensure the local date selected by the coach remains consistent across all teammate devices, regardless of their UTC offset.

### How to Fix "Operation Failed" (Large Images)
- **Technical Context**: Firestore documents are capped at 1MB.
- **Manual Intervention**: The system uses `canvas-based compression`. If an upload fails, verify the image is under 5MB raw. The `compressImage` utility will scale it down to under 500KB before commit.

### How to Export a Branded PDF Briefing
1. Select an event in the **Event Dashboard**.
2. Click the **Tactical Plan** tab.
3. Use the **Drill Injector** to pull protocols from the Playbook.
4. Click **Export Briefing**.
5. The `jsPDF` engine will render the "Championship Red" header, institution logo, and list of drill objectives chronologically.

---

## 6. TROUBLESHOOTING & EDGE CASES

- **Missing Firestore Indexes**: If the "Squad Pulse" matrix fails to load, check the browser console for a Firebase Index link. These are required for multi-field queries (e.g., `attendance + teamId`).
- **Media Playback Issues**: Mixed content (HTTP vs HTTPS) in video URLs will cause failures. YouTube links must follow the `embed/[id]` or `watch?v=[id]` format.
- **State Stutters**: Ensure `activeTeam` is correctly set in the `TeamProvider`. All hooks rely on this context to fetch relevant data.

---
## 7. DESIGN TOKENS (CSS VARS)
- `--primary`: Institutional Red (#D70015).
- `--foreground`: Deep Slate / Midnight Black.
- `--radius`: Uniform 0.5rem for small items, 2.5rem - 3.5rem for institutional cards and modals.

---
*Manual Version: 2.1.0*
*Document Status: FINAL*
