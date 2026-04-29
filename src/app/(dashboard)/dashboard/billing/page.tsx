"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTeam } from '@/components/providers/team-provider';
import { useAuth } from '@/firebase';
import { getAuthToken, authHeader } from '@/lib/client-auth';
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
import { SquadIdentity } from '@/components/SquadIdentity';

export default function BillingDashboard() {
  const { user: userProfile, isPro, teams, proQuotaStatus, updateTeamPlan } = useTeam();
  const auth = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [addonQty, setAddonQty] = useState(userProfile?.extra_teams || 0);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(userProfile?.subscription_status?.includes('annual') ? 'annual' : 'monthly');
  
  useEffect(() => {
     setAddonQty(userProfile?.extra_teams || 0);
  }, [userProfile?.extra_teams]);

  const currentPlan = PRICING_CONFIG.find(p => p.id === userProfile?.plan_type) || null;
  const isOverLimit = (teams || []).length > (userProfile?.team_limit || 1);
  const isStripeLinked = !!userProfile?.stripe_subscription_id;

  const handleUpdatePlan = async (newPlan: Plan | null, initialAddons?: number) => {
    if (!userProfile?.id) return;
    setLoading(newPlan ? 'plan_' + newPlan.id : 'addon_init');

    // If they DON'T have a subscription yet (Starter plan), they need a checkout session
    if (!isStripeLinked) {
      try {
        const token = await getAuthToken(auth);
        const response = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({
            userId: userProfile.id,
            priceId: newPlan ? (billingCycle === 'annual' ? newPlan.annualPriceId : newPlan.monthlyPriceId) : null,
            billingCycle: billingCycle,
            extraTeamQty: initialAddons || 0
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

    // In-place upgrade: already has a Stripe subscription
    if (!newPlan) {
      toast({ title: "Invalid Upgrade", description: "No plan selected for upgrade.", variant: "destructive" });
      setLoading(null);
      return;
    }

    try {
      const newPriceId = billingCycle === 'annual' ? newPlan.annualPriceId : newPlan.monthlyPriceId;
      const token = await getAuthToken(auth);
      const response = await fetch('/api/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({
          userId: userProfile.id,
          newPriceId
        })
      });
      const data = await response.json();
      if (data.success) {
        toast({ 
          title: "Upgrade Confirmed!", 
          description: `Switched to ${newPlan.name}. Loading your new features...`
        });
        // Use a full navigation after a brief delay.
        // This creates a clean Firestore connection, prevents the SDK ca9 listener crash,
        // and guarantees the billing page reads the newly-written plan fresh from Firestore.
        setTimeout(() => {
          window.location.href = '/dashboard/billing';
        }, 1200);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Upgrade Error", description: err.message, variant: "destructive" });
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
      const token = await getAuthToken(auth);
      const response = await fetch('/api/subscription/addon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
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
      const token = await getAuthToken(auth);
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
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
      const token = await getAuthToken(auth);
      const res = await fetch('/api/stripe/customer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
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

  const handleForceSync = async () => {
    if (!userProfile?.id) return;
    setLoading('sync');
    try {
      const token = await getAuthToken(auth);
      const res = await fetch('/api/subscription/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ userId: userProfile.id })
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Plan Synchronized", description: "Your plan is now active. Reloading..." });
        // Full navigation avoids Firestore listener crash and ensures fresh plan state
        setTimeout(() => {
          window.location.href = '/dashboard/billing';
        }, 1000);
      } else {
        throw new Error(data.error || data.message || "Failed to sync");
      }
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // Phase 1: Detect Stripe success immediately on mount (before userProfile loads)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_success') === 'true') {
      setPendingSync(true);
      // Clean up URL immediately
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Phase 2: Execute sync once userProfile is available
  useEffect(() => {
    if (pendingSync && userProfile?.id) {
      setPendingSync(false);
      handleForceSync();
    }
  }, [pendingSync, userProfile?.id]);

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
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Extra Squads</p>
                  <p className="text-2xl font-black">{userProfile.extra_teams || 0} Squads</p>
                </div>
              </div>

               {process.env.NODE_ENV === 'development' && isPro && !isStripeLinked && (
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
                            const token = await getAuthToken(auth);
                            const res = await fetch('/api/subscription/sync', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', ...authHeader(token) },
                              body: JSON.stringify({ userId: userProfile.id })
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
                          <p className="font-black text-xl uppercase tracking-tight">Scale Squads</p>
                          <p className="text-[10px] font-bold opacity-60">Instantly provision additional slots to your command hub.</p>
                          <div className="pt-2 space-y-1">
                            <p className="text-3xl font-black text-primary uppercase">{billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice} <span className="text-xs opacity-60 italic">/ {billingCycle}</span></p>
                            <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full border border-emerald-100 w-fit">
                              <p className="text-[9px] font-black uppercase tracking-tight">Note: Discounted add-on squads just for you</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-6">
                           <button 
                            onClick={() => setAddonQty(q => Math.max(0, q-1))}
                            className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className={cn("text-3xl font-black w-8 text-center")}>{addonQty}</span>
                          <button 
                            onClick={() => setAddonQty(q => q+1)}
                            className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all disabled:opacity-30"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          <Button 
                             variant="default"
                             className="h-10 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest"
                             disabled={addonQty === (userProfile.extra_teams || 0) || loading === 'addon' || loading === 'addon_init'}
                             onClick={() => {
                               const currentQty = userProfile.extra_teams || 0;
                               if (!isStripeLinked) {
                                 // No subscription yet — go to checkout with addons
                                 handleUpdatePlan(null, addonQty);
                               } else if (addonQty > currentQty) {
                                 // INCREASING — must go through Stripe Checkout to collect payment
                                 const diff = addonQty - currentQty;
                                 const price = billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice;
                                 if (!confirm(`Add ${diff} extra squad seat${diff > 1 ? 's' : ''} for ${price}/squad per ${billingCycle === 'annual' ? 'year' : 'month'}? You will be taken to Stripe to complete payment.`)) return;
                                 // Route through checkout so Stripe collects payment
                                 setLoading('addon_init');
                                 getAuthToken(auth).then(token => 
                                   fetch('/api/stripe/create-checkout', {
                                     method: 'POST',
                                     headers: { 'Content-Type': 'application/json', ...authHeader(token) },
                                     body: JSON.stringify({
                                       userId: userProfile.id,
                                       priceId: null,
                                       billingCycle,
                                       extraTeamQty: diff
                                     })
                                   })
                                 ).then(r => r.json()).then(data => {
                                   if (data.url) {
                                     window.location.href = data.url;
                                   } else {
                                     toast({ title: 'Checkout Error', description: data.error, variant: 'destructive' });
                                     setLoading(null);
                                   }
                                 }).catch(e => {
                                   toast({ title: 'Checkout Error', description: e.message, variant: 'destructive' });
                                   setLoading(null);
                                 });
                               } else {
                                 // DECREASING — update subscription in-place
                                 handleUpdateAddon(addonQty);
                               }
                             }}
                           >
                             {(loading === 'addon' || loading === 'addon_init') ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                               addonQty > (userProfile.extra_teams || 0)
                                 ? `Add ${addonQty - (userProfile.extra_teams || 0)} Seat${addonQty - (userProfile.extra_teams || 0) > 1 ? 's' : ''} →`
                                 : addonQty < (userProfile.extra_teams || 0)
                                 ? 'Remove Seats'
                                 : isStripeLinked ? 'No Changes' : 'Connect Billing'
                             )}
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


        {/* Tactical Infrastructure Allocation */}
        <div className="lg:col-span-3 space-y-6">
           <div className="flex items-center justify-between ml-2">
              <div className="space-y-1">
                 <h3 className="text-xl font-black uppercase tracking-tight">Infrastructure Allocation</h3>
                 <p className="text-[10px] font-bold opacity-60 uppercase tracking-[0.2em]">Deploy provisioned power to your tactical squads</p>
              </div>
              <div className="flex items-center gap-4 bg-muted/50 px-6 py-3 rounded-2xl border">
                 <div className="text-right">
                    <p className="text-[9px] font-black uppercase opacity-40">Available Seats</p>
                    <p className="text-sm font-black text-primary">{proQuotaStatus.remaining} / {proQuotaStatus.limit}</p>
                 </div>
                 <div className="h-8 w-px bg-border" />
                 <Trophy className={cn("h-5 w-5", proQuotaStatus.remaining > 0 ? "text-primary animate-pulse" : "text-muted-foreground")} />
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {teams.filter(t => t.ownerUserId === userProfile.id).map(team => (
                <Card key={team.id} className={cn("rounded-[2rem] border-2 transition-all overflow-hidden", team.isPro ? "border-primary/20 bg-primary/[0.02]" : "border-border/40 bg-white")}>
                  <CardHeader className="p-6 pb-2">
                    <div className="flex items-start justify-between">
                       <div className="flex-shrink-0">
                          <SquadIdentity teamId={team.id} teamName={team.name} logoUrl={team.teamLogoUrl} size="md" />
                       </div>
                       {team.isPro ? (
                         <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[8px] font-black uppercase tracking-widest px-2">Pro Linked</Badge>
                       ) : (
                         <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest px-2 opacity-50">Standard</Badge>
                       )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    <div className="space-y-1">
                      <p className="font-black uppercase text-sm truncate">{team.name}</p>
                      <p className="text-[9px] font-bold opacity-40 uppercase">{team.type.replace('_', ' ')} ARCHITECTURE</p>
                    </div>
                    
                    {team.isPro ? (
                       <div className="pt-2 flex items-center gap-2 text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span className="text-[9px] font-bold uppercase tracking-tight">Full Capabilities Active</span>
                       </div>
                    ) : (
                       <Button 
                        disabled={proQuotaStatus.remaining <= 0 || loading === `upgrade_${team.id}`}
                        onClick={async () => {
                          setLoading(`upgrade_${team.id}`);
                          try {
                            await updateTeamPlan(team.id, 'team');
                            toast({ title: "Protocol Deployed", description: `${team.name} has been upgraded to Pro status.` });
                          } catch (e: any) {
                            toast({ title: "Deployment Failed", description: e.message, variant: "destructive" });
                          } finally {
                            setLoading(null);
                          }
                        }}
                        className="w-full rounded-xl font-black uppercase text-[10px] h-9 mt-4 bg-black hover:bg-primary transition-all shadow-lg"
                       >
                         {loading === `upgrade_${team.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Deploy Pro Seat \u2192'}
                       </Button>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Add New Squad Slot */}
              <Card className="rounded-[2rem] border-2 border-dashed border-border/60 bg-muted/5 flex flex-col items-center justify-center p-8 gap-4 hover:border-primary/40 hover:bg-primary/[0.01] transition-all cursor-pointer group" onClick={() => router.push('/dashboard')}>
                 <div className="p-4 rounded-full bg-white shadow-sm border group-hover:scale-110 transition-transform">
                   <Plus className="h-6 w-6 text-muted-foreground group-hover:text-primary" />
                 </div>
                 <div className="text-center space-y-1">
                    <p className="font-black uppercase text-xs">Initialize New Squad</p>
                    <p className="text-[9px] font-bold opacity-40 uppercase">Expansion Protocol available</p>
                 </div>
              </Card>
           </div>
        </div>

        {/* Support & Security */}
        <div className="lg:col-span-1 space-y-8">
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
