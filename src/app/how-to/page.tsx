
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  CalendarDays, 
  Shield, 
  Trophy, 
  Dumbbell, 
  MessageCircle, 
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
  MessageSquare,
  Megaphone,
  HandHelping,
  BrainCircuit,
  Wand2,
  GraduationCap,
  Award,
  CircleCheck,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import { cn } from '@/lib/utils';

type AccountType = 'starter' | 'pro' | 'elite' | 'player' | 'parent';

interface ManualSection {
  title: string;
  icon: any;
  steps: Array<{ step: string; detail: React.ReactNode }>;
}

export default function HowToGuidePage() {
  const router = useRouter();
  const { user } = useUser();
  const [selectedType, setSelectedAccountType] = useState<AccountType | null>(null);

  // --- REUSABLE BLOCK DEFINITIONS ---

  const BLOCK_DEPLOYMENT = {
    title: "1. Squad Deployment & Recruitment",
    icon: UserPlus,
    steps: [
      { step: "Launch Team", detail: <>Start at the <strong>Dashboard</strong> and select <strong>New Squad</strong>. Choose the <strong>Starter Squad</strong> tier for a permanent zero-cost hub.</> },
      { step: "Retrieve Join Code", detail: <>Navigate to <strong>Team Profile</strong> to find your unique 6-digit <strong>Squad Code</strong>. This is the only way for others to join.</> },
      { step: "Invite Members", detail: <>Share the code via text or email. Teammates use the <strong>Recruitment Hub</strong> to enroll themselves instantly.</> }
    ]
  };

  const BLOCK_SCHEDULING = {
    title: "2. Strategic Scheduling & Calendar",
    icon: CalendarDays,
    steps: [
      { step: "Create Activity", detail: <>In <strong>Schedule</strong>, use <strong>+ New Activity</strong> to log Match Days, Training, or Meetings. Set location and times.</> },
      { step: "Calendar View", detail: <>Use the <strong>Calendar</strong> tab for a unified chronological view of all squad commitments across multiple teams.</> },
      { step: "Monitor RSVPs", detail: <>Click any event to see who is <strong>Going</strong>, <strong>Maybe</strong>, or <strong>Declined</strong> in real-time.</> }
    ]
  };

  const BLOCK_COMMUNICATION = {
    title: "3. Communication & Social",
    icon: MessageSquare,
    steps: [
      { step: "Squad Feed", detail: <>Use the <strong>Feed</strong> to view system updates and coordination notes. Note: Posting and polls are restricted to <strong>Squad Pro</strong> and <strong>Elite</strong> tiers.</> },
      { step: "Live Tactical Chats", detail: <>Open <strong>Chats</strong> to establish secure messaging groups for specific squad units or travel planning. Use the <strong>Establish Channel</strong> button to create new threads.</> }
    ]
  };

  const BLOCK_SCOREKEEPING = {
    title: "4. Performance Tracking",
    icon: Trophy,
    steps: [
      { step: "Scorekeeping", detail: <>Visit the <strong>Scorekeeping</strong> hub after matches. Enter <strong>Us vs Them</strong> scores to update the season Win/Loss record instantly.</> },
      { step: "Tournament Itineraries", detail: <>Add <strong>Tournament</strong> events to create multi-day calendar blocks for championships. Manual bracket entry is available at all tiers.</> }
    ]
  };

  const BLOCK_PLAYBOOK = {
    title: "5. Playbook & Library",
    icon: Dumbbell,
    steps: [
      { step: "Archive Drills", detail: <>In <strong>Playbook</strong>, add execution protocols with instructions and external video links for squad study.</> },
      { step: "Resource Repository", detail: <>Upload PDFs or images to the <strong>Library</strong> for administrative access (maps, rules, handbooks).</> }
    ]
  };

  const BLOCK_PRO_ACTIVATION = {
    title: "6. Activating Elite Status",
    icon: Zap,
    steps: [
      { step: "Provision Seat", detail: <>After upgrading, visit <strong>Team Profile</strong> and use <strong>Override Tier</strong> to attach the Pro seat to your primary squad.</> },
      { step: "Unlock Modules", detail: <>Verify the <strong>ELITE PRO</strong> badge in your team switcher. Advanced film, analytics, and tournament tools are now live.</> }
    ]
  };

  const BLOCK_TOURNAMENT_ENGINE = {
    title: "7. The Elite Tournament Engine",
    icon: Table,
    steps: [
      { step: "Roster Enrollment", detail: <>Create a Tournament event. In <strong>Deploy</strong>, enter participating squad names to initialize the engine.</> },
      { step: "Auto-Scheduler", detail: <>Define match lengths and breaks. Tap <strong>Deploy Complex Itinerary</strong> to auto-generate pairings across fields.</> },
      { step: "Portal Distribution", detail: <>In <strong>Portals</strong>, share the <strong>Spectator Hub</strong> with fans and the <strong>Scorekeeper Hub</strong> with field marshals for live updates.</> }
    ]
  };

  const BLOCK_FILM_COMPLIANCE = {
    title: "8. Film Study Compliance",
    icon: Video,
    steps: [
      { step: "Media Archiving", detail: <>Upload MP4 match film or drills to the <strong>Playbook</strong>. Pro includes 10GB of high-speed media storage.</> },
      { step: "The 75% Rule", detail: <>The system tracks watch time. Teammates must watch <strong>75% of the video</strong> to be marked as <strong>Compliant</strong> in your ledger.</> },
      { step: "Tactical Discussion", detail: <>Add time-stamped comments to film study sessions to spark strategy discussions.</> }
    ]
  };

  const BLOCK_FEES_GOVERNANCE = {
    title: "9. Roster Fees & Governance",
    icon: DollarSign,
    steps: [
      { step: "Post Fees", detail: <>In the <strong>Roster</strong> hub, attach uniform or tournament dues to player profiles. Track <strong>Paid</strong> vs <strong>Owed</strong> status automatically.</> },
      { step: "Staff Evaluations", detail: <>Use private <strong>Staff Notes</strong> in the Roster hub to log performance reviews visible only to coaches.</> }
    ]
  };

  const BLOCK_HIGH_PRIORITY = {
    title: "10. High-Priority Command",
    icon: Megaphone,
    steps: [
      { step: "Broadcast Alerts", detail: <>Use the <strong>Megaphone</strong> icon to send urgent, full-screen team-wide alerts for venue changes or safety.</> },
      { step: "Advanced Trajectory", detail: <>In <strong>Scorekeeping</strong>, visualize PPG, Win Trends, and opponent scouting patterns via interactive charts.</> }
    ]
  };

  const BLOCK_SCOUTING_AI = {
    title: "11. AI Scouting Assistant",
    icon: BrainCircuit,
    steps: [
      { step: "Log Observations", detail: <>In <strong>Playbook &rarr; Scouting</strong>, enter raw notes about opponent tendencies.</> },
      { step: "Generate Brief", detail: <>Tap <strong>Generate AI Brief</strong>. The AI structures your notes into <strong>Strengths, Weaknesses, and Keys to Victory</strong>.</> }
    ]
  };

  const BLOCK_CLUB_HUB = {
    title: "12. Institutional Club Hub",
    icon: Building,
    steps: [
      { step: "Fiscal Pulse", detail: <>Access the <strong>Club Hub</strong> to audit aggregated dues collection across every squad in your entire organization.</> },
      { step: "Conflict Audit", detail: <>Use the master ledger to resolve scheduling overlaps and field booking conflicts across squads instantly.</> }
    ]
  };

  const BLOCK_RECRUITMENT_PORTAL = {
    title: "13. Public Recruitment Portal",
    icon: ClipboardList,
    steps: [
      { step: "Form Architect", detail: <>In <strong>Leagues &rarr; Registration</strong>, build custom forms for medical history and digital waivers.</> },
      { step: "Review & Deploy", detail: <>Share your <strong>Portal URL</strong>. Review applicants in the <strong>Ledger</strong>, then deploy them to squads with one click.</> }
    ]
  };

  const BLOCK_FLEET_LOGISTICS = {
    title: "14. Fleet & Asset Vault",
    icon: Package,
    steps: [
      { step: "Resource Booking", detail: <>Enroll venues in the <strong>Facilities</strong> hub. Assign them to events to block off time globally.</> },
      { step: "Inventory Vault", detail: <>Track uniforms and gear in <strong>Equipment</strong>. Log assignments to players and track return status.</> }
    ]
  };

  const BLOCK_PLAYER_HUB = {
    title: "Athlete Operational Hub",
    icon: User,
    steps: [
      { step: "Join via Code", detail: <>Enter the 6-digit <strong>Squad Code</strong> in the <strong>Recruitment Hub</strong> to link your profile to your team.</> },
      { step: "Recruiting Portfolio", detail: <>In your <strong>Roster</strong> profile, tap <strong>Generate Scouting Pack</strong> to export a certified tactical resume.</> },
      { step: "RSVP Mandate", detail: <>Check the <strong>Schedule</strong> daily. Submit your RSVP status for all games and training.</> },
      { step: "Film Compliance", detail: <>Visit <strong>Playbook &rarr; Game Play</strong>. Watch at least <strong>75% of assigned film</strong> to satisfy compliance requirements.</> }
    ]
  };

  const BLOCK_PARENT_HUB = {
    title: "Guardian Safety Hub",
    icon: Baby,
    steps: [
      { step: "Household Command", detail: <>Add your children in the <strong>Family Hub</strong>. They link to your account for unified scheduling and billing.</> },
      { step: "Fiscal Audit", detail: <>View your <strong>Household Balance</strong> on the dashboard to track aggregated dues across squads.</> },
      { step: "Login Provisioning", detail: <>Use <strong>Enable Login</strong> in the Family Hub to give your child tactical access while maintaining oversight.</> }
    ]
  };

  const BLOCK_COMMUNITY_BOARD = {
    title: "Community Engagement",
    icon: HandHelping,
    steps: [
      { step: "Volunteer Hub", detail: <>Navigate to the <strong>Volunteer</strong> hub to claim assignments. Track your verified hours.</> },
      { step: "Fundraising Hub", detail: <>Participate in capital campaigns. Log contributions and track goal progress toward targets.</> }
    ]
  };

  const MANUAL_CONTENT: Record<AccountType, { label: string; desc: string; highlights: string[]; sections: ManualSection[] }> = {
    starter: {
      label: "Starter (Free)",
      desc: "Foundational coordination for grassroots squads.",
      highlights: ["Unlimited Teams", "Live Chats", "Match Scheduling", "Manual ledgers", "Drill Archiving"],
      sections: [BLOCK_DEPLOYMENT, BLOCK_SCHEDULING, BLOCK_COMMUNICATION, BLOCK_SCOREKEEPING, BLOCK_PLAYBOOK]
    },
    pro: {
      label: "Squad Pro",
      desc: "Exhaustive coordination for elite squads with advanced verification.",
      highlights: ["Elite Auto-Scheduler", "75% Film Compliance", "Digital Waivers", "AI Scouting Assistant", "Broadcast Alerts"],
      sections: [
        BLOCK_DEPLOYMENT, BLOCK_SCHEDULING, BLOCK_COMMUNICATION, BLOCK_SCOREKEEPING, BLOCK_PLAYBOOK, 
        BLOCK_PRO_ACTIVATION, BLOCK_TOURNAMENT_ENGINE, BLOCK_FILM_COMPLIANCE, BLOCK_FEES_GOVERNANCE, 
        BLOCK_HIGH_PRIORITY, BLOCK_SCOUTING_AI
      ]
    },
    elite: {
      label: "Elite Org (Team/League)",
      desc: "Master institutional infrastructure for organizations and leagues.",
      highlights: ["Master Club Hub", "Public Recruitment Portal", "Form Architect", "Facility Fleet", "Conflict Resolution"],
      sections: [
        BLOCK_DEPLOYMENT, BLOCK_SCHEDULING, BLOCK_COMMUNICATION, BLOCK_SCOREKEEPING, BLOCK_PLAYBOOK, 
        BLOCK_PRO_ACTIVATION, BLOCK_TOURNAMENT_ENGINE, BLOCK_FILM_COMPLIANCE, BLOCK_FEES_GOVERNANCE, 
        BLOCK_HIGH_PRIORITY, BLOCK_SCOUTING_AI, BLOCK_CLUB_HUB, BLOCK_RECRUITMENT_PORTAL, BLOCK_FLEET_LOGISTICS
      ]
    },
    player: {
      label: "Individual Athlete",
      desc: "Stay coordinated and ready. Manage your personal recruitment portfolio.",
      highlights: ["Join via Code", "Recruiting Portfolio", "Film Compliance", "RSVP Mandate", "Live Chat Access"],
      sections: [BLOCK_PLAYER_HUB, BLOCK_COMMUNICATION, BLOCK_SCHEDULING, BLOCK_SCOREKEEPING]
    },
    parent: {
      label: "Parent / Guardian",
      desc: "Unified household safety and fiscal command.",
      highlights: ["Household Command", "Fiscal Audit", "Volunteer Board", "Fundraising Hub", "Child Registration"],
      sections: [BLOCK_PARENT_HUB, BLOCK_COMMUNITY_BOARD, BLOCK_COMMUNICATION, BLOCK_SCHEDULING, BLOCK_SCOREKEEPING]
    }
  };

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
              <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Tactical Manual</Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">Operational <span className="text-primary italic">Manual.</span></h1>
              <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">Select your account perspective for exhaustive coordination guidance.</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Object.keys(MANUAL_CONTENT) as AccountType[]).map((type) => {
                const data = MANUAL_CONTENT[type];
                const Icon = type === 'starter' ? Users2 : type === 'pro' ? Zap : type === 'elite' ? Building : type === 'player' ? User : Baby;
                
                return (
                  <Card 
                    key={type} 
                    className="rounded-[2.5rem] border-none shadow-xl hover:shadow-2xl transition-all cursor-pointer group bg-white ring-1 ring-black/5 overflow-hidden"
                    onClick={() => setSelectedAccountType(type)}
                  >
                    <div className={cn(
                      "h-2 w-full",
                      type === 'starter' ? "bg-muted" : type === 'pro' ? "bg-primary" : "bg-black"
                    )} />
                    <CardContent className="p-8 space-y-4">
                      <div className="bg-muted p-4 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-all">
                        <Icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight group-hover:text-primary transition-colors">{data.label}</h3>
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">{data.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-12 animate-in slide-in-from-right-4 duration-500">
            <section className="space-y-6 border-b pb-8">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-4 rounded-3xl text-primary shadow-inner">
                  {selectedType === 'starter' && <Users2 className="h-8 w-8" />}
                  {selectedType === 'pro' && <Zap className="h-8 w-8" />}
                  {selectedType === 'elite' && <Building className="h-8 w-8" />}
                  {selectedType === 'player' && <User className="h-8 w-8" />}
                  {selectedType === 'parent' && <Baby className="h-8 w-8" />}
                </div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tight">{MANUAL_CONTENT[selectedType].label} Guide</h2>
                  <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">{MANUAL_CONTENT[selectedType].desc}</p>
                </div>
              </div>

              <div className="bg-muted/30 p-6 rounded-[2rem] border-2 border-dashed">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 ml-1">Tactical Capability Matrix</p>
                <div className="flex flex-wrap gap-2">
                  {MANUAL_CONTENT[selectedType].highlights.map((h, i) => (
                    <Badge key={i} className="bg-white text-black border-none shadow-sm font-black uppercase text-[10px] h-8 px-4">
                      {h}
                    </Badge>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-12">
              {MANUAL_CONTENT[selectedType].sections.map((section, idx) => (
                <Card key={idx} className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
                  <CardHeader className="bg-muted/30 p-8 lg:p-10 border-b flex flex-row items-center gap-6">
                    <div className="bg-white p-4 rounded-2xl shadow-sm text-primary">
                      <section.icon className="h-6 w-6" />
                    </div>
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">{section.title}</CardTitle>
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
          </div>
        )}
      </main>
    </div>
  );
}
