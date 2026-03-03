
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
  Download
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
      description: "High-priority broadcast hub for your entire team.",
      tier: "Starter / Pro",
      manual: [
        {
          step: "Stay Informed",
          details: "Check the top of the feed for 'Pinned Alerts' from coaches. These are high-priority notifications that stay visible until understood."
        },
        {
          step: "Create a Post",
          details: "Tap the input box to write an update. Use the icons to add a photo or launch a poll. (Pro feature for members, free for admins)."
        },
        {
          step: "Launch a Poll",
          details: "Ask questions like 'Training at 5 or 6?'. Add up to 6 options and even attach photos to options for visual voting."
        },
        {
          step: "Engagement",
          details: "Tap 'Like' or the 'Discussion' icon to comment on posts. This is the primary place for public squad motivation."
        }
      ]
    },
    {
      title: "Schedule & Itinerary",
      icon: CalendarDays,
      description: "Match day logistics and attendance tracking.",
      tier: "Starter / Elite",
      manual: [
        {
          step: "Create an Event",
          details: "Tap '+ Match' for a standard team outing. Enter the date, location, and a description. All members are notified instantly."
        },
        {
          step: "Deploy a Tournament",
          details: "Select '+ Tournament'. You can manage multi-day brackets, list participating teams, and track match scores across several dates."
        },
        {
          step: "Elite Hub (Add-on)",
          details: "Buy a 'Tournament Credit' ($50) to launch an Elite Hub. This generates a public URL for parents and scouts to view live scores and brackets."
        },
        {
          step: "RSVP Protocol",
          details: "Members tap 'Going', 'Maybe', or 'Decline'. Coaches see a real-time count and detailed roster list for every event."
        }
      ]
    },
    {
      title: "Leagues & Cross-Team",
      icon: Shield,
      description: "Global standings and inter-squad coordination.",
      tier: "Pro / Club",
      manual: [
        {
          step: "Start a League",
          details: "If you are a league organizer, tap 'Start New League'. You become the commissioner of this competitive hub."
        },
        {
          step: "Invite Opponents",
          details: "Enter the email of an opposing coach. When they accept, their verified squad data and rosters link to your standings."
        },
        {
          step: "Manual Enrollment",
          details: "No account for an opponent? Add them manually! You can still track their scores and keep the standings updated."
        },
        {
          step: "Tactical Channels",
          details: "Tap the coach's name in the directory to message them. Perfect for coordinate logistics like field changes or jersey colors."
        }
      ]
    },
    {
      title: "Games & Stats",
      icon: Trophy,
      description: "Documenting your season results and trajectory.",
      tier: "Starter / Pro",
      manual: [
        {
          step: "Record a Match",
          details: "After a game, tap 'Record Match'. Enter the final score and result (Win, Loss, or Tie)."
        },
        {
          step: "Add Highlights",
          details: "Use the notes section to record key plays or tactical adjustments. (Pro features allow detailed highlights)."
        },
        {
          step: "Momentum Charts",
          details: "Visit this tab to see your 'Season Trajectory' chart. It visualizes your scoring trends vs. your opponents."
        },
        {
          step: "Export Data",
          details: "Tap the 'Export' button to download a CSV of your entire season history for league reporting."
        }
      ]
    },
    {
      title: "Training Vault (Drills)",
      icon: Dumbbell,
      description: "Your team's private playbook and tactical resource.",
      tier: "Pro",
      manual: [
        {
          step: "Add a Drill",
          details: "Tap 'Add Drill'. Enter a title and paste a YouTube URL to embed a video for the squad to study."
        },
        {
          step: "Visual Aids",
          details: "Upload an image of a diagram or a whiteboard play. Members can toggle between the video and the image view."
        },
        {
          step: "Instructions",
          details: "Provide step-by-step guidance in the text box. This creates a standardized reference for everyone."
        },
        {
          step: "Study Mode",
          details: "Members can tap any drill card to open a full-screen theater mode for focused learning."
        }
      ]
    },
    {
      title: "Tactical Chats",
      icon: MessageCircle,
      description: "Private, role-based discussion threads.",
      tier: "Pro",
      manual: [
        {
          step: "Launch a Thread",
          details: "Tap '+ New Chat'. Give it a specific name like 'Travel Plans' or 'Defensive Strategy'."
        },
        {
          step: "Select Members",
          details: "Only people you select will be added to the thread. This is ideal for keeping parents or specific units separate."
        },
        {
          step: "Share Media",
          details: "Send photos of field maps or logistics documents directly into the chat for quick reference."
        },
        {
          step: "Consensus Polls",
          details: "Need a quick decision? Tap the bar chart icon in chat to launch a mini-poll for the participants."
        }
      ]
    },
    {
      title: "Roster Logic",
      icon: Users2,
      description: "Coordinating member details and authority.",
      tier: "Starter / Pro",
      manual: [
        {
          step: "Invite Members",
          details: "Tap 'Invite'. Copy your unique 6-character 'Team Code' and text it to your players or parents."
        },
        {
          step: "Manage Roles",
          details: "Tap a member's card to change their position or authority level (e.g., promote a player to 'Assistant Coach')."
        },
        {
          step: "Track Payments",
          details: "Tap 'Add Fee' on a member's profile to log dues. You can track individual balances and mark them as paid."
        },
        {
          step: "Compliance Audit",
          details: "Monitor if members have signed their waivers or provided medical clearance via the status icons."
        }
      ]
    },
    {
      title: "Team Library",
      icon: FolderClosed,
      description: "Secure storage for squad-wide documentation.",
      tier: "Pro",
      manual: [
        {
          step: "Upload Files",
          details: "Upload PDFs, JPGs, or other documents. These are siloed and only visible to your specific squad."
        },
        {
          step: "Acknowledgment Categories",
          details: "When uploading, select a 'Compliance Type' like 'General Waiver' if you need members to digitally sign it."
        },
        {
          step: "Tactical Links",
          details: "Add external URLs for things like Hudl, team websites, or hotel booking pages."
        },
        {
          step: "Digital Signatures",
          details: "Members tap 'Agree' on compliance files. Admins can view a full audit log of who has agreed."
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
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none uppercase">The Squad <span className="text-primary italic">Manual.</span></h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
            A comprehensive, step-by-step guide to every tactical module. Learn to coordinate your team like a pro.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {featureSections.map((feature, i) => (
            <Card key={i} className="rounded-[3rem] border-none shadow-2xl overflow-hidden group hover:ring-4 ring-primary/10 transition-all flex flex-col">
              <CardHeader className="bg-muted/30 border-b p-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white p-4 rounded-2xl shadow-sm text-primary group-hover:scale-110 transition-transform">
                    <feature.icon className="h-8 w-8" />
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase border-primary/20 text-primary px-3 h-6">{feature.tier}</Badge>
                </div>
                <CardTitle className="text-3xl font-black uppercase tracking-tight">{feature.title}</CardTitle>
                <CardDescription className="font-bold text-muted-foreground uppercase text-[11px] tracking-[0.2em]">{feature.description}</CardDescription>
              </CardHeader>
              <CardContent className="p-10 space-y-8 flex-1">
                <div className="space-y-6">
                  {feature.manual.map((m, idx) => (
                    <div key={idx} className="space-y-2 group/step">
                      <div className="flex items-center gap-3">
                        <div className="bg-primary text-white h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-black shadow-lg shadow-primary/20">
                          {idx + 1}
                        </div>
                        <h4 className="font-black text-xs uppercase tracking-wider">{m.step}</h4>
                      </div>
                      <p className="text-sm font-medium leading-relaxed text-muted-foreground pl-9">
                        {m.details}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
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
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Schedule & RSVP</td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Tactical Chats & Polls</td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Training vault</td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Waivers & Compliance</td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Cross-Team Leagues</td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
                <tr className="hover:bg-primary/5 transition-colors">
                  <td className="px-8 py-6 font-black text-xs uppercase">Multi-Team Dashboard</td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6 opacity-20"><Lock className="h-4 w-4" /></td>
                  <td className="px-8 py-6"><CheckCircle2 className="h-5 w-5 text-green-500" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-12">
          <div className="text-center space-y-2">
            <h2 className="text-4xl font-black uppercase tracking-tight">Coordinators FAQ</h2>
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Essential answers for team management</p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-4">
            {[
              {
                q: "How do I invite my players and parents?",
                a: "Go to your 'Roster' tab and tap 'Invite'. You will see a unique 6-character Team Code. Share this code via text or group chat. When your members sign up for The Squad, they enter this code to automatically join your private hub."
              },
              {
                q: "What's the difference between a Standard Match and Elite Hub?",
                a: "A Standard Match tracks RSVPs and scores internally for your squad. An Elite Tournament Hub ($50 credit) creates a public-facing leaderboard and bracket that anyone with the link can follow without logging in. Perfect for scouts and family."
              },
              {
                q: "How do I manage multiple teams under one organization?",
                a: "Upgrade to a 'Club' plan (Duo, Crew, League, etc.). This allows you to create several squads under one email. You'll get a 'Club Hub' dashboard to see an overview of every team you manage."
              },
              {
                q: "Is the training library private?",
                a: "Yes. Any YouTube videos or visual plays you add to your Training tab are only visible to verified members of your specific team. Your strategy is safe with us."
              },
              {
                q: "What happens if I use all my Club plan team slots?",
                a: "You can easily upgrade to the next tier (e.g., from Duo to Crew) in the Pricing dashboard. Your data will seamlessly transfer, and you'll immediately unlock more slots for new squads."
              }
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="bg-white border-none shadow-xl rounded-[2rem] px-10 overflow-hidden ring-1 ring-black/5 hover:ring-primary/20 transition-all">
                <AccordionTrigger className="font-black text-sm lg:text-lg text-left uppercase tracking-tight hover:no-underline py-8">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="font-medium text-muted-foreground text-sm lg:text-base leading-relaxed pt-2 pb-10">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
