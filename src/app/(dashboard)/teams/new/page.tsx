
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
import { ChevronLeft, Trophy, Users, ShieldCheck, Zap, Check, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function NewTeamForm() {
  const router = useRouter();
  const { createNewTeam, proQuotaStatus, canAddProTeam } = useTeam();
  
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<"adult" | "youth">('adult');
  const [organizerPosition, setOrganizerPosition] = useState('Coach');
  const [selectedPlan, setSelectedPlan] = useState<'starter_squad' | 'squad_pro'>('starter_squad');
  const [isProcessing, setIsProcessing] = useState(false);
  const [customWaiverTitle, setCustomWaiverTitle] = useState('');
  const [customWaiverContent, setCustomWaiverContent] = useState('');

  const handleCreate = async () => {
    if (!teamName.trim()) return;
    setIsProcessing(true);
    try {
      await createNewTeam(teamName, type, organizerPosition, description, selectedPlan, customWaiverTitle, customWaiverContent);
      router.push('/feed');
    } catch (e) {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4 pb-20">
      <Button variant="ghost" onClick={() => router.back()} className="font-bold">
        <ChevronLeft className="h-4 w-4 mr-1" /> Back
      </Button>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 space-y-6">
          <Card className="border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white ring-1 ring-black/5">
            <div className="h-2 hero-gradient w-full" />
            <CardHeader className="p-8 lg:p-10">
              <CardTitle className="text-3xl font-black uppercase tracking-tight">Launch Squad</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest">Operational Deployment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8 p-8 lg:p-10 pt-0">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Squad Name</Label>
                <Input value={teamName} onChange={e => setTeamName(e.target.value)} className="h-14 text-xl rounded-2xl border-2 font-black" placeholder="e.g. Metro Elite U14" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Team Protocol</Label>
                  <Select value={type} onValueChange={(v: any) => setType(v)}>
                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="adult">Adult (18+)</SelectItem>
                      <SelectItem value="youth">Youth (Minor Support)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest">Your Role</Label>
                  <Select value={organizerPosition} onValueChange={setOrganizerPosition}>
                    <SelectTrigger className="h-12 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="Coach">Head Coach</SelectItem>
                      <SelectItem value="Manager">Organization Lead</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest">Biography</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} className="rounded-2xl min-h-[100px] border-2 font-medium" />
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h3 className="font-black uppercase tracking-widest text-[12px]">League / Institutional Protocol</h3>
                </div>
                <p className="text-[10px] text-muted-foreground font-bold tracking-widest mb-4">Create a custom liability waiver, code of conduct, or media release. This will automatically deploy to all athletes assigned to this squad.</p>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Protocol Title (Optional)</Label>
                    <Input value={customWaiverTitle} onChange={e => setCustomWaiverTitle(e.target.value)} className="h-12 rounded-xl border-2 font-bold" placeholder="e.g. 2025 League Waiver" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest">Legal Execution Text</Label>
                    <Textarea value={customWaiverContent} onChange={e => setCustomWaiverContent(e.target.value)} className="rounded-xl min-h-[120px] border-2 font-medium bg-muted/30" placeholder="Enter terms and conditions for your members..." />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] ml-1">Tier Selection</h3>
            <div 
              className={cn("p-6 rounded-3xl border-2 cursor-pointer transition-all", selectedPlan === 'starter_squad' ? "border-black bg-white ring-4 ring-black/5" : "border-transparent bg-muted/30")}
              onClick={() => setSelectedPlan('starter_squad')}
            >
              <p className="font-black text-sm uppercase">Starter Squad</p>
              <p className="text-xl font-black mt-1">$0</p>
            </div>
            <div 
              className={cn("p-6 rounded-3xl border-2 cursor-pointer transition-all relative overflow-hidden", selectedPlan === 'squad_pro' ? "border-primary bg-black text-white shadow-xl" : "border-transparent bg-muted/30")}
              onClick={() => setSelectedPlan('squad_pro')}
            >
              <Zap className="absolute -right-2 -bottom-2 h-16 w-16 opacity-10 -rotate-12" />
              <p className="font-black text-sm uppercase">Elite Pro</p>
              <p className="text-xl font-black mt-1 text-primary">$12.99</p>
            </div>
          </div>

          <Button className="w-full h-16 rounded-2xl text-lg font-black shadow-xl" onClick={handleCreate} disabled={isProcessing || !teamName.trim()}>
            {isProcessing ? <Loader2 className="h-6 w-6 animate-spin" /> : "Deploy Squad Hub"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NewTeamPage() {
  return (
    <Suspense fallback={null}>
      <NewTeamForm />
    </Suspense>
  );
}
