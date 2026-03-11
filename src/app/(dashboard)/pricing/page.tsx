"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  Sparkles, 
  Trophy, 
  Users, 
  ShieldCheck, 
  ArrowRight,
  Loader2,
  Lock,
  Zap,
  Star,
  Building,
  Shield,
  CircleCheck,
  Megaphone,
  Table as TableIcon,
  LayoutGrid,
  Activity,
  Layout,
  ChevronRight,
  CheckCircle2,
  ShieldAlert,
  Infinity,
  AlertCircle
} from 'lucide-react';
import { useTeam } from '@/components/providers/team-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useRouter } from 'next/navigation';

export default function PricingPage() {
  const { purchasePro, submitLead, user, plans, isPlansLoading, proQuotaStatus } = useTeam();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const router = useRouter();
  
  const [leadForm, setLeadForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    organization: '',
    teamCount: '',
    message: ''
  });

  const proPlan = useMemo(() => plans.find(p => p.id === 'squad_pro'), [plans]);
  
  const CLUB_TIERS = [
    { id: 'squad_duo', name: 'Club Duo', limit: 2, monthly: '$23.99', annual: '$180' },
    { id: 'squad_crew', name: 'Club Crew', limit: 4, monthly: '$44.99', annual: '$340' },
    { id: 'squad_league', name: 'Club League', limit: 9, monthly: '$89.99', annual: '$680' },
    { id: 'squad_division', name: 'Club Division', limit: 12, monthly: '$119.99', annual: '$900' },
    { id: 'squad_conference', name: 'Club Conference', limit: 15, monthly: '$149.99', annual: '$1,120' },
    { id: 'squad_organization', name: 'Club Custom', limit: 100, monthly: 'Custom', annual: 'Custom' }
  ];

  const clubPlans = useMemo(() => {
    return CLUB_TIERS.map(tier => {
      const dbPlan = plans.find(p => p.id === tier.id);
      return {
        id: tier.id,
        name: dbPlan?.name || tier.name,
        proTeamLimit: dbPlan?.proTeamLimit || tier.limit,
        priceDisplay: dbPlan?.priceDisplay || tier.monthly,
        annualPriceDisplay: dbPlan?.annualPriceDisplay || tier.annual,
        isContactOnly: dbPlan?.isContactOnly || (tier.id === 'squad_organization')
      };
    });
  }, [plans]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const success = await submitLead({
      ...leadForm,
      teamCount: parseInt(leadForm.teamCount) || 0
    });
    if (success) {
      setIsContactOpen(false);
      setLeadForm({ name: user?.name || '', email: user?.email || '', organization: '', teamCount: '', message: '' });
    }
    setIsSubmitting(false);
  };

  if (isPlansLoading && plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Subscription Catalog...</p>
      </div>
    );
  }

  const getDisplayPrice = (plan?: any) => {
    if (!plan) return '';
    if (plan.id === 'squad_pro') return billingCycle === 'annual' ? '$99' : '$12.99';
    const price = (billingCycle === 'annual' && plan.annualPriceDisplay) ? plan.annualPriceDisplay : plan.priceDisplay;
    return price;
  };

  const getCycleLabel = (plan?: any) => {
    if (!plan || plan.priceDisplay === 'Free' || plan.priceDisplay === 'Custom' || plan.priceDisplay === '$0') return '';
    return billingCycle === 'annual' ? '/yr' : '/mo';
  };

  const isSubscriber = proQuotaStatus.limit > 0;
  const quotaPercentage = proQuotaStatus.limit > 0 ? (proQuotaStatus.current / proQuotaStatus.limit) * 100 : 0;

  return (
    <div className="space-y-12 pb-20 max-w-7xl mx-auto px-4 md:px-6">
      <div className="text-center space-y-6">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1.5 uppercase tracking-widest text-[10px] h-auto whitespace-nowrap">Institutional Infrastructure</Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none uppercase">Elite <span className="text-primary italic">Strategy.</span></h1>
        <div className="space-y-4 pt-2">
          <p className="text-muted-foreground font-medium text-lg max-w-2xl mx-auto leading-relaxed">Choose the tier that scales with your ambition. Professional coordination for professional squads.</p>
          <div className="flex items-center justify-center gap-2 text-primary font-black uppercase tracking-widest text-[10px] bg-primary/5 w-fit mx-auto px-4 py-2 rounded-full border border-primary/10">
            <AlertCircle className="h-3 w-3" />
            <span>Limited Time Promotional Rates • Subject to change</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 pt-4">
          <Tabs defaultValue="monthly" className="w-[300px]" onValueChange={(v) => setBillingCycle(v as any)}>
            <TabsList className="grid w-full grid-cols-2 rounded-full h-14 p-1 bg-muted/50 border-2">
              <TabsTrigger value="monthly" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary shadow-sm">Monthly</TabsTrigger>
              <TabsTrigger value="annual" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary shadow-sm">Annual</TabsTrigger>
            </TabsList>
          </Tabs>
          {billingCycle === 'annual' && <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] uppercase tracking-widest px-4 h-7 flex items-center gap-2"><Sparkles className="h-3 w-3" /> Save with Annual</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        <Card className={cn(
          "rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white",
          user?.activePlanId === 'starter_squad' && "ring-4 ring-muted-foreground/20"
        )}>
          <div className="h-2 w-full bg-muted-foreground/20" />
          <CardHeader className="p-10 pb-6 space-y-4">
            <div className="flex justify-between items-start">
              <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 flex items-center border-primary/20 text-primary w-fit">GRASSROOTS</Badge>
              {user?.activePlanId === 'starter_squad' && <Badge className="bg-muted text-muted-foreground font-black text-[8px] px-2 h-5 border-none uppercase">Current Plan</Badge>}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight">Starter</CardTitle>
              <span className="text-5xl font-black tracking-tighter">$0</span>
            </div>
            <CardDescription className="text-xs font-bold text-muted-foreground">Essential coordination for growing grassroots teams.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8">
            <div className="pt-6 border-t border-muted space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Included</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Basic Scheduling</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Live Score Tracking</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Basic Roster</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Basic Tournament</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0">
            <Button variant="outline" disabled className="w-full h-14 rounded-2xl font-black uppercase opacity-50">
              {user?.activePlanId === 'starter_squad' ? "Current Plan" : "Free Tier"}
            </Button>
          </CardFooter>
        </Card>

        <Card className={cn(
          "rounded-[3rem] border-none shadow-2xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.05] ring-4 ring-primary bg-black text-white relative z-10 animate-in zoom-in-95",
          user?.activePlanId === 'squad_pro' && "ring-offset-4 ring-offset-background"
        )}>
          <div className="absolute inset-0 bg-primary/5 pointer-events-none animate-pulse" />
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-4 relative z-10">
            <div className="flex justify-between items-start">
              <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase w-fit">ELITE PRO</Badge>
              {user?.activePlanId === 'squad_pro' && <Badge className="bg-white text-black font-black text-[8px] px-2 h-5 border-none uppercase">Current Plan</Badge>}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight text-white">Squad Pro</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tracking-tighter text-primary">{getDisplayPrice(proPlan)}</span>
                <span className="text-xs font-black uppercase opacity-60 text-white/60">{getCycleLabel(proPlan)}</span>
              </div>
            </div>
            <CardDescription className="text-xs font-bold text-white/60">Full-scale coordination, analytics & Elite Hub for pro squads.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8 relative z-10">
            <div className="pt-6 border-t border-white/10 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Professional Engine</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Elite Tournament Hub</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Meetings & Events</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Training Vault</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Performance Stats</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0 relative z-10">
            <Button 
              className={cn(
                "w-full h-14 rounded-2xl font-black shadow-xl",
                user?.activePlanId === 'squad_pro' ? "bg-muted text-muted-foreground opacity-50" : "bg-white text-black hover:bg-white/90"
              )} 
              onClick={purchasePro}
              disabled={user?.activePlanId === 'squad_pro'}
            >
              {user?.activePlanId === 'squad_pro' ? "Current Plan" : "Upgrade to Elite"}
            </Button>
          </CardFooter>
        </Card>

        <Card className={cn(
          "rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white",
          isSubscriber && "ring-4 ring-primary/20"
        )}>
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-6 text-center md:text-left">
            <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-4">
              <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-4 h-6 flex items-center border-primary/20 text-primary w-fit rounded-full mx-auto md:mx-0">CLUB MANAGER</Badge>
              {isSubscriber && (
                <Badge className="bg-primary/10 text-primary font-black text-[8px] px-2 h-5 border-none uppercase">Current Plan</Badge>
              )}
            </div>
            
            <CardTitle className="text-5xl font-black uppercase tracking-tight leading-none text-primary">CLUB<br className="hidden md:block" /> SUITE</CardTitle>
            
            <div className="space-y-1">
              <p className="text-[11px] font-black uppercase tracking-tight text-black leading-tight">
                INCLUDES ALL SQUAD PRO FEATURES + CLUB HUB MANAGEMENT
              </p>
            </div>
          </CardHeader>

          <CardContent className="p-10 pt-0 flex-1 space-y-8">
            <div className="pt-6 border-t border-muted space-y-6">
              {isSubscriber && (
                <div className="space-y-2">
                  <div className="flex justify-between items-end mb-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Active Seats</p>
                    <p className="text-xs font-black text-primary">{proQuotaStatus.current} / {proQuotaStatus.limit}</p>
                  </div>
                  <Progress value={quotaPercentage} className="h-2 bg-muted rounded-full" />
                  <p className="text-[8px] font-bold text-muted-foreground uppercase text-center">{proQuotaStatus.remaining} Pro slots remaining</p>
                </div>
              )}
              
              <div className="space-y-6">
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-black border-b pb-2">ORGANIZATION SCALING</p>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {clubPlans.map(cp => {
                    const isCurrentSub = user?.activePlanId === cp.id;
                    const priceLabel = billingCycle === 'annual' ? cp.annualPriceDisplay : cp.priceDisplay;
                    const cycleLabel = (priceLabel === 'Custom' || priceLabel === '$0') ? '' : (billingCycle === 'annual' ? '/yr' : '/mo');

                    return (
                      <div key={cp.id} className={cn(
                        "flex flex-col p-6 rounded-[2rem] border-2 transition-all group gap-4",
                        isCurrentSub ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/20 border-transparent hover:border-muted/40"
                      )}>
                        <div className="space-y-1">
                          <h4 className="text-base font-black uppercase tracking-tight leading-none">{cp.name}</h4>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{cp.proTeamLimit} Teams</p>
                        </div>
                        
                        <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-muted/50">
                          <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-primary leading-none">{priceLabel}</span>
                            <span className="text-[9px] font-bold uppercase text-muted-foreground">{cycleLabel}</span>
                          </div>
                          <Button 
                            className={cn(
                              "w-full h-12 rounded-xl font-black uppercase tracking-widest text-[10px] shadow-lg",
                              isCurrentSub ? "bg-muted text-muted-foreground" : "bg-black text-white hover:bg-black/80 shadow-black/20"
                            )}
                            onClick={cp.isContactOnly ? () => setIsContactOpen(true) : purchasePro}
                            disabled={isCurrentSub}
                          >
                            {isCurrentSub ? "Active" : cp.isContactOnly ? "Quote" : "Select Tier"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="p-10 pt-0">
            <Button className="w-full h-16 rounded-2xl text-xl font-black shadow-xl bg-primary text-white active:scale-95 transition-all" onClick={purchasePro}>
              Scale Organization
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="bg-muted/30 p-12 rounded-[3rem] text-center border-2 border-dashed flex flex-col items-center gap-6">
        <div className="bg-white p-4 rounded-3xl shadow-xl">
          <Infinity className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h3 className="text-2xl font-black uppercase tracking-tight">Unlimited Multi-Team Support</h3>
          <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest max-w-3xl mx-auto leading-relaxed">
            Every user can manage an unlimited number of **FREE Starter Squads** under a single email. Professional features are enabled per-team through organization seat quotas.
          </p>
        </div>
      </div>

      <div className="bg-black text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden mt-20">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none -rotate-12"><Building className="h-64 w-64" /></div>
        <div className="flex items-center gap-8 relative z-10">
          <div className="bg-primary w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-xl shrink-0"><Star className="h-10 w-10 text-white" /></div>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3">Elite Infrastructure</Badge>
            <h3 className="text-3xl font-black tracking-tight uppercase leading-none mt-2">Club Solutions</h3>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest mt-1">Master coordination for any scale</p>
          </div>
        </div>
        <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary" className="rounded-full px-10 h-14 bg-white text-black hover:bg-white/90 font-black uppercase text-[10px] tracking-[0.2em] shadow-2xl relative z-20">
              Contact Enterprise
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
            <div className="h-2 bg-primary w-full absolute top-0 left-0" />
            <DialogHeader className="mb-6 pt-4"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Enterprise Infrastructure</DialogTitle></DialogHeader>
            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Club Email</Label><Input required type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
              <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organization</Label><Input required value={leadForm.organization} onChange={e => setLeadForm(p => ({ ...p, organization: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
              <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 mt-4">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Contact Sales"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="text-center pt-4 space-y-2">
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] opacity-40">The Squad Coordination Engine v1.0.0</p>
        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-[0.1em] opacity-30 italic">All prices listed are current promotional rates and are subject to change without notice.</p>
      </div>
    </div>
  );
}
