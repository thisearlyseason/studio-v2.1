
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
  CircleCheck
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
  const customPlan = useMemo(() => plans.find(p => p.id === 'squad_organization'), [plans]);

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
    const price = (billingCycle === 'annual' && plan.annualPriceDisplay) ? plan.annualPriceDisplay : plan.priceDisplay;
    // Ensure accurate annual display for pro tier specifically if seeder didn't propagate yet
    if (plan.id === 'squad_pro' && billingCycle === 'annual') return '$99';
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
          {billingCycle === 'annual' && <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] uppercase tracking-widest px-4 h-7 animate-in zoom-in-95 flex items-center gap-2"><Sparkles className="h-3 w-3" /> Save with Annual</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
        {/* STARTER SQUAD */}
        <Card className={cn("rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white")}>
          <div className="h-2 w-full bg-muted-foreground/20" />
          <CardHeader className="p-10 pb-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 flex items-center border-primary/20 text-primary">GRASSROOTS</Badge>
              {activeTeam?.planId === 'starter_squad' && <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase shadow-lg">Active Squad</Badge>}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none">Starter</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tracking-tighter">$0</span>
              </div>
            </div>
            <CardDescription className="text-xs font-bold leading-relaxed text-muted-foreground">Essential coordination for growing grassroots teams.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8">
            <div className="pt-6 border-t border-muted space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Capabilities</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><Check className="h-4 w-4 text-primary shrink-0" /> <span>Basic Schedule</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><Check className="h-4 w-4 text-primary shrink-0" /> <span>Basic Roster</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><Check className="h-4 w-4 text-primary shrink-0" /> <span>Squad Feed Read</span></li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0">
            <Button variant="outline" disabled className="w-full h-14 rounded-2xl text-base font-black border-2 opacity-50 uppercase tracking-widest">Baseline Tier</Button>
          </CardFooter>
        </Card>

        {/* SQUAD PRO - MIDDLE & ANIMATED */}
        <Card className={cn("rounded-[3rem] border-none shadow-2xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.05] ring-4 ring-primary bg-black text-white relative z-10 animate-in zoom-in-95")}>
          <div className="absolute inset-0 bg-primary/5 pointer-events-none animate-pulse" />
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-4 relative z-10">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase shadow-lg">ELITE SQUAD</Badge>
              {activeTeam?.planId === 'squad_pro' && <Badge className="bg-white text-black border-none font-black text-[8px] px-3 h-5 uppercase shadow-lg">Active Squad</Badge>}
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none text-white">Squad Pro</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-5xl font-black tracking-tighter text-primary">{getDisplayPrice(proPlan)}</span>
                <span className="text-xs font-black uppercase opacity-60 text-white/60">{getCycleLabel(proPlan)}</span>
              </div>
            </div>
            <CardDescription className="text-xs font-bold leading-relaxed text-white/60">Full-scale coordination and analytics for professional-grade squads.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8 relative z-10">
            <div className="pt-6 border-t border-white/10 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Professional Logic</p>
              <ul className="space-y-3">
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><CircleCheck className="h-4 w-4 text-primary shrink-0" /> <span>RSVP & Attendance</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><CircleCheck className="h-4 w-4 text-primary shrink-0" /> <span>Tactical Group Chat</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><CircleCheck className="h-4 w-4 text-primary shrink-0" /> <span>Media & Playbook Vault</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><CircleCheck className="h-4 w-4 text-primary shrink-0" /> <span>Score & Perf Tracking</span></li>
                <li className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-tight"><CircleCheck className="h-4 w-4 text-primary shrink-0" /> <span>League Creation</span></li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0 relative z-10">
            <Button className="w-full h-14 rounded-2xl text-base font-black bg-white text-black hover:bg-white/90 shadow-xl" onClick={purchasePro}>
              {activeTeam?.planId === 'squad_pro' ? 'Current Plan' : 'Upgrade to Pro'}
            </Button>
          </CardFooter>
        </Card>

        {/* CLUB SUITE */}
        <Card className={cn("rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02] ring-1 ring-black/5 bg-white")}>
          <div className="h-2 w-full bg-primary" />
          <CardHeader className="p-10 pb-6 space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 flex items-center border-primary/20 text-primary">CLUB MANAGER</Badge>
            </div>
            <div className="space-y-1">
              <CardTitle className="text-3xl font-black uppercase tracking-tight leading-none">Club Suite</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Includes ALL Pro Features + Hub Management</span>
              </div>
            </div>
            <CardDescription className="text-xs font-bold leading-relaxed text-muted-foreground">Consolidated management for multi-team organizations and academies.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 pt-0 flex-1 space-y-8">
            <div className="pt-6 border-t border-muted space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Organization Scaling</p>
              <div className="space-y-3">
                {clubPlans.map(cp => (
                  <div key={cp.id} className={cn(
                    "flex justify-between items-center p-3 rounded-xl border-2 transition-all",
                    activeTeam?.planId === cp.id ? "bg-primary/5 border-primary" : "bg-muted/30 border-transparent hover:border-muted"
                  )}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-tight">{cp.name.replace('Club ', '')}</span>
                      <span className="text-[8px] font-bold text-muted-foreground uppercase">{cp.proTeamLimit} Teams</span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-black text-primary">{getDisplayPrice(cp)}</span>
                      <p className="text-[7px] font-bold uppercase opacity-50">{getCycleLabel(cp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-10 pt-0">
            <Button className="w-full h-14 rounded-2xl text-base font-black shadow-xl bg-primary text-white hover:bg-primary/90 shadow-primary/20" onClick={purchasePro}>Scale Organization</Button>
          </CardFooter>
        </Card>
      </div>

      <div className="bg-muted/50 p-10 rounded-[3rem] text-center border-2 border-dashed space-y-4">
        <div className="flex items-center justify-center gap-2 text-primary">
          <Zap className="h-5 w-5 fill-current" />
          <p className="font-black uppercase tracking-widest text-sm">Flexible Grassroots Management</p>
        </div>
        <p className="text-base text-muted-foreground leading-relaxed font-bold max-w-2xl mx-auto italic">
          Manage an <span className="text-foreground">unlimited amount</span> of <span className="text-foreground">Starter Squad</span> teams for free under a single email. Upgrade individual squads to Pro or Club tiers as your organization grows.
        </p>
      </div>

      <div className="bg-black text-white rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none -rotate-12"><Building className="h-64 w-64" /></div>
        <div className="flex items-center gap-8 relative z-10">
          <div className="bg-primary w-20 h-20 rounded-[2rem] flex items-center justify-center shadow-xl shadow-primary/20 shrink-0"><Star className="h-10 w-10 text-white" /></div>
          <div className="space-y-1">
            <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[9px] h-6 px-3 shadow-lg shadow-primary/20">Elite Infrastructure</Badge>
            <h3 className="text-3xl font-black tracking-tight uppercase leading-none mt-2">Club Solutions</h3>
            <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Master coordination for any scale</p>
          </div>
        </div>
        <div className="max-w-md relative z-10 space-y-4">
          <p className="text-sm font-medium text-white/40 leading-relaxed italic">Managing an entire league or a large regional club? Our Club Custom solutions provide white-label coordination hubs, priority operational support, and bulk team provisioning for organizations with 15+ teams.</p>
          
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
      </div>
    </div>
  );
}
