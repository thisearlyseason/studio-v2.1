
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { ShieldCheck } from 'lucide-react';
import { PlaceHolderImages } from '@/lib/placeholder-images';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState('');
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Select a random sports image from the library
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
      router.push('/feed');
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-6 relative overflow-hidden">
      {/* Dynamic Sports Background */}
      {backgroundImage && (
        <>
          <img 
            src={backgroundImage} 
            alt="Sports Background" 
            className="absolute inset-0 w-full h-full object-cover opacity-60 animate-in fade-in duration-1000"
            data-ai-hint="sports background"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />
        </>
      )}
      
      {/* Logo Header */}
      <div className="relative z-20 mb-8 flex flex-col items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-1000">
        <div className="w-16 h-16 hero-gradient rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/40 rotate-3 border-2 border-white/20">
          <ShieldCheck className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tighter drop-shadow-md">THE SQUAD</h1>
      </div>

      <Card className="w-full max-w-md border-none shadow-2xl rounded-[2.5rem] relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700 bg-white/95 backdrop-blur-sm">
        <CardHeader className="space-y-2 pt-10 text-center">
          <CardTitle className="text-4xl font-black tracking-tighter">Welcome Back</CardTitle>
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
            <Button className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" type="submit" disabled={isLoading}>
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
    </div>
  );
}
