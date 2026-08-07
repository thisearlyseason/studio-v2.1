
"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CardFooter, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { toast } from '@/hooks/use-toast';
import {
  User, Baby, ArrowRight, Check, ShieldCheck, Trophy, ChevronLeft,
  GraduationCap, Medal, Sparkles, Hash, Zap, Clock, Star
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { PRICING_CONFIG } from '@/lib/pricing';
import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';
import { establishSession } from '@/lib/client-session';

type RegTarget = 'self' | 'child' | 'coach' | 'league_creator' | 'school_ad' | null;
type PlanChoice = 'starter' | 'pro_team' | 'elite_teams' | 'elite_league' | 'school' | null;
type SignupStep = 'target' | 'plan' | 'join_team' | 'account';
type BillingCycle = 'monthly' | 'annual';

const SIGNUP_OPTIONS: { id: RegTarget; icon: any; label: string; desc: string; badge: string }[] = [
  {
    id: 'self',
    icon: User,
    label: 'Player / Athlete',
    desc: 'I am the player — join or get recruited',
    badge: 'Athlete Hub',
  },
  {
    id: 'child',
    icon: Baby,
    label: 'Parent / Guardian',
    desc: "I manage my child's sports profile",
    badge: 'Parent Hub',
  },
  {
    id: 'coach',
    icon: Trophy,
    label: 'Coach / Team Manager',
    desc: 'I create and run a team',
    badge: 'Coach Hub',
  },
  {
    id: 'school_ad',
    icon: GraduationCap,
    label: 'School / Athletic Director',
    desc: 'I manage a school athletic program',
    badge: 'School Hub',
  },
  {
    id: 'league_creator',
    icon: Medal,
    label: 'League Organizer',
    desc: 'I create and run leagues across teams',
    badge: 'League Hub',
  },
];

// Plan definitions keyed by plan choice ID
const PLAN_DEFS: Record<string, {
  id: string; label: string;
  monthlyPrice: string; annualPrice: string;
  monthlyPriceId: string; annualPriceId: string;
  desc: string;
  features: string[];
  highlight?: boolean; trial?: boolean; teamLimit: number;
  savingsLabel?: string;
}> = {
  starter: {
    id: 'starter', label: 'Starter',
    monthlyPrice: 'Free', annualPrice: 'Free',
    monthlyPriceId: '', annualPriceId: '',
    desc: 'Core coordination tools, no commitment',
    features: ['1 Team Hub', 'Scheduling & Chats', 'Score Tracking'],
    teamLimit: PLAN_TEAM_LIMITS.free,
  },
  pro_team: {
    id: 'pro_team', label: 'Pro Team',
    monthlyPrice: '$19.99/mo', annualPrice: '$199/yr',
    monthlyPriceId: PRICING_CONFIG.find(p => p.id === 'team')?.monthlyPriceId || '',
    annualPriceId:  PRICING_CONFIG.find(p => p.id === 'team')?.annualPriceId  || '',
    desc: 'Championship tools for one competitive team',
    features: ['1 Pro Team Hub', 'Unlimited Athletes', 'Digital Waivers & Payments', 'Advanced Analytics'],
    highlight: true, trial: true, teamLimit: PLAN_TEAM_LIMITS.team, savingsLabel: 'Save ~17%',
  },
  elite_teams: {
    id: 'elite_teams', label: 'Elite Teams',
    monthlyPrice: '$119/mo', annualPrice: '$1,119/yr',
    monthlyPriceId: PRICING_CONFIG.find(p => p.id === 'elite')?.monthlyPriceId || '',
    annualPriceId:  PRICING_CONFIG.find(p => p.id === 'elite')?.annualPriceId  || '',
    desc: 'Multi-squad management for growing clubs',
    features: ['Up to 8 Pro Team Hubs', 'Master Club Dashboard', 'Staff Role Management', 'League & Tournament Architect'],
    highlight: true, trial: true, teamLimit: PLAN_TEAM_LIMITS.elite, savingsLabel: 'Save ~22%',
  },
  elite_league: {
    id: 'elite_league', label: 'Elite League',
    monthlyPrice: '$279/mo', annualPrice: '$2,790/yr',
    monthlyPriceId: PRICING_CONFIG.find(p => p.id === 'league')?.monthlyPriceId || '',
    annualPriceId:  PRICING_CONFIG.find(p => p.id === 'league')?.annualPriceId  || '',
    desc: 'Institutional scale for series and leagues',
    features: ['Up to 18 Pro Team Hubs', 'League Series Architect', 'Global Tournament Hosting', 'Advanced Standings & Reporting'],
    trial: true, teamLimit: PLAN_TEAM_LIMITS.league, savingsLabel: 'Save ~17%',
  },
  school: {
    id: 'school', label: 'Schools Plan',
    monthlyPrice: '$175/mo', annualPrice: '$1,750/yr',
    monthlyPriceId: PRICING_CONFIG.find(p => p.id === 'school')?.monthlyPriceId || '',
    annualPriceId:  PRICING_CONFIG.find(p => p.id === 'school')?.annualPriceId  || '',
    desc: '15 squads included · add more anytime at the lowest per-squad rate on the platform',
    features: ['15 Pro Squad Hubs Included', 'Athletic Director Dashboard', 'Academic Eligibility Sync', 'Extra squads at school-exclusive discount'],
    highlight: true, trial: true, teamLimit: PLAN_TEAM_LIMITS.school, savingsLabel: 'Save ~17%',
  },
};

// Which plan options appear per role
const ROLE_PLANS: Record<string, PlanChoice[]> = {
  coach:          ['starter', 'pro_team'],
  school_ad:      ['school'],
  league_creator: ['starter', 'elite_teams', 'elite_league'],
};

export default function SignupPage() {
  const [step, setStep] = useState<SignupStep>('target');
  const [regTarget, setRegTarget] = useState<RegTarget>(null);
  const [planChoice, setPlanChoice] = useState<PlanChoice>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [joinCode, setJoinCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const auth = useAuth();
  const db = useFirestore();
  const router = useRouter();

  const selectedOption = SIGNUP_OPTIONS.find(o => o.id === regTarget);
  const rolePlans = regTarget ? ROLE_PLANS[regTarget as string] ?? [] : [];
  const isPlanRequired = rolePlans.length > 0;

  const handleTargetContinue = () => {
    if (!regTarget) return;
    if (regTarget === 'self' || regTarget === 'child') {
      setStep('join_team');
    } else {
      // Auto-select single-option plans (school_ad)
      if (rolePlans.length === 1) setPlanChoice(rolePlans[0]);
      setStep('plan');
    }
  };

  const handlePlanContinue = () => {
    if (!planChoice) return;
    setStep('account');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

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

      const roleMap: Record<string, string> = {
        self: 'adult_player',
        child: 'parent',
        coach: 'coach',
        school_ad: 'admin',
        league_creator: 'league_creator',
      };
      const role = roleMap[regTarget as string] || 'adult_player';

      await setDoc(doc(db, 'users', user.uid), {
        id: user.uid,
        fullName: name,
        email: cleanEmail,
        role,
        notificationsEnabled: true,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://picsum.photos/seed/${user.uid}/150/150`,
        activePlanId: 'starter_squad',
        proTeamLimit: 0,
      });
      await establishSession(user);

      // Adult player: create matching player record
      if (regTarget === 'self') {
        await setDoc(doc(db, 'players', `p_${user.uid}`), {
          firstName: name.split(' ')[0],
          lastName: name.split(' ').slice(1).join(' '),
          isMinor: false,
          userId: user.uid,
          hasLogin: true,
          createdAt: new Date().toISOString(),
        });
      }

      toast({ title: "Account Created!", description: `Welcome to The Squad Hub.` });

      // === PAID PLAN: redirect to Stripe Checkout with 5-day trial ===
      const isPaid = planChoice && planChoice !== 'starter';
      if (isPaid) {
        const planDef = PLAN_DEFS[planChoice as string];
        const resolvedPriceId = billingCycle === 'annual'
          ? planDef?.annualPriceId
          : planDef?.monthlyPriceId;
        if (!resolvedPriceId) {
          // Fallback: go to pricing if price ID missing
          toast({ title: 'Plan Setup Issue', description: 'Please complete your upgrade from the pricing page.', variant: 'destructive' });
          router.push('/pricing');
          return;
        }
        try {
          const token = await getAuthToken(auth);
          const res = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token) },
            body: JSON.stringify({
              priceId: resolvedPriceId,
              userId: user.uid,
              billingCycle,
              trialDays: 5,
              newUser: true,
            }),
          });
          const data = await res.json();
          if (data.url) {
            window.location.href = data.url;
            return;
          }
          throw new Error(data.error || 'Checkout initiation failed');
        } catch (checkoutErr: any) {
          toast({ title: 'Payment Redirect Failed', description: 'Account created. Please upgrade from the pricing page.', variant: 'destructive' });
          router.push('/pricing');
          return;
        }
      }

      // === FREE / PLAYER / PARENT path ===
      // Apply join code if entered
      if (joinCode.trim() && (role === 'adult_player' || role === 'parent')) {
        try {
          const effectivePlayerId = `p_${user.uid}`;
          await fetch('/api/teams/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: joinCode.trim().toUpperCase(), playerId: effectivePlayerId, role: 'Player' }),
          });
        } catch (_) {
          // Non-critical — user can join from dashboard
        }
      }

      // Role-based redirect
      if (joinCode.trim() && (role === 'adult_player' || role === 'parent')) {
        router.push('/feed');
      } else if (role === 'coach' || role === 'admin') {
        router.push('/teams/new');
      } else if (role === 'parent') {
        router.push('/family');
      } else if (role === 'league_creator') {
        router.push('/competition');
      } else {
        router.push('/teams/join');
      }
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') {
        toast({ title: "Email Already in Use", description: "Please log in or use a different email.", variant: "destructive" });
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

  // ── Step labels for the breadcrumb ──
  const stepLabels: Record<SignupStep, string> = {
    target: 'Role',
    plan: 'Plan',
    join_team: 'Join Team',
    account: 'Account',
  };

  const activeSteps: SignupStep[] = (() => {
    if (regTarget === 'self' || regTarget === 'child') return ['target', 'join_team', 'account'];
    if (isPlanRequired) return ['target', 'plan', 'account'];
    return ['target', 'account'];
  })();

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-start lg:justify-center p-6 relative overflow-y-auto overflow-x-hidden">
      {/* Ambient gradient orbs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-primary/5 blur-[100px]" />
      </div>

      {/* Back Button */}
      <div className="relative z-30 w-full max-w-md flex items-start mb-4">
        <Link href="/">
          <Button variant="ghost" className="text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-widest h-10 px-4 rounded-full border border-white/10 backdrop-blur-sm">
            <ChevronLeft className="mr-2 h-4 w-4" /> Back to Home
          </Button>
        </Link>
      </div>

      <BrandLogo variant="dark-background" className="h-12 w-40 mb-8 relative z-10" />

      {/* Step breadcrumb */}
      <div className="relative z-10 flex items-center gap-2 mb-6">
        {activeSteps.map((s, i) => (
          <React.Fragment key={s}>
            <span className={cn(
              'text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full transition-all',
              step === s
                ? 'bg-primary text-black'
                : activeSteps.indexOf(step) > i
                  ? 'bg-white/20 text-white/80'
                  : 'bg-white/5 text-white/30'
            )}>
              {stepLabels[s]}
            </span>
            {i < activeSteps.length - 1 && (
              <div className="w-4 h-px bg-white/20" />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="rounded-[2.5rem] bg-white/95 backdrop-blur-md shadow-2xl overflow-hidden">
          {/* Brand accent bar */}
          <div className="h-1.5 hero-gradient w-full" />

          {/* ── STEP 1: WHO'S JOINING ── */}
          {step === 'target' && (
            <div className="p-8 space-y-6 animate-in fade-in duration-500">
              <div className="text-center space-y-1.5">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Who&apos;s Joining?</CardTitle>
                <CardDescription className="text-[11px] font-semibold text-muted-foreground">
                  Choose your role — you can always update this later
                </CardDescription>
              </div>

              <div className="space-y-2.5">
                {SIGNUP_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = regTarget === opt.id;
                  return (
                    <button
                      key={opt.id as string}
                      onClick={() => setRegTarget(opt.id)}
                      className={cn(
                        "w-full p-4 rounded-2xl border-2 transition-all text-left flex items-center justify-between group",
                        isSelected
                          ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                          : "border-muted bg-white hover:border-primary/30 hover:bg-primary/[0.02]"
                      )}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className={cn(
                          "p-2.5 rounded-xl transition-colors shrink-0",
                          isSelected
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-black text-sm uppercase tracking-tight leading-none mb-0.5">{opt.label}</p>
                          <p className="text-[10px] font-semibold text-muted-foreground leading-none">{opt.desc}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-white stroke-[3px]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button
                className="w-full h-12 rounded-2xl text-sm font-black uppercase shadow-xl shadow-primary/20"
                disabled={!regTarget}
                onClick={handleTargetContinue}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <p className="text-center text-[10px] font-semibold text-muted-foreground">
                Already have an account?{' '}
                <Link href="/login" className="text-primary font-black hover:underline">Log In</Link>
              </p>
            </div>
          )}

          {/* ── STEP 2a: JOIN TEAM (Parent / Player) ── */}
          {step === 'join_team' && (
            <div className="p-8 space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Join a Team</CardTitle>
                <CardDescription className="text-[11px] font-semibold text-muted-foreground">
                  Enter your team code to get connected right away — or skip to join later
                </CardDescription>
                {selectedOption && (
                  <span className="inline-block text-[10px] font-black uppercase text-primary tracking-widest bg-primary/8 py-1 px-3 rounded-full border border-primary/15">
                    {selectedOption.badge}
                  </span>
                )}
              </div>

              <div className="bg-primary/5 border-2 border-primary/15 rounded-2xl p-5 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="bg-primary p-2 rounded-lg text-white shrink-0">
                    <Hash className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-black text-sm uppercase tracking-tight leading-none">Squad Code</p>
                    <p className="text-[10px] font-medium text-muted-foreground">Provided by your team coach or manager</p>
                  </div>
                </div>
                <Input
                  placeholder="8–20 CHAR CODE"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={20}
                  className="h-12 text-xl font-black tracking-widest rounded-xl border-2 border-primary/20 bg-white text-center uppercase"
                />
              </div>

              <div className="space-y-2.5">
                <Button
                  className="w-full h-12 rounded-2xl text-sm font-black uppercase shadow-xl shadow-primary/20"
                  onClick={() => setStep('account')}
                >
                  {joinCode.trim() ? 'Continue with Team Code' : 'Continue'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {joinCode.trim() === '' && (
                  <button
                    type="button"
                    onClick={() => setStep('account')}
                    className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors py-1"
                  >
                    Skip — I'll join a team later
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStep('target')}
                className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                ← Change Account Type
              </button>
            </div>
          )}

          {/* ── STEP 2b: PLAN SELECTION (Coach / School / League) ── */}
          {step === 'plan' && (
            <div className="p-8 space-y-6 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Choose Your Plan</CardTitle>
                {selectedOption && (
                  <span className="inline-block text-[10px] font-black uppercase text-primary tracking-widest bg-primary/8 py-1 px-3 rounded-full border border-primary/15">
                    {selectedOption.badge}
                  </span>
                )}
                {/* Trial badge for paid roles */}
                {(regTarget === 'coach' || regTarget === 'school_ad' || regTarget === 'league_creator') && (
                  <div className="flex items-center justify-center gap-1.5 bg-green-50 border border-green-200 rounded-full py-1.5 px-3 w-fit mx-auto">
                    <Clock className="h-3 w-3 text-green-600" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-green-700">5-Day Free Trial on All Paid Plans</span>
                  </div>
                )}
              </div>

              {/* ── Billing Cycle Toggle ── */}
              {rolePlans.some(p => p !== 'starter') && (
                <div className="flex items-center justify-center">
                  <div className="relative flex items-center bg-muted rounded-2xl p-1 gap-0">
                    <button
                      type="button"
                      onClick={() => setBillingCycle('monthly')}
                      className={cn(
                        'relative z-10 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200',
                        billingCycle === 'monthly'
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBillingCycle('annual')}
                      className={cn(
                        'relative z-10 px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-1.5',
                        billingCycle === 'annual'
                          ? 'bg-white text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      Annual
                      <span className={cn(
                        'text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full transition-all',
                        billingCycle === 'annual'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-green-50 text-green-600'
                      )}>
                        Save up to 22%
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {rolePlans.map((planId) => {
                  const plan = PLAN_DEFS[planId as string];
                  if (!plan) return null;
                  const isSelected = planChoice === planId;
                  const displayPrice = plan.id === 'starter'
                    ? 'Free'
                    : billingCycle === 'annual'
                      ? plan.annualPrice
                      : plan.monthlyPrice;
                  const altPrice = plan.id === 'starter'
                    ? null
                    : billingCycle === 'annual'
                      ? `or ${plan.monthlyPrice}`
                      : `or ${plan.annualPrice} annually`;
                  return (
                    <button
                      key={plan.id}
                      onClick={() => setPlanChoice(planId)}
                      className={cn(
                        "w-full p-4 rounded-2xl border-2 transition-all text-left group relative overflow-hidden",
                        isSelected
                          ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                          : plan.highlight
                            ? "border-primary/30 bg-white hover:border-primary/60 hover:bg-primary/[0.02]"
                            : "border-muted bg-white hover:border-primary/30 hover:bg-primary/[0.02]"
                      )}
                    >
                      {plan.highlight && !isSelected && (
                        <div className="absolute top-2 right-2">
                          <span className="text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                            {regTarget === 'league_creator' && plan.id === 'elite_teams' ? 'Popular' : 'Recommended'}
                          </span>
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-black text-sm uppercase tracking-tight">{plan.label}</p>
                            {plan.trial && (
                              <span className="text-[8px] font-black uppercase tracking-widest text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" /> 5-day trial
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-2 leading-snug">{plan.desc}</p>
                          <div className="flex items-baseline gap-1.5 mb-2 flex-wrap">
                            <span className={cn("text-xl font-black tracking-tight", plan.id === 'starter' ? 'text-foreground' : 'text-primary')}>
                              {displayPrice}
                            </span>
                            {altPrice && (
                              <span className="text-[9px] font-semibold text-muted-foreground">{altPrice}</span>
                            )}
                            {billingCycle === 'annual' && plan.id !== 'starter' && plan.savingsLabel && (
                              <span className="text-[8px] font-black uppercase tracking-widest bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                {plan.savingsLabel}
                              </span>
                            )}
                          </div>
                          <ul className="space-y-0.5">
                            {plan.features.slice(0, 3).map((f, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-[9px] font-bold text-muted-foreground uppercase">
                                <Check className="h-2.5 w-2.5 text-primary shrink-0" /> {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className={cn(
                          "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                          isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                        )}>
                          {isSelected && <Check className="h-3 w-3 text-white stroke-[3px]" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* School AD: always goes to payment — show clear CTA */}
              {regTarget === 'school_ad' && planChoice && (
                <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-2xl p-4">
                  <ShieldCheck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-medium leading-relaxed text-blue-800">
                    You&apos;ll create your account first, then complete payment via Stripe&apos;s secure checkout. Your 5-day trial starts immediately — no charge until day 6.
                  </p>
                </div>
              )}

              <Button
                className="w-full h-12 rounded-2xl text-sm font-black uppercase shadow-xl shadow-primary/20"
                disabled={!planChoice}
                onClick={handlePlanContinue}
              >
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </Button>

              <button
                type="button"
                onClick={() => { setStep('target'); setPlanChoice(null); }}
                className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
              >
                ← Change Account Type
              </button>
            </div>
          )}

          {/* ── STEP 3: CREATE ACCOUNT ── */}
          {step === 'account' && (
            <form onSubmit={handleSignup} className="p-8 space-y-5 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">Create Account</CardTitle>
                {selectedOption && (
                  <span className="inline-block text-[10px] font-black uppercase text-primary tracking-widest bg-primary/8 py-1 px-3 rounded-full border border-primary/15">
                    {selectedOption.badge}
                  </span>
                )}
                {/* Chosen plan summary pill */}
                {planChoice && planChoice !== 'starter' && (
                  <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-black text-white rounded-full py-1.5 px-3">
                      <Zap className="h-3 w-3 text-primary" />
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        {PLAN_DEFS[planChoice]?.label}
                      </span>
                      <span className="text-[8px] text-white/50 uppercase">
                        · {billingCycle === 'annual' ? PLAN_DEFS[planChoice]?.annualPrice : PLAN_DEFS[planChoice]?.monthlyPrice}
                      </span>
                      <span className="text-[8px] text-primary/70 uppercase font-black">
                        {billingCycle === 'annual' ? '· Annual' : '· Monthly'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-full py-1 px-2">
                      <Clock className="h-2.5 w-2.5 text-green-600" />
                      <span className="text-[8px] font-black uppercase text-green-700">5-day free trial</span>
                    </div>
                  </div>
                )}
                {joinCode.trim() && (
                  <div className="flex items-center justify-center gap-1.5 bg-primary/5 border border-primary/20 rounded-full py-1 px-3 w-fit mx-auto">
                    <Hash className="h-3 w-3 text-primary" />
                    <span className="text-[9px] font-black uppercase text-primary tracking-wider">{joinCode}</span>
                  </div>
                )}
              </div>

              <div className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Full Name</Label>
                  <Input
                    required
                    placeholder="John Smith"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="h-12 rounded-xl bg-muted/30 border-muted font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Email Address</Label>
                  <Input
                    required
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="h-12 rounded-xl bg-muted/30 border-muted font-semibold"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-muted-foreground">Password</Label>
                  <Input
                    required
                    type="password"
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="h-12 rounded-xl bg-muted/30 border-muted font-semibold"
                  />
                </div>
              </div>

              <div className="bg-muted/40 p-3.5 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] font-medium leading-relaxed text-muted-foreground">
                  {planChoice && planChoice !== 'starter'
                    ? "Your account will be created, then you'll be taken to Stripe's secure checkout. Card details are collected upfront but you won't be charged for 5 days."
                    : "By creating an account you confirm you are 18+ and authorized to manage registration data for your organization."
                  }
                </p>
              </div>

              <CardFooter className="flex flex-col gap-3 p-0">
                <Button
                  type="submit"
                  className="w-full h-12 rounded-2xl font-black uppercase shadow-xl"
                  disabled={isLoading}
                >
                  {isLoading
                    ? "Creating Account..."
                    : planChoice && planChoice !== 'starter'
                      ? "Create Account & Continue to Payment"
                      : "Create Account"
                  }
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    if (regTarget === 'self' || regTarget === 'child') {
                      setStep('join_team');
                    } else {
                      setStep('plan');
                    }
                  }}
                  className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                >
                  ← {regTarget === 'self' || regTarget === 'child' ? 'Back to Join Team' : 'Change Plan'}
                </button>
              </CardFooter>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
