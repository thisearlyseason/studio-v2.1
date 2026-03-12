
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { 
  ChevronLeft, 
  LayoutDashboard, 
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
  Star,
  Info,
  CreditCard,
  Building,
  HelpCircle,
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
  Table as TableIcon,
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
  PiggyBank,
  CheckCircle,
  Users
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
  steps: Array<{ step: string; detail: string }>;
}

export default function HowToGuidePage() {
  const router = useRouter();
  const { user } = useUser();
  const [selectedType, setSelectedAccountType] = useState<AccountType | null>(null);

  const MANUAL_CONTENT: Record<AccountType, { label: string; desc: string; highlights: string[]; sections: ManualSection[] }> = {
    starter: {
      label: "Starter (Free)",
      desc: "Essential coordination for grassroots squads. Master the core coordination engine.",
      highlights: ["Unlimited Starter Teams", "Tactical Chat", "Basic Scheduling", "Manual Scorekeeping", "Playbook Basics", "Resource Library"],
      sections: [
        {
          title: "1. Squad Deployment & Recruitment",
          icon: UserPlus,
          steps: [
            { step: "Launch Team", detail: "Start at the Dashboard and select 'New Squad'. Choose the 'Starter Squad' tier for a permanent zero-cost hub." },
            { step: "Retreive Join Code", detail: "Navigate to 'Team Profile' to find your unique 6-digit Squad Code. This is the only way for others to join." },
            { step: "Invite Members", detail: "Share the code via text or email. Teammates use the 'Recruitment Hub' to enroll themselves instantly." }
          ]
        },
        {
          title: "2. Strategic Scheduling",
          icon: CalendarDays,
          steps: [
            { step: "Create Activity", detail: "In 'Schedule', use '+ New Activity' to log Match Days, Training, or Meetings. Set location and times." },
            { step: "Calendar View", detail: "Use the 'Calendar' tab for a unified chronological view of all squad commitments." },
            { step: "Monitor RSVPs", detail: "Click any event to see who is 'Going', 'Maybe', or 'Declined' in real-time." }
          ]
        },
        {
          title: "3. Communication & Social",
          icon: MessageCircle,
          steps: [
            { step: "Squad Feed", detail: "Use the 'Feed' to view system updates and coordination notes. Note: Posting and polls are Pro features." },
            { step: "Tactical Chats", detail: "Open 'Chats' to establish secure messaging groups for specific squad units or travel planning." }
          ]
        },
        {
          title: "4. Performance Tracking",
          icon: Trophy,
          steps: [
            { step: "Scorekeeping", detail: "Visit the 'Scorekeeping' hub after matches. Enter 'Us vs Them' scores to update the season Win/Loss record." },
            { step: "Manual Itineraries", detail: "Add 'Tournament' events to create multi-day calendar blocks for championships." }
          ]
        },
        {
          title: "5. Playbook & Library",
          icon: Dumbbell,
          steps: [
            { step: "Archive Drills", detail: "In 'Playbook', add execution protocols with instructions and external video links for squad study." },
            { step: "Resource Repository", detail: "Upload PDFs or images to the 'Library' for administrative access (maps, rules, handbooks)." }
          ]
        }
      ]
    },
    pro: {
      label: "Squad Pro",
      desc: "Full coordination for elite squads. Everything in Starter + advanced verification and automation.",
      highlights: ["Everything in Starter", "Elite Auto-Scheduler", "75% Film Verification", "Broadcast Alerts", "Digital Signatures", "Advanced Stats"],
      sections: [
        {
          title: "1. Activating Elite Status",
          icon: Zap,
          steps: [
            { step: "Provision Seat", detail: "After upgrading, visit 'Team Profile' and use 'Override Tier' to attach the Pro seat to your primary squad." },
            { step: "Unlock Modules", detail: "Verify the 'ELITE PRO' badge in your team switcher. Advanced film, analytics, and tournament tools are now live." }
          ]
        },
        {
          title: "2. The Elite Tournament Engine",
          icon: TableIcon,
          steps: [
            { step: "Roster Enrollment", detail: "Create a Tournament event. In 'Deploy', enter participating squad names to initialize the engine." },
            { step: "Auto-Scheduler", detail: "Define match lengths and breaks. Tap 'Deploy Complex Itinerary' to auto-generate pairings across fields." },
            { step: "Portal Distribution", detail: "In 'Portals', share the Spectator Hub with fans and the Scorekeeper Hub with field marshals for live updates." },
            { step: "Compliance Execution", detail: "Use 'Coaches Corner' to upload waivers. Track digital signatures in the Compliance Ledger." }
          ]
        },
        {
          title: "3. Film Study Compliance",
          icon: Video,
          steps: [
            { step: "Media Archiving", detail: "Upload MP4 match film or drills to the Playbook. Pro includes 10GB of high-speed media storage." },
            { step: "The 75% Rule", detail: "The system tracks watch time. Teammates must watch 75% of the video to be marked as 'Compliant' in your ledger." },
            { step: "Tactical Discussion", detail: "Add time-stamped comments to film study sessions to spark strategy discussions." }
          ]
        },
        {
          title: "4. Roster Fees & Governance",
          icon: DollarSign,
          steps: [
            { step: "Post Fees", detail: "Attach uniform or tournament dues to player profiles. Track 'Paid' vs 'Owed' status automatically." },
            { step: "Staff Evaluations", detail: "Use private 'Staff Notes' in the Roster hub to log performance reviews visible only to coaches." }
          ]
        },
        {
          title: "5. High-Priority Command",
          icon: Megaphone,
          steps: [
            { step: "Broadcast Alerts", detail: "Use the Megaphone icon to send urgent, full-screen team-wide alerts for venue changes or safety." },
            { step: "Advanced Trajectory", detail: "In Scorekeeping, visualize PPG, Win Trends, and opponent scouting patterns via interactive charts." }
          ]
        }
      ]
    },
    elite: {
      label: "Elite Org (Team/League)",
      desc: "Institutional infrastructure. Everything in Pro + multi-team management and public recruitment portals.",
      highlights: ["Everything in Pro", "Multi-Team Club Hub", "Public Recruitment Portals", "Form Architect", "Facility Conflict Mgmt", "Equipment Vault"],
      sections: [
        {
          title: "1. Institutional Command",
          icon: Building,
          steps: [
            { step: "Organization Setup", detail: "Use the 'Club Hub' to create multiple squads under one master organizational umbrella." },
            { step: "Seat Provisioning", detail: "Assign your 8 or 20 Pro seats to specific head coaches while retaining master administrative oversight." }
          ]
        },
        {
          title: "2. The Recruitment Hub",
          icon: ClipboardList,
          steps: [
            { step: "Form Architect", detail: "In 'Leagues > Registration', build a custom form with logic for sizes, medical info, and document uploads." },
            { step: "Public Portal Deployment", detail: "Share your unique Portal URL publicly. New players can apply to join without an account." },
            { step: "Ledger Review", detail: "Review applications in the 'Ledger'. Approve recruits and assign them directly to your organization's squads." }
          ]
        },
        {
          title: "3. Facility & Logistics Mastery",
          icon: MapPin,
          steps: [
            { step: "Register Venues", detail: "In 'Facilities', log every venue and field. System prevents double-booking across all your organization's teams." },
            { step: "Asset Management", detail: "Use 'Equipment' to log uniform and kit inventory. Assign items to players and track seasonal recovery." }
          ]
        },
        {
          title: "4. League Governance",
          icon: ShieldCheck,
          steps: [
            { step: "Establish Standings", detail: "Create official League Hubs to link multiple squads into a single leaderboard with points logic." },
            { step: "Cross-Coach Comms", detail: "Use the 'Coach Directory' to establish tactical chats with opposing managers for match-day coordination." }
          ]
        }
      ]
    },
    player: {
      label: "Individual Athlete",
      desc: "Stay coordinated, compliant, and ready for match day. Your personal performance dashboard.",
      highlights: ["Join Squads", "RSVP Mandate", "Film Compliance", "Digital Vault", "Tactical Engagement"],
      sections: [
        {
          title: "1. Squad Enrollment",
          icon: UserPlus,
          steps: [
            { step: "Join via Code", detail: "Enter the 6-digit code from your coach in the 'Recruitment Hub'. Verify your position and jersey." },
            { step: "Data Sync", detail: "Once joined, your Dashboard and Calendar automatically populate with your specific squad commitments." }
          ]
        },
        {
          title: "2. Availability Protocol",
          icon: Target,
          steps: [
            { step: "Mandatory RSVP", detail: "Mark your status for every game or practice. This is critical for tactical planning." },
            { step: "Unified Calendar", detail: "View an aggregated schedule of every commitment across all squads you belong to." }
          ]
        },
        {
          title: "3. Compliance & Study",
          icon: Activity,
          steps: [
            { step: "Film Verification", detail: "Watch 75% of assigned videos in the Playbook to meet coach compliance requirements." },
            { step: "Digital Signature", detail: "In 'Library', sign pending waivers digitally to clear yourself for tournament eligibility." }
          ]
        }
      ]
    },
    parent: {
      label: "Parent / Guardian",
      desc: "Unified household safety and coordination. Manage multiple minor players from one command hub.",
      highlights: ["Household Hub", "Athlete Roster", "Login Provisioning", "Unified Calendar", "Volunteer Board", "Fiscal Audit"],
      sections: [
        {
          title: "1. Household Command",
          icon: Baby,
          steps: [
            { step: "Register Minors", detail: "Add your children in 'Family Hub'. They link to your account for unified scheduling and billing." },
            { step: "Enable Logins", detail: "For older children, tap 'Enable Login' to give them personal app access while you maintain oversight." }
          ]
        },
        {
          title: "2. Unified Scheduling",
          icon: CalendarDays,
          steps: [
            { step: "Multi-Child Calendar", detail: "View the combined practice and game schedules of every child in your house in one master list." },
            { step: "Guardian RSVPs", detail: "Manage attendance confirmations for your children to assist coaches with transport and rosters." }
          ]
        },
        {
          title: "3. Community Engagement",
          icon: HandHelping,
          steps: [
            { step: "Volunteer Hub", detail: "Claim shifts for hospitality or concessions. Track your total verified contribution hours." },
            { step: "Fundraising", detail: "Join active squad capital campaigns. Log contributions and monitor team goal progress." }
          ]
        },
        {
          title: "4. Compliance & Fees",
          icon: DollarSign,
          steps: [
            { step: "Household Balance", detail: "Audit the aggregated dues and fees for all children from your main dashboard." },
            { step: "Execute Waivers", detail: "Sign legal documents on behalf of your children in the Library to ensure eligibility." }
          ]
        }
      ]
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
              <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Master Manual</Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">The Tactical <span className="text-primary italic">Manual.</span></h1>
              <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">Select your account perspective for granular, cumulative operational guidance.</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Object.keys(MANUAL_CONTENT) as AccountType[]).map((type) => {
                const data = MANUAL_CONTENT[type];
                const Icon = type === 'starter' ? Users : type === 'pro' ? Zap : type === 'elite' ? Building : type === 'player' ? User : Baby;
                
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
                    <CardContent className="p-8 space-y-4 text-foreground">
                      <div className="bg-muted p-4 rounded-2xl w-fit group-hover:bg-primary group-hover:text-white transition-all">
                        <Icon className="h-8 w-8" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xl font-black uppercase tracking-tight group-hover:text-primary transition-colors">{data.label}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">{data.desc}</p>
                      </div>
                      <div className="pt-4 flex items-center text-primary font-black text-[10px] uppercase tracking-widest gap-2">
                        Open Hub Manual <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
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
                  {selectedType === 'starter' && <Users className="h-8 w-8" />}
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
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 ml-1">Key Capability Matrix</p>
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
                            <p className="text-base font-medium leading-relaxed text-muted-foreground">{s.detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="bg-black text-white p-10 rounded-[3rem] text-center space-y-6 shadow-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-6 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-32 w-32" />
              </div>
              <div className="relative z-10">
                <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Still have operational questions?</h3>
                <p className="text-white/60 font-medium max-w-md mx-auto mb-8">Our tactical support team is standing by to help you dominate your season coordination and institutional scale.</p>
                <Button variant="secondary" className="rounded-full px-10 h-14 font-black uppercase tracking-widest bg-white text-black hover:bg-white/90" onClick={() => window.location.href = 'mailto:team@thesquad.pro'}>
                  Contact Operations
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="py-12 bg-muted/50 border-t mt-24">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <Link href={user ? "/dashboard" : "/"}>
              <BrandLogo variant="light-background" className="h-8 w-32" />
            </Link>
            
            <div className="flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Link href="/how-to" className="text-primary transition-colors">How to Guide</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
              <Link href="/safety" className="hover:text-primary transition-colors">Safety Center</Link>
            </div>

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
