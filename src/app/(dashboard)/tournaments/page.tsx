
"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Trophy, 
  Plus, 
  MapPin, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  Clock, 
  ShieldCheck,
  Zap,
  Users,
  LayoutGrid,
  Filter,
  ArrowRight,
  ShieldAlert,
  Loader2,
  CalendarDays,
  X,
  FileSignature,
  Download,
  Terminal,
  Copy,
  Eye,
  Shield,
  Table as TableIcon,
  Trash2
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogDescription, 
  DialogFooter, 
  DialogClose
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame, Member } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase, useUser } from '@/firebase';
import { collection, query, orderBy, where, doc, collectionGroup, deleteDoc } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { format, isPast, isSameDay } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';

const formatDateRange = (start: string | Date, end?: string | Date) => {
  const startDate = new Date(start);
  if (!end) return format(startDate, 'MMM dd');
  const endDate = new Date(end);
  if (isSameDay(startDate, endDate)) return format(startDate, 'MMM dd');
  
  if (startDate.getMonth() === endDate.getMonth()) {
    return `${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`;
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

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { user, updateEvent, signTeamTournamentWaiver, isPro, activeTeam, members, formatTime, isStaff, updateRSVP } = useTeam();
  const [editingGame, setEditingGame] = useState<TournamentGame | null>(null);
  const [baseUrl, setBaseUrl] = useState('');

  const myRsvp = event.userRsvps?.[user?.id || ''] || 'no_response';
  const isOrganizer = isStaff && event.teamId === activeTeam?.id;

  useEffect(() => {
    if (typeof window !== 'undefined') setBaseUrl(window.location.origin);
  }, []);

  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []), [event.tournamentTeams, event.tournamentGames]);
  
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-3 shadow-lg shadow-primary/20">Operational Hub</Badge>
            <h1 className="text-4xl font-black uppercase tracking-tight mt-1">{event.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest"><CalendarIcon className="h-4 w-4 mr-2" /> {formatDateRange(event.date, event.endDate)}</Badge>
          <Badge variant="outline" className="h-10 px-4 rounded-xl border-2 font-black uppercase text-[10px] tracking-widest"><MapPin className="h-4 w-4 mr-2" /> {event.location}</Badge>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <aside className="w-full lg:w-1/3 flex flex-col text-white bg-black rounded-[3rem] p-8 lg:p-10 space-y-8">
          <div className="space-y-4">
            <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Event Brief</p>
            <p className="text-sm font-medium text-white/80 leading-relaxed italic">"{event.description || 'No specific coordination notes established.'}"</p>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10">
            <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Tactical RSVP</p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant={myRsvp === 'going' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'going' ? "bg-primary border-none" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'going')}>Going</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={myRsvp === 'maybe' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'maybe' ? "bg-amber-50" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'maybe')}>Maybe</Button>
                <Button variant={myRsvp === 'declined' ? 'default' : 'outline'} className={cn("h-12 rounded-xl font-black text-xs uppercase", myRsvp === 'declined' ? "bg-red-600" : "bg-white/5 border-white/10")} onClick={() => updateRSVP(event.id, 'declined')}>Decline</Button>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-white/10 pb-10">
            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Standings Pulse</h4>
            <div className="bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
              {standings.map((team) => (
                <div key={team.name} className="flex justify-between items-center px-5 py-4 border-b border-white/5 last:border-0">
                  <span className="text-xs font-black uppercase truncate pr-2">{team.name}</span>
                  <Badge className="bg-primary text-white border-none font-black text-[9px] px-2 h-5">{team.points} PTS</Badge>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 bg-white rounded-[3rem] border-2 shadow-sm overflow-hidden">
          <Tabs defaultValue="bracket" className="w-full flex flex-col h-full">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1">
                <TabsTrigger value="bracket" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Itinerary</TabsTrigger>
                <TabsTrigger value="attendance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Attendance</TabsTrigger>
                <TabsTrigger value="portals" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Portals</TabsTrigger>
                {isOrganizer && (
                  <>
                    <TabsTrigger value="compliance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Compliance</TabsTrigger>
                    <TabsTrigger value="manage" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Deploy</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            <div className="flex-1 p-8 lg:p-10">
              <TabsContent value="bracket" className="mt-0">
                <div className="text-center py-32 opacity-30">
                  <TableIcon className="h-16 w-16 mx-auto mb-4" />
                  <p className="font-black uppercase tracking-widest text-lg">Itinerary Establishing...</p>
                </div>
              </TabsContent>
              <TabsContent value="attendance" className="mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {members.map(member => {
                    const rsvp = event.userRsvps?.[member.userId] || 'no_response';
                    return (
                      <Card key={member.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-4 bg-white">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10 rounded-xl border">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback className="font-black text-xs">{member.name[0]}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-black text-xs uppercase truncate">{member.name}</p>
                            <p className="text-[8px] font-bold text-muted-foreground uppercase">{member.position}</p>
                          </div>
                          <Badge className="font-black text-[8px] uppercase px-2 h-5">{rsvp}</Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default function TournamentsPage() {
  const { activeTeam, isStaff, isSuperAdmin } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  
  const [filterMode, setFilterMode] = useState<'live' | 'past'>('live');
  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(null);

  const tournamentsQuery = useMemoFirebase(() => {
    if (!db) return null;
    return query(
      collectionGroup(db, 'events'),
      where('isTournament', '==', true),
      orderBy('date', 'asc')
    );
  }, [db]);

  const { data: allTournaments, isLoading } = useCollection<TeamEvent>(tournamentsQuery);

  const filteredTournaments = useMemo(() => {
    const now = new Date();
    const list = allTournaments || [];
    if (filterMode === 'live') return list.filter(e => !isPast(new Date(e.endDate || e.date)) || isSameDay(new Date(e.endDate || e.date), now));
    return list.filter(e => isPast(new Date(e.endDate || e.date)) && !isSameDay(new Date(e.endDate || e.date), now)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [allTournaments, filterMode]);

  if (selectedTournament) {
    return <TournamentDetailView event={selectedTournament} onBack={() => setSelectedTournament(null)} />;
  }

  if (isLoading) return <div className="flex flex-col items-center justify-center py-32"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-7 px-4">Institutional Hub</Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">Tournaments</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[11px] ml-1">Elite Bracket & Operational Command</p>
        </div>
        {isStaff && <Button onClick={() => router.push('/events')} className="h-16 px-10 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/20">Launch Elite Series</Button>}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {filteredTournaments.map((tournament) => (
          <Card key={tournament.id} className="rounded-[3rem] border-none shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden ring-1 ring-black/5 bg-white group cursor-pointer" onClick={() => setSelectedTournament(tournament)}>
            <div className="flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-40 bg-black text-white flex flex-col items-center justify-center p-8 border-r group-hover:bg-primary transition-colors">
                <span className="text-[11px] font-black uppercase opacity-60 leading-none mb-1">{format(new Date(tournament.date), 'MMM')}</span>
                <span className="text-5xl font-black tracking-tighter">{format(new Date(tournament.date), 'dd')}</span>
              </div>
              <div className="flex-1 p-10 flex items-center justify-between">
                <div className="space-y-3">
                  <h3 className="text-4xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{tournament.title}</h3>
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {tournament.location}</p>
                </div>
                <ArrowRight className="h-8 w-8 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
