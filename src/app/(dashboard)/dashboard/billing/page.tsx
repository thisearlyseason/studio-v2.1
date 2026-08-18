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
  ArrowDownCircle,
  XCircle,
  Loader2,
  CheckCircle2,
  Calendar,
  ExternalLink,
  Lock as LockIcon,
  ReceiptText,
  RefreshCw,
  ChevronRight,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { SquadIdentity } from '@/components/SquadIdentity';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import { getBillingPlanStatusLabel } from '@/lib/billing-plan-status';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function BillingDashboard() {
  const { user: userProfile, isPro, teams, activeTeam, proQuotaStatus, updateTeamPlan } = useTeam();
  const auth = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [addonQty, setAddonQty] = useState(userProfile?.extra_teams || 0);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    userProfile?.billing_cycle || 'monthly'
  );

  useEffect(() => {
    setAddonQty(userProfile?.extra_teams || 0);
  }, [userProfile?.extra_teams]);
  useEffect(() => {
    if (userProfile?.billing_cycle) {
      setBillingCycle(userProfile.billing_cycle);
    }
  }, [userProfile?.billing_cycle]);

  // Demo detection: team IDs starting with 'demo_' or isDemo flag on team/user
  const isDemo = !!(activeTeam?.isDemo || (userProfile as any)?.isDemo ||
    teams?.some(t => t.id?.startsWith('demo_')));

  const currentPlan = PRICING_CONFIG.find(p => p.id === userProfile?.plan_type) || null;
  const paidSeatLimit = userProfile?.team_limit ?? 0;
  const ownedProTeamCount = (teams || []).filter(
    team =>
      team.ownerUserId === userProfile?.id &&
      team.isPro === true &&
      isBillableSquadSeat(team)
  ).length;
  const isOverLimit = ownedProTeamCount > paidSeatLimit;
  const isStripeLinked = !!userProfile?.stripe_subscription_id;
  const hasPaidPlan = ['team', 'elite', 'league', 'school', 'squad_pro', 'squad_pro_demo'].includes(userProfile?.plan_type || '');

  // ─── Handlers ────────────────────────────────────────────────────────────
  const handleUpdatePlan = async (newPlan: Plan | null, initialAddons?: number) => {
    if (!userProfile?.id) return;

    // Demo accounts cannot make real Stripe transactions
    if (isDemo) {
      toast({
        title: 'Demo Account',
        description: 'Plan changes are not available on demo accounts. Sign up for a live account to upgrade, downgrade, or manage your subscription.',
        variant: 'default',
      });
      return;
    }

    setLoading(newPlan ? 'plan_' + newPlan.id : 'addon_init');
    if (!isStripeLinked) {
      try {
        const token = await getAuthToken(auth);
        const response = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeader(token) },
          body: JSON.stringify({
            userId: userProfile.id,
            teamId: activeTeam?.id,
            priceId: newPlan ? (billingCycle === 'annual' ? newPlan.annualPriceId : newPlan.monthlyPriceId) : null,
            billingCycle,
            extraTeamQty: initialAddons || 0,
          }),
        });
        const data = await response.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
      } catch (err: any) {
        toast({ title: 'Checkout Error', description: err.message, variant: 'destructive' });
        setLoading(null);
      }
      return;
    }
    if (!newPlan) {
      toast({ title: 'Invalid Upgrade', description: 'No plan selected.', variant: 'destructive' });
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
          newPriceId,
          operationId: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Plan Changed!', description: `Switched to ${newPlan.name}. Reloading...` });
        setTimeout(() => { window.location.href = '/dashboard/billing'; }, 1200);
      } else if (data.pending) {
        toast({
          title: 'Payment Pending',
          description: data.message,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handleUpdateAddon = async (qty: number) => {
    if (!userProfile?.id) return;
    if (isDemo) {
      toast({
        title: 'Demo Account',
        description: 'Plan changes are not available on demo accounts. Sign up for a live account to manage your subscription.',
        variant: 'default',
      });
      return;
    }
    if (!isStripeLinked) {
      toast({ title: 'Subscription Required', description: 'You must have an active Stripe subscription to scale squads.', variant: 'destructive' });
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
          operationId: crypto.randomUUID(),
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Quota Updated', description: 'Extra team capacity has been adjusted.' });
        setAddonQty(qty);
      } else if (data.pending) {
        toast({
          title: 'Payment Pending',
          description: data.message,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!userProfile?.id) return;
    setLoading('cancel');
    try {
      const token = await getAuthToken(auth);
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader(token) },
        body: JSON.stringify({ userId: userProfile.id, operationId: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: 'Cancellation Scheduled', description: data.message });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
        body: JSON.stringify({ userId: userProfile.id, operationId: crypto.randomUUID() }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error || 'Could not open portal');
    } catch (err) {
      toast({ title: 'Error', description: 'Could not open billing portal.', variant: 'destructive' });
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
        body: JSON.stringify({
          userId: userProfile.id,
          teamId: activeTeam?.id,
          operationId: crypto.randomUUID(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: 'Plan Synchronized', description: 'Your plan is now active. Reloading...' });
        setTimeout(() => { window.location.href = '/dashboard/billing'; }, 1000);
      } else {
        throw new Error(data.error || data.message || 'Failed to sync');
      }
    } catch (err: any) {
      toast({ title: 'Sync Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  // Phase 1: Detect Stripe success immediately on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_success') === 'true') {
      setPendingSync(true);
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

  // Helpers
  const currentPlanIndex = PRICING_CONFIG.findIndex(p => p.id === userProfile.plan_type);
  const isCancelling = userProfile.cancel_at_period_end === true;

  const getPlanAction = (plan: Plan) => {
    if (plan.id === userProfile.plan_type) return 'current';
    const planIndex = PRICING_CONFIG.findIndex(p => p.id === plan.id);
    return planIndex > currentPlanIndex ? 'upgrade' : 'downgrade';
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 md:px-6 space-y-10 pb-20">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <Badge className="bg-primary/10 text-primary border-primary/20 px-3 h-6 font-black text-[10px] uppercase tracking-widest">
            Subscription Management
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter">
            Manage <span className="text-primary italic">Your Plan</span>
          </h1>
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
            Upgrade, downgrade, or cancel at any time
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isStripeLinked && (
            <Button
              variant="outline"
              className="rounded-xl font-bold h-10 gap-2"
              onClick={openStripePortal}
              disabled={loading === 'portal'}
            >
              {loading === 'portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
              Invoices & Payment Methods
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-xl font-bold h-10 gap-2"
            onClick={handleForceSync}
            disabled={loading === 'sync'}
          >
            {loading === 'sync' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync Plan
          </Button>
        </div>
      </div>

      {/* ── Status Alerts ── */}
      {isCancelling && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-amber-900 text-sm uppercase tracking-tight">Cancellation Scheduled</p>
            <p className="text-xs font-bold text-amber-700 mt-1">
              Your subscription will end at the close of the current billing period. All features remain active until then.
              To resume, select a plan below or use the Stripe Portal.
            </p>
          </div>
        </div>
      )}
      {isOverLimit && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-red-900 text-sm uppercase tracking-tight">Team Limit Exceeded</p>
            <p className="text-xs font-bold text-red-700 mt-1">
              You have {ownedProTeamCount} Pro squads but your plan includes {paidSeatLimit} paid seats.
              Release a Pro seat or upgrade your plan to restore paid features.
            </p>
          </div>
        </div>
      )}

      {/* ── Current Plan Card ── */}
      <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5">
        <div className="h-1.5 hero-gradient w-full" />
        <CardContent className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className={cn('p-4 rounded-2xl', isPro ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {isPro ? <Zap className="h-7 w-7 fill-current" /> : <LockIcon className="h-7 w-7" />}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Current Plan</p>
                <p className="text-2xl font-black uppercase tracking-tight">{currentPlan?.name || 'Starter (Free)'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <div className={cn('w-2 h-2 rounded-full', isStripeLinked && !isCancelling ? 'bg-green-500' : isCancelling ? 'bg-amber-500' : 'bg-muted-foreground/40')} />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase">
                    {getBillingPlanStatusLabel({ isCancelling, isStripeLinked, isDemo })}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="bg-muted/40 px-5 py-3 rounded-2xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Paid Seats</p>
                <p className="text-xl font-black">{paidSeatLimit}</p>
              </div>
              <div className="bg-muted/40 px-5 py-3 rounded-2xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Extra Squads</p>
                <p className="text-xl font-black">{userProfile.extra_teams || 0}</p>
              </div>
              <div className="bg-muted/40 px-5 py-3 rounded-2xl text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Available</p>
                <p className="text-xl font-black text-primary">{proQuotaStatus.remaining}/{proQuotaStatus.limit}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Plan Selector ── */}
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight">Choose Your Plan</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
              Click any plan to upgrade or downgrade instantly
            </p>
          </div>
          {/* Billing cycle toggle */}
          <div className="flex items-center bg-muted/50 p-1 rounded-2xl border self-start">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={cn('px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                billingCycle === 'monthly' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >Monthly</button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={cn('px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all',
                billingCycle === 'annual' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >Annual <span className="text-[8px] italic opacity-60">Save 20%</span></button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {PRICING_CONFIG.map(plan => {
            const action = getPlanAction(plan);
            const isCurrent = action === 'current';
            const isUpgrade = action === 'upgrade';
            const isDowngrade = action === 'downgrade';
            const isLoading = loading === 'plan_' + plan.id;

            return (
              <Card
                key={plan.id}
                className={cn(
                  'rounded-[1.75rem] border-2 overflow-hidden transition-all flex flex-col',
                  isCurrent
                    ? 'border-primary bg-primary/[0.03] shadow-xl shadow-primary/10'
                    : 'border-border/40 hover:border-primary/40 hover:shadow-lg cursor-pointer',
                  plan.highlight && !isCurrent && 'ring-2 ring-primary/20'
                )}
                onClick={() => !isCurrent && !isLoading && handleUpdatePlan(plan)}
              >
                {isCurrent && <div className="h-1 bg-primary w-full" />}
                {plan.highlight && !isCurrent && <div className="h-1 hero-gradient w-full" />}
                <CardContent className="p-5 flex flex-col flex-1 gap-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={cn('font-black uppercase text-sm tracking-tight', isCurrent && 'text-primary')}>
                        {plan.name}
                      </p>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase mt-0.5">
                        Up to {plan.teamLimit} squad{plan.teamLimit > 1 ? 's' : ''}
                      </p>
                    </div>
                    {isCurrent ? (
                      <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase px-2">Current</Badge>
                    ) : isUpgrade ? (
                      <ArrowUpCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className={cn('text-2xl font-black', isCurrent ? 'text-primary' : '')}>
                      {billingCycle === 'annual' ? plan.annualPrice : plan.monthlyPrice}
                    </span>
                    <span className="text-[9px] font-black text-muted-foreground uppercase">
                      /{billingCycle === 'annual' ? 'yr' : 'mo'}
                    </span>
                  </div>

                  <ul className="space-y-1.5 flex-1">
                    {plan.features.slice(0, 4).map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span className="text-[10px] font-bold text-muted-foreground leading-tight">{f}</span>
                      </li>
                    ))}
                  </ul>

                  {!isCurrent && (
                    <Button
                      className={cn(
                        'w-full rounded-xl font-black uppercase text-[10px] h-10 mt-auto',
                        isUpgrade
                          ? 'bg-primary hover:bg-primary/90 text-white'
                          : 'bg-muted hover:bg-muted/80 text-foreground'
                      )}
                      disabled={isLoading}
                      onClick={(e) => { e.stopPropagation(); handleUpdatePlan(plan); }}
                    >
                      {isLoading
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : isUpgrade ? '↑ Upgrade to this plan' : '↓ Downgrade to this plan'
                      }
                    </Button>
                  )}
                  {isCurrent && (
                    <div className="flex items-center justify-center gap-1.5 py-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[10px] font-black uppercase text-primary tracking-widest">Active Plan</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* ── Extra Squads (for Pro users) ── */}
      {isPro && (
        <Card className="rounded-[2rem] border-2 border-dashed border-primary/20 bg-primary/[0.02]">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  <h3 className="font-black uppercase tracking-tight text-sm">Extra Squad Slots</h3>
                </div>
                <p className="text-[10px] font-bold text-muted-foreground">
                  Add additional team slots beyond your plan limit.
                  {billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice} per squad per {billingCycle === 'annual' ? 'year' : 'month'}.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setAddonQty(q => Math.max(0, q - 1))}
                  className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all"
                ><Minus className="h-4 w-4" /></button>
                <span className="text-3xl font-black w-8 text-center">{addonQty}</span>
                <button
                  onClick={() => setAddonQty(q => q + 1)}
                  className="w-10 h-10 rounded-xl bg-white border shadow-sm flex items-center justify-center hover:bg-black hover:text-white transition-all"
                ><Plus className="h-4 w-4" /></button>
                <Button
                  disabled={addonQty === (userProfile.extra_teams || 0) || loading === 'addon' || loading === 'addon_init'}
                  className="h-10 px-6 rounded-xl font-black uppercase text-[10px]"
                  onClick={() => {
                    const currentQty = userProfile.extra_teams || 0;
                    if (!isStripeLinked) { handleUpdatePlan(null, addonQty); return; }
                    if (addonQty > currentQty) {
                      const diff = addonQty - currentQty;
                      const price = billingCycle === 'annual' ? EXTRA_TEAM_CONFIG.annualPrice : EXTRA_TEAM_CONFIG.monthlyPrice;
                      if (!confirm(`Add ${diff} extra squad seat${diff > 1 ? 's' : ''} for ${price}/squad per ${billingCycle === 'annual' ? 'year' : 'month'}? Your Stripe subscription will be updated immediately.`)) return;
                      void handleUpdateAddon(addonQty);
                    } else {
                      handleUpdateAddon(addonQty);
                    }
                  }}
                >
                  {(loading === 'addon' || loading === 'addon_init') ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                    addonQty > (userProfile.extra_teams || 0) ? `Add ${addonQty - (userProfile.extra_teams || 0)} Slot${addonQty - (userProfile.extra_teams || 0) > 1 ? 's' : ''}` :
                    addonQty < (userProfile.extra_teams || 0) ? 'Remove Slots' : 'No Changes'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Squad Pro Allocation — only meaningful for multi-team plans ── */}
      {hasPaidPlan && teams && teams.filter(t => t.ownerUserId === userProfile.id).length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest">Squad Pro Allocation</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase">
              {proQuotaStatus.remaining} slot{proQuotaStatus.remaining !== 1 ? 's' : ''} available
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {teams.filter(t => t.ownerUserId === userProfile.id).map(team => (
              <Card key={team.id} className={cn('rounded-[1.75rem] border-2 overflow-hidden transition-all', team.isPro ? 'border-primary/20 bg-primary/[0.02]' : 'border-border/40')}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <SquadIdentity teamId={team.id} teamName={team.name} logoUrl={team.teamLogoUrl} size="sm" />
                    {team.isPro
                      ? <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[8px] font-black">Pro</Badge>
                      : <Badge variant="outline" className="text-[8px] font-black opacity-50">Free</Badge>
                    }
                  </div>
                  <p className="font-black uppercase text-xs truncate">{team.name}</p>
                  {team.isPro ? (
                    <div className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      <span className="text-[9px] font-bold uppercase">Full access active</span>
                    </div>
                  ) : (
                    <Button
                      disabled={proQuotaStatus.remaining <= 0 || loading === `upgrade_${team.id}`}
                      onClick={async () => {
                        setLoading(`upgrade_${team.id}`);
                        try {
                          await updateTeamPlan(team.id, 'team');
                          toast({ title: 'Upgraded', description: `${team.name} is now Pro.` });
                        } catch (e: any) {
                          toast({ title: 'Failed', description: e.message, variant: 'destructive' });
                        } finally { setLoading(null); }
                      }}
                      className="w-full rounded-xl font-black uppercase text-[10px] h-9 bg-black hover:bg-primary transition-all"
                    >
                      {loading === `upgrade_${team.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Assign Pro Slot →'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
            {/* Add New Squad — disabled when at limit, prompts upgrade instead */}
            {proQuotaStatus.remaining > 0 ? (
              <Card
                className="rounded-[1.75rem] border-2 border-dashed border-border/60 flex flex-col items-center justify-center p-6 gap-3 hover:border-primary/40 transition-all cursor-pointer group"
                onClick={() => router.push('/dashboard')}
              >
                <div className="p-3 rounded-full bg-white shadow-sm border group-hover:scale-110 transition-transform">
                  <Plus className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                </div>
                <p className="font-black uppercase text-[10px] text-center">Add New Squad</p>
              </Card>
            ) : (
              <Card
                className="rounded-[1.75rem] border-2 border-dashed border-amber-200 bg-amber-50/50 flex flex-col items-center justify-center p-6 gap-3"
              >
                <div className="p-3 rounded-full bg-amber-100 border border-amber-200">
                  <LockIcon className="h-5 w-5 text-amber-600" />
                </div>
                <p className="font-black uppercase text-[10px] text-center text-amber-700">Slot Limit Reached</p>
                <p className="text-[9px] font-bold text-amber-600/80 text-center leading-tight">
                  Upgrade your plan or add extra squad slots above to unlock more squads.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Danger Zone: Cancel ── */}
      <div className="border border-red-200/60 rounded-[2rem] p-6 md:p-8 bg-red-50/30 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-black uppercase text-sm text-red-700 tracking-tight">Cancel Subscription</h3>
            <p className="text-[11px] font-bold text-red-600/70 leading-relaxed">
              {isDemo
                ? 'You are currently on a demo account. Cancellation is only available for live paid subscriptions. To test this flow, sign up for a live plan.'
                : 'You can cancel at any time. All features remain active until the end of your current billing period. Your data is preserved and you can resubscribe at any time.'
              }
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {!isDemo && isStripeLinked && (
              <Button
                variant="outline"
                className="rounded-xl font-bold h-10 border-red-200 text-red-600 hover:bg-red-50 gap-2"
                onClick={openStripePortal}
                disabled={loading === 'portal'}
              >
                <ExternalLink className="h-4 w-4" />
                Manage in Stripe
              </Button>
            )}
            {isDemo ? (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-black text-[10px] uppercase px-4 h-10 flex items-center">
                Demo Account — Not Available
              </Badge>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    className="rounded-xl font-black uppercase text-[10px] h-10 text-red-600 hover:text-white hover:bg-red-600 border border-red-200 gap-2"
                    disabled={loading === 'cancel' || !isStripeLinked}
                  >
                    {loading === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><XCircle className="h-4 w-4" /> Cancel Subscription</>}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="rounded-[2rem]">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="font-black uppercase">Confirm Cancellation</AlertDialogTitle>
                    <AlertDialogDescription className="font-bold text-sm">
                      Your subscription will be cancelled at the end of the current billing period.
                      You will retain full access until then. This action can be reversed by contacting support or resubscribing.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-xl font-black">Keep My Plan</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-xl font-black bg-red-600 hover:bg-red-700"
                      onClick={handleCancel}
                    >
                      Yes, Cancel Subscription
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
