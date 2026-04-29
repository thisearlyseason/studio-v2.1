"use client";

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTeam } from '@/components/providers/team-provider';
import { PRICING_CONFIG, Plan, BillingCycle } from '@/lib/pricing';
import {
  Check,
  Loader2,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/firebase';
import { getAuthToken, authHeader } from '@/lib/client-auth';

export function StripePaywall() {
  const { isPaywallOpen, setIsPaywallOpen, user, isPro } = useTeam();
  const auth = useAuth();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const handleSelectPlan = async (plan: Plan) => {
    if (!user?.id) {
      toast({ title: 'Authentication Required', description: 'Please log in to upgrade.', variant: 'destructive' });
      return;
    }

    const priceId = billingCycle === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;
    setLoadingPlanId(plan.id);

    try {
      // Direct to Portal if already subscribed
      if (isPro && (user as any).stripe_customer_id) {
        const token = await getAuthToken(auth);
        const res = await fetch('/api/stripe/customer-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({ userId: user.id }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
          return;
        }
      }

      // Otherwise Checkout
      const token = await getAuthToken(auth);
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ priceId, userId: user.id, billingCycle }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || 'Checkout initiation failed');
    } catch (err: any) {
      toast({ title: 'Payment Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <Dialog open={isPaywallOpen} onOpenChange={setIsPaywallOpen}>
      <DialogContent className="sm:max-w-5xl rounded-[3rem] overflow-hidden p-0 border-none shadow-2xl bg-white">
        {/* Visually hidden title for screen reader accessibility (Radix requirement) */}
        <VisuallyHidden.Root>
          <DialogTitle>Deploy Protocol — Select Your Plan</DialogTitle>
        </VisuallyHidden.Root>
        <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
          {/* Left Sidebar / Image */}
          <div className="lg:col-span-4 bg-black p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute top-10 right-10 rotate-12 bg-primary w-64 h-64 blur-3xl rounded-full" />
            </div>
            
            <div className="relative z-10 space-y-6">
              <Badge className="bg-primary text-white border-none font-black uppercase text-[9px] tracking-[0.2em] px-3 h-6">Infrastructure Upgrade</Badge>
              <h2 className="text-4xl lg:text-5xl font-black text-white tracking-tighter italic leading-[0.9]">
                SCALE YOUR <span className="text-primary">LEGACY.</span>
              </h2>
              <p className="text-sm font-medium text-white/60 leading-relaxed uppercase tracking-wider">
                Unlock institutional-grade management tools and limitless squad scaling.
              </p>
            </div>

            <div className="relative z-10 space-y-4">
              <div className="flex items-center gap-3 text-white/40">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">PCI Secure Terminal</span>
              </div>
              <div className="flex items-center gap-3 text-white/40">
                <Zap className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Prorated Syncing</span>
              </div>
            </div>
          </div>

          {/* Right Content / Plans */}
          <div className="lg:col-span-8 p-8 lg:p-12 space-y-8 flex flex-col">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black uppercase tracking-tight">Deploy Protocol</h3>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Select your operational tier</p>
              </div>

              {/* Billing Toggle */}
              <div className="flex items-center bg-muted/50 p-1.5 rounded-2xl ring-1 ring-black/5">
                <button 
                  onClick={() => setBillingCycle('monthly')}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    billingCycle === 'monthly' ? "bg-white text-black shadow-sm" : "text-muted-foreground opacity-60"
                  )}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setBillingCycle('annual')}
                  className={cn(
                    "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative flex items-center gap-2",
                    billingCycle === 'annual' ? "bg-white text-black shadow-sm" : "text-muted-foreground opacity-60"
                  )}
                >
                  Annual
                  <Badge className="bg-green-100 text-green-700 font-black text-[8px] border-none px-1.5 h-4">SAVE 20%</Badge>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
              {PRICING_CONFIG.map((plan) => (
                <div 
                  key={plan.id}
                  className={cn(
                    "group relative rounded-[2rem] p-6 border-2 transition-all duration-300 hover:scale-[1.02] flex flex-col justify-between",
                    plan.highlight 
                      ? "border-primary bg-primary/5 shadow-xl shadow-primary/10" 
                      : "border-border/40 hover:border-black/20"
                  )}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-lg font-black uppercase tracking-tight italic">{plan.name}</p>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{plan.teamLimit} Squad Seat{plan.teamLimit > 1 ? 's' : ''}</p>
                      </div>
                      {plan.highlight && (
                         <div className="bg-primary p-1.5 rounded-lg text-white">
                           <Sparkles className="h-3 w-3 fill-current" />
                         </div>
                      )}
                    </div>

                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black tracking-tighter">
                        {billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice}
                      </span>
                      <span className="text-[10px] font-black uppercase opacity-40">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
                    </div>

                    <ul className="space-y-2">
                       {plan.features.slice(0, 3).map((f, i) => (
                         <li key={i} className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-tight">
                            <Check className="h-3 w-3 text-primary shrink-0" />
                            {f}
                         </li>
                       ))}
                    </ul>
                  </div>

                  <Button 
                    onClick={() => handleSelectPlan(plan)}
                    disabled={loadingPlanId !== null}
                    className={cn(
                      "w-full mt-6 h-12 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all",
                      plan.highlight ? "bg-primary text-white shadow-lg shadow-primary/40" : "bg-black text-white"
                    )}
                  >
                    {loadingPlanId === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    ) : (
                      <>Initialize <ArrowRight className="ml-2 h-3.5 w-3.5" /></>
                    )}
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-[10px] font-black uppercase text-center opacity-30 tracking-[0.2em] pt-4">
              SECURE DEPLOYMENT VIA STRIPE. NON-BINDING CONTRACT. CANCEL PROTOCOL ANYTIME.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
