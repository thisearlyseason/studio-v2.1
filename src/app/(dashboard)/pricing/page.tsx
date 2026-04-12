"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/components/providers/team-provider';
import { useUser } from '@/firebase';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG, Plan, BillingCycle } from '@/lib/pricing';
import { 
  Check, 
  ChevronRight, 
  Sparkles, 
  Plus, 
  Minus, 
  Zap, 
  Trophy, 
  ShieldCheck, 
  Building2,
  Loader2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function PricingPage() {
  const router = useRouter();
  const { user } = useUser();
  const { isPro, user: userProfile } = useTeam();
  
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [extraTeams, setExtraTeams] = useState(0);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const handleExtraTeamsChange = (delta: number) => {
    setExtraTeams(prev => Math.max(0, prev + delta));
  };

  const handleCheckout = async (plan: Plan) => {
    if (!user?.uid) {
      toast({ title: "Authentication Required", description: "Please log in to subscribe.", variant: "destructive" });
      router.push('/login');
      return;
    }

    setLoadingPlanId(plan.id);
    const priceId = billingCycle === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;

    try {
      // If user is already pro, they should use the customer portal to manage their subscription
      if (isPro && (userProfile as any)?.stripe_customer_id) {
         const res = await fetch('/api/stripe/customer-portal', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ userId: user.uid }),
         });
         const data = await res.json();
         if (data.url) {
           window.location.href = data.url;
           return;
         }
      }

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          userId: user.uid,
          billingCycle,
          extraTeams
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to initiate checkout');
      }
    } catch (err: any) {
      toast({ title: "Checkout Error", description: err.message, variant: "destructive" });
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Hero Section */}
      <div className="relative overflow-hidden pt-16 pb-12 lg:pt-24 lg:pb-20 border-b bg-white">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-[0.03] pointer-events-none">
          <div className="absolute inset-0 hero-gradient" />
        </div>
        
        <div className="max-w-7xl mx-auto px-6 relative text-center space-y-6">
          <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-[0.2em] animate-in fade-in slide-in-from-bottom-4 duration-700">
            System Infrastructure
          </Badge>
          <h1 className="text-5xl lg:text-7xl font-black tracking-tighter leading-[0.9] animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-100">
            DEPLOY YOUR <span className="text-primary italic">SQUAD HUB.</span>
          </h1>
          <p className="max-w-2xl mx-auto text-muted-foreground font-medium text-lg leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            Secure, institutional-grade management infrastructure. Scaling from grassroots squads to national premier leagues.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 pt-8 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
            <span className={cn("text-sm font-black uppercase tracking-widest transition-opacity", billingCycle === 'annual' ? 'opacity-40' : 'opacity-100')}>Monthly</span>
            <button 
              onClick={() => setBillingCycle(prev => prev === 'monthly' ? 'annual' : 'monthly')}
              className="w-14 h-7 bg-muted rounded-full p-1 relative transition-colors hover:bg-muted/80"
            >
              <div className={cn("w-5 h-5 bg-primary rounded-full transition-transform duration-300 shadow-sm", billingCycle === 'annual' ? 'translate-x-7' : 'translate-x-0')} />
            </button>
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-black uppercase tracking-widest transition-opacity", billingCycle === 'monthly' ? 'opacity-40' : 'opacity-100')}>Annual</span>
              <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] px-2 h-5">SAVE 20%</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="max-w-7xl mx-auto px-6 -mt-12 relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {PRICING_CONFIG.map((plan) => (
          <Card 
            key={plan.id} 
            className={cn(
              "rounded-[2.5rem] overflow-hidden border-2 transition-all duration-300 flex flex-col group",
              plan.highlight 
                ? "border-primary bg-black text-white shadow-2xl shadow-primary/20 scale-[1.02]" 
                : "border-border/40 bg-white hover:border-primary/40"
            )}
          >
            <div className={cn("h-1.5 w-full", plan.highlight ? "bg-primary" : "bg-muted/20")} />
            
            <CardHeader className="p-8 pb-4">
              <div className="flex justify-between items-start mb-4">
                <CardTitle className="text-2xl font-black uppercase tracking-tight">{plan.name}</CardTitle>
                {plan.highlight && <Sparkles className="h-5 w-5 text-primary animate-pulse" />}
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={cn("text-4xl font-black tracking-tighter", plan.highlight ? "text-primary" : "text-foreground")}>
                  {billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice}
                </span>
                <span className="text-[10px] font-black uppercase opacity-60">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
              </div>
              <CardDescription className={cn("text-xs font-bold font-mono tracking-tight", plan.highlight ? "text-white/60" : "text-muted-foreground")}>
                {plan.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="p-8 pt-0 space-y-6 flex-1">
              <div className="space-y-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">Core Quota</div>
                <div className="flex items-center gap-3">
                  <div className={cn("p-2 rounded-xl", plan.highlight ? "bg-primary/20" : "bg-muted/50")}>
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-sm font-black uppercase tracking-widest">{plan.teamLimit} Integrated {plan.teamLimit === 1 ? 'Squad' : 'Squads'}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40">Network Capabilities</div>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 group/item">
                      <div className={cn("mt-1 p-0.5 rounded-full", plan.highlight ? "bg-primary/20" : "bg-primary/10")}>
                        <Check className="h-2.5 w-2.5 text-primary" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-tight leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>

            <CardFooter className="p-8 pt-0">
              <Button 
                onClick={() => handleCheckout(plan)}
                disabled={loadingPlanId !== null}
                className={cn(
                  "w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all group-hover:gap-4",
                  plan.highlight 
                    ? "bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/40" 
                    : "bg-black text-white hover:bg-black/80"
                )}
              >
                {loadingPlanId === plan.id ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>Assign Protocol <ChevronRight className="h-4 w-4" /></>
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Add-ons Section */}
      <div className="max-w-4xl mx-auto px-6 mt-16 lg:mt-24 space-y-8">
        <div className="text-center space-y-2">
          <Badge variant="outline" className="border-primary/20 text-primary font-black text-[10px] px-3 uppercase tracking-widest">Expansion Protocol</Badge>
          <h2 className="text-3xl font-black uppercase tracking-tight italic">Incremental Add-ons</h2>
        </div>

        <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-black/5 bg-white overflow-hidden ring-1 ring-black/5">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="p-8 lg:p-12 space-y-6">
              <div className="inline-flex items-center gap-3 bg-primary/10 text-primary py-2 px-4 rounded-xl">
                <Zap className="h-5 w-5 fill-current" />
                <span className="font-black text-sm uppercase tracking-widest tracking-tighter">Extra Team Seat</span>
              </div>
              <p className="text-sm font-medium text-muted-foreground leading-relaxed">
                Need more capacity but not ready for the next tier? Add individual squads to your command center at a fraction of the cost. Fully integrated into your existing billing frequency.
              </p>
              <div className="flex items-baseline gap-2 pt-2">
                <span className="text-4xl font-black text-foreground">
                  {billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice}
                </span>
                <span className="text-xs font-black uppercase opacity-40">/team/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
              </div>
            </div>

            <div className="bg-muted/30 p-8 lg:p-12 flex flex-col justify-center items-center space-y-8 border-l border-dashed border-muted-foreground/20">
              <div className="space-y-4 text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">Provision Quantity</div>
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => handleExtraTeamsChange(-1)}
                    className="w-12 h-12 rounded-2xl bg-white border shadow-sm flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="text-5xl font-black tabular-nums w-16">{extraTeams}</span>
                  <button 
                    onClick={() => handleExtraTeamsChange(1)}
                    className="w-12 h-12 rounded-2xl bg-white border shadow-sm flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-all active:scale-95"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground pt-2">Total Added Limits: <span className="text-primary">{extraTeams} Squads</span></p>
              </div>
            </div>
          </div>
        </Card>

        <div className="bg-primary/5 rounded-[2rem] p-6 lg:p-8 flex flex-col md:flex-row items-center justify-between gap-6 border border-primary/10">
          <div className="space-y-1">
            <h3 className="font-black text-xl uppercase tracking-tight">Need a Custom Tactical Deployment?</h3>
            <p className="text-sm font-medium text-muted-foreground">For organizations with 50+ teams, we offer custom infrastructure builds.</p>
          </div>
          <Button variant="outline" className="h-14 px-8 rounded-xl font-black uppercase tracking-[0.2em] border-2 shadow-sm whitespace-nowrap">
            Contact Enterprise <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>

      {/* Trust Footer */}
      <div className="max-w-2xl mx-auto px-6 mt-16 text-center space-y-6 opacity-60">
        <div className="flex items-center justify-center gap-8 grayscale brightness-0">
          <div className="font-black italic text-xl">STRIPE</div>
          <div className="font-black italic text-xl">SECURE</div>
          <div className="font-black italic text-xl">SQUAD</div>
        </div>
        <p className="text-[10px] font-medium leading-loose max-w-sm mx-auto uppercase tracking-widest">
          Subscription management handled via encrypted Stripe infrastructure. Cancel or modify protocols at any time through the secure billing gateway.
        </p>
      </div>
    </div>
  );
}
