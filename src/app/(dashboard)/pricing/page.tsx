
"use client";

import React, { useState } from 'react';
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
  Shield
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
  DialogFooter
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  if (isLoading) return <div className="flex flex-col items-center justify-center py-20 gap-4"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Subscription Catalog...</p></div>;

  return (
    <div className="space-y-12 pb-20 max-w-6xl mx-auto">
      <div className="text-center space-y-6">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">Institutional Infrastructure</Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none uppercase">Elite <span className="text-primary italic">Strategy.</span></h1>
        <p className="text-muted-foreground font-medium text-lg pt-2 max-w-2xl mx-auto leading-relaxed">Choose the tier that scales with your ambition. Professional coordination for professional squads.</p>

        <div className="flex flex-col items-center gap-4 pt-4">
          <Tabs defaultValue="monthly" className="w-[300px]" onValueChange={(v) => setBillingCycle(v as any)}>
            <TabsList className="grid w-full grid-cols-2 rounded-full h-14 p-1 bg-muted/50 border-2">
              <TabsTrigger value="monthly" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary shadow-sm">Monthly</TabsTrigger>
              <TabsTrigger value="annual" className="rounded-full font-black text-xs uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:text-primary shadow-sm">Annual</TabsTrigger>
            </TabsList>
          </Tabs>
          {billingCycle === 'annual' && <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] uppercase tracking-widest px-4 h-7 animate-in zoom-in-95"><Sparkles className="h-3 w-3 mr-2" /> Save 20% with Annual</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {plans?.map((plan) => {
          const isCurrent = activeTeam?.planId === plan.id;
          const isStarter = plan.id === 'starter_squad';
          const isClub = plan.id === 'squad_organization';
          const isPro = plan.id === 'squad_pro' || plan.id === 'squad_duo' || plan.id === 'squad_crew';
          
          const displayPrice = (billingCycle === 'annual' && plan.annualPriceDisplay) ? plan.annualPriceDisplay : plan.priceDisplay;
          const displayCycle = displayPrice === 'Free' || displayPrice === 'Custom' ? '' : (billingCycle === 'annual' ? '/yr' : '/mo');

          return (
            <Card key={plan.id} className={cn("rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02]", isCurrent ? "ring-4 ring-primary shadow-primary/20 scale-[1.02] z-10" : "bg-white ring-1 ring-black/5")}>
              <div className={cn("h-2 w-full", isStarter ? "bg-muted-foreground/20" : isClub ? "bg-black" : "bg-primary")} />
              <CardHeader className="p-10 pb-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className="mb-2 font-black uppercase text-[8px] tracking-widest border-primary/20 text-primary">{plan.billingType}</Badge>
                    <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none">{plan.name}</CardTitle>
                  </div>
                  {isCurrent && <Badge className="bg-primary text-white border-none font-black text-[10px] px-3 h-6 uppercase shadow-lg">Active Squad</Badge>}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tighter">{displayPrice}</span>
                  <span className="text-xs font-black uppercase text-muted-foreground opacity-60">{displayCycle}</span>
                </div>
                <CardDescription className="text-xs font-bold leading-relaxed">{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="p-10 pt-0 flex-1 space-y-8">
                <div className="pt-6 border-t space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Capabilities</p>
                  <ul className="space-y-3">
                    {Object.entries(plan.features).filter(([_, v]) => v).slice(0, 6).map(([key]) => (
                      <li key={key} className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight">
                        <Check className="h-4 w-4 text-primary shrink-0" />
                        <span>{key.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                    {isPro && <li className="flex items-center gap-3 text-[11px] font-black uppercase tracking-tight text-primary"><Shield className="h-4 w-4 shrink-0" /> League Creation Enabled</li>}
                  </ul>
                </div>
              </CardContent>

              <CardFooter className="p-10 pt-0">
                {plan.isContactOnly ? (
                  <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-14 rounded-2xl text-base font-black bg-black text-white hover:bg-black/90 shadow-xl">Inquire Organization <ArrowRight className="ml-2 h-4 w-4" /></Button>
                    </DialogTrigger>
                    <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
                      <DialogHeader className="mb-6"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Enterprise Infrastructure</DialogTitle></DialogHeader>
                      <form onSubmit={handleContactSubmit} className="space-y-4">
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Club Email</Label><Input required type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
                        <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organization</Label><Input required value={leadForm.organization} onChange={e => setLeadForm(p => ({ ...p, organization: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
                        <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 mt-4">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Contact Sales"}</Button>
                      </form>
                    </DialogContent>
                  </Dialog>
                ) : isCurrent ? (
                  <Button variant="outline" disabled className="w-full h-14 rounded-2xl text-base font-black border-2 opacity-50 uppercase tracking-widest">Active Plan</Button>
                ) : (
                  <Button className="w-full h-14 rounded-2xl text-base font-black bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20" onClick={purchasePro}>Select Tier</Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="bg-black text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none -rotate-12"><Building className="h-64 w-64" /></div>
        <div className="flex items-center gap-8 relative z-10">
          <div className="bg-primary w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-xl shadow-primary/20"><Star className="h-10 w-10 text-white" /></div>
          <div className="space-y-1">
            <h3 className="text-3xl font-black tracking-tight uppercase leading-none">Club Solutions</h3>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Master coordination for 15+ teams</p>
          </div>
        </div>
        <div className="max-w-md relative z-10 space-y-4">
          <p className="text-sm font-medium text-white/40 leading-relaxed italic">Managing an entire league or a large regional club? Our Enterprise Organization plan provides custom white-label coordination hubs, priority operational support, and bulk team provisioning.</p>
          <Button variant="outline" className="rounded-full px-10 h-12 border-white/20 text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-[0.2em]">Contact Enterprise</Button>
        </div>
      </div>
    </div>
  );
}
