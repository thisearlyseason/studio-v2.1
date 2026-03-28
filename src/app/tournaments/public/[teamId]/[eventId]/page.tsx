
"use client";

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, CalendarDays, MapPin, Clock, Loader2, CheckCircle2, Shield } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format } from 'date-fns';

function calculateTournamentStandings(teams: string[], games: any[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0, netScore: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1]) standings[t1] = { name: t1, wins: 0, losses: 0, ties: 0, points: 0, netScore: 0 };
    if (!standings[t2]) standings[t2] = { name: t2, wins: 0, losses: 0, ties: 0, points: 0, netScore: 0 };
    
    standings[t1].netScore += (game.score1 - game.score2);
    standings[t2].netScore += (game.score2 - game.score1);

    if (game.score1 > game.score2) { 
      standings[t1].wins += 1; standings[t1].points += 3; 
      standings[t2].losses += 1; 
    }
    else if (game.score2 > game.score1) { 
      standings[t2].wins += 1; standings[t2].points += 3; 
      standings[t1].losses += 1; 
    }
    else { 
      standings[t1].ties += 1; standings[t1].points += 1;
      standings[t2].ties += 1; standings[t2].points += 1;
    }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.netScore - a.netScore || b.wins - a.wins);
}

export default function PublicSpectatorHub() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvent() {
      if (!teamId || !eventId) return;
      try {
        const snap = await getDoc(doc(db, 'teams', teamId as string, 'events', eventId as string));
        if (snap.exists()) {
          setEvent({ id: snap.id, ...snap.data() });
        }
      } catch (e) {
        console.error("Hub Load Error:", e);
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [db, teamId, eventId]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-muted/30"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  if (!event || !event.isTournamentPaid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <BrandLogo variant="light-background" className="h-10 w-40 mb-8" />
        <Card className="max-w-md w-full text-center p-10 rounded-[2.5rem] shadow-2xl border-none">
          <Shield className="h-12 w-12 text-primary/20 mx-auto mb-4" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Hub Not Active</h2>
          <p className="text-muted-foreground mt-2 font-medium">The public spectator hub is only available for Elite Tournaments. Please contact the tournament organizer.</p>
        </Card>
      </div>
    );
  }

  const standings = calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []);
  const groupedGames = event.tournamentGames?.reduce((acc: any, game: any) => {
    if (!acc[game.date]) acc[game.date] = [];
    acc[game.date].push(game);
    return acc;
  }, {}) || {};

  return (
    <div className="min-h-screen bg-muted/30 pb-20">
      <nav className="bg-black text-white p-6 sticky top-0 z-50 shadow-xl">
        <div className="container mx-auto flex items-center justify-between">
          <BrandLogo variant="dark-background" className="h-8 w-32" />
          <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] tracking-widest px-4 h-7">Live Hub</Badge>
        </div>
      </nav>

      <div className="container mx-auto px-4 mt-10 space-y-10">
        <header className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">{event.title}</h1>
            <p className="text-muted-foreground font-black uppercase tracking-[0.2em] text-xs">Official Spectator Hub</p>
          </div>
          <div className="flex flex-wrap gap-4 pt-2">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border font-bold text-sm"><CalendarDays className="h-4 w-4 text-primary" /> {format(new Date(event.date), 'MMM dd, yyyy')}</div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl shadow-sm border font-bold text-sm"><MapPin className="h-4 w-4 text-primary" /> {event.location}</div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-10">
            <section className="space-y-6">
              <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3"><Trophy className="h-6 w-6 text-primary" /> Match Schedule</h2>
              <div className="space-y-12">
                {Object.entries(groupedGames).map(([date, games]: [any, any]) => (
                  <div key={date} className="space-y-6">
                    <div className="flex items-center gap-4"><Badge className="bg-black text-white font-black uppercase text-[10px] px-4 h-7">{format(new Date(date), 'EEEE, MMM d')}</Badge><div className="h-px bg-muted flex-1" /></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {games.map((game: any) => (
                        <Card key={game.id} className="rounded-3xl border-none shadow-md overflow-hidden bg-white ring-1 ring-black/5">
                          <div className="p-5 space-y-4">
                            <div className="flex justify-between items-center"><Badge variant="outline" className="text-[10px] font-black uppercase border-black/10 px-2 h-5">{game.time}</Badge>{game.isCompleted && <Badge className="text-[10px] font-black uppercase h-5 px-2 bg-black text-white">Final</Badge>}</div>
                            <div className="grid grid-cols-7 items-center gap-4">
                              <div className="col-span-3 text-right">
                                <div className="flex items-center justify-end gap-2 mb-1"><p className="font-black text-xs uppercase truncate">{game.team1}</p>{game.winnerId === game.team1 && <CheckCircle2 className="h-4 w-4 text-green-600" />}</div>
                                <p className="text-3xl font-black text-primary leading-none">{game.score1}</p>
                              </div>
                              <div className="col-span-1 flex items-center justify-center opacity-20 font-black text-[10px]">VS</div>
                              <div className="col-span-3">
                                <div className="flex items-center gap-2 mb-1">{game.winnerId === game.team2 && <CheckCircle2 className="h-4 w-4 text-green-600" />}<p className="font-black text-xs uppercase truncate">{game.team2}</p></div>
                                <p className="text-3xl font-black text-primary leading-none">{game.score2}</p>
                              </div>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-xl font-black uppercase tracking-tight">Leaderboard</h2>
              <Card className="rounded-[2rem] border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardContent className="p-0">
                  {standings.map((team, i) => (
                    <div key={team.name} className="flex justify-between items-center px-6 py-5 border-b last:border-0 hover:bg-primary/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-black text-primary w-4">{i + 1}</span>
                        <span className="text-sm font-black uppercase tracking-tight">{team.name}</span>
                      </div>
                      <Badge className="bg-primary text-white border-none font-black text-[10px] px-3 h-6">{team.points} PTS</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
