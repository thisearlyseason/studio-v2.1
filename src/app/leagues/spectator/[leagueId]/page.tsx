
"use client";

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { League, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, CalendarDays, MapPin, Clock, Loader2, AlertCircle, LayoutGrid, List, ChevronRight } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';

export default function PublicLeagueSpectatorHub() {
  const { leagueId } = useParams();
  const db = useFirestore();

  const leagueRef = useMemoFirebase(() => (db && leagueId) ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: league, isLoading } = useDoc<League>(leagueRef);

  const standings = useMemo(() => {
    if (!league?.teams) return [];
    return Object.entries(league.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [league]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-muted/10"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!league) return <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase">League Not Found</h2></Card></div>;

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col items-center py-8 lg:py-12 px-4 md:px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      
      <div className="max-w-7xl w-full space-y-8 lg:space-y-12">
        <section className="bg-black text-white p-8 lg:p-12 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Trophy className="h-48 w-48" /></div>
          <div className="relative z-10 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Live League Hub</Badge>
            <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9]">{league.name}</h1>
            <p className="text-white/60 font-bold uppercase tracking-widest text-xs">{league.sport} • {Object.keys(league.teams).length} Active Squads</p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-xl text-primary"><List className="h-5 w-5" /></div>
                <h2 className="text-xl font-black uppercase tracking-tight">Full Schedule</h2>
              </div>
              <Link href={`/leagues/scorekeeper/${leagueId}`}>
                <Button size="sm" variant="outline" className="rounded-xl border-primary/20 text-primary font-black uppercase text-[10px]">Scorekeeper Portal <ChevronRight className="ml-1 h-3 w-3" /></Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {league.schedule?.map((game) => (
                <Card key={game.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 bg-white overflow-hidden p-6 space-y-4 transition-all hover:shadow-md">
                  <div className="flex justify-between items-center">
                    <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{game.date} • {game.time}</Badge>
                    {game.isCompleted && <Badge className="bg-black text-white border-none text-[8px] font-black uppercase px-2 h-5">FINAL</Badge>}
                  </div>
                  <div className="grid grid-cols-7 items-center gap-4 text-center">
                    <div className="col-span-3 min-w-0"><p className="font-black text-xs uppercase truncate mb-1">{game.team1}</p><p className={cn("text-3xl font-black", game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-foreground")}>{game.score1}</p></div>
                    <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                    <div className="col-span-3 min-w-0"><p className="font-black text-xs uppercase truncate mb-1">{game.team2}</p><p className={cn("text-3xl font-black", game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-foreground")}>{game.score2}</p></div>
                  </div>
                  {game.location && <p className="text-[9px] font-bold text-muted-foreground uppercase text-center flex items-center justify-center gap-1.5 pt-2 border-t"><MapPin className="h-3 w-3 opacity-40" /> {game.location}</p>}
                </Card>
              ))}
              {(!league.schedule || league.schedule.length === 0) && <div className="col-span-full py-20 text-center opacity-30 italic">No matches scheduled.</div>}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="flex items-center gap-3 px-2"><div className="bg-black p-2 rounded-xl text-white shadow-lg"><Trophy className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Leaderboard</h2></div>
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-6 py-5">Squad</th><th className="px-2 py-5 text-center">W-L</th><th className="px-6 py-5 text-right text-primary">PTS</th></tr></thead>
                  <tbody className="divide-y">{standings.map((team, idx) => (<tr key={team.id} className="hover:bg-primary/5 transition-colors"><td className="px-6 py-5"><div className="flex items-center gap-3"><span className="text-[10px] font-black text-muted-foreground/40 w-4">{idx + 1}</span><span className="font-black text-xs uppercase tracking-tight truncate max-w-[100px]">{team.teamName}</span></div></td><td className="px-2 py-5 text-center font-bold text-[10px] text-muted-foreground">{team.wins}-{team.losses}</td><td className="px-6 py-5 text-right"><span className={cn("font-black text-sm", team.points > 0 ? "text-primary" : team.points < 0 ? "text-destructive" : "text-foreground")}>{team.points > 0 ? '+' : ''}{team.points}</span></td></tr>))}</tbody>
                </table>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
