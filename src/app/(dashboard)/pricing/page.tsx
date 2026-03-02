
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
  Table as TableIcon
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

export default function PricingPage() {
  const { activeTeam, purchasePro, submitLead, user, plans, isPlansLoading } = useTeam();
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

  const starterPlan = useMemo(() => plans.find(p => p.id === 'starter_squad'), [plans]);
  const proPlan = useMemo(() => plans.find(p => p.id === 'squad_pro'), [plans]);
  const clubPlans = useMemo(() => plans.filter(p => p.id.startsWith('squad_') && p.id !== 'squad_pro' && p.id !== 'squad_organization' && p.id !== 'starter_squad').sort((a, b) => (a.proTeamLimit || 0) - (b.proTeamLimit || 0)), [plans]);

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

  return (
    <div className="space-y-12 pb-20 max-w-7xl mx-auto px-4 md:px-6">
      <div className="text-center space-y-6">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1.5 uppercase tracking-widest text-[10px] h-auto whitespace-nowrap">Institutional Infrastructure</Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none uppercase">Elite <span className="text-primary italic">Strategy.</span></h1>
        <p className="text-muted-foreground font-medium text-lg pt-2 max-w-2xl mx-auto leading-relaxed">Choose the tier that scales with your ambition. Professional coordination for professional squads.</p>

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
        {/* STARTER SQUAD */}
        <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white">
          <div className="h-2 w-full bg-muted-foreground/20" />
          <CardHeader className="p-10 pb-6 space-y-4">
            <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 flex items-center border-primary/20 text-primary w-fit">GRASSROOTS</Badge>
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
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Basic Schedule</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Basic Roster</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><Check className="h-4 w-4 text-primary" /> Squad Feed Read</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0">
            <Button variant="outline" disabled className="w-full h-14 rounded-2xl font-black uppercase opacity-50">Free Tier</Button>
          </CardFooter>
        </Card>

        {/* SQUAD PRO - HIGHLIGHTED */}
        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.05] ring-4 ring-primary bg-black text-white relative z-10 animate-in zoom-in-95">
          <div className="absolute inset-0 bg-primary/5 pointer-events-none animate-pulse" />
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-4 relative z-10">
            <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase w-fit">ELITE PRO</Badge>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight text-white">Squad Pro</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tracking-tighter text-primary">{getDisplayPrice(proPlan)}</span>
                <span className="text-xs font-black uppercase opacity-60 text-white/60">{getCycleLabel(proPlan)}</span>
              </div>
            </div>
            <CardDescription className="text-xs font-bold text-white/60">Full-scale coordination, analytics & training for pro squads.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8 relative z-10">
            <div className="pt-6 border-t border-white/10 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Professional Engine</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> RSVP Tracking</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Tactical Group Chats</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Training Vault</li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase"><CircleCheck className="h-4 w-4 text-primary" /> Performance Stats</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0 relative z-10">
            <Button className="w-full h-14 rounded-2xl font-black bg-white text-black hover:bg-white/90 shadow-xl" onClick={purchasePro}>Upgrade to Elite</Button>
          </CardFooter>
        </Card>

        {/* CLUB SUITE */}
        <Card className="rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white">
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-4">
            <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 flex items-center border-primary/20 text-primary w-fit">CLUB MANAGER</Badge>
            <CardTitle className="text-3xl font-black uppercase tracking-tight">Club Suite</CardTitle>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary leading-tight">Includes ALL Squad Pro Features + Hub Management</p>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8">
            <div className="pt-6 border-t border-muted space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Organization Scaling</p>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {clubPlans.map(cp => (
                  <div key={cp.id} className="flex justify-between items-center p-3 rounded-xl border-2 transition-all bg-muted/30">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] font-black uppercase truncate">{cp.name.replace('Club ', '')}</span>
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">{cp.proTeamLimit} Teams</span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-black text-primary">{getDisplayPrice(cp)}</span>
                      <p className="text-[7px] font-bold uppercase opacity-50">{getCycleLabel(cp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0">
            <Button className="w-full h-14 rounded-2xl font-black shadow-xl bg-primary text-white" onClick={purchasePro}>Scale Organization</Button>
          </CardFooter>
        </Card>
      </div>

      {/* Add-ons Section */}
      <section className="bg-muted/50 p-10 rounded-[3rem] border-2 border-dashed space-y-8">
        <div className="text-center space-y-2">
          <Badge className="bg-amber-100 text-amber-700 font-black uppercase tracking-widest text-[9px] h-6 px-3">Pro Add-ons</Badge>
          <h2 className="text-3xl font-black uppercase">Feature Modules</h2>
        </div>
        
        <div className="max-w-xl mx-auto">
          <Card className="rounded-[2rem] border-none shadow-xl bg-white overflow-hidden group">
            <div className="p-8 flex items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                <div className="bg-primary/10 p-4 rounded-2xl text-primary group-hover:bg-primary group-hover:text-white transition-all">
                  <TableIcon className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-xl font-black uppercase tracking-tight leading-none">Tournament Hub</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Public scores, brackets & standings</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-primary">$50</p>
                <p className="text-[8px] font-bold uppercase text-muted-foreground">Per Event</p>
              </div>
            </div>
            <div className="px-8 pb-8 space-y-4">
              <ul className="grid grid-cols-2 gap-x-8 gap-y-3">
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Public Schedule View</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Dynamic Brackets</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Live Score Updates</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Waiver Management</li>
              </ul>
              <Button className="w-full h-12 rounded-xl font-black uppercase text-xs tracking-widest shadow-lg shadow-primary/20" onClick={purchasePro}>Deploy Tournament</Button>
            </div>
          </Card>
        </div>
      </section>

      <div className="bg-black text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
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
            <Button variant="outline" className="rounded-full px-10 h-12 border-white/20 text-white hover:bg-white/10 font-black uppercase text-[10px] tracking-[0.2em]">Contact Enterprise</Button>
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
      </div>
      
      <p className="text-center text-xs text-muted-foreground font-bold italic">Manage an unlimited amount of Starter Squad teams for free under a single email.</p>
    </div>
  );
}
