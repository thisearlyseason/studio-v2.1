"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { TeamEvent } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Terminal, Clock, MapPin, ChevronRight, Loader2, AlertCircle, ShieldCheck, Lock, KeyRound } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { SquadIdentity } from '@/components/SquadIdentity';
import { toast } from '@/hooks/use-toast';

export default function PublicScorekeeperHub() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const router = useRouter();

  const [codeInput, setCodeInput] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  const sessionKey = `scorer_verified_${eventId}`;

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(sessionKey) === 'true') {
      setIsVerified(true);
    }
  }, [sessionKey]);

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!event || !event.isTournament) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" /><h2 className="text-xl font-bold">Portal Inactive</h2></Card></div>;

  // Show code gate if event has a scoring code and user hasn't verified yet
  const hasCode = !!(event as any).scoringCode;
  if (hasCode && !isVerified) {
    const handleVerify = () => {
      if (codeInput.trim().toLowerCase() === ((event as any).scoringCode || '').toLowerCase()) {
        sessionStorage.setItem(sessionKey, 'true');
        setIsVerified(true);
      } else {
        toast({ title: 'Invalid Code', description: 'The operational code is incorrect.', variant: 'destructive' });
        setCodeInput('');
      }
    };
    return (
      <div className="min-h-screen bg-muted/10 flex flex-col items-center justify-center py-12 px-6">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
        <Card className="max-w-sm w-full rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white">
          <div className="h-2 bg-primary w-full" />
          <CardContent className="p-10 space-y-8">
            <div className="flex items-center gap-4">
              <div className="bg-primary/10 p-3 rounded-2xl text-primary"><KeyRound className="h-6 w-6" /></div>
              <div>
                <h2 className="text-xl font-black uppercase tracking-tight">Access Required</h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Enter Operational Code</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Scorekeeper Code</Label>
              <Input
                type="text"
                placeholder="Enter code..."
                value={codeInput}
                onChange={e => setCodeInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                className="h-14 rounded-2xl border-2 font-black text-center text-lg uppercase tracking-widest"
                autoFocus
              />
            </div>
            <Button className="w-full h-14 rounded-2xl font-black uppercase text-xs shadow-xl" onClick={handleVerify}>
              <Lock className="h-4 w-4 mr-2" /> Unlock Portal
            </Button>
          </CardContent>
        </Card>
        <p className="mt-8 text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">Contact the tournament organizer for the access code</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-3xl w-full space-y-8">
        <header className="bg-black text-white p-10 rounded-[3rem] shadow-2xl space-y-4 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none -rotate-12 group-hover:scale-110 transition-transform duration-1000">
            <ShieldCheck className="h-48 w-48" />
          </div>
          <div className="relative z-10">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Scorekeeper Portal</Badge>
            <h1 className="text-4xl font-black uppercase tracking-tighter leading-[0.9] mt-2">{event.title}</h1>
            <p className="text-white/60 font-bold uppercase tracking-widest text-xs mt-1">Result Entry Hub • Login Not Required</p>
            <div className="flex items-center gap-1.5 bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest mt-6 inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              Verified Institutional Portal
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4">
          <h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground ml-4">Tournament Matches</h2>
          {event.tournamentGames?.map((game) => (
            <Card 
              key={game.id} 
              className={cn(
                "rounded-[2rem] border-none shadow-sm ring-1 ring-black/5 hover:ring-primary/20 transition-all cursor-pointer group bg-white",
                game.isCompleted && "opacity-60 grayscale-[0.5]"
              )}
              onClick={() => router.push(`/tournaments/scorekeeper/${teamId}/${eventId}/${game.id}`)}
            >
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-6 flex-1 min-w-0">
                  <div className="w-16 h-16 rounded-2xl bg-muted/30 flex flex-col items-center justify-center border shrink-0">
                    <Clock className="h-4 w-4 text-primary mb-1" />
                    <span className="text-[10px] font-black uppercase">{game.time}</span>
                  </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-1 mb-2">
                        <div className="flex items-center">
                          <SquadIdentity 
                            teamId={game.team1Id} 
                            teamName={game.team1} 
                            logoUrl={event.tournamentTeamsData?.find(t => t.id === game.team1Id)?.logoUrl || event.tournamentTeamsData?.find(t => t.name === game.team1)?.logoUrl}
                            logoClassName="h-6 w-6 rounded shadow-sm border shrink-0" 
                            showNameWithLogo
                            horizontal
                            textClassName="font-black text-sm uppercase truncate"
                          />
                        </div>
                        <div className="flex items-center">
                          <SquadIdentity 
                            teamId={game.team2Id} 
                            teamName={game.team2} 
                            logoUrl={event.tournamentTeamsData?.find(t => t.id === game.team2Id)?.logoUrl || event.tournamentTeamsData?.find(t => t.name === game.team2)?.logoUrl}
                            logoClassName="h-6 w-6 rounded shadow-sm border shrink-0" 
                            showNameWithLogo
                            horizontal
                            textClassName="font-black text-sm uppercase truncate"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {game.isCompleted && <Badge className="bg-black text-white font-black text-[7px] h-4 uppercase">FINAL: {game.score1}-{game.score2}</Badge>}
                        {game.isDisputed && <Badge className="bg-red-600 text-white font-black text-[7px] h-4">DISPUTED</Badge>}
                      </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {game.location || event.location}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6 text-primary opacity-20 group-hover:opacity-100 transition-all" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <p className="mt-12 text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">Official Result Ledger v1.0 • Powered by SquadForge</p>
    </div>
  );
}
