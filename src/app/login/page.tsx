"use client";

import React, { useState, useEffect } from 'react';
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
import { PlaceHolderImages } from '@/lib/placeholder-images';
import BrandLogo from '@/components/BrandLogo';
import Image from 'next/image';
import { Sparkles, Trophy, Users, Zap, Loader2, Table as TableIcon, User, Baby } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState('');
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    const sportsImages = PlaceHolderImages.filter(img => img.id.startsWith('sport-'));
    if (sportsImages.length > 0) {
      const randomIdx = Math.floor(Math.random() * sportsImages.length);
      setBackgroundImage(sportsImages[randomIdx].imageUrl);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/');
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
      await signOut(auth);
      await signInAnonymously(auth);
      // Redirect to dashboard root with the seed param
      router.push(`/?seed_demo=${planId}`);
    } catch (error: any) {
      toast({
        title: "Demo Launch Failed",
        description: "Please try again later.",
        variant: "destructive"
      });
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-6 relative overflow-hidden">
      {backgroundImage && (
        <>
          <div className="absolute inset-0 w-full h-full">
            <Image 
              src={backgroundImage} 
              alt="Sports Background" 
              fill
              className="object-cover opacity-60 animate-in fade-in duration-1000"
              data-ai-hint="sports background"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        </>
      )}
      
      <div className="relative z-20 mb-8 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-1000">
        <BrandLogo variant="dark-background" className="h-16 w-48 drop-shadow-2xl" priority />
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center relative z-10">
        <Card className="border-none shadow-2xl rounded-[2.5rem] animate-in fade-in slide-in-from-bottom-8 duration-700 bg-white/95 backdrop-blur-sm">
          <CardHeader className="space-y-2 pt-10 text-center">
            <CardTitle className="text-4xl font-black tracking-tighter uppercase">Welcome Back</CardTitle>
            <CardDescription className="text-base font-medium">Log in to rejoin your squad and start coordinated plays.</CardDescription>
          </CardHeader>
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-6 px-8">
              <div className="space-y-2">
                <Label htmlFor="email" className="font-bold text-xs uppercase tracking-widest px-1">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="you@example.com" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-2xl bg-muted/50 border-none focus-visible:ring-primary/30 text-base"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <Label htmlFor="password" className="font-bold text-xs uppercase tracking-widest">Password</Label>
                  <Link href="#" className="text-xs font-bold text-primary hover:underline">Forgot?</Link>
                </div>
                <Input 
                  id="password" 
                  type="password" 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 rounded-2xl bg-muted/50 border-none focus-visible:ring-primary/30 text-base"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-6 pb-12 px-8">
              <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={isLoading || isDemoLoading}>
                {isLoading ? "Checking Credentials..." : "Sign In to The Squad"}
              </Button>
              <p className="text-sm font-bold text-center text-muted-foreground">
                New to the team?{" "}
                <Link href="/signup" className="text-primary hover:underline font-black">
                  Join The Squad
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>

        {/* Interactive Demo Section */}
        <div id="demos" className="space-y-6 animate-in fade-in slide-in-from-right-8 duration-1000 scroll-mt-10 overflow-y-auto max-h-[80vh] custom-scrollbar pr-2">
          <div className="bg-primary text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-700">
              <Trophy className="h-48 w-48" />
            </div>
            <div className="relative z-10 space-y-4">
              <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest text-[10px] px-3 h-6">Interactive Hub</Badge>
              <h3 className="text-4xl font-black tracking-tighter leading-none uppercase">Explore the <br />Demo Squads</h3>
              <p className="text-white/80 font-medium text-sm leading-relaxed max-w-xs">
                Jump into a fully-populated team environment to test every professional coordination tool we offer.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[
              { id: 'starter_squad', name: 'Starter Demo', icon: Users, desc: 'Grassroots essentials' },
              { id: 'squad_pro', name: 'Elite Squad Demo', icon: Zap, desc: 'Advanced analytics & strategy' },
              { id: 'player_demo', name: 'Player Demo', icon: User, desc: 'Individual teammate view' },
              { id: 'parent_demo', name: 'Parent Demo', icon: Baby, desc: 'Guardian safety view' },
              { id: 'tournament_pro', name: 'Tournament Demo', icon: TableIcon, desc: 'Brackets & Live Scores' },
              { id: 'squad_organization', name: 'Club Demo', icon: Trophy, desc: 'Multi-team organization' }
            ].map((demo) => (
              <Button 
                key={demo.id} 
                variant="outline" 
                className="h-20 rounded-[1.5rem] bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40 transition-all flex items-center justify-between px-6 backdrop-blur-md group"
                onClick={() => handleLaunchDemo(demo.id)}
                disabled={isLoading || isDemoLoading}
              >
                <div className="flex items-center gap-4">
                  <div className="bg-white/10 p-3 rounded-2xl group-hover:bg-primary group-hover:text-white transition-colors">
                    <demo.icon className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <p className="font-black text-sm uppercase tracking-widest">{demo.name}</p>
                    <p className="text-[10px] font-bold text-white/50 uppercase tracking-tighter">{demo.desc}</p>
                  </div>
                </div>
                {isDemoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5 text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity" />}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center pt-12 relative z-10 opacity-40">
        <p className="text-[10px] text-white font-black uppercase tracking-[0.3em]">Built for Champions • Powered by The Squad</p>
      </div>
    </div>
  );
}
