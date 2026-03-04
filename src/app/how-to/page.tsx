"use client";

import React from 'react';
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
  BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';

export default function HowToGuidePage() {
  const router = useRouter();
  const { user } = useUser();

  const featureSections = [
    {
      title: "1. The Live Squad Feed",
      icon: LayoutDashboard,
      description: "Primary broadcast hub for squad engagement. (Pro/Club Only)",
      manual: [
        { step: "Access Protocol", details: "Feed access is gated. Starter squads can view the tab, but require Pro to post or interact with historical broadcast content." },
        { step: "Posting Broadcasts", details: "Tap the input box. Admins can post text and high-res photos. Use this for general motivation and non-urgent updates." },
        { step: "Advanced Image Polls", details: "Tap the bar chart. Pro users can attach images to each option, perfect for voting on jersey designs or play strategies." }
      ]
    },
    {
      title: "2. League Registration & Recruitment",
      icon: ClipboardList,
      description: "Automated player enrollment and squad assignments. (Pro/Club Only)",
      manual: [
        { step: "Configuration Hub", details: "Navigate to Leagues -> Registration Hub. Define your season title, description, and custom form schema (Versioned)." },
        { step: "Public Enrollment", details: "Copy the Portal URL and share it with parents or players. They can submit enrollment data without requiring a platform account." },
        { step: "Offline Payments", details: "Clearly define payment instructions in the hub. Financial settlement is handled offline; organizers log payment status manually in the ledger." },
        { step: "Tactical Assignment", details: "Organizers assign applicants to specific teams within the league. Coaches then receive an approval request on their dashboard." },
        { step: "Coach Approval", details: "Coaches review assignments and tap 'Accept' to instantly enroll the player into their squad roster and financial ledger." }
      ]
    },
    {
      title: "3. Multi-Team Coordination",
      icon: UserPlus,
      description: "Managing unlimited squads and institutional quotas.",
      manual: [
        { step: "Starter Squads (Free)", details: "Every email can create unlimited Starter Squads. These provide basic coordination, chats, and schedules for free forever." },
        { step: "Elite Pro Seats", details: "Professional features are enabled per-team through a central 'Pro Quota'. Upgrade your plan to unlock more seats for your organization." },
        { step: "Quota Resolution", details: "If your subscription expires, the Quota Resolution Overlay will prompt you to select which teams retain Pro access." }
      ]
    },
    {
      title: "4. Schedule & Match Day",
      icon: CalendarDays,
      description: "Itinerary and real-time attendance management.",
      manual: [
        { step: "Creating Standard Matches", details: "Tap '+ Match'. Enter opponent and location. This creates a focused hub for RSVP tracking and logistics." },
        { step: "Tournament Deployment", details: "Tap '+ Tournament'. Enter multi-day dates and list participating squads. Use 'Matchups' to build the bracket." },
        { step: "Elite Standings ($50)", details: "Use a Tournament Credit to unlock standings and the Public Spectator Hub. This allows non-users to follow live scores." },
        { step: "RSVP Protocol", details: "Members tap 'Going' or 'Decline'. Staff can audit the Roster tab to verify headcounts before match start." }
      ]
    },
    {
      title: "5. Playbook Hub (Game Film)",
      icon: Dumbbell,
      description: "High-performance video study and training repository.",
      manual: [
        { step: "Film Upload Protocol", details: "Admins navigate to 'Game Play' and tap 'Upload Film'. Select a category (Game Tape, Practice, etc.) and provide study instructions." },
        { step: "75% Compliance Rule", details: "To ensure tactical readiness, the system monitors video playback. Teammates must watch 75% of a video before it is marked as 'Verified Viewed'." },
        { step: "Tactical Study Notes", details: "Every film asset includes a dedicated discussion thread. Coaches can leave study notes and players can ask questions directly on the tape." },
        { step: "Storage Quotas", details: "Starter squads have 500MB. Pro squads unlock 10GB. The Storage Audit bar in the vault tracks real-time usage across the squad." },
        { step: "Unlimited Strategy Links", details: "Attaching external links (YouTube, Google Drive) is always free and does not count against your team's storage quota." }
      ]
    },
    {
      title: "6. Roster & Compliance",
      icon: Users2,
      description: "Identity, financials, and medical tracking.",
      manual: [
        { step: "Recruiting Members", details: "Share your 6-digit Squad Code. When members join, they are instantly verified and added to your roster." },
        { step: "Basic vs Advanced Logic", details: "Starter squads manage names and jerseys. Pro squads unlock medical clearances, emergency contacts, and private coaching notes." },
        { step: "Fee Tracking", details: "Track individual dues. Mark items as 'Paid' to maintain a professional fiscal ledger for the season." }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={user ? "/feed" : "/"}>
            <BrandLogo variant="light-background" className="h-8 w-32" />
          </Link>
          <Button variant="ghost" size="sm" className="font-bold" onClick={() => user ? router.push('/settings') : router.push('/')}>
            <ChevronLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-5xl space-y-24">
        <section className="text-center space-y-6">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Master Coordination</Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">The Tactical <span className="text-primary italic">Manual.</span></h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">Granular guidance for the ultimate team hub.</p>
        </section>

        <Accordion type="single" collapsible className="w-full space-y-6">
          {featureSections.map((section, i) => (
            <AccordionItem key={i} value={`section-${i}`} className="bg-white border-none shadow-2xl rounded-[2.5rem] px-8 lg:px-12 overflow-hidden ring-1 ring-black/5">
              <AccordionTrigger className="hover:no-underline py-10 group">
                <div className="flex items-center gap-6 text-left">
                  <div className="bg-muted p-4 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all"><section.icon className="h-8 w-8" /></div>
                  <div><h3 className="text-2xl font-black uppercase tracking-tight">{section.title}</h3><p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{section.description}</p></div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2 pb-12">
                <div className="grid grid-cols-1 gap-8 max-w-3xl ml-4 lg:ml-16">
                  {section.manual.map((m, idx) => (
                    <div key={idx} className="space-y-3 relative pl-10 border-l-2 border-muted">
                      <div className="absolute -left-[11px] top-0 bg-white p-1"><div className="h-4 w-4 rounded-full bg-primary shadow-lg" /></div>
                      <h4 className="font-black text-sm uppercase tracking-wider text-primary">{m.step}</h4>
                      <p className="text-base font-medium leading-relaxed text-muted-foreground">{m.details}</p>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <section className="space-y-12">
          <div className="text-center space-y-2"><h2 className="text-4xl font-black uppercase tracking-tight">Tier Protocol</h2></div>
          <div className="overflow-x-auto rounded-[2.5rem] shadow-2xl ring-1 ring-black/5">
            <table className="w-full text-left border-collapse bg-white">
              <thead><tr className="bg-black text-white text-[11px] font-black uppercase tracking-[0.2em]"><th className="px-8 py-6 rounded-tl-[2.5rem]">Module</th><th className="px-8 py-6">Starter</th><th className="px-8 py-6">Pro</th><th className="px-8 py-6 rounded-tr-[2.5rem]">Club</th></tr></thead>
              <tbody className="divide-y">
                {[
                  { name: "Tactical Chats", s: true, p: true, c: true },
                  { name: "Game Scheduling", s: true, p: true, c: true },
                  { name: "Live Score Tracking", s: true, p: true, c: true },
                  { name: "League Registration", s: false, p: true, c: true },
                  { name: "Coach Approval Logic", s: false, p: true, c: true },
                  { name: "Media Vault (10GB)", s: false, p: true, c: true },
                  { name: "Video Compliance (75%)", s: true, p: true, c: true },
                  { name: "Live Feed Read", s: false, p: true, c: true },
                  { name: "Advanced Roster", s: false, p: true, c: true }
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-primary/5 transition-colors">
                    <td className="px-8 py-6 font-black text-xs uppercase">{row.name}</td>
                    <td className="px-8 py-6">{row.s ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 opacity-20" />}</td>
                    <td className="px-8 py-6">{row.p ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 opacity-20" />}</td>
                    <td className="px-8 py-6">{row.c ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 opacity-20" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
