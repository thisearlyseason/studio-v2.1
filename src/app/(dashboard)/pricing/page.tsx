
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
  AlertCircle,
  DollarSign,
  CreditCard
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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

export default function PricingPage() {
  const { purchasePro, user, plans, isPlansLoading, proQuotaStatus } = useTeam();
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

  const getPrice = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return '$--';
    if (planId === 'starter_squad') return '$0';
    if (planId === 'squad_pro') return billingCycle === 'annual' ? '$199' : '$19.99';
    if (planId === 'elite_teams') return billingCycle === 'annual' ? '$1,100' : '$110';
    if (planId === 'elite_league') return billingCycle === 'annual' ? '$2,790' : '$279';
    return 'Custom';
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // In a real app, this would call a server action or API
    await new Promise(r => setTimeout(r, 1500));
    setIsContactOpen(false);
    setIsSubmitting(false);
    toast({ title: "Inquiry Received", description: "Our tactical experts will reach out shortly." });
  };

  if (isPlansLoading && plans.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Syncing Subscription Catalog...</p>
      </div>
    );
  }

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
        {/* Starter */}
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
          <CardHeader className="p-8 pb-4 space-y-4">
            <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">GRASSROOTS</Badge>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Starter</CardTitle>
              <span className="text-4xl font-black tracking-tighter">$0</span>
            </div>
            <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">Basic coordination for unlimited teams.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 flex-1 space-y-6">
            <div className="pt-4 border-t space-y-3">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Included</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Basic Scheduling</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Tactical Chats</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Score Tracking</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3.5 w-3.5 text-primary" /> Basic Playbook</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0">
            <Button variant="outline" disabled className="w-full h-12 rounded-xl font-black uppercase opacity-50 text-xs">Free Tier</Button>
          </CardFooter>
        </Card>

        {/* Squad Pro */}
        <Card className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden flex flex-col bg-black text-white ring-4 ring-primary relative">
          <CardHeader className="p-8 pb-4 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[8px] px-3 h-5 uppercase w-fit">ELITE PRO</Badge>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Squad Pro</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tighter text-primary">{getPrice('squad_pro')}</span>
                <span className="text-[10px] font-black uppercase opacity-60">{billingCycle === 'annual' ? '/yr' : '/mo'}</span>
              </div>
            </div>
            <CardDescription className="text-[10px] font-bold text-white/60 uppercase">1 Pro Team + Unlimited Starter Teams.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 flex-1 space-y-6">
            <div className="pt-4 border-t border-white/10 space-y-3">
              <p className="text-[9px] font-black uppercase text-white/40">Everything in Starter +</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CircleCheck className="h-3.5 w-3.5 text-primary" /> Full Tournament Hub</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CircleCheck className="h-3.5 w-3.5 text-primary" /> Attendance Tracking</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CircleCheck className="h-3.5 w-3.5 text-primary" /> Analytics & Stats</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CircleCheck className="h-3.5 w-3.5 text-primary" /> Payments & Docs</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0">
            <Button className="w-full h-12 rounded-xl font-black shadow-xl bg-white text-black hover:bg-white/90 text-xs" onClick={purchasePro}>Upgrade Squad</Button>
          </CardFooter>
        </Card>

        {/* Elite Teams */}
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
          <CardHeader className="p-8 pb-4 space-y-4">
            <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">ORGANIZATION</Badge>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Elite Teams</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tighter text-primary">{getPrice('elite_teams')}</span>
                <span className="text-[10px] font-black uppercase opacity-60 text-muted-foreground">{billingCycle === 'annual' ? '/yr' : '/mo'}</span>
              </div>
            </div>
            <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">Up to 8 Pro Teams + Club Hub.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 flex-1 space-y-6">
            <div className="pt-4 border-t space-y-3">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Club Features</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Master Club Hub</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> League Management</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Enrollment Logistics</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 8 Pro Team Seats</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0">
            <Button className="w-full h-12 rounded-xl font-black shadow-xl text-xs" onClick={purchasePro}>Deploy Club</Button>
          </CardFooter>
        </Card>

        {/* Elite League */}
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden flex flex-col bg-white ring-1 ring-black/5">
          <CardHeader className="p-8 pb-4 space-y-4">
            <Badge variant="outline" className="font-black uppercase text-[8px] tracking-widest px-3 h-5 border-primary/20 text-primary w-fit">INSTITUTIONAL</Badge>
            <div className="space-y-1">
              <CardTitle className="text-2xl font-black uppercase tracking-tight">Elite League</CardTitle>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black tracking-tighter text-primary">{getPrice('elite_league')}</span>
                <span className="text-[10px] font-black uppercase opacity-60 text-muted-foreground">{billingCycle === 'annual' ? '/yr' : '/mo'}</span>
              </div>
            </div>
            <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">20 Pro Teams + Institutional Support.</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 flex-1 space-y-6">
            <div className="pt-4 border-t space-y-3">
              <p className="text-[9px] font-black uppercase text-muted-foreground">Elite Features</p>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Full Organization Hub</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Tournament Series</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Priority Infrastructure</li>
                <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> 20 Pro Team Seats</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-0">
            <Button className="w-full h-12 rounded-xl font-black shadow-xl text-xs" onClick={purchasePro}>Deploy League</Button>
          </CardFooter>
        </Card>
      </div>

      <div className="bg-muted/30 p-12 rounded-[3rem] text-center border-2 border-dashed flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6 text-left">
          <div className="bg-white p-4 rounded-3xl shadow-xl shrink-0">
            <Building className="h-10 w-10 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Need even more scale?</h3>
            <p className="text-muted-foreground font-bold text-sm uppercase tracking-widest">Enterprise and multi-organization custom tiers.</p>
          </div>
        </div>
        <Button size="lg" className="rounded-full px-10 h-14 font-black uppercase text-xs tracking-widest shadow-xl" onClick={() => setIsContactOpen(true)}>Contact Custom</Button>
      </div>

      <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
        <DialogContent className="rounded-[2.5rem] p-8 border-none shadow-2xl">
          <div className="h-2 bg-primary w-full absolute top-0 left-0" />
          <DialogHeader className="mb-6 pt-4">
            <DialogTitle className="text-2xl font-black uppercase tracking-tight">Enterprise Infrastructure</DialogTitle>
            <DialogDescription className="font-bold text-primary text-[10px] uppercase tracking-widest">Connect with our tactical experts</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Official Email</Label><Input required type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organization</Label><Input required value={leadForm.organization} onChange={e => setLeadForm(p => ({ ...p, organization: e.target.value }))} className="h-12 rounded-xl font-bold" /></div>
            <div className="space-y-2"><Label className="text-[10px] font-black uppercase tracking-widest ml-1">Brief Narrative</Label><Textarea value={leadForm.message} onChange={e => setLeadForm(p => ({ ...p, message: e.target.value }))} className="rounded-xl min-h-[100px]" /></div>
            <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 mt-4">{isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Request Custom Quote"}</Button>
          </form>
        </DialogContent>
      </Dialog>
      
      <div className="text-center pt-4 space-y-2 opacity-40">
        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">The Squad Coordination Engine v1.0.0</p>
        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-[0.1em] italic">All prices listed are current promotional rates and are subject to change without notice.</p>
      </div>
    </div>
  );
}
