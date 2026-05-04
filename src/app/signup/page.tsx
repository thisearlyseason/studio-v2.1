
"use client";

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { User, Baby, ArrowRight, Check, ShieldCheck, Trophy, ChevronLeft } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

export default function SignupPage() {
  const [step, setStep] = useState<'target' | 'account'>('target');
  const [regTarget, setRegTarget] = useState<'self' | 'child' | 'coach' | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side email format validation
    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      toast({ title: "Invalid Email", description: "Please enter a valid email address (e.g. name@example.com).", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: name });

      let role = 'adult_player';
      if (regTarget === 'child') role = 'parent';
      if (regTarget === 'coach') role = 'coach';
      
      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        fullName: name,
        email: cleanEmail,
        role: role,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://picsum.photos/seed/${user.uid}/150/150`,
        activePlanId: 'starter_squad',
        proTeamLimit: 0
      });

      if (regTarget === 'self') {
        // Create matching player record for adult players
        await setDoc(doc(db, 'players', `p_${user.uid}`), {
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' '),
          isMinor: false,
          userId: user.uid,
          hasLogin: true,
          createdAt: new Date().toISOString()
        });
      }

      toast({ title: "Account Created", description: "Welcome to The Squad Hub." });
      
      if (role === 'coach') {
        router.push('/teams/new');
      } else if (role === 'parent' && regTarget === 'child') {
        router.push('/family');
      } else {
        router.push('/teams/join');
      }
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        toast({ title: "Email Already in Use", description: "Email already in use. Please log in or select a new email.", variant: "destructive" });
      } else if (code === 'auth/invalid-email') {
        toast({ title: "Invalid Email", description: "Please enter a valid email address.", variant: "destructive" });
      } else if (code === 'auth/weak-password') {
        toast({ title: "Weak Password", description: "Password must be at least 6 characters.", variant: "destructive" });
      } else {
        toast({ title: "Signup Error", description: error.message || "An unexpected error occurred.", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Back Button */}
      <div className="absolute top-6 left-6 z-30">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest h-10 px-4 rounded-full border border-white/10 backdrop-blur-sm">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      <BrandLogo variant="dark-background" className="h-12 w-40 mb-8" />
      
      <Card className="w-full max-w-md rounded-[2.5rem] bg-white/95 backdrop-blur-md shadow-2xl border-none overflow-hidden">
        <div className="h-2 hero-gradient w-full" />
        
        {step === 'target' ? (
          <div className="p-10 space-y-8 animate-in fade-in duration-500">
            <div className="text-center space-y-2">
              <CardTitle className="text-3xl font-black uppercase tracking-tight">Who's Joining?</CardTitle>
              <CardDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Select registration type</CardDescription>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => setRegTarget('self')}
                className={cn(
                  "w-full p-6 rounded-3xl border-2 transition-all text-left flex items-center justify-between group",
                  regTarget === 'self' ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-muted bg-white hover:border-primary/20"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-2xl transition-colors", regTarget === 'self' ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    <User className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">Myself (18+)</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">I am the primary player</p>
                  </div>
                </div>
                {regTarget === 'self' && <Check className="h-5 w-5 text-primary" />}
              </button>

              <button 
                onClick={() => setRegTarget('child')}
                className={cn(
                  "w-full p-6 rounded-3xl border-2 transition-all text-left flex items-center justify-between group",
                  regTarget === 'child' ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-muted bg-white hover:border-primary/20"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-2xl transition-colors", regTarget === 'child' ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    <Baby className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">My Child / Children</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">I am a parent or guardian</p>
                  </div>
                </div>
                {regTarget === 'child' && <Check className="h-5 w-5 text-primary" />}
              </button>

              <button 
                onClick={() => setRegTarget('coach')}
                className={cn(
                  "w-full p-6 rounded-3xl border-2 transition-all text-left flex items-center justify-between group",
                  regTarget === 'coach' ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-muted bg-white hover:border-primary/20"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className={cn("p-3 rounded-2xl transition-colors", regTarget === 'coach' ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                    <Trophy className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight">Coach / Manager</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">I am launching a new squad</p>
                  </div>
                </div>
                {regTarget === 'coach' && <Check className="h-5 w-5 text-primary" />}
              </button>
            </div>

            <Button 
              className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl shadow-primary/20" 
              disabled={!regTarget}
              onClick={() => setStep('account')}
            >
              Next <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="p-10 space-y-6 animate-in slide-in-from-right-4 duration-500">
            <div className="text-center space-y-2">
              <CardTitle className="text-3xl font-black uppercase tracking-tight">Create Account</CardTitle>
              <p className="text-[10px] font-black uppercase text-primary tracking-widest bg-primary/5 py-1 px-3 rounded-full w-fit mx-auto border border-primary/10">
                {regTarget === 'child' ? 'Parent Hub' : regTarget === 'coach' ? 'Coach Hub' : 'Athlete Hub'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Full Legal Name</Label>
                <Input required value={name} onChange={e => setName(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none font-bold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Email Address</Label>
                <Input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none font-bold" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Password</Label>
                <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded-xl bg-muted/30 border-none font-bold" />
              </div>
            </div>

            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-[10px] font-medium leading-relaxed italic text-muted-foreground">
                By signing up, you verify that you are 18+ and authorized to manage registration data.
              </p>
            </div>

            <CardFooter className="flex flex-col gap-4 p-0">
              <Button type="submit" className="w-full h-14 rounded-2xl text-lg font-black uppercase shadow-xl" disabled={isLoading}>
                {isLoading ? "Enrolling..." : "Begin Coordination"}
              </Button>
              <button type="button" onClick={() => setStep('target')} className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary">Back to Selection</button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
