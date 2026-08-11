"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ChevronLeft, 
  CalendarDays, 
  Shield, 
  Trophy, 
  Dumbbell, 
  MessageSquare, 
  Users2, 
  FolderClosed,
  Zap,
  CheckCircle2,
  Lock,
  Info,
  CreditCard,
  Building,
  Plus,
  BarChart2,
  ExternalLink,
  Signature,
  Download,
  Settings,
  Bell,
  Camera,
  Share2,
  History,
  AlertTriangle,
  HeartPulse,
  ShieldCheck,
  MousePointer2,
  Smartphone,
  Check,
  Video,
  Play,
  HardDrive,
  ClipboardList,
  UserPlus,
  BookOpen,
  ArrowRight,
  User,
  Baby,
  Table,
  Target,
  Activity,
  DollarSign,
  PenTool,
  Hash,
  MapPin,
  Package,
  Terminal,
  Megaphone,
  HandHelping,
  GraduationCap,
  Award,
  CircleCheck,
  RotateCcw,
  Radio,
  EyeOff,
  PiggyBank,
  MessageCircle,
  Medal,
  LayoutDashboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';

type AccountType = 'starter' | 'pro' | 'elite' | 'school' | 'player' | 'parent';

interface ManualSection {
  title: string;
  icon: any;
  badge?: string;
  steps: Array<{ step: string; detail: React.ReactNode }>;
}

export default function HowToGuidePage() {
  const router = useRouter();
  const { user } = useUser();
  const [selectedType, setSelectedAccountType] = useState<AccountType | null>(null);

  // ─── CORE BLOCKS ───────────────────────────────────────────────────────────

  const BLOCK_DEPLOYMENT = {
    title: "1. Squad Deployment & Recruitment",
    icon: UserPlus,
    steps: [
      { step: "Create Your Squad", detail: <>From the <strong>Dashboard</strong>, tap <strong>+ New Squad</strong>. Choose a squad name, sport, and tier. The <strong>Starter Squad</strong> tier is free forever — no credit card required.</> },
      { step: "Get Your Join Code", detail: <>Navigate to <strong>Settings → Team Profile</strong>. Your unique <strong>6-character Squad Code</strong> is displayed prominently. This is the only way for others to join your specific team — keep it secure.</> },
      { step: "Invite Members", detail: <>Share your code via text, email, or printed on team documents. Members go to the <strong>Recruitment Hub</strong> on their app and enter the code to immediately link their profile to your squad.</> },
      { step: "Assign Roles", detail: <>In the <strong>Roster</strong> hub, tap any member to open their profile. Promote them to <strong>Coach</strong> or <strong>Staff</strong> using the <strong>Role</strong> dropdown — this grants them administrative capabilities in the app.</> },
      { step: "Customize Your Squad Code", detail: <>Admins can change the squad's join code at any time from <strong>Settings → Team Code</strong>. This is useful for preventing unauthorized re-joins at the start of a new season.</>}
    ]
  };

  const BLOCK_SCHEDULING = {
    title: "2. Strategic Scheduling & Calendar",
    icon: CalendarDays,
    steps: [
      { step: "Create an Event", detail: <>In the <strong>Schedule</strong> tab, tap <strong>+ New Activity</strong>. Choose from <strong>Practice</strong>, <strong>Match Day</strong>, <strong>Tournament</strong>, or <strong>Meeting</strong>. Set the date, start time, end time, and location.</> },
      { step: "Calendar Overview", detail: <>Tap the <strong>Calendar</strong> view toggle (grid icon, top right) for a full monthly or weekly view of all upcoming activities. Color-coded by type for instant orientation.</> },
      { step: "RSVP Tracking", detail: <>Every event has an attendance panel. Tap any event card and scroll to <strong>Attendance</strong> to see a real-time count of <strong>Going ✓</strong>, <strong>Maybe ?</strong>, and <strong>Not Going ✗</strong> responses from the roster.</> },
      { step: "Attach Details", detail: <>Add a venue address, custom notes, and a link to a location map inside each event. Players can tap the address to open directions directly in their maps app.</> },
      { step: "Tournament Blocks", detail: <>Creating a <strong>Tournament</strong> event opens the full tournament scheduling engine (Pro/Elite). For basic tournaments, use the <strong>Manual Bracket</strong> entry mode to log game results by hand.</>}
    ]
  };

  const BLOCK_FEED = {
    title: "3. Squad Feed & Announcements",
    icon: Radio,
    badge: "Pro Feature",
    steps: [
      { step: "What Is the Feed?", detail: <>The <strong>Feed</strong> is your squad's real-time social command center. All squad-wide announcements, practice updates, event changes, and media posts appear here in chronological order.</> },
      { step: "Posting as a Coach", detail: <>Staff members can tap the <strong>+ Post</strong> button to publish text updates, attach images, or link to events. All squad members immediately see the post in their Feed.</> },
      { step: "System Events in the Feed", detail: <>The system automatically posts to the Feed when key events happen: a new team member joins, an event is created, or a score is logged. These are non-deletable audit trail entries.</> },
      { step: "Like & Comment", detail: <>Any squad member can react with a <strong>Like</strong> and post replies in the comments thread beneath any post. Coaches can pin important posts to the top of the Feed.</> },
      { step: "Restrict Read-Only Access", detail: <>By default, players can read but not post in the Feed. You can turn off Feed access entirely for your squad via <strong>Settings → Module Visibility</strong>.</>}
    ]
  };

  const BLOCK_ROSTER = {
    title: "4. Roster Management",
    icon: Users2,
    steps: [
      { step: "View Your Roster", detail: <>The <strong>Roster</strong> hub displays every member linked to your squad. Tap any card to open their full profile including position, jersey number, contact info, and staff notes.</> },
      { step: "Edit Player Profiles", detail: <>Coaches and staff can directly edit a player's <strong>Jersey Number</strong>, <strong>Position</strong>, <strong>Emergency Contact</strong>, and <strong>Private Staff Notes</strong>. Player notes are only visible to staff.</> },
      { step: "Track Fees", detail: <>In the roster profile, use the <strong>Fees</strong> section to log any dues owed (e.g., uniform costs, tournament entry fees). Toggle the status between <strong>Paid</strong> and <strong>Owed</strong> to maintain a live ledger.</> },
      { step: "Remove a Member", detail: <>To remove someone from the squad, open their profile and tap <strong>Remove from Squad</strong>. Their data is preserved for record-keeping but they lose all access to the squad's content.</> },
      { step: "Roster Caps", detail: <>Your subscription tier determines how many active members you can hold. The current count and your limit are displayed at the top of the Roster hub.</>}
    ]
  };

  const BLOCK_COMMUNICATION = {
    title: "5. Team Chat & Communication",
    icon: MessageCircle,
    steps: [
      { step: "Create a Channel", detail: <>Open <strong>Team Chat</strong> and tap <strong>+ New Channel</strong>. Name your channel (e.g., "Offense Unit", "Tournament Travel", "Parents"). All squad members or specific groups can be added.</> },
      { step: "Who Can See What", detail: <>Channels can be set to <strong>All Members</strong>, <strong>Staff Only</strong>, or <strong>Custom Group</strong>. Staff-only channels are completely invisible to athletes and parents.</> },
      { step: "Send Messages", detail: <>Type in the message field and tap <strong>Send</strong>. You can also attach images, files from the Library, or link to an event on your schedule for context.</> },
      { step: "Notifications", detail: <>All members in a channel receive a push notification when a new message is sent. Coaches can mark messages as <strong>High Priority</strong> to trigger an urgent, heads-up notification.</> },
      { step: "Admin Controls", detail: <>Coaches can delete any message, mute a member from a channel, or dissolve a channel entirely from the channel settings panel (⚙️ icon, top right of the chat).</>}
    ]
  };

  const BLOCK_SCOREKEEPING = {
    title: "6. Scorekeeping & Performance Tracking",
    icon: Trophy,
    steps: [
      { step: "Log a Score", detail: <>After a match, navigate to the <strong>Schedule</strong>, tap the completed game, then tap <strong>Log Score</strong>. Enter your team's score and the opponent's score. The season record updates instantly.</> },
      { step: "Win/Loss Record", detail: <>Your cumulative <strong>Win/Loss/Tie</strong> record is always visible on the Dashboard. It auto-calculates from every logged Match Day score in your schedule.</> },
      { step: "Tournament Results", detail: <>For tournaments, log individual game scores within the tournament event detail view. The system tracks bracket progression and aggregated tournament records separately from regular season stats.</> },
      { step: "Performance Analytics (Pro)", detail: <>Squad Pro and higher unlock an advanced <strong>Analytics Dashboard</strong> with charts for Points Per Game (PPG) trends, win streaks, opponent performance comparison, and home vs. away records.</> },
      { step: "Staff Evaluations (Pro)", detail: <>Use <strong>Coaches Corner</strong> to keep private athlete evaluations, recruiting-ready notes, photos, and film together for staff review.</>}
    ]
  };

  const BLOCK_PRACTICE = {
    title: "7. Practice Planning & Session Builder",
    icon: Dumbbell,
    badge: "Pro Feature",
    steps: [
      { step: "Build a Practice Plan", detail: <>Open a Practice event and tap the <strong>Tactical Plan</strong> tab. Use the <strong>Session Builder</strong> to sequence drills, warm-ups, and cool-downs into a structured timeline.</> },
      { step: "Inject Drills", detail: <>Search your Playbook library and tap <strong>Inject into Session</strong> on any drill to slot it into your timeline. Drag to reorder blocks within the session.</> },
      { step: "Set Time Blocks", detail: <>Each drill or session block has an editable <strong>Duration</strong> field. The builder auto-totals time to ensure you're staying within your practice window.</> },
      { step: "Export Briefing PDF", detail: <>Tap <strong>Export Tactical Plan</strong> to generate a branded, high-resolution PDF complete with drill diagrams, facility maps, and the Championship Red signature header. Share with staff or print for the whiteboard.</> },
      { step: "Player View", detail: <>Squad members with app access can see the practice plan in their <strong>Schedule</strong> before arriving, so they come prepared with context on the day's objectives.</>}
    ]
  };

  const BLOCK_PLAYBOOK = {
    title: "8. Playbook & Drill Library",
    icon: GraduationCap,
    badge: "Pro Feature",
    steps: [
      { step: "Add a Drill", detail: <>In the <strong>Playbook</strong> tab, tap <strong>+ New Drill</strong>. Give it a name, category (e.g., Offensive, Defensive, Conditioning), difficulty level, and written instructions. Attach a diagram image or link a YouTube video for visual reference.</> },
      { step: "Drill Categories", detail: <>Organize drills using custom category tags. Filter the library by category, difficulty, or position group to quickly find the right drill for any session.</> },
      { step: "Video Study Integration", detail: <>Paste a YouTube URL or upload an MP4 video file to any drill. Enable <strong>Verified Study</strong> to require players to watch at least <strong>75% of the video</strong> before it counts as reviewed in the compliance ledger.</> },
      { step: "Tactical Timestamps", detail: <>Add time-stamped marks to specific moments in a drill video. When players view a mark, their video automatically jumps to that exact frame — perfect for highlighting critical techniques.</> },
      { step: "Film Compliance Tracking", detail: <>Open <strong>Playbook → Compliance</strong> to see a staff ledger showing each player's study progress per assigned drill. Players below 75% are flagged as non-compliant.</>}
    ]
  };

  const BLOCK_VOLUNTEER = {
    title: "9. Volunteer Hub",
    icon: HandHelping,
    badge: "Pro Feature",
    steps: [
      { step: "Post a Volunteer Opportunity", detail: <>Coaches and staff can create volunteer slots in the <strong>Volunteer</strong> hub. Specify the event, role (e.g., "Gate Monitor", "Concessions Staff", "Setup Crew"), date, and how many volunteers are needed.</> },
      { step: "Claim a Slot", detail: <>Squad members (parents and athletes) browse open volunteer opportunities and tap <strong>Claim Slot</strong> to register. The system prevents overbooking once the slot cap is reached.</> },
      { step: "Track Verified Hours", detail: <>Admins mark volunteers as <strong>Checked In</strong> on event day. The system logs the hours automatically and each member's volunteer history and cumulative hour count is stored in their profile.</> },
      { step: "Hour Reports", detail: <>Export a volunteer hours report from the Volunteer hub dashboard. Useful for community service documentation, school credit, and organizational transparency.</> },
      { step: "Reminders", detail: <>The system sends automatic push notification reminders to assigned volunteers 24 hours and 2 hours before their scheduled slot.</>}
    ]
  };

  const BLOCK_FUNDRAISING = {
    title: "10. Fundraising Hub",
    icon: PiggyBank,
    badge: "Pro Feature",
    steps: [
      { step: "Launch a Campaign", detail: <>In the <strong>Fundraising</strong> hub, tap <strong>+ New Campaign</strong>. Set a campaign name, monetary goal, deadline, and a description of what the funds will be used for (e.g., "New Uniforms Fund", "Tournament Travel Fund").</> },
      { step: "Log Contributions", detail: <>As donations or fundraising proceeds are collected, log each contribution manually under the campaign. The system tracks running totals and shows a progress bar toward the goal.</> },
      { step: "Assign Contribution Goals", detail: <>Set per-member fundraising targets so each athlete knows their individual responsibility. The leaderboard view shows progress by athlete to drive engagement.</> },
      { step: "Track Goal Progress", detail: <>The campaign dashboard shows a live progress bar, total collected vs. goal, number of contributors, and days remaining. Share the campaign status in the Feed to maintain momentum.</> },
      { step: "Close a Campaign", detail: <>When the fundraising window ends, tap <strong>Close Campaign</strong> to archive it. A final summary is stored in the hub's history, showing total raised, contributors, and goal completion percentage.</>}
    ]
  };

  const BLOCK_LIBRARY = {
    title: "11. Document Library",
    icon: FolderClosed,
    steps: [
      { step: "Upload Documents", detail: <>In the <strong>Library</strong> module, tap <strong>+ Upload</strong> to add PDF documents, images, spreadsheets, or any other files that your squad needs access to (e.g., rule books, maps, permission slips, handbooks).</> },
      { step: "Organize Into Folders", detail: <>Create folders to keep the Library tidy. Common structures include <em>"Season Docs"</em>, <em>"Tournament Maps"</em>, <em>"Compliance"</em>, and <em>"Training Resources"</em>.</> },
      { step: "Share Files", detail: <>All documents in the Library are accessible to every squad member with app access. Files can be downloaded directly to a device or opened for in-app viewing.</> },
      { step: "Access Control", detail: <>Coaches can flag documents as <strong>Staff Only</strong> to prevent players or parents from seeing them. Staff-only files still appear in the library but are hidden to non-staff members.</> },
      { step: "Link to Events", detail: <>When creating or editing an event, you can attach Library files directly to the event card — for example, attaching a tournament map or venue rules PDF to a Tournament Day event.</>}
    ]
  };

  const BLOCK_MODULE_VISIBILITY = {
    title: "12. Module Visibility Controls (Admin Only)",
    icon: EyeOff,
    steps: [
      { step: "What Is Module Visibility?", detail: <>Some squads don't use every feature. <strong>Module Visibility</strong> lets Admin staff toggle specific sidebar modules on or off. When a module is disabled, it disappears completely from the sidebar for every member on the squad — keeping the interface clean and focused.</> },
      { step: "Accessing the Controls", detail: <>Go to <strong>Settings</strong> (gear icon in the sidebar footer). Scroll to the <strong>Module Visibility</strong> section. This section is only visible to users with <strong>Coach</strong>, <strong>Staff</strong>, or <strong>Admin</strong> roles.</> },
      { step: "Toggle a Module Off", detail: <>Each module has its own toggle switch: <strong>Feed</strong>, <strong>Roster</strong>, <strong>Practice</strong>, <strong>Playbook</strong>, <strong>Volunteer</strong>, <strong>Fundraising</strong>, <strong>Team Chat</strong>, and <strong>Library</strong>. Turn a switch off to hide that module for the team.</> },
      { step: "Route Protection", detail: <>Disabled modules are <strong>fully protected</strong>. Even if a member tries to navigate to a hidden module by typing the URL directly (e.g., <code>/practice</code>), the system will automatically redirect them back to the Dashboard and display an <em>"Access Denied"</em> notification.</> },
      { step: "Re-enabling a Module", detail: <>Simply flip the toggle back to ON at any time. The module instantly reappears in all members' sidebars. Module settings are stored per-squad, so each squad you manage can have a different configuration.</>}
    ]
  };

  // ─── ADVANCED / PRO BLOCKS ─────────────────────────────────────────────────

  const BLOCK_PRO_ACTIVATION = {
    title: "13. Activating Elite Status",
    icon: Zap,
    steps: [
      { step: "Upgrade Your Plan", detail: <>Visit <strong>Settings → Subscription Intelligence</strong> and tap <strong>Manage Elite Seat</strong> to view billing options. Select Squad Pro, Elite, or League plans depending on your organizational needs.</> },
      { step: "Provision a Seat", detail: <>After upgrading, visit <strong>Team Profile</strong> and use <strong>Override Tier</strong> to attach the Pro seat to your primary squad. The squad badge updates immediately to reflect the new tier.</> },
      { step: "Unlock Modules", detail: <>Once your tier is activated, Pro features like Feed posting, Practice planning, Film compliance, Volunteer Hub, Fundraising Hub, and scouting portfolios unlock automatically. No manual activation needed.</> },
      { step: "Add Extra Teams", detail: <>Your plan includes a set number of squad seats. If you need more, purchase <strong>Extra Squad Add-ons</strong> from the billing portal to expand your roster of managed teams without changing your base plan.</>}
    ]
  };

  const BLOCK_TOURNAMENT_ENGINE = {
    title: "14. Elite Tournament Engine",
    icon: Table,
    badge: "Pro Feature",
    steps: [
      { step: "Initialize a Tournament", detail: <>Create a <strong>Tournament</strong> event in the Schedule. Navigate to the event detail and tap <strong>Deploy Tournament Engine</strong>. Enter all participating team names to initialize the bracket system.</> },
      { step: "Auto-Scheduler", detail: <>Define match durations and break times, then tap <strong>Deploy Complex Itinerary</strong>. The engine auto-generates all pairings across available fields or courts and populates a full time-table.</> },
      { step: "Spectator Hub", detail: <>In the <strong>Portals</strong> section, generate a public <strong>Spectator Hub URL</strong>. Share with fans, families, and community members for live score updates and the tournament bracket view — no app account required.</> },
      { step: "Scorekeeper Hub", detail: <>Generate a <strong>Scorekeeper Hub</strong> URL for field marshals. This restricted portal lets designated scorekeepers update live scores from any device without requiring a full app login.</> },
      { step: "Registration Integration", detail: <>Connect a public registration form (built in the Leagues module) to the tournament so teams can self-register. Registrations automatically populate into the tournament bracket engine.</>}
    ]
  };

  const BLOCK_FILM_COMPLIANCE = {
    title: "15. Tactical Film Study & Compliance",
    icon: Video,
    badge: "Pro Feature",
    steps: [
      { step: "Upload Tactical Film", detail: <>In <strong>Playbook → Archive</strong>, paste a YouTube link or upload an MP4 directly from your device. Files are securely stored in your squad's institutional vault (up to 10GB).</> },
      { step: "Enable Verified Study", detail: <>Toggle the <strong>Verified Study</strong> switch on any video. The system now tracks individual player engagement — tracking exactly how far into the video each athlete has watched in real time.</> },
      { step: "The 75% Rule", detail: <>The squad standard requires athletes to watch <strong>at least 75%</strong> of any mandatory video to be marked <em>Compliant</em>. Athletes below 75% appear with a warning flag in the staff compliance ledger.</> },
      { step: "Tactical Timestamp Marks", detail: <>Add time-stamped marks to key moments (e.g., "Opponent's set play" at 2:14). When a player taps a mark in their view, the video automatically seeks to that exact frame for targeted review.</> },
      { step: "Compliance Ledger", detail: <>Open <strong>Playbook → Compliance</strong>. The staff-only ledger shows each roster member's per-video watch percentage. Non-compliant players are highlighted in amber — coaches can use this for eligibility and practice decisions.</>}
    ]
  };

  const BLOCK_BRIEFING_UNIT = {
    title: "16. Branded Briefing Unit (PDF Export)",
    icon: Download,
    badge: "Pro Feature",
    steps: [
      { step: "Open a Practice or Event", detail: <>Navigate to any <strong>Practice</strong> or <strong>Match Day</strong> event. Open the <strong>Tactical Plan</strong> tab to access the session builder.</> },
      { step: "Build Your Session", detail: <>Add warm-up blocks, drill sequences (pulled from your Playbook), and cool-down segments. Set durations for each block. The builder shows a running total to keep you within your time window.</> },
      { step: "Export as PDF", detail: <>Tap <strong>Export Tactical Plan</strong>. The system generates a professional-grade, branded PDF featuring your squad name, date, full drill timeline, coaching notes, and the Championship Red signature.</> },
      { step: "Share or Print", detail: <>Download the PDF to your device, email it to staff, or share it with assistant coaches. Works great printed for the whiteboard or distributed on the sideline.</>}
    ]
  };

  const BLOCK_HIGH_PRIORITY = {
    title: "17. High-Priority Broadcast Command",
    icon: Megaphone,
    steps: [
      { step: "Send a Broadcast Alert", detail: <>Tap the <strong>Megaphone</strong> icon (top of the Dashboard or Feed) to compose an urgent, squad-wide alert. Broadcast alerts appear as a full-screen banner on every active squad member's device.</> },
      { step: "Use Cases", detail: <>Best for emergency notifications: venue changes at the last minute, weather cancellations, urgent safety notices, or time-sensitive travel updates. Ordinary updates should use the Feed instead.</> },
      { step: "Delivery Confirmation", detail: <>The system logs a delivery timestamp and tracks which members have acknowledged the alert. Coaches can see who hasn't opened it yet and manually follow up.</>}
    ]
  };

  const BLOCK_FILM_PORTFOLIOS = {
    title: "18. Film Archive & Scouting Portfolios",
    icon: Video,
    badge: "Pro Feature",
    steps: [
      { step: "Archive Athlete Film", detail: <>Open an athlete in <strong>Coaches Corner</strong>, choose <strong>Add Film</strong>, and upload a supported video or paste a hosted video URL.</> },
      { step: "Organize the Reel", detail: <>Give each clip a clear title and type so staff can scan the athlete's film library and open the right footage quickly.</> },
      { step: "Record Staff Evaluations", detail: <>Add private personnel evaluations and mark approved entries as <strong>Recruiting Ready</strong> when they can appear in the athlete's external portfolio.</> },
      { step: "Export the Scouting Pack", detail: <>Use the roster profile to generate the athlete's scouting pack with approved profile details, evaluations, media, and recruiting information.</>}
    ]
  };

  const BLOCK_STRIPE_PAYMENTS = {
    title: "Online Payments & Stripe Connect",
    icon: CreditCard,
    badge: "Pro Feature",
    steps: [
      { step: "Connect Your Stripe Account", detail: <>From <strong>Coaches Corner → Finance tab</strong>, find the black <em>"Connect Stripe to Accept Payments"</em> card. Click <strong>"Connect Stripe."</strong> You'll be redirected to Stripe to create or link a free Stripe Express account. Once complete, you're redirected back to The Squad automatically.</> },
      { step: "Create a Payment Item", detail: <>Once connected, use the <strong>"+ New Payment Item"</strong> button to create a named payable line item: e.g., <em>"Spring Tournament Registration Fee — $45."</em> Give it a name, amount, and optional description.</> },
      { step: "Share a Payment Link", detail: <>Each payment item generates a unique Stripe-hosted payment link. Share the link in the squad Feed, Team Chat, or by text. Players or parents click it and pay securely directly to your Stripe account.</> },
      { step: "Track Payments", detail: <>Payment records appear in the <strong>Finance tab ledger</strong> in real-time. See who has paid, amounts received, and outstanding balances — all without leaving the app.</> },
      { step: "Hub Payment Routing (Elite/Org)", detail: <>In <strong>Club Hub → Finance tab</strong>, choose between <strong>Shared Hub Account</strong> (all squad payments route to one hub Stripe account) or <strong>Per-Squad Accounts</strong> (each squad connects their own Stripe). Toggle the mode and connect at the appropriate level.</> }
    ]
  };

  const BLOCK_ANNUAL_SUBSCRIPTION = {
    title: "Annual Subscription & Billing",
    icon: DollarSign,
    steps: [
      { step: "Switch to Annual Billing", detail: <>On the pricing page or in <strong>Settings → Subscription Intelligence</strong>, toggle from <strong>Monthly</strong> to <strong>Annual</strong> billing. Annual plans are billed once per year at a discounted rate.</> },
      { step: "Annual Savings", detail: <>Switching to annual saves <strong>15–20%</strong> compared to monthly billing. The discounted rate displays as a <em>'per month' equivalent</em> so you can compare easily.</> },
      { step: "Billing Management", detail: <>Visit <strong>Settings → Subscription Intelligence</strong> and tap <strong>"Manage Elite Seat"</strong> to view invoices, update your payment method, or change your billing cycle at any time via the Stripe billing portal.</> }
    ]
  };

  const BLOCK_GLOBAL_WAIVERS = {
    title: "Global Waivers & Coach Compliance",
    icon: ShieldCheck,
    badge: "Elite/Org Feature",
    steps: [
      { step: "Deploy a Global Waiver (Hub Admin)", detail: <>In <strong>Club Hub → Waivers tab</strong>, click <strong>"+ New Waiver."</strong> Write or paste your waiver content (e.g., a liability release, code of conduct). Click <strong>"Save & Deploy Waiver."</strong> The waiver is instantly pushed to every squad in your organization.</> },
      { step: "Coach Notification", detail: <>When a global waiver is deployed, every coach that opens Coaches Corner immediately sees an <strong>amber notification banner</strong> at the top: <em>"[N] Global Waiver(s) Require Your Signature."</em> The <strong>"Legal Docs"</strong> tab also shows a red badge dot.</> },
      { step: "Coaches Sign the Waiver", detail: <>Coaches click <strong>"Review & Sign"</strong> on the banner or go to the <strong>Legal Docs tab → Hub Global Waivers</strong> section. They can read the full waiver content, then click <strong>"I Agree & Sign."</strong> Their signature (name + timestamp) is permanently recorded.</> },
      { step: "Monitor Compliance", detail: <>In <strong>Club Hub → Waivers tab</strong>, the <strong>"Institutional Vault"</strong> shows a real-time signature count per squad. Each waiver card shows how many coaches have signed.</> },
      { step: "Waiver Library Audit Trail", detail: <>Signed coach waivers appear in the <strong>Waiver Library tab (Vault Archives)</strong> alongside member signatures, with a <em>'Coach' role tag</em>. All signatures include the signatory's name and date for legal compliance.</> }
    ]
  };

  // ─── INSTITUTIONAL / ADMIN BLOCKS ─────────────────────────────────────────

  const BLOCK_FISCAL_AUDIT = {
    title: "19. Institutional Fiscal Pulse",
    icon: DollarSign,
    steps: [
      { step: "Aggregated Dues Tracking", detail: <>Organization directors use the <strong>Club Hub</strong> to view a master ledger of all collected fees, outstanding balances, and payment statuses across every squad in the organization simultaneously.</> },
      { step: "Override Payment Status", detail: <>Staff can directly override payment status and adjust fee amounts in the <strong>Squad Pulse</strong> matrix to reflect offline transactions, partial payments, or sponsorship offsets.</> },
      { step: "Export Reports", detail: <>Generate and export a full fiscal audit report from the Club Hub. Useful for board meetings, annual reporting, or grant applications.</>}
    ]
  };

  const BLOCK_CLUB_HUB = {
    title: "20. Institutional Club & Org Hub",
    icon: Building,
    steps: [
      { step: "Accessing the Hub", detail: <>Elite Org and League plan holders are automatically directed to the <strong>Club Hub</strong> when logging in. This central command center shows all squads under your organization in one place.</> },
      { step: "Fiscal Pulse", detail: <>View a real-time, aggregated fiscal dashboard showing dues collected, amounts owed, and outstanding balances across every squad in your entire organization.</> },
      { step: "Scheduling Conflict Audit", detail: <>The <strong>Conflict Engine</strong> cross-references all squad schedules to surface date/venue overlaps before they become a problem. Resolve conflicts by reassigning facilities or times from within the hub.</> },
      { step: "Multi-Squad Management", detail: <>Tap any squad card in the hub to enter that squad's full operational view — you can manage any team in your organization without logging out. Switch back to the hub view using the squad switcher.</>}
    ]
  };

  const BLOCK_INSTITUTIONAL_PROTOCOLS = {
    title: "21. Institutional Protocols & Mandates",
    icon: ShieldCheck,
    steps: [
      { step: "Master Waiver Architect", detail: <>In <strong>Club Hub → Global Compliance</strong>, tap <strong>Deploy Global Protocol</strong> to craft a mandate (waiver, liability release, code of conduct) that will cascade across selected squads.</> },
      { step: "Select Target Squads", detail: <>Choose which squads the mandate applies to. The system pushes the document to every selected squad's Library simultaneously and alerts the respective coaches that action is required.</> },
      { step: "Monitor Execution", detail: <>Open the <strong>Institutional Vault</strong> to see a real-time signature count per squad. A traffic-light status (Green = 100%, Amber = in progress, Red = not started) gives instant visibility across the organization.</> },
      { step: "Digital Signatures", detail: <>All signatures capture the signee's legal name, timestamp, IP address, and device fingerprint. These are permanently stored and exportable for legal compliance purposes.</>}
    ]
  };

  const BLOCK_RECRUITMENT_PORTAL = {
    title: "22. Public Recruitment & Registration Portal",
    icon: ClipboardList,
    steps: [
      { step: "Build a Registration Form", detail: <>In <strong>Leagues → Registration</strong>, use the <strong>Form Architect</strong> to build a custom intake form. Add fields for player info, medical history, guardian contacts, digital waivers, and custom questions.</> },
      { step: "Generate a Public Portal URL", detail: <>Once the form is published, a unique <strong>Portal URL</strong> is generated. Share this link on your website, social media, or in flyers — anyone can register without needing an existing app account.</> },
      { step: "Review Applicants", detail: <>All submissions appear in the <strong>Applicant Ledger</strong> in your Leagues hub. Review each submission, flag issues, and approve or decline registrations.</> },
      { step: "Deploy to Squads", detail: <>Approved applicants can be deployed to specific squads with one click. The system creates their app account and links them directly to the correct team, bypassing the manual invite-code process.</>}
    ]
  };

  const BLOCK_FLEET_LOGISTICS = {
    title: "23. Facilities & Equipment Vault",
    icon: Package,
    steps: [
      { step: "Facilities Management", detail: <>Enroll venues in the <strong>Facilities</strong> hub by adding name, address, field/court count, capacity, and any notes (parking, access codes, etc.). Assign venues to events to automatically block off that resource on a shared calendar.</> },
      { step: "Conflict Detection", detail: <>The system flags double-bookings when two events in the same organization try to claim the same facility at overlapping times. Admins are alerted and prompted to resolve the conflict.</> },
      { step: "Equipment Inventory", detail: <>In the <strong>Equipment</strong> hub, log every piece of team gear: uniforms, balls, cones, electronics. Track quantity, condition, and current assignment.</> },
      { step: "Player Assignment Tracking", detail: <>Assign equipment items (e.g., jersey #22) to a specific roster member. The system tracks who has what and when it's due back — ideal for recovering loaned gear at the end of a season.</>}
    ]
  };

  // ─── SCHOOL BLOCKS ─────────────────────────────────────────────────────────

  const BLOCK_SCHOOL_HUB = {
    title: "24. K-12 School District Hub",
    icon: GraduationCap,
    steps: [
      { step: "District Dashboard", detail: <>Athletic Directors are automatically directed to the <strong>School Hub</strong> on login. It shows an aggregated dashboard across all school squads: Varsity, JV, Freshman, and Junior High teams in one unified view.</> },
      { step: "Coach Management", detail: <>From the <strong>District Command</strong> panel, add or remove coaches across any squad, adjust their permission levels, and ensure the right staff have access to the right programs.</> },
      { step: "Multi-Squad Coordination", detail: <>Link all squads under the school's institutional identity. Share facilities, schedules, and compliance mandates across all affiliated teams without duplicating effort for each squad separately.</> },
      { step: "Accessing Individual Squads", detail: <>Tap any squad card in the School Hub to enter that squad's full operational view. Athletic Directors can see and manage every aspect of any squad, exactly as the coach would see it.</>}
    ]
  };

  const BLOCK_SCHOOL_COMPLIANCE = {
    title: "25. School-Wide Compliance & Eligibility",
    icon: ShieldCheck,
    steps: [
      { step: "Academic Eligibility Tracking", detail: <>Log GPA requirements and current academic standing for each student-athlete. The system flags any athlete below the eligibility threshold, prompting the coach or AD to review before the next competition.</> },
      { step: "Physical Clearance Management", detail: <>Record physical examination dates for each athlete. The system automatically tracks expiration dates and sends advance alerts when a physical is nearing its deadline — ensuring no athlete competes with an expired clearance.</> },
      { step: "Emergency Action Plans", detail: <>Deploy district-wide emergency action plans (concussion protocols, anaphylaxis procedures, evacuation plans) to every squad's Library simultaneously, ensuring all coaches have access to critical safety documentation.</>}
    ]
  };

  const BLOCK_SCHOOL_RECRUITING = {
    title: "26. School Recruiting Coordination",
    icon: Award,
    steps: [
      { step: "College Interest Tracking", detail: <>Log each senior athlete's college recruitment status (Interested, Offered, Committed) from their Roster profile. This creates an aggregated view of the school's recruiting pipeline across all sports.</> },
      { step: "Scouting Reports", detail: <>Coaches can write and store scouting reports for individual athletes directly in the app. These reports can be shared securely with verified college coaches through the school's recruitment portal.</> },
      { step: "Game Film Distribution", detail: <>Use the Playbook vault to securely share game film clips with college scouts and coaches. Set individual file access permissions to control exactly who can view specific footage.</>}
    ]
  };

  // ─── PLAYER / PARENT BLOCKS ────────────────────────────────────────────────

  const BLOCK_PLAYER_HUB = {
    title: "Player Dashboard",
    icon: User,
    steps: [
      { step: "Join a Squad", detail: <>Enter the 6-character <strong>Squad Code</strong> provided by your coach in the <strong>Recruitment Hub</strong>. Your profile instantly links to the squad and you gain full access to the team's content.</> },
      { step: "View Your Schedule", detail: <>The <strong>Schedule</strong> tab shows every upcoming practice, match, and event. RSVP to each event using the <strong>Going / Maybe / Not Going</strong> buttons so your coach knows who to expect.</> },
      { step: "Watch Assigned Film", detail: <>In <strong>Playbook</strong>, find videos assigned by your coach. You must watch at least <strong>75%</strong> of any mandatory video to be marked Compliant in the staff ledger — this can affect your eligibility and playing time.</> },
      { step: "Generate Your Scouting Pack", detail: <>In your Roster profile, tap <strong>Generate Scouting Pack</strong> to export a certified PDF highlighting your stats, position, team, and coach contact — a professional recruiting document for college scouts.</> },
      { step: "Use Team Chat", detail: <>The <strong>Team Chat</strong> module gives you access to channels your coach has added you to. Use it for team updates, travel logistics, and conversations with teammates.</>}
    ]
  };

  const BLOCK_HOUSEHOLD_HUB = {
    title: "Consolidated Household Hub",
    icon: Baby,
    steps: [
      { step: "Manage Multiple Athletes", detail: <>If you have more than one child on different squads, the <strong>Household Hub</strong> lets you switch between each athlete's profile from a single parent account. No multiple logins required.</> },
      { step: "Sign Waivers & Compliance Docs", detail: <>When a coach deploys a waiver or liability document, it appears in your <strong>Compliance</strong> queue. Your digital signature captures your legal name, IP address, and timestamp — satisfying all legal signing requirements.</> },
      { step: "View the Fee Ledger", detail: <>The <strong>Household Fiscal Pulse</strong> shows every outstanding fee across all your children's squads in a single total. No more checking each team separately for what's owed.</> },
      { step: "Volunteer Opportunities", detail: <>Browse open volunteer slots for any of your children's squads and claim them directly. The system tracks your cumulative volunteer hours across all squads in one unified history.</>}
    ]
  };

  const BLOCK_COMMUNITY_BOARD = {
    title: "Community Engagement",
    icon: HandHelping,
    steps: [
      { step: "Claim a Volunteer Slot", detail: <>In the <strong>Volunteer</strong> hub, browse all open opportunities posted by coaches. Tap <strong>Claim Slot</strong> on any role you want to fill. You'll receive a push notification reminder the day before and 2 hours before your shift.</> },
      { step: "Track Your Hours", detail: <>After your volunteer shift, the coach marks you as Checked In, and the hours are automatically added to your verified volunteer history. View your cumulative total from your profile page.</> },
      { step: "Participate in Fundraising", detail: <>The <strong>Fundraising</strong> hub shows active campaigns your squad is running. Coaches log contributions on your behalf, and you can monitor total campaign progress and the leaderboard from the hub.</>}
    ]
  };

  // ─── CONTENT MAP ───────────────────────────────────────────────────────────

  const MANUAL_CONTENT: Record<AccountType, { label: string; desc: string; highlights: string[]; sections: ManualSection[] }> = {
    starter: {
      label: "Starter (Free)",
      desc: "Foundational coordination for grassroots squads — zero cost, forever.",
      highlights: ["Unlimited Teams", "Live Team Chat", "Match Scheduling", "Manual Fee Ledgers", "Drill Archiving", "Document Library", "Module Visibility Controls"],
      sections: [
        BLOCK_DEPLOYMENT,
        BLOCK_SCHEDULING,
        BLOCK_ROSTER,
        BLOCK_COMMUNICATION,
        BLOCK_SCOREKEEPING,
        BLOCK_PLAYBOOK,
        BLOCK_LIBRARY,
        BLOCK_MODULE_VISIBILITY
      ]
    },
    pro: {
      label: "Squad Pro",
      desc: "Exhaustive coordination for serious squads with advanced compliance and analytics.",
      highlights: ["75% Film Compliance", "Practice Builder & PDF Export", "Scouting Portfolios", "Volunteer & Fundraising Hubs", "Squad Feed", "Broadcast Alerts", "Module Visibility", "Stripe Online Payments", "Annual Billing"],
      sections: [
        BLOCK_DEPLOYMENT,
        BLOCK_SCHEDULING,
        BLOCK_FEED,
        BLOCK_ROSTER,
        BLOCK_COMMUNICATION,
        BLOCK_SCOREKEEPING,
        BLOCK_PRACTICE,
        BLOCK_PLAYBOOK,
        BLOCK_VOLUNTEER,
        BLOCK_FUNDRAISING,
        BLOCK_LIBRARY,
        BLOCK_MODULE_VISIBILITY,
        BLOCK_PRO_ACTIVATION,
        BLOCK_TOURNAMENT_ENGINE,
        BLOCK_FILM_COMPLIANCE,
        BLOCK_BRIEFING_UNIT,
        BLOCK_HIGH_PRIORITY,
        BLOCK_FILM_PORTFOLIOS,
        BLOCK_STRIPE_PAYMENTS,
        BLOCK_ANNUAL_SUBSCRIPTION
      ]
    },
    elite: {
      label: "Elite Org (Team/League)",
      desc: "Master institutional infrastructure for organizations, clubs, and leagues.",
      highlights: ["Club Hub", "Institutional Fiscal Pulse", "Public Recruitment Portal", "Institutional Mandates", "Facility Conflict Detection", "Full Module Visibility Controls", "Stripe Online Payments", "Hub Payment Routing", "Global Waiver Signing"],
      sections: [
        BLOCK_DEPLOYMENT,
        BLOCK_SCHEDULING,
        BLOCK_FEED,
        BLOCK_ROSTER,
        BLOCK_COMMUNICATION,
        BLOCK_SCOREKEEPING,
        BLOCK_PRACTICE,
        BLOCK_PLAYBOOK,
        BLOCK_VOLUNTEER,
        BLOCK_FUNDRAISING,
        BLOCK_LIBRARY,
        BLOCK_MODULE_VISIBILITY,
        BLOCK_PRO_ACTIVATION,
        BLOCK_TOURNAMENT_ENGINE,
        BLOCK_FILM_COMPLIANCE,
        BLOCK_BRIEFING_UNIT,
        BLOCK_HIGH_PRIORITY,
        BLOCK_FILM_PORTFOLIOS,
        BLOCK_FISCAL_AUDIT,
        BLOCK_CLUB_HUB,
        BLOCK_INSTITUTIONAL_PROTOCOLS,
        BLOCK_RECRUITMENT_PORTAL,
        BLOCK_FLEET_LOGISTICS,
        BLOCK_STRIPE_PAYMENTS,
        BLOCK_ANNUAL_SUBSCRIPTION,
        BLOCK_GLOBAL_WAIVERS
      ]
    },
    school: {
      label: "School District (K-12)",
      desc: "Full K-12 athletic department hub for district-wide coordination.",
      highlights: ["District Dashboard", "Athletic Director Controls", "Academic Eligibility", "Physical Clearance Tracking", "College Recruiting", "District-Wide Compliance", "Global Waiver Coach Signing", "Online Payments"],
      sections: [
        BLOCK_DEPLOYMENT,
        BLOCK_SCHEDULING,
        BLOCK_FEED,
        BLOCK_ROSTER,
        BLOCK_COMMUNICATION,
        BLOCK_SCOREKEEPING,
        BLOCK_PRACTICE,
        BLOCK_PLAYBOOK,
        BLOCK_VOLUNTEER,
        BLOCK_FUNDRAISING,
        BLOCK_LIBRARY,
        BLOCK_MODULE_VISIBILITY,
        BLOCK_PRO_ACTIVATION,
        BLOCK_TOURNAMENT_ENGINE,
        BLOCK_FILM_COMPLIANCE,
        BLOCK_BRIEFING_UNIT,
        BLOCK_HIGH_PRIORITY,
        BLOCK_FILM_PORTFOLIOS,
        BLOCK_FISCAL_AUDIT,
        BLOCK_INSTITUTIONAL_PROTOCOLS,
        BLOCK_FLEET_LOGISTICS,
        BLOCK_SCHOOL_HUB,
        BLOCK_SCHOOL_COMPLIANCE,
        BLOCK_SCHOOL_RECRUITING,
        BLOCK_GLOBAL_WAIVERS,
        BLOCK_STRIPE_PAYMENTS
      ]
    },
    player: {
      label: "Individual Athlete",
      desc: "Stay coordinated, compliant, and ready. Manage your personal recruiting portfolio.",
      highlights: ["Squad Join via Code", "RSVP to Events", "75% Film Compliance", "Recruiting Portfolio PDF", "Team Chat", "Volunteer Hours Tracking"],
      sections: [
        BLOCK_PLAYER_HUB,
        BLOCK_SCHEDULING,
        BLOCK_COMMUNICATION,
        BLOCK_SCOREKEEPING,
        BLOCK_FILM_COMPLIANCE,
        BLOCK_COMMUNITY_BOARD
      ]
    },
    parent: {
      label: "Parent / Guardian",
      desc: "Unified household command for safety, compliance, fees, and volunteer coordination.",
      highlights: ["Multi-Athlete Household Hub", "Digital Waiver Signing", "Volunteer Hour Tracking", "Centralized Fee Ledger", "Schedule & RSVP Access"],
      sections: [
        BLOCK_HOUSEHOLD_HUB,
        BLOCK_SCHEDULING,
        BLOCK_COMMUNICATION,
        BLOCK_COMMUNITY_BOARD,
        BLOCK_SCOREKEEPING
      ]
    }
  };

  const TYPE_ICONS: Record<AccountType, any> = {
    starter: Users2,
    pro: Zap,
    elite: Building,
    school: GraduationCap,
    player: User,
    parent: Baby
  };

  const TYPE_COLORS: Record<AccountType, string> = {
    starter: 'bg-slate-400',
    pro: 'bg-primary',
    elite: 'bg-black',
    school: 'bg-emerald-500',
    player: 'bg-blue-500',
    parent: 'bg-purple-500'
  };

  const RECENT_WALKTHROUGHS = [
    {
      title: 'Review Your Family Hub',
      role: 'Parent / Guardian',
      description: 'See where each child\'s team, schedule, waivers, and combined family balance appear.',
      image: '/faq/family-hub-mobile.png',
      imageAlt: 'The Squad Family Hub shown on a mobile phone',
    },
    {
      title: 'Use the Player Dashboard',
      role: 'Athlete',
      description: 'Find upcoming activities, team communication, practice resources, and profile actions.',
      image: '/faq/player-dashboard-tablet.png',
      imageAlt: 'The Squad player dashboard shown on a tablet',
    },
    {
      title: 'Create and Edit a League',
      role: 'League Organizer',
      description: 'Confirm a new league, its division, and organizer management controls after deployment.',
      image: '/faq/league-created.png',
      imageAlt: 'A newly created league in The Squad Competition Hub',
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={user ? "/dashboard" : "/"}>
            <BrandLogo variant="light-background" className="h-8 w-32" />
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            className="font-bold" 
            onClick={() => selectedType ? setSelectedAccountType(null) : (user ? router.push('/settings') : router.push('/'))}
          >
            <ChevronLeft className="mr-2 h-4 w-4" /> 
            {selectedType ? 'Back to Selection' : 'Back'}
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-5xl">
        {!selectedType ? (
          <div className="space-y-16 animate-in fade-in duration-700">
            <section className="text-center space-y-6">
              <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Help Guide</Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">Operational <span className="text-primary italic">Manual.</span></h1>
              <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">Complete module-by-module documentation for every account type. Select your role to access your personalized guide.</p>
            </section>

            <section className="space-y-8" aria-labelledby="recent-walkthroughs-title">
              <div className="space-y-2">
                <Badge className="bg-black text-white border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Recently Added</Badge>
                <h2 id="recent-walkthroughs-title" className="text-3xl font-black uppercase tracking-tight">Latest Walkthroughs</h2>
                <p className="text-muted-foreground font-medium">Verified examples captured from the current app experience.</p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
                <article className="overflow-hidden rounded-lg border bg-black text-white shadow-xl">
                  <video
                    className="aspect-video w-full bg-black object-contain"
                    controls
                    preload="metadata"
                    playsInline
                    aria-label="How to create a game walkthrough"
                  >
                    <source src="/faq/how-to-create-a-game.mp4" type="video/mp4" />
                    Your browser does not support embedded video.
                  </video>
                  <div className="space-y-2 p-6">
                    <div className="flex items-center gap-2 text-primary">
                      <Video className="h-4 w-4" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Coach · Schedule</span>
                    </div>
                    <h3 className="text-2xl font-black uppercase tracking-tight">How to Create a Game</h3>
                    <p className="text-sm font-medium leading-relaxed text-white/70">Add a game, enter its opponent and location, save it to the schedule, and verify the details.</p>
                  </div>
                </article>

                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                  {RECENT_WALKTHROUGHS.map((walkthrough) => (
                    <article key={walkthrough.title} className="grid min-h-40 grid-cols-[112px_1fr] overflow-hidden rounded-lg border bg-white shadow-md sm:grid-cols-1 lg:grid-cols-[112px_1fr]">
                      <div className="relative min-h-40 bg-muted sm:aspect-[4/3] lg:aspect-auto">
                        <Image src={walkthrough.image} alt={walkthrough.imageAlt} fill sizes="112px" className="object-cover object-top" />
                      </div>
                      <div className="flex min-w-0 flex-col justify-center space-y-2 p-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary">{walkthrough.role}</span>
                        <h3 className="text-base font-black uppercase leading-tight">{walkthrough.title}</h3>
                        <p className="text-xs font-medium leading-relaxed text-muted-foreground">{walkthrough.description}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Object.keys(MANUAL_CONTENT) as AccountType[]).map((type) => {
                const data = MANUAL_CONTENT[type];
                const Icon = TYPE_ICONS[type];
                
                return (
                  <Card 
                    key={type} 
                    className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group bg-white ring-1 ring-black/5 overflow-hidden"
                    onClick={() => setSelectedAccountType(type)}
                  >
                    <div className={cn("h-2 w-full", TYPE_COLORS[type])} />
                    <CardContent className="p-8 space-y-4">
                      <div className="bg-muted p-4 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-all shadow-inner">
                        <Icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight group-hover:text-primary transition-colors">{data.label}</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">{data.desc}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-2">
                        {data.highlights.slice(0, 3).map((h, i) => (
                          <span key={i} className="text-[9px] font-black uppercase tracking-widest bg-muted px-2 py-1 rounded-full text-muted-foreground">{h}</span>
                        ))}
                        {data.highlights.length > 3 && (
                          <span className="text-[9px] font-black uppercase tracking-widest bg-primary/10 px-2 py-1 rounded-full text-primary">+{data.highlights.length - 3} more</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="text-center pt-4">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Need help? Contact support at{' '}
                <a href="mailto:team@thesquad.pro" className="text-primary underline underline-offset-2">team@thesquad.pro</a>
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
            <section className="space-y-6 border-b pb-8">
              <div className="flex items-center gap-4">
                <div className={cn("p-4 rounded-3xl text-white shadow-inner", TYPE_COLORS[selectedType])}>
                  {React.createElement(TYPE_ICONS[selectedType], { className: "h-8 w-8" })}
                </div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tight">{MANUAL_CONTENT[selectedType].label} Guide</h2>
                  <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">{MANUAL_CONTENT[selectedType].desc}</p>
                </div>
              </div>

              <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed border-primary/20">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 ml-1">Capability Matrix — Your Included Features</p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_CONTENT[selectedType].highlights.map((h, i) => (
                    <Badge key={i} className="bg-white text-black border-none shadow-sm font-black uppercase text-[10px] h-8 px-4">
                      <CheckCircle2 className="h-3 w-3 mr-1.5 text-green-500" />{h}
                    </Badge>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-10">
              {MANUAL_CONTENT[selectedType].sections.map((section, idx) => (
                <Card key={idx} className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
                  <CardHeader className="bg-muted/30 p-8 lg:p-10 border-b flex flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <div className="bg-white p-4 rounded-2xl shadow-sm text-primary">
                        <section.icon className="h-6 w-6" />
                      </div>
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">{section.title}</CardTitle>
                    </div>
                    {section.badge && (
                      <Badge className="bg-primary/10 text-primary border-none font-black uppercase text-[9px] tracking-widest shrink-0">
                        <Zap className="h-2.5 w-2.5 mr-1" />{section.badge}
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="p-8 lg:p-12">
                    <div className="space-y-10">
                      {section.steps.map((s, stepIdx) => (
                        <div key={stepIdx} className="flex gap-8 relative group">
                          {stepIdx < section.steps.length - 1 && (
                            <div className="absolute left-[19px] top-10 w-0.5 h-full bg-muted group-hover:bg-primary/20 transition-colors" />
                          )}
                          <div className="h-10 w-10 rounded-full bg-black text-white flex items-center justify-center shrink-0 font-black text-sm z-10 shadow-lg group-hover:bg-primary transition-colors">
                            {stepIdx + 1}
                          </div>
                          <div className="space-y-2 pt-1">
                            <h4 className="font-black text-lg uppercase tracking-tight text-primary">{s.step}</h4>
                            <div className="text-base font-medium leading-relaxed text-muted-foreground">{s.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="text-center pt-4 pb-20">
              <Button variant="ghost" onClick={() => setSelectedAccountType(null)} className="font-black uppercase text-[10px] tracking-widest text-muted-foreground hover:text-primary">
                <ChevronLeft className="h-3.5 w-3.5 mr-2" /> Back to Account Selection
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
