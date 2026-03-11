
"use client";

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { TeamEvent } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Terminal, Clock, MapPin, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

export default function PublicScorekeeperHub() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const router = useRouter();

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!event || !event.isTournament) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" /><h2 className="text-xl font-bold">Portal Inactive</h2></Card></div>;

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-3xl w-full space-y-8">
        <header className="bg-black text-white p-10 rounded-[3rem] shadow-2xl space-y-4">
          <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Scorekeeper Portal</Badge>
          <h1 className="text-4xl font-black uppercase tracking-tighter leading-[0.9]">{event.title}</h1>
          <p className="text-white/60 font-bold uppercase tracking-widest text-xs">Result Entry Hub • Login Not Required</p>
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
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-black text-sm uppercase truncate">{game.team1} vs {game.team2}</h3>
                      {game.isCompleted && <Badge className="bg-black text-white font-black text-[7px] h-4">FINAL</Badge>}
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
