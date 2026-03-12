
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
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import BrandLogo from '@/components/BrandLogo';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useUser } from '@/firebase';

export default function LandingPage() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  const sportsImages = PlaceHolderImages
    .filter(img => img.id.startsWith('sport-'))
    .map(img => img.imageUrl);

  useEffect(() => {
    if (!isUserLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isUserLoading, router]);

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

  if (user) return null;

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
            <a href="#pricing" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Pricing</a>
            <a href="#contact" className={cn("hover:text-primary transition-colors", isScrolled ? "text-muted-foreground" : "text-white/80")}>Contact</a>
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
              data-ai-hint="sports background"
              priority={idx === 0}
            />
            <div className="absolute inset-0 bg-black/60 bg-gradient-to-b from-black/40 via-transparent to-black/80" />
          </div>
        ))}

        <div className="container relative z-10 px-6 text-center space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <Badge className="bg-primary/20 backdrop-blur-md text-primary-foreground border-primary/30 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] animate-pulse">
            The Ultimate Team Hub
          </Badge>
          <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-[0.9] max-w-4xl mx-auto drop-shadow-2xl">
            COORDINATE <br className="hidden md:block" /> LIKE <span className="text-primary italic">PROS.</span>
          </h1>
          <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto font-medium leading-relaxed">
            Unite your squad, manage schedules, and dominate the season with the all-in-one platform for competitive teams.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link href="/signup">
              <Button size="lg" className="h-16 px-10 rounded-full text-lg font-black shadow-2xl shadow-primary/40 active:scale-95 transition-all w-full sm:w-auto">
                Start Your Squad <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login#demos">
              <Button size="lg" variant="outline" className="h-16 px-10 rounded-full text-lg font-black bg-white/10 border-white/20 text-white backdrop-blur-md hover:bg-white/20 active:scale-95 transition-all w-full sm:w-auto">
                See the Demo
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-12 left-0 right-0 hidden md:block">
          <div className="container mx-auto px-6 flex justify-center gap-20 text-white">
            <div className="text-center">
              <p className="text-3xl font-black">2.5k+</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Active Teams</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black">50k+</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Scheduled Games</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-black">99.9%</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">Coordination Rate</p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-32 bg-white relative overflow-hidden">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-24 max-w-3xl mx-auto">
            <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">
              The Suite
            </Badge>
            <h3 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">
              BUILT FOR <br /> <span className="text-primary italic">CHAMPIONS.</span>
            </h3>
            <p className="text-muted-foreground font-medium text-lg pt-4 leading-relaxed">
              Ditch the fragmented group chats. The Squad provides a unified, high-performance platform for elite coordination.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {[
              { 
                title: "RECRUITMENT HUB", 
                desc: "Automated player enrollment with custom forms and coach assignment logic.", 
                img: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&q=80&w=800",
                hint: "team meeting"
              },
              { 
                title: "TACTICAL CHATS", 
                desc: "Secure, role-based discussions for strategy, positions, and events.", 
                img: "https://images.unsplash.com/photo-1612768875331-0447b960fa40?auto=format&fit=crop&q=80&w=800",
                hint: "basketball player"
              },
              { 
                title: "GAME SCHEDULING", 
                desc: "Real-time RSVP tracking and match day logistics for the entire squad.", 
                img: "https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=800",
                hint: "soccer match"
              },
              { 
                title: "SCORE TRACKING", 
                desc: "Visualize your trajectory with automated win/loss and performance tracking.", 
                img: "https://images.unsplash.com/photo-1711045676217-c3d73143071c?auto=format&fit=crop&q=80&w=800",
                hint: "baseball game"
              },
              { 
                title: "LIVE FEED", 
                desc: "A high-priority broadcast hub for squad updates, media, and alerts.", 
                img: "https://images.unsplash.com/photo-1614743653196-d969b45200b9?auto=format&fit=crop&q=80&w=1080",
                hint: "tennis player"
              },
              { 
                title: "PLAYBOOK & FILM", 
                desc: "Centralized hub for video study with automated watch verification and tactical notes.", 
                img: "https://images.unsplash.com/photo-1486128105845-91daff43f404?auto=format&fit=crop&q=80&w=800",
                hint: "video analysis"
              }
            ].map((feature, i) => (
              <div 
                key={i} 
                className="group relative h-[450px] rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-700 hover:scale-[1.02] cursor-default"
              >
                <Image 
                  src={feature.img} 
                  alt={feature.title}
                  fill
                  className="object-cover transition-transform duration-1000 group-hover:scale-110"
                  data-ai-hint={feature.hint}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                
                <CardContent className="absolute bottom-0 p-8 space-y-4 w-full">
                  <Badge className="bg-primary text-white border-none font-black px-3 py-1 uppercase tracking-widest text-[9px]">
                    ELITE COORDINATION
                  </Badge>
                  <h4 className="text-3xl font-black text-white tracking-tighter leading-none">
                    {feature.title}
                  </h4>
                  <p className="text-white/70 font-medium text-sm leading-relaxed max-w-[240px] opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    {feature.desc}
                  </p>
                  <div className="pt-2">
                    <div className="h-1 w-12 bg-primary group-hover:w-full transition-all duration-700 ease-in-out" />
                  </div>
                </CardContent>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 bg-muted/30 relative">
        <div className="container mx-auto px-6">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">Simple, transparent pricing</h2>
            <h3 className="text-4xl md:text-5xl font-black tracking-tight">One Price. Infinite Success.</h3>
            <div className="flex flex-col items-center gap-2 pt-2">
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Prices listed in USD</p>
              <div className="flex items-center gap-2 text-primary font-black uppercase tracking-widest text-[10px] bg-white px-4 py-2 rounded-full border border-primary/10 shadow-sm">
                <AlertCircle className="h-3 w-3" />
                <span>Limited Promotional Pricing • Subject to Change</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <Card className="border-none shadow-2xl rounded-[3rem] p-10 space-y-8 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
                <Trophy className="h-40 w-40 -rotate-12" />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-primary">Starter Squads</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black">$0</span>
                  <span className="text-muted-foreground font-bold">Free Forever</span>
                </div>
              </div>
              <ul className="space-y-4 font-bold text-sm text-foreground/80">
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-primary" /> Game Scheduling & Scores</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-primary" /> Unlimited Starter Teams</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-primary" /> Tactical Chats</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-primary" /> Global Roster Access</li>
              </ul>
              <Link href="/signup">
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                  Launch Free Hub
                </Button>
              </Link>
            </Card>

            <Card className="border-2 border-primary shadow-2xl rounded-[3rem] p-10 space-y-8 relative overflow-hidden bg-primary text-primary-foreground group">
              <div className="absolute -top-4 -right-4 bg-white text-primary text-[10px] font-black px-4 py-2 rotate-12 shadow-lg z-10">
                BEST VALUE
              </div>
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-white/60">Annual Elite</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black">$99</span>
                  <span className="text-white/60 font-bold">USD/team/yr</span>
                </div>
                <p className="text-[10px] font-black uppercase text-white/40">Includes all recruitment modules</p>
              </div>
              <ul className="space-y-4 font-bold text-sm">
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-white" /> League Registration Hub</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-white" /> Coach Assignment Logic</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-white" /> Advanced Performance Stats</li>
                <li className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-white" /> 10GB Pro Media Vault</li>
              </ul>
              <Link href="/signup">
                <Button variant="secondary" className="w-full h-14 rounded-2xl text-lg font-black shadow-xl bg-white text-primary hover:bg-white/90 active:scale-95 transition-all">
                  Get Elite Pro
                </Button>
              </Link>
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
                <h3 className="text-4xl md:text-5xl font-black tracking-tight">Need a custom plan <br />for your league?</h3>
                <p className="text-muted-foreground font-medium text-lg leading-relaxed">
                  We offer enterprise-grade solutions for sports leagues and multi-team organizations. Connect with our coordination experts today.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Mail className="h-5 w-5" />
                  </div>
                  <span className="font-bold">team@thesquad.pro</span>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <span className="font-bold">Worldwide</span>
                </div>
                <div className="flex items-center gap-4 group">
                  <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <Infinity className="h-5 w-5" />
                  </div>
                  <span className="font-bold">Unlimited Starter Support</span>
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
                  <Label className="text-xs font-black uppercase tracking-widest">Team/League Name</Label>
                  <Input placeholder="Westside Warriors" className="h-12 rounded-xl bg-muted/50 border-none" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest">How can we help?</Label>
                  <Textarea placeholder="Tell us about your organization..." className="min-h-[120px] rounded-xl bg-muted/50 border-none resize-none" />
                </div>
                <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all">
                  Send Inquiry
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
