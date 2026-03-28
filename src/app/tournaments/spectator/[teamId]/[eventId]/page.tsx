"use client";

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trophy, CalendarDays, MapPin, Clock, Loader2, AlertCircle, List, Zap } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format, isAfter, isBefore, isSameDay, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import TournamentBracket from '@/components/TournamentBracket';
import { DateRange } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

/**
 * Tactical Scoring Logic:
 * Win: +1
 * Loss: -1
 * Tie: 0
 */
function calculateStandings(teams: string[], games: TournamentGame[]) {
  const standings = teams.reduce((acc, team) => {
    acc[team] = { name: team, wins: 0, losses: 0, ties: 0, points: 0 };
    return acc;
  }, {} as Record<string, any>);
  
  games.forEach(game => {
    if (!game.isCompleted) return;
    const t1 = game.team1; const t2 = game.team2;
    if (!standings[t1] || !standings[t2]) return;
    
    if (game.score1 > game.score2) { 
      standings[t1].wins += 1; 
      standings[t1].points += 1; 
      standings[t2].losses += 1; 
      standings[t2].points -= 1; 
    }
    else if (game.score2 > game.score1) { 
      standings[t2].wins += 1; 
      standings[t2].points += 1; 
      standings[t1].losses += 1; 
      standings[t1].points -= 1; 
    }
    else { 
      standings[t1].ties += 1; 
      standings[t2].ties += 1; 
    }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

export default function PublicSpectatorHub() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const [activeTab, setActiveTab] = useState('schedule');
  const [teamFilter, setTeamFilter] = useState<string | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const eventRef = useMemoFirebase(() => {
    if (!db || !teamId || !eventId) return null;
    return doc(db, 'teams', teamId as string, 'events', eventId as string);
  }, [db, teamId, eventId]);

  const { data: event, isLoading } = useDoc<TeamEvent>(eventRef);

  const filteredSchedule = useMemo(() => {
    if (!event?.tournamentGames) return [];
    
    return event.tournamentGames.filter(game => {
      // Team name filter
      if (teamFilter !== 'all' && game.team1 !== teamFilter && game.team2 !== teamFilter) {
        return false;
      }
      
      // Date range filter
      if (game.date) {
        try {
          const gameDate = parseISO(game.date);
          if (dateRange?.from && isBefore(gameDate, dateRange.from) && !isSameDay(gameDate, dateRange.from)) return false;
          if (dateRange?.to && isAfter(gameDate, dateRange.to) && !isSameDay(gameDate, dateRange.to)) return false;
        } catch (e) {
          return true;
        }
      }
      
      return true;
    });
  }, [event?.tournamentGames, teamFilter, dateRange]);

  const standings = useMemo(() => {
    if (!event?.tournamentTeams || !event.tournamentGames) return [];
    return calculateStandings(event.tournamentTeams, event.tournamentGames);
  }, [event]);

  if (isLoading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-muted/10 gap-4">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Opening Spectator Hub...</p>
    </div>
  );

  if (!event || !event.isTournament) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10">
      <Card className="max-w-md text-center p-10 rounded-[3rem] border-none shadow-2xl">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" />
        <h2 className="text-2xl font-black uppercase tracking-tight">Tournament Not Found</h2>
        <p className="text-muted-foreground font-medium mt-2">This hub is currently inactive or private.</p>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col items-center py-8 lg:py-12 px-4 md:px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      
      <div className="max-w-7xl w-full space-y-8 lg:space-y-12">
        <section className="bg-black text-white p-8 lg:p-12 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <Trophy className="h-48 w-48" />
          </div>
          <div className="relative z-10 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Live Spectator Hub</Badge>
            <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9]">{event.title}</h1>
            <div className="flex flex-wrap gap-6 pt-2 font-bold text-sm text-white/60 uppercase tracking-widest">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> {format(new Date(event.date), 'MMM d, yyyy')}</span>
              {event.endDate && <span className="flex items-center gap-2">&rarr; {format(new Date(event.endDate), 'MMM d, yyyy')}</span>}
              <span className="flex items-center gap-2 ml-auto"><MapPin className="h-4 w-4 text-primary" /> {event.location}</span>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-8">
          <div className="flex justify-center">
            <div className="bg-white p-1.5 rounded-2xl border-2 flex items-center shadow-sm">
              <Button 
                variant={activeTab === 'schedule' ? 'default' : 'ghost'} 
                onClick={() => setActiveTab('schedule')} 
                className="h-10 px-8 rounded-xl font-black text-[10px] uppercase"
              >
                Itinerary
              </Button>
              <Button 
                variant={activeTab === 'bracket' ? 'default' : 'ghost'} 
                onClick={() => setActiveTab('bracket')} 
                className="h-10 px-8 rounded-xl font-black text-[10px] uppercase"
              >
                Bracket
              </Button>
            </div>
          </div>

          {activeTab === 'bracket' ? (
            <TournamentBracket games={event.tournamentGames || []} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="lg:col-span-2 space-y-6">
                <div className="flex flex-col space-y-4 px-2">
                  <div className="flex items-center gap-3 self-start">
                    <div className="bg-primary/10 p-2 rounded-xl text-primary">
                      <List className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-xl font-black uppercase tracking-tight">Match Schedule</h2>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Real-time Updates</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Select value={teamFilter} onValueChange={setTeamFilter}>
                      <SelectTrigger className="rounded-xl bg-white border-2 font-black uppercase text-[10px] h-11 ring-0 focus:ring-0">
                        <SelectValue placeholder="View as Team" />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all" className="font-black uppercase text-[10px]">All Squads</SelectItem>
                        {event?.tournamentTeams?.map(team => (
                          <SelectItem key={team} value={team} className="font-black uppercase text-[10px]">{team}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" id="date" className={cn("rounded-xl h-11 bg-white border-2 font-black uppercase text-[10px] justify-start", !dateRange && "text-muted-foreground")}>
                          <CalendarDays className="mr-2 h-4 w-4 opacity-40" />
                          {dateRange?.from ? (
                            dateRange.to ? (
                              <>
                                {format(dateRange.from, "LLL dd, y")} -{" "}
                                {format(dateRange.to, "LLL dd, y")}
                              </>
                            ) : (
                              format(dateRange.from, "LLL dd, y")
                            )
                          ) : (
                            <span>Filter by Date Range</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 rounded-2xl shadow-2xl border-none" align="end">
                        <Calendar
                          initialFocus
                          mode="range"
                          defaultMonth={dateRange?.from}
                          selected={dateRange}
                          onSelect={setDateRange}
                          numberOfMonths={2}
                          showOutsideDays={false}
                          className="rounded-2xl"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {(teamFilter !== 'all' || dateRange) && (
                    <div className="flex justify-end pt-2">
                      <Button variant="ghost" size="sm" onClick={() => { setTeamFilter('all'); setDateRange(undefined); }} className="text-[9px] font-black uppercase text-muted-foreground hover:text-primary h-6 px-2">Clear Filters</Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredSchedule.map((game) => (
                    <Card key={game.id} className="rounded-3xl border-none shadow-sm ring-1 ring-black/5 bg-white overflow-hidden p-6 space-y-4 transition-all hover:shadow-md">
                      <div className="flex justify-between items-center">
                        <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary">{game.time}</Badge>
                        {game.round && <Badge className="bg-muted text-foreground border-none text-[7px] font-black uppercase px-2 h-4">{game.round}</Badge>}
                        {game.isCompleted && <Badge className="bg-black text-white border-none text-[8px] font-black uppercase px-2 h-5">FINAL</Badge>}
                      </div>
                      <div className="grid grid-cols-7 items-center gap-4 text-center">
                        <div className="col-span-3 min-w-0">
                          <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team1}</p>
                          <p className={cn("text-3xl font-black", game.isCompleted && game.score1 > game.score2 ? "text-primary" : "text-foreground")}>{game.score1}</p>
                        </div>
                        <div className="col-span-1 opacity-20 font-black text-[10px]">VS</div>
                        <div className="col-span-3 min-w-0">
                          <p className="font-black text-xs uppercase truncate leading-tight mb-1">{game.team2}</p>
                          <p className={cn("text-3xl font-black", game.isCompleted && game.score2 > game.score1 ? "text-primary" : "text-foreground")}>{game.score2}</p>
                        </div>
                      </div>
                      {game.location && (
                        <p className="text-[9px] font-bold text-muted-foreground uppercase text-center flex items-center justify-center gap-1.5 pt-2 border-t border-muted">
                          <MapPin className="h-3 w-3 opacity-40" /> {game.location}
                        </p>
                      )}
                    </Card>
                  ))}
                  {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                    <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed opacity-40">
                      <Clock className="h-12 w-12 mx-auto mb-4" />
                      <p className="text-sm font-black uppercase tracking-widest">Itinerary Generating...</p>
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-6">
                <div className="flex items-center gap-3 px-2">
                  <div className="bg-black p-2 rounded-xl text-white shadow-lg">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Leaderboard</h2>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Points Ledger</p>
                  </div>
                </div>

                <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b">
                        <tr>
                          <th className="px-6 py-5">Squad</th>
                          <th className="px-2 py-5 text-center">W-L</th>
                          <th className="px-6 py-5 text-right text-primary">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {standings.map((team, idx) => (
                          <tr key={team.name} className="hover:bg-primary/5 transition-colors">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                                <span className="font-black text-xs uppercase tracking-tight truncate max-w-[100px]">{team.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-5 text-center font-bold text-[10px] text-muted-foreground">
                              {team.wins}-{team.losses}
                            </td>
                            <td className="px-6 py-5 text-right">
                              <span className={cn(
                                "font-black text-sm",
                                team.points > 0 ? "text-primary" : team.points < 0 ? "text-destructive" : "text-foreground"
                              )}>
                                {team.points > 0 ? '+' : ''}{team.points}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-muted/20 p-4 border-t">
                    <div className="flex flex-wrap justify-center gap-4">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter">Win: +1</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                        <span className="text-[8px] font-black uppercase text-muted-foreground tracking-tighter">Loss: -1</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="bg-primary text-white p-8 rounded-[2.5rem] shadow-xl shadow-primary/20 space-y-4 relative overflow-hidden group">
                  <Zap className="absolute -right-2 -bottom-2 h-20 w-20 opacity-10 -rotate-12 group-hover:scale-110 transition-transform duration-700" />
                  <div className="space-y-1 relative z-10">
                    <h4 className="text-lg font-black uppercase tracking-tight">Elite Real-Time</h4>
                    <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest leading-relaxed">
                      Standings and schedule synchronize instantly as field marshals post verified scores.
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-16 lg:mt-24 text-center">
        <p className="text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">The Squad Coordination Hub v1.0 • Powered by SquadForge</p>
      </footer>
    </div>
  );
}
