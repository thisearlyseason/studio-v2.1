"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth, useUser, useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signInAnonymously, signOut, signInWithPopup, GoogleAuthProvider, sendPasswordResetEmail, browserPopupRedirectResolver } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import BrandLogo from '@/components/BrandLogo';
import Image from 'next/image';
import { Trophy, Users, Zap, Loader2, User, Baby, ChevronRight, ChevronLeft, ShieldAlert, GraduationCap, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();

  React.useEffect(() => {
    if (!isUserLoading && user) {
      const fetchRole = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            if (data.role === 'superadmin' || user.email === 'thisearlyseason@gmail.com') {
              router.push('/admin');
            } else if (data.role === 'admin' || data.isSchoolAdmin) {
              router.push('/club');
            } else {
              router.push('/dashboard');
            }
          } else {
            router.push('/dashboard');
          }
        } catch (e) {
          router.push('/dashboard');
        }
      };
      fetchRole();
    }
  }, [user, isUserLoading, db, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password.trim());
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid credentials.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (error: any) {
      toast({
        title: "Google Login Failed",
        description: error.message || "Could not sign in with Google.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast({ title: "Email Required", description: "Please enter your email above to reset your password.", variant: "destructive" });
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast({ title: "Email Sent", description: "Check your inbox (and spam) for a password reset link!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

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
    { id: 'starter_squad', name: 'Starter Plan Demo', icon: Users, desc: 'Grassroots essentials' },
    { id: 'squad_pro', name: 'Squad Pro Demo', icon: Zap, desc: 'Professional elite coordination' },
    { id: 'elite_teams', name: 'Elite Team/League Demo', icon: Trophy, desc: 'Institutional multi-team hub' },
    { id: 'school_demo', name: 'School Demo', icon: GraduationCap, desc: 'Full K-12 Program Hub' },
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
              
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleGoogleLogin}
                className="w-full h-14 rounded-2xl bg-white border border-gray-200 text-black font-bold hover:bg-gray-50 flex items-center justify-center gap-3"
                disabled={isLoading || isDemoLoading}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white/95 px-2 text-muted-foreground font-black tracking-widest">Or continue with email</span>
                </div>
              </div>

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
                  <button onClick={handleForgotPassword} className="text-[10px] font-black text-primary uppercase hover:underline tracking-widest">Forgot?</button>
                </div>
                <div className="relative">
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"} 
                    required 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-14 rounded-2xl bg-muted/50 border-2 border-transparent focus:border-primary/20 focus:bg-white transition-all text-base font-bold pr-12"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-900 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
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