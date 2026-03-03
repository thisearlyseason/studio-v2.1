
"use client";

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, CalendarDays, MapPin, Loader2, CheckCircle2, ChevronRight, Share2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, isSameDay } from 'date-fns';
import BrandLogo from '@/components/BrandLogo';
import { Progress } from '@/components/ui/progress';

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')}-${format(endDate, 'd')}`;
  }
  return `${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`;
};

function calculateTournamentStandings(teams: string[], games: TournamentGame[]) {
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
      standings[t1].wins += 1; standings[t1].points += 1;
      standings[t2].losses += 1; standings[t2].points -= 1;
    } else if (game.score2 > game.score1) {
      standings[t2].wins += 1; standings[t2].points += 1;
      standings[t1].losses += 1; standings[t1].points -= 1;
    } else {
      standings[t1].ties += 1; standings[t2].ties += 1;
    }
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

  const groupedGames = useMemo(() => {
    if (!event?.tournamentGames) return {};
    const groups: Record<string, TournamentGame[]> = {};
    [...event.tournamentGames]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .forEach(game => {
        if (!groups[game.date]) groups[game.date] = [];
        groups[game.date].push(game);
      });
    return groups;
  }, [event?.tournamentGames]);

  const standings = useMemo(() => {
    if (!event?.isTournament || !event?.tournamentTeams) return [];
    return calculateTournamentStandings(event.tournamentTeams, event.tournamentGames || []);
  }, [event]);

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="mt-4 font-black uppercase tracking-widest text-xs opacity-40">Opening Spectator Hub...</p>
    </div>
  );

  if (!event || !event.isTournament) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30 text-center space-y-4">
      <div className="bg-white p-8 rounded-[3rem] shadow-xl">
        <Trophy className="h-16 w-16 text-primary/20 mx-auto mb-4" />
        <h1 className="text-3xl font-black uppercase tracking-tight">Tournament Not Found</h1>
        <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">The link may be broken or the event is private.</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-6xl space-y-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo variant="light-background" className="h-10 w-40" />
          <Badge className="bg-primary text-white border-none font-black uppercase tracking-widest text-[10px] px-4 h-8 shadow-lg shadow-primary/20">
            Public Spectator Hub
          </Badge>
        </div>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-black text-white relative">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
            <Trophy className="h-64 w-64" />
          </div>
          <CardContent className="p-10 md:p-16 relative z-10 space-y-8">
            <div className="space-y-4 max-w-2xl">
              <Badge className="bg-white/20 text-white border-none font-black uppercase tracking-widest text-[9px] px-3 h-6">
                Live Coverage
              </Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9] uppercase">
                {event.title}
              </h1>
              <div className="flex flex-wrap items-center gap-6 pt-4">
                <div className="flex items-center gap-3 bg-white/10 px-5 py-3 rounded-2xl border border-white/10">
                  <CalendarDays className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm">{formatDateRange(event.date, event.endDate)}</span>
                </div>
                <div className="flex items-center gap-3 bg-white/10 px-5 py-3 rounded-2xl border border-white/10">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span className="font-bold text-sm truncate max-w-[200px]">{event.location}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="bracket" className="w-full space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-white h-16 p-1.5 rounded-3xl shadow-xl border w-fit">
              <TabsTrigger value="bracket" className="rounded-2xl font-black text-xs uppercase px-10 data-[state=active]:bg-black data-[state=active]:text-white">
                Match Schedule
              </TabsTrigger>
              {event.isTournamentPaid && (
                <TabsTrigger value="standings" className="rounded-2xl font-black text-xs uppercase px-10 data-[state=active]:bg-black data-[state=active]:text-white">
                  Live Standings
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="bracket" className="mt-0">
            <div className="space-y-12">
              {Object.entries(groupedGames).length > 0 ? Object.entries(groupedGames).map(([date, games]) => (
                <div key={date} className="space-y-6">
                  <div className="flex items-center gap-4 px-2">
                    <Badge className="bg-black text-white font-black uppercase text-[10px] px-4 h-7 shadow-lg">
                      {format(new Date(date), 'EEEE, MMM d')}
                    </Badge>
                    <div className="h-px bg-muted-foreground/20 flex-1" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {games.map((game) => (
                      <div key={game.id} className="p-6 md:p-8 bg-white rounded-[2.5rem] shadow-xl border-none transition-all relative overflow-hidden group ring-1 ring-black/5">
                        <div className="flex justify-between items-center mb-6">
                          <Badge variant="outline" className="text-[9px] font-black uppercase border-black/10 tracking-widest px-3 h-6">{game.time}</Badge>
                          {game.isCompleted && <Badge className="text-[9px] font-black uppercase h-6 px-3 bg-black text-white shadow-lg">Final Result</Badge>}
                        </div>
                        <div className="grid grid-cols-7 items-center gap-4">
                          <div className="col-span-3 text-right">
                            <div className="flex items-center justify-end gap-3 mb-2">
                              <p className="font-black text-sm uppercase truncate">{game.team1}</p>
                              {game.winnerId === game.team1 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                            </div>
                            <p className="text-4xl md:text-5xl font-black text-primary leading-none">{game.score1}</p>
                          </div>
                          <div className="col-span-1 flex items-center justify-center opacity-20 font-black text-xs">VS</div>
                          <div className="col-span-3">
                            <div className="flex items-center gap-3 mb-2">
                              {game.winnerId === game.team2 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                              <p className="font-black text-sm uppercase truncate">{game.team2}</p>
                            </div>
                            <p className="text-4xl md:text-5xl font-black text-primary leading-none">{game.score2}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="text-center py-24 bg-white rounded-[3rem] shadow-xl space-y-4">
                  <CalendarDays className="h-16 w-16 text-muted-foreground/20 mx-auto" />
                  <p className="font-black uppercase tracking-widest text-xs opacity-40">No matches published yet.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {event.isTournamentPaid && (
            <TabsContent value="standings" className="mt-0">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8">
                  <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-white ring-1 ring-black/5">
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                            <tr>
                              <th className="px-10 py-6">Squad</th>
                              <th className="px-4 py-6 text-center">W</th>
                              <th className="px-4 py-6 text-center">L</th>
                              <th className="px-4 py-6 text-center">T</th>
                              <th className="px-10 py-6 text-right text-primary">PTS</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-muted/50">
                            {standings.map((team, idx) => (
                              <tr key={team.name} className="hover:bg-primary/5 transition-colors group">
                                <td className="px-10 py-8">
                                  <div className="flex items-center gap-6">
                                    <span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                                    <span className="font-black text-base uppercase tracking-tight group-hover:text-primary transition-colors">{team.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-8 text-center font-bold text-base">{team.wins}</td>
                                <td className="px-4 py-8 text-center font-bold text-base text-muted-foreground">{team.losses}</td>
                                <td className="px-4 py-8 text-center font-bold text-base text-muted-foreground">{team.ties}</td>
                                <td className="px-10 py-8 text-right font-black text-2xl text-primary">{team.points}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="lg:col-span-4 space-y-6">
                  <div className="bg-black text-white p-10 rounded-[3rem] shadow-2xl space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10">
                      <Share2 className="h-20 w-20" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase tracking-tight leading-none">Global Link</h3>
                      <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">Share results with fans</p>
                    </div>
                    <div className="p-4 bg-white/10 rounded-2xl border border-white/10 break-all text-[10px] font-mono text-white/80">
                      {typeof window !== 'undefined' ? window.location.href : ''}
                    </div>
                    <p className="text-[10px] font-bold italic opacity-40">Powered by The Squad Professional Coordination Suite.</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>
      
      <footer className="mt-20 py-12 border-t w-full max-w-6xl flex flex-col md:flex-row items-center justify-between gap-8 text-muted-foreground opacity-40">
        <p className="text-[10px] font-black uppercase tracking-widest">© {new Date().getFullYear()} The Squad Hub • Professional Tournament Delivery</p>
        <div className="flex gap-8">
          <span className="text-[10px] font-black uppercase tracking-widest">Privacy</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Safety</span>
          <span className="text-[10px] font-black uppercase tracking-widest">Terms</span>
        </div>
      </footer>
    </div>
  );
}
