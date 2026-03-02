
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  CalendarDays, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Loader2,
  Table as TableIcon,
  ChevronRight,
  Shield,
  Zap,
  Timer
} from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { TeamEvent, TournamentGame } from '@/components/providers/team-provider';
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
    const t1 = game.team1;
    const t2 = game.team2;
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

export default function PublicTournamentPage() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const [event, setEvent] = useState<TeamEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!teamId || !eventId) return;
      try {
        const snap = await getDoc(doc(db, 'teams', teamId as string, 'events', eventId as string));
        if (snap.exists()) setEvent({ id: snap.id, ...snap.data() } as TeamEvent);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    load();
  }, [db, teamId, eventId]);

  const standings = useMemo(() => {
    if (!event?.tournamentTeams || !event.tournamentGames) return [];
    return calculateStandings(event.tournamentTeams, event.tournamentGames);
  }, [event]);

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

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-black"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!event) return <div className="min-h-screen flex items-center justify-center bg-black text-white text-3xl font-black">TOURNAMENT NOT FOUND</div>;

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-20 selection:bg-primary/30">
      <nav className="h-20 border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-50 flex items-center px-6 lg:px-12 justify-between">
        <BrandLogo variant="dark-background" className="h-10 w-40" />
        <Badge className="bg-primary text-white font-black uppercase text-[10px] tracking-widest px-4 h-8 animate-pulse">Live Tournament Hub</Badge>
      </nav>

      <header className="py-16 lg:py-24 px-6 lg:px-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
        <div className="max-w-7xl mx-auto space-y-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-primary border-primary/30 font-black uppercase text-[10px] tracking-widest px-3 h-6">Sanctioned Event</Badge>
              <span className="text-[10px] font-black uppercase tracking-widest text-white/40 flex items-center gap-2"><Timer className="h-3 w-3" /> Updated {event.lastUpdated ? format(new Date(event.lastUpdated), 'h:mm a') : 'Recently'}</span>
            </div>
            <h1 className="text-5xl lg:text-8xl font-black tracking-tighter leading-none uppercase">{event.title}</h1>
          </div>
          <div className="flex flex-wrap gap-8 pt-4">
            <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary" /><span className="font-bold text-lg">{format(new Date(event.date), 'MMM d, yyyy')} {event.endDate && ` - ${format(new Date(event.endDate), 'MMM d')}`}</span></div>
            <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-primary" /><span className="font-bold text-lg">{event.location}</span></div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
        <section className="lg:col-span-8 space-y-16">
          {Object.entries(groupedGames).length > 0 ? Object.entries(groupedGames).map(([date, games]) => (
            <div key={date} className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
              <div className="flex items-center gap-6">
                <h3 className="text-2xl font-black uppercase tracking-tight text-primary whitespace-nowrap">{format(new Date(date), 'EEEE, MMM d')}</h3>
                <div className="h-px bg-white/10 flex-1" />
              </div>
              <div className="grid gap-6">
                {games.map((game) => (
                  <Card key={game.id} className="bg-white/5 border-white/10 rounded-[2.5rem] overflow-hidden hover:bg-white/10 transition-all border-2">
                    <CardContent className="p-8 lg:p-10 flex items-center gap-10">
                      <div className="flex-1 space-y-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <p className="text-lg font-black uppercase tracking-tight truncate">{game.team1}</p>
                          {game.winnerId === game.team1 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                        </div>
                        <p className={cn("text-5xl font-black tracking-tighter", game.winnerId === game.team1 ? "text-primary" : "opacity-20")}>{game.score1}</p>
                      </div>
                      <div className="text-xs font-black opacity-10 uppercase tracking-widest">VS</div>
                      <div className="flex-1 space-y-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {game.winnerId === game.team2 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                          <p className="text-lg font-black uppercase tracking-tight truncate">{game.team2}</p>
                        </div>
                        <p className={cn("text-5xl font-black tracking-tighter", game.winnerId === game.team2 ? "text-primary" : "opacity-20")}>{game.score2}</p>
                      </div>
                      <div className="hidden lg:flex flex-col items-center gap-2 min-w-[120px] border-l border-white/10 pl-10">
                        <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest border-white/20 h-6">{game.time}</Badge>
                        {game.isCompleted ? <Badge className="bg-white text-black font-black uppercase text-[8px] h-5">Final</Badge> : <Badge className="bg-green-600 text-white font-black uppercase text-[8px] h-5 animate-pulse">Live</Badge>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )) : (
            <div className="py-24 text-center space-y-6 bg-white/5 rounded-[3rem] border-2 border-dashed border-white/10">
              <TableIcon className="h-16 w-16 mx-auto text-white/20" />
              <p className="text-xl font-black uppercase tracking-widest opacity-40">Schedule Pending Publication</p>
            </div>
          )}
        </section>

        <aside className="lg:col-span-4 space-y-10">
          <div className="space-y-6 sticky top-32">
            <div className="flex items-center gap-3">
              <Trophy className="h-6 w-6 text-primary" />
              <h3 className="text-xl font-black uppercase tracking-tight">Tournament Standings</h3>
            </div>
            <div className="bg-white/5 rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/40 border-b border-white/10">
                  <tr>
                    <th className="px-6 py-4">Squad</th>
                    <th className="px-4 py-4 text-center">W-L</th>
                    <th className="px-6 py-4 text-right text-primary">PTS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {standings.map((team, i) => (
                    <tr key={team.name} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-primary w-4">{i + 1}</span>
                          <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-5 text-center font-bold text-[10px]">{team.wins}-{team.losses}</td>
                      <td className="px-6 py-5 text-right font-black text-primary text-sm">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-8 bg-primary/5 rounded-[2rem] border border-primary/20 space-y-4">
              <Zap className="h-6 w-6 text-primary" />
              <p className="text-xs font-bold text-white/60 leading-relaxed uppercase">Scoring Logic: Win (+1), Loss (-1), Tie (0). Points decide final tournament seeding.</p>
            </div>
          </div>
        </aside>
      </main>

      <footer className="mt-32 pt-12 border-t border-white/10 text-center opacity-40">
        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Official Tournament Hub • Powered by The Squad</p>
      </footer>
    </div>
  );
}
