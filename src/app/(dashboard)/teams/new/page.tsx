
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
import { ChevronLeft, Sparkles, CreditCard, ShieldCheck, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

export default function NewTeamPage() {
  const router = useRouter();
  const { createNewTeam, teams, isSuperAdmin, plans, activeTeam } = useTeam();
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [organizerPosition, setOrganizerPosition] = useState('Coach');
  const [isProcessing, setIsProcessing] = useState(false);

  // Determine limits based on the most capable plan owned
  const currentPlan = plans.find(p => p.id === (activeTeam?.planId || 'starter_squad'));
  const teamCount = teams.length;
  const isAtLimit = !isSuperAdmin && currentPlan?.teamLimit !== null && teamCount >= (currentPlan?.teamLimit || 1);

  const handleCreate = async () => {
    if (teamName.trim() && !isAtLimit) {
      setIsProcessing(true);
      await createNewTeam(teamName, organizerPosition, description);
      router.push('/feed');
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6 pt-4 pb-20">
      <Button variant="ghost" onClick={() => router.back()} className="-ml-2">
        <ChevronLeft className="h-4 w-4 mr-1" />
        Back
      </Button>

      {isAtLimit && (
        <Alert variant="destructive" className="rounded-3xl border-2 shadow-lg bg-red-50">
          <AlertCircle className="h-5 w-5" />
          <AlertTitle className="font-black uppercase text-xs tracking-widest">Plan Limit Reached</AlertTitle>
          <AlertDescription className="font-bold text-sm">
            Your current plan allows for {currentPlan?.teamLimit} squad(s). Upgrade to a professional plan or club solution to scale your organization.
          </AlertDescription>
          <Button variant="outline" className="mt-4 w-full rounded-xl border-red-200 font-black text-[10px] uppercase tracking-widest bg-white" onClick={() => router.push('/pricing')}>Explore Plans</Button>
        </Alert>
      )}

      <Card className={cn("border-none shadow-2xl rounded-[2rem] overflow-hidden", isAtLimit && "opacity-50 pointer-events-none")}>
        <div className="h-2 hero-gradient w-full" />
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-black tracking-tight">Create Your Squad</CardTitle>
            <Sparkles className="h-5 w-5 text-amber-500" />
          </div>
          <CardDescription className="font-medium">Establish a new hub for coordination and communication.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="teamName" className="text-xs font-bold uppercase tracking-widest ml-1">Squad Name</Label>
            <Input id="teamName" placeholder="e.g. Westside Warriors" value={teamName} onChange={(e) => setTeamName(e.target.value)} className="h-12 text-lg rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-xs font-bold uppercase tracking-widest ml-1">Squad Bio</Label>
            <Textarea id="description" placeholder="A brief description of your team..." value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-xl min-h-[100px] resize-none" />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-widest ml-1">Your Role</Label>
            <Select value={organizerPosition} onValueChange={setOrganizerPosition}>
              <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select your role..." /></SelectTrigger>
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
        <CardFooter className="flex flex-col gap-4">
          <Button className="w-full h-14 text-lg font-black rounded-2xl shadow-xl shadow-primary/20 active:scale-95 transition-all" disabled={!teamName.trim() || isProcessing || isAtLimit} onClick={handleCreate}>
            {isProcessing ? "Processing Enrollment..." : "Create Squad"}
          </Button>
          <div className="flex items-center justify-center gap-2 text-muted-foreground opacity-60">
            <ShieldCheck className="h-3 w-3" />
            <span className="text-[9px] font-bold uppercase tracking-widest">Secure Infrastructure (USD)</span>
          </div>
        </CardFooter>
      </Card>
      
      <div className="bg-muted/50 p-6 rounded-[2rem] text-center border-2 border-dashed">
        <p className="text-xs text-muted-foreground leading-relaxed italic">By creating a team, you become the primary administrator. Multi-team discounts are available for professional squads.</p>
      </div>
    </div>
  );
}
