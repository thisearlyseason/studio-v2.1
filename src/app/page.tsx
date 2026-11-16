
"use client"; 

import { useBillingDisplayPrices } from '@/lib/use-billing-display-prices';
import { PRICING_CONFIG } from '@/lib/pricing';
import { ParentCompanyBrand } from '@/components/ParentCompanyBrand';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  Infinity as InfinityIcon,
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
  Package,
  DollarSign,
  PenTool,
  Building,
  GraduationCap,
  BookOpen,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { LandingChatbot } from '@/components/LandingChatbot';
import { PricingReassurance, YouthDataStatement } from '@/components/marketing/pricing-reassurance';
import { HeroBackground } from '@/components/marketing/hero-background';
import { MarketingFaq } from '@/components/marketing/marketing-faq';
import { AdoptionProof, CustomerStories, FounderStrip, ThirdPartyProof } from '@/components/marketing/trust-proof';
import { TierComparison, AnnualSavings, ClubValueAnchor, TeamValueAnchor, ExtraTeamPrice } from '@/components/marketing/tier-comparison';
import { PlatformComparison } from '@/components/marketing/platform-comparison';
import { LandingPwaInstallButton } from '@/components/pwa/LandingPwaInstallButton';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useUser, useAuth } from '@/firebase';
import { signInAnonymously, signOut } from 'firebase/auth';
import { bootstrapDemoWorkspace, clearBrowserSession, establishBrowserSession } from '@/lib/client-auth';
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription
} from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

const FEATURE_ORDER = ['Registration and payments', 'Collect dues with Stripe', 'Printable practice plans', 'Tournaments and leagues, run end to end', 'Collect signed waivers before game day', 'Film watch verification'];

const DEMO_OPTIONS = [
  { id: 'starter_squad', name: 'Starter Plan Demo', icon: Users, desc: 'Grassroots essentials' },
  { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Complete team management' },
  { id: 'elite_teams', name: 'Elite Org Demo', icon: Trophy, desc: 'Manage multiple teams' },
  { id: 'school_demo', name: 'School Demo', icon: GraduationCap, desc: 'Full K-12 Program Hub' },
  { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Schedule, chat, and profile' },
  { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Family schedule and waivers' },
  { id: 'league_demo', name: 'FREE League Creator Demo', icon: ShieldCheck, desc: 'Free plan · manage leagues without Pro' }
];

// ── Shared animation helpers ──────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } };

// ── 3D Tilt Hook ─────────────────────────────────────────────────────────
function useTilt(strength = 12) {
  const ref = useRef<HTMLDivElement>(null);
  const handleMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width  - 0.5) * 2;
    const y = ((e.clientY - r.top)  / r.height - 0.5) * 2;
    el.style.setProperty('--rx', `${-y * strength}deg`);
    el.style.setProperty('--ry', `${x * strength}deg`);
  }, [strength]);
  const handleLeave = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);
  return { ref, onMouseMove: handleMove, onMouseLeave: handleLeave };
}

// ── TiltCard: safe wrapper so hooks are always at component level ─────────
function TiltCard({ strength = 12, className, children }: { strength?: number; className?: string; children: React.ReactNode }) {
  const tilt = useTilt(strength);
  return (
    <div
      ref={tilt.ref}
      onMouseMove={tilt.onMouseMove}
      onMouseLeave={tilt.onMouseLeave}
      className={cn('tilt-card', className)}
    >
      {children}
    </div>
  );
}

// ── Pricing Toggle Context ──────────────────────────────────────────────
const PricingCycleContext = React.createContext<{ cycle: 'monthly' | 'annual'; setCycle: (c: 'monthly' | 'annual') => void }>({ cycle: 'monthly', setCycle: () => {} });

function PricingToggle() {
  const { cycle, setCycle } = React.useContext(PricingCycleContext);
  return (
    <div className="flex flex-wrap justify-center gap-2 bg-white/10 p-1.5 rounded-2xl ring-1 ring-white/10 backdrop-blur-sm">
      <button
        onClick={() => setCycle('monthly')}
        className={cn(
          'px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
          cycle === 'monthly' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white/80'
        )}
      >
        Monthly
      </button>
      <button
        onClick={() => setCycle('annual')}
        className={cn(
          'px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2',
          cycle === 'annual' ? 'bg-white text-black shadow-sm' : 'text-white/50 hover:text-white/80'
        )}
      >
        Annual
        <AnnualSavings compact />
      </button>
    </div>
  );
}

function PricingDisplay({ planId, color, darkBg }: { planId: string; color: string; darkBg?: boolean }) {
  const prices = useBillingDisplayPrices();
  const plan = PRICING_CONFIG.find(p=>p.id===planId);
  const { cycle } = React.useContext(PricingCycleContext);
  const opacityClass = darkBg ? 'opacity-60' : 'text-white/70';
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline gap-1">
        <span className={cn('text-4xl font-black tracking-tighter transition-all duration-300', color)}>
          {prices.label(cycle==='annual' ? plan?.annualPriceId || '' : plan?.monthlyPriceId || '')}
        </span>
        <span className={cn('text-[10px] font-black uppercase', darkBg ? 'opacity-60' : 'text-white/70')}>/{cycle==='annual'?'yr':'mo'}</span>
      </div>
      {cycle === 'annual' && (
        <p className={cn('text-[9px] font-black uppercase tracking-wider', color, 'opacity-70')}>
          Billed annually
        </p>
      )}
    </div>
  );
}

// ── Enterprise Contact Form ──────────────────────────────────────────────
function ContactForm() {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [org, setOrg] = React.useState('');
  const [inquiry, setInquiry] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const submissionIdRef = React.useRef('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !inquiry.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      if (!submissionIdRef.current) submissionIdRef.current = crypto.randomUUID();
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submissionIdRef.current,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          organization: org.trim(),
          inquiry: inquiry.trim(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to send your inquiry.');
      setSubmitted(true);
    } catch (err) {
      toast({
        title: 'Inquiry Not Sent',
        description: err instanceof Error ? err.message : 'Please email us at team@thesquad.pro.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-xl font-black uppercase tracking-tight">Message Received</h3>
        <p className="text-sm font-bold text-muted-foreground">Our team will reach out within 24 hours.</p>
      </div>
    );
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="contact-name" className="text-xs font-black uppercase tracking-widest">Name *</Label>
          <Input id="contact-name" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" autoComplete="name" className="h-12 rounded-xl bg-muted/50 border-none" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email" className="text-xs font-black uppercase tracking-widest">Email *</Label>
          <Input id="contact-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="h-12 rounded-xl bg-muted/50 border-none" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-organization" className="text-xs font-black uppercase tracking-widest">Organization</Label>
        <Input id="contact-organization" value={org} onChange={e => setOrg(e.target.value)} placeholder="State Varsity League" className="h-12 rounded-xl bg-muted/50 border-none" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-inquiry" className="text-xs font-black uppercase tracking-widest">Inquiry *</Label>
        <Textarea id="contact-inquiry" value={inquiry} onChange={e => setInquiry(e.target.value)} placeholder="Tell us what your team needs help with..." className="min-h-[120px] rounded-xl bg-muted/50 border-none resize-none" required />
      </div>
      <Button
        type="submit"
        disabled={isSubmitting || !name.trim() || !email.trim() || !inquiry.trim()}
        className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all disabled:opacity-50"
      >
        {isSubmitting ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" />Sending...</> : 'Send Inquiry'}
      </Button>
    </form>
  );
}



function SectionHeader({ badge, title, subtitle }: { badge: string; title: React.ReactNode; subtitle: React.ReactNode }) {
  return (
    <motion.div
      className="text-center space-y-4 mb-24 max-w-3xl mx-auto"
      initial={false} whileInView="visible" viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
    >
      <motion.div variants={fadeUp}>
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">{badge}</Badge>
      </motion.div>
      <motion.h2 variants={fadeUp} className="text-3xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] sm:leading-none md:leading-none">{title}</motion.h2>
      <motion.div variants={fadeUp} className="text-muted-foreground font-medium text-lg pt-4 leading-relaxed">{subtitle}</motion.div>
    </motion.div>
  );
}

function StaggerGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={false} whileInView="visible" viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
    >
      {children}
    </motion.div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

// ── BETA FLAG: set to false to re-enable public signup ───────────────────
const BETA_MODE = false;
// ─────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterName, setNewsletterName] = useState('');
  const [newsletterLoading, setNewsletterLoading] = useState(false);
  const [newsletterDone, setNewsletterDone] = useState(false);
  const [pricingCycle, setPricingCycle] = useState<'monthly' | 'annual'>('monthly');
  
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const accountHref = user ? '/dashboard' : '/login';
  const accountLabel = user ? 'Dashboard' : 'Log In';

  const handleNewsletterSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailVal = newsletterEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(emailVal)) {
      toast({ title: 'Enter a valid email', description: 'Please use an address such as name@example.com.', variant: 'destructive' });
      return;
    }
    setNewsletterLoading(true);
    try {
      const nameVal = newsletterName.trim();
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameVal, email: emailVal, source: 'landing_page' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to subscribe.');
      setNewsletterDone(true);
      toast({ title: "You Got it!", description: "We'll keep you in the loop. 🏆" });

      // Trigger admin notification asynchronously
      void fetch('/api/public/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'newsletter',
          name: nameVal,
          email: emailVal,
        }),
      }).then(async response => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'Admin notification failed.');
        }
      }).catch(err => console.error('Admin notification failed:', err));
    } catch (err: any) {
      toast({ title: 'Oops!', description: err.message || 'Something went wrong.', variant: 'destructive' });
    } finally {
      setNewsletterLoading(false);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleLaunchDemo = async (planId: string) => {
    setIsDemoLoading(true);
    try {
      // Clear current session first to prevent state pollution
      await clearBrowserSession();
      await signOut(auth);
      // Brief delay to ensure auth state clean
      await new Promise(resolve => setTimeout(resolve, 500));

      // Always wipe stale demo locks/state so the seeder runs fresh
      localStorage.removeItem('squad_seeding_lock');
      localStorage.removeItem('sf_session_team_id');
      sessionStorage.removeItem('squad_demo_start_time');
      
      const demoCredential = await signInAnonymously(auth);
      await bootstrapDemoWorkspace(demoCredential.user, planId);
      await establishBrowserSession(demoCredential.user);
      
      // Use window.replace to bypass internal router cache 
      // and ensure DashboardLayout initializes with fresh demo parameters
      window.location.replace(`/dashboard?seed_demo=${planId}`);
    } catch (error: any) {
      toast({
        title: "Demo Launch Failed",
        description: "Verification service unavailable. Try again shortly.",
        variant: "destructive"
      });
      setIsDemoLoading(false);
    }
  };

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

          <div className="hidden xl:flex items-center gap-5 text-sm font-bold uppercase tracking-widest">
            <a href="#features" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Features</a>
            <a href="#roles" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Roles</a>
            <a href="#comparison" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Compare</a>
            <Link href="/about" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>About</Link>
            <a href="#pricing" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Pricing</a>
            <Link href="/sports" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>
              Explore Sports
            </Link>
            <Link href="/sports-hub" className={cn("hover:text-primary transition-colors flex items-center gap-1", isScrolled ? "text-muted-foreground" : "text-white/80")}>
              Sports Hub
            </Link>
          </div>

          <div className="hidden xl:flex items-center gap-4">
            <LandingPwaInstallButton placement="navigation" isScrolled={isScrolled} />
            <Link href={accountHref}>
              <Button variant="ghost" className={cn("font-bold", isScrolled ? "text-foreground" : "text-white hover:bg-white/10")}>
                {accountLabel}
              </Button>
            </Link>
            {BETA_MODE ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/30 bg-primary/10 text-primary backdrop-blur-sm">
                <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span></span>
                Signup Coming Soon
              </span>
            ) : (
              <Link href="/signup">
                <Button className="rounded-full px-6 font-bold shadow-lg shadow-primary/20">Join Now</Button>
              </Link>
            )}
          </div>

          <div className="xl:hidden flex items-center gap-2">
            <a href="#pricing" className={cn('rounded-full px-2 py-2 text-[10px] font-bold uppercase tracking-wider', isScrolled ? 'text-foreground' : 'text-white')}>Pricing</a>
            {!isScrolled && (
              <Link href={accountHref}>
                <Button variant="ghost" size="sm" className="font-bold text-white text-[10px] uppercase tracking-widest px-2 h-8">
                  {accountLabel}
                </Button>
              </Link>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button aria-label="Open navigation menu" variant="ghost" size="icon" className={cn("rounded-xl h-10 w-10", isScrolled ? "text-foreground" : "text-white hover:bg-white/10")}>
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(100vw,400px)] overflow-y-auto border-none p-0 pb-8 bg-white">
                <SheetHeader className="p-8 pb-4 text-left">
                  <div className="h-1 bg-primary w-12 rounded-full mb-6" />
                  <SheetTitle className="text-3xl font-black uppercase tracking-tighter">Menu</SheetTitle>
                  <SheetDescription className="text-primary font-black uppercase text-[10px] tracking-widest pt-1">
                    Explore The Squad
                  </SheetDescription>
                </SheetHeader>
                <div className="px-8 flex flex-col gap-3 pt-4">
                  <SheetClose asChild><a href="#features" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Features</a></SheetClose>
                  <SheetClose asChild><a href="#roles" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Roles</a></SheetClose>
                  <SheetClose asChild><a href="#comparison" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Compare</a></SheetClose>
                  <SheetClose asChild><Link href="/about" className="text-xl font-black py-2">About</Link></SheetClose>
                  <SheetClose asChild><a href="#pricing" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Pricing</a></SheetClose>
                  <SheetClose asChild><Link href="/sports" className="text-xl font-black uppercase tracking-tight text-primary py-2 border-b border-muted">Explore Sports</Link></SheetClose>
                  <SheetClose asChild><Link href="/sports-hub" className="text-xl font-black uppercase tracking-tight text-primary py-2 border-b border-muted flex items-center gap-2">Sports Hub</Link></SheetClose>
                  <div className="flex flex-col gap-4 mt-4 pt-4">
                    <LandingPwaInstallButton placement="menu" />
                    {BETA_MODE ? (
                      <div className="w-full h-14 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center gap-2 text-primary font-black uppercase tracking-widest text-[10px]">
                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span></span>
                        Signup Coming Soon
                      </div>
                    ) : (
                      <Link href="/signup" className="w-full">
                        <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20">Join Now</Button>
                      </Link>
                    )}
                    <Link href={accountHref} className="w-full">
                      <Button variant="outline" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2">
                        {accountLabel}
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      <section className="relative isolate overflow-hidden bg-black text-white pt-32 xl:min-h-[740px] xl:pb-16" id="hero">
        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
          <div className="absolute right-[8%] top-[20%] h-64 w-64 rounded-full border border-white/10 motion-safe:animate-pulse" />
          <div className="absolute right-[10%] top-[22%] h-48 w-48 rounded-full border border-primary/25" />
          <div className="absolute left-1/2 top-1/2 h-px w-[900px] -translate-x-1/2 -rotate-[25deg] bg-linear-to-r from-transparent via-primary/30 to-transparent" />
        </div>
        <div className="container relative z-20 mx-auto px-5 pb-8 text-center md:px-6 xl:pb-0">
          <div className="mx-auto max-w-5xl space-y-6">
          <p className="mx-auto w-fit rounded-full border border-white/20 bg-black/25 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/85 backdrop-blur-md">One team. Every season. One Squad.</p>
          <h1 className="font-black uppercase tracking-tighter leading-[0.86]" style={{ textShadow: '0 8px 50px rgba(0,0,0,.65)', fontSize: 'clamp(3.5rem, 10.7vw, 9rem)' }}>
            <span className="mb-6 block text-base font-bold normal-case leading-snug tracking-normal text-white/85 md:text-xl">Team management for clubs, leagues and schools.</span>
            <span className="block">DOMINATE</span>
            <span className="mt-2 block whitespace-nowrap text-[0.78em] sm:text-[1em]">YOUR <span className="italic text-primary">SEASON.</span></span>
          </h1>
          <p className="mx-auto max-w-xl text-base font-medium leading-relaxed text-white/85 md:text-lg">Stop chasing parents across disconnected tools. Keep schedules, waivers, dues and team chat in one workspace.</p>
          {/* Existing signup and demo paths */}
          <motion.div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-lg mx-auto">
            {user ? (
              <Link href="/dashboard" className="w-full">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : BETA_MODE ? (
              <a href="#notify" className="w-full">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Get Notified at Launch <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            ) : (
              <Link href="/signup" className="w-full">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Create Your Squad <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            )}
            <Dialog open={isDemoDialogOpen} onOpenChange={setIsDemoDialogOpen}>
              <DialogTrigger asChild>
                <Button size="lg" variant="outline" className="h-12 px-8 rounded-full text-sm font-black bg-white/10 border-white/20 text-white backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all w-full">
                  Experience Demo
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl rounded-[3rem] p-0 border-none shadow-2xl overflow-hidden bg-white">
                <DialogTitle className="sr-only">Explore Demo Workspaces</DialogTitle>
                <DialogDescription className="sr-only">
                  Choose a demo role to open an isolated sample workspace.
                </DialogDescription>

                <div className="p-8 lg:p-12 space-y-8">
                  <div className="text-center space-y-2">
                    <h2 className="text-4xl font-black uppercase tracking-tight">Choose a Demo Role</h2>
                    <p className="text-base font-bold text-primary uppercase tracking-widest">Select your role to begin</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DEMO_OPTIONS.map((demo) => (
                      <Button 
                        key={demo.id} 
                        variant="outline" 
                        className="h-24 rounded-3xl bg-muted/30 border-2 border-transparent hover:border-primary/20 hover:bg-white hover:text-foreground transition-all flex items-center justify-between px-6 group"
                        onClick={() => handleLaunchDemo(demo.id)}
                        disabled={isDemoLoading}
                        aria-label={`Open ${demo.name}: ${demo.desc}`}
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
          </motion.div>
          </div>
          <p className="mx-auto mt-5 max-w-lg text-xs font-medium text-white/60">Less administration. More action. One Squad.</p>
          <p className="mt-2 text-[10px] font-medium text-white/50">The demo opens sample team, club, school and family workspaces.</p>
        </div>
        <figure className="relative z-20 mx-auto mb-8 w-[280px] max-w-[calc(100%-40px)] overflow-hidden rounded-2xl border border-white/25 bg-black/60 p-1.5 text-left shadow-2xl backdrop-blur-xl xl:absolute xl:bottom-8 xl:right-8 xl:mb-0 xl:w-[260px] xl:rotate-[-3deg] xl:transition-transform xl:hover:rotate-0">
          <div className="flex items-center justify-between px-2 pb-2 pt-1"><span className="text-[9px] font-black uppercase tracking-[0.18em] text-white">Inside The Squad</span><span className="rounded-full bg-white/10 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-white/60">Demo data</span></div>
          <button type="button" onClick={() => setIsDemoDialogOpen(true)} className="block w-full overflow-hidden rounded-xl text-left" aria-label="Explore the example league workspace">
            <Image src="/how-to/screenshots/league-schedule.webp" width={1440} height={1000} sizes="280px" alt="Example league workspace with teams, games, venues and schedule controls" className="h-[145px] w-full object-cover object-top" />
          </button>
          <figcaption className="flex items-center justify-between px-2 pb-1 pt-3 text-[10px] font-bold text-white/85"><span>Your season, in one place.</span><button type="button" onClick={() => setIsDemoDialogOpen(true)} className="text-red-400 hover:text-white">Explore demo ↗</button></figcaption>
        </figure>
        <HeroBackground />
      </section>
      <AdoptionProof />

      {/* ══ 3D STATS MARQUEE BAR ══ */}
      <section className="relative py-8 md:py-12 bg-black overflow-hidden grid-beam">
        {/* Ambient glow behind stats */}
        <div className="absolute inset-0 bg-linear-to-b from-black via-black to-black pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-32 bg-primary/8 blur-[80px] pointer-events-none" />
        <motion.div
          className="container mx-auto px-6 relative z-10"
          initial={false} whileInView="visible" viewport={{ once: true, amount: 0.1 }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-0 md:divide-x md:divide-white/10">
            {[
              { value: 'Teams', label: 'Manage your roster' },
              { value: 'Schedules', label: 'Keep everyone informed' },
              { value: 'Tournaments', label: 'Organize the competition' },
              { value: 'Free plan', label: 'Get started with the basics' },
            ].map((stat, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="flex justify-center md:px-8"
              >
                <div className="text-center"><div className="text-2xl md:text-3xl font-black text-white">{stat.value}</div><p className="text-sm text-white/80 mt-2">{stat.label}</p></div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ══ FLOATING BETA ACCESS PILL (always visible, right edge) ══ */}
      {BETA_MODE && (
        <motion.div
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50"
          initial={false}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1.2, type: 'spring', stiffness: 200, damping: 25 }}
        >
          <Link
            href="/beta"
            className="group flex flex-col items-center gap-2 bg-black text-white px-3 py-5 rounded-l-2xl shadow-2xl shadow-black/40 border border-white/10 hover:bg-primary hover:text-gray-900 hover:border-primary transition-all duration-300"
          >
            <ChevronRight className="h-3.5 w-3.5 -rotate-90 opacity-60 group-hover:opacity-100 transition-all" />
            <span
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Beta Access
            </span>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary group-hover:bg-gray-900" />
            </span>
          </Link>
        </motion.div>
      )}

      {/* ══ GET NOTIFIED AT LAUNCH SECTION ══ */}
      {BETA_MODE && (
        <section id="notify" className="py-28 bg-[#f8f7f4] relative overflow-hidden">
          {/* Subtle texture */}
          <div className="absolute inset-0 pointer-events-none opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(234,179,8,0.12) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(0,0,0,0.04) 0%, transparent 50%)' }} />

          <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-5xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

                {/* ── Left: Copy ── */}
                <motion.div
                  className="space-y-8"
                  initial={false} whileInView="visible" viewport={{ once: true, amount: 0.3 }}
                  variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
                >
                  <motion.div variants={fadeUp}>
                    <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-primary">
                      <span className="w-8 h-[2px] bg-primary rounded-full" />
                      Launching Soon
                    </span>
                  </motion.div>

                  <motion.h2
                    variants={fadeUp}
                    className="text-5xl md:text-6xl font-black text-gray-900 tracking-tighter leading-[0.92] md:leading-none"
                  >
                    BE THE FIRST<br />TO<span className="text-primary italic"> KNOW.</span>
                  </motion.h2>

                  <motion.p
                    variants={fadeUp}
                    className="text-gray-500 font-medium text-lg leading-relaxed max-w-sm"
                  >
                    The Squad is going live soon. Leave your info and we'll notify you the moment the doors open — no waiting, no missing out.
                  </motion.p>

                  {/* Promise list */}
                  <motion.ul variants={fadeUp} className="space-y-3">
                    {[
                      'Instant launch-day notification',
                      'Early-bird access before the public',
                      'Zero spam — one email, that\'s it',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3 text-sm font-bold text-gray-700">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center">
                          <Check className="h-3 w-3 text-primary" />
                        </span>
                        {item}
                      </li>
                    ))}
                  </motion.ul>
                </motion.div>

                {/* ── Right: Form card ── */}
                <motion.div
                  initial={false}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                >
                  <div className="bg-white rounded-4xl shadow-2xl shadow-black/8 p-8 md:p-10 ring-1 ring-black/5 relative overflow-hidden">
                    {/* Top accent bar */}


                    {newsletterDone ? (
                      <motion.div
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                        className="flex flex-col items-center gap-5 py-8 text-center"
                      >
                        <motion.div
                          initial={false}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 300, damping: 16, delay: 0.1 }}
                          className="w-20 h-20 rounded-full bg-primary/10 ring-4 ring-primary/20 flex items-center justify-center"
                        >
                          <CheckCircle2 className="h-10 w-10 text-primary" />
                        </motion.div>
                        <div className="space-y-2">
                          <motion.p
                            initial={false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.22 }}
                            className="text-2xl font-black text-gray-900 uppercase tracking-tight"
                          >
                            You Got it!
                          </motion.p>
                          <motion.p
                            initial={false}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32 }}
                            className="text-gray-500 font-medium"
                          >
                            You're on the list. We'll hit you when we're live.
                          </motion.p>
                        </div>
                      </motion.div>
                    ) : (
                      <form onSubmit={handleNewsletterSignup} className="space-y-5">
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Get launch-day notification</p>
                          <p className="text-xl font-black text-gray-900">Drop your info below.</p>
                        </div>

                        <div className="space-y-3">
                          <motion.input
                            aria-label="Newsletter name"
                            whileFocus={{ scale: 1.01 }}
                            type="text"
                            placeholder="Your Name"
                            value={newsletterName}
                            onChange={(e) => setNewsletterName(e.target.value)}
                            className="w-full h-auto px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 font-semibold text-sm focus:outline-none focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                          <motion.input
                            aria-label="Newsletter email"
                            whileFocus={{ scale: 1.01 }}
                            type="email"
                            placeholder="your@email.com"
                            required
                            value={newsletterEmail}
                            onChange={(e) => setNewsletterEmail(e.target.value)}
                            className="w-full h-auto px-5 py-3.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder:text-gray-400 font-semibold text-sm focus:outline-none focus:border-primary/50 focus:bg-white focus:ring-2 focus:ring-primary/10 transition-all"
                          />
                        </div>

                        <motion.button
                          type="submit"
                          disabled={newsletterLoading}
                          whileHover={{ scale: 1.02, boxShadow: '0 8px 30px rgba(234,179,8,0.35)' }}
                          whileTap={{ scale: 0.97 }}
                          className="w-full h-auto py-3.5 rounded-xl bg-gray-900 text-white font-black uppercase tracking-widest text-sm hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {newsletterLoading
                            ? <Loader2 className="h-5 w-5 animate-spin" />
                            : <><Mail className="h-4 w-4" /> Notify Me at Launch</>
                          }
                        </motion.button>

                        <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                          No spam · Unsubscribe anytime
                        </p>
                      </form>
                    )}
                  </div>
                </motion.div>

              </div>
            </div>
          </div>
        </section>
      )}

      <section id="features" className="py-32 bg-white relative overflow-hidden">
        {/* Subtle background grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full bg-primary/4 blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <SectionHeader
            badge="Team tools"
            title={<>One workspace.<br /> <span className="text-primary italic">Every role.</span></>}
            subtitle="When you open registration, keep forms, waivers and fees together. Build your season calendar, track RSVPs and run competitions in the same workspace."
          />

          {/* 3D tilt feature cards */}
          <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {[
              {
                Icon: TableIcon,
                title: 'Tournaments and leagues, run end to end',
                desc: <>Automated <strong>season schedules</strong> and bracket generation with a <strong>spectator page</strong> and mobile <strong>Scorekeeper Portal</strong> for real-time results.</>,
                items: ['Live Standings', 'Multi-Team Conflicts'],
                image: { src: 'tournament-brackets', alt: 'The Squad tournament workspace showing match brackets with demo teams' },
                accent: 'from-primary/20 to-transparent',
              },
              {
                Icon: PenTool,
                title: 'Printable practice plans',
                desc: <>Share a <strong>printable practice plan</strong> with drills, times and instructions so coaches and athletes know what comes next.</>,
                items: ['Practice plans', 'Printable schedules'],
                accent: 'from-blue-500/10 to-transparent',
              },
              {
                Icon: Video,
                title: 'Film watch verification',
                desc: <>Know who has watched assigned film before practice. The <strong>75% Watch Rule</strong> shows viewing progress in the roster.</>,
                items: ['10GB Pro Storage', 'Viewing Progress'],
                accent: 'from-purple-500/10 to-transparent',
              },
              {
                Icon: ClipboardList,
                title: 'Registration and payments',
                desc: <>Open registration with <strong>forms, signed waivers and fees</strong> in one place. Track missing answers and signatures before game day.</>,
                items: ['Digital Signatures', 'Registration Records'],
                accent: 'from-emerald-500/10 to-transparent',
              },
              {
                Icon: CreditCard,
                title: 'Collect dues with Stripe',
                desc: <>Accept dues, fees, and donations through Stripe. <strong>Connect an organizer account</strong> to receive payments. Processing fees and payout timing depend on Stripe and the account.</>,
                items: ['Stripe Connect', 'Payment Tracking'],
                image: { src: 'payment-items', alt: 'The Squad payment workspace showing team payment items using demo data' },
                accent: 'from-orange-500/10 to-transparent',
              },
              {
                Icon: ShieldCheck,
                title: 'Collect signed waivers before game day',
                desc: <>Send waivers to coaches and <strong>track missing signatures</strong> so staff know who still needs to sign before game day.</>,
                items: ['Waiver Distribution', 'Signature Status'],
                accent: 'from-teal-500/10 to-transparent',
              },
            ].sort((a, b) => FEATURE_ORDER.indexOf(a.title) - FEATURE_ORDER.indexOf(b.title)).map(({ Icon, title, desc, items, accent, image }, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="h-full perspective-800 rounded-[2.5rem] overflow-hidden"
              >
                <TiltCard strength={8} className="h-full rounded-[2.5rem] overflow-hidden">
                  <Card className="rounded-[2.5rem] border-none depth-card bg-white p-10 space-y-6 h-full group relative overflow-hidden cursor-pointer transition-colors duration-500 hover:bg-gray-950 hover:text-white">
                    {/* Accent gradient top-left */}
                    <div className={`absolute top-0 left-0 w-64 h-64 bg-linear-to-br ${accent} rounded-full blur-2xl pointer-events-none opacity-60 group-hover:opacity-0 transition-opacity`} />
                    {/* Dark mode glow */}
                    <div className="absolute top-0 left-0 w-64 h-64 bg-linear-to-br from-primary/20 to-transparent rounded-full blur-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Shimmer */}
                    <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-200%] group-hover:translate-x-[300%] transition-transform duration-1000 pointer-events-none" />
                    <div className="relative z-10 space-y-6">
                      <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/30 group-hover:shadow-primary/50 transition-shadow">
                        <Icon className="h-8 w-8 text-white" />
                      </div>
                      {i < 2 && <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Set up your season</p>}
                      <h3 className="text-2xl font-black uppercase tracking-tight">{title}</h3>
                      <p className="text-sm font-medium leading-relaxed opacity-70">{desc}</p>
                      {image && <figure className="overflow-hidden rounded-2xl border border-black/10 bg-muted/20"><Image src={`/how-to/screenshots/${image.src}.webp`} width={1440} height={1000} sizes="(max-width: 768px) 90vw, 540px" alt={image.alt} className="aspect-[16/10] w-full object-cover object-top" /><figcaption className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider opacity-50">Actual product workspace · demo data</figcaption></figure>}
                      <ul className="space-y-3 pt-2">
                        {items.map(item => (
                          <li key={item} className="flex items-center gap-3 text-xs font-bold uppercase">
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Card>
                </TiltCard>
              </motion.div>
            ))}
          </StaggerGrid>
        </div>
      </section>

      <section id="comparison" className="scroll-mt-24 py-20 md:py-32 bg-white relative">
        <div className="container mx-auto px-6">
          <SectionHeader
            badge="Compare Platforms"
            title={<>FIND YOUR <br /> <span className="text-primary italic">TEAM’S FIT.</span></>}
            subtitle="See how The Squad brings coaching, family coordination and competition management together, alongside the capabilities other sports platforms offer."
          />
          <PlatformComparison />
        </div>
      </section>

      <section className="py-32 bg-black text-white overflow-hidden relative">
        {/* Deep depth orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[700px] h-[700px] rounded-full bg-primary/6 blur-[150px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-primary/4 blur-[120px] pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <motion.div
              className="space-y-8"
              initial={false} whileInView="visible" viewport={{ once: true, amount: 0.3 }}
              variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
            >
              <motion.div variants={fadeUp}>
                <Badge className="bg-primary text-white border-none font-black px-4 h-7 uppercase tracking-widest text-[10px]">More team tools</Badge>
              </motion.div>
              <motion.h2 variants={fadeUp} className="text-4xl md:text-6xl font-black tracking-tight leading-none uppercase md:leading-none">
                Everything <br /> <span className="text-primary italic">in one place.</span>
              </motion.h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {[
                  { Icon: ClipboardList, title: 'Scouting Profiles', desc: <>Keep <strong>Staff Evaluations</strong>, recruiting-ready notes, and athlete media together in one controlled profile.</> },
                  { Icon: Video,        title: 'Athlete Film Library',  desc: <>Archive hosted or uploaded <strong>Highlight Reels</strong> for staff review and recruiting portfolios.</> },
                  { Icon: Building,     title: 'Manage your club',    desc: <><strong>Payment summaries</strong> give club directors a view of dues and fees across their squads.</> },
                  { Icon: ShieldAlert,  title: 'Recruiting Portfolios',desc: <><strong>Athlete evaluations</strong> that athletes can export for recruiting conversations.</> },
                ].map(({ Icon, title, desc }, i) => (
                  <motion.div key={i} variants={fadeUp} className="space-y-3 group">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary transition-colors">
                      <Icon className="h-5 w-5 text-primary group-hover:text-white transition-colors" />
                    </div>
                    <h3 className="text-lg font-black uppercase">{title}</h3>
                    <p className="text-xs text-white/60 leading-relaxed font-medium">{desc}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            
            {/* ── 3D Layered UI Mockup ── */}
            <div className="relative perspective-1200">
              {/* Background glow */}
              <div className="absolute inset-0 bg-primary/15 blur-[100px] rounded-full animate-depth-pulse" />

              {/* Layer 3 — back (blurred, shifted) */}
              <motion.div
                className="absolute -bottom-6 -left-6 right-6 h-full rounded-[2.5rem] bg-white/3 border border-white/6 backdrop-blur-sm"
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1, duration: 0.8 }}
                style={{ transform: 'rotateX(4deg) rotateY(-6deg) scale(0.95)', transformStyle: 'preserve-3d' }}
              />
              {/* Layer 2 — mid */}
              <motion.div
                className="absolute -bottom-3 -left-3 right-3 h-full rounded-[2.5rem] bg-white/5 border border-white/8"
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2, duration: 0.8 }}
                style={{ transform: 'rotateX(3deg) rotateY(-4deg) scale(0.975)', transformStyle: 'preserve-3d' }}
              />
              {/* Layer 1 — front card */}
              <motion.div
                initial={false}
                whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3, duration: 0.9, ease: [0.16,1,0.3,1] }}
                className="relative z-10"
                style={{ transformStyle: 'preserve-3d' }}
              >
                <Card className="rounded-[2.5rem] border-white/10 bg-white/5 backdrop-blur-xl p-8 lg:p-10 depth-card-dark overflow-hidden">
                  {/* Shimmer sweep on hover */}
                  <div className="absolute inset-0 bg-linear-to-r from-transparent via-white/4 to-transparent -skew-x-12 animate-shimmer-x pointer-events-none rounded-[2.5rem]" />
                  <div className="space-y-6 relative z-10">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/40 float-fast">
                          <Activity className="h-5 w-5 text-white" />
                        </div>
                        <span className="font-black uppercase tracking-widest text-xs">Example Team Feed</span><button type="button" onClick={() => setIsDemoDialogOpen(true)} className="text-xs underline">Open live demos</button>
                      </div>
                      <Badge variant="outline" className="border-white/20 text-white font-black text-[8px] px-2 h-5 glow-red">DEMO DATA</Badge>
                    </div>
                    {/* Notifications stack */}
                    <div className="space-y-3">
                      {[
                        { label: 'Coach Ramirez posted new drill film', time: '2m ago', active: false },
                        { label: 'Bracket auto-generated: Semifinals', time: 'Live', active: true },
                        { label: 'Coach signed global liability waiver', time: '2m ago', active: true },
                        { label: 'Stripe payment link shared — $45 fee', time: '5m ago', active: false },
                      ].map((item, i) => (
                        <motion.div
                          key={i}
                          initial={false}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                          className={cn(
                            'p-4 rounded-2xl border flex items-center gap-4',
                            item.active
                              ? 'bg-primary/10 border-primary/30'
                              : 'bg-white/4 border-white/8'
                          )}
                        >
                          <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', item.active ? 'bg-primary animate-pulse' : 'bg-white/20')} />
                          <p className="flex-1 text-[10px] font-bold text-white/70 leading-snug">{item.label}</p>
                          <span className={cn('text-[8px] font-black uppercase shrink-0', item.active ? 'text-primary' : 'text-white/70')}>{item.time}</span>
                        </motion.div>
                      ))}
                    </div>
                    {/* Progress bars */}
                    <div className="space-y-3 pt-2 border-t border-white/8">
                      <p className="text-[9px] font-black uppercase text-white/70 tracking-widest">Roster Compliance</p>
                      {[
                        { label: 'Film Watch', pct: 87, color: 'bg-primary' },
                        { label: 'Waivers Signed', pct: 100, color: 'bg-emerald-500' },
                        { label: 'Fees Collected', pct: 74, color: 'bg-blue-500' },
                      ].map(({ label, pct, color }) => (
                        <div key={label} className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-[9px] font-bold text-white/50 uppercase">{label}</span>
                            <span className="text-[9px] font-black text-white/60">{pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                            <motion.div
                              className={cn('h-full rounded-full', color)}
                              initial={false}
                              whileInView={{ width: `${pct}%` }}
                              viewport={{ once: true }}
                              transition={{ duration: 1.2, delay: 0.6, ease: [0.16,1,0.3,1] }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Footer */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest">Active Coordination Hub</p>
                      <div className="flex -space-x-2">
                        {[...Array(4)].map((_,i) => (
                          <div key={i} className="h-7 w-7 rounded-full border-2 border-black/60 bg-linear-to-br from-white/20 to-white/5 float-fast" style={{animationDelay:`${i*0.4}s`}} />
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      <section id="roles" className="py-32 bg-white relative overflow-hidden">
        {/* Diagonal grid */}
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.035) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <SectionHeader
            badge="For your whole organization"
            title={<>Everyone running <br /> <span className="text-primary italic">the season.</span></>}
            subtitle="Run one team, a club, a school sports program or a competition. Give organizers, coaches, families and athletes a workspace for the jobs they do."
          />

          <StaggerGrid className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {[
              { Icon: GraduationCap, title: 'School athletic directors', desc: 'Keep school teams, coaches and schedules together. Allocate squad spaces, share school documents and follow up on waivers across your sports program.', color: 'from-primary/15 via-transparent', num: '01', links: [{ href: '/for/schools', label: 'See school tools' }, { href: '/privacy', label: 'Read how youth data is handled' }] },
              { Icon: TableIcon, title: 'League & tournament organizers', desc: 'Open registration, organize divisions, build schedules and brackets, and publish standings. Give scorekeepers and spectators the game-day views they need.', color: 'from-blue-500/10 via-transparent', num: '02', links: [{ href: '/for/leagues', label: 'Run a league' }, { href: '/for/tournaments', label: 'Run a tournament' }] },
              { Icon: Building, title: 'Club directors', desc: 'Keep squads and staff in one club workspace. Review dues and fees across teams, assign staff roles and compare a club plan with paying for each team separately.', color: 'from-emerald-500/10 via-transparent', num: '03', links: [{ href: '#pricing', label: 'Compare club and team costs' }] },
              { Icon: Trophy, title: 'Coaches & managers', desc: 'Manage rosters, schedules and practice plans. Collect dues through Stripe Connect, track signed waivers and review athlete progress.', color: 'from-primary/15 via-transparent', num: '04', links: [{ href: '/for/coaches', label: 'See coaching tools' }] },
              { Icon: Baby, title: 'Parents & guardians', desc: 'See your children’s schedules, dues and waivers together. Check what needs signing and manage volunteer shifts.', color: 'from-blue-500/10 via-transparent', num: '05', links: [{ href: '/for/parents', label: 'See family tools' }] },
              { Icon: User, title: 'Athletes', desc: 'See your schedule and results, watch assigned film and keep recruiting information together.', color: 'from-emerald-500/10 via-transparent', num: '06', links: [{ href: '/how-to', label: 'Find your setup guide' }] },
            ].map(({ Icon, title, desc, color, num, links }, i) => (
              <motion.div key={i} variants={fadeUp} className="perspective-800 h-full rounded-[2.5rem] overflow-hidden">
                <TiltCard strength={6} className="h-full rounded-[2.5rem] overflow-hidden">
                  <Card className="rounded-[2.5rem] border-none depth-card bg-white p-10 space-y-6 h-full relative overflow-hidden group hover:bg-gray-950 hover:text-white transition-colors duration-500">
                    {/* Gradient top accent */}
                    <div className={`absolute top-0 left-0 w-full h-40 bg-linear-to-b ${color} to-transparent pointer-events-none opacity-70 group-hover:opacity-0 transition-opacity`} />
                    <div className="absolute top-0 left-0 w-full h-40 bg-linear-to-b from-primary/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
                    {/* Number badge */}
                    <div className="absolute top-8 right-8 text-[80px] font-black text-black/4 group-hover:text-white/4 leading-none select-none transition-colors">{num}</div>
                    <div className="relative z-10 space-y-6">
                      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:bg-primary transition-colors">
                        <Icon className="h-7 w-7 text-primary group-hover:text-white transition-colors" />
                      </div>
                      <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
                      <p className="text-sm font-medium text-muted-foreground leading-relaxed group-hover:text-white/60 transition-colors">{desc}</p>
                      <div className="flex flex-wrap gap-x-5 gap-y-3 pt-1">{links.map(link => <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 group-hover:text-white">{link.label}<ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" /></Link>)}</div>
                    </div>
                  </Card>
                </TiltCard>
              </motion.div>
            ))}
          </StaggerGrid>
        </div>
      </section>

      <CustomerStories />
      <section id="pricing" className="py-32 bg-black relative overflow-hidden">
      <PricingCycleContext.Provider value={{ cycle: pricingCycle, setCycle: setPricingCycle }}>
        {/* Animated gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[120px] pointer-events-none animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-primary/8 blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[300px] rounded-full bg-primary/5 blur-[150px] pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <motion.div
            className="text-center space-y-5 mb-16 max-w-3xl mx-auto"
            initial={false} whileInView="visible" viewport={{ once: true, amount: 0.3 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
          >
            <motion.div variants={fadeUp}>
              <Badge className="bg-primary/20 text-red-400 border-primary/30 font-black px-4 py-1 uppercase tracking-widest text-[10px]">Plans for teams and organizations</Badge>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] text-white sm:leading-none md:leading-none">
              SCALE YOUR <span className="text-red-400 italic">OPERATION.</span>
            </motion.h2>
            <motion.div variants={fadeUp} className="flex items-center gap-2 text-red-400 font-black uppercase tracking-widest text-[10px] bg-primary/10 px-4 py-2 rounded-full border border-primary/20 w-fit mx-auto">
              <AlertCircle className="h-3 w-3" /><span>Choose the plan that fits your organization</span>
            </motion.div>

            {/* Billing Cycle Toggle */}
            <motion.div variants={fadeUp} className="flex items-center justify-center mt-4">
              <PricingToggle />
            </motion.div>
          </motion.div>

          {/* ── 5-Day Trial Banner ── */}
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative max-w-2xl mx-auto mb-12 overflow-hidden"
          >
            <div className="absolute -inset-px rounded-2xl bg-linear-to-r from-primary/60 via-yellow-400/40 to-primary/60 opacity-60 blur-[2px]" />
            <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 bg-black rounded-2xl px-8 py-5">
              <motion.div
                className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none rounded-2xl"
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3.5, repeat: Infinity, repeatDelay: 5, ease: 'easeInOut' }}
              />
              <div className="flex items-center gap-3 relative z-10">
                <div className="bg-primary/20 border border-primary/30 rounded-xl p-2.5">
                  <Clock className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-white font-black uppercase tracking-tight text-sm leading-none">5-Day Free Trial</p>
                  <p className="text-white/50 font-bold text-[10px] uppercase tracking-widest mt-0.5">on all paid plans</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-8 bg-white/10" />
              <div className="flex flex-wrap items-center justify-center gap-3 relative z-10">
                {['Card saved upfront', 'No charge for 5 days', 'Cancel anytime'].map((item) => (
                  <span key={item} className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                    <CheckCircle2 className="h-3 w-3 text-red-400 shrink-0" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>

          <PricingReassurance />
          <p className="mb-8 text-center text-xs text-white/60"><a href="#youth-data" className="underline underline-offset-4">How we handle team and youth information</a></p>
          <div className="max-w-7xl mx-auto">
            {/* Row 1: 3 cards */}
            <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch mb-6">
              {/* Starter */}
              <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border border-white/8 shadow-xl overflow-hidden flex flex-col bg-white/5 backdrop-blur-sm h-full">
                <div className="h-px w-full bg-linear-to-r from-transparent via-white/20 to-transparent" />
                <CardHeader className="p-8 pb-4 space-y-4">
                  <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-white/20 text-white/60 w-fit">GRASSROOTS</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-white">Starter</CardTitle>
                    <span className="text-4xl font-black tracking-tighter text-white">$0</span>
                  </div>
                  <CardDescription className="text-[10px] font-bold text-white/70 uppercase">Schedules, team chat and score tracking.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[9px] font-black uppercase text-white/70">Included</p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><Check className="h-3.5 w-3.5 text-red-400" /> Scheduling</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><Check className="h-3.5 w-3.5 text-red-400" /> Team Chat</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><Check className="h-3.5 w-3.5 text-red-400" /> Score Tracking</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border border-white/20 text-white hover:bg-white/10 bg-transparent">Join Free</Button>
                  </Link>
                </CardFooter>
              </Card>
              </motion.div>

              {/* Squad Pro — Hero card */}
              <motion.div whileHover={{ y: -14, scale: 1.03 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <div className="relative flex flex-col h-full">
                {/* Animated glowing border ring */}
                <div className="absolute inset-[-2px] rounded-[2.6rem] bg-linear-to-br from-primary via-yellow-400/60 to-primary/40 opacity-80" />
                <Card className="relative rounded-[2.5rem] border-none shadow-2xl overflow-hidden flex flex-col bg-black text-white h-full">
                  {/* Shimmer sweep */}
                  <motion.div
                    className="absolute inset-0 bg-linear-to-r from-transparent via-white/5 to-transparent -skew-x-12 pointer-events-none z-10"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 3, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
                  />
                  <div className="absolute top-0 right-0 p-4 opacity-[0.07] -rotate-12 pointer-events-none"><Zap className="h-24 w-24" /></div>
                  <CardHeader className="p-8 pb-4 space-y-4 relative z-10">
                    <div className="flex items-center justify-between">
                      <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase">Best value for one team</Badge>
                      <Sparkles className="h-5 w-5 text-red-400 animate-pulse" />
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-2xl font-black uppercase tracking-tight">Squad Pro</CardTitle>
                      <PricingDisplay planId="team" color="text-red-400" darkBg /><TeamValueAnchor />
                    </div>
                    <CardDescription className="text-[10px] font-bold text-white/50 uppercase">Waivers, dues and auto-brackets for one team.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-8 pt-0 flex-1 space-y-6 relative z-10">
                    <div className="pt-4 border-t border-white/10 space-y-3">
                      <p className="text-[9px] font-black uppercase text-white/70">Everything in Starter +</p>
                      <ul className="space-y-2">
                        <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/80"><Sparkles className="h-3.5 w-3.5 text-red-400" /> 75% Watch Rule</li>
                        <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/80"><Sparkles className="h-3.5 w-3.5 text-red-400" /> Auto-Brackets</li>
                        <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/80"><Sparkles className="h-3.5 w-3.5 text-red-400" /> Digital Waivers</li>
                        <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/80"><Sparkles className="h-3.5 w-3.5 text-red-400" /> Online Payments via Stripe Connect</li>
                      </ul>
                    </div>
                  </CardContent>
                  <CardFooter className="p-8 pt-0 relative z-10">
                    <Link href="/signup" className="w-full">
                      <Button className="w-full h-12 rounded-xl font-black shadow-xl shadow-primary/40 bg-primary text-white hover:bg-primary/90 text-xs uppercase tracking-widest active:scale-95 transition-all">
                        Start Pro Team <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              </div>
              </motion.div>

              {/* Elite Teams */}
              <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border border-white/8 shadow-xl overflow-hidden flex flex-col bg-white/5 backdrop-blur-sm h-full">
                <div className="h-px w-full bg-linear-to-r from-transparent via-white/20 to-transparent" />
                <CardHeader className="p-8 pb-4 space-y-4">
                  <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/30 text-red-400 w-fit">ORGANIZATION</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-white">Elite Teams</CardTitle>
                    <PricingDisplay planId="elite" color="text-red-400" /><ClubValueAnchor />
                  </div>
                  <CardDescription className="text-[10px] font-bold text-white/70 uppercase">8 Pro Teams + Master Club Hub.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[9px] font-black uppercase text-white/70">Club tools</p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><CheckCircle2 className="h-3.5 w-3.5 text-red-400" /> Recruitment Portal</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><CheckCircle2 className="h-3.5 w-3.5 text-red-400" /> Fee Management</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><CheckCircle2 className="h-3.5 w-3.5 text-red-400" /> Staff Notes</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border border-white/20 text-white hover:bg-white/10 bg-transparent">Start Club</Button>
                  </Link>
                </CardFooter>
              </Card>
              </motion.div>
            </StaggerGrid>

            {/* Row 2: 2 cards centered on desktop, stacked on mobile */}
            <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch max-w-5xl mx-auto">
              {/* Elite League */}
              <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border border-white/8 shadow-xl overflow-hidden flex flex-col bg-white/5 backdrop-blur-sm w-full h-full">
                <div className="h-px w-full bg-linear-to-r from-transparent via-primary/40 to-transparent" />
                <CardHeader className="p-8 pb-4 space-y-4">
                  <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/30 text-red-400 w-fit">INSTITUTIONAL</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-white">Elite League</CardTitle>
                    <PricingDisplay planId="league" color="text-red-400" />
                  </div>
                  <CardDescription className="text-[10px] font-bold text-white/70 uppercase">18 Pro Teams + Public Hubs.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[9px] font-black uppercase text-white/70">League tools</p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><ShieldCheck className="h-3.5 w-3.5 text-red-400" /> Conflict Mgmt</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><ShieldCheck className="h-3.5 w-3.5 text-red-400" /> Public Spectator Link</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><ShieldCheck className="h-3.5 w-3.5 text-red-400" /> Custom Domain</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border border-white/20 text-white hover:bg-white/10 hover:border-primary/40 hover:text-red-400 bg-transparent">Start League</Button>
                  </Link>
                </CardFooter>
              </Card>
              </motion.div>

              {/* School District */}
              <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border border-[#10b981]/15 shadow-xl overflow-hidden flex flex-col bg-white/5 backdrop-blur-sm w-full h-full">
                <div className="h-px w-full bg-linear-to-r from-transparent via-[#10b981]/40 to-transparent" />
                <CardHeader className="p-8 pb-4 space-y-4">
                  <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-[#10b981]/30 text-[#10b981] w-fit">K-12 DISTRICT</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black uppercase tracking-tight text-white">School District</CardTitle>
                    <PricingDisplay planId="school" color="text-[#10b981]" /><ExtraTeamPrice cycle={pricingCycle} />
                  </div>
                  <CardDescription className="text-[10px] font-bold text-white/70 uppercase">15 Squads Included · Extras at School Rate.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="pt-4 border-t border-white/10 space-y-3">
                    <p className="text-[9px] font-black uppercase text-white/70">Academic Athletics</p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> 15 Pro Squad Hubs Included</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> Athletic Director Hub</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-white/70"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> Academic Eligibility</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase text-[#10b981]/80"><CheckCircle2 className="h-3.5 w-3.5 text-[#10b981]" /> Extra squads at lowest rate</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981]/10 hover:border-[#10b981]/50 bg-transparent">Start School</Button>
                  </Link>
                </CardFooter>
              </Card>
              </motion.div>
            </StaggerGrid>
          </div>

          <motion.div
            className="mt-10 text-center"
            initial={false} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-[10px] font-black uppercase text-red-500/60 tracking-widest">Web prices show the configured catalog currency. App store prices and taxes may differ by region; review the final confirmation before paying.</p>
          </motion.div>
        </div>
      <TierComparison cycle={pricingCycle} />
      <YouthDataStatement />
      </PricingCycleContext.Provider>
      </section>

      <FounderStrip />
      <ThirdPartyProof />
      <section id="contact" className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Get in touch</p>
                <h2 className="text-4xl md:text-5xl font-black tracking-tight">More teams.<br />Let’s talk.</h2>
                <p className="text-muted-foreground font-medium text-lg leading-relaxed">
                  Tell us how many teams you run and what your staff need help with.
                </p>
                <Link href="/about" className="inline-block text-sm font-semibold text-primary underline underline-offset-4">About The Squad and Gameday Sports</Link>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Mail className="h-5 w-5" />
                  </div>
                  <a href="mailto:team@thesquad.pro" className="font-bold text-foreground hover:text-primary transition-colors">team@thesquad.pro</a>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Smartphone className="h-5 w-5" />
                  </div>
                  <span className="font-bold text-foreground">Team support</span>
                </div>
              </div>
            </div>

            <Card className="border-none shadow-2xl rounded-[3rem] p-8 md:p-12 overflow-hidden ring-1 ring-black/5 bg-background">
              <ContactForm />
            </Card>
          </div>
        </div>
      </section>

      <section id="built-for" className="relative overflow-hidden border-y bg-[#f6f5f2] py-24">
        <div className="absolute inset-0 pointer-events-none opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.06) 1px, transparent 0)', backgroundSize: '32px 32px' }} />
        <div className="container relative z-10 mx-auto px-6">
          <motion.div
            initial={false}
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
            className="mx-auto max-w-6xl"
          >
            <div className="mb-12 grid grid-cols-1 items-end gap-6 lg:grid-cols-[1fr_auto]">
              <div className="space-y-4">
                <motion.p variants={fadeUp} className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Built for your organization</motion.p>
                <motion.h2 variants={fadeUp} className="max-w-3xl text-4xl font-black uppercase leading-[0.95] tracking-tighter md:text-6xl md:leading-none">
                  One platform. <span className="text-primary italic">Every level of play.</span>
                </motion.h2>
              </div>
              <motion.p variants={fadeUp} className="max-w-md text-base font-medium leading-relaxed text-muted-foreground lg:text-right">
                Start with the workspace that fits today, then keep your people and operations connected as your program grows.
              </motion.p>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {[
                {
                  icon: Users,
                  label: 'Squads',
                  title: 'Run the team',
                  description: 'Coordinate rosters, schedules, communication, payments, and day-to-day team operations.',
                },
                {
                  icon: Trophy,
                  label: 'Leagues & Tournaments',
                  title: 'Manage competition',
                  description: 'Organize registrations, schedules, brackets, scorekeeping, and spectator information.',
                },
                {
                  icon: GraduationCap,
                  label: 'Schools & Clubs',
                  title: 'Lead the program',
                  description: 'Oversee multiple squads from an organization-level hub while each team keeps its own workspace.',
                },
              ].map((item) => (
                <motion.div
                  key={item.label}
                  variants={fadeUp}
                  className="group rounded-4xl border border-black/5 bg-white p-7 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/20 hover:shadow-xl"
                >
                  <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <p className="mb-2 text-[9px] font-black uppercase tracking-[0.22em] text-primary">{item.label}</p>
                  <h3 className="mb-3 text-2xl font-black uppercase tracking-tight">{item.title}</h3>
                  <p className="text-sm font-medium leading-relaxed text-muted-foreground">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <MarketingFaq />
      <section id="newsletter" className="relative overflow-hidden bg-black py-24 text-white">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 15% 20%, rgba(239,68,68,0.7), transparent 34%), radial-gradient(circle at 85% 80%, rgba(255,255,255,0.18), transparent 30%)' }} />
        <div className="container relative z-10 mx-auto px-6">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 rounded-[3rem] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-sm md:p-14 lg:grid-cols-[1.1fr_0.9fr]">
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              className="space-y-6"
            >
              <div className="inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.3em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary" /> Stay in the game
              </div>
              <h2 className="text-4xl font-black uppercase leading-[0.9] tracking-tighter sm:text-5xl md:text-7xl sm:leading-none md:leading-none">
                Sign up for our <span className="text-primary italic">newsletter.</span>
              </h2>
              <p className="max-w-xl text-base font-medium leading-relaxed text-white/60 md:text-lg md:leading-7">
                Product updates, practical team-management ideas, and sports operations resources—delivered directly to your inbox.
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-white/70">No spam · Unsubscribe anytime</p>
            </motion.div>

            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: 0.1 }}
              className="rounded-4xl bg-white p-7 text-foreground shadow-2xl md:p-9"
            >
              {newsletterDone ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">You&apos;re subscribed</h3>
                  <p className="text-sm font-medium text-muted-foreground">Watch your inbox for news from The Squad.</p>
                </div>
              ) : (
                <form onSubmit={handleNewsletterSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newsletter-name" className="text-[10px] font-black uppercase tracking-widest">Name</Label>
                    <Input
                      id="newsletter-name"
                      value={newsletterName}
                      onChange={(event) => setNewsletterName(event.target.value)}
                      placeholder="Your name"
                      autoComplete="name"
                      className="h-auto rounded-xl bg-muted/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newsletter-email" className="text-[10px] font-black uppercase tracking-widest">Email *</Label>
                    <Input
                      id="newsletter-email"
                      type="email"
                      required
                      value={newsletterEmail}
                      onChange={(event) => setNewsletterEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      className="h-auto rounded-xl bg-muted/50"
                    />
                  </div>
                  <Button type="submit" disabled={newsletterLoading} className="h-14 w-full rounded-xl font-black uppercase tracking-widest">
                    {newsletterLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Mail className="mr-2 h-4 w-4" /> Subscribe</>}
                  </Button>
                  <p className="text-center text-[10px] font-medium leading-relaxed text-muted-foreground">
                    By subscribing, you agree to receive The Squad newsletter. You can unsubscribe from any email.
                  </p>
                </form>
              )}
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="py-12 bg-muted/50 border-t">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <Link href="/" className="flex items-center gap-3">
              <BrandLogo variant="light-background" className="h-8 w-32" />
            </Link>
                        <div className="flex flex-wrap items-center justify-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center mb-4">
              <Link href="/about" className="hover:text-primary transition-colors">About</Link>
              <Link href="/plans" className="hover:text-primary transition-colors">Plans &amp; pricing</Link>
              <Link href="/download" className="hover:text-primary transition-colors">Get the app</Link>
              <Link href="/vs/teamsnap" className="hover:text-primary transition-colors">vs TeamSnap</Link>
              <Link href="/vs/teamlinkt" className="hover:text-primary transition-colors">vs TeamLinkt</Link>
              <Link href="/vs/spond" className="hover:text-primary transition-colors">vs Spond</Link>
              <Link href="/how-to" className="hover:text-primary transition-colors">How to Guide</Link>
              <Link href="/Tactical_User_Manual.md" className="hidden hover:text-primary transition-colors text-primary font-black scale-110">Help Guide</Link>
              <Link href="/AI_KNOWLEDGE_BASE.md" className="hidden hover:text-primary transition-colors">AI Knowledge Base</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
              <Link href="/cookies" className="hover:text-primary transition-colors">Cookies</Link>
              <Link href="/refunds" className="hover:text-primary transition-colors">Refunds</Link>
            </div>

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
            </p>
          </div>
        </div>
        <div className="mt-6 flex justify-center"><ParentCompanyBrand /></div>
      </footer>

      {/* Elfsight AI Chatbot | Squad Pro — landing page only */}
      <LandingChatbot />
    </div>
  );
}
