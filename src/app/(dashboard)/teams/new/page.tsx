
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useTeam } from '@/components/providers/team-provider';
import { ChevronLeft, Sparkles, CreditCard, ShieldCheck, Check, Zap, Trophy, Lock, AlertTriangle, Infinity, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function NewTeamForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createNewTeam, isSuperAdmin, canAddProTeam, proQuotaStatus } = useTeam();
  
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [organizerPosition, setOrganizerPosition] = useState('Coach');
  const [selectedPlan, setSelectedPlan] = useState<'starter_squad' | 'squad_pro'>('starter_squad');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const planParam = searchParams.get('plan');
    if (planParam === 'pro') {
      setSelectedPlan('squad_pro');
    } else if (planParam === 'starter') {
      setSelectedPlan('starter_squad');
    }
  }, [searchParams]);

  const handleCreate = async () => {
    if (!teamName.trim()) return;

    setIsProcessing(true);
    try {
      await createNewTeam(teamName, organizerPosition, description, selectedPlan);
      router.push('/feed');
    } catch (e) {
      setIsProcessing(false);
    }
  };

  const isProSelected = selectedPlan === 'squad_pro';
  const overQuota = isProSelected && !canAddProTeam && !isSuperAdmin;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4 pb-20">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-2 hover:bg-primary/5 text-muted-foreground font-bold">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Dashboard
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white ring-1 ring-black/5">
            <div className="h-2 hero-gradient w-full" />
            <CardHeader className="space-y-1 p-8 lg:p-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-3xl font-black tracking-tight uppercase">New Squad Hub</CardTitle>
                <div className="bg-primary/10 p-2 rounded-xl">
                  <Trophy className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardDescription className="font-bold text-muted-foreground uppercase tracking-widest text-[10px]">
                Establish a new center for tactical coordination
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 p-8 lg:p-10 pt-0">
              <div className="space-y-2">
                <Label htmlFor="teamName" className="text-[10px] font-black uppercase tracking-widest ml-1">Official Name</Label>
                <Input 
                  id="teamName" 
                  placeholder="e.g. Westside Warriors" 
                  value={teamName} 
                  onChange={(e) => setTeamName(e.target.value)} 
                  className="h-14 text-xl rounded-2xl font-black border-2 focus:ring-primary/20" 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Biography</Label>
                <Textarea 
                  id="description" 
                  placeholder="Define your team's mission and history..." 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  className="rounded-2xl min-h-[120px] p-4 resize-none font-bold border-2 focus:ring-primary/20" 
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1 text-primary">Your Leadership Role</Label>
                <Select value={organizerPosition} onValueChange={setOrganizerPosition}>
                  <SelectTrigger className="h-14 rounded-2xl font-black border-2 bg-primary/5 border-primary/10"><SelectValue placeholder="Select your role..." /></SelectTrigger>
                  <SelectContent className="rounded-2xl p-2">
                    <SelectItem value="Coach" className="rounded-xl font-bold">Head Coach</SelectItem>
                    <SelectItem value="Team Lead" className="rounded-xl font-bold">Team Lead</SelectItem>
                    <SelectItem value="Assistant Coach" className="rounded-xl font-bold">Assistant Coach</SelectItem>
                    <SelectItem value="Squad Leader" className="rounded-xl font-bold">Squad Leader</SelectItem>
                    <SelectItem value="Manager" className="rounded-xl font-bold">Organization Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Tier Protocol</h3>
            
            <div 
              className={cn(
                "p-6 rounded-[2rem] border-2 cursor-pointer transition-all space-y-3 relative overflow-hidden",
                selectedPlan === 'starter_squad' ? "bg-white border-black shadow-xl ring-4 ring-black/5" : "bg-muted/30 border-transparent opacity-60 hover:opacity-100"
              )}
              onClick={() => setSelectedPlan('starter_squad')}
            >
              <div className="flex justify-between items-center relative z-10">
                <span className="font-black text-sm uppercase tracking-widest">Starter Squad</span>
                {selectedPlan === 'starter_squad' && <div className="bg-black text-white rounded-full p-1"><Check className="h-3 w-3" /></div>}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Basic coordination for grassroots teams.</p>
              <div className="flex items-center gap-2">
                <p className="font-black text-xl">Free</p>
                <Badge className="bg-green-100 text-green-700 border-none font-black text-[8px] h-4 px-1.5 uppercase tracking-tighter">Unlimited Teams</Badge>
              </div>
            </div>

            <div 
              className={cn(
                "p-6 rounded-[2rem] border-2 cursor-pointer transition-all space-y-3 relative overflow-hidden",
                selectedPlan === 'squad_pro' ? "bg-black text-white border-primary shadow-xl shadow-primary/10 ring-4 ring-primary/5" : "bg-muted/30 border-transparent opacity-60 hover:opacity-100"
              )}
              onClick={() => setSelectedPlan('squad_pro')}
            >
              <div className="absolute top-0 right-0 p-4 opacity-10 -rotate-12">
                <Sparkles className="h-12 w-12" />
              </div>
              <div className="flex justify-between items-center relative z-10">
                <span className="font-black text-sm uppercase tracking-widest">Elite Pro</span>
                {selectedPlan === 'squad_pro' && <div className="bg-primary text-white rounded-full p-1"><Zap className="h-3 w-3 fill-current" /></div>}
              </div>
              <p className={cn("text-[10px] font-bold uppercase leading-tight relative z-10", selectedPlan === 'squad_pro' ? "text-white/60" : "text-muted-foreground")}>
                Full-scale coordination, analytics & playbooks.
              </p>
              <div className="flex items-baseline gap-1 relative z-10">
                <p className="font-black text-xl text-primary">$12.99</p>
                <span className="text-[8px] font-black opacity-40 uppercase">/ team / mo</span>
              </div>
            </div>
          </div>

          {overQuota && (
            <Card className="border-none shadow-xl rounded-[1.5rem] bg-red-50 overflow-hidden ring-2 ring-red-100 animate-in zoom-in-95">
              <CardContent className="p-5 flex gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm self-start">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-red-600 uppercase tracking-widest leading-none">Pro Quota Depleted</p>
                    <p className="text-[10px] font-bold text-red-900/70 leading-relaxed">
                      You have used all {proQuotaStatus.limit} Pro seats. Upgrade your organization tier to unlock more Elite Squads.
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline" className="h-8 text-[9px] font-black uppercase tracking-widest rounded-lg border-red-200 text-red-600 hover:bg-red-600 hover:text-white transition-all w-full">
                    <Link href="/pricing">Expand Organization</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="bg-primary/5 p-6 rounded-[2rem] border-2 border-dashed border-primary/20 space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <Check className="h-3 w-3" /> Included Strategy
            </h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-3 text-[10px] font-bold uppercase text-foreground/80"><Check className="h-3 w-3 text-primary stroke-[3px]" /> Multi-Team Switching</li>
              <li className="flex items-center gap-3 text-[10px] font-bold uppercase text-foreground/80"><Check className="h-3 w-3 text-primary stroke-[3px]" /> Live Squad Broadcasts</li>
              {selectedPlan === 'squad_pro' && (
                <>
                  <li className="flex items-center gap-3 text-[10px] font-bold uppercase text-foreground/80"><Check className="h-3 w-3 text-primary stroke-[3px]" /> Advanced Stats</li>
                  <li className="flex items-center gap-3 text-[10px] font-bold uppercase text-foreground/80"><Check className="h-3 w-3 text-primary stroke-[3px]" /> 10GB Media Vault</li>
                  <li className="flex items-center gap-3 text-[10px] font-bold uppercase text-foreground/80"><Check className="h-3 w-3 text-primary stroke-[3px]" /> RSVP Tracking</li>
                </>
              )}
            </ul>
          </div>

          <Button 
            className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" 
            disabled={!teamName.trim() || isProcessing || overQuota} 
            onClick={handleCreate}
          >
            {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : selectedPlan === 'squad_pro' ? "Deploy Pro Squad" : "Deploy Starter Squad"}
          </Button>
          
          <div className="flex items-center justify-center gap-2 text-muted-foreground opacity-40">
            <ShieldCheck className="h-3 w-3" />
            <span className="text-[8px] font-black uppercase tracking-widest">Enterprise Security Active</span>
          </div>
        </div>
      </div>
      
      <div className="bg-muted/30 p-10 rounded-[3rem] text-center border-2 border-dashed flex flex-col items-center gap-4">
        <div className="bg-white p-3 rounded-2xl shadow-sm">
          <Infinity className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h4 className="text-sm font-black uppercase">Unlimited Multi-Team Support</h4>
          <p className="text-xs text-muted-foreground font-medium leading-relaxed max-w-xl mx-auto">
            Your coordination is never restricted. Create an unlimited number of **Starter Squads** for free under this account. Elite Pro features are managed via organization quotas—upgrade anytime to scale your professional infrastructure.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NewTeamPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
      <NewTeamForm />
    </Suspense>
  );
}
