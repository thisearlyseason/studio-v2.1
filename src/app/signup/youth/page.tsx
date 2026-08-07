"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { establishSession } from '@/lib/client-session';
import BrandLogo from '@/components/BrandLogo';
import {
  Baby,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';

// ── Inner component that reads searchParams ──
function YouthSignupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get('token');
  const [invite, setInvite] = useState<any>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // ── 1. Load and validate the invite token ──
  useEffect(() => {
    if (!token) {
      setInviteError('No invitation token found. Please use the link sent to your email.');
      setIsLoadingInvite(false);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/invites/youth?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Invitation unavailable.');
        setInvite(payload.invite);
        setInviteError(null);
      })
      .catch(error => {
        if (error.name !== 'AbortError') {
          setInviteError('This invitation is invalid, expired, or has already been used.');
        }
      })
      .finally(() => setIsLoadingInvite(false));
    return () => controller.abort();
  }, [token]);

  // ── 2. Handle account creation ──
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite || !token) return;

    if (password.length < 8) {
      toast({ title: 'Password too short', description: 'Must be at least 8 characters.', variant: 'destructive' });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/invites/youth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to create account.');
      setInvite((current: any) => ({
        ...current,
        childFirstName: payload.childFirstName || current?.childFirstName,
      }));
      setIsDone(true);
    } catch (error: any) {
      toast({ title: 'Account Creation Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Loading state ──
  if (isLoadingInvite) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-white/60 font-black uppercase text-[10px] tracking-widest">Verifying Invitation...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (inviteError) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full rounded-[3rem] bg-white border-none shadow-2xl p-12 text-center space-y-6">
          <div className="h-2 bg-destructive w-full -mt-12 -mx-12 w-[calc(100%+6rem)] rounded-t-[3rem]" />
          <AlertCircle className="h-16 w-16 text-destructive mx-auto opacity-50" />
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight">Invitation Error</h2>
            <p className="text-muted-foreground font-medium mt-2 leading-relaxed">{inviteError}</p>
          </div>
          <Button className="w-full h-14 rounded-2xl font-black uppercase" onClick={() => router.push('/login')}>
            Back to Login
          </Button>
        </Card>
      </div>
    );
  }

  // ── Success state ──
  if (isDone) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full rounded-[3rem] bg-white border-none shadow-2xl p-0 text-center overflow-hidden">
          <div className="h-2 bg-primary w-full" />
          <div className="p-12 space-y-6">
            <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tight">Account Created!</h2>
              <p className="text-muted-foreground font-bold uppercase text-[10px] tracking-widest mt-2">
                Welcome, {invite?.childFirstName}
              </p>
            </div>
            <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 text-left space-y-2">
              <p className="text-[10px] font-black uppercase text-primary">What's Next</p>
              <p className="text-sm font-medium leading-relaxed text-foreground/80">
                Your account is linked to your parent's household. You can now log in to view your schedule, team documents, and athlete profile.
              </p>
            </div>
            <Button className="w-full h-14 rounded-2xl font-black uppercase text-lg shadow-xl shadow-primary/20" onClick={() => router.push('/login')}>
              Go to Login
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ── Main form ──
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-black/80 pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="text-center">
          <BrandLogo variant="dark-background" className="h-10 w-40 mx-auto mb-6" />
          <Badge className="bg-primary/20 text-primary border-none font-black uppercase tracking-widest text-[10px] px-4 h-7">
            Youth Athlete Portal
          </Badge>
        </div>

        <Card className="rounded-[3rem] bg-white border-none shadow-2xl overflow-hidden">
          <div className="h-2 bg-primary w-full" />
          <div className="p-10 space-y-8">
            {/* Athlete identity confirm */}
            <div className="bg-black text-white p-6 rounded-2xl space-y-3 relative overflow-hidden">
              <div className="absolute right-4 bottom-2 opacity-10"><Baby className="h-20 w-20" /></div>
              <div className="relative z-10">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Invitation for</p>
                <h2 className="text-2xl font-black uppercase tracking-tight">
                  {invite?.childFirstName} {invite?.childLastName}
                </h2>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest mt-1">
                  {invite?.email}
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-6">
              <div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Create Your Password</h3>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                  Set a secure password for your athlete account
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Password</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="h-14 rounded-2xl border-2 font-bold pr-12 bg-muted/10"
                      placeholder="Min. 8 characters"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Confirm Password</Label>
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="h-14 rounded-2xl border-2 font-bold bg-muted/10"
                    placeholder="Re-enter password"
                  />
                </div>
              </div>

              {/* Password strength hint */}
              {password && (
                <div className="flex gap-1.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        password.length >= [4, 6, 8, 12][i]
                          ? i < 2 ? 'bg-destructive' : i === 2 ? 'bg-amber-400' : 'bg-green-500'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
                  Your account is linked to your parent's household. They can view your schedule but cannot change your password.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full h-16 rounded-2xl text-lg font-black shadow-2xl shadow-primary/20 active:scale-[0.98] transition-all"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <><Key className="h-5 w-5 mr-2" /> Activate My Account</>
                )}
              </Button>
            </form>
          </div>
        </Card>

        <p className="text-center text-[9px] font-black uppercase text-white/20 tracking-widest">
          Secured by SquadForge Youth Infrastructure
        </p>
      </div>
    </div>
  );
}

export default function YouthSignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    }>
      <YouthSignupContent />
    </Suspense>
  );
}
