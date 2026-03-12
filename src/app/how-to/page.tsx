
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
  Hash
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

  const MANUAL_CONTENT: Record<AccountType, { label: string; desc: string; sections: ManualSection[] }> = {
    starter: {
      label: "Starter (FREE)",
      desc: "Essential coordination for unlimited grassroots squads.",
      sections: [
        {
          title: "1. Squad Deployment",
          icon: Plus,
          steps: [
            { step: "Launch Team", detail: "Tap 'New Squad' on the Dashboard. Select 'Starter Squad' tier to keep it free forever." },
            { step: "Set Identity", detail: "Add your team name and sport. Your unique 6-digit Squad Code is generated automatically." },
            { step: "Recruit", detail: "Share your Squad Code with players. They join instantly without admin approval." }
          ]
        },
        {
          title: "2. Daily Operations",
          icon: CalendarDays,
          steps: [
            { step: "Scheduling", detail: "Use 'Schedule' to add matches or practices. Starter squads track basic location and time." },
            { step: "Tactical Chat", detail: "The 'Chats' hub provides secure messaging for the whole team or private groups." },
            { step: "Scorekeeping", detail: "Record final scores in 'Games' to maintain a win/loss history for the season." }
          ]
        },
        {
          title: "3. Manual Tournaments",
          icon: TableIcon,
          steps: [
            { step: "Create Itinerary", detail: "In 'Events', add a 'Tournament'. You can list teams and times manually." },
            { step: "Basic Brackets", detail: "Starter tier allows you to build a schedule, but doesn't include automated standings or portals." }
          ]
        }
      ]
    },
    pro: {
      label: "Squad Pro ($19.99)",
      desc: "Elite performance tools for 1 professional-grade team.",
      sections: [
        {
          title: "1. Activating Elite Status",
          icon: Zap,
          steps: [
            { step: "Select Team", detail: "Go to 'Pricing' and upgrade. Then, in 'Squad Profile', assign your Pro Seat to your primary team." },
            { step: "Verify Unlock", detail: "Look for the 'ELITE PRO' badge in your sidebar. All advanced modules are now active." }
          ]
        },
        {
          title: "2. Automated Tournaments",
          icon: Trophy,
          steps: [
            { step: "Bracket Engine", detail: "Create an Elite Tournament. List participating teams and tap 'Deploy Complex Itinerary'." },
            { step: "Public Portals", detail: "In the tournament view, copy the 'Spectator Hub' link to share live scores with fans." },
            { step: "Digital Waivers", detail: "Share the 'Waiver Portal' with opposing coaches to collect legal signatures before play." }
          ]
        },
        {
          title: "3. Compliance & Film",
          icon: Video,
          steps: [
            { step: "Film Upload", detail: "In 'Playbook', upload game tape or practice sessions (10GB storage included)." },
            { step: "75% Rule", detail: "Teammates must watch 75% of a video for it to show as 'Verified Viewed' in your audit ledger." },
            { step: "Digital Docs", detail: "Use 'Coaches Corner' to upload waivers. Track real-time signatures on the 'Library' tab." }
          ]
        }
      ]
    },
    elite: {
      label: "Elite Org (Club/League)",
      desc: "Institutional infrastructure for up to 20 Pro Teams.",
      sections: [
        {
          title: "1. The Club Hub",
          icon: Building,
          steps: [
            { step: "Master Control", detail: "Open 'Club Hub' from the sidebar. See a unified view of every squad in your organization." },
            { step: "Provisioning Seats", detail: "Assign your 8 or 20 Pro Seats to different teams. Coaches inherit Pro features automatically." }
          ]
        },
        {
          title: "2. Global Recruitment",
          icon: ClipboardList,
          steps: [
            { step: "Portal Setup", detail: "In 'Leagues', go to 'Registration Hub'. Build a custom signup form with your own questions." },
            { step: "Public Signups", detail: "Share your unique Registration URL. Players sign up without needing an app account." },
            { step: "Tactical Assignment", detail: "Review applicants in the Ledger. Assign them to a specific team with one tap." }
          ]
        },
        {
          title: "3. Institutional Ledger",
          icon: DollarSign,
          steps: [
            { step: "Fee Tracking", detail: "In 'Club Hub', audit the financial status of every player across all squads." },
            { step: "Offline Settlement", detail: "Note: SquadForge handles data coordination. Use the 'Payment Received' toggle to log offline settlements." }
          ]
        }
      ]
    },
    player: {
      label: "Individual Athlete",
      desc: "The professional teammate's operational handbook.",
      sections: [
        {
          title: "1. Squad Enrollment",
          icon: UserPlus,
          steps: [
            { step: "Join Team", detail: "Tap 'Recruitment Hub'. Enter the 6-digit code provided by your coach." },
            { step: "Verify Role", detail: "Once joined, you'll see the team feed, chats, and schedule instantly." }
          ]
        },
        {
          title: "2. Tactical Readiness",
          icon: Target,
          steps: [
            { step: "RSVP Protocol", detail: "Check 'Schedule' daily. Tap 'Going' or 'Decline' so your coach can plan play-time." },
            { step: "Film Study", detail: "Visit 'Playbook'. Watch assigned film fully to meet the 75% watch compliance threshold." },
            { step: "Sign Waivers", detail: "Check 'Library'. Any document with a 'Signature Required' alert must be signed digitally." }
          ]
        }
      ]
    },
    parent: {
      label: "Parent / Guardian",
      desc: "Unified household coordination and safety.",
      sections: [
        {
          title: "1. Household Command",
          icon: Baby,
          steps: [
            { step: "Register Children", detail: "In 'Family Hub', register each child player. They don't need their own email initially." },
            { step: "Link Account", detail: "If your child is older, tap 'Enable Login' to let them sign in while remaining linked to your hub." }
          ]
        },
        {
          title: "2. Itinerary & RSVPs",
          icon: CalendarDays,
          steps: [
            { step: "Master Calendar", detail: "Your 'Calendar' tab merges events for ALL your children into one unified tactical view." },
            { step: "Guardian RSVP", detail: "Parents handle RSVPs for minor players. Ensure these are set 24 hours before match start." }
          ]
        },
        {
          title: "3. Compliance & Dues",
          icon: ShieldCheck,
          steps: [
            { step: "Family Ledger", detail: "Check 'Household Balance' on your dashboard. This shows total dues across all children." },
            { step: "Signature Vault", detail: "When a coach uploads a waiver, you sign on behalf of your minor children in the 'Library'." }
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

      <main className={cn(
        "container mx-auto px-6 py-12 max-w-5xl transition-all duration-500",
        selectedType ? "opacity-100 translate-y-0" : "opacity-100 translate-y-0"
      )}>
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
                    <CardContent className="p-8 space-y-4">
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
            <section className="space-y-4 border-b pb-8">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-4 rounded-3xl text-primary shadow-inner">
                  {selectedType === 'starter' && <Plus className="h-8 w-8" />}
                  {selectedType === 'pro' && <Zap className="h-8 w-8" />}
                  {selectedType === 'elite' && <Building className="h-8 w-8" />}
                  {selectedType === 'player' && <User className="h-8 w-8" />}
                  {selectedType === 'parent' && <Baby className="h-8 w-8" />}
                </div>
                <div>
                  <h2 className="text-4xl font-black uppercase tracking-tight">{MANUAL_CONTENT[selectedType].label}</h2>
                  <p className="text-muted-foreground font-bold uppercase tracking-widest text-sm">{MANUAL_CONTENT[selectedType].desc}</p>
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
