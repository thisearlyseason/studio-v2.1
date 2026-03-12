
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ChevronRight, 
  Calendar, 
  MessageSquare, 
  Users, 
  Trophy, 
  CheckCircle2, 
  Mail, 
  MapPin, 
  Phone,
  BarChart3,
  Globe,
  ArrowRight,
  Play,
  Video,
  ClipboardList,
  ShieldCheck,
  Infinity,
  AlertCircle,
  Zap,
  User,
  Baby,
  Table as TableIcon,
  Sparkles,
  Loader2,
  Check,
  X,
  Activity,
  CreditCard,
  ShieldAlert,
  Smartphone,
  Layout,
  Terminal,
  MousePointer2,
  Lock,
  BrainCircuit,
  Package,
  DollarSign,
  PenTool,
  Search,
  Building
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useUser, useAuth } from '@/firebase';
import { signInAnonymously, signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter
} from '@/components/ui/dialog';

const DEMO_OPTIONS = [
  { id: 'starter_squad', name: 'Starter Demo', icon: Users, desc: 'Grassroots essentials' },
  { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Professional elite coordination' },
  { id: 'elite_teams', name: 'Elite Org Demo', icon: Trophy, desc: 'Institutional multi-team hub' },
  { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Teammate recruiting view' },
  { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Guardian safety view' }
];

export default function LandingPage() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const sportsImages = [
    "https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&q=80&w=1200",
    "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&q=80&w=1200"
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % sportsImages.length);
    }, 5000);

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      clearInterval(timer);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [sportsImages.length]);

  const handleLaunchDemo = async (planId: string) => {
    setIsDemoLoading(true);
    try {
      await signOut(auth);
      await signInAnonymously(auth);
      window.location.href = `/dashboard?seed_demo=${planId}`;
    } catch (error: any) {
      toast({
        title: "Demo Launch Failed",
        description: "Please try again later.",
        variant: "destructive"
      });
      setIsDemoLoading(false);
    }
  };

  if (isUserLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20">
      <nav className={cn(
        "fixed top-0 w-full z-50 transition-all duration-300 border-b",
        isScrolled ? "bg-white/80 backdrop-blur-md py-3 shadow-sm border-border" : "bg-transparent py-5 border-transparent"
      )}>
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <BrandLogo 
              variant={isScrolled ? "light-background" : "dark-background"} 
              className="h-10 w-40" 
              priority 
            />
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-widest">
            <a href="#features" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Features</a>
            <a href="#roles" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Roles</a>
            <a href="#comparison" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Compare</a>
            <a href="#pricing" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Pricing</a>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className={cn("font-bold", isScrolled ? "text-foreground" : "text-white hover:bg-white/10")}>
                Log In
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="rounded-full px-6 font-bold shadow-lg shadow-primary/20">
                Join Now
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {sportsImages.map((img, idx) => (
          <div 
            key={idx}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-in-out",
              currentImageIndex === idx ? "opacity-100" : "opacity-0"
            )}
          >
            <Image 
              src={img} 
              alt="Sports Background" 
              fill
              className="object-cover scale-105"
              data-ai-hint="stadium crowd"
              priority={idx === 0}
            />
            <div className="absolute inset-0 bg-black/60 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
          </div>
        ))}

        <div className="container relative z-10 px-6 text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Badge className="bg-primary/20 backdrop-blur-md text-primary-foreground border-primary/30 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] animate-pulse">
            Institutional Team Infrastructure
          </Badge>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.9] max-w-4xl mx-auto drop-shadow-2xl">
            DOMINATE <br className="hidden md:block" /> YOUR <span className="text-primary italic">SEASON.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto font-medium leading-relaxed">
            The all-in-one tactical platform for elite sports organizations. Coordinate rosters, automate brackets, and verify performance.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 max-w-md mx-auto sm:max-w-none">
            {user ? (
              <Link href="/dashboard" className="w-full">
                <Button size="lg" className="h-16 px-10 rounded-full text-lg font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Go to Dashboard <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            ) : (
              <Link href="/signup" className="w-full">
                <Button size="lg" className="h-16 px-10 rounded-full text-lg font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Deploy Your Squad <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            )}
            <Dialog open={isDemoDialogOpen} onOpenChange={setIsDemoDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="outline" className="h-16 px-10 rounded-full text-lg font-black bg-white/10 border-white/20 text-white backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all w-full">
                  Experience Demo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white">
                <DialogTitle className="sr-only">Experience Tactical Demo Hub</DialogTitle>
                <div className="h-2 bg-primary w-full" />
                <div className="p-8 lg:p-12 space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-black uppercase tracking-tight">Tactical Perspectives</h2>
                    <p className="text-base font-bold text-primary uppercase tracking-widest">Select your role to begin</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DEMO_OPTIONS.map((demo) => (
                      <Button 
                        key={demo.id} 
                        variant="outline" 
                        className="h-24 rounded-[1.5rem] bg-muted/30 border-2 border-transparent hover:border-primary/20 hover:bg-white hover:text-foreground transition-all flex items-center justify-between px-6 group"
                        onClick={() => handleLaunchDemo(demo.id)}
                        disabled={isDemoLoading}
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-white p-3 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors shadow-sm">
                            <demo.icon className="h-6 w-6" />
                          </div>
                          <div className="text-left">
                            <p className="font-black text-sm uppercase tracking-widest">{demo.name}</p>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-tighter">{demo.desc}</p>
                          </div>
                        </div>
                        {isDemoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </Button>
                    ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      <section id="features" className="py-32 bg-white relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-24 max-w-3xl mx-auto">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">
              Institutional Suite
            </Badge>
            <h3 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">
              PROFESSIONAL <br /> <span className="text-primary italic">INFRASTRUCTURE.</span>
            </h3>
            <p className="text-muted-foreground font-medium text-lg pt-4 leading-relaxed">
              The Squad provides the foundational protocols and advanced modules required to scale from a single team to an entire league.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <TableIcon className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Elite Tournament Engine</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                Automated bracket generation with a <strong>Public Spectator URL</strong> and mobile <strong>Scorekeeper Portal</strong> for real-time standings.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Live Standings</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Public Result Feed</li>
              </ul>
            </Card>

            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <Video className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Film Watch Verification</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                The <strong>75% Watch Rule</strong> ensures teammates actually study the playbook. Monitor compliance in your master roster ledger.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> 10GB Pro Storage</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Verified Compliance</li>
              </ul>
            </Card>

            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <ClipboardList className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Recruitment Engine</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                Custom <strong>Form Architect</strong> for public registration. Collect sizes, medical waivers, and fees with automated coach assignment logic.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Digital Signatures</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Auto-Assignment</li>
              </ul>
            </Card>
          </div>
        </div>
      </section>

      <section id="comparison" className="py-32 bg-white relative">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-24 max-w-3xl mx-auto">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">Market Intelligence</Badge>
            <h3 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">COMPETITIVE <br /> <span className="text-primary italic">ADVANTAGE.</span></h3>
            <p className="text-muted-foreground font-medium text-lg pt-4 leading-relaxed">
              Legacy tools are for hobbyists. The Squad is built for organizations that demand absolute operational visibility and high-performance metrics.
            </p>
          </div>

          <div className="relative overflow-x-auto rounded-[3rem] border-2 shadow-2xl bg-white">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-black text-white">
                  <th className="py-8 px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Capabilities</th>
                  <th className="py-8 px-8 text-center bg-primary">
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-black text-xs tracking-tighter">THE SQUAD</span>
                      <Badge className="bg-white text-primary border-none font-black text-[7px] h-4">PLATFORM OF CHOICE</Badge>
                    </div>
                  </th>
                  <th className="py-8 px-8 text-center text-[10px] font-black uppercase tracking-widest opacity-40">TeamSnap</th>
                  <th className="py-8 px-8 text-center text-[10px] font-black uppercase tracking-widest opacity-40">Hudl</th>
                  <th className="py-8 px-8 text-center text-[10px] font-black uppercase tracking-widest opacity-40">TeamReach</th>
                  <th className="py-8 px-8 text-center text-[10px] font-black uppercase tracking-widest opacity-40">GameChanger</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[
                  { feature: "AI Scouting Analyst", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Built-in GenAI tactical analysis" },
                  { feature: "75% Film Watch Rule", squad: true, tsnap: false, hudl: "Partial", treach: false, gchanger: false, note: "Verified compliance monitoring" },
                  { feature: "Auto-Brackets + Public Hub", squad: true, tsnap: "Partial", hudl: false, treach: false, gchanger: "Basic", note: "One-click championship series" },
                  { feature: "Form Architect (Recruitment)", squad: true, tsnap: "Add-on", hudl: false, treach: false, gchanger: false, note: "Custom data entry + waivers" },
                  { feature: "Institutional Fiscal Audit", squad: true, tsnap: "Partial", hudl: false, treach: false, gchanger: false, note: "Club-wide dues aggregation" },
                  { feature: "Encrypted Tactical Chat", squad: true, tsnap: true, hudl: true, treach: true, gchanger: true, note: "Foundational comms" },
                  { feature: "Attendance & RSVPs", squad: true, tsnap: true, hudl: true, treach: true, gchanger: true, note: "Standard coordination" },
                ].map((row, idx) => (
                  <tr key={idx} className="group hover:bg-muted/10 transition-colors">
                    <td className="py-6 px-8">
                      <p className="font-black text-sm uppercase tracking-tight leading-none mb-1">{row.feature}</p>
                      <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{row.note}</p>
                    </td>
                    <td className="py-6 px-8 bg-primary/5 border-x-2 border-primary/10">
                      <div className="flex justify-center">
                        <Check className="h-6 w-6 text-primary stroke-[4px]" />
                      </div>
                    </td>
                    <td className="py-6 px-8 text-center">
                      <div className="flex justify-center">
                        {row.tsnap === true ? <Check className="h-5 w-5 text-primary stroke-[3px]" /> : (row.tsnap === false ? <X className="h-4 w-4 opacity-10" /> : <span className="text-[8px] font-black uppercase text-muted-foreground leading-none">{row.tsnap}</span>)}
                      </div>
                    </td>
                    <td className="py-6 px-8 text-center">
                      <div className="flex justify-center">
                        {row.hudl === true ? <Check className="h-5 w-5 text-primary stroke-[3px]" /> : (row.hudl === false ? <X className="h-4 w-4 opacity-10" /> : <span className="text-[8px] font-black uppercase text-muted-foreground leading-none">{row.hudl}</span>)}
                      </div>
                    </td>
                    <td className="py-6 px-8 text-center">
                      <div className="flex justify-center">
                        {row.treach === true ? <Check className="h-5 w-5 text-primary stroke-[3px]" /> : (row.treach === false ? <X className="h-4 w-4 opacity-10" /> : <span className="text-[8px] font-black uppercase text-muted-foreground leading-none">{row.treach}</span>)}
                      </div>
                    </td>
                    <td className="py-6 px-8 text-center">
                      <div className="flex justify-center">
                        {row.gchanger === true ? <Check className="h-5 w-5 text-primary stroke-[3px]" /> : (row.gchanger === false ? <X className="h-4 w-4 opacity-10" /> : <span className="text-[8px] font-black uppercase text-muted-foreground leading-none">{row.gchanger}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-32 bg-black text-white overflow-hidden relative">
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8">
              <Badge className="bg-primary text-white border-none font-black px-4 h-7 uppercase tracking-widest text-[10px]">Strategic Advantages</Badge>
              <h3 className="text-4xl md:text-6xl font-black tracking-tight leading-none uppercase">CHAMPIONSHIP <br /> <span className="text-primary italic">OPERATIONS.</span></h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <BrainCircuit className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">AI Scouting Analyst</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium">Generate <strong>Structured Opponent Intelligence</strong> from raw match notes using our integrated GenAI flows.</p>
                </div>
                <div className="space-y-3">
                  <Building className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">Institutional Hub</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium"><strong>Fiscal Pulse & Multi-Team Billing</strong> for clubs managing 20+ squads with aggregated financial auditing.</p>
                </div>
                <div className="space-y-3">
                  <Package className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">Inventory Vault</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium">Professional <strong>Inventory Vault & Asset Tracking</strong> for uniforms, medical kits, and training gear with return monitoring.</p>
                </div>
                <div className="space-y-3">
                  <ShieldAlert className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">Personnel Evaluations</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium"><strong>Staff Personnel Evaluations</strong> ledger for private tactical reviews and certified recruiting portfolios.</p>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-[120px] rounded-full" />
              <Card className="relative z-10 rounded-[3rem] border-white/10 bg-white/5 backdrop-blur-xl p-8 lg:p-12 shadow-2xl overflow-hidden">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20"><Activity className="h-5 w-5 text-white" /></div>
                      <span className="font-black uppercase tracking-widest text-xs">Live Tactical Feed</span>
                    </div>
                    <Badge variant="outline" className="border-white/20 text-white font-black text-[8px] px-2 h-5">ENCRYPTED</Badge>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-muted/20 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-24 bg-white/20 rounded-full" />
                        <div className="h-2 w-full bg-white/10 rounded-full" />
                      </div>
                    </div>
                    <div className="bg-primary/10 p-4 rounded-2xl border border-primary/20 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-full bg-primary/40 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="h-2 w-32 bg-primary/40 rounded-full" />
                        <div className="h-2 w-3/4 bg-primary/20 rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Active Coordination Hub</p>
                    <div className="flex -space-x-2">
                      {[1,2,3,4].map(i => <div key={i} className="h-6 w-6 rounded-full border-2 border-black bg-muted/40" />)}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section id="roles" className="py-32 bg-white relative overflow-hidden">
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl space-y-6 mb-16 mx-auto text-center">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 h-7 uppercase tracking-widest text-[10px]">
              Specialized Interfaces
            </Badge>
            <h3 className="text-4xl md:text-6xl font-black tracking-tight leading-none uppercase">Tailored <br /> <span className="text-primary italic">Account Roles.</span></h3>
            <p className="text-muted-foreground font-medium text-lg leading-relaxed">
              Every member of the organization receives a custom dashboard optimized for their specific operational objectives.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:translate-y-[-8px] transition-all duration-500">
              <Trophy className="h-12 w-12 text-primary" />
              <h5 className="text-2xl font-black uppercase tracking-tight">Coaches & Managers</h5>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">Full command of the roster, scheduling, and tactical playbooks. Launch broadcasts, auto-generate brackets, and track personnel performance.</p>
            </Card>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:translate-y-[-8px] transition-all duration-500">
              <Baby className="h-12 w-12 text-primary" />
              <h5 className="text-2xl font-black uppercase tracking-tight">Guardian Hub</h5>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">Manage multiple children from one unified <strong>Household Hub</strong>. Track consolidated dues, verify RSVPs, and claim volunteer shifts.</p>
            </Card>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:translate-y-[-8px] transition-all duration-500">
              <User className="h-12 w-12 text-primary" />
              <h5 className="text-2xl font-black uppercase tracking-tight">Athlete Performance</h5>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">A personal dashboard. Sign waivers, watch study film, track match results, and manage your <strong>Professional Recruiting Portfolio</strong>.</p>
            </Card>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-32 bg-muted/30 relative">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Transparent Institutional Tiers</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight">Scale Your Organization</h3>
            <div className="flex flex-col items-center gap-2 pt-2">
              <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px] bg-white px-4 py-2 rounded-full border border-primary/10 shadow-sm">
                <AlertCircle className="h-3 w-3" />
                <span>Limited Introductory Pricing • Competitive Advantage Locked</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto items-stretch">
            {/* Starter */}
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
              <CardHeader className="p-8 pb-4 space-y-4">
                <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">GRASSROOTS</Badge>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Starter</CardTitle>
                  <span className="text-4xl font-black tracking-tighter">$0</span>
                </div>
                <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">Foundational coordination hub.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                <div className="pt-4 border-t space-y-3">
                  <p className="text-[9px] font-black uppercase text-muted-foreground">Included</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Scheduling</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Tactical Chats</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Score Tracking</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="p-8 pt-0">
                <Link href="/signup" className="w-full">
                  <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border-2">Join Free</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Squad Pro */}
            <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden flex flex-col bg-black text-white ring-4 ring-primary relative scale-105 z-10">
              <div className="absolute top-0 right-0 p-4 opacity-10 -rotate-12 pointer-events-none"><Zap className="h-20 w-20" /></div>
              <CardHeader className="p-8 pb-4 space-y-4">
                <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase w-fit">ELITE SQUAD</Badge>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Squad Pro</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tighter text-primary">$19.99</span>
                    <span className="text-[10px] font-black uppercase opacity-60">/mo</span>
                  </div>
                </div>
                <CardDescription className="text-[10px] font-bold text-white/60 uppercase">Championship tools for one team.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                <div className="pt-4 border-t border-white/10 space-y-3">
                  <p className="text-[9px] font-black uppercase text-white/40">Everything in Starter +</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Sparkles className="h-3.5 w-3.5 text-primary" /> 75% Watch Rule</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Sparkles className="h-3.5 w-3.5 text-primary" /> Auto-Brackets</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Sparkles className="h-3.5 w-3.5 text-primary" /> Digital Waivers</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="p-8 pt-0">
                <Link href="/signup" className="w-full">
                  <Button className="w-full h-12 rounded-xl font-black shadow-xl bg-white text-black hover:bg-white/90 text-xs">Upgrade Squad</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Elite Teams */}
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
              <CardHeader className="p-8 pb-4 space-y-4">
                <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">ORGANIZATION</Badge>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Elite Teams</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tighter text-primary">$110</span>
                    <span className="text-[10px] font-black uppercase opacity-60 text-muted-foreground">/mo</span>
                  </div>
                </div>
                <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">8 Pro Teams + Master Club Hub.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                <div className="pt-4 border-t space-y-3">
                  <p className="text-[9px] font-black uppercase text-muted-foreground">Institutional</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Recruitment Portal</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Fee Management</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Staff Notes</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="p-8 pt-0">
                <Link href="/signup" className="w-full">
                  <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border-2">Deploy Club</Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Elite League */}
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
              <CardHeader className="p-8 pb-4 space-y-4">
                <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">INSTITUTIONAL</Badge>
                <div className="space-y-1">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">Elite League</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tracking-tighter text-primary">$279</span>
                    <span className="text-[10px] font-black uppercase opacity-60 text-muted-foreground">/mo</span>
                  </div>
                </div>
                <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">20 Pro Teams + Public Hubs.</CardDescription>
              </CardHeader>
              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                <div className="pt-4 border-t space-y-3">
                  <p className="text-[9px] font-black uppercase text-muted-foreground">Full Infrastructure</p>
                  <ul className="space-y-2">
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Conflict Mgmt</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Public Spectator Link</li>
                    <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Custom Domain</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="p-8 pt-0">
                <Link href="/signup" className="w-full">
                  <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border-2">Deploy League</Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </section>

      <section id="contact" className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Get in touch</h2>
                <h3 className="text-4xl md:text-5xl font-black tracking-tight">Institutional Scale <br />Custom Solutions.</h3>
                <p className="text-muted-foreground font-medium text-lg leading-relaxed">
                  We offer enterprise-grade configurations for national leagues and professional clubs. Connect with our strategic analysts.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Mail className="h-5 w-5" />
                  </div>
                  <span className="font-bold text-foreground">operations@thesquad.pro</span>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <span className="font-bold text-foreground">Global Tactical Support</span>
                </div>
              </div>
            </div>

            <Card className="border-none shadow-2xl rounded-[3rem] p-8 md:p-12 overflow-hidden ring-1 ring-black/5 bg-background">
              <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest">Name</Label>
                    <Input placeholder="John Doe" className="h-12 rounded-xl bg-muted/50 border-none" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-black uppercase tracking-widest">Email</Label>
                    <Input type="email" placeholder="john@example.com" className="h-12 rounded-xl bg-muted/50 border-none" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest">Organization</Label>
                  <Input placeholder="State Varsity League" className="h-12 rounded-xl bg-muted/50 border-none" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest">Inquiry</Label>
                  <Textarea placeholder="Define your institutional needs..." className="min-h-[120px] rounded-xl bg-muted/50 border-none resize-none" />
                </div>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                  Contact Tactical Ops
                </Button>
              </form>
            </Card>
          </div>
        </div>
      </section>

      <footer className="py-12 bg-muted/50 border-t">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <Link href="/" className="flex items-center gap-3">
              <BrandLogo variant="light-background" className="h-8 w-32" />
            </Link>
            
            <div className="flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              <Link href="/how-to" className="hover:text-primary transition-colors">How to Guide</Link>
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
