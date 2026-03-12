
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
  HandHelping
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
      label: "Starter",
      desc: "Essential coordination for unlimited grassroots squads.",
      highlights: ["Unlimited Starter Teams", "Tactical Chat", "Basic Scheduling", "Match Ledger"],
      sections: [
        {
          title: "1. Squad Deployment",
          icon: Plus,
          steps: [
            { step: "Launch Team", detail: "Tap 'New Squad' on the Dashboard. Select 'Starter Squad' tier to keep it free forever." },
            { step: "Set Identity", detail: "Add your team name and sport. Your unique 6-digit Squad Code is generated automatically in Team Profile." },
            { step: "Recruit", detail: "Share your Squad Code with players. They join instantly via the Recruitment Hub." }
          ]
        },
        {
          title: "2. Daily Operations",
          icon: CalendarDays,
          steps: [
            { step: "Scheduling", detail: "Use 'Schedule' to add matches or practices. Starter squads track basic location and time." },
            { step: "Tactical Chat", detail: "The 'Chats' hub provides secure messaging. Create channels for strategy, travel, or positions." },
            { step: "Scorekeeping", detail: "Record final scores in 'Games' to maintain a win/loss history. View your season progress chart." }
          ]
        },
        {
          title: "3. Training & Resources",
          icon: Dumbbell,
          steps: [
            { step: "Playbook Drills", detail: "In 'Playbook', add execution protocols. Describe drills and attach external video links for the team to study." },
            { step: "Library Docs", detail: "Archive essential PDFs or images in the 'Library' for squad-wide access." }
          ]
        },
        {
          title: "4. Manual Tournaments",
          icon: TableIcon,
          steps: [
            { step: "Create Itinerary", detail: "In 'Events', add a 'Tournament'. Set dates and locations manually for multi-day events." },
            { step: "Basic Schedule", detail: "Starter tier allows you to build a schedule, but doesn't include automated standings or public portals." }
          ]
        }
      ]
    },
    pro: {
      label: "Squad Pro",
      desc: "Elite performance tools for 1 professional-grade team.",
      highlights: ["Itinerary Engine", "Film Study Verification", "Digital Signatures", "Advanced Analytics", "10GB Media Vault"],
      sections: [
        {
          title: "1. Activating Elite Status",
          icon: Zap,
          steps: [
            { step: "Provision Seat", detail: "Go to 'Pricing' and upgrade. In 'Team Profile', assign your Pro Seat to your primary team." },
            { step: "Verify Unlock", detail: "Check for the 'ELITE PRO' badge. All advanced modules (Film Study, Alerts, Brackets) are now active." }
          ]
        },
        {
          title: "2. Automated Tournaments",
          icon: Trophy,
          steps: [
            { step: "Bracket Engine", detail: "Create an Elite Tournament. List participating teams and tap 'Deploy Complex Itinerary' to auto-pair matchups." },
            { step: "Spectator Hub", detail: "Share the automated public link with fans to track live scores and standings." },
            { step: "Digital Waivers", detail: "Collect legal signatures from opposing coaches via the secure Waiver Portal." }
          ]
        },
        {
          title: "3. Playbook & Film Analysis",
          icon: Video,
          steps: [
            { step: "10GB Media Vault", detail: "In 'Playbook', upload MP4 film directly. Organize by 'Game Tape' or 'Highlights'." },
            { step: "The 75% Rule", detail: "Players must watch 75% of a video to be marked as 'Verified Viewed' in your coach's ledger." },
            { step: "Tactical Comments", detail: "Add timestamped insights to videos to spark discussion among the roster." }
          ]
        },
        {
          title: "4. Professional Roster Admin",
          icon: Users2,
          steps: [
            { step: "Full Details", detail: "Track medical info, emergency contacts, and private coaching evaluations for every member." },
            { step: "Compliance Audit", detail: "Upload waivers in 'Coaches Corner'. Track exactly who has signed in the 'Library' audit view." },
            { step: "Fee Ledger", detail: "Post dues and track payments for tournament fees or uniforms directly on the Roster profile." }
          ]
        },
        {
          title: "5. High-Priority Command",
          icon: Megaphone,
          steps: [
            { step: "Broadcast Alerts", detail: "Use the Megaphone icon to send urgent, team-wide popups for last-minute changes." },
            { step: "Advanced Stats", detail: "Visualize average PPG, win trajectory, and opponent scouting trends in the 'Scorekeeping' hub." }
          ]
        }
      ]
    },
    elite: {
      label: "Elite Org (Team/League)",
      desc: "Institutional infrastructure for up to 20 Pro Teams.",
      highlights: ["Organization Control", "Recruitment Portals", "Custom Form Architect", "League Standings", "Fleet Management"],
      sections: [
        {
          title: "1. The Club Hub",
          icon: Building,
          steps: [
            { step: "Master Dashboard", detail: "Monitor all squads from one screen. See active team counts and organizational dues." },
            { step: "Fleet Provisioning", detail: "Assign your 8 or 20 Pro Seats to coaches. They gain full Pro features while you retain master control." }
          ]
        },
        {
          title: "2. Recruitment Portals",
          icon: ClipboardList,
          steps: [
            { step: "Form Architect", detail: "In 'Leagues > Registration', build custom signup forms. Add shirt sizes, birthdates, or document uploads." },
            { step: "Public Enrollment", detail: "Distribute your unique URL. Players apply directly without needing an app account." },
            { step: "Deployment Ledger", detail: "Review submissions and assign recruits to specific squads with a single tap." }
          ]
        },
        {
          title: "3. League Infrastructure",
          icon: ShieldCheck,
          steps: [
            { step: "League Setup", detail: "Establish official standings. Invite external verified teams or manually enter squads." },
            { step: "Scorekeeper Access", detail: "Share secure links with field marshals to log results without full app access." },
            { step: "Seasonal Reset", detail: "Purge match data and rosters for the new season while retaining organizational archives." }
          ]
        },
        {
          title: "4. Logistics Control",
          icon: MapPin,
          steps: [
            { step: "Facility Management", detail: "Register all venues and fields. Track availability to prevent scheduling conflicts across squads." },
            { step: "Equipment Vault", detail: "Log all organization assets. Assign uniforms or gear to specific players and track returns." }
          ]
        }
      ]
    },
    player: {
      label: "Individual Athlete",
      desc: "The professional teammate's operational handbook.",
      highlights: ["Verified Enrollment", "Film Compliance", "RSVP Protocol", "Direct Coordination"],
      sections: [
        {
          title: "1. Squad Enrollment",
          icon: UserPlus,
          steps: [
            { step: "Join Request", detail: "Tap 'Recruitment Hub'. Enter the 6-digit code provided by your coach." },
            { step: "Profile Sync", detail: "Verify your position and jersey number. Your schedule and chats will populate instantly." }
          ]
        },
        {
          title: "2. Strategic Availability",
          icon: Target,
          steps: [
            { step: "The RSVP Habit", detail: "Check 'Schedule' daily. Mark 'Going' or 'Decline' so your coach can plan play-time and strategy." },
            { step: "Unified Calendar", detail: "Use the 'Calendar' tab to see your season itinerary across all teams you belong to." }
          ]
        },
        {
          title: "3. Performance Compliance",
          icon: Activity,
          steps: [
            { step: "Film Study", detail: "Watch assigned tape in the 'Playbook'. Finish at least 75% to meet the coach's compliance requirement." },
            { step: "Playbook Execution", detail: "Study drill protocols before practice to ensure the squad is game-ready." }
          ]
        },
        {
          title: "4. Administration",
          icon: FolderClosed,
          steps: [
            { step: "Digital Signatures", detail: "In the 'Library', sign all required waivers. This is required for tournament eligibility." },
            { step: "Secure Feed", detail: "Post updates, photos, and participate in squad polls to build team consensus." }
          ]
        }
      ]
    },
    parent: {
      label: "Parent / Guardian",
      desc: "Unified household coordination and safety.",
      highlights: ["Household Dashboard", "Child Account Linking", "Volunteer Hub", "Consolidated Billing"],
      sections: [
        {
          title: "1. Household Command",
          icon: Baby,
          steps: [
            { step: "Athlete Roster", detail: "In 'Family Hub', register your children. They are linked to your guardian account automatically." },
            { step: "Login Provisioning", detail: "Tap 'Enable Login' for older children to let them sign in while you maintain oversight." }
          ]
        },
        {
          title: "2. Unified Scheduling",
          icon: CalendarDays,
          steps: [
            { step: "Master Itinerary", detail: "The 'Calendar' hub merges every child's practice and game into one chronological view." },
            { step: "Guardian RSVPs", detail: "Handle attendance for minor players. Ensure these are set 24 hours before match start." }
          ]
        },
        {
          title: "3. Community Engagement",
          icon: HandHelping,
          steps: [
            { step: "Volunteer Hub", detail: "Claim assignments for concessions, carpools, or hospitality. Track your verified hours." },
            { step: "Fundraising Hub", detail: "Participate in squad capital campaigns. Log contributions and track goal progress." }
          ]
        },
        {
          title: "4. Financial & Compliance",
          icon: DollarSign,
          steps: [
            { step: "Consolidated Balance", detail: "Check the Dashboard for your 'Household Balance'. Audit dues across all children." },
            { step: "Sign on Behalf", detail: "In the 'Library', execute legal waivers for your children to clear them for match day." }
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
              <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">Select your account perspective for granular, step-by-step guidance.</p>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {(Object.keys(MANUAL_CONTENT) as AccountType[]).map((type) => {
                const data = MANUAL_CONTENT[type];
                const Icon = type === 'starter' ? Plus : type === 'pro' ? Zap : type === 'elite' ? Building : type === 'player' ? User : Baby;
                
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
                        <h3 className="text-xl font-black uppercase tracking-tight">{data.label}</h3>
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{data.desc}</p>
                      </div>
                      <div className="pt-4 flex items-center text-primary font-black text-[10px] uppercase tracking-widest gap-2">
                        View Instructions <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
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
                  {selectedType === 'starter' && <Plus className="h-8 w-8" />}
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
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-4 ml-1">Key Capabilities</p>
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
                <h3 className="text-2xl font-black uppercase tracking-tight mb-2">Still have questions?</h3>
                <p className="text-white/60 font-medium max-w-md mx-auto mb-8">Our tactical support team is standing by to help you dominate your season coordination.</p>
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
