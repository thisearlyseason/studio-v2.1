
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
  HelpCircle
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
      title: "The Squad Feed",
      icon: LayoutDashboard,
      description: "Your team's high-priority broadcast hub.",
      steps: [
        "View team-wide updates and important announcements.",
        "Post messages, photos, and strategy polls (Pro Feature).",
        "Interact with teammates through likes and comments.",
        "Admins can pin high-priority alerts to the top of the feed."
      ],
      tier: "Starter / Pro"
    },
    {
      title: "Schedule & Events",
      icon: CalendarDays,
      description: "Manage match day logistics and attendance.",
      steps: [
        "Create 'Matches' for standard team outings.",
        "Deploy 'Tournaments' to track multi-day brackets (Pro).",
        "Launch 'Elite Tournament Hubs' for public scores and standings (Requires $50 Token).",
        "Track real-time RSVPs (Going, Maybe, Declined) for every member."
      ],
      tier: "Starter / Elite"
    },
    {
      title: "Leagues & Standings",
      icon: Shield,
      description: "Connect with opposing squads and track rankings.",
      steps: [
        "Start a new League and invite other Team Coaches.",
        "Manually enroll teams to track external scores.",
        "Message opposing coaches directly via Tactical Channels.",
        "View global standings automatically updated by match results."
      ],
      tier: "Pro / Club"
    },
    {
      title: "Games & Results",
      icon: Trophy,
      description: "Record your journey to dominance.",
      steps: [
        "Record match scores and final results.",
        "Add key match highlights and coaching notes.",
        "Visualize season trajectory with Momentum Charts (Pro).",
        "Export results to CSV for official reporting."
      ],
      tier: "Starter / Pro"
    },
    {
      title: "Training Vault (Drills)",
      icon: Dumbbell,
      description: "Centralized playbook and strategy library.",
      steps: [
        "Add training videos via YouTube integration.",
        "Upload visual aids and diagrams for specific plays.",
        "Provide step-by-step instructions for team coordination.",
        "Toggle between video and image views for better visualization."
      ],
      tier: "Pro"
    },
    {
      title: "Tactical Chats",
      icon: MessageCircle,
      description: "Secure, role-based discussion channels.",
      steps: [
        "Create specific threads for travel, strategy, or positions.",
        "Select specific members to participate in private discussions.",
        "Share media and launch quick strategy polls.",
        "Admins can moderate and purge discussions as needed."
      ],
      tier: "Pro"
    },
    {
      title: "Roster Management",
      icon: Users2,
      description: "Organize your squad and handle logistics.",
      steps: [
        "Manage member roles (Coach, Player, Parent).",
        "Assign jersey numbers and track positions.",
        "Track fee payments and individual member ledgers.",
        "Monitor compliance (Medical clearance, waivers, media release)."
      ],
      tier: "Starter / Pro"
    },
    {
      title: "Team Library",
      icon: FolderClosed,
      description: "Secure repository for official documents.",
      steps: [
        "Upload PDFs, images, and official team files.",
        "Share external tactical links (Hudl, Game Tape, etc.).",
        "Request digital signatures/acknowledgments for waivers.",
        "Audit member compliance at a glance."
      ],
      tier: "Pro"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href={user ? "/feed" : "/"}>
            <BrandLogo variant="light-background" className="h-8 w-32" />
          </Link>
          <Button 
            variant="ghost" 
            size="sm" 
            className="font-bold"
            onClick={() => user ? router.push('/settings') : router.push('/')}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            {user ? 'Back to Settings' : 'Back to Home'}
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-6 py-12 max-w-5xl space-y-20">
        <section className="text-center space-y-6">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Master Coordination</Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">The Squad <span className="text-primary italic">Manual.</span></h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
            Everything you need to know about coordinating your team like a pro. Step-by-step guides for every tactical module.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {featureSections.map((feature, i) => (
            <Card key={i} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden group hover:ring-2 ring-primary/20 transition-all">
              <CardHeader className="bg-muted/30 border-b p-8">
                <div className="flex items-center justify-between mb-2">
                  <div className="bg-white p-3 rounded-2xl shadow-sm text-primary group-hover:scale-110 transition-transform">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{feature.tier}</Badge>
                </div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">{feature.title}</CardTitle>
                <CardDescription className="font-bold text-muted-foreground uppercase text-[10px] tracking-widest">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-8">
                <ul className="space-y-4">
                  {feature.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3 text-sm font-medium leading-relaxed">
                      <div className="bg-primary/10 text-primary h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-black">
                        {idx + 1}
                      </div>
                      <span>{step}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tight">Plan Comparison</h2>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Choosing the right scale for your squad</p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="px-6 py-4 rounded-tl-3xl">Feature</th>
                  <th className="px-6 py-4">Starter</th>
                  <th className="px-6 py-4">Pro</th>
                  <th className="px-6 py-4 rounded-tr-3xl">Club Suite</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y">
                <tr className="hover:bg-muted/30">
                  <td className="px-6 py-5 font-black text-xs uppercase">Schedule & Results</td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-6 py-5 font-black text-xs uppercase">Tactical Chats & Polls</td>
                  <td className="px-6 py-5 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-6 py-5 font-black text-xs uppercase">Training Library</td>
                  <td className="px-6 py-5 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-6 py-5 font-black text-xs uppercase">Waivers & Medicals</td>
                  <td className="px-6 py-5 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-muted/30">
                  <td className="px-6 py-5 font-black text-xs uppercase">Multi-Team Hub</td>
                  <td className="px-6 py-5 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-6 py-5 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-6 py-5"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-10">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tight">Frequently Asked Questions</h2>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Quick answers for squad coordinators</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-4">
            {[
              {
                q: "What is a Team Code and how do I use it?",
                a: "A Team Code is a unique 6-character identifier for your squad hub. You can find it in your 'Team' tab. Share this code with players or parents so they can join your team automatically during signup."
              },
              {
                q: "How do Tournament Credits work?",
                a: "Tournament Credits are one-time use tokens ($50) that allow you to publish an 'Elite Tournament Hub'. This unlocks public standings, dynamic brackets, and spectator links for a specific event. Standard matches and basic team tournaments do not require credits."
              },
              {
                q: "Can I manage multiple teams under one account?",
                a: "Yes! You can create or join an unlimited number of 'Starter Squads' for free. If you want Pro features for multiple squads, we recommend the 'Club Suite' (Duo, Crew, League, etc.) which provides a bulk quota of Pro seats for a discounted price."
              },
              {
                q: "Is my team data private?",
                a: "Absolutely. Each team is a private silo. Only members who have joined using your specific team code can see the feed, roster, library, or chats. Even our platform admins only access your data for critical support issues."
              },
              {
                q: "What happens when I reset my demo session?",
                a: "Resetting a demo session purges all modifications you've made and restores the environment to its baseline state. This is useful for testing features multiple times or starting fresh after a coordination exercise."
              }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="bg-white border-none shadow-md rounded-2xl px-6">
                <AccordionTrigger className="font-black text-sm text-left uppercase tracking-tight hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="font-medium text-muted-foreground leading-relaxed pt-2 pb-6">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="bg-black text-white rounded-[3rem] p-10 md:p-16 relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
            <Zap className="h-64 w-64 text-primary" />
          </div>
          <div className="relative z-10 max-w-2xl space-y-6 text-center md:text-left mx-auto md:mx-0">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Ready to scale?</Badge>
            <h2 className="text-4xl md:text-6xl font-black tracking-tighter leading-[0.9]">DOMINATE YOUR <br /> COMPETITION.</h2>
            <p className="text-white/60 font-medium text-lg leading-relaxed">
              Now that you know the plays, it's time to execute. Start your squad today and experience professional coordination.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4 justify-center md:justify-start">
              <Link href="/signup">
                <Button className="h-14 px-10 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 w-full sm:w-auto">Start Your Squad</Button>
              </Link>
              <Link href="/pricing">
                <Button variant="outline" className="h-14 px-10 rounded-2xl text-lg font-black bg-white/10 border-white/20 text-white hover:bg-white/20 w-full sm:w-auto">View All Plans</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 bg-muted/50 border-t mt-12">
        <div className="container mx-auto px-6 text-center">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
            © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
