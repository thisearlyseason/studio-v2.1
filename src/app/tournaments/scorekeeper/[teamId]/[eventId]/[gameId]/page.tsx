
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { useTeam, TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Trophy, CheckCircle2, ShieldCheck, Loader2, Info, ArrowRight, ShieldAlert, Zap, Lock, AlertCircle, Clock, MapPin } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

export default function PublicScorekeeperPage() {
  const { teamId, eventId, gameId } = useParams();
  const db = useFirestore();
  const { submitMatchScore } = useTeam();

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  const game = useMemo(() => {
    return event?.tournamentGames?.find(g => g.id === gameId);
  }, [event, gameId]);

  const [score, setScore] = useState<string>('');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30 p-6">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="mt-4 text-[10px] font-black uppercase tracking-widest opacity-40">Connecting to Hub...</p>
      </div>
    );
  }

  if (!event || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Match Not Found</h2>
          <p className="text-muted-foreground font-medium mt-2">The scorekeeping link is inactive or invalid.</p>
        </Card>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!selectedTeam || !score || isSubmitting) return;
    setIsSubmitting(true);
    const isTeam1 = selectedTeam === game.team1;
    await submitMatchScore(teamId as string, eventId as string, gameId as string, isTeam1, parseInt(score));
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl bg-white animate-in zoom-in-95 duration-500">
          <div className="bg-green-100 h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter">Score Received</h2>
          <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 mb-8">Verification Protocol Engaged</p>
          <div className="bg-primary/5 p-6 rounded-2xl border-2 border-dashed border-primary/20 text-left">
            <p className="text-[10px] font-black uppercase text-primary">Status</p>
            <p className="text-sm font-bold mt-1">Waiting for opposing squad to verify final results.</p>
          </div>
          <p className="text-xs font-medium text-muted-foreground mt-8">The coordination hub will update once both squads have reached consensus.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center justify-center p-6 md:p-12">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      
      <Card className="max-w-xl w-full rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
        <div className="h-2 bg-primary w-full" />
        <CardHeader className="p-8 lg:p-10 pb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-primary/10 p-3 rounded-2xl text-primary">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-2xl font-black uppercase tracking-tight leading-none">Score Ledger</CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase tracking-widest mt-1">Official Result Submission</CardDescription>
            </div>
          </div>
          <div className="bg-muted/30 p-6 rounded-2xl border-2 border-dashed space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{game.time}</span>
              {game.location && <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1"><MapPin className="h-3 w-3" /> {game.location}</span>}
            </div>
            <div className="flex items-center justify-center gap-6">
              <span className="font-black text-lg uppercase truncate max-w-[120px]">{game.team1}</span>
              <span className="opacity-20 text-xs font-black">VS</span>
              <span className="font-black text-lg uppercase truncate max-w-[120px] text-right">{game.team2}</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="p-8 lg:p-10 space-y-8">
          <div className="space-y-4">
            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Identify Your Squad</Label>
            <div className="grid grid-cols-2 gap-4">
              <Button 
                variant={selectedTeam === game.team1 ? "default" : "outline"} 
                className={cn("h-16 rounded-2xl font-black text-xs uppercase transition-all", selectedTeam === game.team1 ? "bg-primary shadow-lg shadow-primary/20" : "border-2 opacity-60 hover:opacity-100")}
                onClick={() => setSelectedTeam(game.team1)}
              >
                {game.team1}
              </Button>
              <Button 
                variant={selectedTeam === game.team2 ? "default" : "outline"} 
                className={cn("h-16 rounded-2xl font-black text-xs uppercase transition-all", selectedTeam === game.team2 ? "bg-primary shadow-lg shadow-primary/20" : "border-2 opacity-60 hover:opacity-100")}
                onClick={() => setSelectedTeam(game.team2)}
              >
                {game.team2}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Submit Your Final Score</Label>
            <Input 
              type="number" 
              placeholder="0" 
              value={score} 
              onChange={e => setScore(e.target.value)} 
              className="h-20 text-center font-black text-5xl rounded-3xl border-4 border-muted focus:border-primary transition-all bg-muted/10" 
            />
          </div>

          <div className="bg-primary/5 p-5 rounded-2xl border border-primary/10 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <p className="text-[11px] font-medium leading-relaxed italic text-muted-foreground">
              Dual-Verification Protocol: Final standings only update when both squads have submitted matching score data. Intentional misreporting may result in disqualification.
            </p>
          </div>
        </CardContent>

        <CardFooter className="p-8 lg:p-10 pt-0">
          <Button 
            className="w-full h-16 rounded-2xl text-lg font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
            disabled={!selectedTeam || !score || isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "Dispatch Final Result"}
          </Button>
        </CardFooter>
      </Card>
      <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] mt-12 opacity-40">The Squad Coordination Engine v1.0</p>
    </div>
  );
}
