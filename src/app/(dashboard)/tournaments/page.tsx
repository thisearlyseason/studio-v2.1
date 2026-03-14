
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
  ChevronRight,
  ArrowRight,
  Loader2,
  CalendarDays,
  Table as TableIcon,
  Zap,
  Target,
  List,
  ShieldAlert,
  Edit3
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, TeamEvent, TournamentGame } from '@/components/providers/team-provider';
import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, where } from 'firebase/firestore';
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
    
    if (game.score1 > game.score2) { standings[t1].wins += 1; standings[t1].points += 1; standings[t2].losses += 1; standings[t2].points -= 1; }
    else if (game.score2 > game.score1) { standings[t2].wins += 1; standings[t2].points += 1; standings[t1].losses += 1; standings[t1].points -= 1; }
    else { standings[t1].ties += 1; standings[t2].ties += 1; }
  });
  return Object.values(standings).sort((a, b) => b.points - a.points || b.wins - a.wins);
}

function TournamentDetailView({ event, onBack }: { event: TeamEvent, onBack: () => void }) {
  const { user, members, updateRSVP, isStaff, activeTeam } = useTeam();
  const standings = useMemo(() => calculateTournamentStandings(event.tournamentTeams || [], event.tournamentGames || []), [event.tournamentTeams, event.tournamentGames]);
  const isOrganizer = isStaff && event.teamId === activeTeam?.id;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-right-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-12 w-12 border-2 hover:bg-muted"><ChevronLeft className="h-6 w-6" /></Button>
          <div>
            <Badge className="bg-primary text-white border-none font-black uppercase text-[10px] h-6 px-3 shadow-lg">Live Series</Badge>
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
            <p className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Operational Brief</p>
            <p className="text-sm font-medium text-white/80 leading-relaxed italic">"{event.description || 'Championship coordination itinerary established.'}"</p>
          </div>
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h4 className="text-[10px] font-black uppercase text-white/40 tracking-[0.2em]">Leaderboard Pulse</h4>
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
          <Tabs defaultValue="itinerary" className="w-full h-full flex flex-col">
            <div className="bg-muted/30 p-6 border-b">
              <TabsList className="bg-white/50 h-auto p-1.5 rounded-2xl border w-full flex-wrap gap-1">
                <TabsTrigger value="itinerary" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Match Schedule</TabsTrigger>
                <TabsTrigger value="attendance" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-black data-[state=active]:text-white">Squad Presence</TabsTrigger>
                {isOrganizer && <TabsTrigger value="manage" className="rounded-xl font-black text-xs uppercase px-6 flex-1 data-[state=active]:bg-primary data-[state=active]:text-white">Strategic Setup</TabsTrigger>}
              </TabsList>
            </div>
            <div className="flex-1 p-8 lg:p-10">
              <TabsContent value="itinerary" className="mt-0 space-y-4">
                {event.tournamentGames?.map((game) => (
                  <Card key={game.id} className="rounded-2xl border-none shadow-sm ring-1 ring-black/5 p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-6 flex-1">
                      <div className="w-12 h-12 rounded-xl bg-muted/30 flex flex-col items-center justify-center shrink-0 border"><Clock className="h-4 w-4 text-primary" /><span className="text-[8px] font-black uppercase">{game.time}</span></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-4 justify-center">
                          <span className="font-black text-sm uppercase truncate text-right flex-1">{game.team1}</span>
                          <span className="text-xl font-black text-primary">{game.score1}</span>
                          <span className="opacity-20 text-[10px] font-black">VS</span>
                          <span className="text-xl font-black text-primary">{game.score2}</span>
                          <span className="font-black text-sm uppercase truncate flex-1">{game.team2}</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                {(!event.tournamentGames || event.tournamentGames.length === 0) && (
                  <div className="text-center py-20 opacity-30">
                    <Clock className="h-12 w-12 mx-auto mb-4" />
                    <p className="text-sm font-black uppercase">No matches scheduled.</p>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="attendance" className="mt-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {members.map(member => (
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
                        <Badge className="font-black text-[8px] uppercase px-2 h-5">{event.userRsvps?.[member.userId] || 'Pending'}</Badge>
                      </div>
                    </Card>
                  ))}
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
  const { isStaff, addEvent, activeTeam, householdEvents } = useTeam();
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TeamEvent | null>(null);
  const [newTourney, setNewTourney] = useState({ title: '', date: '', endDate: '', location: '', description: '', teams: '' });
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter tournaments from the unified events list for the active team
  const tournaments = useMemo(() => {
    return householdEvents.filter(e => e.isTournament && e.teamId === activeTeam?.id);
  }, [householdEvents, activeTeam?.id]);

  const handleDeployTournament = async () => {
    if (!newTourney.title || !newTourney.date || !activeTeam) return;
    setIsProcessing(true);
    const teams = newTourney.teams.split(',').map(t => t.trim()).filter(t => t);
    try {
      await addEvent({
        title: newTourney.title,
        date: new Date(newTourney.date).toISOString(),
        endDate: newTourney.endDate ? new Date(newTourney.endDate).toISOString() : new Date(newTourney.date).toISOString(),
        location: newTourney.location,
        description: newTourney.description,
        isTournament: true,
        eventType: 'tournament',
        tournamentTeams: teams,
        tournamentGames: [],
        startTime: 'TBD'
      });
      setIsDeployOpen(false);
      setNewTourney({ title: '', date: '', endDate: '', location: '', description: '', teams: '' });
      toast({ title: "Elite Series Launched" });
    } catch (e) {
      toast({ title: "Deployment Failed", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  if (selectedTournament) return <TournamentDetailView event={selectedTournament} onBack={() => setSelectedTournament(null)} />;

  return (
    <div className="space-y-12 pb-32 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="space-y-2">
          <Badge className="bg-primary/10 text-primary border-none font-black uppercase tracking-widest text-[10px] h-7 px-4">Institutional Hub</Badge>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-[0.9]">Tournaments</h1>
          <p className="text-muted-foreground font-bold uppercase tracking-[0.2em] text-[11px] ml-1">Elite Bracket & Operational Command</p>
        </div>
        {isStaff && (
          <Dialog open={isDeployOpen} onOpenChange={setIsDeployOpen}>
            <DialogTrigger asChild>
              <Button className="h-16 px-10 rounded-[2rem] text-lg font-black shadow-2xl shadow-primary/20 transition-all active:scale-95">
                <Plus className="h-5 w-5 mr-2" /> Launch Elite Series
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[3rem] sm:max-w-xl p-0 border-none shadow-2xl overflow-hidden bg-white">
              <DialogTitle className="sr-only">New Tournament Strategic Deployment</DialogTitle>
              <div className="h-2 bg-primary w-full" />
              <div className="p-8 lg:p-12 space-y-10">
                <DialogHeader>
                  <div className="flex items-center gap-4 mb-2">
                    <div className="bg-primary/10 p-3 rounded-2xl text-primary">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <div>
                      <DialogTitle className="text-3xl font-black uppercase tracking-tight">Deploy Series</DialogTitle>
                      <DialogDescription className="font-bold text-primary uppercase tracking-widest text-[10px]">Launch a new championship event</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Championship Title</Label>
                    <Input placeholder="e.g. Winter Regional Finals" value={newTourney.title} onChange={e => setNewTourney({...newTourney, title: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Start Date</Label>
                      <Input type="date" value={newTourney.date} onChange={e => setNewTourney({...newTourney, date: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[10px] font-black uppercase tracking-widest ml-1">End Date</Label>
                      <Input type="date" value={newTourney.endDate} onChange={e => setNewTourney({...newTourney, endDate: e.target.value})} className="h-14 rounded-2xl font-black border-2 focus:border-primary/20 transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Location</Label>
                    <Input placeholder="Official Venue..." value={newTourney.location} onChange={e => setNewTourney({...newTourney, location: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Participating Squads (Comma Separated)</Label>
                    <Input placeholder="Tigers, Lions, Warriors..." value={newTourney.teams} onChange={e => setNewTourney({...newTourney, teams: e.target.value})} className="h-14 rounded-2xl font-bold border-2 focus:border-primary/20 transition-all" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest ml-1">Operational Brief</Label>
                    <Textarea placeholder="Define the rules and coordination needs..." value={newTourney.description} onChange={e => setNewTourney({...newTourney, description: e.target.value})} className="rounded-[1.5rem] min-h-[100px] border-2 font-medium focus:border-primary/20 transition-all p-4 resize-none" />
                  </div>
                </div>
                <DialogFooter>
                  <Button className="w-full h-16 rounded-[2rem] text-lg font-black shadow-xl shadow-primary/20 active:scale-[0.98] transition-all" onClick={handleDeployTournament} disabled={isProcessing || !newTourney.title || !newTourney.date}>
                    {isProcessing ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : "Authorize Strategic Deployment"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8">
        {tournaments.map((tournament) => (
          <Card key={tournament.id} className="rounded-[3rem] border-none shadow-xl hover:shadow-2xl transition-all duration-500 overflow-hidden ring-1 ring-black/5 bg-white group cursor-pointer" onClick={() => setSelectedTournament(tournament)}>
            <div className="flex flex-col md:flex-row items-stretch">
              <div className="w-full md:w-40 bg-black text-white flex flex-col items-center justify-center p-8 border-r group-hover:bg-primary transition-colors">
                <span className="text-[11px] font-black uppercase opacity-60 mb-1">{format(new Date(tournament.date), 'MMM')}</span>
                <span className="text-5xl font-black tracking-tighter">{format(new Date(tournament.date), 'dd')}</span>
              </div>
              <div className="flex-1 p-10 flex items-center justify-between">
                <div className="space-y-3">
                  <h3 className="text-4xl font-black uppercase tracking-tight leading-none group-hover:text-primary transition-colors">{tournament.title}</h3>
                  <div className="flex items-center gap-6">
                    <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> {tournament.location}</p>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">{formatDateRange(tournament.date, tournament.endDate)}</p>
                  </div>
                </div>
                <ArrowRight className="h-8 w-8 text-primary opacity-20 group-hover:opacity-100 group-hover:translate-x-2 transition-all" />
              </div>
            </div>
          </Card>
        ))}
        {tournaments.length === 0 && (
          <div className="text-center py-24 border-2 border-dashed rounded-[3rem] bg-muted/10 opacity-40">
            <Trophy className="h-16 w-16 mx-auto mb-4" />
            <p className="text-sm font-black uppercase tracking-widest">No active championship series.</p>
          </div>
        )}
      </div>
    </div>
  );
}
