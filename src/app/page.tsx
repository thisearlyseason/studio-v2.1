
"use client"; 

import React, { useState, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import Script from 'next/script';
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
  Building,
  GraduationCap,
  BookOpen
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetDescription
} from '@/components/ui/sheet';
import { Menu } from 'lucide-react';

const DEMO_OPTIONS = [
  { id: 'starter_squad', name: 'Starter Plan Demo', icon: Users, desc: 'Grassroots essentials' },
  { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Professional elite coordination' },
  { id: 'elite_teams', name: 'Elite Org Demo', icon: Trophy, desc: 'Institutional multi-team hub' },
  { id: 'school_demo', name: 'School Demo', icon: GraduationCap, desc: 'Full K-12 Program Hub' },
  { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Teammate recruiting view' },
  { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Guardian safety view' }
];

// ── Shared animation helpers ──────────────────────────────────────────────
const fadeUp = { hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } };

function SectionHeader({ badge, title, subtitle }: { badge: string; title: React.ReactNode; subtitle: React.ReactNode }) {
  return (
    <motion.div
      className="text-center space-y-4 mb-24 max-w-3xl mx-auto"
      initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.3 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
    >
      <motion.div variants={fadeUp}>
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">{badge}</Badge>
      </motion.div>
      <motion.h3 variants={fadeUp} className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">{title}</motion.h3>
      <motion.div variants={fadeUp} className="text-muted-foreground font-medium text-lg pt-4 leading-relaxed">{subtitle}</motion.div>
    </motion.div>
  );
}

function StaggerGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
      variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.1 } } }}
    >
      {children}
    </motion.div>
  );
}
// ──────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isDemoDialogOpen, setIsDemoDialogOpen] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [isAuthResolvedFailsafe, setIsAuthResolvedFailsafe] = useState(false);
  
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Failsafe to hide loading spinner even if Auth is slow or hangs
    const timer = setTimeout(() => {
      setIsAuthResolvedFailsafe(true);
    }, 4000); // 4 second threshold
    return () => clearTimeout(timer);
  }, []);

  const sportsVideos = [
    {
      sport: "Baseball",
      src: "https://assets.mixkit.co/videos/853/853-720.mp4",
      poster: "https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=1200"
    },
    {
      sport: "Soccer",
      src: "https://assets.mixkit.co/videos/43494/43494-720.mp4",
      poster: "https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80&w=1200"
    },
    {
      sport: "Football",
      src: "https://assets.mixkit.co/videos/42554/42554-720.mp4",
      poster: "https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=1200"
    },
    {
      sport: "Golf",
      src: "https://cdn.pixabay.com/video/2018/10/02/18528-293467377_large.mp4",
      poster: "https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&q=80&w=1200"
    },
    {
      sport: "Hockey",
      src: "https://assets.mixkit.co/videos/48383/48383-720.mp4",
      poster: "https://images.unsplash.com/photo-1515703407324-5f753afd8be8?auto=format&fit=crop&q=80&w=1200"
    },
  ];

  const videoRefs = React.useRef<(HTMLVideoElement | null)[]>([]);

  const handleVideoEnded = React.useCallback(() => {
    setCurrentImageIndex((prev) => (prev + 1) % sportsVideos.length);
  }, [sportsVideos.length]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const clipTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Play the active video, pause others, and auto-advance after 5 s
  useEffect(() => {
    if (clipTimerRef.current) clearTimeout(clipTimerRef.current);

    videoRefs.current.forEach((vid, i) => {
      if (!vid) return;
      if (i === currentImageIndex) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      } else {
        vid.pause();
      }
    });

    clipTimerRef.current = setTimeout(() => {
      setCurrentImageIndex((prev) => (prev + 1) % sportsVideos.length);
    }, 5000);

    return () => { if (clipTimerRef.current) clearTimeout(clipTimerRef.current); };
  }, [currentImageIndex, sportsVideos.length]);

  const handleLaunchDemo = async (planId: string) => {
    setIsDemoLoading(true);
    try {
      // Clear current session first to prevent state pollution
      await signOut(auth);
      // Brief delay to ensure auth state clean
      await new Promise(resolve => setTimeout(resolve, 500));

      // Always wipe stale demo locks/state so the seeder runs fresh
      localStorage.removeItem('squad_seeding_lock');
      localStorage.removeItem('sf_session_team_id');
      sessionStorage.removeItem('squad_demo_start_time');
      
      await signInAnonymously(auth);
      
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

  if (isUserLoading && !isAuthResolvedFailsafe) return (
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

          <div className="hidden md:flex items-center gap-4">
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

          <div className="md:hidden flex items-center gap-2">
            {!isScrolled && (
              <Link href="/login">
                <Button variant="ghost" size="sm" className="font-bold text-white text-[10px] uppercase tracking-widest px-2 h-8">
                  Log In
                </Button>
              </Link>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className={cn("rounded-xl h-10 w-10", isScrolled ? "text-foreground" : "text-white hover:bg-white/10")}>
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] border-none p-0 bg-white">
                <SheetHeader className="p-8 pb-4 text-left">
                  <div className="h-1 bg-primary w-12 rounded-full mb-6" />
                  <SheetTitle className="text-3xl font-black uppercase tracking-tighter">Tactical Menu</SheetTitle>
                  <SheetDescription className="text-primary font-black uppercase text-[10px] tracking-widest pt-1">
                    Squad Control Protocols
                  </SheetDescription>
                </SheetHeader>
                <div className="px-8 flex flex-col gap-6 pt-10">
                  <a href="#features" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Features</a>
                  <a href="#roles" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Roles</a>
                  <a href="#comparison" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Market Intel</a>
                  <a href="#pricing" className="text-xl font-black uppercase tracking-tight hover:text-primary transition-colors py-2 border-b border-muted">Pricing</a>
                  <div className="flex flex-col gap-4 mt-12 pt-6">
                    <Link href="/signup" className="w-full">
                      <Button className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20">
                        Join Now
                      </Button>
                    </Link>
                    <Link href="/login" className="w-full">
                      <Button variant="outline" className="w-full h-14 rounded-2xl font-black uppercase tracking-widest text-xs border-2">
                        Log In
                      </Button>
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {sportsVideos.map((clip, idx) => (
          <div
            key={idx}
            className={cn(
              "absolute inset-0 transition-opacity duration-1000 ease-in-out",
              currentImageIndex === idx ? "opacity-100" : "opacity-0"
            )}
          >
            <video
              ref={(el) => { videoRefs.current[idx] = el; }}
              src={clip.src}
              poster={clip.poster}
              muted
              playsInline
              autoPlay={idx === 0}
              onEnded={handleVideoEnded}
              className="absolute inset-0 w-full h-full object-cover scale-105"
            />
            <div className="absolute inset-0 bg-black/55 bg-gradient-to-b from-black/50 via-black/20 to-black/80" />
          </div>
        ))}

        {/* Sport indicators */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
          {sportsVideos.map((clip, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentImageIndex(idx)}
              className={cn(
                "transition-all duration-300 font-black uppercase tracking-widest text-white rounded-full border",
                currentImageIndex === idx
                  ? "bg-primary border-primary px-4 py-1.5 text-[9px] shadow-lg shadow-primary/30"
                  : "bg-white/10 border-white/20 backdrop-blur-sm px-3 py-1 text-[8px] opacity-60 hover:opacity-100"
              )}
            >
              {clip.sport}
            </button>
          ))}
        </div>


        <motion.div
          className="container relative z-10 px-6 text-center space-y-8"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.15 } } }}
        >
          {/* Badge — drops from above */}
          <motion.div
            variants={{
              hidden: { opacity: 0, y: -18 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: 'easeOut' } }
            }}
          >
            <Badge className="bg-primary/20 backdrop-blur-md text-primary-foreground border-primary/30 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em]">
              Institutional Team Infrastructure
            </Badge>
          </motion.div>

          {/* Headline — word-by-word masked slide-up */}
          <motion.div
            className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.88] max-w-5xl mx-auto drop-shadow-2xl"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } } }}
          >
            {/* Line 1 */}
            <div className="overflow-hidden pb-1">
              <motion.span
                className="block"
                variants={{ hidden: { y: '105%', opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } }}
              >
                DOMINATE
              </motion.span>
            </div>
            {/* Line 2 */}
            <div className="overflow-hidden pb-1 flex items-baseline justify-center gap-4 md:gap-6 flex-wrap">
              <motion.span
                className="inline-block"
                variants={{ hidden: { y: '105%', opacity: 0 }, visible: { y: 0, opacity: 1, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } }}
              >
                YOUR
              </motion.span>
              <motion.span
                className="inline-block text-primary italic"
                variants={{ hidden: { y: '105%', opacity: 0, scale: 0.95 }, visible: { y: 0, opacity: 1, scale: 1, transition: { duration: 0.75, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } }}
              >
                SEASON.
              </motion.span>
            </div>
          </motion.div>

          {/* Subtitle — blur-to-clear fade */}
          <motion.p
            className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto font-medium leading-relaxed"
            variants={{ hidden: { opacity: 0, filter: 'blur(8px)', y: 12 }, visible: { opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 0.9, ease: 'easeOut' } } }}
          >
            The all-in-one tactical platform for elite sports organizations. Coordinate rosters, automate brackets, and verify performance.
          </motion.p>

          {/* Buttons — scale up from below */}
          <motion.div
            className="flex flex-col items-center justify-center gap-3 pt-4 w-full max-w-xs mx-auto"
            variants={{ hidden: { opacity: 0, scale: 0.92, y: 16 }, visible: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } } }}
          >
            {user ? (
              <Link href="/dashboard" className="w-full">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link href="/signup" className="w-full">
                <Button size="lg" className="h-12 px-8 rounded-full text-sm font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full">
                  Deploy Your Squad <ArrowRight className="ml-2 h-4 w-4" />
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
          </motion.div>
        </motion.div>
      </section>

      <section id="features" className="py-32 bg-white relative overflow-hidden">
        <div className="container mx-auto px-6">
          <SectionHeader
            badge="Institutional Suite"
            title={<>PROFESSIONAL <br /> <span className="text-primary italic">INFRASTRUCTURE.</span></>}
            subtitle="The Squad provides the foundational protocols and advanced modules required to scale from a single team to an entire league."
          />

          <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500 h-full">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <TableIcon className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Tournament & League Elite Engines</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                Automated <strong>League Itineraries</strong> and bracket generation with a <strong>Public Spectator Hub</strong> and mobile <strong>Scorekeeper Portal</strong> for real-time results.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Live Standings</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Multi-Team Conflicts</li>
              </ul>
            </Card>
            </motion.div>

            <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500 h-full">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <PenTool className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Branded Briefing Unit</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                Export professionally branded <strong>Tactical PDF Briefings</strong> for every event. Automated <strong>AI Image Optimization</strong> ensures drill assets load instantly.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Printable Itineraries</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Institutional Branding</li>
              </ul>
            </Card>
            </motion.div>

            <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500 h-full">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <Video className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Film Watch Verification</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                The <strong>75% Watch Rule</strong> ensures teammates study their assignments. Monitor video compliance directly in your master roster ledger.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> 10GB Pro Storage</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Verified Compliance</li>
              </ul>
            </Card>
            </motion.div>

            <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
            <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 group hover:bg-black hover:text-white transition-all duration-500 h-full">
              <div className="bg-primary p-4 rounded-2xl w-fit shadow-lg shadow-primary/20">
                <ClipboardList className="h-8 w-8 text-white" />
              </div>
              <h4 className="text-2xl font-black uppercase tracking-tight">Recruitment Engine</h4>
              <p className="text-sm font-medium leading-relaxed opacity-70">
                Custom <strong>Form Architect</strong> for registration. Collect medical waivers and fees with automated coach assignment and performance portfolios.
              </p>
              <ul className="space-y-3 pt-4">
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Digital Signatures</li>
                <li className="flex items-center gap-3 text-xs font-bold uppercase"><CheckCircle2 className="h-4 w-4 text-primary" /> Performance Export</li>
              </ul>
            </Card>
            </motion.div>
          </StaggerGrid>
        </div>
      </section>

      <section id="comparison" className="py-32 bg-white relative">
        <div className="container mx-auto px-6">
          <SectionHeader
            badge="Market Intelligence"
            title={<>COMPETITIVE <br /> <span className="text-primary italic">ADVANTAGE.</span></>}
            subtitle="Legacy tools are for hobbyists. The Squad is built for organizations that demand absolute operational visibility and high-performance metrics."
          />
          
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/5 blur-[100px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="relative overflow-x-auto rounded-[2rem] md:rounded-[3.5rem] border-2 shadow-2xl bg-white scrollbar-hide">
              <div className="md:hidden flex items-center justify-center p-3 bg-muted/20 text-[8px] font-black uppercase tracking-[0.2em] text-primary space-x-2 border-b">
                <span>Swipe to compare</span>
                <ChevronRight className="h-3 w-3 animate-bounce-x" />
              </div>
              <table className="w-full text-left border-collapse min-w-[700px] md:min-w-[1000px]">
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
                  { feature: "Branded PDF Briefings", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Institutional Tactical PDF Printouts" },
                  { feature: "HD Tactical Capture", squad: true, tsnap: false, hudl: "Basic", treach: false, gchanger: false, note: "Frame-accurate play breakdown" },
                  { feature: "Institutional Fiscal Audit", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Club-wide financial visibility" },
                  { feature: "Recruiting Portfolio Export", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Certified athlete performance resumes" },
                  { feature: "Consolidated Household Hub", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Unified management for multi-athlete families" },
                  { feature: "AI Image/Asset Optimization", squad: true, tsnap: false, hudl: false, treach: false, gchanger: false, note: "Automatic high-res compression" },
                  { feature: "75% Film Watch Rule", squad: true, tsnap: false, hudl: "Partial", treach: false, gchanger: false, note: "Verified compliance monitoring" },
                  { feature: "Tournament & League Elite Engines", squad: true, tsnap: "Partial", hudl: false, treach: false, gchanger: "Basic", note: "One-click championship series" },
                  { feature: "UTC-Precision Scheduling", squad: true, tsnap: "Basic", hudl: "Basic", treach: "Basic", gchanger: "Basic", note: "Timezone-aware local consistency" },
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
                  <p className="text-xs text-white/60 leading-relaxed font-medium">Generate <strong>Structured Opponent Intel</strong> from match notes using integrated GenAI protocols.</p>
                </div>
                <div className="space-y-3">
                  <Video className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">HD Tactical Capture</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium">Extract high-resolution <strong>Tactical Frames</strong> from raw film for granular play-by-play breakdown.</p>
                </div>
                <div className="space-y-3">
                  <Building className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">Institutional Hub</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium"><strong>Fiscal Pulse Auditing</strong> for club directors managing 20+ squads with aggregated financial visibility.</p>
                </div>
                <div className="space-y-3">
                  <ShieldAlert className="h-8 w-8 text-primary" />
                  <h5 className="text-lg font-black uppercase">Recruiting Portfolios</h5>
                  <p className="text-xs text-white/60 leading-relaxed font-medium">Certified <strong>Personnel Evaluations</strong> that athletes can export directly to college recruitment pipelines.</p>
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
          <SectionHeader
            badge="Specialized Interfaces"
            title={<>Tailored <br /> <span className="text-primary italic">Account Roles.</span></>}
            subtitle="Every member of the organization receives a custom dashboard optimized for their specific operational objectives."
          />

          <StaggerGrid className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <motion.div whileHover={{ y: -10, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 h-full">
                <Trophy className="h-12 w-12 text-primary" />
                <h5 className="text-2xl font-black uppercase tracking-tight">Coaches & Managers</h5>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">Full command of the roster, scheduling, and tactical playbooks. Launch broadcasts, auto-generate brackets, and track personnel performance.</p>
              </Card>
            </motion.div>
            <motion.div whileHover={{ y: -10, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 h-full">
                <Baby className="h-12 w-12 text-primary" />
                <h5 className="text-2xl font-black uppercase tracking-tight">Guardian Hub</h5>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">Manage multiple children from one unified **Household Hub**. Track consolidated dues, verify digital waivers, and manage volunteer assignments globally.</p>
              </Card>
            </motion.div>
            <motion.div whileHover={{ y: -10, scale: 1.02 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
              <Card className="rounded-[3rem] border-none shadow-xl bg-muted/20 p-10 space-y-6 h-full">
                <User className="h-12 w-12 text-primary" />
                <h5 className="text-2xl font-black uppercase tracking-tight">Athlete Performance</h5>
                <p className="text-sm font-medium text-muted-foreground leading-relaxed">A personal dashboard. Sign waivers, watch study film, track match results, and manage your <strong>Professional Recruiting Portfolio</strong>.</p>
              </Card>
            </motion.div>
          </StaggerGrid>
        </div>
      </section>

      <section id="pricing" className="py-32 bg-muted/30 relative">
        <div className="container mx-auto px-6">
          <SectionHeader
            badge="Transparent Institutional Tiers"
            title="Scale Your Organization"
            subtitle={<div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px] bg-white px-4 py-2 rounded-full border border-primary/10 shadow-sm w-fit mx-auto"><AlertCircle className="h-3 w-3" /><span>Limited Introductory Pricing • Competitive Advantage Locked</span></div>}
          />

          <div className="max-w-7xl mx-auto">
            {/* Row 1: 3 cards */}
            <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-stretch mb-6">
              {/* Starter */}
              <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5 h-full">
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
              </motion.div>

              {/* Squad Pro */}
              <motion.div whileHover={{ y: -10, scale: 1.02 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden flex flex-col bg-black text-white ring-4 ring-primary relative h-full">
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
              </motion.div>

              {/* Elite Teams */}
              <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5 h-full">
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
              </motion.div>
            </StaggerGrid>

            {/* Row 2: 2 cards centered on desktop, stacked on mobile */}
            <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch max-w-5xl mx-auto">
              {/* Elite League */}
              <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5 w-full max-w-[400px] h-full">
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
              </motion.div>

              {/* School District */}
              <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className="flex flex-col">
              <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5 w-full max-w-[400px] h-full">
                <CardHeader className="p-8 pb-4 space-y-4">
                  <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-[#10b981]/20 text-[#10b981] w-fit">K-12 DISTRICT</Badge>
                  <div className="space-y-1">
                    <CardTitle className="text-2xl font-black uppercase tracking-tight">School District</CardTitle>
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black tracking-tighter text-[#10b981]">$150</span>
                      <span className="text-[10px] font-black uppercase opacity-60 text-muted-foreground">/mo</span>
                    </div>
                  </div>
                  <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">Unlimited Sports & Programs.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 pt-0 flex-1 space-y-6">
                  <div className="pt-4 border-t space-y-3">
                    <p className="text-[9px] font-black uppercase text-muted-foreground">Academic Athletics</p>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> District Dashboard</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> Athletic Director Hub</li>
                      <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><GraduationCap className="h-3.5 w-3.5 text-[#10b981]" /> Academic Eligibility</li>
                    </ul>
                  </div>
                </CardContent>
                <CardFooter className="p-8 pt-0">
                  <Link href="/signup" className="w-full">
                    <Button variant="outline" className="w-full h-12 rounded-xl font-black uppercase text-xs border-2 border-[#10b981]/30 text-[#10b981] hover:bg-[#10b981] hover:text-white hover:border-[#10b981]">Deploy School</Button>
                  </Link>
                </CardFooter>
              </Card>
              </motion.div>
            </StaggerGrid>
          </div>
          <div className="mt-8 text-center">
            <p className="text-[10px] font-black uppercase text-red-600 tracking-widest">All pricing is presented and billed in USD.</p>
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
                        <div className="flex flex-wrap items-center justify-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center mb-4">
              <Link href="/how-to" className="hover:text-primary transition-colors">How to Guide</Link>
              <Link href="/Tactical_User_Manual.md" className="hidden hover:text-primary transition-colors text-primary font-black scale-110">Tactical Manual</Link>
              <Link href="/AI_KNOWLEDGE_BASE.md" className="hidden hover:text-primary transition-colors">AI Knowledge Base</Link>
              <Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-primary transition-colors">Terms of Service</Link>
            </div>

            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              © {new Date().getFullYear()} The Squad Hub. All Rights Reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Elfsight AI Chatbot | Squad Pro */}
      <Script src="https://elfsightcdn.com/platform.js" async />
      <div className="elfsight-app-4f8f60bc-5748-46cb-914c-1b03d7c8826e" data-elfsight-app-lazy></div>
    </div>
  );
}
