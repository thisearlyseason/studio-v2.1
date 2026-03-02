
"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  Loader2, 
  Shield, 
  History,
  Timer,
  Table as TableIcon,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { useFirestore } from '@/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { TeamEvent } from '@/components/providers/team-provider';
import BrandLogo from '@/components/BrandLogo';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

function TournamentPublicView() {
  const { teamId, eventId } = useParams();
  const db = useFirestore();
  const [event, setEvent] = useState<TeamEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId || !eventId) return;
    
    // Set up real-time listener for live score updates
    const unsub = onSnapshot(doc(db, 'teams', teamId as string, 'events', eventId as string), (docSnap) => {
      if (docSnap.exists()) {
        setEvent({ id: docSnap.id, ...docSnap.data() } as TeamEvent);
      }
      setLoading(false);
    });

    return () => unsub();
  }, [db, teamId, eventId]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-muted/30">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-4">Syncing Tournament Data...</p>
      </div>
    );
  }

  if (!event || !event.isTournament) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full text-center p-10 rounded-[2.5rem] shadow-2xl">
          <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Event Not Found</h2>
          <p className="text-muted-foreground mt-2 font-medium">This tournament link is inactive or has been moved.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center p-4 md:p-10">
      <div className="w-full max-w-5xl space-y-8 animate-in fade-in duration-700">
        <header className="flex flex-col md:flex-row items-center justify-between gap-6">
          <BrandLogo variant="light-background" className="h-10 w-40" />
          <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full shadow-sm border border-primary/10">
            <Timer className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary">Live Updates Active</span>
          </div>
        </header>

        <Card className="rounded-[3rem] border-none shadow-2xl overflow-hidden bg-black text-white relative">
          <div className="absolute top-0 right-0 p-10 opacity-10 -rotate-12 pointer-events-none">
            <Trophy className="h-64 w-64" />
          </div>
          <CardContent className="p-8 md:p-12 relative z-10">
            <div className="flex flex-col md:flex-row items-end justify-between gap-8">
              <div className="space-y-4">
                <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] px-4 h-7 tracking-widest shadow-lg shadow-primary/20">Official Spectator View</Badge>
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">{event.title}</h1>
                <div className="flex flex-wrap items-center gap-6 text-sm font-bold uppercase tracking-widest text-white/60">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {format(new Date(event.date), 'MMM d')} - {event.endDate ? format(new Date(event.endDate), 'MMM d, yyyy') : ''}</div>
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {event.location}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-2 text-white/40 mb-1">
                  <History className="h-3 w-3" />
                  <span className="text-[8px] font-black uppercase tracking-widest">Last Updated</span>
                </div>
                <p className="text-xs font-black uppercase text-primary">
                  {event.lastUpdated ? format(new Date(event.lastUpdated), 'h:mm a') : 'Just now'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl h-14 p-1 bg-white border shadow-sm">
            <TabsTrigger value="schedule" className="rounded-xl font-black text-xs uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Match Ledger</TabsTrigger>
            <TabsTrigger value="standings" className="rounded-xl font-black text-xs uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Standings</TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-8 space-y-4">
            {event.tournamentGames?.map((game) => (
              <Card key={game.id} className="rounded-2xl border-none shadow-md overflow-hidden bg-white hover:scale-[1.01] transition-transform">
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row items-stretch">
                    <div className="bg-muted/30 px-6 py-4 flex flex-col justify-center border-r border-dashed">
                      <span className="text-[10px] font-black uppercase text-muted-foreground opacity-60 leading-none mb-1">{game.date}</span>
                      <span className="text-sm font-black uppercase tracking-tight">{game.time}</span>
                    </div>
                    <div className="flex-1 p-6 grid grid-cols-7 items-center gap-4">
                      <div className="col-span-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          {game.winnerId === game.team1 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                          <p className={cn("font-black text-sm uppercase truncate", game.winnerId === game.team1 ? "text-foreground" : "text-muted-foreground")}>{game.team1}</p>
                        </div>
                        <p className={cn("text-3xl font-black mt-1", game.winnerId === game.team1 ? "text-primary" : "text-foreground/40")}>{game.score1}</p>
                      </div>
                      <div className="col-span-1 text-center font-black text-[10px] opacity-20">VS</div>
                      <div className="col-span-3">
                        <div className="flex items-center gap-3">
                          <p className={cn("font-black text-sm uppercase truncate", game.winnerId === game.team2 ? "text-foreground" : "text-muted-foreground")}>{game.team2}</p>
                          {game.winnerId === game.team2 && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                        </div>
                        <p className={cn("text-3xl font-black mt-1", game.winnerId === game.team2 ? "text-primary" : "text-foreground/40")}>{game.score2}</p>
                      </div>
                    </div>
                    <div className="px-6 py-4 bg-primary/5 flex items-center justify-center border-l">
                      <Badge className={cn("h-6 border-none font-black text-[8px] uppercase tracking-widest", game.isCompleted ? "bg-green-600 text-white" : "bg-muted text-muted-foreground")}>
                        {game.isCompleted ? "Official" : "Live"}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="standings" className="mt-8">
            <Card className="rounded-[2.5rem] border-none shadow-xl overflow-hidden bg-white">
              <CardContent className="p-0">
                <table className="w-full text-left">
                  <thead className="bg-muted/30 text-[10px] font-black uppercase tracking-widest text-muted-foreground border-b">
                    <tr>
                      <th className="px-8 py-5">Squad</th>
                      <th className="px-4 py-5 text-center">W</th>
                      <th className="px-4 py-5 text-center">L</th>
                      <th className="px-8 py-5 text-right text-primary">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {event.tournamentTeams?.map((team, idx) => (
                      <tr key={idx} className="hover:bg-primary/5 transition-colors group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <span className="text-xs font-black text-muted-foreground/40 w-4">{idx + 1}</span>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-xs font-black shrink-0">{team[0]}</div>
                              <span className="font-black text-sm uppercase tracking-tight">{team}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-6 text-center font-bold text-sm">0</td>
                        <td className="px-4 py-6 text-center font-bold text-sm text-muted-foreground">0</td>
                        <td className="px-8 py-6 text-right">
                          <Badge variant="outline" className="text-[8px] font-black uppercase h-5 px-2">Qualified</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="text-center space-y-4 py-10 opacity-40">
          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Official Tournament ledger • Powered by The Squad</p>
        </footer>
      </div>
    </div>
  );
}

export default function TournamentPublicPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <TournamentPublicView />
    </Suspense>
  );
}
