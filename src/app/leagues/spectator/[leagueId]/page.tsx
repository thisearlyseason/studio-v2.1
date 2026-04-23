
"use client";

import React, { useMemo, useState } from 'react';
import { DateRange } from "react-day-picker";
import { useParams } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { League, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AnimatedScore } from '@/components/ui/animated-score';
import { Trophy, CalendarDays, MapPin, Clock, Loader2, AlertCircle, List, ChevronRight } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { format, isAfter, isBefore, isSameDay, parseISO, startOfDay, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { SquadIdentity } from '@/components/SquadIdentity';

export default function PublicLeagueSpectatorHub() {
  const { leagueId } = useParams();
  const db = useFirestore();

  const [teamFilter, setTeamFilter] = useState<string | 'all'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfDay(new Date()),
    to: addDays(startOfDay(new Date()), 14)
  });

  const leagueRef = useMemoFirebase(() => (db && leagueId) ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: league, isLoading } = useDoc<League>(leagueRef);

  const filteredSchedule = useMemo(() => {
    if (!league?.schedule) return [];
    
    return league.schedule.filter(game => {
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
  }, [league?.schedule, teamFilter, dateRange]);

  const standings = useMemo(() => {
    if (!league?.teams) return [];
    return Object.entries(league.teams).map(([id, stats]) => ({ id, ...stats })).sort((a, b) => b.points - a.points || b.wins - a.wins);
  }, [league]);

  // Build a team logo map from league.teams for consistent logo resolution
  const logoMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (league?.teams) {
      Object.entries(league.teams).forEach(([id, t]) => {
        if ((t as any).teamLogoUrl) map[id] = (t as any).teamLogoUrl;
      });
    }
    return map;
  }, [league?.teams]);

  const gamesByDay = useMemo(() => {
    return (filteredSchedule as any[]).reduce((acc: any, game: any) => {
      const day = game.date;
      if (!acc[day]) acc[day] = [];
      acc[day].push(game);
      return acc;
    }, {});
  }, [filteredSchedule]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-muted/10"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!league) return <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10"><Card className="max-w-md text-center p-10"><AlertCircle className="h-16 w-16 text-destructive mx-auto mb-6 opacity-20" /><h2 className="text-2xl font-black uppercase">League Not Found</h2></Card></div>;

  return (
    <div className="min-h-screen bg-muted/5 flex flex-col items-center py-8 lg:py-12 px-4 md:px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-10" />
      
      <div className="w-full max-w-[1920px] space-y-8 lg:space-y-12">
        <section className="bg-black text-white p-8 lg:p-12 rounded-[3rem] shadow-2xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><Trophy className="h-48 w-48" /></div>
          <div className="relative z-10 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Live League Hub</Badge>
            <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter leading-[0.9]">{league.name}</h1>
            <p className="text-white/60 font-bold uppercase tracking-widest text-xs">{league.sport} • {Object.keys(league.teams || {}).length} Active Squads</p>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col space-y-4 px-2">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3 self-start">
                  <div className="bg-primary/10 p-2 rounded-xl text-primary"><List className="h-5 w-5" /></div>
                  <h2 className="text-xl font-black uppercase tracking-tight">Schedule</h2>
                </div>
                <Link href={`/leagues/scorekeeper/${leagueId}`}>
                  <Button size="sm" variant="outline" className="rounded-xl border-primary/20 text-primary font-black uppercase text-[10px] w-full sm:w-auto">Scorekeeper Portal <ChevronRight className="ml-1 h-3 w-3" /></Button>
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select value={teamFilter} onValueChange={setTeamFilter}>
                  <SelectTrigger className="rounded-xl bg-white border-2 font-black uppercase text-[10px] h-11 ring-0 focus:ring-0">
                    <SelectValue placeholder="View as Team" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="font-black uppercase text-[10px]">All Squads</SelectItem>
                    {Object.values(league.teams || {}).map(team => (
                      <SelectItem key={team.teamName} value={team.teamName} className="font-black uppercase text-[10px]">{team.teamName}</SelectItem>
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

            <div className="space-y-12">
              {Object.entries(gamesByDay).map(([date, dayGames]: [string, any]) => {
                const isPastDay = isBefore(parseISO(date), startOfDay(new Date()));
                
                return (
                  <div key={date} className={cn("space-y-6 transition-all duration-500", isPastDay && "opacity-60")}>
                    <div className="flex items-center gap-4 px-4">
                      <div className={cn("h-px flex-1", isPastDay ? "bg-black/5" : "bg-primary/20")} />
                      <h3 className={cn(
                        "text-[10px] font-black uppercase tracking-[0.3em] px-6 py-2 rounded-full ring-1 shadow-sm transition-all",
                        isPastDay 
                          ? "text-muted-foreground bg-muted/20 ring-black/5" 
                          : "text-primary bg-primary/5 ring-primary/20"
                      )}>
                        {format(parseISO(date), 'EEEE, MMMM do')} {isPastDay && "• ARCHIVED"}
                      </h3>
                      <div className={cn("h-px flex-1", isPastDay ? "bg-black/5" : "bg-primary/20")} />
                    </div>
                    
                    <div className={cn(
                      "grid gap-6 transition-all duration-500",
                      isPastDay 
                        ? "grid-cols-2 lg:grid-cols-4 md:grid-cols-3 2xl:grid-cols-8" 
                        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    )}>
                      {dayGames.map((game: any) => (
                        <Card 
                          key={game.id} 
                          className={cn(
                            "rounded-[2rem] border-none shadow-sm ring-1 transition-all group overflow-hidden flex flex-col",
                            isPastDay 
                              ? "bg-muted/5 ring-black/5 p-3 space-y-1 hover:bg-white" 
                              : "bg-white ring-black/5 p-6 space-y-5 hover:shadow-2xl hover:ring-primary/20"
                          )}
                        >
                          <div className={cn("flex justify-between items-center text-[9px] font-black uppercase tracking-widest", isPastDay ? "text-muted-foreground/40" : "text-muted-foreground/60")}>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 text-primary/40" />
                              {game.time}
                            </div>
                            {!isPastDay && game.location && (
                              <div className="flex items-center gap-1.5 max-w-[120px] truncate text-right">
                                <MapPin className="h-3 w-3 opacity-30" />
                                {game.location}
                              </div>
                            )}
                          </div>
                          
                          <div className={cn("flex-1 space-y-4", isPastDay && "opacity-60")}>
                            <div className="flex items-center justify-between gap-4">
                                 <div className="flex items-center gap-3 min-w-0">
                                   {game.isCompleted && game.score1 > game.score2 && <Trophy className="h-4 w-4 text-yellow-500 shrink-0 shadow-lg" />}
                                   {logoMap[(game as any).team1Id || ''] ? (
                                     <div className={cn("shrink-0 rounded-xl overflow-hidden border border-muted/20 shadow-md bg-white p-1", isPastDay ? "h-10 w-10" : "h-14 w-14")}>
                                       <img src={logoMap[(game as any).team1Id || '']} alt={game.team1} className="w-full h-full object-contain" />
                                     </div>
                                   ) : null}
                                   <span className={cn("font-black uppercase tracking-tight leading-tight", isPastDay ? "text-[10px]" : "text-base sm:text-lg")}>{game.team1}</span>
                               </div>
                               <AnimatedScore className={cn("font-black tracking-tighter tabular-nums", (game.isCompleted && game.score1 > game.score2) ? "text-primary scale-110" : "text-foreground", isPastDay ? "text-sm" : "text-3xl sm:text-4xl")} value={game.score1} />
                            </div>
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                  {game.isCompleted && game.score2 > game.score1 && <Trophy className="h-4 w-4 text-yellow-500 shrink-0 shadow-lg" />}
                                  {logoMap[(game as any).team2Id || ''] ? (
                                    <div className={cn("shrink-0 rounded-xl overflow-hidden border border-muted/20 shadow-md bg-white p-1", isPastDay ? "h-10 w-10" : "h-14 w-14")}>
                                      <img src={logoMap[(game as any).team2Id || '']} alt={game.team2} className="w-full h-full object-contain" />
                                    </div>
                                  ) : null}
                                  <span className={cn("font-black uppercase tracking-tight leading-tight", isPastDay ? "text-[10px]" : "text-base sm:text-lg")}>{game.team2}</span>
                               </div>
                               <AnimatedScore className={cn("font-black tracking-tighter tabular-nums", (game.isCompleted && game.score2 > game.score1) ? "text-primary scale-110" : "text-foreground", isPastDay ? "text-sm" : "text-3xl sm:text-4xl")} value={game.score2} />
                            </div>
                          </div>
                          
                          <div className={cn("pt-4 border-t flex items-center justify-between", isPastDay ? "border-black/5" : "border-muted")}>
                            <div className="flex items-center gap-2">
                              {game.round && <span className="text-[8px] font-black uppercase text-muted-foreground/40 tracking-wider transition-all group-hover:text-primary/40">{game.round}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {game.isCompleted ? (
                                <span className="text-[8px] font-black uppercase text-primary tracking-[0.2em] px-2 py-0.5 bg-primary/5 rounded-full border border-primary/10">Archive Log</span>
                              ) : (
                                <div className="flex items-center gap-1.5 animate-in fade-in duration-1000">
                                  <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                                  <span className="text-[8px] font-black uppercase text-green-600 tracking-[0.2em]">Live Operation</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filteredSchedule.length === 0 && <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed opacity-40">
                <Clock className="h-12 w-12 mx-auto mb-4" />
                <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">No matches found for the selected filters.</p>
              </div>}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="flex items-center gap-3 px-2"><div className="bg-black p-2 rounded-xl text-white shadow-lg"><Trophy className="h-5 w-5" /></div><h2 className="text-xl font-black uppercase tracking-tight">Leaderboard</h2></div>
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden ring-1 ring-black/5 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[9px] font-black uppercase tracking-widest text-muted-foreground border-b"><tr><th className="px-6 py-5">Squad</th><th className="px-2 py-5 text-center">W-L</th><th className="px-6 py-5 text-right text-primary">PTS</th></tr></thead>
                  <tbody className="divide-y">{standings.map((team, idx) => (
                    <tr key={team.id} className="hover:bg-primary/5 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                          {logoMap[team.id] || (team as any).teamLogoUrl ? (
                            <div className="h-10 w-10 rounded-lg overflow-hidden border border-muted/20 shadow-sm bg-white p-0.5 shrink-0">
                              <img src={logoMap[team.id] || (team as any).teamLogoUrl} alt={team.teamName} className="w-full h-full object-contain" />
                            </div>
                          ) : null}
                          <span className="font-black text-xs uppercase tracking-tight truncate max-w-[100px]">{team.teamName}</span>
                        </div>
                      </td>
                      <td className="px-2 py-5 text-center font-bold text-[10px] text-muted-foreground">{team.wins}-{team.losses}</td>
                      <td className="px-6 py-5 text-right">
                        <span className={cn("font-black text-sm", team.points > 0 ? "text-primary" : team.points < 0 ? "text-destructive" : "text-foreground")}>
                          {team.points > 0 ? '+' : ''}{team.points}
                        </span>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
