"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword, signInAnonymously, signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import BrandLogo from '@/components/BrandLogo';
import Image from 'next/image';
import { Trophy, Users, Zap, Loader2, User, Baby, ChevronRight, ChevronLeft, ShieldAlert } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const auth = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunchDemo = async (planId: string) => {
    setIsDemoLoading(true);
    try {
      // Clear current session first to prevent state pollution
      await signOut(auth);
      // Brief delay to ensure auth state clean
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await signInAnonymously(auth);
      
      // Use window.location.replace to bypass internal router cache 
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

  const DEMO_LIST = [
    { id: 'starter_squad', name: 'Starter Demo', icon: Users, desc: 'Grassroots essentials' },
    { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Professional elite coordination' },
    { id: 'elite_teams', name: 'Elite Org Demo', icon: Trophy, desc: 'Institutional multi-team hub' },
    { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Teammate recruiting view' },
    { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Guardian safety view' }
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-6 relative overflow-hidden">
      <div className="absolute inset-0 w-full h-full">
        <Image 
          src="https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&q=80&w=1600" 
          alt="Stadium Atmosphere" 
          fill
          className="object-cover opacity-50 animate-in fade-in duration-1000"
          data-ai-hint="stadium lights"
          priority
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
      
      <div className="absolute top-6 left-6 z-30">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest h-10 px-4 rounded-full border border-white/10 backdrop-blur-sm">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      <div className="relative z-20 mb-8 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-1000">
        <BrandLogo variant="dark-background" className="h-16 w-48 drop-shadow-2xl" priority />
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
        <Card className="border-none shadow-2xl rounded-[3rem] animate-in fade-in slide-in-from-left-8 duration-700 bg-white/95 backdrop-blur-sm">
          <CardHeader className="space-y-2 pt-12 text-center">
            <CardTitle className="text-4xl font-black tracking-tighter uppercase">Authorized Access</CardTitle>
            <CardDescription className="text-base font-bold uppercase tracking-widest text-primary/60 text-[10px]">Credential Verification Hub</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-6 px-10">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-black text-[10px] uppercase tracking-widest px-1 ml-1 text-muted-foreground">Official Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@organization.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label htmlFor="password" className="font-black text-[10px] uppercase tracking-widest ml-1 text-muted-foreground">Encrypted Password</Label>
                  <Link href="#" className="text-[10px] font-black text-primary uppercase hover:underline tracking-widest">Forgot?</Link>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-6 pb-12 px-10 pt-4">
              <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={isLoading || isDemoLoading}>
                {isLoading ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Verify Identity"}
              </Button>
              <div className="text-center space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                  Not enrolled in a squad?{" "}
                  <Link href="/signup" className="text-primary hover:underline font-black">
                    Join the League
                  </Link>
                </p>
              </div>
            </CardFooter>
          </form>
        </Card>

        <div id="demos" className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-1000 overflow-y-auto max-h-[80vh] custom-scrollbar pr-4">
          <div className="bg-primary text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <ShieldAlert className="h-48 w-48" />
            </div>
            <div className="relative z-10 space-y-4">
              <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest text-[10px] px-3 h-6">Instant Deployment</Badge>
              <h3 className="text-4xl font-black tracking-tighter leading-none uppercase">Explore Guest <br />Tactical Hubs</h3>
              <p className="text-white/80 font-medium text-sm leading-relaxed max-w-xs">
                Enter a fully-configured organizational environment to audit our professional coordination suite.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {DEMO_LIST.map((demo) => (
              <Button 
                key={demo.id} 
                variant="outline" 
                className="h-24 rounded-[2rem] bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-between px-8 backdrop-blur-md group"
                onClick={() => handleLaunchDemo(demo.id)}
                disabled={isLoading || isDemoLoading}
              >
                <div className="flex items-center gap-6">
                  <div className="bg-white/10 p-4 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
                    <demo.icon className="h-7 w-7" />
                  </div>
                  <div className="text-left">
                    <p className="font-black text-sm uppercase tracking-tight">{demo.name}</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{demo.desc}</p>
                  </div>
                </div>
                {isDemoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-6 w-6 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center pt-12 relative z-10 opacity-40">
        <p className="text-[10px] text-white font-black uppercase tracking-[0.3em]">The Squad Coordination Engine v1.0 • thesquad.pro</p>
      </div>
    </div>
  );
}