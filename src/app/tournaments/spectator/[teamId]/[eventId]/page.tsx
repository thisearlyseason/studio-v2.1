
"use client";

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, CalendarDays, MapPin, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

function calculateStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

export default function PublicSpectatorHub() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  const standings = useMemo(() => {
    if (!event?.tournamentTeams || !event.tournamentGames) return [];
    return calculateStandings(event.tournamentTeams, event.tournamentGames);
  }, [event]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!event || !event.isTournament) return <div className="min-h-screen flex items-center justify-center p-6"><Card className="max-w-md text-center p-10"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" /><h2 className="text-xl font-bold">Tournament Not Found</h2></Card></div>;

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-5xl w-full space-y-8">
        <section className="bg-black text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform">
            <Trophy className="h-48 w-48" />
          </div>
          <div className="relative z-10 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Live Spectator Hub</Badge>
            <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9]">{event.title}</h1>
            <div className="flex flex-wrap gap-6 pt-2 font-bold text-sm text-white/60 uppercase tracking-widest">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> {format(new Date(event.date), 'MMM d, yyyy')}</span>
              <span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {event.location}</span>
            </div>
          </div>
        </section>

        <Tabs defaultValue="standings" className="w-full">
          <TabsList className="bg-white/50 h-14 p-1.5 rounded-2xl shadow-inner border mb-8">
            <TabsTrigger value="standings" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Standings</TabsTrigger>
            <TabsTrigger value="schedule" className="rounded-xl font-black text-xs uppercase px-8 data-[state=active]:bg-black data-[state=active]:text-white">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="standings" className="mt-0">
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                    <tr>
                      <th className="px-8 py-5">Squad</th>
                      <th className="px-4 py-5 text-center">W</th>
                      <th className="px-4 py-5 text-center">L</th>
                      <th className="px-4 py-5 text-center">T</th>
                      <th className="px-8 py-5 text-right text-primary">PTS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {standings.map((team, idx) => (
                      <tr key={team.name} className="hover:bg-primary/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black text-muted-foreground/40">{idx + 1}</span>
                            <span className="font-black text-sm uppercase tracking-tight">{team.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-center font-bold text-sm">{team.wins}</td>
                        <td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.losses}</td>
                        <td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">{team.ties}</td>
                        <td className="px-8 py-6 text-right font-black text-lg text-primary">{team.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="schedule" className="mt-0 grid grid-cols-1 md:grid-cols-2 gap-4">
            {event.tournamentGames?.map((game) => (
              <Card key={game.id} className="rounded-3xl border-none shadow-md ring-1 ring-black/5 bg-white overflow-hidden p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <Badge variant="outline" className="text-[8px] font-black uppercase">{game.time}</Badge>
                  {game.isCompleted && <Badge className="bg-black text-white border-none text-[8px] font-black uppercase">Final</Badge>}
                </div>
                <div className="grid grid-cols-7 items-center gap-4 text-center">
                  <div className="col-span-3">
                    <p className="font-black text-xs uppercase truncate">{game.team1}</p>
                    <p className="text-3xl font-black">{game.score1}</p>
                  </div>
                  <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                  <div className="col-span-3">
                    <p className="font-black text-xs uppercase truncate">{game.team2}</p>
                    <p className="text-3xl font-black">{game.score2}</p>
                  </div>
                </div>
                {game.location && (
                  <p className="text-[9px] font-bold text-muted-foreground uppercase text-center flex items-center justify-center gap-1">
                    <MapPin className="h-2 w-2" /> {game.location}
                  </p>
                )}
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
      <p className="mt-12 text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">The Squad Coordination Hub v1.0 • Powered by SquadForge</p>
    </div>
  );
}
