
"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { ChevronLeft, Sparkles, CreditCard, ShieldCheck, Check, Zap, Trophy, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function NewTeamPage() {
  const router = useRouter();
  const { createNewTeam, isSuperAdmin, isPaywallOpen, setIsPaywallOpen } = useTeam();
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [organizerPosition, setOrganizerPosition] = useState('Coach');
  const [selectedPlan, setSelectedPlan] = useState<'starter_squad' | 'squad_pro'>('starter_squad');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCreate = async () => {
    if (!teamName.trim()) return;

    if (selectedPlan === 'squad_pro' && !isSuperAdmin) {
      // In a real RC flow, we would wait for purchase completion
      // For this prototype, we show the paywall and then proceed
      setIsPaywallOpen(true);
      return;
    }

    setIsProcessing(true);
    try {
      await createNewTeam(teamName, organizerPosition, description, selectedPlan);
      router.push('/feed');
    } catch (e) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pt-4 pb-20">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back to Dashboard
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden">
            <div className="h-2 hero-gradient w-full" />
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl font-black tracking-tight">Create Your Squad</CardTitle>
                <Trophy className="h-5 w-5 text-primary" />
              </div>
              <CardDescription className="font-medium">Establish a new hub for coordination and communication.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="teamName" className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Name</Label>
                <Input id="teamName" placeholder="e.g. Westside Warriors" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-12 text-lg rounded-xl font-bold border-2" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Bio</Label>
                <Textarea id="description" placeholder="A brief description of your team..." value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl min-h-[100px] resize-none font-medium" />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Your Primary Role</Label>
                <Select value={organizerPosition} onValueChange={setOrganizerPosition}>
                  <SelectTrigger className="h-12 rounded-xl font-bold border-2"><SelectValue placeholder="Select your role..." /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="Coach">Coach</SelectItem>
                    <SelectItem value="Team Lead">Team Lead</SelectItem>
                    <SelectItem value="Assistant Coach">Assistant Coach</SelectItem>
                    <SelectItem value="Squad Leader">Squad Leader</SelectItem>
                    <SelectItem value="Manager">Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground ml-1">Select Tier</h3>
            
            <div 
              className={cn(
                "p-6 rounded-[2rem] border-2 cursor-pointer transition-all space-y-3",
                selectedPlan === 'starter_squad' ? "bg-white border-black shadow-lg ring-4 ring-black/5" : "bg-muted/30 border-transparent opacity-60 hover:opacity-100"
              )}
              onClick={() => setSelectedPlan('starter_squad')}
            >
              <div className="flex justify-between items-center">
                <span className="font-black text-sm uppercase tracking-widest">Starter</span>
                {selectedPlan === 'starter_squad' && <Check className="h-4 w-4" />}
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight">Basic coordination for grassroots teams.</p>
              <p className="font-black text-lg">Free</p>
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
                {selectedPlan === 'squad_pro' && <Zap className="h-4 w-4 text-primary" />}
              </div>
              <p className={cn("text-[10px] font-bold uppercase leading-tight relative z-10", selectedPlan === 'squad_pro' ? "text-white/60" : "text-muted-foreground")}>
                Full-scale coordination, analytics & playbooks.
              </p>
              <div className="flex items-baseline gap-1 relative z-10">
                <p className="font-black text-lg">$9.99</p>
                <span className="text-[8px] font-bold opacity-40 uppercase">/ team / mo</span>
              </div>
            </div>
          </div>

          <div className="bg-primary/5 p-6 rounded-[2rem] border-2 border-dashed border-primary/20">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4">Included in {selectedPlan === 'squad_pro' ? 'Pro' : 'Starter'}</h4>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Multi-Team Hub</li>
              <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Live Squad Feed</li>
              {selectedPlan === 'squad_pro' && (
                <>
                  <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Performance Analytics</li>
                  <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> Private Training Library</li>
                  <li className="flex items-center gap-2 text-[10px] font-bold uppercase"><Check className="h-3 w-3 text-primary" /> RSVP & Attendance</li>
                </>
              )}
            </ul>
          </div>

          <Button 
            className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all" 
            disabled={!teamName.trim() || isProcessing} 
            onClick={handleCreate}
          >
            {isProcessing ? "Processing Enrollment..." : selectedPlan === 'squad_pro' ? "Pay & Create Pro Squad" : "Create Starter Squad"}
          </Button>
          
          <div className="flex items-center justify-center gap-2 text-muted-foreground opacity-60">
            <ShieldCheck className="h-3 w-3" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Safe & Secure Transactions</span>
          </div>
        </div>
      </div>
      
      <div className="bg-muted/50 p-8 rounded-[2.5rem] text-center border-2 border-dashed">
        <p className="text-xs text-muted-foreground leading-relaxed italic max-w-lg mx-auto">
          Manage an unlimited amount of teams from one email. Starter teams remain free, while Pro features are billed per-team to sustain elite coordination infrastructure.
        </p>
      </div>
    </div>
  );
}
