"use client";

import React, { useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTeam, TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { doc, getDoc, collection, query, where } from 'firebase/firestore';
import { Trophy, ChevronLeft, Loader2, CalendarRange, Clock } from 'lucide-react';
import TournamentBracket from '@/components/TournamentBracket';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function TournamentSpectatorPortal() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;
  const eventId = params.eventId as string;
  
  const { db } = useTeam();

  const eventsQuery = useMemoFirebase(() => {
    if (!db || !teamId) return null;
    return query(collection(db, 'teams', teamId, 'events'), where('isTournament', '==', true));
  }, [db, teamId]);

  const { data: events, loading } = useCollection<TeamEvent>(eventsQuery);
  const activeEvent = useMemo(() => events?.find(e => e.id === eventId), [events, eventId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] animate-pulse">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="mt-4 text-xs font-black uppercase tracking-[0.2em] opacity-40">Syncing Port telemetry...</p>
      </div>
    );
  }

  if (!activeEvent) {
    return (
      <div className="py-32 text-center">
        <Trophy className="h-16 w-16 mx-auto opacity-20 mb-4" />
        <h2 className="text-2xl font-black uppercase tracking-tighter">Series Not Found</h2>
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">This spectator port is either offline or the URL is invalid.</p>
        <Button onClick={() => window.close()} className="mt-8">Close Port</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8 lg:p-14 space-y-12 animate-in fade-in duration-1000">
      <header className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-white/10 pb-8 relative">
        <div className="absolute top-0 right-0 opacity-5 pointer-events-none"><Trophy className="h-48 w-48 text-primary" /></div>
        <div className="flex items-center gap-6">
           <Button variant="ghost" onClick={() => window.close()} className="h-14 w-14 rounded-full border border-white/20 hover:bg-white/10">
             <ChevronLeft className="h-6 w-6" />
           </Button>
           <div>
             <Badge className="bg-primary text-white border-none text-[8px] font-black uppercase tracking-widest mb-2 px-3">Live Spectator Port</Badge>
             <h1 className="text-3xl md:text-5xl font-black uppercase tracking-tighter leading-none text-white drop-shadow-lg">{activeEvent.title}</h1>
           </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="md:col-span-1 space-y-8">
            <Card className="bg-[#0a0a0a] border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
               <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-6 flex items-center gap-2">
                 <CalendarRange className="h-4 w-4" /> Series Profile
               </h3>
               <div className="space-y-4">
                 <div className="flex justify-between items-center pb-4 border-b border-white/5">
                   <span className="text-[10px] uppercase font-bold text-white/50">Location</span>
                   <span className="font-black text-xs uppercase">{activeEvent.location || 'TBA'}</span>
                 </div>
                 <div className="flex justify-between items-center pb-4 border-b border-white/5">
                   <span className="text-[10px] uppercase font-bold text-white/50">Squads</span>
                   <span className="font-black text-xs uppercase">{(activeEvent.tournamentTeamsData || []).length}</span>
                 </div>
                 <div className="flex justify-between items-center">
                   <span className="text-[10px] uppercase font-bold text-white/50">Matches</span>
                   <span className="font-black text-xs uppercase">{(activeEvent.tournamentGames || []).length}</span>
                 </div>
               </div>
            </Card>

            <div className="space-y-4 mt-8">
               <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white/40 ml-2">Upcoming/Live</h3>
               {(activeEvent.tournamentGames || [])
                 .filter((g: any) => !g.isCompleted)
                 .sort((a: any, b: any) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                 .slice(0, 3)
                 .map((game: any) => (
                   <div key={game.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex justify-between items-center">
                     <span className="text-[10px] font-black uppercase truncate max-w-[80px]">{game.team1}</span>
                     <Badge className="bg-black text-[8px] font-black tracking-widest uppercase"><Clock className="h-3 w-3 mr-1" /> {game.time}</Badge>
                     <span className="text-[10px] font-black uppercase truncate max-w-[80px]">{game.team2}</span>
                   </div>
               ))}
               {(activeEvent.tournamentGames || []).filter((g: any) => !g.isCompleted).length === 0 && (
                 <div className="text-[10px] font-black text-white/20 uppercase py-4">No active pending matches.</div>
               )}
            </div>
         </div>
         
         <div className="md:col-span-2">
           <TournamentBracket games={activeEvent.tournamentGames || []} standalone />
         </div>
      </div>
    </div>
  );
}
