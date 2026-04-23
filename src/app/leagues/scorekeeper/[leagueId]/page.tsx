"use client";

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useFirestore, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';
import { League, TournamentGame } from '@/components/providers/team-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, MapPin, ChevronRight, Loader2, AlertCircle, CalendarDays, Zap, Trophy, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { SquadIdentity } from '@/components/SquadIdentity';

export default function PublicLeagueScorekeeperHub() {
  const { leagueId } = useParams();
  const db = useFirestore();
  const router = useRouter();

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const leagueRef = useMemoFirebase(() => (db && leagueId) ? doc(db, 'leagues', leagueId as string) : null, [db, leagueId]);
  const { data: league, isLoading } = useDoc<League>(leagueRef);

  const schedule = useMemo(() => league?.schedule || [], [league]);
  
  const dates = useMemo(() => {
    const d = new Set<string>();
    schedule.forEach(g => {
      if (g.date) d.add(g.date);
    });
    return Array.from(d).sort();
  }, [schedule]);

  const filteredGames = useMemo(() => {
    if (!selectedDate) return [];
    return schedule.filter(g => g.date === selectedDate);
  }, [schedule, selectedDate]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-muted/10"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;
  if (!league) return <div className="min-h-screen flex items-center justify-center p-6 bg-muted/10"><Card className="max-w-md text-center p-10"><AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" /><h2 className="text-xl font-bold">League Not Found</h2></Card></div>;

  return (
    <div className="min-h-screen bg-muted/10 flex flex-col items-center py-12 px-6">
      <BrandLogo variant="light-background" className="h-10 w-40 mb-12" />
      
      <div className="max-w-3xl w-full space-y-10">
        <header className="bg-black text-white p-10 rounded-[3rem] shadow-2xl space-y-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 -rotate-12 pointer-events-none group-hover:scale-110 transition-transform duration-1000"><ShieldCheck className="h-48 w-48" /></div>
          <div className="relative z-10 space-y-4">
            <Badge className="bg-primary text-white border-none font-black text-[9px] uppercase tracking-widest px-3 h-6">Official Scorer Hub</Badge>
            <h1 className="text-4xl font-black uppercase tracking-tighter leading-[0.9]">{league.name}</h1>
            <p className="text-white/60 font-bold uppercase tracking-widest text-xs">Official Verification Protocol</p>
          </div>
        </header>

        <section className="bg-white p-8 rounded-[2.5rem] shadow-xl border-2 border-dashed border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-primary/10 p-3 rounded-2xl text-primary"><Trophy className="h-6 w-6" /></div>
            <div>
              <p className="font-black uppercase text-sm">Submission Mandate</p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase">The WINNER of the match is responsible for posting results.</p>
            </div>
          </div>
          <Badge variant="outline" className="h-8 border-primary/20 text-primary font-black px-4">WINNER POSTS SCORE</Badge>
        </section>

        <div className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary" /><h2 className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Select Match Day</h2></div>
          </div>
          
          <div className="flex flex-wrap gap-2 px-2">
            {dates.map(date => (
              <Button 
                key={date} 
                variant={selectedDate === date ? "default" : "outline"} 
                className={cn("rounded-xl h-10 px-6 font-black uppercase text-[10px] border-2 transition-all", selectedDate === date ? "bg-primary border-primary shadow-lg" : "hover:border-primary/40")}
                onClick={() => setSelectedDate(date)}
              >
                {(() => {
                  try {
                    return format(parseISO(date), 'MMM d');
                  } catch (e) {
                    return 'MD';
                  }
                })()}
              </Button>
            ))}
          </div>

          {selectedDate && (
            <div className="grid grid-cols-1 gap-4 animate-in slide-in-from-bottom-4 duration-500">
              <h3 className="text-[10px] font-black uppercase text-primary tracking-widest ml-4">Available Fixtures</h3>
              {filteredGames.map((game) => (
                <Card 
                  key={game.id} 
                  className={cn(
                    "rounded-[2.5rem] border-none shadow-sm ring-1 ring-black/5 hover:ring-primary/40 hover:shadow-2xl transition-all cursor-pointer group bg-white relative overflow-hidden",
                    game.isCompleted && "bg-muted/5 ring-muted/50"
                  )}
                  onClick={() => router.push(`/leagues/scorekeeper/${leagueId}/${game.id}`)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-stretch h-full">
                      {/* Left Time Signature */}
                      <div className={cn(
                        "w-24 shrink-0 flex flex-col items-center justify-center border-r border-dashed transition-colors",
                        game.isCompleted ? "bg-muted/20 border-muted" : "bg-primary/[0.03] border-primary/10 group-hover:bg-primary/5"
                      )}>
                        <Clock className="h-4 w-4 text-primary/40 mb-1" />
                        <span className="text-[10px] font-black uppercase text-primary leading-none">{game.time}</span>
                      </div>

                      {/* Main Tactical Body */}
                      <div className="flex-1 p-6 md:p-8 space-y-4 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center gap-1.5 leading-none">
                            <MapPin className="h-3 w-3" /> {game.location || 'Official Venue'}
                          </p>
                          {game.isCompleted && <Badge className="bg-black text-white font-black text-[7px] tracking-widest px-2 h-5 rounded-full border-none">VERIFIED POST</Badge>}
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <div className="flex justify-between items-center group/team">
                               <div className="flex items-center gap-3 min-w-0">
                                 {game.isCompleted && game.score1 > game.score2 && <Trophy className="h-4 w-4 text-yellow-500 shadow-md shrink-0" />}
                                 <SquadIdentity 
                                   teamId={(game as any).team1Id} 
                                   teamName={game.team1} 
                                   logoUrl={league.teams?.[(game as any).team1Id || '']?.teamLogoUrl}
                                   showNameWithLogo
                                   horizontal
                                   logoClassName="h-8 w-8 rounded-lg shadow-sm border shrink-0" 
                                   textClassName={cn(
                                     "font-black text-lg sm:text-xl uppercase tracking-tighter transition-all",
                                     game.isCompleted ? "text-foreground/80" : "text-foreground group-hover:text-primary"
                                   )}
                                 />
                               </div>
                               {game.isCompleted && <span className="text-2xl font-black text-primary tabular-nums tracking-tighter">{game.score1}</span>}
                            </div>

                           <div className="h-px bg-muted/50 w-8" />

                           {/* Team 2 Row */}
                            <div className="flex justify-between items-center group/team">
                               <div className="flex items-center gap-3 min-w-0">
                                 {game.isCompleted && game.score2 > game.score1 && <Trophy className="h-4 w-4 text-yellow-500 shadow-md shrink-0" />}
                                 <SquadIdentity 
                                   teamId={(game as any).team2Id} 
                                   teamName={game.team2} 
                                   logoUrl={league.teams?.[(game as any).team2Id || '']?.teamLogoUrl}
                                   showNameWithLogo
                                   horizontal
                                   logoClassName="h-8 w-8 rounded-lg shadow-sm border shrink-0" 
                                   textClassName={cn(
                                     "font-black text-lg sm:text-xl uppercase tracking-tighter transition-all",
                                     game.isCompleted ? "text-foreground/80" : "text-foreground group-hover:text-primary"
                                   )}
                                 />
                               </div>
                               {game.isCompleted && <span className="text-2xl font-black text-primary tabular-nums tracking-tighter">{game.score2}</span>}
                            </div>
                        </div>
                      </div>

                      {/* Action Visualizer */}
                      <div className="w-16 shrink-0 flex items-center justify-center bg-muted/5 group-hover:bg-primary/[0.02] transition-colors border-l border-muted/20">
                         <ChevronRight className="h-6 w-6 text-primary scale-90 group-hover:scale-110 transition-transform opacity-20 group-hover:opacity-100" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredGames.length === 0 && (
                <div className="py-20 text-center opacity-20 italic font-black uppercase text-sm border-2 border-dashed rounded-[3rem]">No matches found for this date.</div>
              )}
            </div>
          )}
        </div>
      </div>
      <p className="mt-12 text-[9px] font-black uppercase text-muted-foreground tracking-[0.3em] opacity-40">The Squad Verified Registry v1.0 • verified identity required for entry</p>
    </div>
  );
}
