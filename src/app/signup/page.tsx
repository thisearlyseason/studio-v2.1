
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useTeam } from '@/components/providers/team-provider';
import { ShieldCheck } from 'lucide-react';

export default function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { joinTeamWithCode } = useTeam();
  
  const inviteCode = searchParams.get('code');

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      // Create user document in Firestore
      const userDocData = {
        id: user.uid,
        fullName: name,
        email: email,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://picsum.photos/seed/${user.uid}/150/150`
      };
      
      await setDoc(doc(db, 'users', user.uid), userDocData);

      // If an invite code was present, join the team
      if (inviteCode) {
        const joined = await joinTeamWithCode(inviteCode);
        if (joined) {
          toast({ title: "Welcome to the Squad!", description: "You've successfully joined your team." });
        } else {
          toast({ title: "Account Created", description: "Your account is ready, but the team code was invalid." });
        }
      }

      router.push('/feed');
    } catch (error: any) {
      toast({
        title: "Account Creation Failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6 relative overflow-hidden">
      <div className="absolute top-0 -left-20 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse delay-700" />
      
      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <CardHeader className="space-y-4 pt-10 text-center">
          <div className="mx-auto w-16 h-16 hero-gradient rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20 mb-2 rotate-3">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-4xl font-black tracking-tighter">Join The Squad</CardTitle>
            <CardDescription className="text-base font-medium">
              {inviteCode ? `You've been invited to join your team!` : 'Create an account to coordinate your next win.'}
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-5 px-8">
            <div className="space-y-1">
              <Label htmlFor="name" className="font-bold text-xs uppercase tracking-widest px-1">Full Name</Label>
              <Input 
                id="name" 
                placeholder="John Doe" 
                required 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-12 rounded-2xl bg-muted/50 border-none focus-visible:ring-primary/30 text-base"
              />
            </div>
            <div className="space-y-1">
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
            <div className="space-y-1">
              <Label htmlFor="password" className="font-bold text-xs uppercase tracking-widest px-1">Password</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••"
                required 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-2xl bg-muted/50 border-none focus-visible:ring-primary/30 text-base"
              />
            </div>
            {inviteCode && (
              <div className="bg-primary/5 p-3 rounded-2xl border border-primary/10 flex items-center justify-between">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Joining with Code</span>
                <Badge variant="secondary" className="font-mono bg-white border-primary/20 text-primary">{inviteCode}</Badge>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-6 pb-12 px-8 pt-4">
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={isLoading}>
              {isLoading ? "Enrolling..." : "Create Account"}
            </Button>
            <p className="text-sm font-bold text-center text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-black">
                Log In
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
