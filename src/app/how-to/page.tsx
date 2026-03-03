
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
  Check
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
      description: "The primary broadcast hub for daily squad coordination and engagement. (Pro/Club Only)",
      manual: [
        {
          step: "Access Protocol",
          details: "The Live Feed is a Pro feature. Starter squads can view the tab, but require an upgrade to post updates, view historical content, or interact with squad media."
        },
        {
          step: "Posting Updates",
          details: "Navigate to 'Feed'. Tap the 'What's the play?' input box. Type your message and tap 'Post to Squad'. Pro members can attach high-resolution photos using the image icon."
        },
        {
          step: "Advanced Squad Polls",
          details: "Tap the bar chart icon. Enter a question and at least 2 options. Pro users can tap the 'Image' icon next to any option to attach a visual aid (e.g., play diagrams or jersey designs)."
        },
        {
          step: "Engaging & Discussing",
          details: "Tap the 'Heart' to like a post. Tap 'Discussion' to open the comment thread. Comments are real-time and provide a public space for team motivation."
        },
        {
          step: "Updating Team Hero",
          details: "Admins can tap 'Change Cover' on the main feed banner. Upload a high-resolution team photo to set the tactical mood for the entire squad's dashboard."
        }
      ]
    },
    {
      title: "2. Schedule & Match Day",
      icon: CalendarDays,
      description: "Managing logistics, itinerary, and real-time attendance.",
      manual: [
        {
          step: "Scheduling a Standard Match",
          details: "Tap '+ Match'. Enter the opponent, date, time, and location. This creates a dedicated 'Match Hub' where members can RSVP and view directions."
        },
        {
          step: "Deploying a Tournament",
          details: "Tap '+ Tournament'. Unlike matches, tournaments can span multiple days. Enter start and end dates, list all participating teams, and set up your initial matches in the 'Matchups' tab."
        },
        {
          step: "Elite Tournament Hubs ($50)",
          details: "Purchase a Tournament Credit in the 'Pricing' tab. Use it to 'Publish Elite Hub'. This generates a public Spectator URL. Anyone with this link (parents, scouts) can view live brackets and scores without logging in."
        },
        {
          step: "Attendance Protocol",
          details: "Members see a persistent attendance bar at the bottom of event hubs. Tap 'Going', 'Maybe', or 'Decline'. Coaches can view the 'Squad Roster' tab to see a verified list of who is attending in real-time."
        }
      ]
    },
    {
      title: "3. Tactical Chats",
      icon: MessageCircle,
      description: "Secure, role-based private messaging available to all squads (including Starter).",
      manual: [
        {
          step: "Thread Creation",
          details: "Tap '+ New Chat'. Name it specifically (e.g., 'Offensive Unit' or 'Travel Logistics'). Starter squads have full access to core messaging features."
        },
        {
          step: "Member Selection",
          details: "Choose specific teammates or parents to add. This keeps tactical discussions private from the rest of the squad and minimizes notification noise."
        },
        {
          step: "Media & Strategy Polls",
          details: "Use the image icon to send maps or field diagrams. Use the poll icon to get instant consensus on logistics like 'Arrival time at gate?'."
        }
      ]
    },
    {
      title: "4. Roster & Financials",
      icon: Users2,
      description: "Managing authority, recruitments, and dues.",
      manual: [
        {
          step: "Recruiting with Team Codes",
          details: "Tap 'Invite'. Copy your unique 6-character 'Squad Code'. Send this to new players or parents. When they sign up and enter the code, they are instantly verified."
        },
        {
          step: "Basic Roster Management (Starter)",
          details: "Manage player names, positions, and jersey numbers. All plans can track individual fee balances and mark them as 'Paid' to maintain a professional fiscal ledger."
        },
        {
          step: "Advanced Roster Logic (Pro/Club)",
          details: "Unlock detailed tracking for medical clearances, emergency contact networks, and private coaching notes. Monitor the 'Compliance Status' icons for medical clearances and media releases."
        }
      ]
    },
    {
      title: "5. Leagues & Cross-Team Control",
      icon: Shield,
      description: "Inter-squad coordination and regional standings. (Pro/Club Only)",
      manual: [
        {
          step: "Establishing a League",
          details: "Tap 'Start New League'. You become the League Commissioner. Invite coaches via email. When they accept, their squad's stats are linked to your leaderboard automatically."
        },
        {
          step: "Tactical Messaging",
          details: "Tap any team in the league directory to 'Message Opponent'. This creates a private cross-team chat channel between you and their coaching staff."
        }
      ]
    },
    {
      title: "6. Training Vault (Drills)",
      icon: Dumbbell,
      description: "Private playbook and video lesson repository. (Pro/Club Only)",
      manual: [
        {
          step: "Adding a Video Lesson",
          details: "Tap 'Add Drill'. Enter a title and paste a YouTube URL. The platform will automatically embed the video into a distraction-free 'Theater Mode' for the squad."
        },
        {
          step: "Uploading Visual Aids",
          details: "Upload play diagrams or whiteboard photos. Members can toggle between the video view and the image view during study sessions."
        }
      ]
    },
    {
      title: "7. Team Library",
      icon: FolderClosed,
      description: "Secure squad-wide storage for documents and resources. (Pro/Club Only)",
      manual: [
        {
          step: "Resource Uploads",
          details: "Upload PDFs or JPGs. Select an 'Acknowledgment Type' if you need every member to digitally sign the file. Admins can view a timestamped 'Audit' list of signatures."
        }
      ]
    },
    {
      title: "8. Institutional Management (Clubs)",
      icon: Building,
      description: "Scaling coordination for multi-team organizations.",
      manual: [
        {
          step: "Multi-Team Dashboard",
          details: "Club plans grant access to the 'Club Hub'. This shows an overview of every squad you manage under one organization and allows for centralized quota seat assignment."
        }
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

      <main className="container mx-auto px-6 py-12 max-w-5xl space-y-24">
        <section className="text-center space-y-6">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">Master Coordination</Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">The Tactical <span className="text-primary italic">Manual.</span></h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
            The complete source of truth for every module. From grassroots logistics to elite institutional scaling.
          </p>
        </section>

        <section className="space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black uppercase tracking-tight">Mastering the Modules</h2>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Detailed step-by-step guides</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-6">
            {featureSections.map((section, i) => (
              <AccordionItem key={i} value={`section-${i}`} className="bg-white border-none shadow-2xl rounded-[2.5rem] px-8 lg:px-12 overflow-hidden ring-1 ring-black/5 hover:ring-primary/20 transition-all">
                <AccordionTrigger className="hover:no-underline py-10 group">
                  <div className="flex items-center gap-6 text-left">
                    <div className="bg-muted p-4 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all">
                      <section.icon className="h-8 w-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight">{section.title}</h3>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">{section.description}</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-2 pb-12">
                  <div className="grid grid-cols-1 gap-8 max-w-3xl ml-4 lg:ml-16">
                    {section.manual.map((m, idx) => (
                      <div key={idx} className="space-y-3 relative pl-10 border-l-2 border-muted hover:border-primary/30 transition-colors">
                        <div className="absolute -left-[11px] top-0 bg-white p-1">
                          <div className="h-4 w-4 rounded-full bg-primary shadow-lg shadow-primary/20" />
                        </div>
                        <h4 className="font-black text-sm uppercase tracking-wider text-primary">{m.step}</h4>
                        <p className="text-base font-medium leading-relaxed text-muted-foreground">
                          {m.details}
                        </p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black uppercase tracking-tight">Tier Protocol</h2>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Clarity on organizational scale</p>
          </div>
          
          <div className="overflow-x-auto rounded-[2.5rem] shadow-2xl ring-1 ring-black/5">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-black text-white text-[11px] font-black uppercase tracking-[0.2em]">
                  <th className="px-8 py-6 rounded-tl-[2.5rem]">Tactical Module</th>
                  <th className="px-8 py-6">Starter Squad</th>
                  <th className="px-8 py-6">Squad Pro</th>
                  <th className="px-8 py-6 rounded-tr-[2.5rem]">Club Suite</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y">
                {[
                  { name: "Tactical Chats & Polls", starter: true, pro: true, club: true },
                  { name: "Schedule & RSVP", starter: true, pro: true, club: true },
                  { name: "Basic Roster Management", starter: true, pro: true, club: true },
                  { name: "Live Feed Reading", starter: false, pro: true, club: true },
                  { name: "Live Feed Posting", starter: false, pro: true, club: true },
                  { name: "Training Library", starter: false, pro: true, club: true },
                  { name: "Advanced Roster Details", starter: false, pro: true, club: true },
                  { name: "Waivers & Compliance", starter: false, pro: true, club: true },
                  { name: "Cross-Team Leagues", starter: false, pro: true, club: true },
                  { name: "Multi-Team Dashboard", starter: false, pro: false, club: true },
                ].map((row, i) => (
                  <tr key={i} className="hover:bg-primary/5 transition-colors">
                    <td className="px-8 py-6 font-black text-xs uppercase">{row.name}</td>
                    <td className="px-8 py-6">{row.starter ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground/20" />}</td>
                    <td className="px-8 py-6">{row.pro ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground/20" />}</td>
                    <td className="px-8 py-6">{row.club ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Lock className="h-4 w-4 text-muted-foreground/20" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-black text-white rounded-[4rem] p-12 md:p-24 relative overflow-hidden shadow-2xl text-center md:text-left">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
            <Zap className="h-96 w-96 text-primary" />
          </div>
          <div className="relative z-10 max-w-2xl space-y-10 mx-auto md:mx-0">
            <div className="space-y-4">
              <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[11px] px-5 h-8">Ready to dominate?</Badge>
              <h2 className="text-5xl md:text-8xl font-black tracking-tighter leading-[0.85]">SCALE YOUR <br /> LEGACY.</h2>
              <p className="text-white/60 font-medium text-xl leading-relaxed">
                You have the manual. Now execute the play. Join thousands of elite coordinators already winning with The Squad.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-6 pt-4">
              <Link href="/signup" className="w-full sm:w-auto">
                <Button className="h-16 px-12 rounded-[1.5rem] text-xl font-black shadow-2xl shadow-primary/20 w-full">Start Your Squad</Button>
              </Link>
              <Link href="/pricing" className="w-full sm:w-auto">
                <Button variant="outline" className="h-16 px-12 rounded-[1.5rem] text-xl font-black bg-white/10 border-white/20 text-white hover:bg-white/20 w-full">View Plans</Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-16 bg-muted/50 border-t mt-20">
        <div className="container mx-auto px-6 text-center space-y-8">
          <BrandLogo variant="light-background" className="h-10 w-40 mx-auto" />
          <div className="flex flex-wrap justify-center items-center gap-8 text-[11px] font-black uppercase tracking-[0.25em] text-muted-foreground">
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <Link href="/safety" className="hover:text-primary transition-colors">Safety</Link>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-40">
            © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
