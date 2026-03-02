
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  Sparkles, 
  Trophy, 
  Users, 
  Mail, 
  ShieldCheck, 
  ArrowRight,
  Loader2,
  Lock,
  Globe,
  Zap,
  Info
} from 'lucide-react';
import { useTeam, Plan } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PricingPage() {
  const { activeTeam, purchasePro, submitLead, user, proQuotaStatus } = useTeam();
  const db = useFirestore();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  
  const [leadForm, setLeadForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    organization: '',
    teamCount: '',
    message: ''
  });

  const plansQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'plans'), orderBy('proTeamLimit', 'asc'));
  }, [db]);

  const { data: plans, isLoading } = useCollection<Plan>(plansQuery);

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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading Subscription Tiers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="text-center max-w-2xl mx-auto space-y-6">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">
          Subscription Catalog
        </Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none uppercase">
          Elite <span className="text-primary italic">Infrastucture.</span>
        </h1>
        <p className="text-muted-foreground font-medium text-lg pt-2 leading-relaxed">
          Select the Pro quota that scales with your ambition. Professional coordination for professional squads.
        </p>

        {/* Billing Cycle Switcher */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <Tabs defaultValue="monthly" className="w-[300px]" onValueChange={(v) => setBillingCycle(v as any)}>
            <TabsList className="grid w-full grid-cols-2 rounded-full h-14 p-1 bg-muted/50 border-2">
              <TabsTrigger value="monthly" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg">Monthly</TabsTrigger>
              <TabsTrigger value="annual" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:shadow-lg">Annual</TabsTrigger>
            </TabsList>
          </Tabs>
          {billingCycle === 'annual' && (
            <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] uppercase tracking-widest px-4 h-7 animate-in zoom-in-95">
              <Sparkles className="h-3 w-3 mr-2" /> Save 20% with Annual
            </Badge>
          )}
        </div>
      </div>

      {/* Quota Status Banner */}
      <div className="max-w-4xl mx-auto">
        <Card className="rounded-[2.5rem] bg-black text-white border-none shadow-xl overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:scale-110 transition-transform duration-700">
            <Trophy className="h-32 w-32 -rotate-12" />
          </div>
          <CardContent className="p-8 flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
            <div className="flex items-center gap-6">
              <div className="h-16 w-16 rounded-[1.5rem] bg-primary flex items-center justify-center shadow-xl shadow-primary/20">
                <Users className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black tracking-tight uppercase leading-none">Your Coordination Footprint</h3>
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest">Managing Elite Squads Across the League</p>
              </div>
            </div>
            <div className="flex items-baseline gap-4">
              <div className="text-center">
                <p className="text-4xl font-black leading-none text-primary">{proQuotaStatus.current}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-1">Active Pro</p>
              </div>
              <div className="h-10 w-[1px] bg-white/10" />
              <div className="text-center">
                <p className="text-4xl font-black leading-none">{proQuotaStatus.limit}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-white/40 mt-1">Pro Limit</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans?.filter(p => p.isPublic).map((plan) => {
          const isCurrent = user?.activePlanId === plan.id;
          const isProPlan = plan.billingType !== 'free';
          const isContact = plan.isContactOnly;
          const displayPrice = (billingCycle === 'annual' && plan.annualPriceDisplay) ? plan.annualPriceDisplay : plan.priceDisplay;
          const displayCycle = billingCycle === 'annual' ? (plan.annualPriceDisplay === 'Free' || plan.annualPriceDisplay === 'Custom' ? '' : '/yr') : (plan.priceDisplay === 'Free' || plan.priceDisplay === 'Custom' ? '' : '/mo');

          return (
            <Card 
              key={plan.id} 
              className={cn(
                "rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02]",
                isProPlan ? "bg-white ring-1 ring-black/5" : "bg-muted/30",
                isCurrent && "ring-4 ring-primary shadow-primary/20"
              )}
            >
              <div className={cn("h-1.5 w-full", isProPlan ? "bg-primary" : "bg-muted-foreground/20")} />
              <CardHeader className="p-8 pb-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isProPlan ? "text-primary" : "text-muted-foreground")}>
                      {plan.name}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black">{displayPrice}</span>
                      <span className="text-[10px] font-bold uppercase text-muted-foreground">
                        {displayCycle}
                      </span>
                    </div>
                  </div>
                  {isCurrent && <Badge className="bg-primary text-white border-none font-black text-[7px] h-4 uppercase px-1.5 shadow-sm">Current</Badge>}
                </div>
                <p className="text-[10px] font-bold text-muted-foreground leading-tight">{plan.description}</p>
              </CardHeader>

              <CardContent className="p-8 pt-0 flex-1 space-y-6">
                <div className="pt-4 border-t space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Provisioning</p>
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/5 p-2 rounded-lg text-primary"><Users className="h-3.5 w-3.5" /></div>
                    <span className="text-xs font-bold">{plan.proTeamLimit === 0 ? 'Basic only' : `${plan.proTeamLimit} Pro Team${plan.proTeamLimit > 1 ? 's' : ''}`}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground opacity-60">Key Features</p>
                  <ul className="space-y-2.5">
                    {Object.entries(plan.features)
                      .filter(([_, enabled]) => enabled)
                      .slice(0, 4)
                      .map(([key], i) => (
                        <li key={i} className="flex items-center gap-2.5 text-[10px] font-bold">
                          <Check className="h-3 w-3 text-primary shrink-0" />
                          <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              </CardContent>

              <CardFooter className="p-8 pt-0">
                {isContact ? (
                  <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-12 rounded-2xl text-xs font-black bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20">
                        Inquire <ArrowRight className="ml-2 h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md rounded-[2.5rem] p-8 border-none shadow-2xl overflow-hidden">
                      <div className="h-2 bg-primary absolute top-0 left-0 w-full" />
                      <DialogHeader className="mb-6">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight">Organization Access</DialogTitle>
                        <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[9px]">Custom Enterprise Tiers</DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleContactSubmit} className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Club Email</Label>
                          <Input required type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} className="h-11 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organization</Label>
                          <Input required value={leadForm.organization} onChange={e => setLeadForm(p => ({ ...p, organization: e.target.value }))} className="h-11 rounded-xl font-bold" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Est. Teams</Label>
                          <Input required type="number" value={leadForm.teamCount} onChange={e => setLeadForm(p => ({ ...p, teamCount: e.target.value }))} className="h-11 rounded-xl font-bold" />
                        </div>
                        <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl text-base font-black shadow-xl shadow-primary/20 mt-4">
                          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Contact Sales"}
                        </Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : isCurrent ? (
                  <Button variant="outline" disabled className="w-full h-12 rounded-2xl text-xs font-black border-2 opacity-50 uppercase tracking-widest">
                    Active Tier
                  </Button>
                ) : isProPlan ? (
                  <Button 
                    className="w-full h-12 rounded-2xl text-xs font-black bg-black text-white shadow-lg active:scale-95 transition-all uppercase tracking-widest"
                    onClick={purchasePro}
                  >
                    Select Plan
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full h-12 rounded-2xl text-xs font-black border-2 hover:bg-muted/50 uppercase tracking-widest">
                    Select Starter
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="bg-black text-white rounded-[3rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none -rotate-12">
          <Zap className="h-48 w-48" />
        </div>
        <div className="flex items-center gap-6 relative z-10">
          <div className="bg-primary w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-xl">
            <Sparkles className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black tracking-tight uppercase">Multi-Team Volume?</h3>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Scale your entire league infrastructure</p>
          </div>
        </div>
        <p className="text-xs font-medium text-white/40 max-w-sm leading-relaxed relative z-10 italic">
          Managing a regional league or a large club with 20+ teams? Our Enterprise solutions provide custom white-label coordination hubs and priority operational support.
        </p>
        <Button className="rounded-full px-10 h-12 bg-white text-black font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white/90 relative z-10 shadow-xl">
          Contact Enterprise
        </Button>
      </div>
    </div>
  );
}
