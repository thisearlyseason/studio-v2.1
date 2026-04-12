"use client";

import React, { useState, useEffect } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { PRICING_CONFIG, EXTRA_TEAM_CONFIG, Plan, BillingCycle } from '@/lib/pricing';
import { 
  CreditCard, 
  Zap, 
  Trophy, 
  ShieldCheck, 
  Building2, 
  AlertCircle,
  Plus,
  Minus,
  ArrowUpCircle,
  XCircle,
  Loader2,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Lock as LockIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export default function BillingDashboard() {
  const { user: userProfile, isPro, teams } = useTeam();
  const [loading, setLoading] = useState<string | null>(null);
  const [addonQty, setAddonQty] = useState(userProfile?.extra_teams || 0);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(userProfile?.subscription_status?.includes('annual') ? 'annual' : 'monthly');
  
  useEffect(() => {
     setAddonQty(userProfile?.extra_teams || 0);
  }, [userProfile?.extra_teams]);

  const currentPlan = PRICING_CONFIG.find(p => p.id === userProfile?.plan_type) || null;
  const isOverLimit = (teams || []).length > (userProfile?.team_limit || 1);
  const isStripeLinked = !!userProfile?.stripe_subscription_id;

  const handleUpdatePlan = async (newPlan: Plan) => {
    if (!userProfile?.id) return;
    setLoading('plan_' + newPlan.id);

    // If they DON'T have a subscription yet (Starter plan), they need a checkout session
    if (!isStripeLinked) {
      try {
        const response = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userProfile.id,
            priceId: billingCycle === 'annual' ? newPlan.annualPriceId : newPlan.monthlyPriceId,
            billingCycle: billingCycle
          })
        });
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
      } catch (err: any) {
        toast({ title: "Checkout Error", description: err.message, variant: "destructive" });
        setLoading(null);
      }
      return;
    }

    try {
      const response = await fetch('/api/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userProfile.id,
          newPriceId: billingCycle === 'annual' ? newPlan.annualPriceId : newPlan.monthlyPriceId
        })
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Success", description: `Upgraded to ${newPlan.name}. Changes processed.` });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleUpdateAddon = async (qty: number) => {
    if (!userProfile?.id) return;
    if (!isStripeLinked) {
      toast({ title: "Subscription Required", description: "You must have an active Stripe subscription to scale dynamic squads.", variant: "destructive" });
      return;
    }

    setLoading('addon');
    try {
      const response = await fetch('/api/subscription/addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userProfile.id,
          quantity: qty,
          billingCycle: userProfile.subscription_status?.includes('annual') ? 'annual' : 'monthly'
        })
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Quota Updated", description: "Extra team capacity has been adjusted." });
        setAddonQty(qty);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!userProfile?.id || !confirm('Are you sure you want to cancel? You will lose access at the end of the billing period.')) return;
    setLoading('cancel');
    try {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userProfile.id })
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: "Cancellation Scheduled", description: data.message });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const openStripePortal = async () => {
    if (!userProfile?.id) return;
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userProfile.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      toast({ title: "Error", description: "Could not open billing portal.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  if (!userProfile) return <div className="p-20 text-center"><Loader2 className="animate-spin mx-auto h-8 w-8" /></div>;

  return (
    <div className="max-w-6xl mx-auto py-12 px-6 space-y-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-primary/20 px-3 py-1 font-black text-[10px] uppercase tracking-widest">Billing Management</Badge>
          <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter">Your <span className="text-primary italic">Command Plan</span></h1>
        </div>
        <div className="flex items-center gap-3">
           <Button variant="outline" className="rounded-xl font-bold h-12" onClick={openStripePortal} disabled={loading === 'portal' || !isStripeLinked}>
             {loading === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ExternalLink className="h-4 w-4 mr-2" /> {isStripeLinked ? 'Stripe Portal' : 'No Active Billing'}</>}
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Current Plan Summary */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
            <div className="h-2 hero-gradient w-full" />
            <CardHeader className="p-8 lg:p-10">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-3xl font-black uppercase tracking-tight">Current Protocol</CardTitle>
                  <CardDescription className="text-xs font-bold uppercase tracking-widest opacity-60">Status: {userProfile.subscription_status?.toUpperCase() || 'FREE'}</CardDescription>
                </div>
                {isPro ? (
                  <div className="bg-primary/10 text-primary p-3 rounded-2xl">
                    <Zap className="h-6 w-6 fill-current" />
                  </div>
                ) : (
                  <div className="bg-muted p-3 rounded-2xl">
                    <LockIcon className="h-6 w-6" />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-8 lg:p-10 pt-0 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-muted/30 p-6 rounded-3xl space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Active Plan</p>
                  <p className="text-xl font-black text-primary uppercase italic">{currentPlan?.name || 'Starter Plan'}</p>
                </div>
                <div className="bg-muted/30 p-6 rounded-3xl space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Squad Quota</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-2xl font-black">{userProfile.team_limit || 1}</p>
                    <p className="text-[10px] font-bold opacity-60">Total Slots</p>
                  </div>
                </div>
                <div className="bg-muted/30 p-6 rounded-3xl space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Extra Seats</p>
                  <p className="text-2xl font-black">{userProfile.extra_teams || 0} Add-ons</p>
                </div>
              </div>

               {isPro && !isStripeLinked && (
                 <div className="bg-amber-50 border border-amber-200 p-6 rounded-[2rem] flex items-start gap-4">
                    <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-black text-amber-900 uppercase text-xs tracking-tight">System Integrity Notice</p>
                      <p className="text-xs font-bold text-amber-700">Your Pro capabilities are active, but your account is not linked to an active Stripe Billing ID, which disables dynamic squad scaling. This often happens in local environments when webhooks are blocked.</p>
                      <Button 
                        variant="link" 
                        disabled={loading === 'sync'}
                        className="p-0 h-auto text-[10px] font-black uppercase text-amber-800 tracking-widest mt-2" 
                        onClick={async () => {
                          setLoading('sync');
                          try {
                            const res = await fetch('/api/subscription/sync', {
                              method: 'POST',
                              body: JSON.stringify({ userId: userProfile.id }),
                              headers: { 'Content-Type': 'application/json' }
                            });
                            const data = await res.json();
                            if (data.success) {
                              toast({ title: "Sync Successful", description: "Your Stripe profile is now linked." });
                              setTimeout(() => window.location.reload(), 1500);
                            } else {
                              throw new Error(data.error || data.message || "Failed to sync");
                            }
                          } catch (err: any) {
                            toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
                          } finally {
                            setLoading(null);
                          }
                        }}
                      >
                       {loading === 'sync' ? 'Syncing Profile...' : 'Force Sync Stripe Profile \u2192'}
                      </Button>
                    </div>
                 </div>
               )}

                {isOverLimit && (
                <div className="bg-red-50 border border-red-200 p-6 rounded-[2rem] flex items-start gap-4 animate-pulse">
                  <AlertCircle className="h-6 w-6 text-red-600 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-black text-red-900 uppercase text-xs tracking-tight">System Violation: Team Limit Exceeded</p>
                    <p className="text-xs font-bold text-red-700">You are managing {(teams || []).length} teams but your limit is {userProfile.team_limit || 1}. Scale your infrastructure to restore full functionality.</p>
                  </div>
                </div>
              )}

              {isPro && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="font-black uppercase tracking-widest text-sm flex items-center gap-2">
                      <Plus className="h-4 w-4 text-primary" /> Dynamic Capacity Expansion
                    </h3>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
                        <div className="space-y-1">
                          <p className="font-black text-sm uppercase tracking-tight">Scale Squad Seats</p>
                          <p className="text-[10px] font-bold opacity-60">Instantly provision additional slots to your command hub.</p>
                          <p className="text-[9px] font-black text-primary uppercase">Price: {billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice} per squad / {billingCycle}</p>
                        </div>
                        <div className="flex items-center gap-6">
                          <button 
                            onClick={() => setAddonQty(q => Math.max(0, q-1))}
                            className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                            disabled={!isStripeLinked}
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className={cn("text-3xl font-black w-8 text-center", !isStripeLinked && "opacity-30")}>{addonQty}</span>
                          <button 
                            onClick={() => setAddonQty(q => q+1)}
                            className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                            disabled={!isStripeLinked}
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <Button 
                            variant="default" 
                            className="h-10 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest"
                            disabled={addonQty === userProfile.extra_teams || loading === 'addon' || !isStripeLinked}
                            onClick={() => handleUpdateAddon(addonQty)}
                          >
                            {loading === 'addon' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Apply Sync'}
                          </Button>
                        </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Upgrade Paths */}
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 ml-2">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em]">Recommended Deployment Upgrades</h3>
              
              <div className="flex items-center bg-muted/50 p-1 rounded-2xl border">
                <button 
                  onClick={() => setBillingCycle('monthly')}
                  className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", billingCycle === 'monthly' ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  Monthly
                </button>
                <button 
                  onClick={() => setBillingCycle('annual')}
                  className={cn("px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", billingCycle === 'annual' ? "bg-white shadow-sm text-primary" : "text-muted-foreground hover:text-foreground")}
                >
                  Annual <span className="text-[8px] italic opacity-60 ml-1">(Save 20%)</span>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PRICING_CONFIG.filter(p => p.id !== userProfile.plan_type).map(plan => (
                 <Card key={plan.id} className="rounded-3xl border-2 border-border/40 hover:border-primary/40 transition-all cursor-pointer group" onClick={() => handleUpdatePlan(plan)}>
                   <CardContent className="p-6 space-y-4">
                      <div className="flex items-start justify-between">
                         <div className="space-y-1">
                            <p className="font-black uppercase text-sm tracking-tight">{plan.name}</p>
                            <p className="text-[9px] font-bold opacity-60">UP TO {plan.teamLimit} SQUADS</p>
                         </div>
                         <ArrowUpCircle className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                      <div className="flex items-baseline gap-1">
                         <span className="text-2xl font-black text-primary">{billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice}</span>
                         <span className="text-[9px] font-black uppercase opacity-60">/{billingCycle === 'annual' ? 'yr' : 'mo'}</span>
                      </div>
                      <Button className="w-full rounded-xl font-black uppercase text-[10px] h-10" variant="secondary" disabled={loading?.includes(plan.id)}>
                        {loading === 'plan_'+plan.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Instigate Upgrade'}
                      </Button>
                   </CardContent>
                 </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Support & Security */}
        <div className="space-y-8">
           <Card className="rounded-[2.5rem] bg-black text-white p-8 space-y-6 overflow-hidden relative">
             <Zap className="absolute -right-4 -bottom-4 h-32 w-32 opacity-10 -rotate-12" />
             <div className="space-y-2 relative">
               <h3 className="text-xl font-black uppercase italic tracking-tighter">Billing Security</h3>
               <p className="text-[10px] font-bold text-white/60 leading-relaxed uppercase tracking-widest">
                 Military-grade encryption via Stripe. Your data and squad infrastructure are protected by institutional-level security protocols.
               </p>
             </div>
             <Separator className="bg-white/10" />
             <ul className="space-y-4 relative">
                <li className="flex items-center gap-3">
                   <CheckCircle2 className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Encrypted Checkout</span>
                </li>
                <li className="flex items-center gap-3">
                   <CheckCircle2 className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Prorated Refills</span>
                </li>
                <li className="flex items-center gap-3">
                   <CheckCircle2 className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-bold uppercase tracking-widest">Global Invoicing</span>
                </li>
             </ul>
           </Card>

           <div className="bg-muted/20 rounded-[2.5rem] p-8 border border-dashed space-y-6">
              <div className="space-y-2">
                 <h3 className="font-black uppercase tracking-tight text-sm">Decommission Access</h3>
                 <p className="text-[10px] font-bold opacity-60 leading-relaxed uppercase tracking-widest">
                   You can cancel your protocol at any time. Features remain live until the end of your billing cycle.
                 </p>
              </div>
              <Button 
                variant="ghost" 
                className="w-full rounded-xl text-red-600 hover:text-white hover:bg-red-600 font-black uppercase text-[10px] tracking-widest h-12"
                onClick={handleCancel}
                disabled={loading === 'cancel' || !isStripeLinked}
              >
                {loading === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4 mr-2" /> Cancel Subscription</>}
              </Button>
           </div>
        </div>
      </div>
    </div>
  );
}
