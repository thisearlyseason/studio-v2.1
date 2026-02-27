
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import { useTeam } from '@/components/providers/team-provider';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PlaceHolderImages } from '@/lib/placeholder-images';
import Image from 'next/image';

function SignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Player');
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState('');
  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { joinTeamWithCode } = useTeam();
  
  const inviteCode = searchParams.get('code');
  const brandLogoDark = PlaceHolderImages.find(img => img.id === 'brand-logo-dark')?.imageUrl || '';

  useEffect(() => {
    const sportsImages = PlaceHolderImages.filter(img => img.id.startsWith('sport-'));
    if (sportsImages.length > 0) {
      const randomIdx = Math.floor(Math.random() * sportsImages.length);
      setBackgroundImage(sportsImages[randomIdx].imageUrl);
    }
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });

      const avatarUrl = `https://picsum.photos/seed/${user.uid}/150/150`;
      const userDocData = {
        id: user.uid,
        fullName: name,
        email: email,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        avatarUrl: avatarUrl
      };
      
      await setDoc(doc(db, 'users', user.uid), userDocData);

      if (inviteCode) {
        const joined = await joinTeamWithCode(inviteCode, role);
        if (joined) {
          toast({ title: "Welcome to the Squad!", description: "You've successfully joined your team." });
        } else {
          toast({ title: "Account Created", description: "Your account is ready, but the team code was invalid.", variant: "destructive" });
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
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-6 relative overflow-hidden">
      {/* Dynamic Sports Background */}
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

      {/* Logo Header */}
      <div className="relative z-20 mb-8 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-1000">
        <div className="relative h-16 w-48">
          {brandLogoDark && (
            <Image 
              src={brandLogoDark} 
              alt="The Squad Brand" 
              fill 
              className="object-contain drop-shadow-2xl brightness-0 invert"
              data-ai-hint="brand logo"
            />
          )}
        </div>
      </div>
      
      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 bg-white/95 backdrop-blur-sm">
        <CardHeader className="space-y-2 pt-10 text-center">
          <CardTitle className="text-4xl font-black tracking-tighter">Join The Squad</CardTitle>
          <CardDescription className="text-base font-medium">
            {inviteCode ? `You've been invited to join your team!` : 'Create an account to coordinate your next win.'}
          </CardDescription>
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
              <div className="space-y-4 pt-2">
                <div className="bg-primary/5 p-3 rounded-2xl border border-primary/10 flex items-center justify-between">
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest ml-1">Joining with Code</span>
                  <Badge variant="secondary" className="font-mono bg-white border-primary/20 text-primary">{inviteCode}</Badge>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-bold text-xs uppercase tracking-widest px-1">Joining as</Label>
                  <Suspense fallback={<Loader2 className="h-4 w-4 animate-spin" />}>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger className="h-12 rounded-2xl bg-muted/50 border-none focus:ring-primary/30">
                        <SelectValue placeholder="Select your role..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Player">Teammate / Player</SelectItem>
                        <SelectItem value="Parent">Parent / Guardian</SelectItem>
                      </SelectContent>
                    </Select>
                  </Suspense>
                </div>
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

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-bold text-white/70 uppercase tracking-widest">Loading Enrollment...</p>
        </div>
      </div>
    }>
      <SignupForm />
    </Suspense>
  );
}
