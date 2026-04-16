"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTeam } from '@/components/providers/team-provider';
import { 
  Users, 
  ShieldCheck, 
  ArrowRight, 
  Loader2, 
  Hash, 
  Globe, 
  Trophy,
  Baby,
  Plus
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function JoinTeamPage() {
  const router = useRouter();
  const { user, myChildren, joinTeamWithCode, isParent, isPlayer } = useTeam();
  
  const [teamCode, setTeamCode] = useState('');
  const [leagueCode, setLeagueCode] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // For adult players, their "player ID" is their own. 
  // For parents, they must pick a child.
  const effectivePlayerId = isPlayer ? `p_${user?.id}` : selectedPlayerId;

  const handleJoinTeam = async () => {
    if (!teamCode.trim()) return;
    if (!effectivePlayerId) {
      toast({ title: "Identification Required", description: "Please select which player is joining.", variant: "destructive" });
      return;
    }

    setIsJoining(true);
    try {
      const success = await joinTeamWithCode(teamCode.trim().toUpperCase(), effectivePlayerId, isParent ? 'Parent' : 'Player');
      if (success) {
        router.push('/feed');
      }
    } finally {
      setIsJoining(false);
    }
  };

  const handleGoToLeague = () => {
    if (!leagueCode.trim()) return;
    router.push(`/register/league/${leagueCode.trim()}`);
  };

  const hasChildren = myChildren.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8 animate-in fade-in duration-500">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black uppercase tracking-tight">Recruitment Hub</h1>
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Onboarding Coordination</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Join specific Squad */}
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white flex flex-col">
          <div className="h-2 bg-primary w-full" />
          <CardHeader className="p-8 lg:p-10">
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Join Squad</CardTitle>
                <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Direct Team Enrollment</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 lg:p-10 pt-0 flex-1 space-y-6">
            <div className="space-y-4">
              {isParent && (
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Select Child Player</Label>
                  {hasChildren ? (
                    <Select value={selectedPlayerId} onValueChange={setSelectedPlayerId}>
                      <SelectTrigger className="h-12 rounded-xl border-2 font-bold">
                        <SelectValue placeholder="Which child is joining?" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {myChildren.map(child => (
                          <SelectItem key={child.id} value={child.id} className="font-bold">
                            {child.firstName} {child.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-4 bg-muted/20 rounded-xl border-2 border-dashed flex flex-col items-center gap-3">
                      <Baby className="h-6 w-6 text-muted-foreground opacity-40" />
                      <p className="text-[10px] font-bold text-center text-muted-foreground uppercase leading-relaxed">
                        No players registered. Add a child to your hub first.
                      </p>
                      <Button variant="outline" size="sm" onClick={() => router.push('/family')} className="h-8 rounded-lg text-[8px] font-black uppercase">
                        <Plus className="h-3 w-3 mr-1" /> Add Child
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Squad Code</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="8-20 CHARACTER CODE" 
                    value={teamCode}
                    onChange={e => setTeamCode(e.target.value.toUpperCase())}
                    maxLength={20}
                    className="h-14 pl-10 text-xl font-black tracking-widest rounded-2xl border-2 border-primary/20" 
                  />
                </div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase italic ml-1">
                  Unique institutional code provided by your team lead.
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="p-8 lg:p-10 pt-0">
            <Button 
              className="w-full h-14 rounded-2xl text-lg font-black shadow-xl shadow-primary/20" 
              onClick={handleJoinTeam}
              disabled={isJoining || !teamCode.trim() || (isParent && !selectedPlayerId)}
            >
              {isJoining ? <Loader2 className="h-6 w-6 animate-spin" /> : "Enroll in Squad"}
            </Button>
          </CardFooter>
        </Card>

        {/* Join via League */}
        <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-black text-white flex flex-col">
          <div className="h-2 bg-primary w-full" />
          <CardHeader className="p-8 lg:p-10">
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-primary p-3 rounded-2xl text-white shadow-lg shadow-primary/20">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">League Portal</CardTitle>
                <CardDescription className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-1">Open Recruitment Portal</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 lg:p-10 pt-0 flex-1 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-white/60 ml-1">League ID / Slug</Label>
                <div className="relative">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
                  <Input 
                    placeholder="e.g. winter-varsity-2024" 
                    value={leagueCode}
                    onChange={e => setLeagueCode(e.target.value)}
                    className="h-14 pl-10 text-base font-bold rounded-2xl border-none bg-white/10 text-white placeholder:text-white/20" 
                  />
                </div>
                <p className="text-[9px] font-bold text-white/40 uppercase italic ml-1 leading-relaxed">
                  Enter the unique ID shared via the league's public coordination link.
                </p>
              </div>
            </div>

            <div className="bg-white/5 p-6 rounded-2xl border border-white/10 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-primary">Strategic Enrollment</p>
              </div>
              <p className="text-[11px] font-medium text-white/60 leading-relaxed italic">
                League enrollment leads to a custom data entry form where you can request specific squad assignments.
              </p>
            </div>
          </CardContent>
          <CardFooter className="p-8 lg:p-10 pt-0">
            <Button 
              variant="secondary"
              className="w-full h-14 rounded-2xl text-lg font-black bg-white text-black hover:bg-white/90 shadow-xl" 
              onClick={handleGoToLeague}
              disabled={!leagueCode.trim()}
            >
              Enter Portal <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardFooter>
        </Card>
      </div>

      <div className="bg-primary/5 p-8 rounded-[3rem] border-2 border-dashed border-primary/20 text-center space-y-4">
        <div className="bg-white w-12 h-12 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h4 className="text-lg font-black uppercase tracking-tight">Need a squad?</h4>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest max-w-sm mx-auto">
            Contact your organization lead to receive your unique coordination code.
          </p>
        </div>
      </div>
    </div>
  );
}
