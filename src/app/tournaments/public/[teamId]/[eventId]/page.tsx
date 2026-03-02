
"use client";

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDoc, useFirestore } from '@/firebase';
import { doc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Trophy, Clock, MapPin, Calendar, Loader2, Table as TableIcon } from 'lucide-react';
import { format } from 'date-fns';
import BrandLogo from '@/components/BrandLogo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

function calculateTournamentStandings(teams: string[], games: any[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);

  games.forEach(game => {
    if (!game.isCompleted) return;
    
    const t1 = game.team1;
    const t2 = game.team2;
    
    if (!standings[t1]) standings[t1] = { name: t1, wins: 0, losses: 0, ties: 0, points: 0 };
    if (!standings[t2]) standings[t2] = { name: t2, wins: 0, losses: 0, ties: 0, points: 0 };

    if (game.score1 > game.score2) {
      standings[t1].wins += 1;
      standings[t1].points += 1;
      standings[t2].losses += 1;
      standings[t2].points -= 1;
    } else if (game.score2 > game.score1) {
      standings[t2].wins += 1;
      standings[t2].points += 1;
      standings[t1].losses += 1;
      standings[t1].points -= 1;
    } else {
      standings[t1].ties += 1;
      standings[t2].ties += 1;
    }
  });

  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

export default function PublicTournamentPage() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  
  const eventRef = useMemo(() => {
    if (!teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc(eventRef);

  const standings = useMemo(() => {
    if (!event || !event.isTournament || !event.tournamentTeams) return [];
    return calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []);
  }, [event]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/10 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Opening Spectator Hub...</p>
      </div>
    );
  }

  if (!event || !event.isTournament) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/10">
        <Card className="max-w-md w-full text-center p-10 rounded-[3rem] border-none shadow-2xl">
          <Trophy className="h-12 w-12 text-primary/20 mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Hub Not Found</h2>
          <p className="text-muted-foreground mt-2 font-medium">This event hub is either private or has been deactivated.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center pb-20">
      <div className="w-full bg-white border-b py-6 px-6 sticky top-0 z-50 shadow-sm flex justify-center">
        <BrandLogo variant="light-background" className="h-10 w-44" />
      </div>

      <div className="container max-w-5xl px-4 mt-10 space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div className="space-y-2">
            <Badge className="bg-black text-white font-black uppercase tracking-widest text-[10px] px-4 py-1 h-auto mb-2">Public Hub • Live Updates</Badge>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">{event.title}</h1>
            <div className="flex flex-wrap gap-6 text-sm font-bold text-muted-foreground uppercase tracking-widest pt-2">
              <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {format(new Date(event.date), 'MMMM do, yyyy')}</div>
              <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {event.location}</div>
            </div>
          </div>
          {event.lastUpdated && (
            <div className="bg-primary/5 px-6 py-3 rounded-2xl border-2 border-dashed border-primary/20 text-right">
              <p className="text-[10px] font-black uppercase text-primary tracking-widest leading-none mb-1">Last Update Sync</p>
              <p className="text-sm font-black">{format(new Date(event.lastUpdated), 'h:mm a')}</p>
            </div>
          )}
        </div>

        <Tabs defaultValue="scoreboard" className="w-full">
          <div className="flex justify-center mb-8">
            <TabsList className="bg-white rounded-full h-14 p-1 shadow-lg border-2">
              <TabsTrigger value="scoreboard" className="rounded-full px-8 font-black text-xs uppercase tracking-widest data-[state=active]:bg-black data-[state=active]:text-white">Scoreboard</TabsTrigger>
              <TabsTrigger value="standings" className="rounded-full px-8 font-black text-xs uppercase tracking-widest data-[state=active]:bg-black data-[state=active]:text-white">Standings</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="scoreboard" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {event.tournamentGames?.map((game: any) => (
                <Card key={game.id} className="rounded-[2.5rem] border-none shadow-xl overflow-hidden group hover:ring-2 ring-primary/20 transition-all bg-white">
                  <div className="bg-muted/30 px-8 py-4 border-b flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{game.date} • {game.time}</span>
                    <Badge variant={game.isCompleted ? "default" : "outline"} className="text-[8px] font-black uppercase h-5">
                      {game.isCompleted ? "Final Score" : "Scheduled"}
                    </Badge>
                  </div>
                  <CardContent className="p-8">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 space-y-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <p className="font-black text-lg uppercase truncate leading-none">{game.team1}</p>
                          {game.winnerId === game.team1 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                        </div>
                        <p className={cn("text-5xl font-black tracking-tighter", game.winnerId === game.team1 ? "text-primary" : "opacity-20")}>{game.score1}</p>
                      </div>
                      <div className="text-xs font-black opacity-10 uppercase tracking-widest">VS</div>
                      <div className="flex-1 space-y-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <p className="font-black text-lg uppercase truncate leading-none">{game.team2}</p>
                          {game.winnerId === game.team2 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                        </div>
                        <p className={cn("text-5xl font-black tracking-tighter", game.winnerId === game.team2 ? "text-primary" : "opacity-20")}>{game.score2}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="standings" className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-0">
            <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white">
              <CardHeader className="bg-black text-white p-10">
                <div className="flex items-center gap-4">
                  <TableIcon className="h-6 w-6 text-primary" />
                  <CardTitle className="text-2xl font-black uppercase tracking-tight">League Ledger</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-muted/50 border-b text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-10 py-6">Squad Name</th>
                        <th className="px-6 py-6 text-center">Wins</th>
                        <th className="px-6 py-6 text-center">Losses</th>
                        <th className="px-6 py-6 text-center">Ties</th>
                        <th className="px-10 py-6 text-right text-primary">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {standings.map((team, idx) => (
                        <tr key={team.name} className="hover:bg-primary/5 transition-colors">
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-4">
                              <span className="text-xs font-black text-muted-foreground opacity-30 w-4">{idx + 1}</span>
                              <span className="font-black text-lg uppercase tracking-tight">{team.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-8 text-center font-bold text-lg">{team.wins}</td>
                          <td className="px-6 py-8 text-center font-bold text-lg text-muted-foreground">{team.losses}</td>
                          <td className="px-6 py-8 text-center font-bold text-lg text-muted-foreground">{team.ties}</td>
                          <td className="px-10 py-8 text-right font-black text-2xl text-primary">{team.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="pt-12 text-center space-y-2 opacity-40">
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Built for Champions • Powered by The Squad Hub</p>
          <p className="text-[8px] font-bold uppercase tracking-widest">© {new Date().getFullYear()} Official Coordination Hub</p>
        </div>
      </div>
    </div>
  );
}
