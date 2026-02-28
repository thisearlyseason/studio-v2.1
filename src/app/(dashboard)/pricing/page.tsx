
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Check, 
  Sparkles, 
  Trophy, 
  Users, 
  MessageSquare, 
  Mail, 
  ShieldCheck, 
  ArrowRight,
  Loader2,
  Lock,
  Globe
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
import { Textarea } from '@/components/ui/textarea';

export default function PricingPage() {
  const { activeTeam, isPro, purchasePro, submitLead, user } = useTeam();
  const db = useFirestore();
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Lead Form State
  const [leadForm, setLeadForm] = useState({
    name: user?.name || '',
    email: user?.email || '',
    organization: '',
    teamCount: '',
    message: ''
  });

  const plansQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(collection(db, 'plans'), orderBy('billingType', 'asc'));
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
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Loading Tiers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20">
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <Badge variant="secondary" className="bg-primary/5 text-primary border-none font-black px-4 py-1 uppercase tracking-widest text-[10px]">
          Elite Plans
        </Badge>
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter leading-none uppercase">
          Scale Your <span className="text-primary italic">Squad.</span>
        </h1>
        <p className="text-muted-foreground font-medium text-lg pt-2 leading-relaxed">
          From grassroots teams to regional leagues, The Squad provides the coordination infrastructure built for champions.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans?.filter(p => p.isPublic).map((plan) => {
          const isCurrent = activeTeam?.planId === plan.id;
          const isProPlan = plan.billingType === 'monthly' || plan.billingType === 'annual';
          const isContact = plan.isContactOnly;

          return (
            <Card 
              key={plan.id} 
              className={cn(
                "rounded-[3rem] border-none shadow-xl overflow-hidden flex flex-col transition-all duration-500 hover:scale-[1.02]",
                isProPlan ? "bg-black text-white ring-4 ring-primary/20" : "bg-white",
                isCurrent && "ring-4 ring-primary"
              )}
            >
              <div className={cn("h-2 w-full", isProPlan ? "bg-primary" : "bg-muted")} />
              <CardHeader className="p-10 pb-6 space-y-4">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className={cn("text-[10px] font-black uppercase tracking-[0.2em]", isProPlan ? "text-primary" : "text-muted-foreground")}>
                      {plan.name}
                    </p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-5xl font-black">{plan.priceDisplay}</span>
                      <span className={cn("text-xs font-bold uppercase", isProPlan ? "text-white/40" : "text-muted-foreground")}>
                        {plan.billingCycle}
                      </span>
                    </div>
                  </div>
                  {isCurrent && <Badge className="bg-primary text-white font-black text-[8px] uppercase px-2 h-5">Current</Badge>}
                </div>
                <CardDescription className={cn("text-sm font-medium", isProPlan ? "text-white/60" : "text-muted-foreground")}>
                  {plan.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="p-10 pt-0 flex-1">
                <ul className="space-y-4">
                  {Object.entries(plan.features)
                    .filter(([_, enabled]) => enabled)
                    .slice(0, 6)
                    .map(([key], i) => (
                      <li key={i} className="flex items-center gap-3 text-sm font-bold">
                        <Check className={cn("h-4 w-4", isProPlan ? "text-primary" : "text-primary")} />
                        <span className="capitalize">{key.replace(/_/g, ' ')}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>

              <CardFooter className="p-10 pt-0">
                {isContact ? (
                  <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
                    <DialogTrigger asChild>
                      <Button className="w-full h-14 rounded-2xl text-lg font-black bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20">
                        Contact Us <ArrowRight className="ml-2 h-5 w-5" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl rounded-[2.5rem] overflow-hidden p-0 border-none shadow-2xl">
                      <div className="h-2 bg-primary w-full" />
                      <div className="grid grid-cols-1 lg:grid-cols-2">
                        <div className="p-10 bg-primary/5 border-r space-y-6">
                          <DialogHeader>
                            <DialogTitle className="text-3xl font-black tracking-tight uppercase">Custom Coordination</DialogTitle>
                            <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">League & Club Solutions</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-6 pt-4">
                            <div className="flex items-center gap-4">
                              <div className="bg-white p-3 rounded-xl shadow-sm text-primary"><Globe className="h-5 w-5" /></div>
                              <p className="text-xs font-bold leading-relaxed">Multi-team dashboards and centralized roster management.</p>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="bg-white p-3 rounded-xl shadow-sm text-primary"><ShieldCheck className="h-5 w-5" /></div>
                              <p className="text-xs font-bold leading-relaxed">Priority support and dedicated coordination experts.</p>
                            </div>
                          </div>
                        </div>
                        <div className="p-10">
                          <form onSubmit={handleContactSubmit} className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Full Name</Label>
                              <Input required value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Club Email</Label>
                              <Input required type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} className="h-11 rounded-xl" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Organization</Label>
                              <Input required value={leadForm.organization} onChange={e => setLeadForm(p => ({ ...p, organization: e.target.value }))} className="h-11 rounded-xl" placeholder="e.g. Westside League" />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Team Count</Label>
                              <Input required type="number" value={leadForm.teamCount} onChange={e => setLeadForm(p => ({ ...p, teamCount: e.target.value }))} className="h-11 rounded-xl" placeholder="Estimated teams" />
                            </div>
                            <Button disabled={isSubmitting} className="w-full h-14 rounded-2xl text-lg font-black mt-4 shadow-xl shadow-primary/20">
                              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : "Send Inquiry"}
                            </Button>
                          </form>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : isCurrent ? (
                  <Button variant="outline" disabled className="w-full h-14 rounded-2xl text-lg font-black border-2 opacity-50">
                    Active Plan
                  </Button>
                ) : isProPlan ? (
                  <Button 
                    className="w-full h-14 rounded-2xl text-lg font-black bg-primary text-white hover:bg-primary/90 shadow-xl shadow-primary/20 active:scale-95 transition-all"
                    onClick={purchasePro}
                  >
                    Select Pro
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full h-14 rounded-2xl text-lg font-black border-2 hover:bg-muted/50">
                    Select Starter
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <div className="bg-primary/5 rounded-[3rem] p-12 flex flex-col md:flex-row items-center justify-between gap-8 border-2 border-dashed border-primary/20">
        <div className="flex items-center gap-6">
          <div className="bg-white w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-xl">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-2xl font-black tracking-tight">Enterprise Scaling?</h3>
            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Custom White-Label Solutions</p>
          </div>
        </div>
        <p className="text-sm font-medium text-muted-foreground max-w-sm leading-relaxed">
          Need a fully branded experience for your entire sports organization? Connect with our enterprise team for custom API access and white-labeling.
        </p>
        <Button variant="outline" className="rounded-full px-8 h-12 font-black uppercase text-[10px] tracking-widest border-2">
          Contact Sales
        </Button>
      </div>
    </div>
  );
}
